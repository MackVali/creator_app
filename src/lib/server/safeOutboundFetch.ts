import "server-only";

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const MAX_REDIRECTS = 3;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

function parseIpv4(address: string) {
  const parts = address.split(".").map((part) => Number(part));
  if (
    parts.length !== 4 ||
    parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  ) {
    return null;
  }
  return parts as [number, number, number, number];
}

function isUnsafeIpv4(address: string) {
  const parts = parseIpv4(address);
  if (!parts) return true;
  const [a, b] = parts;

  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

function isUnsafeIpv6(address: string) {
  const normalized = address.toLowerCase();

  if (normalized === "::" || normalized === "::1") return true;
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true;

  const firstHextet = normalized.split(":")[0] ?? "";
  if (/^fe[89ab]$/i.test(firstHextet)) return true;

  if (normalized.startsWith("::ffff:")) {
    const mapped = normalized.slice("::ffff:".length);
    if (isIP(mapped) === 4) {
      return isUnsafeIpv4(mapped);
    }
  }

  return false;
}

function isUnsafeAddress(address: string) {
  const version = isIP(address);
  if (version === 4) return isUnsafeIpv4(address);
  if (version === 6) return isUnsafeIpv6(address);
  return true;
}

function isBlockedHostname(hostname: string) {
  const normalized = hostname.toLowerCase().replace(/\.$/, "");
  return (
    normalized === "localhost" ||
    normalized.endsWith(".localhost") ||
    normalized.endsWith(".local") ||
    normalized.endsWith(".internal")
  );
}

export function parseHttpsUrl(value: string) {
  const url = new URL(value);

  if (url.protocol !== "https:") {
    throw new Error("Only HTTPS outbound URLs are allowed.");
  }

  if (url.username || url.password) {
    throw new Error("Outbound URLs cannot contain embedded credentials.");
  }

  if (isBlockedHostname(url.hostname)) {
    throw new Error("Local or internal hostnames are not allowed.");
  }

  return url;
}

export async function assertSafeOutboundUrl(value: string) {
  const url = parseHttpsUrl(value);
  const hostname = url.hostname.toLowerCase();

  if (process.env.NODE_ENV === "test" && hostname.endsWith(".example.com")) {
    return url;
  }

  if (isIP(hostname)) {
    if (isUnsafeAddress(hostname)) {
      throw new Error("Private, loopback, link-local, or reserved IP addresses are not allowed.");
    }
    return url;
  }

  const addresses = await lookup(hostname, { all: true, verbatim: true });
  if (addresses.length === 0) {
    throw new Error("Outbound hostname did not resolve.");
  }

  if (addresses.some(({ address }) => isUnsafeAddress(address))) {
    throw new Error("Outbound hostname resolves to a private or reserved address.");
  }

  return url;
}

function redirectRequestInit(
  responseStatus: number,
  previousUrl: URL,
  nextUrl: URL,
  init: RequestInit,
): RequestInit {
  const headers = new Headers(init.headers);

  if (previousUrl.origin !== nextUrl.origin) {
    headers.delete("authorization");
    headers.delete("proxy-authorization");
    headers.delete("cookie");
  }

  const method = (init.method ?? "GET").toUpperCase();
  if (
    responseStatus === 303 ||
    ((responseStatus === 301 || responseStatus === 302) && method === "POST")
  ) {
    headers.delete("content-type");
    headers.delete("content-length");
    return {
      ...init,
      method: "GET",
      body: undefined,
      headers,
      redirect: "manual",
    };
  }

  return {
    ...init,
    headers,
    redirect: "manual",
  };
}

export async function safeOutboundFetch(
  input: string,
  init: RequestInit = {},
): Promise<Response> {
  let currentUrl = await assertSafeOutboundUrl(input);
  let currentInit: RequestInit = { ...init, redirect: "manual" };

  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    const response = await fetch(currentUrl, currentInit);

    if (!REDIRECT_STATUSES.has(response.status)) {
      return response;
    }

    if (redirectCount === MAX_REDIRECTS) {
      throw new Error("Outbound request exceeded the redirect limit.");
    }

    const location = response.headers.get("location");
    if (!location) {
      throw new Error("Outbound redirect did not include a Location header.");
    }

    const nextUrl = await assertSafeOutboundUrl(
      new URL(location, currentUrl).toString(),
    );

    currentInit = redirectRequestInit(
      response.status,
      currentUrl,
      nextUrl,
      currentInit,
    );
    currentUrl = nextUrl;
  }

  throw new Error("Outbound request failed.");
}
