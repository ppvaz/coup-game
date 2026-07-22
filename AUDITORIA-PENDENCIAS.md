# Pendências da auditoria

Auditoria realizada em 18/07/2026 e atualizada em 22/07/2026. Este documento reúne os pontos que não são divergências das regras de Coup.

## Prioridade 0 — segurança do multiplayer

### Autenticar participantes e cadeiras

**Concluído e implantado em 22/07/2026:** o navegador usa
Supabase Anonymous Auth; `create_coup_room`/`join_coup_room` associam a cadeira
a `auth.uid()`; o canal é privado; e RLS limita Realtime aos membros. Toda
publicação de Broadcast passa por `broadcast_coup_room_event`, que deriva
`senderId`, `senderConnectionId` e os IDs de ator da sessão autenticada. A
Presence só é aceita quando conexão e chave pública coincidem com o registro do
banco. Uma partida manual no projeto hospedado usou duas sessões na mesma sala
(`ABYSM`), em Chrome anônimo no desktop e Brave no Android. O Android host
encerrou a partida, mas o convidado no desktop rejeitou a visão final e ficou
preso com o relógio zerado. A regressão nasceu quando a validação estrita de
`dd97859` passou a rejeitar os campos de relógio inválidos que o host anexava ao
estado terminal; `bbb5518`/`240c445` corrigiram e testaram esse payload. A
entrega `0ea96f9` adicionou recuperação autenticada por `state_sync_request`,
ACK/retry idempotente de comandos e repetição da coleta de handover. Todas as
migrations foram aplicadas e o sintoma original deixou de ocorrer; o incidente
fica encerrado e volta a ser investigado se reaparecer. Continuam pendentes a
injeção automatizada de perdas ponta a ponta e testes negativos adicionais de
RLS e tentativa de impersonação; Broadcast direto e a RPC autorizada já têm
cobertura de migration.

Na auditoria original, o canal Supabase Realtime era público e as identidades
eram declaradas pelo próprio cliente. Esse desenho permitia imitar outra
cadeira e potencialmente receber sua visão privada; Auth, RLS e remetentes
derivados no banco fecharam essa superfície no modelo atual.

Entrega:

1. Supabase Auth anônimo: implementado.
2. Canais privados e RLS para Broadcast/Presence: implementados na migration.
3. Cadeira e conexão vinculadas a `auth.uid()`: implementado por RPCs `security definer`.
4. IDs do remetente/ator derivados no banco: implementado; Broadcast direto do cliente é negado.
5. Servidor ou Edge Function autoritativa para adversários reais: continua pendente e faz parte do modelo de confiança do host.

### Explicitar o modelo de confiança do host

**Parcial, atualizado em 22/07/2026:** o README documenta Auth/RLS e o modelo (seção "Modelo de confiança do multiplayer").
Continua pendente, para jogo competitivo, tirar o estado autoritativo do cliente.

O navegador do host mantém o estado completo e pode ver todas as mãos pelo DevTools ou pelo `sessionStorage`.
Para partidas casuais entre conhecidos isso pode ser aceitável, mas precisa ser documentado. Para jogo competitivo,
o estado autoritativo deve sair do cliente ou usar um protocolo distribuído próprio para informação secreta.

## Prioridade 1 — validação e defesa no navegador

### Validar todos os envelopes de rede

**Concluído em 21/07/2026:** `src/rooms/network-schema.js` valida presença, chaves públicas, snapshots de sala,
envelopes cifrados, entrada, handover e conteúdos de chat; `src/game/network-schema.js` valida comandos e visões
completas da partida, inclusive relações entre jogadores e a redação dos segredos rivais. Todos os callbacks de
Broadcast e o sync de Presence rejeitam o valor antes de mutar estado. Desde 22/07, os schemas são combinados com
remetentes derivados de `auth.uid()` no banco e com o vínculo da conexão/chave de Presence.

