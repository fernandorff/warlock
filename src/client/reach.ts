// Círculo de alcance (pedido do Fernando, 18/10: o Raio acertava 13% nas partidas reais, suspeita de lançar fora dos 8 m):
// raio em metros da magia ou item no nível atual, com o multiplicador de alcance dos itens (Elmo); 0 = não mostra.
import { OBSTACLES, PROJ_R, PROJ_SPAWN, WALL_GAP, WIZ_R } from '../shared/constants.ts';
import { itemStats, type ItemId } from '../shared/items.ts';
import { snowR, type ProjKind } from '../shared/sim.ts';
import { conePoints } from '../shared/sand-cone.ts';
import { LIGHTNING, RUSH, SPLITTER, THRUST, spellLevel, type SpellId } from '../shared/spells.ts';
import { add, clampLen, len, norm, scale, sub, v, type Vec } from '../shared/vec.ts';

// projéteis que saem na frente do mago e voam o alcance: o anel marca até onde a ponta chega, então inimigo que encosta
// no anel é atingido (Fernando, 20/10, issue #82; antes ficava 0,8 m curto)
const FLIES = new Set<SpellId>(['fireball', 'snowball', 'magnetize', 'gravity', 'bouncer', 'drain', 'recharge', 'link', 'splitter']);

export function reachOf(a: SpellId, spells: Record<SpellId, number>, items: Record<ItemId, number>): number {
  const lvl = spells[a];
  if (!lvl) return 0;
  const L = spellLevel(a, lvl);
  if (a === 'scourge') return L.radius; // Flagelo: o raio da explosão
  // sem alcance fixo, o raio do efeito: a bolha do Escudo e o avanço da Investida
  if (a === 'shield') return L.radius;
  if (a === 'rush') return RUSH.dash;
  if (L.range <= 0) return 0;
  const r = L.range * (1 + itemStats(items).range);
  return FLIES.has(a as SpellId) ? r + PROJ_SPAWN + (a === 'snowball' ? snowR(lvl) : PROJ_R) : r;
}

// Área de efeito no ponto mirado: Meteoro, cipós do Agarrar, Zona de dobra e Barricada (pedido do Fernando, 21/10, PR #169); 0 = não tem.
export function blastOf(a: SpellId, spells: Record<SpellId, number>): number {
  if (!spells[a]) return 0; // magia não comprada
  // Barricada não tem raio: o círculo cobre a parede de 3 pedaços, que fica atravessada no ponto
  if (a === 'rockpillar') return WALL_GAP + OBSTACLES.rockpillar.r;
  return a === 'meteor' || a === 'grip' || a === 'warpzone' || a === 'geyser' ? spellLevel(a, spells[a]).radius : 0;
}

// largura do acerto na mira (pedido do Fernando, 21/10: ninguém sabia quanto o Raio e os projéteis pegam de lado):
// meia largura da faixa = raio do projétil, então o CORPO do inimigo que encosta na faixa é atingido (escolha do Fernando, 21/10:
// a faixa pelo centro do inimigo, WIZ_R mais larga de cada lado, parecia bem maior que a bola). É a conta do firstOnSegment em
// sim.ts (centro a WIZ_R + raio do projétil) vista pelo corpo; no Raio, a largura extra dele (LIGHTNING.width).
// Bumerangue (curva) e Míssil (persegue) ficam sem faixa: a reta mentiria.
const HALF: Partial<Record<SpellId, number>> = { lightning: LIGHTNING.width, ...Object.fromEntries(['fireball', 'cluster', 'magnetize', 'bouncer', 'recharge', 'link', 'swap', 'drain'].map((s) => [s, PROJ_R])) };

