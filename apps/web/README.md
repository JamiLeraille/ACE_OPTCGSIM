# @op/web

Deck-builder React 18 + TypeScript + Vite + Tailwind CSS 4 (rendu DOM/CSS).

```bash
pnpm --filter @op/api dev   # API sur :3001 (requise)
pnpm --filter @op/web dev   # front sur :5173 (proxy /api et /img vers :3001)
```

## Fonctionnalités (Phase 1)

- **Catalogue** : grille virtualisée maison (2 634 cartes fluides), images via le
  proxy (pas de `loading="lazy"` natif — la virtualisation fait office de lazy,
  et le lazy natif ne se déclenche pas dans un onglet masqué).
- **Filtres** : nom/numéro, mot-clé d'effet, type/trait, set, rareté, couleurs,
  coûts, catégories — tout côté client (`lib/filters.ts`, testé).
- **Construction** : leader, ajout/retrait, compteur 0/50, **validation en
  direct** via `validateDeck` de `@op/shared` (mêmes règles que le serveur).
- **Sélecteur de variante visuelle** par carte (modale de détail) — l'identité
  de jeu ne change jamais.
- **Stats** : courbe de coût, répartition couleurs/catégories, counters.
- **Import/export** : texte OPTCG Sim + JSON `optcg-deck` v1.
- **Partage** : POST vers l'API → URL publique `/deck/:id` qui rend les
  alt-arts choisis.
- **Persistance** : deck en cours auto-sauvegardé en localStorage.

## Architecture

- `lib/deck.ts` — reducer pur du deck en construction (testé) + pont DeckFile.
- `lib/filters.ts` — filtrage/facettes du catalogue (testé).
- `pages/BuilderPage.tsx` — orchestration ; `pages/DeckPage.tsx` — page partagée.
- `components/` — grille, modale carte, panneau deck, stats, filtres, import/export.

À venir : table de jeu (Phase 2), comptes (Phase 5).
