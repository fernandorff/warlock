import { describe,expect,it } from 'vitest';
import * as THREE from 'three';
import { blindOpacity,blindnessMask } from '../src/client/blindness-fx.ts';
describe('vinheta de cegueira em metros',()=>{
  it('centro claro, transição suave e exterior preto a3m',()=>{
    expect(blindOpacity(0)).toBe(0);expect(blindOpacity(2.4)).toBe(0);
    expect(blindOpacity(2.7)).toBeCloseTo(.5);expect(blindOpacity(3)).toBe(1);expect(blindOpacity(20)).toBe(1);
  });
  it('usa inversas reais da câmera, sem raio fixo em pixels nem outro jogador como centro',()=>{
    const cam=new THREE.PerspectiveCamera(40,16/9,.5,200),mask=blindnessMask(cam);
    expect(mask.material.uniforms.radius.value).toBe(3);
    expect(mask.material.uniforms.invProjection.value).toBe(cam.projectionMatrixInverse);
    cam.zoom=2;cam.updateProjectionMatrix();
    expect(mask.material.uniforms.invProjection.value).toBe(cam.projectionMatrixInverse);
    expect(mask.material.depthTest).toBe(false);expect(mask.visible).toBe(false);
    mask.geometry.dispose();mask.material.dispose();
  });
});
