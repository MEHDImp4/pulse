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
RUN python3 -m venv /opt/ytdlp \
    && /opt/ytdlp/bin/pip install --no-cache-dir --upgrade --pre "yt-dlp[default]" \
    && chown -R node:node /opt/ytdlp

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

# --- Runtime stage -----------------------------------------------------------
FROM node:24-bookworm-slim AS runtime

RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg python3 ca-certificates procps \
    && rm -rf /var/lib/apt/lists/*

# yt-dlp venv (writable by the runtime user for self-update).
COPY --from=build --chown=node:node /opt/ytdlp /opt/ytdlp
ENV PATH="/opt/ytdlp/bin:${PATH}"

WORKDIR /app

# Production dependencies + compiled output only.
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY package.json ./

# Pre-create the persistence mount owned by the runtime user so the named volume
# is initialized writable.
RUN mkdir -p /data && chown node:node /data

COPY --chown=node:node docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

ENV NODE_ENV=production

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD pgrep -f "node dist/index.js" > /dev/null || exit 1

USER node

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["node", "dist/index.js"]
