import { Search, User } from 'lucide-react'

interface TopbarProps {
  title: string
}

export function Topbar({ title }: TopbarProps) {
  return (
    <header className="bg-[#15161A] border-b border-white/5 px-6 py-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-zinc-200">{title}</h1>
        
        <div className="flex-1 max-w-md mx-8">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-zinc-400" aria-hidden="true" />
            <input
              type="text"
              placeholder="Search..."
              className="w-full pl-10 pr-4 py-2 bg-white/5 border border-white/10 rounded-lg text-zinc-200 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-white/20 focus:border-transparent"
            />
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <button className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors">
            <User className="w-4 h-4 text-zinc-300" aria-hidden="true" />
          </button>
        </div>
      </div>
    </header>
  )
}
