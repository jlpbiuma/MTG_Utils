"use client";

import React from "react";
import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { SortField, SortDirection } from "@/lib/sorting";
import { Button } from "@/components/ui/button";

interface CardSortingBarProps {
  currentField: SortField;
  currentDirection: SortDirection;
  onSortChange: (field: SortField, direction: SortDirection) => void;
  showStatusOption?: boolean;
}

export function CardSortingBar({
  currentField,
  currentDirection,
  onSortChange,
  showStatusOption = false,
}: CardSortingBarProps) {
  const sortOptions: Array<{ field: SortField; label: string }> = [
    { field: "name", label: "Nombre" },
    { field: "price_trend", label: "Precio (Unitario)" },
    { field: "price_subtotal", label: "Precio (Subtotal)" },
    { field: "cmc", label: "Coste / CMC" },
    { field: "type", label: "Tipo" },
    { field: "quantity", label: "Cantidad" },
    ...(showStatusOption ? [{ field: "status" as SortField, label: "Estado / Asignación" }] : []),
  ];

  const handleFieldClick = (field: SortField) => {
    if (currentField === field) {
      // Toggle direction
      onSortChange(field, currentDirection === "asc" ? "desc" : "asc");
    } else {
      // Default to asc for name/cmc/type, desc for price/quantity
      const defaultDesc = field.startsWith("price") || field === "quantity";
      onSortChange(field, defaultDesc ? "desc" : "asc");
    }
  };

  return (
    <div className="flex items-center gap-1.5 flex-wrap text-xs text-slate-400 py-2">
      <span className="flex items-center gap-1 text-slate-400 font-medium mr-1">
        <ArrowUpDown className="h-3.5 w-3.5 text-amber-400" />
        Ordenar por:
      </span>

      <div className="flex items-center gap-1 flex-wrap">
        {sortOptions.map((opt) => {
          const isActive = currentField === opt.field;
          return (
            <button
              key={opt.field}
              onClick={() => handleFieldClick(opt.field)}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md transition-all font-medium border text-xs ${
                isActive
                  ? "bg-amber-500/20 text-amber-300 border-amber-500/50 shadow-sm shadow-amber-500/10"
                  : "bg-slate-900/60 text-slate-400 border-slate-800 hover:text-slate-200 hover:border-slate-700"
              }`}
            >
              <span>{opt.label}</span>
              {isActive && (
                <span className="text-amber-400 font-bold">
                  {currentDirection === "asc" ? (
                    <ArrowUp className="h-3 w-3" />
                  ) : (
                    <ArrowDown className="h-3 w-3" />
                  )}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
