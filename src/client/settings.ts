// Configurações (pedido do Fernando, 18/10): um diálogo só, aberto de qualquer tela, que junta teclas, lançamento, som, vídeo,
// controle, jogador e sobre. Seções empilhadas com sumário (stackedPage). Abre pelo Esc quando nada mais está aberto (main.ts),
// pela engrenagem do topo ou pelo Start do controle; não pausa o jogo. Aba nova = um item em SECTIONS.
import { isRumbleOn, setPadCapture, setRumble } from './gamepad.ts';
import { UI_ICON, actionIcon, actionName, el, icon } from './icons.ts';
import {
  ACTIONS, CAST_MODES, PAD_ACTIONS, PAD_ACTION_NAMES, PAD_NAMES, PAD_START, POS_ACTIONS, RESERVED, UI_ACTIONS, UI_NAMES, getCastMode, isPos, isSlotMode, keyLabel, keyOf, padButtonName,
  onKeysChange, padActionAt, padButtonOf, resetKeys, resetPad, setCastMode, setKey, setPadButton, setSlotMode, slotSpell, whoUses, type Action, type AnyAction, type CastMode, type PadAction, type UiAction,
} from './keys.ts';
import { avatarPanel } from './avatar.ts';
import { RULES } from './rules-text.ts';
import { choice, dialog, showRules, toast } from './ui.ts';
import { radialPicker } from './radial-picker.ts';
import { assignTauntSlot, tauntWheelSlots } from './taunt-wheel.ts';
import { TAUNTS } from '../shared/taunts.ts';
import { previewTaunt, stopTauntPreview } from './sound.ts';
import { LANG, setLang, spellName, t, type Lang } from './i18n.ts';
import { isSpell } from '../shared/spells.ts';
import { store } from './store.ts';
import { MUSIC_TRACKS, musicTrack, setMusicTrack, type MusicTrack } from './sound.ts';

declare const __BUILD__: string;

// o que a tela atual oferece: apelido e som valem no menu inicial e na sala (volume obrigatório: toda tela que abre as Configurações
// passa o som, issue #128); efeitos visuais só existem dentro da sala
export type SettingsCtx = {
  name: () => string;
  rename: () => void;
  volumes: () => { sfx: number; music: number };
  setVolume: (kind: 'sfx' | 'music', value: number) => void;
  fxLite?: () => boolean;
  setFxLite?: (lite: boolean) => void;
  pixel?: () => number;
  setPixel?: (size: number) => void;
  closePanels?: () => void; // um painel por vez: abrir o menu fecha os do topo
};
let ctx: SettingsCtx = { name: () => '', rename: () => {}, volumes: () => ({ sfx: 0, music: 0 }), setVolume: () => {} };
export function setSettingsCtx(c: SettingsCtx) {
  ctx = c;
  if (overlay) draw();
}

// pixel art guardado: '0' desligado, '2' ou '3' px ('1' era o Ligado da primeira versão, de 2 px)
export const savedPixel = () => {
  const n = Number(store.get('warlock:pixel'));
  return n === 1 ? 2 : n === 2 || n === 3 ? n : 0;
};

const nameOf = (a: AnyAction) => (isPos(a) ? PAD_ACTION_NAMES[a] : a in UI_NAMES ? UI_NAMES[a as UiAction] : actionName(a as Action));
const padActionName = (p: PadAction) => {
  const s = p.startsWith('slot') ? slotSpell(Number(p.slice(4)) - 1) : undefined;
  return s ? `${PAD_ACTION_NAMES[p]} · ${spellName(s)}` : PAD_ACTION_NAMES[p];
};

// esperando a tecla (ou o botão do controle) nova
let waiting: AnyAction | null = null;
let padWaiting: PadAction | null = null;

