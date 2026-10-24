import {
  ARENA_MIN, ARENA_R0, ASSIST_GOLD, ASSIST_MIN_DMG, BOUNTY, CHEST, CREDIT_WINDOW, DM_RESPAWN, DM_ROUND_MS, DM_SPAWN_GAP, HP_MAX, HP_REGEN, INVULN_TIME, KILL_GOLD, LAVA_DPS,
  LEADER_WIN_GOLD, OBSTACLES, RECOVERY, ROUND_GOLD, RUNE, SHRINK_EVERY, START_GOLD, STREAK, SUDDEN, TOP_DMG_GOLD, VOTE_MS, WIN_GOLD, ZONES,
} from '../shared/constants.ts';
import { DEFAULT_OPTS, DM_GOALS, OPTION_CHOICES } from '../shared/match.ts';
import { CLASH } from '../shared/sim.ts';
import { ITEMS, MAX_ITEMS, type ItemId } from '../shared/items.ts';
import { keyLabel, keyOf, padButtonName, padButtonOf, uiLabel, type PadAction, type UiAction } from './keys.ts';
import { BOUNCER, CAST_POINT, GRAVITY, GRIP, MAX_SPELLS, MAX_SPELL_LEVEL, METEOR_DELAY, PACT, RECHARGE, RUSH, SHIELD, SPELLS, SPELL_GROUP_IDS, SPELL_IDS, WARPZONE, type SpellId } from '../shared/spells.ts';
import { LANG, LOCALE, spellName, t } from './i18n.ts';
import { BASIC_ATTACK, BRACE, KNOCK_RECOVERY } from '../shared/constants.ts';

export const ATTACK_TEXT = t(
  `Atacar: aperte a tecla do ataque (A por padrão) e clique com o esquerdo num inimigo; no chão, escolhe o inimigo visível mais próximo de você dentro de ${BASIC_ATTACK.range} m. Até ${BASIC_ATTACK.melee.toLocaleString(LOCALE)} m usa corpo a corpo; mais longe, projétil direcionado. Preparo de ${BASIC_ATTACK.windup.toLocaleString(LOCALE)} s: S, movimento, conjuração ou stun cancelam antes do golpe, sem gastar recarga. Cada golpe exige nova ordem; não persegue nem repete sozinho. Causa ${BASIC_ATTACK.dmg} de dano e empurrão leve; o projétil não destrói magias.`,
  `Attack: press the attack key (A by default), then left-click an enemy; on the ground, selects the visible enemy closest to you within ${BASIC_ATTACK.range} m. Within ${BASIC_ATTACK.melee} m uses melee; farther away, a targeted projectile. A ${BASIC_ATTACK.windup} s windup: S, movement, casting or stun cancel before release without spending the cooldown. Each hit requires a new order; no automatic chasing or repeating. Deals ${BASIC_ATTACK.dmg} damage and light knockback; the projectile does not destroy spells.`
);

export const BRACE_TEXT = t(
  `Manter base: segure a tecla de Parar (S por padrão) por ${BRACE.windup.toLocaleString(LOCALE)} s. Parar é imediato; a resistência de ${Math.round(BRACE.resistance * 100)}%, a postura e o aviso sonoro só ativam após o preparo. Enquanto mantém a tecla, não caminha nem guarda destinos e recebe Incapacitar: as recargas ficam pausadas, mas magias prontas podem ser usadas. Reduz apenas novos empurrões, multiplicando outras resistências; não apaga um impulso anterior nem reduz dano. Solte a tecla e dê nova ordem para caminhar.`,
  `Hold ground: hold the Stop key (S by default) for ${BRACE.windup} s. Stopping is immediate; ${Math.round(BRACE.resistance * 100)}% resistance, pose and sound activate only after the windup. While held, walking commands are ignored, not queued, and Incapacitate pauses cooldowns; ready spells remain usable. Only reduces new knockback, multiplying other resistances; does not erase previous momentum or reduce damage. Release the key and give a new order to walk.`
);
// Mesmos dados alimentam Aprender, páginas do Grimório e ajuda da loja; controles não são produtos compráveis.
export const MECHANIC_GUIDES = [
  { id: 'basic' as const, title: t('Atacar', 'Attack'), text: ATTACK_TEXT },
  { id: 'brace' as const, title: t('Manter base', 'Hold ground'), text: BRACE_TEXT },
];

// Status descrevem o efeito em si, sem anexar uma magia ou demonstração.
export const NEGATIVE_GUIDES = [
  {id:'status-blindness',title:t('Cegueira','Blindness'),text:t('Reduz a visão a um círculo de6m de diâmetro (3m de raio) centrado no jogador afetado, com vinheta escura gradual até preto no exterior. Só altera a visão de quem recebe o status; não impede andar, atacar ou conjurar por si só. Duração depende da fonte e das resistências.','Restricts sight to a6m diameter circle (3m radius) centered on the affected player, with a soft dark vignette fading to black outside. Only affects the recipient’s vision; does not itself prevent movement, attacks or casting. Duration depends on the source and resistances.') },
  { id: 'status-knockback', title: t('Empurrão (knockback)', 'Knockback'), text: t(
    `Deslocamento forçado por um impacto. O dano histórico não aumenta sua força; impactos simultâneos e resistências ainda alteram o resultado. Ao terminar o impulso, o residual é encerrado: uma ordem de caminhada guardada usa a posição atual, sem ordem não há caminhada automática. A recuperação começa em ${KNOCK_RECOVERY.start * 100}% da velocidade e ganha ${KNOCK_RECOVERY.step * 100} pontos percentuais a cada ${KNOCK_RECOVERY.interval.toLocaleString(LOCALE)} s, voltando a 100% em ${KNOCK_RECOVERY.seconds} s. Essa recuperação não é um novo stun.`,
    `Forced displacement from an impact. Historical damage does not increase its force; simultaneous impacts and resistances still affect it. When the impulse ends, residual momentum is cleared: a stored walking order uses your current position; without an order there is no automatic walking. Recovery starts at ${KNOCK_RECOVERY.start * 100}% speed and gains ${KNOCK_RECOVERY.step * 100} percentage points every ${KNOCK_RECOVERY.interval} s, returning to 100% in ${KNOCK_RECOVERY.seconds} s. This recovery is not a new stun.`) },
  { id: 'status-stun', title: t('Atordoamento (stun)', 'Stun'), text: t(
    'Impede caminhar, conjurar qualquer magia e preparar Atacar enquanto estiver ativo. Forças externas ainda podem deslocar o corpo. Ao terminar, as ações voltam a ficar disponíveis, respeitando outros efeitos que ainda estejam ativos.',
    'Prevents walking, casting any spell and winding up Attack while active. External forces can still displace the body. When it ends, actions become available again, subject to any other effects that remain active.') },
  { id: 'status-snare', title: t('Agarramento (snare/root)', 'Root (snare)'), text: t(
    'Impede caminhar e usar magias de mobilidade, mas permite outras magias e Atacar. Forças externas ainda podem deslocar o alvo. A duração e as condições para encerrar a prisão são definidas pela fonte que aplica o efeito.',
    'Prevents walking and mobility spells, but allows other spells and Attack. External forces can still displace the target. Duration and conditions for ending the root are defined by the source applying the effect.') },
  { id: 'status-slow', title: t('Lentidão (slow)', 'Slow'), text: t(
    'Reduz a velocidade de caminhada, sem bloquear conjurações nem pausar recargas por si só. Intensidade e duração dependem da fonte que aplica o efeito. Efeitos de uma área dependem de permanecer dentro dela; não confunda sua duração com a duração de uma lentidão aplicada ao alvo.',
    'Reduces walking speed without blocking casts or pausing cooldowns by itself. Strength and duration depend on the source applying the effect. Area effects depend on staying inside them; their lifetime is not the same as a timed slow applied to a target.') },
  { id: 'status-incapacitate', title: t('Incapacitar', 'Incapacitate'), text: t(
    'Pausa o progresso das recargas enquanto estiver ativo. Magias que já estão prontas podem ser lançadas; não é silêncio e não impede caminhar por si só. Ao terminar, a recarga continua de onde parou.',
    'Pauses cooldown progress while active. Spells that are already ready can be cast; this is not silence and does not prevent walking by itself. When it ends, cooldowns resume where they stopped.') },
  { id: 'status-burning', title: t('Queimadura', 'Burning'), text: t(
    'Dano contínuo enquanto permanece em chão de fogo ou na lava. Não bloqueia movimento ou conjurações por si só. Sair da área interrompe essa fonte de dano; o chão de fogo e a lava têm valores próprios.',
    'Continuous damage while standing in burning ground or lava. Does not block movement or casting by itself. Leaving the area stops that damage source; burning ground and lava have separate damage values.') },
  { id: 'status-tether', title: t('Vínculo (tether)', 'Tethered'), text: t(
    'Um vínculo mantém dois corpos conectados e pode puxá-los um em direção ao outro. Não proíbe caminhar ou conjurar por si só. Dano periódico, duração e condições de rompimento dependem da fonte que aplica o vínculo.',
    'A tether connects two bodies and can pull them toward one another. It does not prevent walking or casting by itself. Periodic damage, duration and break conditions depend on the source applying the tether.') },
  { id: 'status-magnetized', title: t('Magnetizado (atração)', 'Magnetized (attraction)'), text: t(
    'A atração curva projéteis inimigos próximos para o alvo magnetizado. Não é um empurrão no corpo e não bloqueia caminhar ou conjurar. Repulsão é um efeito diferente, não uma parte obrigatória deste status.',
    'Attraction bends nearby enemy projectiles toward the magnetized target. It is not a push on the body and does not block walking or casting. Repulsion is a different effect, not a required part of this status.') },
  { id: 'status-pull', title: t('Puxões e redemoinhos', 'Pulls and vortices'), text: t(
    'Uma força contínua arrasta corpos próximos para um ponto ou centro, conforme a regra da fonte que a aplica. O deslocamento é uma força externa, não caminhada voluntária. Não são sinônimos de stun ou Incapacitar: restrições adicionais só existem se outro status também estiver ativo.',
    'A continuous force pulls nearby bodies toward a point or center according to the rules of its source. Displacement is an external force, not voluntary walking. These are not synonyms for stun or Incapacitate: extra restrictions apply only if another status is also active.') },
] as const;

