import React from "react";
import { cn } from "@/lib/utils";

interface ManaCostProps {
  manaCost?: string | null;
  className?: string;
}

export function ManaCost({ manaCost, className }: ManaCostProps) {
  if (!manaCost) return null;

  // Extract all symbols like {3}, {W}, {U}, {B}, {R}, {G}, {W/P}, etc.
  const symbols = manaCost.match(/\{([^}]+)\}/g) || [];

  const getSymbolStyle = (sym: string) => {
    const clean = sym.replace(/[{}]/g, "").toUpperCase();

    switch (clean) {
      case "W":
        return "bg-amber-100 text-amber-900 border-amber-300 font-black";
      case "U":
        return "bg-sky-500 text-slate-950 border-sky-300 font-black";
      case "B":
        return "bg-purple-900 text-purple-100 border-purple-700 font-black";
      case "R":
        return "bg-rose-600 text-white border-rose-400 font-black";
      case "G":
        return "bg-emerald-600 text-emerald-950 border-emerald-400 font-black";
      case "C":
        return "bg-slate-500 text-slate-950 border-slate-400 font-black";
      default:
        // Numeric or generic mana {1}, {2}, {X}, etc.
        return "bg-slate-700 text-slate-200 border-slate-600 font-bold";
    }
  };

  return (
    <div className={cn("inline-flex items-center gap-1 flex-wrap", className)}>
      {symbols.map((sym, idx) => {
        const text = sym.replace(/[{}]/g, "");
        return (
          <span
            key={idx}
            className={cn(
              "inline-flex items-center justify-center h-5 min-w-[20px] px-1 rounded-full text-[11px] border shadow-xs leading-none select-none",
              getSymbolStyle(sym)
            )}
            title={`Mana: ${text}`}
          >
            {text}
          </span>
        );
      })}
    </div>
  );
}
