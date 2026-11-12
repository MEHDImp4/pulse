# syntax=docker/dockerfile:1

# --- Build stage -------------------------------------------------------------
# Compiles TypeScript and builds native modules. The heavy toolchain
# (build-essential, pip caches) stays here and is not shipped in the runtime.
FROM node:24-bookworm-slim AS build

RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 python3-venv build-essential ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# yt-dlp lives in an isolated venv owned by the runtime user, so the entrypoint
# can self-update it without root or --break-system-packages.
# Pin yt-dlp to a tested stable release; bump this argument in a reviewed PR.
ARG YTDLP_VERSION=2026.10.26
RUN python3 -m venv /opt/ytdlp \
    && /opt/ytdlp/bin/pip install --no-cache-dir "yt-dlp[default]==${YTDLP_VERSION}" \
    && chown -R node:node /opt/ytdlp

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
COPY dashboard ./dashboard
RUN npm run build && npm prune --omit=dev

# --- Runtime stage -----------------------------------------------------------
FROM node:24-bookworm-slim AS runtime

LABEL org.opencontainers.image.source="https://github.com/MEHDImp4/pulse" \
      org.opencontainers.image.title="Pulse Discord Music Bot" \
      org.opencontainers.image.description="Discord music bot with optional OAuth dashboard" \
      org.opencontainers.image.licenses="MIT"

RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg python3 ca-certificates procps gosu \
    && rm -rf /var/lib/apt/lists/*

# yt-dlp venv (writable by the runtime user for self-update).
COPY --from=build --chown=node:node /opt/ytdlp /opt/ytdlp
ENV PATH="/opt/ytdlp/bin:${PATH}"

WORKDIR /app

# Production dependencies + compiled output only.
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/dashboard ./dashboard
COPY package.json ./

# Pre-create the persistence mount owned by the runtime user so the named volume
# is initialized writable.
RUN mkdir -p /data && chown node:node /data

COPY --chown=node:node docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

ENV NODE_ENV=production DATA_DIR=/data

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD pgrep -f "node dist/index.js" > /dev/null || exit 1

# Start as root only to normalize ownership of Unraid's bind-mounted appdata.
# The entrypoint immediately drops privileges to node via gosu.
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["node", "dist/index.js"]
