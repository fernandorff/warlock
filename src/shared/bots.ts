// Bots: usam qualquer magia e item ativo que tiverem e compram seguindo um plano sorteado no começo da partida.
import { edge, inArena, inward, pathStep, roomAt, safeInside } from './arena.ts';
import { DT, FRICTION, ISLAND, OBSTACLES, PROJ_R, WIZ_R } from './constants.ts';
import type { Cmd, Projectile, Wizard, World } from './sim.ts';
import { ITEM_IDS, itemPrice, type ItemId } from './items.ts';
import { CAST_POINT, FREE_SPELLS, GRIP, MAX_SPELLS, METEOR_DELAY, SPELL_IDS, priceOf, spellCount, spellLevel, type SpellId } from './spells.ts';
import { add, clampLen, dist, dot, len, norm, scale, sub, v, type Vec } from './vec.ts';

export type BotPick = { kind: 'spell'; id: SpellId } | { kind: 'item'; id: ItemId };
// plano de compras: o que comprar, na ordem; depois da lista, como gastar o resto (menor nível, ordem do plano ou sorteio)
export type BotPlan = { buys: BotPick[]; upgrade: 'lowest' | 'first' | 'random' };
type Buyer = { gold: number; spells: Record<SpellId, number>; items?: Record<ItemId, number>; plan?: BotPlan };

// o bot antigo: 5 magias fixas, depois defesa, depois a magia de menor nível
export const CLASSIC_PLAN: BotPlan = {
  buys: [
    ...(['lightning', 'homing', 'meteor', 'cluster', 'shield'] as SpellId[]).map((id): BotPick => ({ kind: 'spell', id })),
    ...(['armor', 'ring', 'boots', 'cape'] as ItemId[]).map((id): BotPick => ({ kind: 'item', id })),
  ],
  upgrade: 'lowest',
};

function shuffle<T>(a: T[], rand: () => number): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// sorteia 2 a 6 magias (além da Bola de fogo e do Flagelo, até encher as 8) e 0 a 3 itens, em ordem sorteada (sempre começa por uma magia)
export function randomPlan(rand: () => number): BotPlan {
  const spells = shuffle(SPELL_IDS.filter((s) => !FREE_SPELLS.includes(s)), rand).slice(0, 2 + Math.floor(rand() * (MAX_SPELLS - FREE_SPELLS.length - 1)));
  const items = shuffle([...ITEM_IDS], rand).slice(0, Math.floor(rand() * 4));
  const buys: BotPick[] = spells.map((id) => ({ kind: 'spell', id }));
  for (const id of items) buys.splice(1 + Math.floor(rand() * buys.length), 0, { kind: 'item', id });
  return { buys, upgrade: (['lowest', 'first', 'random'] as const)[Math.floor(rand() * 3)] };
}

// combinação que funciona (Normal e Difícil, 18/10): 1 ou 2 magias de dano, 1 de fuga ou defesa, às vezes 1 de controle,
// e 1 ou 2 itens úteis; tudo sorteado dentro de cada grupo para os bots não ficarem iguais
const DAMAGE: SpellId[] = ['lightning', 'homing', 'meteor', 'cluster', 'boomerang', 'bouncer', 'snowball', 'drain', 'splitter', 'gravity', 'thrust'];
const ESCAPE: SpellId[] = ['shield', 'teleport', 'rush', 'windwalk', 'alteration', 'warpzone', 'rockpillar', 'illusion'];
const CONTROL: SpellId[] = ['grip', 'link', 'magnetize'];
const GEAR: ItemId[] = ['armor', 'ring', 'boots', 'cape', 'vampire', 'lava_boots', 'warden'];
export function smartPlan(rand: () => number): BotPlan {
  const take = <T>(a: T[], n: number) => shuffle([...a], rand).slice(0, n);
  const [first, ...more] = take(DAMAGE, 1 + Math.floor(rand() * 2));
  // o Pacto era 1 de 8 itens úteis (1 ou 2 sorteados): virou magia em 21/10 (#217) com chance parecida
  const spells = [first, ...take(ESCAPE, 1), ...more, ...(rand() < 0.5 ? take(CONTROL, 1) : []), ...(rand() < 0.2 ? ['pact' as const] : [])];
  const items = take(GEAR, 1 + Math.floor(rand() * 2));
  // dano e fuga primeiro; os itens entre as outras magias
  const buys: BotPick[] = spells.map((id) => ({ kind: 'spell', id }));
  items.forEach((id, i) => buys.splice(2 + i * 2, 0, { kind: 'item', id }));
  return { buys, upgrade: rand() < 0.5 ? 'first' : 'lowest' };
}

// quem escolhe o plano de cada bot novo: null = pela dificuldade (o simulador de balanceamento fixa randomPlan)
export const botConfig = { planner: null as ((rand: () => number) => BotPlan) | null };

// uma compra por chamada; null = nada a comprar agora (ou guardando ouro para o próximo do plano)
export function botBuy(p: Buyer, rand: () => number = Math.random, D: BotSkill = BOT_SKILL.normal): BotPick | null {
  // os bots são recriados a cada partida, então o plano é sorteado uma vez por partida
  const plan = (p.plan ??= (botConfig.planner ?? (rand() < D.smart ? smartPlan : randomPlan))(rand));
  const level = (b: BotPick) => (b.kind === 'spell' ? p.spells[b.id] : (p.items?.[b.id] ?? 0));
  const price = (b: BotPick) =>
    b.kind === 'spell' ? (p.spells[b.id] === 0 && spellCount(p.spells) >= MAX_SPELLS ? null : priceOf(b.id, p.spells[b.id])) : p.items ? itemPrice(p.items, b.id) : null;
  const next = plan.buys.find((b) => level(b) === 0 && price(b) !== null);
  if (next) return price(next)! <= p.gold ? next : null;
  const seen = new Set<string>();
  const all: BotPick[] = [...plan.buys, ...SPELL_IDS.map((id): BotPick => ({ kind: 'spell', id })), ...(p.items ? ITEM_IDS.map((id): BotPick => ({ kind: 'item', id })) : [])];
  const ups = all.filter((b) => level(b) > 0 && (price(b) ?? Infinity) <= p.gold && !seen.has(b.kind + b.id) && seen.add(b.kind + b.id));
  if (!ups.length) return null;
  if (plan.upgrade === 'random') return ups[Math.floor(rand() * ups.length)];
  if (plan.upgrade === 'lowest') ups.sort((a, b) => level(a) - level(b));
  return ups[0];
}

