import Link from 'next/link';
import { listSkills } from '@/lib/data/skills';
import { createSkill } from './actions';
import { PageHeader, ContentCard, ListContainer } from '@/components/ui';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export default async function Page() {
  const items = await listSkills();
  return (
    <div className="p-6 space-y-6">
      <PageHeader title="Skills" />
      {items.length === 0 ? (
        <div className="rounded-lg border p-4 text-sm opacity-80">
          No items yet or no access. <a href="/debug/rsc" className="underline">Debug</a>
        </div>
      ) : (
        <ListContainer>
          {items.map((skill) => (
            <ContentCard key={skill.id} padding="sm">
              <Link href={`/skills/${skill.id}`} className="block">
                <div className="font-medium">{skill.name}</div>
                {skill.description && (
                  <p className="text-sm text-muted-foreground">
                    {skill.description}
                  </p>
                )}
              </Link>
            </ContentCard>
          ))}
        </ListContainer>
      )}
      <form action={createSkill} className="space-y-2">
        <Input name="name" placeholder="Name" required />
        <Input name="description" placeholder="Description" />
        <Button type="submit">Add</Button>
      </form>
    </div>
  );
}
