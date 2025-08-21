import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PUBLIC_PATHS = [
  "/auth",
  "/auth/callback",
  "/healthz",
  "/env-check",
  "/favicon.ico",
  "/robots.txt",
  "/sitemap.xml",
];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // allow public files and next internals
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname.startsWith("/static") ||
    /\.(png|jpg|jpeg|gif|svg|ico|txt|xml|webp|avif|woff2?)$/.test(pathname)
  )
    return NextResponse.next();

  // allow all auth routes explicitly
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Example guard (optional): if you check cookies/session, do it here.
  // Otherwise, do nothing to avoid blocking.
  return NextResponse.next();
}

export const config = {
  matcher: "/:path*",
};