// formatação dos números nos textos (também usada pela loja, ficha, dicas e opções)
export const pct = (x: number) => `${Math.round(x * 100)}%`;
// Centésimos preservam durações como1,25s e atraso1,15s; não arredondar regras para1,3/1,2.
export const n1 = (x: number) => x.toLocaleString(LOCALE, { maximumFractionDigits: 2 });
const join = (xs: readonly (string | number)[], last: string) => xs.map(String).join(', ').replace(/, ([^,]*)$/, ` ${last} $1`);
const list = (xs: readonly (string | number)[]) => join(xs, t('ou', 'or'));
const L1 = (id: SpellId) => SPELLS[id].levels[0];
// magias que saem na hora (sem tempo de conjuração), lidas de CAST_POINT
const INSTANT = join(SPELL_IDS.filter((s) => CAST_POINT[s] === 0).map((s) => spellName(s)), t('e', 'and'));

// textos do grimório (Como jogar), por página; os números vêm do código
const RULES_PT = {
  objetivo: [
    `Empurre os outros magos para fora da pedra. Na lava a vida cai ${LAVA_DPS} por segundo; na pedra ela volta ${HP_REGEN} por segundo. Cada mago tem ${HP_MAX} de vida.`,
    `A arena encolhe uma faixa a cada ${SHRINK_EVERY} s até ${n1(ARENA_MIN)} m de raio; a faixa que vai afundar pisca em vermelho antes. Ela é maior quanto mais magos tiver (com 4, ${n1(ARENA_R0)} m de raio).`,
    `Com ${SUDDEN.collapse} s de rodada, o tamanho mínimo deixa de valer e a arena some aos poucos (nenhuma rodada fica sem fim).`,
    `O último vivo vence a rodada e ganha 1 ponto. Quem chega primeiro a ${DEFAULT_OPTS.goal} rodadas vence a partida (padrão; muda nas opções). Se os últimos caem juntos, vence quem tinha mais vida.`,
    `Nos ${INVULN_TIME} primeiros segundos de cada rodada ninguém leva dano.`,
    `As magias saem 0,1 s depois da tecla e o mago fica parado enquanto conjura; saem na hora: ${INSTANT}. O clique de andar dado durante a conjuração vale assim que a magia sai.`,
  ],
  empurrao: [
    'Cada golpe empurra na direção dele. O número de empurrão das magias é a distância, em metros, que um mago sem resistência desliza.',
    'O dano recebido anteriormente não aumenta o empurrão. A força depende da magia e das resistências; impulsos simultâneos ainda podem se somar.',
    'Atordoado você não anda nem conjura magias. Preso pelo Agarrar você não anda nem usa magias de movimento, mas pode usar as outras. O empurrão físico continua sendo resolvido pelas forças do jogo.',
    `O abate vai para quem acertou você por último nos ${CREDIT_WINDOW} s antes da morte. Cair sozinho na lava não dá abate a ninguém.`,
    `Lava conta como dano de quem empurrou: metade da vida que a lava tira de quem você acertou nos últimos ${CREDIT_WINDOW} s entra no seu dano (placar, top dano e assistência).`,
    `Abates com até ${STREAK.window} s entre eles viram Abate duplo, Abate triplo e Massacre. Abates sem morrer (contam de uma rodada para outra): ${STREAK.spree[0]} é Matança, ${STREAK.spree[1]} Fúria assassina, ${STREAK.spree[2]} Imparável e ${STREAK.spree[3]} Lendária.`,
    `Quebra-combo: derrubar quem tem ${STREAK.breakAt} ou mais abates seguidos dá +${STREAK.breakGold} de ouro.`,
  ],
  // os textos de controles leem as teclas e botões atuais (trocáveis nas configurações): getter, refeito a cada leitura
  get pc() {
    const k = (a: UiAction) => uiLabel(a);
    const sheet = keyOf('sheet') === 'Backquote' ? "Tecla à esquerda do 1 (' no teclado brasileiro)" : k('sheet');
    return [
      `Botão direito no chão: andar (segure para arrastar o destino). ${k('stop')}: parar (durante o lançamento, cancela a magia sem gastar a recarga). Segurar por 0,5 s ativa Manter base: reduz empurrão em 15%, mas pausa suas recargas (Incapacitar); habilidades prontas continuam disponíveis. Enquanto ativo, não caminha nem guarda cliques de movimento: solte a tecla e dê nova ordem para andar. Empurrões externos continuam. Pose e estrondo curto avisam a ativação; soltar antes cancela. Esc: cancela a magia escolhida, fecha o que estiver aberto e, sem nada aberto, abre as configurações.`,
      'Tecla da magia: três jeitos de lançar, escolhidos em Configurações > Lançamento. Rápido (padrão): lança na hora na direção do mouse; o círculo de alcance aparece ao passar o mouse na magia da barra.',
      'Ao soltar: segurando a tecla aparece o círculo de alcance; ao soltar, a magia sai (Esc cancela). Com clique: a tecla escolhe a magia e mostra o alcance, o clique esquerdo lança (fora do alcance, vai até a borda); botão direito ou Esc cancelam.',
      'Clicar no botão da magia e depois no chão também lança.',
      ATTACK_TEXT,
      'Roda do mouse: zoom. Espaço + arrastar com o botão esquerdo: mover a câmera; Espaço sozinho volta ao centro.',
      `${k('board')} (segurar): placar; com ele aberto, ← → troca entre Rodada, Partida e Sala.`,
      `${k('taunt')}: provocações. ${sheet}: ficha do mago. ${k('shop')}: loja só para ver durante a rodada (o jogo não pausa; ${k('shop')}, Esc ou ✕ fecham). ${k('rules')}: este grimório.${keyOf('vote') ? ` ${k('vote')}: votar.` : ''}`,
      'Dá para trocar a tecla de cada magia em Configurações > Lançamento e a de cada atalho em Configurações > Teclas (Esc ou a engrenagem no topo), ou usar 1 2 3 4 Q W E R pela ordem da barra (fica salvo no navegador).',
    ];
  },
  get controle() {
    const b = (p: PadAction) => padButtonName(padButtonOf(p), ' (', ')'); // "A (✕)"
    return [
      'Ligue o controle (Xbox ou PlayStation) e aperte qualquer botão: aparece "Controle conectado" e a barra mostra os botões do controle.',
      'Analógico esquerdo: andar. Analógico direito: mirar (o anel dourado no chão mostra onde). Sem mirar, a magia vai para onde você anda.',
      `${join((['slot1', 'slot2', 'slot3', 'slot4', 'slot5', 'slot6', 'slot7', 'slot8'] as const).map(b), 'e')}: as magias pela ordem da barra.`,
      `Start (Options): o Esc do controle (fecha o que estiver aberto; sem nada aberto, abre e fecha as configurações). ${b('board')} segurado: placar. ${b('sheet')}: ficha do mago. ${b('center')}: centraliza a câmera. ${b('shop')}: loja só para ver.`,
      'Os botões da partida se trocam em Configurações > Controle (desenho do controle: clique no botão e aperte o novo).',
      'Menus e loja: D-pad ou analógico esquerdo anda entre os botões, A confirma (o Pronto da loja começa focado), B volta ou fecha, X desfaz ou vende, Y mostra a dica, LB e RB pulam entre os grupos.',
      'Vibra ao levar golpe forte e ao morrer (dá para desligar em Configurações > Controle).',
    ];
  },
  celular: [
    'Toque no chão para andar.',
    'Toque no botão da magia e depois no chão para lançar; o ✕ do aviso cancela.',
    'No topo: o gráfico de barras abre o placar, o pergaminho abre a ficha do mago, o balão manda provocações, a urna (Votar) troca o modo ou expulsa alguém e a engrenagem abre as configurações.',
    'Neste grimório: deslize o dedo para os lados para virar a página.',
  ],
  rodadas: [
    `O último vivo ganha a rodada e 1 ponto. Meta padrão: ${DEFAULT_OPTS.goal} rodadas (${list(OPTION_CHOICES.goal)} nas opções).`,
    `Morte súbita: passados ${SUDDEN.at} s de rodada, a arena encolhe a cada ${SUDDEN.every} s em vez de ${SHRINK_EVERY}.`,
  ],
  deathmatch: [
    `Rodadas de ${DM_ROUND_MS / 1000} s e a arena não encolhe. Quem cai volta ${DM_RESPAWN} s depois, longe dos outros magos (tenta ${DM_SPAWN_GAP} m ou mais), com vida cheia e ${INVULN_TIME} s sem levar dano; magias e itens continuam.`,
    `Cada abate vale 1 ponto (cair sozinho não vale). A partida acaba no fim da rodada em que alguém chega à meta (${list(Object.values(DM_GOALS))} abates; padrão ${DM_GOALS[DEFAULT_OPTS.goal]}); empate joga mais uma rodada.`,
  ],
  times: [
    'Azul contra Vermelho, times do mesmo tamanho (com número ímpar, um tem 1 a mais). Sorteados a cada rodada ou fixos na partida (escolha da sala, ou votação).',
    'A rodada acaba quando só sobra gente de um time; todos dele ganham 1 ponto e o ouro da vitória.',
    'Magia em aliado só empurra: não tira vida nem dá abate. Míssil, Ricochete, Gravidade e Agarrar só pegam inimigos; a Troca com aliado vale.',
  ],
  opcoes: [
    `Quem começa a partida escolhe o modo e as opções na sala de espera: tempo de loja (${list(OPTION_CHOICES.shop)} s), ouro ganho (×${list(OPTION_CHOICES.economy.map(n1))}), ouro inicial (${list(OPTION_CHOICES.startGold)}), meta e arena. Runas e baús dá para desligar. Embaixo do número de bots, cada bot tem a sua dificuldade (Fácil, Casual, Normal, Veterano, Difícil ou Automático, o padrão); bot votado no meio da partida entra Automático.`,
    `Votar, no topo: trocar o modo, mudar uma opção, sortear ou fixar os times, pôr ou tirar um bot, pular a loja, reiniciar, encerrar ou expulsar alguém. Passa com mais da metade; fecha em ${VOTE_MS / 1000} s e vale na próxima rodada.`,
  ],
  arenas: [
    `Obstáculos: pilar (${OBSTACLES.pillar.hp} de vida, explode com ${OBSTACLES.pillar.blastDmg} de dano ao quebrar), rocha (não quebra), árvore morta (${OBSTACLES.tree.hp} de vida) e altar de velas (${OBSTACLES.shrine.hp} de vida, explode com ${OBSTACLES.shrine.blastDmg} de dano em ${n1(OBSTACLES.shrine.blastR)} m). Bloqueiam magos, projéteis e Eletrocutar.`,
    `Baú de ouro (pode desligar): o primeiro aos ${CHEST.first} s, depois um a cada ${CHEST.every} s (até ${CHEST.maxUp} de pé). Quebre com magias e fique em cima do monte: 1 de ouro a cada ${CHEST.goldEvery} s; o monte tem de ${CHEST.pile[0]} a ${CHEST.pile[1]} de ouro.`,
  ],
  get loja() {
    return [
      `Você começa com ${START_GOLD} de ouro (padrão), a Bola de fogo e o Flagelo (tecla ${keyLabel(keyOf('scourge'))}). A loja abre entre as rodadas e dura ${DEFAULT_OPTS.shop} s (padrão); fecha antes quando todos clicam Pronto.`,
      `Magias sobem até o nível ${MAX_SPELL_LEVEL} (mais dano e empurrão, menos recarga). No máximo ${MAX_SPELLS} magias e ${MAX_ITEMS} itens por mago.`,
      `Desfazer: devolve o ouro de uma compra feita nesta loja. Vender: devolve 100% do que você pagou, em qualquer rodada.`,
      'A Bola de fogo também se vende (vale 0 no nível 1, mas libera a vaga e a tecla); comprar de volta custa o preço normal.',
      `Durante a rodada, a tecla ${uiLabel('shop')} (ou o botão da loja, no topo) mostra a loja só para ver: preços e o que o seu ouro já compra na próxima.`,
    ];
  },
  ouro: [
    `Por rodada: ${ROUND_GOLD}. Vitória: ${WIN_GOLD} (o líder do placar que vence ganha só ${LEADER_WIN_GOLD}). Abate: ${KILL_GOLD}. Mais dano na rodada: ${TOP_DMG_GOLD}. Assistência (mais dano em quem morreu, sem ser quem matou, com pelo menos ${ASSIST_MIN_DMG}): ${ASSIST_GOLD}.`,
    `Recuperação: quem ganhou menos ouro que a média recebe metade da diferença no fim da rodada (até ${RECOVERY.max}). Abater o líder vale +${BOUNTY.perWin} por vitória de vantagem dele sobre a média (até ${BOUNTY.max}).`,
    'Tudo isso é multiplicado pelo "Ouro ganho" das opções.',
  ],
  runas: [
    `Aparece uma por vez num ponto livre da arena: a primeira aos ${RUNE.first} s e a próxima ${RUNE.every} s depois que alguém pega (ou a lava engole). Encoste para pegar; o efeito dura ${RUNE.secs} s. Pegar outra troca a runa.`,
  ],
  runa: {
    haste: `Pressa: +${pct(RUNE.haste)} de velocidade de andar.`,
    fury: `Fúria: +${pct(RUNE.fury)} de dano em tudo que você acerta.`,
    shield: `Escudo de runa: você leva ${pct(RUNE.armor)} menos dano (o empurrão continua).`,
    recharge: `Recarga: suas recargas levam ${pct(RUNE.cdr)} menos tempo.`,
  },
  choques: [
    'Projéteis em voo de magos inimigos se destroem ao colidir, incluindo a Rajada. Projéteis do mesmo dono ou de aliados não se anulam. As combinações elementais existentes mantêm seus efeitos:',
    `Fogo com fogo: explosão de ${CLASH.fire.dmg} em ${n1(CLASH.fire.r)} m e chão em chamas (${ZONES.burn.dps} de dano por segundo por ${n1(ZONES.burn.secs)} s).`,
    `Fogo com míssil (arcano): explosão de ${CLASH.arcane.dmg} em ${n1(CLASH.arcane.r)} m e chão lento (anda a ${pct(ZONES.slow.mult)} por ${n1(ZONES.slow.secs)} s).`,
    `Míssil com míssil (pulso): explosão de ${CLASH.pulse.dmg} em ${n1(CLASH.pulse.r)} m e um redemoinho que puxa para o centro por ${ZONES.pull.secs} s.`,
    'Eletrocutar destrói os projéteis que atingir no caminho, sem ser interrompido por eles. Não destrói áreas persistentes nem a cópia da Ilusão; obstáculos e Escudo continuam bloqueando/refletindo Eletrocutar.',
    'O dano das explosões cai do centro para a borda. O Escudo não segura explosões.',
  ],
  dicas: [
    'Fique longe da borda: um golpe pode jogar você na lava.',
    'Ande o tempo todo: projéteis vão reto, e quem para de andar vira alvo fácil do Meteoro.',
    `Guarde uma magia de fuga (Teleporte, Investida, Troca) para quando cair na lava: são ${LAVA_DPS} de vida por segundo.`,
    'Prenda (Agarrar, Elo, Bola de neve) e emende a magia mais forte: o golpe que solta o Agarrar empurra mais.',
    'Combine: Magnetizar + projéteis, Gravidade + Meteoro, Pacto + Bola de fogo perto da borda.',
    `Flagelo: ${n1(CAST_POINT.scourge)} s de preparo e ${n1(L1('scourge').cd)} s de recarga; use quando alguém encostar em você. A explosão também destrói Bolas de fogo e Mísseis inimigos em volta. O Teleporte cancela o preparo.`,
    'Na loja, passe o mouse (ou toque) numa magia para ver os números do nível atual e do próximo.',
  ],
  creditos: [
    'Personagens e decoração: KayKit, de Kay Lousberg (kaylousberg.com). Texturas: ambientCG e Poly Haven. Partículas e sons: Kenney e OpenGameArt. Música: "Determined Pursuit", de Emma_MA. Tudo em domínio público (CC0). Ícones: game-icons.net, de Lorc, Delapouite, Skoll, Sbed e Caro Asercion (CC BY 3.0; lista em CREDITS.txt).',
    'Inspirado no Warlock do Warcraft 3 e no Warlock Brawl para Dota 2.',
  ],
};

