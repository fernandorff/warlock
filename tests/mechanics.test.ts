import { describe, expect, it } from 'vitest';
import { ARENA_R0, DT, KILL_GOLD, RUNE, STREAK, SHRINK_EVERY, SUDDEN, WIZ_R, type RuneKind } from '../src/shared/constants.ts';
import { addPlayer, newMatch, setReady, startMatch, tickMatch, type Match } from '../src/shared/match.ts';
import { newWorld, stepWorld, type SimEvent, type World } from '../src/shared/sim.ts';
import { encodeSnap, decodeSnap, publicEvents } from '../src/shared/snapshot.ts';
import { LIGHTNING, SPELLS, noSpells } from '../src/shared/spells.ts';
import { v } from '../src/shared/vec.ts';
import { world as spotsWorld } from './helpers.ts';

const half = () => 0.5;

const world = (spots: [number, number][], dm = false) => spotsWorld(spots, { ...noSpells(), lightning: 1 }, [], half, dm);
const run = (w: World, n: number) => {
  const out: SimEvent[] = [];
  for (let i = 0; i < n; i++) {
    stepWorld(w, [], half);
    out.push(...w.events);
  }
  return out;
};

describe('morte súbita', () => {
  it('after 90 s the arena shrinks every 5 s, with one warning', () => {
    const w = world([[0, 0], [2, 0]]);
    w.t = SUDDEN.at - 0.5;
    w.shrinkAt = SUDDEN.at + 8;
    w.runeAt = Infinity;
    w.chestAt = Infinity;
    const ev = run(w, 60);
    expect(ev.filter((e) => e.k === 'sudden')).toHaveLength(1);
    expect(w.shrinkAt).toBeLessThanOrEqual(SUDDEN.at + SUDDEN.every + DT);
    const r = w.arenaR;
    const at = w.shrinkAt;
    run(w, Math.ceil((at - w.t) / DT) + 1);
    expect(w.arenaR).toBeLessThan(r);
    expect(w.shrinkAt).toBeCloseTo(at + SUDDEN.every, 5);
  });

  it('never in deathmatch, and normal shrink before 90 s', () => {
    const dm = world([[0, 0], [2, 0]], true);
    dm.t = SUDDEN.at - 0.1;
    expect(run(dm, 30).some((e) => e.k === 'sudden')).toBe(false);
    const w = world([[0, 0], [2, 0]]);
    run(w, Math.round((SHRINK_EVERY + 0.1) / DT));
    expect(w.shrinkAt).toBeCloseTo(2 * SHRINK_EVERY, 5);
  });
});

