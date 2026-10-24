import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { CHARACTERS } from '../src/shared/characters.ts';
import { type Model } from '../src/client/scene.ts';
import { createBraceClip } from '../src/client/brace-pose.ts';
import { createAttackClip } from '../src/client/attack-pose.ts';

// o projeto não tem @types/node: só o tipo do que o teste usa
const { readFileSync } = (await import('node:fs' as string)) as { readFileSync(p: string): Uint8Array };

describe('Manter base com mão no chão', () => {
  it.each(CHARACTERS.map((c) => c.id))('gera pose sem alterar o asset: %s', async (id) => {
    const src = await load(id), idle = src.clips.find((c) => c.name === 'Idle')!;
    const before = src.scene.getObjectByName('hips')!.position.clone();
    const clip = createBraceClip(src.scene, idle);
    expect(clip).toBeTruthy();
    const pose = cloneSkinned(src.scene), mixer = new THREE.AnimationMixer(pose);
    mixer.clipAction(clip!).play(); mixer.update(0);
    pose.updateMatrixWorld(true);
    const point = (name: string) => pose.getObjectByName(THREE.PropertyBinding.sanitizeNodeName(name))!.getWorldPosition(new THREE.Vector3());
    const floor = Math.min(point('foot.l').y, point('foot.r').y);
    expect(point('hand.l').y - floor).toBeLessThan(.09);
    expect(point('hand.l').y - floor).toBeGreaterThan(-.03);
    expect(point('hand.r').y).toBeGreaterThan(point('hand.l').y + .1);
    const idlePose = cloneSkinned(src.scene), idleMixer = new THREE.AnimationMixer(idlePose);
    idleMixer.clipAction(idle).play(); idleMixer.update(0); idlePose.updateMatrixWorld(true);
    const idleHead = idlePose.getObjectByName('head')!.getWorldQuaternion(new THREE.Quaternion());
    const head = pose.getObjectByName('head')!.getWorldQuaternion(new THREE.Quaternion());
    const forwardHead = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -.2).multiply(idleHead);
    expect(head.angleTo(forwardHead)).toBeLessThan(.01); // olhar mais alto que repouso, sem erguer o corpo.
    const idleSpine = idlePose.getObjectByName('spine')!.getWorldQuaternion(new THREE.Quaternion());
    const spine = pose.getObjectByName('spine')!.getWorldQuaternion(new THREE.Quaternion());
    expect(spine.angleTo(idleSpine)).toBeCloseTo(.75);
    idleMixer.stopAllAction(); idleMixer.uncacheRoot(idlePose);
    expect(src.scene.getObjectByName('hips')!.position).toEqual(before);
    const shoot = src.clips.find((c) => c.name === 'Spellcast_Shoot')!, originalTimes = [...shoot.tracks[0].times];
    const invoke = createAttackClip(shoot);
    expect(invoke.duration).toBe(.4);
    expect(Math.max(...invoke.tracks.flatMap((track) => [...track.times]))).toBeCloseTo(.4);
    expect([...shoot.tracks[0].times]).toEqual(originalTimes);
    mixer.stopAllAction(); mixer.uncacheRoot(pose);
  });
});

// GLB sem as texturas (o node não decodifica imagem): refaz o arquivo com o JSON limpo e o mesmo bloco binário
async function load(id: string): Promise<Model> {
  const b = readFileSync(`public/models/${id}.glb`);
  const dv = new DataView(b.buffer, b.byteOffset);
  const len = dv.getUint32(12, true);
  const j = JSON.parse(new TextDecoder().decode(b.subarray(20, 20 + len)));
  delete j.images;
  delete j.textures;
  for (const m of j.materials) delete m.pbrMetallicRoughness?.baseColorTexture;
  const json = new TextEncoder().encode(JSON.stringify(j).padEnd(Math.ceil(JSON.stringify(j).length / 4) * 4));
  const bin = b.subarray(20 + len);
  const out = new Uint8Array(20 + json.length + bin.length);
  const o = new DataView(out.buffer);
  o.setUint32(0, 0x46546c67, true); // glTF
  o.setUint32(4, 2, true);
  o.setUint32(8, out.length, true);
  o.setUint32(12, json.length, true);
  o.setUint32(16, 0x4e4f534a, true); // JSON
  out.set(json, 20);
  out.set(bin, 20 + json.length); // tamanho e tipo do bloco BIN vêm junto
  const g = await new GLTFLoader().parseAsync(out.buffer, '');
  return { scene: g.scene, clips: g.animations };
}
