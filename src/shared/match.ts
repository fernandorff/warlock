// Partida: fases, rodadas, pontos, ouro e loja. Pura; a sala chama tickMatch a cada passo da simulação.
import { ARENA_IDS, type ArenaId } from './arena.ts';
import { afterBoss, bossCmds, bossHp, newBoss, ODRAN } from './bosses.ts';
import { CAMPAIGN, CAMPAIGN_BOOK, EMBER, SERVOS, type Night, type ServoKind } from './campaign.ts';
import { fightOf, nightMap, obstaclesOf, roomRect, terrainOf, type NightMap, type Spawn } from './levels.ts';
import { ASC_ROUNDS, ascDeath, ascEndRound, ascMark, ascOwner, ascResume, ascShop, ascWinner, newAsc, type AscLobby, type AscState } from './ascension.ts';
import { BOT_SKILL, botBuy, botCmds, botThinks, botWatch, skillAt, threatTo, type BotPlan, type BotSkill } from './bots.ts';
import { CHARACTERS, fixLook, lookHead, lookOf, type CharacterId } from './characters.ts';
import {
  ARENA_MIN, ARENA_STEP, ASSIST_GOLD, DT, INVULN_TIME, ASSIST_MIN_DMG, BOUNTY, STREAK, COUNTDOWN_MS, LEADER_WIN_GOLD, RECOVERY, DM_ROUND_MS, KILL_GOLD, MAX_PLAYERS, MAX_WATCHERS, PILLAR, PROJ_R, ROUND_EFFECT_IDS, ROUND_END_MS, ROUND_GOLD, SELL_DECAY, SELL_FLOOR, TOP_DMG_GOLD, VOTE_MS, WIN_GOLD, WIZ_R, WIZ_SPEED, arenaRadius,
  roundMods, type RoundEffectId, type RuneKind,
} from './constants.ts';
import { ITEMS, ITEM_IDS, itemPrice, noItems, type ItemId } from './items.ts';
import type { BotSetup } from './protocol.ts';
import { nightRand } from './rng.ts';
import { gearOf, newWorld, inLava, placeRune, resizeArena, revive, stepWorld, type Cmd, type Projectile, type SimEvent, type World } from './sim.ts';
import { FREE_SPELLS, MAX_SPELLS, SPELL_IDS, isSpell, noSpells, priceOf, spellCount, spellLevel, type SpellId } from './spells.ts';
import { dist, len, v, type Vec } from './vec.ts';


// estatísticas do placar: ouro ganho, dano causado e precisão (lançadas e acertadas) por magia;
// jeito de jogar (watchStyle): ameaças, atingido por elas, Escudo pronto e usado, tempo de reação e distância do inimigo (somas e contagens)
export type Stat = {
  gold: number; dmg: number; kills: number; dmgBy: Record<string, number>; fired: Record<string, number>; landed: Record<string, number>; deaths: number; deathBy: Record<string, number>; alive: number;
  threats: number; struck: number; shieldable: number; shielded: number; reactSum: number; reactN: number; nearSum: number; nearN: number;
};
export type Stats = { round: Stat; match: Stat; room: Stat };
const newStat = (): Stat => ({ gold: 0, dmg: 0, kills: 0, dmgBy: {}, fired: {}, landed: {}, deaths: 0, deathBy: {}, alive: 0, threats: 0, struck: 0, shieldable: 0, shielded: 0, reactSum: 0, reactN: 0, nearSum: 0, nearN: 0 }); // alive: segundos vivo
const newStats = (): Stats => ({ round: newStat(), match: newStat(), room: newStat() });
// salas gravadas antes de um campo existir (ex.: a precisão): sem isso a soma quebrava o passo inteiro e os efeitos daquele instante sumiam
const fillStats = (s?: Partial<Record<keyof Stats, Partial<Stat>>>): Stats => ({ round: { ...newStat(), ...s?.round }, match: { ...newStat(), ...s?.match }, room: { ...newStat(), ...s?.room } });
function addStat(p: Player, f: (s: Stat) => void) {
  f(p.stats.round);
  f(p.stats.match);
  f(p.stats.room);
}
export type Economy = { goldStart: number; goldEarned: number; goldSpent: number; goldRefunded: number; goldRecovery: number };
const newEconomy = (goldStart: number): Economy => ({ goldStart, goldEarned: 0, goldSpent: 0, goldRefunded: 0, goldRecovery: 0 });
// Salas antigas começam a medição com o ouro atual do jogador.
export const economyOf = (p: Player): Economy => p.economy ??= newEconomy(p.gold);
// toda renda passa por aqui e é multiplicada pela economia da sala (scaled = false: o valor já vem na escala dela); devolve o ganho
// a parte quebrada fica guardada no jogador (Fernando, 20/10, issue #88: no ×1,5 o monte paga 1, 2, 1, 2…); o 1e-9 segura o erro das contas com decimal
function earn(m: Match, p: Player, gold: number, scaled = true, recovery = false): number {
  if (m.asc || m.night) return 0; // Ascensão e Campanha: sem ouro (Ascensão pelas cartas; a Campanha não tem loja)
  let n = gold;
  if (scaled) {
    // efeito de rodada da Febre do ouro: todo ouro ganho durante a rodada (abate, rodada, vitória, baú…) vale mods.gold vezes; na loja não há mundo
    const total = gold * m.opts.economy * (m.world?.mods.gold ?? 1) + (p.goldCarry ?? 0);
    n = Math.floor(total + 1e-9);
    p.goldCarry = total - n;
  }
  p.gold += n;
  economyOf(p).goldEarned += n;
  if (recovery) economyOf(p).goldRecovery += n;
  addStat(p, (s) => (s.gold += n));
  return n;
}

// rounds: último vivo ganha a rodada; deathmatch: rodadas de 60 s, quem morre volta e cada abate vale 1 ponto;
// teams: 2 times, a rodada acaba quando só sobra um time e todos dele pontuam
// campaign: 1 a 4 humanos contra os servos do Fumo (campaign.ts); clareira = rodada, intervalo = loja
export const MODES = ['rounds', 'deathmatch', 'teams', 'ascension', 'campaign'] as const;
export type Mode = (typeof MODES)[number];
export type Phase = 'lobby' | 'shop' | 'countdown' | 'playing' | 'roundEnd' | 'end';
// votação na partida: trocar o modo (target = modo novo), expulsar um humano (target = id dele),
// trocar o sorteio dos times (target = 'round' sorteados a cada rodada, 'match' fixos na partida),
// mudar uma opção da partida (target = 'chave:valor', ex.: 'shop:60', 'runes:false'; vale na próxima rodada),
// reiniciar, encerrar agora, pôr ou tirar um bot (na próxima rodada) e pular a loja (target vazio)
const VOTE_KINDS = ['mode', 'kick', 'shuffle', 'opt', 'restart', 'end', 'addBot', 'removeBot', 'skipShop'] as const;
export type Vote = { kind: (typeof VOTE_KINDS)[number]; target: string; by: string; yes: string[]; no: string[]; ends: number };

// opções da partida (pedido do Fernando, 18/10: ajustar o ritmo do jogo, com mais ou menos itens por rodada), escolhidas na sala de espera
// por quem começa a partida: segundos de loja, ritmo da contagem e do fim de rodada, multiplicador de toda renda de ouro,
// ouro inicial (também multiplicado) e rodadas para vencer (no Deathmatch vira DM_GOALS abates)
export const OPTION_CHOICES = {
  shop: [30, 45, 60, 90, 120], // a loja ainda acaba antes quando todos clicam Pronto
  pace: ['short', 'normal', 'long'],
  economy: [0.6, 1, 1.5, 2], // Fernando, 20/10 (issue #88): antes ×1,6 e ×2,5
  startGold: [30, 60, 100],
  goal: [3, 5, 7],
  // mecânicas que dá para desligar: runas, morte súbita e baús de ouro
  runes: [true, false],
  sudden: [true, false],
  chests: [true, false],
  // dificuldade dos bots (pedido do Fernando, 18/10); 'auto' ajusta cada bot pelo placar dos humanos
  difficulty: ['easy', 'casual', 'normal', 'veteran', 'hard', 'auto'],
  // formato da arena (pedido do Fernando, 18/10): sorteado a cada rodada ou fixo
  arena: ['random', ...ARENA_IDS],
  // efeito de rodada (pedido do Fernando, 21/10: ativável na criação da sala, issue #189): desligado, sorteado a cada rodada ou fixo
  effect: ['off', 'random', ...ROUND_EFFECT_IDS],
} as const;
export type MatchOpts = { [K in keyof typeof OPTION_CHOICES]: (typeof OPTION_CHOICES)[K][number] };
// os padrões são os números de sempre (SHOP_MS, START_GOLD, WINS_TO_WIN), para o simulador e as salas antigas
export const DEFAULT_OPTS: MatchOpts = { shop: 30, pace: 'normal', economy: 1, startGold: 30, goal: 5, runes: true, sudden: true, chests: true, difficulty: 'auto', arena: 'random', effect: 'off' };
// 'chave:valor' de um voto de opção → [chave, valor] válidos, ou null
export function parseOpt(target: string): [keyof MatchOpts, MatchOpts[keyof MatchOpts]] | null {
  const [k, raw] = target.split(':');
  if (!(k in OPTION_CHOICES) || raw === undefined) return null;
  const val = (OPTION_CHOICES[k as keyof MatchOpts] as readonly (string | number | boolean)[]).find((c) => String(c) === raw);
  return val === undefined ? null : [k as keyof MatchOpts, val as MatchOpts[keyof MatchOpts]];
}
export const PACE = { short: 0.6, normal: 1, long: 1.6 }; // multiplica COUNTDOWN_MS e ROUND_END_MS
export const DM_GOALS = { 3: 10, 5: 15, 7: 25 }; // 15 = DM_KILLS_TO_WIN
export const goalOf = (m: Pick<Match, 'mode' | 'opts'>) => (m.mode === 'ascension' ? ASC_ROUNDS : m.mode === 'deathmatch' ? DM_GOALS[m.opts.goal] : m.opts.goal);
const startGold = (m: Match) => Math.round(m.opts.startGold * m.opts.economy);

// Quem entra depois recebe só a renda garantida das rodadas que já acabaram:
// no meio da rodada atual ela ainda não foi conquistada. Na loja/fim da rodada,
// m.round já é o número de rodadas concluídas; no countdown/jogo, é a atual.
function lateJoinGold(m: Match) {
  if (m.mode === 'deathmatch' || m.asc) return startGold(m);
  const finished = m.phase === 'shop' || m.phase === 'roundEnd' ? m.round : Math.max(0, m.round - 1);
  return startGold(m) + finished * Math.round(ROUND_GOLD * m.opts.economy);
}

