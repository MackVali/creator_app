"use client";

interface EmptyStateProps {
  onCreate(): void;
}

export function EmptyState({ onCreate }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
      <div className="text-5xl" role="img" aria-label="target">
        🎯
      </div>
      <p className="text-gray-400">No goals yet</p>
      <button
        onClick={onCreate}
        className="bg-blue-600 hover:bg-blue-500 px-4 py-2 rounded-md text-sm"
      >
        Create Goal
      </button>
    </div>
  );
}
