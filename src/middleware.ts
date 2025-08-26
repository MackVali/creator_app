import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { ROUTES, PROTECTED_ROUTES } from '@/lib/routes';

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname === '/favicon.ico'
  ) {
    return NextResponse.next();
  }

  const isAuthRoute =
    pathname.startsWith(ROUTES.auth) ||
    pathname === ROUTES.signin ||
    pathname === ROUTES.signup;

  if (pathname === ROUTES.envCheck || isAuthRoute) {
    // env-check and auth routes are public
  } else if (PROTECTED_ROUTES.has(pathname)) {
    // will check session below
  } else {
    return NextResponse.next();
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const res = NextResponse.next();

  if (!supabaseUrl || !supabaseKey) {
    if (PROTECTED_ROUTES.has(pathname)) {
      return NextResponse.redirect(new URL(ROUTES.signin, req.url));
    }
    return res;
  }

  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      get: (name) => req.cookies.get(name)?.value,
      set: (name, value, options) => {
        req.cookies.set(name, value);
        res.cookies.set(name, value, options);
      },
      remove: (name, options) => {
        req.cookies.delete(name);
        res.cookies.set(name, '', { ...options, maxAge: 0 });
      },
    },
  });

  const {
    data: { session },
  } = await supabase.auth.getSession();

  const hasSession = !!session;

  if (PROTECTED_ROUTES.has(pathname) && !hasSession) {
    const redirectUrl = new URL(ROUTES.signin, req.url);
    redirectUrl.searchParams.set('next', pathname + req.nextUrl.search);
    return NextResponse.redirect(redirectUrl);
  }

  if (pathname.startsWith(ROUTES.auth) && hasSession) {
    return NextResponse.redirect(new URL(ROUTES.dashboard, req.url));
  }

  return res;
}

export const config = {
  matcher: ['/((?!_next|api|favicon.ico).*)'],
};