describe('runas', () => {
  const take = (kind: RuneKind) => {
    const w = world([[0, 0], [3, 0]]);
    w.runeAt = Infinity;
    w.runes = [{ pos: v(0.2, 0), kind }];
    const ev = run(w, 1);
    expect(ev).toContainEqual({ k: 'runeTake', id: 'p0', kind });
    expect(w.runes).toHaveLength(0);
    expect(w.runeAt).toBeCloseTo(w.t - DT + RUNE.every, 5);
    return w;
  };
  const fireballHit = (w: World, from = 'p0', at = v(3, 0)) => {
    stepWorld(w, [{ id: from, kind: 'cast', spell: 'fireball', at }], half);
    return run(w, 40).filter((e) => e.k === 'hit').map((e) => (e.k === 'hit' ? e.dmg : 0));
  };

  it('one rune appears at a free spot after 15 s and stays alone', () => {
    const w = world([[5, 5], [-5, -5]]);
    w.chestAt = Infinity;
    const ev = run(w, Math.round((RUNE.first + 0.1) / DT));
    expect(ev.filter((e) => e.k === 'rune')).toHaveLength(1);
    expect(w.runes).toHaveLength(1);
    run(w, Math.round(RUNE.every / DT) + 10);
    expect(w.runes).toHaveLength(1);
  });

  it('a rune swallowed by the lava disappears and the next one comes later', () => {
    const w = world([[0, 0], [2, 0]]);
    w.runes = [{ pos: v(w.arenaR + 0.5, 0), kind: 'fury' }];
    run(w, 1);
    expect(w.runes).toHaveLength(0);
    expect(w.runeAt).toBeGreaterThan(w.t + RUNE.every - 1);
  });

  it('haste: +50% speed for 8 s', () => {
    const w = take('haste');
    run(w, 1);
    expect(w.wizards[0].speed).toBeCloseTo(w.wizards[0].baseSpeed * (1 + RUNE.haste), 5);
    run(w, Math.round(RUNE.secs / DT));
    expect(w.wizards[0].speed).toBeCloseTo(w.wizards[0].baseSpeed, 5);
  });

  it('fury: +30% damage', () => {
    const w = take('fury');
    expect(fireballHit(w)[0]).toBeCloseTo(SPELLS.fireball.levels[0].dmg * (1 + RUNE.fury), 1);
  });

  it('rune shield: 30% less damage taken', () => {
    const w = take('shield');
    w.wizards[0].pos = v(3, 0);
    w.wizards[1].pos = v(0, 0);
    expect(fireballHit(w, 'p1')[0]).toBeCloseTo(SPELLS.fireball.levels[0].dmg * (1 - RUNE.armor), 1);
  });

  it('recharge: cooldowns run 30% faster while it lasts', () => {
    const w = world([[0, 0], [3, 0]]);
    w.runeAt = Infinity;
    w.wizards[0].cd.lightning = 50;
    w.wizards[0].cd.scourge = 50;
    w.runes = [{ pos: v(0, 0), kind: 'recharge' }];
    run(w, 1 + Math.round(1 / DT));
    // 1 s de jogo com a runa: a recarga andou 1/(1 − 30%) ≈ 1,43 s, ou seja 0,43 s a mais que o relógio
    expect(50 - w.wizards[0].cd.lightning).toBeCloseTo(1 / (1 - RUNE.cdr) - 1, 1);
    expect(50 - w.wizards[0].cd.scourge).toBeCloseTo(1 / (1 - RUNE.cdr) - 1, 1);
  });

  it('runes and rune effects travel in the snapshot', () => {
    const w = take('fury');
    w.runes = [{ pos: v(1.5, -2), kind: 'shield' }];
    const s = decodeSnap(encodeSnap(w, 'p0', 0, []), ['p0', 'p1']);
    expect(s.runes).toEqual([{ pos: v(1.5, -2), kind: 'shield' }]);
    expect(s.wizards[0].status & 524288).toBeTruthy();
    expect(s.wizards[1].status & 524288).toBeFalsy();
  });
});

