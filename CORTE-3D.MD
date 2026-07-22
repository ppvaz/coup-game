# La Corte 3D — estado e próximos passos

Este documento acompanha a evolução da experiência 3D de La Corte. O objetivo
não é criar um segundo motor de Coup: o WebGL apresenta a partida, enquanto o
estado autoritativo e as regras continuam pertencendo ao motor existente.

## Princípios

- O palco representa decisões; nunca decide regras.
- Segredos passam somente por `projectCoupTableView()`.
- A experiência principal deve ser inteiramente jogável por objetos e gestos
  do palco 3D. HTML permanece como fallback acessível e de resiliência, não
  como caminho obrigatório para concluir uma jogada.
- Informações críticas de gameplay não podem ser removidas por um perfil de
  qualidade.
- Dia/noite seguem a mesma preferência da mesa 2D.
- Portrait é suportado, principalmente na visão individual; landscape é
  recomendado para observar a mesa completa, mas não é obrigatório.
- Personagens sentados são cortesãos neutros. Roupa ou aparência nunca pode
  revelar uma influência secreta.
- O Capitão usa linguagem visual militar, não pirata.

## Estado atual

### Motor e segurança

- `TabletopStage` está extraído como pacote local e contém câmera, resize,
  loop, render target, pós-processamento, descarte e benchmark.
- A cena de Coup é independente do motor gráfico comum.
- O projetor remove papéis e IDs privados dos rivais antes do WebGL.
- O projetor, os assentos e as câmeras distribuem dinamicamente de 2 a 6
  jogadores; a mesa-limite de seis possui teste de regressão.
- A ordem dos assentos é global: cada cliente vê a mesma relação entre
  jogadores, porta e janelas; somente a câmera se desloca até o jogador local.
- Existe fallback para navegadores que não conseguem abrir a cena.

### Integração jogável

- A apresentação 3D integra o fluxo principal do jogo; `/3d` mantém uma
  partida isolada de validação e `/3d/lab` concentra benchmark, perfil gráfico,
  fases e demais instrumentos de teste.
- A HUD do jogo usa ilhas flutuantes, sem header de largura total; câmeras
  manuais não fazem parte do modo jogável e permanecem no laboratório.
- `/3d` já nasce de uma partida autoritativa real e não usa mais
  `demoGame()`.
- A sessão de validação ocupa os seis assentos: Lorenzo e cinco bots.
- Na home, a partida local permite escolher de um a cinco bots antes de entrar
  no salão; a revanche conserva essa composição.
- A camada HTML existente já envia ações, alvos, contestações, bloqueios,
  revelações e trocas ao mesmo `dispatchGame()` usado pela mesa 2D.
- A mesa 3D é a apresentação padrão de partidas novas e retomadas. A mesma
  partida alterna entre 2D e 3D na mesma URL: "Mesa 2D" no painel da Corte e
  "Mesa 3D" na gamebar 2D, preservando sala, crônica e relógio. O WebGL entra
  por import dinâmico somente quando a partida 3D começa; ao voltar ao 2D a
  cena é descartada. A saída do 3D encerra a sessão pelo mesmo fluxo da mesa
  2D, e a revanche respeita o anfitrião no online.
- A instância WebGL é preservada entre comandos; novos estados usam
  `CoupTableScene.sync()` em vez de reconstruir todo o palco.
- O laboratório não executa bots nem avança a partida e só fica disponível
  após uma chave de acesso ser consumida e persistida no navegador.
- O salão e seus assets não carregam na home nem nas telas de sala; o início
  da partida padrão dispara o carregamento sob demanda. Quem alterna para 2D
  libera a cena e pode voltar ao 3D sem alterar o estado autoritativo.
- O multiplayer 2D hospedado foi exercitado em 22/07/2026 entre Chrome anônimo
  no desktop e Brave no Android, na mesma sala. O Android host encerrou a
  partida, mas o desktop convidado perdeu/rejeitou a visão terminal e ficou no
  relógio zerado. O payload final foi corrigido e `0ea96f9` implantou
  recuperação condicional de estado, ACK/retry idempotente de jogadas e
  repetição da coleta de handover, sem polling durante uma partida saudável.
  Todas as migrations foram aplicadas e o sintoma parou de ocorrer; o caso está
  encerrado até haver nova evidência. Ainda faltam testes ponta a ponta com
  perda seletiva, troca 2D/3D, chat, reações, reconexão e handover.

### HUD e comunicação

