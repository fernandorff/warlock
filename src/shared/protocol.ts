// Mensagens entre o navegador e a sala. A única validação do jogo fica aqui: formato e tamanho.
import { ARENA_IDS, type ArenaId } from './arena.ts';
import { ascOf, type AscLobby, type Card, type Choice, type Kind } from './ascension.ts';
import { BOT_SKILL, type BotSkill } from './bots.ts';
import { fixLook, isCharacter, isLook, type CharacterId } from './characters.ts';
import { MAX_PLAYERS, ROUND_EFFECT_IDS, RUNE_KINDS, type RoundEffectId, type RuneKind } from './constants.ts';
import { ITEM_IDS, type ItemId } from './items.ts';
import { MODES, OPTION_CHOICES, TURRET_DIR, goalOf, parseOpt, votesNeeded, type Match, type MatchOpts, type Mode, type Phase, type Sandbox, type SandboxCmd, type Stats, type TurretDir, type Vote } from './match.ts';
import type { SimEvent } from './sim.ts';
import { MAX_SPELLS, MAX_SPELL_LEVEL, isSpell, noSpells, spellCount, type SpellId } from './spells.ts';
import { TAUNTS } from './taunts.ts';

// treino: magias, itens e jeito de jogar escolhidos para um bot (só vale com um humano na sala; ver startMatch);
// difficulty: a dificuldade deste bot, escolhida na sala (vale em qualquer sala)
export type BotSetup = { spells?: Partial<Record<SpellId, number>>; items?: Partial<Record<ItemId, number>>; skill?: Partial<BotSkill>; difficulty?: MatchOpts['difficulty'] };

export type ClientMsg =
  | { t: 'hello'; playerId: string; name: string; watch?: true } // watch: entra assistindo (botão Assistir da lista de salas)
  | { t: 'watch'; on: boolean } // assistir (sem mago a partir da próxima rodada) ou voltar a jogar
  // shuffle: Times sorteados a cada rodada (padrão) ou fixos; opts: opções da partida; setup[i]: dificuldade do bot i+1 e a configuração dele no treino
  | { t: 'start'; bots: number; mode?: Mode; shuffle?: boolean; opts?: Partial<MatchOpts>; setup?: BotSetup[]; sandbox?: true }
  | { t: 'sandbox'; cmd: SandboxCmd } // painel da sandbox (o servidor ignora numa sala normal)
  | { t: 'move'; x: number; y: number; seq: number; held?: boolean }
  | { t: 'moveHold'; on: boolean; seq: number } // soltar o direito não envia outro destino de caminhada.
  | { t: 'stop'; seq: number }
  | { t: 'brace'; on: boolean; seq: number }
  | { t: 'basic'; x: number; y: number; target?: string | number; seq: number }
  | { t: 'cast'; spell: SpellId; x: number; y: number; seq: number }
  | { t: 'buy'; spell: SpellId }
  | { t: 'pick'; character: CharacterId } // um dos 9 prontos: vira a aparência equivalente
  | { t: 'reroll' } // Ascensão: novo sorteio das cartas da mesa
  | { t: 'keep'; slot: number } // Ascensão: com a barra cheia, recusa a fileira de magia nova
  | { t: 'card'; slot: number; i: number; swap?: SpellId } // Ascensão: carta i (0 a 2) da escolha slot; swap = magia que sai com a barra cheia
  | { t: 'look'; look: string } // aparência montada (7 dígitos, ver LOOK_PARTS)
  | { t: 'buyItem'; item: ItemId }
  | { t: 'kick'; target: string }
  | { t: 'undo'; key: string }
  | { t: 'sell'; key: string }
  | { t: 'vote'; kind: Vote['kind']; target?: string }
  | { t: 'ballot'; yes: boolean }
  | { t: 'lobby'; bots: MatchOpts['difficulty'][]; opts: Partial<MatchOpts> } // sala do Ascensão: o dono escolhe bots e opções
  | { t: 'taunt'; i: number }
  | { t: 'ready' }
  | { t: 'alive' };