Na auditoria, snapshots de sala, visões da partida, mensagens de handover e metadados de presença não tinham
validação estrutural completa. O fechamento exigia validar enums, UUIDs, strings, números, limites de arrays, versões
e relações entre IDs antes de alterar o estado, rejeitando estados inválidos em vez de tolerá-los na renderização.

### Reduzir a superfície de XSS

Nomes e chat já são escapados, mas IDs, personagens e outros campos presumidos como internos aparecem em templates
que terminam em `innerHTML`. Essa premissa deixa de valer quando o estado vem de um host ou canal comprometido.

- Escapar todos os campos dinâmicos conforme o contexto de HTML/atributo.
- Preferir criação de DOM ou `textContent` para dados não confiáveis.
- Avaliar Trusted Types.
- Adicionar testes com snapshots inteiros malformados, não apenas nomes hostis.

### Configurar headers na Vercel

O `vercel.json` só contém o rewrite da SPA. Implantar gradualmente:

- `Content-Security-Policy-Report-Only` e depois CSP efetiva;
- `frame-ancestors 'none'`;
- `X-Content-Type-Options: nosniff`;
- `Referrer-Policy`;
- `Permissions-Policy`.

O script inline de tema e os estilos inline gerados pelas views precisam ser considerados antes de endurecer a CSP.

### Tolerar perda de Broadcasts críticos

**Concluído e implantado em 22/07/2026; teste automatizado de falhas ainda pendente:** `state_sync_request` permite ao convidado pedir novamente sala, host e visão privada
cifrada quando o relógio expira, a partida/revanche não chega, a Presence diverge ou a troca de host fica incompleta.
O pedido é autenticado pela conexão, limitado no cliente e no host e nunca permite ao convidado avançar regras. Uma
reconciliação de fundo a cada 30 segundos cobre também a perda simultânea de todos os eventos de início ou revanche.
Ela só roda no lobby ou após o fim: durante uma partida saudável não há polling. O pedido leva as versões conhecidas,
e o host só reenvia a sala ou a visão privada quando houver divergência; a exceção é o relógio expirado, que pede
explicitamente uma atualização da fase.

Comandos enviados ao host agora levam `requestId`, `gameId` e versão-base. O convidado repete somente enquanto não
recebe `command_ack` nem uma versão autoritativa posterior; o host guarda recibos limitados e nunca aplica duas vezes
o mesmo pedido. A coleta do handover também é repetida a cada 400 ms durante a janela de promoção, e as respostas
continuam deduplicadas por jogador. Em uma partida saudável isso acrescenta um ACK pequeno por decisão do convidado,
sem polling; retries só existem depois de uma entrega perdida. Chat pode ser recuperado pelo histórico e reações são
efêmeras por definição. As migrations estão aplicadas e o cenário que motivou
a mudança não voltou a ocorrer no uso manual. Ainda falta automatizar o cenário
ponta a ponta descartando seletivamente cada Broadcast crítico.

## Prioridade 1 — performance

### Parar de carregar todas as imagens como prioridade alta

**Concluído em 21/07/2026:** só o cenário do tema ativo mantém prioridade alta; retratos aquecem em
`requestIdleCallback` com prioridade baixa (`src/lib/asset-warmup.js`); cenários, retratos e artes de ação são
servidos em WebP q85 (SSIM ≥ 0,97, validado visualmente), com os PNGs originais no repositório e
`scripts/optimize-images.sh` para regenerar. Tamanhos responsivos foram descartados de propósito: com ~0,73 MB
totais no 2D, a complexidade deixou de compensar. As artes de ação (exclusivas do 3D) aquecem em idle dentro da
própria cena, preservando o orçamento da home.

O carregamento inicial força aproximadamente 12,1 MB: cinco retratos e os dois cenários, inclusive o tema que não
está ativo. Isso penaliza principalmente celulares.

- Carregar somente o cenário do tema atual.
- Carregar retratos ao entrar na partida ou em tempo ocioso.
- Gerar AVIF/WebP e tamanhos responsivos.
- Não usar `fetchPriority = 'high'` para assets que ainda não aparecem.