const RULES_EN: typeof RULES_PT = {
  objetivo: [
    `Knock the other wizards off the rock. In the lava, health drops ${LAVA_DPS} per second; on the rock it comes back ${HP_REGEN} per second. Each wizard has ${HP_MAX} health.`,
    `The arena shrinks one ring every ${SHRINK_EVERY} s down to a radius of ${n1(ARENA_MIN)} m; the ring about to sink flashes red first. It is bigger the more wizards there are (with 4, a radius of ${n1(ARENA_R0)} m).`,
    `At ${SUDDEN.collapse} s into the round, the minimum size no longer applies and the arena crumbles away (no round goes on forever).`,
    `The last one alive wins the round and gets 1 point. First to ${DEFAULT_OPTS.goal} rounds wins the match (default; change it in the options). If the last ones fall together, whoever had more health wins.`,
    `For the first ${INVULN_TIME} seconds of each round nobody takes damage.`,
    `Spells go off 0.1 s after the key and the wizard stands still while casting; these go off instantly: ${INSTANT}. A walk click made during casting takes effect as soon as the spell goes off.`,
  ],
  empurrao: [
    "Each hit knocks back in the direction it travels. A spell's knockback number is the distance, in meters, that a wizard without resistance slides.",
    'Previously received damage does not increase knockback. Strength depends on the spell and resistances; simultaneous impulses can still add together.',
    'While stunned you cannot walk or cast spells. While gripped you cannot walk or cast movement spells, but other spells remain usable. Physical knockback is still resolved by the game forces.',
    `The kill goes to whoever hit you last in the ${CREDIT_WINDOW} s before the death. Falling into the lava on your own gives no kill to anyone.`,
    `Lava counts as damage from whoever knocked you in: half of the health the lava takes from someone you hit in the last ${CREDIT_WINDOW} s is added to your damage (scoreboard, top damage and assists).`,
    `Kills within ${STREAK.window} s of each other become a Double kill, Triple kill and Ultra kill. Kills without dying (carried over from one round to the next): ${STREAK.spree[0]} is a Killing spree, ${STREAK.spree[1]} a Rampage, ${STREAK.spree[2]} Unstoppable and ${STREAK.spree[3]} Godlike.`,
    `Combo breaker: taking down someone with ${STREAK.breakAt} or more kills in a row gives +${STREAK.breakGold} gold.`,
  ],
  get pc() {
    const k = (a: UiAction) => uiLabel(a);
    const sheet = keyOf('sheet') === 'Backquote' ? 'Key left of the 1 (` on a US keyboard)' : k('sheet');
    return [
      `Right-click the ground: walk (hold to drag the destination). ${k('stop')}: stop (while casting, cancels the spell without spending the cooldown). Hold for 0.5 s to activate Hold ground: 15% less knockback, but your cooldowns pause (Incapacitate); ready abilities remain available. While active, walking commands are ignored, not queued: release the key and give a new order to walk. External knockback still applies. Pose and a short sonic boom signal activation; releasing early cancels it. Esc: cancels the chosen spell, closes whatever is open and, with nothing open, opens the settings.`,
      'Spell key: three ways to cast, chosen in Settings > Casting. Quick (default): casts instantly toward the mouse; the range circle shows when you hover the spell on the bar.',
      'On release: holding the key shows the range circle; when you release, the spell goes off (Esc cancels). With click: the key picks the spell and shows the range, left click casts (out of range, it goes to the edge); right click or Esc cancel.',
      'Clicking the spell button and then the ground also casts.',
      ATTACK_TEXT,
      'Mouse wheel: zoom. Space + drag with the left button: move the camera; Space alone recenters.',
      `${k('board')} (hold): scoreboard; with it open, ← → switches between Round, Match and Room.`,
      `${k('taunt')}: taunts. ${sheet}: wizard sheet. ${k('shop')}: view-only shop during the round (the game does not pause; ${k('shop')}, Esc or ✕ close it). ${k('rules')}: this grimoire.${keyOf('vote') ? ` ${k('vote')}: vote.` : ''}`,
      'You can rebind the key of each spell in Settings > Casting and of each shortcut in Settings > Keys (Esc or the gear at the top), or use 1 2 3 4 Q W E R in bar order (saved in the browser).',
    ];
  },
  get controle() {
    const b = (p: PadAction) => padButtonName(padButtonOf(p), ' (', ')'); // "A (✕)"
    return [
      'Plug in the controller (Xbox or PlayStation) and press any button: "Controller connected" appears and the bar shows the controller buttons.',
      'Left stick: walk. Right stick: aim (the golden ring on the ground shows where). Without aiming, the spell goes where you walk.',
      `${join((['slot1', 'slot2', 'slot3', 'slot4', 'slot5', 'slot6', 'slot7', 'slot8'] as const).map(b), 'and')}: the spells in bar order.`,
      `Start (Options): the controller's Esc (closes whatever is open; with nothing open, opens and closes the settings). ${b('board')} held: scoreboard. ${b('sheet')}: wizard sheet. ${b('center')}: centers the camera. ${b('shop')}: view-only shop.`,
      'The in-match buttons are changed in Settings > Controller (controller drawing: click the button and press the new one).',
      "Menus and shop: D-pad or left stick moves between buttons, A confirms (the shop's Ready starts focused), B goes back or closes, X undoes or sells, Y shows the tip, LB and RB jump between groups.",
      'Rumbles on a strong hit and on death (can be turned off in Settings > Controller).',
    ];
  },
  celular: [
    'Tap the ground to walk.',
    'Tap the spell button and then the ground to cast; the ✕ on the notice cancels.',
    'At the top: the bar chart opens the scoreboard, the scroll opens the wizard sheet, the speech bubble sends taunts, the ballot box (Vote) changes the mode or kicks someone and the gear opens the settings.',
    'In this grimoire: swipe sideways to turn the page.',
  ],
  rodadas: [
    `The last one alive wins the round and 1 point. Default goal: ${DEFAULT_OPTS.goal} rounds (${list(OPTION_CHOICES.goal)} in the options).`,
    `Sudden death: after ${SUDDEN.at} s of the round, the arena shrinks every ${SUDDEN.every} s instead of ${SHRINK_EVERY}.`,
  ],
  deathmatch: [
    `Rounds of ${DM_ROUND_MS / 1000} s and the arena does not shrink. Whoever falls comes back ${DM_RESPAWN} s later, away from the other wizards (tries ${DM_SPAWN_GAP} m or more), with full health and ${INVULN_TIME} s without taking damage; spells and items stay.`,
    `Each kill is worth 1 point (falling on your own does not count). The match ends at the end of the round in which someone reaches the goal (${list(Object.values(DM_GOALS))} kills; default ${DM_GOALS[DEFAULT_OPTS.goal]}); a tie plays one more round.`,
  ],
  times: [
    'Blue against Red, teams of the same size (with an odd number, one has 1 more). Shuffled every round or fixed for the match (room choice, or vote).',
    'The round ends when only one team has anyone left; all of them get 1 point and the victory gold.',
    'Spells on an ally only knock back: no damage and no kill. Homing Missile, Bouncer, Gravity and Grip only hit enemies; Swap with an ally works.',
  ],
  opcoes: [
    `Whoever starts the match picks the mode and options in the lobby: shop time (${list(OPTION_CHOICES.shop)} s), gold earned (×${list(OPTION_CHOICES.economy.map(n1))}), starting gold (${list(OPTION_CHOICES.startGold)}), goal and arena. Runes and chests can be turned off. Below the bot count, each bot has its own difficulty (Easy, Casual, Normal, Veteran, Hard or Auto, the default); a bot voted in mid-match joins on Auto.`,
    `Vote, at the top: change the mode, change an option, shuffle or fix the teams, add or remove a bot, skip the shop, restart, end or kick someone. Passes with more than half; closes in ${VOTE_MS / 1000} s and takes effect next round.`,
  ],
  arenas: [
    `Obstacles: pillar (${OBSTACLES.pillar.hp} health, explodes for ${OBSTACLES.pillar.blastDmg} damage when broken), boulder (unbreakable), dead tree (${OBSTACLES.tree.hp} health) and candle shrine (${OBSTACLES.shrine.hp} health, explodes for ${OBSTACLES.shrine.blastDmg} damage in ${n1(OBSTACLES.shrine.blastR)} m). They block wizards, projectiles and Electrocute.`,
    `Gold chest (can be turned off): the first at ${CHEST.first} s, then one every ${CHEST.every} s (up to ${CHEST.maxUp} standing). Break it with spells and stand on the pile: 1 gold every ${CHEST.goldEvery} s; the pile holds ${CHEST.pile[0]} to ${CHEST.pile[1]}.`,
  ],
  get loja() {
    return [
      `You start with ${START_GOLD} gold (default), the Fireball and the Scourge (key ${keyLabel(keyOf('scourge'))}). The shop opens between rounds and lasts ${DEFAULT_OPTS.shop} s (default); it closes early when everyone clicks Ready.`,
      `Spells go up to level ${MAX_SPELL_LEVEL} (more damage and knockback, less cooldown). At most ${MAX_SPELLS} spells and ${MAX_ITEMS} items per wizard.`,
      `Undo: refunds the gold of a purchase made in this shop. Sell: refunds 100% of what you paid, in any round.`,
      'The Fireball can also be sold (worth 0 at level 1, but it frees the slot and the key); buying it back costs the normal price.',
      `During the round, the ${uiLabel('shop')} key (or the shop button at the top) shows the shop view-only: prices and what your gold already buys in the next one.`,
    ];
  },
  ouro: [
    `Per round: ${ROUND_GOLD}. Victory: ${WIN_GOLD} (the scoreboard leader who wins gets only ${LEADER_WIN_GOLD}). Kill: ${KILL_GOLD}. Most damage in the round: ${TOP_DMG_GOLD}. Assist (most damage on the one who died, other than the killer, with at least ${ASSIST_MIN_DMG}): ${ASSIST_GOLD}.`,
    `Catch-up: whoever earned less gold than the average gets half the difference at the end of the round (up to ${RECOVERY.max}). Killing the leader is worth +${BOUNTY.perWin} per win of lead over the average (up to ${BOUNTY.max}).`,
    'All of this is multiplied by the "Gold earned" option.',
  ],
  runas: [
    `One appears at a time at a free spot on the arena: the first at ${RUNE.first} s and the next ${RUNE.every} s after someone picks it up (or the lava swallows it). Touch it to pick it up; the effect lasts ${RUNE.secs} s. Picking up another swaps the rune.`,
  ],
  runa: {
    haste: `Haste: +${pct(RUNE.haste)} walking speed.`,
    fury: `Fury: +${pct(RUNE.fury)} damage on everything you hit.`,
    shield: `Rune shield: you take ${pct(RUNE.armor)} less damage (knockback still applies).`,
    recharge: `Recharge: your cooldowns take ${pct(RUNE.cdr)} less time.`,
  },
  choques: [
    'Flying projectiles from enemy wizards destroy each other on collision, including Cluster. Projectiles from the same owner or allies do not cancel each other. Existing elemental combinations retain their effects:',
    `Fire with fire: ${CLASH.fire.dmg} explosion in ${n1(CLASH.fire.r)} m and burning ground (${ZONES.burn.dps} damage per second for ${n1(ZONES.burn.secs)} s).`,
    `Fire with missile (arcane): ${CLASH.arcane.dmg} explosion in ${n1(CLASH.arcane.r)} m and slow ground (move at ${pct(ZONES.slow.mult)} for ${n1(ZONES.slow.secs)} s).`,
    `Missile with missile (pulse): ${CLASH.pulse.dmg} explosion in ${n1(CLASH.pulse.r)} m and a whirlpool that pulls toward the center for ${ZONES.pull.secs} s.`,
    'Electrocute destroys projectiles it hits along its path without being stopped by them. Does not destroy persistent areas or the Illusion copy; obstacles and Shield still block/reflect Electrocute.',
    'Explosion damage falls off from the center to the edge. The Shield does not stop explosions.',
  ],
  dicas: [
    'Stay away from the edge: a hit can throw you into the lava.',
    'Keep moving: projectiles go straight, and anyone who stops walking becomes an easy target for the Meteor.',
    `Keep an escape spell (Teleport, Rush, Swap) for when you fall into the lava: that is ${LAVA_DPS} health per second.`,
    'Pin them down (Grip, Link, Snowball) and follow up with your strongest spell: the hit that releases the Grip knocks back farther.',
    'Combine: Magnetize + projectiles, Gravity + Meteor, Pact + Fireball near the edge.',
    `Scourge: ${n1(CAST_POINT.scourge)} s of windup and ${n1(L1('scourge').cd)} s of cooldown; use it when someone gets on top of you. The blast also destroys enemy Fireballs and Missiles around you. Teleport cancels the windup.`,
    'In the shop, hover (or tap) a spell to see the numbers for the current and the next level.',
  ],
  creditos: [
    'Characters and decoration: KayKit, by Kay Lousberg (kaylousberg.com). Textures: ambientCG and Poly Haven. Particles and sounds: Kenney and OpenGameArt. Music: "Determined Pursuit", by Emma_MA. All public domain (CC0). Icons: game-icons.net, by Lorc, Delapouite, Skoll, Sbed and Caro Asercion (CC BY 3.0; list in CREDITS.txt).',
    'Inspired by Warlock from Warcraft 3 and Warlock Brawl for Dota 2.',
  ],
};
export { RULES_EN, RULES_PT };
export const RULES = LANG === 'en' ? RULES_EN : RULES_PT;

