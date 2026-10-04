// QC-146 T11 — EL TEST DE ALCANCE de la ficha. Cubre R13, R15 y R30.
//
// Los tres son requisitos de AUSENCIA: `design.md > 4` («Lo que la presentacion NO toca») dice
// exactamente donde no debe aparecer nada de esto, y un requisito de ausencia no se demuestra
// leyendo el resto de tests -que solo prueban lo que SI se agrego-, se demuestra MIRANDO el
// archivo entero. Al estilo de `tests/unit/inventario/qc121-alcance.test.ts`: afirma el ESTADO
// NUEVO en positivo, sobre fuentes nombradas y sobre fuentes fabricadas, sin mirar ningun diff.
//
//   * R13 — `resolve-ingredients-cost.ts` y `order-cost.ts` no nombran la presentacion: ninguno
//     de los dos recibe el catalogo de presentaciones ni la menciona en su codigo. El costo de
//     dos pedidos de igual receta y cantidad es el mismo aunque tengan presentaciones distintas
//     PORQUE la presentacion nunca entra a esta funcion, no porque el resultado coincida por
//     casualidad (eso lo prueba `create-order.test.ts`).
//   * R15 — ningun codigo de permiso nuevo relacionado con la presentacion, y el Operador sigue
//     con EXACTAMENTE `inventario.consultar` y `asignaciones.consultar`: ni uno de menos (perderia
//     la vista de la presentacion en `/asignacion`, R26) ni uno de mas (un permiso de escritura
//     que nadie le pidio). Se importa del CONTRATO del modulo (`@/lib/modules/identity`), no se
//     parsea el fuente: el contrato ya expone `PERMISSIONS`, `SEED_ROLE_PERMISSIONS` y
//     `ROLE_OPERADOR`, y leer el valor importado es mas fiel que reconstruirlo con una regex.
//   * R30 — `package.json` no gana ninguna dependencia. Sin git y sin red: se compara CADA
//     dependencia declarada contra las filas de `docs/dependencias.md`, la misma fuente que usa
//     `tests/guards/guard-dependencias-aprobadas.test.ts`. Los extractores de ese archivo se
//     COPIAN aqui -no se importan-, porque aquel declara sus `describe` a nivel de modulo e
//     importarlo REGISTRARIA SUS DOS CASOS OTRA VEZ dentro de esta suite (la misma leccion que
//     `qc101-alcance.test.ts` deja escrita sobre `qc23-alcance.test.ts`). Es deliberadamente el
//     mismo criterio que la guardia -«toda dependencia tiene su fila»- y no una lista literal
//     congelada a mano: una lista literal se desactualizaria solo con que OTRA ficha en paralelo
//     instale algo aprobado, y este archivo se pondria rojo por trabajo ajeno y legitimo (la
//     bomba de relojeria que `qc101-alcance.test.ts` describe en su cabecera).

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { PERMISSIONS, ROLE_OPERADOR, SEED_ROLE_PERMISSIONS } from '@/lib/modules/identity';

/** Copia local de `stripComments`, calcada de `qc101-alcance.test.ts` / `qc23-alcance.test.ts`:
 *  los de LINEA primero, los de BLOQUE despues. */
function stripComments(source: string): string {
  return source
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, ''))
    .join('\n')
    .replace(/\/\*[\s\S]*?\*\//g, ' ');
}

function findRepoRoot(startDir: string): string {
  let dir = startDir;
  for (;;) {
    try {
      readFileSync(join(dir, 'package.json'));
      return dir;
    } catch {
      const parent = dirname(dir);
      if (parent === dir) throw new Error(`no se encontro package.json subiendo desde ${startDir}`);
      dir = parent;
    }
  }
}

const repoRoot = findRepoRoot(dirname(fileURLToPath(import.meta.url)));

function leer(rutaRelativa: string): string {
  return readFileSync(join(repoRoot, rutaRelativa), 'utf8');
}

// ---------------------------------------------------------------------------------------------
// R13 — resolve-ingredients-cost y order-cost no nombran la presentacion
// ---------------------------------------------------------------------------------------------

const RESOLVE_INGREDIENTS_COST = 'lib/modules/pedidos/domain/resolve-ingredients-cost.ts';
const ORDER_COST = 'lib/modules/pedidos/domain/order-cost.ts';
const PATRON_PRESENTACION = /presentation/i;

/** `true` si el fuente (sin comentarios) nombra la presentacion, en cualquier caja. */
export function nombraLaPresentacion(fuente: string): boolean {
  return PATRON_PRESENTACION.test(stripComments(fuente));
}

