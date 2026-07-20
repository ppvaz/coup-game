# La Corte

La Corte é uma experiência premium de blefe e influência inspirada nas mecânicas de Coup. O projeto roda localmente no navegador, com bots, salas na rede local e uma direção de arte original de intriga renascentista.

![La Corte — mesa em tema claro](assets/council-chamber-light.png)

## O que já existe

- Partidas de 2 a 6 jogadores, com três bots na partida solo.
- Salas multiplayer por código curto e links no formato `/sala/SW8X4`.
- Salas sincronizadas por Supabase Realtime, prontas para domínio público.
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

## Executar localmente

Pré-requisito: Node.js 18 ou superior.

```bash
npm install
npm run dev
```

Abra [http://localhost:5173](http://localhost:5173), ou use o endereço exibido pelo Vite no terminal.

### Laboratório de mesa 3D

Abra [http://localhost:5173/3d](http://localhost:5173/3d) para explorar o
protótipo de salão 3D. Ele encena os principais momentos de Coup sobre um motor
gráfico desacoplado das regras, com ambientes diurno e noturno ligados à mesma
preferência de tema da mesa 2D. O salão e as efígies 3D dos papéis derivam a
paleta, os materiais e as silhuetas das artes 2D originais. A arquitetura e a barreira de sigilo estão em
[`docs/tabletop-engine.md`](docs/tabletop-engine.md).

Para jogar em outro dispositivo na mesma rede, execute `npm run dev:lan`, descubra o IP da máquina anfitriã e compartilhe, por exemplo:

```text
http://10.0.0.43:5173
```

O firewall do sistema pode pedir autorização para conexões de entrada.

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

Os testes cobrem o motor genérico de Coup, códigos de sala, presença, retomada da cadeira, eleição e migração de host, reconstrução da partida, chat e criptografia das visões privadas.

## Estrutura

```text
app.js             Interface e integração da mesa
src/lib/supabase.js Cliente Supabase Realtime e configuração de conexão
src/lib/secure-channel.js Criptografia das visões privadas no Broadcast
src/lib/sounds.js Sons sintetizados e preferência de mute
src/game/coup.js   Máquina de estados genérica das regras
src/game/handover.js Reconstrução segura na troca de anfitrião
src/rooms/chat.js Normalização, histórico e proteção contra spam
src/rooms/room.js  Estado genérico de sala, assentos e host
src/rooms/session.js Retomada da cadeira após recarregar a aba
assets/            Cenários, personagens e favicon originais
test/              Testes do motor e das salas
```

## Publicação na Vercel

O projeto usa Vite e pode ser publicado diretamente na Vercel. Adicione estas variáveis de ambiente no projeto, para os ambientes **Production**, **Preview** e **Development**:

```text
VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co
VITE_SUPABASE_ANON_KEY=sua-chave-anon-publica
```

Após salvar as variáveis, faça um novo deploy. A rota `/sala/*` já possui rewrite para a aplicação e as salas usam Supabase Realtime. Nunca configure uma chave `service_role` na Vercel ou no navegador.

## Licença e créditos

La Corte é um projeto não oficial inspirado na estrutura de blefe de Coup. As artes da interface e dos personagens neste repositório são originais e não reutilizam ilustrações comerciais do jogo.
