import { ReactNode } from 'react'

interface SectionCardProps {
  title?: string
  children: ReactNode
  className?: string
}

export function SectionCard({ title, children, className = '' }: SectionCardProps) {
  return (
    <div className={`bg-[#15161A] rounded-2xl shadow-[0_8px_24px_rgba(0,0,0,0.45)] border border-white/5 p-6 ${className}`}>
      {title && (
        <h3 className="text-zinc-300 tracking-wider text-xs font-semibold uppercase mb-4">
          {title}
        </h3>
      )}
      {children}
    </div>
  )
}