describe('R13 — el costo de ingredientes no nombra la presentacion', () => {
  it('los dos archivos existen: si se movieron o se renombraron, esta guardia dejo de vigilar R13', () => {
    expect(existsSync(join(repoRoot, RESOLVE_INGREDIENTS_COST))).toBe(true);
    expect(existsSync(join(repoRoot, ORDER_COST))).toBe(true);
  });

  it('`resolve-ingredients-cost.ts` no contiene /presentation/i', () => {
    expect(
      nombraLaPresentacion(leer(RESOLVE_INGREDIENTS_COST)),
      `QC-146 R13: ${RESOLVE_INGREDIENTS_COST} recibe recetas, productos y unidades, nunca el ` +
        'catalogo de presentaciones (design.md > 4). Si esto se pone rojo, algo empezo a pasarle ' +
        'la presentacion a este calculo.',
    ).toBe(false);
  });

  it('`order-cost.ts` no contiene /presentation/i', () => {
    expect(
      nombraLaPresentacion(leer(ORDER_COST)),
      `QC-146 R13: ${ORDER_COST} es dominio puro sobre lineas, lotes y unidades; la presentacion ` +
        'nunca entra a esta funcion (design.md > 4).',
    ).toBe(false);
  });

  it('la regla dispara con un fuente fabricado que nombra la presentacion, y no con uno limpio', () => {
    expect(nombraLaPresentacion("import type { PresentationCatalog } from '@/lib/modules/inventario'")).toBe(
      true,
    );
    expect(nombraLaPresentacion('const presentationId = order.presentationId;')).toBe(true);
    expect(nombraLaPresentacion('const PRESENTATION_LABEL = "x";')).toBe(true);
    // Un comentario que la nombre NO es codigo que la use.
    expect(nombraLaPresentacion('// esto no habla de Presentation en codigo, solo lo explica')).toBe(
      false,
    );
    expect(
      nombraLaPresentacion(
        ['/** aqui NO se recibe ningun PresentationCatalog */', 'export function f(x: number) { return x }'].join(
          '\n',
        ),
      ),
    ).toBe(false);
    expect(nombraLaPresentacion("import type { ProductCatalog } from '@/lib/modules/inventario'")).toBe(
      false,
    );
  });
});

// ---------------------------------------------------------------------------------------------
// R15 — ningun permiso nombra la presentacion y el Operador conserva exactamente sus dos permisos
// ---------------------------------------------------------------------------------------------

// QC-201 le suma `asignaciones.ejecutar`; esta ficha sigue sin sumarle ni quitarle ninguno.
const OPERADOR_ESPERADOS = ['inventario.consultar', 'asignaciones.consultar', 'asignaciones.ejecutar']
  .slice()
  .sort();

/** Los `code` y las `description` del catalogo que mencionan la presentacion, en cualquier caja. */
export function permisosQueNombranLaPresentacion(
  permissions: readonly { readonly code: string; readonly description: string }[],
): string[] {
  return permissions
    .filter((permiso) => PATRON_PRESENTACION.test(permiso.code) || PATRON_PRESENTACION.test(permiso.description))
    .map((permiso) => permiso.code)
    .sort();
}

