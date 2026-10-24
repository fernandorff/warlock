import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });
describe('atalho novo sem tomar teclas personalizadas', () => {
  it.each(['fresh', 'legacy', 'position', 'ui'])('preserva preferências: %s', async (mode) => {
    vi.resetModules();
    const data: Record<string, string> = mode === 'legacy' ? { 'warlock:keys': JSON.stringify({ bouncer: 'KeyA' }), 'warlock:slotkeys': '0' }
      : mode === 'position' ? { 'warlock:slotkeys': '1', 'warlock:poskeys8': JSON.stringify({ slot1: 'KeyA' }) }
      : mode === 'ui' ? { 'warlock:keys': JSON.stringify({ shop: 'KeyA' }), 'warlock:slotkeys': '1' } : {};
    vi.stubGlobal('localStorage', { getItem: (k: string) => data[k] ?? null, setItem: (k: string, value: string) => { data[k] = value; } });
    const keys = await import('../src/client/keys.ts');
    expect(keys.keyOf('basic')).toBe(mode === 'fresh' ? 'KeyA' : '');
    if (mode === 'legacy') expect(keys.actionFor('KeyA')).toBe('bouncer');
    if (mode === 'position') expect(keys.keyOf('slot1')).toBe('KeyA');
    if (mode === 'ui') expect(keys.keyOf('shop')).toBe('KeyA');
  });
});
