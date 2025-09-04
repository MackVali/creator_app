import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Supabase's Auth helpers rely on Node APIs that aren't available in the Edge
// runtime. The middleware only needs a lightweight check for the authentication
// cookie, so we avoid importing the Supabase client entirely.
export function middleware(req: NextRequest) {
  const pathname = req.nextUrl.pathname;

  // Ignore static assets and API routes
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname === "/favicon.ico"
  ) {
    return NextResponse.next();
  }

  const hasAuthCookie = Boolean(req.cookies.get("sb-access-token"));
  const isAuthRoute = pathname === "/auth";

  // If unauthenticated and not already on /auth, redirect to sign-in
  if (!hasAuthCookie && !isAuthRoute) {
    const redirectUrl = new URL("/auth", req.url);
    redirectUrl.searchParams.set("redirect", pathname + req.nextUrl.search);
    return NextResponse.redirect(redirectUrl);
  }

  // If authenticated and visiting /auth, bounce to the dashboard or redirect
  if (hasAuthCookie && isAuthRoute) {
    const redirectTo = req.nextUrl.searchParams.get("redirect") || "/dashboard";
    return NextResponse.redirect(new URL(redirectTo, req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next|api|favicon.ico).*)"],
};
