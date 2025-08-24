import { PageShell, SectionCard } from '@/components/ui'

export default function NewTaskPage() {
  return (
    <PageShell title="New Task">
      <div className="space-y-8">
        <SectionCard>
          <div className="text-center py-12">
            <div className="text-zinc-400 mb-4">Task creation form</div>
            <div className="text-sm text-zinc-500">Form will be implemented here</div>
          </div>
        </SectionCard>
      </div>
    </PageShell>
  )
}
