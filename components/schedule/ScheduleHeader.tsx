"use client"

import { useState } from 'react'

interface Props {
  date: string
  onDateChange: (d: string) => void
  filters: {
    energy?: string
  }
  onFilterChange: (f: { energy?: string }) => void
  view: 'day' | 'compact'
  onViewChange: (v: 'day' | 'compact') => void
}

export function ScheduleHeader({ date, onDateChange, filters, onFilterChange, view, onViewChange }: Props) {
  return (
    <div className="flex items-center gap-2 p-4 sticky top-0 z-10 bg-[#1E1E1E]">
      <input
        type="date"
        value={date}
        onChange={(e) => onDateChange(e.target.value)}
        className="bg-[#2B2B2B] text-[#E0E0E0] border border-[#3C3C3C] rounded px-2 py-1"
      />
      <button
        onClick={() => onDateChange(new Date().toISOString().slice(0,10))}
        className="px-3 py-1 rounded bg-[#2B2B2B] text-[#E0E0E0] border border-[#3C3C3C] hover:bg-[#353535]"
      >Today</button>

      <div className="flex gap-1 ml-auto">
        {(['Low','Med','High'] as const).map((level) => (
          <button
            key={level}
            onClick={() => onFilterChange({ energy: filters.energy === level ? undefined : level })}
            className={`px-2 py-1 rounded text-sm border ${filters.energy===level? 'bg-[#353535]':'bg-[#2B2B2B]'} border-[#3C3C3C] text-[#E0E0E0]`}
          >{level}</button>
        ))}
      </div>

      <div className="flex gap-1 ml-2">
        <button
          onClick={() => onViewChange('day')}
          className={`px-2 py-1 rounded text-sm border ${view==='day'?'bg-[#353535]':'bg-[#2B2B2B]'} border-[#3C3C3C] text-[#E0E0E0]`}
        >Day</button>
        <button
          onClick={() => onViewChange('compact')}
          className={`px-2 py-1 rounded text-sm border ${view==='compact'?'bg-[#353535]':'bg-[#2B2B2B]'} border-[#3C3C3C] text-[#E0E0E0]`}
        >Compact</button>
      </div>
    </div>
  )
}
