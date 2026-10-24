# Assets do Warlock Wars

Índice de tudo o que existe de arte, som e fonte no projeto, para pessoas e IAs saberem o que já tem antes de procurar ou criar algo novo. **Todo asset novo entra aqui** (regra no fim da página).

- O que está em `public/` vai para o jogo no ar a cada deploy; o que está em `assets/` é biblioteca para quem contribui e **não** vai para o ar.
- Crédito e licença de cada arquivo publicado: [`public/CREDITS.txt`](../public/CREDITS.txt).

## Identidade visual

- **Tema:** fantasia sombria de pedra escura, lava e ouro. As cores estão todas nas variáveis do `:root` em [`src/client/style.css`](../src/client/style.css): fundo `--bg #140806`, painéis `--panel`/`--panel2`, lava `--lava #ff6a1a`, brasa `--ember #ffb347`, ouro `--gold #ffd666`, texto `--fg #f7ecdf`. Cor solta no código não entra (regra do `CLAUDE.md`).
- **Cor por grupo de magia:** Ataque `#ff6b4a`, Mobilidade `#8be36a`, Defesa `#5fb0ff`, Controle `#c58bff`, Itens prateado `--item #c9d4e0`.
- **Painéis:** metal envelhecido com borda dourada fina e rebites nos cantos (`--plate`, `--plate-edge`, `--frame`).
- **Fontes** (Google Fonts, carregadas no `index.html`): títulos em **Grenze** (`--display`), texto em **Alegreya Sans**. O W da logo usa a Grenze Gotisch, só desenhada no SVG.
- **3D:** low-poly do **KayKit** (cores chapadas com uma textura de paleta pequena), vista de cima como no Dota. Modelo novo deve ser KayKit ou do mesmo estilo; os packs `legado-*` são de uma fase mais antiga do KayKit e destoam um pouco.
- **Ícones:** silhuetas do game-icons.net numa cor só (`currentColor`), tingidas pela cor do grupo.
- **Partículas:** sprites brancos do Kenney, tingidos no código.
- **Som:** efeitos curtos em MP3 mono e uma música orquestral épica em laço.

## No jogo (`public/`)

