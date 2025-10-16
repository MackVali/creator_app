import { ReactNode } from 'react'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'

interface PageShellProps {
  children: ReactNode
  title: string
}

export function PageShell({ children, title }: PageShellProps) {
  return (
    <div className="min-h-screen bg-[#0F0F12] text-zinc-200">
      <div className="flex">
        <Sidebar />
        <div className="flex-1 flex flex-col min-h-screen">
          <Topbar title={title} />
          <main className="flex-1 max-w-[1100px] mx-auto px-4 md:px-6 lg:px-8 py-8">
            {children}
          </main>
        </div>
      </div>
    </div>
  )
}
