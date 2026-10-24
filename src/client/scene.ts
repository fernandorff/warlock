// Cena 3D: lava, arena de pedra que encolhe, magos (KayKit), projéteis e efeitos.
// Coordenadas: o plano da simulação (x, y) vira (x, 0, y) no Three.js.
import * as THREE from 'three';
import { ELECTROCUTED_BIT, BRACING_BIT } from '../shared/constants.ts';
import { createBraceClip } from './brace-pose.ts';
import { createAttackClip } from './attack-pose.ts';
import { electroPulse } from './screen-data.ts';
import { HEAL_FX, healAura } from './heal-fx.ts';
import { blindnessMask } from './blindness-fx.ts';
import { conePoints } from '../shared/sand-cone.ts';
import { GEYSER_FX, geyserHeight } from './geyser-fx.ts';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { RenderPixelatedPass } from 'three/examples/jsm/postprocessing/RenderPixelatedPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { SHAPES as ARENAS, edgeAt, inLavaAt, type ArenaId, type Isle } from '../shared/arena.ts';
import { ARENA_STEP, CHEST, ISLAND, OBSTACLES, RUNE, SHRINK_WARN, SWORDS, WIZ_R, type RoundEffectId, type RuneKind } from '../shared/constants.ts';
import { lookBody, lookOf, lookPieces, type CharacterId } from '../shared/characters.ts';
import type { MatchOpts } from '../shared/match.ts';
import type { ProjKind, SimEvent } from '../shared/sim.ts';
import type { PillarView, ProjView, RuneView, ZoneKind, ZoneView } from '../shared/snapshot.ts';
import { add, clampLen, len, scale, sub, v, type Vec } from '../shared/vec.ts';
import { createDecor } from './decor.ts';
import { t } from './i18n.ts';
import { BAD_STATUS, ICON, ITEM_ICON, RUNE_ICON, STATUS_ICONS, UI_ICON, el, fxClock, icon } from './icons.ts';
import { BLINDNESS, LIGHTNING, SPELLS } from '../shared/spells.ts';
import type { TAUNTS } from '../shared/taunts.ts';

// cor de cada lugar (0..7) e o giro de matiz que leva o roxo do mago até ela
export const COLORS = ['#e5484d', '#3e8ef7', '#30a46c', '#f5d90a', '#a26bf5', '#12c7c7', '#f76b15', '#e93d82'];
// modo Times: Azul e Vermelho (anel no chão e barra de vida)
export const TEAM_COLORS = ['#3b82f6', '#ef4444'];
// dificuldade dos bots, curta (rótulo em cima do mago e placar do canto)
export const BOT_LEVEL: Record<MatchOpts['difficulty'], string> = { easy: t('Fácil', 'Easy'), casual: 'Casual', normal: 'Normal', veteran: t('Veterano', 'Veteran'), hard: t('Difícil', 'Hard'), auto: 'Auto' };

// xp: Ascensão, nível e quanto do nível já encheu (liveLevel), para a barrinha embaixo da vida
// place: colocação no placar (1 a 3) para a medalha à esquerda do nome (todos os modos, fora da sandbox)
export type WizDraw = { closedBodyLeft?: number; geyserLeft?: number; place?: number; xp?: { level: number; frac: number } | null; id: string; pos: Vec; facing: number; hp: number; hpMax: number; status: number; alive: boolean; shield: boolean; shieldR?: number; rushLeft?: number; basicLeft?: number; basicMelee?: boolean; regen?: number; bot?: MatchOpts['difficulty'] | null; loot?: number; color: number; character: string; look?: string; name: string; moving: boolean; cheer: boolean; team?: number | null; illusion?: boolean; ghost?: boolean; fx?: number[] }; // ghost: meio transparente; fx: tempo dos meus efeitos (snap.fx), só no meu mago

// personagens KayKit: cada GLB carrega na primeira vez que alguém usa uma peça dele
export type Model = { scene: THREE.Group; clips: THREE.AnimationClip[] };
const files = new Map<string, Model>();
const loading = new Map<string, Promise<Model | null>>();
const failed = new Set<string>();
const gltf = new GLTFLoader();
export function loadFile(id: string): Promise<Model | null> {
  let p = loading.get(id);
  if (!p) {
    p = gltf.loadAsync(`/models/${id}.glb`).then((g) => {
      const m = { scene: g.scene, clips: g.animations };
      files.set(id, m);
      return m;
    }, () => (failed.add(id), null)); // não tenta de novo a cada quadro; a aparência cai para o mago padrão
    loading.set(id, p);
  }
  return p;
}
const lookFiles = (look: string) => [...new Set([lookBody(look), ...lookPieces(look).map((x) => x.from)])];
export const loadLook = (look: string) => Promise.all(lookFiles(look).map(loadFile)).then(() => {});

// aparência montada: o esqueleto (e as animações) vêm do arquivo do Tronco; as malhas skinadas das outras peças são religadas a
// esses ossos pelo nome e as rígidas (chapéu, capa do mago, armas) presas ao osso de mesmo nome. Monta uma vez por aparência;
// cada mago clona a montagem (geometria e material ficam divididos com os GLB: não descartar)
const prefabs = new Map<string, Model>();
export function lookModel(look: string): Model | null {
  const hit = prefabs.get(look);
  if (hit) return hit;
  const ids = lookFiles(look);
  ids.forEach(loadFile);
  if (ids.some((id) => failed.has(id))) return look === lookOf('mage') ? null : lookModel(lookOf('mage'));
  if (!ids.every((id) => files.has(id))) return null;
  const m = assemble(look, (id) => files.get(id)!);
  prefabs.set(look, m);
  return m;
}
// Prévia e partida usam a mesma cópia, sem recolorir roupas pela vaga do jogador; efeitos só alteram materiais próprios.
export function cloneAppearance(source: THREE.Group): THREE.Group {
  const model = cloneSkinned(source) as THREE.Group;
  model.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map((m) => m.clone()) : mesh.material.clone();
  });
  return model;
}

export function assemble(look: string, file: (id: CharacterId) => Model): Model {
  const base = file(lookBody(look));
  const root = base.scene.clone();
  const meshes: THREE.Object3D[] = [];
  root.traverse((o) => (o as THREE.Mesh).isMesh && meshes.push(o));
  for (const o of meshes) o.removeFromParent();
  const byName = new Map<string, THREE.Object3D>();
  root.traverse((o) => byName.set(o.name, o));
  for (const piece of lookPieces(look)) {
    for (const name of piece.nodes) {
      const src = file(piece.from).scene.getObjectByName(name);
      if (!src?.parent) continue;
      const part = src.clone();
      if ((part as THREE.SkinnedMesh).isSkinnedMesh) {
        const sk = part as THREE.SkinnedMesh;
        sk.bind(new THREE.Skeleton(sk.skeleton.bones.map((b) => byName.get(b.name) as THREE.Bone), sk.skeleton.boneInverses), sk.bindMatrix);
      }
      byName.get(src.parent.name)?.add(part);
    }
  }
  root.updateMatrixWorld(true);
  return { scene: root, clips: base.clips };
}

const w3 = (p: Vec, y = 0) => new THREE.Vector3(p.x, y, p.y);
// deita no chão (plano xz) na altura y
const ground = <T extends THREE.Object3D>(o: T, y: number) => {
  o.rotation.x = -Math.PI / 2;
  o.position.y = y;
  return o;
};

// chão da arena: o contorno da forma (arena.ts, escala 1) com 4 cm de espessura, quase rente à lava (a borda derretida
// é desenhada pelos shaders, ver SHORE_GLSL); a malha é escalada pelo raio atual
function floorGeo(id: ArenaId) {
  const [outer, ...holes] = ARENAS[id].outline; // toda forma tem um contorno de fora (o anel tem um buraco)
  const shape = new THREE.Shape(outer.map((p) => new THREE.Vector2(p.x, p.y)));
  shape.holes = holes.map((h) => new THREE.Path(h.map((p) => new THREE.Vector2(p.x, p.y))));
  const g = new THREE.ExtrudeGeometry(shape, { depth: 0.04, bevelEnabled: false });
  g.rotateX(Math.PI / 2); // (x, y) da forma vira (x, z) do mundo, a espessura para baixo; o topo em y = 0
  return g;
}
// distância com sinal até a borda da forma (arena.ts sdf, escala 1) numa textura 256×256 que cobre ±SDF_SPAN:
// os shaders da pedra e da lava leem a mesma distância, então a borda derretida casa dos dois lados
const SDF_N = 256, SDF_CLAMP = 0.3;
const sdfSpan = (id: ArenaId) => ARENAS[id].reach + 0.35;
function sdfTexture(id: ArenaId) {
  const S = sdfSpan(id), data = new Uint8Array(SDF_N * SDF_N * 4);
  for (let j = 0; j < SDF_N; j++) for (let i = 0; i < SDF_N; i++) {
    const d = ARENAS[id].sdf(((i + 0.5) / SDF_N) * 2 * S - S, ((j + 0.5) / SDF_N) * 2 * S - S);
    data[(j * SDF_N + i) * 4] = Math.round((Math.max(-1, Math.min(1, d / SDF_CLAMP)) * 0.5 + 0.5) * 255);
  }
  const t = new THREE.DataTexture(data, SDF_N, SDF_N);
  t.magFilter = t.minFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}