| Arquivo | O que é | Onde é usado | Origem e licença |
|---|---|---|---|
| `models/mage.glb`, `knight`, `barbarian`, `rogue`, `rogue_hooded`, `skeleton_mage`, `skeleton_minion`, `skeleton_rogue`, `skeleton_warrior` | os 9 bonecos (1 MB cada), com 21 animações | `src/client/scene.ts` (`/models/${id}.glb`), lista em `src/shared/characters.ts` | KayKit Adventurers e Skeletons, CC0; cortados por `scripts/slim-character.mjs`, capuz por `scripts/assets/hood.mjs` |
| `models/KAYKIT-LICENSE.txt`, `KAYKIT-SKELETONS-LICENSE.txt` | licenças dos bonecos | — | KayKit, CC0 |
| `desktop/icon.png` (fora de `public/`) | ícone do app e do instalador para Windows | `desktop/package.json` (`build.win.icon`; o electron-builder converte para o ícone do `.exe`) | gerado do `public/warlock-wars.svg` (o W da aba) em 512×512, recortado em círculo transparente; arte do projeto |
| `models/decor.glb` | decoração da arena num GLB só (caveiras, ossos, árvores mortas, tochas, colunas, velas) | `src/client/decor.ts` | KayKit Halloween e Dungeon, CC0; junto por `scripts/assets/merge-decor.mjs` |
| `models/barrier_half.glb` | parede do Pilar de pedra | `src/client/scene.ts` (`loadFile('barrier_half')`) | KayKit Dungeon Remastered, CC0 |
| `models/hex/rock_single_A..E.gltf` (+ `.bin`, `hexagons_medieval.png`) | pedras na beira das ilhas de refúgio | `src/client/scene.ts` | KayKit Medieval Hexagon, CC0 |
| `chars/*.webp` | retrato de cada boneco (rosto) | `src/client/ui.ts`, `src/client/avatar.ts` | renderizados dos próprios bonecos por `scripts/portraits.mjs` |
| `tex/stone.jpg`, `tex/stone_nor.jpg` | pedra da arena (cor e relevo) | `src/client/scene.ts` | Poly Haven slate_floor_02, CC0 |
| `tex/lava_emit.jpg` | brilho da lava | `src/client/scene.ts` | ambientCG Lava001, CC0 |
| `tex/lava005.jpg` | beira derretida das ilhas | `src/client/scene.ts` | ambientCG Lava005, CC0 |
| `fx/*.png` (23) | partículas: fogo, chamas, fumaça, faíscas, brilho, círculo, marca de queimado, rastro, redemoinho, estrela, vapor | `src/client/scene.ts` (`/fx/${name}.png`) | Kenney Particle Pack e Smoke Particles, CC0 |
| `sfx/*.mp3` (10) | efeitos: bola de fogo, explosão, golpe, míssil, raio, escudo, teleporte, laço da lava, clique, confirmar | `src/client/sound.ts` (`/sfx/${name}.mp3`) | Kenney, OpenGameArt e Freesound, CC0 (detalhe no CREDITS) |
| `sfx/brace_start.mp3` | aviso único do Manter base, depois dos 0,5 s de preparo; toca inteiro, na velocidade original | `src/client/sound.ts` (`brace`), disparado em `src/client/main.ts` | gravação enviada por Leonard, declarada CC0 por ele; origem a confirmar no PR #293 (detalhe no CREDITS) |
| `sfx/taunt/*.mp3` (10) | vozes das provocações | `src/shared/taunts.ts`, `src/client/sound.ts` | Kenney Voiceover, OpenGameArt, CC0; "Ultra kill" é voz sintética feita para o jogo |
| `taunts-local/*.mp4` (5) | provocações gravadas pelo Leonard: Tá pegando fogo!, Bosta city!, Foi uma delícia..., Usaram e abusaram., Lanchado | `src/shared/taunts.ts`, `src/client/sound.ts`, `src/client/scene.ts` | gravadas no celular pelo Leonard (lboesmans), que autorizou uso e redistribuição no jogo; sem licença livre, aceito pelo Fernando em 21/10/2026 (PR #243) |
| `music/battle.mp3` | música da partida (laço) | `src/client/sound.ts` | Emma_MA "Determined Pursuit", CC0 |
| `icons.svg` | sprite com todos os ícones (magias, itens, runas, efeitos, interface) | `src/client/icons.ts`, `src/client/scene.ts`, `src/client/style.css` | game-icons.net, **CC BY 3.0 (crédito obrigatório)**; montado por `scripts/assets/build-icons.mjs` |
| `warlock-wars.svg`, `favicon.ico`, `apple-touch-icon.png` | logo W e ícone da aba | `index.html`, `src/client/ui.ts`, `src/client/style.css` | arte própria, por `scripts/assets/favicon.py` (fonte Grenze Gotisch, OFL 1.1) |
| `og.jpg` | imagem do cartão de compartilhamento (1200×630) | `index.html` | origem não registrada no `CREDITS.txt` (entrou no commit 96028ee) |
| `home-cat.jpg` | foto do gato na Início | `src/client/ui.ts`, `src/client/style.css` | do Leonard, **sem licença livre** (só no jogo, por autorização do Fernando) |
| `wrench.svg` | chave da barra do menu | `src/client/ui.ts` | desenho próprio |

## Biblioteca (`assets/`, fora do jogo)

- [`assets/kaykit/`](../assets/kaykit/README.md): todos os packs grátis do KayKit (23 pastas, 2307 modelos, ~115 MB, CC0): personagens, armas, masmorra, cemitério, floresta, hexágonos medievais, cidade, base espacial, móveis, restaurante, tabuleiro, plataforma, blocos, recursos, ferramentas, Natal e animações extras do mesmo esqueleto dos bonecos.
  - O que cada pack é, origem e licença: [`assets/kaykit/README.md`](../assets/kaykit/README.md).
  - Nome de cada modelo, pasta por pasta: [`assets/kaykit/INDICE.md`](../assets/kaykit/INDICE.md). Procure ali antes de pedir um modelo novo (ex.: `torch`, `barrel`, `skull`, `tree`).
- [`assets/sons-rpg/`](../assets/sons-rpg/README.md): 532 efeitos sonoros de RPG em `.wav` (~31 MB): magias por grupo (Human, Orc, NightElf, Undead, Demon, Other, Items), projéteis de armas e golpes de combate. Para quem trabalha nos efeitos sonoros (#202, #203, #205).
  - **Origem e licença não informadas:** o pacote veio sem autor nem licença e entrou por decisão do Fernando em 21/10/2026. Nenhum som daqui vai para `public/` sem antes achar a origem e uma licença livre. Detalhe e dúvida registrada: [`assets/sons-rpg/README.md`](../assets/sons-rpg/README.md).
  - Nome de cada arquivo, por categoria: [`assets/sons-rpg/INDICE.md`](../assets/sons-rpg/INDICE.md) (ex.: `FlameStrike`, `FireBallMissile`, `MetalHeavySlice`).
- Para levar um modelo ao jogo: copie para `public/models/`, corte o que não usa, ponha o crédito no `public/CREDITS.txt` e uma linha na tabela "No jogo" acima.

## Regra: todo asset novo é indexado, explicado e referenciado

Decisão do Fernando em 21/10. Vale para quem contribui e para toda IA.

1. **Indexado:** o arquivo ganha uma linha nesta página, na tabela "No jogo" se estiver em `public/` ou na seção "Biblioteca" se estiver em `assets/`. Pack novo em `assets/kaykit/` também entra no `README.md` dela, e o `INDICE.md` é refeito com `node scripts/assets/kaykit-index.mjs`.
2. **Explicado:** a linha diz o que é e para que serve no jogo.
3. **Referenciado:** a linha diz onde o código usa o arquivo (`arquivo.ts`) e de onde ele veio, com a licença; o crédito vai em `public/CREDITS.txt`.
4. Asset que sai do jogo sai daqui também. Tudo no mesmo PR do asset.
