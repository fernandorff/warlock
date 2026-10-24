import { DurableObject } from 'cloudflare:workers';
import { DT, SEND_EVERY } from '../shared/constants.ts';
import { chooseCard, reroll, setAscLobby } from '../shared/ascension.ts';
import { lookOf } from '../shared/characters.ts';
import { addPlayer, buy, buyItem, castBallot, endIdle, kick, newMatch, undoBuy, removePlayer, resume, sandboxCmd, sell, setLook, setReady, setWatch, shouldRun, startMatch, startVote, tickMatch, type Match } from '../shared/match.ts';
import { cmdTarget, parseClientMessage, publicId, publicRoom, type RoomInfo, type ServerMsg } from '../shared/protocol.ts';
import type { Cmd, SimEvent } from '../shared/sim.ts';
import { encodeSnap, publicEvents } from '../shared/snapshot.ts';
import { roundRecord } from '../shared/telemetry.ts';
import { TAUNT_COOLDOWN_MS } from '../shared/taunts.ts';

const STEP_MS = DT * 1000;
const MAX_CATCHUP = 5; // passos por chamada do laço; atraso maior que isso é descartado
const EMPTY_MS = 5 * 60_000; // sala sem ninguém conectado é apagada depois disso (alarm)
const IDLE_MS = 3 * 60_000; // partida sem nenhum comando de gente por 3 min é encerrada (menos a sandbox)
// sem 'ping' por esse tempo, a conexão morreu sem avisar (o cliente pinga a cada 10 s; numa aba escondida o Chrome segura a 1 por minuto)
const DEAD_MS = 90_000;

type Saved = { id: string; match: Match };
const KICKED: ServerMsg = { t: 'error', code: 'kicked', msg: 'Você foi removido da sala por votação.' };
type Attachment = { playerId: string | null; at?: number }; // at: hora do hello