export type PublicPlayer = {
  id: string; name: string; bot: boolean; color: number; character: CharacterId; look: string; score: number; gold: number;
  spells: Record<SpellId, number>; items: Record<ItemId, number>; stats: Stats; bought: string[]; held: Record<string, number[]>; ready: boolean; connected: boolean; team: number | null;
  difficulty?: MatchOpts['difficulty']; // só bots: a dificuldade dele
  dummy?: true; // sandbox: boneco parado
  watch?: true; // assistindo: sem mago a partir da próxima rodada
  turret?: true; // Sandbox: torreta de direção fixa.
  asc?: { xp: number; level: number; next: number; todo: Kind[]; offer: Card[][]; pick: (Choice | null)[]; rerolls: number; auto: Card[] }; // só no Ascensão (next: XP do próximo nível; auto: sorteado por falta de escolha)
};

export type PublicRoom = {
  id: string;
  phase: Phase;
  mode: Mode;
  round: number;
  phaseLeft: number; // ms até a fase mudar sozinha
  players: PublicPlayer[];
  ids: string[]; // ordem dos magos no estado compacto ('snap')
  winner: string | null;
  lastRoundWinner: string | null;
  // votação aberta, com ids públicos (target também, quando é expulsão); left = ms até fechar; need = SIM para passar
  vote: (Omit<Vote, 'ends'> & { left: number; need: number }) | null;
  pendingMode: Mode | null;
  teamShuffle: boolean;
  pendingShuffle: boolean | null;
  winnerTeam: number | null;
  opts: MatchOpts; // opções da partida
  pendingOpts: Partial<MatchOpts>; // opções votadas para a próxima rodada
  botDelta: number; // bots votados para entrar (+) ou sair (−) na próxima rodada
  goal: number; // pontos para vencer no modo atual (rodadas; abates no Deathmatch)
  arena: ArenaId | null; // formato da arena desta rodada (null sem rodada)
  effect: RoundEffectId | null; // efeito desta rodada; na loja, o da próxima (null desligado, sem rodada e na sandbox)
  sandbox?: Sandbox; // só nas salas sandbox: as regras ligadas
  lobby?: AscLobby; // só na sala do Ascensão: dono (id público) e os bots e opções que ele escolheu
};

// w: 7 números por mago na ordem de room.ids: x, y, vx, vy, vida, direção, bits de estado (ver encodeSnap)
// p: 6 números por projétil: id, tipo (índice em PROJ_KINDS), x, y, vx, vy (Meteoro/Agarrar/Zona: raio e segundos restantes)
// cd: recarga restante das magias de quem recebe, na ordem de SPELL_IDS;
// ch: montes de ouro dos baús (3 números por monte: x, y, quanto falta); lp: progresso de cada mago (0 a 1) até o próximo ouro do monte, na ordem de room.ids
// pl: 4 números por obstáculo: x, y, vida em % (0 = quebrado), tipo (índice em OBSTACLE_KINDS)
// rs: só no deathmatch, 1 número por mago na ordem de room.ids: segundos até voltar (0 = vivo)
// sp: velocidade de andar dele agora (botas, lentidão), para a previsão; ack: último seq aplicado dele
// fx: efeitos com prazo de quem recebe, 2 números por efeito: bit de estado (como em w) e segundos que faltam
// a vida em w vai em pontos; a máxima sai dos itens do jogador (itemStats), que estão na mensagem 'room'
// kr: recuperação pós-empurrão restante, por mago; ausente em servidores antigos significa zero.
// st: duração restante do atordoamento por mago; -1 usa o comportamento antigo baseado na velocidade física.
// ba: dois números por mago: preparo de Atacar restante em segundos e corpo a corpo (1/0); ausente = sem preparo.
export type Snap = { t: 'snap'; time: number; r: number; s: number; w: number[]; p: number[]; cd: number[]; sp: number; pl: number[]; bl?: number[]; cb?: number[]; gy?: number[]; ba?: number[]; kr?: number[]; st?: number[]; rs?: number[]; ch?: number[]; lp?: number[]; ru?: number[]; ab?: number[]; zn?: number[]; il?: number[]; fx?: number[]; ack: number; e?: SimEvent[] };