- A narrativa explica ações públicas e inclui progresso de respostas coletivas.
- Perda de influência e troca da Embaixadora são escolhidas diretamente na
  bancada 3D. Uma doca compacta confirma a troca e a lista HTML permanece como
  fallback acessível; os demais modais preservam a composição compacta.
- A barra de ações permanece deliberadamente em HTML: a faixa 2D é mais
  compacta e legível do que sete placas volumétricas sobre a bancada. Já
  contestações e bloqueios usam efígies clicáveis ao redor da carta pública,
  numa composição efígie–carta–efígie. “Ver contexto” abre o fluxo HTML
  acessível sem acrescentar um controle flutuante sobre o ambiente. Depois de
  escolher Roubar, Assassinar ou Golpe, a câmera abre a mesa e os
  assentos válidos recebem destaque e uma área ampla de toque; a lista HTML
  permanece como fallback acessível. O primeiro toque apenas pré-seleciona: a
  doca mostra ação e nome do rival, e uma confirmação explícita envia a
  jogada. Em mobile portrait, um rival é focalizado por vez e “Próximo rival”
  percorre inclusive leste e oeste sem reduzir todos a miniaturas. Alegações
  sem alvo usam um plano radial do ator para o centro, preservando carta
  pública, efígie e itens da mesa.
- O painel recolhível da Corte mostra moedas, influências ativas, reveladas e
  desconectados; clicar em um nome foca o assento e voltar restaura o Auto.
- Tema, sons, vozes e acesso ao laboratório vivem no painel da Corte.
- O chat multiplayer ocupa uma ilha própria e recolhe ações enquanto aberto.
- Reações efêmeras aceitam emojis e arremessos genéricos ou temáticos do Coup;
  não alteram as regras nem o estado autoritativo.
- A moeda arremessável e o tesouro usam a mesma peça genérica da corte. O ID
  de reação `duke_coin` permanece apenas como nome temático compatível com o
  catálogo e a rede; o modelo não carrega brasão nem propriedade do Duque.
- Decisões, chat e confirmação de saída recolhem a barra de ações. Corte e
  reações permanecem rápidas, mas não abrem simultaneamente.

### Ambiente e direção visual

- Salão palaciano completo com mesa, cadeiras, tapete, porta monumental,
  janelas, cortinas, colunas, teto, lustre, velas e decoração.
- Um panorama contínuo da cidade alimenta as duas janelas, com versões diurna
  e noturna.
- As janelas têm cruzetas e montantes internos, projetam luz recortada no piso
  e os candelabros dos nichos participam do humor de luz. O balanço tonal
  preserva os veios do mármore durante o dia e os meios-tons do salão à noite.
- A porta monumental usa ferragens instanciadas, acrescentando relevo sem uma
  chamada de desenho por cravo.
- Materiais, paleta, cartas e personagens públicos derivam das artes 2D.
- Ações usam artes próprias; alegações públicas podem exibir carta e efígie 3D.
- Os elementos centrais se mantêm voltados e separados em relação à câmera.

### Câmeras e responsividade

- Atos gerais: Auto, Mesa, Duelo, Zenital e Portal.
- POV pode percorrer todos os assentos.
- A visão Jogador enquadra boneco, influências privadas, moedas e placa.
- Cada ato aceita composição específica para portrait.
- As influências padrão ficam sempre centralizadas à frente do personagem,
  usando em todas as telas a composição antes exclusiva do portrait.
- [Implementado; validação visual pendente] A própria influência aceita
  foco cinematográfico por clique/toque, e o hover sobre as moedas mostra o
  saldo do tesouro acima da pilha.
- O tesouro representa a quantia autoritativa exata. Como dez moedas obrigam
  Golpe, a composição normal usa cinco posições irregulares em até duas
  camadas; corpo, aro e selo usam `InstancedMesh`, sem uma chamada de desenho
  por moeda.
- Ganho, gasto, roubo e reembolso produzem trajetórias de moedas derivadas do
  log autoritativo. A quantidade do roubo é a efetivamente transferida, e a
  câmera segura um plano de bancada até o fim do movimento; em portrait, o
  roubo usa um plano elevado que mantém a rota entre os assentos.
- O boneco local é visível e só desaparece quando a câmera ocupa o seu próprio
  POV.
- Quando chega a vez local, o modo jogável escolhe automaticamente a câmera
  Jogador; câmeras manuais continuam exclusivas do laboratório.

### Performance

- Perfis Cinemático, Equilibrado e Performance são reproduzíveis por URL.
- Cenários, retratos e artes de ação são servidos em WebP (originais no repo,
  `scripts/optimize-images.sh`); as artes de ação aquecem em idle após a cena
  abrir, sem entrar no orçamento da home ou da mesa 2D.
