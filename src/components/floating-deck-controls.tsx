"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  SlidersHorizontal,
  FolderTree,
  AlignJustify,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  X,
  ChevronsUpDown,
  Layers,
} from "lucide-react";
import { SortField, SortDirection } from "@/lib/sorting";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface FloatingDeckControlsProps {
  // Sorting state
  sortField: SortField;
  sortDirection: SortDirection;
  onSortChange: (field: SortField, direction: SortDirection) => void;
  showStatusOption?: boolean;

  // Grouping state
  isGroupedByType: boolean;
  onGroupingToggle: (grouped: boolean) => void;
  onExpandAll?: () => void;
  onCollapseAll?: () => void;
  hasSections?: boolean;

  // Deck info
  totalCards?: number;
}

export function FloatingDeckControls({
  sortField,
  sortDirection,
  onSortChange,
  showStatusOption = false,
  isGroupedByType,
  onGroupingToggle,
  onExpandAll,
  onCollapseAll,
  hasSections = false,
  totalCards,
}: FloatingDeckControlsProps) {
  const [isOpen, setIsOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Close on click outside or Escape
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        isOpen &&
        panelRef.current &&
        !panelRef.current.contains(event.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  const sortOptions: Array<{ field: SortField; label: string }> = [
    { field: "name", label: "Nombre" },
    { field: "price_trend", label: "Precio" },
    { field: "price_subtotal", label: "Subtotal" },
    { field: "cmc", label: "Coste / CMC" },
    { field: "type", label: "Tipo" },
    { field: "quantity", label: "Cantidad" },
    ...(showStatusOption ? [{ field: "status" as SortField, label: "Estado" }] : []),
  ];

  const handleFieldClick = (field: SortField) => {
    if (sortField === field) {
      onSortChange(field, sortDirection === "asc" ? "desc" : "asc");
    } else {
      const defaultDesc = field.startsWith("price") || field === "quantity";
      onSortChange(field, defaultDesc ? "desc" : "asc");
    }
  };

  const currentSortLabel = sortOptions.find((o) => o.field === sortField)?.label || "Nombre";

  return (
    <div className="fixed bottom-6 right-6 z-40 flex flex-col items-end">
      {/* Floating Popover Panel */}
      {isOpen && (
        <div
          ref={panelRef}
          className="mb-3 w-80 sm:w-96 rounded-2xl border border-slate-700/80 bg-slate-900/95 p-4 backdrop-blur-xl shadow-2xl shadow-black/80 space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-200 text-slate-200"
        >
          {/* Header */}
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <SlidersHorizontal className="h-4 w-4 text-amber-400" />
              <span className="font-bold text-sm text-white">Organizar y Agrupar</span>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              title="Cerrar panel"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Section 1: Grouping */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <FolderTree className="h-3.5 w-3.5 text-amber-400" />
                Agrupación
              </span>
              {isGroupedByType && (
                <div className="flex items-center gap-1 text-[11px]">
                  {onExpandAll && (
                    <button
                      onClick={onExpandAll}
                      className="px-1.5 py-0.5 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                    >
                      Expandir todo
                    </button>
                  )}
                  {onCollapseAll && (
                    <button
                      onClick={onCollapseAll}
                      className="px-1.5 py-0.5 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                    >
                      Colapsar todo
                    </button>
                  )}
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-slate-950/80 border border-slate-800">
              <button
                type="button"
                onClick={() => onGroupingToggle(true)}
                className={`py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                  isGroupedByType
                    ? "bg-amber-500 text-slate-950 shadow-md shadow-amber-500/25 ring-1 ring-amber-400"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                <FolderTree className="h-4 w-4" />
                <span>Por Tipo</span>
              </button>

              <button
                type="button"
                onClick={() => onGroupingToggle(false)}
                className={`py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                  !isGroupedByType
                    ? "bg-slate-800 text-white shadow-sm ring-1 ring-slate-700"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                <AlignJustify className="h-4 w-4" />
                <span>Lista Continua</span>
              </button>
            </div>
          </div>

          {/* Section 2: Sorting */}
          <div className="space-y-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <ArrowUpDown className="h-3.5 w-3.5 text-amber-400" />
              Ordenar Cartas por
            </span>

            <div className="grid grid-cols-2 gap-1.5">
              {sortOptions.map((opt) => {
                const isActive = sortField === opt.field;
                return (
                  <button
                    key={opt.field}
                    onClick={() => handleFieldClick(opt.field)}
                    className={`flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold transition-all border ${
                      isActive
                        ? "bg-amber-500/20 text-amber-300 border-amber-500/60 shadow-sm"
                        : "bg-slate-950/60 text-slate-400 border-slate-800/80 hover:text-white hover:border-slate-700"
                    }`}
                  >
                    <span>{opt.label}</span>
                    {isActive && (
                      <span className="text-amber-400 font-bold ml-1">
                        {sortDirection === "asc" ? (
                          <ArrowUp className="h-3.5 w-3.5" />
                        ) : (
                          <ArrowDown className="h-3.5 w-3.5" />
                        )}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Main Floating Trigger Button */}
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex items-center gap-2.5 px-4 py-3 rounded-full bg-slate-900/95 border border-amber-500/50 text-white shadow-2xl shadow-black/80 hover:border-amber-400 hover:shadow-amber-500/20 hover:scale-105 active:scale-95 transition-all backdrop-blur-md group"
        title="Opciones flotantes para ordenar y agrupar cartas"
      >
        <div className="p-1 rounded-full bg-amber-500/20 text-amber-400 group-hover:bg-amber-500 group-hover:text-slate-950 transition-colors">
          <SlidersHorizontal className="h-4 w-4" />
        </div>
        <div className="flex flex-col items-start text-left leading-none">
          <span className="text-xs font-extrabold tracking-wide text-slate-100">
            Vista & Orden
          </span>
          <span className="text-[10px] text-amber-300 font-mono mt-1">
            {isGroupedByType ? "Agrupado" : "Lista"} • {currentSortLabel} {sortDirection === "asc" ? "↑" : "↓"}
          </span>
        </div>
      </button>
    </div>
  );
}
