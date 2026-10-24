import { describe, expect, it } from 'vitest';
import { botCmds } from '../src/shared/bots.ts';
import { noSpells } from '../src/shared/spells.ts';
import { world } from './helpers.ts';

// free spells (Fireball, Scourge) on cooldown, so "no spell ready" holds
const idle = (enemyAt: number) => {
  const w = world([[0, 0], [enemyAt, 0]], noSpells(), [], () => .5);
  w.pillars = [];
  w.wizards[0].cd.fireball = w.wizards[0].cd.scourge = 99;
  return w;
};

describe('bots use the manual Attack', () => {
  it('attacks an enemy within 6 m when no spell is ready', () => {
    const w = idle(3);
    expect(botCmds(w, 'p0', () => .5)).toContainEqual({ id: 'p0', kind: 'basic', at: w.wizards[1].pos, target: 'p1' });
  });
  it('does not attack beyond 6 m or while a spell is ready', () => {
    expect(botCmds(idle(7), 'p0', () => .5).some((c) => c.kind === 'basic')).toBe(false);
    const armed = idle(3);
    armed.wizards[0].cd.fireball = 0;
    expect(botCmds(armed, 'p0', () => .5).some((c) => c.kind === 'basic')).toBe(false);
  });
});
