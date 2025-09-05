"use client"

import { 
  LayoutDashboard, 
  Target, 
  FolderOpen, 
  CheckSquare, 
  Repeat, 
  Zap, 
  Trophy,
  Calendar
} from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Schedule', href: '/schedule', icon: Calendar },
  { name: 'Goals', href: '/goals', icon: Target },
  { name: 'Projects', href: '/projects', icon: FolderOpen },
  { name: 'Tasks', href: '/tasks', icon: CheckSquare },
  { name: 'Habits', href: '/habits', icon: Repeat },
  { name: 'Skills', href: '/skills', icon: Zap },
  { name: 'Monuments', href: '/monuments', icon: Trophy },
]

export function Sidebar() {
  const pathname = usePathname()

  return (
    <div className="w-16 md:w-64 bg-[#222224] border-r border-white/5 flex-shrink-0">
      <div className="p-4">
        <div className="text-center md:text-left mb-8">
          <h1 className="text-xl font-bold text-zinc-200 hidden md:block">Premium</h1>
        </div>
        
        <nav className="space-y-2">
          {navigation.map((item) => {
            const isActive = pathname === item.href
            return (
              <Link
                key={item.name}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                  isActive 
                    ? 'bg-white/10 text-zinc-200' 
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/5'
                }`}
              >
                <item.icon className="w-5 h-5 flex-shrink-0" aria-hidden="true" />
                <span className="hidden md:block text-sm font-medium">{item.name}</span>
              </Link>
            )
          })}
        </nav>
      </div>
    </div>
  )
}
