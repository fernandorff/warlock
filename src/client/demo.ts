// Demonstração animada do grimório: um canvas 2D visto de cima rodando a simulação de verdade (newWorld/stepWorld)
// com magos de treino e um roteiro fixo em loop. Como usa os números do jogo, a demo acompanha qualquer balanceamento.
import { SHAPES, type ArenaId } from '../shared/arena.ts';
import { BASIC_ATTACK, BRACE, DT, KNOCK_RECOVERY, OBSTACLES, PROJ_R, WIZ_R } from '../shared/constants.ts';
import { ITEMS, noItems, type ItemId } from '../shared/items.ts';
import { bracingActive, incapacitatedUntil, isStunned, newWorld, snowR, spellOf, stepWorld, type Cmd, type SimEvent, type Wizard, type World } from '../shared/sim.ts';
import { CAST_POINT, GRIP, METEOR_DELAY, SHIELD, isSpell, noSpells, spellLevel, type SpellId } from '../shared/spells.ts';
import { add, scale, v, type Vec } from '../shared/vec.ts';
import { LOCALE, spellName, t } from './i18n.ts';
import { electroPulse } from './screen-data.ts';

// alvo do passo: ponto fixo ou a posição atual do mago com esse índice
type At = Vec | number;
type Step = [t: number, who: number, what: SpellId | 'move' | 'basic' | 'braceOn' | 'braceOff', at: At];
type Script = { pos?: Vec[]; end: number; steps: Step[]; prep?: (w: World) => void };
export type DemoId = SpellId | ItemId | 'clash' | 'basic' | 'brace' | 'knockback';

const A = 0, B = 1, C = 2;
// arena menor que a de verdade para a lava aparecer no quadro
const DEMO_R = 6;
const RULES = { runes: false, sudden: false, chests: false };
// O roteiro espera os cipós reais antes de tentar andar e deixa a prisão visível antes do golpe que solta.
const GRIP_CAST_AT = .4;
const GRIP_ROOT_AT = GRIP_CAST_AT + CAST_POINT.grip + GRIP.delay;
// verde dos cipós do Agarrar: a marca no chão, o anel de quem está preso e as folhas
const VINE_COLOR = '#8ed64b';

