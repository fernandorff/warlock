// Teclas de cada magia e atalho da interface, trocáveis pelo jogador (guardadas no navegador), e os botões do controle.
import { SPELL_IDS, type SpellId } from '../shared/spells.ts';
import { t } from './i18n.ts';
import { store } from './store.ts';

export type Action = SpellId;
export const ACTIONS: Action[] = [...SPELL_IDS];
// atalhos da interface (pedido do Fernando, 18/10): trocáveis no mesmo painel das magias; o Votar começa sem tecla
export const UI_ACTIONS = ['shop', 'board', 'sheet', 'taunt', 'rules', 'library', 'stop', 'vote', 'replay', 'camera', 'basic'] as const;
export type UiAction = (typeof UI_ACTIONS)[number];
export const UI_NAMES: Record<UiAction, string> = { shop: t('Loja só para ver', 'Shop (view only)'), board: t('Placar (segurar)', 'Scoreboard (hold)'), sheet: t('Ficha do mago', 'Wizard sheet'), taunt: t('Provocações', 'Taunts'), rules: t('Grimório (como jogar)', 'Grimoire (how to play)'), library: t('Magias e itens (consulta)', 'Spells and items (lookup)'), stop: t('Parar / Manter base (segurar 0,5 s)', 'Stop / Hold ground (hold 0.5 s)'), basic: t('Atacar', 'Attack'), vote: t('Votar', 'Vote'), replay: t('Rever a queda', 'Replay the fall'), camera: t('Câmera no mago ou na arena', 'Camera on the wizard or the arena') };
export type AnyAction = Action | UiAction | PosAction;
const ALL: AnyAction[] = [...ACTIONS, ...UI_ACTIONS];
const DEFAULTS: Record<string, string> = {
  fireball: 'KeyQ', lightning: 'KeyW', homing: 'KeyE', shield: 'KeyR', teleport: 'KeyF',
  cluster: 'KeyT', swap: 'KeyD', grip: 'KeyG', rush: 'KeyC', meteor: 'KeyV',
  boomerang: 'KeyB', thrust: 'KeyX', gravity: 'KeyH', rockpillar: 'KeyZ', bouncer: '', basic: 'KeyA',
  // as dez últimas: sobraram 9 letras livres; a Zona de dobra fica sem tecla padrão (teclas por posição ou painel de teclas)
  drain: 'KeyN', snowball: 'KeyO', illusion: 'KeyJ', magnetize: 'KeyM', recharge: 'KeyK', alteration: 'KeyL', link: 'KeyU', windwalk: 'KeyI', splitter: 'KeyP', warpzone: '',
  // Flagelo e Pacto ficam nas teclas que tinham como item (viraram magia em 21/10, #217)
  scourge: 'Digit1', pact: 'Digit3', heal: '', geyser: '', closedbody: '',
  // loja: o B do Dota é do Bumerangue e as 26 letras já têm dono; 1 a 4 são das magias por posição (21/10, #217), então o 7
  // (o 5 já era do Rever a queda e o 6 da câmera, #235); ficha: a tecla à esquerda do 1 (' no ABNT2); grimório no F1 (o H é da Gravidade) e a biblioteca no F2
  shop: 'Digit7', board: 'Tab', sheet: 'Backquote', taunt: 'KeyY', rules: 'F1', library: 'F2', stop: 'KeyS', vote: '', replay: 'Digit5', camera: 'Digit6',
};
// fixas: Esc (cancela, fecha e abre as configurações), Enter, Espaço (segurar arrasta a câmera, soltar centraliza) e ← → (placar e espectador)
export const RESERVED = new Set(['Escape', 'Enter', 'Space', 'ArrowLeft', 'ArrowRight']);
const STORE = 'warlock:keys';

let map: Record<string, string> = { ...DEFAULTS };
const savedKeys = store.json<Record<string, string>>(STORE) ?? {};
for (const [a, code] of Object.entries(savedKeys)) if (a in DEFAULTS && typeof code === 'string' && !RESERVED.has(code)) map[a] = code;

const listeners: (() => void)[] = [];
const notify = () => listeners.forEach((f) => f());
// trocar uma tecla fixa o modo em uso (teclas por posição ou não): quem personalizou não muda de modo sozinho ao recarregar
const save = () => {
  store.set(STORE, JSON.stringify(map));
  store.set(POS_STORE, JSON.stringify(posMap));
  store.set(SLOT_STORE, slotMode ? '1' : '0');
  notify();
};