- O benchmark registra FPS, percentis, resolução, DPR, draw calls, triângulos,
  luzes, sombras, tema, câmera e orientação.
- Qualidade reduz resolução, não conteúdo essencial da partida.

## Próximos passos, em ordem

### 1. Transformar o laboratório em uma partida jogável

- [Concluído] Alimentar `CoupTableScene.sync()` com a partida real, removendo a
  dependência de `demoGame()`.
- [Concluído] Manter uma única instância do motor autoritativo para
  as mesas 2D e 3D.
- [Concluído] Conservar reconexão, handover de host, relógios e revanche sem lógica
  específica no renderer.
- [Concluído] Usar o 3D como apresentação padrão e permitir alternar para 2D e
  voltar ao 3D na mesma URL, sem perder sala ou partida. O carregamento pesado
  continua dinâmico e só começa ao entrar numa partida 3D.

### 2. Criar a camada de decisões do jogador

- [Concluído] Reutilizar os controles HTML existentes sobre o canvas para
  renda, ajuda, imposto, roubo, troca, assassinato e golpe.
- [Concluído] Reutilizar os fluxos de alvo, contestação, bloqueio, perda de
  influência e troca de cartas.
- [Concluído] Fazer a visão Jogador aparecer quando a decisão for privada ou local.
- [Concluído para perda e troca] Manter alternativas HTML acessíveis mesmo
  quando houver seleção por toque ou raycast sobre objetos 3D.
- [Concluído para alvos] Selecionar o rival tocando em qualquer parte ampla do
  assento 3D em Roubar, Assassinar e Golpe; alvos inválidos não recebem
  destaque, a doca exige confirmação com o nome do rival e a lista HTML
  continua disponível como fallback. Em portrait, a confirmação focaliza um
  rival por vez e permite avançar circularmente por todos os assentos.
- [Implementado e validado visualmente] Contestar, permitir e bloquear por
  efígies clicáveis no centro. Quando há dois papéis de bloqueio, ambos ficam
  agrupados de um lado da carta e “Permitir” ocupa o outro. O enquadramento é
  recalculado pelas posições atuais dos objetos, em vez de assumir coordenadas
  fixas. O primeiro toque arma e aproxima efígie+carta; o segundo toque na
  mesma efígie confirma. Tocar outra troca a escolha e tocar fora cancela.
- Nunca exigir precisão de clique em um objeto pequeno para concluir uma ação.

### 3. Implementar o diretor automático de câmera

- [Concluído] Mesa para estado geral e início de turno.
- [Concluído] Jogador para o turno e decisões locais, incluindo perda e troca
  próprias.
- [Concluído] Duelo para alegações, contestações e bloqueios entre assentos,
  parametrizado pelos dois envolvidos (`camera-director.js`, puro e testado).
- [Concluído] Enquadramento da vítima para assassinato, golpe e perda pública
  (ato `evidence` apontado ao assento) e troca rival testemunhada.
- [Concluído] Vitória no centro do salão: câmera entra pelo vão entre cadeiras,
  o vencedor encara a lente e reações nascem do corpo promovido, não do
  assento vazio. No pós-partida, vivos e eliminados podem se alvejar; Corte,
  Reações, Saída e Chat compartilham prioridade e não cobrem o resultado ao
  mesmo tempo.
- [Concluído] Intervenção central para contestações e bloqueios locais; o foco
  acompanha posição e abertura do conjunto efígie–carta–efígie. O motor pode
  redirecionar um cinemático em curso sem reiniciar sua duração, evitando que
  a câmera termine na antiga posição de uma carta movida pela recomposição.
- [Concluído] Respeitar override manual e voltar ao Auto pelo painel da Corte;
  o corte só acontece quando a chave ato+assentos muda entre snapshots.
- Evitar cortes que atravessem teto, porta, cadeiras, personagens ou cartas:
  nenhum plano dirigido entra no miolo da mesa (raio ≥ 6, testado) nem sai do
  salão (raio ≤ 11,5). `npm run capture:3d` captura a matriz completa
  (incluindo intervenções × desktop/portrait/paisagem × dia/noite) via `/3d/lab?shot=`,
  headless, em `captures/`. Validação de 21/07/2026: Mesa, Jogador, POV,
  Zenital, Portal, vítima e duelos desktop aprovados; em portrait o duelo usa
  over-the-shoulder vertical (o eixo horizontal não cabia no quadro).
  Segunda rodada: confronto solo e trono reenquadrados como frontais de raio
  longo (rosto e placa legíveis, vizinho fora do primeiro plano) e aprovados
  nas três orientações; falta iluminar/aproximar o rival distante do duelo
  portrait, que se perde no escuro do fundo.
