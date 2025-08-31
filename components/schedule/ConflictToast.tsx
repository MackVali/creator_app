"use client"

interface Props {
  message: string
}

export function ConflictToast({ message }: Props) {
  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-red-600 text-white px-4 py-2 rounded shadow-lg">
      {message}
    </div>
  )
}
