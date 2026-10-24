// Ícones de magias, itens, runas, efeitos e interface num lugar só: desenhos do game-icons.net (CC BY 3.0, créditos em
// public/CREDITS.txt) num sprite só (public/icons.svg, montado por scripts/assets/build-icons.mjs). Cor pelo tema (currentColor).
import type { RuneKind } from '../shared/constants.ts';
import { INCAPACITATED_BIT } from '../shared/constants.ts';
import type { ItemId } from '../shared/items.ts';
import { isSpell, type SpellId } from '../shared/spells.ts';
import { itemName, spellName, t } from './i18n.ts';

// elemento do DOM com atributos (on* viram ouvintes) e filhos; mora aqui porque scene.ts e opt-info.ts não podem importar ui.ts (ciclo)
export type Child = Node | string | null | undefined | false;
export function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Record<string, any> = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'class') e.className = v;
    else if (k === 'style') e.setAttribute('style', v);
    else if (v === true) e.setAttribute(k, '');
    else if (v !== false && v != null) e.setAttribute(k, String(v));
  }
  for (const c of children) if (c) e.append(c);
  return e;
}
// botão só de ícone (✕, ⋯, ‹ ›, engrenagem): o nome vira title e aria-label. props sobrescreve (class 'icon …', title com a tecla,
// aria-expanded, hidden). Outros visuais do ✕ só pela class: 'kick' (pequeno e vermelho, na linha do placar), 'info-close' (canto do ⓘ)
export const iconButton = (child: Child, name: string, onclick: () => void, props: Record<string, unknown> = {}) =>
  el('button', { type: 'button', class: 'icon', title: name, 'aria-label': name, onclick, ...props }, child);

// símbolo do sprite → <svg> do tamanho da fonte; o emoji antigo fica como texto alternativo
const ALT: Record<string, string> = {};
export function icon(id: string): SVGSVGElement {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'gi');
  svg.setAttribute('viewBox', '0 0 512 512');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', ALT[id] ?? '');
  const use = document.createElementNS(NS, 'use');
  use.setAttribute('href', `/icons.svg#${id}`);
  svg.append(use);
  return svg;
}
// registra o emoji de cada ícone (texto alternativo) e devolve só os ids
const named = <K extends string>(m: Record<K, [id: string, alt: string]>) =>
  Object.fromEntries(Object.entries<[string, string]>(m).map(([k, [id, alt]]) => ((ALT[id] = alt), [k, id]))) as Record<K, string>;

export const ICON: Record<SpellId, string> = named<SpellId>({ fireball: ['fire-ray', '🔥'], lightning: ['focused-lightning', '⚡'], homing: ['on-target', '🎯'], shield: ['shield-reflect', '🛡️'],
  teleport: ['teleport', '✨'], swap: ['body-swapping', '🔄'], grip: ['grab', '⛓️'], meteor: ['meteor-impact', '☄️'], rush: ['sprint', '💨'], cluster: ['striking-splinter', '🔱'],
  boomerang: ['boomerang', '🪃'], thrust: ['knife-thrust', '🗡️'], gravity: ['vortex', '🌀'], rockpillar: ['defensive-wall', '🧱'], bouncer: ['ricochet', '🏓'], drain: ['life-tap', '🧛'],
  snowball: ['frozen-orb', '❄️'], illusion: ['two-shadows', '👥'], magnetize: ['magnet', '🧲'], recharge: ['cycle', '🔋'], alteration: ['card-exchange', '🔀'], link: ['harpoon-chain', '🔗'],
  windwalk: ['wind-slap', '👻'], splitter: ['split-arrows', '💠'], warpzone: ['time-trap', '⏳'], scourge: ['flail', '💥'], pact: ['chalice-drops', '🩸'], heal: ['healing-cross', '✚'], geyser: ['water-geyser', '⛲'] });
// Armadura e Roubo de vida tinham o mesmo emoji de Agarrar e de Drenar; agora cada um tem desenho próprio
export const ITEM_ICON: Record<ItemId, string> = named<ItemId>({ ring: ['diamond-ring', '💍'], cursed_ring: ['skull-ring', '🧿'], cape: ['cape', '🧣'], armor: ['breastplate', '🦺'],
  boots: ['leather-boot', '👢'], watch: ['pocket-watch', '⏱️'], vampire: ['bat', '🦇'],
  lava_boots: ['metal-boot', '🥾'], warden: ['stone-bust', '🗿'], helmet: ['spartan-helmet', '🪖'], shock_boots: ['winged-leg', '🌩️'], aegis: ['angel-wings', '👼'], wind_boots: ['feather', '🪶'] });
