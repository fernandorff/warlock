import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDemo, type DemoId } from '../src/client/demo.ts';

afterEach(() => vi.unstubAllGlobals());
describe('desenho das prévias com estados reais', () => {
  it.each([
    ['brace', 'Manter base'], ['meteor', 'atordoado'], ['grip', 'preso'],
    ['shield', 'empurrão/status 60%'], ['illusion', 'cópia'], ['rush', 'avanço encerrado'],
    ['knockback', 'recuperação'], ['lightning', 'incapacitado'], ['drain', 'lentidão'],
    ['clash', 'queimando'], ['link', 'Elo'], ['magnetize', 'magnetizado'], ['heal', '+45'],
  ] as [DemoId, string][])('%s desenha sua explicação sem coordenadas inválidas', (id, label) => {
    const texts: string[] = [];
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    vi.stubGlobal('devicePixelRatio', 1);
    const ctx = new Proxy<Record<string, unknown>>({}, {
      get: (target, key: string) => target[key] ?? ((...args: unknown[]) => {
        for (const arg of args) if (typeof arg === 'number') expect(Number.isFinite(arg)).toBe(true);
        if (key === 'fillText') texts.push(String(args[0]));
      }),
      set: (target, key: string, value) => { target[key] = value; return true; },
    });
    const canvas = { width: 0, height: 0, clientWidth: 420, clientHeight: 260, getContext: () => ctx } as unknown as HTMLCanvasElement;
    const demo = createDemo(canvas, id, ['#f00', '#00f', '#0f0']);
    for (let i = 0; i < 350; i++) demo.tick(1000 + i * 1000 / 60);
    expect(texts.some((text) => text.includes(label))).toBe(true);
  });
});
