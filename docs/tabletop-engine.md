# Tabletop Stage — motor gráfico comum

A mesa 3D é separada em três camadas. Essa é a fronteira que
permite reaproveitar a técnica do Sem Perdão sem misturar as regras dos jogos.

```text
GameState autoritativo
        │
        ▼
projectCoupTableView()     ← remove segredos e traduz fases
        │
        ▼
CoupTableScene.sync(view)  ← modelos e encenação próprios de La Corte
        │
        ▼
TabletopStage              ← câmera, loop, resize, WebGL, CRT e descarte
```

## O que é comum

`packages/tabletop-stage/` não conhece Coup nem Sem Perdão. Ele é um pacote
local, consumido por `@la-corte/tabletop-stage`. `TabletopStage` coordena os
subsistemas sem concentrar suas implementações:

- `camera-rig.js`: câmera, atos, transição e controle por arrasto/roda;
- `gesture-track.js`: duração, atropelo e avaliação de gestos por quadro;
- `model-registry.js`: forma, validação e endereço de um catálogo de modelos;
- `render-pipeline.js`: renderer, render target e pós-processo retrô;
- `inset-camera.js`: segunda câmera e composição PiP;
- `scene-utils.js`: texturas de canvas e limpeza de objetos Three.js;
- `index.js`: cena, loop, resize, instrumentação e ciclo de vida público.

## Gestos: encaixes em vez de esqueleto

`gesture-track.js` não tem vocabulário. Cada jogo declara o seu com
`defineGestureVocabulary({ nome: { duration, priority, pose } })` — o de La
Corte vive em `coup-table/gestures.js` — e o motor resolve só o que é comum a
qualquer mesa: quanto dura, quem atropela quem e qual é a pose no quadro atual.

Uma pose é **aditiva** e endereça _encaixes_ nomeados, não um esqueleto. O
modelo publica os encaixes que possui (`createNoble` devolve `sockets`), e a
composição descarta silenciosamente o que ele não tiver. É isso que permite
trazer um gesto de outro motor sem trazer o boneco junto: um soco escrito para
`handRight` ainda lê no cortesão, que só tem `body` — perde o detalhe da mão e
mantém o tronco. Enquanto a figura não ganhar o encaixe, escrever a mão na pose
é documentação da intenção, não código morto.

`priority` existe porque a mesa dispara gestos concorrentes: um tomate chegando
não pode apagar a queda de uma influência. Um gesto só cede a outro de
prioridade igual ou maior — igual inclusive, senão dois golpes seguidos viram
um só.

`src/lib/tabletop/coup-table.js` é deliberadamente específico e coordena os
apresentadores de La Corte em `src/lib/tabletop/coup-table/`: cartas, figuras,
moedas, ampulheta, reações, câmeras de assento e catálogo visual. Outro jogo
implementa outro compositor sobre o mesmo `TabletopStage`.

`src/lib/tabletop/coup-environment.js` compõe o fundo nativo da partida; a
geração procedural de superfícies vive em `coup-environment/textures.js`. A
cena contém a câmara
palaciana curva, piso de mármore, janelas, colunas, brasões dos cinco papéis,
tapeçarias, esculturas, teto, lustre, velas e poeira em suspensão. As duas
janelas amostram partes de um único panorama contínuo da cidade em cada tema,
evitando luas ou skylines duplicados. Arquitetura e mobiliário continuam sendo
geometria e materiais próprios da cena.

A iconografia segue os personagens de La Corte. Em especial, o Capitão é um
oficial militar da corte, representado por insígnia e linguagem de comando —
nunca por âncoras, navios ou códigos visuais de pirataria.

Quando um papel é alegado ou usado em um bloqueio, o compositor pode mostrar
uma efígie 3D pública inspirada no retrato 2D correspondente: colar do Duque,
véu e adaga da Assassina, casaco militar azul do Capitão, carta da Embaixadora
e gola alta da Condessa. Os jogadores sentados continuam cortesãos neutros para
que o figurino jamais revele uma influência mantida em segredo.

## Barreira de sigilo

`projectCoupTableView(game, myId)` é a única entrada de dados do palco. Mesmo
quando recebe o estado completo do host, ele substitui IDs de cartas rivais e
remove seus papéis até a revelação. O renderer não recebe baralho, fila privada
de troca nem callbacks capazes de alterar a partida.

Essa projeção é testada em `test/tabletop-view.test.js`. A regra continua sendo:
o palco representa um resultado; nunca decide um resultado.

## Jogo e laboratório

```bash
npm run dev
```

O 3D é a apresentação padrão das partidas novas e retomadas. A mesa
real contra bots ou multiplayer reutiliza o mesmo `dispatchGame()` do 2D e pode
alternar de apresentação sem perder estado. O compositor WebGL é carregado sob
demanda quando uma partida 3D começa, preservado entre renders e descartado ao
voltar para a mesa 2D.

`http://localhost:5173/lab/modelos` é a vitrine de modelos: uma peça por vez
sobre um prato neutro, com os parâmetros de cada uma em botões. O endereço
carrega a seleção inteira — `?modelo=influencia&papel=Duque&estado=propria&theme=dark`
reabre exatamente aquela carta, que é como uma captura automática a pede. O
catálogo fica em `src/lib/tabletop/model-catalog.js` e só guarda metadado: a
construção é `import()` tardio, porque metade das fábricas importa texturas.

