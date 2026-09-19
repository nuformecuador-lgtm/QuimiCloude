// Guardia: la lista de motivos de ajuste no puede divergir entre el dominio y la base. El CHECK
// `inventory_movements_reason_in_catalog` de la migracion y la constante `MOVEMENT_REASONS` tienen
// que nombrar exactamente los mismos motivos. Si divergen, zod acepta un motivo que la base rechaza
// con un 23514 en produccion; esta guardia lo pone rojo en el gate.
//
// Vive en `tests/guards/` y no en `tests/unit/` a proposito: lee la migracion como TEXTO desde
// disco, y el selector de la corrida rapida filtra el diff a fuentes `.ts`/`.tsx`/`.js`/`.mjs` y
// relaciona los tests por el grafo de imports. Un archivo que vigila un `.sql` sin importarlo no lo
// relaciona ningun grafo: puesto en `tests/unit/` no correria al cambiar la migracion, que es justo
// el cambio que tiene que morder. En `tests/guards/` corre siempre.
//
// LO QUE ESTA GUARDIA NO PUEDE VER: si el CHECK esta realmente aplicado en la base -lee la
// migracion en disco, no `information_schema`-, ni si el esquema de zod que valida la entrada usa
// de verdad `MOVEMENT_REASONS` en vez de su propia lista copiada. Eso es otro test.

import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { MOVEMENT_REASONS } from '@/lib/modules/inventario/domain/movement-reason';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CARPETA_MIGRACIONES = 'db/migrations';
const NOMBRE_DEL_CHECK = 'inventory_movements_reason_in_catalog';

// -------------------------------------------------------------------------------------------
// EXTRACTORES, propios de este archivo y con sus autopruebas mas abajo
// -------------------------------------------------------------------------------------------

/** El indice del `)` que cierra el `(` de `apertura`, o -1 si no cierra. */
function cierreDeParentesis(sql: string, apertura: number): number {
  let profundidad = 0;
  for (let i = apertura; i < sql.length; i += 1) {
    if (sql[i] === '(') profundidad += 1;
    if (sql[i] === ')') {
      profundidad -= 1;
      if (profundidad === 0) return i;
    }
  }
  return -1;
}

/**
 * Los motivos literales del `IN (...)` del CHECK del catalogo, en el orden en que aparecen y CON
 * sus repetidos si los hubiera -quien compara necesita poder detectar un duplicado-. Devuelve
 * vacio si el SQL no declara ese CHECK: se ancla al NOMBRE de la restriccion, asi que no lo
 * confunde otro CHECK de la misma migracion que tambien nombre `reason` y lleve literales.
 */
function motivosDelCheck(sql: string): readonly string[] {
  const ancla = new RegExp(`ADD\\s+CONSTRAINT\\s+"?${NOMBRE_DEL_CHECK}"?`, 'i');
  const encontrado = ancla.exec(sql);
  if (encontrado === null) return [];

  const resto = sql.slice(encontrado.index + encontrado[0].length);
  const palabraCheck = /CHECK\s*\(/i.exec(resto);
  if (palabraCheck === null) return [];

  const apertura = palabraCheck.index + palabraCheck[0].length - 1;
  const cierre = cierreDeParentesis(resto, apertura);
  if (cierre === -1) return [];

  const cuerpo = resto.slice(apertura, cierre + 1);
  const lista = /\bIN\s*\(([^)]*)\)/i.exec(cuerpo);
  if (lista === null) return [];

  const motivos: string[] = [];
  const literal = /'([^']*)'/g;
  let match: RegExpExecArray | null;
  while ((match = literal.exec(lista[1])) !== null) motivos.push(match[1]);
  return motivos;
}

/** Los `migration.sql` de `db/migrations/` que declaran el CHECK del catalogo, en ruta relativa. */
function migracionesQueDeclaranElCheck(): string[] {
  const base = join(RAIZ, CARPETA_MIGRACIONES);
  const encontradas: string[] = [];
  for (const entrada of readdirSync(base, { withFileTypes: true })) {
    if (!entrada.isDirectory()) continue;
    const relativa = `${CARPETA_MIGRACIONES}/${entrada.name}/migration.sql`;
    let contenido: string;
    try {
      contenido = readFileSync(join(RAIZ, relativa), 'utf8');
    } catch {
      continue;
    }
    if (motivosDelCheck(contenido).length > 0) encontradas.push(relativa);
  }
  return encontradas.sort();
}

/**
 * Los hallazgos de comparar las dos listas. Pura: no toca disco, por eso se puede alimentar con
 * listas fabricadas y probar que muerde por las dos caras.
 *
 * Compara CONJUNTOS ORDENADOS porque el orden de un `IN (...)` de SQL no significa nada; por eso
 * mismo hace falta mirar los duplicados aparte, que al pasar por el conjunto se perderian.
 */
