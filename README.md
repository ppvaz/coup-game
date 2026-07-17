# La Corte

Uma experiência premium de jogo de influência inspirada nas mecânicas de Coup, feita para rodar localmente no navegador.

## Executar

```bash
npm install
npm run dev
```

Abra `http://localhost:8099`. Para acessar de outro dispositivo na mesma rede, use `http://SEU-IP-LOCAL:8099` (o firewall do sistema pode pedir autorização).

## Incluído

- Partida funcional contra três bots
- Salas multiplayer via código de cinco caracteres e WebSocket local
- Ações de renda, ajuda externa, imposto, roubo, troca, assassinato e golpe
- Influências, moedas, eliminação, turnos e condição de vitória
- Layout responsivo e arte original

O computador que executa `npm run dev` funciona como servidor da mesa. Todos os dispositivos precisam estar na mesma rede local e acessar o mesmo IP e porta.
