import { WIZ_R } from './constants.ts';
import { dist, type Vec } from './vec.ts';

type Unit = { id: string; pos: Vec; alive: boolean; team?: number | null };
// Seleção no corpo, não autocura ao clicar no chão: mesma validação no cliente e servidor.
export function healTarget<T extends Unit>(units: readonly T[], caster: Unit, at: Vec, range: number): T | undefined {
  let best: T | undefined, gap = WIZ_R + .15;
  for (const unit of units) {
    if (!unit.alive || (unit.id !== caster.id && (caster.team == null || unit.team !== caster.team))) continue;
    if (dist(caster.pos, unit.pos) > range + 1e-9) continue;
    const d = dist(at, unit.pos);
    if (d <= gap && (!best || d < gap)) { best = unit; gap = d; }
  }
  return best;
}