function bindKey(a: AnyAction, code: string) {
  if (RESERVED.has(code)) return toast(t('Esc, Enter, Espaço e as setas ← → são fixas.', 'Esc, Enter, Space and the ← → arrows are fixed.'));
  const other = whoUses(code);
  setKey(a, code);
  if (other && other !== a) toast(t(`Tecla já usada por ${nameOf(other)}: as duas trocaram (${nameOf(other)} ficou com ${keyLabel(keyOf(other))}).`, `Key already used by ${nameOf(other)}: the two swapped (${nameOf(other)} now has ${keyLabel(keyOf(other))}).`));
}
function bindPad(a: PadAction, btn: number) {
  if (btn === PAD_START) return toast(t('Start é o Esc do controle e não muda.', 'Start is the controller\'s Esc and cannot be changed.'));
  const other = padActionAt(btn);
  setPadButton(a, btn);
  if (other && other !== a) toast(t(`Botão já usado por ${PAD_ACTION_NAMES[other]}: os dois trocaram (${PAD_ACTION_NAMES[other]} ficou com ${padButtonName(padButtonOf(other))}).`, `Button already used by ${PAD_ACTION_NAMES[other]}: the two swapped (${PAD_ACTION_NAMES[other]} now has ${padButtonName(padButtonOf(other))}).`));
}
function waitPad(a: PadAction | null) {
  padWaiting = a;
  setPadCapture(a && ((btn) => {
    if (padWaiting) bindPad(padWaiting, btn);
    padWaiting = null;
    draw();
  }));
  draw();
}

const keyRow = (a: AnyAction, label: (Node | string)[]) => el('div', { class: 'keys-row' }, el('span', {}, ...label),
  el('button', { type: 'button', class: 'keycap' + (waiting === a ? ' wait' : ''), 'aria-label': t(`Tecla de ${nameOf(a)}: ${keyLabel(keyOf(a))}`, `Key for ${nameOf(a)}: ${keyLabel(keyOf(a))}`), onclick: () => {
    waiting = waiting === a ? null : a;
    draw();
  } }, waiting === a ? t('aperte…', 'press…') : keyLabel(keyOf(a))));

function keysSection(): Node[] {
  return [
    el('p', { class: 'muted' }, t('Clique na tecla de uma ação e aperte a nova. Se outra ação já usava essa tecla, as duas trocam. Fica salvo neste navegador.', 'Click an action\'s key and press the new one. If another action already used that key, the two swap. Saved in this browser.')),
    el('h3', {}, 'Interface'),
    el('div', { class: 'keys-list' }, ...UI_ACTIONS.map((a) => keyRow(a, [UI_NAMES[a]]))),
    el('small', { class: 'muted' }, t('Fixas: Esc cancela a magia, fecha o que estiver aberto e abre este menu; Espaço segurado arrasta a câmera e sozinho volta ao centro; ← → trocam o período do placar e quem você assiste.', 'Fixed: Esc cancels the spell, closes whatever is open and opens this menu; holding Space drags the camera and tapping it recenters; ← → switch the scoreboard period and who you are watching.')),
    el('button', { type: 'button', onclick: () => resetKeys() }, t('Voltar ao padrão', 'Reset to default')),
  ];
}

// jeito de lançar pela tecla (os três do Dota) e o modo 1 2 3 4 Q W E R
const CAST_TEXT: Record<CastMode, [string, string]> = {
  quick: [t('Rápido', 'Quick'), t('A tecla lança na hora na direção do mouse, e o anel de alcance pisca ao lançar. Passe o mouse na magia da barra para ver o alcance antes.', 'The key casts instantly toward the mouse, and the range ring flashes as it casts. Hover a spell on the bar to see its range beforehand.')],
  release: [t('Ao soltar', 'On release'), t('Segure a tecla para ver o círculo de alcance; ao soltar, a magia sai. Esc cancela.', 'Hold the key to see the range circle; on release, the spell is cast. Esc cancels.')],
  click: [t('Com clique', 'With click'), t('A tecla escolhe a magia e mostra o alcance; o clique esquerdo lança (fora do alcance, vai até a borda). Botão direito ou Esc cancelam.', 'The key selects the spell and shows its range; left click casts (out of range, it goes to the edge). Right click or Esc cancels.')],
};
const check = (id: string, on: boolean, text: string, change: (on: boolean) => void) => el('label', { class: 'slot-row', for: id },
  el('input', { type: 'checkbox', id, checked: on, onchange: (e: Event) => change((e.target as HTMLInputElement).checked) }), el('span', {}, text));