- Consequência assumida do raio mínimo: em planos solo (confronto/trono) a
  carta de ação central pode sair do quadro — a HUD carrega a informação e o
  cinemático de clique recupera a leitura. Refinos anotados: puxar o alvo dos
  planos solo levemente ao centro, e luz dirigida ao assento enquadrado no
  tema noturno (confronto solo e trono ainda ficam escuros).
- [Concluído] Clique/toque na carta de ação central abre um cinemático de
  leitura; o Auto retoma após 6 s ou com um segundo toque. A narrativa HTML
  continua sendo a alternativa acessível.
- [Concluído] Influência revelada rende retrato monocromático "morto" na mesa
  3D, distinguindo à distância quem ainda joga.

### 4. Tornar a bancada individual funcional

- [Concluído] Destacar cartas selecionáveis sem alterar sua identidade visual.
- [Concluído] Animar gasto, recebimento, roubo, transferência e reembolso de
  moedas a partir dos eventos autoritativos, sem repetir o histórico ao montar
  ou retomar a cena.
- [Concluído] Mostrar com clareza influência ativa, revelada e escolhida.
- [Concluído] Reservar áreas estáveis para mão, tesouro, nome e ações em
  portrait e landscape; a mão padrão agora usa a mesma posição central nos
  dois formatos.
- [Concluído] Exibir e selecionar as opções temporárias da Embaixadora sem
  enviar esses segredos ao renderer dos rivais.
- [Implementado; validação visual pendente] Foco aproximado da própria
  influência e indicador de saldo sobre o tesouro.
- [Implementado; validação visual pendente] Modelar e empilhar a quantia exata
  do tesouro, sem o antigo limite visual de sete moedas e sem custo linear de
  draw calls.

### 5. Atuação e feedback da partida

- [Concluído] Virada e revelação de influência perdida.
- [Concluído] Entrada e saída da carta/efígie pública no centro, com elevação,
  escala e pulso curto na troca da alegação.
- [Concluído] Reações corporais procedurais a alegação, desafio, bloqueio,
  prova, derrota e vitória; `prefers-reduced-motion` elimina os gestos.
- [Parcial] Emojis e objetos arremessáveis entre assentos; o repertório ainda
  pode ganhar reações específicas por objeto.
- [Concluído] Movimento de moedas ligado ao evento autoritativo já resolvido,
  com quantidade real, cascata curta e plano de câmera preservado.
- Integrar as falas existentes com os atos visuais, sem repetir áudio em
  snapshots equivalentes.
- [Concluído] Foley sintetizada e deduplicada para alegação, bloqueio,
  contestação, derrota, vitória, moedas, cartas e arremessos, ligada aos mesmos
  eventos públicos das animações e respeitando o mute existente.
- Som ambiente do salão (velas, lareira, murmúrio da cidade nas janelas, com
  variação dia/noite). Regras: os assets de áudio 3D
  só carregam ao entrar no salão, respeitam os mutes de sons/vozes existentes
  e usam loops curtos para não inflar o orçamento.
- [Concluído] `prefers-reduced-motion` encurta transferências, torna transições
  imediatas e remove bobbing e gestos corporais não essenciais.

### 6. Customização dos cortesãos

- Definir um modelo de aparência separado das influências: pele, cabelo,
  roupa, detalhes e paleta.
- Persistir a escolha do jogador e sincronizar apenas dados cosméticos.
- Garantir silhueta legível e custo gráfico previsível.
- Não permitir acessórios que imitem os cinco papéis ou comuniquem informação
  estratégica falsa.
- Começar com combinações paramétricas dos modelos atuais antes de introduzir
  modelos GLTF mais pesados.

### 7. Mobile e acessibilidade

- Validar portrait em larguras de 320, 360, 390 e 430 px, com safe areas.
- Validar landscape em celulares baixos, sem cobrir mão ou decisões.
- Ajustar tamanho mínimo de toque e rolagem das faixas de câmera/atos.
- [Concluído] A Corte abre como gaveta horizontal no mesmo ancoramento das
  Reações; as duas são mutuamente exclusivas. Cada jogador ocupa um cartão de
  duas linhas cujo bloco inteiro — nome, moeda e influências — é um único botão
  de foco. A segunda linha usa o ícone `◆` e as duas cartas; jogadores e
  preferências permanecem numa única faixa rolável em todas as resoluções.