// teclas por posição (como no Dota; pedido do Fernando, 17/10): as magias usam a tecla da posição na barra.
// 8 posições em 1 2 3 4 Q W E R, misturando MMO e MOBA (Fernando, 21/10, #217; antes Magia 1 a 6 em Q W E R D F e Item 1 a 3 em 1 2 3),
// trocáveis (20/10), com os nomes das do controle.
export const POS_ACTIONS = ['slot1', 'slot2', 'slot3', 'slot4', 'slot5', 'slot6', 'slot7', 'slot8'] as const;
export type PosAction = (typeof POS_ACTIONS)[number];
const POS_DEFAULTS: Record<PosAction, string> = { slot1: 'Digit1', slot2: 'Digit2', slot3: 'Digit3', slot4: 'Digit4', slot5: 'KeyQ', slot6: 'KeyW', slot7: 'KeyE', slot8: 'KeyR' };
export const isPos = (a: AnyAction): a is PosAction => a in POS_DEFAULTS;
// chave nova em 21/10: as posições salvas do jeito antigo (Q W E R nas 4 primeiras) repetiriam teclas com as 8 novas
const POS_STORE = 'warlock:poskeys8';
let posMap: Record<PosAction, string> = { ...POS_DEFAULTS };
for (const [a, code] of Object.entries(store.json<Record<string, string>>(POS_STORE) ?? {})) if (a in POS_DEFAULTS && typeof code === 'string' && !RESERVED.has(code)) posMap[a as PosAction] = code;
const SLOT_STORE = 'warlock:slotkeys';
// ligado por padrão (Fernando, 20/10), menos para quem já tem teclas salvas: o modo ignoraria as teclas das magias e prenderia as teclas das posições
let slotMode = (store.get(SLOT_STORE) ?? (store.get(STORE) ? '0' : '1')) === '1';
// atalho salvo antes de 21/10 numa tecla que agora é de posição (a Loja no 4): volta ao padrão, senão a tecla abriria a loja e lançaria a magia;
// sem as teclas por posição nada colide, e o atalho fica onde a pessoa pôs
if (slotMode) for (const u of UI_ACTIONS) if (Object.values(posMap).includes(map[u])) map[u] = DEFAULTS[u];
// Ação nova nunca toma a tecla de uma preferência salva, nem de posições vazias.
if (!('basic' in savedKeys) && ((slotMode ? Object.values(posMap).includes(map.basic) : ACTIONS.some((a) => map[a] === map.basic)) || UI_ACTIONS.some((a) => a !== 'basic' && map[a] === map.basic))) map.basic = '';
let slots: (SpellId | null)[] = [];
export const isSlotMode = () => slotMode;
export function setSlotMode(on: boolean) {
  slotMode = on;
  store.set(SLOT_STORE, on ? '1' : '0');
  notify();
}
// magias na ordem da barra (a interface avisa quando muda)
export function setSlots(next: (SpellId | null)[]) {
  if (next.join() === slots.join()) return;
  slots = next;
  if (slotMode || pad) notify();
}
export const slotSpell = (i: number): SpellId | undefined => slots[i] ?? undefined;

// jeito de lançar pela tecla no PC (decisão do Fernando, 18/10; os três do Dota), guardado no navegador:
// quick = lança na hora (padrão, como sempre foi); release = segurar mostra o alcance, soltar lança;
// click = a tecla escolhe a magia e mostra o alcance, o clique esquerdo lança (direito ou Esc cancelam)
export const CAST_MODES = ['quick', 'release', 'click'] as const;
export type CastMode = (typeof CAST_MODES)[number];
const CAST_STORE = 'warlock:castmode';
const savedCast = store.get(CAST_STORE);
let castMode: CastMode = (CAST_MODES as readonly string[]).includes(savedCast ?? '') ? (savedCast as CastMode) : 'quick';
export const getCastMode = () => castMode;
export function setCastMode(m: CastMode) {
  castMode = m;
  store.set(CAST_STORE, m);
  notify();
}