// as teclas das magias moram em Lançamento, junto da caixa 1 2 3 4 Q W E R (Fernando, 20/10): com ela desligada, o botão "Teclas de cada
// magia" abre a lista (fica aberto quando o menu redesenha); ligada, as magias seguem a barra (sem itens ativos desde 21/10, #217)
let spellKeysOpen = false;
const actionRow = (a: Action) => keyRow(a, [icon(actionIcon(a)), ' ', nameOf(a)]);
function castSection(): Node[] {
  return [
    el('h3', {}, t('Lançar pela tecla', 'Casting with the key')),
    choice(t('Jeito de lançar', 'Casting mode'), CAST_MODES.map((k) => [k, CAST_TEXT[k][0]] as [CastMode, string]), getCastMode(), (k) => (setCastMode(k), draw())),
    el('p', { class: 'muted' }, CAST_TEXT[getCastMode()][1]),
    el('h3', {}, t('Teclas das magias', 'Spell keys')),
    check('slot-keys', isSlotMode(), t('1 2 3 4 Q W E R pela ordem da barra', '1 2 3 4 Q W E R in bar order'), (on) => (setSlotMode(on), draw())),
    el('p', { class: 'muted' }, t('Ligado, as magias usam a tecla da posição na barra (troque abaixo); desligado, cada magia tem a sua tecla.', 'When on, spells use the key of their position on the bar (change them below); when off, each spell has its own key.')),
    ...(isSlotMode()
      ? [el('h3', {}, t('Teclas das posições', 'Position keys')), el('div', { class: 'keys-list' }, ...POS_ACTIONS.map((p) => keyRow(p, [padActionName(p)])))]
      : [el('details', { class: 'spell-keys', open: spellKeysOpen, ontoggle: (e: Event) => (spellKeysOpen = (e.target as HTMLDetailsElement).open) },
        el('summary', {}, t('Teclas de cada magia', 'Key for each spell')),
        el('div', { class: 'keys-list' }, ...ACTIONS.map(actionRow)))]),
  ];
}

// som: lembra o volume de antes para o "Ligar o som" voltar onde estava
let beforeMute = { sfx: 1, music: 0.7 };
function soundSection(): Node[] {
  const { volumes, setVolume } = ctx;
  const slider = (kind: 'sfx' | 'music', label: string) => {
    const input = el('input', { type: 'range', id: 'vol-' + kind, min: 0, max: 100, step: 5, value: Math.round(volumes()[kind] * 100) }) as HTMLInputElement;
    const out = el('span', { class: 'vol-value' }, input.value + '%');
    input.addEventListener('input', () => {
      out.textContent = input.value + '%';
      setVolume(kind, Number(input.value) / 100);
      muteBtn.textContent = muteText();
    });
    return el('label', { class: 'vol-row', for: 'vol-' + kind }, el('span', {}, label), input, out);
  };
  const muted = () => volumes().sfx + volumes().music === 0;
  const muteText = () => (muted() ? t('Ligar o som', 'Turn sound on') : t('Silenciar tudo', 'Mute all'));
  const muteBtn = el('button', { type: 'button', onclick: () => {
    const next = muted() ? beforeMute : { sfx: 0, music: 0 };
    if (!muted()) beforeMute = { ...volumes() };
    setVolume('sfx', next.sfx);
    setVolume('music', next.music);
    draw();
  } }, muteText());
  return [slider('sfx', t('Efeitos', 'Effects')), slider('music', t('Música', 'Music')),
    el('div', { class: 'vol-row' }, el('span', {}, t('Música da partida', 'Match music')),
      choice(t('Música da partida', 'Match music'), (Object.keys(MUSIC_TRACKS) as MusicTrack[]).map((k) => [k, MUSIC_TRACKS[k]] as [MusicTrack, string]), musicTrack(), (k) => (setMusicTrack(k), draw()))),
    muteBtn];
}

