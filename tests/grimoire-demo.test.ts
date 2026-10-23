import { describe, expect, it, vi } from 'vitest';
import { SCRIPTS, demoStep, demoWorld, runDemo, type DemoId } from '../src/client/demo.ts';
import { SPELLS, SPELL_IDS, type SpellId } from '../src/shared/spells.ts';
import type { SimEvent } from '../src/shared/sim.ts';

// roda o roteiro inteiro e junta os eventos
function run(id: DemoId): SimEvent[] {
  const s = demoWorld(id);
  const all: SimEvent[] = [];
  while (s.w.t <= s.script.end) {
    demoStep(s);
    all.push(...s.events);
  }
  return all;
}

describe('grimório: demonstrações com a simulação de verdade', () => {
  it('Atacar mostra preparo e as duas distâncias, com uma ordem por golpe', () => {
    const state = demoWorld('basic');
    expect(Math.hypot(state.w.wizards[2].pos.x - state.w.wizards[0].pos.x, state.w.wizards[2].pos.y - state.w.wizards[0].pos.y)).toBe(6);
    let prep = false, projectile = false;
    const events: SimEvent[] = [];
    while (state.w.t <= state.script.end) {
      demoStep(state);
      prep ||= !!state.w.wizards[0].basicCasting;
      projectile ||= state.w.projectiles.some((p) => p.kind === 'basic');
      events.push(...state.events);
    }
    expect(prep && projectile).toBe(true);
    expect(events.filter((e) => e.k === 'attack').map((e) => e.melee)).toEqual([true, false]);
    expect(state.w.wizards.slice(1).every((z) => z.hp < 1000)).toBe(true);
  });
  it('prévia do Raio mantém debuffs e recargas pausadas nos três inimigos por2s', () => {
    const state = demoWorld('lightning');
    while (state.w.t < 1) demoStep(state);
    const left = state.w.wizards.slice(1).map((z) => z.cd.fireball - state.w.t);
    while (state.w.t < 2) demoStep(state);
    for (const [i, z] of state.w.wizards.slice(1).entries()) {
      expect(z.electroUntil).toBeGreaterThan(state.w.t);
      expect(z.cd.fireball - state.w.t).toBeCloseTo(left[i]);
    }
    while (state.w.t < 3) demoStep(state);
    expect(state.w.wizards.slice(1).every((z) => state.w.t >= z.electroUntil!)).toBe(true);
  });
  it('prévia do Raio mostra três inimigos, saltos de alcance fixo e dano100/50/25 sem repetir', () => {
    const events = run('lightning');
    const hits = events.filter((e): e is Extract<SimEvent, { k: 'hit' }> => e.k === 'hit' && e.src === 'lightning');
    expect(hits.map((e) => e.id)).toEqual(['b', 'c', 'd']);
    expect(hits.map((e) => e.dmg)).toEqual([70, 35, 18]);
    expect(events.filter((e) => e.k === 'lightning')).toHaveLength(3);
  });
  it('has a demo for every spell, the Aegis and the clash', () => {
    for (const id of [...SPELL_IDS, 'aegis', 'clash'] as DemoId[]) expect(SCRIPTS[id], id).toBeTruthy();
  });

  it('casts the spell of the page, and damage spells hit a training wizard', () => {
    for (const id of SPELL_IDS) {
      const ev = run(id);
      expect(ev.some((e) => e.k === 'cast' && e.id === 'a' && e.spell === id), `${id} não foi lançada`).toBe(true);
      const L = SPELLS[id as SpellId].levels[0];
      if (L.dmg > 0 || L.dot > 0) expect(ev.some((e) => e.k === 'hit' && e.by === 'a' && e.id !== 'a' && e.dmg > 0), `${id} não acertou ninguém`).toBe(true);
    }
  });

  it('shows what the defensive spells and items do', () => {
    expect(run('shield').some((e) => e.k === 'reflect' && e.id === 'a')).toBe(true);
    expect(run('rockpillar').some((e) => e.k === 'pillar')).toBe(true);
    expect(run('teleport').some((e) => e.k === 'teleport' && e.id === 'a')).toBe(true);
    expect(run('alteration').some((e) => e.k === 'teleport' && e.id === 'a')).toBe(true);
    expect(run('illusion').some((e) => e.k === 'hit' && e.by === 'a')).toBe(false); // a cópia não causa dano; o inimigo lança um míssil.
    expect(run('warpzone').some((e) => e.k === 'hit' && e.id === 'a')).toBe(false);
    expect(run('grip').some((e) => e.k === 'grip')).toBe(true);
    expect(run('scourge').some((e) => e.k === 'scourge' && e.id === 'a')).toBe(true);
    expect(run('aegis').some((e) => e.k === 'aegis' && e.id === 'b')).toBe(true);
    expect(run('clash').some((e) => e.k === 'clash' && e.combo === 'fire')).toBe(true);
  });
});

// requestAnimationFrame de mentira: os quadros pedidos ficam numa fila e rodam quando o teste manda
function fakeRaf() {
  const queue: ((now: number) => void)[] = [];
  const raf = (f: (now: number) => void) => queue.push(f);
  const frame = (now: number) => queue.splice(0).forEach((f) => f(now));
  return { queue, raf, frame };
}

describe('dica: demonstração liga ao abrir e desliga ao fechar', () => {
  it('anima enquanto a dica está aberta e não deixa laço vivo depois de fechar', () => {
    const { queue, raf, frame } = fakeRaf();
    const tick = vi.fn();
    let open = true;
    runDemo(tick, () => open, false, raf);
    frame(16);
    frame(32);
    expect(tick).toHaveBeenCalledTimes(2);
    expect(queue.length).toBe(1); // próximo quadro já pedido
    open = false; // fechou a dica (ou trocou: o canvas saiu da página)
    frame(48);
    expect(tick).toHaveBeenCalledTimes(2);
    expect(queue.length).toBe(0);
  });

  it('com movimento reduzido desenha só o primeiro quadro', () => {
    const { queue, raf, frame } = fakeRaf();
    const tick = vi.fn();
    runDemo(tick, () => true, true, raf);
    frame(16);
    expect(tick).toHaveBeenCalledTimes(1);
    expect(queue.length).toBe(0);
  });
});
