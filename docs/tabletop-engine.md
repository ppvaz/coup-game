# Tabletop Stage — motor gráfico comum

O experimento em `/3d` separa a mesa em três camadas. Essa é a fronteira que
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

`packages/tabletop-stage/index.js` não conhece Coup nem Sem Perdão. Ele é um
pacote local, consumido por `@la-corte/tabletop-stage`, e oferece:

- cena, câmera e raiz de apresentação;
- atos de câmera com transição e controle por arrasto/roda;
- loop de animação com callbacks registráveis;
- render target de resolução controlada e pós-processo retrô;
- resize, preferência de movimento reduzido e descarte de recursos;
- utilitários para texturas de canvas e limpeza de objetos Three.js.

`src/lib/tabletop/coup-table.js` é deliberadamente específico: salão, mesa,
conselheiros, moedas, influências e as batidas de alegação, bloqueio, perda e
vitória. Outro jogo implementa outro compositor sobre o mesmo `TabletopStage`.

`src/lib/tabletop/coup-environment.js` compõe o fundo nativo da partida: câmara
palaciana curva, piso de mármore, janelas com skyline procedural, colunas,
brasões dos cinco papéis, tapeçarias, esculturas, teto, lustre, velas e poeira
em suspensão. Tudo é geometria ou textura de canvas gerada em runtime; não há
uma fotografia plana escondida atrás da mesa.

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

## Como abrir

```bash
npm run dev
```

Abra `http://localhost:5173/3d`. O laboratório também está ligado no cabeçalho
da tela inicial. Os sete atos podem ser escolhidos manualmente, a sequência pode
ser pausada e as câmeras podem ser sobrescritas.

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
/3d?benchmark=1&duration=8000
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
use, por exemplo, `/3d?quality=performance&benchmark=1&duration=8000`.
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
