'use client'
import { useEffect } from 'react'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Send full details to server logs (visible in Vercel logs)
    // Note: message is redacted in UI but not in logs
    console.error('GlobalError', {
      message: error?.message,
      digest: error?.digest,
      stack: error?.stack,
      env: process.env.NEXT_PUBLIC_VERCEL_ENV || process.env.NODE_ENV,
    })
  }, [error])

  return (
    <html>
      <body style={{padding:16,fontFamily:'ui-sans-serif,system-ui'}}>
        <h1 style={{fontWeight:700, fontSize:20, marginBottom:8}}>Something went wrong</h1>
        <p style={{opacity:.8}}>We logged the details. Try again?</p>
        <button onClick={reset} style={{marginTop:12,padding:'8px 12px',border:'1px solid #e5e7eb',borderRadius:8}}>
          Try again
        </button>
      </body>
    </html>
  )
}
