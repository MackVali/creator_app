"use client"

import { RefreshCcw } from "lucide-react"
import { type ButtonHTMLAttributes } from "react"

export type RescheduleButtonProps = {
  isRunning?: boolean
  idleLabel?: string
  runningLabel?: string
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type">

export function RescheduleButton({
  isRunning = false,
  idleLabel = "Reschedule",
  runningLabel = "Rescheduling…",
  className = "",
  disabled,
  onClick,
  ...rest
}: RescheduleButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={isRunning ? runningLabel : idleLabel}
      className={`group relative inline-flex items-center gap-2 rounded-full border border-white/40 bg-[linear-gradient(140deg,_#f4f5f9_0%,_#d6d9e0_45%,_#a1a6b4_100%)] px-5 py-2 text-sm font-semibold text-[#1f2733] shadow-[0_12px_26px_rgba(10,12,18,0.55),_0_5px_12px_rgba(0,0,0,0.35),_inset_0_1px_0_rgba(255,255,255,0.85)] transition-all duration-150 ease-out hover:-translate-y-0.5 hover:shadow-[0_18px_34px_rgba(8,10,16,0.6),_0_8px_18px_rgba(0,0,0,0.4),_inset_0_1px_0_rgba(255,255,255,0.9)] disabled:cursor-not-allowed disabled:translate-y-0 disabled:opacity-80 disabled:shadow-[0_12px_26px_rgba(10,12,18,0.4),_0_5px_12px_rgba(0,0,0,0.25),_inset_0_1px_0_rgba(255,255,255,0.6)] ${className}`}
      {...rest}
    >
      <div className="relative flex h-8 w-8 items-center justify-center rounded-full bg-white/40 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),_0_4px_8px_rgba(0,0,0,0.25)]">
        <RefreshCcw
          strokeWidth={2.6}
          className={`h-[18px] w-[18px] text-[#111b27] ${
            isRunning ? "animate-spin" : "group-hover:rotate-6"
          } transition-transform duration-200 ease-out`}
        />
      </div>
    </button>
  )
}
