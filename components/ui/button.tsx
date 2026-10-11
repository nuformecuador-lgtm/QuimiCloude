import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { touchTarget } from "@/lib/shared/ui/touch-target"
import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "group/button inline-flex shrink-0 cursor-pointer items-center justify-center rounded-lg border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-solid focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "btn-shine bg-primary text-primary-foreground active:not-aria-[haspopup]:scale-[0.98]",
        outline:
          "btn-veil border-border bg-background active:not-aria-[haspopup]:scale-[0.98] aria-expanded:bg-muted aria-expanded:text-foreground dark:border-input dark:bg-input/30",
        "outline-dashed":
          "btn-veil border-dashed border-border bg-background active:not-aria-[haspopup]:scale-[0.98] aria-expanded:bg-muted aria-expanded:text-foreground dark:border-input dark:bg-input/30",
        secondary:
          "btn-veil bg-secondary text-secondary-foreground active:not-aria-[haspopup]:scale-[0.98] aria-expanded:bg-secondary aria-expanded:text-secondary-foreground",
        ghost:
          "btn-veil active:not-aria-[haspopup]:scale-[0.98] aria-expanded:bg-muted aria-expanded:text-foreground",
        destructive:
          "bg-destructive text-destructive-foreground active:not-aria-[haspopup]:scale-[0.98] hover:bg-[color-mix(in_oklch,var(--destructive),var(--foreground)_10%)]",
        link: "text-primary underline-offset-4 active:not-aria-[haspopup]:translate-y-px hover:underline",
      },
      size: {
        default:
          "h-9 gap-1.5 px-3.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        xs: "h-6 gap-1 rounded-[min(var(--radius-md),10px)] px-2 text-xs in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 gap-1 rounded-[min(var(--radius-md),12px)] px-3 text-[13px] in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-9 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        xl: "h-13 gap-2 rounded-[10px] px-5 text-base font-semibold",
        icon: "size-9",
        "icon-xs":
          "size-6 rounded-[min(var(--radius-md),10px)] in-data-[slot=button-group]:rounded-lg [&_svg:not([class*='size-'])]:size-3",
        "icon-sm":
          "size-8 rounded-[min(var(--radius-md),12px)] in-data-[slot=button-group]:rounded-lg",
        "icon-lg": "size-9",
      },
      touch: {
        true: touchTarget,
        false: "",
        mobile: "max-md:min-h-11",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
      touch: false,
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  touch = false,
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, touch, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
