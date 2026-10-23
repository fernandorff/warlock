# src/client — navegador (Three.js + interface em DOM)

Vale junto com o `CLAUDE.md` da raiz.

## Interface

- **DOM sempre com `el(tag, props, ...filhos)`** de `icons.ts` (`on*` vira listener, `class` vira `className`, filho `null`/`false` some). Não crie outro helper de DOM. Ícones: `icon(id)` com `ICON`, `ITEM_ICON`, `UI_ICON`.
- Reuse `choice(...)` (fileira de botões com `aria-pressed`), `tabs(...)` (`role=tab`) e `withTip(elemento, () => html)` (dica no hover e no foco).
- **Botão só de ícone (✕, ⋯, ‹ ›, engrenagem) só com `iconButton(filho, nome, onclick, props?)`** (`icons.ts`): o nome vira `title` e `aria-label`; `props` sobrescreve (`class: 'icon wide-only'`, `title` com a tecla, `aria-expanded`, `hidden`). Visual diferente do ✕ só pela classe: `kick` (pequeno e vermelho) e `info-close` (canto do ⓘ).
- **Diálogo por cima da tela só com `dialog(cls, título, corpo, { ico, onKey, onClose })`** (`ui.ts`, issue #110): fundo `<cls>-overlay` (camada e celular no CSS), cabeçalho `.dialog-head` com título e ✕; ✕, clique fora, Esc e o B do controle fecham. Segura todas as teclas na captura (nada chega ao jogo); `onKey` vê cada tecla antes e, com `preventDefault`, o Esc não fecha. Devolve `{ overlay, close }`; foco inicial no ✕ (quem chama pode mudar). Padronização da interface com funções no DOM puro, uma por PR (decisão de 20/10, issue #91).
- **Busca pelo nome só com `searchFilter(grupos, seletor do item, texto, off?)`** (`ui.ts`): esconde os itens cujo `data-name` (gravado com `norm`) não tem o texto e os grupos vazios; `off` esconde grupos inteiros (filtro). Usada na Biblioteca (a loja ficou sem busca, pedido do Fernando de 21/10).
- **Arrastar para trocar de vaga só com `draggableSlot(nó, índice, ocupada)`** (`ui.ts`): até 6 px conta como clique; passou disso, um `.drag-ghost` com o ícone da vaga segue o mouse e a vaga embaixo dele ganha `.drop-target`; ao soltar, `moveLoadout` troca as posições. Usada na barra de baixo, a única que troca a ordem das magias: no PC ela fica à vista também na loja (`SHOP_BAR`, o mesmo corte do `.compact-shop`), e a loja termina acima dela (`--bar-space`); outra lista que se reordena por arraste reusa as duas classes em vez de criar outro visual (PR #197).
- **Preferência do jogador só por `store`** (`store.ts`): `store.get`/`set`/`json` já têm try/catch e caem para memória. Nunca `localStorage` direto. Chaves com prefixo `warlock:`.
- **Menus enxutos** (decisão do Fernando): antes de pôr opção nova numa tela, pergunte se ela precisa existir.
- **Logo do jogo em imagem:** `public/warlock-wars.svg` (o W com moldura dourada da foto do grupo, vetorial, sem depender da fonte) → `el('img', { src: '/warlock-wars.svg', alt: 'Warlock Wars' })` ou `<img src="/warlock-wars.svg">`. Também é o ícone da aba. Gerado por `scripts/assets/favicon.py` (com `favicon.ico` e `apple-touch-icon.png`); não edite à mão.
- Aba nova do menu inicial: tupla em `HOME_TABS` + chave em `HomeTab` + painel em `panels` com `panel(...)`. Conteúdo pesado carrega sob demanda (`void import('./grimoire.ts')`).
- **Roda de provocações** (`radialPicker`, `radial-picker.ts`, PRs #239/#238/#240): botões em volta de um centro que cancela, feitos com `el`/`iconButton`; mouse, setas, números e analógico escolhem pelo mesmo índice (`radialIndex`). A matemática e a tecla segurada (`radialHold`) ficam em `taunt-wheel.ts`, sem DOM, com teste. Mostra todas as falas de `TAUNTS` (15 hoje): fala nova entra sozinha na roda. A ordem é preferência de apresentação (`warlock:taunt-wheel`, permutação das falas em `tauntWheelSlots`/`assignTauntSlot`, editada em Configurações → Comunicação): a roda relê a ordem ao abrir e o servidor sempre recebe o índice do catálogo. `{ inline: true, hint }` embute a mesma roda nas Configurações (sem abrir sobre a partida e sem escolher só por foco); `setLabels` troca os rótulos.

## Idioma

- Auditoria de guias: fichas preservam centésimos e `knockDistance` usa amortecimento/soft-cap/corte de `moveWizard`, sem amplificação por dano histórico. Roteiros demonstram bloqueios de stun/Agarrar, Escudo contra área/reflexão, colisões da Rajada e trajetórias da Ilusão. `demoStatus` lê estados reais. Canvas instrumentado não substitui inspeção visual no navegador.

- Todo texto visível com `t('português', 'English')` (`i18n.ts`). Nomes por `spellName`, `itemName`, `arenaName`; textos de item por `itemText`; números com `LOCALE` (helpers `n1`/`pct`).
- O idioma é lido uma vez ao carregar (`setLang` grava e recarrega), então listas de texto podem ficar em constantes de módulo.
- Textos longos de regras ficam em pares `_PT`/`_EN` em `rules-text.ts`. Erros do servidor chegam em português e são traduzidos por `SERVER_EN` (`main.ts`).

## CSS (`style.css`, arquivo único)

- Cores e medidas pelas variáveis de `:root` (`--lava`, `--gold`, `--bronze`, `--panel`, `--fg`, `--r-md`…). Nada de hex solto, exceto a cor de grupo.
- Cor de grupo: `.g-ataque`, `.g-mobilidade`, `.g-defesa`, `.g-controle` (variável `--g`); itens prateados (`--item`). A classe vem de `spellClass(s)` pela posição em `SPELL_GROUPS`: magia nova ganha cor entrando num grupo, sem classe nova. Na loja, os itens passivos ficam em seções por `ITEM_GROUPS` (`rules-text.ts`, mesmo formato, todos prateados): item passivo novo entra num grupo, senão some da loja (teste em `ui-data.test.ts`).
- Celular (fora de foco desde 20/10: não conferir a cada mudança, só não apagar estas regras): `(max-width: 600px)`, `(max-height: 500px)` (deitado), `(pointer: coarse)` com alvos de 44 px, `(max-width: 860px)` / `(min-width: 861px)`. Hover só dentro de `(hover: hover)`. Animação nova com `(prefers-reduced-motion: reduce)`. Em JS, `TOUCH` (`ui.ts`).

## Teclas (`keys.ts`)

Provocações no controle: ← por padrão, remapeável; se uma preferência antiga já ocupa ←, escolhe botão livre sem sobrescrever. O roteamento em `gamepad.ts` abre a roda (o botão da interface), o analógico aponta pela `radialIndex`, o direcional anda ±1 por toque (com as 15 falas, 8 direções não chegariam a todas), A/✕ confirma, B/○ ou Start cancela. Enquanto aberta não envia movimento nem magia; reutiliza o botão e o envio da interface atual.

`DEFAULTS` usa `event.code` (`'KeyQ'`, `'Digit1'`, `'F1'`), nunca `event.key`. Ação de interface nova entra em `UI_ACTIONS` e `UI_NAMES` (`''` = sem tecla). Esc, Enter, Espaço e ← → são reservadas. As 26 letras já têm dono.

Teclas por posição (padrão): as magias usam a tecla da **posição** na barra (`POS_ACTIONS`: Magia 1 a 8 em 1 2 3 4 Q W E R, guardadas em `warlock:poskeys8`; sem itens ativos desde 21/10, #217); `keyOf`/`actionFor`/`whoUses` já resolvem o modo. A ordem das posições vem de `loadoutSlots`/`moveLoadout` (`screen-data.ts`, guardada em `warlock:loadout-order`) e chega às teclas e ao controle por `setSlots`; vaga vazia é `null`. Posições e atalhos da interface nunca repetem tecla (`setKey` troca). Trocar qualquer tecla fixa o modo em uso no navegador.

## Configurações (`settings.ts`)

Uma página só, de seções empilhadas com sumário (`stackedPage`), usada na aba Configurações do menu inicial (`settingsPage`) e no diálogo da partida (`openSettings`). Seção nova = item em `SECTIONS`; o `render` devolve `null` quando a tela não oferece aquilo (efeitos visuais só existem na sala, via `setSettingsCtx`). O som vale em toda tela: `volumes`/`setVolume` são obrigatórios no `SettingsCtx` e vêm do `createSound` (`sound.ts`), que guarda o volume no navegador, o mesmo no menu inicial e na sala (issue #128). No menu inicial, Esc e Start abrem a aba em vez do diálogo: duas cópias da página repetiriam os ids dos campos. `draw()` refaz a página inteira a cada mudança e devolve o foco pelo id, então campo novo leva `id` fixo. A prévia do Personagem é uma só (`avatarPanel`, um contexto WebGL): no menu inicial a seção vira atalho para a aba Personagem.

## Cena (`scene.ts`)

- `cloneAppearance` mantém cores/texturas da montagem do Guarda-roupas na partida; cor da vaga fica no anel/barra/nome, sem tingir roupa. Clona materiais/esqueleto, compartilha geometrias/texturas. Ao trocar a prévia, descarte só seus materiais próprios.

- Números de dano não aparecem sobre alvos ocultos ao observador. O impacto público da magia permanece. `main.ts` passa os alvos ocultos pelo snapshot do evento/replay e pela opção de visão da Sandbox, sem depender da pose interpolada anterior.

- **Pixel art** (`setPixel`, issue #79): troca o `RenderPass` pelo `RenderPixelatedPass` (blocos de `pixelSize` px: 2 ou 3, 0 desliga). Nesse modo a câmera fica mais longe com ângulo menor (`camK`) e é presa à grade; a sobra desliza o canvas e os nomes (`pixelShift`). Quem mexer no posicionamento da câmera mantém os dois, senão o chão volta a tremer. Só existe no PC (precisa do `EffectComposer`, que o celular não cria); a escolha fica em `warlock:pixel` (`savedPixel`).

## O que não vai para `ui.ts`

`ui.ts` usa `document`/`matchMedia` ao carregar e não roda no Vitest. Decisão de tela que precisa de teste vai para função pura em `screen-data.ts` (ou `rules-text.ts`, `tips.ts`, `icons.ts`, `keys.ts`, `sheet.ts`, `reach.ts`, que não mexem no DOM ao carregar).
