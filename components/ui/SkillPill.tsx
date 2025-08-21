import { LucideIcon } from 'lucide-react'
import { Progress } from './Progress'

interface SkillPillProps {
  icon: LucideIcon
  name: string
  value: number
}

export function SkillPill({ icon: Icon, name, value }: SkillPillProps) {
  return (
    <div className="group hover:translate-y-[-2px] transition-all duration-200">
      <div className="bg-[#15161A] rounded-2xl shadow-[0_8px_24px_rgba(0,0,0,0.45)] border border-white/5 p-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-9 h-9 rounded-full bg-white/5 flex items-center justify-center flex-shrink-0">
            <Icon className="w-5 h-5 text-white/70" aria-hidden="true" />
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="text-zinc-200 font-medium truncate">{name}</h4>
          </div>
          <div className="text-sm text-zinc-400 font-mono">{value}%</div>
        </div>
        <Progress value={value} className="w-full" />
      </div>
    </div>
  )
}
