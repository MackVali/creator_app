'use client'
import * as React from 'react'

export function Label({ children }: { children: React.ReactNode }) {
  return <label className="mb-1 block text-sm font-medium text-zinc-300">{children}</label>
}

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Inp({ className='', ...props }, ref) {
    return (
      <input
        ref={ref}
        className={
          'h-10 w-full rounded-md border border-zinc-800/80 bg-zinc-900/60 px-3 text-[15px] text-zinc-100 outline-none ' +
          'placeholder:text-zinc-500 focus:border-zinc-700 focus:ring-0 ' + className
        }
        {...props}
      />
    )
  }
)

export function Button(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const { className='', children, ...rest } = props
  return (
    <button
      {...rest}
      className={
        'h-10 w-full rounded-md bg-zinc-100 text-zinc-900 text-[15px] font-medium ' +
        'disabled:opacity-50 disabled:cursor-not-allowed hover:brightness-95 active:brightness-90 ' + className
      }
    >
      {children}
    </button>
  )
}

export function Card({ children, className='' }: { children: React.ReactNode, className?: string }) {
  return (
    <div className={'w-full max-w-md rounded-2xl border border-zinc-800/70 bg-zinc-900/60 p-6 shadow-xl ' + className}>
      {children}
    </div>
  )
}

export function TabButton(
  { active, children, onClick }:
  { active: boolean, children: React.ReactNode, onClick(): void }
) {
  return (
    <button
      onClick={onClick}
      className={
        'h-9 flex-1 rounded-md text-sm font-medium transition ' +
        (active
          ? 'bg-zinc-800 text-zinc-100'
          : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/60 border border-transparent')
      }
    >
      {children}
    </button>
  )
}
