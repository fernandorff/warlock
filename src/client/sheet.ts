// Ficha do mago: os números de agora (vida, velocidade, empurrão, magias e itens) e de onde vem cada um.
// Sem DOM: a loja e a partida desenham a partir daqui, e a prévia de compra ou venda compara duas fichas.
import { CLASS_PASSIVE, classOf, type ClassId, type ClassPassive } from '../shared/characters.ts';
import { HP_MAX, HP_REGEN, LAVA_DPS, WIZ_SPEED } from '../shared/constants.ts';
import { ITEM_IDS, itemStats, noItems, type ItemId } from '../shared/items.ts';
import { SPELLS, SPELL_IDS, type SpellId } from '../shared/spells.ts';
import { labelOf } from './keys.ts';
import { n1, pct } from './rules-text.ts';
import { ITEM_ROWS, SPELL_ROWS } from './tips.ts';
import { LOCALE, itemName, spellName, t } from './i18n.ts';

export type SheetRow = { group: string; label: string; value: string; from?: string; key?: string };
export const BASE = t('Mago', 'Wizard');

const n2 = (x: number) => x.toLocaleString(LOCALE, { maximumFractionDigits: 2 });
const signed = (x: number, f: (y: number) => string) => (x < 0 ? '−' : '+') + f(Math.abs(x));

// como mostrar cada campo de itemStats (total e parte de cada item); campo novo sem entrada aparece cru, para nada ficar escondido
const FIELDS: Record<string, [label: string, total: (x: number) => string, part: (x: number) => string]> = {
  hp: [t('Vida máxima', 'Max health'), (x) => n1(HP_MAX + x), (x) => signed(x, n1)],
  regen: [t('Vida por segundo (na pedra)', 'Health per second (on the rock)'), (x) => n2(HP_REGEN + x), (x) => signed(x, n2)],
  speed: [t('Velocidade', 'Speed'), (x) => `${n2(WIZ_SPEED + x)} m/s`, (x) => signed(x, (y) => `${n2(y)} m/s`)],
  kb: [t('Empurrão recebido', 'Knockback taken'), (x) => pct(1 - x), (x) => signed(-x, pct)],
  debuff: [t('Duração de lentidões e penalidades', 'Duration of slows and penalties'), (x) => pct(1 + x), (x) => signed(x, pct)],
  lifesteal: [t('Roubo de vida', 'Lifesteal'), (x) => t(`${pct(x)} do dano causado`, `${pct(x)} of damage dealt`), (x) => signed(x, pct)],
  lava: [t('Dano da lava', 'Lava damage'), (x) => t(`${n1(LAVA_DPS * (1 - x))} por segundo`, `${n1(LAVA_DPS * (1 - x))} per second`), (x) => signed(-x, pct)],
  ward: [t('Dano a menos por golpe', 'Damage reduced per hit'), (x) => t(`${n1(x)} (até metade do golpe)`, `${n1(x)} (up to half the hit)`), (x) => signed(x, n1)],
  range: [t('Alcance das magias', 'Spell range'), (x) => pct(1 + x), (x) => signed(x, pct)],
};

// classe (characters.ts CLASS_PASSIVE, issue #17): nome e passiva; os totais somam itens e passiva, e a parte da classe aparece na origem
const CLASS_TEXT: Record<ClassId, [name: string, passive: string]> = {
  knight: [t('Cavaleiro', 'Knight'), t('5% menos empurrão e vida volta 5% mais rápido', '5% less knockback and health comes back 5% faster')],
  rogue: [t('Ladino', 'Rogue'), t('5% mais rápido e as lentidões que você aplica duram 5% mais', '5% faster and the slows you apply last 5% longer')],
  mage: [t('Mago', 'Mage'), t('5% mais dano e recargas 5% mais curtas', '5% more damage and 5% shorter cooldowns')],
};

// linha da classe no criador de personagem: o visual troca na hora, a classe só no começo da rodada seguinte
// (trocar de tronco no meio de um combate não pode virar truque)
export const classLine = (look: string) => {
  const cls = classOf(look);
  return cls ? t(`Classe pelo tronco: ${CLASS_TEXT[cls][0]} (${CLASS_TEXT[cls][1]}). Muda na próxima rodada.`, `Class from the torso: ${CLASS_TEXT[cls][0]} (${CLASS_TEXT[cls][1]}). Changes next round.`)
    : t('Sem classe: só o tronco de Cavaleiro, Ladina ou Mago dá classe.', 'No class: only the Knight, Rogue or Mage torso gives a class.');
};

