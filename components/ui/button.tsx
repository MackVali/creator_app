import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground border border-white/10 shadow-[0_10px_24px_rgba(0,0,0,0.35),0_4px_10px_rgba(0,0,0,0.24),inset_0_1px_0_rgba(255,255,255,0.14)] hover:bg-primary/90 hover:-translate-y-px hover:shadow-[0_14px_30px_rgba(0,0,0,0.4),0_6px_14px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.16)] active:translate-y-px active:shadow-[0_6px_14px_rgba(0,0,0,0.35),0_3px_7px_rgba(0,0,0,0.24),inset_0_1px_0_rgba(255,255,255,0.12)]",
        destructive:
          "bg-destructive text-white shadow-xs hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60",
        confirmSquare:
          [
            "btn-3d btn-3d--emerald",
            "rounded-lg",
            "bg-gradient-to-b from-emerald-500 to-emerald-700",
            "hover:from-emerald-500 hover:to-emerald-800",
            "active:from-emerald-600 active:to-emerald-800",
            "text-white",
          ].join(" "),
        cancelSquare:
          [
            "btn-3d btn-3d--red",
            "rounded-lg",
            "bg-gradient-to-b from-red-500 to-red-700",
            "hover:from-red-500 hover:to-red-800",
            "active:from-red-600 active:to-red-800",
            "text-white",
          ].join(" "),
        outline:
          "border border-white/20 bg-background shadow-[0_8px_20px_rgba(0,0,0,0.3),0_3px_8px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.1)] hover:bg-accent hover:text-accent-foreground hover:-translate-y-px active:translate-y-px dark:bg-input/30 dark:border-input dark:hover:bg-input/50",
        secondary:
          "bg-secondary text-secondary-foreground border border-white/10 shadow-[0_8px_20px_rgba(0,0,0,0.3),0_3px_8px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.12)] hover:bg-secondary/80 hover:-translate-y-px active:translate-y-px",
        ghost:
          "hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2 has-[>svg]:px-3",
        sm: "h-8 rounded-md gap-1.5 px-3 has-[>svg]:px-2.5",
        lg: "h-10 rounded-md px-6 has-[>svg]:px-4",
        icon: "size-9",
        iconSquare: "h-12 w-12 p-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot : "button"

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
