import type { FastifyInstance } from 'fastify';
import { getPrisma } from '@op/db';
import { DeckCardEntrySchema, validateDeck, VariantIdSchema } from '@op/shared';
import { z } from 'zod';
import { loadCatalog } from './cards.js';

// Partage de decks (Phase 1) : decks anonymes publics.
// POST /api/decks refuse tout deck illégal (mêmes règles que le client :
// validateDeck de @op/shared) ; GET /api/decks/:id rend la page partageable.

const DeckInputSchema = z.object({
  name: z.string().min(1).max(120),
  leaderVariantId: VariantIdSchema,
  cards: z.array(DeckCardEntrySchema).min(1),
});

export function registerDeckRoutes(app: FastifyInstance): void {
  app.post('/api/decks', async (req, reply) => {
    const parsed = DeckInputSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Payload invalide.', issues: parsed.error.issues });
    }
    const input = parsed.data;

    const catalog = await loadCatalog();
    const byId = new Map(catalog.map((c) => [c.id, c]));
    const result = validateDeck(
      { leaderVariantId: input.leaderVariantId, cards: input.cards },
      (id) => byId.get(id),
    );
    if (!result.valid) {
      return reply.code(400).send({ error: 'Deck illégal.', errors: result.errors });
    }

    // Les variantes doivent exister réellement (pas seulement être bien formées).
    const variantIds = new Set(catalog.flatMap((c) => c.variants.map((v) => v.id)));
    const missing = [input.leaderVariantId, ...input.cards.map((c) => c.variantId)].filter(
      (id) => !variantIds.has(id),
    );
    if (missing.length > 0) {
      return reply.code(400).send({ error: `Variante(s) inconnue(s) : ${missing.join(', ')}` });
    }

    const prisma = getPrisma();
    const deck = await prisma.deck.create({
      data: {
        name: input.name,
        leaderVariantId: input.leaderVariantId,
        isPublic: true,
        cards: {
          create: input.cards.map((c) => ({
            cardId: c.cardId,
            variantId: c.variantId,
            quantity: c.quantity,
          })),
        },
      },
    });
    return reply.code(201).send({ id: deck.id });
  });

  app.get<{ Params: { id: string } }>('/api/decks/:id', async (req, reply) => {
    const prisma = getPrisma();
    const deck = await prisma.deck.findUnique({
      where: { id: req.params.id },
      include: { cards: true },
    });
    if (!deck || !deck.isPublic) {
      return reply.code(404).send({ error: 'Deck introuvable.' });
    }
    return {
      id: deck.id,
      name: deck.name,
      leaderVariantId: deck.leaderVariantId,
      cards: deck.cards.map((c) => ({
        cardId: c.cardId,
        variantId: c.variantId,
        quantity: c.quantity,
      })),
      createdAt: deck.createdAt.toISOString(),
    };
  });
}
