// Personagens KayKit (CC0) que cada jogador escolhe na sala. Só visual: todos têm as mesmas magias. A Ladina encapuzada saiu dos
// prontos (issue #107: virou Ladina + Capuz) mas fica aqui: o código da aparência guarda posições e os bots ainda a usam.
export const CHARACTERS = [
  { id: 'mage', name: 'Mago', en: 'Mage' },
  { id: 'knight', name: 'Cavaleiro', en: 'Knight' },
  { id: 'barbarian', name: 'Bárbaro', en: 'Barbarian' },
  { id: 'rogue', name: 'Ladina', en: 'Rogue' },
  { id: 'rogue_hooded', name: 'Ladina encapuzada', en: 'Hooded Rogue' },
  { id: 'skeleton_mage', name: 'Esqueleto mago', en: 'Skeleton Mage' },
  { id: 'skeleton_minion', name: 'Esqueleto lacaio', en: 'Skeleton Minion' },
  { id: 'skeleton_rogue', name: 'Esqueleto ladino', en: 'Skeleton Rogue' },
  { id: 'skeleton_warrior', name: 'Esqueleto guerreiro', en: 'Skeleton Warrior' },
] as const;

export type CharacterId = (typeof CHARACTERS)[number]['id'];
export const isCharacter = (x: unknown): x is CharacterId => CHARACTERS.some((c) => c.id === x);

// Aparência montada (pedido do Fernando, 19/10): 7 peças, cada uma tirada de um dos 9 bonecos (mesmo esqueleto de 41 ossos e
// mesmas animações). Cada opção diz o arquivo (public/models/<from>.glb) e os nós do GLB; null = nenhuma.
export type Piece = { from: CharacterId; nodes: string[]; name?: string; en?: string } | null;
// Look: um índice por peça, na ordem de LOOK_PARTS; no protocolo vai como 7 dígitos (ver encodeLook)
export type Look = number[];
const P = (from: CharacterId, ...nodes: string[]): Piece => ({ from, nodes });
const PRE = ['Mage', 'Knight', 'Barbarian', 'Rogue', 'Rogue', 'Skeleton_Mage', 'Skeleton_Minion', 'Skeleton_Rogue', 'Skeleton_Warrior'];
const each = (...suffix: string[]) => CHARACTERS.map((c, i) => P(c.id, ...suffix.map((s) => PRE[i] + s)));
const skull = (pre: string, head = pre + '_Head') => [head, pre + '_Eyes', pre + '_Jaw'];
export const LOOK_PARTS: { id: string; name: string; en: string; opts: Piece[] }[] = [
  { id: 'head', name: 'Cabeça', en: 'Head', opts: [
    P('mage', 'Mage_Head'), P('knight', 'Knight_Head'), P('barbarian', 'Barbarian_Head'), P('rogue', 'Rogue_Head'), P('rogue_hooded', 'Rogue_Head_Hooded'),
    P('skeleton_mage', ...skull('Skeleton_Mage', 'Skeleton_Mage_Skull')), P('skeleton_minion', ...skull('Skeleton_Minion')), P('skeleton_rogue', ...skull('Skeleton_Rogue')), P('skeleton_warrior', ...skull('Skeleton_Warrior')),
  ] },
  { id: 'hat', name: 'Chapéu', en: 'Hat', opts: [null, P('mage', 'Mage_Hat'), P('knight', 'Knight_Helmet'), P('barbarian', 'Barbarian_Hat'), P('skeleton_mage', 'Skeleton_Mage_Hat'), P('skeleton_warrior', 'Skeleton_Warrior_Helmet'), P('skeleton_rogue', 'Skeleton_Rogue_Hood'),
    { from: 'rogue', nodes: ['Rogue_Hood'], name: 'Capuz', en: 'Hood' }] },
  { id: 'body', name: 'Tronco', en: 'Torso', opts: each('_Body') },
  { id: 'arms', name: 'Braços', en: 'Arms', opts: each('_ArmLeft', '_ArmRight') },
  { id: 'legs', name: 'Pernas', en: 'Legs', opts: each('_LegLeft', '_LegRight') },
  { id: 'cape', name: 'Capa', en: 'Cape', opts: [null, P('mage', 'Mage_Cape'), P('knight', 'Knight_Cape'), P('barbarian', 'Barbarian_Cape'), P('rogue', 'Rogue_Cape'), P('skeleton_minion', 'Skeleton_Minion_Cloak'), P('skeleton_warrior', 'Skeleton_Warrior_Cloak'), P('skeleton_rogue', 'Skeleton_Rogue_Cape')] },
  { id: 'hands', name: 'Nas mãos', en: 'In hands', opts: [null,
    { from: 'mage', nodes: ['2H_Staff'], name: 'Cajado', en: 'Staff' },
    { from: 'knight', nodes: ['1H_Sword', 'Round_Shield'], name: 'Espada e escudo', en: 'Sword and shield' },
    { from: 'barbarian', nodes: ['1H_Axe', 'Barbarian_Round_Shield'], name: 'Machado e escudo', en: 'Axe and shield' },
    { from: 'rogue', nodes: ['Knife', 'Knife_Offhand'], name: 'Facas', en: 'Knives' },
  ] },
];
const BODY = 2;
const HAT = 1;
const HOOD = LOOK_PARTS[HAT].opts.findIndex((o) => o?.nodes[0] === 'Rogue_Hood');