export type Player = {
  id: string;
  name: string;
  bot: boolean;
  color: number; // 0..7
  character: CharacterId; // o da cabeça da aparência (retrato 2D)
  look: string; // aparência montada (7 dígitos, ver LOOK_PARTS)
  score: number; // rodadas vencidas (deathmatch: abates)
  gold: number;
  goldCarry?: number; // fração de ouro ainda não paga (ver earn)
  economy?: Economy; // contadores da rodada para a telemetria
  spells: Record<SpellId, number>;
  items: Record<ItemId, number>;
  stats: Stats;
  // compras feitas nesta loja (mais recente por último), para poder desfazer e trocar
  bought: { key: string; price: number }[];
  held: Record<string, number[]>; // rodada em que cada nível comprado (magia/item) entrou, para o valor de venda
  ready: boolean;
  connected: boolean;
  team: number | null; // modo Times: 0 = Azul, 1 = Vermelho
  setup?: BotSetup; // treino: magias, itens e jeito de jogar escolhidos para este bot
  difficulty?: MatchOpts['difficulty']; // bot: a dificuldade dele, escolhida na sala (sem ela, a da partida)
  dummy?: boolean; // sandbox: boneco parado (bot que não anda nem atira)
  servo?: ServoKind; // Campanha: vaga do Fumo (bot do time 1) e o tipo de servo da onda atual
  hpMax?: number; // vida máxima quando não é a de sempre (servos), para a barra no navegador
  turret?: TurretDir; // Sandbox: tiro fixo, sem dano nem deslocamento.
  // espectador (pedido do Sky, 20/10): sem mago a partir da próxima rodada; pontos, ouro e compras ficam guardados para voltar
  watch?: boolean;
};

// torreta da sandbox: para onde atira em cada direção (passo no plano do chão; y positivo é para baixo na tela)
export const TURRET_DIR = { north: [0, -1], east: [1, 0], south: [0, 1], west: [-1, 0] } as const;
export type TurretDir = keyof typeof TURRET_DIR;

// Sandbox (pedido do Fernando, 19/10): sala para testar magias e interações, sem fim de rodada nem telemetria.
// god: vida infinita para os humanos; noCd: magias e itens dos humanos sem recarga; shrink: a arena encolhe
export type Sandbox = { god: boolean; noCd: boolean; shrink: boolean };
export type SandboxCmd =
  | { op: 'set'; key: keyof Sandbox; on: boolean }
  | { op: 'bot'; bot?: BotSetup; dummy?: boolean }
  | { op: 'turret'; direction: TurretDir }
  | { op: 'arena'; arena: ArenaId } // forma escolhida: reinicia a rodada e fica nos reinícios seguintes (pedido do Fernando, 20/10)
  | { op: 'radius'; step: 1 | -1 } // pedra uma faixa maior ou menor, na hora (volta ao padrão no reinício)
  | { op: 'rune'; kind: RuneKind } // runa escolhida ao lado de quem pediu (pedido do Sky, 20/10)
  | { op: 'effect'; effect: RoundEffectId | null } // efeito de rodada na hora, sem reiniciar; fica nos reinícios seguintes
  | { op: 'restart' };
const SANDBOX_GOLD = 9999;
// teto da pedra na sandbox: o raio com 10 magos (14,9 m), duas faixas de folga acima da maior arena real (8 magos, 13,6 m);
// na forma mais larga (Ilhas, 1,63 × raio) fica em 24 m, dentro do MAX_COORD (30 m) do protocolo, então o clique ainda alcança a pedra
const SANDBOX_R_MAX = arenaRadius(10);

export type Match = {
  phase: Phase;
  mode: Mode;
  round: number;
  phaseEnds: number;
  players: Player[];
  world: World | null;
  winner: string | null;
  lastRoundWinner: string | null;
  emptyRounds: number; // rodadas seguidas sem vencedor
  steps: number;
  vote: Vote | null;
  dmgOn?: Record<string, Record<string, number>>; // dano de cada atacante em cada vítima desde que ela entrou viva (para a assistência)
  // sequências de abate: kills = abates sem morrer (atravessa as rodadas), multi = abates seguidos rápidos, at = w.t do último abate
  streaks?: Record<string, { kills: number; multi: number; at: number }>;
  pendingMode: Mode | null; // modo votado: vale quando a próxima rodada começar
  banned: string[]; // expulsos por votação não voltam a esta sala
  teamShuffle: boolean; // Times: sorteados a cada rodada (true) ou fixos na partida
  pendingShuffle: boolean | null; // sorteio votado: vale quando a próxima rodada começar
  winnerTeam: number | null; // Times fixos: o time campeão
  opts: MatchOpts;
  pendingOpts: Partial<MatchOpts>; // opções votadas: valem quando a próxima rodada começar
  botDelta: number; // bots votados para entrar (+) ou sair (−) quando a próxima rodada começar
  sandbox?: Sandbox; // só nas salas sandbox (escolhido no começo da partida)
  night?: Night; // só na Campanha
  roundPaid?: string[]; // quem já recebeu o ouro garantido desta rodada (paga na queda)
  nextEffect?: RoundEffectId | null; // efeito da próxima rodada, sorteado antes da loja para cada um comprar sabendo
  asc?: AscState; // só no modo Ascensão: XP, escolhas de carta e ordem de queda (ascension.ts)
  lobby?: AscLobby; // só na sala do Ascensão: o dono e os bots e opções que ele escolheu (ascension.ts)
};

export const newMatch = (): Match => ({
  phase: 'lobby', mode: 'rounds', round: 0, phaseEnds: 0, players: [], world: null, winner: null, lastRoundWinner: null, emptyRounds: 0, steps: 0, vote: null, pendingMode: null, banned: [],
  teamShuffle: true, pendingShuffle: null, winnerTeam: null, opts: { ...DEFAULT_OPTS }, pendingOpts: {}, botDelta: 0,
});

const player = (m: Match, id: string | null) => m.players.find((p) => p.id === id);
// quem joga (tem mago a cada rodada): só esses ocupam as vagas de mago, entram nos times e seguram a loja
export const playing = (m: Match) => m.players.filter((p) => !p.watch);

// o bot i+1 da partida recebe BOT_NAMES[i] (a sala mostra a lista nesta ordem)
export const BOT_NAMES = ['Gul’dan', 'Merlim', 'Morgana', 'Rasputin', 'Zatanna', 'Mandrake', 'Gandalfo'];

// watch: entra assistindo; sem vaga de mago, a pessoa também entra assistindo (até MAX_WATCHERS)
export function addPlayer(m: Match, id: string, name: string, bot = false, watch = false, rand: () => number = Math.random): boolean {
  if (m.banned.includes(id)) return false;
  const known = player(m, id);
  if (known) {
    known.name = name;
    known.connected = true;
    return true;
  }
  const full = playing(m).length >= MAX_PLAYERS;
  const watchersFull = m.players.length - playing(m).length >= MAX_WATCHERS;
  if (full && (bot || watchersFull)) return false;
  // pediu para assistir com os espectadores no limite: entra jogando (ainda há vaga de mago)
  const watching = !bot && (full || (watch && !watchersFull));
  // bots ganham um personagem diferente cada um, na ordem da lista (sem sorteio, para os testes)
  const character = bot ? CHARACTERS[(m.players.length + 1) % CHARACTERS.length].id : 'mage';
  // a Campanha não tem ouro (nem para quem entra no meio da noite). Nos outros modos, quem entra para jogar no meio da
  // partida chega à loja seguinte com a renda garantida das rodadas perdidas (#281); espectador continua sem essa compra.
  const gold = m.night ? 0 : !bot && !watching && m.phase !== 'lobby' && m.phase !== 'end' ? lateJoinGold(m) : startGold(m);
  m.players.push({ id, name, bot, color: freeColor(m), character, look: lookOf(character), score: 0, gold, economy: newEconomy(gold), spells: noSpells(), items: noItems(), stats: newStats(), bought: [], held: {}, ready: bot, connected: true, team: null, ...(watching && { watch: true }) });
  enter(m, m.players[m.players.length - 1], rand);
  ascOwner(m);
  return true;
}

// primeira cor que ninguém em campo usa (quem assiste pode repetir; ao voltar a jogar ganha uma livre)
function freeColor(m: Match): number {
  const used = new Set(playing(m).map((p) => p.color));
  return [0, 1, 2, 3, 4, 5, 6, 7].find((c) => !used.has(c)) ?? 0;
}

// assistir ou voltar a jogar: vale a partir da próxima rodada (o mundo de cada rodada só tem quem joga);
// voltar precisa de vaga de mago. Na sandbox, que não tem fim de rodada, vale na hora
export function setWatch(m: Match, id: string, on: boolean, rand: () => number = Math.random): boolean {
  const p = player(m, id);
  if (!p || p.bot || !!p.watch === on) return false;
  if (!on && playing(m).length >= MAX_PLAYERS) return false;
  if (on && m.players.length - playing(m).length >= MAX_WATCHERS) return false; // espectadores no limite
  if (on) {
    p.watch = true;
    p.team = null; // nos Times fixos, ao voltar entra no time menor
    // sandbox e Campanha não têm fim de rodada para o mago sumir: sai na hora (na Campanha, senão ficava parado contando como Aceso vivo)
    if ((m.sandbox || m.night) && m.world) m.world.wizards = m.world.wizards.filter((z) => z.id !== id);
    return true;
  }
  delete p.watch;
  if (playing(m).some((q) => q !== p && q.color === p.color)) p.color = freeColor(m);
  enter(m, p, rand);
  return true;
}

// sandbox: quem entra no meio da rodada ganha um mago, que nasce no próximo passo (como quem volta no deathmatch);
// Campanha: o estágio é um mundo só, então quem chega entra na hora, como Aceso, onde o grupo está
function enter(m: Match, p: Player, rand: () => number) {
  const w = (m.sandbox || m.night) && m.world;
  if (!w || p.watch || w.wizards.some((z) => z.id === p.id)) return;
  const z = newWorld([p.id], { [p.id]: p.spells }, { [p.id]: p.items }, 0, rand).wizards[0];
  if (!m.night) return void w.wizards.push(Object.assign(z, { alive: false, respawnAt: 0 }));
  p.team = 0;
  w.wizards.push(Object.assign(z, { team: 0, pos: w.map!.home, invulnUntil: w.t + INVULN_TIME }));
}

// sandbox: compra e venda valem na hora, no mago da rodada
function refit(m: Match, p: Player) {
  const z = m.sandbox && m.world?.wizards.find((q) => q.id === p.id);
  if (z) Object.assign(z, gearOf(p.items), { spells: { ...p.spells } });
}

