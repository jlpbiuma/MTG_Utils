"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Library,
  Search,
  Plus,
  Minus,
  Trash2,
  Sparkles,
  Layers,
  Image as ImageIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ManaCost } from "@/components/mana-cost";
import { CardPreviewHover } from "@/components/card-preview-hover";
import { CardSearchDialog } from "@/components/card-search-dialog";
import { ImportCollectionDialog } from "@/components/import-collection-dialog";
import {
  addOrIncrementCard,
  updateCollectionQuantity,
  deleteCollectionCard,
} from "@/actions/collection";
import { PriceProvider, PriceSummary } from "@/lib/pricing";
import { PricingProviderSelector } from "@/components/pricing-provider-selector";
import { PriceBadge } from "@/components/price-badge";
import { normalizeCardName } from "@/lib/worker";

interface CollectionItem {
  id: string;
  userId: string;
  cardScryfallId: string;
  cardName: string;
  quantity: number;
  setCode?: string | null;
  collectorNumber?: string | null;
  manaCost?: string | null;
  typeLine?: string | null;
  imageUri?: string | null;
}

interface CollectionViewProps {
  initialCards: CollectionItem[];
  initialStats: { uniqueCards: number; totalCards: number };
}

export function CollectionView({ initialCards, initialStats }: CollectionViewProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  // Dynamic pricing state
  const [priceProvider, setPriceProvider] = useState<PriceProvider>("cardmarket");
  const [priceSummary, setPriceSummary] = useState<PriceSummary | null>(null);
  const [isLoadingPrices, setIsLoadingPrices] = useState(false);

  const loadPrices = useCallback(
    async (providerToLoad = priceProvider, bypassCache = false) => {
      setIsLoadingPrices(true);
      try {
        const res = await fetch("/api/prices", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "collection",
            provider: providerToLoad,
            bypassCache,
          }),
        });
        if (res.ok) {
          const json = await res.json();
          if (json.summary) {
            setPriceSummary(json.summary);
          }
        }
      } catch (err) {
        console.error("Failed to load collection prices:", err);
      } finally {
        setIsLoadingPrices(false);
      }
    },
    [priceProvider]
  );

  useEffect(() => {
    loadPrices(priceProvider, false);
  }, [priceProvider, loadPrices]);

  const filteredCards = initialCards.filter((c) =>
    c.cardName.toLowerCase().includes(searchQuery.toLowerCase().trim())
  );

  const handleAddCard = async (cardData: {
    cardScryfallId: string;
    cardName: string;
    quantity: number;
    manaCost?: string | null;
    typeLine?: string | null;
    imageUri?: string | null;
  }) => {
    await addOrIncrementCard({
      cardScryfallId: cardData.cardScryfallId,
      cardName: cardData.cardName,
      quantity: cardData.quantity,
      manaCost: cardData.manaCost,
      typeLine: cardData.typeLine,
      imageUri: cardData.imageUri,
    });
  };

  const handleUpdateQty = async (cardId: string, currentQty: number, delta: number) => {
    setBusyId(cardId);
    try {
      await updateCollectionQuantity(cardId, currentQty + delta);
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (cardId: string, cardName: string) => {
    if (!confirm(`¿Eliminar "${cardName}" de tu colección física?`)) return;
    setBusyId(cardId);
    try {
      await deleteCollectionCard(cardId);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl space-y-8">
      {/* Header section */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-8 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-sky-400" />
            <h1 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
              Mi Colección de Cartas
            </h1>
          </div>
          <p className="mt-1 text-sm text-slate-400">
            Registra tu inventario de cartas físicas para contrastarlo contra tus mazos y saber qué cartas te faltan.
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <ImportCollectionDialog />
          <CardSearchDialog
            onAddCard={handleAddCard}
            title="Añadir a mi Colección"
            triggerText="Añadir Cartas a Colección"
          />
        </div>
      </div>

      {/* KPI Stats */}
      <div className="grid grid-cols-2 gap-4">
        <div className="p-4 rounded-xl border border-slate-800/80 bg-slate-900/40 backdrop-blur-md">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Cartas Únicas</p>
          <p className="text-3xl font-black text-sky-300 font-mono mt-1">
            {initialStats.uniqueCards}
          </p>
        </div>

        <div className="p-4 rounded-xl border border-slate-800/80 bg-slate-900/40 backdrop-blur-md">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Total Copias Físicas</p>
          <p className="text-3xl font-black text-amber-300 font-mono mt-1">
            {initialStats.totalCards}
          </p>
        </div>
      </div>

      {/* Dynamic Pricing Selector & Total Collection Value */}
      <PricingProviderSelector
        currentProvider={priceProvider}
        onProviderChange={(p) => setPriceProvider(p)}
        onRefreshPrices={() => loadPrices(priceProvider, true)}
        summary={priceSummary}
        isLoading={isLoadingPrices}
        showMissingNetValue={false}
      />

      {/* Search and Filters */}
      <div className="relative">
        <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
        <Input
          placeholder="Filtrar cartas de tu colección por nombre..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9 h-11 bg-slate-900/80 text-base border-slate-800"
        />
      </div>

      {/* Card Grid / List */}
      {filteredCards.length === 0 ? (
        <div className="text-center py-20 px-4 rounded-2xl border border-dashed border-slate-800 bg-slate-900/20 max-w-xl mx-auto">
          <div className="h-16 w-16 mx-auto rounded-2xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400 mb-4">
            <Library className="h-8 w-8" />
          </div>
          <h2 className="text-xl font-bold text-slate-200">
            {searchQuery ? "Sin resultados para tu búsqueda" : "Tu colección está vacía"}
          </h2>
          <p className="text-sm text-slate-400 mt-2">
            {searchQuery
              ? "Prueba buscando con otro término."
              : "Busca cartas en la base de datos de Scryfall e introduce el número de copias que tienes."}
          </p>
          {!searchQuery && (
            <div className="mt-6 flex items-center justify-center gap-3 flex-wrap">
              <ImportCollectionDialog />
              <CardSearchDialog
                onAddCard={handleAddCard}
                title="Añadir a mi Colección"
                triggerText="Añadir primera carta"
              />
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {filteredCards.map((card) => {
            const isBusy = busyId === card.id;

            return (
              <div
                key={card.id}
                className="group relative rounded-xl border border-slate-800/80 bg-slate-900/50 hover:border-slate-700 transition-all p-3 flex flex-col justify-between shadow-md hover:shadow-xl hover:shadow-sky-500/5"
              >
                <div>
                  <div className="relative aspect-[5/7] rounded-lg overflow-hidden bg-slate-950 border border-slate-800 mb-3 foil-card-effect">
                    {card.imageUri ? (
                      <img
                        src={card.imageUri}
                        alt={card.cardName}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center text-slate-600">
                        <ImageIcon className="h-8 w-8 mb-1" />
                        <span className="text-xs">Sin imagen</span>
                      </div>
                    )}

                    <div className="absolute top-2 right-2">
                      <span className="bg-slate-950/90 text-amber-300 font-mono font-black text-xs px-2 py-0.5 rounded-full border border-amber-500/40 shadow-lg">
                        x{card.quantity}
                      </span>
                    </div>
                  </div>

                  <CardPreviewHover
                    cardName={card.cardName}
                    imageUri={card.imageUri}
                  >
                    <h3 className="font-bold text-sm text-slate-100 group-hover:text-amber-300 transition-colors line-clamp-1 cursor-pointer">
                      {card.cardName}
                    </h3>
                  </CardPreviewHover>

                  <div className="flex items-center justify-between mt-1 text-xs">
                    <span className="text-slate-400 truncate max-w-[120px]">
                      {card.typeLine || "Card"}
                    </span>
                    <ManaCost manaCost={card.manaCost} />
                  </div>

                  {/* Price breakdown badge */}
                  <div className="mt-3 pt-2 border-t border-slate-800/40 flex items-center justify-between">
                    <span className="text-[10px] text-slate-400 font-medium">Cotización:</span>
                    <PriceBadge
                      quote={
                        priceSummary?.quotes[card.cardScryfallId] ||
                        priceSummary?.quotes[normalizeCardName(card.cardName)]
                      }
                      showSubtotal={card.quantity > 1}
                    />
                  </div>
                </div>

                {/* Quantity Controls & Delete */}
                <div className="flex items-center justify-between pt-3 mt-3 border-t border-slate-800/80">
                  <div className="flex items-center bg-slate-950 border border-slate-800 rounded-lg p-0.5">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6 text-slate-400 hover:text-white"
                      disabled={isBusy}
                      onClick={() => handleUpdateQty(card.id, card.quantity, -1)}
                    >
                      <Minus className="h-3 w-3" />
                    </Button>

                    <span className="font-mono font-bold text-xs px-2 text-slate-200">
                      {card.quantity}
                    </span>

                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6 text-slate-400 hover:text-white"
                      disabled={isBusy}
                      onClick={() => handleUpdateQty(card.id, card.quantity, 1)}
                    >
                      <Plus className="h-3 w-3" />
                    </Button>
                  </div>

                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-slate-500 hover:text-rose-400 hover:bg-rose-950/30"
                    disabled={isBusy}
                    onClick={() => handleDelete(card.id, card.cardName)}
                    title="Eliminar de colección"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
