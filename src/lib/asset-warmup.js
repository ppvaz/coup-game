// O cenário do tema ativo é visível assim que a casca renderiza; retratos só
// aparecem em partida, então aquecem depois, sem disputar a primeira pintura.
// O cenário do tema inativo fica de fora: o CSS o busca se o tema mudar.
export function warmupPlan({ theme, chambers, portraits }) {
  return {
    immediate: [theme === 'light' ? chambers.light : chambers.dark],
    idle: Object.values(portraits),
  };
}
