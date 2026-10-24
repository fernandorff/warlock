// Sons: arquivos gravados com licenças e créditos individuais em public/CREDITS.txt e, enquanto não carregam ou se faltarem,
// sons sintetizados na hora (Web Audio). Música em loop. O navegador só libera áudio depois de um toque.
import { tauntAudioSrc } from '../shared/taunts.ts';
import { audioLevel, layerVolume } from './audio-level.ts';
import { store } from './store.ts';

export type SoundKind = 'fireball' | 'lightning' | 'homing' | 'shield' | 'teleport' | 'hit' | 'hitLight' | 'hitHeavy' | 'reflect' | 'death' | 'splash' | 'shrink' | 'beep' | 'go' | 'click'
  | 'winRound' | 'loseRound' | 'buy' | 'error' | 'ready' | 'hover' | 'brace' | 'heal';

const FILES: Partial<Record<SoundKind, string[]>> = {
  brace: ['brace_whoosh_trial'],
  fireball: ['fireball'], lightning: ['lightning'], homing: ['homing'], shield: ['shield'], teleport: ['teleport'],
  hit: ['hit', 'explode'], hitLight: ['hit'], hitHeavy: ['hit', 'explode'], reflect: ['shield'], death: ['explode'], go: ['confirm'],
};
// golpe fraco mais agudo, golpe forte mais grave
const RATE: Partial<Record<SoundKind, number>> = { hitLight: 1.25, hitHeavy: 0.78 };

// volumes de 0 a 1, separados para efeitos e música, guardados no navegador: os mesmos no menu inicial e na sala (issue #128).
// Quem tinha deixado mudo na versão antiga começa em zero
export type Volumes = { master: number; sfx: number; music: number; taunts: number };
export type VolumeKind = keyof Volumes;
const VOL_KEY = { master: 'warlock:vol-master', sfx: 'warlock:vol-sfx', music: 'warlock:vol-music', taunts: 'warlock:vol-taunts' } as const;
export const channelVolume = (v: Volumes, kind: 'sfx' | 'music' | 'taunts') => v.master * v[kind];
export const isAudioMuted = (v: Volumes) => v.master === 0 || v.sfx + v.music + v.taunts === 0;
export function loadVolumes(musicDefault = 0.7): Volumes {
  const readVol = (k: string, fallback: number) => {
    const n = Number(store.get(k));
    return Number.isFinite(n) && store.get(k) !== null ? Math.max(0, Math.min(1, n)) : fallback;
  };
  const oldMute = store.get('warlock:mute') === '1';
  const sfx = readVol(VOL_KEY.sfx, oldMute ? 0 : 1);
  if (store.get(VOL_KEY.taunts) === null) store.set(VOL_KEY.taunts, String(sfx));
  // Geral neutro e provocações herdando Efeitos preservam a mistura anterior na migração.
  return { master: readVol(VOL_KEY.master, 1), sfx, music: readVol(VOL_KEY.music, oldMute || store.get('warlock:music') === '0' ? 0 : musicDefault), taunts: readVol(VOL_KEY.taunts, sfx) };
}
export const saveVolume = (kind: keyof Volumes, value: number) => store.set(VOL_KEY[kind], String(value));

