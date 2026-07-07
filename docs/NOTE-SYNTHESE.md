# Note de synthèse — Simulateur One Piece Card Game

> État au 7 juillet 2026 · Dépôt : [JamiLeraille/ACE_OPTCGSIM](https://github.com/JamiLeraille/ACE_OPTCGSIM)
> Documents de référence : `PLAN-ACTION-OPTCG-SIM.md` et `PROMPT-CODE-OPTCG-SIM.md` (cadrage initial).

## 1. Le projet en une phrase

Simulateur web du One Piece Card Game — **fan-made, gratuit, non commercial, non affilié à
Bandai** — construit par couches : deck-builder d'abord, plateau ensuite, multijoueur temps
réel puis moteur de règles automatisé, avec un visuel plus épuré que la référence OPTCG Sim.

## 2. Où en est-on

| Phase                             | Contenu                                                          | État                                                   |
| --------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------ |
| **0 — Fondations**                | Monorepo, types partagés, base, ingestion Bandai, proxy d'images | ✅ Terminée                                            |
| **1 — Deck-builder**              | Catalogue, validation, alt-arts, import/export, partage          | ✅ Terminée                                            |
| **2 — Plateau hotseat**           | Moteur déterministe, machine de tour, compteurs, victoire        | ✅ Terminée (+ zoom/autopay, clic droit, thème pirate) |
| **3 — Multijoueur temps réel**    | Colyseus, serveur autoritaire, rooms, spectateurs                | ⏳ À démarrer                                          |
| **4 — Moteur d'effets**           | EffectScript data-driven, carte par carte, mode mixte            | Plus tard                                              |
| **5 — Polish / comptes / ranked** | Auth, ELO, replays, i18n                                         | Plus tard                                              |

**Chiffres clés** : 2 634 cartes et 4 571 variantes visuelles ingérées (53 séries, source
officielle Bandai) · 94 tests automatisés verts · 9 commits · CI GitHub Actions
(lint + typecheck + tests + format) · coût d'infrastructure actuel : 0 €.

## 3. Architecture livrée

```
apps/web        React 18 + Vite + Tailwind 4 — deck-builder (/) + table de jeu (/play)
apps/api        Fastify — catalogue (GET /api/cards), partage de decks, proxy d'images dev
apps/ingest     Scraper Bandai : parser cheerio testé en contrat → upsert idempotent
packages/shared Types + Zod + règles de deck + convertisseurs + MOTEUR @op/engine
packages/db     Prisma (SQLite dev / compatible Postgres prod)
```

Principes structurants, tous en place :

- **Identité de jeu ≠ variante visuelle.** Les règles s'appuient sur `Card` (le numéro,
  ex. `OP01-001`), jamais sur `CardVariant` (alt-arts `_p1`, `_r1`…). C'est ce qui rend
  natif le choix d'alt-art dans le deck-builder — et notre format `optcg-deck` v1 est le
  seul de l'écosystème à faire voyager l'art choisi dans un lien de partage.