function videoSection(): Node[] | null {
  const { fxLite, setFxLite, pixel, setPixel } = ctx;
  const pixelArt = pixel && setPixel ? [
    el('h3', {}, 'Pixel art'),
    choice('Pixel art', [[0, t('Desligado', 'Off')], [2, '2 px'], [3, '3 px']], pixel(), (size) => (setPixel(size), draw())),
    el('p', { class: 'muted' }, t('Desenha a arena e os magos em blocos de pixels, com contorno escuro nas bordas, como num jogo retrô: 2 px tem mais detalhe, 3 px é mais retrô. Nomes, vida e menus continuam iguais.', 'Draws the arena and the wizards in blocks of pixels, with a dark outline on the edges, like a retro game: 2 px has more detail, 3 px is more retro. Names, health and menus stay the same.')),
  ] : [];
  if (!fxLite || !setFxLite) return pixelArt.length ? pixelArt : null;
  return [
    el('h3', {}, t('Efeitos visuais', 'Visual effects')),
    choice(t('Efeitos visuais', 'Visual effects'), [[false, t('Completo', 'Full')], [true, t('Leve', 'Light')]], fxLite(), (lite) => (setFxLite(lite), draw())),
    el('p', { class: 'muted' }, t('Leve desliga o tremor da tela, a pausa no golpe forte e as partículas extras (bom para PC fraco e para quem enjoa). Começa no Leve quando o sistema pede menos movimento.', 'Light turns off the screen shake, the hit pause on heavy blows and the extra particles (good for weak PCs and for anyone who gets motion sick). It starts on Light when the system asks for less motion.')),
    ...pixelArt,
  ];
}