// grimório: como usar cada magia e contra o quê ela funciona (lido do comportamento em shared/sim.ts)
type SpellTips = Record<SpellId, [use: string, vs: string]>;
const SPELL_TIPS_PT: SpellTips = {
  closedbody: ['Ative Manter base antes de lançar e continue segurando S.', 'Duração máxima3,5s no nível1, +0,75s por nível, até8s no nível7; soltar S encerra antes. Reduz dano, novos empurrões e duração dos novos status em90%, sem remover efeitos anteriores. Ao expirar, Manter base continua se S estiver pressionado.'],
  geyser: ['Mire no chão: o jato sustenta você, aliados e inimigos que tocarem a área até o fim do gêiser.', 'Suspensos ficam imóveis e invulneráveis, sem atacar nem conjurar. O jato não causa dano; cuidado ao proteger também inimigos.'],
  heal: ['Aperte a tecla de Curar e clique com o botão esquerdo em você ou num aliado vivo dentro do alcance. Aura verde e coral curto confirmam a cura. Esc, S ou botão direito cancelam.', 'Atordoamento impede a conjuração. Não cura inimigos nem revive mortos; não causa dano nem empurrão.'],
  fireball: ['Mire um pouco à frente de quem anda. Perto da borda, um acerto já joga na lava.', 'O Escudo devolve; Teleporte e Troca escapam. Eletrocutar destrói a bola no ar e duas bolas que se chocam viram chão em chamas.'],
  lightning: ['Instantâneo: quica sem repetir alvos por lançamento, com alcance fixo e 50% menos dano e empurrão por salto. Por 2 s, aplica lentidão de 25% e Incapacitar: pausa recargas, sem impedir habilidades prontas. Destrói projéteis no trajeto.', `Obstáculos bloqueiam; o Escudo devolve a descarga para você e encerra a cadeia. Alcance de ${n1(L1('lightning').range)} m por trecho no nível 1. Outro lançamento pode acertar os mesmos alvos.`],
  homing: ['Bom contra quem foge e desvia: mire perto do alvo, ele persegue o inimigo mais perto da mira.', 'O Escudo devolve e ele passa a perseguir você; obstáculos o param. Com uma Bola de fogo inimiga, vira chão lento.'],
  shield: [`Ligue quando o projétil estiver chegando: dura só ${n1(L1('shield').duration)} s. Devolve mirando quem lançou.`, 'Impede dano enquanto ativo e reduz em 40% os novos empurrões e a duração dos status recebidos nesse período. Não altera efeitos anteriores. Devolve projéteis e Eletrocutar; barra Troca; Bumerangue e Elo quicam.'],
  teleport: ['Volte da lava para a pedra ou saia da frente de um projétil. É a única magia que sai durante o preparo do seu Flagelo (e o cancela).', `Quem lê o salto atira no ponto de chegada. Recarga longa no começo (${n1(L1('teleport').cd)} s).`],
  swap: ['Fique perto da lava e troque: o inimigo vai para o seu lugar ruim. Errou? Você vai até a metade do caminho da mira, que também serve de fuga.', 'O Escudo barra a Troca: ninguém sai do lugar.'],
  grip: [`Marque o chão: cipós nascem após ${n1(GRIP.delay)} s e prendem os inimigos na área. O golpe que solta empurra mais (+${pct(L1('grip').scale)} no nível 1).`, 'Impede andar e lançar magias de movimento; permite outras magias. Não prende aliados. Escudo ativo reduz em 40% o tempo preso. Atordoamento impede movimento e todas as magias.'],
  meteor: [`Mire onde o inimigo vai estar daqui a ${METEOR_DELAY.toLocaleString(LOCALE)} s, ou em quem está preso ou conjurando. Dano maior no centro e atordoamento de ${n1(L1('meteor').duration)} s, sem empurrão.`, 'Dá para sair andando da marca. Escudo ativo impede o dano e reduz o tempo do atordoamento.'],
  rush: [`O avanço de ${n1(RUSH.dash)} m dura ${n1(RUSH.dashTime)} s e termina sem caminhada automática e quem você encostar leva ${RUSH.dashDmg} de dano. Durante a Investida, ${pct(RUSH.share)} de cada golpe vira velocidade (até o limite do nível).`, 'Só o dano é absorvido: o empurrão continua valendo.'],
  cluster: ['Mire na frente: espalha areia num cone de3m de comprimento e2m de largura na ponta, sem empurrão nem projéteis em voo.', 'Causa20 de dano (+8 por nível), Incapacitar por1s (+0,25s/nível) e Cegueira por2s (+0,5s/nível). Incapacitar pausa recargas, mas permite magias prontas. Cegueira limita a visão a3m de raio; resistências reduzem os novos status.'],
  boomerang: ['Acerta na ida e na volta: deixe o inimigo entre você e o ponto. Quica em obstáculos.', 'No Escudo ele quica e volta sem trocar de dono.'],
  thrust: ['O dano cheio vem com velocidade: comece de longe. Você para no primeiro inimigo que tocar.', 'No Escudo você quica. Se errar, freia no fim do caminho.'],
  gravity: [`Jogue no meio de um grupo: puxa inimigos até ${n1(GRAVITY.wizR)} m e queima quem fica a ${n1(L1('gravity').radius)} m. Também puxa projéteis de qualquer dono.`, `É lento (${n1(L1('gravity').speed)} m/s): dá para sair andando.`],
  rockpillar: [`Erga entre você e um projétil: a parede (2 m, atravessada no caminho) segura magos e projéteis por ${n1(L1('rockpillar').duration)} s.`, `Magias quebram a parede (${OBSTACLES.rockpillar.hp} de vida para ela toda), e ela explode ao quebrar.`],
  bouncer: [`Melhor com inimigos juntos: pula para o mago mais perto, perdendo ${pct(1 - BOUNCER.decay)} do dano por inimigo.`, 'Contra um inimigo sozinho é só um acerto.'],
  drain: ['Mire perto do grupo: depois do ponto, vira para o mago mais perto. No inimigo, dano, lentidão e a vida volta para você; no aliado, cura e pressa.', `É lento (${n1(L1('drain').speed)} m/s) e o Escudo devolve.`],
  snowball: ['Quem encosta é arrastado junto: role na direção da lava. No fim do caminho ela explode.', `Muito lenta (${n1(L1('snowball').speed)} m/s) e de alcance curto: dá para sair da frente.`],
  illusion: [`Cria uma cópia no seu lugar, que segue reto na direção do seu movimento por ${n1(L1('illusion').duration)} s. Você pode se mover livremente, invisível, até ela sumir. Lançar outra magia ou liberar Atacar encerra a invisibilidade; receber dano não a cancela. A cópia não é destruída por golpes, mas pode ser empurrada.`, 'Mísseis teleguiados e bots são enganados pela cópia.'],
  magnetize: ['Magnetize o inimigo e atire perto dele: os seus projéteis curvam até ele. Em você ou num aliado, afasta os projéteis inimigos.', 'Só curva projéteis que passam perto (menos de 2 m).'],
  recharge: [`Se acertar, ela volta até você e zera a recarga: lance de novo, com +${RECHARGE.perHit} de dano por acerto seguido.`, `Errar zera a sequência e a recarga é longa (${n1(L1('recharge').cd)} s no nível 1).`],
  alteration: [`Ligue quando um projétil estiver chegando: por ${n1(L1('alteration').duration)} s você troca de lugar com o primeiro que entrar na bolha.`, 'Não serve contra Eletrocutar, Meteoro, Flagelo e explosões, que não são projéteis.'],
  link: ['Puxe o inimigo para perto (e para o seu Meteoro), ou prenda num obstáculo e puxe-se até ele para fugir.', 'O Escudo faz o Elo quicar e voltar.'],
  windwalk: ['Fique invisível, chegue perto e encoste: o primeiro inimigo leva dano. Também serve para fugir sem ser visto.', `Lançar qualquer magia desfaz; dura ${n1(L1('windwalk').duration)} s.`],
  splitter: ['Estoura no ponto (ou no primeiro que tocar) em 8 projéteis em leque: cobre uma área ou acerta quem está atrás de obstáculo.', 'Cada filhote é fraco; de longe eles se espalham.'],
  warpzone: [`Ponha entre você e os projéteis: dentro dela os projéteis inimigos andam a ${pct(L1('warpzone').scale)} (nível 1) e os inimigos a ${pct(WARPZONE.wizMult)} da velocidade.`, 'Não para Eletrocutar nem áreas.'],
  scourge: [`Encostaram em você: explode em volta depois de ${n1(CAST_POINT.scourge)} s, empurra quem está perto e destrói Bolas de fogo e Mísseis inimigos. Ao explodir, o empurrão que você está sofrendo acaba.`, 'Dá para sair do raio durante o preparo; o Teleporte cancela o seu. O Escudo não segura.'],
  pact: [`A próxima magia de dano em ${n1(L1('pact').duration)} s sai ${n1(PACT.mult)}× mais forte: lance o Pacto e emende um golpe perto da borda.`, 'Errar o golpe seguinte desperdiça o Pacto.'],
};