// controle (gamepad): botão de cada ação, trocável na aba Controle das configurações (pedido do Fernando, 18/10).
// Padrão: A B X Y LB RB LT RT pela ordem da barra (8 magias desde 21/10); L3 ficha; View placar; ↓ loja; R3 câmera.
// Start fica fora: é o Esc do controle. Índices do mapeamento padrão da Gamepad API (PlayStation nas mesmas posições).
export const PAD_NAMES = ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'View', 'Start', 'L3', 'R3', '↑', '↓', '←', '→'];
export const PAD_NAMES_PS = ['✕', '○', '□', '△', 'L1', 'R1', 'L2', 'R2', 'Share', 'Options', 'L3', 'R3', '↑', '↓', '←', '→'];
export const PAD_START = 9;
// nome do botão nas duas famílias ("A / ✕"); L3, R3 e o D-pad são iguais
export const padButtonName = (b: number, open = ' / ', close = '') => (PAD_NAMES[b] === PAD_NAMES_PS[b] ? PAD_NAMES[b] : PAD_NAMES[b] + open + PAD_NAMES_PS[b] + close);
export const PAD_ACTIONS = ['slot1', 'slot2', 'slot3', 'slot4', 'slot5', 'slot6', 'slot7', 'slot8', 'sheet', 'board', 'shop', 'center', 'taunt'] as const;
export type PadAction = (typeof PAD_ACTIONS)[number];
const PAD_DEFAULTS: Record<PadAction, number> = { slot1: 0, slot2: 1, slot3: 2, slot4: 3, slot5: 4, slot6: 5, slot7: 6, slot8: 7, sheet: 10, board: 8, shop: 13, center: 11, taunt: 14 };
export const PAD_ACTION_NAMES: Record<PadAction, string> = { slot1: t('Magia 1', 'Spell 1'), slot2: t('Magia 2', 'Spell 2'), slot3: t('Magia 3', 'Spell 3'), slot4: t('Magia 4', 'Spell 4'), slot5: t('Magia 5', 'Spell 5'), slot6: t('Magia 6', 'Spell 6'),
  slot7: t('Magia 7', 'Spell 7'), slot8: t('Magia 8', 'Spell 8'), sheet: t('Ficha do mago', 'Wizard sheet'), board: t('Placar (segurar)', 'Scoreboard (hold)'), shop: t('Loja só para ver', 'Shop (view only)'), center: t('Centralizar a câmera', 'Center the camera'), taunt: t('Provocações', 'Taunts') };
const PAD_STORE = 'warlock:pad';
let padMap: Record<PadAction, number> = { ...PAD_DEFAULTS };
for (const [a, b] of Object.entries(store.json<Record<string, number>>(PAD_STORE) ?? {})) if (a in PAD_DEFAULTS && Number.isInteger(b) && b >= 0 && b < PAD_NAMES.length && b !== PAD_START) padMap[a as PadAction] = b;
// Quem já usava ← para outra ação mantém a escolha; a ação nova ocupa um botão ainda livre.
if (PAD_ACTIONS.some((a) => a !== 'taunt' && padMap[a] === padMap.taunt)) {
  padMap.taunt = PAD_NAMES.findIndex((_, b) => b !== PAD_START && !PAD_ACTIONS.some((a) => a !== 'taunt' && padMap[a] === b));
}
export const padButtonOf = (a: PadAction) => padMap[a];
export const padActionAt = (btn: number): PadAction | undefined => PAD_ACTIONS.find((a) => padMap[a] === btn);
// troca o botão; quem já usava esse botão fica com o antigo desta ação. Start não entra (é o Esc do controle)
export function setPadButton(a: PadAction, btn: number): boolean {
  if (btn === PAD_START || !(btn >= 0 && btn < PAD_NAMES.length)) return false;
  const other = padActionAt(btn);
  if (other && other !== a) padMap[other] = padMap[a];
  padMap[a] = btn;
  savePad();
  return true;
}
export function resetPad() {
  padMap = { ...PAD_DEFAULTS };
  savePad();
}
function savePad() {
  store.set(PAD_STORE, JSON.stringify(padMap));
  notify();
}

// Com o controle em uso, a barra e a loja mostram os botões; tecla ou mouse de novo voltam às teclas.
let pad = false;
export const isPadMode = () => pad;
export function setPadMode(on: boolean) {
  if (on === pad) return;
  pad = on;
  notify();
}
const padLabel = (a: Action) => {
  const i = slots.indexOf(a);
  return i < 0 ? '—' : PAD_NAMES[padMap[`slot${i + 1}` as PadAction]];
};

