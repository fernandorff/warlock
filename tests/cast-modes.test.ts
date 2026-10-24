import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { InputHandlers } from '../src/client/input.ts';
import { setCastMode, setSlotMode } from '../src/client/keys.ts';
import type { Vec } from '../src/shared/vec.ts';

// janela e canvas de mentira: só guardam os ouvintes para disparar eventos à mão (os testes rodam sem navegador)
type Fn = (e: Record<string, unknown>) => void;
const win = new Map<string, Fn[]>();
const cnv = new Map<string, Fn[]>();
const on = (m: Map<string, Fn[]>) => (t: string, f: Fn) => m.set(t, [...(m.get(t) ?? []), f]);
const fire = (m: Map<string, Fn[]>, t: string, e: Record<string, unknown>) => m.get(t)?.forEach((f) => f({ preventDefault() {}, target: { tagName: 'CANVAS' }, ...e }));
const key = (t: 'keydown' | 'keyup', code: string) => fire(win, t, { code, repeat: false });
const click = (button: number, x = 10, y = 20) => fire(cnv, 'pointerdown', { button, clientX: x, clientY: y, pointerType: 'mouse' });

let log: string[] = [];
let ok = true; // false: a magia não sai (recarga ou sem a magia)
let preview: string | null = null;
let previewAt: Vec | undefined;
let armed: string | null = null;
let input: { setEnabled: (on: boolean) => void };

beforeAll(async () => {
  Object.assign(globalThis, { addEventListener: on(win), innerWidth: 800, innerHeight: 600 });
  const { createInput } = await import('../src/client/input.ts');
  const h: InputHandlers = {
    pick: (x, y): Vec => ({ x, y }),
    move: (to) => log.push(`move ${to.x},${to.y}`),
    stop: () => log.push('stop'),
    basic: (at) => log.push(`basic ${at.x},${at.y}`),
    cast: (s, at) => (log.push(`cast ${s} ${at.x},${at.y}`), ok),
    center: () => {},
    zoom: () => {},
    pan: () => {},
    armedChanged: (a) => (armed = a),
    preview: (a, at) => ((preview = a), (previewAt = at)),
    padRange: () => {},
    me: () => null,
    aim: () => {},
  };
  input = createInput({ addEventListener: on(cnv) } as unknown as HTMLCanvasElement, h);
  input.setEnabled(true);
  setSlotMode(false); // Q = Bola de fogo
});
beforeEach(() => {
  log = [];
  key('keydown', 'Escape');
  preview = armed = null;
  fire(cnv, 'pointermove', { clientX: 300, clientY: 200 });
});

