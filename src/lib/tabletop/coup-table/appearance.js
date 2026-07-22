// Como um cortesão se parece. Separado de visual-theme.js de propósito: aquele
// módulo importa retratos e artes em .webp, o que o torna impossível de carregar
// fora de um bundler. A aparência precisa ser dado puro para poder ser testada,
// serializada e — mais adiante — escolhida pelo jogador.

export const ROBES = [0x52252c, 0x1e3a45, 0x3e3821, 0x352547, 0x23372b, 0x473221];

export const NOBLE_SKINS = [0xa46f55, 0x6e4939, 0xc19171];

/**
 * Enquanto a mesa era a única a construir bonecos, o assento resolvia o visual —
 * dois vizinhos nunca repetem manto nem tom de pele. Quem precisa de um boneco
 * fora de uma cadeira monta o descritor à mão e não passa por aqui.
 */
export function nobleAppearance(index = 0) {
  const seat = Math.max(0, Math.trunc(Number(index) || 0));
  return { robe: ROBES[seat % ROBES.length], skin: NOBLE_SKINS[seat % NOBLE_SKINS.length] };
}
