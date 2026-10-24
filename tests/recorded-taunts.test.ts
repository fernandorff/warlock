import { describe, expect, it } from 'vitest';
import { CUSTOM_TAUNTS, TAUNTS, TEXT_TAUNTS, tauntAudioSrc } from '../src/shared/taunts.ts';

describe('gravações de provocações disponíveis para todos', () => {
  it('preserva os dez índices originais e acrescenta as cinco gravações sem exigir compra', () => {
    expect(TAUNTS[0].id).toBe('loser');
    expect(TAUNTS[9].id).toBe('congrats');
    expect(TAUNTS.slice(10, 15).map((t) => t.id)).toEqual(CUSTOM_TAUNTS.map((t) => t.id));
    expect(TAUNTS).toHaveLength(23);
    for (const taunt of CUSTOM_TAUNTS) {
      expect(tauntAudioSrc(taunt.id)).toBe(taunt.src);
      expect(taunt.src).toMatch(/^\/taunts-local\/[a-z]+\.mp4$/);
    }
  });
  it('provocações só de texto vêm depois das gravações e não têm áudio', () => {
    expect(TAUNTS.slice(15).map((t) => t.id)).toEqual(TEXT_TAUNTS.map((t) => t.id));
    for (const taunt of TEXT_TAUNTS) expect(tauntAudioSrc(taunt.id)).toBeNull();
  });
  it('resolve só caminhos conhecidos do catálogo', () => {
    expect(tauntAudioSrc('laugh')).toBe('/sfx/taunt/laugh.mp3');
    expect(tauntAudioSrc('../../segredo')).toBeNull();
  });
});