// GLSL comum: shoreDist(xz) = metros até a borda, positivo na lava; vnoise = ruído de valor barato
const SHORE_GLSL = `
uniform sampler2D uSdf; uniform float uSpan; uniform float uR; uniform float uShoreTime; uniform float uLick; uniform float uWarn;
uniform vec3 uTint; uniform float uTintK;
float shoreDist(vec2 xz){ vec2 uv = (xz / uR + uSpan) / (2.0 * uSpan); return (texture2D(uSdf, uv).r * 2.0 - 1.0) * ${SDF_CLAMP.toFixed(2)} * uR; }
float shash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(shash(i), shash(i + vec2(1, 0)), u.x), mix(shash(i + vec2(0, 1)), shash(i + vec2(1, 1)), u.x), u.y); }
// lava lambendo a borda: a linha onde a pedra derrete sobe e desce uns centímetros, devagar (parada no modo leve)
float shoreLick(vec2 xz){ return uLick * (0.08 + 0.07 * sin(uShoreTime * 1.6 + xz.x * 1.7 + xz.y * 1.3) * sin(uShoreTime * 0.9 - xz.x * 0.8 + xz.y * 2.1)); }
`;
// faixa no chão entre dois contornos de mesmo número de pontos (a e b); keep diz se o quadrilátero entra (pelo meio dele)
function bandGeo(pairs: [Vec[], Vec[]][], keep: (m: Vec) => boolean = () => true) {
  const pos: number[] = [];
  for (const [a, b] of pairs) for (let i = 0; i < a.length; i++) {
    const j = (i + 1) % a.length;
    if (!keep(scale(add(add(a[i], a[j]), add(b[i], b[j])), 0.25))) continue;
    for (const p of [a[i], a[j], b[j], a[i], b[j], b[i]]) pos.push(p.x, 0, p.y);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return g;
}

// clips que repetem (o resto toca uma vez e para no último quadro)
const LOOPS = ['Idle', 'Running_A', 'Jump_Idle', 'Cheer', 'Waving', 'Brace'];
// gesto da provocação pelo tom: deboche, festa ou aviso [clip, segundos]
const TEASE: [string, number] = ['Skeletons_Taunt', 1.03], PARTY: [string, number] = ['Cheer', 1.67], CALL: [string, number] = ['Waving', 2.1];
const TAUNT_ANIM: Record<(typeof TAUNTS)[number]['id'], [string, number]> = {
  loser: TEASE, laugh: TEASE, meow: TEASE, flawless: PARTY, combo_breaker: PARTY, multi_kill: PARTY, ultra_kill: PARTY, congrats: PARTY,
  fire_in_the_hole: CALL, look_out: CALL,
  fausto: CALL, emafia: TEASE, meestruparam: TEASE, usarameabusaram: TEASE, lanchado: PARTY,
};
// Teleporte (só visual): some em TP s deslizando TP_SLIDE m rumo ao destino e reaparece em TP s chegando na mesma direção
const TP = 0.12, TP_SLIDE = 0.6;

type Mage = {
  root: THREE.Group;
  mixer: THREE.AnimationMixer;
  actions: Record<string, THREE.AnimationAction>;
  current: string;
  oneShotUntil: number;
  ring: THREE.Mesh;
  shield: THREE.Mesh;
  aura: THREE.Mesh; // anel no chão: dourado invulnerável, azul com Escudo de runa
  vines: THREE.Group;
  bar: HTMLDivElement;
  absRush: HTMLDivElement;
  extraEl: HTMLSpanElement; // números pequenos ao lado da barra: regeneração por segundo e o que os escudos ainda absorvem
  extraKey: string;
  aegisEl: HTMLElement;
  shieldBar: HTMLDivElement; // tempo que falta do Escudo
  shieldFill: HTMLDivElement;
  shieldSince: number;
  prevHp: number; // cura: vida do quadro anterior, quando subiu e o que somou no último segundo
  prevAlive: boolean;
  healAt: number;
  healingUntil?: number;
  healSum: number;
  healFlushAt: number;
  lootBar: HTMLDivElement;
  lootFill: HTMLDivElement;
  label: HTMLDivElement;
  hpFill: HTMLDivElement;
  hpText: HTMLSpanElement;
  nameEl: HTMLSpanElement;
  botEl: HTMLElement; // bot: robô e a dificuldade ao lado do nome
  botKey: string;
  tint: string; // cor do anel e da barra (do jogador, ou do time no modo Times)
  statusEl: HTMLSpanElement;
  statusKey: number;
  statusClocks: Map<number, HTMLElement>; // bit → reloginho em cima do ícone (só o meu mago tem tempo: d.fx)
  clock: ReturnType<typeof fxClock>;
  ghost: boolean; // desenhado meio transparente agora (Ilusão)
  dead: boolean;
  color: number;
  look: string;
  // materiais próprios deste boneco (o clone do SkeletonUtils divide os do modelo) e a cor de brilho original de cada um
  mats: { m: THREE.MeshStandardMaterial; c: THREE.Color; i: number; col: THREE.Color; rough: number }[];
  ghostMats: { m: THREE.Material; transparent: boolean; opacity: number }[];
  model: THREE.Object3D; // o boneco (some no fim da queima, quando fica só o esqueleto)
  burnAt: number; // morreu na lava neste instante (−1 = não está queimando)
  bones: THREE.Object3D | null; // esqueleto escuro que sobra da queima
  flash: number; // clarão branco do golpe: 1 no acerto, cai até 0
  burning: boolean; // vivo e na lava (issue #225): o corpo pulsa em brasa e solta faíscas
  electro?: boolean;
  freezeUntil: number; // hit-stop: animação parada até este instante
  cheering: boolean;
  medalEl: HTMLElement; // medalha de ouro, prata ou bronze com a colocação, à esquerda do nome
  xpEl: HTMLElement; // Ascensão: nível e barrinha de XP embaixo da vida
  xpLv: HTMLElement;
  xpFill: HTMLElement;
  level: number; // último nível visto (0 = ainda não visto): subir ao vivo comemora
  invuln: boolean; // invulnerável no quadro anterior: ligar de novo é nascer (começo da rodada ou volta no deathmatch)
  faded: boolean; // materiais mexidos pelo fade do Teleporte
  tpAt: number; // Teleporte: quando saiu, de onde, para onde e a direção (só visual)
  tpFrom: Vec;
  tpTo: Vec;
  tpDir: Vec;
};

// limiares de golpe (dano por acerto vai de ~30 a ~170): grande e crítico
const BIG_HIT = 100;
const CRIT_HIT = 130;
// cura: salto de uma vez (Drenar, Roubo de vida num golpe forte) mostra na hora; o resto soma e aparece se passar disso em 1 s (a regeneração sozinha, 5 a ~11/s, não passa)
const HEAL_NOW = 10;
const HEAL_SUM = 15;
const SHIELD_SECS = SPELLS.shield.levels[0].duration; // igual em todos os níveis
const FX_CAP = 320; // teto de efeitos vivos: acima disso, partículas novas são puladas
const SHAKE_MAX = 0.55;

type Fx = { obj: THREE.Object3D; until: number; born: number; update?: (k: number) => void };

const LAVA_VERT = `varying vec2 vUv; varying vec3 vPos; void main(){ vUv = uv; vec4 wp = modelMatrix * vec4(position,1.0); vPos = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }`;
const LAVA_FRAG = `
uniform float uTime; uniform sampler2D uMap; uniform float uHas; uniform float uHeat; varying vec2 vUv; varying vec3 vPos;
${SHORE_GLSL}
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
float noise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.0-2.0*f);
  return mix(mix(hash(i), hash(i+vec2(1,0)), u.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), u.x), u.y); }
float fbm(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++){ s += a*noise(p); p = p*2.03 + 1.7; a *= 0.5; } return s; }
void main(){
  vec2 p = vPos.xz * 0.18;
  float t = uTime * 0.08;
  float n = fbm(p + vec2(t, -t*0.7) + fbm(p*1.7 - t));
  float veins = smoothstep(0.5, 0.66, n);
  float core = smoothstep(0.66, 0.8, n);
  vec3 crust = mix(vec3(0.035, 0.008, 0.004), vec3(0.16, 0.025, 0.008), smoothstep(0.3, 0.5, n));
  vec3 hot = mix(vec3(0.7, 0.1, 0.01), vec3(1.0, 0.45, 0.06), core);
  vec3 col = mix(crust, hot, veins);
  if (uHas > 0.5) {
    // textura de lava (ambientCG Lava001) em duas camadas que correm em sentidos diferentes
    vec2 q = vPos.xz * 0.05;
    vec3 a = texture2D(uMap, q + vec2(t * 0.10, t * 0.04)).rgb;
    vec3 b = texture2D(uMap, q * 1.7 - vec2(t * 0.06, -t * 0.09)).rgb;
    vec3 tex = pow(max(a, b * 0.85), vec3(2.2));
    col = tex * (0.45 + 0.55 * veins) + hot * core * 0.2;
  }
  // bolhas: uma em cada ~10 células (de ~1,8 m) incha devagar como um domo aceso e estoura num clarão; mais nos veios quentes
  vec2 bp = vPos.xz * 0.55; vec2 bi = floor(bp);
  float bh = hash(bi);
  float ph = fract(uTime * (0.1 + 0.15 * bh) + bh * 7.0);
  float br = ph * ph * 0.26 * step(0.9, bh) + 0.001;
  float bd = length(fract(bp) - 0.5 - (vec2(hash(bi + 3.1), hash(bi + 7.7)) - 0.5) * 0.4);
  float dome = (1.0 - smoothstep(br * 0.2, br, bd)) * ph * 0.55;
  float pop = smoothstep(0.94, 1.0, ph) * (1.0 - smoothstep(0.0, br * 1.6, bd)) * 1.6;
  col += vec3(1.0, 0.5, 0.12) * (dome + pop) * (0.2 + 0.8 * veins) * step(0.9, bh);
  // junto da pedra: lava fresca e clara que lambe a borda em ondinhas, com crosta escura boiando; casa com a borda derretida da pedra
  float dO = shoreDist(vPos.xz) + shoreLick(vPos.xz);
  float shore = 1.0 - smoothstep(0.0, 1.3, dO);
  float ripple = 0.65 + 0.35 * sin(dO * 11.0 - uShoreTime * 2.4 * uLick + vnoise(vPos.xz * 1.4) * 5.0);
  vec3 molten = mix(vec3(0.8, 0.17, 0.02), vec3(1.0, 0.4, 0.07), ripple);
  molten = mix(molten, uTint, uTintK); // efeito da rodada pinta a faixa da borda; o aviso de encolhimento vem depois e manda
  molten = mix(molten, vec3(1.0, 0.16, 0.03), uWarn * 0.6);
  col = mix(col, molten * (0.6 + 0.3 * ripple), shore * shore * 0.6);
  float scum = smoothstep(0.55, 0.75, vnoise(vPos.xz * 2.3 + uShoreTime * 0.05)) * smoothstep(0.05, 0.4, dO) * shore;
  col = mix(col, vec3(0.09, 0.025, 0.01), scum * 0.7);
  gl_FragColor = vec4(col * uHeat, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

function stoneTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 1024;
  const g = c.getContext('2d')!;
  g.fillStyle = '#3b3633';
  g.fillRect(0, 0, 1024, 1024);
  // lajes irregulares com rejunte escuro (Math.random aqui e nos enfeites desta cena é só visual: não entra na simulação nem no hash)
  for (let i = 0; i < 2600; i++) {
    const x = Math.random() * 1024, y = Math.random() * 1024, r = 8 + Math.random() * 30;
    const l = 24 + Math.random() * 18;
    g.fillStyle = `hsl(20, 6%, ${l}%)`;
    g.beginPath();
    g.ellipse(x, y, r, r * (0.6 + Math.random() * 0.5), Math.random() * 3, 0, Math.PI * 2);
    g.fill();
  }
  g.strokeStyle = 'rgba(20,16,14,.55)';
  g.lineWidth = 2;
  for (let i = 0; i < 140; i++) {
    g.beginPath();
    let x = Math.random() * 1024, y = Math.random() * 1024;
    g.moveTo(x, y);
    for (let k = 0; k < 4; k++) g.lineTo((x += (Math.random() - 0.5) * 70), (y += (Math.random() - 0.5) * 70));
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function glowTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.3, 'rgba(255,255,255,.6)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

export function createScene(canvas: HTMLCanvasElement, labels: HTMLElement) {
  // celular: sem antialias, densidade até 1,5× e sombra menor, para caber na GPU dele
  const mobile = matchMedia('(pointer: coarse)').matches;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !mobile, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, mobile ? 1.5 : 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#1a0603');
  scene.fog = new THREE.Fog('#1a0603', 30, 70);
  const camera = new THREE.PerspectiveCamera(40, 1, 0.5, 200);

  // luz um pouco mais dramática: menos preenchimento, sol mais quente e a lava mais forte por baixo
  scene.add(new THREE.HemisphereLight('#ffd2b0', '#ff4a10', 0.45));
  const sun = new THREE.DirectionalLight('#ffe6c8', 1.7);
  sun.position.set(-8, 20, 6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(mobile ? 1024 : 2048, mobile ? 1024 : 2048);
  Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14, near: 1, far: 50 });
  scene.add(sun);
  const under = new THREE.PointLight('#ff5a1a', 60, 30, 1.6); // brilho da lava por baixo da borda
  under.position.set(0, -1.5, 0);
  scene.add(under);

  // assets CC0 em public/ (créditos em public/CREDITS.txt); enquanto não carregam, fica o visual gerado por código
  const loader = new THREE.TextureLoader();
  const tex = (path: string, srgb = true, repeat = 0) => {
    const t = loader.load(path);
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    if (repeat) {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(repeat, repeat);
    }
    return t;
  };
  const fxTex = (name: string) => tex(`/fx/${name}.png`);
  // quadros de chama e de fumaça (Kenney Particle Pack, CC0): o fogo anima trocando o quadro, a fumaça varia
  const FLAMES = ['flame_01', 'flame_02', 'flame_03', 'flame_04', 'flame_05', 'flame_06'].map(fxTex);
  const SMOKES = ['smoke_01', 'smoke_03', 'smoke_05', 'smoke_07'].map(fxTex);
  const FX = {
    flame: FLAMES[0], fire: fxTex('fire_01'), smoke: SMOKES[0], spark: fxTex('spark_01'),
    magic: fxTex('magic_02'), light: fxTex('light_01'), circle: fxTex('circle_05'), scorch: fxTex('scorch_02'),
    twirl: fxTex('twirl_01'), twirl2: fxTex('twirl_02'), star: fxTex('star_04'),
  };
  const FIRE_KINDS = new Set<ProjKind>(['fireball', 'cluster', 'meteor']);
  // distância até a borda e relógio da borda derretida, divididos pela lava e pela pedra
  const shoreU = { uSdf: { value: sdfTexture('circle') }, uSpan: { value: sdfSpan('circle') }, uR: { value: 11 }, uShoreTime: { value: 0 }, uLick: { value: 1 }, uWarn: { value: 0 }, uTint: { value: new THREE.Color() }, uTintK: { value: 0 } };
  const lavaMat = new THREE.ShaderMaterial({ uniforms: { uTime: { value: 0 }, uMap: { value: null }, uHas: { value: 0 }, uHeat: { value: 1 }, ...shoreU }, vertexShader: LAVA_VERT, fragmentShader: LAVA_FRAG });
  loader.load('/tex/lava_emit.jpg', (t) => {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    lavaMat.uniforms.uMap.value = t;
    lavaMat.uniforms.uHas.value = 1;
  });
  const lava = new THREE.Mesh(new THREE.PlaneGeometry(160, 160), lavaMat);
  ground(lava, -0.02); // a pedra fica só 2 cm acima
  scene.add(lava);

  // arena: a forma em escala 1 escalada pelo raio; o topo de pedra, a lateral brilha com a lava
  const stone = stoneTexture();
  let shownArena: ArenaId = 'circle';
  const arena = new THREE.Mesh(
    floorGeo(shownArena),
    [new THREE.MeshStandardMaterial({ map: stone, roughness: 0.95 }),
      new THREE.MeshBasicMaterial({ color: '#d2480c' })], // lateral de 4 cm: a cor da pedra derretida, sem risco escuro na emenda
  );
  arena.receiveShadow = true;
  scene.add(arena);
  // borda da pedra: escurece e racha nos últimos ~0,9 m, as rachaduras acendem em laranja e, colada na lava, a pedra derrete
  // (a lava lambe uns centímetros para dentro); no aviso de encolhimento a borda puxa para o vermelho e pulsa
  (arena.material as THREE.MeshStandardMaterial[])[0].onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, shoreU);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\n' + SHORE_GLSL)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      float eIn = -shoreDist(vWPos.xz);
      float nz = vnoise(vWPos.xz * 1.3);
      float band = 1.0 - smoothstep(0.0, 1.3, eIn - 0.4 * (nz - 0.5));
      diffuseColor.rgb *= mix(1.0, 0.3, band);
      float crack = max(1.0 - smoothstep(0.0, 0.05, abs(vnoise(vWPos.xz * 1.6 + 7.0) - 0.5)), 0.6 * (1.0 - smoothstep(0.0, 0.04, abs(vnoise(vWPos.xz * 4.1 - 3.0) - 0.5))));
      // a borda derretida da pedra também pega a cor do efeito da rodada (a lava pinta o lado dela com os mesmos uTint/uTintK)
      vec3 hot = mix(mix(vec3(1.0, 0.34, 0.05), uTint, uTintK), vec3(1.0, 0.1, 0.02), uWarn);
      float melt = 1.0 - smoothstep(0.0, 0.22, eIn - shoreLick(vWPos.xz) - 0.12 * (nz - 0.5));
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.08, 0.02, 0.0), melt);
      totalEmissiveRadiance += hot * (crack * band * band * (0.9 + 1.2 * uWarn) + melt * (0.85 + 0.9 * uWarn));`);
  };
  // ardósia de verdade (Poly Haven Slate Floor 02) quando a textura chegar
  loader.load('/tex/stone.jpg', (t) => {
    const top = (arena.material as THREE.MeshStandardMaterial[])[0];
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    // o topo usa as coordenadas da forma (-1 a 1 no círculo): 2,5 por unidade = os 5 ladrilhos de lado a lado de antes
    t.repeat.set(2.5, 2.5);
    top.map = t;
    top.normalMap = tex('/tex/stone_nor.jpg', false, 2.5);
    top.color.set('#e6ddd6');
    top.needsUpdate = true;
  });
  // faixa que pisca em vermelho onde a pedra vai afundar
  const warnMat = new THREE.MeshBasicMaterial({ color: '#ff2a00', transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
  const warn = new THREE.Mesh(new THREE.BufferGeometry(), warnMat);
  warn.position.y = 0.02;
  scene.add(warn);
  let shownR = 11;
  let shownIsles: Isle[] = []; // ilhas de refúgio do último quadro (morrer em cima de uma não é cair na lava)
  // decoração arrumada para esta arena e este tamanho (rodada nova = arena maior)
  let decorArena: ArenaId | null = null;
  let decorR = 0;
  let shake = 0; // tremor da câmera nos choques
  let warnR = -1;
  // Efeitos "Leve": sem tremor, sem hit-stop e sem partículas extras (PC fraco ou quem enjoa)
  let lite = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let celebrate = 0; // 0..1: zoom da câmera no vencedor no fim da rodada

  const glow = glowTexture();
  // brasas que sobem da lava em volta da arena: 28 sprites fixos com um só material, reciclados (nada alocado por quadro)
  const emberMat = new THREE.SpriteMaterial({ map: glow, color: '#ff8a2a', transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
  const embers = Array.from({ length: 28 }, () => {
    const s = new THREE.Sprite(emberMat);
    s.userData = { a: 0, r: 0, vy: 0, size: 0, wait: Math.random() * 4 }; // wait: segundos escondida antes de subir
    s.visible = false;
    scene.add(s);
    return s;
  });
  // efeito da rodada no mapa (issue #189), leve de propósito: a faixa de lava colada na borda e as brasas ganham a cor do efeito
  // (as brasas sozinhas sumiam no print): preta na Arena de espinhos, amarela na Febre do ouro (com moedas), pálida no Vendaval
  // (brasas mais rápidas) e verde na Fonte da vida; o Tempo chuvoso escurece a lava e a crosta da borda. Por cima, um detalhe por
  // efeito pedido pelo Fernando (21/10): espinhos na borda, pontos verdes subindo da pedra, vento e chuva; poucos, transparentes e
  // sem sombra, para não brigar com as magias. No modo leve (lite) só a cor da faixa fica.
  const EMBER_COLOR: Partial<Record<RoundEffectId, string>> = { swords: '#c9ccd2', gold: '#ffd34d', speed: '#d6ecff', regen: '#7dffa8', lava: '#ffb27a' };
  // Febre arcana (Ascensão): a Febre do ouro em azul (Fernando, 21/10: o mesmo efeito, só que azul)
  const ARCANE = { tint: '#3d7bff', ember: '#8cbcff', coin: '#6fa8ff' };
  const SHORE_TINT: Partial<Record<RoundEffectId, [string, number]>> = { swords: ['#050403', 0.75], gold: ['#ffe11a', 0.7], speed: ['#bfe6ff', 0.45], regen: ['#3dff8a', 0.45], lava: ['#7a2a10', 0.5] };
  let tintK = 0;
  const emberBase = emberMat.color.clone();
  let heat = 1;
  // borda da Arena de espinhos: parede caótica de espinhos de ferro apontando para todos os lados, em 3 fileiras (pedido do Fernando,
  // 21/10: precisa parecer que bater ali machuca; as armas KayKit espalhadas ficaram feias e saíram). Sorteio por índice (semente fixa): não pisca ao refazer
  const SPIKE_GAP = 0.16, SPIKE_ROWS = 3, SPIKE_MAX = 2400;
  const spikes = new THREE.InstancedMesh(new THREE.ConeGeometry(0.055, 0.5, 5).translate(0, 0.25, 0), new THREE.MeshStandardMaterial({ color: '#555b63', metalness: 0.55, roughness: 0.45, emissive: '#3a0a02', emissiveIntensity: 0.45, flatShading: true }), SPIKE_MAX);
  spikes.count = 0;
  spikes.visible = false;
  scene.add(spikes);
  let swordsKey = '';
  const swordM = new THREE.Matrix4(), swordQ = new THREE.Quaternion(), swordAxis = new THREE.Vector3(), swordS = new THREE.Vector3(), swordP = new THREE.Vector3();
  const rnd = (i: number, k: number) => { const x = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453; return x - Math.floor(x); };
  function layoutSwords(id: ArenaId, R: number) {
    let i = 0;
    for (const ring of ARENAS[id].outline) for (let e = 0; e < ring.length && i < SPIKE_MAX; e++) {
      const a = ring[e], b = ring[(e + 1) % ring.length];
      const steps = Math.max(1, Math.round((len(sub(b, a)) * R) / SPIKE_GAP));
      for (let k = 0; k < steps; k++) for (let row = 0; row < SPIKE_ROWS && i < SPIKE_MAX; row++, i++) {
        const p = add(a, scale(sub(b, a), (k + rnd(i, 1)) / steps));
        const out = edgeAt(id, R, add(scale(p, R), v(0.01, 0))) - edgeAt(id, R, add(scale(p, R), v(-0.01, 0)));
        const outZ = edgeAt(id, R, add(scale(p, R), v(0, 0.01))) - edgeAt(id, R, add(scale(p, R), v(0, -0.01)));
        const nl = Math.hypot(out, outZ) || 1; // edgeAt cresce para dentro da pedra: o gradiente negado aponta para a lava
        const d = SWORDS.inset * 1.1 - row * 0.15 - rnd(i, 2) * 0.1; // para dentro da pedra, onde a parede fere (SWORDS.inset), até a borda
        swordP.set(p.x * R + (out / nl) * d, -0.05 - rnd(i, 3) * 0.1, p.y * R + (outZ / nl) * d);
        // ponta para qualquer lado: tomba de 15° a 85° numa direção sorteada
        const az = rnd(i, 4) * Math.PI * 2;
        swordAxis.set(Math.cos(az), 0, Math.sin(az));
        swordQ.setFromAxisAngle(swordAxis, 0.26 + rnd(i, 5) * 1.22);
        const big = rnd(i, 6) < 0.15 ? 1.7 : 1; // alguns espinhos bem maiores quebram a linha
        swordS.set(1, (0.6 + rnd(i, 7) * 0.9) * big, 1).multiplyScalar(0.9 + rnd(i, 8) * 0.4);
        spikes.setMatrixAt(i, swordM.compose(swordP, swordQ, swordS));
      }
    }
    spikes.count = i;
    spikes.instanceMatrix.needsUpdate = true;
  }
  // pontos verdes (Fonte da vida), riscos de vento (Vendaval): sprites reciclados como as brasas
  const pool = (n: number, color: string, opacity: number) => {
    const mat = new THREE.SpriteMaterial({ map: glow, color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false });
    return Array.from({ length: n }, () => {
      const s = new THREE.Sprite(mat);
      s.userData = { vy: 0, wait: Math.random() * 3 };
      s.visible = false;
      scene.add(s);
      return s;
    });
  };
  const motes = pool(26, '#7dffa8', 0.75);
  const gusts = pool(14, '#eaf6ff', 0.35);
  // Arena de espinhos: fumaça preta subindo devagar entre os espinhos (pedido do Fernando, 21/10); mistura normal (aditiva não escurece)
  const soot = Array.from({ length: 40 }, (_, i) => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: SMOKES[i % SMOKES.length], color: '#0b0908', transparent: true, opacity: 0, depthWrite: false }));
    s.userData = { age: 0, life: 0, wait: Math.random() * 2 };
    s.visible = false;
    scene.add(s);
    return s;
  });
  // Febre do ouro: moedas pulando da borda e caindo de volta, piscando como se tilintassem (pedido do Fernando, 21/10)
  const coins = pool(22, '#ffd84a', 0.95);
  // chuva (Tempo chuvoso): riscos curtos caindo, uma geometria só atualizada por quadro
  const RAIN = 90, rainPos = new Float32Array(RAIN * 6);
  const rainGeo = new THREE.BufferGeometry();
  rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
  const rain = new THREE.LineSegments(rainGeo, new THREE.LineBasicMaterial({ color: '#b9d4ff', transparent: true, opacity: 0.35, depthWrite: false }));
  rain.frustumCulled = false;
  rain.visible = false;
  scene.add(rain);
  const rainY = new Float32Array(RAIN).map(() => Math.random() * 9);
  const rainXZ = Array.from({ length: RAIN }, () => [0, 0]);
  // núcleo quase branco e brilho saturado: destaca do chão marrom e da lava laranja (legibilidade, ideia do Spellsworn)
  const fireMat = new THREE.MeshBasicMaterial({ color: '#fff2b0' });
  const homingMat = new THREE.MeshBasicMaterial({ color: '#f3d4ff' });
  const ballGeo = new THREE.SphereGeometry(0.28, 16, 12);
  const swapMat = new THREE.MeshBasicMaterial({ color: '#dcfffb' });
  const gripMat = new THREE.MeshBasicMaterial({ color: '#ffd6de' });
  // aparência de cada projétil: corpo, cor do brilho e do rastro, textura do rastro e tamanho
  // a cópia da Ilusão não entra: é desenhada como mago (main.ts)
  const LOOK: Record<Exclude<ProjKind, 'illusion'>, { mat: THREE.Material; halo: string; trail: string; tex: THREE.Texture; size: number }> = {
    geyser: { mat: swapMat, halo: GEYSER_FX.color, trail: GEYSER_FX.foam, tex: FX.light, size: 1 },
    basic: { mat: swapMat, halo: '#dcfffb', trail: '#2fe0d0', tex: FX.spark, size: .45 },
    fireball: { mat: fireMat, halo: '#ffb000', trail: '#ff8a00', tex: FX.flame, size: 1.15 },
    homing: { mat: homingMat, halo: '#c23cff', trail: '#b040ff', tex: FX.magic, size: 1.1 },
    cluster: { mat: fireMat, halo: '#fff066', trail: '#ffd23a', tex: FX.spark, size: 0.65 },
    swap: { mat: swapMat, halo: '#00fff0', trail: '#2fe0d0', tex: FX.magic, size: 1 },
    grip: { mat: gripMat, halo: '#8ed64b', trail: '#4d8f28', tex: FX.magic, size: 1 },
    meteor: { mat: fireMat, halo: '#ff5a1a', trail: '#ff7a20', tex: FX.fire, size: 3 },
    boomerang: { mat: swapMat, halo: '#7dff5a', trail: '#5ad040', tex: FX.spark, size: 0.85 },
    gravity: { mat: homingMat, halo: '#3b2bff', trail: '#6a3cff', tex: FX.magic, size: 1.5 },
    bouncer: { mat: gripMat, halo: '#3cff9a', trail: '#20d080', tex: FX.magic, size: 0.8 },
    drain: { mat: gripMat, halo: '#9aff4a', trail: '#5ac020', tex: FX.magic, size: 0.9 },
    snowball: { mat: swapMat, halo: '#cfefff', trail: '#e8f6ff', tex: FX.smoke, size: 1.2 },
    magnetize: { mat: gripMat, halo: '#ff4040', trail: '#c0c0d0', tex: FX.spark, size: 1 },
    recharge: { mat: swapMat, halo: '#3aa8ff', trail: '#5ac8ff', tex: FX.spark, size: 0.9 },
    link: { mat: swapMat, halo: '#6aa8ff', trail: '#4a88ff', tex: FX.magic, size: 0.8 },
    splitter: { mat: swapMat, halo: '#40c8ff', trail: '#30a0ff', tex: FX.magic, size: 1 },
    shard: { mat: swapMat, halo: '#8fd8ff', trail: '#60b8ff', tex: FX.spark, size: 0.6 },
    warpzone: { mat: swapMat, halo: '#7ad8ff', trail: '#7ad8ff', tex: FX.magic, size: 1 },
  };
  // corpo de cada projétil: formas low-poly próprias em vez da mesma bola de luz (pedido do Fernando, 17/10;
  // não há modelos CC0 prontos para magias, então são feitas aqui com as geometrias do Three.js)
  const jitter = (g: THREE.BufferGeometry, amount: number) => {
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) pos.setXYZ(i, pos.getX(i) * (1 + (Math.random() - 0.5) * amount), pos.getY(i) * (1 + (Math.random() - 0.5) * amount), pos.getZ(i) * (1 + (Math.random() - 0.5) * amount));
    g.computeVertexNormals();
    return g;
  };
  const flat = (color: string, emissive: string, intensity = 0.6) => new THREE.MeshStandardMaterial({ color, emissive, emissiveIntensity: intensity, flatShading: true, roughness: 0.5 });
  function vineModel(radius: number) {
    const group = new THREE.Group();
    const stem = flat('#3c7023', '#203f0e', .3), leafMat = flat('#8ac34b', '#335d17', .3);
    for (let i = 0; i < 6; i++) {
      const points = Array.from({ length: 13 }, (_, j) => {
        const k = j / 12, a = i * Math.PI / 3 + k * 2.5, r = radius * (1 - k * .55);
        return new THREE.Vector3(Math.cos(a) * r, k * 1.15, Math.sin(a) * r);
      });
      group.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 20, .035, 5, false), stem));
      for (const j of [4, 9]) {
        const leaf = new THREE.Mesh(new THREE.SphereGeometry(.09, 5, 3), leafMat);
        leaf.position.copy(points[j]); leaf.scale.set(.5, 1.8, 1); leaf.rotation.z = i;
        group.add(leaf);
      }
    }
    return group;
  }
  const SHAPES: Partial<Record<ProjKind, () => THREE.Object3D>> = {
    fireball: () => new THREE.Mesh(jitter(new THREE.IcosahedronGeometry(0.24, 1), 0.35), flat('#ffb347', '#ff6a00', 1.4)),
    cluster: () => new THREE.Mesh(new THREE.TetrahedronGeometry(0.2), flat('#ffe066', '#ff9a00', 1.2)),
    homing: () => {
      const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.2), flat('#e7b8ff', '#9a30ff', 1.2));
      m.scale.set(0.8, 0.8, 2); // cristal comprido apontando para onde voa
      return m;
    },
    swap: () => {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(new THREE.OctahedronGeometry(0.2), flat('#cffffb', '#00d8c8', 1.2)));
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.035, 6, 24), flat('#00fff0', '#00b0a8', 1.4));
      ring.name = 'spin';
      g.add(ring);
      return g;
    },
    grip: () => {
      const ring = new THREE.Mesh(new THREE.RingGeometry(.94, 1, 64), new THREE.MeshBasicMaterial({ color: '#8ed64b', side: THREE.DoubleSide, transparent: true, opacity: .8, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2;
      return ring;
    },
    meteor: () => new THREE.Mesh(jitter(new THREE.DodecahedronGeometry(0.3, 0), 0.4), flat('#4a2c20', '#ff4a00', 0.9)),
    boomerang: () => {
      // V de dois braços, extrudado, girando
      const s = new THREE.Shape();
      s.moveTo(-0.38, 0.16);
      s.lineTo(0, -0.12);
      s.lineTo(0.38, 0.16);
      s.lineTo(0.3, 0.24);
      s.lineTo(0, 0.04);
      s.lineTo(-0.3, 0.24);
      s.closePath();
      const geo = new THREE.ExtrudeGeometry(s, { depth: 0.07, bevelEnabled: false });
      geo.center();
      const m = new THREE.Mesh(geo, flat('#8fe060', '#3a8a10', 0.7));
      m.rotation.x = -Math.PI / 2;
      const g = new THREE.Group();
      g.add(m);
      g.name = 'spin';
      return g;
    },
    gravity: () => {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 12), new THREE.MeshBasicMaterial({ color: '#05020c' })));
      for (const tilt of [0.5, -0.9]) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.03, 6, 32), flat('#8a6cff', '#4a20ff', 1.6));
        ring.rotation.x = tilt;
        ring.name = 'spin';
        g.add(ring);
      }
      return g;
    },
    bouncer: () => new THREE.Mesh(new THREE.IcosahedronGeometry(0.22, 0), flat('#7dffb8', '#10c070', 1.2)),
    drain: () => {
      const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.18), flat('#c8ff9a', '#3a9a10', 1.2));
      m.scale.set(0.7, 0.7, 1.7); // espinho verde apontando para onde voa
      return m;
    },
    snowball: () => new THREE.Mesh(jitter(new THREE.IcosahedronGeometry(0.42, 1), 0.15), flat('#f4fbff', '#9ad8ff', 0.35)),
    magnetize: () => {
      // ímã em U: arco vermelho com pontas prateadas
      const g = new THREE.Group();
      const arc = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.06, 6, 16, Math.PI), flat('#ff4a4a', '#a00000', 0.8));
      arc.rotation.x = -Math.PI / 2;
      g.add(arc);
      for (const x of [-0.2, 0.2]) {
        const tip = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.12), flat('#e0e0e8', '#404050', 0.4));
        tip.position.set(x, 0, 0.04);
        g.add(tip);
      }
      return g;
    },
    recharge: () => {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.36, 8), flat('#9ae6ff', '#1a90ff', 1.3));
      m.rotation.x = Math.PI / 2; // pilha deitada apontando para a frente
      return m;
    },
    link: () => new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.04, 6, 16), flat('#bfe6ff', '#2a7aff', 1.2)),
    splitter: () => new THREE.Mesh(new THREE.DodecahedronGeometry(0.22, 0), flat('#a0f0ff', '#2080ff', 1.2)),
    shard: () => new THREE.Mesh(new THREE.TetrahedronGeometry(0.13), flat('#d0f4ff', '#40a0ff', 1.4)),
    geyser: () => {
      const g = new THREE.Group();
      const jet = new THREE.Mesh(new THREE.CylinderGeometry(.65, .3, GEYSER_FX.height, 12, 1, true), new THREE.MeshBasicMaterial({ color: GEYSER_FX.color, transparent: true, opacity: .45, side: THREE.DoubleSide, depthWrite: false }));
      jet.position.y = GEYSER_FX.height / 2;
      const foam = new THREE.Mesh(new THREE.TorusGeometry(.7, .12, 6, 20), new THREE.MeshBasicMaterial({ color: GEYSER_FX.foam, transparent: true, opacity: .75, depthWrite: false }));
      foam.rotation.x = -Math.PI / 2; foam.position.y = GEYSER_FX.height;
      const pool = new THREE.Mesh(new THREE.RingGeometry(.7, 1, 32), new THREE.MeshBasicMaterial({ color: GEYSER_FX.color, transparent: true, opacity: .45, side: THREE.DoubleSide, depthWrite: false }));
      pool.rotation.x = -Math.PI / 2; pool.position.y = .04;
      g.add(jet, foam, pool);
      return g;
    },
    warpzone: () => {
      // cúpula de vidro com borda no chão; raio 1 aqui, o tamanho real vem do servidor
      const g = new THREE.Group();
      g.add(new THREE.Mesh(new THREE.SphereGeometry(1, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#7ad8ff', transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide })));
      const rim = new THREE.Mesh(new THREE.TorusGeometry(1, 0.02, 4, 48), new THREE.MeshBasicMaterial({ color: '#bfefff', transparent: true, opacity: 0.6 }));
      rim.rotation.x = -Math.PI / 2;
      g.add(rim);
      return g;
    },
  };
  const projs = new Map<number, THREE.Group>();
  const fx: Fx[] = [];

  // cada jogador ganha um clone da aparência dele. O mago define a escala (os pacotes KayKit usam a mesma medida) e as peças
  // do mago (chapéu, tronco, capa) são tingidas na cor do jogador
  let mageScale = 1;
  const ready = loadFile('mage').then((g) => {
    if (!g) return;
    const box = new THREE.Box3().setFromObject(g.scene);
    mageScale = 1.9 / (box.max.y - box.min.y);
  });

  const mages = new Map<string, Mage>();
  const decor = createDecor(scene, ready.then(() => mageScale), FX.flame);

  // geometrias de efeito compartilhadas: criar uma por efeito vazava memória de vídeo
  const ringGeo = new THREE.RingGeometry(WIZ_R * 0.9, WIZ_R * 1.25, 40);
  const discGeo = new THREE.CircleGeometry(1, 48);
  const shieldGeo = new THREE.SphereGeometry(0.85, 24, 16);
  const markerGeo = new THREE.RingGeometry(0.15, 0.25, 24);
  const scorchGeo = new THREE.PlaneGeometry(1.6, 1.6);
  const waveGeo = new THREE.RingGeometry(0.85, 1, 64);
  const boltGeo = new THREE.CylinderGeometry(1, 1, 1, 5); // trecho do Raio: raio 1, altura 1, escalado por trecho
  const SHARED = new Set<THREE.BufferGeometry>([ringGeo, shieldGeo, markerGeo, scorchGeo, waveGeo, ballGeo, boltGeo]);

  // libera o que o efeito criou (material sempre; geometria se não for compartilhada; sprite usa a geometria interna do three)
  function dispose(obj: THREE.Object3D) {
    obj.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh && !(o as THREE.Line).isLine && !(o as THREE.Sprite).isSprite) return;
      if (!(o as THREE.Sprite).isSprite && mesh.geometry && !SHARED.has(mesh.geometry)) mesh.geometry.dispose();
      const mat = mesh.material as THREE.Material | THREE.Material[];
      (Array.isArray(mat) ? mat : [mat]).forEach((x) => x?.dispose());
    });
  }

  // corpo na lava (Fernando, 18/10): boia quase na superfície escurecendo com brilho de brasa e fumaça; aos BURN.swap s vira um
  // esqueleto escuro (o Skeleton_Minion do projeto, materiais clonados: cor × 0,2 com #2a1a12, brasa #ff4a10 a 0,06, aspereza 1)
  // que boia mais um pouco e afunda de BURN.dive a BURN.end s (a lava é opaca: abaixo de ~0,3 m o corpo deitado some). No modo leve, só a fumaça diminui
  const BONES = 'skeleton_minion';
  const BURN = { swap: 3.5, dive: 6, end: 7.5, sink: 0.08, deep: 0.9 };
  const CHAR = new THREE.Color('#2a1a12');
  const EMBER = new THREE.Color('#ff4a10');
  const charred = (c: THREE.Color) => c.clone().multiplyScalar(0.2).lerp(CHAR, 0.5);
  function burnCorpse(m: Mage, t: number, at: Vec) {
    const k = Math.min(1, t / BURN.swap);
    if (t < BURN.swap) {
      const heat = (0.35 + 0.25 * Math.sin(t * 9 + m.color)) * k * (1 - 0.6 * k); // brasa que acende e vai apagando no carvão
      for (const x of m.mats) {
        x.m.color.copy(x.col).lerp(charred(x.col), k);
        x.m.emissive.copy(EMBER);
        x.m.emissiveIntensity = heat;
        x.m.roughness = x.rough + (1 - x.rough) * k;
      }
      m.root.position.y = -BURN.sink * k;
    } else {
      if (!m.bones) {
        m.bones = makeBones(m) ?? m.model; // sem o esqueleto, fica o corpo carbonizado
        burst(at, '#ff7a2a', 1.6, 0.6, 0.4, FX.spark, 0.8);
        smoke(at, 1.6, 2);
      }
      const e = Math.max(0, Math.min(1, (t - BURN.dive) / (BURN.end - BURN.dive)));
      m.root.position.y = -BURN.sink - (BURN.deep - BURN.sink) * e;
    }
    m.root.visible = t < BURN.end + 0.3;
    // fumaça escura subindo do corpo (no leve, quase nada) e uma brasa ou outra
    if (t < BURN.end - 1 && Math.random() < (lite ? 0.03 : 0.14)) {
      const p = v(at.x + (Math.random() - 0.5) * 0.5, at.y + (Math.random() - 0.5) * 0.5);
      if (Math.random() < 0.5) smoke(p, 1 + Math.random() * 0.5, 1.8);
      else puff(p, 0.8 + Math.random() * 0.4, 1.6); // vapor claro: a fumaça escura some contra a lava
    }
    if (!lite && t < BURN.swap + 1 && Math.random() < 0.08) burst(v(at.x + (Math.random() - 0.5) * 0.6, at.y + (Math.random() - 0.5) * 0.6), '#ff8a2a', 0.3, 0.9, 0.3, glow, 1.2);
  }
  // esqueleto deitado na pose final da morte, com os materiais carbonizados; se o modelo ainda não chegou (ou já é um esqueleto), o próprio corpo carbonizado
  function makeBones(m: Mage): THREE.Object3D | null {
    const src = files.get(BONES);
    if (!src || lookBody(m.look).startsWith('skeleton')) return null;
    const b = cloneSkinned(src.scene) as THREE.Group;
    b.scale.setScalar(mageScale);
    b.rotation.copy(m.model.rotation);
    b.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh || Array.isArray(mesh.material)) return;
      const mat = (mesh.material as THREE.MeshStandardMaterial).clone();
      mat.color = charred(mat.color);
      mat.emissive = EMBER.clone();
      mat.emissiveIntensity = 0.06;
      mat.roughness = 1;
      mesh.material = mat;
    });
    const clip = src.clips.find((c) => c.name === 'Death_A');
    if (clip) {
      const mixer = new THREE.AnimationMixer(b);
      const a = mixer.clipAction(clip);
      a.setLoop(THREE.LoopOnce, 1);
      a.clampWhenFinished = true;
      a.play();
      mixer.setTime(clip.duration);
    }
    m.model.visible = false;
    m.root.add(b);
    return b;
  }
  // voltou (deathmatch) ou rodada nova: o boneco como era
  function unburn(m: Mage) {
    m.root.position.y = 0;
    m.root.visible = true;
    m.model.visible = true;
    if (m.burnAt >= 0) {
      for (const x of m.mats) {
        x.m.color.copy(x.col);
        x.m.emissive.copy(x.c);
        x.m.emissiveIntensity = x.i;
        x.m.roughness = x.rough;
      }
    }
    m.burnAt = -1;
    if (m.bones === m.model) m.bones = null;
    if (m.bones) {
      m.root.remove(m.bones);
      m.bones.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.isMesh) (mesh.material as THREE.Material).dispose();
      });
      m.bones = null;
    }
  }

  function makeMage(d: WizDraw, look: string): Mage | null {
    const src = lookModel(look);
    if (!src) return null;
    const model = cloneAppearance(src.scene);
    model.scale.setScalar(mageScale);
    const mats: Mage['mats'] = [];
    const ghostMats: Mage['ghostMats'] = [];
    model.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      // cloneAppearance já isola os materiais; guarda só os valores necessários para restaurar efeitos temporários.
      if (Array.isArray(mesh.material)) {
        for (const mat of mesh.material) ghostMats.push({ m: mat, transparent: mat.transparent, opacity: mat.opacity });
        return;
      }
      const mat = mesh.material;
      ghostMats.push({ m: mat, transparent: mat.transparent, opacity: mat.opacity });
      if (mat instanceof THREE.MeshStandardMaterial) mats.push({ m: mat, c: mat.emissive.clone(), i: mat.emissiveIntensity, col: mat.color.clone(), rough: mat.roughness });
    });
    const root = new THREE.Group();
    root.add(model);
    const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: COLORS[d.color], transparent: true, opacity: 0.85, depthWrite: false }));
    ground(ring, 0.03);
    root.add(ring);
    const shield = new THREE.Mesh(shieldGeo, new THREE.MeshBasicMaterial({ color: '#8fd3ff', transparent: true, opacity: 0.28, depthWrite: false, blending: THREE.AdditiveBlending }));
    shield.position.y = 0.8;
    shield.visible = false;
    root.add(shield);
    const aura = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    ground(aura, 0.045);
    aura.scale.setScalar(1.45);
    aura.visible = false;
    root.add(aura);
    const vines = vineModel(.5);
    vines.visible = false;
    root.add(vines);
    scene.add(root);
    const mixer = new THREE.AnimationMixer(model);
    const actions: Record<string, THREE.AnimationAction> = {};
    for (const c of src.clips) actions[c.name] = mixer.clipAction(c);
    const idle = src.clips.find((c) => c.name === 'Idle');
    const brace = idle && createBraceClip(model, idle);
    if (brace) actions.Brace = mixer.clipAction(brace);
    const invoke = src.clips.find((c) => c.name === 'Spellcast_Shoot');
    if (invoke) actions.Attack_Invoke = mixer.clipAction(createAttackClip(invoke));
    // tudo toca uma vez e para no último quadro, menos o que repete
    for (const [n, a] of Object.entries(actions)) if (!LOOPS.includes(n)) {
      a.setLoop(THREE.LoopOnce, 1);
      a.clampWhenFinished = true;
    }
    actions.Idle?.play();
    const hpFill = el('div', { class: 'hp-fill', style: `background: ${COLORS[d.color]}` });
    const botEl = el('small', { class: 'bot-tag', hidden: true });
    const medalEl = el('b', { class: 'wiz-medal', hidden: true });
    const nameEl = el('span', {}, medalEl, d.name, botEl);
    const hpText = el('span', { class: 'hp-text' });
    const absRush = el('div', { class: 'hp-abs rush' });
    const bar = el('div', { class: 'hp' }, hpFill, absRush, hpText);
    // selo da Égide ao lado da barra, enquanto não usada
    const aegisEl = el('i', { class: 'aegis', title: t('Égide pronta', 'Aegis ready'), hidden: true }, icon(ITEM_ICON.aegis));
    const extraEl = el('span', { class: 'hp-extra' });
    const shieldFill = el('div');
    const shieldBar = el('div', { class: 'shield-bar', hidden: true }, shieldFill);
    const statusEl = el('span', { class: 'status-icons' });
    // barrinha dourada do monte de ouro: enche a cada 2 s em cima dele
    const lootFill = el('div');
    const lootBar = el('div', { class: 'loot-bar', hidden: true }, lootFill);
    const xpLv = el('b', {});
    const xpFill = el('div');
    const xpEl = el('div', { class: 'wiz-xp', hidden: true }, xpLv, el('div', { class: 'xp-track' }, xpFill));
    const label = el('div', { class: 'wiz-label' }, statusEl, nameEl, el('div', { class: 'hp-row' }, aegisEl, bar, extraEl), xpEl, shieldBar, lootBar);
    labels.append(label);
    return { root, mixer, actions, current: 'Idle', oneShotUntil: 0, ring, shield, aura, vines, bar, absRush, extraEl, extraKey: '', aegisEl, shieldBar, shieldFill, shieldSince: 0, prevHp: 0, prevAlive: false, healAt: -9, healSum: 0, healFlushAt: 0, label, hpFill, hpText, nameEl, medalEl, botEl, botKey: '', tint: COLORS[d.color], lootBar, lootFill, statusEl, statusKey: -1, statusClocks: new Map(), clock: fxClock(), ghost: false, dead: false, color: d.color, look, mats, ghostMats, model, burnAt: -1, bones: null, flash: 0, burning: false, freezeUntil: 0, cheering: false, xpEl, xpLv, xpFill, level: 0, invuln: false, faded: false, tpAt: -9, tpFrom: v(0, 0), tpTo: v(0, 0), tpDir: v(0, 0) };
  }

  function play(m: Mage, name: string, fade = 0.15) {
    if (m.current === name || !m.actions[name]) return;
    m.actions[m.current]?.fadeOut(fade);
    m.actions[name].reset().fadeIn(fade).play();
    m.current = name;
  }

  // animação de conjurar [clip, segundos, início no clip]; o resto atira (Spellcast_Shoot). Quando o gesto forte vem no meio
  // do clip, começa ali: o Throw desce o braço aos ~0,6 s, o Summon bate o cajado aos ~3,3 s, o chute sai aos ~0,3 s
  const SUMMON: [string, number, number] = ['Ranged_Magic_Summon', 0.8, 3.1];
  const SPIN: [string, number] = ['2H_Melee_Attack_Spinning', 0.67];
  const CAST_ANIM: Record<string, [string, number, number?]> = {
    closedbody: ['Block', 0.6], shield: ['Block', 0.6], rush: ['Dodge_Forward', 0.4], teleport: ['Dodge_Forward', 0.4], windwalk: ['Dodge_Backward', 0.4], grip: ['Throw', 0.6, 0.45],
    meteor: SUMMON, rockpillar: SUMMON, warpzone: SUMMON, drain: ['Spellcast_Long', 0.9, 0.3], thrust: ['Unarmed_Melee_Attack_Kick', 0.5, 0.2],
    gravity: SPIN, cluster: ['Throw', .5, .1],
    // Flagelo: o giro mais forte vai de ~0,6 a ~0,9 s do clip; começando em 0,15 ele cai junto com a explosão (preparo de 0,5 s)
    scourge: ['2H_Melee_Attack_Spin', 0.85, 0.15],
    // issue #207: o que é jogado sai de arremesso, do mesmo ponto do clip que o Agarrar (a soltura cai no preparo de 0,1 s);
    // o que é feito em si mesmo canaliza como o Drenar. Os outros projéteis seguem no disparo padrão, que já parece magia saindo da mão
    boomerang: ['Throw', 0.6, 0.45], link: ['Throw', 0.6, 0.45], snowball: ['Throw', 0.6, 0.45],
    pact: ['Spellcast_Long', 0.9, 0.3], recharge: ['Spellcast_Long', 0.9, 0.3],
  };
  const castAnim = (spell: string) => CAST_ANIM[spell] ?? (['Spellcast_Shoot', 0.55] as const);
  function oneShot(id: string, name: string, secs: number, from = 0) {
    const m = mages.get(id);
    if (!m || m.dead) return;
    // a magia chama duas vezes (castLocal e o 'cast' do servidor): só a primeira pula para o início
    const fresh = m.current !== name;
    play(m, name, 0.08);
    if (fresh && from && m.actions[name]) m.actions[name].time = from;
    m.oneShotUntil = performance.now() / 1000 + secs;
  }

  function addFx(obj: THREE.Object3D, secs: number, update?: (k: number) => void) {
    scene.add(obj);
    const now = performance.now() / 1000;
    fx.push({ obj, born: now, until: now + secs, update });
  }

  function burst(at: Vec, color: string, size: number, secs: number, y = 0.8, map: THREE.Texture = glow, rise = 0) {
    if (fx.length > FX_CAP) return; // limite de partículas: no caos, o que passa do teto não nasce
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map, color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, rotation: Math.random() * Math.PI * 2 }));
    s.position.copy(w3(at, y));
    addFx(s, secs, (k) => {
      s.scale.setScalar(size * (0.4 + k));
      s.position.y = y + rise * k;
      s.material.opacity = 1 - k;
    });
  }

  // labareda animada: troca o quadro da chama enquanto cresce, sobe e some
  function flameBurst(at: Vec, size: number, secs: number) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: FLAMES[0], color: '#ffd080', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, rotation: Math.random() * Math.PI * 2 }));
    s.position.copy(w3(at, 0.9));
    addFx(s, secs, (k) => {
      s.material.map = FLAMES[Math.min(FLAMES.length - 1, Math.floor(k * FLAMES.length))];
      s.scale.setScalar(size * (0.5 + k * 0.8));
      s.position.y = 0.9 + k * 0.8;
      s.material.opacity = 1 - k * k;
    });
  }

  // fumaça escura que sobe (mistura normal, não soma luz)
  function smoke(at: Vec, size: number, secs: number) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: SMOKES[Math.floor(Math.random() * SMOKES.length)], color: '#3a2a22', transparent: true, opacity: 0.55, depthWrite: false, rotation: Math.random() * Math.PI * 2 }));
    s.position.copy(w3(at, 0.9));
    addFx(s, secs, (k) => {
      s.scale.setScalar(size * (0.6 + k));
      s.position.y = 0.9 + k * 1.4;
      s.material.opacity = 0.55 * (1 - k);
    });
  }

  // marca de queimado no chão onde a bola de fogo explodiu
  function scorch(at: Vec) {
    const m = new THREE.Mesh(scorchGeo, new THREE.MeshBasicMaterial({ map: FX.scorch, color: '#000000', transparent: true, opacity: 0.7, depthWrite: false }));
    m.rotation.set(-Math.PI / 2, 0, Math.random() * Math.PI * 2);
    m.position.copy(w3(at, 0.025));
    addFx(m, 7, (k) => ((m.material as THREE.MeshBasicMaterial).opacity = 0.7 * Math.min(1, (1 - k) * 3)));
  }

  // texto que sobe e some (dano, cura, ouro); pop = quanto ele pula ao nascer
  const numbers: { el: HTMLDivElement; at: THREE.Vector3; born: number; pop?: number }[] = [];
  function floatText(cls: string, at: THREE.Vector3, size: string, pop: number | undefined, ...body: (string | Node)[]) {
    const e = el('div', { class: cls, style: size && `font-size: ${size}` }, ...body);
    labels.append(e);
    numbers.push({ el: e, at, born: performance.now() / 1000, pop });
  }
  // em cima de quem levou ou se curou, com um pouco de espalhamento de lado
  const overHead = (at: Vec) => w3(at, 1.6).add(new THREE.Vector3((Math.random() - 0.5) * 0.5, 0, 0));

  // número de dano: o tamanho cresce com o golpe (30 de dano ≈ 1,3rem, 170 ≈ 2,9rem)
  function damageNumber(at: Vec, dmg: number) {
    if (dmg < 5) return;
    const crit = dmg >= CRIT_HIT;
    floatText('dmg' + (crit ? ' crit' : dmg >= BIG_HIT ? ' big' : ''), overHead(at), `${Math.min(3, 0.95 + dmg / 90).toFixed(2)}rem`, crit ? 0.9 : dmg >= BIG_HIT ? 0.55 : 0.3, '-' + Math.round(dmg) + (crit ? '!' : ''));
  }

  // cura que sobe em verde em cima de quem se curou
  const healNumber = (at: Vec, n: number) => floatText('dmg heal', overHead(at), `${Math.min(2.2, 0.95 + n / 90).toFixed(2)}rem`, undefined, '+' + Math.round(n));

  // impacto no mago: clarão branco, hit-stop curto, tremor pela força (mais perto da câmera, mais forte) e anel no golpe forte
  function impact(id: string, at: Vec, dmg: number) {
    const m = mages.get(id);
    if (m) {
      m.flash = 1;
      if (!lite) m.freezeUntil = performance.now() / 1000 + 0.06;
    }
    if (!lite) {
      const near = Math.max(0.3, 1 - Math.hypot(at.x - focus.x, at.y - focus.z) / 14);
      shake = Math.min(SHAKE_MAX, shake + dmg * 0.0028 * near);
    }
    if (dmg >= BIG_HIT) shockwave(at, dmg >= CRIT_HIT ? 2.2 : 1.5, dmg >= CRIT_HIT ? '#ffe9a8' : '#ffb347');
    if (dmg >= CRIT_HIT && !lite) {
      burst(at, '#fff6d8', 3.2, 0.22, 1, FX.star);
      for (let i = 0; i < 5; i++) burst(v(at.x + (Math.random() - 0.5) * 1.2, at.y + (Math.random() - 0.5) * 1.2), '#ffe27a', 0.9, 0.7, 1, FX.star, 1.8);
    }
  }

  // queda na lava: coroa de respingos que sobem e caem, clarão laranja e fumaça
  function lavaSplash(at: Vec) {
    burst(at, '#ffb347', 3.6, 0.5, 0.1, FX.light);
    burst(at, '#ff6a10', 4.2, 0.7, 0.05, FX.circle);
    flameBurst(at, 2.8, 0.6);
    smoke(at, 2.8, 1.8);
    const drops = lite ? 4 : 10;
    for (let i = 0; i < drops && fx.length < FX_CAP; i++) {
      const a = (i / drops) * Math.PI * 2 + Math.random() * 0.5;
      const sp = 1.2 + Math.random() * 1.6, up = 3.5 + Math.random() * 2.5;
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: i % 2 ? '#ffd27a' : '#ff6a1a', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      const size = 0.35 + Math.random() * 0.3;
      s.scale.setScalar(size);
      addFx(s, 0.9, (k) => {
        const t = k * 0.9;
        s.position.set(at.x + Math.cos(a) * sp * t, up * t - 9 * t * t, at.y + Math.sin(a) * sp * t);
        s.material.opacity = 1 - k * k;
      });
    }
    if (!lite) smoke(v(at.x + 0.4, at.y - 0.3), 2, 2.2);
  }

  // vencedor da rodada: faíscas douradas em volta e anel de ouro no chão
  // vencedor (dourado) e subir de nível no Ascensão (azul da Febre arcana)
  function victoryBurst(at: Vec, c1 = '#ffd84a', c2 = '#fff2a0') {
    shockwave(at, 2.6, c1);
    burst(at, c2, 3, 0.5, 1, FX.light);
    if (lite) return;
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      burst(v(at.x + Math.cos(a) * 0.9, at.y + Math.sin(a) * 0.9), i % 2 ? c1 : c2, 0.8, 1.1, 0.6, FX.star, 2.4);
    }
  }
  // ouro ganho no abate: sobe dourado em cima de quem matou
  const goldNumber = (at: Vec, n: number) => floatText('dmg gold', w3(at, 2.1), '', undefined, `+${n} `, icon(UI_ICON.gold));

  // marca que fica no chão alguns segundos onde houve choque de magias (só visual)
  // (os choques que deixam chão com efeito desenham a zona do servidor, ver syncZones)
  const MARK: Record<string, { map: THREE.Texture; color: string; secs: number; spin: number }> = {
    pillar: { map: FX.scorch, color: '#ffb066', secs: 4, spin: 0 },
    snow: { map: FX.circle, color: '#dff4ff', secs: 3, spin: 0.4 },
  };
  function groundMark(at: Vec, combo: string, radius: number) {
    const m = MARK[combo];
    if (!m) return;
    const plane = new THREE.Mesh(scorchGeo, new THREE.MeshBasicMaterial({ map: m.map, color: m.color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    plane.rotation.x = -Math.PI / 2;
    plane.position.copy(w3(at, 0.035));
    const size = Math.max(0.8, radius * 1.4);
    plane.scale.setScalar(size / 1.6);
    const spin = m.spin * (Math.random() < 0.5 ? -1 : 1);
    addFx(plane, m.secs, (k) => {
      plane.rotation.z += spin * 0.016;
      // tremula como brasa e some no fim
      const flicker = 0.75 + 0.25 * Math.sin(performance.now() / 90 + at.x * 7);
      (plane.material as THREE.MeshBasicMaterial).opacity = flicker * Math.min(1, (1 - k) * 2.5);
    });
  }

  // obstáculos da rodada: modelo KayKit de cada tipo, treme quando apanha e afunda ao quebrar
  const OBSTACLE_MODEL: Record<string, string> = { pillar: 'pillar_decorated', rock: 'rubble_large', tree: 'tree_dead_large', shrine: 'shrine_candles' };
  // parede do Pilar de pedra (KayKit Dungeon barrier_half): um modelo no pedaço do meio, atravessado como os 3 círculos da simulação
  let wallModel: THREE.Object3D | null = null;
  void loadFile('barrier_half').then((g) => (wallModel = g?.scene ?? null));
  function makeWall(along: Vec) {
    const o = wallModel?.clone(true) ?? new THREE.Mesh(new THREE.BoxGeometry(2, 1.1, 0.5), new THREE.MeshStandardMaterial({ color: '#6b625c' }));
    o.traverse((m) => {
      if ((m as THREE.Mesh).isMesh) m.castShadow = m.receiveShadow = true;
    });
    const box = new THREE.Box3().setFromObject(o);
    const g = new THREE.Group();
    const k = 2 / Math.max(0.01, box.max.x - box.min.x); // 2 m de ponta a ponta
    o.scale.setScalar(k);
    // a origem do modelo fica numa ponta: centra no pedaço do meio e apoia no chão
    o.position.set((-(box.min.x + box.max.x) / 2) * k, -box.min.y * k, (-(box.min.z + box.max.z) / 2) * k);
    g.add(o);
    g.rotation.y = -Math.atan2(along.y, along.x); // o comprimento (x do modelo) no rumo dos pedaços
    return g;
  }
  const pillarMeshes: { obj: THREE.Object3D; pos: Vec; bar: HTMLDivElement | null; fill: HTMLDivElement | null; height: number }[] = [];
  // baú: caixa simples com tampa dourada e brilho (é um obstáculo: as magias quebram)
  const chestWood = new THREE.MeshStandardMaterial({ color: '#7a4a22', roughness: 0.7 });
  const chestGold = new THREE.MeshStandardMaterial({ color: '#ffcc33', emissive: '#a06a00', metalness: 0.6, roughness: 0.3 });
  function makeChest() {
    const g = new THREE.Group();
    const wood = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.32, 0.38), chestWood);
    wood.position.y = 0.16;
    const lid = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.12, 0.4), chestGold);
    lid.position.y = 0.38;
    const glowSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: '#ffd84a', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    glowSprite.scale.setScalar(1.2);
    glowSprite.position.y = 0.3;
    g.add(wood, lid, glowSprite);
    return g;
  }
  // monte de ouro do baú quebrado: moedas no chão com brilho baixo e fraco que pulsa (não cobre quem passa por cima)
  const pile = new THREE.Group();
  const pileShine = new THREE.SpriteMaterial({ map: glow, color: '#ffd84a', transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false });
  {
    for (let k = 0; k < 9; k++) {
      const coin = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.04, 12), chestGold);
      coin.position.set((Math.random() - 0.5) * 0.6, 0.03 + Math.random() * 0.12, (Math.random() - 0.5) * 0.6);
      coin.rotation.set(Math.random(), Math.random(), Math.random());
      pile.add(coin);
    }
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.7, 0.73, 40), new THREE.MeshBasicMaterial({ color: '#ffd84a', transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false }));
    ground(ring, 0.03);
    const shine = new THREE.Sprite(pileShine);
    shine.scale.setScalar(0.8);
    shine.position.y = 0.12;
    pile.add(ring, shine);
  }
  const piles: THREE.Group[] = [];
  // runas com a cara do efeito (Fernando, 18/10: as de antes eram feias): ícone grande do game-icons em cima, pedra flutuando
  // e base discreta no chão; brilho baixo (pedido anterior dele: runas e ouro menos brilhantes). Pressa: verde-ciano com asas e giro
  // rápido; Fúria: vermelha com espinhos pulsando e chama; Escudo: azul dentro de uma bolha; Recarga: dourada com anéis e ponteiro de relógio
  const RUNE_COLOR: Record<RuneKind, string> = { haste: '#2dd4bf', fury: '#ef4444', shield: '#60a5fa', recharge: '#facc15' };
  type RuneDraw = { g: THREE.Group; tick: (now: number) => void };
  const runeSlots: Partial<Record<RuneKind, RuneDraw>>[] = [];
  function runeDraw(kind: RuneKind): RuneDraw {
    const c = RUNE_COLOR[kind];
    const g = new THREE.Group();
    const gem = new THREE.Group(); // o que flutua: a pedra e os enfeites
    const core = new THREE.Mesh(kind === 'fury' ? new THREE.IcosahedronGeometry(0.2, 0) : new THREE.OctahedronGeometry(0.22, 0), flat(c, c, 0.3));
    gem.add(core);
    // base: anel fino e disco bem fraco no chão
    const base = new THREE.Mesh(new THREE.RingGeometry(0.46, 0.5, 40), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }));
    ground(base, 0.03);
    const disc = new THREE.Mesh(discGeo, new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.07, depthWrite: false }));
    ground(disc, 0.028);
    disc.scale.setScalar(0.46);
    // ícone em cima, sem somar luz (só a cor)
    const ico = new THREE.Sprite(new THREE.SpriteMaterial({ map: groundIcon(RUNE_ICON[kind]), color: c, transparent: true, opacity: 0.95, depthWrite: false }));
    ico.scale.setScalar(0.75);
    ico.position.y = 1.55;
    g.add(gem, base, disc, ico);
    let tick: (now: number) => void;
    if (kind === 'haste') {
      // duas asas batendo e giro rápido; no modo completo, faíscas ficando para trás
      const wing = new THREE.Shape();
      wing.moveTo(0, 0);
      wing.quadraticCurveTo(0.25, 0.22, 0.48, 0.16);
      wing.quadraticCurveTo(0.3, 0.05, 0.42, -0.04);
      wing.quadraticCurveTo(0.2, -0.02, 0, 0);
      const wmat = new THREE.MeshStandardMaterial({ color: '#a7f3d0', emissive: c, emissiveIntensity: 0.3, side: THREE.DoubleSide, transparent: true, opacity: 0.85 });
      const wings = [1, -1].map((sx) => {
        const w = new THREE.Mesh(new THREE.ShapeGeometry(wing), wmat);
        w.scale.x = sx;
        gem.add(w);
        return w;
      });
      tick = (now) => {
        gem.rotation.y = now * 6;
        const flap = Math.sin(now * 14) * 0.6;
        wings[0].rotation.y = flap;
        wings[1].rotation.y = -flap;
        if (!lite && Math.random() < 0.15) burst(v(g.position.x + Math.cos(-now * 6) * 0.45, g.position.z + Math.sin(-now * 6) * 0.45), c, 0.25, 0.5, gem.position.y, glow);
      };
    } else if (kind === 'fury') {
      // espinhos em volta pulsando e uma chama fraca subindo
      const spikes = new THREE.Group();
      const sgeo = new THREE.ConeGeometry(0.05, 0.22, 5);
      const smat = flat('#7f1d1d', '#ef4444', 0.35);
      for (let k = 0; k < 8; k++) {
        const sp = new THREE.Mesh(sgeo, smat);
        const a = (k / 8) * Math.PI * 2;
        const dir = new THREE.Vector3(Math.cos(a), k % 2 ? 0.5 : -0.3, Math.sin(a)).normalize();
        sp.position.copy(dir.clone().multiplyScalar(0.24));
        sp.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
        spikes.add(sp);
      }
      gem.add(spikes);
      const fire = new THREE.Sprite(new THREE.SpriteMaterial({ map: FLAMES[0], color: '#ff6a3a', transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }));
      fire.scale.setScalar(0.7);
      fire.position.y = 0.15;
      gem.add(fire);
      tick = (now) => {
        gem.rotation.y = now * 1.5;
        spikes.scale.setScalar(1 + 0.18 * Math.max(0, Math.sin(now * 8)));
        fire.material.map = FLAMES[Math.floor(now * 12) % FLAMES.length];
      };
    } else if (kind === 'shield') {
      // bolha translúcida em volta da pedra, respirando devagar
      const bubble = new THREE.Mesh(new THREE.SphereGeometry(0.4, 24, 16), new THREE.MeshStandardMaterial({ color: '#93c5fd', emissive: c, emissiveIntensity: 0.15, transparent: true, opacity: 0.18, roughness: 0.1, depthWrite: false }));
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.012, 6, 40), new THREE.MeshBasicMaterial({ color: '#bfdbfe', transparent: true, opacity: 0.4 }));
      rim.rotation.x = Math.PI / 2;
      gem.add(bubble, rim);
      tick = (now) => {
        gem.rotation.y = now * 1.2;
        bubble.scale.setScalar(1 + 0.05 * Math.sin(now * 2.5));
      };
    } else {
      // dois anéis (dourado e roxo) girando em eixos diferentes e um relógio no chão com o ponteiro andando
      const r1 = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.018, 6, 40), flat('#fde68a', '#facc15', 0.3));
      const r2 = new THREE.Mesh(new THREE.TorusGeometry(0.27, 0.018, 6, 40), flat('#d8b4fe', '#a855f7', 0.3));
      gem.add(r1, r2);
      const hand = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.01, 0.36), new THREE.MeshBasicMaterial({ color: '#fde68a', transparent: true, opacity: 0.6 }));
      hand.position.z = -0.18;
      const pivot = new THREE.Group();
      pivot.position.y = 0.035;
      pivot.add(hand);
      const marks = mergeGeometries(Array.from({ length: 12 }, (_, k) => new THREE.RingGeometry(0.38, 0.44, 1, 1, (k / 12) * Math.PI * 2 - 0.04, 0.08)));
      const dial = new THREE.Mesh(marks, new THREE.MeshBasicMaterial({ color: '#c084fc', transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false }));
      ground(dial, 0.032);
      g.add(pivot, dial);
      tick = (now) => {
        r1.rotation.set(now * 1.7, now * 0.6, 0);
        r2.rotation.set(Math.PI / 2, now * -2.2, now * 0.9);
        core.rotation.y = now * 1.2;
        pivot.rotation.y = -now * 3;
      };
    }
    scene.add(g);
    return {
      g,
      tick: (now) => {
        gem.position.y = 0.7 + Math.sin(now * 3) * 0.08;
        tick(now);
      },
    };
  }

  // chão dos choques, cada tipo com borda nítida no raio real, cor, movimento e ícone próprios; apaga no último 0,8 s
  // queimando: brasa laranja tremulando; lento: névoa de gelo com borda tracejada; redemoinho: três braços roxos girando para o centro
  const ZONE_LOOK: Record<ZoneKind, { fill: string; edge: string; tex: THREE.Texture; texColor: string; icon: string; mark: string; add: boolean }> = {
    burn: { fill: '#ff3d0a', edge: '#ffb347', tex: FX.fire, texColor: '#ff5a10', icon: STATUS_ICONS.find(([b]) => b === 512)![1], mark: '#ffe0a0', add: true },
    slow: { fill: '#2f8cff', edge: '#e2f4ff', tex: FX.smoke, texColor: '#7cc4ff', icon: STATUS_ICONS.find(([b]) => b === 4)![1], mark: '#0b2a4a', add: false },
    pull: { fill: '#6a2cff', edge: '#c9a8ff', tex: FX.twirl, texColor: '#b48cff', icon: STATUS_ICONS.find(([b]) => b === 2097152)![1], mark: '#f0e6ff', add: true },
  };
  const edgeGeo = new THREE.RingGeometry(0.93, 1, 64);
  const dashGeo = mergeGeometries(Array.from({ length: 20 }, (_, i) => new THREE.RingGeometry(0.92, 1, 3, 1, (i / 20) * Math.PI * 2, ((Math.PI * 2) / 20) * 0.55)));
  const texGeo = new THREE.PlaneGeometry(2, 2);
  type ZoneDraw = { g: THREE.Group; fill: THREE.MeshBasicMaterial; edge: THREE.Mesh; dash: THREE.Mesh; edgeMat: THREE.MeshBasicMaterial; arms: THREE.Group; texMat: THREE.MeshBasicMaterial; mark: THREE.Mesh; markMat: THREE.MeshBasicMaterial; kind: ZoneKind | null };
  const zoneDraws: ZoneDraw[] = [];
  // ícone do sprite (public/icons.svg) desenhado no chão, por baixo dos magos: um símbolo vira imagem branca uma vez só
  const iconTex = new Map<string, THREE.CanvasTexture>();
  const iconSprite = fetch('/icons.svg').then((r) => r.text()).catch(() => '');
  function groundIcon(id: string) {
    let tex = iconTex.get(id);
    if (tex) return tex;
    const c = Object.assign(document.createElement('canvas'), { width: 128, height: 128 });
    iconTex.set(id, (tex = new THREE.CanvasTexture(c)));
    void iconSprite.then((svg) => {
      const sym = new DOMParser().parseFromString(svg, 'image/svg+xml').getElementById(id);
      if (!sym) return;
      const img = new Image();
      img.onload = () => {
        c.getContext('2d')!.drawImage(img, 8, 8, 112, 112);
        tex.needsUpdate = true;
      };
      img.src = 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" fill="#fff">${sym.innerHTML}</svg>`);
    });
    return tex;
  }
  function zoneDraw(): ZoneDraw {
    const flat = (geo: THREE.BufferGeometry, mat: THREE.Material, y: number) => ground(new THREE.Mesh(geo, mat), y);
    const fill = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false });
    const edgeMat = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false });
    const texMat = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false });
    const edge = flat(edgeGeo, edgeMat, 0.04);
    const dash = flat(dashGeo, edgeMat, 0.04);
    // gira em torno do centro; o redemoinho usa os três braços, os outros só o primeiro
    const arms = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const a = flat(texGeo, texMat, 0.037 + i * 0.001);
      a.rotation.z = (i / 3) * Math.PI * 2;
      arms.add(a);
    }
    const markMat = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false });
    const mark = flat(texGeo, markMat, 0.042);
    const g = new THREE.Group();
    g.add(flat(discGeo, fill, 0.033), arms, edge, dash, mark);
    scene.add(g);
    return { g, fill, edge, dash, edgeMat, arms, texMat, mark, markMat, kind: null };
  }
  function syncZones(list: ZoneView[], now: number, dt: number) {
    while (zoneDraws.length < list.length) zoneDraws.push(zoneDraw());
    zoneDraws.forEach((d, i) => {
      const z = list[i];
      d.g.visible = !!z;
      if (!z) return;
      const L = ZONE_LOOK[z.kind];
      if (d.kind !== z.kind) {
        d.kind = z.kind;
        d.fill.color.set(L.fill);
        d.edgeMat.color.set(L.edge);
        d.texMat.map = L.tex;
        d.texMat.color.set(L.texColor);
        d.texMat.blending = L.add ? THREE.AdditiveBlending : THREE.NormalBlending;
        d.texMat.needsUpdate = true;
        d.edge.visible = z.kind !== 'slow';
        d.dash.visible = z.kind === 'slow';
        d.arms.children.forEach((a, k) => (a.visible = z.kind === 'pull' || k === 0));
        d.markMat.map = groundIcon(L.icon);
        d.markMat.color.set(L.mark);
        d.markMat.needsUpdate = true;
      }
      d.g.position.copy(w3(z.pos, 0));
      d.g.scale.setScalar(z.r);
      d.mark.scale.setScalar(0.42 / z.r); // ícone de ~0,84 m, qualquer que seja o raio
      const fade = Math.min(1, z.left / 0.8);
      const flicker = 0.8 + 0.2 * Math.sin(now * 13 + i) * Math.sin(now * 7.7 + i * 3);
      d.fill.opacity = (z.kind === 'slow' ? (mobile ? 0.6 : 0.42) : 0.24) * fade;
      d.edgeMat.opacity = (z.kind === 'burn' ? flicker : 0.95) * fade;
      d.texMat.opacity = (z.kind === 'pull' ? 0.85 : z.kind === 'burn' ? 0.75 * flicker : 0.4) * fade;
      d.arms.rotation.y += (z.kind === 'pull' ? 2.6 : z.kind === 'slow' ? 0.15 : 0.4) * dt;
      if (z.kind === 'slow') d.dash.rotation.z += 0.25 * dt;
      d.markMat.opacity = 0.9 * fade;
      // brasas subindo e brilhos de gelo (só no modo completo)
      if (!lite && fade > 0.5) {
        const a = Math.random() * Math.PI * 2, rr = Math.sqrt(Math.random()) * z.r * 0.9;
        const at = v(z.pos.x + Math.cos(a) * rr, z.pos.y + Math.sin(a) * rr);
        if (z.kind === 'burn' && Math.random() < 0.35 * z.r) burst(at, Math.random() < 0.5 ? '#ff7a1a' : '#ffb347', 0.35, 0.8, 0.1, FLAMES[Math.floor(Math.random() * FLAMES.length)], 0.7);
        else if (z.kind === 'slow' && Math.random() < 0.12 * z.r) burst(at, '#e2f4ff', 0.4, 0.7, 0.15, FX.star);
      }
    });
  }

  // ilhas de refúgio (sim.ts): disco de pedra rente à lava com a beira de lava (ambientCG Lava005) que come a pedra quando
  // alguém pisa, pedras do KayKit Hexagon na beira afundando junto e vapor (Kenney Smoke) enquanto encolhe
  const PUFFS = ['puff_0', 'puff_1', 'puff_2'].map(fxTex);
  const isleSide = new THREE.MeshStandardMaterial({ color: '#2a1610', roughness: 1, emissive: '#ff4a10', emissiveIntensity: 0.25 });
  const lava005 = tex('/tex/lava005.jpg');
  // beira derretida: a crosta da textura escura e as rachaduras acesas (brilho da própria textura)
  const isleLava = new THREE.MeshStandardMaterial({ map: lava005, color: '#5a2a1a', emissive: '#ff5a14', emissiveMap: lava005, emissiveIntensity: 2.2, roughness: 1 });
  const isleStone = new THREE.MeshStandardMaterial({ map: tex('/tex/stone.jpg'), color: '#b8aaa0', roughness: 1, emissive: '#3a0c02', emissiveIntensity: 0.4 });
  const isleBaseGeo = new THREE.CylinderGeometry(1, 1.15, 0.6, 28);
  const isleTopGeo = new THREE.CylinderGeometry(1, 1, 0.06, 28);
  const rockModels: THREE.Object3D[] = [];
  for (const k of ['A', 'B', 'C', 'D', 'E']) gltf.loadAsync(`/models/hex/rock_single_${k}.gltf`).then((g) => rockModels.push(g.scene)).catch(() => {});
  type IsleDraw = { g: THREE.Group; top: THREE.Mesh; rocks: THREE.Group; r: number; seen: number; shrinkAt: number };
  const isleDraws: IsleDraw[] = [];
  function isleDraw(i: number): IsleDraw {
    const g = new THREE.Group();
    const base = new THREE.Mesh(isleBaseGeo, [isleSide, isleLava, isleSide]);
    base.position.y = -0.305; // topo de lava 0,5 cm acima da lava do mar
    const top = new THREE.Mesh(isleTopGeo, isleStone);
    top.position.y = 0.01; // pedra 4 cm acima do chão da arena: dá para ver que é pedra firme
    top.receiveShadow = true;
    const rocks = new THREE.Group();
    g.add(base, top, rocks);
    scene.add(g);
    return { g, top, rocks, r: -1, seen: i, shrinkAt: -1 };
  }
  function syncIsles(list: Isle[], now: number, dt: number) {
    while (isleDraws.length < list.length) isleDraws.push(isleDraw(isleDraws.length));
    isleDraws.forEach((d, i) => {
      const it = list[i];
      d.g.visible = !!it && it.r > 0.02;
      if (!it) {
        d.r = -1;
        return;
      }
      // pedras da beira: quando os modelos chegam (um jeito por ilha, sempre o mesmo)
      if (!d.rocks.children.length && rockModels.length === 5) {
        for (let k = 0; k < 4; k++) {
          const o = rockModels[(i + k * 2) % 5].clone(true);
          const box = new THREE.Box3().setFromObject(o);
          o.scale.setScalar(0.42 / Math.max(0.01, box.max.x - box.min.x));
          const a = (k / 4) * Math.PI * 2 + i * 1.3;
          o.position.set(Math.cos(a) * 0.82, 0, Math.sin(a) * 0.82);
          o.rotation.y = a * 3;
          d.rocks.add(o);
        }
      }
      // a ilha chega junto com a borda: anda devagar até o lugar novo, e o raio acompanha sem saltos
      const to = w3(it.pos);
      if (d.r < 0 || d.g.position.distanceTo(to) > 3) d.g.position.copy(to); // rodada nova: aparece direto no lugar
      else d.g.position.lerp(to, Math.min(1, dt * 4));
      if (d.r >= 0 && it.r < d.r - 1e-4) d.shrinkAt = now;
      d.r = d.r < 0 ? it.r : d.r + (it.r - d.r) * Math.min(1, dt * 8);
      const melt = 1 - d.r / ISLAND.r;
      d.g.scale.set(d.r, 1, d.r);
      // a lava come a pedra de fora para dentro: a beira de lava engrossa e a pedra afunda um pouco
      const k = 0.84 - 0.34 * melt;
      d.top.scale.set(k, 1, k);
      d.top.position.y = 0.01 - 0.04 * melt;
      d.rocks.children.forEach((o, n) => (o.position.y = -0.45 * melt - 0.08 * n * melt));
      d.rocks.visible = d.r > 0.3;
      // vapor enquanto encolhe (no modo leve, bem menos)
      if (now - d.shrinkAt < 0.3 && Math.random() < (lite ? 0.02 : 0.08)) {
        const a = Math.random() * Math.PI * 2;
        const at = v(it.pos.x + Math.cos(a) * d.r * 0.9, it.pos.y + Math.sin(a) * d.r * 0.9);
        puff(at, 0.6 + Math.random() * 0.4, 1.4);
      }
    });
  }
  // vapor claro que sobe da lava (Kenney Smoke, mistura normal)
  function puff(at: Vec, size: number, secs: number) {
    if (fx.length > FX_CAP) return;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: PUFFS[Math.floor(Math.random() * PUFFS.length)], color: '#b0a49c', transparent: true, opacity: 0.35, depthWrite: false, rotation: Math.random() * Math.PI * 2 }));
    s.position.copy(w3(at, 0.2));
    addFx(s, secs, (k) => {
      s.scale.setScalar(size * (0.5 + k));
      s.position.y = 0.2 + k * 1.6;
      s.material.opacity = 0.35 * (1 - k);
    });
  }

  function syncPillars(list: PillarView[]) {
    const changed = list.length !== pillarMeshes.length || list.some((p, i) => p.pos.x !== pillarMeshes[i].pos.x || p.pos.y !== pillarMeshes[i].pos.y);
    const radius = (p: PillarView) => OBSTACLES[p.kind].r;
    if (changed) {
      for (const p of pillarMeshes) {
        scene.remove(p.obj);
        p.bar?.remove();
      }
      pillarMeshes.length = 0;
      let run = 0; // pedaços de parede seguidos: a simulação põe cada parede como [meio, lado, lado]
      list.forEach((p, i) => {
        run = p.kind === 'rockpillar' ? run + 1 : 0;
        const wall = p.kind === 'rockpillar' && run % 3 === 1 && list[i + 2]?.kind === 'rockpillar';
        const side = p.kind === 'rockpillar' && !wall; // os lados não têm modelo nem barra (a vida é a da parede)
        let obj: THREE.Object3D;
        if (wall) obj = makeWall(v(list[i + 2].pos.x - list[i + 1].pos.x, list[i + 2].pos.y - list[i + 1].pos.y));
        else if (side) obj = new THREE.Group();
        else {
          obj = (p.kind === 'chest' ? makeChest() : decor.clone(OBSTACLE_MODEL[p.kind])) ?? new THREE.Mesh(new THREE.CylinderGeometry(radius(p), radius(p), 2.2, 12), new THREE.MeshStandardMaterial({ color: '#6b625c' }));
          // ajusta a largura do modelo ao raio de colisão do pilar
          const box = new THREE.Box3().setFromObject(obj);
          const width = Math.max(box.max.x - box.min.x, box.max.z - box.min.z) || 1;
          // árvore é fina no tronco e larga nos galhos: mede pelo tronco (menos que a copa)
          obj.scale.multiplyScalar((radius(p) * (p.kind === 'tree' ? 6 : 2.3)) / width);
        }
        obj.position.copy(w3(p.pos, 0));
        scene.add(obj);
        // barra de vida em tudo que quebra (pedido do Fernando, 17/10: sempre visível)
        let bar: HTMLDivElement | null = null, fill: HTMLDivElement | null = null;
        if (Number.isFinite(OBSTACLES[p.kind].hp) && !side) {
          fill = el('div');
          bar = el('div', { class: 'obstacle-hp' + (p.kind === 'chest' ? ' chest' : '') }, fill);
          labels.append(bar);
        }
        const height = new THREE.Box3().setFromObject(obj).max.y;
        pillarMeshes.push({ obj, pos: p.pos, bar, fill, height });
        // a lista muda no meio da rodada (baú, Pilar de pedra): o que já tinha quebrado não afunda de novo
        if (p.hp <= 0) obj.position.y = -3;
      });
    }
    list.forEach((p, i) => {
      const m = pillarMeshes[i];
      if (p.hp <= 0) {
        m.obj.position.y = Math.max(-3, m.obj.position.y - 0.05);
        m.obj.visible = m.obj.position.y > -2.9;
        if (m.bar) m.bar.hidden = true;
      } else {
        // tremida curta quando apanha
        const shake = p.hp < 100 ? (100 - p.hp) / 100 : 0;
        if (m.fill) m.fill.style.width = `${p.hp}%`;
        m.obj.rotation.z = Math.sin(performance.now() / 40) * 0.02 * shake;
      }
    });
  }

  // anel que se expande no chão até o raio da área
  function shockwave(at: Vec, radius: number, color: string) {
    const ring = new THREE.Mesh(waveGeo, new THREE.MeshBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.copy(w3(at, 0.06));
    addFx(ring, 0.45, (k) => {
      ring.scale.setScalar(Math.max(0.01, radius * (0.2 + 0.8 * k)));
      (ring.material as THREE.MeshBasicMaterial).opacity = 1 - k;
    });
  }

  // acerto: clarão branco, bola de fogo, onda no chão e faíscas; durava 0,3 s e quase não se via (relato do Fernando, 17/10)
  function explosion(at: Vec) {
    burst(at, '#ffffff', 2.2, 0.18, 0.9, FX.light);
    flameBurst(at, 3.6, 0.55);
    burst(at, '#ffb347', 3, 0.5, 0.8, FX.fire);
    burst(at, '#ff6a10', 4.8, 0.45, 0.8, FX.light);
    burst(at, '#ff8a3a', 3.6, 0.55, 0.15, FX.circle);
    for (let i = 0; i < 6; i++) burst(v(at.x + (Math.random() - 0.5) * 0.9, at.y + (Math.random() - 0.5) * 0.9), '#ffd27a', 1.1, 0.6, 0.9, FX.spark, 1.6);
    smoke(at, 2.2, 1.3);
  }

  function zap(at: Vec) {
    burst(at, '#ffffff', 2.2, 0.18, 1, FX.light);
    burst(at, '#9fd0ff', 4.4, 0.6, 1, FX.light);
    burst(at, '#e6f4ff', 2.8, 0.5, 1, FX.spark);
    burst(at, '#6fb6ff', 3.8, 0.6, 0.15, FX.circle);
  }

  function bolt(from: Vec, to: Vec) {
    const hand = add(from, clampLen(sub(to, from), 0.45));
    const pts: THREE.Vector3[] = [];
    const n = 28;
    for (let i = 0; i <= n; i++) {
      // sai do cetro (a mão do brilho de lançamento: 0,45 m à frente, 0,9 m de altura) e desce até 0,25 m no alvo (pedido do
      // Fernando, 21/10): a 1 m de altura a câmera inclinada mostrava o raio ~0,9 m acima da linha do acerto. Zigue-zague de muitos
      // trechos curtos que balança até LIGHTNING.width para cada lado, a largura extra do acerto do Raio
      const k = i / n;
      const p = w3(v(hand.x + (to.x - hand.x) * k, hand.y + (to.y - hand.y) * k), 0.9 - 0.65 * k);
      if (i > 0 && i < n) p.add(new THREE.Vector3((Math.random() - 0.5) * 2 * LIGHTNING.width, (Math.random() - 0.5) * 0.14, (Math.random() - 0.5) * 2 * LIGHTNING.width));
      pts.push(p);
    }
    // traço grosso de cilindros por trecho (linha de WebGL tem 1 px e sumia de longe): miolo branco e brilho azul em volta
    const up = new THREE.Vector3(0, 1, 0);
    for (const [r, color, op] of [[0.025, '#ffffff', 1], [0.07, '#9fd0ff', 0.45]] as const) {
      const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false });
      const g = new THREE.Group();
      for (let i = 0; i < n; i++) {
        const [a, b] = [pts[i], pts[i + 1]];
        const m = new THREE.Mesh(boltGeo, mat);
        m.position.copy(a).lerp(b, 0.5);
        m.quaternion.setFromUnitVectors(up, b.clone().sub(a).normalize());
        m.scale.set(r, a.distanceTo(b), r);
        g.add(m);
      }
      addFx(g, 0.35, (k) => (mat.opacity = op * (1 - k)));
    }
    burst(to, '#9fd0ff', 2.4, 0.3, 0.25, FX.light);
    burst(to, '#e6f4ff', 1.4, 0.35, 0.25, FX.spark);
    burst(hand, '#9fd0ff', 1.2, 0.2, 0.9, FX.light);
  }

  function onEvents(events: SimEvent[], hiddenDamageTargets: readonly string[] = []) {
    for (const e of events) {
      if (e.k === 'sand') {
        const from=v(e.x,e.y),dir=v(e.dx,e.dy),pts=conePoints(from,dir,e.length,e.width);
        const geo=new THREE.BufferGeometry().setFromPoints(pts.map(p=>w3(p,.12)));
        const mat=new THREE.MeshBasicMaterial({color:'#c9ab70',transparent:true,opacity:.5,side:THREE.DoubleSide,depthWrite:false});
        const fan=new THREE.Mesh(geo,mat); scene.add(fan);
        addFx(fan,.5,k=>{ mat.opacity=.5*(1-k); });
        for(let i=0;i<(lite?12:35);i++) { const d=Math.random()*e.length,side=(Math.random()-.5)*e.width*d/e.length; burst(v(e.x+dir.x*d-dir.y*side,e.y+dir.y*d+dir.x*side),'#d7bc85',.4,.4,.2+Math.random()*.6,FX.spark); }
      }
      if (e.k === 'cast') {
        oneShot(e.id, ...castAnim(e.spell));
        if (e.spell === 'scourge') {
          // preparo do Flagelo: brasa crescendo em volta de quem vai explodir
          const m = mages.get(e.id);
          if (m) {
            const at = v(m.root.position.x, m.root.position.z);
            burst(at, '#ff5a1a', 3, 0.9, 0.6, FX.magic);
            burst(at, '#ffb347', 1.6, 0.9, 1.2, FX.light);
          }
        } else if (e.spell === 'pact') {
          const m = mages.get(e.id);
          if (m) burst(v(m.root.position.x, m.root.position.z), '#c2122a', 2.6, 0.6, 1, FX.magic);
        }
      } else if (e.k === 'heal') {
        const m = mages.get(e.id);
        if (m) m.healingUntil = performance.now() / 1000 + HEAL_FX.seconds;
        burst(v(e.x, e.y), HEAL_FX.color, 2.6, HEAL_FX.seconds, .6, FX.light, .6);
        burst(v(e.x, e.y), HEAL_FX.glow, 1.5, HEAL_FX.seconds, .3, FX.magic, 1.2);
      } else if (e.k === 'hit') {
        oneShot(e.id, 'Hit_A', 0.45);
        // o acerto do raio tem impacto elétrico próprio: a explosão de fogo cobria o raio e parecia que ele não tinha saído
        if (e.src === 'lightning') zap(v(e.x, e.y));
        else explosion(v(e.x, e.y));
        scorch(v(e.x, e.y));
        // Mantém o impacto público da magia, mas não o número sobre o jogador invisível.
        if (!hiddenDamageTargets.includes(e.id)) damageNumber(v(e.x, e.y), e.dmg);
        // dano 0 (invulnerável, aliado) não sacode nem acende
        if (e.dmg > 0) impact(e.id, v(e.x, e.y), e.dmg);
      } else if (e.k === 'gold') goldNumber(v(e.x, e.y), e.n);
      else if (e.k === 'reflect') {
        burst(v(e.x, e.y), '#8fd3ff', 2.4, 0.3, 0.8, FX.circle);
        burst(v(e.x, e.y), '#cfeaff', 1.6, 0.25, 0.8, FX.light);
      }
      else if (e.k === 'lightning') bolt(e.from, e.to);
      else if (e.k === 'vines') {
        const vines = vineModel(e.r);
        vines.position.copy(w3(v(e.x, e.y), .03));
        addFx(vines, .7, (k) => { vines.scale.y = k < .25 ? k * 4 : Math.max(.01, (1 - k) / .75); });
        shockwave(v(e.x, e.y), e.r, '#8ed64b');
      }
      else if (e.k === 'grip') {
        oneShot(e.id, 'Hit_B', 0.85); // quem foi preso cambaleia para trás
        burst(v(e.x, e.y), '#6eaf34', 2.4, 0.5, 0.8, FX.magic);
      }
      else if (e.k === 'teleport') {
        // só o Teleporte lançado (não Troca, Égide nem Alteração) ganha o fade com deslize
        const m = mages.get(e.id);
        if (m && events.some((x) => x.k === 'cast' && x.id === e.id && x.spell === 'teleport')) {
          const dx = e.to.x - e.from.x, dy = e.to.y - e.from.y, n = Math.hypot(dx, dy) || 1;
          Object.assign(m, { tpAt: performance.now() / 1000, tpFrom: e.from, tpTo: e.to, tpDir: v(dx / n, dy / n) });
        }
        burst(e.from, '#c49bff', 2.4, 0.45, 0.8, FX.magic);
        burst(e.to, '#c49bff', 2.6, 0.45, 0.8, FX.magic);
        burst(e.to, '#e9d8ff', 1.6, 0.3, 0.8, FX.light);
      } else if (e.k === 'scourge') {
        shockwave(v(e.x, e.y), e.r, '#ff7a1a');
        explosion(v(e.x, e.y));
      } else if (e.k === 'pillar') {
        // projétil batendo em obstáculo também explode
        explosion(v(e.x, e.y));
        burst(v(e.x, e.y), '#d8c8b8', 1.4, 0.3, 1.2, FX.smoke);
      } else if (e.k === 'clash') {
        const at = v(e.x, e.y);
        groundMark(at, e.combo, e.r);
        if (e.combo !== 'pillar' && e.combo !== 'snow') {
          shake = Math.min(0.6, shake + e.r * 0.15);
          burst(at, '#fff1d0', e.r * 2.2, 0.25, 0.9, FX.light);
          burst(at, '#ffb347', e.r * 1.8, 0.5, 0.9, FX.fire);
          for (let i = 0; i < 6; i++) {
            const a = (i / 6) * Math.PI * 2;
            burst(v(at.x + Math.cos(a) * e.r * 0.5, at.y + Math.sin(a) * e.r * 0.5), '#ffd27a', 1.1, 0.5, 0.9, FX.spark, 1.5);
          }
        }
        if (e.combo === 'fire') {
          shockwave(at, e.r, '#ff7a1a');
          explosion(at);
          scorch(at);
        } else if (e.combo === 'arcane') {
          shockwave(at, e.r, '#c46bff');
          shockwave(at, e.r * 0.6, '#ffb347');
          burst(at, '#c46bff', 3.6, 0.5, 0.9, FX.magic);
          burst(at, '#ffd27a', 2.8, 0.4, 0.9, FX.fire);
          smoke(at, 2, 1.2);
        } else if (e.combo === 'snow') {
          shockwave(at, e.r, '#e8f8ff');
          burst(at, '#ffffff', e.r * 2, 0.4, 0.8, FX.smoke);
          burst(at, '#bfe8ff', e.r * 1.4, 0.35, 0.9, FX.spark);
        } else if (e.combo === 'detonate') {
          shockwave(at, e.r, '#9fd0ff');
          burst(at, '#e6f4ff', 2.6, 0.35, 0.9, FX.spark);
          explosion(at);
          scorch(at);
        } else {
          shockwave(at, e.r, '#b98cff');
          burst(at, '#b98cff', 2.2, 0.4, 0.9, FX.magic);
        }
      } else if (e.k === 'death') {
        const m = mages.get(e.id);
        if (m) {
          const at = v(m.root.position.x, m.root.position.z);
          // fora da pedra: caiu na lava (respingo); em cima dela: estoura em fogo
          if (inLavaAt(shownArena, shownR, shownIsles, at, 0.3)) lavaSplash(at);
          else {
            burst(at, '#ffcf5a', 4, 0.6, 0.3, FX.fire);
            smoke(at, 2.6, 1.6);
          }
        }
      }
    }
  }

  function syncProjectiles(list: ProjView[]) {
    const seen = new Set<number>();
    for (const p of list) {
      if (p.kind === 'illusion') continue;
      seen.add(p.id);
      let g = projs.get(p.id);
      if (!g) {
        g = new THREE.Group();
        const look = LOOK[p.kind];
        const core = SHAPES[p.kind]?.() ?? new THREE.Mesh(ballGeo, look.mat);
        core.scale.multiplyScalar(look.size);
        const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: FX.light, color: look.halo, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
        halo.scale.setScalar(1.2 * look.size);
        halo.material.opacity = 0.7;
        g.add(core, halo);
        if (p.kind === 'warpzone' || p.kind === 'grip') {
          core.scale.setScalar(p.vel.x); // vel.x = raio
          halo.visible = false;
        }
        if (p.kind === 'geyser') { core.scale.set(p.vel.x, 1, p.vel.x); halo.visible = false; }
        // fogo de verdade: chama animada em volta dos projéteis de fogo; redemoinho na Gravidade e na Zona de dobra
        if (FIRE_KINDS.has(p.kind)) {
          const flame = new THREE.Sprite(new THREE.SpriteMaterial({ map: FLAMES[0], color: '#ffc060', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
          flame.name = 'flame';
          flame.scale.setScalar(1.3 * look.size);
          g.add(flame);
        } else if (p.kind === 'gravity' || p.kind === 'warpzone') {
          const swirl = new THREE.Sprite(new THREE.SpriteMaterial({ map: p.kind === 'gravity' ? FX.twirl : FX.twirl2, color: p.kind === 'gravity' ? '#7a5cff' : '#5ab0ff', transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
          swirl.name = 'swirl';
          swirl.scale.setScalar(p.kind === 'gravity' ? 1.6 * look.size : p.vel.x * 2.2);
          g.add(swirl);
        }
        if (p.kind === 'link') {
          // fio do Elo até quem lançou (vel = posição dele)
          const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1, 6).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#7ab8ff', transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
          g.add(beam);
        }
        if (p.kind === 'meteor') {
          // aviso no chão: círculo do tamanho da explosão, que pulsa até a pedra cair
          const warn = new THREE.Mesh(scorchGeo, new THREE.MeshBasicMaterial({ map: FX.circle, color: '#ff3a1a', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
          warn.rotation.x = -Math.PI / 2;
          warn.scale.setScalar((p.vel.x * 2) / 1.6);
          warn.name = 'warn';
          g.add(warn);
        }
        scene.add(g);
        projs.set(p.id, g);
      }
      if (p.kind === 'meteor') {
        const y = 0.9 + p.vel.y * 8; // vel.y = segundos até cair
        g.position.copy(w3(p.pos, y));
        const warn = g.getObjectByName('warn') as THREE.Mesh;
        warn.position.y = 0.04 - y;
        (warn.material as THREE.MeshBasicMaterial).opacity = 0.5 + 0.4 * Math.sin(performance.now() / 70);
      } else if (p.kind === 'grip') g.position.copy(w3(p.pos, .045));
      else if (p.kind === 'warpzone') g.position.copy(w3(p.pos, 0));
      else if (p.kind === 'geyser') g.position.copy(w3(p.pos, 0));
      else g.position.copy(w3(p.pos, 0.9));
      if (p.kind === 'link') {
        const dx = p.vel.x - p.pos.x, dz = p.vel.y - p.pos.y;
        const beam = g.children[2]; // filhos do Elo: corpo, halo e fio (ele não ganha chama nem redemoinho)
        beam.position.set(dx / 2, 0, dz / 2);
        beam.rotation.y = Math.atan2(dx, dz);
        beam.scale.set(1, 1, Math.hypot(dx, dz));
      }
      // giro e direção: aponta para onde voa; anéis, bumerangue e pedras giram
      const body = g.children[0];
      const t = performance.now() / 1000;
      if (p.kind !== 'meteor' && p.kind !== 'warpzone' && p.kind !== 'grip' && p.kind !== 'geyser' && p.kind !== 'link' && (p.vel.x || p.vel.y)) body.rotation.y = Math.atan2(p.vel.x, p.vel.y);
      if (p.kind === 'geyser') {
        body.rotation.y = t * .8;
        if (Math.random() < (lite ? .15 : .45)) burst(v(p.pos.x + (Math.random() - .5) * p.vel.x, p.pos.y + (Math.random() - .5) * p.vel.x), GEYSER_FX.foam, .35, .6, .2, FX.light, 2.1);
      }
      if (p.kind === 'boomerang') body.rotation.y = t * 18;
      else if (p.kind === 'fireball' || p.kind === 'meteor' || p.kind === 'cluster' || p.kind === 'bouncer' || p.kind === 'snowball' || p.kind === 'splitter' || p.kind === 'shard') body.rotation.set(t * 3, t * 4, 0);
      else if (p.kind === 'link') body.rotation.y = t * 6;
      body.traverse((o) => {
        if (o !== body && o.name === 'spin') o.rotation.y = t * 6; // anel simétrico: girar no próprio eixo não aparece
      });
      const flame = g.getObjectByName('flame') as THREE.Sprite | undefined;
      if (flame) {
        flame.material.map = FLAMES[Math.floor(t * 16 + p.id) % FLAMES.length];
        flame.material.rotation = Math.atan2(-p.vel.x, p.vel.y) + Math.PI; // a chama "puxa" para trás
        flame.scale.setScalar(LOOK[p.kind].size * (1.2 + 0.15 * Math.sin(t * 30 + p.id)));
      }
      const swirl = g.getObjectByName('swirl') as THREE.Sprite | undefined;
      if (swirl) swirl.material.rotation = -t * 4;
      // rastro: brasas que ficam para trás e somem
      const look = LOOK[p.kind];
      if (p.kind !== 'warpzone' && p.kind !== 'grip' && p.kind !== 'geyser' && Math.random() < (lite ? 0.35 : 0.7)) burst(p.pos, look.trail, 1.1 * look.size, 0.35, 0.9, FIRE_KINDS.has(p.kind) ? FLAMES[Math.floor(Math.random() * FLAMES.length)] : look.tex);
    }
    for (const [id, g] of projs) if (!seen.has(id)) {
      scene.remove(g);
      dispose(g); // corpo, halo e aviso são de cada projétil (geometrias compartilhadas ficam)
      projs.delete(id);
    }
  }

  function syncWizards(list: WizDraw[], now: number) {
    const seen = new Set<string>();
    for (const d of list) {
      let m = mages.get(d.id);
      const look = d.look ?? lookOf(d.character as CharacterId);
      // trocou de aparência (vale até no meio da luta): o boneco novo entra quando estiver montado, e só então o antigo sai
      if (!m || m.look !== look) {
        const made = makeMage(d, look);
        if (!made && !m) continue;
        if (made && m) {
          unburn(m);
          scene.remove(m.root);
          dispose(m.vines); // Os cipós procedurais pertencem à aparência que está sendo substituída.
          for (const o of [m.ring, m.shield, m.aura]) (o.material as THREE.Material).dispose();
          for (const x of m.mats) x.m.dispose();
          m.label.remove();
        }
        if (made) mages.set(d.id, (m = made));
      }
      if (!m) continue;
      seen.add(d.id);
      // modo Times: anel e barra na cor do time (pode mudar a cada rodada); o nome fica com a cor do jogador
      const tint = d.team != null ? TEAM_COLORS[d.team] : COLORS[d.color];
      if (m.tint !== tint) {
        m.tint = tint;
        (m.ring.material as THREE.MeshBasicMaterial).color.set(tint);
        m.hpFill.style.background = tint;
        m.nameEl.style.color = d.team != null ? COLORS[d.color] : '';
      }
      const hidden = !d.illusion && (d.status & 2048) > 0; // a cópia é sempre visível; os inimigos não veem o jogador velado
      m.root.visible = !hidden;
      m.model.position.y = d.alive ? geyserHeight(d.geyserLeft ?? 0) : 0;
      // A cópia é sólida e visível; a invisibilidade vale somente para o jogador real.
      const ghost = !!d.ghost || (d.status & (1024 | 8388608)) > 0; // Caminhada no vento e o véu visto por si ou pela visão de teste da sandbox
      // Teleporte: tk de 0 a 1 sumindo e deslizando rumo ao destino, de 1 a 2 chegando de um pouco atrás; 2 = sem efeito
      const tk = Math.min(2, (now - m.tpAt) / TP), fade = tk < 1 ? 1 - tk : tk - 1, faded = fade < 1;
      if (m.ghost !== ghost || faded || m.faded) {
        m.ghost = ghost;
        m.faded = faded;
        for (const x of m.ghostMats) Object.assign(x.m, { transparent: ghost || faded || x.transparent, opacity: x.opacity * (ghost ? (d.ghost ? 0.45 : 0.35) : 1) * fade, needsUpdate: true });
        m.label.style.opacity = ghost ? '0.6' : '';
      }
      m.root.position.copy(w3(tk < 1 ? add(m.tpFrom, scale(m.tpDir, tk * TP_SLIDE)) : tk < 2 ? add(m.tpTo, scale(m.tpDir, (tk - 2) * TP_SLIDE)) : d.pos));
      m.root.rotation.y = Math.PI / 2 - d.facing;
      m.vines.visible = d.alive && !!(d.status & 128);
      // Escudo: bolha no raio real que vai apagando, e a barrinha do tempo que falta
      if (d.shield && !m.shield.visible) m.shieldSince = now;
      m.shield.visible = d.shield && d.alive;
      if (d.shieldR) m.shield.scale.setScalar(d.shieldR / 0.85);
      const shieldLeft = Math.max(0, 1 - (now - m.shieldSince) / SHIELD_SECS);
      (m.shield.material as THREE.MeshBasicMaterial).opacity = 0.12 + 0.28 * shieldLeft;
      m.shieldBar.hidden = !m.shield.visible;
      if (m.shield.visible) m.shieldFill.style.width = `${shieldLeft * 100}%`;
      // anel no chão: dourado pulsando invulnerável (começo da rodada), azul da runa com Escudo de runa
      const invuln = (d.status & 32) > 0, armor = (d.status & 1048576) > 0; // runa do Escudo: −30% de dano
      const healing = healAura(m.healingUntil ?? 0, now);
      m.aura.visible = d.alive && (healing.visible || invuln || armor);
      m.aura.scale.setScalar(healing.visible ? healing.scale : 1.45);
      if (m.aura.visible) {
        const mat = m.aura.material as THREE.MeshBasicMaterial;
        mat.color.set(healing.visible ? HEAL_FX.color : (d.geyserLeft ?? 0) > 0 ? GEYSER_FX.color : invuln ? '#ffd36a' : RUNE_COLOR.shield);
        mat.opacity = healing.visible ? healing.opacity : invuln ? 0.55 + 0.3 * Math.sin(now * 8) : 0.8;
      }
      m.ring.visible = d.alive;
      if (!d.alive) {
        if (!m.dead) {
          m.dead = true;
          // caiu na lava (fora da pedra e fora das ilhas): Death_A, que é a pose dos ossos, e o corpo queima; na pedra, Death_B (cai de costas)
          const lava = inLavaAt(shownArena, shownR, shownIsles, d.pos);
          play(m, lava ? 'Death_A' : 'Death_B', 0.1);
          if (lava) {
            m.burnAt = now;
            loadFile(BONES);
          }
        }
        if (m.burnAt >= 0) burnCorpse(m, now - m.burnAt, d.pos);
      } else {
        if (m.dead) {
          m.dead = false;
          unburn(m);
        }
        // nasceu (começo da rodada ou volta no deathmatch): a invulnerabilidade do começo acabou de ligar
        if (invuln && !m.invuln && !(d.geyserLeft ?? 0)) oneShot(d.id, 'Spawn_Ground', 1.3);
        // atordoado (16: arremessado por um golpe) voa de braços abertos
        if ((d.geyserLeft ?? 0) > 0) { m.oneShotUntil = 0; play(m, 'Jump_Idle', .05); }
        else if ((d.basicLeft ?? 0) > 0 && !(d.status & 16) && m.actions.Attack_Invoke) {
          play(m, 'Attack_Invoke', .03);
          const action = m.actions.Attack_Invoke;
          action.paused = true;
          action.time = Math.max(0, action.getClip().duration - d.basicLeft!);
          m.oneShotUntil = 0; // o snapshot encerra a pose na soltura ou no cancelamento, sem terminar o gesto à força.
        } else if (m.current === 'Attack_Invoke' || now > m.oneShotUntil) play(m, d.cheer ? 'Cheer' : d.status & BRACING_BIT && m.actions.Brace ? 'Brace' : d.status & 16 ? 'Jump_Idle' : d.moving ? 'Running_A' : 'Idle');
        // vencedor: estouro dourado ao começar a comemorar e faíscas subindo enquanto dura
        if (d.cheer && !m.cheering) victoryBurst(d.pos);
        if (d.cheer && !lite && Math.random() < 0.2) burst(v(d.pos.x + (Math.random() - 0.5) * 1.4, d.pos.y + (Math.random() - 0.5) * 1.4), Math.random() < 0.5 ? '#ffd84a' : '#fff2a0', 0.7, 1.2, 0.4, FX.star, 2.6);
      }
      // queimando na lava (issue #225): de cima não se via que o mago estava tomando dano; faíscas e labaredas pequenas nos pés
      // (no modo leve, poucas: com muitos magos na lava o teto de partículas FX_CAP segura o resto)
      const burning = d.alive && !hidden && inLavaAt(shownArena, shownR, shownIsles, d.pos);
      if (burning) {
        const feet = () => v(d.pos.x + (Math.random() - 0.5) * 0.7, d.pos.y + (Math.random() - 0.5) * 0.7);
        if (Math.random() < (lite ? 0.05 : 0.25)) burst(feet(), Math.random() < 0.5 ? '#ff8a2a' : '#ffd060', 0.35, 0.8, 0.2, glow, 1.4);
        if (!lite && Math.random() < 0.15) burst(feet(), Math.random() < 0.5 ? '#ff7a1a' : '#ffb347', 0.35, 0.8, 0.1, FLAMES[Math.floor(Math.random() * FLAMES.length)], 0.7); // as mesmas chamas do chão de fogo
      }
      m.cheering = d.cheer && d.alive;
      m.invuln = invuln;
      // brasa pulsando enquanto queima (o clarão do golpe passa por cima); parou de queimar vivo ou morrendo fora da lava: volta
      // a cor própria; morreu na lava (burnAt marcado neste quadro): o burnCorpse cuida da cor do corpo
      const electro = d.alive && !!(d.status & ELECTROCUTED_BIT);
      if (m.flash <= 0 && (electro || m.electro || burning || (m.burning && m.burnAt < 0))) for (const x of m.mats) {
        if (electro) {
          x.m.emissive.setRGB(.3, .7, 1);
          x.m.emissiveIntensity = electroPulse(true, now, lite);
        } else if (burning) {
          x.m.emissive.copy(EMBER);
          x.m.emissiveIntensity = 0.35 + 0.25 * Math.sin(now * 9);
        } else {
          x.m.emissive.copy(x.c);
          x.m.emissiveIntensity = x.i;
        }
      }
      // Materiais clonados: escurece só este mago e restaura a cor própria ao terminar.
      if (d.alive) for (const x of m.mats) x.m.color.copy(x.col).multiplyScalar((d.closedBodyLeft ?? 0) > 0 ? .08 : 1);
      m.burning = burning;
      m.electro = electro;
      // clarão branco do golpe: some em ~0,15 s
      if (m.flash > 0) {
        m.flash = Math.max(0, m.flash - 0.12);
        for (const x of m.mats) {
          if (m.flash > 0) {
            x.m.emissive.setRGB(1, 0.95, 0.85);
            x.m.emissiveIntensity = m.flash * 1.6;
          } else {
            x.m.emissive.copy(x.c);
            x.m.emissiveIntensity = x.i;
          }
        }
      }
      if (d.alive && (d.closedBodyLeft ?? 0) > 0) for (const x of m.mats) x.m.emissiveIntensity = 0;
      m.label.hidden = !d.alive || hidden;
      // ícones de efeito em cima do mago (negativos primeiro)
      if (m.statusKey !== d.status) {
        m.statusKey = d.status;
        m.statusClocks.clear();
        // Égide pronta (131072) não vira ícone: tem o selo próprio ao lado da barra (aegisEl)
        m.statusEl.replaceChildren(...STATUS_ICONS.filter(([bit]) => d.status & bit && bit !== 131072).map(([bit, ico, name]) => {
          const c = el('b', { class: 'fx-clock', 'aria-hidden': 'true' });
          m.statusClocks.set(bit, c);
          return el('i', { title: name, class: BAD_STATUS.includes(bit) ? 'bad' : 'good' }, c, icon(ico));
        }));
      }
      // reloginho em cima de cada efeito com prazo: os mesmos segundos da fileira acima da barra (mesma conta, fxClock)
      for (const [bit, c] of m.statusClocks) {
        const left = d.fx ? m.clock(d.fx, bit) : null;
        c.textContent = left?.text ?? '';
        c.style.setProperty('--left', left ? left.frac.toFixed(3) : '0');
      }
      // Investida na barra (estilo Overwatch): o que ainda absorve vem depois da vida; passando do máximo, a barra inteira encolhe
      const rush = d.rushLeft ?? 0;
      const total = Math.max(d.hpMax, d.hp + rush);
      m.hpFill.style.width = `${Math.max(0, Math.min(100, (d.hp / total) * 100))}%`;
      m.absRush.hidden = !rush;
      if (rush) m.absRush.style.width = `${(rush / total) * 100}%`;
      m.aegisEl.hidden = !(d.status & 131072);
      m.bar.classList.toggle('invuln', invuln);
      // cura: a vida subiu (fora da volta à vida e do começo da rodada, que enchem a barra)
      if (d.alive && m.prevAlive && !invuln && !hidden && d.hp > m.prevHp) {
        const gain = d.hp - m.prevHp;
        if (gain >= HEAL_NOW) {
          healNumber(d.pos, gain);
          m.healAt = now;
        } else m.healSum += gain;
      }
      if (now >= m.healFlushAt) {
        if (m.healSum >= HEAL_SUM && d.alive && !hidden) healNumber(d.pos, m.healSum);
        m.healSum = 0;
        m.healFlushAt = now + 1;
      }
      // brilho verde sutil só nas curas grandes
      m.bar.classList.toggle('heal', now - m.healAt < 0.6);
      // ao lado da barra: +N/s enquanto a vida volta (na pedra, sem vida cheia; na lava não regenera) e o que cada escudo ainda absorve
      const regen = d.alive && d.hp < d.hpMax && (d.regen ?? 0) > 0 && edgeAt(shownArena, shownR, d.pos) >= 0 ? d.regen! : 0;
      const key = `${regen}|${armor}|${rush}`;
      if (m.extraKey !== key) {
        m.extraKey = key;
        const part = (cls: string, text: string, ico?: string) => {
          return el('span', { class: cls }, ico && icon(ico), text);
        };
        m.extraEl.replaceChildren(...[
          regen ? part('regen', `+${Math.round(regen * 10) / 10}/s`) : null,
          armor ? part('rune', `+${Math.round(RUNE.armor * 100)}%`, RUNE_ICON.shield) : null, // + como bônus de defesa (pedido do Sky, 19/10); o dano levado cai 30%
          rush ? part('rush', String(Math.ceil(rush)), ICON.rush) : null,
        ].filter((e) => e !== null));
      }
      m.prevHp = d.hp;
      m.prevAlive = d.alive;
      m.hpText.textContent = `${Math.max(0, Math.ceil(d.hp))}/${d.hpMax}`;
      if (m.botKey !== (d.bot ?? '')) {
        m.botKey = d.bot ?? '';
        m.botEl.hidden = !d.bot;
        m.botEl.replaceChildren(icon(UI_ICON.bot), d.bot ? BOT_LEVEL[d.bot] : '');
      }
      // medalha de ouro, prata ou bronze com a colocação, à esquerda do nome (Fernando, 21/10: medalha
      // com o número dentro, no lugar da pontuação)
      const place = d.place && d.place <= 3 ? String(d.place) : '';
      if (m.medalEl.textContent !== place) {
        m.medalEl.textContent = place;
        m.medalEl.className = `wiz-medal medal-${place}`;
        m.medalEl.hidden = !place;
      }
      // Ascensão: nível e XP embaixo da vida, para todos; subir de nível ao vivo comemora (Fernando, 21/10: animação ao subir
      // de nível ao vivo, com o boneco comemorando)
      m.xpEl.hidden = !d.xp;
      if (d.xp) {
        m.xpFill.style.width = `${(d.xp.frac * 100).toFixed(1)}%`;
        if (d.xp.level !== m.level) {
          m.xpLv.textContent = String(d.xp.level);
          if (m.level && d.xp.level > m.level && d.alive) {
            oneShot(d.id, ...PARTY);
            victoryBurst(d.pos, '#3d7bff', '#8cbcff');
            m.label.classList.remove('lvup');
            void m.label.offsetWidth; // reinicia a animação se subir de novo logo em seguida
            m.label.classList.add('lvup');
          }
          m.level = d.xp.level;
        }
      }
      m.lootBar.hidden = !d.loot;
      if (d.loot) m.lootFill.style.width = `${Math.min(100, d.loot * 100)}%`;
    }
    for (const [id, m] of mages) if (!seen.has(id)) {
      m.root.visible = false;
      m.label.hidden = true;
    }
  }

  let focus = new THREE.Vector3();
  // câmera do jogador: roda do mouse aproxima/afasta; Espaço + arrastar desloca (Espaço sozinho volta ao centro)
  let zoom = 1;
  const pan = new THREE.Vector3();
  let lastDist = 20;
  const raycaster = new THREE.Raycaster();
  const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

  let composer: EffectComposer | null = null;
  const renderPass = new RenderPass(scene, camera);
  // pós-processamento (bloom e o pixel art, que depende dele) só no PC; no celular a cena vai direto ao renderer
  if (!mobile) {
    composer = new EffectComposer(renderer);
    composer.addPass(renderPass);
    composer.addPass(new UnrealBloomPass(new THREE.Vector2(256, 256), 0.4, 0.45, 0.85));
    composer.addPass(new OutputPass());
  }
  let pixelSize = 0; // tamanho do bloco em pixels da tela (0 = desligado); 2 ou 3 escolhidos nas Configurações
  // pixel art (issue #79): cena em blocos de pixelSize×pixelSize px com contorno, no lugar do RenderPass; só existe com o composer (PC)
  let pixelPass: RenderPixelatedPass | null = null;
  let pixelShift = ''; // deslize da imagem que completa a câmera presa à grade
  let camK = 1; // quantas vezes mais longe fica a câmera do pixel art (ângulo menor, mesmo enquadramento)
  const makePixelPass = () => {
    const pass = new RenderPixelatedPass(pixelSize * renderer.getPixelRatio(), scene, camera, { depthEdgeStrength: 0.4, normalEdgeStrength: 0.3 });
    // o passe compara a profundidade crua, feita para câmera ortográfica; na nossa perspectiva a diferença some.
    // Em metros (×0,04), o contorno aparece quando a borda tem ~0,25 a 0,5 m de degrau
    const m = pass.pixelatedMaterial;
    Object.assign(m.uniforms, { cameraNear: { value: camera.near }, cameraFar: { value: camera.far } });
    m.fragmentShader = '#include <packing>\nuniform float cameraNear;\nuniform float cameraFar;\n' + m.fragmentShader.replace(/return texture2D\( tDepth, ([^;]+) \)\.r;/, 'return -perspectiveDepthToViewZ(texture2D( tDepth, $1 ).r, cameraNear, cameraFar) * 0.04;');
    // a troca é no texto do shader do three 0.186: se uma versão nova mudar o trecho, o contorno escuro some e o aviso mostra
    if (!m.fragmentShader.includes('perspectiveDepthToViewZ')) console.warn('pixel art: o shader do RenderPixelatedPass mudou; contorno por profundidade desligado');
    return pass;
  };

  function resize() {
    const w = innerWidth, h = innerHeight;
    renderer.setSize(w, h, false);
    composer?.setSize(w, h);
    camera.aspect = w / h;
    // distância para caber a arena inteira; retrato (celular em pé) precisa de mais
    camera.userData.fit = camera.aspect < 1 ? 1 / Math.max(0.5, camera.aspect) : 1;
    camera.updateProjectionMatrix();
  }
  addEventListener('resize', resize);
  resize();

  let lastFrame = performance.now() / 1000;
  // retículo do controle: anel dourado com um ponto no meio, no chão onde o analógico direito mira (desenhado por cima de tudo)
  const aimMat = new THREE.MeshBasicMaterial({ color: '#ffe08a', transparent: true, opacity: 0.95, depthTest: false, depthWrite: false });
  const aimRing = new THREE.Mesh(new THREE.RingGeometry(0.45, 0.62, 40), aimMat);
  aimRing.add(new THREE.Mesh(new THREE.CircleGeometry(0.12, 16), aimMat));
  aimRing.rotation.x = -Math.PI / 2;
  aimRing.renderOrder = 10;
  aimRing.visible = false;
  scene.add(aimRing);
  // círculo de alcance da magia segurada ou escolhida: anel fino e discreto na cor da mira, escalado pelo alcance
  const rangeRing = new THREE.Mesh(new THREE.RingGeometry(0.985, 1, 128), new THREE.MeshBasicMaterial({ color: '#ffe08a', transparent: true, opacity: 0.45, depthWrite: false }));
  rangeRing.rotation.x = -Math.PI / 2;
  rangeRing.renderOrder = 9;
  rangeRing.visible = false;
  scene.add(rangeRing);
  // explosão do Meteoro no ponto onde ele cai: o mesmo anel, do tamanho da explosão
  const blastRing = rangeRing.clone();
  scene.add(blastRing);
  const hits: THREE.Mesh[] = []; // discos do "Ver hitbox", criados conforme precisa
  // faixas de acerto da mira (a Rajada e o Divisor saem em leque), bem claras para não esconder o chão: corpo reto para a frente (+x)
  // e ponta em meio círculo do tamanho da bola, onde ela termina o voo, como a prévia do LoL (pedido do Fernando, 21/10); giradas só
  // em y e criadas conforme precisa
  const bandMat = new THREE.MeshBasicMaterial({ color: '#ffe08a', transparent: true, opacity: 0.16, depthWrite: false });
  const bandBody = new THREE.PlaneGeometry(1, 1).translate(0.5, 0, 0).rotateX(-Math.PI / 2);
  const bandCap = new THREE.CircleGeometry(1, 24, -Math.PI / 2, Math.PI).rotateX(-Math.PI / 2);
  const bands: THREE.Group[] = [];
  const coneGeo = new THREE.BufferGeometry();
  coneGeo.setAttribute('position',new THREE.BufferAttribute(new Float32Array(9),3));
  const coneAim = new THREE.Mesh(coneGeo,new THREE.MeshBasicMaterial({color:'#d5b474',transparent:true,opacity:.25,side:THREE.DoubleSide,depthWrite:false}));
  coneAim.visible=false; coneAim.renderOrder=9; scene.add(coneAim);
  const blindMask = blindnessMask(camera); scene.add(blindMask);

  return {
    ready,
    onEvents,
    // centro no mago e raio em metros; null (ou raio 0) esconde. blastAt/blastR: o círculo da explosão no ponto mirado
    range(at: Vec | null, r: number, blastAt: Vec | null = null, blastR = 0) {
      blastRing.visible = !!blastAt && blastR > 0;
      if (blastAt && blastR > 0) {
        blastRing.position.copy(w3(blastAt, 0.04));
        blastRing.scale.setScalar(blastR);
      }
      rangeRing.visible = !!at && r > 0;
      if (!at || r <= 0) return;
      rangeRing.position.copy(w3(at, 0.04));
      rangeRing.scale.setScalar(r);
    },
    // "Ver hitbox (teste)": disco no chão de cada mago (vermelho) e de cada projétil (azul), no tamanho da colisão; null esconde
    hitboxes(list: { pos: Vec; r: number; wiz: boolean }[] | null) {
      for (let i = hits.length; i < (list?.length ?? 0); i++) {
        const m = new THREE.Mesh(new THREE.CircleGeometry(1, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.45, depthWrite: false }));
        m.renderOrder = 9;
        scene.add(m);
        hits.push(m);
      }
      hits.forEach((m, i) => {
        const h = list?.[i];
        m.visible = !!h;
        if (!h) return;
        m.position.copy(w3(h.pos, 0.045));
        m.scale.setScalar(h.r);
        (m.material as THREE.MeshBasicMaterial).color.set(h.wiz ? '#ff4040' : '#40c8ff');
      });
    },
    // trechos de faixa [de, até] com meia largura `half`; lista vazia esconde
    cone(points: [Vec,Vec,Vec] | null) {
      coneAim.visible=!!points;
      if(points) { const a=coneGeo.getAttribute('position'); points.forEach((p,i)=>a.setXYZ(i,p.x,.04,p.y)); a.needsUpdate=true; coneGeo.computeBoundingSphere(); }
    },
    bands(segs: [Vec, Vec][], half: number) {
      for (let i = bands.length; i < segs.length; i++) {
        const g = new THREE.Group();
        const [body, cap] = [new THREE.Mesh(bandBody, bandMat), new THREE.Mesh(bandCap, bandMat)];
        body.renderOrder = cap.renderOrder = 9;
        g.add(body, cap);
        scene.add(g);
        bands.push(g);
      }
      const w = Math.max(half, 0.03); // o Raio (largura 0) vira uma linha de 6 cm para aparecer
      bands.forEach((g, i) => {
        const sg = segs[i];
        g.visible = !!sg;
        if (!sg) return;
        const d = sub(sg[1], sg[0]), l = Math.max(len(d) - w, 0);
        const [body, cap] = g.children;
        g.position.copy(w3(sg[0], 0.035));
        g.rotation.y = -Math.atan2(d.y, d.x);
        body.scale.set(l, 1, 2 * w);
        cap.position.x = l;
        cap.scale.set(w, 1, w);
      });
    },
    aim(at: Vec | null) {
      aimRing.visible = !!at;
      if (at) aimRing.position.copy(w3(at, 0.05));
      aimRing.scale.setScalar(1 + 0.08 * Math.sin(performance.now() / 120));
    },
    // baixa antes as peças de quem está na sala, para ninguém aparecer invisível na rodada
    preload(looks: string[]) {
      for (const look of looks) void loadLook(look);
    },
    // ponto do chão sob o cursor, em coordenadas da simulação
    pick(clientX: number, clientY: number): Vec | null {
      const ndc = new THREE.Vector2((clientX / innerWidth) * 2 - 1, -(clientY / innerHeight) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
      const hit = new THREE.Vector3();
      return raycaster.ray.intersectPlane(floorPlane, hit) ? v(hit.x, hit.z) : null;
    },
    pickMage(clientX: number, clientY: number): string | undefined {
      raycaster.setFromCamera(new THREE.Vector2((clientX / innerWidth) * 2 - 1, -(clientY / innerHeight) * 2 + 1), camera);
      let found: { id: string; distance: number } | undefined;
      for (const [id, m] of mages) {
        if (!m.root.visible || m.dead) continue;
        const hit = raycaster.intersectObject(m.model, true)[0];
        if (hit && (!found || hit.distance < found.distance)) found = { id, distance: hit.distance };
      }
      return found?.id;
    },
    clickMarker(at: Vec, cast: boolean) {
      const ring = new THREE.Mesh(markerGeo, new THREE.MeshBasicMaterial({ color: cast ? '#ffb347' : '#7dff9a', transparent: true, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2;
      ring.position.copy(w3(at, 0.04));
      addFx(ring, 0.45, (k) => {
        ring.scale.setScalar(1 + k * 2);
        (ring.material as THREE.MeshBasicMaterial).opacity = 1 - k;
      });
      // segundo anel que fecha sobre o ponto ("travou aqui") e um pingo de luz no centro
      const lock = new THREE.Mesh(markerGeo, new THREE.MeshBasicMaterial({ color: cast ? '#ffe0a0' : '#c8ffd4', transparent: true, depthWrite: false }));
      lock.rotation.x = -Math.PI / 2;
      lock.position.copy(w3(at, 0.045));
      addFx(lock, 0.3, (k) => {
        lock.scale.setScalar(2.6 - k * 1.8);
        (lock.material as THREE.MeshBasicMaterial).opacity = Math.min(1, k * 4) * (1 - k);
      });
      burst(at, cast ? '#ffb347' : '#7dff9a', 0.7, 0.25, 0.08, FX.light);
    },
    // pixel art (issue #79): só no PC, onde há composer
    setPixel(size: number) {
      if (!composer || size === pixelSize) return;
      const on = size > 0;
      pixelSize = size;
      if (on && pixelPass) pixelPass.setPixelSize(size * renderer.getPixelRatio());
      const want = on ? (pixelPass ??= makePixelPass()) : renderPass;
      if (composer.passes[0] !== want) {
        composer.removePass(composer.passes[0]);
        composer.insertPass(want, 0);
      }
      // câmera quase sem perspectiva: 1 bloco mede o mesmo no chão da tela toda, e a grade presa não balança nas bordas
      camera.fov = on ? 12 : 40;
      // 20° = metade do campo de visão normal (40°): com o ângulo menor, a câmera recua camK vezes para enquadrar a mesma arena
      camK = Math.tan(THREE.MathUtils.degToRad(20)) / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
      camera.near = on ? 2 : 0.5;
      camera.far = on ? 400 : 200;
      camera.updateProjectionMatrix();
      Object.assign(pixelPass!.pixelatedMaterial.uniforms.cameraNear, { value: camera.near });
      Object.assign(pixelPass!.pixelatedMaterial.uniforms.cameraFar, { value: camera.far });
    },
    // Efeitos: true = Leve (sem tremor, hit-stop e partículas extras)
    setFx(on: boolean) {
      lite = on;
      if (lite) shake = 0;
      for (const s of embers) s.visible = false;
    },
    // balão do taunt em cima do mago por 2,5 s, com o gesto do tom (TAUNT_ANIM)
    bubble(id: string, text: string, taunt?: keyof typeof TAUNT_ANIM) {
      const m = mages.get(id);
      if (!m) return false;
      if (taunt) oneShot(id, ...TAUNT_ANIM[taunt]);
      m.label.querySelector('.bubble')?.remove();
      const b = el('div', { class: 'bubble' }, text);
      m.label.prepend(b);
      setTimeout(() => b.remove(), 2500);
      return true;
    },
    zoomBy(deltaY: number) {
      zoom = Math.min(1.7, Math.max(0.45, zoom * Math.exp(deltaY * 0.0012)));
    },
    // arrasto em pixels de tela → deslocamento no chão (o chão "anda junto" com o mouse)
    panBy(dx: number, dy: number) {
      const k = (lastDist * 1.1) / innerHeight;
      pan.x -= dx * k;
      pan.z -= dy * k * 1.3;
      pan.clampLength(0, 30);
    },
    resetCamera() {
      pan.set(0, 0, 0);
    },
    castLocal(id: string, spell: string, at?: Vec) {
      oneShot(id, ...castAnim(spell));
      const m = mages.get(id);
      if (!m || m.dead) return;
      // brilho na mão (um pouco à frente do mago, na cor da magia) e linha de mira fraca até o ponto
      const color = spell === 'cluster' ? '#d7bc85' : spell === 'heal' ? HEAL_FX.color : LOOK[spell as keyof typeof LOOK]?.halo ?? '#ffb347';
      const from = v(m.root.position.x, m.root.position.z);
      const dir = at ? Math.atan2(at.y - from.y, at.x - from.x) : Math.PI / 2 - m.root.rotation.y;
      const hand = v(from.x + Math.cos(dir) * 0.45, from.y + Math.sin(dir) * 0.45);
      burst(hand, color, 1.3, 0.35, 1.15, FX.light);
      burst(hand, spell === 'heal' ? HEAL_FX.glow : '#ffffff', 0.6, 0.2, 1.15, FX.light);
      if (!at || Math.hypot(at.x - from.x, at.y - from.y) < 0.8) return;
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([w3(hand, 0.9), w3(at, 0.1)]), new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }));
      addFx(line, 0.35, (k) => ((line.material as THREE.LineBasicMaterial).opacity = 0.35 * (1 - k)));
    },
    render(state: { blindAt?: Vec | null; arena: ArenaId; arenaR: number; shrinkIn: number; wizards: WizDraw[]; projectiles: ProjView[]; pillars: PillarView[]; loots: { pos: Vec; left: number }[]; runes: RuneView[]; zones?: ZoneView[]; isles?: Isle[]; follow: Vec | null; lock?: boolean; effect?: RoundEffectId | null; arcane?: boolean }) {
      const now = performance.now() / 1000;
      const dt = Math.min(0.05, now - lastFrame);
      lastFrame = now;
      blindMask.visible=!!state.blindAt;
      if(state.blindAt) blindMask.material.uniforms.center.value.set(state.blindAt.x,state.blindAt.y);
      lavaMat.uniforms.uTime.value = now;

      // arena nova (sorteada a cada rodada): troca o chão e a borda
      if (state.arena !== shownArena) {
        shownArena = state.arena;
        arena.geometry.dispose();
        arena.geometry = floorGeo(shownArena);
        shoreU.uSdf.value.dispose();
        shoreU.uSdf.value = sdfTexture(shownArena);
        shoreU.uSpan.value = sdfSpan(shownArena);
        warnR = -1;
      }
      // a decoração em volta se afasta da pedra quando a arena muda ou cresce (rodada nova); no encolhimento fica
      if (state.arena !== decorArena || state.arenaR > decorR + 0.3) decor.layout((p) => edgeAt(state.arena, state.arenaR, p));
      decorR = state.arena !== decorArena || state.arenaR > decorR + 0.3 ? state.arenaR : Math.min(decorR, state.arenaR);
      decorArena = state.arena;
      shownR += (state.arenaR - shownR) * Math.min(1, dt * 4);
      arena.scale.set(shownR, 1, shownR);
      shoreU.uR.value = Math.max(0.01, shownR);
      shoreU.uShoreTime.value = now;
      shoreU.uLick.value = lite ? 0 : 1;
      // Tempo chuvoso: a lava esfria aos poucos (~1 s) para 55% do brilho, por cima e por baixo da borda
      heat += ((state.effect === 'lava' ? 0.55 : 1) - heat) * Math.min(1, dt * 3);
      const arcane = state.arcane && state.effect === 'gold';
      const tint = arcane ? ([ARCANE.tint, SHORE_TINT.gold![1]] as [string, number]) : state.effect ? SHORE_TINT[state.effect] : undefined;
      if (tint) shoreU.uTint.value.set(tint[0]);
      tintK += ((tint?.[1] ?? 0) - tintK) * Math.min(1, dt * 3);
      shoreU.uTintK.value = tintK;
      lavaMat.uniforms.uHeat.value = heat;
      under.intensity = (52 + Math.sin(now * 2) * 9 + Math.sin(now * 7.3) * 3) * heat;
      const ec = arcane ? ARCANE.ember : state.effect && EMBER_COLOR[state.effect];
      if (ec) emberMat.color.set(ec);
      else emberMat.color.copy(emberBase);
      const lift = state.effect === 'speed' ? 1.5 : 1; // Vendaval: brasas sobem mais soltas
      const warning = state.shrinkIn > 0 && state.shrinkIn < SHRINK_WARN && state.arenaR > 0;
      warnMat.opacity = warning ? 0.25 + 0.25 * Math.sin(now * 14) : 0;
      // borda derretida puxa para o vermelho e pulsa quando a arena vai encolher
      shoreU.uWarn.value = warning ? 0.5 + 0.5 * Math.sin(now * 14) : 0;
      // brasas: sobem da lava em volta da pedra, cada uma com seu ritmo
      if (!lite) for (const s of embers) {
        const u = s.userData as { a: number; r: number; vy: number; size: number; wait: number };
        if (!s.visible) {
          u.wait -= dt;
          if (u.wait > 0) continue;
          // um ponto na lava a até 8 m da pedra (algumas tentativas: a forma pode ter buraco e reentrâncias)
          for (let k = 0; k < 6; k++) {
            u.a = Math.random() * Math.PI * 2;
            u.r = Math.random() * (shownR * ARENAS[shownArena].reach + 8);
            const e = edgeAt(shownArena, shownR, v(Math.cos(u.a) * u.r, Math.sin(u.a) * u.r));
            if (e < -0.8 && e > -8) break;
          }
          u.vy = 0.5 + Math.random() * 0.9;
          u.size = 0.12 + Math.random() * 0.16;
          s.position.set(Math.cos(u.a) * u.r, 0, Math.sin(u.a) * u.r);
          s.visible = true;
        }
        s.position.y += u.vy * lift * dt;
        s.position.x += Math.sin(now * 1.3 + u.a * 5) * 0.25 * dt;
        s.scale.setScalar(u.size * Math.max(0, 1 - (s.position.y + 0.5) / 4));
        if (s.position.y > 3.5) {
          s.visible = false;
          u.wait = Math.random() * 3;
        }
      }
      // espinhos: refeitos só quando a forma ou o raio mostrado muda de 5 cm (o encolhimento anima o raio)
      spikes.visible = state.effect === 'swords';
      const sk = spikes.visible ? `${shownArena}:${Math.round(shownR * 20)}` : '';
      if (sk && sk !== swordsKey) layoutSwords(shownArena, shownR);
      swordsKey = sk;
      const span = shownR * ARENAS[shownArena].reach;
      // Fonte da vida: pontos verdes sobem devagar de pontos da pedra
      for (const s of motes) {
        const u = s.userData as { vy: number; wait: number };
        if (lite || state.effect !== 'regen') { s.visible = false; continue; }
        if (!s.visible) {
          if ((u.wait -= dt) > 0) continue;
          for (let k = 0; k < 6; k++) {
            s.position.set((Math.random() * 2 - 1) * span, 0.1, (Math.random() * 2 - 1) * span);
            if (edgeAt(shownArena, shownR, v(s.position.x, s.position.z)) > 0.4) break;
          }
          u.vy = 0.35 + Math.random() * 0.35;
          s.visible = true;
        }
        s.position.y += u.vy * dt;
        s.scale.setScalar(0.22 * Math.min(1, s.position.y * 2) * Math.max(0, 1 - s.position.y / 2.6));
        if (s.position.y > 2.6) { s.visible = false; u.wait = Math.random() * 2; }
      }
      // Arena de espinhos: fumaça preta nasce num ponto entre os espinhos, sobe e abre, aparece e some aos poucos
      for (const s of soot) {
        const u = s.userData as { age: number; life: number; wait: number };
        const mat = s.material as THREE.SpriteMaterial;
        if (lite || state.effect !== 'swords') { s.visible = false; continue; }
        if (!s.visible) {
          if ((u.wait -= dt) > 0) continue;
          const ring = ARENAS[shownArena].outline[0], q = ring[Math.floor(Math.random() * ring.length)];
          const k = 1 - (SWORDS.inset * 0.6) / Math.max(1, shownR * len(q)); // um pouco para dentro, no meio da parede
          s.position.set(q.x * shownR * k, 0.15, q.y * shownR * k);
          u.age = 0;
          u.life = 2.2 + Math.random() * 1.6;
          mat.rotation = Math.random() * Math.PI * 2;
          s.visible = true;
        }
        u.age += dt;
        const f = u.age / u.life;
        s.position.y += 0.35 * dt;
        s.scale.setScalar(1 + f * 1.8);
        mat.opacity = 0.8 * Math.min(1, f * 4) * (1 - f);
        if (f >= 1) { s.visible = false; u.wait = Math.random() * 0.6; }
      }
      // Febre do ouro: cada moeda nasce num ponto da borda, sobe 1 a 1,6 m e cai; o brilho pisca rápido (o "tilintar")
      (coins[0].material as THREE.SpriteMaterial).color.set(arcane ? ARCANE.coin : '#ffd84a');
      for (const s of coins) {
        const u = s.userData as { vy: number; wait: number };
        if (lite || state.effect !== 'gold') { s.visible = false; continue; }
        if (!s.visible) {
          if ((u.wait -= dt) > 0) continue;
          const ring = ARENAS[shownArena].outline[0], q = ring[Math.floor(Math.random() * ring.length)];
          s.position.set(q.x * shownR, 0.05, q.y * shownR);
          u.vy = 4.5 + Math.random() * 1.2;
          s.visible = true;
        }
        u.vy -= 12 * dt;
        s.position.y += u.vy * dt;
        s.scale.setScalar(0.16 + 0.1 * Math.abs(Math.sin(now * 18 + s.id)));
        if (s.position.y < 0) { s.visible = false; u.wait = Math.random() * 1.2; }
      }
      // Vendaval: riscos claros atravessando a arena na mesma direção, rápidos
      for (const s of gusts) {
        const u = s.userData as { vy: number; wait: number };
        if (lite || state.effect !== 'speed') { s.visible = false; continue; }
        if (!s.visible) {
          if ((u.wait -= dt) > 0) continue;
          s.position.set(-span - 6, 0.5 + Math.random() * 1.6, (Math.random() * 2 - 1) * (span + 3));
          u.vy = 9 + Math.random() * 5;
          s.scale.set(1.6 + Math.random(), 0.07, 1);
          s.visible = true;
        }
        s.position.x += u.vy * dt;
        s.position.z += Math.sin(now * 2 + s.position.y * 3) * 0.6 * dt;
        if (s.position.x > span + 6) { s.visible = false; u.wait = Math.random() * 1.5; }
      }
      // Tempo chuvoso: chuva fina caindo em toda a área (inclinada de leve, como o vento)
      rain.visible = !lite && state.effect === 'lava';
      if (rain.visible) {
        for (let i = 0; i < RAIN; i++) {
          rainY[i] -= 13 * dt;
          if (rainY[i] < 0) {
            rainY[i] += 9;
            rainXZ[i] = [(Math.random() * 2 - 1) * (span + 6), (Math.random() * 2 - 1) * (span + 6)];
          }
          const [x, z] = rainXZ[i], y = rainY[i];
          rainPos.set([x, y, z, x + 0.06, y + 0.45, z], i * 6);
        }
        rainGeo.attributes.position.needsUpdate = true;
      }
      if (warning && warnR !== state.arenaR) {
        warnR = state.arenaR;
        // entre o contorno de agora e o do próximo tamanho, só onde é pedra que vira lava
        // (no anel o buraco encolhe junto com a forma: lá a lava vira pedra e não pisca)
        const next = Math.max(0.01, state.arenaR - ARENA_STEP), r = state.arenaR;
        warn.geometry.dispose();
        warn.geometry = bandGeo(ARENAS[shownArena].outline.map((loop): [Vec[], Vec[]] => [loop.map((p) => scale(p, r)), loop.map((p) => scale(p, next))]),
          (m) => edgeAt(shownArena, r, m) > 0 && edgeAt(shownArena, next, m) <= 0);
      }

      syncWizards(state.wizards, now);
      syncProjectiles(state.projectiles);
      syncPillars(state.pillars);
      // montes de ouro: um clone do monte por baú quebrado
      while (piles.length < state.loots.length) {
        const c = pile.clone();
        scene.add(c);
        piles.push(c);
      }
      piles.forEach((g, i) => {
        const l = state.loots[i];
        g.visible = !!l;
        if (!l) return;
        g.position.copy(w3(l.pos, 0));
        g.scale.setScalar(0.6 + 0.4 * (l.left / CHEST.pile[1]));
        g.rotation.y = now * 0.6;
      });
      pileShine.opacity = 0.22 + 0.1 * Math.sin(now * 3);
      // uma runa por vez no jogo; cada vaga monta o desenho de cada tipo na primeira vez e mostra o da vez
      while (runeSlots.length < state.runes.length) runeSlots.push({});
      runeSlots.forEach((slot, i) => {
        const rune = state.runes[i];
        for (const k of Object.keys(slot) as RuneKind[]) slot[k]!.g.visible = k === rune?.kind;
        if (!rune) return;
        const r = (slot[rune.kind] ??= runeDraw(rune.kind));
        r.g.position.copy(w3(rune.pos, 0));
        r.tick(now);
      });
      syncZones(state.zones ?? [], now, dt);
      shownIsles = state.isles ?? [];
      syncIsles(shownIsles, now, dt);
      // hit-stop: quem acabou de apanhar fica com a animação parada por ~60 ms
      for (const m of mages.values()) if (now >= m.freezeUntil) m.mixer.update(dt);
      decor.update((p) => edgeAt(shownArena, shownR, p), now);
      for (let i = fx.length - 1; i >= 0; i--) {
        const f = fx[i];
        const k = (now - f.born) / (f.until - f.born);
        if (k >= 1) {
          scene.remove(f.obj);
          dispose(f.obj);
          fx.splice(i, 1);
        } else f.update?.(k);
      }

      // câmera inclinada estilo Dota, seguindo de leve o próprio mago
      // em pé a arena não cabe na largura: a câmera acompanha mais o próprio mago
      // assistindo outro mago (lock): centra nele
      let target = (state.follow ? w3(state.follow).multiplyScalar(state.lock ? 1 : camera.aspect < 1 ? 0.65 : 0.3) : new THREE.Vector3()).add(pan);
      // fim da rodada: a câmera vai devagar até quem comemora (no modo Times, o meio do time) e aproxima um pouco
      const champs = state.wizards.filter((w) => w.cheer && w.alive);
      celebrate += ((champs.length ? 1 : 0) - celebrate) * Math.min(1, dt * 1.5);
      if (champs.length) {
        const c = champs.reduce((a, w) => a.add(w3(w.pos)), new THREE.Vector3()).multiplyScalar(1 / champs.length);
        target = target.lerp(c, celebrate);
      }
      focus.lerp(target, Math.min(1, dt * 3));
      // aproxima conforme a arena encolhe. Teto 54: as Ilhas com 8 magos (48,5) e no máximo da sandbox (53) cabem
      // inteiras; com 44 uma ilha saía pela lateral (issue #222). Seguindo um mago (lock), o teto é 25, o da arena de 4 magos:
      // em mapa grande ele não encolhe na tela
      const dist = Math.min(state.lock ? 25 : 54, Math.max(13, shownR * ARENAS[shownArena].reach * 2.1 + 2) * (camera.userData.fit as number)) * zoom * (1 - 0.3 * celebrate);
      lastDist = dist;
      // olha um pouco à frente do centro para a borda de baixo não ficar atrás da barra de magias
      let lookX = focus.x, lookZ = focus.z + dist * 0.06;
      // pixel art: a câmera desenha de bloco em bloco (pixelSize px medidos no chão do meio da tela); solta, o chão "ferve" a cada quadro.
      // A sobra (menos de um bloco) desliza a imagem pronta e os nomes, e o movimento continua suave.
      // No eixo z o chão inclinado aparece encurtado (×0,74), então o passo no chão é maior
      let shift = '';
      if (pixelPass && composer?.passes[0] === pixelPass) {
        const block = (2 * dist * camK * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) / (innerHeight / pixelSize);
        const stepZ = block / 0.74;
        const sx = Math.round(lookX / block) * block, sz = Math.round(lookZ / stepZ) * stepZ;
        const px = (v: number) => Math.round(v * pixelSize * devicePixelRatio) / devicePixelRatio; // pixel inteiro da tela: sem borrar os blocos
        shift = `translate(${px((sx - lookX) / block)}px, ${px((sz - lookZ) / stepZ)}px)`;
        lookX = sx;
        lookZ = sz;
      }
      if (shift !== pixelShift) canvas.style.transform = labels.style.transform = pixelShift = shift;
      camera.position.set(lookX, dist * 0.74 * camK, lookZ + dist * 0.67 * camK);
      // a névoa conta da câmera: com ela mais longe, empurra junto (acima do teto antigo de 44 também, senão a borda
      // de trás das Ilhas grandes some na névoa)
      const fogPush = (camK - 1) * dist + Math.max(0, dist - 44);
      Object.assign(scene.fog!, { near: 30 + fogPush, far: 70 + fogPush });
      camera.lookAt(lookX, 0, lookZ);
      if (shake > 0.01 && !lite) {
        camera.position.x += (Math.random() - 0.5) * shake;
        camera.position.z += (Math.random() - 0.5) * shake;
      }
      shake *= 0.9;

      // ponto 3D → pixels na tela
      const toScreen = (p: THREE.Vector3) => {
        const q = p.project(camera);
        return [(q.x * innerWidth) / 2 + innerWidth / 2, (-q.y * innerHeight) / 2 + innerHeight / 2];
      };
      const obscured = (p: THREE.Vector3) => !!state.blindAt && Math.hypot(p.x-state.blindAt.x,p.z-state.blindAt.y)>BLINDNESS.radius;
      // números de dano: sobem 1,2 m em 0,9 s e somem
      for (let i = numbers.length - 1; i >= 0; i--) {
        const d = numbers[i];
        const k = (now - d.born) / 1.2;
        if (k >= 1) {
          d.el.remove();
          numbers.splice(i, 1);
          continue;
        }
        const [x, y] = toScreen(d.at.clone().setY(d.at.y + k * 1.2));
        d.el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%) scale(${1 + (d.pop ?? 0.3) * Math.max(0, 0.2 - k) * 5})`;
        d.el.style.opacity = String(Math.min(1, (1 - k) * 2.5));
        d.el.style.visibility = obscured(d.at) ? 'hidden' : '';
      }

      // barras dos obstáculos, logo acima de cada um
      for (const p of pillarMeshes) {
        if (!p.bar || p.bar.hidden) continue;
        p.bar.style.visibility = obscured(p.obj.position) ? 'hidden' : '';
        const [x, y] = toScreen(p.obj.position.clone().setY(p.height + 0.15));
        p.bar.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`;
      }

      // nome e vida em cima de cada mago
      for (const m of mages.values()) {
        if (m.label.hidden) continue;
        m.label.style.visibility = obscured(m.root.position) ? 'hidden' : '';
        const [x, y] = toScreen(m.root.position.clone().setY(2.1 + m.model.position.y));
        m.label.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -100%)`;
      }

      if (composer) composer.render();
      else renderer.render(scene, camera);
    },
  };
}