const SPELL_TIPS_EN: SpellTips = {
  closedbody: ['Activate Hold Ground before casting and keep holding S.', 'Maximum duration3.5s at level1, +0.75s per level, up to8s at level7; releasing S ends it early. Reduces damage, new knockback and new status duration by90%, without cleansing existing effects. Hold Ground remains active after expiry if S stays held.'],
  geyser: ['Aim at the ground: the jet suspends you, allies and enemies touching its area until the geyser ends.', 'Suspended units are immobile and invulnerable, unable to attack or cast. Deals no damage; beware of protecting enemies too.'],
  heal: ['Press Heal, then left-click yourself or a living ally within range. A green aura and a short choir confirm healing. Esc, S or right-click cancels.', 'Stun prevents casting. Cannot heal enemies or revive the dead; deals no damage or knockback.'],
  fireball: ['Aim a little ahead of anyone who is moving. Near the edge, one hit already sends them into the lava.', 'The Shield reflects it; Teleport and Swap escape it. Electrocute destroys the ball in the air and two balls that collide become burning ground.'],
  lightning: ['Instant: jumps without repeating targets per cast, with fixed range and 50% less damage and knockback per jump. For 2 s, applies 25% slow and Incapacitate: pauses cooldowns without blocking ready abilities. Destroys projectiles along its path.', `Obstacles block it; Shield sends the bolt back at you and ends the chain. Range per segment: ${n1(L1('lightning').range)} m at level 1. A new cast can hit the same targets again.`],
  homing: ['Good against anyone who runs and dodges: aim near the target, it chases the enemy closest to your aim.', 'The Shield reflects it and it starts chasing you; obstacles stop it. With an enemy Fireball, it becomes slow ground.'],
  shield: [`Turn it on when the projectile is about to arrive: it lasts only ${n1(L1('shield').duration)} s. It sends it back aimed at whoever cast it.`, 'Prevents damage while active and reduces new knockback impulses and newly received status durations by 40%. Existing effects are unchanged. Reflects projectiles and Electrocute; blocks Swap; Boomerang and Link bounce off.'],
  teleport: ['Get back from the lava to the rock or get out of a projectile\'s path. It is the only spell that goes off during your Scourge windup (and cancels it).', `Whoever reads the jump shoots at the landing point. Long cooldown at the start (${n1(L1('teleport').cd)} s).`],
  swap: ['Stand near the lava and swap: the enemy goes to your bad spot. Missed? You go halfway along your aim, which also works as an escape.', 'The Shield blocks Swap: nobody moves.'],
  grip: [`Mark the ground: vines erupt after ${n1(GRIP.delay)} s and root enemies in the area. The releasing hit knocks back farther (+${pct(L1('grip').scale)} at level 1).`, 'Prevents walking and movement spells; other spells remain available. Does not root allies. An active Shield reduces root duration by 40%. Stun prevents movement and all spells.'],
  meteor: [`Aim where the enemy will be in ${METEOR_DELAY.toLocaleString(LOCALE)} s, or at someone gripped or casting. Damage is greater at the center; stuns for ${n1(L1('meteor').duration)} s without knockback.`, 'You can walk out of the mark. An active Shield prevents damage and reduces stun duration.'],
  rush: [`The ${n1(RUSH.dash)} m dash lasts ${n1(RUSH.dashTime)} s and ends without automatic walking and anyone you touch takes ${RUSH.dashDmg} damage. During Rush, ${pct(RUSH.share)} of each hit becomes speed (up to the level cap).`, 'Only the damage is absorbed: knockback still applies.'],
  cluster: ['Aim ahead: sprays sand in a3m long cone,2m wide at its far end, without knockback or flying projectiles.', 'Deals20 damage (+8 per level), Incapacitate for1s (+0.25s/level) and Blindness for2s (+0.5s/level). Incapacitate pauses cooldowns but allows ready spells. Blindness restricts vision to a3m radius; resistances shorten newly applied statuses.'],
  boomerang: ['Hits on the way out and on the way back: leave the enemy between you and the point. Bounces off obstacles.', 'On the Shield it bounces and comes back without changing owner.'],
  thrust: ['Full damage comes with speed: start from afar. You stop at the first enemy you touch.', 'On the Shield you bounce off. If you miss, you brake at the end of the path.'],
  gravity: [`Throw it into the middle of a group: it pulls enemies within ${n1(GRAVITY.wizR)} m and burns anyone within ${n1(L1('gravity').radius)} m. It also pulls projectiles from any owner.`, `It is slow (${n1(L1('gravity').speed)} m/s): you can walk away.`],
  rockpillar: [`Raise it between you and a projectile: the wall (2 m, across the path) holds wizards and projectiles for ${n1(L1('rockpillar').duration)} s.`, `Spells break the wall (${OBSTACLES.rockpillar.hp} health for the whole thing), and it explodes when broken.`],
  bouncer: [`Best with enemies grouped: it jumps to the nearest wizard, losing ${pct(1 - BOUNCER.decay)} of the damage per enemy.`, 'Against a lone enemy it is just one hit.'],
  drain: ['Aim near the group: after the point, it turns to the nearest wizard. On an enemy, damage, slow and the health comes back to you; on an ally, heal and haste.', `It is slow (${n1(L1('drain').speed)} m/s) and the Shield reflects it.`],
  snowball: ['Anyone it touches is dragged along: roll toward the lava. At the end of the path it explodes.', `Very slow (${n1(L1('snowball').speed)} m/s) and short range: you can step out of the way.`],
  illusion: [`Creates a copy at your location that moves straight in your current direction for ${n1(L1('illusion').duration)} s. You can move freely while invisible until it vanishes. Casting another spell or releasing Attack ends invisibility; taking damage does not cancel it. The copy cannot be destroyed by attacks, but can be pushed.`, 'Homing missiles and bots are fooled by the copy.'],
  magnetize: ['Magnetize the enemy and fire near them: your projectiles curve toward them. On yourself or an ally, it repels enemy projectiles.', 'Only curves projectiles that pass close by (under 2 m).'],
  recharge: [`If it hits, it comes back to you and resets the cooldown: cast again, with +${RECHARGE.perHit} damage per consecutive hit.`, `A miss resets the streak and the cooldown is long (${n1(L1('recharge').cd)} s at level 1).`],
  alteration: [`Turn it on when a projectile is about to arrive: for ${n1(L1('alteration').duration)} s you swap places with the first one that enters the bubble.`, 'Useless against Electrocute, Meteor, Scourge and explosions, which are not projectiles.'],
  link: ['Pull the enemy close (and into your Meteor), or latch onto an obstacle and pull yourself to it to escape.', 'The Shield makes the Link bounce and come back.'],
  windwalk: ['Turn invisible, get close and touch: the first enemy takes damage. Also works to flee unseen.', `Casting any spell cancels it; lasts ${n1(L1('windwalk').duration)} s.`],
  splitter: ['Bursts at the point (or at the first thing it touches) into 8 projectiles in a fan: covers an area or hits someone behind an obstacle.', 'Each fragment is weak; from afar they spread out.'],
  warpzone: [`Place it between you and the projectiles: inside it enemy projectiles move at ${pct(L1('warpzone').scale)} (level 1) and enemies at ${pct(WARPZONE.wizMult)} of their speed.`, 'Does not stop Electrocute or areas.'],
  scourge: [`Someone got on top of you: it blasts around you after ${n1(CAST_POINT.scourge)} s, knocks back anyone close and destroys enemy Fireballs and Missiles. When it blasts, the knockback you are taking stops.`, 'You can leave the radius during the windup; Teleport cancels yours. The Shield does not stop it.'],
  pact: [`Your next damage spell within ${n1(L1('pact').duration)} s comes out ${n1(PACT.mult)}× stronger: cast the Pact and follow with a hit near the edge.`, 'Missing the next hit wastes the Pact.'],
};
export { SPELL_TIPS_EN, SPELL_TIPS_PT };
export const SPELL_TIPS = LANG === 'en' ? SPELL_TIPS_EN : SPELL_TIPS_PT;

