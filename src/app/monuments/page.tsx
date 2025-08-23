import Link from 'next/link';
import { listMonuments } from '@/lib/data/monuments';
import { createMonument } from './actions';
import { PageHeader, ContentCard, ListContainer } from '@/components/ui';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export default async function Page() {
  const items = await listMonuments();
  return (
    <div className="p-6 space-y-6">
      <PageHeader title="Monuments" />
      {items.length === 0 && (
        <p className="text-sm text-muted-foreground">No items yet</p>
      )}
      {items.length > 0 && (
        <ListContainer>
          {items.map((mon) => (
            <ContentCard key={mon.id} padding="sm">
              <Link href={`/monuments/${mon.id}`} className="block">
                <div className="font-medium">{mon.name}</div>
                {mon.description && (
                  <p className="text-sm text-muted-foreground">
                    {mon.description}
                  </p>
                )}
              </Link>
            </ContentCard>
          ))}
        </ListContainer>
      )}
      <form action={createMonument} className="space-y-2">
        <Input name="name" placeholder="Name" required />
        <Input name="description" placeholder="Description" />
        <Button type="submit">Add</Button>
      </form>
    </div>
  );
}