// mago 0 é "você" (com a magia ou o item da página); 1 e 2 são de treino e só têm a Bola de fogo
export const SCRIPTS: Partial<Record<DemoId, Script>> = {
  knockback: { pos: [v(-3, 0), v(0, 0)], end: 3.5, steps: [[.4, A, 'fireball', B], [.85, B, 'move', v(0, 4)]], prep: (w) => { w.pillars = []; } },
  basic: { pos: [v(-2, 0), v(-1, 0), v(4, 0)], end: 3.5, steps: [[.4, A, 'basic', B], [1.8, A, 'basic', C]], prep: (w) => { w.pillars = []; } },
  // Renova o mesmo comando da partida: o preparo e a pausa vêm da simulação, não de uma animação inventada.
  brace: { pos: [v(-1, 0), v(3, 0)], end: 3.5,
    steps: ([...Array.from({ length: 19 }, (_, i): Step => [.4 + i * .1, A, 'braceOn', A]), [1.2, A, 'move', v(-1, 3)], [1.3, B, 'fireball', A], [2.3, A, 'braceOff', A], [2.6, A, 'move', v(-1, 3)]] as Step[]).sort((a, b) => a[0] - b[0]),
    prep: (w) => { w.pillars = []; w.wizards[A].cd.fireball = 5; } },
  fireball: { end: 3.2, steps: [[0.4, A, 'fireball', B]] },
  // Três inimigos mostram a cadeia100/50/25; o primeiro salto já exige o alcance fixo completo.
  lightning: { pos: [v(-4, 0), v(-1, 0), v(4, 0), v(4, 3)], end: 3.5, steps: [[0.4, A, 'lightning', B]], prep: (w) => { w.pillars = []; for (const z of w.wizards.slice(1)) z.cd.fireball = 3; } },
  homing: { end: 3.6, steps: [[0.2, B, 'move', v(2, 4)], [0.4, A, 'homing', B]] },
  shield: { pos: [v(-2, 0), v(2, 0), v(1, 3)], end: 3.2, steps: [[.2, C, 'meteor', A], [.3, B, 'fireball', A], [.6, A, 'shield', B]], prep: (w) => { w.pillars = []; w.wizards[C].spells.meteor = 1; } },
  teleport: { end: 2.4, steps: [[0.3, B, 'fireball', A], [0.75, A, 'teleport', v(-3, 3.5)]] },
  swap: { pos: [v(-4.6, 0), v(1, 0), v(1.6, 2)], end: 3.4, steps: [[0.4, A, 'swap', B], [1.3, A, 'fireball', B]] },
  grip: { pos: [v(-3, 0), v(2, 0), v(2.6, .9)], end: GRIP_ROOT_AT + 3.4, steps: [[GRIP_CAST_AT, A, 'grip', v(2.3, .45)], [GRIP_ROOT_AT + .2, B, 'move', v(2, 4)], [GRIP_ROOT_AT + .2, C, 'move', v(4, .9)], [GRIP_ROOT_AT + .3, B, 'teleport', v(2, 4)], [GRIP_ROOT_AT + .3, C, 'shield', C], [GRIP_ROOT_AT + 1, A, 'fireball', B], [GRIP_ROOT_AT + spellLevel('grip', 1).duration + .2, C, 'move', v(2.6, 3)]], prep: (w) => { w.wizards[B].spells.teleport = 1; w.wizards[C].spells.shield = 1; } },
  meteor: { pos: [v(-3, 0), v(2, 0), v(2.6, 0.9)], end: 3.8, steps: [[.4, A, 'meteor', v(2.3, .45)], [.4 + CAST_POINT.meteor + METEOR_DELAY + .2, B, 'move', v(2, 4)], [.4 + CAST_POINT.meteor + METEOR_DELAY + .2, B, 'fireball', A], [3.2, B, 'move', v(2, 4)]] },
  rush: { pos: [v(-3, 0), v(-0.6, 0.3), v(2.6, 1.6)], end: 3, steps: [[0.4, A, 'rush', v(1, 0)], [0.7, A, 'move', v(1, 3)], [1.2, C, 'fireball', A]] },
  cluster: { pos: [v(-3, 0), v(.5, .8), v(3, 0)], end: 3, steps: [[.25, C, 'fireball', A], [.4, A, 'cluster', v(3, 0)]], prep: (w) => { w.pillars = []; } },
  boomerang: { end: 3.4, steps: [[0.4, A, 'boomerang', B]] },
  thrust: { end: 2.6, steps: [[0.4, A, 'thrust', B]] },
  gravity: { end: 3.4, steps: [[0.4, A, 'gravity', v(2, 0.8)]] },
  rockpillar: { end: 2.6, steps: [[0.2, B, 'fireball', A], [0.3, A, 'rockpillar', v(-1.2, 0)]] },
  bouncer: { pos: [v(-3, 0), v(1.5, 0), v(2.5, 1.8)], end: 3, steps: [[0.4, A, 'bouncer', B]] },
  drain: { pos: [v(-3, 0), v(2, 0.6), v(2.6, -1.8)], end: 3.6, steps: [[0.4, A, 'drain', v(1.5, 0)]], prep: (w) => (w.wizards[A].hp = 700) },
  snowball: { pos: [v(-3, 0), v(-0.6, 0.1), v(0.3, -0.5)], end: 3, steps: [[0.4, A, 'snowball', v(1, 0)]] },
  illusion: { end: 3.2, steps: [[.1, A, 'move', v(-3, 3)], [.5, A, 'illusion', B], [.65, A, 'move', v(-1, -2)], [.8, B, 'homing', A]], prep: (w) => { w.pillars = []; w.wizards[B].spells.homing = 1; } }, // dono muda o destino; a cópia continua reta e engana o míssil.
  magnetize: { end: 3.4, steps: [[0.3, A, 'magnetize', B], [1.4, A, 'fireball', v(2, 1.3)]] },
  recharge: { end: 4.6, steps: [[0.4, A, 'recharge', B], ...[2.4, 2.7, 3, 3.3].map((t): Step => [t, A, 'recharge', B])] },
  alteration: { end: 2.6, steps: [[0.3, B, 'fireball', A], [0.5, A, 'alteration', B]] },
  link: { end: 3, steps: [[0.4, A, 'link', B]] },
  windwalk: { end: 3, steps: [[0.3, A, 'windwalk', B], [0.35, A, 'move', B]] },
  splitter: { pos: [v(-3, 0), v(2, 0), v(2.4, 1.3)], end: 3, steps: [[0.4, A, 'splitter', v(0.8, 0.3)]] },
  warpzone: { end: 3.4, steps: [[0.2, B, 'fireball', A], [0.3, A, 'warpzone', v(-0.6, 0)], [0.5, A, 'move', v(-3, 2.6)], [0.6, B, 'move', v(-1, 0.2)]] },
  scourge: { pos: [v(-3, 0), v(-2.2, 0.2), v(-3.6, 1.2)], end: 2.4, steps: [[0.4, A, 'scourge', A]] },
  pact: { end: 3.4, steps: [[0.3, A, 'pact', B], [0.6, A, 'fireball', B]] },
  aegis: { pos: [v(-1.5, 0), v(3.4, 0)], end: 3.6, steps: [[0.4, A, 'fireball', B]], prep: (w) => Object.assign(w.wizards[B], { hp: 320, aegis: true }) },
  clash: { pos: [v(-3, 0), v(2, 0), v(1, 2.4)], end: 3.8, steps: [[0.3, A, 'fireball', B], [0.3, B, 'fireball', A], [0.9, C, 'move', v(-0.5, 0)]] },
};