// trechos de faixa (de onde a onde) e o círculo da explosão, para a mira de `from` em direção a `at`
export function aimOf(a: SpellId, spells: Record<SpellId, number>, items: Record<ItemId, number>, from: Vec, at: Vec) {
  const reach = reachOf(a, spells, items);
  const lvl = spells[a as SpellId];
  const none = { segs: [] as [Vec, Vec][], half: 0, blastAt: null as Vec | null, blastR: 0, cone: null as [Vec, Vec, Vec] | null };
  if (!reach) return none;
  const d = norm(sub(at, from));
  const tip = (r: number) => add(from, scale(d, r));
  const aimed = add(from, clampLen(sub(at, from), reach)); // o ponto mirado, sem passar do alcance
  const line = (to: Vec, half: number) => ({ ...none, segs: [[from, to]] as [Vec, Vec][], half });
  // magias de área (Meteoro, Agarrar, Zona de dobra, Barricada): só o círculo no ponto mirado; Teleporte: o corpo onde você aparece
  const blastR = blastOf(a, spells);
  if (blastR) return { ...none, blastAt: aimed, blastR };
  if (a === 'teleport' || a === 'heal') return { ...none, blastAt: aimed, blastR: WIZ_R };
  // Drenar vira para o mago mais perto no ponto mirado: a reta só vale até ali
  if (a === 'drain') return line(aimed, HALF.drain!);
  // Investida avança RUSH.dash e acerta quem fica a 2 WIZ_R + 0,1 (sim.ts, dashHit): pelo corpo do inimigo, WIZ_R + 0,1 de cada lado
  if (a === 'rush') return line(tip(reach), WIZ_R + 0.1);
  // Estocada vai até o ponto mirado e acerta quem fica a 2 WIZ_R + THRUST.reach: pelo corpo, WIZ_R + THRUST.reach
  if (a === 'thrust') return line(aimed, WIZ_R + THRUST.reach);
  // a Bola de neve explode onde o voo acaba (centro dela, um raio antes da ponta) e pega pelo centro de quem está a menos de
  // radius: pelo corpo, o círculo fica WIZ_R menor
  if (a === 'snowball') return { ...line(tip(reach), snowR(lvl)), blastAt: tip(reach - snowR(lvl)), blastR: spellLevel('snowball', lvl).radius - WIZ_R };
  // a Gravidade não bate em ninguém: queima quem tem o centro a um radius do caminho (pelo corpo, WIZ_R a menos), até o fim do voo
  if (a === 'gravity') {
    const r = spellLevel('gravity', lvl).radius - WIZ_R;
    return { ...line(tip(reach), r), blastAt: tip(reach - PROJ_R), blastR: r };
  }
  if (a === 'cluster') return { ...none, cone: conePoints(from,d,reach,spellLevel(a,lvl).width*(1+itemStats(items).range)) };
  // Divisor: voa até o ponto mirado e estoura; o lançador segue devagar e solta 2 filhotes por onda, abrindo menos a cada uma
  // (a mesma conta de split/spawnShards em sim.ts: direção não normalizada, então os filhotes de fora vão mais curto)
  if (a === 'splitter') {
    const split = tip(PROJ_SPAWN + Math.min(spellLevel('splitter', lvl).range * (1 + itemStats(items).range), len(sub(at, from))));
    const segs: [Vec, Vec][] = [[from, split]];
    for (let j = 1; j <= SPLITTER.waves; j++) {
      const k = SPLITTER.spawnLife * ((SPLITTER.waves - j + 1) / SPLITTER.waves);
      const s0 = add(split, scale(d, SPLITTER.spawnSpeed * SPLITTER.spawnLife * (j / SPLITTER.waves)));
      for (const sd of [-1, 1]) segs.push([s0, add(s0, scale(v(d.x - sd * d.y * k, d.y + sd * d.x * k), (SPLITTER.childSpeed * SPLITTER.childLife) / (1 + k)))]);
    }
    return { ...none, segs, half: PROJ_R };
  }
  const half = HALF[a as SpellId];
  return half === undefined ? none : line(tip(reach), half);
}

// "Ver hitbox (teste)" da sandbox: raio no chão de cada coisa, escolhido para que círculos que se encostam = acerto
// (firstOnSegment testa centro a centro com WIZ_R + raio do projétil). A Bola de neve usa o nível 1 (no 7 são 8 cm a mais);
// Meteoro, Zona de dobra e Gravidade não batem em mago e já mostram a própria área
export const hitR = (k: ProjKind) => (k === 'illusion' ? WIZ_R : k === 'snowball' ? snowR(1) : k === 'meteor' || k === 'warpzone' || k === 'gravity' || k === 'geyser' ? 0 : PROJ_R);
