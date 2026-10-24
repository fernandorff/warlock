import { describe, expect, it } from 'vitest';
import { healTarget } from '../src/shared/heal-target.ts';
import { noSpells, SPELLS } from '../src/shared/spells.ts';
import { stepWorld } from '../src/shared/sim.ts';
import { DT } from '../src/shared/constants.ts';
import { botCmds } from '../src/shared/bots.ts';
import { demoStep, demoWorld } from '../src/client/demo.ts';
import { world } from './helpers.ts';

function setup(level = 1) {
  const w = world([[0, 0], [10, 0], [3, 0]], { ...noSpells(), heal: level }, [], () => .5, false, [0, 0, 1]);
  w.pillars = []; w.isles = [];
  w.arenaR = 30; w.shrinkAt = Infinity;
  for (const z of w.wizards) { z.hp = 500; z.regen = 0; }
  return w;
}
describe('Curar', () => {
  it('demonstra cura em aliado e autocura com os números reais', () => {
    const s = demoWorld('heal'), amounts: number[] = [];
    while (s.w.t <= s.script.end) {
      demoStep(s);
      for (const e of s.events) if (e.k === 'heal') amounts.push(e.amount);
    }
    expect(amounts).toEqual([45, 45]);
    expect(s.w.wizards.map(z => z.hp)).toEqual([700, 790, 700]);
  });
  it('alvo inválido não revela nem cancela ataque em preparo; recarga impede repetição', () => {
    const w = setup(), [caster, ally, enemy] = w.wizards;
    caster.veilUntil = 2;
    caster.basicCasting = { target: enemy.id, fireAt: 1, melee: false };
    stepWorld(w, [{ id: caster.id, kind: 'cast', spell: 'heal', at: enemy.pos }], () => .5);
    expect(caster.veilUntil).toBe(2);
    expect(caster.basicCasting).toBeDefined();
    stepWorld(w, [{ id: caster.id, kind: 'cast', spell: 'heal', at: ally.pos }], () => .5);
    expect(caster.veilUntil).toBe(0);
    expect(caster.basicCasting).toBeUndefined();
    stepWorld(w, [{ id: caster.id, kind: 'cast', spell: 'heal', at: ally.pos }], () => .5);
    expect(ally.hp).toBeCloseTo(545);
    expect(w.events.some(e => e.k === 'heal')).toBe(false);
  });
  it('bot cura aliado ferido, nunca inimigo, e respeita a espera do véu', () => {
    const w = setup(), [caster, ally, enemy] = w.wizards;
    caster.hp = caster.hpMax; enemy.hp = 1;
    expect(botCmds(w, caster.id, () => .5)).toContainEqual({ id: caster.id, kind: 'cast', spell: 'heal', at: ally.pos });
    caster.veilUntil = 2;
    expect(botCmds(w, caster.id, () => .5).some(c => c.kind === 'cast')).toBe(false);
    caster.veilUntil = 0; ally.hp = ally.hpMax; caster.hp = 500;
    expect(botCmds(w, caster.id, () => .5)).toContainEqual({ id: caster.id, kind: 'cast', spell: 'heal', at: caster.pos });
  });
  it('tem cura triplicada45→81, recarga20→14 e alcance10m nos sete níveis', () => {
    expect(SPELLS.heal.levels.map(l => l.heal)).toEqual([45,51,57,63,69,75,81]);
    expect(SPELLS.heal.levels.map(l => l.cd)).toEqual([20,19,18,17,16,15,14]);
    expect(SPELLS.heal.levels.every(l => l.range === 10 && !l.dmg && !l.knock)).toBe(true);
  });
  it.each([1, 7])('cura o aliado no alcance exato, sem dano nem impulso, nível%s', level => {
    const w = setup(level), [caster, ally, enemy] = w.wizards;
    stepWorld(w, [{ id: caster.id, kind: 'cast', spell: 'heal', at: ally.pos }], () => .5);
    expect(ally.hp).toBeCloseTo(500 + SPELLS.heal.levels[level - 1].heal);
    expect(caster.hp).toBeCloseTo(500);
    expect(enemy.hp).toBeCloseTo(500);
    expect(ally.vel).toEqual({ x: 0, y: 0 });
    expect(caster.cd.heal - w.t).toBeCloseTo(SPELLS.heal.levels[level - 1].cd - DT);
  });
  it('permite autocura e não ultrapassa vida máxima', () => {
    const w = setup(), caster = w.wizards[0];
    caster.hp = caster.hpMax - 5;
    stepWorld(w, [{ id: caster.id, kind: 'cast', spell: 'heal', at: caster.pos }], () => .5);
    expect(caster.hp).toBe(caster.hpMax);
  });
  it('rejeita inimigo, morto, chão e aliado fora de alcance sem gastar recarga', () => {
    for (const kind of ['enemy','dead','ground','far']) {
      const w = setup(), [caster, ally, enemy] = w.wizards;
      if (kind === 'dead') ally.alive = false;
      if (kind === 'far') ally.pos.x = 10.01;
      const at = kind === 'enemy' ? enemy.pos : kind === 'ground' ? { x: 6, y: 4 } : ally.pos;
      stepWorld(w, [{ id: caster.id, kind: 'cast', spell: 'heal', at }], () => .5);
      expect(caster.cd.heal, kind).toBe(0);
      expect(w.events.some(e => e.k === 'cast' && e.spell === 'heal'), kind).toBe(false);
    }
  });
  it('stun bloqueia; agarramento e Incapacitar permitem magia pronta', () => {
    for (const status of ['stun','root','incap']) {
      const w = setup(), [caster, ally] = w.wizards;
      if (status === 'stun') caster.stunLeft = 1;
      if (status === 'root') caster.gripUntil = 1;
      if (status === 'incap') caster.electroUntil = 1;
      stepWorld(w, [{ id: caster.id, kind: 'cast', spell: 'heal', at: ally.pos }], () => .5);
      expect(ally.hp).toBeCloseTo(status === 'stun' ? 500 : 545);
    }
  });
  it('usa o multiplicador geral de cura e alcance do mundo/mago', () => {
    const w = setup(), [caster, ally] = w.wizards;
    w.mods.heal = 1.5; caster.rangeF = .5; ally.pos.x = 5;
    stepWorld(w, [{ id: caster.id, kind: 'cast', spell: 'heal', at: ally.pos }], () => .5);
    expect(ally.hp).toBeCloseTo(567.5);
  });
  it('sem time só permite o próprio lançador, nunca outro jogador sem time', () => {
    const w = setup(), [caster, ally] = w.wizards;
    caster.team = ally.team = null;
    expect(healTarget(w.wizards, caster, ally.pos, 10)).toBeUndefined();
    expect(healTarget(w.wizards, caster, caster.pos, 10)).toBe(caster);
  });
});
