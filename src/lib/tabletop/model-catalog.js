// Catálogo dos modelos que a mesa constrói. As fábricas ficam espalhadas por
// seis módulos e várias delas arrastam texturas em .webp, que nenhum ambiente
// fora do bundler consegue carregar. Por isso aqui só existe metadado — rótulo,
// categoria e parâmetros — e a construção é um `import()` tardio. O catálogo
// permanece legível por testes, e a vitrine carrega apenas o que for exibir.
//
// `build` devolve um Object3D ou, quando a peça se mexe, `{ object, animate }`.
// O estado da animação fica com a instância — nada de guardá-lo no catálogo,
// que é compartilhado entre todas as construções.

import { TABLETOP_THROWABLES } from './reactions.js';

export const MODEL_CATEGORIES = Object.freeze([
  Object.freeze({ id: 'figura', label: 'Figuras' }),
  Object.freeze({ id: 'objeto', label: 'Objetos' }),
]);

const ROLES = ['Duque', 'Assassina', 'Capitão', 'Embaixadora', 'Condessa'];

const choice = (id, label, values) => Object.freeze({ id, label, values: Object.freeze(values) });
const range = (count, label = (index) => String(index + 1)) =>
  Array.from({ length: count }, (_, index) => Object.freeze({ value: String(index), label: label(index) }));
const named = (ids) => ids.map((id) => Object.freeze({ value: id, label: id }));

