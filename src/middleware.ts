import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

import type { Database } from "@/types/supabase";
import { hasAcceptedLegal } from "@/lib/legal";

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

  if (pathname.startsWith("/legal")) {
    console.log(`[Middleware] Skipping ${pathname} (legal route)`);
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

    const supabase = createServerClient<Database>(supabaseUrl, supabaseKey, {
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

    await supabase.auth.getSession();

    const {
      data: userResult,
      error: userError,
    } = await supabase.auth.getUser();

    if (userError) {
      console.error(`[Middleware] Error fetching authenticated user:`, userError);
    }

    const user = userResult.user ?? null;
    const isAuthenticated = Boolean(user);
    const isAuthRoute = pathname === "/auth";
    const isAuthGroup = pathname.startsWith("/auth");

    // Log middleware decisions for debugging
    console.log(
      `[Middleware] ${pathname} - isAuthenticated: ${isAuthenticated}, isAuthRoute: ${isAuthRoute}, isAuthGroup: ${isAuthGroup}`
    );

    // If NO session and path !== /auth: redirect → /auth?redirect=<path+search>
    if (!isAuthenticated && !isAuthRoute) {
      const redirectUrl = new URL("/auth", req.url);
      redirectUrl.searchParams.set("redirect", pathname + req.nextUrl.search);
      console.log(`[Middleware] Redirecting to: ${redirectUrl.toString()}`);
      const redirectResponse = NextResponse.redirect(redirectUrl);
      res.cookies.getAll().forEach((cookie) => {
        redirectResponse.cookies.set(cookie);
      });
      return redirectResponse;
    }

    // If session AND path starts with /auth: redirect → ?redirect or /dashboard
    if (isAuthenticated && isAuthRoute) {
      const requestedRedirect = req.nextUrl.searchParams.get("redirect");
      const redirectTarget =
        requestedRedirect && requestedRedirect.startsWith("/")
          ? requestedRedirect
          : "/dashboard";

      console.log(`[Middleware] Redirecting to: ${redirectTarget}`);
      const redirectResponse = NextResponse.redirect(
        new URL(redirectTarget, req.url)
      );
      res.cookies.getAll().forEach((cookie) => {
        redirectResponse.cookies.set(cookie);
      });
      return redirectResponse;
    }

    const shouldEnforceLegal =
      isAuthenticated && !isAuthGroup && pathname !== "/";
    if (shouldEnforceLegal) {
      const legalAccepted = await hasAcceptedLegal(user.id, supabase);
      if (!legalAccepted) {
        console.log(
          `[Middleware] Redirecting ${pathname} to /legal/accept (legal not accepted)`
        );
        const legalRedirect = NextResponse.redirect(
          new URL("/legal/accept", req.url)
        );
        res.cookies.getAll().forEach((cookie) => {
          legalRedirect.cookies.set(cookie);
        });
        return legalRedirect;
      }
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
  matcher: ["/((?!api|_next|static|favicon.ico).*)"],
};
