"use client";
import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ROUTES } from '@/lib/routes';

export default function SignUpPage() {
  const router = useRouter();
  const search = useSearchParams();
  useEffect(() => {
    const next = search.get('next');
    const params = new URLSearchParams();
    if (next) params.set('next', next);
    params.set('tab', 'signup');
    router.replace(`${ROUTES.auth}?${params.toString()}`);
  }, [router, search]);
  return <div data-testid="signup-page" />;
}
