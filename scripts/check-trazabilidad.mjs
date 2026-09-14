// Regla 4 por maquina: cada `R<n>` declarado en requirements.md aparece en el mapa
// `R<n> -> test` de progress/impl_<feature>.md.
//
// Hasta hoy esta regla la sostenia el juicio del `reviewer`, y eso se rompio de forma medible.
// El 2026-09-14, revisando QC-102 -41 requisitos- el reviewer escribio "los requisitos estan
// trazables a tests" habiendo citado TRES. No mintio sobre un detalle: afirmo la verificacion
// entera habiendo hecho el 7%. Un veredicto asi pasa el gate y cierra la feature.
//
// Lo que un modelo no puede hacer de forma fiable -recorrer 41 filas sin saltarse ninguna- una
// comparacion de conjuntos lo hace siempre. El reviewer sigue juzgando si el test VERIFICA de
// verdad el requisito, que es donde su criterio si aporta; lo que deja de decidir es si estan
// todos.
//
// Corre en las dos herramientas: es Node en el gate, no configuracion de ninguna.

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const RAIZ = process.cwd();
const LISTA = join(RAIZ, 'feature_list.json');

// Un `R<n>` esta DECLARADO cuando abre la linea: item de lista, celda de tabla o encabezado.
// Una mencion en medio de una frase no declara nada, y distinguirlo no es cosmetico: los specs
// citan requisitos de OTRAS features -"igual que R38-R48 de QC-66", "e2e/session.spec.ts (QC-9,
// R24)"- y contarlos daba cuatro falsos huecos en tres features.
const DECLARA = /^\s*(?:[-*+]\s+|\|\s*|#{1,6}\s*)?\*{0,2}(R\d+)\*{0,2}\s*(?=[\s.:|—–\-)])/;

// Requisitos DIFERIDOS a proposito, no olvidados. La bitacora de QC-25 lo dice con todas las
// letras: "R4, R10, R12, R13, R23, R28, R29, R31 (parte), R32, R35, R39-R44 no se cierran en
// este [ciclo]". Se nombran uno a uno en vez de bajar el listón con un umbral: un 98% global
// dejaria pasar justo lo que esta guardia vigila, y un diferido sin nombre es indistinguible
// de un olvido.
//
// Si una feature nueva necesita diferir un requisito, la entrada se añade aqui a mano y con
// su razon. Que cueste un poco es el punto.
const EXENTOS = new Map([
  [
    'QC-25-crud-de-recetas',
    new Set(['R4', 'R10', 'R12', 'R13', 'R28', 'R29', 'R32', 'R35', 'R39', 'R40', 'R42', 'R50']),
  ],
]);

if (!existsSync(LISTA)) {
  console.log('check-trazabilidad: no hay feature_list.json, nada que verificar.');
  process.exit(0);
}

const crudo = JSON.parse(readFileSync(LISTA, 'utf8'));
const features = Array.isArray(crudo) ? crudo : crudo.features || [];

const fallos = [];
let revisadas = 0;
let requisitos = 0;

for (const f of features) {
  if (f.status !== 'done' && f.status !== 'in_progress') continue;
  const base = (f.spec_path || '').replace(/^specs\//, '') || String(f.id);
  const req = join(RAIZ, 'specs', base, 'requirements.md');
  const impl = join(RAIZ, 'progress', `impl_${base}.md`);

  // Sin spec o sin bitacora todavia no hay nada que cruzar. Que existan lo vigila
  // `check-artefactos.mjs`, que es su trabajo y no el de esta guardia.
  if (!existsSync(req) || !existsSync(impl)) continue;

  const declarados = new Set();
  for (const linea of readFileSync(req, 'utf8').split(/\r?\n/)) {
    const m = linea.match(DECLARA);
    if (m) declarados.add(m[1]);
  }
  if (declarados.size === 0) continue;

  // Solo cuentan las FILAS del mapa -`| R7 | test... |`- o los items de lista que abren con el
  // requisito. Contar cualquier aparicion del token era demasiado laxo: la bitacora nombra
  // requisitos tambien en prosa, asi que un parrafo que los cite todos habria bastado para pasar
  // sin que existiera el mapa. Y al probarlo borrando tres filas, la guardia seguia en verde.
  const mapeados = new Set();
  for (const linea of readFileSync(impl, 'utf8').split(/\r?\n/)) {
    // Dos formatos reales conviven en las bitacoras y los dos son mapa: fila de tabla
    // -`| R1 | test... |`, QC-102- y negrita a principio de linea -`**R1** — test...`, QC-74-.
    // El marcador de lista o tubo es OPCIONAL por eso. Lo que no es opcional es abrir la linea:
    // una frase que cite requisitos en medio no mapea nada, y la lista de continuaciones
    // -coma detras del numero- se queda fuera por el lookahead.
    const m = linea.match(/^\s*(?:\|\s*|[-*+]\s+)?\*{0,2}(R\d+)\*{0,2}\s*(?=[\s|.:—–\-)])/);
    if (m) mapeados.add(m[1]);
  }
  const exentos = EXENTOS.get(base) || new Set();
  const faltan = [...declarados].filter((r) => !mapeados.has(r) && !exentos.has(r));

  revisadas++;
  requisitos += declarados.size;
  if (faltan.length > 0) {
    fallos.push(
      `${base}: ${faltan.length} de ${declarados.size} requisitos sin mapear -> ${faltan.join(', ')}`,
    );
  }
}

if (fallos.length > 0) {
  console.error('check-trazabilidad: la regla 4 no se cumple:');
  for (const x of fallos) console.error(`  - ${x}`);
  console.error(
    '\nCada R<n> tiene que aparecer en el mapa `R<n> -> test` de su progress/impl_<feature>.md.\n' +
      'Si un requisito no tiene test, el hallazgo es del reviewer y es BLOQUEANTE, no una nota.',
  );
  process.exit(1);
}

console.log(
  `check-trazabilidad: ${requisitos} requisitos mapeados en ${revisadas} feature(s).`,
);