type DemoState = { w: World; script: Script; next: number; events: SimEvent[] };

// Rótulos seguem os estados reais para a prévia não sugerir que stun, prisão e postura têm o mesmo bloqueio.
export function demoStatus(w: World, z: Wizard): string[] {
  const left = (until: number) => Math.max(0, until - w.t).toLocaleString(LOCALE, { maximumFractionDigits: 1 });
  const labels: string[] = [];
  if (w.t < z.shieldUntil) labels.push(t(`dano 0 · empurrão/status ${Math.round(SHIELD.knock * 100)}%`, `damage 0 · knockback/status ${Math.round(SHIELD.knock * 100)}%`));
  if (isStunned(z)) labels.push(z.stunLeft === undefined ? t('atordoado durante o deslize · sem ações', 'stunned while sliding · no actions') : t(`atordoado ${Math.max(0, z.stunLeft).toLocaleString(LOCALE, { maximumFractionDigits: 1 })} s · sem ações`, `stunned ${Math.max(0, z.stunLeft).toLocaleString(LOCALE, { maximumFractionDigits: 1 })} s · no actions`));
  if (w.t < z.gripUntil) labels.push(t(`preso ${left(z.gripUntil)} s · sem mobilidade`, `gripped ${left(z.gripUntil)} s · no mobility`));
  if (w.t < z.slowUntil || z.zone & 1 || w.t < (z.electroUntil ?? 0)) labels.push(t('lentidão · caminhada reduzida', 'slow · reduced walking speed'));
  if (w.t < incapacitatedUntil(z, w.t)) labels.push(t('incapacitado · recargas pausadas', 'incapacitated · cooldowns paused'));
  if (z.zone & 2) labels.push(t('queimando · dano contínuo', 'burning · continuous damage'));
  if (w.t < z.magnetUntil && z.magnet > 0) labels.push(t('magnetizado · atrai projéteis', 'magnetized · attracts projectiles'));
  if (w.projectiles.some((p) => p.kind === 'link' && p.target === z.id)) labels.push(t('Elo · puxão', 'tether · pull'));
  if ((z.recoveryLeft ?? 0) > 1e-8) {
    const fraction = KNOCK_RECOVERY.start + KNOCK_RECOVERY.step * Math.floor((KNOCK_RECOVERY.seconds - z.recoveryLeft! + 1e-8) / KNOCK_RECOVERY.interval);
    labels.push(t(`recuperação · caminhada ${Math.round(fraction * 100)}%`, `recovery · walking ${Math.round(fraction * 100)}%`));
  }
  if (w.t < z.veilUntil) labels.push(t(`invisível ${left(z.veilUntil)} s`, `invisible ${left(z.veilUntil)} s`));
  if (bracingActive(w, z)) labels.push(t(`Manter base · resistência ${Math.round(BRACE.resistance * 100)}%`, `Hold ground · ${Math.round(BRACE.resistance * 100)}% resistance`));
  else if (w.t < (z.braceUntil ?? 0)) labels.push(t(`preparando base ${left(z.braceReadyAt!)} s`, `preparing stance ${left(z.braceReadyAt!)} s`));
  if (w.t < z.dashUntil) labels.push(t('avançando', 'dashing'));
  else if (w.t < z.rushUntil) labels.push(t('avanço encerrado · absorção ativa', 'dash ended · absorption active'));
  return labels;
}

