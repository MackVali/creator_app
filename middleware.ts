import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const PUBLIC = ['/auth','/auth/callback','/debug','/debug/env','/env-check','/healthz','/favicon.ico','/robots.txt','/sitemap.xml']

export function middleware(req: NextRequest) {
  if (process.env.NEXT_PUBLIC_PREVIEW_BYPASS === '1') return NextResponse.next()
  const { pathname } = req.nextUrl
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname.startsWith('/static') ||
    /\.(png|jpg|jpeg|gif|svg|ico|txt|xml|webp|avif|woff2?)$/.test(pathname) ||
    PUBLIC.some(p => pathname.startsWith(p))
  ) return NextResponse.next()

  // Put your real auth redirects here later if needed.
  return NextResponse.next()
}

export const config = { matcher: '/:path*' }
