# Motor compartilhado × Coup nativo

Mapa de reaproveitamento do código deste repositório para **Sem Perdão** e para os próximos jogos da
equipe. A pergunta que este documento responde é sempre a mesma: _se amanhã eu abrir um repositório
novo para outro jogo de mesa, o que eu levo junto e o que fica?_

Mantenha o mapa vivo: toda vez que um módulo mudar de lado (ou nascer), atualize a tabela no mesmo
commit da mudança.

## Os três níveis

| Nível                | Significado                                                                                         | Onde mora hoje                                                      |
| -------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| **Motor**            | Não conhece papéis, ações, moedas nem fases de Coup. Copiável para outro jogo sem editar.           | `packages/tabletop-stage/` e boa parte de `src/lib/` e `src/rooms/` |
| **Motor com amarra** | O mecanismo é genérico, o catálogo/vocabulário é de Coup. Reaproveita-se separando dado de máquina. | `src/lib/tabletop/` e `src/lib/*` de áudio                          |
| **Coup nativo**      | Regras, papéis, arte e narrativa. Não sai daqui.                                                    | `src/game/`, `src/ui/game-views.js`, `coup-*.js`                    |

### Teste prático

> Se o identificador cita `Duque`, `Assassina`, `Capitão`, `Embaixadora`, `Condessa`, `influência`,
> `blefe`, `desafio` ou `moeda`, **não é motor**. Se o mesmo arquivo mistura os dois, a máquina é
> motor e a lista é catálogo — separe-os antes de reaproveitar.

## Mapa por módulo

### Motor — leva inteiro

| Módulo                                      | O que resolve                                                                                              |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `packages/tabletop-stage/index.js`          | Renderer, câmera, atos de câmera, pós-processo CRT, PiP, arraste/zoom, resize, ciclo de animação, descarte |
| `packages/tabletop-stage/performance.js`    | Amostragem de quadros e resumo de FPS                                                                      |
| `packages/tabletop-stage/projectile-cam.js` | Parábola do voo, saída do quadro, pose da câmera de perseguição e ancoragem do PiP na borda                |
| `src/lib/tabletop/quality-profiles.js`      | Perfis de qualidade 3D e persistência da escolha                                                           |
| `src/lib/tabletop/benchmark-kit.js`         | Execução e histórico de benchmark pela URL                                                                 |
| `src/lib/realtime.js`                       | Tradução de status de canal Supabase em reação do app; presença com ACK                                    |
| `src/lib/secure-channel.js`                 | ECDH P-256 + AES-GCM para visões privadas no Broadcast                                                     |
| `src/lib/supabase.js`                       | Cliente e validação da URL do projeto                                                                      |
| `src/rooms/room.js`                         | Código de sala, cadeiras, anfitrião, tolerância de queda                                                   |
| `src/rooms/connection.js`                   | Sequência de assinatura do canal, create/resume/join e reassinatura                                        |
| `src/rooms/join.js`                         | Pedido de cadeira do convidado com reenvio e desistência                                                   |
| `src/rooms/chat.js`                         | Normalização, limites e antiflood do chat                                                                  |
| `src/rooms/game-sync.js`                    | Aceite de snapshot por `gameId` e `version`                                                                |
| `src/lib/asset-warmup.js`                   | Ordem de aquecimento de assets (imediato × ocioso)                                                         |
| `src/lib/lab-access.js`                     | Liberação de rota interna por chave na URL                                                                 |
| `src/lib/bot-timing.js`                     | Atraso humano para jogadas automáticas                                                                     |

### Motor com amarra — leva a máquina, deixa o catálogo

