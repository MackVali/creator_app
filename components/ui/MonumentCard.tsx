import { LucideIcon } from 'lucide-react'

interface MonumentCardProps {
  icon: LucideIcon
  title: string
  count: number
}

export function MonumentCard({ icon: Icon, title, count }: MonumentCardProps) {
  return (
    <div className="group hover:translate-y-[-2px] transition-all duration-200 hover:shadow-[0_12px_32px_rgba(0,0,0,0.55)]">
      <div className="bg-[#222224] rounded-2xl shadow-[0_8px_24px_rgba(0,0,0,0.45)] border border-white/5 p-6 text-center">
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-white/5 flex items-center justify-center">
          <Icon className="w-8 h-8 text-white/70" aria-hidden="true" />
        </div>
        <h3 className="text-zinc-200 font-medium mb-2">{title}</h3>
        <div className="text-2xl font-bold text-zinc-300">{count}</div>
      </div>
    </div>
  )
}
