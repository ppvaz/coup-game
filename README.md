# La Corte

La Corte é uma experiência premium de blefe e influência inspirada nas mecânicas de Coup. O projeto roda localmente no navegador, com bots, salas na rede local e uma direção de arte original de intriga renascentista.

![La Corte — mesa em tema claro](assets/council-chamber-light.png)

## O que já existe

- Partidas de 2 a 6 jogadores, com três bots na partida solo.
- Salas multiplayer por código curto e links no formato `/sala/SW8X4`.
- Servidor WebSocket local para sincronizar lobby, início da partida e ações.
- Renda, Ajuda Externa, Imposto, Roubo, Troca, Assassinato e Golpe.
- Influências, moedas, eliminação, turnos e vitória.
- Contestações de alegações contra bots; bots também podem contestar alegações do jogador.
- Bloqueios de Ajuda Externa, Roubo e Assassinato na experiência contra bots.
- Cartas reveladas com retratos e memória pública das influências perdidas.
- Crônica da corte, com os eventos mais recentes e contexto dentro dos modais de decisão.
- Tema escuro e tema claro “pergaminho imperial”, persistidos no navegador.
- Interface responsiva e assets originais: cenário noturno/diurno, cinco personagens e favicon.

## Executar localmente

Pré-requisito: Node.js 18 ou superior.

```bash
npm install
npm run dev
```

Abra [http://localhost:8099](http://localhost:8099).

Para jogar em outro dispositivo na mesma rede, descubra o IP da máquina anfitriã e compartilhe, por exemplo:

```text
http://10.0.0.43:8099
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
http://SEU-IP:8099/sala/SW8X4
```

## Regras implementadas

O objetivo é ser o último jogador com influência. Cada jogador começa com duas influências e duas moedas.

| Ação | Efeito | Pode ser bloqueada |
| --- | --- | --- |
| Renda | Recebe 1 moeda | Não |
| Ajuda Externa | Recebe 2 moedas | Duque, por qualquer rival |
| Imposto | Alegue Duque e receba 3 moedas | Contestável |
| Roubo | Alegue Capitão e retire até 2 moedas de um alvo | Capitão ou Embaixador, pelo alvo |
| Troca | Alegue Embaixador e troque influências | Contestável |
| Assassinato | Alegue Assassina, pague 3 moedas e elimine uma influência | Condessa, pelo alvo |
| Golpe | Pague 7 moedas e elimine uma influência | Não |

Com 10 moedas ou mais, o Golpe é obrigatório. Uma alegação de personagem pode ser um blefe e pode ser contestada. Quem perde uma contestação revela uma influência; se a alegação era verdadeira, a carta volta ao baralho e é substituída.

## Desenvolvimento

```bash
npm test
npm run check
```

Os testes cobrem o motor genérico de Coup, códigos de sala, controle do anfitrião e migração de host.

## Estrutura

```text
app.js             Interface e integração da mesa
server.js          Servidor HTTP + WebSocket para desenvolvimento local
src/game/coup.js   Máquina de estados genérica das regras
src/rooms/room.js  Estado genérico de sala, assentos e host
assets/            Cenários, personagens e favicon originais
test/              Testes do motor e das salas
```

## Publicação na Vercel

O servidor WebSocket atual é propositalmente local e não roda em funções serverless da Vercel. Antes de publicar uma versão multiplayer, a camada de salas deve migrar para um serviço de conexão persistente, como Supabase Realtime.

A interface está pronta para deploy estático; o plano é substituir o transporte local mantendo os motores em `src/game` e `src/rooms` como fonte de verdade.

## Licença e créditos

La Corte é um projeto não oficial inspirado na estrutura de blefe de Coup. As artes da interface e dos personagens neste repositório são originais e não reutilizam ilustrações comerciais do jogo.
