// O último evento da crônica ancora a chave: decisões distintas na mesma fase
// e turno (ex.: duas perdas de influência num assassinato contestado) são
// sempre separadas por um evento novo, enquanto os passes de uma janela
// coletiva não geram evento e preservam o relógio compartilhado.
export function decisionClockKey(game) {
  return `${game.turn}|${game.phase}|${JSON.stringify(game.log?.at(-1) ?? null)}`;
}
