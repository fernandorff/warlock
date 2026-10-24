import { inLavaAt, type ArenaId } from '../shared/arena.ts';
import { ARENA_MIN, BASIC_ATTACK, HP_MAX, HP_REGEN, RUNE, SHRINK_EVERY, SUDDEN, WIZ_R, type RuneKind } from '../shared/constants.ts';
import { lookOf } from '../shared/characters.ts';
import { liveLevel, roundMult } from '../shared/ascension.ts';
import type { BotSetup, PublicPlayer, PublicRoom, RoomInfo, ServerMsg, Snap } from '../shared/protocol.ts';
import type { BotSkill } from '../shared/bots.ts';
import { DEFAULT_OPTS } from '../shared/match.ts';
import type { SimEvent } from '../shared/sim.ts';
import { HOLDING_MOVE_BIT, WALKING_BIT, decodeSnap, type SnapView, type WizView } from '../shared/snapshot.ts';
import { itemStats } from '../shared/items.ts';
import { CAST_POINT, SPELLS, SPELL_IDS, castBlocked, type SpellId } from '../shared/spells.ts';
import { add, dist, len, scale, type Vec } from '../shared/vec.ts';
import { CHALLENGES, endRun, runText, saveBest, scoreOf, stepRun, type Challenge, type Run } from './challenges.ts';
import { LOOK_EVENT, saveLook, savedLook } from './avatar.ts';
import { coachTip } from './coach.ts';
import { PROFILE_KEY, addRound, toSkill, type Profile } from './mimic.ts';
import { n1 } from './rules-text.ts';
import { aimOf, hitR, reachOf } from './reach.ts';
import { ITEM_ICON, RUNE_ICON, RUNE_NAME, SOURCE_ICON, icon } from './icons.ts';
import { createInput } from './input.ts';
import { t } from './i18n.ts';
import { cardName } from './ascension-ui.ts';
import { SKILL_NAME, effectName } from './opt-info.ts';
import { getCastMode, isPadMode, labelOf, onFreeEsc } from './keys.ts';
import { openSettings, runeNoticesOn, savedPixel } from './settings.ts';
import { rumble, startPad } from './gamepad.ts';
import { DELAY, REPLAY_MAX, createInterp, keepLast } from './interp.ts';
import { connect } from './net.ts';
import { createPredict } from './predict.ts';
import { createScene, type WizDraw } from './scene.ts';
import { createSound, type SoundKind } from './sound.ts';
import { distanceVolume } from './sound-distance.ts';
import { BRACING_BIT } from '../shared/constants.ts';
import { store } from './store.ts';
import { SANDBOX_START } from './train.ts';
import { TEAM_NAMES, TOUCH, WATCH_JOIN, askName, banner, createRoomUi, curtain, renderLobby, screen, srcName, toast } from './ui.ts';
import { botLevel, endResult, playerName, renderWizardState, sandboxVisibility, seatChanges, showHitDamage } from './screen-data.ts';
import { TAUNTS } from '../shared/taunts.ts';
import { healTarget } from '../shared/heal-target.ts';

declare const __BRANCH__: string;

// aba de teste diz qual é o teste (pedido do Fernando, 20/10): várias sessões abrem localhost e todas as abas tinham o mesmo
// título. Em localhost vira "🧪 <branch> · Warlock Wars"; ?aba=<nome> na URL troca o nome. No ar nada muda.
const LOCAL = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
if (LOCAL) {
  document.title = `🧪 ${new URLSearchParams(location.search).get('aba') || __BRANCH__ || 'teste'} · Warlock Wars`;
}

// música desligada nas abas de teste (pedido do Fernando, 20/10: várias abas tocando juntas, issue #158): em localhost quem nunca
// mexeu no volume começa sem música; ?musica=1 volta ao padrão, para testar som. Volume já guardado vale igual. No ar nada muda.
const MUSIC_DEFAULT = LOCAL && new URLSearchParams(location.search).get('musica') !== '1' ? 0 : undefined;

// ?ir=<lugar> (issue #140): em localhost e no ambiente de cada PR (TEST_LINK, abaixo) a aba de teste já abre no ponto a testar
// (pedido do Fernando, 20/10); no jogo no ar nada muda.
// Menu inicial: play, library, char, shop, profile, settings ou config:<seção> (teclas, lancamento, som, video, interface, controle, jogador,
// personagem, idioma, sobre). Sala nova: sandbox, partida (contra 1 bot, já lutando), partida:loja (contra 1 bot, na loja da rodada 1, com 120 s)
// e partida:ascensao (Ascensão contra 3 bots, na carta inicial, com 120 s).
// Sala e seção juntas, com vírgula (as Configurações de dentro da partida): sandbox,config:som
// Porta nova não tem apelido guardado: o ?apelido= (ou o ?aba=) pula o pedido de nome, ver TEST_NAME abaixo (issue #175).
// ?ir= e ?apelido= valem também no ambiente de cada PR (pr-<n>-warlock…, issue #125): o link mandado ao colaborador já cai no ponto
// do teste (pedido do Fernando, 21/10). No jogo no ar nada muda
const TEST_LINK = LOCAL || /^pr-\d+-warlock\./.test(location.hostname);
const IR = (TEST_LINK && new URLSearchParams(location.search).get('ir')?.split(',')) || [];
const IR_CONFIG = IR.find((p) => p.startsWith('config:'))?.slice(7);

// som de cada magia: as novas reaproveitam os sons que já existem
const SPELL_SOUND: Record<SpellId, SoundKind> = {
  geyser: 'splash',
  heal: 'heal',
  fireball: 'fireball', lightning: 'lightning', homing: 'homing', shield: 'shield', teleport: 'teleport',
  swap: 'teleport', grip: 'lightning', meteor: 'fireball', rush: 'shield', cluster: 'fireball',
  boomerang: 'homing', thrust: 'teleport', gravity: 'homing', rockpillar: 'shield', bouncer: 'lightning',
  drain: 'homing', snowball: 'fireball', illusion: 'teleport', magnetize: 'lightning', recharge: 'homing',
  alteration: 'teleport', link: 'lightning', windwalk: 'shield', splitter: 'fireball', warpzone: 'shield',
  scourge: 'homing', pact: 'shield', // os sons que tinham como item ativo
};

// mensagens de erro do servidor (em português, protocolo inalterado) -> inglês
const SERVER_EN: Record<string, string> = {
  'Mensagem inválida.': 'Invalid message.',
  'Esta conexão já é de outro jogador.': 'This connection already belongs to another player.',
  'Envie hello primeiro.': 'Send hello first.',
  'Sala não encontrada.': 'Room not found.',
  'Sala aberta em outra aba.': 'Room open in another tab.',
  'Sala cheia.': 'Room full.',
  'Você foi removido da sala por votação.': 'You were removed from the room by vote.',
};

// treino escolhido na tela inicial ('bots', 'shadow', 'sandbox' ou o id do desafio): atravessa o recarregar da página ao entrar na sala nova
const AUTOSTART = 'warlock:autostart';
function takeAutostart(): string | null {
  try {
    const k = sessionStorage.getItem(AUTOSTART);
    sessionStorage.removeItem(AUTOSTART);
    return k;
  } catch {
    return null;
  }
}

