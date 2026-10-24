import { describe, expect, it } from 'vitest';
import { HEAL_FX, healAura } from '../src/client/heal-fx.ts';
import main from '../src/client/main.ts?raw';
import scene from '../src/client/scene.ts?raw';

describe('aura e som de Curar', () => {
  it('não usa marcador de lançamento laranja e tem brilho próprio verde na mão', () => {
    expect(main).toContain("if (spell !== 'heal' && spell !== 'closedbody') scene.clickMarker(at, true)");
    expect(scene).toContain("spell === 'heal' ? HEAL_FX.color : LOOK[spell as keyof typeof LOOK]?.halo ?? '#ffb347'");
    expect(scene).toContain("spell === 'heal' ? HEAL_FX.glow : '#ffffff'");
  });
  it('aura verde pulsa por1,5s e desaparece sem deixar bônus persistente', () => {
    expect(HEAL_FX.color).toBe('#8be36a');
    const frames = [0, .2, .5, 1, 1.4, 1.5, 2].map(t => healAura(HEAL_FX.seconds, t));
    expect(frames.slice(0, 5).every(f => f.visible && f.opacity > 0)).toBe(true);
    expect(new Set(frames.slice(0, 5).map(f => f.scale)).size).toBeGreaterThan(2);
    expect(frames[4].opacity).toBeLessThan(frames[0].opacity);
    expect(frames.slice(5).every(f => !f.visible && f.opacity === 0)).toBe(true);
  });
  it('toca apenas no evento confirmado no alvo, com distância, e a aura acompanha o modelo', () => {
    expect(main).toContain("if (spell !== 'heal' && spell !== 'closedbody') sound.play(SPELL_SOUND[spell])");
    expect(main).toContain("if (e.k === 'heal') sound.play('heal', near(e.x, e.y))");
    expect(main).toContain("e.id !== me && e.spell !== 'heal'");
    expect(scene).toContain('healAura(m.healingUntil ?? 0, now)');
    expect(scene).toContain('m.aura.scale.setScalar(healing.visible ? healing.scale : 1.45)');
  });
});