// desenho do controle: cada botão com a linha até o nome da ação; clicar escolhe a ação daquele botão e o próximo botão
// apertado no controle (ou clicado no desenho) fica com ela. No celular só o desenho e a lista abaixo.
// b: índice do botão no Gamepad API (o mesmo de PAD_NAMES: 0 = A, 9 = Start); x, y no desenho; row: linha do nome naquele lado
type PadSpot = { b: number; x: number; y: number; shape: 'round' | 'trigger' | 'bumper' | 'stick' | 'dpad' | 'pill'; side: 'l' | 'r'; row: number };
const SPOTS: PadSpot[] = [
  { b: 6, x: 270, y: 70, shape: 'trigger', side: 'l', row: 0 }, { b: 4, x: 270, y: 100, shape: 'bumper', side: 'l', row: 1 },
  { b: 8, x: 350, y: 172, shape: 'pill', side: 'l', row: 2 }, { b: 10, x: 268, y: 180, shape: 'stick', side: 'l', row: 3 },
  { b: 12, x: 322, y: 234, shape: 'dpad', side: 'l', row: 4 }, { b: 14, x: 300, y: 256, shape: 'dpad', side: 'l', row: 5 },
  { b: 15, x: 344, y: 256, shape: 'dpad', side: 'l', row: 6 }, { b: 13, x: 322, y: 278, shape: 'dpad', side: 'l', row: 7 },
  { b: 7, x: 490, y: 70, shape: 'trigger', side: 'r', row: 0 }, { b: 5, x: 490, y: 100, shape: 'bumper', side: 'r', row: 1 },
  { b: 9, x: 410, y: 172, shape: 'pill', side: 'r', row: 2 }, { b: 3, x: 492, y: 152, shape: 'round', side: 'r', row: 3 },
  { b: 1, x: 518, y: 178, shape: 'round', side: 'r', row: 4 }, { b: 2, x: 466, y: 178, shape: 'round', side: 'r', row: 5 },
  { b: 0, x: 492, y: 204, shape: 'round', side: 'r', row: 6 }, { b: 11, x: 438, y: 256, shape: 'stick', side: 'r', row: 7 },
];
const NS = 'http://www.w3.org/2000/svg';
const svg = (tag: string, attrs: Record<string, string | number>, ...kids: (Node | string)[]) => {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  e.append(...kids);
  return e;
};
function padDrawing(): Element {
  const body = svg('path', { class: 'pad-body', d: 'M250 120 Q380 104 510 120 Q565 128 585 200 L608 300 Q616 346 576 350 Q546 352 526 314 L500 280 L260 280 L234 314 Q214 352 184 350 Q144 346 152 300 L175 200 Q195 128 250 120 Z' });
  const spots = SPOTS.map((s) => {
    const p = padActionAt(s.b);
    const ly = 34 + s.row * 44;
    const lx = s.side === 'l' ? 150 : 610;
    const shape = s.shape === 'trigger' ? svg('rect', { x: s.x - 34, y: s.y - 12, width: 68, height: 22, rx: 9 })
      : s.shape === 'bumper' ? svg('rect', { x: s.x - 40, y: s.y - 8, width: 80, height: 15, rx: 7 })
      : s.shape === 'stick' ? svg('circle', { cx: s.x, cy: s.y, r: 24 })
      : s.shape === 'dpad' ? svg('rect', { x: s.x - 11, y: s.y - 11, width: 22, height: 22, rx: 4 })
      : s.shape === 'pill' ? svg('rect', { x: s.x - 15, y: s.y - 8, width: 30, height: 16, rx: 8 })
      : svg('circle', { cx: s.x, cy: s.y, r: 13 });
    const sel = (padWaiting && padButtonOf(padWaiting) === s.b) || false;
    const g = svg('g', { class: 'pad-btn' + (sel ? ' wait' : '') + (p ? '' : ' free'), 'data-btn': s.b, tabindex: 0, role: 'button',
      'aria-label': `${padButtonName(s.b)}: ${p ? padActionName(p) : s.b === PAD_START ? t('Esc do controle (configurações)', 'controller Esc (settings)') : t('livre', 'free')}` },
      svg('polyline', { class: 'pad-callout pad-line', points: `${s.x},${s.y} ${s.side === 'l' ? lx + 22 : lx - 22},${ly} ${lx},${ly}` }),
      shape,
      svg('text', { class: 'pad-glyph', x: s.x, y: s.y + 4 }, PAD_NAMES[s.b].length > 2 ? '' : PAD_NAMES[s.b]),
      svg('text', { class: 'pad-callout pad-label', x: s.side === 'l' ? lx - 4 : lx + 4, y: ly + 5, 'text-anchor': s.side === 'l' ? 'end' : 'start' },
        svg('tspan', { class: 'pad-key' }, padButtonName(s.b) + ' '), sel ? t('aperte…', 'press…') : p ? padActionName(p) : s.b === PAD_START ? 'Esc / menu' : t('livre', 'free')));
    g.addEventListener('click', () => clickSpot(s.b));
    g.addEventListener('keydown', (e) => (e as KeyboardEvent).key === 'Enter' && clickSpot(s.b));
    return g;
  });
  // no celular os nomes ficam na lista abaixo: o desenho corta as margens dos nomes e cresce
  const narrow = matchMedia('(max-width: 600px)').matches;
  return svg('svg', { class: 'pad-svg', viewBox: narrow ? '140 50 480 310' : '-80 0 920 380', role: 'group', 'aria-label': t('Botões do controle', 'Controller buttons') }, body, ...spots);
}
function clickSpot(b: number) {
  // esperando um botão: clicar em outro no desenho também vale (dá para trocar sem o controle na mão)
  if (padWaiting) {
    const a = padWaiting;
    waitPad(null);
    if (padButtonOf(a) !== b) bindPad(a, b);
    return draw();
  }
  const p = padActionAt(b);
  if (p) return waitPad(p);
  toast(b === PAD_START ? t('Start é o Esc do controle e não muda.', 'Start is the controller\'s Esc and cannot be changed.') : t('Esse botão está livre: escolha uma ação na lista e aperte este botão.', 'That button is free: pick an action in the list and press this button.'));
}

