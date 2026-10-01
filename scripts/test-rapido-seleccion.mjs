/**
 * Que tests corre `pnpm run test:rapido` para un diff (`docs/verification.md`).
 *
 * Antes la seleccion era `vitest related`, que sigue el grafo de imports ENTERO: tocar un
 * archivo muy importado arrastraba media suite, y el coste no estaba en los tests sino en
 * importar los modulos de cada uno. El rapido dejaba de ser rapido y se caia por memoria.
 *
 * La seleccion de ahora es deliberadamente corta:
 *   a. un test que esta en el diff, entra;
 *   b. un test que IMPORTA DIRECTAMENTE un archivo del diff (`from`, `import`, `import()`,
 *      `vi.mock`), entra. A un salto, no a dos;
 *   c. si el diff toca `lib/modules/<m>/...`, entran todos los tests de `tests/unit/<m>/` y
 *      `tests/integration/<m>/`: son los que ejercitan ese modulo aunque lo importen a
 *      traves de su contrato o de la composicion.
 * Lo que queda a mas de un import lo caza el gate completo antes del PR, no este.
 *
 * Funcion pura: `leer` se inyecta para poder probarla sin disco.
 */
import path from 'node:path';

const EXTENSION = /\.(ts|tsx|js|jsx|mjs|cjs)$/;

// Especificadores entre comillas tras `from`, `import`, `import(` o `vi.mock(`.
const ESPECIFICADOR = /(?:\bfrom\s+|\bimport\s*\(\s*|\bvi\.mock\(\s*|\bimport\s+)['"]([^'"]+)['"]/g;

/** Ruta posix sin extension y con `/index` plegado a su carpeta: la forma de comparar. */
function clave(ruta) {
  return path.posix
    .normalize(ruta.replace(/\\/g, '/'))
    .replace(EXTENSION, '')
    .replace(/\/index$/, '');
}

/** Resuelve un especificador a ruta relativa a la raiz; `null` si es un paquete. */
function resolver(especificador, test) {
  if (especificador.startsWith('@/')) return especificador.slice(2);
  if (especificador.startsWith('.')) {
    return path.posix.join(path.posix.dirname(test.replace(/\\/g, '/')), especificador);
  }
  return null;
}

/** Reglas (a) y (b): tests del diff y tests que importan directamente algo del diff. */
export function porImportODiff({ cambiados, tests, leer }) {
  const objetivos = new Set(cambiados.map(clave));
  const elegidos = [];
  for (const test of tests) {
    if (objetivos.has(clave(test))) {
      elegidos.push(test);
      continue;
    }
    const fuente = leer(test);
    for (const coincidencia of fuente.matchAll(ESPECIFICADOR)) {
      const ruta = resolver(coincidencia[1], test);
      if (ruta !== null && objetivos.has(clave(ruta))) {
        elegidos.push(test);
        break;
      }
    }
  }
  return elegidos.map((t) => t.replace(/\\/g, '/')).sort();
}

/** Regla (c): tests de la carpeta de cada modulo tocado. */
export function porCarpetaDeModulo({ cambiados, tests }) {
  const modulos = new Set(
    cambiados
      .map((f) => f.replace(/\\/g, '/').match(/^lib\/modules\/([^/]+)\//)?.[1])
      .filter(Boolean),
  );
  return tests
    .map((t) => t.replace(/\\/g, '/'))
    .filter((t) => {
      const m = t.match(/^tests\/(?:unit|integration)\/([^/]+)\//);
      return m !== null && modulos.has(m[1]);
    })
    .sort();
}

/** Union de las tres reglas, ordenada y sin repetidos. */
export function seleccionarTests({ cambiados, tests, leer }) {
  const todos = new Set([
    ...porImportODiff({ cambiados, tests, leer }),
    ...porCarpetaDeModulo({ cambiados, tests }),
  ]);
  return [...todos].sort();
}
