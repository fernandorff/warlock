# src/shared — regras do jogo (rodam no servidor e no navegador)

Vale junto com o `CLAUDE.md` da raiz.

## Simulação

- Corpo fechado em Defesa: exige Manter base ativo, termina ao soltar S ou no limite3,5+0,75s/nível. Reduz dano, novas durações negativas e novos impulsos em90%; nunca imunidade nem limpeza retroativa. Expirar mantendo S preserva Manter base.

- Gêiser: alvo no chão até10m, área25% menor (raio1,5×√0,75), dura2,5s e suspende qualquer unidade viva atingida; invulnerável, imóvel e sem ações. Projéteis passam sob corpos suspensos, sem exceção entre magias.

- Curar/Heal: Suporte, alvo próprio/aliado vivo com time não nulo;45+6/nível de cura, alcance10m, CD20−1s/nível, usa teto/modificadores gerais. Alvo inválido não gasta CD/cancela/revela. Conjuração instantânea, custo12/up6→11 conforme teste local aceito pelo solicitante.

- IA sob véu da Ilusão: ready/free recusam qualquer conjuração até veilUntil; movimento permanece permitido. Humanos conservam a regra de se revelar ao usar outra magia. Isso não declara resolvido risco residual Ilusão×Flagelo ao reviver.

- Nomes dos bots: catálogo de sete nomes escolhido pelo usuário, mesma ordem na sala e na partida; não muda IA nem balanceamento.

- **Sorteio só pelo `rand: () => number` recebido.** Assinatura pública tem `rand = Math.random` como padrão (`newWorld`, `stepWorld`, `tickMatch`); funções internas repassam o `rand`. Nunca `Math.random` solto. Mudar a ordem dos sorteios muda o hash de `tests/style.test.ts`.
- **O `World` é mutado no lugar** (`stepWorld` zera `w.events` e escreve em `wz.hp`, `wz.cd`, `w.projectiles`). Não clone. O bot é a exceção: `botCmds` só lê o mundo e devolve `Cmd[]`.
- Fase, ouro e compras moram em `Match` (`match.ts`). O `World` não é gravado no disco (a sala grava `world: null`).
- **Unidades:** distância em metros, tempo em segundos, vida na escala 1000. Números do Warlock original entram multiplicados por `UNIT` (`speed: 1000 * UNIT`). `DT = 1/60`. Recarga guardada como instante (`w.t + cd`). Milissegundos (`*_MS`, `Date.now()`) só na camada de partida e do servidor.
- **Eventos:** `w.events.push({ k: '...', ... })` durante o passo; tipo novo entra na união `SimEvent` e o cliente consome em `main.ts`. Ids secretos viram públicos em `publicEvents` (`snapshot.ts`).

## Números de magia e item (`spells.ts`, `items.ts`, `constants.ts`)

- Proposta Meteoro em revisão: preserva dano/área e substitui empurrão por duration=1,25s em todos os níveis. Usa o bloqueio geral de stun e resistências do alvo; não aciona recuperação pós-knockback sem impulso. Medição/decisão do dono pendente antes de integrar.

- 7 níveis por `L({...})`; séries irregulares com `zip([...], [...])`, lineares com `steps(de, passo)`.
- Ajuste de balanceamento fica **inline sobre o número original**, com comentário de data e medição: `cd: cd * 0.7 /* 18/10: … (0,86 → 0,97) */`.
- Constante extra de mecânica vira objeto `NOME = { … * UNIT }` abaixo da tabela, com o arquivo `.lua` de origem no comentário. Nada de número mágico solto em `sim.ts`.
- Número só muda com medição do simulador (ver raiz).

## Magia nova: onde mexer

`spells.ts` (`SPELL_IDS`, `SPELLS` com `name`/`en`, `CAST_POINT`) · `sim.ts` (`PROJ_KINDS` **no fim da lista**, ramo em `cast()` e comportamento do projétil) · `snapshot.ts` (só se precisar de estado novo, como bit em `bits`) · `bots.ts` (grupo `DAMAGE`/`ESCAPE`/`CONTROL` e uso específico) · `match.ts` (`DEFENSE` se for defesa) · cliente: `icons.ts`, `keys.ts`, `main.ts` (`SPELL_SOUND`), `rules-text.ts` (grupo, uso, regras, dicas nas duas línguas), `tips.ts` (`SPELL_ROWS`), `demo.ts` (`SCRIPTS`), `scene.ts` (`LOOK` se for projétil). Os testes `ui-data`, `grimoire-demo`, `i18n` e `new-spells` acusam o que faltar.

## Protocolo (`protocol.ts`)

Mensagem nova do cliente: variante em `ClientMsg` → `case` em `parseClientMessage` que devolve `null` em qualquer dúvida, usando `isObj`, `coord`, `seq`, `pubId`, `isSpell` → devolver o objeto **reconstruído** com campos conhecidos, nunca o cru → objeto de entrada só com chaves permitidas (veja `parseOpts`, `parseSandbox`) → respeitar `MAX_MSG` → ramo em `room-do.ts` e teste em `tests/protocol.test.ts`.

## Snapshot (`snapshot.ts`)

- Ilusão recebe forças pelo mesmo moveWizard do corpo real; copy.walk e pushVel separados. Gravidade usa puxão de corpo, Magnetizar não vira a caminhada, Bola de neve usa arraste no contato e explosão só ao explodir. Movimenta cópias antes dos impactos para não ganhar passo extra pela ordem da lista. Não mata nem oculta a cópia ao receber dano.

- Proposta Escudo: impede dano e recebe60%dos novos impulsos e durações de stun/root/slow. `statusDuration` decide no instante do impacto; ativar depois não recalcula efeitos prévios. Proteção geral, não exceção entre duas magias. Sem mudança do Meteoro nesta PR.

- Recuperação pós-knockback (`kr`) só começa quando impulso físico cruza STUN_SPEED: zera residual e retoma50→100% em1s, +10pp/0,2s. Terminar um stun sem impulso não aciona recuperação; teste dedicado cobre essa separação. Cliente relê kr só por snapshot novo, nunca por quadro.

- Proposta em revisão: `stunLeft` é relógio de bloqueio de ações separado da velocidade física (`st` no snapshot, -1 usa regra antiga). `castBlocked` bloqueia tudo sob stun e só magias de Mobilidade sob Agarrar. Não modifica Meteoro, Escudo nem regra de recuperação de velocidade nesta etapa.

- Dano histórico não amplifica knockback (`KNOCK_HP_SCALE=0`); continua registrado para estatísticas. `WALKING_BIT` só marca destino voluntário válido; deslocamento físico/reconciliação não anima caminhada. Botão direito não fica preso após blur/pointercancel.

Listas achatadas de números (layout no comentário de `protocol.ts`), valores com `r2`, campos opcionais só quando há conteúdo, estado novo por mago como bit documentado em `bits`. Inserir no meio de `PROJ_KINDS` quebra cliente aberto.

## Aparência (`characters.ts`)

O código da aparência guarda a **posição** de cada opção (7 dígitos, um por peça), e ele fica salvo no navegador e nas salas. Opção nova entra **no fim** da lista da peça; opção que sai fica no lugar e vira aposentada (`isRetired`): `decodeLook` troca por outra (a Ladina encapuzada vira Ladina + Capuz, issue #107), o criador e o sorteio pulam. Toda entrada de código passa por `fixLook` (navegador em `savedLook`, mensagem em `parseClientMessage`, sala gravada em `resume`).