// peças da Ladina encapuzada (cabeça, tronco, braços e pernas) ficam no lugar só para os códigos antigos: viram as da Ladina, e a
// cabeça encapuzada ganha o Capuz quando não há outro chapéu (issue #107). O criador pula esses lugares (isRetired)
export const isRetired = (o: Piece) => o?.from === 'rogue_hooded';
function retire(l: Look): Look {
  const out = l.map((n, i) => (isRetired(LOOK_PARTS[i].opts[n]) ? LOOK_PARTS[i].opts.findIndex((o) => o?.from === 'rogue') : n));
  if (isRetired(LOOK_PARTS[0].opts[l[0]]) && !out[HAT]) out[HAT] = HOOD;
  return out;
}

export const encodeLook = (l: Look) => l.join('');
// null se não for uma aparência válida (formato e índice de cada peça); a válida já sai sem as peças aposentadas
export function decodeLook(s: unknown): Look | null {
  if (typeof s !== 'string' || !/^\d{7}$/.test(s)) return null;
  const l = [...s].map(Number);
  return l.every((n, i) => n < LOOK_PARTS[i].opts.length) ? retire(l) : null;
}
export const isLook = (s: unknown): s is string => decodeLook(s) !== null;
// código de quem já tem uma aparência válida, sem as peças aposentadas (salas gravadas, navegador, mensagem de cliente antigo)
export const fixLook = (s: string) => {
  const l = decodeLook(s);
  return l ? encodeLook(l) : s;
};
// os personagens prontos viram a aparência equivalente; a Ladina pronta já vem com o Capuz (pedido do Fernando, 20/10), igual à encapuzada
export const lookOf = (c: CharacterId) => fixLook(encodeLook(LOOK_PARTS.map(({ opts }) => {
  const i = opts.findIndex((o) => o?.from === c);
  return i >= 0 ? i : c === 'rogue_hooded' ? Math.max(0, opts.findIndex((o) => o?.from === 'rogue')) : 0;
})));
// atalhos do criador: uma Ladina só (issue #107)
export const PRESETS = CHARACTERS.filter((c) => c.id !== 'rogue_hooded');
// retrato 2D (placar, pódio): o da cabeça; Ladina com o Capuz usa o retrato da encapuzada
export const lookHead = (s: string): CharacterId => {
  const head = LOOK_PARTS[0].opts[Number(s[0])]!.from;
  return head === 'rogue' && Number(s[HAT]) === HOOD ? 'rogue_hooded' : head;
};
export const lookBody = (s: string): CharacterId => LOOK_PARTS[BODY].opts[Number(s[BODY])]!.from;
// classes (issue #17, proposta do Reinaldo, 21/10; números sem simulador): o Tronco do look decide a classe, as outras peças são livres.
// Os outros bonecos ainda não têm classe. kb: empurrão a menos (fração); regen, speed, dmg: × vida por segundo, velocidade e dano;
// cd: × recarga das magias; afflict: × duração das lentidões e penalidades que o mago aplica nos outros
export const CLASS_IDS = ['knight', 'rogue', 'mage'] as const;
export type ClassId = (typeof CLASS_IDS)[number];
export type ClassPassive = { kb?: number; regen?: number; speed?: number; dmg?: number; cd?: number; afflict?: number };
export const CLASS_PASSIVE: Record<ClassId, ClassPassive> = {
  knight: { kb: 0.05, regen: 1.05 },
  rogue: { speed: 1.05, afflict: 1.05 },
  mage: { dmg: 1.05, cd: 0.95 },
};
export const classOf = (look: string | undefined): ClassId | null => {
  const body = look ? lookBody(look) : null;
  return CLASS_IDS.find((c) => c === body) ?? null;
};
export const lookPieces = (s: string) => [...s].map((n, i) => LOOK_PARTS[i].opts[Number(n)]).filter((p): p is NonNullable<Piece> => !!p);
export const randomLook = (rand = Math.random) => encodeLook(retire(LOOK_PARTS.map(({ opts }) => Math.floor(rand() * opts.length))));