export function sheet(spells: Record<SpellId, number>, items: Record<ItemId, number>, cls: ClassId | null = null): SheetRow[] {
  const st = itemStats(items) as Record<string, number>;
  const c: ClassPassive = cls ? CLASS_PASSIVE[cls] : {};
  // o mesmo cálculo do gearOf (sim.ts): kb soma; vida por segundo e velocidade multiplicam o total (base + itens)
  const withClass: Record<string, (x: number) => number> = {
    kb: (x) => x + (c.kb ?? 0),
    regen: (x) => (HP_REGEN + x) * (c.regen ?? 1) - HP_REGEN,
    speed: (x) => (WIZ_SPEED + x) * (c.speed ?? 1) - WIZ_SPEED,
  };
  const classRow: SheetRow[] = cls ? [{ group: BASE, label: t('Classe (pelo tronco)', 'Class (from the torso)'), value: CLASS_TEXT[cls][0], from: CLASS_TEXT[cls][1] }] : [];
  const rows: SheetRow[] = [...classRow, ...Object.keys(st).map((k) => {
    const [label, total, part] = FIELDS[k] ?? [k, (x: number) => n2(x), (x: number) => signed(x, n2)];
    const x = withClass[k]?.(st[k]) ?? st[k];
    // origem: a parte de cada item que mexe neste campo, e a da classe
    const from = [...ITEM_IDS.filter((i) => items[i] > 0).map((i) => [i, (itemStats({ ...noItems(), [i]: items[i] }) as Record<string, number>)[k]] as const)
      .filter(([, v]) => v).map(([i, v]) => t(`${part(v)} de ${itemName(i)} nível ${items[i]}`, `${part(v)} from ${itemName(i)} level ${items[i]}`)),
      ...(cls && Math.abs(x - st[k]) > 1e-9 ? [t(`${part(x - st[k])} da classe ${CLASS_TEXT[cls][0]}`, `${part(x - st[k])} from the ${CLASS_TEXT[cls][0]} class`)] : [])].join(' · ');
    return { key: k, group: BASE, label, value: total(x), from: from || undefined };
  })];
  const rangeF = 1 + (st.range ?? 0);
  for (const s of SPELL_IDS) {
    const lvl = spells[s];
    if (!lvl) continue;
    const L = SPELLS[s].levels[lvl - 1];
    // o Elmo encurta o alcance de todas as magias; a classe Mago mexe no dano e na recarga (como em hit() e cast(), sim.ts)
    const shown = { ...L, range: L.range * rangeF, dmg: L.dmg * (c.dmg ?? 1), cd: L.cd * (c.cd ?? 1) };
    rows.push({ group: spellName(s), label: t('Nível', 'Level'), value: t(`${lvl} · tecla ${labelOf(s)}`, `${lvl} · key ${labelOf(s)}`) });
    for (const [label, f] of SPELL_ROWS[s]) rows.push({ group: spellName(s), label, value: f(shown) });
  }
  return rows;
}

// o que muda de uma ficha para a outra; "pior" quando o número piora para quem joga
export type Change = { label: string; before: string | null; after: string | null; worse: boolean };
const LOWER_BETTER = /Recarga|Cooldown|Empurrão recebido|Knockback taken|lava|lentidões|slows|Preparo|Wind-?up|Penalidade|Penalt/i;
const num = (s: string | null) => (s === null ? NaN : Number((LOCALE === 'en-US' ? s.replace(/[^\d.-]/g, '') : s.replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.')).replace(/^-$/, '')));
export function diff(before: SheetRow[], after: SheetRow[]): Change[] {
  const key = (r: SheetRow) => r.group + '|' + r.label;
  const a = new Map(after.map((r) => [key(r), r]));
  const b = new Map(before.map((r) => [key(r), r]));
  const keys = [...new Set([...b.keys(), ...a.keys()])];
  return keys.flatMap((k) => {
    const x = b.get(k)?.value ?? null, y = a.get(k)?.value ?? null;
    if (x === y) return [];
    const r = (a.get(k) ?? b.get(k))!;
    const d = num(y) - num(x);
    const worse = y === null || (!Number.isNaN(d) && (LOWER_BETTER.test(r.label) ? d > 0 : d < 0));
    return [{ label: r.group === BASE ? r.label : `${r.group} · ${r.label}`, before: x, after: y, worse }];
  });
}
