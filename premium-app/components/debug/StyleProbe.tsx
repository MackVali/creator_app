'use client'

export default function StyleProbe() {
  const isPreview = process.env.NEXT_PUBLIC_VERCEL_ENV === 'preview'
  if (!isPreview) return null
  return (
    <div className="fixed left-4 bottom-4 z-[9998] rounded-md border border-zinc-700 bg-zinc-900/80 px-3 py-2 text-xs text-zinc-100">
      Tailwind OK: <span className="inline-block rounded bg-zinc-100 px-1 text-[10px] font-bold text-zinc-900">A</span>
    </div>
  )
}
