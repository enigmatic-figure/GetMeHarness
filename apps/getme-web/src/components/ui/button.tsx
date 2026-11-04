import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

const variants = cva(
  "inline-flex items-center justify-center gap-2 rounded-full px-4 text-sm font-medium min-h-11 transition-[background-color,color,scale,opacity] duration-150 ease-out active:not-disabled:scale-[0.96] disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
  {
    variants: {
      variant: {
        primary: "bg-primary text-primary-ink",
        quiet: "border border-line bg-surface text-fg hover:bg-surface-2",
        ghost: "bg-transparent text-muted hover:bg-surface hover:text-fg",
        brass: "border border-accent bg-transparent text-fg hover:bg-surface",
      },
    },
    defaultVariants: { variant: "primary" },
  },
);

type Props = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof variants> & { asChild?: boolean };

export function Button({ className, variant, asChild, type = "button", ...props }: Props) {
  if (asChild) {
    return <Slot className={cn(variants({ variant }), className)} {...props} />;
  }
  return <button type={type} className={cn(variants({ variant }), className)} {...props} />;
}