// ?as=nome dá outra identidade na mesma máquina (testar com várias abas)
const as = new URLSearchParams(location.search).get('as')?.replace(/[^a-z0-9]/gi, '').slice(0, 12) ?? '';
// aba de teste velha pede para ser fechada (pedido do Fernando, 20/10; issue #140), só em localhost: a aba nova na mesma porta
// marca as anteriores, e o servidor local fora do ar por 3 s marca a aba. Com ?as= não marca (várias abas de propósito)
const TITLE = document.title;
let velha = false;
const fechar = (why: string) => (document.title = `❌ FECHAR · ${why}`);
if (LOCAL && !as) {
  const abas = new BroadcastChannel('warlock:abas');
  abas.onmessage = () => {
    velha = true;
    fechar(TITLE);
  };
  abas.postMessage(0);
}
let caiu: ReturnType<typeof setTimeout> | undefined;
function servidor(on: boolean) {
  if (!LOCAL) return;
  clearTimeout(caiu);
  if (!on) caiu = setTimeout(() => fechar('servidor desligado'), 3000);
  else if (velha) fechar(TITLE);
  else document.title = TITLE;
}
const PID = 'warlock:pid' + (as && ':' + as);
const NAME = 'warlock:name' + (as && ':' + as);
const CHAR = 'warlock:char' + (as && ':' + as);
// aba de teste já entra com apelido (pedido do Fernando, 21/10; issue #175), em localhost e no ambiente do PR (TEST_LINK): cada porta é um site novo, sem apelido
// guardado, e o pedido de nome parava a aba antes do ?ir=. ?apelido=<nome> grava o apelido; sem ele, o começo do ?aba= entra só
// se ainda não houver apelido. No ar nada muda.
const query = new URLSearchParams(location.search);
const TEST_NAME = (query.get('apelido') || (!store.get(NAME) && query.get('aba')) || '').replace(/[<>]/g, '').trim().slice(0, 20);
if (TEST_LINK && TEST_NAME) store.set(NAME, TEST_NAME);
const playerId = store.get(PID) ?? crypto.randomUUID();
store.set(PID, playerId);

const ui = document.getElementById('ui')!;
const canvas = document.getElementById('c') as HTMLCanvasElement;
// trocar de sala recarrega a página: startRoom deixa laço, socket e ouvintes ligados e não tem desmontagem
addEventListener('hashchange', () => location.reload());

// som curto ao passar o mouse num botão, no máximo 1 a cada 60 ms (o toque não tem hover; o clique tem som próprio)
function hoverSound(sound: ReturnType<typeof createSound>) {
  let at = 0;
  addEventListener('pointerover', (e) => {
    const b = (e.target as Element).closest?.('button:not(:disabled):not(.spell), .button'); // na barra de magias, no meio da luta, não
    if (e.pointerType !== 'mouse' || !b || b === (e.relatedTarget as Element | null)?.closest?.('button, .button') || performance.now() - at < 60) return;
    at = performance.now();
    sound.play('hover');
  });
}

async function main() {
  const name = store.get(NAME) || (await askName(ui, as));
  store.set(NAME, name);
  const id = location.hash.slice(1).toUpperCase();
  if (/^[A-Z]{4}$/.test(id)) startRoom(id, name);
  else startLobby(name);
  // Esc sem nada para cancelar ou fechar abre as configurações (pedido do Fernando, 18/10); por último, depois dos ouvintes da sala
  onFreeEsc(() => !document.querySelector('.overlay') && openSettings());
}

function startLobby(name: string) {
  document.body.className = 'in-lobby';
  curtain();
  // no lobby também: hover e clique dos botões e o volume das Configurações (sem música nem lava, que só existem na partida)
  const sound = createSound(MUSIC_DEFAULT);
  hoverSound(sound);
  ui.addEventListener('click', (e) => (e.target as Element).closest('button, .button') && sound.play('click'));
  let rooms: RoomInfo[] | null = null;
  let offline = false;
  const draw = () =>
    renderLobby(ui, name, rooms, offline, () => create(), () => create(undefined, true), async () => {
      name = await askName(document.body, name);
      store.set(NAME, name);
      draw();
    }, create, sound);
  // train: o treino que começa sozinho na sala nova (sem armazenamento, entra só na sala)
  // ascension: sala do Ascensão (opção própria no menu Jogar)
  async function create(train?: string, ascension = false) {
    try {
      const res = await fetch(ascension ? '/api/rooms?modo=ascensao' : '/api/rooms', { method: 'POST' });
      if (!res.ok) throw new Error(String(res.status));
      const { id } = await res.json();
      try {
        if (train) sessionStorage.setItem(AUTOSTART, train);
      } catch {
        // só a sala
      }
      location.hash = id;
    } catch {
      toast(t('Não deu para criar a sala. Tente de novo.', 'Couldn’t create the room. Try again.'));
    }
  }
  const lobbyNet = connect('/ws/lobby', (m) => {
    if (m.t !== 'rooms') return;
    rooms = m.rooms as RoomInfo[]; // a ordem e as vazias recolhidas ficam com renderLobby (screen-data.ts)
    draw();
  }, () => {}, (on) => {
    servidor(on);
    // sem a conexão da lista, o lobby mostra o erro em vez de "Carregando salas…" para sempre
    if (offline === !on) return;
    offline = !on;
    draw();
  });
  draw();
  const k = IR[0];
  if (k === 'sandbox' || k?.startsWith('partida')) {
    // a sala sai da URL (só a seção fica): ao voltar ao menu (location.hash = '') a página não cria outra sala
    const url = new URL(location.href);
    if (IR.length > 1) url.searchParams.set('ir', IR.slice(1).join(','));
    else url.searchParams.delete('ir');
    history.replaceState(null, '', url);
    void create(k, k === 'partida:ascensao');
  } else if (IR_CONFIG) openSettings(IR_CONFIG);
  else if (k) document.getElementById('home-tab-' + k)?.click();
}

