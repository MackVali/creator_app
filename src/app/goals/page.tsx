import Link from 'next/link';
import { listGoals } from '@/lib/data/goals';
import { createGoal } from './actions';
import { PageHeader, ContentCard, ListContainer } from '@/components/ui';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export default async function Page() {
  const items = await listGoals();

  return (
    <div className="p-6 space-y-6">
      <PageHeader title="Goals" />
      {items.length === 0 && (
        <p className="text-sm text-muted-foreground">No items yet</p>
      )}
      {items.length > 0 && (
        <ListContainer>
          {items.map((goal) => (
            <ContentCard key={goal.id} padding="sm">
              <Link href={`/goals/${goal.id}`} className="block">
                <div className="font-medium">{goal.name}</div>
                {goal.description && (
                  <p className="text-sm text-muted-foreground">
                    {goal.description}
                  </p>
                )}
              </Link>
            </ContentCard>
          ))}
        </ListContainer>
      )}
      <form action={createGoal} className="space-y-2">
        <Input name="name" placeholder="Name" required />
        <Input name="description" placeholder="Description" />
        <Button type="submit">Add</Button>
      </form>
    </div>
  );
}