// bot novo com o primeiro id livre (bot-1…bot-8); undefined com a sala cheia
function newBot(m: Match, rand: () => number): Player | undefined {
  const n = [1, 2, 3, 4, 5, 6, 7, 8].find((k) => !m.players.some((p) => p.id === 'bot-' + k)) ?? 0;
  return n && addPlayer(m, 'bot-' + n, BOT_NAMES[(n - 1) % BOT_NAMES.length], true, false, rand) ? m.players[m.players.length - 1] : undefined;
}

// no lobby e no fim sai da lista; no meio da partida o mago fica parado esperando a pessoa voltar
export function removePlayer(m: Match, id: string) {
  if (m.phase === 'lobby' || m.phase === 'end') {
    m.players = m.players.filter((p) => p.id !== id);
    ascOwner(m);
  } else {
    const p = player(m, id);
    if (p) p.connected = false;
  }
}

// opts: só as opções que mudam (sem elas fica o que a sala já tinha); setup[i]: configuração do bot i+1, só com uma pessoa
// na sala (ninguém dá magias aos bots numa partida com outras pessoas); a dificuldade de cada bot vale em qualquer sala;
// sandbox: a sala vira sandbox (começa até sozinho, os bots entram pelo painel)
export function startMatch(m: Match, now: number, bots: number, mode: Mode = 'rounds', teamShuffle = true, rand: () => number = Math.random, opts: Partial<MatchOpts> = {}, setup: BotSetup[] = [], sandbox = false): boolean {
  if (m.phase !== 'lobby' && m.phase !== 'end') return false;
  // o modo que vale sai antes de tudo: o Ascensão é um tipo de sala, não um modo a escolher (Fernando, 21/10: opção própria
  // no menu Jogar, fora dos modos da sala principal): sala do Ascensão só joga Ascensão, venha o pedido que vier (um
  // "start" com outro modo não monta a Campanha por cima do elenco do dono); sala normal e sandbox nunca viram Ascensão
  const kind: Mode = m.mode === 'ascension' && !sandbox ? 'ascension' : mode === 'ascension' ? 'rounds' : mode;
  const campaign = kind === 'campaign';
  // Campanha: de 1 a 4 humanos, sem bots aliados nem sandbox; as vagas do Fumo entram depois
  // quem assiste não conta (fica sem mago, como nos outros modos)
  if (campaign && (sandbox || playing(m).filter((p) => !p.bot && p.connected).length > CAMPAIGN.humans)) return false;
  // sala do Ascensão: valem os bots e as opções que o dono escolheu, venha de quem vier o Começar
  if (m.lobby && !sandbox) {
    opts = m.lobby.opts;
    setup = m.lobby.bots.map((difficulty) => ({ difficulty }));
    bots = setup.length;
  }
  m.opts = { ...m.opts, ...opts };
  m.sandbox = sandbox ? { god: true, noCd: true, shrink: false } : undefined; // sem recarga ligado de início (Fernando, 21/10)
  // começa redonda; a forma escolhida no painel fica em m.opts.arena e a sandbox nunca sorteia
  if (sandbox) m.opts = { ...m.opts, arena: 'circle' };
  m.players = m.players.filter((p) => !p.bot && p.connected);
  const solo = m.players.length === 1;
  for (let i = 0; playing(m).length < MAX_PLAYERS && i < (campaign ? 0 : bots); i++) {
    addPlayer(m, 'bot-' + (i + 1), BOT_NAMES[i % BOT_NAMES.length], true, false, rand);
    const bot = m.players[m.players.length - 1];
    const { difficulty, ...rest } = setup[i] ?? {};
    if (difficulty) bot.difficulty = difficulty;
    // só a dificuldade não é treino (a rodada não sai marcada na telemetria)
    if (solo && setup[i] && (!difficulty || Object.keys(rest).length)) bot.setup = rest;
  }
  if (campaign && m.players.length) for (let k = 1; k <= CAMPAIGN.slots; k++) if (addPlayer(m, 'fumo-' + k, '', true, false, rand)) dress(m, m.players[m.players.length - 1], 'ash');
  // quem assiste não conta: dá para pôr só bots em campo e assistir a partida
  if (playing(m).length < (sandbox ? 1 : 2)) return false;
  fresh(m, now, kind, teamShuffle, rand);
  return true;
}

// zera a partida e abre a loja da rodada 1 (começar, ou reiniciar por votação com os mesmos jogadores)
function fresh(m: Match, now: number, mode: Mode, teamShuffle: boolean, rand: () => number) {
  for (const p of m.players) {
    Object.assign(p, { score: 0, gold: startGold(m), goldCarry: 0, spells: noSpells(), items: noItems() });
    p.economy = newEconomy(p.gold);
    p.held = {};
    p.stats.match = newStat();
    p.stats.round = newStat();
    p.team = null;
  }
  m.asc = mode === 'ascension' ? newAsc(m.players.map((p) => p.id)) : undefined;
  if (m.asc) for (const p of m.players) p.gold = 0;
  Object.assign(m, { streaks: {}, mode, round: 0, winner: null, lastRoundWinner: null, emptyRounds: 0, steps: 0, vote: null, pendingMode: null, teamShuffle, pendingShuffle: null, winnerTeam: null, pendingOpts: {}, botDelta: 0 });
  // já sorteia na loja para cada um ver o time; com sorteio a cada rodada, a contagem sorteia de novo
  if (mode === 'teams') shuffleTeams(m, rand);
  // Campanha: noite nova (semente nova a cada tentativa); humanos no time 0, o Fumo no 1, ninguém com ouro
  m.night = mode === 'campaign' ? { seed: Math.floor(rand() * 2 ** 31), stage: 0, fight: null, wave: 0, since: 0, cracked: 0, done: [], result: null } : undefined;
  if (m.night) for (const p of m.players) Object.assign(p, { gold: 0, team: p.servo ? 1 : 0 });
  m.nextEffect = m.sandbox || m.night ? null : drawEffect(m, rand, null);
  enterShop(m, now, rand);
}

// efeito de uma rodada: fixo pela opção ou sorteado sem repetir o anterior (rodadas seguidas iguais cansam); null desligado e na sandbox.
// Desligado não gasta sorteio, então a partida fica igual à de antes dos efeitos (hash do style.test)
function drawEffect(m: Match, rand: () => number, prev: RoundEffectId | null): RoundEffectId | null {
  const o = m.opts.effect;
  if (m.sandbox) return m.nextEffect ?? null; // a sandbox nunca sorteia: fica o escolhido no painel (op 'effect')
  if (o === 'off') return null;
  if (o !== 'random') return o;
  const pool = ROUND_EFFECT_IDS.filter((e) => e !== prev);
  return pool[Math.floor(rand() * pool.length)];
}

// loja aberta: na fase da loja ou, nas Rodadas e nos Times, para quem já caiu na rodada (sugestão do Reinaldo, 18/10: montar a build morto)
export function canShop(m: Match, id: string): boolean {
  if (m.asc) return false; // Ascensão: sem loja
  if (m.phase === 'shop' || (m.sandbox && m.world)) return true; // sandbox: a qualquer hora da rodada
  return m.phase === 'playing' && m.mode !== 'deathmatch' && m.world?.wizards.find((z) => z.id === id)?.alive === false;
}

// compra: confere a loja, o preço (null = no máximo), o ouro e o resto (can); cobra e anota para desfazer e vender
function pay(m: Match, id: string, key: string, price: (p: Player) => number | null, can = (_: Player) => true): Player | null {
  const p = player(m, id);
  if (!p || !canShop(m, id)) return null;
  const cost = price(p);
  if (cost === null || p.gold < cost || !can(p)) return null;
  p.gold -= cost;
  economyOf(p).goldSpent += cost;
  p.bought.push({ key, price: cost });
  (p.held[key] ??= []).push(m.round);
  return p;
}

export function buy(m: Match, id: string, spell: SpellId): boolean {
  const p = pay(m, id, 'spell:' + spell, (p) => priceOf(spell, p.spells[spell]), (p) => p.spells[spell] > 0 || spellCount(p.spells) < MAX_SPELLS);
  if (p) p.spells[spell]++;
  if (p) refit(m, p);
  return !!p;
}

// troca de aparência em qualquer fase, até no meio da luta (pedido do Fernando, 19/10); o personagem vira o da cabeça
export function setLook(m: Match, id: string, look: string): boolean {
  const p = player(m, id);
  if (!p || p.look === look) return false;
  p.look = look;
  p.character = lookHead(look);
  return true;
}

export function buyItem(m: Match, id: string, item: ItemId): boolean {
  const p = pay(m, id, 'item:' + item, (p) => itemPrice(p.items, item));
  if (p) p.items[item]++;
  if (p) refit(m, p);
  return !!p;
}

// desfaz a compra mais recente daquele tipo feita nesta loja: devolve o ouro e baixa o nível
export function undoBuy(m: Match, id: string, key: string): boolean {
  const p = player(m, id);
  if (!p || !canShop(m, id)) return false;
  const i = p.bought.map((b) => b.key).lastIndexOf(key);
  if (i < 0) return false;
  const [kind, what] = key.split(':');
  if (kind === 'spell') p.spells[what as SpellId]--;
  else if (kind === 'item') p.items[what as ItemId]--;
  p.gold += p.bought[i].price;
  economyOf(p).goldRefunded += p.bought[i].price;
  p.bought.splice(i, 1);
  p.held[key]?.pop();
  refit(m, p);
  return true;
}

// quanto volta ao vender a magia/item inteiro ('spell:<id>' ou 'item:<id>'): cada nível volta 100% na loja em que foi comprado
// e perde 5% por rodada que a pessoa ficou com ele, até 75%; o nível inicial grátis não se vende. Nível sem registro (sala antiga) conta desde a rodada 0
const sellRate = (rounds: number) => Math.max(SELL_FLOOR, 1 - SELL_DECAY * Math.max(0, rounds));
export function sellValue(p: { spells: Record<SpellId, number>; items: Record<ItemId, number>; held?: Record<string, number[]> }, round: number, key: string): number {
  const [kind, what] = key.split(':');
  const spell = kind === 'spell';
  if (!spell && kind !== 'item') return 0; // só magia e item se vendem
  if (!(spell ? (SPELL_IDS as readonly string[]) : (ITEM_IDS as readonly string[])).includes(what)) return 0;
  const now = spell ? p.spells[what as SpellId] : p.items[what as ItemId];
  const first = spell ? noSpells()[what as SpellId] : noItems()[what as ItemId];
  if (now <= first) return 0;
  const when = p.held?.[key] ?? [];
  let total = 0;
  for (let l = first; l < now; l++) {
    const price = (spell ? priceOf(what as SpellId, l) : ITEMS[what as ItemId].cost) ?? 0;
    const k = when.length - (now - l); // os níveis mais novos estão no fim da lista
    total += price * sellRate(round - (k >= 0 ? when[k] : 0));
  }
  return Math.floor(total + 1e-9);
}

