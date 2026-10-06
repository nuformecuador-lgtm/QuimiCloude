#!/usr/bin/env node
/**
 * Archivos en vuelo de TODO el equipo, para la validacion de conflicto de F1.0
 * (`AGENTS.md > Paralelismo`, `docs/equipo.md`).
 *
 *   node scripts/archivos-en-vuelo.mjs                     inventario por feature en vuelo
 *   node scripts/archivos-en-vuelo.mjs --candidata QC-12   interseccion con la candidata; exit 1 si choca
 *
 * Por que existe: antes la validacion leia `progress/impl_<feature>.md` del disco local, pero
 * las features de los companeros viven en SUS ramas, no en tu disco. Aqui la fuente es el
 * remoto: por cada feature `in_progress`/`spec_ready` (de cualquiera) con rama publicada,
 *   - archivos TOCADOS: `git diff --name-only origin/<integracion>...origin/<rama>`
 *   - archivos ESPERADOS: rutas entre backticks de su `tasks.md`, leido de su rama
 * Requisito para que sirva: cada tanda termina con `git push` (AGENTS.md > F2.1).
 *
 * `specs/` y `progress/` no cuentan como conflicto: cada feature escribe en su carpeta.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const git = (...args) => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
const gitOpcional = (...args) => {
  try { return git(...args); } catch { return null; }
};

const raiz = path.dirname(git('rev-parse', '--path-format=absolute', '--git-common-dir'));
const config = existsSync('arnes.config.json') ? JSON.parse(readFileSync('arnes.config.json', 'utf8')) : {};
const INTEGRACION = config.ramas?.integracion ?? 'dev';
const listaPath = path.join(raiz, 'feature_list.json');
if (!existsSync(listaPath)) {
  console.error('no hay feature_list.json en la raiz del repo: corre F0 primero');
  process.exit(2);
}
const { features } = JSON.parse(readFileSync(listaPath, 'utf8'));

const args = process.argv.slice(2);
const iCand = args.indexOf('--candidata');
const candidata = iCand >= 0 ? args[iCand + 1] : null;

gitOpcional('fetch', '--quiet', '--prune', 'origin');

const RUTA = /`([\w.@()[\]\-]+(?:\/[\w.@()[\]\-]+)+\.[a-z0-9]+)`/gi;
const ignorable = (f) => f.startsWith('specs/') || f.startsWith('progress/');

/** Rutas de archivo citadas entre backticks en un tasks.md. */
function esperados(texto) {
  const out = new Set();
  for (const m of texto.matchAll(RUTA)) {
    const ruta = m[1].replace(/^\.\//, '');
    if (!ignorable(ruta)) out.add(ruta);
  }
  return out;
}

const ramaDe = (f) => f.branch ?? `feature/${f.key ?? f.id}-${f.name}`;
const specDe = (f) => f.spec_path ?? `specs/${f.key ?? f.id}-${f.name}`;

const enVuelo = features.filter((f) => ['in_progress', 'spec_ready'].includes(f.status) && (f.key ?? String(f.id)) !== candidata);
const inventario = [];
for (const f of enVuelo) {
  const rama = ramaDe(f);
  const remoto = `origin/${rama}`;
  if (gitOpcional('rev-parse', '--verify', '--quiet', remoto) == null) {
    inventario.push({ f, rama, publicada: false, archivos: new Set() });
    continue;
  }
  const tocados = (gitOpcional('diff', '--name-only', `origin/${INTEGRACION}...${remoto}`) ?? '')
    .split('\n').filter((l) => l && !ignorable(l));
  const tasks = gitOpcional('show', `${remoto}:${specDe(f)}/tasks.md`) ?? '';
  inventario.push({ f, rama, publicada: true, archivos: new Set([...tocados, ...esperados(tasks)]) });
}

const quien = (f) => f.assignee?.displayName ?? 'sin assignee';

if (!candidata) {
  for (const { f, rama, publicada, archivos } of inventario) {
    console.log(`${f.key ?? f.id} (${quien(f)}) ${rama}${publicada ? '' : '  [rama NO publicada: no se puede saber que toca]'}`);
    for (const a of [...archivos].sort()) console.log(`  ${a}`);
  }
  process.exit(0);
}

// Archivos esperados de la candidata: su tasks.md donde este (worktree actual, raiz o hermanos).
const fichaCand = features.find((f) => f.key === candidata || String(f.id) === candidata);
if (!fichaCand) {
  console.error(`la candidata ${candidata} no esta en feature_list.json`);
  process.exit(2);
}
const bases = ['.', raiz, ...(existsSync(path.join(raiz, '.worktrees'))
  ? readdirSync(path.join(raiz, '.worktrees')).map((d) => path.join(raiz, '.worktrees', d)) : [])];
let tasksCand = null;
for (const b of bases) {
  const p = path.join(b, specDe(fichaCand), 'tasks.md');
  if (existsSync(p)) { tasksCand = readFileSync(p, 'utf8'); break; }
}
if (tasksCand == null) {
  console.error(`no encuentro ${specDe(fichaCand)}/tasks.md: la validacion de conflicto necesita el tasks.md de la candidata`);
  process.exit(2);
}
const mios = esperados(tasksCand);

let choques = 0;
for (const { f, publicada, archivos } of inventario) {
  if (!publicada) {
    console.log(`AVISO: ${f.key ?? f.id} (${quien(f)}) esta en vuelo y su rama no esta publicada: no se puede comprobar el conflicto`);
    continue;
  }
  const comunes = [...mios].filter((a) => archivos.has(a));
  if (comunes.length > 0) {
    choques++;
    console.log(`CHOCA con ${f.key ?? f.id} (${quien(f)}): ${comunes.join(', ')}`);
  }
}
if (choques === 0) console.log(`${candidata}: sin conflicto de archivos con ${inventario.length} feature(s) en vuelo`);
process.exit(choques > 0 ? 1 : 0);
