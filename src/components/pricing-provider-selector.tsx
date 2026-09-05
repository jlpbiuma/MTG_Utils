"use client";

import { useState } from "react";
import { RefreshCw, Coins, ShoppingCart, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PriceProvider, PriceSummary, PRICE_PROVIDERS } from "@/lib/pricing";

interface PricingProviderSelectorProps {
  currentProvider: PriceProvider;
  onProviderChange: (provider: PriceProvider) => void;
  onRefreshPrices: () => Promise<void>;
  summary?: PriceSummary | null;
  isLoading?: boolean;
  showMissingNetValue?: boolean;
  className?: string;
}

export function PricingProviderSelector({
  currentProvider,
  onProviderChange,
  onRefreshPrices,
  summary,
  isLoading = false,
  showMissingNetValue = true,
  className = "",
}: PricingProviderSelectorProps) {
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await onRefreshPrices();
    } finally {
      setRefreshing(false);
    }
  };

  const currencySymbol = summary?.currencySymbol ?? PRICE_PROVIDERS[currentProvider]?.currencySymbol ?? "€";

  return (
    <div className={`p-4 rounded-xl border border-slate-800/80 bg-slate-900/50 backdrop-blur-md ${className}`}>
      {/* Top row: Provider Selector & Refresh button */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-slate-800/60">
        <div className="flex items-center gap-2">
          <Coins className="h-4 w-4 text-amber-400" />
          <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">Mercado y Precios:</span>
          <div className="flex items-center gap-1 bg-slate-950/60 p-1 rounded-lg border border-slate-800">
            {(Object.keys(PRICE_PROVIDERS) as PriceProvider[]).map((p) => {
              const conf = PRICE_PROVIDERS[p];
              const active = currentProvider === p;
              return (
                <button
                  key={p}
                  onClick={() => onProviderChange(p)}
                  className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all ${
                    active
                      ? "bg-amber-500 text-slate-950 shadow-sm"
                      : "text-slate-400 hover:text-white hover:bg-slate-800/60"
                  }`}
                >
                  {conf.logoText} ({conf.currencySymbol})
                </button>
              );
            })}
          </div>
        </div>

        <Button
          variant="outline"
          size="sm"
          disabled={isLoading || refreshing}
          onClick={handleRefresh}
          className="h-8 text-xs border-slate-700 bg-slate-900/80 hover:bg-slate-800 text-slate-200 gap-1.5"
        >
          <RefreshCw className={`h-3.5 w-3.5 text-amber-400 ${refreshing || isLoading ? "animate-spin" : ""}`} />
          <span>Actualizar Precios</span>
        </Button>
      </div>

      {/* Bottom row: Net Value KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 pt-3">
        {/* Total Net Value */}
        <div className="flex flex-col">
          <span className="text-[11px] font-medium text-slate-400">Precio Neto Total ({PRICE_PROVIDERS[currentProvider]?.name})</span>
          <div className="flex items-baseline gap-1 mt-0.5">
            <span className="text-xl font-black font-mono text-amber-400">
              {summary ? summary.totalNetValue.toFixed(2) : "..."}
            </span>
            <span className="text-xs font-mono text-amber-500">{currencySymbol}</span>
          </div>
        </div>

        {/* Missing Cards Value (Cost to finish deck) */}
        {showMissingNetValue && (
          <div className="flex flex-col">
            <span className="text-[11px] font-medium text-slate-400 flex items-center gap-1">
              <ShoppingCart className="h-3 w-3 text-rose-400" />
              Coste Faltantes (Completar Mazo)
            </span>
            <div className="flex items-baseline gap-1 mt-0.5">
              <span className="text-xl font-black font-mono text-rose-400">
                {summary ? (summary.totalMissingValue ?? 0).toFixed(2) : "..."}
              </span>
              <span className="text-xs font-mono text-rose-500">{currencySymbol}</span>
            </div>
          </div>
        )}

        {/* Owned Value in Physical Collection */}
        <div className="flex flex-col">
          <span className="text-[11px] font-medium text-slate-400 flex items-center gap-1">
            <CheckCircle2 className="h-3 w-3 text-emerald-400" />
            Valor en Posesión
          </span>
          <div className="flex items-baseline gap-1 mt-0.5">
            <span className="text-xl font-black font-mono text-emerald-400">
              {summary ? (summary.totalOwnedValue ?? 0).toFixed(2) : "..."}
            </span>
            <span className="text-xs font-mono text-emerald-500">{currencySymbol}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
