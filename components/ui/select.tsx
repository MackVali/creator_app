"use client";

import * as React from "react";
import { createPortal } from "react-dom";
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

  return extract(children).join(" ").trim();
}

const SelectContext = React.createContext<{
  onSelect?: (value: string, label: string) => void;
  selectedValue?: string;
  isOpen?: boolean;
  setIsOpen?: (open: boolean) => void;
}>({});

export function useSelectContext() {
  return React.useContext(SelectContext);
}

interface SelectProps {
  value?: string;
  onValueChange?: (value: string) => void;
  children: React.ReactNode;
  className?: string;
  placeholder?: string;
  trigger?: React.ReactNode;
  triggerClassName?: string;
  contentWrapperClassName?: string;
  hideChevron?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** If true, focusing the trigger opens the dropdown (useful for inline search inputs). */
  openOnTriggerFocus?: boolean;
  /** If true, render dropdown inline (no portal). Useful when the menu must stay within a constrained container. */
  disablePortal?: boolean;
  /** Optional max height override (pixels). Defaults to viewport-aware measurement. */
  maxHeight?: number;
}

const Select = React.forwardRef<HTMLDivElement, SelectProps>(
  (
    {
      value,
      onValueChange,
      children,
      className,
      placeholder,
      trigger,
      triggerClassName,
      contentWrapperClassName,
      hideChevron = false,
      onOpenChange,
      openOnTriggerFocus = false,
      disablePortal = false,
      maxHeight,
    },
    ref
  ) => {
    const [isOpen, setIsOpen] = React.useState(false);
    const [selectedValue, setSelectedValue] = React.useState(value || "");
    const [selectedLabel, setSelectedLabel] = React.useState("");
    const containerRef = React.useRef<HTMLDivElement>(null);
    const contentRef = React.useRef<HTMLDivElement>(null);
    // Track when focus opened the menu so the ensuing click doesn't immediately close it.
    const openedViaFocusRef = React.useRef(false);
    // Skip the click that follows a handled touch pointer down to avoid double toggles.
    const pointerDownHandledRef = React.useRef(false);
    const [contentPosition, setContentPosition] = React.useState<{
      left: number;
      width: number;
      top?: number;
      bottom?: number;
      maxHeight: number;
    } | null>(null);

    React.useEffect(() => {
      const handlePointerDown = (event: PointerEvent) => {
        const target = event.target as Node;
        const clickedTrigger = containerRef.current?.contains(target);
        const clickedContent = contentRef.current?.contains(target);
        if (!clickedTrigger && !clickedContent) {
          setIsOpen(false);
        }
      };

      // Pointer covers both mouse and touch; fallback mousedown for older browsers.
      document.addEventListener("pointerdown", handlePointerDown);
      document.addEventListener("mousedown", handlePointerDown);
      return () => {
        document.removeEventListener("pointerdown", handlePointerDown);
        document.removeEventListener("mousedown", handlePointerDown);
      };
    }, []);

    const updateContentPosition = React.useCallback(() => {
      if (!isOpen) return;
      if (typeof window === "undefined") return;
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const viewportHeight = window.innerHeight || 0;
      const gap = 8;
      const safeMargin = 12;
      const spaceBelow = Math.max(0, viewportHeight - rect.bottom - gap);
      const spaceAbove = Math.max(0, rect.top - gap);
      const preferAbove = spaceBelow < 260 && spaceAbove > spaceBelow;
      const availableSpace = preferAbove ? spaceAbove : spaceBelow;
      const fallbackMax = Math.max(200, viewportHeight - safeMargin * 2);
      const space = Math.max(availableSpace, 0);
      const computedMaxHeight = Math.min(
        maxHeight ?? fallbackMax,
        space > 0 ? space : fallbackMax,
        fallbackMax
      );

      if (preferAbove) {
        setContentPosition({
          left: rect.left,
          width: rect.width,
          bottom: Math.max(gap, viewportHeight - rect.top + gap),
          maxHeight: computedMaxHeight,
        });
      } else {
        setContentPosition({
          left: rect.left,
          width: rect.width,
          top: rect.bottom + gap,
          maxHeight: computedMaxHeight,
        });
      }
    }, [isOpen, maxHeight]);

    React.useLayoutEffect(() => {
      if (!isOpen) return;
      updateContentPosition();
      window.addEventListener("resize", updateContentPosition);
      window.addEventListener("scroll", updateContentPosition, { passive: true });
      return () => {
        window.removeEventListener("resize", updateContentPosition);
        window.removeEventListener("scroll", updateContentPosition);
      };
    }, [isOpen, updateContentPosition]);

    const updateOpen = (next: boolean) => {
      setIsOpen(next);
      if (!next) {
        openedViaFocusRef.current = false;
        pointerDownHandledRef.current = false;
      }
      onOpenChange?.(next);
    };

    const handleSelect = (nextValue: string, label: string) => {
      setSelectedValue(nextValue);
      setSelectedLabel(label);
      updateOpen(false);
      onValueChange?.(nextValue);
    };

    const handleTriggerPointerDown = (
      event: React.PointerEvent<HTMLButtonElement>
    ) => {
      if (event.pointerType !== "touch") return;
      // Toggle immediately on touch to avoid synthesized click delays/double taps.
      event.preventDefault();
      pointerDownHandledRef.current = true;
      updateOpen(!isOpen);
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
      <SelectContext.Provider
        value={{
          onSelect: handleSelect,
          selectedValue,
          isOpen,
          setIsOpen: updateOpen,
        }}
      >
        <div
          ref={(node) => {
            containerRef.current = node;
            if (typeof ref === "function") {
            ref(node);
          } else if (ref) {
            (ref as React.MutableRefObject<HTMLDivElement | null>).current =
              node;
          }
        }}
          className={cn("relative", className)}
        >
          <button
            type="button"
            onPointerDown={handleTriggerPointerDown}
            onClick={() => {
              if (pointerDownHandledRef.current) {
                pointerDownHandledRef.current = false;
                return;
              }
              if (openOnTriggerFocus && openedViaFocusRef.current) {
                openedViaFocusRef.current = false;
                return;
              }
              updateOpen(!isOpen);
            }}
            onFocusCapture={() => {
              if (!openOnTriggerFocus || isOpen) return;
              openedViaFocusRef.current = true;
              updateOpen(true);
            }}
            className={cn(
              "flex h-11 w-full items-center justify-between rounded-xl border border-white/10 bg-white/[0.04] px-3 text-sm text-zinc-100 shadow-[0_0_0_1px_rgba(148,163,184,0.06)] transition overflow-visible",
              "focus:outline-none focus:ring-2 focus:ring-blue-500/60 focus:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-50",
              isOpen && "border-blue-400/70",
              triggerClassName
            )}
          >
            <div className="flex items-center gap-2 flex-1 min-w-0">
              {trigger ? (
                trigger
              ) : (
                <span className="block truncate">
                  {selectedLabel || placeholder || "Select option..."}
                </span>
              )}
            </div>
            {!hideChevron ? (
              <ChevronDown
                className={cn(
                  "h-4 w-4 opacity-50 transition-transform flex-shrink-0",
                  isOpen && "rotate-180"
                )}
              />
            ) : null}
          </button>

          {isOpen && !disablePortal && contentPosition
            ? createPortal(
                <div
                  ref={contentRef}
                  className={cn(
                    "fixed z-[2147483651] overflow-hidden rounded-xl border border-white/10 bg-black shadow-xl shadow-black/40",
                    "overscroll-contain overflow-y-auto overflow-x-hidden",
                    contentWrapperClassName
                  )}
                  style={{
                    left: contentPosition.left,
                    width: contentPosition.width,
                    top: contentPosition.top,
                    bottom: contentPosition.bottom,
                    maxHeight: contentPosition.maxHeight,
                  }}
                >
                  {React.Children.map(children, (child) => {
                    if (
                      React.isValidElement(child) &&
                      child.type === SelectContent
                    ) {
                      return React.cloneElement(child, {
                        onSelect: handleSelect,
                        selectedValue,
                      });
                    }
                    return child;
                  })}
                </div>,
                document.body
              )
            : null}
          {isOpen && disablePortal ? (
            <div
              ref={contentRef}
              className={cn(
                "absolute z-[2147483651] mt-2 w-full overflow-hidden rounded-xl border border-white/10 bg-black shadow-xl shadow-black/40",
                "overscroll-contain overflow-y-auto overflow-x-hidden",
                contentWrapperClassName
              )}
            >
              {React.Children.map(children, (child) => {
                if (
                  React.isValidElement(child) &&
                  child.type === SelectContent
                ) {
                  return React.cloneElement(child, {
                    onSelect: handleSelect,
                    selectedValue,
                  });
                }
                return child;
              })}
            </div>
          ) : null}
        </div>
      </SelectContext.Provider>
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
  ({ children, onSelect, selectedValue, className }, ref) => {
    const ctx = React.useContext(SelectContext);
    const onSelectFn = onSelect ?? ctx.onSelect;
    const selectedVal = selectedValue ?? ctx.selectedValue;
    return (
      <div
        ref={ref}
        className={cn(
          "max-h-60 overflow-y-auto overflow-x-hidden overscroll-contain p-1",
          className
        )}
      >
        {React.Children.map(children, (child) => {
          if (!React.isValidElement(child)) return child;
          return React.cloneElement(child, {
            onSelect: onSelectFn,
            selectedValue: selectedVal,
          });
        })}
      </div>
    );
  }
);
SelectContent.displayName = "SelectContent";

interface SelectItemProps {
  value: string;
  children: React.ReactNode;
  onSelect?: (value: string, label: string) => void;
  selectedValue?: string;
  className?: string;
  label?: string;
  disabled?: boolean;
}

const SelectItem = React.forwardRef<HTMLDivElement, SelectItemProps>(
  (
    { value, children, onSelect, selectedValue, className, label, disabled },
    ref
  ) => {
    const context = React.useContext(SelectContext);
    const labelText = label ?? getLabelText(children);
    const resolvedOnSelect = onSelect ?? context.onSelect;
    const resolvedSelectedValue = selectedValue ?? context.selectedValue;
    const isDisabled = Boolean(disabled);

    return (
      <div
        ref={ref}
        className={cn(
          "flex w-full cursor-pointer select-none items-center rounded-lg px-3 py-2 text-sm text-zinc-200 transition hover:bg-white/10 hover:text-white",
          isDisabled && "cursor-not-allowed opacity-50",
          resolvedSelectedValue === value &&
            "bg-blue-500/20 text-white shadow-[0_0_0_1px_rgba(59,130,246,0.35)]",
          className
        )}
        role="option"
        aria-disabled={isDisabled}
        onClick={() => {
          if (isDisabled) return;
          resolvedOnSelect?.(value, labelText || value);
        }}
      >
        {children}
      </div>
    );
  }
);
SelectItem.displayName = "SelectItem";

export { Select, SelectContent, SelectItem, SelectTrigger, SelectValue };
