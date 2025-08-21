'use client'
import { useState } from 'react'
import { Label, Input, Button, Card, TabButton } from '@/components/ui/field'
import RoleOption from '@/components/auth/RoleOption'
import { useRouter } from 'next/navigation'
import { getSupabaseBrowser } from '@/lib/supabase'

export default function AuthForm() {
  const [tab, setTab] = useState<'signin'|'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [role, setRole] = useState<'CREATOR'|'MANAGER'|'BUSINESS'>('CREATOR')
  const [stay, setStay] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  const supabase = getSupabaseBrowser?.()

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault()
    if (!supabase) { setError('Supabase not initialized'); return }
    setLoading(true); setError(null)
    const { data, error } = await supabase.auth.signInWithPassword({ email, password, options: { persistSession: stay } })
    setLoading(false)
    if (error) return setError(error.message)
    if (data?.user) router.replace('/dashboard')
  }

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault()
    if (!supabase) { setError('Supabase not initialized'); return }
    setLoading(true); setError(null)
    const { data, error } = await supabase.auth.signUp({
      email, password,
      options: { data: { full_name: fullName, role } }
    })
    setLoading(false)
    if (error) return setError(error.message)
    // You can send to verification flow or straight to dashboard depending on your Supabase email settings
    router.replace('/dashboard')
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center">
      <div className="mb-6 text-center">
        <div className="text-3xl font-extrabold tracking-widest text-zinc-200">
          <span className="text-zinc-400">ACCOUNT</span>ABILITY
        </div>
        <div className="mt-2 text-sm text-zinc-400">Level up your life!</div>
      </div>

      <Card className="pt-5">
        <div className="px-1">
          <div className="text-lg font-semibold text-zinc-200">Welcome</div>
          <div className="mt-1 text-sm text-zinc-400">Sign in to your account or create a new one</div>
        </div>

        <div className="mt-4 flex rounded-md border border-zinc-800/70 bg-zinc-900/50 p-1">
          <TabButton active={tab==='signin'} onClick={() => setTab('signin')}>Sign In</TabButton>
          <TabButton active={tab==='signup'} onClick={() => setTab('signup')}>Sign Up</TabButton>
        </div>

        {tab === 'signin' ? (
          <form onSubmit={handleSignIn} className="mt-5 space-y-4">
            <div>
              <Label>Email</Label>
              <Input type="email" placeholder="Enter your email" value={email} onChange={e=>setEmail(e.target.value)} />
            </div>
            <div>
              <Label>Password</Label>
              <Input type="password" placeholder="Enter your password" value={password} onChange={e=>setPassword(e.target.value)} />
            </div>
            <label className="mt-1 flex select-none items-center gap-2 text-[13px] text-zinc-400">
              <input type="checkbox" checked={stay} onChange={e=>setStay(e.target.checked)} className="h-3.5 w-3.5 rounded border border-zinc-700 bg-zinc-900" />
              Remain signed in
            </label>
            {error ? <div className="text-[13px] text-red-400">{error}</div> : null}
            <Button disabled={loading}>{loading ? 'Signing in…' : 'Sign In'}</Button>
            <div className="mt-1 text-center text-xs text-zinc-500">
              Forgot your password?
            </div>
          </form>
        ) : (
          <form onSubmit={handleSignUp} className="mt-5 space-y-4">
            <div>
              <Label>Full Name</Label>
              <Input placeholder="Enter your full name" value={fullName} onChange={e=>setFullName(e.target.value)} />
            </div>
            <div>
              <Label>Email</Label>
              <Input type="email" placeholder="Enter your email" value={email} onChange={e=>setEmail(e.target.value)} />
            </div>
            <div>
              <Label>Password</Label>
              <Input type="password" placeholder="Create a password (min 8 characters)" value={password} onChange={e=>setPassword(e.target.value)} />
            </div>

            <div>
              <Label>Choose Your Role</Label>
              <div className="space-y-3">
                <RoleOption
                  title="CREATOR"
                  desc="Build habits, track goals, and level up your life"
                  selected={role==='CREATOR'}
                  onSelect={()=>setRole('CREATOR')}
                />
                <RoleOption
                  title="MANAGER"
                  desc="Manage teams and track collective progress"
                  selected={role==='MANAGER'}
                  disabled
                  onSelect={()=>{}}
                />
                <RoleOption
                  title="BUSINESS"
                  desc="Enterprise analytics and team management"
                  selected={role==='BUSINESS'}
                  disabled
                  onSelect={()=>{}}
                />
              </div>
            </div>

            {error ? <div className="text-[13px] text-red-400">{error}</div> : null}
            <Button disabled={loading}>{loading ? 'Creating…' : 'Create Account'}</Button>
          </form>
        )}
      </Card>
    </div>
  )
}
