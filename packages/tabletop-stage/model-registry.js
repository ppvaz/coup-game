/**
 * Registro de modelos: a forma comum de um jogo publicar as peças que sua mesa
 * constrói, para que uma vitrine — ou uma captura automática — consiga abrir
 * qualquer catálogo sem saber de que jogo ele veio.
 *
 * O catálogo é **metadado**. `build` é assíncrono de propósito: as fábricas
 * costumam arrastar texturas que só um bundler resolve, então o registro
 * precisa continuar legível por um teste que jamais poderia construir a peça.
 *
 * `build(options)` devolve um `Object3D` ou `{ object, animate }` quando a peça
 * se mexe. O estado da animação pertence à construção, nunca ao catálogo, que é
 * compartilhado por todas elas.
 */

const MODEL_KEY = 'modelo';

function validate(models, categories) {
  const known = new Set(categories.map((category) => category.id));
  const seen = new Set();
  for (const model of models) {
    if (!model.id || !model.label) throw new Error(`Todo modelo precisa de id e rótulo: ${model.id ?? '(sem id)'}`);
    if (seen.has(model.id)) throw new Error(`Modelo repetido no catálogo: ${model.id}`);
    seen.add(model.id);
    if (!known.has(model.category)) throw new Error(`O modelo ${model.id} está numa categoria inexistente.`);
    if (typeof model.build !== 'function') throw new Error(`O modelo ${model.id} precisa de uma fábrica.`);
    for (const param of model.params ?? []) {
      // Um parâmetro de valor único não é escolha, é constante disfarçada de
      // botão — e a vitrine desenharia um controle que não faz nada.
      if (!(param.values?.length > 1)) throw new Error(`O parâmetro ${model.id}/${param.id} precisa de duas opções.`);
    }
  }
}

/** Valores padrão de um modelo: sempre a primeira opção de cada parâmetro. */
export function defaultModelOptions(params) {
  return Object.fromEntries(params.map((param) => [param.id, param.values[0].value]));
}

export function defineModelCatalog({ categories, models }) {
  validate(models, categories);
  const frozenCategories = Object.freeze(categories.map((category) => Object.freeze({ ...category })));
  const frozenModels = Object.freeze(
    models.map((model) => Object.freeze({ ...model, params: Object.freeze(model.params ?? []) })),
  );

  const find = (id) => frozenModels.find((model) => model.id === id) ?? frozenModels[0];

  return Object.freeze({
    categories: frozenCategories,
    models: frozenModels,
    find,
    defaults: (model) => defaultModelOptions(model.params),

    /**
     * Lê modelo e parâmetros de um endereço. Um valor fora do catálogo cai no
     * padrão em vez de derrubar a vitrine — é um endereço colado à mão ou uma
     * captura antiga apontando para uma peça que mudou de parâmetros.
     */
    fromSearch(search) {
      const query = new URLSearchParams(search);
      const model = find(query.get(MODEL_KEY));
      const options = defaultModelOptions(model.params);
      for (const param of model.params) {
        const requested = query.get(param.id);
        if (param.values.some((option) => option.value === requested)) options[param.id] = requested;
      }
      return { model, options };
    },

    toSearch(model, options) {
      const query = new URLSearchParams({ [MODEL_KEY]: model.id });
      for (const [id, value] of Object.entries(options)) query.set(id, value);
      return query.toString();
    },
  });
}
