import Link from "next/link";

export default function MonumentsPage() {
  return (
    <main className="p-6 space-y-6">
      <h1 className="text-lg font-semibold">Monuments</h1>
      <div className="card p-6 text-center">
        <p>No Monuments yet.</p>
      </div>
      <Link
        href="/monuments/new"
        className="block w-full rounded-full bg-[var(--accent)] py-2 text-center font-semibold text-black"
      >
        + Add Monument
      </Link>
    </main>
  );
}

