# La Corte

La Corte é uma experiência premium de blefe e influência inspirada nas mecânicas de Coup. O projeto roda localmente no navegador, com bots, salas na rede local e uma direção de arte original de intriga renascentista.

![La Corte — mesa em tema claro](assets/council-chamber-light.png)

## O que já existe

- Partidas de 2 a 6 jogadores, com três bots na partida solo.
- Salas multiplayer por código curto e links no formato `/sala/SW8X4`.
- Salas privadas sincronizadas por Supabase Realtime, com cadeiras vinculadas ao Supabase Auth.
- Renda, Ajuda Externa, Imposto, Roubo, Troca, Assassinato e Golpe.
- Influências, moedas, eliminação, turnos e vitória.
- Contestações de alegações contra bots; bots também podem contestar alegações do jogador.
- Bloqueios de Ajuda Externa, Roubo e Assassinato na experiência contra bots.
- Cartas reveladas com retratos e memória pública das influências perdidas.
- Crônica da corte, com os eventos mais recentes e contexto dentro dos modais de decisão.
- Relógios por fase com jogada conservadora automática para jogadores ausentes.
- Reconexão, retomada da cadeira e promoção automática de anfitrião sem expor as mãos privadas.
- Sons sintetizados para turno, alerta de tempo e resultado, com mute persistente.
- Chat cifrado da mesa com provocações rápidas, histórico, contador e proteção contra spam.
- Tema escuro e tema claro “pergaminho imperial”, persistidos no navegador.
- Interface responsiva e assets originais: cenário noturno/diurno, cinco personagens e favicon.
- Apresentação 3D jogável e opcional, carregada somente ao entrar explicitamente
  na experiência, com a mesma partida autoritativa e as mesmas decisões da
  interface 2D.

## Executar localmente

Pré-requisito: Node.js 20.19 ou superior, ou Node.js 22.12 ou superior.

```bash
npm install
npm run dev
```