const isUi = (a: AnyAction): a is UiAction => (UI_ACTIONS as readonly string[]).includes(a);
// posição da magia na barra (sem posição: ainda não comprou, ou passou das posições que existem)
const posOf = (a: Action): PosAction | undefined => {
  const i = slots.indexOf(a);
  const p = `slot${i + 1}`;
  return i >= 0 && p in POS_DEFAULTS ? (p as PosAction) : undefined;
};
export const keyOf = (a: AnyAction): string => {
  if (isPos(a)) return posMap[a];
  if (!slotMode || isUi(a)) return map[a];
  const p = posOf(a);
  return p ? posMap[p] : '';
};
// a tecla apertada é a do atalho da interface? (sem tecla nunca casa)
export const isUiKey = (code: string, a: UiAction) => !!code && map[a] === code;
// só magias: os atalhos da interface nunca lançam nada
export const actionFor = (code: string): Action | undefined => {
  if (!slotMode) return ACTIONS.find((a) => map[a] === code) as Action | undefined;
  const p = code ? POS_ACTIONS.find((q) => posMap[q] === code) : undefined;
  if (!p) return undefined;
  const i = Number(p.slice(4)) - 1;
  return slots[i] ?? undefined;
};
export const onKeysChange = (f: () => void) => listeners.push(f);

// rótulo curto para mostrar: KeyQ → Q, Digit1 → 1, Numpad4 → Num 4
export function keyLabel(code: string): string {
  if (!code) return '—'; // sem tecla (a Zona de dobra começa assim)
  if (code === 'Backquote') return "'";
  if (code === 'Space') return t('Espaço', 'Space');
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return 'Num ' + code.slice(6);
  return code.replace('Left', '').replace('Right', '');
}
export const labelOf = (a: Action) => (pad ? padLabel(a) : keyLabel(keyOf(a)));
// rótulo do atalho da interface, para dicas e textos de ajuda
export const uiLabel = (a: UiAction) => keyLabel(map[a]);

// quem usa a tecla agora: com as teclas por posição, as posições e os atalhos; fora delas, as magias e os atalhos
export function whoUses(code: string): AnyAction | undefined {
  if (!code) return undefined;
  if (slotMode) return POS_ACTIONS.find((p) => posMap[p] === code) ?? UI_ACTIONS.find((u) => map[u] === code);
  return ALL.find((a) => map[a] === code);
}

// troca a tecla; se outra ação já usava essa tecla, as duas trocam entre si (a interface avisa quem trocou). Recusa as fixas.
// Posições e atalhos nunca repetem tecla: quem perde a tecla fica com a antiga de quem a tomou
const assign = (a: Action | UiAction, code: string) => {
  const other = ALL.find((o) => map[o] === code);
  if (other && other !== a) map[other] = map[a];
  map[a] = code;
};
export function setKey(a: AnyAction, code: string): boolean {
  if (RESERVED.has(code)) return false;
  if (isPos(a)) {
    const other = POS_ACTIONS.find((p) => posMap[p] === code);
    if (other && other !== a) posMap[other] = posMap[a];
    const ui = UI_ACTIONS.find((u) => map[u] === code);
    if (ui) assign(ui, posMap[a]);
    posMap[a] = code;
  } else {
    const before = map[a];
    assign(a, code);
    const pos = isUi(a) && POS_ACTIONS.find((p) => posMap[p] === code);
    if (pos) posMap[pos] = before;
  }
  save();
  return true;
}

export function resetKeys() {
  map = { ...DEFAULTS };
  posMap = { ...POS_DEFAULTS };
  save();
}

// tecla repetida, com Ctrl ou Cmd, ou digitando num campo: os atalhos não respondem
export const typing = (e: KeyboardEvent) => e.repeat || e.ctrlKey || e.metaKey || (e.target as HTMLElement)?.tagName === 'INPUT';

// Esc que ninguém usou: quem cancela ou fecha algo com o Esc chama preventDefault; o que sobra abre as configurações.
// Registrar por último (main.ts), para correr depois dos outros ouvintes do mesmo Esc.
export const onFreeEsc = (f: () => void) => addEventListener('keydown', (e) => e.code === 'Escape' && !e.repeat && !e.defaultPrevented && f());