export const RUNE_ICON: Record<RuneKind, string> = named<RuneKind>({ haste: ['rabbit', '🐇'], fury: ['enrage', '😡'], shield: ['checked-shield', '🔰'], recharge: ['energise', '🔋'] });
export const RUNE_NAME: Record<RuneKind, string> = { haste: t('Runa da Pressa', 'Haste Rune'), fury: t('Runa da Fúria', 'Fury Rune'), shield: t('Runa do Escudo', 'Shield Rune'), recharge: t('Runa da Recarga', 'Recharge Rune') };
// o que derrubou alguém, além de magias e itens (placar)
export const SOURCE_ICON = named({ lava: ['volcano', '🌋'], pillar: ['menhir', '🪨'], shock: ['knockout', '💫'], unknown: ['uncertainty', '❔'] });
// botões e colunas da interface
export const UI_ICON = named({ board: ['histogram', '📊'], sheet: ['scroll-unfurled', '📜'], taunt: ['talk', '💬'], vote: ['vote', '🗳️'], sound: ['speaker', '🔊'], mute: ['speaker-off', '🔇'],
  help: ['help', '❓'], keys: ['keyboard', '⌨️'], kills: ['skull-crossed-bones', '☠'], dmg: ['spiky-explosion', '💥'], wins: ['trophy', '🏆'], aim: ['archery-target', '🎯'],
  gold: ['two-coins', '🪙'], tip: ['light-bulb', '💡'], bot: ['robot-antennas', '🤖'], person: ['character', '👤'], info: ['info', 'ℹ️'], shop: ['shop', '🏪'],
  gear: ['cog', '⚙️'], pad: ['gamepad', '🎮'], video: ['tv', '📺'], exit: ['exit-door', '🚪'], watch: ['eyeball', '👁️'],
  buy: ['shopping-cart', '🛒'], upgrade: ['upgrade', '⏫'], undo: ['anticlockwise-rotation', '↩'] });
// ícone e nome de uma magia ou item (teclas, grimório, magia escolhida)
export const actionIcon = (a: SpellId | ItemId) => (isSpell(a) ? ICON[a] : ITEM_ICON[a]);
export const actionName = (a: SpellId | ItemId) => (isSpell(a) ? spellName(a) : itemName(a));
// efeitos em cima do mago (bits do snapshot, ver shared/snapshot.ts); negativos primeiro. Também listados na ficha do mago
const fx = named({ stun: ['star-swirl', '💫'], invuln: ['sunbeams', '🌟'], locked: ['padlock', '🔒'], slow: ['snail', '🐌'], burn: ['small-fire', '🔥'],
  repel: ['magnet-blast', '🌬️'], invis: ['ghost', '👻'], fast: ['run', '🏃'] });
export const STATUS_ICONS: [bit: number, icon: string, name: string][] = [[INCAPACITATED_BIT, ICON.warpzone, t('incapacitado: recargas pausadas', 'incapacitated: cooldowns paused')], [16, fx.stun, t('atordoado', 'stunned')], [32, fx.invuln, t('invulnerável', 'invulnerable')], [64, ICON.pact, t('Pacto armado', 'Pact armed')],
  [128, fx.locked, t('preso', 'gripped')], [256, ICON.rush, t('Investida', 'Rush')], [4, fx.slow, t('lento', 'slowed')], [512, fx.burn, t('queimando', 'burning')], [65536, ICON.link, t('preso pelo Elo', 'held by Link')], [8192, ICON.magnetize, t('magnetizado: atrai projéteis', 'magnetized: attracts projectiles')],
  [16384, fx.repel, t('magnetizado: afasta projéteis', 'magnetized: repels projectiles')], [1024, fx.invis, t('invisível (Caminhada no vento)', 'invisible (Windwalk)')], [4096, fx.fast, t('acelerado', 'hasted')], [32768, ICON.alteration, t('Alteração', 'Alteration')], [131072, ITEM_ICON.aegis, t('Égide pronta', 'Aegis ready')],
  [262144, RUNE_ICON.haste, t('Runa da Pressa', 'Haste Rune')], [524288, RUNE_ICON.fury, t('Runa da Fúria', 'Fury Rune')], [1048576, RUNE_ICON.shield, t('Runa do Escudo', 'Shield Rune')], [4194304, RUNE_ICON.recharge, t('Runa da Recarga', 'Recharge Rune')], [2097152, ICON.gravity, t('no redemoinho', 'in the vortex')]];
export const BAD_STATUS = [INCAPACITATED_BIT, 16, 4, 128, 65536, 8192, 512, 2097152];
// relógio de um efeito com prazo (snap.fx: pares bit, segundos): texto dos segundos e fração que falta (o total é o maior tempo
// visto desde que começou ou renovou). Um por lugar que mostra (barra de baixo, em cima do mago): a mesma conta dá os mesmos números
export function fxClock() {
  const last = new Map<number, number>();
  const total = new Map<number, number>();
  return (fx: number[], bit: number) => {
    const i = fx.findIndex((b, n) => n % 2 === 0 && b === bit);
    const left = i < 0 ? 0 : fx[i + 1];
    if (left > (last.get(bit) ?? 0) + 0.05) total.set(bit, left);
    last.set(bit, left);
    return left > 0.05 ? { text: left.toFixed(left < 1 ? 1 : 0), frac: Math.min(1, left / (total.get(bit) ?? left)) } : null;
  };
}
