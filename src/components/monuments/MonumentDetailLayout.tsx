import { ReactNode } from "react";
import { SectionHeader } from "@/components/ui/content-card";
import { Skeleton } from "@/components/ui/skeleton";

interface SectionShellProps {
  title: string;
  children?: ReactNode;
  loading?: boolean;
}

export function SectionShell({ title, children, loading = false }: SectionShellProps) {
  return (
    <section className="space-y-4">
      <SectionHeader title={title} />
      {loading ? <Skeleton className="h-32 w-full rounded-lg" /> : children}
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
    <main className="p-4 space-y-8">
      {hero}
      {milestones}
      {goals}
      {notes}
      {activity}
    </main>
  );
}

export default MonumentDetailLayout;
