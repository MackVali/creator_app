'use client'

import { useEffect } from 'react'

interface ErrorProps {
  error: Error & { digest?: string }
  reset: () => void
}

export default function Error({ error, reset }: ErrorProps) {
  const isDevOrPreview = process.env.NODE_ENV === 'development' || process.env.NEXT_PUBLIC_VERCEL_ENV === 'preview'

  useEffect(() => {
    // Log the error to the console
    console.error('Runtime error caught by error.tsx:', error)
  }, [error])

  if (isDevOrPreview) {
    return (
      <div className="min-h-screen bg-zinc-900 flex items-center justify-center p-6">
        <div className="max-w-4xl w-full">
          <div className="bg-red-900/20 border border-red-500/50 rounded-2xl p-8">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 bg-red-500/20 rounded-full flex items-center justify-center">
                <svg className="w-6 h-6 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
              </div>
              <div>
                <h1 className="text-2xl font-bold text-red-100">Runtime Error</h1>
                <p className="text-red-300">Something went wrong in your application</p>
              </div>
            </div>

            <div className="bg-red-950/30 border border-red-500/30 rounded-lg p-4 mb-6">
              <div className="text-sm text-red-300 mb-2">Error Details:</div>
              <div className="font-mono text-red-100 text-sm break-words">
                {error.message || 'Unknown error occurred'}
              </div>
              {error.stack && (
                <details className="mt-4">
                  <summary className="text-sm text-red-300 cursor-pointer hover:text-red-200">
                    Show Stack Trace
                  </summary>
                  <pre className="mt-2 text-xs text-red-200 overflow-x-auto whitespace-pre-wrap">
                    {error.stack}
                  </pre>
                </details>
              )}
            </div>

            <div className="flex gap-4">
              <button
                onClick={reset}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-colors"
              >
                Try Again
              </button>
              <button
                onClick={() => window.location.href = '/'}
                className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 text-zinc-200 rounded-lg font-medium transition-colors"
              >
                Go Home
              </button>
            </div>

            <div className="mt-6 p-4 bg-zinc-800/50 rounded-lg border border-zinc-700/50">
              <div className="text-sm text-zinc-400">
                <strong>Note:</strong> This error page is only visible in development and preview environments. 
                In production, users will see a generic error message.
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Production error page (minimal, user-friendly)
  return (
    <div className="min-h-screen bg-zinc-900 flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center">
        <div className="w-16 h-16 bg-zinc-700 rounded-full flex items-center justify-center mx-auto mb-6">
          <svg className="w-8 h-8 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
        </div>
        
        <h1 className="text-2xl font-bold text-zinc-100 mb-4">Something went wrong</h1>
        <p className="text-zinc-400 mb-6">
          We encountered an unexpected error. Please try refreshing the page or contact support if the problem persists.
        </p>
        
        <div className="flex gap-4 justify-center">
          <button
            onClick={reset}
            className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 text-zinc-200 rounded-lg font-medium transition-colors"
          >
            Try Again
          </button>
          <button
            onClick={() => window.location.href = '/'}
            className="px-4 py-2 bg-zinc-600 hover:bg-zinc-500 text-white rounded-lg font-medium transition-colors"
          >
            Go Home
          </button>
        </div>
      </div>
    </div>
  )
}
