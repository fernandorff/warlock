import { describe, expect, it } from 'vitest';
import { stepWorld, type Projectile } from '../src/shared/sim.ts';
import { noSpells } from '../src/shared/spells.ts';
import { v } from '../src/shared/vec.ts';
import { world } from './helpers.ts';

const setup = () => {
  const w = world([[0, 0], [6, 6], [0, 3]], noSpells(), [], () => .5);
  w.pillars = []; w.wizards.forEach((z) => { z.regen = 0; });
  const q: Projectile = { id: w.nextId++, kind: 'illusion', owner: 'p1', caster: 'p1', pos: v(0, 0), vel: v(0, 0), until: 10, level: 1, target: null, dmgMult: 1 };
  w.projectiles.push(q);
  return { w, q };
};
describe('forças recebidas pela cópia da Ilusão', () => {
  it('Gravidade desloca cópia e jogador igualmente sem acelerar caminhada da cópia', () => {
    const { w, q } = setup();
    w.projectiles.push({ id: w.nextId++, kind: 'gravity', owner: 'p2', caster: 'p2', pos: v(2, 0), vel: v(0, 0), until: 10, level: 1, target: null, dmgMult: 1, tick: 10 });
    for (let i = 0; i < 60; i++) {
      stepWorld(w, [], () => .5);
      expect(q.pos.x).toBeCloseTo(w.wizards[0].pos.x, 8);
      expect(q.vel).toEqual(v(0, 0));
    }
  });
  it('Magnetizar não muda a direção ou velocidade autônoma de uma cópia', () => {
    const { w, q } = setup();
    q.vel = v(1, 0);
    w.wizards[2].pos = v(0, 1);
    w.wizards[2].magnetUntil = 10; w.wizards[2].magnet = 1;
    stepWorld(w, [], () => .5);
    expect(q.vel).toEqual(v(1, 0));
  });
  it.each((['fireball', 'homing', 'cluster', 'boomerang', 'bouncer', 'drain', 'recharge', 'shard'] as const).flatMap((kind) => [1, 4, 7].flatMap((level) => [0, .35].map((resist) => [kind, level, resist] as const))))('%s nível %s, resistência %s: impulso e percurso iguais', (kind, level, resist) => {
    // Mundos separados evitam que um alvo bloqueie o projétil destinado ao outro.
    const fake = setup(), real = setup();
    real.w.projectiles = [];
    fake.w.wizards[0].pos = v(-5, -5);
    fake.q.decoyResist = real.w.wizards[0].kbResist = resist;
    fake.q.decoyDamage = real.w.wizards[0].dmgTaken = 10000;
    for (const { w } of [fake, real]) w.projectiles.push({ id: w.nextId++, kind, owner: 'p2', caster: 'p2', pos: v(-.6, 0), vel: v(20, 0), until: 10, level, target: null, dmgMult: 1 });
    stepWorld(fake.w, [], () => .5); stepWorld(real.w, [], () => .5);
    expect(fake.q.pushVel?.x ?? 0).toBeCloseTo(real.w.wizards[0].vel.x, 8);
    fake.w.projectiles = [fake.q]; real.w.projectiles = [];
    for (let i = 0; i < 90; i++) {
      stepWorld(fake.w, [], () => .5); stepWorld(real.w, [], () => .5);
      expect(fake.q.pos.x).toBeCloseTo(real.w.wizards[0].pos.x, 8);
      expect(fake.q.pos.y).toBeCloseTo(real.w.wizards[0].pos.y, 8);
    }
  });
  it.each([1, 4, 7])('Bola de neve nível %s usa arraste, não o empurrão da explosão no contato', (level) => {
    const fake = setup(), real = setup();
    real.w.projectiles = []; fake.w.wizards[0].pos = v(-5, -5);
    for (const { w } of [fake, real]) w.projectiles.push({ id: w.nextId++, kind: 'snowball', owner: 'p2', caster: 'p2', pos: v(-.6, 0), vel: v(2.588, 0), until: 10, level, target: null, dmgMult: 1 });
    stepWorld(fake.w, [], () => .5); stepWorld(real.w, [], () => .5);
    expect(fake.q.pushVel?.x ?? 0).toBeCloseTo(real.w.wizards[0].vel.x, 8);
  });
  it.each(['lightning', 'scourge', 'windwalk', 'rush', 'thrust'] as const)('%s transfere força também para a cópia', (spell) => {
    const pair = () => {
      const w = world([[-.8, 0], [6, 6], [0, 0]], { ...noSpells(), [spell]: 1 }, [], () => .5);
      w.pillars = []; w.wizards.forEach((z) => { z.regen = 0; });
      return w;
    };
    const fake = pair(), real = pair();
    fake.wizards[2].pos = v(-5, -5);
    const q: Projectile = { id: fake.nextId++, kind: 'illusion', owner: 'p1', caster: 'p1', pos: v(0, 0), vel: v(0, 0), until: 10, level: 1, target: null, dmgMult: 1 };
    fake.projectiles.push(q);
    let compared = false;
    for (let i = 0; i < 80; i++) {
      const cmd = i === 0 ? [{ id: 'p0', kind: 'cast' as const, spell, at: v(3, 0) }] : [];
      stepWorld(fake, cmd, () => .5); stepWorld(real, cmd, () => .5);
      if (q.pushVel && real.wizards[2].vel.x > 0) {
        expect(q.pushVel.x).toBeCloseTo(real.wizards[2].vel.x, 8);
        compared = true;
        break;
      }
    }
    expect(compared).toBe(true);
    expect(fake.projectiles).toContain(q);
  });
  it('Elo ligado puxa a cópia sem afetar a velocidade de caminhada dela', () => {
    const { w, q } = setup();
    w.wizards[2].pos = v(-3, 0); w.wizards[0].pos = v(-5, -5);
    w.projectiles.push({ id: w.nextId++, kind: 'link', owner: 'p2', caster: 'p2', pos: v(-.6, 0), vel: v(20, 0), until: 10, level: 1, target: null, dmgMult: 1 });
    stepWorld(w, [], () => .5);
    expect(w.projectiles.find((p) => p.kind === 'link')?.decoyTarget).toBe(q.id);
    stepWorld(w, [], () => .5);
    expect(q.pushVel!.x).toBeLessThan(0);
    expect(q.vel).toEqual(v(0, 0));
  });
});
