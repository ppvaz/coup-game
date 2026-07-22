import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { extname, relative, resolve, sep } from 'node:path';
import test from 'node:test';

const ROOT = resolve(import.meta.dirname, '..');
const PACKAGES_ROOT = resolve(ROOT, 'packages');
const GAME_ROOT = resolve(ROOT, 'src/game');
const SOURCE_EXTENSIONS = new Set(['.cjs', '.js', '.mjs', '.ts', '.tsx']);
const COUP_VOCABULARY =
  /\b(?:coup|duque|duke|assassina?|assassin|capit[aã]o|captain|embaixador(?:a)?|ambassador|condessa|contessa)\b/iu;

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) return [];
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return SOURCE_EXTENSIONS.has(extname(entry.name)) ? [path] : [];
  });
}

function moduleSpecifiers(source) {
  const specifiers = [];
  const patterns = [
    /\b(?:import|export)\s+(?:[^;'"()]+?\s+from\s*)?["']([^"']+)["']/gu,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/gu,
    /\brequire\s*\(\s*["']([^"']+)["']\s*\)/gu,
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) specifiers.push(match[1]);
  }
  return specifiers;
}

function isInside(path, directory) {
  const local = relative(directory, path);
  return local === '' || (!local.startsWith(`..${sep}`) && local !== '..');
}

function resolvedImport(importer, specifier) {
  if (!specifier.startsWith('.')) return null;
  return resolve(importer, '..', specifier);
}

function violations(files, predicate) {
  return files.flatMap((file) => {
    const source = readFileSync(file, 'utf8');
    return moduleSpecifiers(source)
      .filter((specifier) => predicate({ file, source, specifier, target: resolvedImport(file, specifier) }))
      .map((specifier) => `${relative(ROOT, file)} -> ${specifier}`);
  });
}

test('pacotes compartilhados não importam código da aplicação', () => {
  const applicationRoot = resolve(ROOT, 'src');
  const found = violations(
    sourceFiles(PACKAGES_ROOT),
    ({ target, specifier }) => (target && isInside(target, applicationRoot)) || /(?:^|\/)src(?:\/|$)/u.test(specifier),
  );

  assert.deepEqual(found, [], `Imports de packages/ para src/ encontrados:\n${found.join('\n')}`);
});

test('regras não importam UI, cena WebGL ou pacote de apresentação', () => {
  const presentationRoots = [resolve(ROOT, 'src/ui'), resolve(ROOT, 'src/lib/tabletop'), PACKAGES_ROOT];
  const presentationPackages = new Set(['three', '@la-corte/tabletop-stage']);
  const found = violations(
    sourceFiles(GAME_ROOT),
    ({ target, specifier }) =>
      presentationPackages.has(specifier) ||
      [...presentationPackages].some((name) => specifier.startsWith(`${name}/`)) ||
      (target && presentationRoots.some((directory) => isInside(target, directory))),
  );

  assert.deepEqual(found, [], `Imports de apresentação encontrados em src/game/:\n${found.join('\n')}`);
});

test('pacotes compartilhados não carregam o vocabulário de Coup', () => {
  const found = sourceFiles(PACKAGES_ROOT)
    .filter((file) => COUP_VOCABULARY.test(readFileSync(file, 'utf8')))
    .map((file) => relative(ROOT, file));

  assert.deepEqual(found, [], `Vocabulário de Coup encontrado no motor:\n${found.join('\n')}`);
});
