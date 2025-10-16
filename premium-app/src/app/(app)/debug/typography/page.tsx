export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export default function Page(){
  return (
    <div style={{padding:24}}>
      <div style={{color:'#fff',marginBottom:8}}>INLINE VISIBLE</div>
      <div className="text-zinc-100">TAILWIND VISIBLE</div>
      <div className="mt-4 rounded-lg border border-zinc-700 bg-zinc-900 p-4">
        Card styled by Tailwind
      </div>
    </div>
  )
}