| Módulo                                | Máquina (motor)                                                                                        | Amarra a Coup                                                       |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------- |
| `src/lib/tabletop/camera-director.js` | Beat da partida → ato de câmera; chave de corte que evita recortes repetidos; geometria de duelo/trono | O vocabulário de beats (`claim`, `block-window`, `influence-loss`…) |
| `src/lib/tabletop/foley.js`           | Síntese no `AudioContext` da mesa, intervalo mínimo por evento                                         | Nomes dos eventos (moeda, carta revelada, arremesso)                |
| `src/lib/tabletop/reactions.js`       | Normalização, deduplicação e janela dos últimos N                                                      | Catálogo de arremessáveis (adaga da Assassina, moeda do Duque…)     |
| `src/lib/tabletop/hourglass-sand.js`  | Perfil e volume de areia dentro de um vidro de revolução                                               | Nasceu do relógio de decisão, mas serve a qualquer timer diegético  |
| `src/lib/sounds.js`                   | Síntese de padrões curtos + mudo persistido                                                            | Chaves `la-corte-*` no `localStorage` e os nomes dos eventos        |
| `src/lib/voice-announcer.js`          | Banco de falas por evento com sorteio sem repetição                                                    | O banco em si é 100% de Coup                                        |
| `src/lib/decision-clock.js`           | Relógio de decisão derivado do estado, sem timer próprio                                               | Lê `turn`, `phase` e `log` no formato de Coup                       |
| `src/rooms/session.js`                | Retomada de sessão com validade                                                                        | Migração de carta `Embaixador` → `Embaixadora`                      |
| `src/game/handover.js`                | Sucessão do anfitrião a partir de visões redigidas                                                     | Reconstrói cartas e baralho de Coup                                 |
| `src/ui/table-experiment.js`          | Casca do salão: topbar, roster, doca de reações, chat, preferências, PiP                               | Narrativa, ampulheta e controles de decisão                         |

### Coup nativo — fica

| Módulo                                      | Conteúdo                                                    |
| ------------------------------------------- | ----------------------------------------------------------- |
| `src/game/coup.js`                          | Papéis, ações, fases, desafios, bloqueios                   |
| `src/game/ai.js`                            | Bots e `awaitedPlayerId`                                    |
| `src/ui/game-views.js`, `src/ui/screens.js` | Telas e views da mesa 2D                                    |
| `src/lib/tabletop/coup-view.js`             | Projeção do estado para o palco                             |
| `src/lib/tabletop/coup-table.js`            | Assentos, cartas, ampulheta, carta de ação, reações na cena |
| `src/lib/tabletop/coup-environment.js`      | Salão, cidade, luz e paletas                                |
| `app.js`                                    | Orquestração da aplicação                                   |

## Fronteiras que já existem — não fure

1. **`packages/tabletop-stage` não importa nada de `src/`.** Só `three` e ele mesmo. É a única
   garantia real de que o motor está de pé sozinho. Qualquer import de `src/` ali é regressão.
2. **`projectCoupTableView` (`src/lib/tabletop/coup-view.js`) é a barreira de dados.** O palco 3D
   recebe uma _view_ projetada, nunca o estado da partida. Em outro jogo, troca-se a projeção e o
   palco continua igual. Nada do palco pode ler `game.pending` direto.
3. **A cena aplica corte de câmera só quando a chave muda** (`cameraDecisionKey`). Diretor decide,
   cena obedece — não invente corte dentro da cena.
4. **Regras vivem em `src/game/` e nunca importam nada de apresentação.** Motor e UI dependem das
   regras; o contrário, nunca.

## Onde colocar código novo

- Mexe em pixel, câmera, quadro ou descarte, sem saber o que é uma influência → `packages/tabletop-stage/`.
- Precisa de matemática ou máquina de estado testável em Node → módulo puro em `src/lib/`, com teste
  em `test/`. É o padrão do repositório: WebGL não é testável aqui, então a decisão sai da cena.
- Conhece papel, ação ou fase → `src/game/` ou `coup-*.js`, sem exceção.
- Um recurso que é meio a meio (foi o caso do PiP de arremesso): **a mecânica vai para o pacote, a
  política vai para o jogo.** O pacote não sabe que existe "quem arremessou"; ele sabe compor uma
  segunda câmera sobre um retângulo da tela.

## Fila de extração dentro deste repositório

Ordem por valor, não por facilidade. "Mais pronto" não é "mais valioso": a sala multiplayer é a
peça mais desacoplada que existe aqui, mas ninguém joga um jogo por causa da sala. O que diferencia
esta base é a apresentação — e é justamente a parte mais amarrada a Coup.

1. **Casca e direção do salão** (`table-experiment.js` + `camera-director.js`) — é a experiência que
   se quer herdar inteira e o ponto onde os dois lados mais se misturam. O diretor vira motor
   recebendo um mapa `beat → ato` injetado pelo jogo, no lugar do `switch` com beats de Coup; a
   casca separa moldura (topbar, roster, doca de reações, PiP, preferências) de narrativa.
2. **Áudio** (`sounds.js` + `foley.js` + `voice-announcer.js`) — três mecanismos parecidos com três
   catálogos diferentes; vira um único banco de eventos sonoros com intervalo mínimo e mudo
   persistido, parametrizado por prefixo de storage.
