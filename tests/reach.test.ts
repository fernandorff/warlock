import { describe, expect, it } from 'vitest';
import { aimOf, blastOf, hitR, reachOf } from '../src/client/reach.ts';
import { OBSTACLES, PROJ_R, PROJ_SPAWN, WALL_GAP, WIZ_R } from '../src/shared/constants.ts';
import { noItems } from '../src/shared/items.ts';
import { snowR } from '../src/shared/sim.ts';
import { CLUSTER_FAN, LIGHTNING, RUSH, SPELL_IDS, SPLITTER, THRUST, noSpells, spellLevel } from '../src/shared/spells.ts';
import { v } from '../src/shared/vec.ts';

describe('círculo de alcance', () => {
  it('Agarrar mostra o alcance da marca e seu raio, sem o avanço de um projétil', () => {
    const spells = { ...noSpells(), grip: 1 };
    expect(reachOf('grip', spells, noItems())).toBeCloseTo(spellLevel('grip', 1).range);
    expect(reachOf('grip', spells, { ...noItems(), helmet: 1 })).toBeCloseTo(spellLevel('grip', 1).range * .9);
    expect(blastOf('grip', spells)).toBe(1.5);
    expect(blastOf('grip', noSpells())).toBe(0);
  });
  it('área no ponto mirado: raio da Zona de dobra no nível e meia largura da Barricada', () => {
    const spells = { ...noSpells(), warpzone: 3, rockpillar: 1 };
    expect(blastOf('warpzone', spells)).toBeCloseTo(spellLevel('warpzone', 3).radius);
    expect(blastOf('rockpillar', spells)).toBeCloseTo(WALL_GAP + OBSTACLES.rockpillar.r);
    expect([blastOf('warpzone', noSpells()), blastOf('rockpillar', noSpells())]).toEqual([0, 0]);
  });
  it('na mira, as magias de área mostram só o círculo no ponto mirado', () => {
    const spells = { ...noSpells(), grip: 1, warpzone: 1, rockpillar: 1 };
    for (const s of ['grip', 'warpzone', 'rockpillar'] as const) {
      const a = aimOf(s, spells, noItems(), v(0, 0), v(3, 0));
      expect([a.segs.length, a.blastR]).toEqual([0, blastOf(s, spells)]);
      expect(a.blastAt).toEqual(v(3, 0));
    }
  });
  it('mostra o alcance do nível atual; o Elmo encurta 10%', () => {
    const spells = { ...noSpells(), lightning: 3 };
    expect(reachOf('lightning', spells, noItems())).toBeCloseTo(spellLevel('lightning', 3).range);
    expect(reachOf('lightning', spells, { ...noItems(), helmet: 1 })).toBeCloseTo(spellLevel('lightning', 3).range * 0.9);
    expect(reachOf('lightning', noSpells(), noItems())).toBe(0); // não tem a magia
  });

  it('projétil: até onde a ponta chega (nasce na frente do mago e tem raio); Meteoro: explosão no ponto mirado (issue #82)', () => {
    const spells = { ...noSpells(), fireball: 1, snowball: 2, meteor: 3 };
    expect(reachOf('fireball', spells, noItems())).toBeCloseTo(spellLevel('fireball', 1).range + PROJ_SPAWN + PROJ_R);
    expect(reachOf('fireball', spells, { ...noItems(), helmet: 1 })).toBeCloseTo(spellLevel('fireball', 1).range * 0.9 + PROJ_SPAWN + PROJ_R);
    expect(reachOf('snowball', spells, noItems())).toBeCloseTo(spellLevel('snowball', 2).range + PROJ_SPAWN + snowR(2));
    expect(reachOf('meteor', spells, noItems())).toBeCloseTo(spellLevel('meteor', 3).range); // onde dá para mirar
    expect([blastOf('meteor', spells), blastOf('fireball', spells), blastOf('meteor', noSpells())]).toEqual([spellLevel('meteor', 3).radius, 0, 0]);
  });

  it('sem alcance fixo: raio da bolha do Escudo, avanço da Investida, explosão do Flagelo; nada no Míssil e no Pacto', () => {
    const all = Object.fromEntries(SPELL_IDS.map((s) => [s, 1])) as ReturnType<typeof noSpells>;
    expect(reachOf('shield', all, noItems())).toBeCloseTo(spellLevel('shield', 1).radius);
    expect(reachOf('rush', all, noItems())).toBe(RUSH.dash);
    expect(reachOf('scourge', all, noItems())).toBe(spellLevel('scourge', 1).radius);
    expect(reachOf('homing', all, noItems())).toBe(0);
    expect(reachOf('pact', all, noItems())).toBe(0);
    // toda magia com alcance mostra algo
    for (const s of SPELL_IDS) if (spellLevel(s, 1).range > 0) expect(reachOf(s, all, noItems())).toBeGreaterThan(0);
  });
});