// dá para vender: vale ouro, ou é a Bola de fogo (pedido do Fernando, 18/10: deixa de ser obrigatória; o nível 1 grátis vale 0,
// mas vender libera a vaga das magias e a tecla; comprar de volta custa o preço normal, 0 no nível 1)
export const canSell = (p: Parameters<typeof sellValue>[0], round: number, key: string) =>
  sellValue(p, round, key) > 0 || FREE_SPELLS.some((s) => key === 'spell:' + s && p.spells[s] > 0);

// vende a magia ou o item inteiro (magia vai a 0, item volta ao nível inicial); não é ganho de ouro, então fora das estatísticas
export function sell(m: Match, id: string, key: string): boolean {
  const p = player(m, id);
  if (!p || !canShop(m, id) || !canSell(p, m.round, key)) return false;
  const value = sellValue(p, m.round, key);
  const [kind, what] = key.split(':');
  if (kind === 'spell') p.spells[what as SpellId] = 0;
  else p.items[what as ItemId] = noItems()[what as ItemId];
  p.gold += value;
  economyOf(p).goldRefunded += value;
  p.bought = p.bought.filter((b) => b.key !== key);
  delete p.held[key];
  refit(m, p);
  return true;
}

export function setReady(m: Match, id: string): boolean {
  const p = player(m, id);
  if (m.phase !== 'shop' || !p || p.ready || m.asc) return false; // Ascensão: pronto só depois de escolher as cartas
  p.ready = true;
  return true;
}

// a sala reiniciou (o mundo da rodada só vive na memória): repete a rodada a partir da loja
export function resume(m: Match, now: number, rand: () => number = Math.random) {
  // salas gravadas antes da escolha de personagem e do deathmatch existirem
  m.emptyRounds ??= 0;
  m.mode ??= 'rounds';
  m.banned ??= []; // salas gravadas antes da votação
  m.pendingMode ??= null;
  // salas gravadas antes do modo Times
  m.teamShuffle ??= true;
  m.pendingShuffle ??= null;
  m.winnerTeam ??= null;
  m.opts = { ...DEFAULT_OPTS, ...m.opts }; // salas gravadas antes das opções da partida e das votações novas
  m.pendingOpts ??= {};
  m.botDelta ??= 0;
  m.vote = null; // o prazo de uma votação gravada já passou
  if (m.night) Object.assign(m.night, { fight: m.night.fight ?? null, done: m.night.done ?? [], since: m.night.since ?? 0, cracked: m.night.cracked ?? 0 }); // noites gravadas antes do mapa explorável e das lápides
  if (m.asc) ascResume(m.asc);
  // salas do Ascensão gravadas antes do dono
  if (m.mode === 'ascension' && !m.sandbox) {
    m.lobby ??= { owner: null, bots: [], opts: {} };
    ascOwner(m);
  }
  for (const p of m.players) {
    p.character ??= 'mage';
    p.look = fixLook(p.look ?? lookOf(p.character)); // salas gravadas antes da aparência montada ou com peça da Ladina encapuzada (#107)
    // salas gravadas antes das magias novas, ou com uma que saiu do jogo (os Gêmeos, 19/10): fica só o que existe
    p.spells = Object.fromEntries(SPELL_IDS.map((s) => [s, p.spells[s] ?? noSpells()[s]])) as Record<SpellId, number>;
    const plan = (p as { plan?: BotPlan }).plan;
    if (plan) plan.buys = plan.buys.filter((b) => (b.kind === 'item' ? (ITEM_IDS as readonly string[]).includes(b.id) : isSpell(b.id)));
    // salas gravadas antes dos itens novos, ou com os ativos que viraram magia ou saíram (21/10, #217): fica só o que existe
    p.items = Object.fromEntries(ITEM_IDS.map((i) => [i, p.items[i] ?? 0])) as Record<ItemId, number>;
    // salas gravadas com a maestria Roubo de vida: vira o item (sem passar do nível máximo)
    const old = (p as { masteries?: { lifesteal?: number } }).masteries?.lifesteal ?? 0;
    if (old && !p.items.vampire) p.items.vampire = Math.min(6, old);
    delete (p as { masteries?: unknown }).masteries;
    p.held ??= {}; // salas gravadas antes da venda por rodada
    p.team ??= null;
    p.stats = fillStats(p.stats);
  }
  if (m.phase === 'countdown' || m.phase === 'playing') {
    m.round--;
    enterShop(m, now, rand);
  } else if (m.phase === 'roundEnd') afterRound(m, now, rand);
}

// expulsa um bot ou alguém que caiu e não voltou (gente conectada não pode ser expulsa por outro)
export function kick(m: Match, id: string): boolean {
  const p = player(m, id);
  if (!p || (!p.bot && p.connected) || p.servo) return false;
  drop(m, id);
  return true;
}

// tira da partida e mata o mago, se a rodada estiver rolando
function drop(m: Match, id: string) {
  m.players = m.players.filter((q) => q.id !== id);
  // sandbox: o mago sai do mundo (o id pode voltar no próximo bot)
  if (m.sandbox && m.world) m.world.wizards = m.world.wizards.filter((z) => z.id !== id);
  const wz = m.world?.wizards.find((z) => z.id === id);
  if (wz) {
    wz.alive = false;
    wz.hp = 0;
    wz.respawnAt = Infinity; // no deathmatch o expulso não volta
  }
}

export const VOTE_PHASES: Phase[] = ['shop', 'countdown', 'playing', 'roundEnd'];
// só humanos conectados votam; passa com mais da metade deles
const voters = (m: Match) => m.players.filter((p) => !p.bot && p.connected).map((p) => p.id);
export const votesNeeded = (humans: number) => Math.floor(humans / 2) + 1;

// abre uma votação (uma por vez, só com a partida rolando); quem abre já conta como SIM
export function startVote(m: Match, id: string, kind: Vote['kind'], target: string, now: number, rand: () => number = Math.random): boolean {
  if (m.vote || !VOTE_PHASES.includes(m.phase) || !voters(m).includes(id)) return false;
  // a Campanha começa e termina pela sala: sem troca de modo para dentro ou para fora dela, e sem bots aliados
  if ((kind === 'mode' && (target === 'campaign' || m.mode === 'campaign')) || (m.night && (kind === 'addBot' || kind === 'removeBot' || kind === 'shuffle'))) return false;
  if (kind === 'kick') {
    const t = player(m, target);
    if (!t || t.bot || t.id === id) return false; // bot já tem o ✕ direto
  } else if (kind === 'mode') {
    // qualquer um dos modos, menos o que já vale na próxima rodada
    if (!(MODES as readonly string[]).includes(target) || target === (m.pendingMode ?? m.mode)) return false;
    if (target === 'ascension' || m.mode === 'ascension') return false; // o tipo da sala não muda por votação
  } else if (kind === 'shuffle') target = (m.pendingShuffle ?? m.teamShuffle) ? 'match' : 'round'; // alterna o que valeria na próxima rodada
  else if (kind === 'opt') {
    // uma opção, com valor diferente do que já vale na próxima rodada
    const o = parseOpt(target);
    if (!o || { ...m.opts, ...m.pendingOpts }[o[0]] === o[1]) return false;
  } else {
    if (kind === 'addBot' && playing(m).length + Math.max(0, m.botDelta) >= MAX_PLAYERS) return false;
    if (kind === 'removeBot' && m.players.filter((p) => p.bot).length + m.botDelta <= 0) return false;
    if (kind === 'skipShop' && m.phase !== 'shop') return false;
    target = '';
  }
  m.vote = { kind, target, by: id, yes: [id], no: [], ends: now + VOTE_MS };
  settleVote(m, now, rand);
  return true;
}

export function castBallot(m: Match, id: string, yes: boolean, now: number, rand: () => number = Math.random): boolean {
  const v = m.vote;
  if (!v || !voters(m).includes(id) || v.yes.includes(id) || v.no.includes(id)) return false;
  (yes ? v.yes : v.no).push(id);
  settleVote(m, now, rand);
  return true;
}

// fecha a votação: passa com maioria; falha se os NÃO a tornam impossível, se o prazo acabou ou se a partida acabou
function settleVote(m: Match, now: number, rand: () => number) {
  const v = m.vote;
  if (!v) return;
  const who = voters(m);
  const need = votesNeeded(who.length);
  const yes = v.yes.filter((id) => who.includes(id)).length;
  const no = v.no.filter((id) => who.includes(id)).length;
  if (!VOTE_PHASES.includes(m.phase) || now >= v.ends || who.length - no < need) m.vote = null;
  else if (yes >= need) {
    m.vote = null;
    // voltar ao que já vale agora só cancela o pendente
    if (v.kind === 'mode') m.pendingMode = v.target === m.mode ? null : (v.target as Mode);
    else if (v.kind === 'shuffle') m.pendingShuffle = (v.target === 'round') === m.teamShuffle ? null : v.target === 'round';
    else if (v.kind === 'opt') {
      const [k, val] = parseOpt(v.target)!;
      if (m.opts[k] === val) delete m.pendingOpts[k];
      else Object.assign(m.pendingOpts, { [k]: val });
    } else if (v.kind === 'restart') fresh(m, now, m.mode, m.teamShuffle, rand);
    else if (v.kind === 'end') {
      // vence quem tem mais pontos; empate no topo = ninguém
      const [best, top] = atTop(m.players, (p) => p.score);
      m.winner = best > 0 && top.length === 1 ? top[0].id : null;
      m.winnerTeam = m.mode === 'teams' && !m.teamShuffle && best > 0 && new Set(top.map((p) => p.team)).size === 1 ? top[0].team : null;
      m.phase = 'end';
      m.world = null;
      closeNight(m);
    } else if (v.kind === 'addBot') m.botDelta++;
    else if (v.kind === 'removeBot') m.botDelta--;
    else if (v.kind === 'skipShop') m.phaseEnds = now; // a loja fecha no próximo passo
    else {
      drop(m, v.target);
      m.banned.push(v.target);
    }
  }
}

// sala esquecida aberta (ninguém joga há muito tempo): encerra a partida para o laço parar
export function endIdle(m: Match) {
  const best = Math.max(0, ...m.players.map((p) => p.score));
  m.winner = best > 0 ? (m.players.find((p) => p.score === best)?.id ?? null) : null;
  m.phase = 'end';
  m.world = null;
  m.vote = null;
  closeNight(m);
}

export const shouldRun = (m: Match, humansConnected: number) => humansConnected > 0 && m.phase !== 'lobby' && m.phase !== 'end';