function padSection(): Node[] {
  return [
    check('pad-rumble', isRumbleOn(), t('Vibração do controle (golpe forte e morte)', 'Controller vibration (heavy hit and death)'), (on) => setRumble(on)),
    el('p', { class: 'muted' }, padWaiting ? t(`Aperte no controle o botão novo de ${PAD_ACTION_NAMES[padWaiting]} (ou clique nele no desenho). Esc cancela.`, `Press the new button for ${PAD_ACTION_NAMES[padWaiting]} on the controller (or click it in the drawing). Esc cancels.`)
      : t('Clique num botão do desenho ou da lista e aperte o botão novo no controle. Se outro já usava, os dois trocam. Start é o Esc do controle.', 'Click a button in the drawing or the list and press the new button on the controller. If another already used it, the two swap. Start is the controller\'s Esc.')),
    padDrawing(),
    el('div', { class: 'keys-list' }, ...PAD_ACTIONS.map((p) => el('div', { class: 'keys-row' }, el('span', {}, padActionName(p)),
      el('button', { type: 'button', class: 'keycap' + (padWaiting === p ? ' wait' : ''), onclick: () => waitPad(padWaiting === p ? null : p) },
        padWaiting === p ? t('aperte…', 'press…') : padButtonName(padButtonOf(p)))))),
    el('small', { class: 'muted' }, t('Nos menus o controle não muda: D-pad anda, A confirma, B volta, X desfaz ou vende, Y mostra a dica, LB e RB pulam grupos.', 'In menus the controller layout does not change: D-pad moves, A confirms, B goes back, X undoes or sells, Y shows the tip, LB and RB skip groups.')),
    el('button', { type: 'button', onclick: () => resetPad() }, t('Voltar ao padrão', 'Reset to default')),
  ];
}

// Idioma: Português / English; trocar recarrega a página (no meio da partida, volta para a sala pelo link)
export const langChoice = () => el('div', { class: 'keys-row' }, el('span', {}, 'Idioma / Language'),
  choice('Idioma / Language', [['pt', 'Português'], ['en', 'English']] as [Lang, string][], LANG, setLang));

function playerSection(): Node[] {
  return [
    el('div', { class: 'keys-row' }, el('span', {}, t('Apelido: ', 'Nickname: '), el('b', {}, ctx.name())), el('button', { type: 'button', onclick: () => {
      close();
      ctx.rename();
    } }, t('Trocar', 'Change'))),
  ];
}

function aboutSection(): Node[] {
  return [
    el('p', {}, el('b', {}, 'Warlock'), ` · ${t('versão', 'version')} ${typeof __BUILD__ === 'string' ? __BUILD__ : 'dev'}`),
    el('button', { type: 'button', onclick: () => {
      close();
      showRules();
    } }, icon(UI_ICON.help), ' ', t('Abrir o grimório (como jogar)', 'Open the grimoire (how to play)')),
    el('h3', {}, t('Créditos', 'Credits')),
    ...RULES.creditos.map((t) => el('p', { class: 'muted' }, t)),
  ];
}

function communicationSection(): Node[] {
  let slots = tauntWheelSlots(store.json('warlock:taunt-wheel'), TAUNTS.length);
  const labels = () => slots.map((i) => t(TAUNTS[i].text, TAUNTS[i].en));
  const editor = el('div', { class: 'taunt-editor', hidden: true });
  const edit = (position: number) => {
    wheel.choose(position);
    editor.hidden = false;
    editor.replaceChildren(el('h3', {}, t(`Trocar provocação da posição ${position + 1}`, `Change taunt in slot ${position + 1}`)),
      choice(t('Escolha uma provocação', 'Choose a taunt'), TAUNTS.map((x, i) => [i, t(x.text, x.en)]), slots[position], (index) => {
        void previewTaunt(TAUNTS[index].id).then((ok) => { if (!ok) toast(t('Não foi possível tocar esta provocação.', 'Could not play this taunt.'), 'bad'); });
        slots = assignTauntSlot(slots, position, index);
        store.set('warlock:taunt-wheel', JSON.stringify(slots));
        wheel.setLabels(labels());
        edit(position);
      }));
  };
  // Na roda o clique escolhe a vaga; no catálogo abaixo ele troca e toca só uma prévia privada.
  const wheel = radialPicker(el('b', {}, t('Sua roda de provocações', 'Your taunt wheel')), labels(), edit,
    () => { editor.hidden = true; wheel.reset(); },
    { inline: true, hint: t('Clique na posição e depois numa fala abaixo para trocar e ouvir a prévia.', 'Click a slot, then a line below to swap it and hear a preview.') });
  return [el('p', { class: 'muted' }, t('Escolha a ordem das provocações na roda, em sentido horário a partir de cima. Segure o atalho de Provocações (Y por padrão), aponte com o mouse e solte para falar.', 'Choose the order of the taunts on the wheel, clockwise from the top. Hold the Taunts shortcut (Y by default), point with the mouse and release to speak.')),
    wheel.panel, editor];
}

