"use client"

import { Plus } from 'lucide-react'

interface FabProps {
  onClick: () => void
}

export function Fab({ onClick }: FabProps) {
  return (
    <button
      onClick={onClick}
      aria-label="Add new item"
      className="fixed right-6 bottom-6 h-16 w-16 rounded-full bg-white text-black shadow-2xl border border-white/20 hover:scale-105 transition-transform focus:outline-none focus:ring-4 focus:ring-white/20"
    >
      <Plus className="w-7 h-7 mx-auto" aria-hidden="true" />
    </button>
  )
}