function enterShop(m: Match, now: number, rand: () => number) {
  m.phase = 'shop';
  for (const p of m.players) {
    p.bought = [];
    p.economy = newEconomy(p.gold);
  }
  m.phaseEnds = now + m.opts.shop * 1000;
  m.world = null;
  for (const p of m.players) {
    p.ready = p.bot;
    // treino: bot configurado entra exatamente com as magias e itens pedidos, sem compra automática
    const s = p.setup;
    if (s?.spells || s?.items) Object.assign(p, { spells: { ...noSpells(), ...s.spells }, items: { ...noItems(), ...s.items } });
    else botShop(m, p, rand);
  }
}

// o bot compra o que o plano dele pede enquanto o ouro der (botBuy roda mesmo para gente, como sempre rodou: gasta o sorteio)
function botShop(m: Match, p: Player, rand: () => number) {
  if (p.servo) return;
  for (let b = botBuy(p, rand, botSkill(m, p)); p.bot && b && (b.kind === 'spell' ? buy(m, p.id, b.id) : buyItem(m, p.id, b.id)); b = botBuy(p, rand, botSkill(m, p)));
}

// 2 times de tamanhos iguais (com número ímpar, um tem 1 a mais; qual deles também é sorteado)
function shuffleTeams(m: Match, rand: () => number) {
  const order = [...playing(m)];
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const first = rand() < 0.5 ? 0 : 1;
  order.forEach((p, i) => (p.team = (i + first) % 2));
}

// força do bot pela dificuldade (a dele ou a da partida); no treino, o skill configurado vai por cima
export function botSkill(m: Match, bot: Player): BotSkill {
  const base = difficultySkill(m, bot);
  return bot.setup?.skill ? { ...base, ...bot.setup.skill } : base;
}

// Automático: humanos à frente deste bot no placar → bot mais forte; atrás → mais fraco (contínuo, em fração da meta)
function difficultySkill(m: Match, bot: Player): BotSkill {
  const d = bot.difficulty ?? m.opts.difficulty;
  if (d !== 'auto') return BOT_SKILL[d];
  const humans = m.players.filter((p) => !p.bot);
  if (!humans.length) return BOT_SKILL.normal;
  const avg = humans.reduce((s, p) => s + p.score, 0) / humans.length;
  return skillAt(Math.max(-1, Math.min(1, (avg - bot.score) / goalOf(m))));
}

const teamSize = (m: Match, t: number) => playing(m).filter((p) => p.team === t).length;

function enterCountdown(m: Match, now: number, rand: () => number) {
  m.dmgOn = {};
  if (m.asc) m.asc.fallen = [];
  for (const s of Object.values(m.streaks ?? {})) s.at = -1e9; // o relógio do mundo volta a zero: abate rápido não atravessa rodadas
  // troca de modo votada: antes de criar o mundo (que depende do modo); os pontos zeram porque as metas são outras
  if (m.pendingMode) {
    m.mode = m.pendingMode;
    m.pendingMode = null;
    m.emptyRounds = 0;
    for (const p of m.players) p.score = 0;
  }
  if (m.pendingShuffle !== null) {
    m.teamShuffle = m.pendingShuffle;
    m.pendingShuffle = null;
  }
  m.opts = { ...m.opts, ...m.pendingOpts };
  m.pendingOpts = {};
  // bots votados (a fase ainda é a loja): o novo entra no padrão (Automático), seja qual for a da partida, com o ouro inicial, e já compra; sai o último bot da lista
  for (; m.botDelta > 0; m.botDelta--) {
    const b = newBot(m, rand);
    if (!b) break;
    b.difficulty = DEFAULT_OPTS.difficulty;
    botShop(m, b, rand);
  }
  for (; m.botDelta < 0; m.botDelta++) {
    const bot = m.players.filter((p) => p.bot).pop();
    if (bot) m.players = m.players.filter((p) => p !== bot);
  }
  m.botDelta = 0;
  if (m.mode === 'teams') {
    // a cada rodada: sorteia de novo; fixos: mantém, e quem entrou depois vai para o time menor
    if (m.teamShuffle || playing(m).every((p) => p.team === null)) shuffleTeams(m, rand);
    for (const p of playing(m)) if (p.team === null) p.team = teamSize(m, 1) < teamSize(m, 0) ? 1 : 0;
    // um time inteiro saiu da sala: sorteia de novo, senão a rodada acabaria na hora
    if (new Set(playing(m).map((p) => p.team)).size < 2) shuffleTeams(m, rand);
  }
  m.round++;
  for (const p of m.players) p.stats.round = newStat();
  m.roundPaid = [];
  if (m.night) return enterStage(m, now, rand);
  const ids = playing(m).map((p) => p.id);
  const teams = m.mode === 'teams' ? Object.fromEntries(playing(m).map((p) => [p.id, p.team ?? 0])) : {};
  // arena fixa pela sala ou sorteada a cada rodada (o sorteio só gasta número aleatório quando é 'random')
  const arena = m.opts.arena === 'random' ? ARENA_IDS[Math.floor(rand() * ARENA_IDS.length)] : m.opts.arena;
  m.world = newWorld(ids, Object.fromEntries(playing(m).map((p) => [p.id, p.spells])), Object.fromEntries(playing(m).map((p) => [p.id, p.items])), PILLAR.min + Math.floor(rand() * (PILLAR.max - PILLAR.min + 1)), rand, m.mode === 'deathmatch' || !!m.sandbox, teams, { runes: m.opts.runes, sudden: m.opts.sudden, chests: m.opts.chests && !m.asc }, arena);
  if (m.asc) ascMark(m);
  if (m.sandbox) m.world.shrink = m.sandbox.shrink; // a sandbox usa o mundo do deathmatch: não encolhe (a não ser que peçam) e quem morre volta
  // efeito da rodada: o que a loja mostrou (a opção pode ter mudado por votação); o da próxima é sorteado depois do mundo,
  // para não mudar a arena nem os pilares
  const fx = !m.sandbox && m.opts.effect === 'random' ? (m.nextEffect ?? drawEffect(m, rand, null)) : drawEffect(m, rand, null);
  m.world.effect = fx;
  m.world.mods = roundMods(fx);
  // Campo aberto: some com os obstáculos sorteados; baús (nascem durante a rodada) e Barricada continuam
  if (fx === 'clear') m.world.pillars = [];
  m.nextEffect = drawEffect(m, rand, fx);
  m.phase = 'countdown';
  m.phaseEnds = now + COUNTDOWN_MS * PACE[m.opts.pace];
}

// ganho de ouro com o "+N" subindo em cima do mago: prêmios do fim da rodada (o mundo ainda existe até a loja), abate, assistência e monte de ouro
function bonus(m: Match, p: Player, gold: number, scaled = true, recovery = false) {
  if (gold <= 0 || m.night) return; // a Campanha não tem ouro
  const n = earn(m, p, gold, scaled, recovery);
  const z = m.world?.wizards.find((q) => q.id === p.id);
  if (z && n > 0) m.world!.events.push({ k: 'gold', id: p.id, n, x: z.pos.x, y: z.pos.y });
}

function endRound(m: Match, now: number, winner: string | null) {
  if (m.night) {
    m.lastRoundWinner = null;
    m.phase = 'roundEnd';
    m.phaseEnds = now + ROUND_END_MS * PACE[m.opts.pace];
    return;
  }
  const dm = m.mode === 'deathmatch';
  const p = player(m, winner);
  // no deathmatch os pontos já vieram dos abates; aqui o vencedor é só quem fez mais abates na rodada
  const played = new Set(m.world?.wizards.map((z) => z.id));
  // nos Times, todos do time de quem venceu (vivos ou não) pontuam e ganham o ouro da vitória
  const teams = m.mode === 'teams';
  const inRound = m.players.filter((q) => played.has(q.id));
  const won = !p || dm || m.asc ? [] : teams ? inRound.filter((q) => q.team === p.team) : [p];
  // quem já liderava sozinho o placar ganha menos pela vitória (freia a bola de neve); nos Times, à frente de todos os inimigos
  const leaders = won.filter((q) => q.score > 0 && m.players.every((o) => o === q || (teams && o.team === q.team) || o.score < q.score));
  for (const q of won) {
    q.score++;
    bonus(m, q, leaders.includes(q) ? LEADER_WIN_GOLD : WIN_GOLD);
  }
  // quem sobreviveu ficou vivo a rodada inteira
  for (const z of m.world?.wizards ?? []) {
    const q = player(m, z.id);
    if (q && z.alive && !dm) addStat(q, (s) => (s.alive += m.world!.t));
  }
  if (m.asc) ascEndRound(m, [...played], m.world!.wizards.filter((z) => z.alive).map((z) => z.id));
  const top = Math.max(0, ...inRound.map((q) => q.stats.round.dmg));
  for (const q of inRound) if (top > 0 && q.stats.round.dmg === top) bonus(m, q, TOP_DMG_GOLD);
  for (const q of inRound) if (!m.roundPaid?.includes(q.id)) earn(m, q, ROUND_GOLD);
  // recuperação: quem ganhou menos ouro na partida que a média recebe metade da diferença
  const avg = inRound.reduce((sum, q) => sum + q.stats.match.gold, 0) / Math.max(1, inRound.length);
  // o ouro da partida já está na escala da economia: só o teto é multiplicado
  for (const q of inRound) bonus(m, q, Math.min(Math.round(RECOVERY.max * m.opts.economy), Math.floor((avg - q.stats.match.gold) * RECOVERY.share)), false, true);
  m.lastRoundWinner = winner;
  m.emptyRounds = winner || dm ? 0 : m.emptyRounds + 1;
  m.phase = 'roundEnd';
  m.phaseEnds = now + ROUND_END_MS * PACE[m.opts.pace];
}

// como no original: ganha quem vencer goalOf(m) rodadas primeiro (padrão WINS_TO_WIN)
function afterRound(m: Match, now: number, rand: () => number) {
  const n = m.night;
  if (n) {
    // nesta versão o estágio 1 é a noite inteira: a rodada só acaba com a noite vencida ou perdida
    if (!n.result) return enterShop(m, now, rand);
    m.phase = 'end';
    m.winner = null;
    m.world = null;
    return closeNight(m);
  }
  if (m.asc) {
    if (m.round < ASC_ROUNDS) return enterShop(m, now, rand);
    m.phase = 'end';
    m.winner = ascWinner(m);
    m.world = null;
    return;
  }
  if (m.mode === 'deathmatch') {
    // a meta só vale no fim da rodada (a rodada sempre dura os 60 s); empate no topo joga mais uma rodada
    const [best, top] = atTop(m.players, (p) => p.score);
    if (best < goalOf(m) || top.length > 1) return enterShop(m, now, rand);
    m.phase = 'end';
    m.winner = top[0].id;
    m.world = null;
    return;
  }
  const champion = m.players.find((p) => p.score >= goalOf(m));
  // 3 rodadas seguidas sem ninguém sobrar: todo mundo parado, a partida acaba (e o laço da sala para)
  if (!champion && m.emptyRounds < EMPTY_ROUNDS_END) return enterShop(m, now, rand);
  m.phase = 'end';
  m.winner = champion?.id ?? null;
  // com times fixos quem vence é o time; sorteados a cada rodada, cada um por si
  m.winnerTeam = m.mode === 'teams' && !m.teamShuffle ? (champion?.team ?? null) : null;
  m.world = null;
}

