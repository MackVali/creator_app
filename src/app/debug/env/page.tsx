export const runtime = 'nodejs'

export default async function Page() {
  const envVars = {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL 
      ? `${process.env.NEXT_PUBLIC_SUPABASE_URL.slice(0, 24)}…` 
      : 'MISSING',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY 
      ? `${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY.slice(0, 16)}…` 
      : 'MISSING',
    NEXT_PUBLIC_VERCEL_ENV: process.env.NEXT_PUBLIC_VERCEL_ENV || 'NOT_SET',
    NODE_ENV: process.env.NODE_ENV || 'NOT_SET',
    VERCEL_ENV: process.env.VERCEL_ENV || 'NOT_SET',
    VERCEL_URL: process.env.VERCEL_URL || 'NOT_SET'
  }

  return (
    <pre style={{padding:16,color:'#ddd',background:'#0a0a0a',border:'1px solid #333',borderRadius:12}}>
      {JSON.stringify(envVars, null, 2)}
    </pre>
  )
}
