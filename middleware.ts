import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

const PUBLIC = [
  "/auth",
  "/auth/callback",
  "/debug",
  "/debug/env",
  "/env-check",
  "/favicon.ico",
  "/robots.txt",
  "/sitemap.xml",
  "/healthz",
];

export async function middleware(req: NextRequest) {
  // Preview bypass - skip all auth logic
  if (process.env.PREVIEW_BYPASS === "1") {
    return NextResponse.next();
  }

  const { pathname } = req.nextUrl;
  
  // Allow static assets and Next.js internals
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname.startsWith("/static") ||
    /\.(png|jpg|jpeg|gif|svg|ico|txt|xml|webp|avif|woff2?)$/.test(pathname) ||
    PUBLIC.some((p) => pathname.startsWith(p))
  ) {
    return NextResponse.next();
  }

  // Check if user is authenticated for protected routes
  try {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get: (name) => req.cookies.get(name)?.value,
          set: (name, value, options) => {
            // This won't actually set cookies in middleware, but required by the API
          },
          remove: (name, options) => {
            // This won't actually remove cookies in middleware, but required by the API
          },
        },
      }
    );

    const { data: { user }, error } = await supabase.auth.getUser();
    
    if (error || !user) {
      // Redirect to auth page if not authenticated
      const url = req.nextUrl.clone();
      url.pathname = "/auth";
      return NextResponse.redirect(url);
    }

    // User is authenticated, allow access
    return NextResponse.next();
  } catch (error) {
    // If there's an error with Supabase, redirect to auth page
    console.error("Middleware auth error:", error);
    const url = req.nextUrl.clone();
    url.pathname = "/auth";
    return NextResponse.redirect(url);
  }
}

export const config = { matcher: "/:path*" };
