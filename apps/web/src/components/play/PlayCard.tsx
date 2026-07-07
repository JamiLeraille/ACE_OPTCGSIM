import type { CardInstance } from '@op/shared';
import { CardImage } from '../CardImage';

// Carte sur le plateau : image (ou dos), rotation quand reposée, badge DON!!.

export function CardBack({ className }: { className?: string }) {
  return (
    <div
      className={`flex items-center justify-center rounded-md border border-indigo-800 bg-gradient-to-br from-indigo-950 to-slate-900 ${className ?? ''}`}
    >
      <span className="rotate-[-20deg] text-[9px] font-black tracking-widest text-indigo-500/70">
        OP
      </span>
    </div>
  );
}

export function PlayCard({
  card,
  width = 'w-16',
  selected,
  onClick,
  onContextMenu,
  powerLabel,
}: {
  card: CardInstance;
  width?: string;
  selected?: boolean;
  onClick?: () => void;
  /** Clic droit : menu d'actions rapides. */
  onContextMenu?: (e: React.MouseEvent) => void;
  powerLabel?: string | null;
}) {
  return (
    <button
      onClick={onClick}
      onContextMenu={onContextMenu}
      className={`relative shrink-0 ${width} transition-transform ${card.rested ? 'rotate-90' : ''} ${
        selected ? 'ring-2 ring-amber-400' : ''
      } ${onClick ? 'hover:scale-105' : 'cursor-default'}`}
      title={card.cardId}
    >
      {card.faceUp ? (
        <CardImage variantId={card.variantId} alt={card.cardId} className="aspect-[480/671]" />
      ) : (
        <CardBack className="aspect-[480/671]" />
      )}
      {card.attachedDon > 0 && (
        <span className="absolute -left-1.5 -top-1.5 rounded-full bg-violet-600 px-1.5 py-0.5 text-[10px] font-bold text-white shadow">
          +{card.attachedDon}
        </span>
      )}
      {powerLabel && (
        <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 rounded bg-black/80 px-1 text-[10px] font-bold text-amber-300">
          {powerLabel}
        </span>
      )}
    </button>
  );
}
