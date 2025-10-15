export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'
export const runtime = 'nodejs'

export default function Page() {
  return (
    <pre style={{padding:16,color:'#ddd',background:'#0a0a0a',border:'1px solid #333',borderRadius:12}}>
      {JSON.stringify({ now: new Date().toISOString(), runtime: 'nodejs', dynamic: true }, null, 2)}
    </pre>
  )
}
