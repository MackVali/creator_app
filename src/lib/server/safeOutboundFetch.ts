import "server-only";

import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";

const MAX_REDIRECTS = 3;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

const UNSAFE_IPS = new BlockList();
UNSAFE_IPS.addSubnet("0.0.0.0", 8, "ipv4");
UNSAFE_IPS.addSubnet("10.0.0.0", 8, "ipv4");
UNSAFE_IPS.addSubnet("100.64.0.0", 10, "ipv4");
UNSAFE_IPS.addSubnet("127.0.0.0", 8, "ipv4");
UNSAFE_IPS.addSubnet("169.254.0.0", 16, "ipv4");
UNSAFE_IPS.addSubnet("172.16.0.0", 12, "ipv4");
UNSAFE_IPS.addSubnet("192.0.0.0", 24, "ipv4");
UNSAFE_IPS.addSubnet("192.0.2.0", 24, "ipv4");
UNSAFE_IPS.addSubnet("192.168.0.0", 16, "ipv4");
UNSAFE_IPS.addSubnet("198.18.0.0", 15, "ipv4");
UNSAFE_IPS.addSubnet("198.51.100.0", 24, "ipv4");
UNSAFE_IPS.addSubnet("203.0.113.0", 24, "ipv4");
UNSAFE_IPS.addSubnet("224.0.0.0", 4, "ipv4");
UNSAFE_IPS.addSubnet("240.0.0.0", 4, "ipv4");
UNSAFE_IPS.addSubnet("::", 128, "ipv6");
UNSAFE_IPS.addSubnet("::1", 128, "ipv6");
UNSAFE_IPS.addSubnet("fc00::", 7, "ipv6");
UNSAFE_IPS.addSubnet("fe80::", 10, "ipv6");
UNSAFE_IPS.addSubnet("ff00::", 8, "ipv6");
UNSAFE_IPS.addSubnet("2001:db8::", 32, "ipv6");

function normalizeIpLiteral(hostname: string) {
  return hostname.startsWith("[") && hostname.endsWith("]")
    ? hostname.slice(1, -1)
    : hostname;
}

function isUnsafeAddress(address: string) {
  const normalized = normalizeIpLiteral(address);
  const version = isIP(normalized);
  if (version === 4) return UNSAFE_IPS.check(normalized, "ipv4");
  if (version === 6) return UNSAFE_IPS.check(normalized, "ipv6");
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
  const ipLiteral = normalizeIpLiteral(hostname);

  if (process.env.NODE_ENV === "test" && hostname.endsWith(".example.com")) {
    return url;
  }

  if (isIP(ipLiteral)) {
    if (isUnsafeAddress(ipLiteral)) {
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
