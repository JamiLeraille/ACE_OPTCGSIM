import { cardIdFromVariantId, toSimText, type CardWithVariants } from '@op/shared';
import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { fetchCatalog, fetchSharedDeck, type SharedDeck } from '../api';
import { CardImage } from '../components/CardImage';

// Page de deck partageable : URL publique qui rend le deck avec les images
// des variantes CHOISIES (l'art voyage dans le lien, contrairement au texte Sim).

export function DeckPage() {
  const { id } = useParams<{ id: string }>();
  const [deck, setDeck] = useState<SharedDeck | null>(null);
  const [catalog, setCatalog] = useState<CardWithVariants[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!id) return;
    Promise.all([fetchSharedDeck(id), fetchCatalog()]).then(
      ([d, c]) => {
        setDeck(d);
        setCatalog(c);
      },
      (err: Error) => setError(err.message),
    );
  }, [id]);

  const byCardId = useMemo(() => new Map((catalog ?? []).map((c) => [c.id, c])), [catalog]);

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <p className="text-sm text-red-300">{error}</p>
        <Link to="/" className="text-sm text-sky-400 underline">
          ← Retour au deck-builder
        </Link>
      </div>
    );
  }
  if (!deck || !catalog) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-slate-500">
        Chargement du deck…
      </div>
    );
  }

  const leaderCard = byCardId.get(cardIdFromVariantId(deck.leaderVariantId));
  const total = deck.cards.reduce((s, c) => s + c.quantity, 0);

  const simText = toSimText({
    format: 'optcg-deck',
    version: 1,
    meta: { name: deck.name },
    leader: { id: cardIdFromVariantId(deck.leaderVariantId), art: 'base' },
    cards: deck.cards.map((c) => ({ id: c.cardId, qty: c.quantity, art: 'base' })),
  });

  const entries = deck.cards
    .map((entry) => ({ entry, card: byCardId.get(entry.cardId) }))
    .filter((x): x is { entry: (typeof x)['entry']; card: CardWithVariants } => Boolean(x.card))
    .sort((a, b) => (a.card.cost ?? 0) - (b.card.cost ?? 0) || a.card.id.localeCompare(b.card.id));

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-5 flex flex-wrap items-center gap-4">
        {leaderCard && (
          <CardImage
            variantId={deck.leaderVariantId}
            alt={leaderCard.name}
            className="w-32 aspect-[480/671]"
          />
        )}
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold text-white">{deck.name}</h1>
          {leaderCard && (
            <p className="text-sm text-slate-400">
              Leader : {leaderCard.name} ({leaderCard.id}) · {leaderCard.colors.join('/')} · {total}{' '}
              cartes
            </p>
          )}
          <div className="mt-3 flex gap-2">
            <button
              onClick={() => {
                void navigator.clipboard.writeText(simText);
                setCopied(true);
              }}
              className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-700"
            >
              {copied ? 'Copié ✓' : 'Copier le texte OPTCG Sim'}
            </button>
            <Link
              to="/"
              className="rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-500"
            >
              Ouvrir le deck-builder
            </Link>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-7">
        {entries.map(({ entry, card }) => (
          <div key={entry.cardId} className="relative">
            <CardImage variantId={entry.variantId} alt={card.name} className="aspect-[480/671]" />
            <span className="absolute right-1 top-1 rounded-full bg-sky-600 px-1.5 py-0.5 text-xs font-bold text-white shadow">
              ×{entry.quantity}
            </span>
            <p className="mt-1 truncate text-[10px] text-slate-400">{card.name}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
