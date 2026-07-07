import { ART_BASE, type DeckFile, type DeckFileMeta } from './deck-format.js';

// ---------------------------------------------------------------------------
// Compatibilité OPTCG Sim : format texte `<qté>x<ID>`, leader en première ligne.
// C'est le seul standard de facto de l'écosystème ; il ne transporte PAS la
// variante visuelle (perte assumée à l'export, suffixe toléré à l'import).
// ---------------------------------------------------------------------------

/** Export texte compatible OPTCG Sim. La variante visuelle est volontairement omise. */
export function toSimText(deck: DeckFile): string {
  const lines = [`1x${deck.leader.id}`, ...deck.cards.map((c) => `${c.qty}x${c.id}`)];
  return lines.join('\n');
}

/** "4xOP01-016", "4x OP01-016", "4 x op01-016", suffixe d'art optionnel ("2xOP01-025_p1"). */
const SIM_LINE_REGEX = /^(\d+)\s*x\s*((?:OP|ST|EB|PRB|P)\d*-\d+)(?:_([a-z]\d+))?$/i;

export interface SimTextIssue {
  /** Numéro de ligne (1-indexé), 0 pour un problème global. */
  line: number;
  raw: string;
  reason: string;
}

export interface FromSimTextResult {
  /** null si aucun deck exploitable (ex. leader introuvable). */
  deck: DeckFile | null;
  issues: SimTextIssue[];
}

/**
 * Import d'un texte OPTCG Sim vers notre JSON `optcg-deck` v1.
 * `isLeader` est branché sur la base de cartes : c'est lui qui identifie le
 * leader de façon fiable (pas la position dans le texte).
 */
export function fromSimText(
  text: string,
  isLeader: (cardId: string) => boolean,
  meta?: Partial<DeckFileMeta>,
): FromSimTextResult {
  const issues: SimTextIssue[] = [];
  const parsed: { id: string; qty: number; art: string; line: number }[] = [];

  text.split(/\r?\n/).forEach((rawLine, index) => {
    const line = rawLine.trim();
    if (line === '') return;
    const match = SIM_LINE_REGEX.exec(line);
    if (!match) {
      issues.push({
        line: index + 1,
        raw: rawLine,
        reason: 'Ligne illisible (attendu : "4xOP01-016").',
      });
      return;
    }
    parsed.push({
      id: match[2]!.toUpperCase(),
      qty: Number(match[1]),
      art: match[3]?.toLowerCase() ?? ART_BASE,
      line: index + 1,
    });
  });

  const leaderEntries = parsed.filter((e) => isLeader(e.id));
  if (leaderEntries.length === 0) {
    issues.push({ line: 0, raw: '', reason: 'Aucun leader identifié dans la liste.' });
    return { deck: null, issues };
  }
  const leader = leaderEntries[0]!;
  for (const extra of leaderEntries.slice(1)) {
    issues.push({
      line: extra.line,
      raw: `${extra.qty}x${extra.id}`,
      reason: `Leader supplémentaire ignoré (${extra.id}) : un deck n'a qu'un leader.`,
    });
  }
  if (leader.qty !== 1) {
    issues.push({
      line: leader.line,
      raw: `${leader.qty}x${leader.id}`,
      reason: 'Le leader est unique : quantité ramenée à 1.',
    });
  }

  // Fusionne les doublons (même identité + même art)
  const merged = new Map<string, { id: string; qty: number; art: string }>();
  for (const entry of parsed.filter((e) => !isLeader(e.id))) {
    const key = `${entry.id}|${entry.art}`;
    const existing = merged.get(key);
    if (existing) existing.qty += entry.qty;
    else merged.set(key, { id: entry.id, qty: entry.qty, art: entry.art });
  }

  const deck: DeckFile = {
    format: 'optcg-deck',
    version: 1,
    meta: { name: meta?.name ?? 'Deck importé', ...meta },
    leader: { id: leader.id, art: leader.art },
    cards: [...merged.values()],
  };

  return { deck, issues };
}
