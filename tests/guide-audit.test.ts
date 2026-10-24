import { describe, expect, it } from 'vitest';
import { demoStatus, demoStep, demoWorld, SCRIPTS, type DemoId } from '../src/client/demo.ts';
import { RULES_SHORT_EN, RULES_SHORT_PT } from '../src/client/rules-text.ts';
import { SPELL_ROWS, knockDistance } from '../src/client/tips.ts';
import { DT, KB_SOFT_CAP } from '../src/shared/constants.ts';
import { SHIELD, spellLevel } from '../src/shared/spells.ts';
import { moveWizard, type SimEvent, type Wizard } from '../src/shared/sim.ts';
import { v } from '../src/shared/vec.ts';

function play(id: DemoId) {
  const s = demoWorld(id), events: SimEvent[] = [];
  let stunned = false, gripped = false;
  while (s.w.t <= s.script.end) {
    demoStep(s); events.push(...s.events);
    stunned ||= s.w.wizards.some((z) => (z.stunLeft ?? 0) > 0);
    gripped ||= s.w.wizards.some((z) => s.w.t < z.gripUntil);
  }
  return { s, events, stunned, gripped };
}

describe('auditoria de guias e prévias', () => {
  it('Empurrão demonstra recuperação em degraus e retorno normal sem impulso residual', () => {
    const s = demoWorld('knockback'), stages = new Set<number>();
    let recovered = false;
    while (s.w.t <= s.script.end) {
      demoStep(s);
      const z = s.w.wizards[1];
      const label = demoStatus(s.w, z).find((x) => x.startsWith('recuperação'));
      if (label) {
        stages.add(Number(label.match(/(\d+)%/)![1]));
        expect(z.vel).toEqual(v(0, 0));
      }
      if (stages.size > 0 && !label && z.target) recovered = true;
    }
    expect([...stages]).toEqual([50, 60, 70, 80, 90]);
    expect(recovered).toBe(true);
  });
  it.each([0, .8, 1.5, 3, 9])('distância exibida segue amortecimento e corte real para impulso%s', (knock) => {
    for (const dmg of [70, 140]) {
      const body = { pos: v(0, 0), vel: v(knock * (dmg > KB_SOFT_CAP ? Math.sqrt(KB_SOFT_CAP / dmg) : 1), 0), target: null } as Wizard;
      for (let i = 0; i < 3000 && body.vel.x > 0; i++) moveWizard(body, DT);
      expect(knockDistance(dmg, knock)).toBeCloseTo(body.pos.x, 8);
    }
  });
  it('Escudo explica também a redução de empurrão na descrição curta PT/EN', () => {
    expect(RULES_SHORT_PT.shield).toMatch(/empurr/);
    expect(RULES_SHORT_EN.shield).toMatch(/knockback/);
    const rows = SPELL_ROWS.shield.map(([name, f]) => [name, f(spellLevel('shield', 1))].join(':')).join(' ');
    expect(rows).toContain(String(SHIELD.knock * 100));
    expect(play('shield').events.some((e) => e.k === 'hit' && e.id === 'a' && e.src === 'meteor' && e.dmg === 0)).toBe(true);
  });
  it('Rajada de areia explica cone e status sem destruição de projéteis', () => {
    expect(RULES_SHORT_PT.cluster).toMatch(/Cone.*Cegueira/);
    expect(RULES_SHORT_EN.cluster).toMatch(/cone.*Blindness/);
    expect(play('cluster').events.some((e) => e.k === 'sand')).toBe(true);
    expect(play('cluster').events.some((e) => e.k === 'clash')).toBe(false);
  });
  it('Meteoro demonstra stun e bloqueia tentativa de conjurar do alvo', () => {
    const { events, stunned } = play('meteor');
    expect(stunned).toBe(true);
    expect(SCRIPTS.meteor!.steps.some(([, who, what]) => who === 1 && what === 'fireball')).toBe(true);
    expect(events.some((e) => e.k === 'cast' && e.id === 'b')).toBe(false);
  });
  it('Agarrar demonstra magia permitida e mobilidade bloqueada enquanto preso', () => {
    const { events, gripped } = play('grip');
    expect(gripped).toBe(true);
    expect(events.some((e) => e.k === 'cast' && e.id === 'c' && e.spell === 'shield')).toBe(true);
    expect(events.some((e) => e.k === 'cast' && e.id === 'b' && e.spell === 'teleport')).toBe(false);
  });
  it('Manter base possui roteiro próprio, pausa recarga só após preparo e libera ao soltar', () => {
    expect(SCRIPTS['brace' as DemoId]).toBeTruthy();
    const s = demoWorld('brace' as DemoId);
    while (s.w.t < .8) demoStep(s);
    const before = s.w.wizards[0].cd.fireball - s.w.t;
    while (s.w.t < 1.1) demoStep(s);
    const start = s.w.wizards[0].cd.fireball - s.w.t;
    expect(start).toBeLessThan(before);
    while (s.w.t < 1.5) demoStep(s);
    expect(s.w.wizards[0].cd.fireball - s.w.t).toBeCloseTo(start);
    while (s.w.t < s.script.end) demoStep(s);
    expect(s.w.wizards[0].cd.fireball - s.w.t).toBeLessThan(start);
  });
  it('Ilusão mostra dono invisível tomando outro caminho, cópia reta e míssil enganado', () => {
    const s = demoWorld('illusion');
    let decoyTarget = false, separated = false, hidden = false;
    while (s.w.t <= s.script.end) {
      demoStep(s);
      const owner = s.w.wizards[0], copy = s.w.projectiles.find((p) => p.kind === 'illusion');
      hidden ||= demoStatus(s.w, owner).some((label) => label.includes('invisível'));
      separated ||= !!copy && Math.hypot(copy.pos.x - owner.pos.x, copy.pos.y - owner.pos.y) > 1;
      decoyTarget ||= s.w.projectiles.some((p) => p.kind === 'homing' && p.decoy !== undefined);
    }
    expect(hidden, 'dono invisível').toBe(true);
    expect(separated, 'trajetórias diferentes').toBe(true);
    expect(decoyTarget, 'míssil acerta a cópia').toBe(true);
  });
});
