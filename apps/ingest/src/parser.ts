import * as cheerio from 'cheerio';
import type { Cheerio, CheerioAPI } from 'cheerio';
import type { Element } from 'domhandler';

// ---------------------------------------------------------------------------
// Parser isolé du HTML Bandai (en.onepiece-cardgame.com/cardlist).
// Structure observée (fixtures archivées dans test/fixtures/) :
//   <select id="series"><option value="569116">BOOSTER PACK ... [OP-16]</option>...
//   <dl class="modalCol" id="OP16-001[_p1]">
//     .infoCol : <span>OP16-001</span> | <span>L</span> | <span>LEADER</span>
//     .cardName ; .frontCol img[data-src] ;
//     .cost (h3 = "Cost" ou "Life") ; .attribute <i>Slash/Wisdom</i> ; .power ;
//     .counter ; .color (Red/Green) ; .block ; .feature (types) ; .text ;
//     .trigger (optionnel) ; .getInfo
// Toute évolution du markup doit casser les tests de contrat, pas la prod.
// ---------------------------------------------------------------------------

export interface SeriesOption {
  code: string; // "569116"
  title: string; // "BOOSTER PACK -THE TIME OF BATTLE- [OP-16]"
}

export interface RawCardBlock {
  variantId: string; // id du <dl> : "OP16-001" ou "OP16-001_p1"
  baseId: string; // 1er span de .infoCol (toujours sans suffixe)
  rarity: string; // "L", "SR", "SP CARD"...
  category: string; // "LEADER" | "CHARACTER" | "EVENT" | "STAGE" | ...
  name: string;
  imagePath: string; // data-src brut ("../images/cardlist/card/OP16-001.png?260701")
  costLabel: string; // "Cost" ou "Life"
  costValue: string; // "7", "5", "-"
  attributes: string[]; // ["Slash","Wisdom"] (vide pour Event/Stage)
  power: string; // "8000" ou "-"
  counter: string; // "2000" ou "-"
  colors: string[]; // ["Red"] ou ["Green","Blue"]
  types: string[]; // ["Whitebeard Pirates", ...]
  effectText: string; // "-" si aucun
  triggerText: string | null;
  setsInfo: string; // "-THE TIME OF BATTLE- [OP-16]"
  rawHtml: string; // bloc <dl> complet, conservé pour audit
}

export function parseSeriesOptions(html: string): SeriesOption[] {
  const $ = cheerio.load(html);
  const options: SeriesOption[] = [];
  $('select#series option').each((_, el) => {
    const code = $(el).attr('value')?.trim();
    if (!code) return; // "Recording" / "ALL"
    const title = $(el).text().replace(/\s+/g, ' ').trim();
    options.push({ code, title });
  });
  return options;
}

/** Texte d'un champ .backCol sans son libellé <h3> (ni icônes). */
function fieldText($: CheerioAPI, field: Cheerio<Element>): string {
  const clone = field.clone();
  clone.find('h3, img, a, br').remove();
  return clone.text().replace(/\s+/g, ' ').trim();
}

function splitSlashed(value: string): string[] {
  const cleaned = value.trim();
  if (cleaned === '' || cleaned === '-') return [];
  return cleaned
    .split('/')
    .map((part) => part.trim())
    .filter((part) => part !== '');
}

export function parseCardList(html: string): RawCardBlock[] {
  const $ = cheerio.load(html);
  const blocks: RawCardBlock[] = [];

  $('dl.modalCol').each((_, el) => {
    const dl = $(el);
    const infoSpans = dl
      .find('.infoCol span')
      .map((_i, span) => $(span).text().trim())
      .get();

    const cost = dl.find('.cost');
    const attribute = dl.find('.attribute i').text().trim();
    const trigger = dl.find('.trigger');
    const img = dl.find('.frontCol img');

    blocks.push({
      variantId: dl.attr('id')?.trim() ?? '',
      baseId: infoSpans[0] ?? '',
      rarity: infoSpans[1] ?? '',
      category: infoSpans[2] ?? '',
      name: dl.find('.cardName').text().trim(),
      imagePath: img.attr('data-src')?.trim() ?? img.attr('src')?.trim() ?? '',
      costLabel: cost.find('h3').text().trim(),
      costValue: fieldText($, cost),
      attributes: splitSlashed(attribute),
      power: fieldText($, dl.find('.power')),
      counter: fieldText($, dl.find('.counter')),
      colors: splitSlashed(fieldText($, dl.find('.color'))),
      types: splitSlashed(fieldText($, dl.find('.feature'))),
      effectText: fieldText($, dl.find('.text')),
      triggerText: trigger.length > 0 ? fieldText($, trigger) : null,
      setsInfo: fieldText($, dl.find('.getInfo')),
      rawHtml: $.html(dl),
    });
  });

  return blocks;
}
