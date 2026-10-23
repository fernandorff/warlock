// Sons: arquivos gravados (CC0 em public/sfx; as provocações do Leonard em public/taunts-local têm só a autorização dele; créditos em public/CREDITS.txt) e, enquanto não carregam ou se faltarem,
// sons sintetizados na hora (Web Audio). Música e crepitar da lava em loop. O navegador só libera áudio depois de um toque.
import { tauntAudioSrc } from '../shared/taunts.ts';
import { store } from './store.ts';

export type SoundKind = 'fireball' | 'lightning' | 'homing' | 'shield' | 'teleport' | 'frost' | 'swap' | 'grip' | 'meteor' | 'rush' | 'cluster' | 'boomerang' | 'thrust' | 'gravity'
  | 'rockpillar' | 'bouncer' | 'drain' | 'illusion' | 'magnetize' | 'recharge' | 'alteration' | 'link' | 'windwalk' | 'splitter' | 'warpzone' | 'hit' | 'hitLight' | 'hitHeavy' | 'reflect' | 'death' | 'splash' | 'shrink' | 'beep' | 'go' | 'click'
  | 'winRound' | 'loseRound' | 'buy' | 'error' | 'ready' | 'hover';

const FILES: Partial<Record<SoundKind, string[]>> = {
  fireball: ['fireball'], lightning: ['lightning'], homing: ['homing'], shield: ['shield'], teleport: ['teleport'], frost: ['frost'],
  swap: ['swap'], grip: ['grip'], meteor: ['meteor'], rush: ['rush'], cluster: ['cluster'], boomerang: ['boomerang'], thrust: ['thrust'], gravity: ['gravity'], rockpillar: ['rockpillar'],
  bouncer: ['bouncer'], drain: ['drain'], illusion: ['illusion'], magnetize: ['magnetize'], recharge: ['recharge'], alteration: ['alteration'], link: ['link'], windwalk: ['windwalk'],
  splitter: ['splitter'], warpzone: ['warpzone'],
  hit: ['hit', 'explode'], hitLight: ['hit'], hitHeavy: ['hit', 'explode'], reflect: ['shield'], death: ['explode'], click: ['click'], go: ['confirm'],
};
// golpe fraco mais agudo, golpe forte mais grave
const RATE: Partial<Record<SoundKind, number>> = { hitLight: 1.25, hitHeavy: 0.78 };

// música da partida escolhida em Configurações → Som (pedido do Fernando, 20/10); troca na hora
export const MUSIC_TRACKS = { battle: 'Epic Boss Battle', pursuit: 'Determined Pursuit' } as const;
export type MusicTrack = keyof typeof MUSIC_TRACKS;
export const musicTrack = (): MusicTrack => (store.get('warlock:music-track') === 'pursuit' ? 'pursuit' : 'battle');
let musicEl: HTMLAudioElement | null = null;
export function setMusicTrack(k: MusicTrack) {
  store.set('warlock:music-track', k);
  if (!musicEl) return;
  const playing = !musicEl.paused;
  musicEl.src = `/music/${k}.mp3`;
  if (playing) void musicEl.play().catch(() => {});
}

// volumes de 0 a 1, separados para efeitos e música, guardados no navegador: os mesmos no menu inicial e na sala (issue #128).
// Quem tinha deixado mudo na versão antiga começa em zero
type Volumes ={ sfx: number; music: number };
const VOL_KEY = { sfx: 'warlock:vol-sfx', music: 'warlock:vol-music' } as const;
export function loadVolumes(musicDefault = 0.7): Volumes {
  const readVol = (k: string, fallback: number) => {
    const n = Number(store.get(k));
    return Number.isFinite(n) && store.get(k) !== null ? Math.max(0, Math.min(1, n)) : fallback;
  };
  const oldMute = store.get('warlock:mute') === '1';
  return { sfx: readVol(VOL_KEY.sfx, oldMute ? 0 : 1), music: readVol(VOL_KEY.music, oldMute || store.get('warlock:music') === '0' ? 0 : musicDefault) };
}
export const saveVolume = (kind: keyof Volumes, value: number) => store.set(VOL_KEY[kind], String(value));