A vitrine não conhece La Corte. `defineModelCatalog({ categories, models })`
devolve um registro com `find`, `defaults`, `fromSearch` e `toSearch`, e é ele
que `mountModelGallery({ catalog })` recebe — o catálogo da corte é só o padrão
do argumento. Outro jogo publica o seu com a mesma chamada e abre a mesma
vitrine. A validação acontece na definição, não na renderização: categoria
inexistente, id repetido, fábrica ausente ou parâmetro de opção única derrubam
o catálogo no carregamento, onde um teste vê, em vez de virarem um botão morto
na tela.

`http://localhost:5173/lab` é o laboratório técnico. Ele mantém uma cena
estática para testar ambiente e câmeras sem bots avançando a partida. Benchmark,
qualidade e seleção manual dos atos ficam restritos a essa rota.

O laboratório só aparece após o navegador consumir `?labKey=...`, comparando-o
com `VITE_CORTE_3D_LAB_KEY` e persistindo a permissão em
`la-corte-3d-lab-access`. A URL é limpa logo após a validação. Sem permissão,
uma tentativa de abrir `/lab` retorna para `/`.

### Interface jogável

A HUD do jogo é própria para o 3D e usa ilhas compactas em vez do cabeçalho da
mesa 2D. Ela inclui:

- narrativa do ato e progresso das respostas coletivas;
- ações e decisões HTML completas como caminho acessível; perda de influência
  e troca da Embaixadora também são concluídas diretamente na bancada 3D;
- painel recolhível da Corte com moedas, influências ativas e reveladas;
- foco de câmera em qualquer nome sem alterar a geografia global dos assentos;
- visão Jogador automática quando chega a vez local;
- chat multiplayer, sons, vozes, tema e confirmação explícita de saída;
- emojis e arremessos efêmeros, com tomate, luva, rosa e objetos próprios da
  corte, sem entrar no estado autoritativo da partida.

A mão privada aceita foco aproximado, e o tesouro mostra a quantia exata em
moedas instanciadas e revela o saldo no hover. A moeda arremessável reutiliza o
mesmo modelo genérico da corte; `duke_coin` é apenas o ID temático compatível do
catálogo de reações.

Modais, chat e confirmação de saída recolhem a barra de ações. O painel da
Corte e as reações são mutuamente exclusivos, mas continuam consultas rápidas.
Desktop mostra os arremessos em grade; portrait usa uma faixa horizontal acima
das ações.

### Tema compartilhado

O seletor Dia/Noite do laboratório usa a mesma chave `la-corte-theme` da mesa
2D. O perfil diurno troca céu, skyline, reboco, mármore, névoa, exposição,
vinheta e iluminação do WebGL; o noturno restaura velas, tons do entardecer e
contraste mais fechado. A interface 2D do laboratório acompanha o mesmo valor.
Trocar em qualquer superfície mantém a escolha ao navegar para a outra.

### Benchmark de performance

O ferramental é separado em duas camadas reutilizáveis:

- `packages/tabletop-stage/performance.js` contém `FrameBenchmark` e
  `summarizeFrameTimes`, sem dependência de Three.js, Coup ou DOM;
- `src/lib/tabletop/benchmark-kit.js` define o protocolo canônico do
  laboratório, histórico local e autorun.

O botão **Medir FPS** prepara a alegação do Capitão na câmera de mesa, aquece
por 2 segundos e mede por 8 segundos. A run registra FPS médio, frame time
mediano, p95/p99, frames longos, resolução CSS/interna, DPR, `pixelScale`, draw
calls, triângulos, tema, ato e câmera. Os vinte resultados mais recentes ficam
em `localStorage` sob `la-corte-3d-benchmarks` e o último também é publicado em
`window.__TABLETOP_BENCHMARK__` e no evento `tabletop-benchmark-complete`.

Para automação no navegador, abra:

```text
/lab?benchmark=1&duration=8000
```

O parâmetro `duration` aceita de 2 a 60 segundos. A aba precisa permanecer
visível; intervalos de suspensão maiores que um segundo não entram na amostra.

#### Perfis de resolução

O seletor de qualidade altera apenas resolução interna e resolução de saída; a
cena, as luzes e os materiais permanecem idênticos para permitir comparação:

- `cinematic`: `pixelScale 1.25`, DPR de saída até 2 — perfil padrão e piso
  visual para gameplay;
- `balanced`: `pixelScale 2.5`, DPR de saída até 1.25;
- `performance`: `pixelScale 4`, DPR de saída 1.

A preferência fica em `la-corte-3d-quality`. Para fixar uma run automatizada,
use, por exemplo, `/lab?quality=performance&benchmark=1&duration=8000`.
Os dois perfis inferiores são diagnósticos: não devem substituir o Cinemático
quando cartas, nomes ou estados deixarem de ser inequívocos.

## Extração para os dois projetos

O motor já vive no pacote local `packages/tabletop-stage`. O próximo passo é o
Sem Perdão referenciá-lo por dependência `file:` e migrar somente
loop/câmera/pós-processo/descarte primeiro; `RetroMesa`, `Reu` e o projetor
`MesaView` continuariam específicos durante a migração. Depois que os dois
consumidores estiverem verdes, o pacote pode ganhar repositório próprio ou ser
publicado.

Não é recomendável transformar `RetroMesa` diretamente no pacote comum: ele
carrega linguagem e fluxo próprios do Tribunal do Porão. O ponto de reuso é a
infraestrutura abaixo dele, não o tema acima dela.
