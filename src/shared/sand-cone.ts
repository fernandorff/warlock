import { dist, dot, sub, type Vec } from './vec.ts';

export function conePoints(from: Vec, dir: Vec, length: number, width: number): [Vec, Vec, Vec] {
  const end = { x: from.x + dir.x * length, y: from.y + dir.y * length };
  return [from, { x: end.x - dir.y * width / 2, y: end.y + dir.x * width / 2 }, { x: end.x + dir.y * width / 2, y: end.y - dir.x * width / 2 }];
}
// Triângulo fechado e contato do corpo com suas bordas: a mira e o acerto usam a mesma área.
export function inCone(from: Vec, dir: Vec, length: number, width: number, p: Vec, radius = 0) {
  const q = sub(p, from), x = dot(q, dir), y = Math.abs(q.x * dir.y - q.y * dir.x);
  if (x >= 0 && x <= length && y <= x * width / (2 * length)) return true;
  const pts = conePoints(from, dir, length, width);
  return pts.some((a, i) => {
    const d = sub(pts[(i + 1) % 3], a), v = sub(p, a), t = Math.max(0, Math.min(1, dot(v,d) / dot(d,d)));
    return dist(p, {x:a.x+d.x*t,y:a.y+d.y*t}) <= radius + 1e-8;
  });
}
