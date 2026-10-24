import { describe, expect, it } from 'vitest';
import { cleanName, cmdTarget, parseClientMessage } from '../src/shared/protocol.ts';
import { newWorld, stepWorld } from '../src/shared/sim.ts';
import { decodeSnap, encodeSnap } from '../src/shared/snapshot.ts';
import { noSpells } from '../src/shared/spells.ts';
import { v } from '../src/shared/vec.ts';

const p = (m: unknown) => parseClientMessage(JSON.stringify(m));

describe('protocolo', () => {
  it('accepts valid commands', () => {
    expect(p({ t: 'hello', playerId: 'abcdefgh-123', name: 'Ana' })).toEqual({ t: 'hello', playerId: 'abcdefgh-123', name: 'Ana' });
    expect(p({ t: 'move', x: 1.5, y: -2, seq: 3 })).toEqual({ t: 'move', x: 1.5, y: -2, seq: 3 });
    expect(p({ t: 'cast', spell: 'homing', x: 0, y: 0, seq: 9 })).toEqual({ t: 'cast', spell: 'homing', x: 0, y: 0, seq: 9 });
    expect(p({ t: 'start', bots: 7 })).toEqual({ t: 'start', bots: 7 });
    expect(p({ t: 'pick', character: 'skeleton_warrior' })).toEqual({ t: 'pick', character: 'skeleton_warrior' });
    expect(p({ t: 'look', look: '8788874' })).toEqual({ t: 'look', look: '8788874' }); // o maior índice de cada peça
    expect(p({ t: 'look', look: '4044444' })).toEqual({ t: 'look', look: '3733344' }); // cliente antigo com a Ladina encapuzada: Ladina + Capuz (#107)
    expect(p({ t: 'vote', kind: 'mode', target: 'teams' })).toEqual({ t: 'vote', kind: 'mode', target: 'teams' });
    expect(p({ t: 'vote', kind: 'shuffle', target: 'x' })).toEqual({ t: 'vote', kind: 'shuffle' });
    expect(p({ t: 'vote', kind: 'kick', target: 'p1a2b3' })).toEqual({ t: 'vote', kind: 'kick', target: 'p1a2b3' });
    expect(p({ t: 'ballot', yes: false })).toEqual({ t: 'ballot', yes: false });
    expect(p({ t: 'resources', session: '12345678-1234-1234-1234-123456789abc', build: '2026-10-24 · 123abcd', geometries: 42, textures: 18, heapBytes: 12_345_678 }))
      .toEqual({ t: 'resources', session: '12345678-1234-1234-1234-123456789abc', build: '2026-10-24 · 123abcd', geometries: 42, textures: 18, heapBytes: 12_345_678 });
  });

  it('keeps move/cast targets inside the room: ±30 m in the arena, the map rectangle in the Campaign', () => {
    // a sala normal recusa fora da arena como antes da Campanha (o parser agora aceita até 400 m por causa do mapa da noite)
    expect(cmdTarget(undefined, 35, 0)).toBeNull();
    expect(cmdTarget(undefined, 0, -31)).toBeNull();
    expect(cmdTarget(undefined, 30, -30)).toEqual(v(30, -30));
    const map = { w: 190, h: 24, cells: new Uint8Array(190 * 24), home: v(1, 1) };
    expect(cmdTarget(map, 35, 10)).toEqual(v(35, 10));
    expect(cmdTarget(map, 500, -3)).toEqual(v(190, 0));
  });

  it('rejects bad commands', () => {
    expect(parseClientMessage('{"t":"move","x":NaN,"y":0,"seq":1}')).toBeNull();
    expect(p({ t: 'move', x: 1e9, y: 0, seq: 1 })).toBeNull();
    expect(p({ t: 'move', x: 1, y: 0, seq: -1 })).toBeNull();
    expect(p({ t: 'cast', spell: 'invisibility', x: 0, y: 0, seq: 1 })).toBeNull();
    expect(p({ t: 'start', bots: 8 })).toBeNull();
    expect(p({ t: 'hello', playerId: 'x', name: 'a' })).toBeNull();
    expect(p({ t: 'buy', spell: 'shield', extra: 'x'.repeat(3000) })).toBeNull();
    expect(p({ t: 'pick', character: 'dragon' })).toBeNull();
    for (const look of ['9000000', '0800000', '0000080', '0000005', '010001', '01000110', 'a100011', 100011, null]) expect(p({ t: 'look', look })).toBeNull();
    expect(p({ t: 'vote', kind: 'kick' })).toBeNull();
    expect(p({ t: 'vote', kind: 'kick', target: 'raw-player-id-123' })).toBeNull();
    expect(p({ t: 'vote', kind: 'ban', target: 'p1' })).toBeNull();
    expect(p({ t: 'vote', kind: 'mode', target: 'x' })).toBeNull();
    expect(p({ t: 'vote', kind: 'mode' })).toBeNull();
    expect(p({ t: 'ballot', yes: 'sim' })).toBeNull();
    expect(p({ t: 'resources', session: 'player-id', build: 'dev', geometries: 1, textures: 1 })).toBeNull();
    expect(p({ t: 'resources', session: '12345678-1234-1234-1234-123456789abc', build: 'dev', geometries: -1, textures: 1 })).toBeNull();
    expect(p({ t: 'resources', session: '12345678-1234-1234-1234-123456789abc', build: 'dev', geometries: 1, textures: 100_001 })).toBeNull();
    expect(p({ t: 'resources', session: '12345678-1234-1234-1234-123456789abc', build: 'dev', geometries: 1, textures: 1, heapBytes: 8_000_000_001 })).toBeNull();
    expect(parseClientMessage('nada')).toBeNull();
    expect(p([1, 2])).toBeNull();
  });

  it('start: configuração dos bots do treino', () => {
    const spells = { fireball: 0, rockpillar: 7, magnetize: 7, alteration: 7, boomerang: 7, windwalk: 7, splitter: 7 };
    const items = { ring: 6, cursed_ring: 6, shock_boots: 6, lava_boots: 6, warden: 6, wind_boots: 6 };
    expect(p({ t: 'start', bots: 3, setup: [{ spells: { lightning: 3 } }, {}, { items: { armor: 2 }, skill: { aim: 0.8 } }] }))
      .toEqual({ t: 'start', bots: 3, setup: [{ spells: { lightning: 3 } }, {}, { items: { armor: 2 }, skill: { aim: 0.8 } }] });
    // 7 bots com 6 magias no nível 7 e 6 itens no 6, e todas as opções: cabe na mensagem
    const full = { t: 'start', bots: 7, mode: 'deathmatch', opts: { shop: 120, economy: 2, startGold: 100, goal: 7, difficulty: 'normal', arena: 'random' }, setup: Array(7).fill({ spells, items }) };
    expect(JSON.stringify(full).length).toBeGreaterThan(1024);
    expect(p(full)).not.toBeNull();
    // 9 magias (a Bola de fogo e o Flagelo já vêm e contam), nível 8, item com nível 7, chave de skill desconhecida, 8 bots
    expect(p({ t: 'start', bots: 3, setup: [{ spells: { lightning: 1, homing: 1, shield: 1, teleport: 1, swap: 1, grip: 1, meteor: 1 } }] })).toBeNull();
    expect(p({ t: 'start', bots: 3, setup: [{ spells: { lightning: 8 } }] })).toBeNull();
    expect(p({ t: 'start', bots: 3, setup: [{ spells: { lightning: 1.5 } }] })).toBeNull();
    expect(p({ t: 'start', bots: 3, setup: [{ items: { armor: 7 } }] })).toBeNull();
    expect(p({ t: 'start', bots: 3, setup: [{ items: { sword: 1 } }] })).toBeNull();
    expect(p({ t: 'start', bots: 3, setup: [{ skill: { wallhack: 1 } }] })).toBeNull();
    expect(p({ t: 'start', bots: 3, setup: [{ skill: { toString: 1 } }] })).toBeNull();
    expect(p({ t: 'start', bots: 3, setup: [{ skill: { aim: 'x' } }] })).toBeNull();
    expect(p({ t: 'start', bots: 3, setup: Array(8).fill({}) })).toBeNull();
    expect(p({ t: 'start', bots: 3, setup: {} })).toBeNull();
    // skill fora da faixa é limitado: rate 999 vira o do Difícil, rate 0 vira o do Fácil, negativo vira 0
    expect(p({ t: 'start', bots: 1, setup: [{ skill: { rate: 999, dodge: -1 } }, { skill: { rate: 0 } }] }))
      .toEqual({ t: 'start', bots: 1, setup: [{ skill: { rate: 4, dodge: 0 } }, { skill: { rate: 1.5 } }] });
  });

  it('start: dificuldade de cada bot (só os valores da lista)', () => {
    expect(p({ t: 'start', bots: 2, setup: [{ difficulty: 'easy' }, { difficulty: 'auto', spells: { lightning: 1 } }] }))
      .toEqual({ t: 'start', bots: 2, setup: [{ difficulty: 'easy' }, { spells: { lightning: 1 }, difficulty: 'auto' }] });
    for (const difficulty of ['insane', 1, null, '']) expect(p({ t: 'start', bots: 1, setup: [{ difficulty }] })).toBeNull();
    // 7 bots com magias, itens e dificuldade: ainda cabe na mensagem
    const spells = { fireball: 0, rockpillar: 7, magnetize: 7, alteration: 7, boomerang: 7, windwalk: 7, splitter: 7 };
    const items = { ring: 6, cursed_ring: 6, shock_boots: 6, lava_boots: 6, warden: 6, wind_boots: 6 };
    expect(p({ t: 'start', bots: 7, mode: 'deathmatch', opts: { shop: 120, economy: 2, startGold: 100, goal: 7, difficulty: 'normal', arena: 'random' }, setup: Array(7).fill({ spells, items, difficulty: 'normal' }) })).not.toBeNull();
  });

  it('taunt: only fixed catalog entries including recordings (0..14)', () => {
    expect(p({ t: 'taunt', i: 0 })).toEqual({ t: 'taunt', i: 0 });
    expect(p({ t: 'taunt', i: 8 })).toEqual({ t: 'taunt', i: 8 });
    expect(p({ t: 'taunt', i: 9 })).toEqual({ t: 'taunt', i: 9 });
    expect(p({ t: 'taunt', i: 10 })).toEqual({ t: 'taunt', i: 10 });
    expect(p({ t: 'taunt', i: 14 })).toEqual({ t: 'taunt', i: 14 });
    expect(p({ t: 'taunt', i: 23 })).toBeNull();
    expect(p({ t: 'taunt', i: 99 })).toBeNull();
    expect(p({ t: 'taunt', i: 100 })).toBeNull();
    expect(p({ t: 'taunt', i: -1 })).toBeNull();
  });

  it('cleans name', () => {
    expect(cleanName('<b>Zé</b> do Fogo e mais um nome comprido')).toBe('bZé/b do Fogo e mais');
    expect(cleanName('   ')).toBe('Mago');
  });

  it('snapshot round-trips positions within 0.01', () => {
    const w = newWorld(['a', 'b'], { a: noSpells(), b: noSpells() });
    w.wizards[0].pos = v(1.23456, -7.891);
    w.wizards[1].alive = false;
    w.wizards[0].shieldUntil = 5;
    const s = decodeSnap(JSON.parse(JSON.stringify(encodeSnap(w, 'a', 4, []))), ['a', 'b']);
    expect(s.wizards[0].pos.x).toBeCloseTo(1.23456, 2);
    expect(s.wizards[0].pos.y).toBeCloseTo(-7.891, 2);
    expect(s.wizards[0].shield).toBe(true);
    expect(s.wizards[1].alive).toBe(false);
  });

  it('snapshot: absorção da Investida vai só quando existe; runa do Escudo vai como efeito', () => {
    const w = newWorld(['a', 'b'], { a: noSpells(), b: noSpells() });
    expect(encodeSnap(w, 'a', 0, []).ab).toBeUndefined();
    Object.assign(w.wizards[0], { rune: 'shield', runeUntil: 5 });
    Object.assign(w.wizards[1], { rushUntil: 5, rushLeft: 11.5 });
    const s = decodeSnap(JSON.parse(JSON.stringify(encodeSnap(w, 'a', 0, []))), ['a', 'b']);
    expect([s.wizards[0].rushLeft, s.wizards[1].rushLeft]).toEqual([0, 12]);
    expect(s.wizards[0].status & 1048576).toBeTruthy();
    // acabou o tempo: some
    w.t = 6;
    expect(encodeSnap(w, 'a', 0, []).ab).toBeUndefined();
  });

  it('snapshot: tempo que falta dos efeitos vai só para quem recebe e só quando existe', () => {
    const w = newWorld(['a', 'b'], { a: noSpells(), b: noSpells() });
    w.t = 10;
    expect(encodeSnap(w, 'a', 0, []).fx).toBeUndefined();
    Object.assign(w.wizards[0], { slowUntil: 12.5, rune: 'fury', runeUntil: 30 });
    Object.assign(w.wizards[1], { windUntil: 14 });
    expect(encodeSnap(w, 'a', 0, []).fx).toEqual([4, 2.5, 524288, 20]);
    expect(encodeSnap(w, 'b', 0, []).fx).toEqual([1024, 4]);
    w.t = 31;
    expect(encodeSnap(w, 'a', 0, []).fx).toBeUndefined();
  });

  it('snapshot: chão dos choques e o efeito em quem pisa (queimando, lento, no redemoinho)', () => {
    const w = newWorld(['a', 'b', 'c'], { a: noSpells(), b: noSpells(), c: noSpells() });
    expect(encodeSnap(w, 'a', 0, []).zn).toBeUndefined();
    w.wizards[0].pos = v(-3, 0);
    w.wizards[1].pos = v(0, 0);
    w.wizards[2].pos = v(3, 0);
    w.zones.push({ pos: v(-3, 0), r: 1.5, kind: 'burn', until: 4.5 }, { pos: v(0, 0), r: 1.95, kind: 'slow', until: 4.5 }, { pos: v(3, 0), r: 1.2, kind: 'pull', until: 3 });
    w.t = 1;
    stepWorld(w, [], () => 0.5); // o passo da simulação marca quem está em cada chão
    w.t = 1;
    const s = decodeSnap(JSON.parse(JSON.stringify(encodeSnap(w, 'a', 0, []))), ['a', 'b', 'c']);
    expect(s.zones).toEqual([
      { pos: v(-3, 0), r: 1.5, kind: 'burn', left: 3.5 },
      { pos: v(0, 0), r: 1.95, kind: 'slow', left: 3.5 },
      { pos: v(3, 0), r: 1.2, kind: 'pull', left: 2 },
    ]);
    expect(s.wizards.map((z) => [z.status & 512, z.status & 4, z.status & 2097152])).toEqual([[512, 0, 0], [0, 4, 0], [0, 0, 2097152]]);
  });
});
