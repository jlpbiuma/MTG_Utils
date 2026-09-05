import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-amber-500/20 text-amber-300 border-amber-500/30",
        secondary:
          "border-transparent bg-slate-800 text-slate-300 border-slate-700",
        destructive:
          "border-transparent bg-rose-950/80 text-rose-300 border-rose-800/50",
        success:
          "border-transparent bg-emerald-950/80 text-emerald-300 border-emerald-800/50",
        outline: "text-slate-200 border-slate-700",
        manaW: "bg-yellow-950/60 text-yellow-200 border-yellow-700/50",
        manaU: "bg-sky-950/60 text-sky-200 border-sky-700/50",
        manaB: "bg-purple-950/60 text-purple-200 border-purple-700/50",
        manaR: "bg-red-950/60 text-red-200 border-red-700/50",
        manaG: "bg-emerald-950/60 text-emerald-200 border-emerald-700/50",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
