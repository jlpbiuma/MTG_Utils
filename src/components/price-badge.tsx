"use client";

import { ExternalLink, TrendingUp, ArrowDown, ArrowUp } from "lucide-react";
import { CardPriceQuote } from "@/lib/pricing";

interface PriceBadgeProps {
  quote?: CardPriceQuote;
  showSubtotal?: boolean;
  className?: string;
}

export function PriceBadge({ quote, showSubtotal = true, className = "" }: PriceBadgeProps) {
  if (!quote) {
    return (
      <div className={`inline-flex items-center gap-1 text-[11px] font-mono text-slate-500 ${className}`}>
        <span>...</span>
      </div>
    );
  }

  const { unitPrice, currencySymbol, subtotal, purchaseUrl, provider } = quote;

  return (
    <div className={`flex flex-col items-end gap-0.5 ${className}`}>
      {/* Unit price with trend, min, max breakdown */}
      <div className="flex items-center gap-1.5 flex-wrap justify-end">
        {/* Trend price */}
        <div
          title={`Precio de Tendencia: ${unitPrice.trend.toFixed(2)} ${currencySymbol}`}
          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/20 text-amber-300 font-mono text-xs font-semibold"
        >
          <TrendingUp className="h-3 w-3 text-amber-400" />
          <span>
            {unitPrice.trend.toFixed(2)} {currencySymbol}
          </span>
        </div>

        {/* Min / Max compact pill */}
        <div
          title={`Mínimo: ${unitPrice.min.toFixed(2)} ${currencySymbol} | Máximo: ${unitPrice.max.toFixed(2)} ${currencySymbol}`}
          className="hidden sm:inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-800/80 border border-slate-700/60 text-slate-400 font-mono text-[10px]"
        >
          <span className="flex items-center text-emerald-400">
            <ArrowDown className="h-2.5 w-2.5" />
            {unitPrice.min.toFixed(2)}
          </span>
          <span className="text-slate-600">/</span>
          <span className="flex items-center text-rose-400">
            <ArrowUp className="h-2.5 w-2.5" />
            {unitPrice.max.toFixed(2)}
          </span>
        </div>

        {/* Store link */}
        {purchaseUrl && (
          <a
            href={purchaseUrl}
            target="_blank"
            rel="noopener noreferrer"
            title={`Ver en ${provider === "cardmarket" ? "Cardmarket" : provider === "cardtrader" ? "Card Trader" : "MTGGoldfish"}`}
            className="p-1 rounded text-slate-400 hover:text-amber-400 hover:bg-slate-800 transition-colors"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}
      </div>

      {/* Subtotal if quantity > 1 */}
      {showSubtotal && quote.quantity > 1 && (
        <span className="text-[10px] font-mono text-slate-400">
          Subtotal: <strong className="text-slate-200">{subtotal.toFixed(2)} {currencySymbol}</strong>
        </span>
      )}
    </div>
  );
}