const EMPTY_ROUNDS_END = 3;

// Campanha ---------------------------------------------------------------------------------------------------------

// servos jogam um degrau abaixo da dificuldade da sala (o chefe, quando houver, usa a dela)
const EASIER = { easy: 'easy', casual: 'easy', normal: 'easy', veteran: 'easy', hard: 'normal', auto: 'easy' } as const;

// veste a vaga do Fumo com um tipo de servo: aparência, vida e magias (sem itens, sem ouro)
function dress(m: Match, p: Player, kind: ServoKind) {
  const S = SERVOS[kind];
  // só as magias do tipo de servo: sem a Bola de fogo e o Flagelo que todo mago ganha de graça
  Object.assign(p, { servo: kind, name: S.name, character: S.look, look: lookOf(S.look), hpMax: S.hp, spells: { ...noSpells(), fireball: 0, scourge: 0, ...S.spells }, items: noItems(), gold: 0, team: 1, difficulty: EASIER[m.opts.difficulty] });
}

const mapOf = (n: Night) => nightMap(n.seed, n.stage);
const center = (x: number, y: number) => v(x + 0.5, y + 0.5);
// ponto de controle da sala (a marca fica no "C"; o centro é entre o C e o número) e onde o Fumo entra
const checkpointOf = (map: NightMap, i: number) => map.marks.filter((q) => q.room === i && q.kind === 'checkpoint').map((q) => v(q.x + 1, q.y + 0.5))[0];
const spawnsOf = (map: NightMap, i: number) => map.marks.filter((q) => q.room === i && (q.kind === 'entry' || q.kind === 'boss')).map((q) => center(q.x, q.y));
const isBoss = (map: NightMap, i: number) => map.rooms[i].room.pool === 'chefe';
const fight = (n: Night, map: NightMap, i: number) => fightOf(map, i, n.seed, n.stage);
// magos em roda em volta de p (no mapa, keepOut tira de dentro da parede no passo seguinte)
const around = (p: Vec, i: number, n: number) => (n === 1 ? p : v(p.x + Math.cos((i / n) * 2 * Math.PI) * 1.2, p.y + Math.sin((i / n) * 2 * Math.PI) * 1.2));

// estágio novo: o mapa inteiro da noite num mundo só; o grupo no início, as vagas do Fumo fora até um encontro
function enterStage(m: Match, now: number, rand: () => number) {
  const n = m.night!, map = mapOf(n);
  Object.assign(n, { fight: null, wave: 0, boss: undefined });
  for (const p of m.players) if (!p.servo) p.team = 0; // quem entrou no meio da noite também é Aceso
  // quem assiste não ganha mago (como nos outros modos)
  const ids = playing(m).map((p) => p.id);
  const teams = Object.fromEntries(playing(m).map((p) => [p.id, p.servo ? 1 : 0]));
  const w = newWorld(ids, Object.fromEntries(playing(m).map((p) => [p.id, p.spells])), Object.fromEntries(playing(m).map((p) => [p.id, p.items])), 0, rand, false, teams, { runes: false, sudden: false, chests: false });
  // arenaR pequeno: os bots usam frações dele como folga das paredes
  Object.assign(w, { map: terrainOf(map), arenaR: 3, isles: [], pillars: obstaclesOf(map), friendly: 'none', book: CAMPAIGN_BOOK }); // magia não pega aliado (Lucas, 20/10)
  const acesos = w.wizards.filter((z) => z.team === 0);
  acesos.forEach((z, i) => (z.pos = around(w.map!.home, i, acesos.length)));
  for (const z of w.wizards) if (z.team === 1) Object.assign(z, { alive: false, hp: 0, pos: v(-50, -50) }); // fora do mapa até a primeira onda
  m.world = w;
  m.phase = 'countdown';
  m.phaseEnds = now + COUNTDOWN_MS * PACE[m.opts.pace];
}

// põe a vaga do Fumo em jogo como este tipo de servo, em `at` (onda ou lápide). Servo não regenera (sem lava, só o dano
// derruba; com os 5/s de sempre o encontro se arrastava: medido em 19/10, número inicial a confirmar com o Lucas)
function summon(m: Match, w: World, p: Player, kind: ServoKind, at: Vec) {
  const z = w.wizards.find((q) => q.id === p.id);
  if (!z) return;
  dress(m, p, kind);
  // chefe: vida pelo tamanho do grupo e pesado (empurrão a menos); a vaga volta ao normal quando vira servo de novo
  const boss = !!SERVOS[kind].boss;
  if (boss) p.hpMax = bossHp(SERVOS[kind].hp, w.wizards.filter((q) => q.team === 0 && q.alive).length); // Acesos em pé ao entrar
  Object.assign(z, { spells: { ...p.spells }, cd: Object.fromEntries(SPELL_IDS.map((s) => [s, 0])), hpMax: p.hpMax, regen: 0, baseSpeed: WIZ_SPEED * (SERVOS[kind].speed ?? 1), kbResist: boss ? ODRAN.kbResist : 0, dashDmg: undefined, pitDeath: !boss });
  revive(w, z, at);
  if (boss) {
    m.night!.boss = newBoss(w.t);
    w.events.push({ k: 'boss', id: z.id, what: 'start', x: at.x, y: at.y });
  }
}

// onda: cada servo entra pelo E que a sala pede (vários pelo mesmo E nascem lado a lado); as vagas que sobram ficam de fora
function sendWave(m: Match, w: World, wave: Spawn[], spots: Vec[]) {
  m.players.filter((p) => p.servo).forEach((p, i) => {
    if (i >= wave.length) return void Object.assign(w.wizards.find((q) => q.id === p.id) ?? {}, { alive: false, hp: 0 });
    const e = wave[i].e % spots.length, same = wave.filter((s) => s.e % spots.length === e);
    summon(m, w, p, wave[i].kind, around(spots[e], same.indexOf(wave[i]), same.length));
  });
}

// lápides (cemitério): a cada `every` s do encontro uma lápide da sala racha e solta um servo, se houver vaga, até `max`;
// sem lápide de pé, não sobra nenhuma para rachar
function crack(m: Match, w: World, map: NightMap, i: number) {
  const n = m.night!, t = fight(n, map, i).tombs;
  if (!t || n.cracked >= t.max || w.t < n.since + t.every * (n.cracked + 1)) return;
  const tombs = map.marks.filter((q) => q.room === i && q.kind === 'statue').map((q) => v(q.x + (q.w ?? 1) / 2, q.y + (q.h ?? 1) / 2));
  const standing = w.pillars.map((q, k) => ({ q, k })).filter(({ q }) => q.alive && tombs.some((s) => dist(s, q.pos) < 0.01));
  if (!standing.length) return void (n.cracked = t.max);
  const slot = m.players.find((p) => p.servo && !w.wizards.find((z) => z.id === p.id)?.alive);
  if (!slot) return; // sem vaga: racha quando um servo cair
  const { q, k } = standing[Math.floor(nightRand(n.seed, n.stage, 1000 + i * 16 + n.cracked)() * standing.length)];
  q.alive = false;
  w.events.push({ k: 'pillar', i: k, x: q.pos.x, y: q.pos.y }, { k: 'clash', x: q.pos.x, y: q.pos.y, combo: 'pillar', r: 0.8 });
  n.cracked++;
  summon(m, w, slot, t.kind, q.pos);
}

// depois do passo, na arena: pilar derrubado pela investida, cera, e a fase 2 (os Cinzentos entram onde os pilares caíram)
function bossStep(m: Match, w: World, map: NightMap, i: number, s: NonNullable<Night['boss']>) {
  const slot = m.players.find((p) => p.servo && SERVOS[p.servo].boss);
  const z = slot && w.wizards.find((q) => q.id === slot.id);
  if (!z) return;
  const r = roomRect(map, i);
  const inside = (q: Vec) => q.x > r.x && q.y > r.y && q.x < r.x + r.w && q.y < r.y + r.h;
  const pillars = w.pillars.map((q, k) => (q.kind === 'rock' && inside(q.pos) ? k : -1)).filter((k) => k >= 0);
  if (afterBoss(w, z, s, pillars) !== 'phase2') return;
  const free = m.players.filter((p) => p.servo && p !== slot && !w.wizards.find((q) => q.id === p.id)?.alive).slice(0, ODRAN.adds);
  free.forEach((p, k) => summon(m, w, p, 'ash', w.pillars[pillars[k % pillars.length]].pos));
}

// alguém pisou no ponto de controle (ou entrou na arena do chefe): puxa todos os Acesos vivos para lá, tranca a sala e
// solta a primeira onda
function startFight(m: Match, w: World, map: NightMap, i: number, at: Vec) {
  const n = m.night!;
  Object.assign(n, { fight: i, wave: 0, since: w.t, cracked: 0, boss: undefined, falls: {} });
  w.lock = roomRect(map, i);
  w.map!.home = at;
  const acesos = w.wizards.filter((z) => z.alive && z.team === 0);
  acesos.forEach((z, k) => {
    const from = z.pos;
    Object.assign(z, { pos: around(at, k, acesos.length), vel: v(0, 0), target: null });
    w.events.push({ k: 'teleport', id: z.id, from, to: z.pos });
  });
  sendWave(m, w, fight(n, map, i).waves[0], spawnsOf(map, i));
}

// sala que este Aceso ativa agora: em cima do ponto de controle de uma sala ainda não vencida, ou já dentro da arena do chefe
function trigger(map: NightMap, done: number[], p: Vec): { i: number; at: Vec } | null {
  for (const [i, r] of map.rooms.entries()) {
    if (done.includes(i) || p.x < r.x + 2 || p.y < r.y + 1 || p.x > r.x + r.room.w - 2 || p.y > r.y + r.room.h - 1) continue;
    const cp = checkpointOf(map, i);
    if (cp && dist(cp, p) < 1.2) return { i, at: cp };
    if (isBoss(map, i)) return { i, at: p };
  }
  return null;
}

// a noite acabou (vencida, perdida, encerrada por votação ou por ninguém jogar): sem desfecho conta como perdida; o Fumo sai da sala
function closeNight(m: Match) {
  if (!m.night) return;
  m.night.result ??= 'lost';
  m.players = m.players.filter((p) => !p.servo);
}

