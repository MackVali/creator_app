import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

const PUBLIC_PATHS = ['/auth', '/api', '/health'];

export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  const isAsset =
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/static/') ||
    /\.(png|jpg|jpeg|gif|svg|webp|ico|css|js|txt|map)$/.test(pathname);

  const isPublic =
    isAsset || PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'));

  // Mutable response for cookie writes
  const res = NextResponse.next();

  // IMPORTANT: In Next 15 middleware, use getAll/setAll (NOT get/set/remove)
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
    {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll(cookiesToSet) {
          // Gracefully handle build-time execution where setting may be blocked
          try {
            for (const { name, value, options } of cookiesToSet) {
              res.cookies.set(name, value, options);
            }
          } catch {
            // no-op
          }
        },
      },
    }
  );

  // Refresh session & read user
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Gate non-public routes
  if (!user && !isPublic) {
    const redirectTo = encodeURIComponent(pathname + (search || ''));
    const url = req.nextUrl.clone();
    url.pathname = '/auth';
    url.search = `?redirect=${redirectTo}`;
    return NextResponse.redirect(url);
  }

  // Keep signed-in users out of /auth
  if (user && pathname.startsWith('/auth')) {
    const params = new URLSearchParams(search);
    const dest = params.get('redirect') || '/';
    const url = req.nextUrl.clone();
    url.pathname = dest;
    url.search = '';
    return NextResponse.redirect(url);
  }

  return res;
}

// Apply to all app routes; assets handled above
export const config = {
  matcher: ['/((?!_next/|favicon.ico).*)'],
};