function startRoom(code: string, name: string) {
  let myName = name;
  // botão Assistir da lista de salas: entra só assistindo nesta sala (a marca vale uma vez)
  let watchJoin = false;
  try {
    watchJoin = sessionStorage.getItem(WATCH_JOIN) === code;
    sessionStorage.removeItem(WATCH_JOIN);
  } catch {
    // sem armazenamento: entra jogando
  }
  document.body.className = 'in-room';
  curtain();
  const sound = createSound(MUSIC_DEFAULT);
  hoverSound(sound);
  let room: PublicRoom | null = null;
  let me = playerId;
  let online = false;
  let armed: SpellId | null = null;
  // círculo de alcance: tecla segurada, magia escolhida no botão (toque no chão para lançar) ou controle mirando
  let held: SpellId | null = null;
  let flashAim: { from: Vec; at: Vec } | null = null; // Rápido: de onde e para onde a magia saiu, para a faixa piscar parada ali
  let padAiming: SpellId | null = null;
  let padAt: Vec | null = null; // retículo do controle no chão (explosão do Meteoro)
  let hovered: SpellId | null = null; // mouse em cima da magia na barra
  let seq = 0;
  const sentAt = new Map<number, number>();
  let lastSnap: Snap | null = null;
  // a latência só existe depois do primeiro comando confirmado (antes, predict.rtt() é um chute)
  let rttSeen = false;
  // modo treino (só para quem apertou o botão): dicas nas primeiras rodadas; playingAt marca o "Já!"
  let training = false;
  let trainSetup: BotSetup[] | undefined; // magias dos bots do último treino
  let shadow = false; // treino contra a sombra: o bot aparece como "Sombra" (só nesta tela)
  let seeInvis = false; // visão de teste só quando o jogador pedir explicitamente
  let seeHit = false; // sandbox: "Ver hitbox (teste)"
  // desafio curto: pending espera a loja da rodada 0 (começo ou Repetir); run conta a tarefa; runRound = rodada em que ela acabou
  let pending: Challenge | null = null;
  let run: Run | null = null;
  let runRound = -1;
  let quitting = false; // Sair do desafio: o fim da partida que vem abre direto na sala, sem faixa nem som
  let arenaId: ArenaId = 'circle'; // formato da arena da rodada (vem na mensagem 'room')
  let playingAt = 0;
  const justCast = new Map<string, number>();
  let scourgeUntil = 0;
  let follow = true;
  // espectador: quem a câmera segue e o pedido de troca (+1 próximo, −1 anterior) do quadro seguinte
  let watchId: string | null = null;
  let watchStep = 0;
  let watchCenter = false; // câmera do espectador parada no centro da arena (botão na barra "Assistindo", ui.ts)
  let camFollow = false; // câmera centrada no próprio mago (botão no topo, ui.ts)
  // replay da queda (em qualquer partida): os últimos 6 s de estados e eventos; ao eu cair, vira o trecho que dá para rever
  let ring: { s: SnapView; e: SimEvent[] }[] = [];
  let clip: typeof ring = [];
  let fall: { by: string | null; src: string } = { by: null, src: 'lava' };
  let rp: { it: ReturnType<typeof createInterp>; at: number; next: number } | null = null;
  let canReplay = false;
  function toggleReplay() {
    if (rp || !canReplay) return void (rp = null);
    const it = createInterp(REPLAY_MAX);
    for (const f of clip) it.push(f.s, f.s.time); // relógio local = do servidor: sample(t + DELAY) devolve o instante t
    rp = { it, at: performance.now(), next: 0 };
  }
  // efeitos visuais Completo/Leve guardados no navegador; sem escolha, quem pede menos movimento ao sistema começa no Leve
  let fxLite = (store.get('warlock:fx') ?? (matchMedia('(prefers-reduced-motion: reduce)').matches ? 'lite' : 'full')) === 'lite';
  document.body.classList.toggle('fx-lite', fxLite);
  // pixel art (issue #79): desligado por padrão; só no PC, onde há pós-processamento
  let pixel = savedPixel();
  const pixelOk = !matchMedia('(pointer: coarse)').matches;

  let autostart = takeAutostart();
  const view = createRoomUi(ui, code, {
    start: (bots, mode, shuffle, opts, again) => {
      training = false; // partida normal depois de um treino: sem dicas
      run = pending = null;
      if (!again) {
        trainSetup = undefined;
        shadow = false;
      }
      // Dificuldade escolhida na preparação (as magias os bots compram sozinhos); Jogar de novo repete a configuração.
      net.send({ t: 'start', bots: bots.length, mode, shuffle, opts, setup: bots.map((difficulty, i) => ({ ...trainSetup?.[i], difficulty })) });
    },
    buy: (spell) => net.send({ t: 'buy', spell }),
    lobby: (bots, opts) => net.send({ t: 'lobby', bots, opts }),
    buyItem: (item) => net.send({ t: 'buyItem', item }),
    kick: (target) => net.send({ t: 'kick', target }),
    vote: (kind, target) => net.send({ t: 'vote', kind, target }),
    ballot: (yes) => net.send({ t: 'ballot', yes }),
    undo: (key) => net.send({ t: 'undo', key }),
    sell: (key) => net.send({ t: 'sell', key }),
    taunt: (i) => net.send({ t: 'taunt', i }),
    // personagem pronto da sala: vira a aparência equivalente (o evento abaixo manda ao servidor)
    pick: (character) => {
      store.set(CHAR, character);
      saveLook(lookOf(character));
    },
    ready: () => net.send({ t: 'ready' }),
    card: (slot, i, swap) => net.send({ t: 'card', slot, i, ...(swap && { swap }) }),
    reroll: () => net.send({ t: 'reroll' }),
    keep: (slot) => net.send({ t: 'keep', slot }),
    sandbox: (cmd) => net.send({ t: 'sandbox', cmd }),
    spectate: (on) => net.send({ t: 'watch', on }),
    seeInvis: (on) => (seeInvis = on),
    seeHit: (on) => (seeHit = on),
    spell: (s) => input.button(s),
    hover: (a) => (hovered = a),
    volumes: sound.volumes,
    setVolume: sound.setVolume,
    click: () => sound.play('click'),
    fxLite: () => fxLite,
    setFxLite: (lite) => {
      fxLite = lite;
      store.set('warlock:fx', lite ? 'lite' : 'full');
      document.body.classList.toggle('fx-lite', lite);
      scene.setFx(lite);
    },
    pixel: pixelOk ? () => pixel : undefined,
    setPixel: (size) => {
      pixel = size;
      store.set('warlock:pixel', String(size));
      scene.setPixel(size);
    },
    spellReady: () => sound.play('ready', 0.8),
    watch: (step) => (watchStep = step),
    watchCenter: (on) => (watchCenter = on),
    camFollow: (on) => (camFollow = on),
    replay: toggleReplay,
    name: () => myName,
    // o servidor atualiza o apelido de quem já está na sala quando o hello chega de novo (addPlayer)
    rename: async () => {
      myName = await askName(document.body, myName);
      store.set(NAME, myName);
      net.send({ t: 'hello', playerId, name: myName });
    },
  });
  addEventListener('keydown', (e) => {
    // ← → já trocam o período do placar quando ele está aberto (ui.ts marca o evento; por isso este ouvinte vem depois do createRoomUi)
    if (!watchId || e.defaultPrevented || (e.code !== 'ArrowLeft' && e.code !== 'ArrowRight')) return;
    watchStep = e.code === 'ArrowLeft' ? -1 : 1;
    e.preventDefault();
  });
  // Esc sai do replay (sem abrir as configurações)
  addEventListener('keydown', (e) => {
    if (e.code !== 'Escape' || !rp || e.defaultPrevented) return;
    rp = null;
    e.preventDefault();
  });
  const scene = createScene(canvas, document.getElementById('labels')!);
  scene.setFx(fxLite);
  scene.setPixel(pixel);
  const interp = createInterp();
  const predict = createPredict();

  const myWizard = (s: SnapView | null) => s?.wizards.find((w) => w.id === me) ?? null;
  const volumeAt = (source?: Vec) => distanceVolume(myWizard(interp.latest())?.pos, source);
  const volumeOf = (id: string) => volumeAt(interp.latest()?.wizards.find((w) => w.id === id)?.pos);

  let attackCancelSeq = 0;
  function command(msg: { t: 'move'; x: number; y: number; held?: boolean } | { t: 'moveHold'; on: boolean } | { t: 'brace'; on: boolean } | { t: 'basic'; x: number; y: number; target?: string | number } | { t: 'stop' } | { t: 'cast'; spell: SpellId; x: number; y: number }) {
    seq++;
    if (msg.t === 'move' || msg.t === 'stop' || msg.t === 'cast') attackCancelSeq = seq;
    sentAt.set(seq, performance.now());
    // teto do mapa de latência: o snapshot só confirma o último seq (e nada fora da rodada), então muito comando nunca tem ack
    if (sentAt.size > 50) sentAt.delete(sentAt.keys().next().value!);
    net.send({ ...msg, seq });
  }

  const input = createInput(canvas, {
    pick: (x, y, spell) => {
      if (spell === 'heal') {
        const id = scene.pickMage(x, y);
        return interp.latest()?.wizards.find(w => w.id === id)?.pos ?? null;
      }
      return scene.pick(x, y);
    },
    move(to, held = false) {
      if ((myWizard(interp.latest())?.geyserLeft ?? 0) > 0) return;
      if ((myWizard(interp.latest())?.status ?? 0) & BRACING_BIT) return;
      command({ t: 'move', x: to.x, y: to.y, held });
      predict.move(to);
      scene.clickMarker(to, false);
    },
    holdMove: (on) => command({ t: 'moveHold', on }),
    brace: (on) => command({ t: 'brace', on }),
    pickAttack: (x, y) => scene.pickMage(x, y),
    attackArmedChanged: (on) => { canvas.style.cursor = on ? 'crosshair' : ''; },
    basic(at, clicked) {
      if ((myWizard(interp.latest())?.geyserLeft ?? 0) > 0) return;
      if ((myWizard(interp.latest())?.status ?? 0) & 16) return;
      const target = clicked?.endsWith('~ilusao') ? interp.latest()?.projectiles.find((q) => q.kind === 'illusion' && room?.ids[q.vel.x] === clicked.slice(0, -7))?.id : clicked;
      command({ t: 'basic', x: at.x, y: at.y, target });
      predict.stop();
      predict.hold(BASIC_ATTACK.windup, true);
      scene.clickMarker(at, true);
    },
    stop() {
      command({ t: 'stop' });
      predict.stop();
      scourgeUntil = 0; // o S cancela o Flagelo em preparo
    },
    cast(spell, at) {
      if ((myWizard(interp.latest())?.geyserLeft ?? 0) > 0) return;
      const state = myWizard(interp.latest())?.status ?? 0;
      if (castBlocked(!!(state & 16), !!(state & 128), spell)) return;
      const i = SPELL_IDS.indexOf(spell);
      const mine = room?.players.find((p) => p.id === me);
      if (!mine?.spells[spell]) return toast(t('Você ainda não tem essa magia. Compre na loja.', 'You don’t have that spell yet. Buy it in the shop.'));
      if (spell === 'heal') {
        const units = interp.latest()?.wizards.map(w => ({ ...w, team: room?.players.find(p => p.id === w.id)?.team })) ?? [];
        const self = units.find(w => w.id === me);
        const target = self && healTarget(units, self, at, SPELLS.heal.levels[mine.spells.heal - 1].range * (1 + itemStats(mine.items).range));
        if (!target) return toast(t('Selecione você ou um aliado vivo dentro do alcance.', 'Target yourself or a living ally within range.'));
        at = target.pos;
      }
      if ((lastSnap?.cd[i] ?? 0) > 0.1 || performance.now() < (justCast.get(spell) ?? 0) || (performance.now() < scourgeUntil && spell !== 'teleport')) return;
      if (spell === 'teleport') scourgeUntil = 0; // o Teleporte cancela o Flagelo em preparo
      // Flagelo em preparo: o servidor ignora outras magias até ele explodir
      if (spell === 'scourge') scourgeUntil = performance.now() + CAST_POINT.scourge * 1000;
      if (spell === 'rush') predict.stop(); // o avanço esquece o destino de andar, como no servidor
      // até a recarga chegar do servidor, não repete a mesma magia (senão a animação e o som tocam sem sair nada)
      justCast.set(spell, performance.now() + 120 + CAST_POINT[spell] * 1000 + predict.rtt() * 1000);
      command({ t: 'cast', spell, x: at.x, y: at.y });
      // conjurando, o mago fica parado e o clique de andar espera a magia sair (o servidor faz o mesmo)
      predict.hold(CAST_POINT[spell]);
      scene.castLocal(me, spell, at);
      if (spell !== 'heal') scene.clickMarker(at, true); // o marcador ofensivo laranja não pertence à cura.
      if (spell !== 'heal') sound.play(SPELL_SOUND[spell]); // cura toca uma vez, na confirmação e posição do alvo.
      return true;
    },
    center: () => {
      follow = true;
      scene.resetCamera();
    },
    zoom: (d) => scene.zoomBy(d),
    pan: (dx, dy) => scene.panBy(dx, dy),
    armedChanged: (s) => { armed = s; canvas.style.cursor = s === 'heal' ? 'crosshair' : ''; },
    preview: (s, at) => {
      held = s;
      const from = drawn.get(me);
      flashAim = at && from ? { from, at } : null;
    },
    padRange: (s) => (padAiming = s),
    me: () => (myWizard(interp.latest())?.alive ? (drawn.get(me) ?? null) : null),
    aim: (at) => ((padAt = at), scene.aim(at)),
  });

  // a aparência escolhida fica salva e é reenviada ao entrar em qualquer sala; trocada nas Configurações, vale na hora
  const net = connect('/ws/room/' + code, onMsg, () => {
    net.send({ t: 'hello', playerId, name: myName, ...(watchJoin && { watch: true as const }) });
    net.send({ t: 'look', look: savedLook() });
  }, (on) => {
    servidor(on);
    online = on;
    view.setOnline(on);
  });
  addEventListener(LOOK_EVENT, (e) => net.send({ t: 'look', look: (e as CustomEvent<string>).detail }));
  // a sala conta a CPU entre mensagens; o "estou aqui" a cada 5 s mantém a conta zerada durante a partida
  setInterval(() => room && room.phase !== 'lobby' && room.phase !== 'end' && net.send({ t: 'alive' }), 5000);

  // sombra: 1 bot que joga como você; o que não foi medido fica no Normal (mimic.ts)
  function startShadow(skill: Partial<BotSkill>) {
    training = true;
    run = pending = null;
    trainSetup = [{ skill }];
    shadow = true;
    net.send({ t: 'start', bots: 1, mode: 'rounds', shuffle: true, opts: DEFAULT_OPTS, setup: trainSetup });
  }
  // treino escolhido na tela inicial: só sozinho e com a sala em espera (uma vez, na primeira mensagem que já tem você)
  function begin(r: PublicRoom) {
    const k = autostart;
    if (!k || !r.players.some((p) => p.id === me)) return;
    autostart = null;
    if (IR_CONFIG) openSettings(IR_CONFIG); // ?ir=sandbox,config:som (só localhost)
    if (r.phase !== 'lobby' || r.players.some((p) => !p.bot && p.id !== me)) return;
    const c = CHALLENGES.find((x) => x.id === k);
    const skill = toSkill(store.json<Profile>(PROFILE_KEY));
    if (c) startChallenge(c);
    else if (k === 'shadow' && skill) startShadow(skill);
    else if (k === 'sandbox') startSandbox();
    else if (k === 'partida' || k === 'partida:loja') {
      // ?ir= (só localhost): partida contra 1 bot já começada; 'partida' ainda clica Pronto e pula a loja
      net.send({ t: 'start', bots: 1, mode: 'rounds', shuffle: true, opts: { ...DEFAULT_OPTS, shop: 120 } });
      if (k === 'partida') net.send({ t: 'ready' });
    }
    else if (k === 'partida:ascensao') {
      // sala do Ascensão: o Começar usa os bots e as opções do dono (quem abriu o atalho)
      net.send({ t: 'lobby', bots: ['normal', 'normal', 'normal'], opts: { ...DEFAULT_OPTS, shop: 120 } });
      net.send({ t: 'start', bots: 3, mode: 'ascension', shuffle: true, opts: { ...DEFAULT_OPTS, shop: 120 } });
    }
  }
  // sandbox: começa com você e um boneco parado; o resto vem pelo painel
  function startSandbox() {
    training = shadow = false;
    run = pending = null;
    trainSetup = undefined;
    net.send({ t: 'start', bots: 0, mode: 'rounds', shuffle: true, opts: DEFAULT_OPTS, sandbox: true });
    for (const cmd of SANDBOX_START) net.send({ t: 'sandbox', cmd });
  }

  function startChallenge(c: Challenge) {
    training = shadow = false;
    run = null;
    pending = c;
    net.send({ t: 'start', bots: c.bots, mode: 'rounds', shuffle: true, opts: c.opts, setup: c.setup });
  }
  // Repetir: com a partida rolando, reinicia por votação (sozinho passa na hora) e a loja da rodada 0 recomeça o desafio
  function again() {
    if (!run || !room) return;
    if (room.phase === 'end') return startChallenge(run.c);
    pending = run.c;
    net.send({ t: 'vote', kind: 'restart' });
  }
  // Sair do desafio: encerra a partida pela votação "Encerrar agora" (sozinho passa na hora) e volta para a sala
  function quit() {
    run = pending = null;
    if (room?.phase === 'end') return view.toRoom();
    quitting = true;
    net.send({ t: 'vote', kind: 'end' });
  }
  // fim do desafio: faixa, som e recorde (uma vez só)
  function finishRun(next: Run) {
    const was = run;
    run = next;
    if (was?.state !== 'on' || next.state === 'on' || !room) return;
    runRound = room.round;
    const won = next.state === 'won';
    sound.play(won ? 'winRound' : 'loseRound');
    banner(won ? t(`Desafio ${next.c.name} cumprido!`, `Challenge ${next.c.name} complete!`) : t(`Desafio ${next.c.name}: não deu`, `Challenge ${next.c.name}: failed`), won ? 'win' : 'bad');
    const score = scoreOf(next);
    if (score !== null && saveBest(next.c.id, score, !!next.c.survive)) toast(t(`Recorde novo no ${next.c.name}: ${n1(score)} s`, `New record in ${next.c.name}: ${n1(score)} s`), 'good');
  }

  function names() {
    return new Map(room?.players.map((p) => [p.id, playerName(p)]) ?? []);
  }

  // data-rune dá ao ícone o disco da cor da runa no aviso (style.css)
  const RUNE_TEXT = (k: RuneKind) => {
    const ic = icon(RUNE_ICON[k]);
    ic.dataset.rune = k;
    return [ic, ' ' + RUNE_NAME[k]];
  };
  // o que cada runa faz, com os números do código (pedido do Fernando, 18/10: dizer ao pegar)
  const RUNE_EFFECT: Record<RuneKind, string> = {
    haste: t(`anda ${Math.round(RUNE.haste * 100)}% mais rápido por ${RUNE.secs} s`, `moves ${Math.round(RUNE.haste * 100)}% faster for ${RUNE.secs} s`),
    fury: t(`magias causam ${Math.round(RUNE.fury * 100)}% mais dano por ${RUNE.secs} s`, `spells deal ${Math.round(RUNE.fury * 100)}% more damage for ${RUNE.secs} s`),
    shield: t(`leva ${Math.round(RUNE.armor * 100)}% menos dano por ${RUNE.secs} s`, `takes ${Math.round(RUNE.armor * 100)}% less damage for ${RUNE.secs} s`),
    recharge: t(`recargas ${Math.round(RUNE.cdr * 100)}% mais rápidas por ${RUNE.secs} s`, `cooldowns ${Math.round(RUNE.cdr * 100)}% shorter for ${RUNE.secs} s`),
  };
  const MULTI_TEXT = ['', '', t('Abate duplo!', 'Double kill!'), t('Abate triplo!', 'Triple kill!'), t('Massacre!', 'Ultra kill!')];
  const SPREE_TEXT: Record<number, string> = { 3: t('Matança', 'Killing Spree'), 5: t('Fúria assassina', 'Rampage'), 7: t('sequência Imparável', 'Unstoppable streak'), 10: t('sequência Lendária', 'Legendary streak') };
  let live: Record<string, { dmg: number; kills: number; taken?: number }> = {};
  let aliveAt: Record<string, number> = {}; // Ascensão: segundos que cada mago ficou vivo na rodada (XP ao vivo)
  function onEvents(events: SimEvent[]) {
    const near = (x: number, y: number) => volumeAt({ x, y });
    const who = names();
    let liveChanged = false;
    let shout = '';
    let voice: string | undefined;
    const notes: string[] = [];
    for (const e of events) {
      // dano e abates da rodada ao vivo na lista do canto
      if (e.k === 'hit' && e.by !== e.id && e.dmg > 0) {
        (live[e.by] ??= { dmg: 0, kills: 0 }).dmg += e.dmg;
        liveChanged = true;
      } else if (e.k === 'death' && e.by && e.by !== e.id) {
        (live[e.by] ??= { dmg: 0, kills: 0 }).kills++;
        liveChanged = true;
      }
      // dano levado por mim na rodada (sem a lava): a ficha mostra quanto o empurrão já cresceu
      if (e.k === 'hit' && e.id === me && e.dmg > 0) {
        const mine = (live[me] ??= { dmg: 0, kills: 0 });
        mine.taken = (mine.taken ?? 0) + e.dmg;
        liveChanged = true;
      }
      hitArrow(e, interp.latest());
      // controle: vibra ao levar golpe forte e ao morrer
      if (e.k === 'hit' && e.id === me && e.dmg >= 60) rumble(Math.min(1, e.dmg / 160), 200);
      else if (e.k === 'death' && e.id === me) rumble(1, 500);
      if (e.k === 'heal') sound.play('heal', near(e.x, e.y));
      else if (e.k === 'cast' && e.id !== me && e.spell !== 'heal') {
        sound.play(SPELL_SOUND[e.spell], volumeOf(e.id));
      } else if (e.k === 'hit') sound.play(e.dmg >= 100 ? 'hitHeavy' : e.dmg < 50 ? 'hitLight' : 'hit', near(e.x, e.y));
      else if (e.k === 'pillar') sound.play('hit', near(e.x, e.y) * 0.6);
      else if (e.k === 'grip') sound.play('hit', near(e.x, e.y));
      // Mesmo som de impacto/explosão para colisão entre magias e destruição por Raio, inclusive quando não houve dano.
      else if (e.k === 'clash') sound.play('hitHeavy', near(e.x, e.y));
      else if (e.k === 'reflect') sound.play('reflect', near(e.x, e.y));
      else if (e.k === 'teleport' && e.id === me) predict.teleported(e.to);
      else if (e.k === 'scourge') sound.play('death', near(e.x, e.y));
      else if (e.k === 'shrink') sound.play('shrink');
      else if (e.k === 'chest') toast(t('Baú de ouro na arena! Quebre e fique em cima do ouro', 'Gold chest in the arena! Break it and stand on the gold'), 'gold');
      else if (e.k === 'loot') sound.play('go', near(e.x, e.y));
      else if (e.k === 'sudden') {
        sound.play('shrink');
        banner([icon(SOURCE_ICON.lava), t(' Morte súbita! A arena encolhe a cada 5 s', ' Sudden death! The arena shrinks every 5 s')], 'bad');
      } else if (e.k === 'rune') toast([...RUNE_TEXT(e.kind), t(` apareceu na arena (${RUNE_EFFECT[e.kind]})`, ` appeared in the arena (${RUNE_EFFECT[e.kind]})`)], 'info');
      else if (e.k === 'runeTake') {
        sound.play('shield', volumeOf(e.id));
        // quem desligou os avisos de runa nas Configurações não vê o próprio; o de quem pegou outra runa continua
        if (e.id !== me || runeNoticesOn()) toast([e.id === me ? t('Você pegou ', 'You picked up ') : (who.get(e.id) ?? '?') + t(' pegou ', ' picked up '), ...RUNE_TEXT(e.kind), `: ${RUNE_EFFECT[e.kind]}`], e.id === me ? 'good' : 'info');
      } else if (e.k === 'streak') {
        const name = e.id === me ? t('Você', 'You') : (who.get(e.id) ?? '?');
        // uma voz por lote de eventos: o Quebra-combo vem primeiro, depois o multi e por último a Matança
        const say = (file: string) => voice ??= file;
        if (e.kind === 'multi') {
          shout = `${name}: ${MULTI_TEXT[Math.min(e.n, 4)]}`;
          if (e.n >= 4) say('ultra_kill');
          else if (e.n === 3) say('multi_kill');
          else sound.play('go');
        } else if (e.kind === 'spree') {
          notes.push(t(`${name} está numa ${SPREE_TEXT[e.n] ?? 'sequência'} (${e.n} abates sem morrer)`, `${name} is on a ${SPREE_TEXT[e.n] ?? 'streak'} (${e.n} kills without dying)`));
          say('laugh');
        } else {
          notes.push(t(`${name} quebrou a sequência de ${e.victim === me ? 'você' : (who.get(e.victim ?? '') ?? '?')} (Quebra-combo: ouro extra)`, `${name} broke ${e.victim === me ? 'your' : (who.get(e.victim ?? '') ?? '?') + '’s'} streak (Combo breaker: extra gold)`));
          say('combo_breaker');
        }
      } else if (e.k === 'aegis') {
        sound.play('shield', volumeOf(e.id));
        banner([icon(ITEM_ICON.aegis), e.id === me ? t(' A Égide te tirou da lava e quebrou', ' The Aegis pulled you out of the lava and broke') : t(` A Égide tirou ${who.get(e.id) ?? '?'} da lava`, ` The Aegis pulled ${who.get(e.id) ?? '?'} out of the lava`)], e.id === me ? 'good' : '');
      }
      else if (e.k === 'death') {
        // fora da pedra: mergulho na lava (chiado e bolhas) em vez da explosão
        const snap = interp.latest();
        const w = snap?.wizards.find((z) => z.id === e.id);
        sound.play(w && snap && inLavaAt(arenaId, snap.arenaR, snap.isles, w.pos, 0.3) ? 'splash' : 'death', volumeOf(e.id));
        const dead = who.get(e.id) ?? '?';
        if (e.id === me) {
          clip = ring.slice();
          fall = { by: e.by, src: e.src };
        }
        // todo abate vai para o feed do canto; a faixa grande fica só para o que envolve você
        view.kill(e.by, e.id, e.src);
        if (e.by === me && e.id !== me) banner(t(`Você derrubou ${dead}!`, `You took down ${dead}!`), 'good');
        else if (e.id === me) banner(e.by && e.by !== me ? t(`${who.get(e.by)} te derrubou!`, `${who.get(e.by)} took you down!`) : t('Você caiu na lava!', 'You fell into the lava!'), 'bad');
      }
    }
    if (shout) banner(shout, 'good');
    if (notes.length) toast(notes.join(' · '));
    if (voice) void sound.taunt(voice);
    if (liveChanged) view.live(live);
    if (run?.state === 'on' && room?.phase === 'playing') finishRun(stepRun(run, 0, events, me, true));
    if (!rp) scene.onEvents(events); // durante o replay a cena mostra os efeitos do trecho gravado
  }

  // golpe recebido: seta na borda da tela do lado de quem bateu (a câmera não gira, então o ângulo do chão vale na tela)
  function hitArrow(e: SimEvent, s: SnapView | null) {
    if (e.k !== 'hit' || e.id !== me || e.dmg <= 0 || e.by === me) return;
    const from = s?.wizards.find((z) => z.id === e.by)?.pos;
    if (from && dist(from, { x: e.x, y: e.y }) > 0.5) view.hitFrom(Math.atan2(from.y - e.y, from.x - e.x));
  }

  let lastPhase = '';
  function onMsg(m: ServerMsg) {
    if (m.t === 'error') {
      if (m.code === 'not_found') return screen(ui, t('Sala não encontrada', 'Room not found'), t('Ela pode ter fechado por ficar vazia.', 'It may have closed for being empty.'), t('Ver salas', 'View rooms'), () => (location.hash = ''));
      // sem parar a conexão, ela se reconectaria sozinha e derrubaria a outra aba, num vaivém sem fim
      if (m.code === 'other_tab' || m.code === 'full' || m.code === 'kicked') net.stop();
      if (m.code === 'kicked') return screen(ui, t('Você foi removido da sala por votação', 'You were removed from the room by vote'), t('Não dá para voltar a esta sala. Entre em outra ou crie uma.', 'You can’t return to this room. Join another or create one.'), t('Ver salas', 'View rooms'), () => (location.hash = ''));
      if (m.code === 'other_tab') return screen(ui, t('Sala aberta em outra aba', 'Room open in another tab'), t('Continue por lá ou recarregue esta.', 'Continue there or reload this one.'), t('Recarregar', 'Reload'), () => location.reload());
      if (m.code === 'full') return screen(ui, t('Sala cheia', 'Room full'), t('Já tem 8 magos nesta sala.', 'There are already 8 wizards in this room.'), t('Ver salas', 'View rooms'), () => (location.hash = ''));
      sound.play('error');
      return toast(t(m.msg, SERVER_EN[m.msg] ?? m.msg), 'bad');
    }
    if (m.t === 'room') {
      const prev = room;
      if (shadow && m.room.players.filter((p) => p.bot).length === 1 && m.room.players.filter((p) => !p.bot).length === 1) for (const p of m.room.players) if (p.bot) p.name = t('Sombra', 'Shadow'); // só no duelo contra a sombra
      room = m.room;
      me = m.you;
      arenaId = room.arena ?? arenaId; // na loja não há rodada: fica a última arena
      view.update(room, me, online);
      begin(room);
      // alguém saiu no meio da partida e um bot assumiu o mago, ou a pessoa voltou (issue #223)
      if (prev) {
        const { left, back } = seatChanges(prev, room);
        for (const p of left) {
          const lvl = SKILL_NAME[botLevel(p, room) ?? room.opts.difficulty];
          const name = playerName(p);
          toast(t(`${name} saiu da partida · um bot ${lvl} joga no lugar até voltar`, `${name} left the match · a ${lvl} bot plays in their place until they return`), 'info', true);
        }
        for (const p of back) {
          const name = playerName(p);
          toast(t(`${name} voltou para a partida`, `${name} is back in the match`), 'good', true);
        }
      }
      // compra na loja: o ouro caiu → som de moedas
      if (prev?.phase === 'shop' && room.phase === 'shop') {
        const was = prev.players.find((p) => p.id === me)?.gold, now = room.players.find((p) => p.id === me)?.gold;
        if (was !== undefined && now !== undefined && now < was) sound.play('buy');
      }
      scene.preload(room.players.map((p) => p.look));
      if (room.phase !== lastPhase) onPhase(prev);
      lastPhase = room.phase;
      // desafio: na loja da rodada 0 compra o que ele pede e já fica Pronto (os bots já estão, a loja fecha na hora)
      if (pending && room.phase === 'shop' && room.round === 0) {
        run = { c: pending, n: 0, t: 0, state: 'on' };
        for (const spell of pending.buy ?? []) net.send({ t: 'buy', spell });
        net.send({ t: 'ready' });
        pending = null;
      }
      return;
    }
    if (m.t === 'taunt') {
      const taunt = TAUNTS[m.i];
      if (!taunt) return;
      const text = t(taunt.text, taunt.en);
      void sound.taunt(taunt.id, () => volumeOf(m.id));
      if (!scene.bubble(m.id, text, taunt.id)) {
        const p = room?.players.find((p) => p.id === m.id);
        toast(`${p ? playerName(p) : '?'}: ${text}`);
      }
      return;
    }
    const ownIndex = room?.ids.indexOf(me) ?? -1;
    const braceNow = ownIndex >= 0 && !!(m.w[ownIndex * 7 + 6] & BRACING_BIT);
    const braceBefore = ownIndex >= 0 && !!((lastSnap?.w[ownIndex * 7 + 6] ?? 0) & BRACING_BIT);
    if (braceNow && !braceBefore) sound.play('brace'); // ativa junto dos efeitos autoritativos, nunca durante o preparo.
    lastSnap = m;
    predict.setSpeed(m.sp);
    const acked = sentAt.get(m.ack);
    if (acked !== undefined) {
      predict.setRtt(performance.now() - acked);
      rttSeen = true;
      sentAt.delete(m.ack);
    }
    if (!room) return;
    const sv = decodeSnap(m, room.ids);
    interp.push(sv, performance.now() / 1000);
    keepLast(ring, { s: sv, e: m.e ?? [] }, REPLAY_MAX); // antes do onEvents: o estado da queda entra no trecho
    if (m.e) onEvents(m.e);
  }

  function onPhase(prev: PublicRoom | null) {
    if (!room) return;
    rp = null; // troca de fase encerra o replay
    const left = quitting;
    quitting = false;
    // desafio: a rodada acabou antes da meta (a queda que decide o Duelo pode chegar depois do fim da rodada)
    if (run && prev?.phase === 'playing') finishRun(endRun(run, room.lastRoundWinner === me));
    // a sombra aprende com as rodadas jogadas fora dos desafios (alive > 0: fora o deathmatch, que não conta o tempo vivo)
    const mine = room.players.find((p) => p.id === me)?.stats.round;
    if (room.phase === 'roundEnd' && prev?.phase === 'playing' && !run && !pending && !room.sandbox && mine && mine.alive > 0) store.set(PROFILE_KEY, JSON.stringify(addRound(store.json<Profile>(PROFILE_KEY), mine, rttSeen ? predict.rtt() : 0)));
    // cortina ao entrar na partida ou voltar para a sala (sala e fim são telas de menu; o resto é a arena)
    const menu = (p: string) => p === 'lobby' || p === 'end';
    if (prev && menu(prev.phase) !== menu(room.phase)) curtain();
    // na contagem o servidor ainda não aceita comandos: liberar só quando a rodada começa
    input.setEnabled(room.phase === 'playing');
    sound.setAmbience(room.phase !== 'lobby' && room.phase !== 'end');
    sound.duck(room.phase === 'shop');
    // Ascensão: o tempo acabou sem a escolha da pessoa e o jogo sorteou (#224)
    const auto = prev?.phase === 'shop' && room.phase === 'countdown' ? room.players.find((p) => p.id === me)?.asc?.auto : null;
    if (auto?.length) {
      const names = auto.map(cardName).join(', ');
      toast(t(`Tempo esgotado: o jogo escolheu por você ${names}.`, `Time's up: the game picked ${names} for you.`));
    }
    if (room.phase === 'countdown') {
      live = {};
      aliveAt = {};
      view.live(live);
      interp.reset();
      predict.reset();
      ring = [];
      clip = [];
      follow = true;
      watchId = null;
      // modo Times: avisa em que time a pessoa está nesta rodada
      const team = room.mode === 'teams' ? room.players.find((p) => p.id === me)?.team : null;
      // efeito da rodada na faixa grande (a linha do topo passa despercebida); no Ascensão, o aviso dos pontos valendo mais
      const mult = room.mode === 'ascension' ? roundMult(room.round) : 1;
      const fx = (room.effect ? ` · ${effectName(room.effect, room.mode)}` : '') + (mult === 2 ? t(' · Pontos em dobro', ' · Double points') : mult > 1 ? t(' · Pontos ×1,5', ' · Points ×1.5') : '');
      banner(team != null ? t(`Rodada ${room.round} · Você está no time ${TEAM_NAMES[team]}${fx}`, `Round ${room.round} · You are on the ${TEAM_NAMES[team]} team${fx}`) : t(`Rodada ${room.round}${fx}`, `Round ${room.round}${fx}`));
      [3, 2, 1].forEach((_, i) => setTimeout(() => sound.play('beep'), i * 1000));
    } else if (room.phase === 'playing') {
      playingAt = performance.now();
      banner(t('Já!', 'Go!'), 'good');
      sound.play('go');
    } else if (room.phase === 'roundEnd' && !(run && runRound === room.round)) { // a rodada em que o desafio acabou fica com a faixa dele
      const w = room.players.find((p) => p.id === room!.lastRoundWinner);
      const myTeam = room.players.find((p) => p.id === me)?.team;
      // vencedor (ou o time dele) vê a faixa VITÓRIA com confete e ouve o arpejo; quem jogou e perdeu ouve o arpejo descendo
      const won = !!w && (room.mode === 'teams' && w.team !== null ? w.team === myTeam : w.id === me);
      if (w && room.players.some((p) => p.id === me)) sound.play(won ? 'winRound' : 'loseRound');
      if (won) banner(room.mode === 'teams' && w!.team !== null ? t(`Vitória do time ${TEAM_NAMES[w!.team]}!`, `${TEAM_NAMES[w!.team]} team wins!`) : room.mode === 'deathmatch' ? t('Vitória! Mais abates', 'Victory! Most kills') : t('Vitória!', 'Victory!'), 'win');
      else if (room.mode === 'teams' && w && w.team !== null) banner(t(`Time ${TEAM_NAMES[w.team]} venceu a rodada!`, `${TEAM_NAMES[w.team]} team won the round!`));
      else {
        const winnerName = w ? playerName(w) : '?';
        banner(!w ? (room.mode === 'deathmatch' ? t('Fim da rodada', 'Round over') : t('Ninguém sobrou!', 'Nobody is left!')) : room.mode === 'deathmatch' ? (w.id === me ? t('Você fez mais abates!', 'You got the most kills!') : t(`${winnerName} fez mais abates!`, `${winnerName} got the most kills!`)) : w.id === me ? t('Você venceu a rodada!', 'You won the round!') : t(`${winnerName} venceu a rodada!`, `${winnerName} won the round!`), w?.id === me ? 'good' : '');
      }
    } else if (room.phase === 'end' && left) view.toRoom();
    else if (room.phase === 'end' && prev) {
      // mesmo resultado do cabeçalho do cartão (Vitória, Derrota ou Fim de jogo); quem só assistia não ouve nada
      const res = endResult(room, me);
      if (res !== 'none') sound.play(res === 'win' ? 'winRound' : 'loseRound');
      // o cartão do fim já mostra o vencedor e o pódio: a faixa grande só para quem venceu (antes cobria o pódio)
      if (res === 'win') banner(t('Vitória na partida!', 'Match victory!'), 'win');
    }
  }

  let lastFrame = performance.now();
  function frame() {
    requestAnimationFrame(frame);
    const nowMs = performance.now();
    const dt = Math.min(0.05, (nowMs - lastFrame) / 1000); // aba que volta do segundo plano não dá salto na previsão nem nas animações
    lastFrame = nowMs;
    const s = interp.sample(nowMs / 1000);
    const latest = interp.latest();
    const playing = room && (room.phase === 'countdown' || room.phase === 'playing' || room.phase === 'roundEnd');
    const wizards = playing && s ? wizardsOf(s, true, dt) : [];
    const myPos = wizards.find((w) => w.id === me)?.pos ?? null;
    // perigo: vida abaixo de 25% e pé na lava (mesma regra da simulação: fora do raio da arena)
    const meW = room?.phase === 'playing' ? myWizard(latest) : null;
    const meP = room?.players.find((p) => p.id === me);
    const meMax = HP_MAX + (meP ? itemStats(meP.items).hp : 0);
    const xp = meW?.alive && meP ? xpOf(meP) : null; // Ascensão: XP ao vivo na barra embaixo da vida
    const low = !!meW?.alive && !!meP && meW.hp < 0.25 * meMax;
    const lava = !!meW?.alive && !!latest && inLavaAt(arenaId, latest.arenaR, latest.isles, meW.pos);
    view.danger(low, lava);
    const shrinkIn = s && room?.phase === 'playing' && room.mode !== 'deathmatch' && (!room.sandbox || room.sandbox.shrink) ? s.shrinkAt - s.time : null;
    // espectador: morto na rodada (ou só assistindo), a câmera segue o vivo com mais vida; ← → ou os botões trocam.
    // Quem está invisível para mim (2048) fica de fora: a câmera entregaria onde ele está
    const alive = room?.phase === 'playing' && s && !meW?.alive ? wizards.filter((w) => w.alive && w.id !== me && !(w.status & 2048)) : [];
    let watched = alive.find((w) => w.id === watchId);
    if (!watched && alive.length) watched = alive.reduce((a, w) => (w.hp > a.hp ? w : a));
    if (watchStep && watched) watched = alive[(alive.indexOf(watched) + watchStep + alive.length) % alive.length];
    watchStep = 0;
    watchId = watched?.id ?? null;
    view.watching(watched?.name ?? null);
    view.deadShopping(room?.phase === 'playing' && room.mode !== 'deathmatch' && room.mode !== 'ascension' && !!meP && !!meW && !meW.alive);
    // replay da queda: só caído na rodada ou no fim dela; acaba no fim do trecho (segura 1 s na queda) ou ao voltar vivo no Deathmatch
    canReplay = clip.length > 1 && (room?.phase === 'roundEnd' || (room?.phase === 'playing' && !meW?.alive));
    const rt = rp ? clip[0].s.time + (nowMs - rp.at) / 1000 : 0;
    if (rp && (!canReplay || rt > clip[clip.length - 1].s.time + 1)) rp = null;
    const rs = rp ? rp.it.sample(rt + DELAY) : null;
    document.body.classList.toggle('replaying', !!rs); // a loja de quem caiu sai da frente enquanto o replay passa
    if (rp && rs) for (; rp.next < clip.length && clip[rp.next].s.time <= rt; rp.next++) replayEvents(clip[rp.next].e, rs);
    const killer = rs && fall.by && fall.by !== me ? fall.by : null;
    view.replay(canReplay && !rp, rs ? (killer ? t(`Replay · ${names().get(killer) ?? '?'} te derrubou com ${srcName(fall.src)}`, `Replay · ${names().get(killer) ?? '?'} took you down with ${srcName(fall.src)}`) : t('Replay · Você caiu na lava sozinho', 'Replay · You fell into the lava on your own')) : null);
    const shown = rs ?? (playing ? s : null);
    const drawWiz = rs ? wizardsOf(rs, false, dt) : wizards;
    // replay: câmera travada no meio entre mim e quem me derrubou
    const rMe = rs ? drawWiz.find((w) => w.id === me)?.pos : undefined;
    const rBy = killer ? drawWiz.find((w) => w.id === killer)?.pos : undefined;
    // Ilusão: a cópia usa o visual do dono, mas tem identidade visual própria: sempre visível e sólida, e não herda o arremessado (16)
    const copies: WizDraw[] = (shown ? shown.projectiles : []).flatMap((q) => {
      const ownerId = q.kind === 'illusion' ? room?.ids[q.vel.x] : undefined;
      const o = drawWiz.find((d) => d.id === ownerId);
      return o ? [{ ...o, id: ownerId + '~ilusao', pos: q.pos, facing: q.vel.y, status: o.status & ~(16 | 1024 | 2048 | 8388608), basicLeft: 0, moving: true, cheer: false, illusion: true, ghost: false }] : [];
    });
    // o desafio conta o tempo só com a rodada rolando; o progresso dele fica no lugar da dica do treino
    if (run?.state === 'on' && room?.phase === 'playing') finishRun(stepRun(run, dt, [], me, meW?.alive !== false));
    if (run) view.coach(runText(run), run.state === 'on' ? undefined : again, quit);
    else if (training && room) view.coach(meP ? coachTip({ phase: room.phase, round: room.round, playingFor: (nowMs - playingAt) / 1000, shrinkIn, low, lava, alive: !!meW?.alive, touch: TOUCH, fireKey: isPadMode() ? 'A' : labelOf('fireball'), fire: meP.spells.fireball > 0 }) : null);
    else view.coach(null);
    scene.render({
      arena: arenaId,
      arenaR: (rs ?? s)?.arenaR ?? 11,
      shrinkIn: shrinkIn ?? SHRINK_EVERY,
      wizards: [...drawWiz, ...copies],
      projectiles: shown ? shown.projectiles : [],
      pillars: shown ? shown.pillars : [],
      loots: shown ? shown.loots : [],
      runes: shown ? shown.runes : [],
      zones: shown ? shown.zones : [],
      isles: shown ? shown.isles : [],
      // follow null = centro da arena (0, 0), para onde ela encolhe
      follow: rs ? (rMe && rBy ? scale(add(rMe, rBy), 0.5) : (rMe ?? rBy ?? null)) : watched ? (watchCenter ? null : watched.pos) : follow ? myPos : null,
      lock: !!rs || (watched ? !watchCenter : camFollow && follow && !!myPos),
      // na loja o room.effect já é o da próxima rodada: o mapa só muda quando ela começa
      effect: room && ['countdown', 'playing', 'roundEnd'].includes(room.phase) ? room.effect : null,
      arcane: room?.mode === 'ascension', // Febre arcana: a Febre do ouro em azul
    });
    // círculo de alcance em volta do próprio mago (some ao lançar ou cancelar)
    const showing = room?.phase === 'playing' && meW?.alive && myPos ? (held ?? armed ?? padAiming ?? hovered) : null;
    const reach = showing && meP ? reachOf(showing, meP.spells, meP.items) : 0;
    // mira de verdade (tecla segurada no Segurar, magia escolhida ou controle): faixa de acerto e explosão rumo ao cursor ou retículo.
    // No Rápido a tecla é o piscar depois de lançar: a faixa fica parada onde a magia saiu (flashAim), e o mouse na barra não aponta
    // o chão: nada segue o mouse
    const frozen = armed || padAiming ? null : flashAim;
    const aiming = showing && (armed ?? padAiming ?? (getCastMode() === 'release' || frozen ? held : null));
    const aimAt = aiming ? (padAiming ? padAt : (frozen?.at ?? input.aimPoint())) : null;
    const shape = aiming && aimAt && meP && myPos ? aimOf(aiming, meP.spells, meP.items, frozen?.from ?? myPos, aimAt) : null;
    scene.range(showing && myPos ? myPos : null, reach, shape?.blastAt ?? null, shape?.blastR ?? 0);
    scene.bands(shape?.segs ?? [], shape?.half ?? 0);
    // nas posições desenhadas (as mesmas da tela), para ver se o erro foi mira, desvio ou a bola no ar enganando
    scene.hitboxes(seeHit && room?.sandbox && shown ? [...drawWiz.filter((d) => d.alive).map((d) => ({ pos: d.pos, r: WIZ_R, wiz: true })), ...shown.projectiles.map((p) => ({ pos: p.pos, r: hitR(p.kind), wiz: p.kind === 'illusion' })).filter((h) => h.r > 0)] : null);
    const respawnIn = room?.phase === 'playing' ? (lastSnap?.rs?.[room.ids.indexOf(me)] ?? 0) : 0;
    // no tamanho mínimo a arena para de encolher e o aviso some; depois do colapso ela volta a encolher até sumir
    view.frame(lastSnap?.cd ?? [], armed, s && (s.arenaR > ARENA_MIN + 0.01 || s.time >= SUDDEN.collapse) ? shrinkIn : null, respawnIn, myWizard(latest)?.status ?? 0, rttSeen ? predict.rtt() * 1000 : null, meW?.alive && meP ? { now: meW.hp, max: meMax } : null,
      wizards.filter((w) => !w.alive).map((w) => w.id).join(), lastSnap?.fx, xp); // caídos na rodada: retrato apagado no topo
  }
  const drawn = new Map<string, Vec>();
  const replayDrawn = new Map<string, Vec>();
  // magos para desenhar: ao vivo o meu vem da previsão; no replay, todos do trecho gravado (cada um com seu mapa de posições anteriores)
  // Ascensão: XP da partida mais o da rodada ao vivo (dano, abates, segundos vivo até a queda); fora da rodada o servidor já somou
  // a rodada em asc.xp, então vale só ele. null fora do modo
  const xpOf = (p: PublicPlayer) => {
    if (!p.asc) return null;
    const on = room?.phase === 'playing';
    return liveLevel(p.asc.xp, on ? (live[p.id]?.dmg ?? 0) : 0, on ? (live[p.id]?.kills ?? 0) : 0, on ? (aliveAt[p.id] ?? 0) : 0);
  };
  // colocação no placar para a medalha em cima do mago: só quem já fez ponto; empate divide a colocação; fora na sandbox
  const placeOf = (p?: PublicPlayer) => (!p?.score || !room || room.sandbox ? undefined : 1 + room.players.filter((q) => !q.watch && q.score > p.score).length);
  function wizardsOf(s: SnapView, live: boolean, dt: number): WizDraw[] {
    const byId = new Map(room?.players.map((p) => [p.id, p]) ?? []);
    // modo Times: cor do time no anel e na barra; no fim da rodada o time vencedor inteiro comemora
    const teams = room?.mode === 'teams';
    const winTeam = teams ? byId.get(room!.lastRoundWinner ?? '')?.team : null;
    const server = live && room?.phase === 'playing' ? myWizard(interp.latest()) : null;
    const prev = live ? drawn : replayDrawn;
    return s.wizards.map((w) => {
      const p = byId.get(w.id);
      const state = { ...renderWizardState(w, server) };
      if (live && w.id === me && (lastSnap?.ack ?? 0) < attackCancelSeq) state.basicLeft = 0;
      const status = sandboxVisibility(state.status, w.id === me, !!room?.sandbox, seeInvis);
      const pos = w.id === me && server ? predict.frame(server, dt) : w.pos;
      const prevDraw = prev.get(w.id);
      // O residual e a correção visual também deslocam o modelo: só um destino real pode ligar a corrida.
      const moving = !!(state.status & WALKING_BIT) && state.alive && (!!(state.status & HOLDING_MOVE_BIT) || !prevDraw || dist(prevDraw, pos) > 0.004);
      prev.set(w.id, pos);
      if (live && w.alive && room?.phase === 'playing') aliveAt[w.id] = s.time;
      return { ...state, xp: live && p ? xpOf(p) : null, status, pos, hpMax: HP_MAX + (p ? itemStats(p.items).hp : 0), regen: HP_REGEN + (p ? itemStats(p.items).regen : 0), bot: p && room ? botLevel(p, room) : null, color: p?.color ?? 0, character: p?.character ?? 'mage', look: p?.look, name: p ? playerName(p) : '?', place: placeOf(p), shieldR: p?.spells.shield ? SPELLS.shield.levels[p.spells.shield - 1].radius : 0, loot: live ? (lastSnap?.lp?.[room?.ids.indexOf(w.id) ?? -1] ?? 0) : 0, moving, cheer: live && room?.phase === 'roundEnd' && (room.lastRoundWinner === w.id || (teams && p?.team != null && p.team === winTeam)), team: teams ? p?.team : null, fx: live && w.id === me ? (lastSnap?.fx ?? []) : undefined };
    });
  }
  // eventos do replay: só a cena (clarão, explosão) e a seta do golpe que eu levei
  function replayEvents(events: SimEvent[], rs: SnapView) {
    scene.onEvents(events);
    for (const e of events) hitArrow(e, rs);
  }
  void scene.ready.then(() => requestAnimationFrame(frame), () => toast(t('Não deu para carregar o mago. Recarregue a página.', 'Couldn’t load the wizard. Reload the page.')));
}

startPad(toast);
void main();
