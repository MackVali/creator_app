"use client"

import FlameEmber, { type FlameLevel } from '@/components/FlameEmber'
import { cn } from '@/lib/utils'

interface EnergyPagerProps {
  activeIndex: number
  className?: string
}

const LEVELS: FlameLevel[] = [
  'NO',
  'LOW',
  'MEDIUM',
  'HIGH',
  'ULTRA',
  'EXTREME',
]

export function EnergyPager({ activeIndex, className }: EnergyPagerProps) {
  return (
    <div
      aria-label="Energy levels"
      className={cn('flex items-center gap-2', className)}
    >
      {LEVELS.map((level, i) => (
        <div
          key={level}
          aria-current={i === activeIndex ? 'true' : undefined}
          title={level}
          className="relative"
          style={{ width: 18, height: 18 * 1.2 }}
        >
          <FlameEmber
            level={level}
            size="sm"
            className="absolute inset-0 origin-top-left scale-[0.75]"
          />
        </div>
      ))}
    </div>
  )
}

export default EnergyPager