export function demoWorld(id: DemoId): DemoState {
  const script = SCRIPTS[id]!;
  const pos = script.pos ?? [v(-3, 0), v(2, 0), v(2.6, 1.6)];
  const ids = pos.map((_, i) => String.fromCharCode(97 + i)); // roteiros com mais de três magos precisam de ids próprios.
  const spell = isSpell(id) ? { [id]: 1 } : {};
  const item = id in ITEMS ? { [id]: 1 } : {};
  const w = newWorld(ids, Object.fromEntries(ids.map((k, i) => [k, { ...noSpells(), ...(i === A ? spell : {}) }])), { a: { ...noItems(), ...item } }, 0, () => 0.5, false, {}, RULES, 'circle');
  w.arenaR = DEMO_R;
  w.shrinkAt = Infinity;
  w.wizards.forEach((z, i) => Object.assign(z, { pos: pos[i], invulnUntil: 0, facing: i === A ? 0 : Math.PI }));
  script.prep?.(w);
  return { w, script, next: 0, events: [] };
}

// um passo de simulação; os eventos do passo ficam em s.events (desenho e teste)
export function demoStep(s: DemoState) {
  const { w, script } = s;
  const cmds: Cmd[] = [];
  for (; s.next < script.steps.length && script.steps[s.next][0] <= w.t; s.next++) {
    const [, who, what, at] = script.steps[s.next];
    const id = w.wizards[who].id;
    const to = typeof at === 'number' ? { ...w.wizards[at].pos } : at;
    cmds.push(what === 'move' ? { id, kind: 'move', to } : what === 'braceOn' || what === 'braceOff' ? { id, kind: 'brace', on: what === 'braceOn' } : what === 'basic' ? { id, kind: 'basic', at: to, target: typeof at === 'number' ? w.wizards[at].id : undefined } : { id, kind: 'cast', spell: what, at: to });
  }
  stepWorld(w, cmds, () => 0.5);
  s.events = w.events;
}

// laço da demo: anima enquanto alive() for verdadeiro e para sozinho depois (página virada, dica fechada ou trocada);
// still: só o primeiro quadro, parado (movimento reduzido)
export function runDemo(tick: (now: number) => void, alive: () => boolean, still = false, raf: (f: (now: number) => void) => unknown = requestAnimationFrame) {
  const loop = (now: number) => {
    if (!alive()) return;
    tick(now);
    if (!still) raf(loop);
  };
  raf(loop);
}

// ---- desenho ----
type Fx = { e: SimEvent; until: number };
const PROJ_COLOR: Record<string, string> = {
  fireball: '#ff7a1a', homing: '#c38bff', cluster: '#ff9a3c', boomerang: '#ffd666', bouncer: '#7fe3ff', drain: '#ff4d6d', snowball: '#e8f6ff',
  magnetize: '#ff5ad1', recharge: '#7dff9a', link: '#d6d3cf', splitter: '#9ad0ff', shard: '#9ad0ff', grip: VINE_COLOR, swap: '#9be7ff',
  gravity: '#a06bff', meteor: '#ff5a1a', warpzone: '#8a7bff',
};
const ZONE_COLOR = { burn: 'rgba(255,106,26,.35)', slow: 'rgba(120,170,255,.32)', pull: 'rgba(170,110,255,.32)' };
const CLASH_COLOR: Record<string, string> = { fire: '#ff7a1a', arcane: '#78aaff', pulse: '#aa6eff', detonate: '#ffb347', pillar: '#d9c3a5', snow: '#e8f6ff' };