describe('jeitos de lançar no PC', () => {
  it('A arma Atacar; clique esquerdo envia uma ordem manual', () => {
    key('keydown', 'KeyA');
    expect(log).toEqual([]);
    click(0, 30, 40);
    expect(log).toEqual(['basic 30,40']);
  });
  it.each(['Escape', 'KeyS', 'KeyQ'])('%s cancela Atacar escolhido', (code) => {
    key('keydown', 'KeyA'); key('keydown', code); click(0);
    expect(log.some((s) => s.startsWith('basic'))).toBe(false);
  });
  it.each(['blur', 'pointercancel'])('não envia movimento fantasma após %s interromper o botão direito', (event) => {
    vi.spyOn(performance, 'now').mockReturnValue(1000000 + performance.now());
    click(2);
    log = [];
    fire(win, event, {});
    fire(cnv, 'pointermove', { clientX: 400, clientY: 300, buttons: 2 });
    expect(log).toEqual([]);
    fire(win, 'pointerup', { button: 2 });
    vi.restoreAllMocks();
  });

  it('sem pointerup, mouse com botão solto não renova o destino de caminhada', () => {
    vi.spyOn(performance, 'now').mockReturnValue(2000000 + performance.now());
    click(2);
    log = [];
    fire(cnv, 'pointermove', { clientX: 400, clientY: 300, buttons: 0 });
    expect(log).toEqual([]);
    fire(win, 'pointerup', { button: 2 });
    vi.restoreAllMocks();
  });

  it('segurar de verdade o botão direito continua arrastando o destino', () => {
    vi.spyOn(performance, 'now').mockReturnValue(3000000 + performance.now());
    click(2);
    log = [];
    fire(cnv, 'pointermove', { clientX: 400, clientY: 300, buttons: 2 });
    expect(log).toEqual(['move 400,300']);
    fire(win, 'pointerup', { button: 2 });
    vi.restoreAllMocks();
  });
  it('Esc só é consumido (preventDefault) com magia escolhida ou segurada; sobrando, ele segue para abrir as configurações', () => {
    let used = 0;
    const esc = () => fire(win, 'keydown', { code: 'Escape', repeat: false, preventDefault: () => used++ });
    setCastMode('click');
    esc();
    expect(used).toBe(0);
    key('keydown', 'KeyQ');
    expect(armed).toBe('fireball');
    esc();
    expect([used, armed]).toEqual([1, null]);
    setCastMode('release');
    key('keydown', 'KeyQ');
    esc();
    expect([used, preview]).toEqual([2, null]);
    esc();
    expect(used).toBe(2);
    setCastMode('quick');
  });

  it('Rápido (padrão): a tecla lança na hora no cursor e o anel de alcance pisca por um instante (issue #61)', () => {
    vi.useFakeTimers();
    setCastMode('quick');
    key('keydown', 'KeyQ');
    expect(log).toEqual(['cast fireball 300,200']);
    expect(preview).toBe('fireball');
    expect(previewAt).toEqual({ x: 300, y: 200 }); // a faixa pisca presa no ponto do lançamento
    fire(cnv, 'pointermove', { clientX: 500, clientY: 100 });
    expect(previewAt).toEqual({ x: 300, y: 200 }); // e não segue o mouse
    key('keyup', 'KeyQ');
    expect(log).toHaveLength(1);
    vi.advanceTimersByTime(400);
    expect(preview).toBeNull();
    ok = false; // não saiu: sem anel
    key('keydown', 'KeyQ');
    expect(preview).toBeNull();
    ok = true;
    vi.useRealTimers();
  });

  it('Ao soltar: segurar mostra o alcance, soltar lança onde o cursor está; Esc cancela', () => {
    setCastMode('release');
    key('keydown', 'KeyQ');
    expect(preview).toBe('fireball');
    expect(log).toEqual([]);
    fire(cnv, 'pointermove', { clientX: 500, clientY: 100 });
    key('keyup', 'KeyQ');
    expect(log).toEqual(['cast fireball 500,100']);
    expect(preview).toBeNull();
    key('keydown', 'KeyQ');
    key('keydown', 'Escape');
    key('keyup', 'KeyQ');
    expect(log).toHaveLength(1);
  });

  it('Com clique: a tecla escolhe e mostra o alcance, o clique esquerdo lança; botão direito ou Esc cancelam', () => {
    setCastMode('click');
    key('keydown', 'KeyQ');
    expect(armed).toBe('fireball'); // a magia escolhida mostra o círculo
    expect(log).toEqual([]);
    key('keyup', 'KeyQ');
    expect(log).toEqual([]); // soltar não lança
    click(0, 40, 50);
    expect(log).toEqual(['cast fireball 40,50']);
    expect(armed).toBeNull();
    key('keydown', 'KeyQ');
    click(2, 70, 80); // direito: cancela e anda
    expect(armed).toBeNull();
    expect(log).toEqual(['cast fireball 40,50', 'move 70,80']);
    key('keydown', 'KeyQ');
    key('keydown', 'Escape');
    expect(armed).toBeNull();
    click(0, 1, 2); // sem magia escolhida, o clique esquerdo não envia comando.
    expect(log).toEqual(['cast fireball 40,50', 'move 70,80']);
  });
});
