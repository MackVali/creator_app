import { draftMode } from 'next/headers'
import { NextResponse } from 'next/server'

export function GET() {
  draftMode().disable()
  return NextResponse.redirect(new URL('/', 'https://' + (process.env.VERCEL_URL ?? 'localhost:3000')))
}
