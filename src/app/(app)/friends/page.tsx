"use client";
import Link from 'next/link';
import { ROUTES } from '@/lib/routes';

export default function FriendsPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-950 text-gray-200">
      <h1 className="text-2xl mb-8">Friends - Coming Soon…</h1>
      <div className="flex gap-4">
        <Link href={ROUTES.dashboard} data-testid="fab-add-friend" className="p-4 rounded-full bg-gray-800">Add Friend</Link>
        <Link href={ROUTES.dashboard} data-testid="fab-invite" className="p-4 rounded-full bg-gray-800">Invite</Link>
        <Link href={ROUTES.dashboard} data-testid="fab-post-service" className="p-4 rounded-full bg-gray-800">Post Service</Link>
      </div>
    </div>
  );
}
