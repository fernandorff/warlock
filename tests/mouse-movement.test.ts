import { describe, expect, it, vi } from 'vitest';
import source from '../src/client/input.ts?raw';

describe('clique esquerdo não dá ordem de caminhada', () => {
  it.each([
    { button: 0, touch: false, armed: null, move: 0, cast: 0 },
    { button: 2, touch: false, armed: null, move: 1, cast: 0 },
    { button: 0, touch: false, armed: 'fireball', move: 0, cast: 1 },
    { button: 0, touch: true, armed: null, move: 1, cast: 0 },
  ])('roteamento: %j', (test) => {
    const branch = source.split("canvas.addEventListener('pointerdown', (e) => {")[1].split("\n  });")[0];
    const h = { pick: vi.fn(() => ({ x: 0, y: 0 })), move: vi.fn(), cast: vi.fn() };
    const dispatch = new Function('e', 'h', 'armed', `let cursor, panFrom, dragging, attackArmed = false; const space=false, enabled=true; let panning=false; const arm=()=>{}; ${branch}`);
    dispatch({ button: test.button, pointerType: test.touch ? 'touch' : 'mouse' }, h, test.armed);
    expect(h.move).toHaveBeenCalledTimes(test.move);
    expect(h.cast).toHaveBeenCalledTimes(test.cast);
  });
});
