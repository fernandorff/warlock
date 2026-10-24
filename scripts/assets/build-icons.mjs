// Monta public/icons.svg (sprite de <symbol>) com os ícones do game-icons.net usados na interface.
// Baixa só do repositório oficial (github.com/game-icons/icons, CC BY 3.0). Uso: node scripts/assets/build-icons.mjs
// Cada símbolo tem o id do arquivo original; a cor vem do CSS (fill: currentColor). Créditos em public/CREDITS.txt.
import { writeFileSync } from 'node:fs';

const ICONS = [
  // magias
  'lorc/fire-ray', 'lorc/focused-lightning', 'lorc/on-target', 'lorc/shield-reflect', 'lorc/teleport', 'lorc/body-swapping', 'lorc/grab', 'lorc/meteor-impact',
  'lorc/sprint', 'lorc/striking-splinter', 'delapouite/boomerang', 'lorc/knife-thrust', 'lorc/vortex', 'delapouite/menhir', 'heavenly-dog/defensive-wall', 'caro-asercion/ricochet', 'lorc/life-tap',
  'lorc/frozen-orb', 'lorc/two-shadows', 'lorc/magnet', 'lorc/cycle', 'delapouite/card-exchange', 'lorc/harpoon-chain', 'lorc/wind-slap', 'delapouite/split-arrows', 'lorc/time-trap',
  // itens
  'delapouite/diamond-ring', 'lorc/skull-ring', 'delapouite/cape', 'lorc/breastplate', 'lorc/leather-boot', 'skoll/pocket-watch', 'delapouite/bat', 'delapouite/flail',
  'lorc/divert', 'lorc/chalice-drops', 'delapouite/metal-boot', 'delapouite/stone-bust', 'delapouite/spartan-helmet', 'lorc/winged-leg', 'lorc/angel-wings', 'lorc/feather',
  // runas, efeitos e causas de morte
  'delapouite/rabbit', 'delapouite/enrage', 'lorc/checked-shield', 'lorc/energise', 'lorc/star-swirl', 'lorc/broken-shield', 'lorc/sunbeams', 'lorc/padlock', 'lorc/snail',
  'lorc/small-fire', 'lorc/magnet-blast', 'lorc/ghost', 'lorc/run', 'lorc/volcano', 'skoll/knockout', 'lorc/uncertainty',
  // interface
  'delapouite/histogram', 'lorc/scroll-unfurled', 'skoll/talk', 'delapouite/vote', 'delapouite/speaker', 'delapouite/speaker-off', 'sbed/help', 'delapouite/keyboard',
  'lorc/skull-crossed-bones', 'lorc/spiky-explosion', 'lorc/trophy', 'lorc/archery-target', 'delapouite/two-coins', 'lorc/light-bulb', 'delapouite/robot-antennas', 'delapouite/character', 'delapouite/info', 'delapouite/shop',
  // configurações: engrenagem, controle e vídeo; sair da sala; assistir (espectador)
  'lorc/cog', 'delapouite/gamepad', 'delapouite/tv', 'delapouite/exit-door', 'lorc/eyeball',
  // botões do cartão da loja: comprar, subir de nível e desfazer (vender usa a moeda)
  'delapouite/shopping-cart', 'delapouite/upgrade', 'delapouite/anticlockwise-rotation',
];

const symbols = [];
for (const path of ICONS) {
  const res = await fetch(`https://raw.githubusercontent.com/game-icons/icons/master/${path}.svg`);
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  const svg = await res.text();
  // tira o fundo preto e o branco fixo do desenho; o resto do conteúdo vai como está
  const inner = svg.replace(/^[\s\S]*?<svg[^>]*>|<\/svg>\s*$/g, '').replace('<path d="M0 0h512v512H0z"/>', '').replace(/ fill="#fff"/g, '');
  symbols.push(`<symbol id="${path.split('/')[1]}" viewBox="0 0 512 512">${inner}</symbol>`);
}
// Cruz geométrica própria: Curar não precisa baixar outro asset.
symbols.push('<symbol id="healing-cross" viewBox="0 0 512 512"><path d="M208 64h96v144h144v96H304v144h-96V304H64v-96h144z"/></symbol>');
const ids = symbols.map((s) => s.match(/id="([^"]+)"/)[1]);
if (new Set(ids).size !== ids.length) throw new Error('id repetido no sprite');
writeFileSync(new URL('../../public/icons.svg', import.meta.url), `<svg xmlns="http://www.w3.org/2000/svg">\n${symbols.join('\n')}\n</svg>\n`);
console.log(`${symbols.length} ícones em public/icons.svg`);