// musicDefault: volume da música de quem nunca mexeu nele (nas abas de teste em localhost, 0; main.ts)
export function createSound(musicDefault?: number) {
  const vol = loadVolumes(musicDefault);
  const volumes = () => vol;
  let ctx: AudioContext | null = null;
  let noise: AudioBuffer | null = null;
  let master: GainNode | null = null;
  const buffers = new Map<string, AudioBuffer>();
  const music = (musicEl = new Audio(`/music/${musicTrack()}.mp3`));
  music.loop = true;
  music.preload = 'none'; // só baixa quando a partida toca (o lobby também cria o som, para o hover e o clique)
  let lava: AudioBufferSourceNode | null = null;
  let wantAmbience = false;
  let duck = 1; // na loja a música abaixa um pouco

  async function load(name: string, src = `/sfx/${name}.mp3`) {
    try {
      const res = await fetch(src);
      if (res.ok) buffers.set(name, await ctx!.decodeAudioData(await res.arrayBuffer()));
    } catch {
      // fica o som sintetizado
    }
  }

  function unlock() {
    if (!ctx) {
      try {
        ctx = new AudioContext();
      } catch {
        return;
      }
      // compressor + volume geral abaixo de 1: vários sons juntos (golpe + explosão) não estouram
      master = ctx.createGain();
      master.gain.value = 0.6 * volumes().sfx;
      const comp = ctx.createDynamicsCompressor();
      master.connect(comp).connect(ctx.destination);
      noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const data = noise.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      const names = new Set([...Object.values(FILES).flat(), 'lava_loop']);
      void Promise.all([...names].map((name) => load(name))).then(syncAmbience);
    }
    if (ctx.state === 'suspended') void ctx.resume();
    syncAmbience();
  }
  addEventListener('pointerdown', unlock);
  addEventListener('keydown', unlock);

  // música e lava tocam só dentro da partida e com som ligado
  function syncAmbience() {
    const vol = volumes();
    if (master) master.gain.value = 0.6 * vol.sfx;
    music.volume = Math.min(1, 0.35 * vol.music * duck);
    const on = wantAmbience && !!ctx && ctx.state === 'running';
    if (on && vol.music > 0) void music.play().catch(() => {});
    else music.pause();
    const buf = buffers.get('lava_loop');
    if (on && vol.sfx > 0 && buf && !lava) {
      const src = ctx!.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const gain = ctx!.createGain();
      gain.gain.value = 0.12;
      src.connect(gain).connect(master!);
      src.start();
      lava = src;
    } else if ((!on || vol.sfx === 0) && lava) {
      lava.stop();
      lava = null;
    }
  }

  function file(name: string, volume: number, rate = 1) {
    const buf = buffers.get(name);
    if (!buf) return false;
    const src = ctx!.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate * (0.94 + Math.random() * 0.12); // variação leve para não cansar
    const g = ctx!.createGain();
    g.gain.value = volume;
    src.connect(g).connect(master!);
    src.start();
    return true;
  }

  // ruído filtrado: chiado de fogo, estalo de raio, borbulha de lava
  function hiss(type: BiquadFilterType, f0: number, f1: number, dur: number, gain: number, at = 0) {
    const c = ctx!;
    const t = c.currentTime + at;
    const src = c.createBufferSource();
    src.buffer = noise;
    const filter = c.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(f0, t);
    filter.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter).connect(g).connect(master!);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
  }

  function tone(type: OscillatorType, f0: number, f1: number, dur: number, gain: number, at = 0) {
    const c = ctx!;
    const t = c.currentTime + at;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(master!);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  const api = {
    volumes,
    // Configurações (menu e sala): guarda, aplica na hora e toca o clique no volume novo dos efeitos
    setVolume(kind: keyof Volumes, value: number) {
      vol[kind] = value;
      saveVolume(kind, value);
      syncAmbience();
      if (kind === 'sfx') api.play('click');
    },
    setAmbience(on: boolean) {
      wantAmbience = on;
      syncAmbience();
    },
    // teste local dos efeitos sonoros (issue #203, em localhost e no ambiente do PR): toca public/sfx/<nome>.mp3 pelo mesmo caminho das magias
    async preview(name: string, volume = 1) {
      if (!ctx || volumes().sfx === 0 || ctx.state !== 'running') return;
      if (!buffers.has(name)) await load(name);
      file(name, 0.8 * Math.max(0.05, Math.min(1, volume)));
    },
    // taunt: caminho do catálogo (public/sfx/taunt/<nome>.mp3 ou a gravação em public/taunts-local), carregado na primeira vez que alguém usa
    async taunt(name: string) {
      const src = tauntAudioSrc(name);
      if (!src) return;
      if (!ctx || volumes().sfx === 0 || ctx.state !== 'running') return;
      const key = 'taunt/' + name;
      if (!buffers.has(key)) await load(key, src);
      file(key, 1);
    },
    play(kind: SoundKind, volume = 1) {
      if (!ctx || !noise || volumes().sfx === 0 || ctx.state !== 'running') return;
      const v = Math.max(0.05, Math.min(1, volume));
      const names = FILES[kind];
      const played = !!names && names.map((n) => file(n, v * (kind === 'hitLight' ? 0.6 : 0.8), RATE[kind])).some(Boolean);
      // camada sintetizada por cima do arquivo: o baque grave do golpe forte
      if (kind === 'hitHeavy') tone('sine', 110, 36, 0.4, 0.5 * v);
      if (played) return;
      switch (kind) {
        case 'fireball': hiss('lowpass', 2400, 300, 0.45, 0.5 * v); tone('sawtooth', 160, 60, 0.3, 0.08 * v); break;
        case 'lightning': hiss('highpass', 3000, 800, 0.25, 0.7 * v); tone('square', 900, 120, 0.18, 0.08 * v); break;
        case 'homing': tone('sine', 300, 900, 0.4, 0.15 * v); hiss('bandpass', 1500, 2500, 0.4, 0.15 * v); break;
        case 'shield': tone('sine', 520, 780, 0.5, 0.18 * v); tone('sine', 780, 1170, 0.5, 0.08 * v); break;
        case 'teleport': tone('sine', 1400, 200, 0.3, 0.18 * v); hiss('bandpass', 4000, 600, 0.3, 0.2 * v); break;
        case 'hit': hiss('lowpass', 900, 120, 0.3, 0.9 * v); tone('sine', 120, 45, 0.25, 0.35 * v); break;
        case 'reflect': tone('triangle', 1200, 2400, 0.2, 0.2 * v); break;
        case 'death': hiss('lowpass', 1500, 100, 1.2, 0.6 * v); tone('sawtooth', 300, 50, 0.9, 0.1 * v); break;
        case 'shrink': tone('sawtooth', 80, 40, 1.2, 0.2 * v); hiss('lowpass', 400, 80, 1.2, 0.5 * v); break;
        case 'beep': tone('square', 660, 660, 0.12, 0.08 * v); break;
        case 'go': tone('square', 990, 990, 0.3, 0.1 * v); break;
        case 'click': tone('triangle', 900, 700, 0.05, 0.05 * v); break;
        // mouse em cima de um botão: tique mais curto e baixo que o clique
        case 'hover': tone('sine', 1500, 1300, 0.03, 0.02 * v); break;
        case 'hitLight': hiss('lowpass', 1400, 300, 0.18, 0.6 * v); tone('sine', 200, 90, 0.15, 0.2 * v); break;
        case 'hitHeavy': hiss('lowpass', 700, 80, 0.45, 1 * v); break;
        // mergulho na lava: chiado agudo longo e duas bolhas graves
        case 'splash': hiss('highpass', 5000, 1200, 0.9, 0.3 * v); hiss('lowpass', 600, 90, 0.6, 0.6 * v); tone('sine', 230, 70, 0.22, 0.25 * v, 0.08); tone('sine', 170, 55, 0.25, 0.2 * v, 0.32); break;
        // arpejo maior subindo (vitória) e menor descendo (derrota)
        case 'winRound': [523, 659, 784, 1047].forEach((f, i) => tone('triangle', f, f, 0.32, 0.14 * v, i * 0.09)); break;
        case 'loseRound': [392, 311, 262].forEach((f, i) => tone('triangle', f, f * 0.98, 0.35, 0.11 * v, i * 0.14)); break;
        // moedas: dois tilintares agudos
        case 'buy': tone('sine', 1320, 1320, 0.09, 0.12 * v); tone('sine', 1980, 1980, 0.16, 0.1 * v, 0.06); break;
        case 'error': tone('square', 170, 120, 0.18, 0.06 * v); tone('square', 150, 110, 0.18, 0.05 * v, 0.12); break;
        // recarga pronta: plim suave
        case 'ready': tone('sine', 880, 1320, 0.12, 0.05 * v); break;
      }
    },
    // na loja a música fica a 45%
    duck(on: boolean) {
      duck = on ? 0.45 : 1;
      syncAmbience();
    },
  };
  return api;
}

let tauntPreview: HTMLAudioElement | null = null;
export function stopTauntPreview() {
  tauntPreview?.pause();
  tauntPreview = null;
}
// Prévia só para quem escolhe a fala (Configurações): não envia nada à sala. Segue o volume de efeitos; mudo (0) toca no máximo, porque quem pede a prévia quer ouvir.
export async function previewTaunt(name: string): Promise<boolean> {
  const src = tauntAudioSrc(name);
  if (!src) return false;
  stopTauntPreview();
  const audio = new Audio(src);
  tauntPreview = audio;
  audio.volume = loadVolumes().sfx || 1;
  try {
    await audio.play();
    return true;
  } catch {
    return tauntPreview !== audio; // trocar de fala interrompe o play pendente; isso não é falha do arquivo
  }
}
