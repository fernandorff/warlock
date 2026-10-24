import { describe, expect, it } from 'vitest';
import { BRACING_BIT, DT } from '../src/shared/constants.ts';
import { createPredict } from '../src/client/predict.ts';
import { encodeSnap, decodeSnap } from '../src/shared/snapshot.ts';
import { stepWorld } from '../src/shared/sim.ts';
import { noSpells } from '../src/shared/spells.ts';
import { v } from '../src/shared/vec.ts';
import { run, world } from './helpers.ts';

const setup = () => {
  const w = world([[0, 0], [4, 0]], noSpells(), [], () => .5);
  w.pillars = []; w.runes = []; const z = w.wizards[0];
  z.braceReadyAt = 0; z.braceUntil = 5;
  return { w, z };
};
describe('Manter base bloqueia caminhada enquanto ativo', () => {
  it('ignora clique e direito mantido, sem caminhar depois de soltar S', () => {
    const { w, z } = setup();
    z.target = v(3, 0); z.moveHeld = true;
    run(w, .1, [{ id: z.id, kind: 'move', to: v(4, 0), held: true }]);
    expect(z.pos).toEqual(v(0, 0)); expect(z.target).toBeNull(); expect(z.moveHeld).toBe(false);
    run(w, .2, [{ id: z.id, kind: 'brace', on: false }]);
    expect(z.pos).toEqual(v(0, 0));
    run(w, .2, [{ id: z.id, kind: 'move', to: v(4, 0) }]);
    expect(z.pos.x).toBeGreaterThan(0);
  });
  it('não remove impulso externo, nem bloqueia uma magia pronta', () => {
    const { w, z } = setup(); z.vel = v(.8, 0); z.spells.shield = 1;
    run(w, .15, [{ id: z.id, kind: 'cast', spell: 'shield', at: v(0, 0) }]);
    expect(z.pos.x).toBeGreaterThan(0); expect(z.shieldUntil).toBeGreaterThan(w.t);
  });
  it('previsão também descarta movimento, sem reativá-lo ao sair da postura', () => {
    const { w } = setup(); const p = createPredict();
    const s = decodeSnap(encodeSnap(w, 'p0', 0, []), ['p0', 'p1']).wizards[0];
    expect(s.status & BRACING_BIT).not.toBe(0);
    p.frame(s, 0); p.move(v(3, 0)); expect(p.frame(s, DT)).toEqual(v(0, 0));
    expect(p.frame({ ...s, status: 1 }, DT)).toEqual(v(0, 0));
  });
});
