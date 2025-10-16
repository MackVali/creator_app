interface ProgressProps {
  value: number
  trackClass?: string
  barClass?: string
  className?: string
}

export function Progress({ value, trackClass = '', barClass = '', className = '' }: ProgressProps) {
  const clampedValue = Math.max(0, Math.min(100, value))
  
  return (
    <div className={`w-full ${className}`}>
      <div
        className={`h-2 rounded-full bg-gray-800 ${trackClass}`}
        role="progressbar"
        aria-valuenow={clampedValue}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className={`h-2 rounded-full bg-gradient-to-r from-gray-700 to-gray-900 transition-all duration-300 ${barClass}`}
          style={{ width: `${clampedValue}%` }}
        />
      </div>
    </div>
  )
}
