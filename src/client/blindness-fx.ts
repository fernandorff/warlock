import * as THREE from 'three';
import { BLINDNESS } from '../shared/spells.ts';

export function blindOpacity(distance: number) {
  const t = Math.max(0,Math.min(1,(distance-(BLINDNESS.radius-BLINDNESS.feather))/BLINDNESS.feather));
  return t*t*(3-2*t);
}
// Projeta cada pixel de volta ao chão: raio em metros permanece igual com zoom/perspectiva.
export function blindnessMask(camera: THREE.PerspectiveCamera) {
  const mat = new THREE.ShaderMaterial({
    transparent:true, depthTest:false, depthWrite:false, toneMapped:false,
    uniforms:{ center:{value:new THREE.Vector2()}, invProjection:{value:camera.projectionMatrixInverse}, cameraWorld:{value:camera.matrixWorld}, radius:{value:BLINDNESS.radius}, feather:{value:BLINDNESS.feather} },
    vertexShader:`varying vec2 uvScreen; void main(){ uvScreen=position.xy; gl_Position=vec4(position.xy,0.,1.); }`,
    fragmentShader:`varying vec2 uvScreen; uniform mat4 invProjection; uniform mat4 cameraWorld; uniform vec2 center; uniform float radius; uniform float feather;
      void main(){ vec4 p=invProjection*vec4(uvScreen,1.,1.); vec3 ray=(cameraWorld*vec4(p.xyz/p.w,0.)).xyz; vec3 eye=cameraWorld[3].xyz;
        float t=-eye.y/ray.y; vec2 ground=(eye+ray*t).xz; float a=t>0.?smoothstep(radius-feather,radius,length(ground-center)):1.; gl_FragColor=vec4(0.,0.,0.,a); }`
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2,2),mat);
  mesh.frustumCulled=false; mesh.renderOrder=10000; mesh.visible=false;
  return mesh;
}
