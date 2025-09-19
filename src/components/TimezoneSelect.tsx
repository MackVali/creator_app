"use client";

import { useId } from "react";
import { cn } from "@/lib/utils";

interface TimezoneSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  id?: string;
  name?: string;
  label?: string;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
}

export function TimezoneSelect({
  value,
  onChange,
  options,
  id,
  name,
  label,
  placeholder,
  className,
  inputClassName,
}: TimezoneSelectProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const listId = `${inputId}-options`;

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      {label && (
        <label htmlFor={inputId} className="text-sm font-medium text-[var(--text)]">
          {label}
        </label>
      )}
      <input
        id={inputId}
        name={name}
        list={listId}
        value={value}
        onChange={event => onChange(event.target.value)}
        placeholder={placeholder ?? "Choose a timezone"}
        className={cn(
          "w-full rounded-md border border-white/10 bg-black/40 px-3 py-2 text-sm text-[var(--text)] shadow-sm focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]",
          inputClassName
        )}
      />
      <datalist id={listId}>
        {options.map(option => (
          <option key={option} value={option} />
        ))}
      </datalist>
    </div>
  );
}

export default TimezoneSelect;
