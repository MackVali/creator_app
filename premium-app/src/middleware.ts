import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function middleware(req: NextRequest) {
  const pathname = req.nextUrl.pathname;

  console.log(`[Middleware] Processing ${pathname}`);

  // Skip static assets and API routes
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname === "/favicon.ico"
  ) {
    console.log(`[Middleware] Skipping ${pathname} (static/API route)`);
    return NextResponse.next();
  }

  try {
    // Check if environment variables are available
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      console.log(
        `[Middleware] Missing env vars - URL: ${!!supabaseUrl}, KEY: ${!!supabaseKey}`
      );
      // If no Supabase config, redirect to auth for all non-auth routes
      if (pathname !== "/auth") {
        const redirectUrl = new URL("/auth", req.url);
        redirectUrl.searchParams.set("redirect", pathname + req.nextUrl.search);
        console.log(
          `[Middleware] Redirecting to ${redirectUrl.toString()} (no Supabase config)`
        );
        return NextResponse.redirect(redirectUrl);
      }
      return NextResponse.next();
    }

    // Create Supabase client for auth check
    const res = NextResponse.next();

    const supabase = createServerClient(supabaseUrl, supabaseKey, {
      cookies: {
        get: (name) => req.cookies.get(name)?.value,
        set: (name, value, options) => {
          req.cookies.set(name, value);
          res.cookies.set(name, value, options);
        },
        remove: (name, options) => {
          req.cookies.delete(name);
          res.cookies.set(name, "", { ...options, maxAge: 0 });
        },
      },
    });

    const {
      data: { session },
    } = await supabase.auth.getSession();

    const hasSession = !!session;
    const isAuthRoute = pathname === "/auth";

    // Log middleware decisions for debugging
    console.log(
      `[Middleware] ${pathname} - hasSession: ${hasSession}, isAuthRoute: ${isAuthRoute}`
    );

    // If NO session and path !== /auth: redirect → /auth?redirect=<path+search>
    if (!hasSession && !isAuthRoute) {
      const redirectUrl = new URL("/auth", req.url);
      redirectUrl.searchParams.set("redirect", pathname + req.nextUrl.search);
      console.log(`[Middleware] Redirecting to: ${redirectUrl.toString()}`);
      return NextResponse.redirect(redirectUrl);
    }

    // If session AND path starts with /auth: redirect → ?redirect or /dashboard
    if (hasSession && isAuthRoute) {
      const redirectTo =
        req.nextUrl.searchParams.get("redirect") || "/dashboard";
      console.log(`[Middleware] Redirecting to: ${redirectTo}`);
      return NextResponse.redirect(new URL(redirectTo, req.url));
    }

    console.log(`[Middleware] Allowing access to ${pathname}`);
    return res;
  } catch (error) {
    console.error(`[Middleware] Error processing ${pathname}:`, error);

    // On error, redirect to auth for non-auth routes
    if (pathname !== "/auth") {
      const redirectUrl = new URL("/auth", req.url);
      redirectUrl.searchParams.set("redirect", pathname + req.nextUrl.search);
      console.log(
        `[Middleware] Error redirecting to ${redirectUrl.toString()}`
      );
      return NextResponse.redirect(redirectUrl);
    }

    return NextResponse.next();
  }
}

export const config = {
  matcher: ["/((?!_next|api|favicon.ico).*)"],
};