- [Idealização] Oferecer jogabilidade integral por teclado quando o canvas
  estiver focado: **Setas** percorrem espacialmente apenas objetos válidos do
  ato atual; **Espaço** inspeciona ou arma a escolha; **Enter** confirma a
  intenção armada; **Escape** cancela a confirmação, fecha contexto ou retorna
  ao enquadramento anterior.
- [Idealização] O foco de teclado deve acompanhar o mesmo objeto durante
  animações e recomposições da mesa, mostrar um anel persistente e anunciar em
  região `aria-live` o nome, disponibilidade e instrução seguinte. Nenhuma
  ação irreversível pode ocorrer apenas ao mover o foco.
- [Idealização] A ordem deve nascer da posição projetada dos objetos, não da
  ordem de criação no Three.js: esquerda/direita escolhem o vizinho visual e
  cima/baixo alternam entre palco, bancada e faixas 2D. Fora do canvas, as
  teclas preservam o comportamento normal do navegador.
- Testar texto ampliado, contraste, movimento reduzido e essa navegação por
  teclado em desktop e dispositivos com teclado externo.
- Expor estado e ações relevantes a leitores de tela na camada HTML.
- Não bloquear orientação; oferecer apenas uma recomendação de landscape para
  a visão geral.

### 8. Orçamento e otimização

- Gravar baselines separados para desktop, Android e iOS no perfil Cinemático.
- Definir um piso de gameplay para mobile antes de alterar a cena por perfil.
- Investigar draw calls, sombras, overdraw, materiais e texturas por câmera.
- Instanciar geometrias repetidas e congelar matrizes de objetos estáticos.
- Carregar artes e panorama sob demanda e verificar descarte ao trocar tema.
- Considerar resolução dinâmica somente se nomes, cartas e estados continuarem
  inequívocos.
- Registrar regressões de FPS junto com câmera, orientação e ato testado.

### 9. Robustez e validação visual

- Tratar perda e restauração de contexto WebGL.
- Criar capturas de referência para dia/noite, portrait/landscape e todos os
  atos de câmera.
- Testar partidas de 2 a 6 jogadores, eliminados e desconectados.
- Verificar sistematicamente oclusão entre bonecos, cartas, moedas, placa,
  lustre, porta e teto.
- Confirmar que nenhuma textura ou arte privada rival chega à GPU antes da
  revelação.

### 10. Consolidar o motor comum

O plano completo vive em `MOTOR-COMPARTILHADO.md`, que é o dono único do
assunto: genealogia das duas bases, mapa por módulo, fila de fusão, fases até
o repositório próprio e o que a segurança exige antes de publicar. As quatro
linhas que estavam aqui viraram as fases 2 e 3 de lá.

O que continua sendo deste ciclo: manter ambiente, atores, regras e projetores
de La Corte fora do núcleo comum.

## Próximo ciclo recomendado

1. Validar visualmente em desktop e mobile o foco da mão privada, o indicador
   de tesouro e as pilhas exatas de moedas; ajustar enquadramento e posição se
   necessário.
2. [Concluído e validado visualmente] Contestações e bloqueios usam efígies
   clicáveis, confirmação diegética em dois toques, foco vivo e contexto HTML
   acessível.
3. [Concluído] Animar gasto, recebimento, roubo, reembolso e transferência de
   moedas a partir dos eventos autoritativos já resolvidos.
4. Exercitar multiplayer 3D ponta a ponta: troca 2D/3D, chat, reações,
   reconexão, handover e perda seletiva de Broadcasts. O incidente terminal
   anterior está encerrado e só deve ser reaberto com nova evidência.
5. Validar 3 a 6 jogadores, benchmark, oclusões e falhas/restauração de contexto
   em desktop, Android e iOS.

Customização avançada, animações elaboradas e novos assets devem vir depois
desse ciclo. Primeiro precisamos provar que uma partida completa pode ser
jogada no palco 3D sem perder sigilo, clareza ou continuidade online.

## Critério de conclusão da primeira versão jogável

- Uma partida completa contra bots pode começar, terminar e reiniciar em 3D.
- Todas as decisões podem ser tomadas em desktop e mobile portrait.
- A mesa online conserva reconexão e autoridade do host.
- Nenhum segredo rival é enviado ao renderer.
- Cartas, moedas, nomes, alvos e estados permanecem legíveis no perfil mínimo
  aceito para gameplay.
- Existe fallback funcional para WebGL indisponível ou perdido.
- O benchmark não apresenta regressão relevante contra o baseline aprovado.
