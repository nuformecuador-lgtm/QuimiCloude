// Verifica que los artefactos que el ciclo dice haber producido EXISTEN de verdad.
//
// Esto existe por un fallo observado, no por precaucion. El 2026-09-14, revisando QC-102 con el
// arnes corriendo en opencode, el subagente `reviewer` termino su turno diciendo:
//
//   "El informe detallado se encuentra en: progress/review_QC-102-...md"
//
// ...y ese archivo no existia. Ni ahi ni en ningun otro sitio. El leader lo habria dado por
// revisado y seguido a PR con un veredicto que nadie escribio.
//
// Es el peor fallo posible para este arnes porque no se parece a un fallo: el turno termina en
// verde, con un veredicto plausible ("APROBADO, 0 mayores") y una ruta que suena bien. La regla
// 3 -estado en disco, no en el chat- deja de cumplirse sin que nada proteste, y con ella se cae
// la trazabilidad entera, que es lo unico que sostiene la regla 4.
//
// Por eso el chequeo es del ARCHIVO, no del mensaje: una feature `done` tiene que tener su
// bitacora de implementacion y su informe de revision, con contenido y con veredicto explicito.

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const RAIZ = process.cwd();
const LISTA = join(RAIZ, 'feature_list.json');

// Features cerradas ANTES de que existiera esta guardia y que nunca tuvieron artefactos. No se
// inventan a posteriori -seria escribir ficcion sobre trabajo que no se reviso asi- y no deben
// crecer: cualquier feature que cierre desde hoy tiene que traerlos.
const LEGADO = new Set([
  '4-modelo-usuarios-y-roles',
  '10-pantalla-de-login',
  '11-layout-privado-con-sidebar',
  'QC-29-tema-claro-oscuro',
]);

const MINIMO_LINEAS = 20;

if (!existsSync(LISTA)) {
  console.log('check-artefactos: no hay feature_list.json, nada que verificar.');
  process.exit(0);
}

const crudo = JSON.parse(readFileSync(LISTA, 'utf8'));
const features = Array.isArray(crudo) ? crudo : crudo.features || [];

function leer(ruta) {
  const abs = join(RAIZ, ruta);
  if (!existsSync(abs)) return null;
  return readFileSync(abs, 'utf8');
}

const fallos = [];
let revisadas = 0;

for (const f of features.filter((x) => x.status === 'done')) {
  const base = (f.spec_path || '').replace(/^specs\//, '') || String(f.id);
  if (LEGADO.has(base)) continue;
  revisadas++;

  const impl = leer(`progress/impl_${base}.md`);
  const review = leer(`progress/review_${base}.md`);

  if (impl === null) fallos.push(`${base}: falta progress/impl_${base}.md`);
  else if (impl.split('\n').length < MINIMO_LINEAS) {
    fallos.push(`${base}: progress/impl_${base}.md tiene menos de ${MINIMO_LINEAS} lineas`);
  }

  if (review === null) fallos.push(`${base}: falta progress/review_${base}.md`);
  else if (review.split('\n').length < MINIMO_LINEAS) {
    fallos.push(`${base}: progress/review_${base}.md tiene menos de ${MINIMO_LINEAS} lineas`);
  }

  // Deliberadamente NO se exige un veredicto con una forma concreta. Se intentaron dos: exigir
  // la palabra "APROBADO" marco en rojo nueve informes legitimos que dicen "**OK.**", y exigir
  // una seccion "## Veredicto" marco otros nueve que la titulan "## 1. Veredicto" o que no la
  // titulan. Los 57 informes del repo no comparten esa convencion, y una guardia que obliga a
  // reescribir trabajo correcto para satisfacerla no protege nada: entrena a saltarsela.
  //
  // El fallo que esta guardia existe para cazar no era un veredicto mal escrito: era un informe
  // que NO ESTABA. Eso es lo que se comprueba, y eso no tiene falsos positivos.
}

if (fallos.length > 0) {
  console.error('check-artefactos: hay features `done` sin su rastro en disco:');
  for (const x of fallos) console.error(`  - ${x}`);
  console.error(
    '\nUna feature no esta hecha porque un agente lo diga en el chat. Si el artefacto no esta,\n' +
      'el trabajo no esta verificado: reabre la feature o produce el informe que falta.',
  );
  process.exit(1);
}

console.log(
  `check-artefactos: ${revisadas} feature(s) done con bitacora e informe en disco ` +
    `(${LEGADO.size} de legado exentas).`,
);
