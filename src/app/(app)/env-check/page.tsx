"use client";
import { useEffect, useState } from 'react';
import { getSupabaseBrowser } from '@/lib/supabase';

function mask(value?: string) {
  if (!value) return '(missing)';
  return value.substring(0, 4) + '…';
}

export default function EnvCheckPage() {
  const [status, setStatus] = useState<'checking' | 'ok' | 'error'>('checking');

  useEffect(() => {
    const supabase = getSupabaseBrowser();
    if (!supabase) {
      setStatus('error');
      return;
    }
    supabase
      .from('goals')
      .select('*')
      .limit(1)
      .then(({ error }) => {
        setStatus(error ? 'error' : 'ok');
      });
  }, []);

  return (
    <div className="p-4 text-white" data-testid="env-check-page">
      <h1 className="text-xl mb-4">Env Check</h1>
      <p>NEXT_PUBLIC_SUPABASE_URL: {mask(process.env.NEXT_PUBLIC_SUPABASE_URL)}</p>
      <p>NEXT_PUBLIC_SUPABASE_ANON_KEY: {mask(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)}</p>
      <p className="mt-4">{status === 'ok' ? 'Supabase OK' : status === 'error' ? 'Supabase Error' : 'Checking…'}</p>
    </div>
  );
}
