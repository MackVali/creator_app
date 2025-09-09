import { ReactNode } from "react";
import { ContentCard, SectionHeader } from "@/components/ui/content-card";
import { Skeleton } from "@/components/ui/skeleton";

interface SectionShellProps {
  title: string;
  children?: ReactNode;
  loading?: boolean;
}

export function SectionShell({ title, children, loading = false }: SectionShellProps) {
  return (
    <section className="space-y-3">
      <SectionHeader title={title} />
      {loading ? (
        <ContentCard padding="sm" shadow="sm">
          <Skeleton className="h-32 w-full" />
        </ContentCard>
      ) : (
        <ContentCard padding="sm" shadow="sm">
          {children}
        </ContentCard>
      )}
    </section>
  );
}

interface MonumentDetailLayoutProps {
  hero: ReactNode;
  milestones: ReactNode;
  goals: ReactNode;
  notes: ReactNode;
  activity: ReactNode;
}

export function MonumentDetailLayout({
  hero,
  milestones,
  goals,
  notes,
  activity,
}: MonumentDetailLayoutProps) {
  return (
    <main className="p-3 md:p-4 space-y-3 md:space-y-4">
      {hero}
      {milestones}
      {goals}
      {notes}
      {activity}
    </main>
  );
}

export default MonumentDetailLayout;