3. **Sala multiplayer** (`src/rooms/` + `src/lib/realtime.js` + `src/lib/secure-channel.js`) — quase
   não tem Coup dentro e sai praticamente por cópia; adiar não custa. Sai movendo a migração de
   carta de `session.js` para o jogo.

## Plano de extração para um repositório próprio

O motor sai daqui quando **existir um segundo consumidor de verdade**, não antes. Motor extraído com
uma evidência só nasce com o formato do primeiro jogo; a segunda evidência é o que separa abstração
de coincidência. Até lá, o monorepo é o lugar certo — é mais barato mudar um contrato errado dentro
de um repositório do que entre dois.

| Fase                             | Gatilho                                                  | Entregável                                                                                                               | Pronto quando                                                                                        |
| -------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| **0 · Fronteira mecanizada**     | Agora                                                    | Teste que falha se `packages/` importar `src/`, se a apresentação importar `src/game/` ou se o motor citar papel de Coup | A fronteira deixa de depender de disciplina e passa a quebrar o `npm test`                           |
| **1 · Workspace**                | Depois da fase 0                                         | `workspaces` no `package.json` da raiz, no lugar da dependência `file:`                                                  | `npm test` e `npm run build` passam sem o link manual                                                |
| **2 · Prova de portabilidade**   | Primeiro slice vertical do segundo jogo                  | O segundo jogo consome o motor por caminho relativo ou submódulo, ainda sem publicar                                     | O segundo jogo roda uma partida ponta a ponta sem editar nenhum arquivo de `packages/`               |
| **3 · Repositório próprio**      | O segundo jogo rodando e os contratos da fase 2 estáveis | Repo do motor com escopo neutro, semver, CHANGELOG e publicação em registry privado (GitHub Packages)                    | Os dois jogos instalam a mesma versão publicada e o histórico do motor sobrevive (`git filter-repo`) |
| **4 · La Corte vira consumidor** | Depois da fase 3                                         | Este repositório passa a depender da versão publicada e `packages/` some daqui                                           | Uma correção no motor chega aos dois jogos por bump de versão, sem cópia                             |

### O que nunca vai junto

Regras, papéis, arte, retratos, vozes, textos e paletas do salão. Se o próximo jogo precisar de algo
que está em `coup-*.js`, o certo é generalizar o mecanismo e deixar o conteúdo para trás — nunca
levar o conteúdo "para adaptar depois".

### Contratos a resolver antes da fase 3

Cada um destes é um vazamento de Coup dentro de código que a tabela chama de motor. São baratos hoje
e caros depois de publicado, porque viram mudança de API entre repositórios:

- **Escopo do pacote.** `@la-corte/*` carrega o nome de um jogo. Renomear para um escopo neutro da
  equipe custa um _find & replace_ hoje e uma major amanhã.
- **Prefixo de storage.** `la-corte-3d-quality`, `la-corte-3d-benchmarks` e os mudos de áudio gravam
  o jogo na chave. O motor precisa receber o prefixo, não escolhê-lo.
- **Vocabulário de beats.** Enquanto o diretor de câmera tiver `claim` e `influence-loss` no `switch`,
  ele não é motor — é o diretor de Coup morando na pasta errada.
- **Catálogos.** Reações, foley e falas: a máquina fica, a lista entra por parâmetro.
- **Idioma.** Toda string visível do motor precisa vir do jogo. Hoje há texto em português dentro de
  código que se pretende genérico.

### Riscos assumidos

- **Publicar cedo demais.** Um pacote com dois consumidores transforma toda mudança em release. Fase
  2 existe justamente para provar a portabilidade sem pagar esse pedágio.
- **Segurar tempo demais.** O inverso também acontece: o motor apodrece dentro do jogo quando toda
  feature nova acha mais fácil furar a fronteira. A fase 0 é o antídoto e por isso vem primeiro.

### Decisão pendente

O palco de hoje assume jogadores em círculo, cadeira por ângulo (`azimuthRad`) e no máximo seis
lugares — e as câmeras (duelo, trono, POV) derivam dessa geometria. Se o próximo jogo tiver
tabuleiro, grade, times ou tempo real, boa parte do que esta tabela chama de motor é, na verdade,
"motor de jogo de cadeiras em círculo". **Definir o formato do próximo jogo é pré-requisito da fase
2** e pode reclassificar módulos inteiros deste mapa.

## Manutenção

Ao abrir um recurso novo, decida o nível **antes** de escrever a primeira linha e registre-o aqui.
Um módulo que mudou de nível sem passar por esta tabela é dívida silenciosa: some para quem for
começar o próximo jogo.
