import { describe, expect, it } from 'vitest';
import { stepWorld } from '../src/shared/sim.ts';
import { SPELL_IDS, castBlocked, noSpells, spellGroup } from '../src/shared/spells.ts';
import { v } from '../src/shared/vec.ts';
import { world } from './helpers.ts';

describe('stun e agarramento: bloqueios autoritativos', () => {
  it.each(SPELL_IDS)('stun impede %s sem gastar recarga', (spell) => {
    const w = world([[0, 0]], { ...noSpells(), [spell]: 1 }, [], () => .5);
    const z = w.wizards[0]; z.stunLeft = 1;
    stepWorld(w, [{ id: z.id, kind: 'cast', spell, at: v(3, 0) }, { id: z.id, kind: 'move', to: v(0, 5) }], () => .5);
    expect(z.cd[spell]).toBe(0);
    expect(z.casting).toBeNull();
    expect(z.pos).toEqual(v(0, 0));
  });
  it.each(SPELL_IDS)('Agarrar aplica a classificação de movimento a %s', (spell) => {
    const w = world([[0, 0]], { ...noSpells(), [spell]: 1 }, [], () => .5);
    const z = w.wizards[0]; z.gripUntil = 5;
    if (spell === 'closedbody') { z.braceReadyAt = 0; z.braceUntil = 1; }
    stepWorld(w, [{ id: z.id, kind: 'cast', spell, at: spell === 'heal' ? z.pos : v(3, 0) }], () => .5);
    const blocked = spellGroup(spell) === 'mobility';
    expect(castBlocked(false, true, spell)).toBe(blocked);
    expect(w.events.some((e) => e.k === 'cast')).toBe(!blocked);
    expect(z.pos).toEqual(v(0, 0));
  });
});
