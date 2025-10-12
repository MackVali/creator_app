import { Suspense } from "react";
import PublicProfileContent from "./PublicProfileContent";
import { Skeleton } from "@/components/ui/skeleton";

interface PublicProfilePageProps {
  params: Promise<{
    username: string;
  }>;
}

export default async function PublicProfilePage({
  params,
}: PublicProfilePageProps) {
  const { username } = await params;

  return (
    <div className="container mx-auto max-w-5xl px-4 py-10">
      <div className="mb-8 flex flex-col gap-2">
        <p className="text-sm font-medium tracking-wide text-muted-foreground">
          Creator profile
        </p>
        <h1 className="text-3xl font-semibold sm:text-4xl">@{username}</h1>
      </div>
      <Suspense fallback={<PublicProfileSkeleton />}>
        <PublicProfileContent username={username} />
      </Suspense>
    </div>
  );
}

function PublicProfileSkeleton() {
  return (
    <div className="space-y-10">
      <div className="rounded-3xl border border-border/40 bg-background/60 p-8 shadow-[0_25px_60px_-40px_rgba(15,23,42,0.65)] sm:p-10">
        <div className="flex flex-col gap-8 lg:flex-row lg:items-end">
          <div className="flex items-center gap-6">
            <Skeleton className="h-28 w-28 rounded-3xl" />
            <div className="space-y-4">
              <div className="space-y-2">
                <Skeleton className="h-7 w-48" />
                <Skeleton className="h-5 w-32" />
              </div>
              <Skeleton className="h-4 w-64" />
            </div>
          </div>
          <Skeleton className="h-10 w-full max-w-xs rounded-full" />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[2fr,1fr]">
        <div className="rounded-2xl border border-border/40 bg-background/60 p-6 shadow-sm">
          <Skeleton className="h-5 w-40" />
          <div className="mt-4 space-y-3">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        </div>
        <div className="space-y-4">
          {[0, 1, 2].map((item) => (
            <div
              key={item}
              className="rounded-2xl border border-border/40 bg-background/60 p-4 shadow-sm"
            >
              <Skeleton className="h-4 w-32" />
              <Skeleton className="mt-3 h-3 w-24" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