type Section = { id: string; title: string; icon: string; render: () => Node[] | null }; // null: a aba não aparece nesta tela
const SECTIONS: Section[] = [
  { id: 'teclas', title: t('Teclas', 'Keys'), icon: UI_ICON.keys, render: keysSection },
  { id: 'lancamento', title: t('Lançamento', 'Casting'), icon: UI_ICON.aim, render: castSection },
  { id: 'som', title: t('Som', 'Sound'), icon: UI_ICON.sound, render: soundSection },
  { id: 'comunicacao', title: t('Comunicação', 'Communication'), icon: UI_ICON.taunt, render: communicationSection },
  { id: 'video', title: t('Vídeo e efeitos', 'Video & effects'), icon: UI_ICON.video, render: videoSection },
  { id: 'controle', title: t('Controle', 'Controller'), icon: UI_ICON.pad, render: padSection },
  { id: 'jogador', title: t('Jogador', 'Player'), icon: UI_ICON.person, render: playerSection },
  { id: 'personagem', title: t('Personagem', 'Character'), icon: UI_ICON.person, render: () => [avatarPanel()] },
  { id: 'idioma', title: t('Idioma', 'Language'), icon: UI_ICON.taunt, render: () => [langChoice()] },
  { id: 'sobre', title: t('Sobre', 'About'), icon: UI_ICON.info, render: aboutSection },
];

// as seções empilhadas numa página, com o sumário fixo à esquerda e a seção visível destacada, como as opções do Dota 2 (issue #59 no
// menu inicial, #70 na partida); no celular o sumário recolhe no topo. No menu inicial Personagem vira atalho para a aba dele:
// a prévia 3D é uma só (avatarPanel) e sairia de lá
type Page = { body: HTMLElement; grid: HTMLElement; fill: () => void; jump: (id: string) => void };
let home: Page | null = null;
let modal: Page | null = null; // a página dentro do diálogo da partida
const charLink = () => [el('p', { class: 'muted' }, t('O visual do seu mago fica na aba Personagem.', 'Your wizard\'s look is in the Character tab.')),
  el('button', { type: 'button', onclick: () => document.getElementById('home-tab-char')?.click() }, icon(UI_ICON.person), ' ', t('Abrir a aba Personagem', 'Open the Character tab'))];
