// Números do jogo, em metros e segundos, convertidos do Warlock Brawl para Dota 2 (github.com/warlockbrawl/warlock,
// scripts/vscripts/base/config.lua, arena.lua, pawn.lua e npc_abilities_custom.txt). Escala: a arena com 4 magos
// (1700 unidades de raio no original) vira 11 m, ou seja, 1 unidade = 0,00647 m. Vida e dano na escala do original (vida 1000).
export const DT = 1 / 60;
export const SEND_EVERY = 2; // envia o estado a cada 2 passos (30 por segundo)

export const UNIT = 0.00647; // metros por unidade do original
export const ARENA_STEP = 100 * UNIT; // uma camada de ladrilhos
export const arenaRadius = (wizards: number) => (13 + wizards) * ARENA_STEP; // 13 camadas + 1 por mago
export const ARENA_R0 = arenaRadius(4);
// a arena para de encolher aqui (no original o mínimo é 1 camada) até SUDDEN.collapse; depois some aos poucos
export const ARENA_MIN = 2 * ARENA_STEP;
export const SPAWN_INSET = 600 * UNIT;
export const SHRINK_EVERY = 10;
export const SHRINK_WARN = 2;

export const WIZ_R = 0.35; // original 30 unidades (0,19 m); maior aqui porque o modelo 3D é mais largo
export const WIZ_SPEED = 210 * UNIT;
export const HP_MAX = 1000;
export const HP_REGEN = 5; // 5 por segundo, como no original
export const LAVA_DPS = 100;
export const FRICTION = -Math.log(0.96) / 0.035; // 0,96 por tique de 0,035 s: a velocidade do empurrão cai e^(-FRICTION·t)
export const KB_SOFT_CAP = 100; // golpe acima disso empurra pela raiz (como no original, pawn.lua do mod de Dota 2)
export const KB_PER_DMG = 10 * UNIT; // empurrão (m/s) por ponto de dano: 10 unidades/s por dano, como no original
export const STUN_SPEED = 1.5; // deslizando mais rápido que isso, o mago não anda
// Retomada escolhida pelo Leonard: 50%, +10pp a cada0,2s, chegando a100% em1s.
export const KNOCK_RECOVERY = { seconds: 1, start: .5, step: .1, interval: .2 };
export const KNOCK_HP_SCALE = 0; // 22/10: dano histórico não amplifica empurrão; impulsos e resistência continuam valendo.
export const LAVA_KB_FACTOR = 0.5;
export const CREDIT_WINDOW = 5; // o abate vai para quem acertou nos últimos 5 s
export const PROJ_R = 0.2;
export const INCAPACITATED_BIT = 268435456; // recargas pausadas; habilidades prontas continuam utilizáveis.
export const ELECTROCUTED_BIT = 536870912; // efeito elétrico visual.
// o projétil nasce na frente do mago, com o centro a esta distância do centro dele
export const PROJ_SPAWN = WIZ_R + PROJ_R + 0.05;

// pilares do original (mode.lua e obstacles.lua): 2 a 8 por rodada, sorteados até 1000 unidades do centro
// (raio, vida e explosão em OBSTACLES.pillar)
export const PILLAR = { spread: 1000 * UNIT, min: 2, max: 8 };

// tipos de obstáculo (pedido do Fernando, 17/10: mais tipos além dos pilares); o pilar segue o original, os outros são meus:
// rocha grande que não quebra, árvore morta frágil e altar de velas que explode em fogo. weight = chance relativa no sorteio
export const OBSTACLE_KINDS = ['pillar', 'rock', 'tree', 'shrine', 'chest', 'rockpillar'] as const;
export type ObstacleKind = (typeof OBSTACLE_KINDS)[number];
// vida pela metade em 18/10 (pedido do Fernando: obstáculos com menos vida)
export const OBSTACLES: Record<ObstacleKind, { r: number; hp: number; blastR: number; blastDmg: number; weight: number }> = {
  pillar: { r: 0.5, hp: 200, blastR: 300 * UNIT, blastDmg: 10, weight: 4 },
  rock: { r: 0.85, hp: Infinity, blastR: 0, blastDmg: 0, weight: 2 },
  tree: { r: 0.35, hp: 75, blastR: 0, blastDmg: 0, weight: 2 },
  shrine: { r: 0.45, hp: 50, blastR: 1.6, blastDmg: 60, weight: 1 },
  chest: { r: 0.4, hp: 1, blastR: 0, blastDmg: 0, weight: 0 }, // baú de ouro: não sai no sorteio, aparece no meio da rodada; abre com 1 golpe (Fernando, 18/10)
  // Pilar de pedra (magia): vida e explosão do pilar do original; desde 18/10 (Fernando) é uma parede baixa de 2 m atravessada
  // no caminho do lançamento: 3 círculos de raio r em linha, a WALL_GAP um do outro, com vida compartilhada (os 200 valem para a parede toda: dano em um pedaço tira dos 3).
  // Some sozinho (Pillar.until)
  rockpillar: { r: 0.35, hp: 200, blastR: 300 * UNIT, blastDmg: 10, weight: 0 },
};