Abra [http://localhost:5173](http://localhost:5173), ou use o endereço exibido pelo Vite no terminal.

### La Corte 3D

Abra [http://localhost:5173/3d](http://localhost:5173/3d) para jogar a versão
WIP da mesa 3D. O salão usa o mesmo motor de regras e a mesma partida da mesa
2D; o WebGL apenas projeta e encena o estado já decidido. A HUD oferece ações,
decisões, crônica, painel da Corte, chat multiplayer e reações efêmeras sem
revelar influências privadas dos adversários.

Os assets e módulos 3D são importados apenas depois de uma navegação explícita
para `/3d`; visitar a home ou jogar em 2D não inicializa o salão. Depois de
carregada, a cena é preservada entre atualizações da partida. Dia e noite usam
a mesma preferência da interface 2D.

O laboratório técnico fica em `/3d/lab` e não avança uma partida. Para liberar
seu botão, configure `VITE_CORTE_3D_LAB_KEY` e visite uma vez:

```text
http://localhost:5173/?labKey=SUA_CHAVE
```

A chave da URL é consumida, removida do endereço e a permissão fica registrada
no `localStorage` do navegador. Em desenvolvimento, quando a variável não está
definida, a chave padrão é `corte-lab`. Benchmark, perfis gráficos e câmeras
manuais existem somente no laboratório. A arquitetura e a barreira de sigilo
estão em [`docs/tabletop-engine.md`](docs/tabletop-engine.md).

Para abrir em outro dispositivo na mesma rede, execute `npm run dev:lan`, descubra o IP da máquina anfitriã e compartilhe, por exemplo:

```text
http://10.0.0.43:5173
```

O firewall do sistema pode pedir autorização para conexões de entrada.

Esse acesso por HTTP serve para a interface e para partidas contra bots. As
salas multiplayer cifram as visões privadas com `SubtleCrypto`, que os
navegadores só liberam em contexto seguro — `localhost` ou HTTPS. Para testar
salas em outro dispositivo, use um túnel HTTPS (por exemplo `ngrok` ou
`cloudflared`) ou um certificado local confiável apontando para o dev server.

## Criar ou entrar em uma sala

1. Informe seu nome na tela inicial.
2. Escolha **Criar sala**.
3. Compartilhe **Copiar link da sala** com os demais jogadores.
4. Quem abrir o link entra no fluxo com o código já preenchido.
5. O anfitrião inicia a partida quando houver pelo menos dois jogadores.

Os links seguem o padrão:

```text
http://SEU-IP:5173/sala/SW8X4
```

## Modelo de confiança do multiplayer

As salas online são hospedadas pelo navegador do anfitrião: é ele quem guarda o
estado completo, embaralha o baralho e envia a cada jogador uma visão cifrada
contendo apenas a própria mão. Duas consequências práticas:

- O anfitrião tem acesso técnico a todas as mãos (DevTools ou armazenamento da
  sessão), como quem embaralha um baralho físico poderia espiar as cartas.
- A entrada continua sem cadastro visível, mas cada cadeira é um usuário anônimo
  do Supabase Auth. O banco vincula cadeira, conexão e chave de cifra a
  `auth.uid()`; o remetente dos Broadcasts é injetado por uma RPC, não aceito do
  payload do navegador.

RLS restringe Broadcast e Presence aos membros do canal privado. Isso impede
que alguém apenas imite o ID de outra cadeira, mas não transforma o host em um
servidor confiável: o formato atende partidas casuais. Jogo competitivo com
desconhecidos ainda exige tirar regras, sorteio e snapshots autoritativos do
cliente, por exemplo para um servidor ou Edge Function.

## Regras implementadas

O objetivo é ser o último jogador com influência. Cada jogador começa com duas influências e duas moedas; em uma
partida de dois jogadores, quem começa recebe apenas uma moeda. Nas revanches, o vencedor anterior começa.

| Ação          | Efeito                                                    | Pode ser bloqueada                |
| ------------- | --------------------------------------------------------- | --------------------------------- |
| Renda         | Recebe 1 moeda                                            | Não                               |
| Ajuda Externa | Recebe 2 moedas                                           | Duque, por qualquer rival         |
| Imposto       | Alegue Duque e receba 3 moedas                            | Contestável                       |
| Roubo         | Alegue Capitão e retire até 2 moedas de um alvo           | Capitão ou Embaixadora, pelo alvo |
| Troca         | Alegue Embaixadora e troque influências                   | Contestável                       |
| Assassinato   | Alegue Assassina, pague 3 moedas e elimine uma influência | Condessa, pelo alvo               |
| Golpe         | Pague 7 moedas e elimine uma influência                   | Não                               |

Com 10 moedas ou mais, o Golpe é obrigatório. Uma alegação de personagem pode ser um blefe e pode ser contestada. Quem perde uma contestação revela uma influência; se a alegação era verdadeira, a carta volta ao baralho e é substituída.

## Desenvolvimento

```bash
npm test
npm run check
```

Os testes cobrem o motor genérico de Coup, códigos de sala, presença, retomada
da cadeira, eleição e migração de host, reconstrução da partida, chat,
validação dos envelopes de rede, criptografia das visões privadas, projeção
segura da mesa 3D, acesso ao laboratório, benchmark e reações.

## Estrutura

```text
app.js                         Orquestração da aplicação, partidas e transportes
src/game/                      Regras, bots e reconstrução autoritativa
src/rooms/                     Sala, Auth, presença, sessão, chat e continuidade
src/lib/secure-channel.js      Criptografia das visões privadas no Broadcast
src/lib/tabletop/              Projeção, compositor e ferramental específicos do 3D
src/ui/                        Views HTML compartilhadas e interface da mesa 3D
packages/tabletop-stage/       Motor WebGL comum, sem regras ou tema de Coup
assets/                        Cenários, personagens, ações, vozes e favicon
test/                          Testes de regras, salas, segurança e apresentação
```

O que dentro dessa estrutura é motor reaproveitável por outros jogos da equipe e o que é Coup nativo
está mapeado em [MOTOR-COMPARTILHADO.md](MOTOR-COMPARTILHADO.md).

## Publicação na Vercel

O projeto usa Vite e pode ser publicado diretamente na Vercel. Adicione estas variáveis de ambiente no projeto, para os ambientes **Production**, **Preview** e **Development**:

```text
VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_sua-chave-publica
```

Projetos antigos que ainda usam `VITE_SUPABASE_ANON_KEY` continuam
compatíveis, mas a chave publicável é a opção atual recomendada. Após salvar as
variáveis, faça um novo deploy. A rota `/sala/*` já possui rewrite para a
aplicação e as salas usam Supabase Realtime. Nunca configure uma chave secreta
ou `service_role` na Vercel ou no navegador.

Antes de usar o multiplayer no projeto Supabase:

1. Em **Authentication > Providers**, habilite **Anonymous Sign-Ins**.
2. Aplique todos os arquivos de [`supabase/migrations/`](supabase/migrations/) na ordem do nome, pelo SQL Editor, ou execute `supabase db push` em um projeto ligado à CLI. As migrations posteriores corrigem a entrada na sala, autorizam o Broadcast da RPC e habilitam recuperação de estado e ACK de jogadas; aplicar somente a primeira deixa o cliente e o banco incompatíveis.
3. Em **Realtime Settings**, desabilite o acesso público a canais. A aplicação já assina `la-corte:*` com `private: true`, e a migration permite Broadcast/Presence somente aos membros autenticados.
4. Faça o deploy e valide criar, entrar, reconectar e promover o anfitrião em duas sessões de navegador.

Sem as migrations e o login anônimo habilitado, salas online falham de forma
fechada; partidas locais e contra bots continuam disponíveis. Usuários anônimos
contam como usuários Auth e devem entrar na política de retenção/limpeza do
projeto se a aplicação ganhar uso contínuo.

## Licença e créditos

La Corte é um projeto não oficial inspirado na estrutura de blefe de Coup. As artes da interface e dos personagens neste repositório são originais e não reutilizam ilustrações comerciais do jogo.
