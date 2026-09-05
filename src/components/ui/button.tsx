import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98]",
  {
    variants: {
      variant: {
        default:
          "bg-amber-500 text-slate-950 font-semibold hover:bg-amber-400 shadow-md shadow-amber-500/20",
        destructive:
          "bg-rose-600 text-white hover:bg-rose-500 shadow-md shadow-rose-600/20",
        outline:
          "border border-slate-700/80 bg-slate-900/60 hover:bg-slate-800 text-slate-200 hover:text-white hover:border-slate-600",
        secondary:
          "bg-slate-800 text-slate-100 hover:bg-slate-700 border border-slate-700/50",
        ghost:
          "hover:bg-slate-800/80 text-slate-300 hover:text-white",
        link:
          "text-amber-400 underline-offset-4 hover:underline",
        mana:
          "bg-gradient-to-r from-amber-600 via-amber-500 to-amber-600 text-slate-950 font-bold hover:brightness-110 shadow-lg shadow-amber-500/25",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-8 rounded-md px-3 text-xs",
        lg: "h-11 rounded-lg px-6 text-base",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
