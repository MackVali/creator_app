import { notFound } from 'next/navigation';
import { getGoal } from '@/lib/data/goals';
import { updateGoal, deleteGoal } from '../actions';
import { PageHeader, ContentCard } from '@/components/ui';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const item = await getGoal(id);
  if (!item) notFound();

  return (
    <div className="p-6 space-y-6">
      <PageHeader title="Goal" />
      <ContentCard className="space-y-4" padding="sm">
        <form action={updateGoal.bind(null, id)} className="space-y-2">
          <Input name="name" defaultValue={item.name} required />
          <Input name="description" defaultValue={item.description ?? ''} />
          <Button type="submit">Save</Button>
        </form>
        <form action={deleteGoal.bind(null, id)}>
          <Button type="submit" variant="destructive">Delete</Button>
        </form>
      </ContentCard>
    </div>
  );
}