// dificuldade dos bots (opção da sala). Decisões do Fernando (18/10): bot com jeito de gente, valores Fácil / Normal / Difícil
export type BotSkill = {
  aim: number; // erro de lado máximo da mira (m)
  lag: number; // a mira usa onde o alvo estava há lag s, andando como andava (o bot não sabe para onde o outro clicou)
  delay: number; // tempo de reação (s): projétil que surgiu há menos que isso, ou alvo aberto há menos que isso, o bot ainda não viu
  waitMin: number; // a magia só entra em jogo entre waitMin e waitMax s depois que a recarga acaba (sorteado a cada recarga)
  waitMax: number;
  rate: number; // decisões por segundo
  dodge: number; // chance de sair andando do tiro que vai acertar
  shield: number; // chance de Escudo nesse tiro
  react: number; // multiplica a chance das outras reações (Teleporte, Raio no míssil, Investida...)
  cast: number; // chance de lançar quando tem jogada (19/10: Fácil 0,4 → 0,7; hesitava tanto que 70% das rodadas passavam de 2 min)
  combo: number; // chance de emendar dano no alvo aberto (preso, lento, puxado)
  range: number; // distância preferida do alvo (m)
  flee: number; // por quantos s foge de quem acabou de acertá-lo
  hunt: number; // chance de preferir quem tem < 40% de vida, está a < 2 m da lava ou lidera o placar (a até 8 m)
  edge: number; // distância da lava em que volta para o meio (m)
  slip: number; // chance de errar na decisão: lança torto (até 45°) ou fica parado 0,5 s
  vision: number; // só vê projéteis e inimigos até essa distância (m)
  loot: number; // vai atrás de ouro, baú e runa até essa distância (m; 0 = só pega se passar por cima)
  lootSafe: number; // ...se não houver inimigo mais perto que isso (m; 0 = não liga)
  smart: number; // chance de comprar uma combinação que funciona (senão sorteia o plano)
};
const BASE = {
  easy: { aim: 1.5, lag: 0.3, delay: 0.6, waitMin: 2, waitMax: 4, rate: 1.5, dodge: 0.3, shield: 0.12, react: 0.35, cast: 0.7, combo: 0.3, range: 6, flee: 1, hunt: 0, edge: 1, slip: 0.2, vision: 10, loot: 0, lootSafe: 0, smart: 0 },
  normal: { aim: 1, lag: 0.3, delay: 0.4, waitMin: 1, waitMax: 2, rate: 2.5, dodge: 0.55, shield: 0.35, react: 1, cast: 0.7, combo: 0.6, range: 4.5, flee: 0, hunt: 0, edge: 1.5, slip: 0.08, vision: 12, loot: 5, lootSafe: 4, smart: 1 },
  hard: { aim: 0.6, lag: 0.3, delay: 0.25, waitMin: 0.5, waitMax: 1, rate: 4, dodge: 0.8, shield: 0.52, react: 1.5, cast: 0.9, combo: 0.9, range: 3, flee: 0, hunt: 1, edge: 2, slip: 0.02, vision: 15, loot: 8, lootSafe: 0, smart: 1 },
} satisfies Record<string, BotSkill>;
// k de −1 (Fácil) a 1 (Difícil), 0 = Normal; o modo Automático usa os valores do meio (as chances também se misturam)
export function skillAt(k: number): BotSkill {
  const to: BotSkill = k < 0 ? BASE.easy : BASE.hard;
  const t = Math.min(1, Math.abs(k));
  return Object.fromEntries(Object.entries(BASE.normal).map(([key, n]) => [key, n * (1 - t) + to[key as keyof BotSkill] * t])) as BotSkill;
}
// Casual e Veterano na metade do caminho entre os vizinhos (Fernando, 21/10: mais 2 níveis de dificuldade com valores intermediários)
export const BOT_SKILL = { easy: BASE.easy, casual: skillAt(-0.5), normal: BASE.normal, veteran: skillAt(0.5), hard: BASE.hard };
// pensa D.rate vezes por segundo; i espalha os bots para não pensarem todos no mesmo passo
export function botThinks(step: number, i: number, D: BotSkill): boolean {
  const n = Math.max(1, Math.round(1 / (DT * D.rate)));
  return step % n === i % n; // n ≥ 15 (4 por s): 8 bots em passos diferentes
}

// memória dos bots, por mundo (some com a rodada): onde cada mago esteve no último 1 s (gravado a cada passo), quando cada bot
// viu cada alvo aberto ('bot>alvo'), quando cada magia volta a valer ('bot>magia'), parado por erro até, parado desde,
// onde viu um inimigo por último e a folga da lava aceita no caminho que está seguindo
type Mind = {
  seen: Map<string, { t: number; pos: Vec }[]>; opened: Map<string, number>; usable: Map<string, { cd: number; at: number }>;
  frozen: Map<string, number>; idle: Map<string, number>; last: Map<string, { t: number; pos: Vec }>; route: Map<string, number>;
};
const minds = new WeakMap<World, Mind>();
const mind = (w: World): Mind =>
  minds.get(w) ?? minds.set(w, { seen: new Map(), opened: new Map(), usable: new Map(), frozen: new Map(), idle: new Map(), last: new Map(), route: new Map() }).get(w)!;
