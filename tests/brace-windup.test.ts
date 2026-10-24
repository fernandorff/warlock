import { describe, expect, it } from 'vitest';
import { BRACING_BIT, INCAPACITATED_BIT } from '../src/shared/constants.ts';
import { stepWorld, bracingActive } from '../src/shared/sim.ts';
import { encodeSnap } from '../src/shared/snapshot.ts';
import { noSpells } from '../src/shared/spells.ts';
import { world } from './helpers.ts';

describe('Manter base prepara por meio segundo', () => {
  it('não ativa pose/pausa antes de0,5s; renovações não reiniciam o preparo e soltar desativa', () => {
    const w = world([[0, 0]], noSpells(), [], () => .5), z = w.wizards[0]; w.pillars = []; z.cd.fireball = 5;
    for (let i = 0; i < 29; i++) stepWorld(w, [{ id: z.id, kind: 'brace', on: true }], () => .5);
    expect(bracingActive(w, z)).toBe(false);
    expect(encodeSnap(w, z.id, 0, []).w[6] & (BRACING_BIT | INCAPACITATED_BIT)).toBe(0);
    stepWorld(w, [{ id: z.id, kind: 'brace', on: true }], () => .5);
    expect(bracingActive(w, z)).toBe(true);
    expect(encodeSnap(w, z.id, 0, []).w[6] & BRACING_BIT).toBeTruthy();
    const left = z.cd.fireball - w.t;
    stepWorld(w, [{ id: z.id, kind: 'brace', on: true }], () => .5);
    expect(z.cd.fireball - w.t).toBeCloseTo(left);
    stepWorld(w, [{ id: z.id, kind: 'brace', on: false }], () => .5);
    expect(bracingActive(w, z)).toBe(false);
    expect(encodeSnap(w, z.id, 0, []).w[6] & (BRACING_BIT | INCAPACITATED_BIT)).toBe(0);
  });
  it('soltar antes do prazo cancela; apertar de novo exige outro preparo completo', () => {
    const w = world([[0, 0]], noSpells(), [], () => .5), z = w.wizards[0]; w.pillars = [];
    for (let i = 0; i < 20; i++) stepWorld(w, [{ id: z.id, kind: 'brace', on: true }], () => .5);
    stepWorld(w, [{ id: z.id, kind: 'brace', on: false }], () => .5);
    for (let i = 0; i < 29; i++) stepWorld(w, [{ id: z.id, kind: 'brace', on: true }], () => .5);
    expect(bracingActive(w, z)).toBe(false);
    stepWorld(w, [{ id: z.id, kind: 'brace', on: true }], () => .5);
    expect(bracingActive(w, z)).toBe(true);
  });
});
