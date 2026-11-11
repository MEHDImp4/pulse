import { request as httpRequest, type ClientRequest, type IncomingMessage } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";
import type { Readable } from "node:stream";
import { isBlockedIp, isSafeRemoteUrl, lookupHost, type HostResolver } from "../utils/net";

const MAX_REDIRECTS = 5;
const CONNECT_TIMEOUT_MS = 20_000;

export interface RadioStreamOptions {
  allowedHosts?: readonly string[];
  resolveHost?: HostResolver;
}

/**
 * Resolve and validate every address. The chosen public IP is used by the
 * actual socket's lookup callback, closing the DNS-rebinding gap between
 * validation and connection.
 */
export async function resolveRadioEndpoint(
  value: string,
  options: RadioStreamOptions = {},
): Promise<{ url: URL; address: string; family: 4 | 6 }> {
  if (!isSafeRemoteUrl(value, options.allowedHosts ?? [])) {
    throw new Error("URL radio refusée (hôte interne, identifiants ou domaine non autorisé).");
  }
  const url = new URL(value);
  const host = url.hostname;
  const records = isIP(host) ? [{ address: host }] : await (options.resolveHost ?? lookupHost)(host);
  if (records.length === 0 || records.some((record) => isBlockedIp(record.address))) {
    throw new Error("Adresse réseau interne ou introuvable refusée.");
  }
  const address = records[0].address;
  const family = isIP(address);
  if (family !== 4 && family !== 6) throw new Error("Adresse radio invalide.");
  return { url, address, family };
}

/**
 * Open an HTTP(S) stream with explicit redirect validation and a DNS-pinned
 * connection. FFmpeg only sees its bytes through stdin; it never receives an
 * arbitrary network URL or follows redirects on its own.
 */
export async function openSafeRadioStream(
  value: string,
  options: RadioStreamOptions = {},
): Promise<{ stream: Readable; close: () => void }> {
  const controller = new AbortController();
  let currentRequest: ClientRequest | undefined;

  const connect = async (target: string, redirects: number): Promise<IncomingMessage> => {
    if (redirects > MAX_REDIRECTS) throw new Error("Trop de redirections du flux radio.");
    const endpoint = await resolveRadioEndpoint(target, options);

    return new Promise<IncomingMessage>((resolve, reject) => {
      const request = (endpoint.url.protocol === "https:" ? httpsRequest : httpRequest)(
        endpoint.url,
        {
          method: "GET",
          signal: controller.signal,
          headers: { Accept: "*/*", "User-Agent": "Pulse-Radio/2.0" },
          // Pin the socket to the same public address we validated.
          lookup: (_hostname, _options, callback) =>
            callback(null, endpoint.address, endpoint.family),
        },
        (response) => {
          const status = response.statusCode ?? 0;
          if ([301, 302, 303, 307, 308].includes(status)) {
            const location = response.headers.location;
            response.destroy();
            if (!location) {
              reject(new Error("Redirection radio sans URL de destination."));
              return;
            }
            try {
              const next = new URL(location, endpoint.url).toString();
              void connect(next, redirects + 1).then(resolve, reject);
            } catch (error) {
              reject(error);
            }
            return;
          }

          if (status < 200 || status >= 300) {
            response.resume();
            reject(new Error(`Le flux radio a répondu HTTP ${status}.`));
            return;
          }
          // Prevent a socket that stops producing audio from hanging forever.
          response.setTimeout(CONNECT_TIMEOUT_MS, () => {
            response.destroy(new Error("Le flux radio ne répond plus."));
          });
          resolve(response);
        },
      );
      currentRequest = request;
      request.setTimeout(CONNECT_TIMEOUT_MS, () => {
        request.destroy(new Error("Délai de connexion radio dépassé."));
      });
      request.once("error", reject);
      request.end();
    });
  };

  try {
    const stream = await connect(value, 0);
    return {
      stream,
      close: () => {
        controller.abort();
        currentRequest?.destroy();
        stream.destroy();
      },
    };
  } catch (error) {
    controller.abort();
    currentRequest?.destroy();
    throw error;
  }
}