// a cópia da Ilusão vista pelos bots: um mago com id próprio (a mira segue o caminho dela, não o do dono)
const decoyId = (p: Projectile) => p.owner + '~' + p.id;
// a cada passo da partida: o que os bots enxergam (a mira usa onde o alvo estava um instante atrás)
export function botWatch(w: World) {
  const seen = mind(w).seen;
  const keep = (id: string, pos: Vec) => {
    const h = seen.get(id) ?? seen.set(id, []).get(id)!;
    h.push({ t: w.t, pos: v(pos.x, pos.y) });
    while (h[0].t < w.t - 1) h.shift();
  };
  for (const z of w.wizards) keep(z.id, z.pos);
  for (const p of w.projectiles) if (p.kind === 'illusion') keep(decoyId(p), p.pos);
}

// projétil inimigo que vai passar perto de `me` em até 0,6 s (ou meteoro caindo em cima) e em quanto tempo;
// visible: o que este observador enxerga (o bot, com tempo de reação e alcance; a medição do jeito de jogar, tudo)
export function threatTo(w: World, me: Wizard, visible: (p: Projectile) => boolean): { p: Projectile; t: number } | null {
  let threat: Projectile | null = null;
  let tHit = Infinity;
  for (const p of w.projectiles) {
    if (!visible(p)) continue;
    const owner = w.wizards.find((z) => z.id === p.owner);
    // não ameaçam: Gravidade (só puxa), Zona de dobra (parada), cópia da Ilusão, cura do Drenar e volta da Recarga, Elo já preso
    if ((owner && (owner === me || (me.team !== null && owner.team === me.team))) || p.kind === 'gravity' || p.kind === 'warpzone' || p.kind === 'illusion' || (p.back && (p.kind === 'drain' || p.kind === 'recharge'))) continue;
    if (p.kind === 'link' && (p.target || p.pillar !== undefined)) continue;
    if (p.kind === 'meteor' || p.kind === 'grip') {
      if (dist(p.pos, me.pos) < spellLevel(p.kind, p.level).radius + WIZ_R && p.until - w.t < tHit) [threat, tHit] = [p, p.until - w.t];
      continue;
    }
    const rel = sub(me.pos, p.pos);
    // Míssil teleguiado em mim faz curva: a previsão em linha reta não serve, reage pela distância
    if (p.kind === 'homing' && p.target === me.id && dot(p.vel, rel) > 0) {
      const t = len(rel) / Math.max(1, len(p.vel));
      if (t < 0.5 && t < tHit) [threat, tHit] = [p, t];
    }
    const vv = dot(p.vel, p.vel);
    const t = vv > 1e-6 ? dot(rel, p.vel) / vv : -1;
    if (t < 0 || t > 0.6 || t >= tHit || len(sub(rel, scale(p.vel, t))) > WIZ_R + PROJ_R + 0.25) continue;
    [threat, tHit] = [p, t];
  }
  return threat ? { p: threat, t: tHit } : null;
}

