import type { CardWithVariants } from '@op/shared';
import { useEffect, useRef, useState } from 'react';
import { CardImage } from './CardImage';

// Grille virtualisée maison : seules les rangées visibles (+ marge) sont montées,
// pour un catalogue de milliers de cartes. Images lazy via le proxy.

const CARD_RATIO = 671 / 480;
const GAP = 12;
const MIN_CARD_WIDTH = 150;
const OVERSCAN_ROWS = 2;

export function CardGrid({
  cards,
  onInspect,
  onAdd,
  quantityOf,
}: {
  cards: CardWithVariants[];
  onInspect: (card: CardWithVariants) => void;
  onAdd: (card: CardWithVariants) => void;
  quantityOf: (cardId: string) => number;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState({ columns: 4, cardWidth: MIN_CARD_WIDTH, viewport: 600 });
  const [scrollTop, setScrollTop] = useState(0);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const measure = () => {
      const width = el.clientWidth - GAP;
      const columns = Math.max(2, Math.floor(width / (MIN_CARD_WIDTH + GAP)));
      setLayout({
        columns,
        cardWidth: Math.floor(width / columns) - GAP,
        viewport: el.clientHeight,
      });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Revenir en haut quand la liste filtrée change
  useEffect(() => {
    scrollerRef.current?.scrollTo({ top: 0 });
    setScrollTop(0);
  }, [cards]);

  const { columns, cardWidth, viewport } = layout;
  const rowHeight = Math.round(cardWidth * CARD_RATIO) + 40 + GAP;
  const rowCount = Math.ceil(cards.length / columns);
  const firstRow = Math.max(0, Math.floor(scrollTop / rowHeight) - OVERSCAN_ROWS);
  const lastRow = Math.min(
    rowCount - 1,
    Math.ceil((scrollTop + viewport) / rowHeight) + OVERSCAN_ROWS,
  );

  const rows: number[] = [];
  for (let r = firstRow; r <= lastRow; r++) rows.push(r);

  return (
    <div
      ref={scrollerRef}
      onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
      className="h-full overflow-y-auto pr-1"
    >
      <div style={{ height: rowCount * rowHeight, position: 'relative' }}>
        {rows.map((rowIndex) => (
          <div
            key={rowIndex}
            className="absolute left-0 flex w-full gap-3"
            style={{ top: rowIndex * rowHeight, height: rowHeight - GAP }}
          >
            {cards.slice(rowIndex * columns, rowIndex * columns + columns).map((card) => {
              const qty = quantityOf(card.id);
              return (
                <div key={card.id} style={{ width: cardWidth }} className="group relative">
                  <button onClick={() => onInspect(card)} className="block w-full text-left">
                    <CardImage
                      variantId={card.variants[0]?.id ?? card.id}
                      alt={card.name}
                      className="aspect-[480/671] w-full"
                    />
                  </button>
                  <div className="mt-1 flex items-center justify-between gap-1">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium text-slate-200">{card.name}</p>
                      <p className="text-[10px] text-slate-500">
                        {card.id}
                        {card.variants.length > 1 ? ` · ${card.variants.length} arts` : ''}
                      </p>
                    </div>
                    <button
                      onClick={() => onAdd(card)}
                      title="Ajouter au deck"
                      className="rounded-md bg-slate-800 px-2 py-1 text-xs font-semibold text-slate-200 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-sky-600"
                    >
                      +
                    </button>
                  </div>
                  {qty > 0 && (
                    <span className="absolute right-1.5 top-1.5 rounded-full bg-sky-600 px-2 py-0.5 text-xs font-bold text-white shadow">
                      ×{qty}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
      {cards.length === 0 && (
        <p className="py-16 text-center text-sm text-slate-500">
          Aucune carte ne correspond aux filtres.
        </p>
      )}
    </div>
  );
}
