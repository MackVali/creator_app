export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

export default function Page() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  return (
    <pre style={{padding:16,color:'#ddd',background:'#0a0a0a',border:'1px solid #333',borderRadius:12}}>
      {JSON.stringify({
        NEXT_PUBLIC_SUPABASE_URL: !!url,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: !!key
      }, null, 2)}
    </pre>
  )
}