// grimório: o que a demonstração do item mostra (itens sem demonstração não aparecem aqui)
type ItemDemo = Partial<Record<keyof typeof ITEMS, string>>;
const ITEM_DEMO_PT: ItemDemo = {
  aegis: 'O mago de treino tem a Égide: cai na lava com pouca vida e volta para a pedra.',
};
const ITEM_DEMO_EN: ItemDemo = {
  aegis: 'The practice wizard has the Aegis: falls into the lava with low health and returns to the rock.',
};
export { ITEM_DEMO_EN, ITEM_DEMO_PT };
export const ITEM_DEMO = LANG === 'en' ? ITEM_DEMO_EN : ITEM_DEMO_PT;

// loja e ajuda: magias agrupadas pelo efeito principal (o que cada uma faz está em RULES_SHORT)
type SpellGroups = [name: string, hint: string, spells: SpellId[]][];
// as listas moram em spells.ts (SPELL_GROUP_IDS), que o sorteio das cartas do Ascensão também usa
// Reclassificação visual na loja/consulta, sem mudar pesos do sorteio de cartas da Ascensão.
const G = { ...SPELL_GROUP_IDS, attack: SPELL_GROUP_IDS.attack.filter((s) => s !== 'meteor' && s !== 'lightning'), control: [...SPELL_GROUP_IDS.control, 'meteor' as const, 'lightning' as const] };
const SPELL_GROUPS_PT: SpellGroups = [
  ['Ataque', 'dano e empurrão', [...G.attack]],
  ['Mobilidade', 'sair do lugar', [...G.mobility]],
  ['Defesa', 'parar o que vem', [...G.defense]],
  ['Controle', 'prender, puxar, atrasar', [...G.control]],
  ['Suporte', 'cura e ajuda aos aliados', [...G.support]],
];
const SPELL_GROUPS_EN: SpellGroups = [
  ['Attack', 'damage and knockback', [...G.attack]],
  ['Mobility', 'get out of the way', [...G.mobility]],
  ['Defense', 'stop what is coming', [...G.defense]],
  ['Control', 'grip, pull, slow', [...G.control]],
  ['Support', 'healing and helping allies', [...G.support]],
];
export { SPELL_GROUPS_EN, SPELL_GROUPS_PT };
export const SPELL_GROUPS = LANG === 'en' ? SPELL_GROUPS_EN : SPELL_GROUPS_PT;
// classe de cor do grupo (Fernando, 19/10: uma cor por setor): g-ataque, g-mobilidade, g-defesa, g-controle (o rótulo em inglês cai na mesma classe)
const GROUP_CLASS_EN: Record<string, string> = { attack: 'ataque', mobility: 'mobilidade', defense: 'defesa', control: 'controle', support: 'suporte' };
export const groupClass = (name: string) => 'g-' + (GROUP_CLASS_EN[name.toLowerCase()] ?? name.toLowerCase());
export const spellClass = (s: SpellId) => groupClass(SPELL_GROUPS.find(([, , ids]) => ids.includes(s))?.[0] ?? '');
// loja: itens passivos em seções como as magias (Fernando, 21/10), pelo efeito principal
type ItemGroups = [name: string, hint: string, items: ItemId[]][];
const IG: Record<string, ItemId[]> = { life: ['ring', 'cape', 'vampire'], move: ['boots', 'shock_boots', 'wind_boots', 'lava_boots'], guard: ['armor', 'helmet', 'warden', 'cursed_ring', 'aegis', 'watch'] };
const ITEM_GROUPS_PT: ItemGroups = [['Vida', 'mais vida e cura', IG.life], ['Movimento', 'correr e pisar na lava', IG.move], ['Proteção', 'menos empurrão, dano e lentidão', IG.guard]];
const ITEM_GROUPS_EN: ItemGroups = [['Health', 'more health and healing', IG.life], ['Movement', 'run and step on lava', IG.move], ['Protection', 'less knockback, damage and slows', IG.guard]];
export const ITEM_GROUPS = LANG === 'en' ? ITEM_GROUPS_EN : ITEM_GROUPS_PT;

