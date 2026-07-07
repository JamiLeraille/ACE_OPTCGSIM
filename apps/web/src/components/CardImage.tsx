import { useState } from 'react';

/** Image de carte via le proxy, avec placeholder pendant le chargement. */
export function CardImage({
  variantId,
  alt,
  className,
}: {
  variantId: string;
  alt: string;
  className?: string;
}) {
  const [loaded, setLoaded] = useState(false);
  return (
    <div className={`relative overflow-hidden rounded-lg bg-slate-800 ${className ?? ''}`}>
      {!loaded && <div className="absolute inset-0 animate-pulse bg-slate-800" />}
      {/* Pas de loading="lazy" : la grille virtualisée ne monte que les tuiles
          visibles, et le lazy natif ne se déclenche pas dans un onglet masqué. */}
      <img
        src={`/img/${variantId}.png`}
        alt={alt}
        onLoad={() => setLoaded(true)}
        className={`h-full w-full object-cover transition-opacity duration-200 ${loaded ? 'opacity-100' : 'opacity-0'}`}
      />
    </div>
  );
}
