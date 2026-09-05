import { Layers, Sparkles, CheckCircle2, AlertCircle } from "lucide-react";
import { getDecksWithCompletion } from "@/actions/decks";
import { CreateDeckDialog } from "@/components/create-deck-dialog";
import { ImportDeckDialog } from "@/components/import-deck-dialog";
import { DeckCardItem } from "@/components/deck-card-item";

export const dynamic = "force-dynamic";

export default async function DecksPage() {
  const decks = await getDecksWithCompletion();

  const totalDecks = decks.length;
  const completedDecks = decks.filter(
    (d) => d.totalCards > 0 && d.missingCardsCount === 0
  ).length;
  const totalCardsInDecks = decks.reduce((sum, d) => sum + d.totalCards, 0);
  const avgCompletion =
    totalDecks > 0
      ? Math.round(
          (decks.reduce((sum, d) => sum + d.completionPercentage, 0) /
            totalDecks) *
            10
        ) / 10
      : 0;

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      {/* Header section */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-8 border-b border-slate-800/80">
        <div>
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-amber-400" />
            <h1 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
              Mis Mazos de Magic
            </h1>
          </div>
          <p className="mt-1 text-sm text-slate-400">
            Gestiona tus listas de barajas, supervisa su completitud contra tu inventario y detecta qué cartas te faltan.
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <ImportDeckDialog />
          <CreateDeckDialog />
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 my-8">
        <div className="p-4 rounded-xl border border-slate-800/80 bg-slate-900/40 backdrop-blur-md">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Total de Mazos</p>
          <p className="text-2xl font-black text-slate-100 font-mono mt-1">{totalDecks}</p>
        </div>

        <div className="p-4 rounded-xl border border-slate-800/80 bg-slate-900/40 backdrop-blur-md">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Mazos Completados</p>
          <div className="flex items-center gap-2 mt-1">
            <p className="text-2xl font-black text-emerald-400 font-mono">{completedDecks}</p>
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
          </div>
        </div>

        <div className="p-4 rounded-xl border border-slate-800/80 bg-slate-900/40 backdrop-blur-md">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Completitud Media</p>
          <p className="text-2xl font-black text-amber-300 font-mono mt-1">{avgCompletion}%</p>
        </div>

        <div className="p-4 rounded-xl border border-slate-800/80 bg-slate-900/40 backdrop-blur-md">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Cartas Requeridas</p>
          <p className="text-2xl font-black text-sky-400 font-mono mt-1">{totalCardsInDecks}</p>
        </div>
      </div>

      {/* Decks Grid */}
      {decks.length === 0 ? (
        <div className="text-center py-20 px-4 rounded-2xl border border-dashed border-slate-800 bg-slate-900/20 max-w-2xl mx-auto my-6">
          <div className="h-16 w-16 mx-auto rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 mb-4">
            <Layers className="h-8 w-8" />
          </div>
          <h2 className="text-xl font-bold text-slate-200">Aún no tienes ningún mazo creado</h2>
          <p className="text-sm text-slate-400 mt-2 max-w-md mx-auto">
            Crea tu primer mazo (Commander, Modern, Standard, etc.) y añade cartas oficiales desde Scryfall para calcular automáticamente tu porcentaje de posesión.
          </p>
          <div className="mt-6 flex items-center justify-center gap-3 flex-wrap">
            <ImportDeckDialog />
            <CreateDeckDialog />
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {decks.map((deck) => (
            <DeckCardItem key={deck.id} deck={deck} />
          ))}
        </div>
      )}
    </div>
  );
}
