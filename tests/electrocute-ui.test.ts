import { describe, expect, it } from 'vitest';
import { demoStep, demoWorld } from '../src/client/demo.ts';
import { SPELL_GROUPS_EN, SPELL_GROUPS_PT, spellClass } from '../src/client/rules-text.ts';
import { SPELLS, SPELL_IDS } from '../src/shared/spells.ts';
import type { SimEvent } from '../src/shared/sim.ts';

describe('Eletrocutar: nome, grupo e demonstração', () => {
  it('Atacar demonstra preparo, corpo a corpo e projétil até6m', () => {
    const state = demoWorld('basic'), events: SimEvent[] = [];
    let prep = false, projectile = false;
    while (state.w.t <= state.script.end) {
      demoStep(state); events.push(...state.events);
      prep ||= !!state.w.wizards[0].basicCasting;
      projectile ||= state.w.projectiles.some((p) => p.kind === 'basic');
    }
    expect(prep && projectile).toBe(true);
    expect(events.filter((e) => e.k === 'attack').map((e) => e.melee)).toEqual([true, false]);
  });
  it('mantém id e ordem, com nome PT/EN e grupo Controle único', () => {
    expect(SPELLS.lightning.name).toBe('Eletrocutar');
    expect(SPELLS.lightning.en).toBe('Electrocute');
    expect(SPELL_IDS.indexOf('lightning')).toBe(1);
    for (const groups of [SPELL_GROUPS_PT, SPELL_GROUPS_EN]) {
      expect(groups[0][2]).not.toContain('lightning');
      expect(groups[3][2]).toContain('lightning');
      expect(groups.flatMap(([, , ids]) => ids).filter((s) => s === 'lightning')).toHaveLength(1);
    }
    expect(spellClass('lightning')).toBe('g-controle');
  });
  it('mostra três inimigos, alcance fixo e dano100/50/25', () => {
    const state = demoWorld('lightning'), events: SimEvent[] = [];
    while (state.w.t <= state.script.end) { demoStep(state); events.push(...state.events); }
    const hits = events.filter((e): e is Extract<SimEvent, { k: 'hit' }> => e.k === 'hit' && e.src === 'lightning');
    expect(hits.map((e) => e.id)).toEqual(['b', 'c', 'd']);
    expect(hits.map((e) => e.dmg)).toEqual([70, 35, 18]);
    expect(events.filter((e) => e.k === 'lightning')).toHaveLength(3);
  });
});
