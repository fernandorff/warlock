import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSound } from '../src/client/sound.ts';

afterEach(() => vi.unstubAllGlobals());
describe('clique de menu com tambor sintetizado', () => {
  it.each(['click', 'brace', 'heal'] as const)('som original %s sintetizado, respeitando volume e mudo', async (kind) => {
    const listeners = new Map<string, () => void>();
    const oscillators: { type: string; frequency: { setValueAtTime: ReturnType<typeof vi.fn> }; stop: ReturnType<typeof vi.fn> }[] = [];
    const sources: { start: ReturnType<typeof vi.fn>; playbackRate: { value: number } }[] = [];
    const connect = () => ({ connect });
    const param = () => ({ value: 0, setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() });
    vi.stubGlobal('Audio', function () { return { pause() {}, play: async () => {} }; });
    vi.stubGlobal('addEventListener', (name: string, fn: () => void) => listeners.set(name, fn));
    const fetch = vi.fn(async (_src: string) => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(0) }));
    vi.stubGlobal('fetch', fetch);
    vi.stubGlobal('AudioContext', class {
      state = 'running'; sampleRate = 4; currentTime = 0; destination = {};
      createGain() { return { gain: param(), connect }; }
      createDynamicsCompressor() { return { connect }; }
      createBuffer() { return { getChannelData: () => new Float32Array(4) }; }
      createBufferSource() { const s = { buffer: null, connect, start: vi.fn(), stop: vi.fn(), playbackRate: { value: 1 } }; sources.push(s); return s; }
      createBiquadFilter() { return { type: '', frequency: param(), connect }; }
      async decodeAudioData() { const data = new Float32Array(9000); data[2000] = 1; return { duration: 9, sampleRate: 1000, getChannelData: () => data }; }
      createOscillator() {
        const o = { type: '', frequency: param(), connect, start: vi.fn(), stop: vi.fn() };
        oscillators.push(o); return o;
      }
    });
    const sound = createSound(0);
    sound.setVolume('sfx', 1);
    listeners.get('pointerdown')!();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(fetch.mock.calls.some(([src]) => src === '/sfx/click.mp3')).toBe(false);
    sound.play(kind);
    if (kind === 'click') {
      expect(oscillators).toHaveLength(2);
      expect(oscillators.map((o) => o.type)).toEqual(['sine', 'sine']);
      expect(oscillators[0].frequency.setValueAtTime).toHaveBeenCalledWith(180, 0);
      expect(oscillators.every((o) => o.stop.mock.calls[0][0] <= .2)).toBe(true);
    } else if (kind === 'heal') {
      expect(fetch.mock.calls.some(([src]) => src === '/sfx/heal.mp3')).toBe(false);
      expect(oscillators).toHaveLength(24); // três vozes, quatro harmônicos e um vibrato por harmônico.
      expect(oscillators.every(o => o.type === 'sine')).toBe(true);
      expect(oscillators[0].frequency.setValueAtTime).toHaveBeenCalledWith(261.63, 0);
      expect(oscillators.every(o => o.stop.mock.calls[0][0] <= 1.71)).toBe(true);
    } else {
      expect(fetch.mock.calls.some(([src]) => src === '/sfx/brace_whoosh_trial.mp3')).toBe(true);
      expect(fetch.mock.calls.some(([src]) => src === '/sfx/sonic_boom.mp3')).toBe(false);
      expect(oscillators).toHaveLength(0); // aviso usa gravação real, não a síntese recusada.
      expect(sources).toHaveLength(1);
      expect(sources[0].playbackRate.value).toBe(1);
      expect(sources[0].start).toHaveBeenCalledWith(); // arquivo escolhido inteiro, sem recorte do estrondo anterior.
    }
    const count = oscillators.length + sources.length;
    sound.setVolume('sfx', 0);
    sound.play(kind);
    expect(oscillators.length + sources.length).toBe(count);
  });
});
