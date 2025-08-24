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

  // Create a mutable response; pass { request } for edge correctness
  const res = NextResponse.next({ request: req });

  // Build Supabase client using Next 15 cookie API (getAll/setAll)
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
    {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              res.cookies.set(name, value, options);
            });
          } catch {
            // Called from a Server Component during build? Ignore.
          }
        },
      },
    }
  );

  // Refresh session + read user
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

// Apply to all app routes; assets are filtered above
export const config = {
  matcher: ['/((?!_next/|favicon.ico).*)'],
};