// Aceso caído vira brasa onde caiu; aliado vivo perto dela por `need` s o traz de volta (afastar zera). Cada queda no mesmo
// encontro custa EMBER.perFall s a mais; na arena do chefe a brasa que está lá dentro apaga em EMBER.out s
function stepEmbers(m: Match, w: World, map: NightMap) {
  const n = m.night!, arena = n.fight !== null && isBoss(map, n.fight) ? roomRect(map, n.fight) : null;
  for (const z of w.wizards) {
    if (z.team !== 0) continue;
    if (z.alive) {
      z.ember = undefined;
      continue;
    }
    if (!z.ember) {
      const falls = (n.falls ??= {}), k = n.fight !== null ? (falls[z.id] ?? 0) : 0;
      if (n.fight !== null) falls[z.id] = k + 1; // só a queda dentro de um encontro encarece a próxima
      // quem cai dentro da lava vira brasa na última pedra firme: senão quem reacende queimaria junto e ele voltaria na lava
      if (inLava(w, z.pos) && z.safe) z.pos = z.safe;
      z.ember = { prog: 0, need: EMBER.base + EMBER.perFall * k, since: w.t };
      continue;
    }
    const e = z.ember;
    if (e.out) continue;
    const inArena = arena && z.pos.x > arena.x && z.pos.y > arena.y && z.pos.x < arena.x + arena.w && z.pos.y < arena.y + arena.h;
    if (inArena && w.t - Math.max(e.since, n.since) >= EMBER.out) {
      e.out = true;
      w.events.push({ k: 'ember', id: z.id, what: 'out', x: z.pos.x, y: z.pos.y });
      continue;
    }
    const near = w.wizards.some((o) => o.alive && o.team === 0 && dist(o.pos, z.pos) <= EMBER.reach);
    e.prog = near ? e.prog + DT : 0;
    if (e.prog < e.need) continue;
    revive(w, z, z.pos);
    z.hp = z.hpMax * EMBER.hp;
    z.ember = undefined;
    w.events.push({ k: 'ember', id: z.id, what: 'lit', x: z.pos.x, y: z.pos.y });
  }
}

// a cada passo: todos os humanos caídos perdem a noite; encontro aberto solta a próxima onda e, limpo, destranca a sala
// (o do chefe vence a noite); sem encontro, procura quem pisou num ponto de controle
function stepNight(m: Match, now: number, w: World) {
  const n = m.night!, map = mapOf(n);
  stepEmbers(m, w, map);
  if (!w.wizards.some((z) => z.alive && z.team === 0)) {
    n.result = 'lost';
    return endRound(m, now, null);
  }
  if (n.fight !== null) {
    crack(m, w, map, n.fight);
    if (n.boss) bossStep(m, w, map, n.fight, n.boss);
    if (w.wizards.some((z) => z.alive && z.team === 1)) return;
    const f = fight(n, map, n.fight);
    if (n.wave + 1 < f.waves.length) return sendWave(m, w, f.waves[++n.wave], spawnsOf(map, n.fight));
    if (f.tombs && n.cracked < f.tombs.max) return; // ainda vai rachar lápide: o encontro continua
    n.done.push(n.fight);
    w.lock = undefined;
    if (isBoss(map, n.fight)) {
      n.result = 'won';
      return endRound(m, now, null);
    }
    n.fight = null;
    return;
  }
  for (const z of w.wizards) {
    const hit = z.alive && z.team === 0 ? trigger(map, n.done, z.pos) : null;
    if (hit) return startFight(m, w, map, hit.i, hit.at);
  }
}

// painel da sandbox: ligar/desligar regras, pôr bot (tirar é o 'kick'), pôr runa, trocar a arena, mudar o tamanho da pedra e reiniciar a rodada; fora da sandbox não faz nada
// id: quem mandou (a runa nasce ao lado dele)
export function sandboxCmd(m: Match, cmd: SandboxCmd, now: number, id = '', rand: () => number = Math.random): boolean {
  const sb = m.sandbox;
  if (!sb || m.phase === 'lobby' || m.phase === 'end') return false;
  // runa: só o mundo muda (vai no snapshot, não é gravado), então devolve false para a sala não gravar a cada clique
  if (cmd.op === 'rune') {
    if (m.world) placeRune(m.world, cmd.kind, m.world.wizards.find((z) => z.id === id && z.alive)?.pos ?? null, rand);
    return false;
  }
  if (cmd.op === 'set') {
    if (sb[cmd.key] === cmd.on) return false;
    sb[cmd.key] = cmd.on;
    if (m.world) m.world.shrink = sb.shrink;
    return true;
  }
  // efeito de rodada escolhido no painel (issue #189), para ver cada um sem jogar uma partida; guardado como o "próximo", vale nos reinícios
  if (cmd.op === 'effect') {
    m.nextEffect = cmd.effect;
    const w = m.world;
    if (w) {
      w.effect = cmd.effect;
      w.mods = roundMods(cmd.effect);
      // Campo aberto tira os obstáculos na hora; eles só voltam ao reiniciar a rodada (mundo novo)
      if (cmd.effect === 'clear') w.pillars = [];
    }
    return true;
  }
  if (cmd.op === 'turret') {
    const b = newBot(m, rand);
    if (!b) return false;
    b.turret = cmd.direction;
    b.dummy = true;
    b.name = 'Totem'; // igual em português e inglês (o nome aparece no placar e no "Tirar …")
    b.spells = { ...noSpells(), fireball: 1 };
    b.items = noItems();
    refit(m, b);
    return true;
  }
  if (cmd.op === 'bot') {
    const b = newBot(m, rand);
    if (!b) return false;
    // como no treino: com magias ou itens escolhidos entra exatamente com eles; sem, compra sozinho
    const { difficulty = 'normal', ...rest } = cmd.bot ?? {};
    b.difficulty = difficulty;
    if (cmd.dummy) b.dummy = true;
    if (Object.keys(rest).length) b.setup = rest;
    if (rest.spells || rest.items) Object.assign(b, { spells: { ...noSpells(), ...rest.spells }, items: { ...noItems(), ...rest.items } });
    else if (!cmd.dummy) botShop(m, b, rand); // o boneco fica sem compras: dano e empurrão de referência
    refit(m, b);
    return true;
  }
  if (cmd.op === 'radius') {
    const w = m.world;
    if (!w) return false;
    const r = Math.min(SANDBOX_R_MAX, Math.max(ARENA_MIN, w.arenaR + cmd.step * ARENA_STEP));
    // como a runa: só o mundo muda e o raio vai no snapshot (o cliente desenha crescendo ou encolhendo), então a sala não grava
    if (Math.abs(r - w.arenaR) > 1e-9) resizeArena(w, r);
    return false;
  }
  if (cmd.op === 'arena') m.opts = { ...m.opts, arena: cmd.arena };
  // reiniciar (e trocar a arena): mundo novo com todos no ponto de partida e vida cheia, depois da contagem
  enterCountdown(m, now, rand);
  return true;
}

// o maior valor entre os jogadores e quem o tem
function atTop(players: Player[], f: (p: Player) => number): [number, Player[]] {
  const best = Math.max(...players.map(f));
  return [best, players.filter((p) => f(p) === best)];
}

// quem fez mais abates na rodada; empate ou zero abates = ninguém
function topKiller(m: Match): string | null {
  const [best, top] = atTop(m.players, (p) => p.stats.round.kills);
  return best > 0 && top.length === 1 ? top[0].id : null;
}

export function tickMatch(m: Match, now: number, cmds: Cmd[], rand: () => number = Math.random): SimEvent[] {
  const events = stepMatch(m, now, cmds, rand);
  settleVote(m, now, rand); // prazo, quem caiu e o fim da partida também fecham a votação
  return events;
}

// jeito de jogar (só mede, sem sorteio: a partida segue igual): ameaça = projétil inimigo que vai passar perto em até 0,6 s (o mesmo
// critério dos bots, vendo tudo); reação = primeira defesa em até 1 s (magia de defesa ou andar para fora da linha do tiro);
// atingido = levou dano do dono do projétil em até 1 s. Chave 'projétil>vítima'; sai quando o projétil some
const DEFENSE: SpellId[] = ['shield', 'teleport', 'rush', 'windwalk', 'alteration', 'warpzone', 'rockpillar', 'illusion'];
type Threat = { at: number; p: Projectile; owner: string; reacted: boolean; struck: boolean };
const watched = new WeakMap<World, Map<string, Threat>>();
function watchStyle(m: Match, w: World, all: Cmd[]) {
  const open = watched.get(w) ?? watched.set(w, new Map()).get(w)!;
  // humano que caiu é jogado pelo bot até voltar: fica fora, para não misturar o jeito do bot no dele
  const self = (id: string) => [player(m, id)].find((p) => p && (p.bot || p.connected));
  for (const [key, th] of open) {
    if (!w.projectiles.includes(th.p)) open.delete(key); // o golpe deste passo ainda conta
    const id = key.slice(key.indexOf('>') + 1);
    const p = self(id);
    if (!p || w.t - th.at > 1) continue;
    // fora da linha do tiro (do meteoro: fora do raio)
    const out = (to: Vec) => th.p.kind === 'meteor' ? dist(to, th.p.pos) >= spellLevel('meteor', th.p.level, w.book).radius + WIZ_R
      : Math.abs((to.x - th.p.pos.x) * th.p.vel.y - (to.y - th.p.pos.y) * th.p.vel.x) / Math.max(1e-6, len(th.p.vel)) > WIZ_R + PROJ_R + 0.25;
    const cast = w.events.find((e) => e.k === 'cast' && e.id === id && DEFENSE.includes(e.spell));
    if (!th.reacted && (cast || all.some((c) => c.id === id && c.kind === 'move' && out(c.to)))) {
      th.reacted = true;
      addStat(p, (s) => {
        s.reactSum += w.t - th.at;
        s.reactN++;
        if (cast?.k === 'cast' && cast.spell === 'shield') s.shielded++;
      });
    }
    if (!th.struck && w.events.some((e) => e.k === 'hit' && e.id === id && e.by === th.owner && e.dmg > 0)) {
      th.struck = true;
      addStat(p, (s) => s.struck++);
    }
  }
  for (const z of w.wizards) {
    const p = z.alive ? self(z.id) : undefined;
    const hit = p && threatTo(w, z, () => true);
    if (!p || !hit || open.has(hit.p.id + '>' + z.id)) continue;
    open.set(hit.p.id + '>' + z.id, { at: w.t, p: hit.p, owner: hit.p.owner, reacted: false, struck: false });
    const ready = z.spells.shield > 0 && w.t >= z.cd.shield;
    addStat(p, (s) => {
      s.threats++;
      if (ready) s.shieldable++;
    });
  }
  // distância até o inimigo vivo mais perto, a cada 6 passos
  if (m.steps % 6) return;
  for (const z of w.wizards) {
    const p = z.alive ? self(z.id) : undefined;
    const d = Math.min(...w.wizards.filter((q) => q.alive && q !== z && (z.team === null || q.team !== z.team)).map((q) => dist(q.pos, z.pos)));
    if (p && d < Infinity) addStat(p, (s) => {
      s.nearSum += d;
      s.nearN++;
    });
  }
}

