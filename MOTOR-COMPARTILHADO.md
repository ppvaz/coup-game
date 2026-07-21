# Motor compartilhado × Coup nativo

Mapa de reaproveitamento do código deste repositório para **Sem Perdão** (`~/Projects/SEM-PERDAO`) e
para os próximos jogos da equipe. A pergunta que este documento responde é sempre a mesma: _se amanhã
eu abrir um repositório novo para outro jogo de mesa, o que eu levo junto e o que fica?_

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

## Genealogia: dois irmãos, não um pai e um filho

O objetivo não é extrair um motor de La Corte e entregá-lo a outros jogos. É **fundir duas
implementações irmãs em um motor genérico que acelere os próximos jogos** — e o motor, nesse
arranjo, é o produto; os jogos são a prova dele.

| Quando     | O quê                                                                                                                                  |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| 17/07/2026 | Sem Perdão nasce e, no mesmo dia, ganha a mesa 3D retrô pixelada em Three.js na rota `/3d`                                             |
| 20/07/2026 | La Corte parte dessa base para levantar o próprio ambiente 3D                                                                          |
| 20–21/07   | Os dois evoluem em separado: PiP, diretor de câmera e ampulheta de um lado; provas, veredito, martelada e pipeline ElevenLabs do outro |
| Agora      | Intenção de combinar os dois num motor genérico                                                                                        |

### Onde as duas bases se encostam

| Problema            | La Corte                                                                  | Sem Perdão                                           |
| ------------------- | ------------------------------------------------------------------------- | ---------------------------------------------------- |
| Arremesso           | `throwReaction` (coup-table.js)                                           | `arremessarEntre` (retroMesa.ts)                     |
| Barreira de dados   | `projectCoupTableView` (coup-view.js)                                     | `mesaView.ts`, também puro e testado no Node         |
| Atos de câmera      | `defineCameraAct` / `setCameraAct`                                        | `Ato`, `CONFIG_ATO`, `setAto`                        |
| Pós-processo        | Render target + quad CRT + `pixelScale`                                   | Render target + `blitScene` + `pixelSize`            |
| Perfis de qualidade | `quality-profiles.js`                                                     | `Qualidade3D` (`baixa`/`media`/`alta`)               |
| Assentos por ângulo | `azimuthRad`, até 6 lugares                                               | `assentosJogadores {nome, az}`, `MESA_MIN/MAX_SEATS` |
| Sala online         | `src/rooms/` + `realtime.js`                                              | `useMultiplayer.ts` (1679 linhas)                    |
| Continuidade        | Host autoritativo, vistas redigidas, sucessão de host, retomada de sessão | O mesmo desenho, reescrito em React                  |

**Cuidado ao ler esta tabela.** Não é convergência independente — é herança. Os dois arremessos são
a mesma Bézier com o mesmo teto de oito objetos no ar porque um veio do outro, não porque duas
cabeças chegaram lá sozinhas. Semelhança por descendência não prova que o código seja genérico;
prova apenas que ele foi portado.

O que a tabela realmente diz é outra coisa, e é melhor: **a bifurcação tem poucos dias.** As duas
bases ainda falam a mesma língua, e a fusão nunca mais vai ser tão barata quanto agora. A evidência
de genericidade de verdade virá de fora — do terceiro jogo, que não vai herdar nada e vai ter que
consumir a API como ela estiver.

### O que não atravessa

**A casca.** Sem Perdão é Next 16 + React 19 + TypeScript + Tailwind; La Corte é Vite + JS puro com
HTML em string e CSS à mão. `table-experiment.js` é a peça menos portável do repositório, não a mais
valiosa — é a segunda vez que este documento corrige essa ordem, agora com evidência. O que atravessa
é o palco e os módulos puros; a moldura é por stack.

## Fila de fusão

Ordem por proximidade das duas bases: começa pelo que ainda é quase o mesmo código, antes que a
bifurcação abra mais.

1. **Palco 3D** (`packages/tabletop-stage/` + atos de câmera + pós-processo + qualidade) — os dois
   jogos têm a mesma coisa escrita duas vezes. É onde a convergência paga mais rápido e onde já
   existe um pacote de pé.
2. **Reações físicas** (arremesso, emojis, foley de impacto) — mesma curva, mesmos limites, catálogos
   diferentes. A máquina sai inteira; tomate e adaga ficam com cada jogo.
3. **Sala multiplayer** (`src/rooms/` + `realtime.js` + `secure-channel.js` × `useMultiplayer.ts`) — o
   desenho é o mesmo, mas um lado é módulo puro e o outro é um hook React de 1679 linhas. Converge
   depois do palco, porque exige decidir a forma (núcleo puro + adaptador por stack).