describe('R15 — ningun permiso nombra la presentacion, y el Operador conserva sus dos permisos', () => {
  it('el catalogo real de `PERMISSIONS` no tiene ningun codigo ni ninguna descripcion sobre la presentacion', () => {
    const hallazgos = permisosQueNombranLaPresentacion(PERMISSIONS);
    expect(
      hallazgos,
      'QC-146 R15: esta ficha no anade ningun permiso (design.md > 4). El campo Presentacion del ' +
        `panel de pedidos se autoriza con \`pedidos.modificar\`, ya existente. Hallazgos: ${hallazgos.join(', ')}`,
    ).toEqual([]);
  });

  it('el Operador tiene EXACTAMENTE `inventario.consultar`, `asignaciones.consultar` y `asignaciones.ejecutar` (QC-201 R3), ni uno mas ni uno menos', () => {
    const delOperador = [...SEED_ROLE_PERMISSIONS[ROLE_OPERADOR]].sort();
    expect(
      delOperador,
      'QC-146 R15: el Operador ve la presentacion en /asignacion SIN permiso nuevo porque ya tiene ' +
        '`asignaciones.consultar` (design.md > 5); esta ficha no le suma ni le quita ninguno.',
    ).toEqual(OPERADOR_ESPERADOS);
  });

  it('las reglas de R15 disparan con un catalogo y un rol fabricados, y no con los limpios', () => {
    const catalogoFabricado = [
      { code: 'inventario.consultar', description: 'Consultar productos e inventario.' },
      { code: 'pedidos.presentation', description: 'Elegir la presentacion de un pedido.' },
      { code: 'pedidos.modificar', description: 'Crear, editar, anular y borrar pedidos con su Presentation.' },
    ];
    expect(permisosQueNombranLaPresentacion(catalogoFabricado)).toEqual(
      ['pedidos.modificar', 'pedidos.presentation'].sort(),
    );

    const catalogoLimpio = [
      { code: 'inventario.consultar', description: 'Consultar productos y presentaciones del inventario.' },
      { code: 'pedidos.modificar', description: 'Crear, editar, anular y borrar pedidos.' },
    ];
    // La descripcion real de `inventario.consultar` (permissions.ts:49) ya dice «presentaciones
    // del inventario» desde antes de esta ficha, y /presentation/i NO la marca: el espanol
    // «presentaci-O-n» difiere del ingles «presentat-I-o-n» justo en esa silaba, asi que el
    // patron que persigue codigo en ingles (`PresentationCatalog`, `presentationId`) no confunde
    // la prosa en espanol de un permiso que no tiene nada que ver con esta feature.
    expect(permisosQueNombranLaPresentacion(catalogoLimpio)).toEqual([]);

    expect(
      [...['inventario.consultar', 'asignaciones.consultar', 'asignaciones.ejecutar']].sort(),
    ).toEqual(OPERADOR_ESPERADOS);
    expect(['inventario.consultar'].sort()).not.toEqual(OPERADOR_ESPERADOS);
    expect(['inventario.consultar', 'asignaciones.consultar'].sort()).not.toEqual(OPERADOR_ESPERADOS);
    expect(
      ['inventario.consultar', 'asignaciones.consultar', 'asignaciones.ejecutar', 'asignaciones.modificar'].sort(),
    ).not.toEqual(OPERADOR_ESPERADOS);
  });
});

// ---------------------------------------------------------------------------------------------
// R30 — package.json no gana dependencias
// ---------------------------------------------------------------------------------------------

const REGISTRO = 'docs/dependencias.md';

/**
 * Copia local de `dependenciasDeclaradas` / `paquetesRegistrados` de
 * `tests/guards/guard-dependencias-aprobadas.test.ts`: no se importa porque aquel archivo declara
 * sus `describe` a nivel de modulo, e importarlo registraria sus dos casos otra vez dentro de esta
 * suite. Es EL MISMO criterio que la guardia -toda dependencia tiene su fila en el registro- y no
 * una lista literal congelada: una lista a mano se desactualizaria con cualquier dependencia que
 * OTRA ficha en paralelo instale y apruebe, y este archivo se pondria rojo por trabajo ajeno.
 */
export function dependenciasDeclaradas(manifiesto: string): string[] {
  const pkg = JSON.parse(manifiesto) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  return [...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.devDependencies ?? {})].sort();
}

export function paquetesRegistrados(registro: string): Set<string> {
  const registrados = new Set<string>();
  for (const linea of registro.split('\n')) {
    const fila = linea.trim();
    if (!fila.startsWith('|')) continue;
    const primeraCelda = fila.split('|')[1]?.trim() ?? '';
    const match = /^`([^`]+)`$/.exec(primeraCelda);
    if (match) registrados.add(match[1]);
  }
  return registrados;
}

describe('R30 — package.json no gana ninguna dependencia', () => {
  it('toda dependencia de `package.json` sigue teniendo su fila en `docs/dependencias.md`', () => {
    const registrados = paquetesRegistrados(leer(REGISTRO));
    const sinAprobar = dependenciasDeclaradas(leer('package.json')).filter(
      (nombre) => !registrados.has(nombre),
    );

    expect(
      sinAprobar,
      'QC-146 R30: esta ficha no anade ninguna dependencia (design.md > 4): zod, el selector ' +
        `compartido y el autocompletado ya estan en el repo. Sin fila en ${REGISTRO}: ${sinAprobar.join(', ')}`,
    ).toEqual([]);
  });

  it('la regla dispara con un manifiesto fabricado que trae una dependencia sin fila, y no con uno registrado', () => {
    const registro = ['| Paquete | Para que | Estado | Fecha | Notas |', '| --- | --- | --- | --- | --- |', '| `zod` | Validacion | aprobada | 2026-01-01 | - |'].join(
      '\n',
    );
    const registrados = paquetesRegistrados(registro);

    expect(
      dependenciasDeclaradas('{"dependencies":{"zod":"^3","presentation-picker":"^1"}}').filter(
        (nombre) => !registrados.has(nombre),
      ),
    ).toEqual(['presentation-picker']);
    expect(
      dependenciasDeclaradas('{"dependencies":{"zod":"^3"}}').filter((nombre) => !registrados.has(nombre)),
    ).toEqual([]);
  });
});