// para que serve, em uma linha (cartão da loja)
const SPELL_USE_PT: Record<SpellId, string> = {
  closedbody: 'Resiste a dano, empurrões e novos status enquanto mantém a base.',
  geyser: 'Sustenta unidades num jato d’água invulnerável.',
  heal: 'Cura você ou um aliado.',
  fireball: 'Ataque básico: empurra de longe.',
  lightning: 'Acerta na hora e quica sem repetir inimigo no mesmo lançamento. Alcance fixo; cada salto perde 50% do dano e empurrão. Por 2 s: lentidão de 25% e Incapacitar (pausa recargas, sem bloquear habilidades prontas). Destrói projéteis no caminho.',
  homing: 'Persegue quem foge ou desvia.',
  meteor: 'Pune grupos e quem fica parado.',
  cluster: 'Cone de areia que cega e pausa recargas.',
  boomerang: 'Acerta na ida e na volta.',
  bouncer: 'Bom com os inimigos juntos.',
  recharge: 'Repete logo se você acertar.',
  splitter: 'Enche uma área de projéteis.',
  snowball: 'Arrasta inimigos para a lava.',
  teleport: 'Fugir da lava ou de um ataque.',
  swap: 'Põe o inimigo no seu lugar ruim.',
  rush: 'Correr e aguentar dano por um tempo.',
  thrust: 'Avançar e acertar quem estiver no caminho.',
  windwalk: 'Sumir, reposicionar e surpreender.',
  shield: 'Devolve projéteis para quem lançou.',
  alteration: 'Escapa trocando de lugar com um projétil.',
  illusion: 'Você fica invisível enquanto uma cópia sua engana mísseis e bots.',
  warpzone: 'Freia projéteis e inimigos para dar tempo de desviar.',
  rockpillar: 'Barricada contra magos e projéteis.',
  grip: 'Segura o alvo para os outros acertarem.',
  gravity: 'Puxa inimigos e desvia projéteis.',
  link: 'Puxa o inimigo, ou você até um obstáculo.',
  magnetize: 'Atrai para o alvo os projéteis dos outros.',
  drain: 'Deixa lento e devolve vida a você.',
  scourge: 'Afasta quem encostar e para o seu empurrão.',
  pact: 'Dobra o próximo golpe de dano.',
};
const SPELL_USE_EN: Record<SpellId, string> = {
  closedbody: 'Resists damage, knockback and new status effects while holding ground.',
  geyser: 'Suspends units in an invulnerable water jet.',
  heal: 'Heals you or an ally.',
  fireball: 'Basic attack: knocks back from afar.',
  lightning: 'Hits instantly and jumps without repeating enemies in the same cast. Fixed range; each jump loses 50% of damage and knockback. For 2 s: 25% slow and Incapacitate (pauses cooldowns without blocking ready abilities). Destroys projectiles along its path.',
  homing: 'Chases anyone who flees or dodges.',
  meteor: 'Punishes groups and anyone standing still.',
  cluster: 'Sand cone that blinds and pauses cooldowns.',
  boomerang: 'Hits on the way out and on the way back.',
  bouncer: 'Good with enemies grouped.',
  recharge: 'Repeats soon if you hit.',
  splitter: 'Fills an area with projectiles.',
  snowball: 'Drags enemies into the lava.',
  teleport: 'Escape the lava or an attack.',
  swap: 'Puts the enemy in your bad spot.',
  rush: 'Run and shrug off damage for a while.',
  thrust: 'Dash and hit whoever is in the way.',
  windwalk: 'Vanish, reposition and surprise.',
  shield: 'Sends projectiles back at whoever cast them.',
  alteration: 'Escape by swapping places with a projectile.',
  illusion: 'You turn invisible while a copy of you fools missiles and bots.',
  warpzone: 'Slows projectiles and enemies to give you time to dodge.',
  rockpillar: 'Barricade against wizards and projectiles.',
  grip: 'Holds the target so others can hit it.',
  gravity: 'Pulls enemies and diverts projectiles.',
  link: 'Pulls the enemy, or you to an obstacle.',
  magnetize: "Draws other casters' projectiles to the target.",
  drain: 'Slows enemies and gives health back to you.',
  scourge: 'Pushes away whoever gets close and stops your knockback.',
  pact: 'Doubles your next damage hit.',
};
export { SPELL_USE_EN, SPELL_USE_PT };
export const SPELL_USE = LANG === 'en' ? SPELL_USE_EN : SPELL_USE_PT;

