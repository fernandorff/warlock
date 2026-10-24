import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });
describe('guias nas duas línguas', () => {
  it.each(['pt', 'en'])('descrição, ficha e prévia usam números reais em%s', async (lang) => {
    vi.resetModules();
    vi.stubGlobal('localStorage', { getItem: (key: string) => key === 'warlock:lang' ? lang : null });
    const { MECHANIC_GUIDES, NEGATIVE_GUIDES, RULES_SHORT } = await import('../src/client/rules-text.ts');
    const { spellTip } = await import('../src/client/tips.ts');
    expect(RULES_SHORT.geyser).toContain(lang === 'pt' ? 'Invoca no chão' : 'ground geyser');
    expect(RULES_SHORT.geyser).toContain(lang === 'pt' ? 'invulneráveis' : 'invulnerable');
    expect(spellTip('geyser',1)).toContain('data-demo="geyser"');
    expect(spellTip('geyser',1)).toContain(lang === 'pt' ? '2,5' : '2.5');
    expect(spellTip('geyser',1)).toContain('20');
    expect(RULES_SHORT.heal).toContain('45');
    expect(RULES_SHORT.heal).toContain(lang === 'pt' ? 'você ou um aliado' : 'yourself or an ally');
    expect(spellTip('heal', 1)).toContain(lang === 'pt' ? 'Cura' : 'Healing');
    for (const value of ['45', '51', '20', '19', '10']) expect(spellTip('heal', 1)).toContain(value);
    expect(spellTip('heal', 1)).toContain('data-demo="heal"');
    expect(MECHANIC_GUIDES.map((g) => g.title)).toEqual(lang === 'pt' ? ['Atacar', 'Manter base'] : ['Attack', 'Hold ground']);
    expect(NEGATIVE_GUIDES).toHaveLength(10);
    expect(new Set(NEGATIVE_GUIDES.map((g) => g.id)).size).toBe(10);
    for (const g of NEGATIVE_GUIDES) {
      expect(g.text.length).toBeGreaterThan(80);
      expect(g).not.toHaveProperty('demo');
    }
    const knock = NEGATIVE_GUIDES.find((g) => g.id === 'status-knockback')!;
    expect(knock.title).toBe(lang === 'pt' ? 'Empurrão (knockback)' : 'Knockback');
    expect(knock.text).toContain('50%');
    expect(knock.text).toContain('100%');
    expect(knock.text).toContain(lang === 'pt' ? '0,2 s' : '0.2 s');
    expect(RULES_SHORT.meteor).toContain(lang === 'pt' ? '1,25' : '1.25');
    expect(spellTip('meteor', 1)).toContain(lang === 'pt' ? '1,15' : '1.15');
    expect(spellTip('meteor', 1)).toContain(lang === 'pt' ? '1,25' : '1.25');
    expect(spellTip('shield', 1)).toContain('60%');
  });
});
