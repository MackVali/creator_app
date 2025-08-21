interface GoalsListProps {
  items: string[]
}

export function GoalsList({ items }: GoalsListProps) {
  return (
    <ul className="space-y-3">
      {items.map((goal, index) => (
        <li key={index} className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-zinc-500 flex-shrink-0"></div>
          <span className="text-zinc-300">{goal}</span>
        </li>
      ))}
    </ul>
  )
}
