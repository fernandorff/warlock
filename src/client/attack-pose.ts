// Gesto próprio de invocação: reaproveita KayKit, comprimido para o preparo real do ataque.
import type { AnimationClip } from 'three';
import { BASIC_ATTACK } from '../shared/constants.ts';

export function createAttackClip(source: AnimationClip): AnimationClip {
  const clip = source.clone();
  clip.name = 'Attack_Invoke';
  for (const track of clip.tracks) for (let i = 0; i < track.times.length; i++) track.times[i] *= BASIC_ATTACK.windup / source.duration;
  clip.duration = BASIC_ATTACK.windup;
  return clip;
}