function hallazgosDeMotivos(
  delSql: readonly string[],
  deLaConstante: readonly string[],
): readonly string[] {
  const hallazgos: string[] = [];

  for (const motivo of [...new Set(deLaConstante)].sort()) {
    if (!delSql.includes(motivo)) {
      hallazgos.push(
        `el motivo "${motivo}" esta en MOVEMENT_REASONS pero NO en el CHECK ${NOMBRE_DEL_CHECK}: ` +
          'la base lo rechazara en produccion con un 23514',
      );
    }
  }

  for (const motivo of [...new Set(delSql)].sort()) {
    if (!deLaConstante.includes(motivo)) {
      hallazgos.push(
        `el motivo "${motivo}" esta en el CHECK ${NOMBRE_DEL_CHECK} pero NO en MOVEMENT_REASONS: ` +
          'la base lo acepta y el dominio no lo ofrece',
      );
    }
  }

  const lados = [
    [`el CHECK ${NOMBRE_DEL_CHECK}`, delSql],
    ['MOVEMENT_REASONS', deLaConstante],
  ] as const;
  for (const [lado, lista] of lados) {
    const repetidos = [...new Set(lista.filter((motivo, i) => lista.indexOf(motivo) !== i))].sort();
    for (const motivo of repetidos) {
      hallazgos.push(`el motivo "${motivo}" esta repetido en ${lado}`);
    }
  }

  return hallazgos;
}

// -------------------------------------------------------------------------------------------
// LA COMPARACION CONTRA EL ARBOL REAL
// -------------------------------------------------------------------------------------------

describe('guardia: los motivos de ajuste del dominio y los del CHECK de la base son los mismos', () => {
  it('exactamente una migracion declara el CHECK del catalogo de motivos', () => {
    const migraciones = migracionesQueDeclaranElCheck();
    expect(
      migraciones,
      `Se esperaba que exactamente un migration.sql de ${CARPETA_MIGRACIONES}/ declarase ` +
        `${NOMBRE_DEL_CHECK} con su lista IN (...), y se encontraron ${migraciones.length}: ` +
        `${migraciones.join(', ') || '(ninguna)'}. Si son cero, el CHECK se borro o el extractor ` +
        'dejo de reconocerlo y esta guardia estaria comparando vacios; si son dos, hay dos listas ' +
        'de motivos vivas y esta guardia no sabe cual manda.',
    ).toHaveLength(1);
  });

  it('ni la lista del SQL ni MOVEMENT_REASONS estan vacias -la guardia no pasa en vacio-', () => {
    const [migracion] = migracionesQueDeclaranElCheck();
    const delSql = motivosDelCheck(readFileSync(join(RAIZ, migracion), 'utf8'));

    expect(
      delSql.length,
      `El extractor no saco ningun motivo de ${migracion}. Sin este ancla, comparar dos listas ` +
        'vacias daria verde sin haber comprobado nada.',
    ).toBeGreaterThan(0);
    expect(
      MOVEMENT_REASONS.length,
      'MOVEMENT_REASONS esta vacia: el dominio se quedo sin catalogo de motivos.',
    ).toBeGreaterThan(0);
  });

  it('la lista del CHECK y MOVEMENT_REASONS son iguales, no solo compatibles', () => {
    const [migracion] = migracionesQueDeclaranElCheck();
    const delSql = motivosDelCheck(readFileSync(join(RAIZ, migracion), 'utf8'));
    const hallazgos = hallazgosDeMotivos(delSql, MOVEMENT_REASONS);

    expect(
      hallazgos,
      'Los motivos de ajuste divergen entre el dominio y la base:\n' +
        `${hallazgos.map((hallazgo) => `  - ${hallazgo}`).join('\n')}\n` +
        `  CHECK (${migracion}): ${[...delSql].sort().join(', ')}\n` +
        `  MOVEMENT_REASONS: ${[...MOVEMENT_REASONS].sort().join(', ')}\n` +
        'Anadir un motivo en un solo lado no es media feature: es un 23514 en produccion.',
    ).toEqual([]);
  });
});

// -------------------------------------------------------------------------------------------
// LOS EXTRACTORES Y EL COMPARADOR, PROBADOS CON SQL Y LISTAS FABRICADAS
// -------------------------------------------------------------------------------------------

const CHECK_FABRICADO =
  `ALTER TABLE "inventory_movements" ADD CONSTRAINT "${NOMBRE_DEL_CHECK}"\n` +
  `  CHECK ("reason" IS NULL OR "reason" IN ('merma', 'rotura', 'conteo_fisico', 'error_de_carga'));`;

