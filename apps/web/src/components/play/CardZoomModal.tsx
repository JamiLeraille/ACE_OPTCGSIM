import type { CardInstance, CardWithVariants } from '@op/shared';
import { CardImage } from '../CardImage';
import { CardBack } from './PlayCard';

// Carte agrandie au clic. `visible` applique la règle de visibilité du joueur
// qui regarde (une carte cachée s'affiche dos visible, sans infos). Les
// actions portées ici incluent l'AUTOPAY : jouer une carte repose
// automatiquement autant de DON!! que son coût.

export interface ZoomAction {
  label: string;
  run: () => void;
  disabled?: boolean;
  hint?: string;
  variant?: 'primary' | 'danger' | 'ghost';
}

const VARIANT_CLASSES: Record<NonNullable<ZoomAction['variant']>, string> = {
  primary: 'bg-amber-600 text-white hover:bg-amber-500',
  danger: 'bg-red-800 text-white hover:bg-red-700',
  ghost: 'bg-stone-800 text-stone-300 hover:bg-stone-700',
};

export function CardZoomModal({
  card,
  visible,
  info,
  actions,
  onClose,
}: {
  card: CardInstance;
  visible: boolean;
  info: CardWithVariants | undefined;
  actions: ZoomAction[];
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
      onClick={onClose}
    >
      <div
        className="plank flex max-h-[92vh] w-full max-w-2xl gap-5 overflow-y-auto rounded-2xl p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-64 shrink-0">
          {visible ? (
            <CardImage
              variantId={card.variantId}
              alt={card.cardId}
              className="aspect-[480/671] w-full"
            />
          ) : (
            <CardBack className="aspect-[480/671] w-full" />
          )}
          {card.attachedDon > 0 && (
            <p className="mt-2 text-center text-xs font-bold text-violet-300">
              +{card.attachedDon} DON!! attaché(s) (+{card.attachedDon * 1000} power)
            </p>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div>
              {visible && info ? (
                <>
                  <h2 className="text-xl font-semibold text-amber-100">{info.name}</h2>
                  <p className="text-sm text-stone-400">
                    {info.id} · {info.category} · {info.colors.join('/')}
                  </p>
                </>
              ) : (
                <h2 className="text-xl font-semibold text-amber-100">Carte cachée</h2>
              )}
            </div>
            <button
              onClick={onClose}
              className="rounded-md bg-stone-800 px-2.5 py-1 text-sm text-stone-300 hover:bg-stone-700"
            >
              ✕
            </button>
          </div>

          {visible && info && (
            <>
              <dl className="mt-3 grid grid-cols-3 gap-x-4 gap-y-1 text-sm">
                {info.cost !== null && <Fact label="Coût" value={info.cost} />}
                {info.life !== null && <Fact label="Life" value={info.life} />}
                {info.power !== null && <Fact label="Power" value={info.power} />}
                <Fact label="Counter" value={info.counter ?? '—'} />
                {info.attribute.length > 0 && (
                  <Fact label="Attribut" value={info.attribute.join('/')} />
                )}
                <Fact label="Types" value={info.types.join(' / ') || '—'} />
              </dl>
              {info.effectText && (
                <p className="hold mt-4 whitespace-pre-wrap rounded-lg p-3 text-sm leading-relaxed text-stone-200">
                  {info.effectText}
                </p>
              )}
              {info.triggerText && (
                <p className="mt-2 rounded-lg bg-amber-950/50 p-3 text-sm text-amber-200">
                  {info.triggerText}
                </p>
              )}
            </>
          )}

          {actions.length > 0 && (
            <div className="mt-5 flex flex-wrap gap-2">
              {actions.map((a) => (
                <span key={a.label} className="flex flex-col">
                  <button
                    onClick={a.run}
                    disabled={a.disabled}
                    className={`rounded-lg px-3.5 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40 ${
                      VARIANT_CLASSES[a.variant ?? 'ghost']
                    }`}
                  >
                    {a.label}
                  </button>
                  {a.hint && <span className="mt-0.5 text-[10px] text-red-300">{a.hint}</span>}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <dt className="zone-label">{label}</dt>
      <dd className="text-stone-200">{value}</dd>
    </div>
  );
}