describe('sequências de abate', () => {
  const STEP_MS = DT * 1000;
  function playing(ids: string[]): { m: Match; now: number } {
    const m = newMatch();
    for (const id of ids) addPlayer(m, id, id.toUpperCase());
    startMatch(m, 0, 0);
    for (const p of m.players) setReady(m, p.id);
    let now = 0;
    for (let i = 0; i < 1000 && m.phase !== 'playing'; i++) tickMatch(m, (now += STEP_MS), [], half);
    return { m, now };
  }
  // mata na hora (na lava, com o último golpe de `by`) e devolve os eventos daquele passo
  function kill(g: { m: Match; now: number }, id: string, by: string): SimEvent[] {
    const wz = g.m.world!.wizards.find((z) => z.id === id)!;
    Object.assign(wz, { hp: 0.01, lastHitBy: by, lastHitAt: g.m.world!.t, pos: v(ARENA_R0 * 3, 0) });
    return tickMatch(g.m, (g.now += STEP_MS), [], half).filter((e) => e.k === 'streak');
  }
  const wait = (g: { m: Match; now: number }, secs: number) => {
    for (let i = 0; i < Math.round(secs / DT); i++) tickMatch(g.m, (g.now += STEP_MS), [], half);
  };

  it('fast kills announce Double and Multi kill; 3 kills without dying is a spree', () => {
    const g = playing(['a', 'b', 'c', 'd', 'e']);
    for (const z of g.m.world!.wizards) z.invulnUntil = 0;
    expect(kill(g, 'b', 'a')).toEqual([]);
    wait(g, 1);
    expect(kill(g, 'c', 'a')).toEqual([{ k: 'streak', id: 'a', kind: 'multi', n: 2 }]);
    wait(g, 1);
    expect(kill(g, 'd', 'a')).toEqual([{ k: 'streak', id: 'a', kind: 'multi', n: 3 }, { k: 'streak', id: 'a', kind: 'spree', n: 3 }]);
  });

  it('each kill of a streak pays +20% of the kill gold per kill before it', () => {
    const g = playing(['a', 'b', 'c', 'd', 'e']);
    for (const z of g.m.world!.wizards) z.invulnUntil = 0;
    const a = g.m.players.find((p) => p.id === 'a')!;
    const paid = ['b', 'c', 'd'].map((id) => {
      const before = a.gold;
      kill(g, id, 'a');
      return a.gold - before;
    });
    expect(paid).toEqual([KILL_GOLD, KILL_GOLD * 1.2, KILL_GOLD * 1.4]);
  });

  it('kills more than 4 s apart are not a multi kill', () => {
    const g = playing(['a', 'b', 'c', 'd']);
    for (const z of g.m.world!.wizards) z.invulnUntil = 0;
    kill(g, 'b', 'a');
    wait(g, STREAK.window + 0.5);
    expect(kill(g, 'c', 'a')).toEqual([]);
  });

  it('ending a spree pays the combo breaker, and dying resets the streak', () => {
    const g = playing(['a', 'b', 'c', 'd', 'e']);
    g.m.streaks!.a = { kills: 3, multi: 1, at: -Infinity };
    for (const z of g.m.world!.wizards) z.invulnUntil = 0;
    const gold = g.m.players.find((p) => p.id === 'e')!.gold;
    expect(kill(g, 'a', 'e')).toEqual([{ k: 'streak', id: 'e', kind: 'breaker', n: 3, victim: 'a' }]);
    expect(g.m.streaks!.a.kills).toBe(0);
    expect(g.m.players.find((p) => p.id === 'e')!.gold - gold).toBeGreaterThanOrEqual(STREAK.breakGold);
    // o id da vítima também vira público no evento enviado
    const [pub] = publicEvents([{ k: 'streak', id: 'e', kind: 'breaker', n: 3, victim: 'a' }], (id) => 'pub-' + id);
    expect(pub).toMatchObject({ id: 'pub-e', victim: 'pub-a' });
  });

  it('a lava death without credit still resets the streak', () => {
    const g = playing(['a', 'b', 'c']);
    g.m.streaks!.a = { kills: 2, multi: 1, at: -Infinity };
    const wz = g.m.world!.wizards.find((z) => z.id === 'a')!;
    Object.assign(wz, { hp: 0.01, invulnUntil: 0, lastHitBy: null, pos: v(ARENA_R0 * 3, 0) });
    tickMatch(g.m, (g.now += STEP_MS), [], half);
    expect(wz.alive).toBe(false);
    expect(g.m.streaks!.a.kills).toBe(0);
  });
});

describe('rodada sem fim', () => {
  it('after the collapse time the arena keeps shrinking to nothing, so a round always ends', () => {
    const w = newWorld(['a', 'b'], { a: noSpells(), b: noSpells() });
    w.pillars = [];
    w.wizards[0].pos = v(0, 0.2);
    w.wizards[1].pos = v(0, -0.2);
    for (let i = 0; i < Math.round(260 / DT) && w.wizards.every((z) => z.alive); i++) stepWorld(w, []);
    expect(w.wizards.some((z) => !z.alive)).toBe(true);
  });
});

describe('largura do acerto do Raio (21/10, exceção decidida pelo Fernando)', () => {
  it('pega quem tem o corpo a até LIGHTNING.width da linha, não mais', () => {
    const hits = (gap: number) => {
      const w = newWorld(['a', 'b'], { a: { ...noSpells(), lightning: 1 }, b: noSpells() }, {}, 0, () => 0.5);
      const [a, b] = w.wizards;
      [a.pos, b.pos, w.pillars] = [v(0, 0), v(3, WIZ_R + gap), []];
      stepWorld(w, [{ id: 'a', kind: 'cast', spell: 'lightning', at: v(3, 0) }]);
      let hit = false;
      for (let i = 0; i < 20; i++, stepWorld(w, [])) hit = hit || w.events.some((e) => e.k === 'hit');
      return hit;
    };
    expect([hits(LIGHTNING.width - 0.02), hits(LIGHTNING.width + 0.02)]).toEqual([true, false]);
  });
});