describe('largura do acerto e explosão na mira (pedido do Fernando, 21/10)', () => {
  const from = v(0, 0), at = v(2, 0);
  const all = Object.fromEntries(SPELL_IDS.map((s) => [s, 1])) as ReturnType<typeof noSpells>;
  const reach = (s: Parameters<typeof reachOf>[0]) => reachOf(s, all, noItems());

  it('faixa da largura do projétil (corpo do inimigo encostou = acerto), até o alcance na direção da mira', () => {
    const fb = aimOf('fireball', all, noItems(), from, at);
    expect(fb.half).toBeCloseTo(PROJ_R);
    expect(fb.segs).toHaveLength(1);
    expect(fb.segs[0][1].x).toBeCloseTo(reach('fireball'));
    expect(fb.blastR).toBe(0);
    expect(aimOf('lightning', all, noItems(), from, at)).toMatchObject({ half: LIGHTNING.width, segs: [[from, v(reach('lightning'), 0)]] }); // largura extra do Raio
    expect(aimOf('snowball', all, noItems(), from, at).half).toBeCloseTo(snowR(1));
    for (const s of ['magnetize', 'bouncer', 'recharge', 'link', 'swap'] as const) expect(aimOf(s, all, noItems(), from, at).half).toBeCloseTo(PROJ_R);
  });

  it('Rajada de areia: triângulo único3×2 sem faixas de projétil', () => {
    const c = aimOf('cluster', all, noItems(), from, at);
    expect(c.segs).toHaveLength(0);
    expect(c.cone).toEqual([from,v(3,1),v(3,-1)]);
  });

  it('Bola de neve explode no fim do voo; Gravidade queima em volta do caminho e no fim; Meteoro no ponto mirado', () => {
    const sn = aimOf('snowball', all, noItems(), from, at);
    expect(sn.blastR).toBeCloseTo(spellLevel('snowball', 1).radius - WIZ_R); // ela pega pelo centro: o corpo encosta a WIZ_R antes
    expect(sn.blastAt!.x).toBeCloseTo(reach('snowball') - snowR(1));
    const g = aimOf('gravity', all, noItems(), from, at);
    expect(g.half).toBeCloseTo(spellLevel('gravity', 1).radius - WIZ_R);
    expect(g.blastR).toBeCloseTo(g.half);
    expect(g.blastAt!.x).toBeCloseTo(reach('gravity') - PROJ_R);
    const m = aimOf('meteor', all, noItems(), from, at);
    expect([m.segs, m.half, m.blastR, m.blastAt]).toEqual([[], 0, spellLevel('meteor', 1).radius, at]);
    expect(aimOf('meteor', all, noItems(), from, v(50, 0)).blastAt!.x).toBeCloseTo(reach('meteor')); // sem passar do alcance
  });

  it('Drenar e Estocada param no ponto mirado; Investida avança o fixo; Teleporte mostra o corpo onde aparece; sem faixa no Bumerangue, Míssil e magias sem mira', () => {
    expect(aimOf('drain', all, noItems(), from, at).segs[0][1].x).toBeCloseTo(2);
    expect(aimOf('thrust', all, noItems(), from, at)).toMatchObject({ segs: [[from, at]], half: WIZ_R + THRUST.reach });
    const r = aimOf('rush', all, noItems(), from, at);
    expect([r.segs[0][1].x, r.half]).toEqual([RUSH.dash, WIZ_R + 0.1]);
    expect(aimOf('teleport', all, noItems(), from, at)).toMatchObject({ segs: [], blastAt: at, blastR: WIZ_R });
    for (const s of ['boomerang', 'homing', 'shield', 'scourge', 'illusion', 'windwalk'] as const) expect(aimOf(s, all, noItems(), from, at)).toMatchObject({ segs: [], blastR: 0 });
  });

  it('Divisor: voa até o ponto mirado e solta 2 filhotes por onda, mais abertos na primeira', () => {
    const sp = aimOf('splitter', all, noItems(), from, at);
    expect(sp.segs).toHaveLength(1 + 2 * SPLITTER.waves);
    expect(sp.segs[0][1].x).toBeCloseTo(PROJ_SPAWN + 2); // estoura no ponto mirado (contado de onde nasce)
    const open = (i: number) => Math.abs(Math.atan2(sp.segs[i][1].y - sp.segs[i][0].y, sp.segs[i][1].x - sp.segs[i][0].x));
    expect(open(1)).toBeCloseTo(Math.atan(SPLITTER.spawnLife)); // primeira onda: a = spawnLife
    expect(open(1)).toBeGreaterThan(open(2 * SPLITTER.waves)); // última onda mais fechada
    expect(sp.segs[1][1].y).toBeCloseTo(-sp.segs[2][1].y); // simétricos
  });
});

describe('hitbox de verdade na sandbox (pedido do Fernando, 21/10)', () => {
  it('círculos que se encostam = acerto: mago e Ilusão com WIZ_R, projétil com o raio dele; sem círculo no que não bate', () => {
    expect([hitR('fireball'), hitR('shard'), hitR('swap'), hitR('snowball'), hitR('illusion')]).toEqual([PROJ_R, PROJ_R, PROJ_R, snowR(1), WIZ_R]);
    for (const k of ['meteor', 'warpzone', 'gravity'] as const) expect(hitR(k)).toBe(0);
  });
});