const MODELS = [
  {
    id: 'cortesao',
    label: 'Cortesão',
    category: 'figura',
    hint: 'Boneco e cadeira de um assento. Manto e pele são o descritor de aparência.',
    // A mesa constrói o cortesão olhando para -Z, de costas para a vitrine.
    yaw: Math.PI,
    params: [choice('manto', 'Manto', range(6)), choice('pele', 'Pele', range(3))],
    async build({ manto, pele }) {
      const [{ createNoble }, { NOBLE_SKINS, ROBES }] = await Promise.all([
        import('./coup-table/figures.js'),
        import('./coup-table/appearance.js'),
      ]);
      return createNoble({ robe: ROBES[Number(manto)], skin: NOBLE_SKINS[Number(pele)] }).group;
    },
  },
  {
    id: 'papel',
    label: 'Retrato de papel',
    category: 'figura',
    hint: 'Efígie volumétrica de uma influência revelada.',
    params: [choice('papel', 'Papel', named(ROLES))],
    async build({ papel }) {
      const { createRoleFigure } = await import('./coup-table/figures.js');
      return createRoleFigure(papel);
    },
  },
  {
    id: 'intervencao',
    label: 'Intervenção',
    category: 'figura',
    hint: 'Os dois monumentos da janela de resposta.',
    params: [
      choice('gesto', 'Gesto', [
        { value: 'challenge', label: 'Contestar' },
        { value: 'allow', label: 'Permitir' },
      ]),
    ],
    async build({ gesto }) {
      const { createInterventionFigure } = await import('./coup-table/figures.js');
      return createInterventionFigure(gesto);
    },
  },
  {
    id: 'moeda',
    label: 'Moeda',
    category: 'objeto',
    hint: 'A peça isolada, deitada ou de pé.',
    params: [
      choice('pose', 'Pose', [
        { value: 'deitada', label: 'Deitada' },
        { value: 'de-pe', label: 'De pé' },
      ]),
    ],
    async build({ pose }) {
      const { createCourtCoin } = await import('./coup-table/coins.js');
      return createCourtCoin({ upright: pose === 'de-pe' });
    },
  },
  {
    id: 'tesouro',
    label: 'Tesouro',
    category: 'objeto',
    hint: 'As pilhas de um assento. O leiaute muda de forma a cada faixa de moedas.',
    params: [
      choice(
        'moedas',
        'Moedas',
        range(13, (index) => String(index)),
      ),
    ],
    async build({ moedas }) {
      const { createCoinTreasury } = await import('./coup-table/coins.js');
      return createCoinTreasury(Number(moedas));
    },
  },
  {
    id: 'influencia',
    label: 'Carta de influência',
    category: 'objeto',
    hint: 'Os quatro estados da mesma carta. Só quem a possui vê o retrato colorido.',
    params: [
      choice('papel', 'Papel', named(ROLES)),
      // O papel só é visível em três dos quatro estados: de costas a carta é a
      // mesma para qualquer influência, que é justamente o sigilo.
      choice('estado', 'Estado', [
        { value: 'propria', label: 'Na mão' },
        { value: 'selecionavel', label: 'Selecionável' },
        { value: 'sigilo', label: 'De costas' },
        { value: 'perdida', label: 'Perdida' },
      ]),
    ],
    async build({ papel, estado }) {
      const { createInfluenceCard } = await import('./coup-table/cards.js');
      return createInfluenceCard({
        id: 'vitrine',
        role: estado === 'sigilo' ? null : papel,
        revealed: estado === 'perdida',
        selectable: estado === 'selecionavel',
        focusable: false,
      });
    },
  },
  {
    id: 'ampulheta',
    label: 'Ampulheta',
    category: 'objeto',
    // A areia não é geometria fixa: `applyDecisionClock` a esculpe a cada quadro
    // a partir do tempo restante. Construir a peça e parar aí devolve uma redoma
    // vazia — e some justamente o que há de interessante para inspecionar nela.
    hint: 'O relógio de decisão. A areia escorre; abaixo de cinco segundos ela vira alarme.',
    params: [
      choice('duracao', 'Duração', [
        { value: '20', label: '20 s' },
        { value: '10', label: '10 s' },
        { value: '5', label: '5 s' },
      ]),
    ],
    async build({ duracao }) {
      const { applyDecisionClock, createDecisionHourglass } = await import('./coup-table/decision-props.js');
      const hourglass = createDecisionHourglass();
      hourglass.group.visible = true;
      const total = Number(duracao) * 1000;
      // A volta leva um instante a mais que a contagem para a redoma vazia ficar
      // visível antes de virar de novo.
      const cycle = total + 900;
      applyDecisionClock(hourglass, 1, total);
      return {
        object: hourglass.group,
        animate(elapsed) {
          const remaining = Math.max(0, total - ((elapsed * 1000) % cycle));
          applyDecisionClock(hourglass, remaining / total, remaining);
        },
      };
    },
  },
  {
    id: 'arremesso',
    label: 'Arremesso',
    category: 'objeto',
    // O catálogo de arremessos já existe e é autoritativo; repeti-lo aqui criaria
    // duas listas para manter em sincronia.
    hint: 'Os adereços que a corte joga na mesa.',
    params: [
      choice(
        'item',
        'Adereço',
        TABLETOP_THROWABLES.map((item) => ({ value: item.id, label: item.label })),
      ),
    ],
    async build({ item }) {
      const { createThrowable } = await import('./coup-table/reaction-models.js');
      return createThrowable(item);
    },
  },
];

export const MODEL_CATALOG = Object.freeze(MODELS.map((model) => Object.freeze({ ...model })));

export const findModel = (id) => MODEL_CATALOG.find((model) => model.id === id) ?? MODEL_CATALOG[0];

/** Valores padrão de um modelo: sempre a primeira opção de cada parâmetro. */
export function defaultModelOptions(params) {
  return Object.fromEntries(params.map((param) => [param.id, param.values[0].value]));
}

/**
 * Lê modelo e parâmetros da URL. Um valor fora do catálogo cai no padrão em vez
 * de derrubar a vitrine — é um endereço colado à mão ou uma captura antiga.
 */
export function modelSelectionFromSearch(search) {
  const query = new URLSearchParams(search);
  const model = findModel(query.get('modelo'));
  const options = defaultModelOptions(model.params);
  for (const param of model.params) {
    const requested = query.get(param.id);
    if (param.values.some((option) => option.value === requested)) options[param.id] = requested;
  }
  return { model, options };
}

export function modelSearch(model, options) {
  const query = new URLSearchParams({ modelo: model.id });
  for (const [id, value] of Object.entries(options)) query.set(id, value);
  return query.toString();
}
