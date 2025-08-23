import { notFound } from 'next/navigation'
import { getSkill } from '@/lib/data/skills'
import { updateSkill, deleteSkill } from '../actions'

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const item = await getSkill(id)
  if (!item) return notFound()
  return (
    <main className="p-4 max-w-xl">
      <h1 className="text-2xl font-bold mb-3">Edit Skill</h1>
      <form action={updateSkill} className="flex flex-col gap-2">
        <input type="hidden" name="id" value={item.id} />
        <input name="name" defaultValue={item.name} className="border rounded px-2 py-1" required />
        <textarea name="description" defaultValue={item.description ?? ''} className="border rounded px-2 py-1" />
        <div className="flex gap-2">
          <button className="border rounded px-3 py-1">Save</button>
          <form action={deleteSkill}>
            <input type="hidden" name="id" value={item.id} />
            <button className="border rounded px-3 py-1">Delete</button>
          </form>
        </div>
      </form>
    </main>
  )
}
