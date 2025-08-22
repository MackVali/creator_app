'use client'
export default function RoleOption(
  { title, desc, selected, disabled=false, onSelect }:
  { title: string, desc: string, selected: boolean, disabled?: boolean, onSelect(): void }
) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onSelect}
      className={[
        'w-full rounded-xl border p-4 text-left transition',
        disabled
          ? 'border-zinc-800/60 text-zinc-500/60 bg-zinc-900/40 cursor-not-allowed'
          : selected
            ? 'border-zinc-700 bg-zinc-900'
            : 'border-zinc-800/80 bg-zinc-900/60 hover:border-zinc-700',
      ].join(' ')}
    >
      <div className="flex items-center justify-between">
        <div className="text-[13px] font-semibold tracking-wide text-zinc-200">{title}</div>
        <div className={[
          'h-4 w-4 rounded-full',
          selected ? 'bg-white' : 'border border-zinc-600'
        ].join(' ')} />
      </div>
      <div className="mt-1 text-[13px] text-zinc-400">{desc}</div>
    </button>
  )
}