const CHECK_DE_COHERENCIA_FABRICADO =
  'ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_reason_matches_kind"\n' +
  `  CHECK (("kind" = 'adjustment' AND "reason" IS NOT NULL) OR ("kind" = 'opening' AND "reason" IS NULL));`;

describe('guardia: el extractor de motivos muerde sobre SQL fabricado', () => {
  it('saca los cuatro motivos de un CHECK bien formado', () => {
    expect(motivosDelCheck(CHECK_FABRICADO)).toEqual([
      'merma',
      'rotura',
      'conteo_fisico',
      'error_de_carga',
    ]);
  });

  it('un SQL sin el CHECK devuelve vacio -la autoprueba de vacuidad del ancla-', () => {
    const sql =
      'ALTER TABLE "inventory_movements" ALTER COLUMN "kind" TYPE TEXT USING "kind"::text;';
    expect(motivosDelCheck(sql)).toEqual([]);
  });

  it('no se confunde con inventory_movements_reason_matches_kind, que tambien nombra reason', () => {
    expect(motivosDelCheck(CHECK_DE_COHERENCIA_FABRICADO)).toEqual([]);
  });

  it('con los dos CHECK juntos saca solo los motivos del catalogo', () => {
    const sql = `${CHECK_DE_COHERENCIA_FABRICADO}\n${CHECK_FABRICADO}`;
    expect(motivosDelCheck(sql)).toEqual(['merma', 'rotura', 'conteo_fisico', 'error_de_carga']);
  });

  it('tolera espacios y saltos de linea distintos dentro del IN (...)', () => {
    const sql =
      `ALTER TABLE "inventory_movements" ADD CONSTRAINT "${NOMBRE_DEL_CHECK}" CHECK (\n` +
      '  "reason" IS NULL OR "reason" IN (\n' +
      "    'merma',\n" +
      "    'rotura',\n" +
      "    'conteo_fisico',   'error_de_carga'\n" +
      '  )\n' +
      ');';
    expect(motivosDelCheck(sql)).toEqual(['merma', 'rotura', 'conteo_fisico', 'error_de_carga']);
  });

  it('conserva un motivo repetido en el SQL en vez de colapsarlo', () => {
    const sql =
      `ALTER TABLE "inventory_movements" ADD CONSTRAINT "${NOMBRE_DEL_CHECK}"\n` +
      `  CHECK ("reason" IN ('merma', 'merma', 'rotura'));`;
    expect(motivosDelCheck(sql)).toEqual(['merma', 'merma', 'rotura']);
  });
});

describe('guardia: el comparador de motivos muerde por las dos caras', () => {
  it('listas iguales, aunque en distinto orden, no dan ningun hallazgo', () => {
    const hallazgos = hallazgosDeMotivos(
      ['merma', 'rotura', 'conteo_fisico'],
      ['conteo_fisico', 'merma', 'rotura'],
    );
    expect(hallazgos).toEqual([]);
  });

  it('cara A: un motivo de mas en la constante da rojo y lo nombra', () => {
    const hallazgos = hallazgosDeMotivos(
      ['merma', 'rotura'],
      ['merma', 'rotura', 'devolucion_a_proveedor'],
    );
    expect(hallazgos).toHaveLength(1);
    expect(hallazgos[0]).toContain('devolucion_a_proveedor');
    expect(hallazgos[0]).toContain('MOVEMENT_REASONS');
    expect(hallazgos[0]).toContain('23514');
  });

  it('cara B: un motivo de menos en el CHECK da rojo y nombra el que falta', () => {
    const hallazgos = hallazgosDeMotivos(['merma'], ['merma', 'rotura']);
    expect(hallazgos).toHaveLength(1);
    expect(hallazgos[0]).toContain('rotura');
    expect(hallazgos[0]).toContain('MOVEMENT_REASONS');
  });

  it('un motivo que solo esta en el CHECK tambien da rojo, nombrado y con su lado', () => {
    const hallazgos = hallazgosDeMotivos(['merma', 'rotura'], ['merma']);
    expect(hallazgos).toHaveLength(1);
    expect(hallazgos[0]).toContain('rotura');
    expect(hallazgos[0]).toContain(NOMBRE_DEL_CHECK);
  });

  it('un duplicado no se come la diferencia al ordenar: se denuncia por su lado', () => {
    const hallazgos = hallazgosDeMotivos(['merma', 'merma'], ['merma']);
    expect(hallazgos).toEqual([`el motivo "merma" esta repetido en el CHECK ${NOMBRE_DEL_CHECK}`]);
  });

  it('un duplicado en MOVEMENT_REASONS tambien se denuncia', () => {
    const hallazgos = hallazgosDeMotivos(['merma'], ['merma', 'merma']);
    expect(hallazgos).toEqual(['el motivo "merma" esta repetido en MOVEMENT_REASONS']);
  });
});