export function botCmds(w: World, id: string, rand: () => number, D: BotSkill = BOT_SKILL.normal, scores: Record<string, number> = {}): Cmd[] {
  const me = w.wizards.find((z) => z.id === id && z.alive);
  if (!me) return [];
  if ((me.geyserLeft ?? 0) > 0) return [];
  const M = mind(w);
  if (w.t < (M.frozen.get(id) ?? -1)) return []; // parado por erro
  const cmds: Cmd[] = [];
  const ally = (z: Wizard) => z === me || (me.team !== null && z.team === me.team);
  // a magia só entra em jogo um tempo depois que a recarga acaba; a que ainda não foi lançada na rodada já vale
  const usableAt = (s: SpellId) => {
    if (me.cd[s] <= 0) return me.cd[s];
    const key = id + '>' + s;
    let u = M.usable.get(key);
    if (!u || u.cd !== me.cd[s]) M.usable.set(key, (u = { cd: me.cd[s], at: me.cd[s] + D.waitMin + rand() * (D.waitMax - D.waitMin) }));
    return u.at;
  };
  // Aproveita o véu inteiro para reposicionar; outra magia revelaria o bot.
  const veiled = w.t < me.veilUntil;
  const ready = (s: SpellId) => !veiled && me.spells[s] > 0 && w.t >= me.cd[s] && w.t >= usableAt(s);
  // Flagelo e Pacto eram itens e saíam sem a espera humana de `ready` (usableAt): ficam assim para não mudar o jeito dos bots
  const free = (s: SpellId) => !veiled && me.spells[s] > 0 && w.t >= me.cd[s];
  // dentro da pedra com folga (a forma da arena vem de arena.ts); into = direção para dentro a partir do bot
  const inside = (p: Vec, margin: number) => inArena(w, p, margin);
  const into = inward(w, me.pos);
  const jitter = (r: number): Vec => v((rand() - 0.5) * r, (rand() - 0.5) * r);
  // reação com chance base k (1 = sempre): o Fácil reage menos e o Difícil mais; com k = 1 o Normal nem sorteia
  const reacts = (k: number) => (k >= 1 && D.react >= 1) || rand() < k * D.react;
  // erro humano nesta decisão: lança torto (até 45°) ou fica parado 0,5 s
  const slip = rand() < D.slip ? (rand() < 0.5 ? 'freeze' : 'turn') : null;
  const turn = slip === 'turn' ? ((rand() * 2 - 1) * Math.PI) / 4 : 0;
  // um só lançamento por chamada: um segundo comando de magia no mesmo passo cancelaria o primeiro
  const cast = (spell: SpellId, at: Vec) => {
    const r = sub(at, me.pos), c = Math.cos(turn), s = Math.sin(turn);
    cmds.push({ id, kind: 'cast', spell, at: turn ? add(me.pos, v(r.x * c - r.y * s, r.x * s + r.y * c)) : at });
    return cmds;
  };
  if (ready('heal')) {
    const L = spellLevel('heal', me.spells.heal);
    const hurt = w.wizards.filter(z => z.alive && ally(z) && z.hpMax - z.hp >= L.heal && dist(z.pos, me.pos) <= L.range * me.rangeF)
      .sort((a, b) => a.hp / a.hpMax - b.hp / b.hpMax)[0];
    if (hurt) return cast('heal', hurt.pos);
  }
  // folga da lava que o bot quer aqui (numa ponte ou faixa estreita, o que a pedra deixa; seguindo um caminho estreito,
  // a folga com que o planejou, senão voltaria na boca da ponte); perto da borda não congela
  const fear = Math.max(0.3, Math.min(roomAt(w, me.pos, D.edge), M.route.get(id) ?? Infinity));
  M.route.delete(id);
  if (slip === 'freeze' && inside(me.pos, fear)) {
    M.frozen.set(id, w.t + 0.5);
    // hesitar não é apertar S: conjurando, só fica parado (o S cancelaria a magia)
    return me.casting ? [] : [{ id, kind: 'stop' }];
  }

  // projétil que acabou de surgir ainda não deu tempo de ver; longe demais, o bot não enxerga
  const seen = (p: Projectile) => w.t - (p.born ?? -Infinity) >= D.delay && dist(p.pos, me.pos) <= D.vision;
  const th = threatTo(w, me, seen);
  const threat = th?.p ?? null;
  const tHit = th?.t ?? Infinity;
  // o Flagelo em preparo não deixa sair nada além do Teleporte
  const winding = me.casting?.spell === 'scourge';
  if (threat) {
    const meteor = threat.kind === 'meteor' || threat.kind === 'grip'; // áreas paradas pedem esquiva radial
    const side = meteor ? norm(sub(me.pos, threat.pos)) : norm(v(-threat.vel.y, threat.vel.x));
    const away = meteor || dot(side, into) > 0 ? side : scale(side, -1); // de lado, para o lado de dentro
    // reação humana: o escudo não sobe sempre nem no último instante (o bot perfeito inflava o Escudo para 1,89×); com o tempo de reação
    // (18/10) o tiro de perto já passa sem ser visto, então a chance volta a 35% (era 15% sem o tempo de reação)
    if (!meteor && !winding && ready('shield') && tHit > 0.15 && tHit < 0.5 && rand() < D.shield) return cast('shield', me.pos);
    // Ilusão (mesma chance do Escudo): a cópia anda para o tiro e o pega no lugar do bot, que sai de lado
    if (!meteor && !winding && ready('illusion') && tHit > 0.15 && tHit < 0.5 && rand() < D.shield) return (cast('illusion', threat.pos), cmds.push({ id, kind: 'move', to: add(me.pos, scale(away, 2)) }), cmds);
    // Alteração: troca de lugar com o projétil quando ele estiver quase chegando
    if (!meteor && !winding && ready('alteration') && tHit < 0.35 && reacts(1)) return cast('alteration', me.pos);
    // Raio derruba o míssil no caminho (metade das vezes: precisa de mira)
    if (threat.kind === 'homing' && !winding && ready('lightning') && dist(threat.pos, me.pos) > 1 && reacts(0.5)) return cast('lightning', add(threat.pos, scale(threat.vel, 0.1)));
    // Magnetizar num obstáculo perto volta em mim: repele os projéteis inimigos por alguns segundos
    const post = !meteor && !winding && ready('magnetize') && w.t >= me.magnetUntil && reacts(0.5) &&
      w.pillars.find((q) => q.alive && dist(q.pos, me.pos) - OBSTACLES[q.kind].r > 0.7 && dist(q.pos, me.pos) - OBSTACLES[q.kind].r < 2.4);
    if (post) return cast('magnetize', post.pos);
    if (ready('teleport') && reacts(0.5) && inside(add(me.pos, scale(away, 4)), 1.5)) return cast('teleport', add(me.pos, scale(away, 4)));
    // Zona de dobra no caminho: o projétil inimigo atravessa a esfera em câmera lenta
    if (!meteor && !winding && ready('warpzone') && dist(threat.pos, me.pos) > 1.2 && reacts(1)) return cast('warpzone', add(me.pos, scale(norm(sub(threat.pos, me.pos)), Math.min(1.5, dist(threat.pos, me.pos) / 2))));
    if (!meteor && !winding && ready('rockpillar') && dist(threat.pos, me.pos) > 1.6 && reacts(1)) return cast('rockpillar', add(me.pos, scale(norm(sub(threat.pos, me.pos)), 1.1)));
    if (!winding && ready('rush') && reacts(0.4) && inside(add(me.pos, scale(away, 3)), 1)) return cast('rush', add(me.pos, scale(away, 3)));
    // Caminhada no vento: mais rápido para sair do caminho
    if (!winding && ready('windwalk') && reacts(0.4)) return (cast('windwalk', me.pos), cmds.push({ id, kind: 'move', to: add(me.pos, scale(away, 3)) }), cmds);
    if (rand() < D.dodge) cmds.push({ id, kind: 'move', to: add(me.pos, scale(away, 2)) });
  }
  // Bola de fogo no Míssil teleguiado que ainda vem longe: o choque estoura longe do bot (às vezes: precisa de mira)
  const far = !threat && ready('fireball') && w.projectiles.find((p) => p.kind === 'homing' && seen(p) && p.target === id && dot(p.vel, sub(me.pos, p.pos)) > 0 && dist(p.pos, me.pos) > 4 && dist(p.pos, me.pos) < 6.5);
  if (far && reacts(0.3)) return cast('fireball', add(far.pos, scale(far.vel, 0.35)));

  // só vê inimigos a até D.vision; quem está na Caminhada no vento é invisível e quem lançou a Ilusão some no véu;
  // a cópia parece o dono (mesma vida e efeitos): o bot não sabe qual é a falsa e fica com a mais perto
  const decoys = w.projectiles.flatMap((p) => {
    const o = p.kind === 'illusion' && p.until > w.t ? w.wizards.find((z) => z.id === p.owner && z.alive && !ally(z)) : undefined;
    return o && dist(p.pos, me.pos) <= D.vision ? [{ ...o, id: decoyId(p), pos: p.pos, vel: v(0, 0) }] : [];
  });
  const foes = [...w.wizards.filter((z) => z.alive && !ally(z) && w.t >= z.windUntil && w.t >= z.veilUntil && dist(z.pos, me.pos) <= D.vision), ...decoys];
  const nearest = (zs: Wizard[]) => zs.reduce<Wizard | null>((a, z) => (!a || dist(z.pos, me.pos) < dist(a.pos, me.pos) ? z : a), null);
  // o Difícil caça: quem está fraco, perto da lava ou na frente do placar (a até 8 m); senão, o mais perto
  const top = Math.max(0, ...Object.values(scores));
  const weak = (z: Wizard) => z.hp < z.hpMax * 0.4 || edge(w, z.pos) < 2 || (top > 0 && scores[z.id] === top && dist(z.pos, me.pos) <= 8);
  const closest = nearest(foes);
  let enemy = (rand() < D.hunt && nearest(foes.filter(weak))) || closest;
  // inimigo sem reação (preso, ligado pelo meu Elo, lento, magnetizado, na minha Gravidade ou Zona): é a hora de emendar o dano
  const opened = (z: Wizard) =>
    w.t < z.gripUntil || w.t < z.slowUntil || (w.t < z.magnetUntil && z.magnet > 0) ||
    w.projectiles.some((p) => p.owner === id && ((p.kind === 'link' && p.target === z.id) || ((p.kind === 'gravity' || p.kind === 'warpzone') && dist(p.pos, z.pos) < 2.5)));
  // aberto há pelo menos o tempo de reação (conta de quando este bot viu, a cada pensamento)
  const since = M.opened;
  for (const z of w.wizards) {
    const key = id + '>' + z.id;
    if (z.alive && !ally(z) && opened(z)) since.set(key, since.get(key) ?? w.t);
    else since.delete(key);
  }
  const prey = foes.find((z) => w.t - (since.get(id + '>' + z.id) ?? w.t) >= D.delay);
  if (prey) enemy = prey;
  if (enemy) M.last.set(id, { t: w.t, pos: v(enemy.pos.x, enemy.pos.y) });

  // sai de lado da linha da puxada do Elo: o puxado passa direto com o embalo (parado, o choque jogaria o bot longe, até na lava)
  // a linha é o embalo dele (já puxado) ou a reta até o bot; sai para o lado em que já está (senão o do centro), para não ficar rodando
  const aside = (z: Wizard): Cmd => {
    const moving = len(z.vel) > 1;
    const ax = moving ? norm(z.vel) : norm(sub(me.pos, z.pos));
    const off = dot(v(-ax.y, ax.x), sub(me.pos, z.pos));
    const side = scale(v(-ax.y, ax.x), moving && Math.abs(off) > 0.2 ? Math.sign(off) : dot(v(-ax.y, ax.x), into) < 0 ? -1 : 1);
    return { id, kind: 'move', to: add(me.pos, add(scale(side, 3), scale(into, 0.6))) };
  };
  const held = w.projectiles.find((p) => p.owner === id && p.kind === 'link' && p.target);
  const pulled = held && w.wizards.find((z) => z.id === held.target && z.alive);
  if (pulled) return [aside(pulled)];
  // deslizando para a lava: Pilar de pedra logo à frente segura o bot
  if (ready('rockpillar') && len(me.vel) > 2 && !inside(add(me.pos, scale(me.vel, 1 / FRICTION)), 0.3) && reacts(1)) return cast('rockpillar', add(me.pos, scale(norm(me.vel), 1.15)));

  // na lava sem magia de fuga pronta (Fernando, 18/10): espera numa ilha se ela estiver mais perto que a pedra e a magia voltar
  // antes de a ilha afundar; com a magia pronta, o bloco de baixo leva de volta. Sem magia de fuga nenhuma, volta andando
  const escapes = (['teleport', 'rush', 'thrust', 'windwalk'] as SpellId[]).filter((s) => me.spells[s] > 0);
  if (edge(w, me.pos) < 0 && !winding && escapes.length && !escapes.some(ready)) {
    const soon = Math.min(...escapes.map((s) => Math.max(me.cd[s], usableAt(s)) - w.t));
    const here = w.isles.find((i) => dist(me.pos, i.pos) < i.r);
    const isle = w.isles.filter((i) => i.r > 0.5).sort((a, b) => dist(a.pos, me.pos) - a.r - (dist(b.pos, me.pos) - b.r))[0];
    if (here && soon < here.r / ISLAND.sink - 0.5) return [{ id, kind: 'move', to: here.pos }];
    if (!here && isle && soon < isle.r / ISLAND.sink && dist(isle.pos, me.pos) - isle.r < -edge(w, me.pos)) return [{ id, kind: 'move', to: isle.pos }];
  }
  // obstáculos vivos com a folga do mago, para os caminhos
  const avoid = w.pillars.filter((q) => q.alive).map((q) => ({ pos: q.pos, r: OBSTACLES[q.kind].r + WIZ_R }));
  // perto da borda (ou na lava): volta para dentro (no círculo, o centro; no anel, o meio da faixa; na ponte, o meio dela),
  // com Teleporte, Investida, Estocada ou Troca se tiver
  let edgeBack = false;
  if (!inside(me.pos, fear)) {
    const mine = edge(w, me.pos);
    // o sorteio em volta do ponto não passa da folga dele (numa ponte, jogaria o bot na lava)
    const near = (p: Vec) => add(p, jitter(Math.min(2, edge(w, p))));
    const home = near(safeInside(w, me.pos, w.arenaR * 0.7));
    // pelo caminho dentro da pedra: em linha reta, no Anel e na Cruz a volta cortava a lava
    const back = near(safeInside(w, me.pos, w.arenaR * 0.6));
    cmds.push({ id, kind: 'move', to: pathStep(w, me.pos, back, 0.5, avoid) ?? back });
    if (ready('teleport')) return cast('teleport', home);
    if (winding) return cmds;
    if (ready('rush')) return cast('rush', home);
    if (ready('thrust')) return cast('thrust', home);
    // Elo num obstáculo mais para dentro: puxa o bot até ele
    const L = spellLevel('link', me.spells.link || 1);
    const post = w.pillars.find((q) => q.alive && edge(w, q.pos) > mine + 1 && dist(q.pos, me.pos) < L.range * 0.9 && dist(q.pos, me.pos) > 1.2);
    if (ready('link') && post) return cast('link', post.pos);
    // ou no inimigo bem mais para dentro: o bot sai de lado e ele passa direto para a lava
    if (enemy && ready('link') && edge(w, enemy.pos) > mine + 1.5 && dist(enemy.pos, me.pos) > 2 && dist(enemy.pos, me.pos) < L.range * 0.9) return (cast('link', enemy.pos), cmds.push(aside(enemy)), cmds);
    if (ready('windwalk')) return cast('windwalk', home);
    // Troca: só vale com o inimigo bem mais para dentro (ele vai para a borda no lugar do bot)
    if (enemy && ready('swap') && edge(w, enemy.pos) > mine + 1.5 && dist(enemy.pos, me.pos) < spellLevel('swap', me.spells.swap).range) return cast('swap', enemy.pos);
    // ainda na pedra com folga (numa arena pequena, metade da que cabe): volta para dentro atirando, como gente
    // (19/10: no duelo final ~30% dos pensamentos eram só voltar, e numa arena mínima o bot nunca mais atirava)
    if (!enemy || mine < Math.min(0.5, fear / 2)) return cmds;
    edgeBack = true;
  }
  // anda pelo caminho dentro da pedra (nas Ilhas pela ponte, no Anel em volta do buraco, desviando dos obstáculos);
  // short: com o caminho livre, para a essa distância do ponto
  // sem caminho com a folga que quer (ponte estreita, arena pequena), aceita menos e lembra para não voltar no meio
  const go = (to: Vec, short = 0) => {
    for (const want of [D.edge, 1, 0.5, 0.2]) {
      const step = want <= D.edge && pathStep(w, me.pos, to, want, avoid);
      if (!step) continue;
      M.route.set(id, want - 0.1); // a grade confere de 25 em 25 cm: um pouco de sobra
      cmds.push({ id, kind: 'move', to: step === to && short ? add(to, scale(norm(sub(me.pos, to)), short)) : step });
      return;
    }
  };
  // parado sem motivo há quanto tempo: ninguém fica mais que ~2 s (o erro de ficar parado é à parte)
  if (me.target || me.casting) M.idle.delete(id);
  else if (!M.idle.has(id)) M.idle.set(id, w.t);
  const idle = w.t - (M.idle.get(id) ?? w.t);
  let box: Vec | undefined;
  if (!threat && !edgeBack) {
    // ouro, baú e runa: o Fácil ignora (só pega se passar por cima); o Normal vai sem inimigo perto; o Difícil vai atrás a até D.loot
    const calm = !closest || dist(closest.pos, me.pos) >= D.lootSafe;
    const chests = w.pillars.filter((q) => q.alive && q.kind === 'chest').map((q) => q.pos);
    // no duelo final, ouro e baú esperam e a runa só vale com o inimigo fora de vista (19/10: os dois iam atrás de ouro e não se encontravam)
    const duel = w.wizards.filter((z) => z.alive && !ally(z)).length === 1;
    const pool = !duel ? [...w.loots.map((l) => l.pos), ...w.runes.map((r) => r.pos), ...chests] : closest ? [] : w.runes.map((r) => r.pos).filter((p) => dist(p, me.pos) < 4);
    // ouro colado na borda fica para lá (19/10: ia até ele, entrava na folga da borda, voltava e repetia; viradas de 180° do Difícil 13 → 9,5 por minuto)
    const goal = calm ? pool.filter((p) => dist(p, me.pos) < D.loot && edge(w, p) >= fear).sort((a, b) => dist(a, me.pos) - dist(b, me.pos))[0] : undefined;
    const hitBy = w.wizards.find((z) => z.id === me.lastHitBy && z.alive && !ally(z));
    const lost = M.last.get(id);
    const ed = enemy ? dist(enemy.pos, me.pos) : 0;
    if (goal && chests.includes(goal)) {
      box = goal; // baú: chega perto e quebra com a Bola de fogo
      go(add(goal, scale(norm(sub(me.pos, goal)), 2.5)));
    } else if (goal) go(goal); // monte de ouro: fica em cima; runa: pega
    // o Fácil foge de quem acabou de acertá-lo
    else if (hitBy && w.t - me.lastHitAt < D.flee) cmds.push({ id, kind: 'move', to: safeInside(w, add(me.pos, scale(norm(sub(me.pos, hitBy.pos)), 3)), D.edge + 0.5) });
    // distância preferida: chega (pelo caminho) ou recua
    else if (enemy && ed > D.range + 1) go(enemy.pos, D.range);
    else if (enemy && ed < D.range - 1) {
      cmds.push({ id, kind: 'move', to: safeInside(w, add(me.pos, scale(norm(sub(me.pos, enemy.pos)), D.range - ed)), D.edge + 0.5) });
      // às vezes foge de quem chega perto com a Ilusão: a cópia vai na direção dele enquanto o bot recua
      if (!winding && ready('illusion') && reacts(0.3)) return cast('illusion', enemy.pos);
    }
    else if (!enemy) {
      // ninguém à vista: vai procurar onde viu um inimigo por último (até 5 s), senão o inimigo vivo mais perto
      const far = nearest(w.wizards.filter((z) => z.alive && !ally(z)));
      if (lost && w.t - lost.t < 5 && dist(lost.pos, me.pos) > 1.5) go(lost.pos);
      else if (far) go(far.pos, D.range);
    }
    if (!cmds.length && !me.target && (rand() < 0.25 || idle >= 1.5)) {
      // sem muito o que fazer, passeia em volta do meio do mapa (Fernando, 19/10)
      go(safeInside(w, jitter(3), D.edge + 0.5));
    }
  }
  // na Caminhada no vento qualquer magia a encerra: só corre para encostar no inimigo
  if (w.t < me.windUntil) return enemy ? [...cmds.filter((c) => c.kind !== 'move'), { id, kind: 'move', to: enemy.pos }] : cmds;
  // baú perto e nenhum inimigo por perto: quebra com a Bola de fogo
  if (box && !me.casting && ready('fireball') && dist(box, me.pos) < 6 && (!enemy || dist(enemy.pos, me.pos) > 6)) return cast('fireball', box);
  if (!enemy || me.casting) return cmds;
  const E = enemy;
  const d = dist(E.pos, me.pos);
  const dir = norm(sub(E.pos, me.pos));
  // o que o bot viu do alvo: onde estava há D.lag s e como andava (pela diferença de posição; sem histórico, onde está, parado)
  const h = M.seen.get(E.id) ?? [];
  let i = h.length - 1;
  while (i >= 0 && h[i].t > w.t - D.lag) i--;
  let j = i;
  while (j > 0 && h[j - 1].t >= h[i].t - 0.1) j--;
  const eye = i < 0 ? { pos: E.pos, vel: v(0, 0), age: 0 }
    : { pos: h[i].pos, vel: h[i].t > h[j].t ? scale(sub(h[i].pos, h[j].pos), 1 / (h[i].t - h[j].t)) : v(0, 0), age: w.t - h[i].t };
  const seenNow = add(eye.pos, scale(eye.vel, eye.age));
  // mira onde o alvo vai estar seguindo como andava, com erro de lado de até D.aim
  const lead = (speed: number, delay: number) => {
    const p = add(eye.pos, scale(eye.vel, eye.age + delay + (speed > 0 ? d / speed : 0)));
    const side = norm(sub(p, me.pos));
    return add(p, scale(v(-side.y, side.x), (rand() * 2 - 1) * D.aim));
  };

  // Drenar ferido: cura com o dano que causar
  if (ready('drain') && me.hp < me.hpMax * 0.7) {
    const L = spellLevel('drain', me.spells.drain);
    if (d < L.range) return cast('drain', lead(L.speed, CAST_POINT.drain));
  }
  // projétil próprio a caminho do alvo (para Magnetizar e Zona de dobra)
  const incoming = w.projectiles.some((p) => p.owner === id && p.kind !== 'meteor' && p.kind !== 'warpzone' && p.kind !== 'illusion' && dist(p.pos, E.pos) < 4 && dot(p.vel, sub(E.pos, p.pos)) > 0);
  // a lava a até k metros atrás do alvo, na linha do bot até ele
  const lavaBehind = (k: number) => !inside(add(E.pos, scale(dir, k)), 0);
  const slideEnd = add(E.pos, scale(E.vel, 1 / FRICTION));
  // magia de dano pronta (ou em até 1 s) para emendar no controle; o Flagelo não conta (era item até 21/10 e só alcança quem encosta)
  const loaded = SPELL_IDS.some((x) => x !== 'scourge' && me.spells[x] > 0 && spellLevel(x, me.spells[x]).dmg > 0 && w.t + 1 >= usableAt(x));
  // candidatos: cada magia pronta com o alvo no alcance; sorteia uma (a jogada certa da vez, `now`, sai sem sorteio)
  const options: { run: () => Cmd[]; dmg: boolean }[] = [];
  // obstáculo vivo no caminho do bot até o ponto
  const blocked = (to: Vec) => w.pillars.some((q) => {
    if (!q.alive) return false;
    const ab = sub(to, me.pos);
    const t = Math.max(0, Math.min(1, dot(sub(q.pos, me.pos), ab) / Math.max(1e-6, dot(ab, ab))));
    return dist(add(me.pos, scale(ab, t)), q.pos) < OBSTACLES[q.kind].r + PROJ_R + 0.1;
  });
  let damage = false;
  let now: (() => Cmd[]) | null = null;
  let meteor: (() => Cmd[]) | null = null;
  for (const s of SPELL_IDS) {
    if (!ready(s) || s === 'closedbody' || s === 'shield' || s === 'swap' || s === 'alteration' || s === 'scourge' || s === 'pact') continue; // Escudo, Troca e Alteração só na defesa (e na borda); Flagelo e Pacto logo abaixo
    const L = spellLevel(s, me.spells[s]);
    const cp = CAST_POINT[s] ?? 0.1;
    let at: Vec | null = null;
    let prio = false;
    if (s === 'fireball') at = d < L.range + 1 ? lead(L.speed, cp) : null; // colado também (18/10: no fim da rodada os bots se prendiam sem se bater)
    else if (s === 'homing') at = d < 12 ? seenNow : null;
    else if (s === 'meteor') at = d < L.range ? lead(0, cp + METEOR_DELAY) : null;
    else if (s === 'geyser') at = E.casting && d < L.range ? E.pos : null; // interrompe preparo; não protege inimigo à toa.
    else if (s === 'grip') {
      // só com dano pronto para emendar; preso na lava (ou deslizando para ela) não volta andando; e o Agarrar corta o Flagelo em preparo
      prio = !inside(E.pos, 0.6) || !inside(slideEnd, 0.3) || (E.casting?.spell === 'scourge' && d < 3);
      at = d < L.range * 0.85 && (loaded || prio) ? lead(0, cp + GRIP.delay) : null;
    }
    else if (s === 'thrust') at = d > 1.5 && d < L.range && inside(add(me.pos, scale(dir, Math.min(d, L.range))), 1.5) ? lead(L.speed, cp) : null;
    else if (s === 'rush') at = d < 3.2 && inside(add(me.pos, scale(dir, 3)), 1) ? seenNow : null;
    else if (s === 'teleport') {
      const to = add(me.pos, clampLen(scale(dir, d - 4), L.range));
      at = d > 7.5 && inside(to, 2) && rand() < 0.3 ? to : null;
    } else if (s === 'rockpillar') at = d > 3 && d < 7 && rand() < 0.25 ? add(me.pos, scale(dir, 1.3)) : null;
    // Magnetizar no inimigo: os projéteis do bot (já voando ou os próximos) curvam para ele
    else if (s === 'magnetize') {
      at = d < L.range * 0.8 && (incoming || loaded) ? lead(L.speed, cp) : null;
      prio = true;
    }
    // Zona de dobra em cima do inimigo: os tiros dele saem em câmera lenta enquanto os do bot chegam
    else if (s === 'warpzone') at = d < L.range && (incoming || rand() < 0.15) ? seenNow : null;
    // Caminhada no vento: invisível e mais rápido para encostar (o dano sai no toque)
    else if (s === 'windwalk') at = d > 1.2 && d < 5 && inside(E.pos, 1) ? E.pos : null;
    // Elo com a lava atrás do bot: o bot sai de lado e o puxado passa direto para a lava; de vez em quando pelo dano,
    // mas nunca com o inimigo mais perto da lava (a puxada o salvaria)
    else if (s === 'link') {
      // de perto não dá tempo de sair da frente; obstáculo no caminho puxaria o próprio bot até ele
      const to = lead(L.speed, cp);
      prio = !inside(add(me.pos, scale(dir, -3)), 0);
      at = d > 3.5 && d < L.range * 0.9 && (prio || (loaded && edge(w, E.pos) > edge(w, me.pos) - 0.5 && rand() < 0.3)) && !blocked(to) ? to : null;
    }
    // Bola de neve: lenta, só de perto
    else if (s === 'snowball') {
      at = d < L.range ? lead(L.speed, cp) : null;
      prio = lavaBehind(3.5); // arrasta o alvo até a lava e explode lá
    }
    // Gravidade passando pelo alvo rumo à lava: de perto ele não consegue andar contra o puxão
    else if (s === 'gravity') {
      at = d < L.range ? lead(L.speed, cp) : null;
      prio = d < 2.8 && lavaBehind(2);
    }
    // Divisor: estoura no ponto e os filhotes seguem mais 4,6 m
    else if (s === 'splitter') at = d < L.range + 3 ? add(me.pos, clampLen(sub(lead(L.speed, cp), me.pos), Math.max(1, d - 2))) : null;
    // Raio, Rajada, Bumerangue, Ricochete, Gravidade e qualquer magia nova de dano: no alcance, mirando à frente do alvo
    else if (L.dmg > 0) at = d < (L.range || 6) ? lead(L.speed, cp) : null;
    if (!at) continue;
    const to = at;
    const opt =
      s === 'windwalk' ? () => (cast(s, to), cmds.push({ id, kind: 'move', to: E.pos }), cmds)
      : s === 'link' ? () => (cast(s, to), cmds.push(aside(E)), cmds) // já sai de lado enquanto o Elo voa
      : () => cast(s, to);
    if (prio) now ??= opt;
    if (s === 'meteor') meteor = opt;
    options.push({ run: opt, dmg: L.dmg > 0 });
    if (L.dmg > 0) damage = true;
  }
  if (free('scourge') && d < spellLevel('scourge', me.spells.scourge).radius * 0.8) {
    options.push({ run: () => cast('scourge', me.pos), dmg: true });
    damage = true;
  }
  if (now) return now();
  // combo: com o alvo aberto, só dano e sem hesitar (antes os bots prendiam e não aproveitavam, e o controle rendia 0,75 a 0,86×)
  // chance D.combo (18/10: 30% / 60% / 90%)
  if (prey && damage && rand() < D.combo) {
    const hits = options.filter((o) => o.dmg);
    // preso não sai do Meteoro a tempo: é o golpe mais forte
    if (meteor && w.t < E.gripUntil) return meteor();
    return hits[Math.floor(rand() * hits.length)].run();
  }
  if (!options.length || rand() >= D.cast) return cmds;
  // Pacto antes de uma magia de dano: ela sai no próximo comando (as duas juntas perderiam o Pacto)
  if (damage && free('pact') && w.t >= me.pactUntil && rand() < 0.5) return cast('pact', me.pos);
  return options[Math.floor(rand() * options.length)].run();
}