// lista de salas do lobby; mode, round e bots entraram depois: salas gravadas antes não têm (o cliente aceita sem)
export type RoomInfo = { id: string; players: number; phase: string; mode?: string; round?: number; bots?: number };

type ErrorCode = 'not_found' | 'other_tab' | 'full' | 'bad_msg' | 'kicked';

export type ServerMsg =
  | { t: 'room'; room: PublicRoom; you: string }
  | Snap
  | { t: 'error'; code: ErrorCode; msg: string }
  | { t: 'taunt'; id: string; i: number };

const MAX_COORD = 30; // a maior arena (8 magos, forma mais larga: 1,63 × 13,6 m) chega a ~22 m do centro; o resto é folga para clique na lava
const MAX_MSG = 2048; // 'start' com 7 bots configurados: ~1,0 KB só com magias, ~1,7 KB com magias e itens (medido em 19/10)

type Obj = Record<string, unknown>;
const isObj = (x: unknown): x is Obj => typeof x === 'object' && x !== null && !Array.isArray(x);
const coord = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x) && Math.abs(x) <= MAX_COORD;
const seq = (x: unknown): x is number => Number.isInteger(x) && (x as number) >= 0 && (x as number) < 2 ** 31;
// publicId: hash de 32 bits em base 36 cabe em 7 caracteres
const pubId = (x: unknown): x is string => typeof x === 'string' && /^p[0-9a-z]{1,8}$/.test(x);

export function cleanName(raw: unknown): string {
  const name = String(raw ?? '').replace(/[<>]/g, '').trim().slice(0, 20);
  return name || 'Mago';
}

// opções da partida: só chaves conhecidas e só os valores da lista de cada uma
function parseOpts(x: unknown): Partial<MatchOpts> | null {
  if (!isObj(x)) return null;
  for (const [k, val] of Object.entries(x)) if (!(k in OPTION_CHOICES) || !(OPTION_CHOICES[k as keyof MatchOpts] as readonly unknown[]).includes(val)) return null;
  return x as Partial<MatchOpts>;
}

// configuração dos bots: níveis válidos (até MAX_SPELLS magias, contando a Bola de fogo que já vem) e skill dentro do que os bots
// já usam (cada chave até o maior entre Fácil, Normal e Difícil; rate pelo menos o do Fácil, para ninguém pedir 999 decisões por segundo)
const SKILL_KEYS = Object.keys(BOT_SKILL.normal) as (keyof BotSkill)[];
const level = (x: unknown, max: number) => Number.isInteger(x) && (x as number) >= 0 && (x as number) <= max;
function parseSetup(x: unknown): BotSetup[] | null {
  if (!Array.isArray(x) || x.length > MAX_PLAYERS - 1) return null; // sempre sobra o lugar de quem pediu
  const out: BotSetup[] = [];
  for (const b of x) {
    if (!isObj(b)) return null;
    const { spells, items, skill, difficulty } = b;
    if (difficulty !== undefined && !OPTION_CHOICES.difficulty.includes(difficulty as MatchOpts['difficulty'])) return null;
    if (spells !== undefined && (!isObj(spells) || !Object.entries(spells).every(([k, n]) => isSpell(k) && level(n, MAX_SPELL_LEVEL)) || spellCount({ ...noSpells(), ...spells }) > MAX_SPELLS)) return null;
    if (items !== undefined && (!isObj(items) || !Object.entries(items).every(([k, n]) => ITEM_IDS.includes(k as ItemId) && level(n, 6)))) return null;
    if (skill !== undefined && (!isObj(skill) || !Object.entries(skill).every(([k, n]) => SKILL_KEYS.includes(k as keyof BotSkill) && typeof n === 'number' && Number.isFinite(n)))) return null;
    const clamp = (k: keyof BotSkill, n: number) => Math.min(Math.max(...Object.values(BOT_SKILL).map((s) => s[k])), Math.max(k === 'rate' ? BOT_SKILL.easy.rate : 0, n));
    out.push({
      ...(spells && { spells: spells as BotSetup['spells'] }),
      ...(items && { items: items as BotSetup['items'] }),
      ...(skill && { skill: Object.fromEntries(Object.entries(skill).map(([k, n]) => [k, clamp(k as keyof BotSkill, n as number)])) }),
      ...(difficulty !== undefined && { difficulty: difficulty as MatchOpts['difficulty'] }),
    });
  }
  return out;
}