function stepMatch(m: Match, now: number, cmds: Cmd[], rand: () => number): SimEvent[] {
  const sb = m.sandbox;
  if (sb) for (const p of m.players) if (!p.bot) p.gold = SANDBOX_GOLD; // sandbox: ouro sem fim para os humanos
  if (m.phase === 'shop') {
    if (m.asc) ascShop(m, now, rand);
    const humans = m.players.filter((p) => !p.bot && p.connected && !p.watch);
    // a sandbox pula a loja (ela abre a qualquer hora)
    // Ascensão: todos prontos encurta o intervalo para 5 s (ascShop) em vez de fechar na hora
    if (now >= m.phaseEnds || (!m.asc && humans.every((p) => p.ready)) || sb) enterCountdown(m, now, rand);
    return [];
  }
  if (m.phase === 'countdown') {
    if (now >= m.phaseEnds) {
      m.phase = 'playing';
      if (m.mode === 'deathmatch') m.phaseEnds = now + DM_ROUND_MS;
    }
    return [];
  }
  if (m.phase === 'roundEnd') {
    if (now >= m.phaseEnds) afterRound(m, now, rand);
    return [];
  }
  if (m.phase !== 'playing' || !m.world) return [];

  const w = m.world;
  m.steps++;
  const all = [...cmds];
  const turrets = sb ? m.players.filter((p) => p.turret) : [];
  const pinTurrets = () => {
    const zs = turrets.map((p) => w.wizards.find((q) => q.id === p.id && q.alive));
    for (const z of zs) {
      if (!z || z.turretAnchor) continue;
      // em diagonal (0, +1, -1, +2…), na primeira vaga livre: cada torreta numa linha e numa coluna só dela, o tiro de uma não cruza outra
      for (let i = 0; !z.turretAnchor; i++) {
        const k = (i % 2 ? 1 : -1) * Math.ceil(i / 2) * 1.2;
        if (!zs.some((o) => o?.turretAnchor?.y === k)) z.turretAnchor = { x: -w.arenaR * 0.35 + k, y: k };
      }
    }
    for (const z of zs) {
      if (!z?.turretAnchor) continue;
      z.pos = { ...z.turretAnchor };
      z.vel = { x: 0, y: 0 };
      z.target = null;
      z.invulnUntil = Infinity;
      z.hp = z.hpMax;
    }
  };
  pinTurrets();
  for (const p of turrets) {
    const z = w.wizards.find((q) => q.id === p.id && q.alive);
    if (!z) continue;
    const [x, y] = TURRET_DIR[p.turret!];
    all.push({ id: p.id, kind: 'cast', spell: 'fireball', at: { x: z.pos.x + x, y: z.pos.y + y } });
  }
  // os bots enxergam a cada passo e pensam D.rate vezes por segundo; o placar serve para o Difícil caçar o líder
  botWatch(w);
  const scores = Object.fromEntries(m.players.map((p) => [p.id, p.score]));
  m.players.forEach((p, i) => {
    // quem caiu vira bot até voltar, como no original (gamesetup.lua: bot assume o desconectado)
    // o chefe da Campanha tem cérebro próprio (bosses.ts), a cada passo
    const boss = p.servo && SERVOS[p.servo].boss && m.night?.boss;
    if (boss) {
      const z = w.wizards.find((q) => q.id === p.id);
      if (z) all.push(...bossCmds(w, z, boss));
      return;
    }
    if ((p.bot || !p.connected) && !p.dummy) {
      const D = botSkill(m, p);
      if (botThinks(m.steps, i, D)) all.push(...botCmds(w, p.id, rand, D, scores));
    }
  });
  // a rodada só acaba quando sobra 1: se os últimos morrerem no mesmo passo, vence quem tinha mais vida
  const before = w.wizards.filter((z) => z.alive).map((z) => ({ id: z.id, hp: z.hp }));
  // sandbox: vida infinita e sem recarga só para os humanos (os bots morrem e voltam como no deathmatch)
  const human = (id: string) => player(m, id)?.bot === false;
  if (sb) for (const z of w.wizards) z.god = sb.god && human(z.id);
  stepWorld(w, all, rand);
  pinTurrets();
  if (sb?.noCd) for (const z of w.wizards.filter((q) => human(q.id))) {
    for (const s of SPELL_IDS) z.cd[s] = 0;
  }
  watchStyle(m, w, all);
  // metade da vida tirada pela lava vira dano de quem empurrou (fonte 'lava'): placar, top dano e assistência; antes das mortes
  for (const [by, on] of Object.entries(w.lavaCredit)) for (const [id, dmg] of Object.entries(on)) {
    const p = player(m, by);
    if (!p) continue;
    const mine = ((m.dmgOn ??= {})[id] ??= {});
    mine[by] = (mine[by] ?? 0) + dmg;
    addStat(p, (s) => {
      s.dmg += dmg;
      s.dmgBy.lava = (s.dmgBy.lava ?? 0) + dmg;
    });
  }
  for (const e of w.events) {
    // dano 0 (invulnerável ou fogo amigo) não entra no dano, no top dano nem na assistência
    if (e.k === 'hit' && e.by !== e.id && e.dmg > 0) {
      const on = ((m.dmgOn ??= {})[e.id] ??= {});
      on[e.by] = (on[e.by] ?? 0) + e.dmg;
      const p = player(m, e.by);
      if (p) addStat(p, (s) => {
        s.dmg += e.dmg;
        s.dmgBy[e.src] = (s.dmgBy[e.src] ?? 0) + e.dmg;
      });
    } else if (e.k === 'fire' || e.k === 'land') {
      const p = player(m, e.id);
      const bucket = e.k === 'fire' ? 'fired' : 'landed';
      if (p) addStat(p, (s) => (s[bucket][e.src] = (s[bucket][e.src] ?? 0) + 1));
    } else if (e.k === 'death') {
      // causa da morte e tempo vivo, para os dados de balanceamento
      const dead = player(m, e.id);
      if (dead) addStat(dead, (s) => {
        s.deaths++;
        s.deathBy[e.src] = (s.deathBy[e.src] ?? 0) + 1;
        if (!w.dm) s.alive += w.t; // no deathmatch volta e morre várias vezes: tempo vivo só nas rodadas
      });
      // o ouro garantido da rodada já chega na queda, para ir comprando enquanto assiste (Fernando, 19/10)
      if (dead && !w.dm && !(m.roundPaid ??= []).includes(dead.id)) {
        m.roundPaid.push(dead.id);
        earn(m, dead, ROUND_GOLD);
      }
      // assistência: quem mais bateu na vítima, sem ser quem matou, ganha um pouco de ouro
      const on = m.dmgOn?.[e.id] ?? {};
      const [helper, dmg] = Object.entries(on).filter(([id]) => id !== e.by && id !== e.id).sort((a, b) => b[1] - a[1])[0] ?? [];
      const hp = helper && dmg >= ASSIST_MIN_DMG ? player(m, helper) : undefined;
      if (hp) bonus(m, hp, ASSIST_GOLD);
      if (m.asc) ascDeath(m, e.id, e.by, hp?.id);
      if (m.dmgOn) delete m.dmgOn[e.id];
      // sequências de abate: qualquer morte (até na lava) zera a de quem morreu
      const sk = (m.streaks ??= {});
      const broken = sk[e.id]?.kills ?? 0;
      if (sk[e.id]) sk[e.id].kills = 0;
      const killer = e.by && e.by !== e.id ? player(m, e.by) : undefined;
      if (killer) {
        const s = (sk[killer.id] ??= { kills: 0, multi: 0, at: -1e9 });
        s.multi = w.t - s.at <= STREAK.window ? s.multi + 1 : 1;
        s.at = w.t;
        s.kills++;
        // Quebra-combo primeiro: o cliente toca uma voz só por vez
        if (broken >= STREAK.breakAt) {
          w.events.push({ k: 'streak', id: killer.id, kind: 'breaker', n: broken, victim: e.id });
          bonus(m, killer, STREAK.breakGold);
        }
        if (s.multi >= 2) w.events.push({ k: 'streak', id: killer.id, kind: 'multi', n: s.multi });
        if (STREAK.spree.includes(s.kills)) w.events.push({ k: 'streak', id: killer.id, kind: 'spree', n: s.kills });
        // nas rodadas o abate não vale ponto (como no original), só ouro; no deathmatch vale 1 ponto
        addStat(killer, (s) => (s.kills += 1));
        if (m.mode === 'deathmatch') killer.score++;
        // cabeça do líder: abater quem lidera o placar vale mais, conforme a vantagem dele sobre a média
        const victim = player(m, e.id);
        const avgScore = m.players.reduce((sum, q) => sum + q.score, 0) / m.players.length;
        const top = Math.max(...m.players.map((q) => q.score));
        const head = victim && m.mode !== 'deathmatch' && victim.score === top ? Math.min(BOUNTY.max, Math.round(BOUNTY.perWin * (victim.score - avgScore))) : 0;
        bonus(m, killer, (KILL_GOLD + Math.max(0, head)) * (1 + STREAK.killGold * (s.kills - 1)));
      }
    }
    // a Égide quebra ao salvar (consumível): sai do inventário sem valor de venda
    if (e.k === 'aegis') {
      const p = player(m, e.id);
      if (p) {
        p.items.aegis = 0;
        delete p.held['item:aegis'];
      }
    }
    if (e.k === 'loot') {
      const p = player(m, e.id);
      if (p) bonus(m, p, 1);
    }
  }
  if (sb) return w.events; // a rodada da sandbox não acaba
  if (m.night) {
    stepNight(m, now, w);
    return w.events;
  }
  if (m.mode === 'deathmatch') {
    if (now >= m.phaseEnds) endRound(m, now, topKiller(m));
    return w.events;
  }
  const alive = w.wizards.filter((z) => z.alive);
  // Times: acaba quando só sobra gente de um time; o vencedor da rodada guardado é um vivo dele
  if (m.mode === 'teams' && alive.length > 0) {
    if (new Set(alive.map((z) => z.team)).size === 1) endRound(m, now, alive[0].id);
  } else if (alive.length === 1) endRound(m, now, alive[0].id);
  else if (alive.length === 0) endRound(m, now, before.sort((a, b) => b.hp - a.hp)[0]?.id ?? null);
  return w.events;
}
