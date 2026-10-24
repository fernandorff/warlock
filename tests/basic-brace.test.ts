import { describe, expect, it } from 'vitest';
import { BASIC_ATTACK, BRACE, DT } from '../src/shared/constants.ts';
import { parseClientMessage } from '../src/shared/protocol.ts';
import { encodeSnap, decodeSnap } from '../src/shared/snapshot.ts';
import { stepWorld } from '../src/shared/sim.ts';
import { noSpells } from '../src/shared/spells.ts';
import { v } from '../src/shared/vec.ts';
import { run, world } from './helpers.ts';

const arena = () => {
  const w = world([[0, 0], [3, 0]], noSpells(), [], () => .5);
  w.pillars = []; w.runes = [];
  for (const z of w.wizards) { z.regen = 0; z.spells.fireball = 0; }
  return w;
};

describe('ataque básico e defesa mantida', () => {
  it('sincroniza o projétil novo no snapshot e expira no alcance finito', () => {
    const w = arena();
    stepWorld(w, [{ id: 'p0', kind: 'basic', at: v(20, 0) }], () => .5);
    run(w, BASIC_ATTACK.windup);
    const decoded = decodeSnap(encodeSnap(w, 'p0', 1, []), ['p0', 'p1']);
    expect(decoded.projectiles[0].kind).toBe('basic');
    w.wizards[1].pos = v(0, 8);
    run(w, BASIC_ATTACK.range / BASIC_ATTACK.speed + DT);
    expect(w.projectiles).toHaveLength(0);
  });

  it('o escudo reflete o ataque', () => {
    const w = arena(); w.wizards[1].shieldUntil = 5;
    run(w, BASIC_ATTACK.windup + .35, [{ id: 'p0', kind: 'basic', at: v(10, 0) }]);
    expect(w.wizards[1].hp).toBe(1000);
    expect(w.projectiles.some((p) => p.kind === 'basic' && p.owner === 'p1' && p.vel.x < 0)).toBe(true);
  });
  it('lança sem comprar magia, tem recarga própria e causa dano leve sem registrar Bola de fogo', () => {
    const w = arena();
    const fire = { id: 'p0', kind: 'basic' as const, at: v(10, 0) };
    stepWorld(w, [fire, fire], () => .5);
    run(w, BASIC_ATTACK.windup);
    expect(w.projectiles.filter((p) => p.kind === 'basic')).toHaveLength(1);
    expect(w.events.some((e) => e.k === 'fire')).toBe(false);
    run(w, .3);
    expect(w.wizards[1].hp).toBe(1000 - BASIC_ATTACK.dmg);
    expect(w.wizards[1].vel.x).toBeGreaterThan(0);
    expect(w.wizards[1].vel.x).toBeLessThanOrEqual(BASIC_ATTACK.knock);
    expect(w.wizards[0].spells.fireball).toBe(0);
    stepWorld(w, [fire], () => .5);
    expect(w.projectiles).toHaveLength(0);
    run(w, BASIC_ATTACK.cd);
    stepWorld(w, [fire], () => .5);
    run(w, BASIC_ATTACK.windup);
    expect(w.projectiles.some((p) => p.kind === 'basic')).toBe(true);
  });

  it('não atravessa stun/conjuração nem lança morto; agarramento permite o ataque não móvel', () => {
    for (const state of ['stun', 'casting', 'dead', 'grip']) {
      const w = arena(), z = w.wizards[0];
      if (state === 'stun') z.stunLeft = 1;
      if (state === 'casting') z.casting = { spell: 'fireball', at: v(5, 0), fireAt: 5 };
      if (state === 'dead') z.alive = false;
      if (state === 'grip') z.gripUntil = 5;
      stepWorld(w, [{ id: z.id, kind: 'basic', at: v(5, 0) }], () => .5);
      run(w, BASIC_ATTACK.windup);
      expect(w.projectiles.some((p) => p.kind === 'basic'), state).toBe(state === 'grip');
    }
  });

  it('um ataque válido encerra invisibilidade, mas tentativa em recarga não a encerra', () => {
    const w = arena(), z = w.wizards[0];
    z.veilUntil = z.windUntil = 5;
    z.basicReadyAt = 1;
    stepWorld(w, [{ id: z.id, kind: 'basic', at: v(5, 0) }], () => .5);
    expect(z.veilUntil).toBe(5);
    z.basicReadyAt = 0;
    stepWorld(w, [{ id: z.id, kind: 'basic', at: v(5, 0) }], () => .5);
    expect(z.veilUntil).toBe(5); // preparo ainda pode ser cancelado; só a soltura revela.
    run(w, BASIC_ATTACK.windup);
    expect(z.veilUntil).toBe(0);
    expect(z.windUntil).toBe(0);
  });

  it('S reduz novos impulsos em 15%, sem reduzir dano ou alterar impulso anterior', () => {
    const hit = (guard: boolean) => {
      const w = arena(); w.wizards[1].kbResist = .25;
      if (guard) { w.wizards[1].braceUntil = 1; w.wizards[1].braceReadyAt = 0; }
      w.projectiles.push({ id: w.nextId++, kind: 'basic', owner: 'p0', caster: 'p0', pos: v(2.5, 0), vel: v(8, 0), level: 1, until: 2, target: null, dmgMult: 1 });
      stepWorld(w, guard ? [{ id: 'p1', kind: 'brace', on: true }] : [], () => .5);
      return w;
    };
    const normal = hit(false), guarded = hit(true);
    expect(guarded.wizards[1].hp).toBe(normal.wizards[1].hp);
    expect(guarded.wizards[1].vel.x / normal.wizards[1].vel.x).toBeCloseTo(1 - BRACE.resistance);
    const before = guarded.wizards[1].vel.x;
    stepWorld(guarded, [{ id: 'p1', kind: 'brace', on: false }], () => .5);
    expect(guarded.wizards[1].braceUntil).toBe(0);
    expect(guarded.wizards[1].vel.x).toBeLessThan(before);
  });

  it('defesa expira sem renovar, pode ser renovada e não desacelera um impulso já recebido', () => {
    const a = arena(), b = arena();
    a.wizards[0].vel = b.wizards[0].vel = v(2, 0);
    stepWorld(a, [{ id: 'p0', kind: 'brace', on: true }], () => .5);
    stepWorld(b, [], () => .5);
    expect(a.wizards[0].vel).toEqual(b.wizards[0].vel);
    run(a, BRACE.lease + DT);
    expect(a.t).toBeGreaterThan(a.wizards[0].braceUntil!);
    stepWorld(a, [{ id: 'p0', kind: 'brace', on: true }], () => .5);
    expect(a.wizards[0].braceUntil).toBeGreaterThan(a.t);
  });

  it('valida comandos novos e rejeita coordenadas, flags e chaves inválidas', () => {
    const parse = (m: unknown) => parseClientMessage(JSON.stringify(m));
    expect(parse({ t: 'basic', x: 2, y: 0, seq: 1 })).toEqual({ t: 'basic', x: 2, y: 0, seq: 1 });
    expect(parse({ t: 'brace', on: true, seq: 2 })).toEqual({ t: 'brace', on: true, seq: 2 });
    for (const m of [{ t: 'basic', x: '2', y: 0, seq: 1 }, { t: 'basic', x: 2, y: 0, seq: 1, dmg: 999 }, { t: 'brace', on: 1, seq: 2 }, { t: 'brace', on: true, seq: -1 }, { t: 'brace', on: true, seq: 1, resistance: 1 }]) expect(parse(m)).toBeNull();
  });
});