// comando do painel da sandbox: só as operações e os valores conhecidos (o bot passa pela mesma checagem do treino)
const SANDBOX_KEYS: (keyof Sandbox)[] = ['god', 'noCd', 'shrink'];
function parseSandbox(c: unknown): SandboxCmd | null {
  if (!isObj(c)) return null;
  if (c.op === 'set') return SANDBOX_KEYS.includes(c.key as keyof Sandbox) && typeof c.on === 'boolean' ? { op: 'set', key: c.key as keyof Sandbox, on: c.on } : null;
  if (c.op === 'arena') return ARENA_IDS.includes(c.arena as ArenaId) ? { op: 'arena', arena: c.arena as ArenaId } : null; // 'random' não entra: a sandbox nunca sorteia
  if (c.op === 'radius') return c.step === 1 || c.step === -1 ? { op: 'radius', step: c.step } : null;
  if (c.op === 'rune') return RUNE_KINDS.includes(c.kind as RuneKind) ? { op: 'rune', kind: c.kind as RuneKind } : null;
  if (c.op === 'effect') return c.effect === null || ROUND_EFFECT_IDS.includes(c.effect as RoundEffectId) ? { op: 'effect', effect: c.effect as RoundEffectId | null } : null;
  if (c.op === 'restart') return { op: 'restart' };
  if (c.op === 'turret') return Object.hasOwn(TURRET_DIR, c.direction as string) ? { op: 'turret', direction: c.direction as TurretDir } : null;
  if (c.op !== 'bot' || (c.dummy !== undefined && typeof c.dummy !== 'boolean')) return null;
  const bot = c.bot === undefined ? undefined : parseSetup([c.bot])?.[0];
  if (bot === undefined && c.bot !== undefined) return null;
  return { op: 'bot', ...(bot && { bot }), ...(c.dummy && { dummy: true }) };
}

