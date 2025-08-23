import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const SKIP = [
  /^\/_next\//,
  /^\/favicon\.ico$/,
  /^\/images\//,
  /^\/api\/health$/,
  /^\/api\/debug\/env$/,
];

export function middleware(req: NextRequest) {
  const p = req.nextUrl.pathname;
  if (SKIP.some((r) => r.test(p))) return NextResponse.next();
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next|api/health|api/debug/env|images|favicon.ico).*)"],
};