// mapa da Campanha (levels.ts; Lucas, 19/10): empurrado para o abismo, o mago perde parte da vida máxima e volta à beira de
// onde caiu; a cera deixa lento como o chão arcano (números iniciais, a medir)
export const PIT = { hit: 0.15 };
export const WAX = { mult: 0.6 };

export const WALL_GAP = 0.65; // centro a centro dos 3 pedaços da parede: 2 × 0,65 + 2 × 0,35 = 2 m, a largura do modelo

export const MAX_PLAYERS = 8;
export const MAX_WATCHERS = 8; // espectadores além dos magos (não ocupam vaga de mago)
export const WINS_TO_WIN = 5; // original: 1 ponto por rodada vencida (lá o padrão é 11; aqui 5, decisão do Fernando)
export const START_GOLD = 30;
export const ROUND_GOLD = 10;
// venda: cada nível volta 100% na loja em que foi comprado e perde 5% por rodada com ele, até 75% (Fernando, 17/10)
// vender devolve sempre 100% do que pagou (Fernando, 19/10); antes perdia 5% por rodada até 75%
export const SELL_DECAY = 0;
export const SELL_FLOOR = 0.75;
// baú de ouro no meio da rodada (pedidos do Fernando, 17/10: incentivar o confronto): aparece a cada 15 s, as magias quebram
// (vida em OBSTACLES.chest) e ele vira um monte de ouro; quem fica em cima ganha 1 a cada 2 s até o monte (3 a 5, sorteado quando o baú nasce; Fernando, 20/10, issue #80; antes 10) acabar; sair zera o progresso
// primeiro aos 8 s, depois um a cada 12 s mesmo que o anterior não tenha sido quebrado, até 2 baús de pé (Fernando, 17/10: o baú deixava de aparecer)
// perRound: no máximo metade dos magos + 1 baús por rodada, nunca mais que 3 (Fernando, 19/10: baús demais nas rodadas)
export const CHEST = { first: 8, every: 12, maxUp: 2, perRound: 3, pile: [3, 5] as const, goldEvery: 2, reach: 0.75, pileSecs: 45, spread: 0.6 };
// chão depois do choque de projéteis (pedido do Fernando, 17/10): fogo queima, arcano deixa lento, pulso puxa para o centro
export const ZONES = { burn: { dps: 20, secs: 4.5 }, slow: { mult: 0.6, secs: 4.5 }, pull: { speed: 2.2, secs: 3 }, size: 0.75 };
// assistência: quem causou mais dano em quem morreu, sem ser quem matou (anti-roubo de abate do Warlock original, versão 082)
export const ASSIST_GOLD = 2;
export const ASSIST_MIN_DMG = 30;
// recuperação (pedido do Fernando, 17/10: evitar que os jogadores fiquem muito para trás):
// quem ganhou menos ouro na partida que a média recebe metade da diferença no fim da rodada (até 8);
// abater o líder do placar vale +3 por vitória de vantagem dele sobre a média (até 10); o líder que vence ganha só 5
export const RECOVERY = { share: 0.5, max: 8 };
export const BOUNTY = { perWin: 3, max: 10 };
export const LEADER_WIN_GOLD = 5;
export const KILL_GOLD = 5; // 0 no original; +5 a pedido do Fernando (17/10)
export const WIN_GOLD = 10; // 0 no original; +10 a pedido do Fernando (17/10)
export const TOP_DMG_GOLD = 10; // quem causou mais dano na rodada (empate: todos); pedido do Fernando (17/10)
export const SHOP_MS = 30_000; // Mode.SHOP_TIME do original
export const INVULN_TIME = 2; // invulnerável nos 2 primeiros segundos da rodada (mode.lua)
// Deathmatch (modo do Warlock Brawl original): rodada de 60 s, volta em 10 s, 1 ponto por abate
export const DM_ROUND_MS = 60_000;
export const DM_RESPAWN = 10;
export const DM_KILLS_TO_WIN = 15;
export const DM_SPAWN_GAP = 2; // ao voltar, pelo menos 2 m de inimigos vivos e de pilares
export const COUNTDOWN_MS = 3_000;
export const ROUND_END_MS = 2_500;
export const VOTE_MS = 20_000; // votação na partida (trocar o modo, expulsar alguém) fecha em 20 s; pedido do Fernando (17/10)
// mecânicas novas de 18/10 (o Fernando liberou mecânicas novas):
// morte súbita nas Rodadas e nos Times: passados 90 s, a arena encolhe a cada 5 s em vez de 10 (as rodadas duram ~97 s na simulação)
// collapse: depois disso a arena continua encolhendo até sumir (nenhuma rodada fica sem fim; antes ~1 em 2.000 partidas de bots travava)
export const SUDDEN = { at: 90, every: 5, collapse: 150 };
// runas: uma por vez num ponto livre, a primeira aos 15 s e a próxima 20 s depois de alguém pegar (ou de a lava engolir)
export const RUNE_KINDS = ['haste', 'fury', 'shield', 'recharge'] as const;
export type RuneKind = (typeof RUNE_KINDS)[number];
// efeitos por 8 s (Fernando, 18/10): Pressa +50% de velocidade, Fúria +30% de dano, Escudo −30% de dano levado, Recarga recargas 30% mais rápidas
export const RUNE = { first: 15, every: 20, secs: 8, reach: 0.6, spread: 0.6, haste: 0.5, fury: 0.3, armor: 0.3, cdr: 0.3 };
// efeitos de rodada (issue #189, ideia do Reinaldo, números do Fernando em 21/10): um por rodada, igual para todos.
// Nomes na tela (opt-info.ts EFFECT_NAME): lava = Tempo chuvoso, swords = Arena de espinhos, gold = Febre do ouro (antes Caçada), speed = Vendaval,
// regen = Fonte da vida, clear = Campo aberto. Multiplicadores: lava = dano da lava; gold = todo ouro ganho na rodada; speed = velocidade de
// todos; heal = toda vida recuperada (regeneração, Drenar, Roubo de vida); shrink = quanto do encolhimento normal acontece (abaixo de 1
// a arena para antes, até o SUDDEN.collapse); swords = a borda vira parede de espinhos (SWORDS) em vez de lava.
// Histórico: Vendaval era "lentidões −20%" e virou velocidade (+30% medido, +50% pedido pelo Fernando depois de jogar); a Caçada (hoje Febre do ouro) foi
// juntada à Arena e separada de novo, e passou de "ouro do abate" a todo ouro da rodada; a Fonte da vida curava só a regeneração (×1,3, fraca demais) e passou a ×1,5 em toda cura.
// Arena encolhendo só metade: sem encolher, rodada média de 181 s no Normal (simulador), porque ninguém cai mais na lava
// clear (Campo aberto) não tem multiplicador: a partida tira os obstáculos sorteados da arena (match.ts)
export const ROUND_EFFECT_IDS = ['lava', 'swords', 'gold', 'speed', 'regen', 'clear'] as const;
export type RoundEffectId = (typeof ROUND_EFFECT_IDS)[number];
export type RoundMods = { lava: number; gold: number; speed: number; heal: number; shrink: number; swords: boolean };
export const NO_MODS: RoundMods = { lava: 1, gold: 1, speed: 1, heal: 1, shrink: 1, swords: false };
export const ROUND_EFFECTS: Record<RoundEffectId, Partial<RoundMods>> = { lava: { lava: 0.5 }, swords: { swords: true, shrink: 0.5 }, gold: { gold: 1.5 }, speed: { speed: 1.5 }, regen: { heal: 1.5 }, clear: {} };
// parede de espinhos (Arena de espinhos; o id swords ficou do nome antigo): dano = base + perSpeed × a velocidade com que o empurrão joga o mago contra ela (m/s; Fernando, 21/10: quanto mais
// rápido bate, mais dói). Bola de fogo nível 1 empurra a ~4,5 m/s → ~87; só andando até a borda, 20. O empurrão de volta é o desse dano
// inset: a parede ocupa os últimos 0,3 m da pedra (Fernando, 21/10: espinhos mais para dentro); encostar nela já fere
export const SWORDS = { base: 20, perSpeed: 15, inset: 0.3 };
export const roundMods = (e: RoundEffectId | null): RoundMods => ({ ...NO_MODS, ...(e ? ROUND_EFFECTS[e] : {}) });
// sequências de abate (anúncio estilo Dota): abates com até 4 s entre eles; Matança e cia. contam abates sem morrer (atravessam as rodadas);
// quem derruba alguém com 3 ou mais abates seguidos ganha o Quebra-combo
// killGold: cada abate da sequência paga +20% do ouro do abate por abate seguido antes dele (2º = ×1,2, 3º = ×1,4…; ideia do Reinaldo, issue #340)
export const STREAK = { window: 4, spree: [3, 5, 7, 10], breakAt: 3, breakGold: 3, killGold: 0.2 };
// ilhas de refúgio na lava (Fernando, 18/10): 4 por arena, centro a 2–4 m da borda de agora (acompanham o encolhimento), raio 1,4 m;
// em cima não queima; com alguém em cima a lava avança 0,18 m/s (some em ~8 s), vazia volta a crescer (cheia em 30 s)
export const ISLAND = { n: 4, r: 1.4, near: 2, far: 4, sink: 0.18, regrow: 30 };
