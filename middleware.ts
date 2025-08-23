import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

const PUBLIC_FILE = /\.(.*)$/;

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();
  const { pathname } = req.nextUrl;

  // Skip static assets
  if (PUBLIC_FILE.test(pathname)) {
    return res;
  }

  // Allow public routes
  if (pathname.startsWith("/api")) {
    return res;
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (name) => req.cookies.get(name)?.value,
        set: (name, value, options) => res.cookies.set(name, value, options),
        remove: (name, options) =>
          res.cookies.set(name, "", { ...options, maxAge: 0 }),
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && !pathname.startsWith("/auth")) {
    const redirectUrl = req.nextUrl.clone();
    redirectUrl.pathname = "/auth";
    redirectUrl.searchParams.set(
      "redirect",
      pathname + req.nextUrl.search,
    );
    return NextResponse.redirect(redirectUrl, { headers: res.headers });
  }

  if (user && pathname.startsWith("/auth")) {
    const redirectParam = req.nextUrl.searchParams.get("redirect");
    const dest = redirectParam || "/";
    return NextResponse.redirect(new URL(dest, req.url), {
      headers: res.headers,
    });
  }

  return res;
}

export const config = {
  matcher: ["/((?!_next/|favicon.ico).*)"],
};
