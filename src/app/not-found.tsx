import Link from 'next/link';
import { ROUTES } from '@/lib/routes';

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-950 text-gray-200" data-testid="not-found-page">
      <h1 className="text-2xl mb-4">Page not found</h1>
      <Link href={ROUTES.dashboard} className="text-blue-400 underline">Go Home</Link>
    </div>
  );
}