export function parseClientMessage(raw: string): ClientMsg | null {
  if (raw.length > MAX_MSG) return null;
  let m: unknown;
  try {
    m = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isObj(m)) return null;
  switch (m.t) {
    case 'hello':
      // o cliente gera com crypto.randomUUID (36 caracteres); o id é o segredo de reconexão, então só formato fechado
      if (typeof m.playerId !== 'string' || !/^[\w-]{8,64}$/.test(m.playerId)) return null;
      if (m.watch !== undefined && typeof m.watch !== 'boolean') return null;
      return { t: 'hello', playerId: m.playerId, name: cleanName(m.name), ...(m.watch === true && { watch: true as const }) };
    case 'watch':
      return typeof m.on === 'boolean' ? { t: 'watch', on: m.on } : null;
    case 'start': {
      if (m.mode !== undefined && !MODES.includes(m.mode as Mode)) return null;
      if (m.shuffle !== undefined && typeof m.shuffle !== 'boolean') return null;
      const opts = m.opts === undefined ? undefined : parseOpts(m.opts);
      if (opts === null) return null;
      const setup = m.setup === undefined ? undefined : parseSetup(m.setup);
      if (setup === null) return null;
      if (!Number.isInteger(m.bots) || (m.bots as number) < 0 || (m.bots as number) >= MAX_PLAYERS) return null;
      if (m.sandbox !== undefined && typeof m.sandbox !== 'boolean') return null;
      // sem opções nem configuração, a mensagem fica como era antes delas
      return { t: 'start', bots: m.bots as number, mode: m.mode as Mode | undefined, shuffle: m.shuffle, ...(opts && { opts }), ...(setup && { setup }), ...(m.sandbox === true && { sandbox: true as const }) };
    }
    case 'sandbox': {
      const cmd = parseSandbox(m.cmd);
      return cmd ? { t: 'sandbox', cmd } : null;
    }
    case 'move':
      return coord(m.x) && coord(m.y) && seq(m.seq) && (m.held === undefined || typeof m.held === 'boolean') ? { t: 'move', x: m.x, y: m.y, seq: m.seq, ...(m.held !== undefined && { held: m.held as boolean }) } : null;
    case 'moveHold':
      return typeof m.on === 'boolean' && seq(m.seq) ? { t: 'moveHold', on: m.on, seq: m.seq } : null;
    case 'stop':
      return seq(m.seq) ? { t: 'stop', seq: m.seq } : null;
    case 'brace':
      return typeof m.on === 'boolean' && seq(m.seq) && Object.keys(m).every((k) => ['t', 'on', 'seq'].includes(k)) ? { t: 'brace', on: m.on, seq: m.seq } : null;
    case 'basic':
      if (!coord(m.x) || !coord(m.y) || !seq(m.seq) || !Object.keys(m).every((k) => ['t', 'x', 'y', 'seq', 'target'].includes(k))) return null;
      if (m.target !== undefined && !pubId(m.target) && !(typeof m.target === 'number' && seq(m.target))) return null;
      return { t: 'basic', x: m.x, y: m.y, seq: m.seq, ...(m.target === undefined ? {} : { target: m.target as string | number }) };
    case 'cast':
      return isSpell(m.spell) && coord(m.x) && coord(m.y) && seq(m.seq) ? { t: 'cast', spell: m.spell, x: m.x, y: m.y, seq: m.seq } : null;
    case 'buy':
      return isSpell(m.spell) ? { t: 'buy', spell: m.spell } : null;
    case 'sell':
    case 'undo':
      return typeof m.key === 'string' && /^(spell|item):[a-z_]{2,20}$/.test(m.key) ? { t: m.t, key: m.key } : null;
    case 'kick':
      return pubId(m.target) ? { t: 'kick', target: m.target } : null;
    case 'vote':
      // troca de modo leva o modo alvo; a do sorteio dos times só alterna
      if (m.kind === 'mode') return MODES.includes(m.target as Mode) ? { t: 'vote', kind: 'mode', target: m.target as Mode } : null;
      if (m.kind === 'shuffle') return { t: 'vote', kind: 'shuffle' };
      if (m.kind === 'opt') return typeof m.target === 'string' && m.target.length < 30 && parseOpt(m.target) ? { t: 'vote', kind: 'opt', target: m.target } : null;
      if (m.kind === 'restart' || m.kind === 'end' || m.kind === 'addBot' || m.kind === 'removeBot' || m.kind === 'skipShop') return { t: 'vote', kind: m.kind };
      return m.kind === 'kick' && pubId(m.target) ? { t: 'vote', kind: 'kick', target: m.target } : null;
    case 'ballot':
      return typeof m.yes === 'boolean' ? { t: 'ballot', yes: m.yes } : null;
    case 'lobby': {
      const opts = parseOpts(m.opts);
      const bots = Array.isArray(m.bots) && m.bots.length < MAX_PLAYERS && m.bots.every((d) => OPTION_CHOICES.difficulty.includes(d)) ? (m.bots as MatchOpts['difficulty'][]) : null;
      return opts && bots ? { t: 'lobby', bots, opts } : null;
    }
    case 'taunt':
      return Number.isInteger(m.i) && (m.i as number) >= 0 && (m.i as number) < TAUNTS.length ? { t: 'taunt', i: m.i as number } : null;
    case 'buyItem':
      return ITEM_IDS.includes(m.item as ItemId) ? { t: 'buyItem', item: m.item as ItemId } : null;
    case 'keep':
      return Number.isInteger(m.slot) && (m.slot as number) >= 0 && (m.slot as number) < 20 ? { t: 'keep', slot: m.slot as number } : null;
    case 'card':
      return Number.isInteger(m.i) && (m.i as number) >= 0 && (m.i as number) < 3 && Number.isInteger(m.slot) && (m.slot as number) >= 0 && (m.slot as number) < 20 && (m.swap === undefined || isSpell(m.swap))
        ? { t: 'card', slot: m.slot as number, i: m.i as number, ...(m.swap !== undefined && { swap: m.swap as SpellId }) }
        : null;
    case 'pick':
      return isCharacter(m.character) ? { t: 'pick', character: m.character } : null;
    case 'look':
      return isLook(m.look) ? { t: 'look', look: fixLook(m.look) } : null;
    case 'ready':
    case 'alive':
    case 'reroll':
      return { t: m.t };
    default:
      return null;
  }
}

