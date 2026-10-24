// Pose própria sobre o esqueleto KayKit: abaixa quadril, mantém pés e apoia a mão livre, sem editar o asset.
import * as T from 'three';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';

function worldTurn(bone: T.Object3D, delta: T.Quaternion) {
  const parent = bone.parent!.getWorldQuaternion(new T.Quaternion());
  const world = bone.getWorldQuaternion(new T.Quaternion());
  bone.quaternion.copy(parent.invert().multiply(delta).multiply(world));
  bone.updateWorldMatrix(false, true);
}
function limb(root: T.Object3D, middle: T.Object3D, end: T.Object3D, goal: T.Vector3, pole: T.Vector3) {
  const a = root.getWorldPosition(new T.Vector3()), b = middle.getWorldPosition(new T.Vector3()), c = end.getWorldPosition(new T.Vector3());
  const l1 = a.distanceTo(b), l2 = b.distanceTo(c), d = goal.clone().sub(a);
  const distance = T.MathUtils.clamp(d.length(), Math.abs(l1 - l2) + .00001, l1 + l2 - .00001);
  d.normalize();
  const normal = pole.clone().addScaledVector(d, -pole.dot(d)).normalize();
  const along = (l1 * l1 - l2 * l2 + distance * distance) / (2 * distance);
  const bend = a.clone().addScaledVector(d, along).addScaledVector(normal, Math.sqrt(Math.max(0, l1 * l1 - along * along)));
  worldTurn(root, new T.Quaternion().setFromUnitVectors(b.sub(a).normalize(), bend.sub(a).normalize()));
  const p = middle.getWorldPosition(new T.Vector3()), tip = end.getWorldPosition(new T.Vector3());
  worldTurn(middle, new T.Quaternion().setFromUnitVectors(tip.sub(p).normalize(), goal.clone().sub(p).normalize()));
}

export function createBraceClip(model: T.Object3D, idle: T.AnimationClip): T.AnimationClip | null {
  const pose = clone(model);
  const mixer = new T.AnimationMixer(pose);
  mixer.clipAction(idle).play(); mixer.update(0);
  pose.updateMatrixWorld(true);
  const get = (name: string) => pose.getObjectByName(T.PropertyBinding.sanitizeNodeName(name));
  const hips = get('hips'), spine = get('spine'), left = get('hand.l');
  const head = get('head'), headFacing = head?.getWorldQuaternion(new T.Quaternion());
  const feet = [get('foot.l'), get('foot.r')];
  if (!hips || !spine || !left || feet.some((f) => !f)) return null;
  const targets = feet.map((f) => f!.getWorldPosition(new T.Vector3()));
  const floor = Math.min(...targets.map((p) => p.y));
  const height = hips.getWorldPosition(new T.Vector3()).y - floor;
  const localDown = new T.Vector3(0, height * .8, 0).divide(hips.parent!.getWorldScale(new T.Vector3()));
  hips.position.sub(localDown);
  hips.updateWorldMatrix(false, true);
  worldTurn(spine, new T.Quaternion().setFromAxisAngle(new T.Vector3(1, 0, 0), .75));
  // Olhar um pouco acima do repouso: só a cabeça sobe, tronco e mão continuam apoiados.
  if (head && headFacing) {
    const forward = new T.Quaternion().setFromAxisAngle(new T.Vector3(1, 0, 0), -.2).multiply(headFacing);
    worldTurn(head, forward.multiply(head.getWorldQuaternion(new T.Quaternion()).invert()));
  }
  for (const [i, side] of ['l', 'r'].entries()) {
    const upper = get(`upperleg.${side}`), lower = get(`lowerleg.${side}`);
    if (upper && lower) limb(upper, lower, feet[i]!, targets[i], new T.Vector3(0, 0, 1));
  }
  const upper = get('upperarm.l'), lower = get('lowerarm.l');
  if (!upper || !lower) return null;
  const goal = upper.getWorldPosition(new T.Vector3()).add(new T.Vector3(0, 0, height * .12));
  goal.y = floor + height * .03;
  limb(upper, lower, left, goal, new T.Vector3(1, 0, 0));
  const tracks: T.KeyframeTrack[] = [];
  pose.traverse((b) => {
    if (!(b as T.Bone).isBone) return;
    tracks.push(new T.VectorKeyframeTrack(`${b.name}.position`, [0, 1], [...b.position.toArray(), ...b.position.toArray()]));
    tracks.push(new T.QuaternionKeyframeTrack(`${b.name}.quaternion`, [0, 1], [...b.quaternion.toArray(), ...b.quaternion.toArray()]));
  });
  mixer.stopAllAction(); mixer.uncacheRoot(pose);
  return new T.AnimationClip('Brace', 1, tracks);
}
