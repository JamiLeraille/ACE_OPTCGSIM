import type { CardWithVariants } from '@op/shared';
import { CardImage } from './CardImage';

// Détail d'une carte : image grande, effet, et SÉLECTEUR DE VARIANTE VISUELLE.
// Le choix d'art ne change jamais l'identité de jeu.

export function CardModal({
  card,
  selectedVariantId,
  onSelectVariant,
  onAdd,
  onRemove,
  onSetLeader,
  quantity,
  onClose,
}: {
  card: CardWithVariants;
  selectedVariantId: string;
  onSelectVariant: (variantId: string) => void;
  onAdd: () => void;
  onRemove: () => void;
  onSetLeader: () => void;
  quantity: number;
  onClose: () => void;
}) {
  const selected = card.variants.find((v) => v.id === selectedVariantId) ?? card.variants[0];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-3xl gap-5 overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-64 shrink-0">
          <CardImage
            variantId={selected?.id ?? card.id}
            alt={card.name}
            className="aspect-[480/671] w-full"
          />
          {card.variants.length > 1 && (
            <div className="mt-3">
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Version visuelle ({card.variants.length})
              </p>
              <div className="grid grid-cols-4 gap-1.5">
                {card.variants.map((v) => (
                  <button
                    key={v.id}
                    onClick={() => onSelectVariant(v.id)}
                    title={`${v.variantType} · ${v.rarity}`}
                    className={`overflow-hidden rounded-md ring-2 transition ${
                      v.id === selected?.id
                        ? 'ring-sky-500'
                        : 'ring-transparent hover:ring-slate-600'
                    }`}
                  >
                    <CardImage variantId={v.id} alt={v.id} className="aspect-[480/671]" />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h2 className="text-xl font-semibold text-white">{card.name}</h2>
              <p className="text-sm text-slate-400">
                {card.id} · {card.category} · {card.colors.join('/')}
                {selected ? ` · ${selected.rarity}` : ''}
              </p>
            </div>
            <button
              onClick={onClose}
              className="rounded-md bg-slate-800 px-2.5 py-1 text-sm text-slate-300 hover:bg-slate-700"
            >
              ✕
            </button>
          </div>

          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
            {card.cost !== null && <Fact label="Coût" value={card.cost} />}
            {card.life !== null && <Fact label="Life" value={card.life} />}
            {card.power !== null && <Fact label="Power" value={card.power} />}
            <Fact label="Counter" value={card.counter ?? '—'} />
            {card.attribute.length > 0 && (
              <Fact label="Attribut" value={card.attribute.join('/')} />
            )}
            <Fact label="Types" value={card.types.join(' / ') || '—'} />
          </dl>

          {card.effectText && (
            <p className="mt-4 whitespace-pre-wrap rounded-lg bg-slate-950 p-3 text-sm leading-relaxed text-slate-200">
              {card.effectText}
            </p>
          )}
          {card.triggerText && (
            <p className="mt-2 rounded-lg bg-amber-950/40 p-3 text-sm text-amber-200">
              {card.triggerText}
            </p>
          )}

          <div className="mt-5 flex items-center gap-2">
            {card.category === 'LEADER' ? (
              <button
                onClick={onSetLeader}
                className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-500"
              >
                Choisir comme leader
              </button>
            ) : card.category === 'DON' ? (
              <p className="text-sm text-slate-500">Les cartes DON!! ne vont pas dans le deck.</p>
            ) : (
              <>
                <button
                  onClick={onRemove}
                  disabled={quantity === 0}
                  className="rounded-lg bg-slate-800 px-3 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-700 disabled:opacity-40"
                >
                  −
                </button>
                <span className="w-10 text-center text-sm font-semibold text-white">
                  {quantity}/4
                </span>
                <button
                  onClick={onAdd}
                  disabled={quantity >= 4}
                  className="rounded-lg bg-sky-600 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-500 disabled:opacity-40"
                >
                  +
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="text-slate-200">{value}</dd>
    </div>
  );
}
