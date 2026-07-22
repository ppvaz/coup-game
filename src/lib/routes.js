// As quatro rotas da aplicação vivem aqui em vez de virarem expressões
// regulares soltas no app.js. Além de deixarem de ser intestáveis, elas passam
// a ter um único lugar para crescer — o laboratório já pede sub-rotas.

const ROOM_PATH = /^\/sala\/([A-Z2-9]{5})\/?$/i;
const LAB_PATH = /^\/lab\/?$/;

export const LAB_ROUTES = Object.freeze(['lab']);

export function routeFromPath(pathname) {
  if (LAB_PATH.test(pathname)) return Object.freeze({ name: 'lab' });
  const room = pathname.match(ROOM_PATH);
  if (room) return Object.freeze({ name: 'room', code: room[1].toUpperCase() });
  return Object.freeze({ name: 'home' });
}

export const isLabRoute = (route) => LAB_ROUTES.includes(route?.name);