### Limitar crescimento do estado

O log do host cresce sem limite e participa de `structuredClone`, serialização em `sessionStorage` e geração das
visões cifradas. Manter uma janela suficiente para interface, áudio e handover, ou separar histórico arquivado do
estado operacional.

### Evitar trabalho repetido em `syncViews`

**Parcial em 22/07/2026:** a visão agora é projetada uma vez por jogador e reutilizada entre as conexões presentes.
Ainda convém impedir sincronizações cifradas sobrepostas quando várias mudanças acontecem em sequência.

## Prioridade 2 — arquitetura e testes

### Reduzir o papel de `app.js`

O arquivo ainda concentra estado mutável, chat, comandos, relógio, bots, presença, eleição, handover, render e
bindings. Fronteiras sugeridas:

1. `RoomTransport`: Supabase, autenticação, schemas e envelopes.
2. `OnlineSessionController`: presença, reconexão, sala e handover.
3. `GameController`: comandos, relógio e sincronização das visões.
4. `UIController`: renderização e eventos.

### Cobrir a integração real

Os módulos importáveis têm ótima cobertura, mas `app.js` e o cliente Supabase não entram no relatório. Adicionar:

- testes de navegador para os fluxos principais;
- duas ou mais sessões automatizadas conectadas ao mesmo canal;
- reconexão e troca de host ponta a ponta;
- payloads malformados e tentativa de impersonação;
- CI executando testes, lint, Prettier e build.

### Valor da suíte atual

Em 22/07/2026 a suíte possui 217 testes e passa junto com lint, Prettier e
build. A classificação antiga de 112 testes (99 relevantes e 13 de baixo
risco) ficou obsoleta depois da autenticação, recuperação de estado, entrega
confiável e expansão da mesa 3D. A principal lacuna não é quantidade de testes
unitários: continua sendo a integração real de `app.js`, navegadores múltiplos,
Supabase e falhas seletivas de transporte.

## Prioridade 2 — ambiente e documentação

### Corrigir pré-requisito do Node

**Concluído em 21/07/2026:** README já pedia 20.19+/22.12+ e o `package.json` agora declara `engines.node`.

O README informa Node 18+, mas Vite 8 exige Node 20.19+ ou 22.12+.

### Corrigir a promessa de multiplayer pela LAN

**Concluído em 21/07/2026:** o README explica que a LAN em HTTP cobre interface e bots, e indica túnel HTTPS ou
certificado local para testar salas em outro dispositivo.

O acesso remoto indicado usa HTTP em um IP local. `SubtleCrypto`, necessário para o multiplayer, normalmente exige
HTTPS fora de `localhost`. Documentar que o modo LAN em HTTP serve para a interface/bots ou fornecer HTTPS local com
certificado confiável/túnel.

### Atualizar o mapa da estrutura

**Concluído em 21/07/2026:** o mapa do README já estava atualizado; Vite foi movido para `devDependencies` e
`engines.node` está declarado.

O README ainda não representa os módulos extraídos em `src/ui`, `connection.js`, `join.js`, `game-sync.js` e
`decision-clock.js`. Também vale mover Vite de `dependencies` para `devDependencies` e declarar `engines.node`.

### Organizar as folhas de estilo

`mobile.css` é maior que `styles.css` e contém vários overrides globais fora dos media queries. Separar base, temas,
componentes e responsividade deixaria a ordem de cascata mais explícita; não é uma urgência de runtime.

## Verificações positivas

- `npm audit`: nenhuma vulnerabilidade conhecida nas dependências no momento da auditoria.
- `.env.local` está ignorado e não há `service_role` versionada.
- A cifra usa ECDH P-256 e AES-GCM; o problema principal é autenticação de identidade, não o algoritmo simétrico.
- O bundle de JavaScript e CSS é pequeno; os assets de imagem são o gargalo dominante.