4. **Áudio** — três mecanismos parecidos aqui, mais um pipeline ElevenLabs lá. Convergir só o
   mecanismo: banco de eventos com intervalo mínimo e mudo persistido por prefixo.
5. **Casca do salão** — **não** entra na fila enquanto os stacks forem diferentes.

## Plano de fusão em um repositório próprio

A regra clássica manda não extrair antes do segundo consumidor, porque motor tirado de um jogo só
nasce com o formato daquele jogo. Aqui o caso é outro: não há um jogo doando o motor, há **dois
irmãos recém-bifurcados** para reunir. O risco não é abstrair cedo demais — é deixar a bifurcação
envelhecer, porque cada correção de câmera, arremesso ou reconexão feita de um lado não chega ao
outro.

Por isso o plano tem uma fase que uma extração comum não teria: antes de publicar qualquer coisa,
comparar as duas implementações lado a lado e decidir **qual das duas versões é a boa** em cada peça.
Eleger a de La Corte por ser a de casa seria escolher por acidente — a linhagem começou do outro
lado, e em várias peças a versão mais madura provavelmente é a de lá.

| Fase                                        | Gatilho                                     | Entregável                                                                                                               | Pronto quando                                                                                                                                                                              |
| ------------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **0 · Fronteira mecanizada**                | Agora                                       | Teste que falha se `packages/` importar `src/`, se a apresentação importar `src/game/` ou se o motor citar papel de Coup | A fronteira deixa de depender de disciplina e passa a quebrar o `npm test`                                                                                                                 |
| **1 · Workspace**                           | Depois da fase 0                            | `workspaces` no `package.json` da raiz, no lugar da dependência `file:`                                                  | `npm test` e `npm run build` passam sem o link manual                                                                                                                                      |
| **1.5 · Confronto das duas implementações** | Já disponível                               | Comparação peça a peça (palco, atos, arremesso, sala) escolhendo a melhor versão de cada uma, com o motivo registrado    | Cada peça da fila tem uma versão eleita e uma lista do que falta nela                                                                                                                      |
| **2 · Prova de portabilidade**              | Depois da fase 1.5                          | Sem Perdão consome o motor fundido por caminho relativo ou submódulo, ainda sem publicar                                 | Sem Perdão roda uma partida ponta a ponta sem editar nenhum arquivo do motor                                                                                                               |
| **3 · Repositório próprio**                 | Os dois jogos rodando sobre o motor fundido | Repo do motor com escopo neutro, semver, CHANGELOG e publicação em registry privado (GitHub Packages)                    | Os dois jogos instalam a mesma versão publicada, o histórico do motor sobrevive (`git filter-repo`) e a identidade das cadeiras está autenticada (ver "A dívida de segurança viaja junto") |
| **4 · La Corte vira consumidor**            | Depois da fase 3                            | Este repositório passa a depender da versão publicada e `packages/` some daqui                                           | Uma correção no motor chega aos dois jogos por bump de versão, sem cópia                                                                                                                   |

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
- **Tipos.** O pacote é JS puro sem `.d.ts`; Sem Perdão é TypeScript. Ou o motor passa a ser escrito
  em TS e publica os tipos gerados, ou mantém tipos escritos à mão — mas um consumidor TS sem tipos
  transforma todo o motor em `any`, e aí a fronteira não protege mais nada.
- **Controle de câmera.** La Corte tem arraste e zoom próprios dentro do palco; Sem Perdão usa
  `OrbitControls` de `three/examples`. Duas respostas para a mesma pergunta: escolher uma na fase 1.5.
- **Identidade e envelopes.** Autenticar a cadeira e validar estruturalmente tudo que chega do canal.
  É a pendência P0 da auditoria e mora justo na camada que vai virar motor.

### Riscos assumidos

- **Publicar cedo demais.** Um pacote com dois consumidores transforma toda mudança em release. Fase
  2 existe justamente para provar a portabilidade sem pagar esse pedágio.
- **Segurar tempo demais.** É o risco real agora: a bifurcação tem dias, e cada semana sem
  convergência aumenta o custo da fusão. A fase 0 é o antídoto do lado de cá e por isso vem primeiro.
- **Eleger a versão errada.** Escolher a implementação de La Corte por ser a de casa. A fase 1.5
  existe para que a escolha tenha motivo escrito.
- **Confundir herança com prova.** Duas bases parecidas por descendência não demonstram que a API
  serve a um jogo que não descende de nenhuma delas. O motor só está validado no terceiro jogo.

### Sobre a geometria: promissor, ainda não provado

A dúvida era se o palco seria, na verdade, "motor de jogo de cadeiras em círculo". Os dois jogos são
mesa redonda com assento por ângulo, e a única diferença é o número de lugares — até 6 aqui, de 3 a 8
lá. Isso é suficiente para tratar **o limite de assentos como parâmetro, não como premissa**.

