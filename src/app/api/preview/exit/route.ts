import { draftMode } from 'next/headers'
import { NextResponse } from 'next/server'

export async function GET() {
  const { disable } = await draftMode()
  disable()
  return NextResponse.redirect(new URL('/', 'https://' + (process.env.VERCEL_URL ?? 'localhost:3000')))
}