// Uma sala: guarda a partida na memória e roda a simulação enquanto houver alguém conectado.
// Só grava no disco quando muda a fase ou a lista de jogadores (o mundo da rodada não é gravado).
export class Room extends DurableObject<Env> {
  private saved: Saved | null | undefined; // undefined = ainda não leu do disco
  private loop: ReturnType<typeof setInterval> | null = null;
  private last = 0;
  private acc = 0;
  private steps = 0;
  private cmds: Cmd[] = [];
  private acks = new Map<string, number>();
  private events: SimEvent[] = [];
  private lastCmdAt = Date.now();
  private roomSentAt = 0;
  private taunted = new Map<string, number>();
  private looked = new Map<string, number>();
  private watched = new Map<string, number>();
  private revision = 0;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // o 'ping' é respondido pelo runtime sem chegar a webSocketMessage (não acorda socket hibernado); a hora do último fica
    // em getWebSocketAutoResponseTimestamp, que o alarm() usa para achar conexão-fantasma
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
  }

  private async load(): Promise<Saved | null> {
    if (this.saved === undefined) {
      this.saved = (await this.ctx.storage.get<Saved>('room')) ?? null;
      if (this.saved) {
        resume(this.saved.match, Date.now());
        // depois de reiniciar, conectado é só quem tem socket vivo agora
        const liveIds = new Set(this.live().map((ws) => this.playerOf(ws)));
        for (const p of this.saved.match.players) if (!p.bot) p.connected = liveIds.has(p.id);
        // a sala reiniciou (ex.: publicação nova) com gente conectada: avisa a fase nova e religa o laço.
        // Sem ninguém (ex.: o alarme de limpeza acordou a sala), não mexe no lobby nem no alarme.
        if (this.live().length) void this.changed();
      }
    }
    return this.saved;
  }

  private lobby() {
    return this.env.LOBBY.get(this.env.LOBBY.idFromName('lobby'));
  }

  private playerOf(ws: WebSocket): string | null {
    return (ws.deserializeAttachment() as Attachment | null)?.playerId ?? null;
  }

  private live(except?: WebSocket): WebSocket[] {
    return this.ctx.getWebSockets().filter((ws) => ws !== except && this.playerOf(ws) !== null);
  }

  private humans(except?: WebSocket): number {
    return new Set(this.live(except).map((ws) => this.playerOf(ws))).size;
  }

  async init(id: string, ascension = false) {
    if (await this.load()) return;
    this.saved = { id, match: newMatch() };
    // sala do Ascensão: o lobby já mostra o modo e a partida só pode ser dele; o primeiro a entrar vira o dono
    if (ascension) Object.assign(this.saved.match, { mode: 'ascension', lobby: { owner: null, bots: [], opts: {} } });
    await this.persist();
    // sala criada e nunca aberta também é limpa
    await this.ctx.storage.setAlarm(Date.now() + EMPTY_MS);
  }

  async fetch(): Promise<Response> {
    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ playerId: null } satisfies Attachment);
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer) {
    const msg = typeof raw === 'string' ? parseClientMessage(raw) : null;
    if (!msg) return send(ws, { t: 'error', code: 'bad_msg', msg: 'Mensagem inválida.' });
    const s = await this.load();
    if (!s) return send(ws, { t: 'error', code: 'not_found', msg: 'Sala não encontrada.' });
    const m = s.match;
    const now = Date.now();

    if (msg.t === 'hello') {
      // um socket é uma pessoa: não deixa o mesmo socket registrar vários jogadores
      const current = this.playerOf(ws);
      if (current && current !== msg.playerId) return send(ws, { t: 'error', code: 'bad_msg', msg: 'Esta conexão já é de outro jogador.' });
      for (const other of this.live(ws)) {
        if (this.playerOf(other) !== msg.playerId) continue;
        send(other, { t: 'error', code: 'other_tab', msg: 'Sala aberta em outra aba.' });
        forget(other);
      }
      if (m.banned.includes(msg.playerId)) return send(ws, KICKED);
      if (!addPlayer(m, msg.playerId, msg.name, false, msg.watch)) return send(ws, { t: 'error', code: 'full', msg: 'Sala cheia.' });
      ws.serializeAttachment({ playerId: msg.playerId, at: now } satisfies Attachment);
      return this.changed();
    }

    const id = this.playerOf(ws);
    if (!id) return send(ws, { t: 'error', code: 'bad_msg', msg: 'Envie hello primeiro.' });
    // 'alive' é só o pulso do cliente (main.ts): se contasse como comando, partida com todos parados nunca acabaria por IDLE_MS
    if (msg.t !== 'alive') this.lastCmdAt = now;
    // o cliente só conhece o id público: acha o jogador correspondente
    const byPublic = (pub?: string) => m.players.find((p) => publicId(s.id, p.id) === pub);
    switch (msg.t) {
      case 'alive':
        return;
      case 'move':
      case 'moveHold':
      case 'stop':
      case 'brace':
      case 'basic':
      case 'cast':
        // comandos de jogo só valem com a rodada rolando (fora dela a fila cresceria sem limite)
        if (m.phase !== 'playing') return;
        if (msg.t === 'stop') this.cmds.push({ id, kind: 'stop' });
        else if (msg.t === 'moveHold') this.cmds.push({ id, kind: 'moveHold', on: msg.on });
        else if (msg.t === 'brace') this.cmds.push({ id, kind: 'brace', on: msg.on });
        else {
          // o limite da coordenada depende da sala (arena ou mapa da Campanha), por isso não cabe no parser
          const at = cmdTarget(m.world?.map, msg.x, msg.y);
          if (!at) return send(ws, { t: 'error', code: 'bad_msg', msg: 'Mensagem inválida.' });
          this.cmds.push(msg.t === 'move' ? { id, kind: 'move', to: at, held: msg.held }
            : msg.t === 'basic' ? { id, kind: 'basic', at, target: typeof msg.target === 'string' ? byPublic(msg.target)?.id ?? '' : msg.target }
            : { id, kind: 'cast', spell: msg.spell, at });
        }
        this.acks.set(id, msg.seq);
        return;
      case 'start':
        if (startMatch(m, now, msg.bots, msg.mode, msg.shuffle ?? true, Math.random, msg.opts, msg.setup, msg.sandbox)) await this.changed();
        return;
      case 'sandbox':
        if (sandboxCmd(m, msg.cmd, now, id)) await this.changed();
        return;
      case 'buy':
        if (buy(m, id, msg.spell)) await this.changed();
        return;
      case 'undo':
        if (undoBuy(m, id, msg.key)) await this.changed();
        return;
      case 'sell':
        if (sell(m, id, msg.key)) await this.changed();
        return;
      case 'kick': {
        const target = byPublic(msg.target);
        if (target && kick(m, target.id)) await this.changed();
        return;
      }
      case 'vote': {
        // expulsão: o alvo chega como id público, como no 'kick'; troca de modo: o modo alvo
        const target = msg.kind === 'kick' ? byPublic(msg.target)?.id : (msg.target ?? '');
        if (target !== undefined && startVote(m, id, msg.kind, target, now)) await this.changed();
        return;
      }
      case 'ballot':
        if (castBallot(m, id, msg.yes, now)) await this.changed();
        return;
      case 'taunt': {
        // taunt vale em qualquer fase, para todos na sala; no máximo um a cada 2,5 s por jogador
        if (!m.players.some((p) => p.id === id) || now - (this.taunted.get(id) ?? 0) < TAUNT_COOLDOWN_MS) return;
        this.taunted.set(id, now);
        const out = { t: 'taunt' as const, id: publicId(this.saved!.id, id), i: msg.i };
        for (const ws of this.live()) send(ws, out);
        return;
      }
      case 'buyItem':
        if (buyItem(m, id, msg.item)) await this.changed();
        return;
      case 'keep':
        if (chooseCard(m, id, msg.slot, -1)) await this.changed();
        return;
      case 'reroll':
        if (reroll(m, id)) await this.changed();
        return;
      case 'card':
        if (chooseCard(m, id, msg.slot, msg.i, msg.swap)) await this.changed();
        return;
      case 'pick':
        if (setLook(m, id, lookOf(msg.character))) await this.changed();
        return;
      case 'look':
        // no máximo uma troca a cada 100 ms por jogador: cada troca grava a sala (o navegador junta os cliques)
        if (now - (this.looked.get(id) ?? 0) < 100) return;
        this.looked.set(id, now);
        if (setLook(m, id, msg.look)) await this.changed();
        return;
      case 'watch':
        // assistir ou voltar a jogar: como a aparência, no máximo uma troca a cada 100 ms (cada troca grava a sala)
        if (now - (this.watched.get(id) ?? 0) < 100) return;
        this.watched.set(id, now);
        if (setWatch(m, id, msg.on)) await this.changed();
        return;
      case 'ready':
        if (setReady(m, id)) await this.changed();
        return;
      case 'lobby':
        if (setAscLobby(m, id, msg.bots, msg.opts)) await this.changed();
        return;
    }
  }

  async webSocketClose(ws: WebSocket) {
    await this.dropped(ws);
  }

  async webSocketError(ws: WebSocket) {
    await this.dropped(ws);
  }

  private async dropped(ws: WebSocket) {
    const id = this.playerOf(ws);
    // outro socket vivo com o mesmo playerId: não remove (o hello já solta a aba antiga com forget; isto é só segurança)
    if (!id || this.live(ws).some((o) => this.playerOf(o) === id)) return;
    const s = await this.load();
    if (!s) return;
    removePlayer(s.match, id);
    await this.changed(ws);
  }

  private roomInfo(s: Saved, players: number): RoomInfo {
    return {
      id: s.id,
      players,
      phase: s.match.phase,
      mode: s.match.mode,
      round: s.match.round,
      bots: s.match.players.filter((p) => p.bot && !p.servo).length,
    };
  }

  async inspect(): Promise<RoomInfo | null> {
    const s = await this.load();
    if (!s) return null;
    const players = this.humans();
    if (players === 0 && (await this.ctx.storage.getAlarm()) === null) await this.ctx.storage.setAlarm(Date.now() + EMPTY_MS);
    return this.roomInfo(s, players);
  }

  async alarm() {
    const s = await this.load();
    if (!s) return;
    // conexão que sumiu sem o fechamento chegar (20/10: sala presa para sempre com "1 pessoa"): solta o jogador
    const now = Date.now();
    for (const ws of this.live()) {
      const seen = Math.max(this.ctx.getWebSocketAutoResponseTimestamp(ws)?.getTime() ?? 0, (ws.deserializeAttachment() as Attachment).at ?? 0);
      if (now - seen < DEAD_MS) continue;
      await this.dropped(ws); // antes do forget, que apaga o playerId do attachment
      forget(ws, 'dead');
    }
    // Reconfere a cada 5 min para remover conexões-fantasma mesmo enquanto a sala está ocupada.
    if (this.humans() > 0) return void (await this.ctx.storage.setAlarm(Date.now() + EMPTY_MS));
    this.stopLoop();
    const revision = this.revision;
    // tira do lobby primeiro; se falhar, tenta de novo daqui a 1 minuto (antes a sala sumia do disco e ficava na lista)
    try {
      await this.lobby().remove(s.id);
    } catch {
      return void (await this.ctx.storage.setAlarm(Date.now() + 60_000));
    }
    // RPC externo libera outras mensagens: alguém pode ter entrado (e até saído) durante o remove.
    if (this.saved !== s || this.revision !== revision || this.humans() > 0) {
      this.lobbyKey = ''; // o remove pode ter apagado o upsert do hello; publica de novo mesmo com dados iguais
      await this.ctx.storage.setAlarm(Date.now() + EMPTY_MS);
      return this.persist();
    }
    this.saved = null;
    await this.ctx.storage.deleteAll();
  }

  // fase ou jogadores mudaram: avisa todos, grava, atualiza o lobby e liga/desliga o laço
  private async changed(closing?: WebSocket) {
    const s = this.saved;
    if (!s) return;
    this.revision++;
    // expulso por votação: avisa e fecha o socket dele (antes de contar quem está na sala)
    for (const ws of this.live(closing)) {
      if (!s.match.banned.includes(this.playerOf(ws)!)) continue;
      send(ws, KICKED);
      forget(ws, 'kicked');
    }
    this.broadcastRoom(closing);
    // laço e alarme antes do disco e do lobby: se o lobby falhar, a sala não congela
    const humans = this.humans(closing);
    if (shouldRun(s.match, humans)) this.startLoop();
    else this.stopLoop();
    if (humans === 0) await this.ctx.storage.setAlarm(Date.now() + EMPTY_MS);
    await this.persist();
  }

  private lobbyKey = '';

  private async persist() {
    const s = this.saved;
    if (!s) return;
    await this.ctx.storage.put('room', { id: s.id, match: { ...s.match, world: null } });
    // o lobby é um objeto só para o site todo: só avisa quando muda o que a lista mostra
    const info = this.roomInfo(s, s.match.players.filter((p) => !p.bot && p.connected).length); // as vagas do Fumo não são bots da sala
    const key = `${info.players}:${info.phase}:${info.mode}:${info.round}:${info.bots}`;
    if (key === this.lobbyKey) return;
    try {
      await this.lobby().upsert(info);
      this.lobbyKey = key;
    } catch {
      // tenta de novo na próxima mudança
    }
  }

  private broadcastRoom(closing?: WebSocket) {
    const s = this.saved;
    if (!s) return;
    const room = publicRoom(s.id, s.match, Date.now());
    for (const ws of this.live(closing)) send(ws, { t: 'room', room, you: publicId(s.id, this.playerOf(ws)!) });
  }

  private startLoop() {
    if (this.loop) return;
    this.last = Date.now();
    this.acc = 0;
    this.lastCmdAt = Date.now();
    this.loop = setInterval(() => this.tick(), 16); // o intervalo real oscila; quem conta os passos de DT é o acumulador (acc)
  }

  private stopLoop() {
    if (this.loop) clearInterval(this.loop);
    this.loop = null;
  }

  private tick() {
    const s = this.saved;
    if (!s) return this.stopLoop();
    const m = s.match;
    const now = Date.now();
    // placar ao vivo: durante a rodada a sala manda o estado dos jogadores (estatísticas) uma vez por segundo
    if (m.phase === 'playing' && now - this.roomSentAt > 1000) {
      this.roomSentAt = now;
      this.broadcastRoom();
    }
    this.acc = Math.min(this.acc + now - this.last, STEP_MS * MAX_CATCHUP);
    this.last = now;
    // a votação entra na conta para o fim por tempo (e a troca de modo) chegar aos clientes
    // na Campanha, encontro e onda novos trocam o tipo (aparência, vida) das vagas do Fumo: avisa na hora
    // Ascensão: as cartas entram na mesa no passo do intervalo (ascShop), então a mesa também
    // os 5 s finais (todos escolheram) mudam o fim do intervalo: o relógio da tela precisa saber
    const asc = () => (m.asc ? `${Object.values(m.asc.offer).map((o) => o.length).join()}:${m.phaseEnds}` : '');
    const sig = () => `${m.phase}:${m.round}:${m.players.length}:${m.vote?.ends ?? 0}:${m.pendingMode}:${m.pendingShuffle}:${asc()}:${m.night?.fight ?? ''}:${m.night?.wave ?? ''}`;
    const before = sig();
    while (this.acc >= STEP_MS) {
      this.acc -= STEP_MS;
      // o que chegou desde o último tique entra no primeiro passo; nos passos de recuperação a fila já está vazia
      const cmds = this.cmds;
      this.cmds = [];
      this.events.push(...tickMatch(m, now, cmds));
      if (++this.steps % SEND_EVERY === 0) this.sendSnaps();
    }
    // a sandbox não grava telemetria (e a rodada dela nem acaba); a Campanha também não (PvE, outros números)
    if (m.phase === 'roundEnd' && before.startsWith('playing') && !m.sandbox && !m.night) this.lobby().record(roundRecord(m, now)).catch(() => {});
    // sandbox não encerra por inatividade: quem testa fica parado mirando ou lendo; sem ninguém conectado o laço já para (shouldRun) e o alarme apaga a sala
    if (!m.sandbox && now - this.lastCmdAt > IDLE_MS) endIdle(m);
    if (sig() !== before) void this.changed();
  }

  private sendSnaps() {
    const s = this.saved;
    const w = s?.match.world;
    const pub = (x: string) => publicId(s!.id, x);
    const events = publicEvents(this.events, pub);
    this.events = [];
    if (!w) return;
    // um snapshot por jogador: leva o ack e as recargas dele e os bits de visibilidade do ponto de vista dele
    for (const ws of this.live()) {
      const id = this.playerOf(ws)!;
      send(ws, encodeSnap(w, id, this.acks.get(id) ?? 0, events, !!s!.match.sandbox));
    }
  }
}

// solta o socket da sala antes de fechar, para o fechamento não contar como desconexão
function forget(ws: WebSocket, reason = 'other_tab') {
  ws.serializeAttachment({ playerId: null } satisfies Attachment);
  try {
    ws.close(4000, reason);
  } catch {
    // já fechado
  }
}

function send(ws: WebSocket, msg: ServerMsg) {
  try {
    ws.send(JSON.stringify(msg));
  } catch {
    // socket já fechado
  }
}
