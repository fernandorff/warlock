// A aura e a prévia compartilham duração/cor; brilho curto não representa um bônus persistente.
export const HEAL_FX = { seconds: 1.5, color: '#8be36a', glow: '#c5ffb1' };
export function healAura(until: number, now: number) {
  const left = Math.max(0, Math.min(1, (until - now) / HEAL_FX.seconds));
  return { visible: left > 0, opacity: .7 * Math.min(1, left * 3), scale: 1.6 + .12 * Math.sin((1 - left) * Math.PI * 4) };
}
