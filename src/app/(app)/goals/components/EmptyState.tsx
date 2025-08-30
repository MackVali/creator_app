"use client";

interface EmptyStateProps {
  onCreate(): void;
}

export function EmptyState({ onCreate }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
      <div className="text-5xl" role="img" aria-label="gear">
        ⚙️
      </div>
      <p className="text-[#A0A0A0]">No goals yet</p>
      <button
        onClick={onCreate}
        className="bg-[#2B2B2B] border border-[#3C3C3C] text-[#E0E0E0] px-4 py-2 rounded-md text-sm hover:bg-[#353535]"
      >
        Create Goal
      </button>
    </div>
  );
}