- **Moteur = réducteur pur.** `applyAction(état, intention) → nouvel état`, RNG seedé
  stocké dans l'état : rejouer `(seed, decks, journal d'actions)` reproduit la partie à
  l'identique (testé octet par octet). Le serveur autoritaire de la Phase 3 n'aura qu'à
  rejouer les intentions et filtrer l'information cachée.
- **Contraintes juridiques câblées dans le code.** Images jamais rehébergées : un seul
  point de passage (`@op/shared/images`), proxy avec allowlist stricte et kill-switch
  par variable d'env (`IMAGE_PROXY_ENABLED=false`) ; disclaimer visible dans l'UI.
- **Validation partagée.** Les mêmes schémas Zod et le même `validateDeck` tournent dans
  le deck-builder (temps réel) et dans l'API (refus serveur des decks illégaux).

## 4. Ce que fait l'application aujourd'hui

**Deck-builder (`/`)** : catalogue complet filtrable (nom, mot-clé d'effet, trait, set,
rareté, couleurs, coûts, catégories) sur grille virtualisée ; construction avec validation
en direct (50 cartes, max 4 par numéro toutes variantes confondues, contrainte de couleur
du leader) ; sélecteur de version visuelle par carte ; statistiques (courbe de coût,
couleurs, counters) ; import/export texte OPTCG Sim et JSON `optcg-deck` v1 ; sauvegarde
locale automatique ; partage par URL publique (`/deck/:id`) qui rend les alt-arts choisis.

**Table hotseat (`/play`)** : mulligan à mains privées, machine de tour automatisée
(Refresh/Draw/DON/Main/End — retour des DON attachés, pioche, +2 DON plafonnés à 10),
relais manuel complet (jouer, reposer, attacher DON, KO, dégâts avec cartes de vie,
corrections), panneau de combat avec comparaison de power et compteurs ±1000, détection
de victoire (vie à zéro, deck-out, concession), écran de passage d'appareil, journal.
UX : clic gauche = zoom (visibilité par joueur, infos, effets) ; clic droit = menu
d'actions rapides ; **autopay** — jouer une carte repose automatiquement son coût en DON!!
(tout-ou-rien, refus si insuffisant) ; thème « pont de navire pirate » en CSS pur avec
zones Leader / Stage / Équipage / Main clairement séparées.

## 5. Leçons techniques capitalisées

- Le site Bandai répond **302 + cookie de session** à la première visite → fetch avec
  jar de cookies et suivi de redirections ; le CDN d'images **suspend les rafales** →
  proxy avec timeouts 10 s, concurrence amont limitée à 4, déduplication en vol.
- Garde-fou d'ingestion : si le nombre de cartes parsées chute de plus de 10 % par
  rapport à la base, **rien n'est écrit** (protège d'un changement de markup) ; le parser
  est testé en contrat contre des fixtures HTML archivées dans le dépôt.
- `loading="lazy"` natif ne se déclenche pas dans un onglet masqué → la virtualisation
  maison (≈ 25 tuiles montées) fait office de lazy-loading, plus fiable.
- SQLite ne supporte ni enums ni JSON natifs → `String` validées par Zod et listes
  JSON-encodées, migrables vers Postgres/JSONB sans changer le modèle logique.

## 6. Décision d'hébergement (Phase 3) — gratuit ET permanent

Un serveur Colyseus exige un process Node persistant avec WebSockets longs (pas de
serverless, pas de mise en veille). Analyse (juillet 2026) :

- **Cible retenue : Oracle Cloud Always Free** (VM ARM 2 OCPU / 12 Go, gratuite à vie,
  sans veille) — tout le backend dessus (Colyseus + API + Postgres + cron d'ingestion,
  Docker Compose, Caddy TLS). Front sur Cloudflare Pages, images via Cloudflare Worker.
  **Total : 0 €/mois.** Précautions : convertir le compte en Pay-As-You-Go (empêche la
  récupération d'instance inactive, sans facturation dans les limites gratuites).
- **Plan B : Cloudflare Durable Objects** (gratuit, hibernation WebSocket) si Oracle
  durcit son offre — migration bornée à ~200 lignes de room grâce au moteur réducteur pur.
- Écartés : Render free (veille après 15 min, coupe les WebSockets), Fly.io/Railway
  (plus de vrai tier gratuit).

Le code de la Phase 3 sera hébergeur-agnostique (Dockerfile, aucune dépendance cloud).

## 7. Prochaine étape — Phase 3

`apps/game-server` (Colyseus) : `MatchRoom` autoritaire rejouant les intentions via
`@op/engine`, information cachée filtrée par joueur (main adverse, ordre des decks, seed
côté serveur), matchmaking simple + rooms privées par code, reconnexion avec fenêtre de
grâce, spectateurs, chat, persistance des matchs. Critère de fin : deux clients distants
jouent une partie complète synchronisée, une déconnexion/reconnexion ne perd pas la
partie, aucun client ne voit la main adverse.

## 8. Lancer le projet en local

```bash
pnpm install                          # + génération du client Prisma
pnpm --filter @op/db db:migrate       # base SQLite de dev
pnpm --filter @op/ingest ingest       # peupler les 2 634 cartes (~3 min)
pnpm --filter @op/api dev             # API sur :3001
pnpm --filter @op/web dev             # front sur :5173
pnpm lint && pnpm typecheck && pnpm test
```