// scroller: quem rola a página (null = a janela, no menu inicial)
function stackedPage(scroller: HTMLElement | null, lobby: boolean): Page {
  const body = el('div', { class: 'settings-sections' });
  const narrow = matchMedia('(max-width: 600px)');
  const toc = el('details', { class: 'settings-toc', open: !narrow.matches }, el('summary', {}, t('Sumário', 'Contents')));
  narrow.addEventListener('change', (e) => (toc.open = !e.matches)); // girar o celular: no PC o sumário fica sempre aberto
  const mark = (id: string) => toc.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.id === id));
  // a seção que passa pela faixa de cima é a destacada; depois de um clique no sumário, o destaque fica na escolhida
  // enquanto a página rola (as últimas seções nem sempre chegam ao topo)
  let hold = 0;
  const spy = new IntersectionObserver((entries) => Date.now() > hold && entries.forEach((e) => e.isIntersecting && mark(e.target.id.slice(4))), { root: scroller, rootMargin: '0px 0px -70% 0px' });
  const fill = () => {
    const shown = SECTIONS.map((s) => [s, lobby && s.id === 'personagem' ? charLink() : s.render()] as const).filter(([, b]) => b);
    // fill troca a página inteira: devolve o foco ao campo pelo id (quem usa teclado não perde o lugar), por isso campo novo leva id fixo
    const focusId = (document.activeElement as HTMLElement | null)?.id;
    body.replaceChildren(...shown.map(([s, b]) => el('section', { class: 'settings-body', id: 'set-' + s.id, 'aria-labelledby': 'set-h-' + s.id },
      el('h3', { class: 'settings-page-title', id: 'set-h-' + s.id }, icon(s.icon), ' ', s.title), ...b!)));
    spy.disconnect();
    for (const sec of body.children) spy.observe(sec);
    if (focusId) document.getElementById(focusId)?.focus();
  };
  const jump = (id: string) => {
    hold = Date.now() + 1000;
    body.querySelector('#set-' + id)?.scrollIntoView({ block: 'start' });
    mark(id);
    if (narrow.matches) toc.open = false;
  };
  fill();
  toc.append(...SECTIONS.filter((s) => body.querySelector('#set-' + s.id)).map((s) => el('button', { type: 'button', 'data-id': s.id, onclick: () => jump(s.id) }, icon(s.icon), el('span', {}, s.title))));
  return { body, grid: el('div', { class: 'settings-grid' }, toc, body), fill, jump };
}
export function settingsPage(): HTMLElement {
  home = stackedPage(null, true);
  return el('div', { class: 'home-settings' }, el('h2', {}, t('Configurações', 'Settings')), home.grid);
}

let overlay: HTMLElement | null = null;
let close = () => {};

function draw() {
  if (home?.body.isConnected) home.fill();
  if (overlay) modal?.fill();
}

// abre na seção pedida (o atalho do volume abre em Som). No menu inicial as configurações já são uma aba: Esc e Start abrem ela
// (duas cópias da página repetiriam os ids dos campos)
export function openSettings(id?: string) {
  if (home?.body.isConnected) {
    document.getElementById('home-tab-settings')?.click();
    if (id) home.jump(id);
    return;
  }
  if (overlay) return id ? modal?.jump(id) : undefined;
  ctx.closePanels?.();
  const scroller = el('div', { class: 'settings-scroll' });
  modal = stackedPage(scroller, false);
  scroller.append(modal.grid);
  // com o menu aberto o jogo não recebe teclas (o que o navegador faz com Tab, Enter e setas continua)
  ({ overlay, close } = dialog('settings', t('Configurações', 'Settings'), [scroller], { onKey, onClose: () => {
    stopTauntPreview();
    waiting = null;
    if (padWaiting) waitPad(null);
    overlay = null;
    modal = null;
  } }));
  if (id) modal.jump(id);
  overlay.querySelector<HTMLElement>('.settings-toc button')?.focus({ preventScroll: true }); // focar rolando cortaria o pulo para a seção
}
// esperando tecla ou botão, a próxima tecla é da troca (preventDefault: o Esc só cancela, não fecha o diálogo)
function onKey(e: KeyboardEvent) {
  if (e.code === 'F1') e.preventDefault(); // não abre a ajuda do navegador
  if (padWaiting && e.code === 'Escape') {
    e.preventDefault();
    return waitPad(null);
  }
  if (waiting) {
    e.preventDefault();
    const a = waiting;
    waiting = null;
    if (e.code !== 'Escape') bindKey(a, e.code);
    draw();
  }
}
// página do menu inicial esperando tecla ou botão: a próxima tecla é dela (com o diálogo aberto, vale o ouvinte dele)
addEventListener('keydown', (e) => {
  if (overlay || !home?.body.isConnected || !(waiting || padWaiting)) return;
  e.stopImmediatePropagation();
  onKey(e);
}, { capture: true });
onKeysChange(draw);
