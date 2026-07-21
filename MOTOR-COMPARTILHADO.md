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

| Módulo                                   | O que resolve                                                                                              |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `packages/tabletop-stage/index.js`       | Renderer, câmera, atos de câmera, pós-processo CRT, PiP, arraste/zoom, resize, ciclo de animação, descarte |
| `packages/tabletop-stage/performance.js` | Amostragem de quadros e resumo de FPS                                                                      |
| `src/lib/tabletop/quality-profiles.js`   | Perfis de qualidade 3D e persistência da escolha                                                           |
| `src/lib/tabletop/benchmark-kit.js`      | Execução e histórico de benchmark pela URL                                                                 |
| `src/lib/realtime.js`                    | Tradução de status de canal Supabase em reação do app; presença com ACK                                    |
| `src/lib/secure-channel.js`              | ECDH P-256 + AES-GCM para visões privadas no Broadcast                                                     |
| `src/lib/supabase.js`                    | Cliente e validação da URL do projeto                                                                      |
| `src/rooms/room.js`                      | Código de sala, cadeiras, anfitrião, tolerância de queda                                                   |
| `src/rooms/connection.js`                | Sequência de assinatura do canal, create/resume/join e reassinatura                                        |
| `src/rooms/join.js`                      | Pedido de cadeira do convidado com reenvio e desistência                                                   |
| `src/rooms/chat.js`                      | Normalização, limites e antiflood do chat                                                                  |
| `src/rooms/game-sync.js`                 | Aceite de snapshot por `gameId` e `version`                                                                |
| `src/lib/asset-warmup.js`                | Ordem de aquecimento de assets (imediato × ocioso)                                                         |
| `src/lib/lab-access.js`                  | Liberação de rota interna por chave na URL                                                                 |
| `src/lib/bot-timing.js`                  | Atraso humano para jogadas automáticas                                                                     |

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

## Fila de extração para Sem Perdão

Ordem por retorno, não por esforço:

1. **Sala multiplayer** (`src/rooms/` + `src/lib/realtime.js` + `src/lib/secure-channel.js`) — é o
   bloco mais valioso e o mais perto de sair: praticamente não tem Coup dentro. Vira
   `@la-corte/room-runtime` movendo a migração de carta de `session.js` para o jogo.
2. **Diretor de câmera** — vira motor assumindo um mapa `beat → ato` injetado pelo jogo, em vez do
   `switch` com beats de Coup.
3. **Áudio** (`sounds.js` + `foley.js` + `voice-announcer.js`) — três mecanismos parecidos com três
   catálogos diferentes; extrair um único "banco de eventos sonoros" com intervalo mínimo e mudo
   persistido, parametrizado por chave de storage.
4. **Casca do salão** (`table-experiment.js`) — hoje é o arquivo que mais mistura os dois lados.
   Separar a casca (topbar, roster, doca de reações, PiP, preferências) da narrativa de Coup é o que
   permite Sem Perdão herdar a experiência 3D inteira.

## Manutenção

Ao abrir um recurso novo, decida o nível **antes** de escrever a primeira linha e registre-o aqui.
Um módulo que mudou de nível sem passar por esta tabela é dívida silenciosa: some para quem for
começar o próximo jogo.