// musicDefault: volume da música de quem nunca mexeu nele (nas abas de teste em localhost, 0; main.ts)
export function createSound(musicDefault?: number) {
  const vol = loadVolumes(musicDefault);
  const volumes = () => vol;
  let ctx: AudioContext | null = null;
  let noise: AudioBuffer | null = null;
  let master: GainNode | null = null;
  let tauntMaster: GainNode | null = null;
  const buffers = new Map<string, AudioBuffer>();
  const gains = new Map<string, number>();
  let musicLevelStarted = false;
  const music = new Audio('/music/battle.mp3');
  music.loop = true;
  music.preload = 'none'; // só baixa quando a partida toca (o lobby também cria o som, para o hover e o clique)
  let wantAmbience = false;
  let duck = 1; // na loja a música abaixa um pouco

  async function load(name: string, src = `/sfx/${name}.mp3`) {
    try {
      const res = await fetch(src);
      if (res.ok) {
        const buffer = await ctx!.decodeAudioData(await res.arrayBuffer());
        buffers.set(name, buffer);
        gains.set(name, audioLevel(buffer).gain);
      }
    } catch {
      // Demais efeitos têm síntese de reserva; Manter base usa somente a gravação escolhida.
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
      master.gain.value = 0.6 * channelVolume(volumes(), 'sfx');
      tauntMaster = ctx.createGain();
      tauntMaster.gain.value = 0.6 * channelVolume(volumes(), 'taunts');
      const comp = ctx.createDynamicsCompressor();
      master.connect(comp).connect(ctx.destination);
      tauntMaster.connect(comp);
      noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const data = noise.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      // Pré-renderiza a síntese fora do caminho de reprodução para medi-la pelo mesmo critério dos arquivos.
      if (typeof OfflineAudioContext !== 'undefined') {
        const kinds: SoundKind[] = ['fireball', 'lightning', 'homing', 'shield', 'teleport', 'hit', 'hitLight', 'hitHeavy', 'reflect', 'death', 'splash', 'shrink', 'beep', 'go', 'click', 'winRound', 'loseRound', 'buy', 'error', 'ready', 'hover', 'heal'];
        for (const kind of kinds) {
          const offline = new OfflineAudioContext(1, ctx.sampleRate * 2, ctx.sampleRate);
          synth(kind, 1, offline, offline.destination);
          void offline.startRendering().then((buffer) => {
            buffers.set('synth/' + kind, buffer);
            // Síntese própria não contém ruído de gravação; pode subir mais, ainda limitada pelo pico.
            gains.set('synth/' + kind, audioLevel(buffer, Infinity).gain);
          }).catch(() => {}); // a síntese imediata continua disponível enquanto prepara.
        }
      }
      const names = new Set(Object.values(FILES).flat());
      void Promise.all([...names].map((name) => load(name))).then(syncAmbience);
    }
    if (ctx.state === 'suspended') void ctx.resume();
    syncAmbience();
  }
  addEventListener('pointerdown', unlock);
  addEventListener('keydown', unlock);

  // Música toca só dentro da partida e com som ligado; sem crepitar ambiente contínuo.
  function syncAmbience() {
    const vol = volumes();
    if (master) master.gain.value = 0.6 * channelVolume(vol, 'sfx');
    if (tauntMaster) tauntMaster.gain.value = 0.6 * channelVolume(vol, 'taunts');
    music.volume = Math.min(1, 0.35 * channelVolume(vol, 'music') * duck);
    const on = wantAmbience && !!ctx && ctx.state === 'running';
    if (on && channelVolume(vol, 'music') > 0 && !musicLevelStarted && typeof ctx!.createMediaElementSource === 'function') {
      musicLevelStarted = true;
      const gain = ctx!.createGain();
      gain.gain.value = 1;
      ctx!.createMediaElementSource(music).connect(gain).connect(ctx!.createDynamicsCompressor()).connect(ctx!.destination);
      // Só mede a faixa quando a música é solicitada; não baixa música ao abrir o menu.
      void load('music', '/music/battle.mp3').then(() => { gain.gain.value = gains.get('music') ?? 1; });
    }
    if (on && channelVolume(vol, 'music') > 0) void music.play().catch(() => {});
    else music.pause();
  }

  function file(name: string, volume: number, rate = 1) {
    const buf = buffers.get(name);
    if (!buf) return false;
    const src = ctx!.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = name === 'brace_whoosh_trial' || name.startsWith('synth/') ? 1 : rate * (0.94 + Math.random() * 0.12); // não altera o timbre da gravação escolhida.
    const g = ctx!.createGain();
    g.gain.value = volume * (gains.get(name) ?? 1);
    src.connect(g).connect(name.startsWith('taunt/') ? tauntMaster! : master!);
    src.start();
    return true;
  }

  // ruído filtrado: chiado de fogo, estalo de raio, borbulha de lava
  function hiss(type: BiquadFilterType, f0: number, f1: number, dur: number, gain: number, at = 0, c: BaseAudioContext = ctx!, output: AudioNode = master!) {
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
    src.connect(filter).connect(g).connect(output);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
  }

  function tone(type: OscillatorType, f0: number, f1: number, dur: number, gain: number, at = 0, c: BaseAudioContext = ctx!, output: AudioNode = master!) {
    const t = c.currentTime + at;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(output);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  function synth(kind: SoundKind, v: number, c: BaseAudioContext = ctx!, output: AudioNode = master!) {
    const toneAt = tone, hissAt = hiss;
    const playTone = (type: OscillatorType, f0: number, f1: number, dur: number, gain: number, at = 0) => toneAt(type, f0, f1, dur, gain, at, c, output);
    const playHiss = (type: BiquadFilterType, f0: number, f1: number, dur: number, gain: number, at = 0) => hissAt(type, f0, f1, dur, gain, at, c, output);
      switch (kind) {
        // Harmônicos arredondados, ataque suave e vibrato imitam um coral em “ooooh”, sem gravação externa.
        case 'heal':
          [261.63, 329.63, 392].forEach((note, voice) => {
            [1, 2, 3, 7].forEach((harmonic, i) => {
              const at = c.currentTime + voice * .03;
              const o = c.createOscillator(), vibrato = c.createOscillator();
              const depth = c.createGain(), envelope = c.createGain();
              o.type = vibrato.type = 'sine';
              o.frequency.setValueAtTime(note * harmonic, at);
              vibrato.frequency.setValueAtTime(5.2 + voice * .17, at);
              depth.gain.value = harmonic * 1.2;
              vibrato.connect(depth).connect(o.frequency);
              const gain = [.065, .022, .008, .0015][i] * v;
              envelope.gain.setValueAtTime(.0001, at);
              envelope.gain.exponentialRampToValueAtTime(Math.max(.0001, gain), at + .18);
              envelope.gain.exponentialRampToValueAtTime(Math.max(.0001, gain * .85), at + .65);
              envelope.gain.exponentialRampToValueAtTime(.0001, at + 1.6);
              o.connect(envelope).connect(output);
              o.start(at); vibrato.start(at);
              o.stop(at + 1.65); vibrato.stop(at + 1.65);
            });
          });
          break;
        case 'brace': break; // não voltar à síntese recusada se a gravação ainda não carregou.
        case 'fireball': playHiss('lowpass', 2400, 300, 0.45, 0.5 * v); playTone('sawtooth', 160, 60, 0.3, 0.08 * v); break;
        case 'lightning': playHiss('highpass', 3000, 800, 0.25, 0.7 * v); playTone('square', 900, 120, 0.18, 0.08 * v); break;
        case 'homing': playTone('sine', 300, 900, 0.4, 0.15 * v); playHiss('bandpass', 1500, 2500, 0.4, 0.15 * v); break;
        case 'shield': playTone('sine', 520, 780, 0.5, 0.18 * v); playTone('sine', 780, 1170, 0.5, 0.08 * v); break;
        case 'teleport': playTone('sine', 1400, 200, 0.3, 0.18 * v); playHiss('bandpass', 4000, 600, 0.3, 0.2 * v); break;
        case 'hit': playHiss('lowpass', 900, 120, 0.3, 0.9 * v); playTone('sine', 120, 45, 0.25, 0.35 * v); break;
        case 'reflect': playTone('triangle', 1200, 2400, 0.2, 0.2 * v); break;
        case 'death': playHiss('lowpass', 1500, 100, 1.2, 0.6 * v); playTone('sawtooth', 300, 50, 0.9, 0.1 * v); break;
        case 'shrink': playTone('sawtooth', 80, 40, 1.2, 0.2 * v); playHiss('lowpass', 400, 80, 1.2, 0.5 * v); break;
        case 'beep': playTone('square', 660, 660, 0.12, 0.08 * v); break;
        case 'go': playTone('square', 990, 990, 0.3, 0.1 * v); break;
        // Tambor curto gerado aqui, sem gravação externa; queda de afinação imita a pele e evita clique agudo.
        case 'click': playTone('sine', 180, 70, .14, .18 * v); playTone('sine', 360, 140, .035, .035 * v); break;
        // Mouse sobre botão: timbre curto; a medição mantém o nível próximo dos outros avisos.
        case 'hover': playTone('sine', 1500, 1300, 0.03, 0.02 * v); break;
        case 'hitLight': playHiss('lowpass', 1400, 300, 0.18, 0.6 * v); playTone('sine', 200, 90, 0.15, 0.2 * v); break;
        case 'hitHeavy': playHiss('lowpass', 700, 80, 0.45, 1 * v); break;
        // mergulho na lava: chiado agudo longo e duas bolhas graves
        case 'splash': playHiss('highpass', 5000, 1200, 0.9, 0.3 * v); playHiss('lowpass', 600, 90, 0.6, 0.6 * v); playTone('sine', 230, 70, 0.22, 0.25 * v, 0.08); playTone('sine', 170, 55, 0.25, 0.2 * v, 0.32); break;
        // arpejo maior subindo (vitória) e menor descendo (derrota)
        case 'winRound': [523, 659, 784, 1047].forEach((f, i) => playTone('triangle', f, f, 0.32, 0.14 * v, i * 0.09)); break;
        case 'loseRound': [392, 311, 262].forEach((f, i) => playTone('triangle', f, f * 0.98, 0.35, 0.11 * v, i * 0.14)); break;
        // moedas: dois tilintares agudos
        case 'buy': playTone('sine', 1320, 1320, 0.09, 0.12 * v); playTone('sine', 1980, 1980, 0.16, 0.1 * v, 0.06); break;
        case 'error': playTone('square', 170, 120, 0.18, 0.06 * v); playTone('square', 150, 110, 0.18, 0.05 * v, 0.12); break;
        // recarga pronta: plim suave
        case 'ready': playTone('sine', 880, 1320, 0.12, 0.05 * v); break;
      }
  }

  const api = {
    volumes,
    // Configurações (menu e sala): guarda, aplica na hora e toca o clique no volume novo dos efeitos
    setVolume(kind: keyof Volumes, value: number) {
      vol[kind] = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
      saveVolume(kind, vol[kind]);
      syncAmbience();
      if (tauntPreview) tauntPreview.volume = channelVolume(vol, 'taunts') * (previewUsesWebAudio ? 1 : .6);
      if (kind === 'sfx' || kind === 'master') api.play('click');
    },
    setAmbience(on: boolean) {
      wantAmbience = on;
      syncAmbience();
    },
    // taunt: caminho do catálogo (public/sfx/taunt/<nome>.mp3 ou a gravação em public/taunts-local), carregado na primeira vez que alguém usa
    async taunt(name: string, level: number | (() => number) = 1) {
      const levelNow = () => Math.max(0, Math.min(1, typeof level === 'function' ? level() : level));
      const src = tauntAudioSrc(name);
      if (!src) return;
      if (!ctx || channelVolume(volumes(), 'taunts') === 0 || levelNow() === 0 || ctx.state !== 'running') return;
      const key = 'taunt/' + name;
      if (!buffers.has(key)) await load(key, src);
      if (channelVolume(volumes(), 'taunts') > 0 && levelNow() > 0) file(key, levelNow());
    },
    play(kind: SoundKind, volume = 1) {
      if (!ctx || !noise || channelVolume(volumes(), 'sfx') === 0 || ctx.state !== 'running') return;
      const v = Math.max(0, Math.min(1, volume));
      if (!v) return;
      const names = FILES[kind];
      const loaded = names?.filter((name) => buffers.has(name)) ?? [];
      const each = layerVolume(v, loaded.length + (kind === 'hitHeavy' ? 1 : 0));
      const played = loaded.map((n) => file(n, each, RATE[kind])).some(Boolean);
      // camada sintetizada por cima do arquivo: o baque grave do golpe forte
      if (kind === 'hitHeavy' && played) tone('sine', 110, 36, 0.4, 0.5 * each);
      if (played) return;
      if (!file('synth/' + kind, v)) synth(kind, v);
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
let previewUsesWebAudio = false;
let previewCleanup: (() => void) | null = null;
export function stopTauntPreview() {
  tauntPreview?.pause();
  tauntPreview = null;
  previewUsesWebAudio = false;
  previewCleanup?.();
  previewCleanup = null;
}
// Prévia privada: respeita Geral × Provocações, inclusive mudo; nunca envia à sala.
export async function previewTaunt(name: string): Promise<boolean> {
  const src = tauntAudioSrc(name);
  if (!src) return false;
  stopTauntPreview();
  const audio = new Audio(src);
  tauntPreview = audio;
  audio.volume = channelVolume(loadVolumes(), 'taunts');
  try {
    if (typeof AudioContext !== 'undefined') {
      const c = new AudioContext();
      previewCleanup = () => { void c.close().catch(() => {}); };
      // Libera no gesto do clique, antes de aguardar download/decodificação.
      if (c.state === 'suspended') void c.resume();
      const response = await fetch(src);
      if (!response.ok) throw new Error('audio');
      const buffer = await c.decodeAudioData(await response.arrayBuffer());
      if (tauntPreview !== audio) return true;
      const source = c.createMediaElementSource(audio), gain = c.createGain();
      gain.gain.value = .6 * audioLevel(buffer).gain; // mesmo nível/volume geral da fala na partida.
      source.connect(gain).connect(c.createDynamicsCompressor()).connect(c.destination);
      previewUsesWebAudio = true;
      audio.volume = channelVolume(loadVolumes(), 'taunts');
    } else audio.volume *= .6;
    await audio.play();
    return true;
  } catch {
    const replaced = tauntPreview !== audio;
    if (!replaced) stopTauntPreview();
    return replaced; // trocar de fala interrompe o play pendente; isso não é falha do arquivo
  }
}