// lava em volta e a pedra: contorno da forma esticado pelo raio R (aqui e na página das arenas do grimório)
export function drawStone(ctx: CanvasRenderingContext2D, id: ArenaId, R: number, lineWidth: number) {
  ctx.fillStyle = '#2a0c06';
  ctx.fillRect(-50, -50, 100, 100);
  ctx.beginPath();
  for (const ring of SHAPES[id].outline) ring.forEach((p, i) => (i ? ctx.lineTo(p.x * R, p.y * R) : ctx.moveTo(p.x * R, p.y * R)));
  ctx.closePath();
  ctx.fillStyle = '#4a3a30';
  ctx.fill('evenodd');
  ctx.strokeStyle = '#ff6a1a';
  ctx.lineWidth = lineWidth;
  ctx.stroke();
}

export function createDemo(canvas: HTMLCanvasElement, id: DemoId, colors: string[]) {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ctx = canvas.getContext('2d')!;
  let s = demoWorld(id);
  let fx: Fx[] = [];
  let acc = 0;
  let last = 0;
  // mostra o roteiro, segura 0,8 s parado no fim e recomeça
  function tick(now: number) {
    acc = Math.min(acc + (last ? (now - last) / 1000 : 0), 5 * DT);
    last = now;
    while (acc >= DT) {
      acc -= DT;
      if (s.w.t > s.script.end + 0.8) {
        s = demoWorld(id);
        fx = [];
      }
      if (s.w.t > s.script.end) {
        s.w.t += DT; // pausa: o mundo fica parado no último quadro
        continue;
      }
      demoStep(s);
      for (const e of s.events) fx.push({ e, until: s.w.t + (e.k === 'hit' ? 0.8 : e.k === 'vines' ? .7 : e.k === 'clash' || e.k === 'scourge' ? 0.5 : 0.3) });
    }
    fx = fx.filter((f) => f.until > s.w.t);
    draw();
  }

  function draw() {
    const { w } = s;
    const dpr = Math.min(2, devicePixelRatio || 1);
    const cw = canvas.clientWidth, ch = canvas.clientHeight;
    if (canvas.width !== Math.round(cw * dpr) || canvas.height !== Math.round(ch * dpr)) [canvas.width, canvas.height] = [Math.round(cw * dpr), Math.round(ch * dpr)];
    const k = (Math.min(cw, ch) / 13) * dpr; // pixels por metro: a arena de 6 m inteira no quadro
    ctx.setTransform(k, 0, 0, k, canvas.width / 2, canvas.height / 2);
    drawStone(ctx, w.arena, w.arenaR, 0.08);
    if (id === 'lightning') text(spellName('lightning'), v(0, -4.8), '#cfe8ff', .4);
    for (const z of w.zones) circle(z.pos, z.r, ZONE_COLOR[z.kind]);
    for (const p of w.pillars) if (p.alive) circle(p.pos, OBSTACLES[p.kind].r, '#8a7a6a', '#d9c3a5');
    for (const p of w.projectiles) {
      const L = spellLevel(spellOf(p.kind), p.level);
      const col = PROJ_COLOR[p.kind] ?? '#fff';
      if (p.kind === 'meteor') {
        circle(p.pos, L.radius, 'rgba(255,90,26,.18)', col, true);
        circle(p.pos, L.radius * Math.max(0, 1 - (p.until - w.t) / METEOR_DELAY), 'rgba(255,90,26,.35)');
      } else if (p.kind === 'grip') {
        circle(p.pos, L.radius, 'rgba(100,180,50,.12)', VINE_COLOR, true);
        circle(p.pos, L.radius * Math.max(0, 1 - (p.until - w.t) / GRIP.delay), 'rgba(100,180,50,.3)');
      } else if (p.kind === 'warpzone') circle(p.pos, L.radius, 'rgba(138,123,255,.25)', col);
      else if (p.kind === 'illusion') {
        // a cópia: um mago meio apagado na cor do dono
        ctx.globalAlpha = 0.5;
        circle(p.pos, WIZ_R, colors[w.wizards.findIndex((z) => z.id === p.owner) % colors.length], '#1a0c08');
        ctx.globalAlpha = 1;
        text(t('cópia · recebe empurrão', 'copy · takes knockback'), v(p.pos.x, p.pos.y - .75), '#9be7ff', .25);
      } else if (p.kind === 'gravity') {
        circle(p.pos, L.radius, 'rgba(160,107,255,.15)', col, true);
        circle(p.pos, PROJ_R * 1.4, col);
      } else {
        if (p.kind === 'link') line(w.wizards.find((z) => z.id === p.owner)?.pos ?? p.pos, p.pos, col, 0.05);
        circle(p.pos, p.kind === 'snowball' ? snowR(p.level) : p.kind === 'shard' ? PROJ_R * 0.7 : PROJ_R, col);
      }
    }
    w.wizards.forEach((z, i) => {
      if (!z.alive) return;
      if (z.basicCasting) {
        circle(z.pos, .6, null, '#9be7ff');
        const left = Math.max(0, z.basicCasting.fireAt - w.t);
        text(t('preparo ', 'windup ') + left.toLocaleString(LOCALE, { maximumFractionDigits: 1 }) + ' s', v(z.pos.x, z.pos.y + 1), '#9be7ff', .28);
        circle(z.pos, .15 + .25 * (1 - left / BASIC_ATTACK.windup), 'rgba(155,231,255,.3)');
      }
      if ((id === 'lightning' && i !== A) || (id === 'brace' && i === A)) {
        const cd = Math.max(0, z.cd.fireball - w.t).toLocaleString(LOCALE, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
        text(t(`recarga: ${cd} s`, `cooldown: ${cd} s`), v(z.pos.x, z.pos.y + 1.15), '#c4a693', .25);
      }
      if (w.t < (z.electroUntil ?? 0)) {
        ctx.globalAlpha = electroPulse(true, w.t, reduced);
        circle(z.pos, WIZ_R + .2, '#6ee6ff', '#6ee6ff');
        ctx.globalAlpha = 1;
        text(t('lento · recargas pausadas', 'slowed · cooldowns paused'), v(z.pos.x, z.pos.y + .8), '#6ee6ff', .25);
      }
      ctx.globalAlpha = w.t < z.windUntil || w.t < z.veilUntil ? 0.35 : 1; // no véu, quem treina ainda vê o próprio mago como no Windwalk
      if (w.t < z.shieldUntil) circle(z.pos, z.shieldR, 'rgba(255,214,102,.15)', '#ffd666');
      if (w.t < z.alterUntil) circle(z.pos, spellLevel('alteration', z.spells.alteration || 1).radius, 'rgba(110,230,255,.12)', '#6ee6ff', true);
      if (w.t < z.gripUntil) vines(z.pos, WIZ_R + .18);
      if (isStunned(z)) circle(z.pos, WIZ_R + .3, null, '#ffd666', true);
      if (bracingActive(w, z)) {
        circle(z.pos, WIZ_R + .12, null, '#9be7ff');
        // Silhueta esquemática de braço apoiado: a pose 3D continua sendo a do jogo, não reproduzida por este canvas.
        line(z.pos, add(z.pos, v(.55, .3)), '#9be7ff', .12);
        circle(add(z.pos, v(.55, .3)), .1, '#9be7ff');
      }
      if (w.t < z.slowUntil) circle(z.pos, WIZ_R + 0.1, null, '#78aaff');
      if (w.t < z.magnetUntil) circle(z.pos, WIZ_R + 0.22, null, z.magnet > 0 ? '#ff5ad1' : '#9be7ff', true);
      if (w.t < z.rushUntil) circle(z.pos, WIZ_R + 0.12, null, '#ffb347');
      circle(z.pos, WIZ_R, colors[i % colors.length], i === A ? '#ffd666' : '#1a0c08');
      line(z.pos, add(z.pos, scale(v(Math.cos(z.facing), Math.sin(z.facing)), WIZ_R)), '#1a0c08', 0.06);
      // vida em cima do mago
      ctx.fillStyle = '#1a0c08';
      ctx.fillRect(z.pos.x - 0.45, z.pos.y - 0.7, 0.9, 0.12);
      ctx.fillStyle = z.hp / z.hpMax > 0.35 ? '#6fdc8c' : '#ff6a4d';
      ctx.fillRect(z.pos.x - 0.45, z.pos.y - 0.7, 0.9 * Math.max(0, z.hp / z.hpMax), 0.12);
      ctx.globalAlpha = 1;
      text(i === A ? t('você', 'you') : t('treino', 'practice'), v(z.pos.x, z.pos.y - 0.85), i === A ? '#ffd666' : '#c4a693', 0.32);
      demoStatus(w, z).forEach((label, index) => text(label, v(z.pos.x, z.pos.y + 1.5 + index * .3), '#fff2a0', .22));
    });
    for (const { e, until } of fx) {
      const life = until - w.t;
      if (e.k === 'lightning') line(e.from, e.to, '#cfe8ff', 0.09);
      else if (e.k === 'vines') {
        circle(v(e.x, e.y), e.r, null, VINE_COLOR);
        ctx.globalAlpha = Math.min(1, life / .3);
        vines(v(e.x, e.y), e.r);
        ctx.globalAlpha = 1;
      }
      else if (e.k === 'teleport') line(e.from, e.to, 'rgba(255,214,102,.6)', 0.05, true);
      else if (e.k === 'reflect') circle(v(e.x, e.y), 0.5, null, '#ffd666');
      else if (e.k === 'scourge' || e.k === 'clash') circle(v(e.x, e.y), e.r, null, e.k === 'clash' ? CLASH_COLOR[e.combo] : '#ff6a4d');
      else if (e.k === 'hit' && e.dmg > 0.5) text('−' + Math.round(e.dmg), v(e.x, e.y - 1.1 - (0.8 - life) * 0.8), '#fff2a0', 0.42);
      else if (e.k === 'death') text('✕', w.wizards.find((z) => z.id === e.id)?.pos ?? v(0, 0), '#ff6a4d', 0.6);
    }
  }

  function vines(at: Vec, radius: number) {
    for (let i = 0; i < 6; i++) {
      const a = i * Math.PI / 3;
      ctx.beginPath();
      ctx.moveTo(at.x + Math.cos(a) * radius, at.y + Math.sin(a) * radius);
      ctx.quadraticCurveTo(at.x + Math.cos(a + .6) * radius, at.y + Math.sin(a + .6) * radius,
        at.x + Math.cos(a + 1.4) * radius * .35, at.y + Math.sin(a + 1.4) * radius * .35);
      ctx.strokeStyle = '#6eaf34'; ctx.lineWidth = .07; ctx.stroke();
      circle(v(at.x + Math.cos(a + .5) * radius * .65, at.y + Math.sin(a + .5) * radius * .65), .07, VINE_COLOR);
    }
  }

  function circle(c: Vec, r: number, fill: string | null, stroke?: string, dashed = false) {
    if (r <= 0) return;
    ctx.beginPath();
    ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fill();
    }
    if (stroke) {
      ctx.setLineDash(dashed ? [0.15, 0.12] : []);
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 0.05;
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }
  function line(a: Vec, b: Vec, color: string, width: number, dashed = false) {
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.setLineDash(dashed ? [0.2, 0.15] : []);
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.stroke();
    ctx.setLineDash([]);
  }
  function text(t: string, at: Vec, color: string, size: number) {
    ctx.font = `700 ${size}px "Alegreya Sans", sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillStyle = color;
    ctx.fillText(t, at.x, at.y);
  }

  return { tick };
}
