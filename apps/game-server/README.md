# @op/game-server

Serveur de jeu Colyseus (Phase 3) — **autoritaire** : le client envoie des
intentions (`GameAction`), le serveur les rejoue dans le moteur déterministe
`@op/engine`, et diffuse à chaque client une **vue filtrée** (`filterStateFor`) :
mains adverses masquées, ordre des decks illisible, seed jamais exposée.

```bash
pnpm --filter @op/game-server dev    # ws://localhost:2567
```

## Room `match`

- **Matchmaking** : `joinOrCreate('match', { code: 'PUBLIC', ... })` ; salons
  privés par code (`filterBy(['code'])`). Au-delà de 2 joueurs : spectateurs.
- **Join** : `{ name, role, deck: { leaderVariantId, cards } }` — le deck est
  **validé côté serveur** (mêmes règles `validateDeck`, source base de cartes).
- **Seed serveur** (`crypto.randomInt`) : mélanges et pioches inconnaissables.
- **Autorisation** : une action ne peut viser que son propre siège ; `endTurn`
  uniquement à son tour ; les spectateurs ne peuvent pas agir.
- **Reconnexion** : fenêtre de 120 s (`allowReconnection`) ; au-delà, défaite
  propre par concession. **Chat** intégré. **Persistance** des parties
  terminées (modèle `Match`, journal d'actions rejouable).

## Messages

| Sens | Type                          | Payload                                  |
| ---- | ----------------------------- | ---------------------------------------- |
| C→S  | `action`                      | `GameAction` (intention)                 |
| C→S  | `chat`                        | `{ text }`                               |
| S→C  | `view`                        | `{ you, view }` — état filtré par joueur |
| S→C  | `lobby`                       | `{ code, p1, p2, started, spectators }`  |
| S→C  | `chat` / `presence` / `error` | …                                        |
