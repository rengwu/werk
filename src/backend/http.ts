import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import ipaddr from "ipaddr.js";
import { Agent } from "undici";
import type { Store } from "./db/store.ts";
let validatorStore: Store | undefined;
export function configureHttp(store: Store) { validatorStore = store; }
const now = () => new Date().toISOString();

export function isPublicAddress(address: string): boolean {
  try {
    const ip = ipaddr.process(address);
    return ip.range() === "unicast";
  } catch {
    return false;
  }
}
export async function publicUrl(raw: string): Promise<URL> {
  const url = new URL(raw);
  if (
    !["https:", "http:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    (url.port && !["443", "80"].includes(url.port))
  )
    throw new Error("Use a public HTTP or HTTPS URL on a standard port.");
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = isIP(hostname)
    ? [{ address: hostname }]
    : await lookup(hostname, { all: true });
  if (!addresses.length || addresses.some((x) => !isPublicAddress(x.address)))
    throw new Error("Source URLs must resolve to public addresses.");
  return url;
}
const nextRequest = new Map<string, number>();
// Validate the actual connection lookup too, closing the DNS-rebinding gap.
const dispatcher = new Agent({
  connect: {
    lookup: (hostname, options, callback) => {
      void lookup(hostname, { all: true })
        .then((addresses) => {
          if (
            !addresses.length ||
            addresses.some((a) => !isPublicAddress(a.address))
          )
            return callback(
              new Error("Source resolved to a non-public address."),
              [],
              0,
            );
          if (options.all) (callback as Function)(null, addresses);
          else callback(null, addresses[0].address, addresses[0].family);
        })
        .catch((error) => callback(error, [], 0));
    },
  },
});
export class RequestLimitError extends Error {}
export class FetchError extends Error {
  retryAfterMs: number;
  status?: number;
  constructor(
    message: string,
    retryAfterMs = 0,
    status?: number,
  ) {
    super(message); this.retryAfterMs = retryAfterMs; this.status = status;
  }
}
export type FetchContext = {
  requests: number;
  limit: number;
  snapshotStartedAt?: string;
  resumeAt?: string;
  onRequest?: () => void;
};
export async function readUrl(
  raw: string,
  ctx: FetchContext,
  options: {
    cache?: boolean;
    headers?: Record<string, string>;
    sensitive?: boolean;
    allowRedirect?: (url: URL) => boolean;
    signal?: AbortSignal;
    maxBytes?: number;
  } = {},
): Promise<string> {
  let url = await publicUrl(raw);
  for (let redirects = 0; redirects <= 4; redirects++) {
    if (ctx.requests >= ctx.limit)
      throw new RequestLimitError(
        "Request limit reached; collection will resume on the next scan.",
      );
    const wait = (nextRequest.get(url.hostname) || 0) - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    nextRequest.set(url.hostname, Date.now() + 600);
    const cache =
      options.cache === false || options.sensitive
        ? undefined
        : (validatorStore?.db
            .prepare("SELECT etag,last_modified AS modified FROM http_validators WHERE url=?")
            .get(url.href) as
            | { etag: string | null; modified: string | null; body?: string }
            | undefined);
    const headers: Record<string, string> = {
      "User-Agent": "werk/0.1 (personal job discovery; six scans daily)",
      Accept:
        "application/json,application/rss+xml,application/atom+xml,text/plain;q=0.9,*/*;q=0.5",
      ...options.headers,
    };
    if (cache?.etag) headers["If-None-Match"] = cache.etag;
    if (cache?.modified) headers["If-Modified-Since"] = cache.modified;
    ctx.requests++;
    ctx.onRequest?.();
    const response = await fetch(url, {
      method: "GET",
      headers,
      redirect: "manual",
      signal: options.signal
        ? AbortSignal.any([options.signal, AbortSignal.timeout(20000)])
        : AbortSignal.timeout(20000),
      dispatcher,
    } as RequestInit);
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      await response.body?.cancel();
      // A token in the query must never be forwarded, even to another path.
      if (options.sensitive)
        throw new FetchError("Credentialed source redirects are not followed.");
      const location = response.headers.get("location");
      if (!location)
        throw new FetchError("Source redirected without a destination.");
      const target = await publicUrl(new URL(location, url).href);
      if (options.allowRedirect && !options.allowRedirect(target))
        throw new FetchError(
          "Source redirected away from the expected public job page.",
        );
      if (options.headers?.Authorization && target.origin !== url.origin)
        throw new FetchError(
          "Credentialed source redirected to a different origin.",
        );
      url = target;
      continue;
    }
    if (response.status === 304 && cache) return "";
    if (!response.ok) {
      await response.body?.cancel();
      const retry = response.headers.get("retry-after");
      const delay = retry
        ? /^\d+$/.test(retry)
          ? Number(retry) * 1000
          : Math.max(0, Date.parse(retry) - Date.now())
        : 0;
      const reset =
        Number(response.headers.get("x-rate-limit-reset") || 0) * 1000 -
        Date.now();
      throw new FetchError(
        `Source returned HTTP ${response.status}.`,
        Math.max(delay, response.status === 429 ? reset : 0),
        response.status,
      );
    }
    const reader = response.body?.getReader();
    if (!reader) throw new FetchError("Source returned no response body.");
    const parts: Uint8Array[] = [];
    let length = 0;
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      length += chunk.value.length;
      if (length > (options.maxBytes || 20 * 1024 * 1024)) {
        await reader.cancel();
        throw new FetchError("Source response exceeded 20 MB.");
      }
      parts.push(chunk.value);
    }
    const body = Buffer.concat(parts).toString("utf8");
    if (options.cache !== false && !options.sensitive)
      validatorStore?.db.prepare(
        "INSERT INTO http_validators VALUES (?,?,?,?) ON CONFLICT(url) DO UPDATE SET etag=excluded.etag,last_modified=excluded.last_modified,checked_at=excluded.checked_at",
      ).run(url.href, response.headers.get("etag"), response.headers.get("last-modified"), now());
    return body;
  }
  throw new FetchError("Too many source redirects.");
}
export async function readJson<T>(url: string, ctx: FetchContext): Promise<T> {
  return JSON.parse(await readUrl(url, ctx)) as T;
}
