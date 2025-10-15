"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

function getLabelText(children: React.ReactNode): string {
  const extract = (nodes: React.ReactNode): string[] =>
    React.Children.toArray(nodes).flatMap((child) => {
      if (typeof child === "string" || typeof child === "number") {
        return [String(child)];
      }

      if (React.isValidElement(child) && "props" in child && child.props) {
        return extract(child.props.children);
      }

      return [];
    });

  return extract(children)
    .join(" ")
    .trim();
}

interface SelectProps {
  value?: string;
  onValueChange?: (value: string) => void;
  children: React.ReactNode;
  className?: string;
  placeholder?: string;
  triggerClassName?: string;
  contentWrapperClassName?: string;
}

const Select = React.forwardRef<HTMLDivElement, SelectProps>(
  (
    {
      value,
      onValueChange,
      children,
      className,
      placeholder,
      triggerClassName,
      contentWrapperClassName,
    },
    ref
  ) => {
    const [isOpen, setIsOpen] = React.useState(false);
    const [selectedValue, setSelectedValue] = React.useState(value || "");
    const [selectedLabel, setSelectedLabel] = React.useState("");
    const containerRef = React.useRef<HTMLDivElement>(null);

    React.useEffect(() => {
      const handleClickOutside = (event: MouseEvent) => {
        if (
          containerRef.current &&
          !containerRef.current.contains(event.target as Node)
        ) {
          setIsOpen(false);
        }
      };

      document.addEventListener("mousedown", handleClickOutside);
      return () =>
        document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const handleSelect = (nextValue: string, label: string) => {
      setSelectedValue(nextValue);
      setSelectedLabel(label);
      setIsOpen(false);
      onValueChange?.(nextValue);
    };

    React.useEffect(() => {
      setSelectedValue(value || "");
    }, [value]);

    React.useEffect(() => {
      if (!value) {
        setSelectedLabel("");
        return;
      }

      const findLabel = (nodes: React.ReactNode): string | null => {
        let match: string | null = null;
        React.Children.forEach(nodes, (child) => {
          if (match || !React.isValidElement(child)) {
            return;
          }

          if (child.type === SelectItem && child.props.value === value) {
            match = child.props.label ?? getLabelText(child.props.children);
          } else if (child.props && "children" in child.props) {
            match = findLabel(child.props.children);
          }
        });
        return match;
      };

      const derived = findLabel(children);
      setSelectedLabel(derived || "");
    }, [children, value]);

    return (
      <div ref={(node) => {
        containerRef.current = node;
        if (typeof ref === "function") {
          ref(node);
        } else if (ref) {
          (ref as React.MutableRefObject<HTMLDivElement | null>).current = node;
        }
      }} className={cn("relative", className)}>
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className={cn(
            "flex h-11 w-full items-center justify-between rounded-xl border border-white/10 bg-white/[0.04] px-3 text-sm text-zinc-100 shadow-[0_0_0_1px_rgba(148,163,184,0.06)] transition",
            "focus:outline-none focus:ring-2 focus:ring-blue-500/60 focus:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-50",
            isOpen && "border-blue-400/70",
            triggerClassName
          )}
        >
          <span className="block truncate">
            {selectedLabel || placeholder || "Select option..."}
          </span>
          <ChevronDown
            className={cn(
              "h-4 w-4 opacity-50 transition-transform",
              isOpen && "rotate-180"
            )}
          />
        </button>

        {isOpen && (
          <div
            className={cn(
              "absolute z-50 mt-2 w-full overflow-hidden rounded-xl border border-white/10 bg-[#0f172a] shadow-xl shadow-black/40",
              contentWrapperClassName
            )}
          >
            {React.Children.map(children, (child) => {
              if (React.isValidElement(child) && child.type === SelectContent) {
                return React.cloneElement(
                  child as React.ReactElement<SelectContentProps>,
                  {
                    onSelect: handleSelect,
                    selectedValue,
                  }
                );
              }
              return child;
            })}
          </div>
        )}
      </div>
    );
  }
);
Select.displayName = "Select";

const SelectTrigger = React.forwardRef<HTMLDivElement, SelectProps>(
  ({ children, ...props }, ref) => (
    <Select ref={ref} {...props}>
      {children}
    </Select>
  )
);
SelectTrigger.displayName = "SelectTrigger";

const SelectValue = React.forwardRef<
  HTMLSpanElement,
  React.HTMLAttributes<HTMLSpanElement>
>(({ className, ...props }, ref) => (
  <span ref={ref} className={cn("block truncate", className)} {...props} />
));
SelectValue.displayName = "SelectValue";

interface SelectContentProps {
  children: React.ReactNode;
  onSelect?: (value: string, label: string) => void;
  selectedValue?: string;
  className?: string;
}

const SelectContent = React.forwardRef<HTMLDivElement, SelectContentProps>(
  ({ children, onSelect, selectedValue, className }, ref) => (
    <div ref={ref} className={cn("max-h-60 overflow-auto p-1", className)}>
      {React.Children.map(children, (child) => {
        if (React.isValidElement(child) && child.type === SelectItem) {
          return React.cloneElement(
            child as React.ReactElement<SelectItemProps>,
            {
              onSelect,
              selectedValue,
            }
          );
        }
        return child;
      })}
    </div>
  )
);
SelectContent.displayName = "SelectContent";

interface SelectItemProps {
  value: string;
  children: React.ReactNode;
  onSelect?: (value: string, label: string) => void;
  selectedValue?: string;
  className?: string;
  label?: string;
}

const SelectItem = React.forwardRef<HTMLDivElement, SelectItemProps>(
  ({ value, children, onSelect, selectedValue, className, label }, ref) => {
    const labelText = label ?? getLabelText(children);

    return (
      <div
        ref={ref}
        className={cn(
          "flex w-full cursor-pointer select-none items-center rounded-lg px-3 py-2 text-sm text-zinc-200 transition hover:bg-white/10 hover:text-white",
          selectedValue === value &&
            "bg-blue-500/20 text-white shadow-[0_0_0_1px_rgba(59,130,246,0.35)]",
          className
        )}
        onClick={() => onSelect?.(value, labelText || value)}
      >
        {children}
      </div>
    );
  }
);
SelectItem.displayName = "SelectItem";

export { Select, SelectContent, SelectItem, SelectTrigger, SelectValue };
