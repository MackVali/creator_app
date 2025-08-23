import Link from 'next/link'
import { listGoals } from '@/lib/data/goals'
import { createGoal } from './actions'

export const dynamic = 'force-dynamic'

export default async function Page() {
  const items = await listGoals()
  const EmptyCard = () => (
    <div className="rounded-lg border border-dashed p-4 text-sm opacity-80 flex flex-col gap-2">
      <div className="font-medium">No goals yet</div>
      <form action={createGoal} className="flex flex-col sm:flex-row gap-2">
        <input name="name" placeholder="Name" className="flex-1 border rounded px-2 py-1" required />
        <input name="description" placeholder="Description (optional)" className="flex-1 border rounded px-2 py-1" />
        <button className="border rounded px-3 py-1">Add</button>
      </form>
    </div>
  )
  return (
    <main className="p-4">
      <h1 className="text-2xl font-bold mb-4">Goals</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {items.length === 0 ? (
          <><EmptyCard /><EmptyCard /><EmptyCard /></>
        ) : (
          <>
            <EmptyCard />
            {items.map(it => (
              <Link key={it.id} href={`/goals/${it.id}`} className="rounded-lg border p-4 hover:bg-gray-50">
                <div className="font-semibold">{it.name}</div>
                {it.description && <p className="text-sm opacity-80 mt-1">{it.description}</p>}
              </Link>
            ))}
          </>
        )}
      </div>
    </main>
  )
}