// O playerId é o segredo de reconexão: para os outros só vai um apelido curto derivado dele (FNV-1a com o código
// da sala), que não dá para reverter. Assim ninguém copia o id de outro para tomar o lugar dele.
export function publicId(room: string, id: string): string {
  let h = 0x811c9dc5;
  for (const c of room + ':' + id) h = Math.imul(h ^ c.charCodeAt(0), 0x01000193) >>> 0;
  return 'p' + h.toString(36);
}

// efeito que a loja anuncia: o votado para a próxima rodada vale na contagem, então a loja já mostra o que vai valer
function shopEffect(m: Match): RoundEffectId | null {
  const o = { ...m.opts, ...m.pendingOpts }.effect;
  return o === 'off' || m.sandbox ? null : o === 'random' ? (m.nextEffect ?? null) : o;
}

export function publicRoom(id: string, m: Match, now: number): PublicRoom {
  const pub = (x: string) => publicId(id, x);
  return {
    id,
    phase: m.phase,
    mode: m.mode,
    round: m.round,
    phaseLeft: Math.max(0, m.phaseEnds - now),
    players: m.players.map(({ id, name, bot, color, character, look, score, gold, spells, items, stats, bought, held, ready, connected, team, difficulty, dummy, turret, watch }) => ({ id: pub(id), name, bot, color, character, look, score, gold, spells, items, stats, bought: bought.map((b) => b.key), held: held ?? {}, ready, connected, team: team ?? null, ...(bot && { difficulty: difficulty ?? m.opts.difficulty }), ...(dummy && { dummy: true as const }), ...(turret && { turret: true as const }), ...(watch && { watch: true as const }), ...(m.asc && { asc: ascOf(m.asc, id) }) })),
    ids: m.world?.wizards.map((z) => pub(z.id)) ?? [],
    winner: m.winner && pub(m.winner),
    lastRoundWinner: m.lastRoundWinner && pub(m.lastRoundWinner),
    vote: m.vote && {
      kind: m.vote.kind,
      target: m.vote.kind === 'kick' ? pub(m.vote.target) : m.vote.target,
      by: pub(m.vote.by),
      yes: m.vote.yes.map(pub),
      no: m.vote.no.map(pub),
      left: Math.max(0, m.vote.ends - now),
      need: votesNeeded(m.players.filter((p) => !p.bot && p.connected).length),
    },
    pendingMode: m.pendingMode,
    teamShuffle: m.teamShuffle,
    pendingShuffle: m.pendingShuffle,
    winnerTeam: m.winnerTeam,
    opts: m.opts,
    pendingOpts: m.pendingOpts,
    botDelta: m.botDelta,
    goal: goalOf(m),
    arena: m.world?.arena ?? null,
    effect: (m.phase === 'shop' ? shopEffect(m) : m.world?.effect) ?? null,
    ...(m.sandbox && { sandbox: m.sandbox }),
    ...(m.lobby && { lobby: { ...m.lobby, owner: m.lobby.owner && pub(m.lobby.owner) } }),
  };
}
