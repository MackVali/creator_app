export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export default function Page() {
  return (
    <div style={{padding:24}}>
      <div style={{color:'#fff',marginBottom:8}}>INLINE VISIBLE (should always be white)</div>
      <div className="text-zinc-100">TAILWIND VISIBLE (should be light zinc)</div>
      <div className="mt-4 rounded-lg border border-zinc-700 bg-zinc-900 p-4">
        Card uses Tailwind classes. If you see border & dark bg, Tailwind works.
      </div>
    </div>
  )
}
