// Taunts da roda (tecla Y): as 10 primeiras são voz em inglês de pacotes CC0 (Kenney Voiceover Packs; miau e risada do OpenGameArt), legenda em português.
// O arquivo fica em public/sfx/taunt/<id>.mp3 (ou no src da gravação); a mensagem leva só o índice.
// Gravações do Leonard (PR #243): autorizadas pelo autor para uso e redistribuição no Warlock, aceitas pelo Fernando em 21/10.
export const CUSTOM_TAUNTS = [
  { id: 'fausto', text: 'Tá pegando fogo!', en: "It's on fire!", src: '/taunts-local/fausto.mp4' },
  { id: 'emafia', text: 'Bosta city!', en: 'Crap city!', src: '/taunts-local/emafia.mp4' },
  { id: 'meestruparam', text: 'Foi uma delícia...', en: 'It was delightful...', src: '/taunts-local/meestruparam.mp4' },
  { id: 'usarameabusaram', text: 'Usaram e abusaram.', en: 'Used and abused.', src: '/taunts-local/usarameabusaram.mp4' },
  { id: 'lanchado', text: 'Lanchado', en: 'Lanchado', src: '/taunts-local/lanchado.mp4' },
] as const;
// Só texto com emoji (issue #351): sem áudio, só balão; ficam depois das gravações para não mudar os índices que já existem.
export const TEXT_TAUNTS = [
  { id: 'noob', text: 'Noob 🤡', en: 'Noob 🤡' },
  { id: 'get_him', text: 'Pega ele! 🔥', en: 'Get him! 🔥' },
  { id: 'bye_lava', text: 'Tchau, lava! 👋', en: 'Bye, lava! 👋' },
  { id: 'too_easy', text: 'Tá fácil demais 😴', en: 'Too easy 😴' },
  { id: 'gg', text: 'GG 🤝', en: 'GG 🤝' },
  { id: 'tough_luck', text: 'Que azar… 😢', en: 'Tough luck… 😢' },
  { id: 'melted', text: 'Derreteu! 🌋', en: 'Melted! 🌋' },
  { id: 'stay_in_lava', text: 'Fica na lava! 💀', en: 'Stay in the lava! 💀' },
] as const;
export const TAUNTS = [
  { id: 'loser', text: 'Perdedor!', en: 'Loser!' },
  { id: 'laugh', text: 'Muahaha!', en: 'Muahaha!' },
  { id: 'meow', text: 'Miau~', en: 'Meow~' },
  { id: 'flawless', text: 'Vitória perfeita!', en: 'Flawless victory!' },
  { id: 'combo_breaker', text: 'Quebra-combo!', en: 'Combo breaker!' },
  { id: 'multi_kill', text: 'Multi kill!', en: 'Multi kill!' },
  { id: 'ultra_kill', text: 'ULTRA KILL!', en: 'ULTRA KILL!' }, // voz sintética do Windows (Zira) com efeito de locutor; a do Dota é da Valve
  { id: 'fire_in_the_hole', text: 'Lá vai bomba!', en: 'Fire in the hole!' },
  { id: 'look_out', text: 'Cuidado!', en: 'Look out!' },
  { id: 'congrats', text: 'Parabéns… 👏', en: 'Congrats… 👏' },
  ...CUSTOM_TAUNTS,
  ...TEXT_TAUNTS,
] as const;
export const TAUNT_COOLDOWN_MS = 2500;

// Caminhos vêm só do catálogo fixo: nenhuma URL enviada pelo cliente é carregada.
export function tauntAudioSrc(id: string): string | null {
  const taunt = TAUNTS.find((t) => t.id === id);
  if (!taunt || TEXT_TAUNTS.some((x) => x.id === id)) return null;
  return 'src' in taunt ? taunt.src : `/sfx/taunt/${taunt.id}.mp3`;
}