Não é suficiente, porém, para declarar a roda genérica: as duas bases têm a mesma origem, então
concordarem sobre geometria era o esperado. Quando aparecer um jogo com tabuleiro, grade ou times,
esta seção provavelmente muda. Até lá o motor pode assumir a roda — desde que assuma explicitamente,
no nome e na API, em vez de fingir neutralidade que não tem.

## Invariantes que o motor herda do 3D

`CORTE-3D.MD` abre com princípios escritos para Coup. Estes quatro não são de Coup — são contratos
de qualquer palco que apresente um jogo de informação oculta, e precisam viajar com o motor:

1. **O palco representa decisões; nunca decide regras.** Já está nas fronteiras acima, mas vale a
   formulação original: é o resumo de uma linha de por que a barreira de projeção existe.
2. **Nenhum perfil de qualidade pode remover informação de gameplay.** Qualidade mexe em resolução,
   nunca em conteúdo. Sem isso, "Performance" vira vantagem competitiva ou cegueira — e o motor é
   quem oferece os perfis, então a regra é dele.
3. **O cosmético nunca revela estado oculto.** Em La Corte, roupa de cortesão não pode denunciar
   influência; em Sem Perdão, o mesmo vale para robe, capuz e relíquia com julgamento às cegas. Os
   dois jogos já têm customização e informação secreta: a regra vale para o motor, não para um deles.
4. **Fallback e perda de contexto WebGL são responsabilidade do palco.** Um jogo não deveria
   reimplementar "o navegador não conseguiu abrir a cena". Hoje La Corte trata o fallback e nenhum
   dos dois trata restauração de contexto — é lacuna de motor, não de jogo.

Duas peças de ferramental do mesmo documento também são de motor, e nenhuma existe do outro lado:

- **Limites de enquadramento.** Nenhum plano dirigido entra no miolo da mesa (raio ≥ 6) nem sai do
  salão (raio ≤ 11,5). A regra é genérica para mesa redonda; os números são da cena. Vira parâmetro.
- **Matriz de capturas** (`npm run capture:3d`): 11 planos × orientações × dia/noite, headless. É o
  jeito de provar que uma mudança de câmera não quebrou o enquadramento — e serve a qualquer jogo
  sobre o palco.

## A dívida de segurança viaja junto

Este é o insight mais caro de `AUDITORIA-PENDENCIAS.md`, e ele muda o plano acima.

A camada que está prestes a virar motor — sala, presença, canal, host autoritativo — é exatamente a
que tem a pendência P0: o canal Supabase é público e todas as identidades (`playerId`, chave de
presença, `connectionId`, chave pública) são declaradas pelo próprio cliente. Quem conhece o código
da sala pode se passar por outra cadeira e, como o host cifra a visão de um jogador para todas as
presenças daquele ID, chegar à mão privada dela.

**Sem Perdão tem a mesma arquitetura e o mesmo furo** — o README de lá também avisa que os canais
públicos não são fronteira anti-cheat.

A consequência para a fusão é direta: extrair a sala como está multiplica a falha por todos os jogos
futuros, e cada consumidor novo encarece a correção. Autenticação de identidade e validação
estrutural dos envelopes (snapshots, visões, handover, presença) não são "melhorias posteriores" do
motor — são pré-requisito de publicá-lo.

A auditoria também entrega, de graça, duas coisas que o plano precisava:

- **A forma da extração.** As fronteiras sugeridas para desmontar `app.js` — `RoomTransport`,
  `OnlineSessionController`, `GameController`, `UIController` — são o desenho do runtime de sala com
  adaptador por stack. É mais concreto do que "núcleo puro + adaptador" e já está escrito.
- **O portão da fase 3.** Os testes que faltam (duas sessões no mesmo canal, reconexão e troca de
  host ponta a ponta, payloads malformados, tentativa de impersonação, CI rodando tudo) são
  precisamente a suíte que o motor precisa para merecer publicação. Nenhum deles é sobre Coup.

## Documentos relacionados

- `CORTE-3D.MD` — ciclo da experiência 3D de La Corte. O item 10 ("Consolidar o motor comum") foi
  absorvido por este documento; lá ficou o ponteiro. Um plano com dois donos diverge.
- `AUDITORIA-PENDENCIAS.md` — pendências de segurança, performance e arquitetura. Continua dono das
  pendências; aqui ficam só as que a fusão precisa resolver antes de publicar.
- Ambos são locais e não versionados. Se este mapa vai ser lido por quem for começar o próximo jogo,
  os três precisam viver no mesmo lugar.

## Manutenção

Ao abrir um recurso novo, decida o nível **antes** de escrever a primeira linha e registre-o aqui.
Um módulo que mudou de nível sem passar por esta tabela é dívida silenciosa: some para quem for
começar o próximo jogo.
