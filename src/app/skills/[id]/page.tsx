import { notFound } from 'next/navigation';
import { getSkill } from '@/lib/data/skills';
import { updateSkill, deleteSkill } from '../actions';
import { PageHeader, ContentCard } from '@/components/ui';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const item = await getSkill(id);
  if (!item) notFound();

  return (
    <div className="p-6 space-y-6">
      <PageHeader title="Skill" />
      <ContentCard className="space-y-4" padding="sm">
        <form action={updateSkill.bind(null, id)} className="space-y-2">
          <Input name="name" defaultValue={item.name} required />
          <Input name="description" defaultValue={item.description ?? ''} />
          <Button type="submit">Save</Button>
        </form>
        <form action={deleteSkill.bind(null, id)}>
          <Button type="submit" variant="destructive">Delete</Button>
        </form>
      </ContentCard>
    </div>
  );
}