const RULES_SHORT_PT: Record<SpellId, string> = {
closedbody: `Só pode ser ativada com Manter base ativo. Por até ${n1(L1('closedbody').duration)} s no nível1 (+0,75s por nível, até8s no nível7), reduz o dano recebido, a força dos novos empurrões e a duração dos novos status negativos em90%. Não remove efeitos nem impulsos anteriores; combina com as resistências existentes. Ainda recebe10% do dano: não é invulnerabilidade. Soltar S encerra antes; ao expirar com S pressionado, Manter base continua. O corpo fica bem escuro. Recarga ${n1(L1('closedbody').cd)} s.`,
geyser: `Invoca no chão um gêiser por ${n1(L1('geyser').duration)} s, a até ${n1(L1('geyser').range)} m, numa área de ${n1(L1('geyser').radius)} m de raio. Atinge você, aliados e inimigos: ficam sustentados pelo jato, imóveis e invulneráveis, sem atacar ou conjurar, até o jato terminar. Quem entra depois fica suspenso apenas pelo tempo restante. Projéteis passam por baixo das unidades suspensas sem colidir com elas. Não causa dano nem empurrão. Recarga ${n1(L1('geyser').cd)} s.`,
  heal: `Selecione Curar pela tecla ou pela barra e clique com o botão esquerdo no corpo do alvo (point and click), mesmo no modo Rápido/Ao soltar. Cura instantaneamente ${n1(L1('heal').heal)} de vida em você ou um aliado a até ${n1(L1('heal').range)} m, sem ultrapassar a vida máxima. +6 de cura e −1 s de recarga por nível (20→14 s). Não cura inimigos, cópias ou mortos; clicar no chão não lança. Segue modificadores gerais de cura e alcance.`,
  fireball: 'Projétil reto. Dano e empurrão médios.',
  lightning: 'Instantâneo. Do primeiro mago na linha, quica para inimigos próximos sem repetir alvo no mesmo lançamento e sem limite fixo de saltos. Alcance fixo; cada salto conserva 50% do dano e empurrão anteriores. Por 2 s: efeito elétrico, lentidão de 25% e Incapacitar, que pausa recargas sem impedir habilidades prontas. Outro lançamento pode acertar os mesmos alvos. Destrói projéteis no trajeto.',
  homing: `Persegue por ${n1(L1('homing').duration)} s o inimigo mais perto da mira, virando devagar.`,
  shield: `Por ${n1(L1('shield').duration)} s, impede dano, devolve projéteis e Eletrocutar. Recebe ${pct(SHIELD.knock)} do novo empurrão e ${pct(SHIELD.statusDuration)} da duração dos novos status; ativar depois não altera efeitos anteriores.`,
  teleport: 'Salta até o cursor (alcance curto).',
  swap: 'Voa até o alcance e troca de lugar com o primeiro mago que tocar; sem ninguém, leva você até a metade do caminho da mira.',
  grip: `Cipós nascem na área marcada após ${n1(GRIP.delay)} s. Impede andar e magias de movimento, mas permite as outras. Dura até o prazo ou o primeiro golpe com dano de outro mago, que solta e empurra mais longe.`,
  meteor: `Cai em área no ponto marcado, ${n1(METEOR_DELAY)} s depois. Causa dano e atordoa por ${n1(L1('meteor').duration)} s, sem empurrão. Atordoamento impede caminhar e conjurar qualquer magia.`,
  rush: `Avança ${n1(RUSH.dash)} m na direção da mira e fica mais rápido; parte do dano levado vira mais velocidade.`,
  cluster: 'Cone de areia3m×2m na frente do conjurador, sem empurrão. Dano20/28/36/44/52/60/68; Incapacitar1/1,25/1,5/1,75/2/2,25/2,5s; Cegueira2/2,5/3/3,5/4/4,5/5s nos níveis1→7. Pausa recargas sem bloquear magias prontas; cegueira cria vinheta de6m de diâmetro (raio3m) só para o afetado. Resistências de status aplicam-se; não destrói projéteis. Custo e recarga anteriores preservados.',
  boomerang: 'Vai em curva até o ponto e volta para você; acerta na ida e na volta.',
  thrust: 'Você dispara até o ponto; o primeiro inimigo que tocar leva dano conforme a sua velocidade.',
  gravity: 'Orbe lento que puxa magos inimigos e projéteis e queima quem fica perto.',
  rockpillar: `Ergue uma barricada baixa (2 m) atravessada no caminho por ${n1(L1('rockpillar').duration)} s: bloqueia magos e projéteis.`,
  bouncer: `Acerta e pula para o mago mais perto, perdendo ${pct(1 - BOUNCER.decay)} do dano a cada inimigo.`,
  drain: 'Vai até o ponto e vira para o mago mais perto: no inimigo, dano, lentidão e a vida volta para você; no aliado, cura e acelera.',
  snowball: 'Bola lenta que atravessa e arrasta quem encosta, com dano, e explode no fim do caminho.',
  illusion: `Uma cópia nasce no seu lugar e segue reto na direção do seu movimento por ${n1(L1('illusion').duration)} s; você pode se mover livremente, invisível, até ela sumir. Lançar outra magia ou liberar Atacar encerra a invisibilidade; receber dano não a cancela. A cópia não é destruída, mas pode ser empurrada. O Míssil teleguiado e os bots miram nela. Recarga ${n1(L1('illusion').cd)} s.`,
  magnetize: 'No inimigo, puxa para ele os projéteis dos outros; num aliado ou em você (depois de quicar), afasta.',
  recharge: 'Se acertar, volta e zera a própria recarga; cada acerto seguido soma dano.',
  alteration: `Por ${n1(L1('alteration').duration)} s, troca de lugar com o primeiro projétil inimigo que chegar perto.`,
  link: 'Prende num mago e o puxa até você (com dano no inimigo); num obstáculo, puxa você até ele.',
  windwalk: `Invisível e mais rápido por ${n1(L1('windwalk').duration)} s; o primeiro inimigo em que encostar leva dano. Lançar magia desfaz.`,
  splitter: 'Estoura no ponto (ou no primeiro que tocar) em 8 projéteis que se abrem em leque.',
  warpzone: 'Esfera que deixa lentos os projéteis inimigos que passam por ela e os inimigos que andam dentro dela.',
  scourge: `Explode em volta depois de ${n1(CAST_POINT.scourge)} s: empurra quem está perto e destrói projéteis inimigos; ao explodir, acaba o empurrão que você está sofrendo.`,
  pact: `A próxima magia de dano em ${n1(L1('pact').duration)} s faz ${n1(PACT.mult)}× de dano e empurrão.`,
};
const RULES_SHORT_EN: Record<SpellId, string> = {
  closedbody: `Requires active Hold Ground. For up to ${n1(L1('closedbody').duration)} s at level1 (+0.75s per level, up to8s at level7), reduces incoming damage, new knockback force and newly received negative status durations by90%. Does not remove existing effects or impulses; stacks with existing resistances. Still takes10% damage: not invulnerability. Releasing S ends it early; Hold Ground remains active after expiry while S stays held. Darkens the body. Cooldown ${n1(L1('closedbody').cd)} s.`,
  geyser: `Summons a ground geyser for ${n1(L1('geyser').duration)} s within ${n1(L1('geyser').range)} m, covering a ${n1(L1('geyser').radius)} m radius. Hits yourself, allies and enemies: the jet suspends them, immobile and invulnerable, unable to attack or cast until it ends. Units entering later are suspended only for the remaining time. Projectiles pass beneath suspended units without colliding with them. Deals no damage or knockback. Cooldown ${n1(L1('geyser').cd)} s.`,
  heal: `Select Heal using its key or the spell bar, then left-click the target's body (point and click), even in Quick/On release mode. Instantly restores ${n1(L1('heal').heal)} health to yourself or an ally within ${n1(L1('heal').range)} m, up to their maximum health. +6 healing and −1 s cooldown per level (20→14 s). Cannot heal enemies, copies or dead units; clicking the ground does not cast. Uses general healing and range modifiers.`,
  fireball: 'Straight projectile. Medium damage and knockback.',
  lightning: 'Instant. From the first wizard in line, jumps to nearby enemies without repeating targets in the same cast or a fixed jump limit. Fixed range; each jump keeps 50% of the previous damage and knockback. For 2 s: electrical effect, 25% slow and Incapacitate, which pauses cooldowns without blocking ready abilities. A new cast can hit the same targets. Destroys projectiles along its path.',
  homing: `Chases the enemy closest to your aim for ${n1(L1('homing').duration)} s, turning slowly.`,
  shield: `For ${n1(L1('shield').duration)} s, prevents damage and reflects projectiles and Electrocute. Receives ${pct(SHIELD.knock)} of new knockback and ${pct(SHIELD.statusDuration)} of new status duration; activating later does not change existing effects.`,
  teleport: 'Jumps to the cursor (short range).',
  swap: 'Flies to its range and swaps places with the first wizard it touches; with no one, takes you halfway along your aim.',
  grip: `Vines erupt in the marked area after ${n1(GRIP.delay)} s. Prevents walking and movement spells, but allows other spells. Lasts until the timer or the first damaging hit from another wizard, which releases and knocks back farther.`,
  meteor: `Falls over an area at the marked point, ${n1(METEOR_DELAY)} s later. Deals damage and stuns for ${n1(L1('meteor').duration)} s, without knockback. Stun prevents walking and casting any spell.`,
  rush: `Dashes ${n1(RUSH.dash)} m toward your aim and makes you faster; part of the damage you take becomes more speed.`,
  cluster: 'Sand cone3m×2m ahead of the caster, without knockback. Damage20/28/36/44/52/60/68; Incapacitate1/1.25/1.5/1.75/2/2.25/2.5s; Blindness2/2.5/3/3.5/4/4.5/5s at levels1→7. Pauses cooldowns without blocking ready spells; blindness creates a6m diameter vignette (3m radius) only for the recipient. Status resistances apply; does not destroy projectiles. Previous cost and cooldowns preserved.',
  boomerang: 'Curves to the point and comes back to you; hits on the way out and on the way back.',
  thrust: 'You dash to the point; the first enemy you touch takes damage based on your speed.',
  gravity: 'Slow orb that pulls enemy wizards and projectiles and burns anyone close.',
  rockpillar: `Raises a low barricade (2 m) across the path for ${n1(L1('rockpillar').duration)} s: blocks wizards and projectiles.`,
  bouncer: `Hits and jumps to the nearest wizard, losing ${pct(1 - BOUNCER.decay)} of the damage per enemy.`,
  drain: 'Goes to the point and turns to the nearest wizard: on an enemy, damage, slow and the health comes back to you; on an ally, heal and haste.',
  snowball: 'Slow ball that passes through and drags anyone it touches, with damage, and explodes at the end of the path.',
  illusion: `A copy starts at your location and moves straight in your current direction for ${n1(L1('illusion').duration)} s; you can move freely while invisible until it vanishes. Casting another spell or releasing Attack ends invisibility; taking damage does not cancel it. The copy cannot be destroyed, but can be pushed. The Homing Missile and bots aim at it. Cooldown ${n1(L1('illusion').cd)} s.`,
  magnetize: "On an enemy, pulls other casters' projectiles toward them; on an ally or on you (after a bounce), repels them.",
  recharge: 'If it hits, it comes back and resets its own cooldown; each consecutive hit adds damage.',
  alteration: `For ${n1(L1('alteration').duration)} s, swaps places with the first enemy projectile that comes close.`,
  link: 'Latches onto a wizard and pulls them to you (damaging the enemy); on an obstacle, pulls you to it.',
  windwalk: `Invisible and faster for ${n1(L1('windwalk').duration)} s; the first enemy you touch takes damage. Casting a spell cancels it.`,
  splitter: 'Bursts at the point (or at the first thing it touches) into 8 projectiles that fan out.',
  warpzone: 'Sphere that slows enemy projectiles passing through it and enemies walking inside it.',
  scourge: `Blasts around you after ${n1(CAST_POINT.scourge)} s: knocks back anyone close and destroys enemy projectiles; when it blasts, the knockback you are taking stops.`,
  pact: `Your next damage spell within ${n1(L1('pact').duration)} s deals ${n1(PACT.mult)}× damage and knockback.`,
};
export { RULES_SHORT_EN, RULES_SHORT_PT };
export const RULES_SHORT = LANG === 'en' ? RULES_SHORT_EN : RULES_SHORT_PT;
