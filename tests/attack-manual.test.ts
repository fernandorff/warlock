import { describe, expect, it } from 'vitest';
import { BASIC_ATTACK, DT } from '../src/shared/constants.ts';
import { parseClientMessage } from '../src/shared/protocol.ts';
import { decodeSnap, encodeSnap, publicEvents } from '../src/shared/snapshot.ts';
import { stepWorld, type Projectile } from '../src/shared/sim.ts';
import { noSpells } from '../src/shared/spells.ts';
import { v } from '../src/shared/vec.ts';
import { run, world } from './helpers.ts';

const arena = (distance = 3) => {
  const w = world([[0, 0], [distance, 0], [0, 4]], noSpells(), [], () => .5);
  w.pillars = []; w.runes = []; w.shrinkAt = Infinity;
  w.wizards.forEach((z) => z.regen = 0);
  return w;
};
const attack = { id: 'p0', kind: 'basic' as const, at: v(3, 0), target: 'p1' };

describe('Atacar manual com preparo', () => {
  it('alcance é6m, incluindo aquisição no chão, sem estender além da borda', () => {
    expect(BASIC_ATTACK.range).toBe(6);
    for (const ground of [false, true]) {
      const w = arena(6); w.wizards[2].alive = false;
      run(w, .4 + DT, [{ ...attack, at: v(-10, -10), target: ground ? undefined : 'p1' }]);
      expect(w.projectiles.some((p) => p.kind === 'basic'), String(ground)).toBe(true);
    }
    const outside = arena(6.01);
    run(outside, .5, [attack]); expect(outside.wizards[0].basicReadyAt ?? 0).toBe(0);
  });
  it('só dispara depois de 0,4s e uma ordem não se repete', () => {
    const w = arena(); stepWorld(w, [attack], () => .5);
    expect(w.projectiles).toHaveLength(0);
    expect(w.wizards[0].basicCasting?.fireAt).toBeCloseTo(.4);
    run(w, .4 - DT * 2);
    expect(w.projectiles).toHaveLength(0);
    run(w, DT * 2);
    expect(w.projectiles.filter((p) => p.kind === 'basic')).toHaveLength(1);
    expect(w.wizards[0].basicReadyAt).toBeCloseTo(.4 + BASIC_ATTACK.cd);
    run(w, 2);
    expect(w.wizards[1].hp).toBe(1000 - BASIC_ATTACK.dmg);
  });
  it('corpo a corpo acerta só o escolhido, sem gerar projétil', () => {
    const w = arena(1); w.wizards[2].pos = v(.9, .2);
    run(w, .4 + DT, [attack]);
    expect(w.wizards[1].hp).toBe(985);
    expect(w.wizards[2].hp).toBe(1000);
    expect(w.projectiles).toHaveLength(0);
    expect(w.wizards[1].vel.x).toBeGreaterThan(0);
  });
  it('clique no chão escolhe o inimigo mais próximo do atacante, não o ponto do chão', () => {
    const w = arena(3); w.wizards[2].pos = v(0, 1);
    run(w, .4 + DT, [{ ...attack, at: v(-10, -10), target: undefined }]);
    expect(w.wizards[2].hp).toBe(985);
    expect(w.wizards[1].hp).toBe(1000);
  });
  it.each(['stop', 'move', 'cast'] as const)('%s cancela antes do golpe sem gastar recarga', (kind) => {
    const w = arena(); stepWorld(w, [attack], () => .5); run(w, .2);
    w.wizards[0].spells.shield = 1;
    const command = kind === 'cast' ? { id: 'p0', kind, spell: 'shield' as const, at: v(0, 0) } : kind === 'move' ? { id: 'p0', kind, to: v(-1, 0) } : { id: 'p0', kind };
    stepWorld(w, [command], () => .5); run(w, 1);
    expect(w.projectiles.some((p) => p.kind === 'basic')).toBe(false);
    expect(w.wizards[0].basicCasting).toBeFalsy();
    expect(w.wizards[0].basicReadyAt ?? 0).toBe(0);
    expect(w.wizards[1].hp).toBe(1000);
    if (kind === 'move') expect(w.wizards[0].pos.x).toBeLessThan(0);
  });
  it('S no próprio passo da soltura ainda cancela', () => {
    const w = arena(); stepWorld(w, [attack], () => .5); run(w, .4 - DT);
    stepWorld(w, [{ id: 'p0', kind: 'stop' }], () => .5);
    expect(w.projectiles).toHaveLength(0);
  });
  it('stun impede começar e interrompe preparo; Incapacitar e Agarrar não bloqueiam', () => {
    const w = arena(); w.wizards[0].stunLeft = 1;
    stepWorld(w, [attack], () => .5); expect(w.wizards[0].basicCasting).toBeFalsy();
    w.wizards[0].stunLeft = 0; stepWorld(w, [attack], () => .5);
    w.wizards[0].stunLeft = 1; run(w, 1);
    expect(w.wizards[1].hp).toBe(1000);
    for (const state of ['gripUntil', 'electroUntil'] as const) {
      const a = arena(1); a.wizards[0][state] = 5;
      run(a, .4 + DT, [attack]); expect(a.wizards[1].hp, state).toBe(985);
    }
  });
  it('alvo fora do alcance, morto, aliado ou invisível não gasta ataque nem escolhe outro', () => {
    for (const state of ['far', 'dead', 'ally', 'hidden']) {
      const w = arena(); const z = w.wizards[1];
      if (state === 'far') z.pos = v(10, 0);
      if (state === 'dead') z.alive = false;
      if (state === 'ally') w.wizards[0].team = z.team = 1;
      if (state === 'hidden') z.veilUntil = 5;
      run(w, .6, [attack]);
      expect(w.wizards[0].basicReadyAt ?? 0, state).toBe(0);
      expect(w.projectiles, state).toHaveLength(0);
    }
  });
  it('morte ou fuga do alvo durante preparo não redireciona para outro', () => {
    for (const die of [false, true]) {
      const w = arena(1); stepWorld(w, [attack], () => .5);
      if (die) w.wizards[1].alive = false; else w.wizards[1].pos = v(4, 0);
      run(w, .5); expect(w.wizards[0].basicReadyAt ?? 0).toBe(0);
      expect(w.wizards[2].hp).toBe(1000);
    }
  });
  it('projétil acompanha o escolhido, sem trocar para outro corpo no caminho', () => {
    const w = arena(4); w.wizards[2].pos = v(2, 0);
    stepWorld(w, [attack], () => .5); run(w, .45);
    w.wizards[1].pos = v(4, .5); run(w, .5);
    expect(w.wizards[1].hp).toBe(985);
    expect(w.wizards[2].hp).toBe(1000);
  });
  it('reflete projétil no Escudo, sem dar dano nele', () => {
    const w = arena(); w.wizards[1].shieldUntil = 5;
    run(w, 1.5, [attack]);
    expect(w.wizards[1].hp).toBe(1000); expect(w.wizards[0].hp).toBe(985);
  });
  it('Escudo bloqueia dano do corpo a corpo e reduz impulso pela regra geral', () => {
    const a = arena(1), b = arena(1); b.wizards[1].shieldUntil = 5;
    run(a, .4 + DT, [attack]); run(b, .4 + DT, [attack]);
    expect(b.wizards[1].hp).toBe(1000);
    expect(b.wizards[1].vel.x / a.wizards[1].vel.x).toBeCloseTo(.6);
  });
  it('obstáculo entre os corpos impede ataque, sem atravessar parede', () => {
    const w = arena(); w.pillars.push({ pos: v(1.5, 0), kind: 'rock', hp: 1000, alive: true });
    run(w, 1, [attack]); expect(w.wizards[1].hp).toBe(1000);
    expect(w.wizards[0].basicReadyAt ?? 0).toBe(0);
  });
  it('cópia visível é alvo válido, sem selecionar o dono oculto', () => {
    const w = arena(1); w.wizards[1].veilUntil = 5;
    const copy: Projectile = { id: w.nextId++, kind: 'illusion', owner: 'p1', caster: 'p1', pos: v(1, 0), vel: v(0, 0), level: 1, until: 3, target: null, dmgMult: 1 };
    w.projectiles.push(copy);
    run(w, .4 + DT, [{ ...attack, target: copy.id }]);
    expect(copy.pushVel?.x).toBeGreaterThan(0);
    expect(w.wizards[1].hp).toBe(1000);
  });
  it('sincroniza duração do preparo, inclusive para quem entra depois; oculta de inimigos invisíveis', () => {
    const w = arena(); stepWorld(w, [attack], () => .5);
    const own = decodeSnap(encodeSnap(w, 'p0', 1, []), ['p0', 'p1', 'p2']);
    expect(own.wizards[0].basicLeft).toBeGreaterThan(.35);
    w.wizards[0].veilUntil = 5;
    const enemy = decodeSnap(encodeSnap(w, 'p1', 1, []), ['p0', 'p1', 'p2']);
    expect(enemy.wizards[0].basicLeft ?? 0).toBe(0);
    expect(publicEvents([{ k: 'attack', id: 'p0', melee: true }], (id) => 'public-' + id)[0]).toMatchObject({ id: 'public-p0' });
  });
  it('valida alvo opcional público ou id de cópia, sem aceitar parâmetros extras', () => {
    const parse = (target: unknown) => parseClientMessage(JSON.stringify({ t: 'basic', x: 0, y: 0, seq: 1, target }));
    expect(parse('p123')).toMatchObject({ target: 'p123' }); expect(parse(12)).toMatchObject({ target: 12 });
    for (const invalid of ['secret-id', -1, 1.5, {}, true, null]) expect(parse(invalid)).toBeNull();
  });
});
