import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSound } from '../src/client/sound.ts';

afterEach(() => vi.unstubAllGlobals());

describe('ambiente sem crepitar contínuo da lava', () => {
  it('não carrega nem inicia o loop de fogo, preservando música e efeitos pontuais', async () => {
    const listeners = new Map<string, () => void>();
    const sources: { loop: boolean; start: ReturnType<typeof vi.fn> }[] = [];
    const music = { loop: false, preload: '', volume: 0, play: vi.fn(async () => {}), pause: vi.fn() };
    vi.stubGlobal('Audio', function () { return music; });
    vi.stubGlobal('addEventListener', (name: string, fn: () => void) => listeners.set(name, fn));
    const fetch = vi.fn(async (_src: string) => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(0) }));
    vi.stubGlobal('fetch', fetch);
    const connect = () => ({ connect: vi.fn() });
    vi.stubGlobal('AudioContext', class {
      state = 'running'; sampleRate = 4; destination = {}; currentTime = 0;
      createGain() { return { gain: { value: 0 }, connect }; }
      createDynamicsCompressor() { return { connect }; }
      createBuffer() { return { getChannelData: () => new Float32Array(4) }; }
      async decodeAudioData() { return {}; }
      createBufferSource() {
        const source = { loop: false, buffer: null, playbackRate: { value: 1 }, connect, start: vi.fn(), stop: vi.fn() };
        sources.push(source); return source;
      }
    });
    const sound = createSound(1);
    sound.setVolume('sfx', 1); sound.setVolume('music', 1);
    listeners.get('pointerdown')!();
    // Aguarda também a decodificação dos arquivos, não apenas o início do download.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(fetch).toHaveBeenCalled();
    sound.setAmbience(true);
    expect(fetch.mock.calls.flat().some((path) => String(path).includes('lava_loop'))).toBe(false);
    expect(sources.some((source) => source.loop)).toBe(false);
    expect(music.play).toHaveBeenCalled();
    sound.play('fireball');
    expect(sources.some((source) => source.start.mock.calls.length > 0 && !source.loop)).toBe(true);
    sound.setAmbience(false);
    expect(music.pause).toHaveBeenCalled();
  });
});
