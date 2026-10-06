// T11 (QC-90, alta-del-primer-lote) — LIMITES DE ALCANCE del modulo `inventario`.
//
// Esta ficha ENSANCHA el modulo: le mete la escritura del primer lote. Dos cosas que
// deliberadamente NO entran quedan aqui escritas como test, porque son ausencias y una
// ausencia no la protege nadie salvo que alguien la afirme en positivo:
//
//   R30 — el contrato publico NO expone ninguna operacion de EDITAR ni BORRAR lotes. Nacio
//         prohibiendo tambien LISTAR porque «listar, editar y borrar lotes» no tenia ficha
//         (`requirements.md > Alcance > Lo que NO entra`) y nacia el dia que alguien la pidiera:
//         el 2026-09-18 la pidio QC-92 y esa parte queda derogada (ver la nota del describe).
//
//   R31 — el listado de productos NO devuelve presentacion, asi que al elegir un producto
//         existente en el autocomplete el selector de presentacion queda VACIO. Es la
//         **alternativa B de `design.md > 10`**, DESCARTADA a proposito: servir la presentacion
//         del ultimo lote obligaria a devolverla en `ProductView` -el tipo que consumen el
//         listado, la ficha y `getProduct`- y a meter un join «ultimo lote» en la consulta mas
//         caliente de la pantalla, que ademas pisa el terreno de QC-91. **El coste aceptado,
//         textual: al elegir un producto existente el selector de presentacion queda en blanco
//         y hay que elegirla a mano.** El hilo del componente (`presentationId`/
//         `presentationName` opcionales en `ProductNameOption`) se deja puesto, pero HOY NUNCA
//         VIENE POBLADO.
//
// Por que un archivo NUEVO y no `scope.test.ts` ni `product-route-contract.test.ts`: el
// primero es el alcance de QC-20 medido sobre el ARBOL DE ARCHIVOS (que no haya route handlers
// ni una segunda pantalla del catalogo) y el segundo es el contrato de la RUTA
// `app/(private)/inventario`. Lo que R30 mira no es ni una cosa ni la otra: es el CONTRATO DEL
// MODULO (`lib/modules/inventario/index.ts`), y el precedente de este repo para eso tiene
// nombre propio -`tests/unit/recetas/module-contract.test.ts`-. R31 le hace pareja natural: es
// la frontera entre ese contrato (`ProductView`) y su unico consumidor afectado.
//
// Cubre R30, R31.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import * as inventario from '@/lib/modules/inventario';
import type { ProductView } from '@/lib/modules/inventario';

/** Sube desde este archivo hasta la raiz del repo (la carpeta con `package.json`). */
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

/**
 * Quita comentarios de linea y de bloque. Hace falta de verdad: los dos archivos que se leen
 * aqui EXPLICAN EN PROSA por que no llevan presentacion, y esa prosa no es una declaracion.
 */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((line) => line.replace(/\/\/.*/, ''))
    .join('\n');
}

/** Parte un identificador en palabras: `addBatchToAlive` -> add, batch, to, alive. */
function words(identifier: string): readonly string[] {
  return identifier
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_\-.]/g, ' ')
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => word.length > 0);
}

/**
 * Palabras que denotan las TRES operaciones que R30 prohibe. `create` NO esta, y no es un
 * descuido: el alta del primer lote es justo lo que esta ficha construye, y su esquema
 * (`createProductWithFirstBatchSchema`) se publica a proposito.
 */
const OPERACIONES_PROHIBIDAS = new Set([
  // listar / leer
  'list',
  'listar',
  'get',
  'find',
  'fetch',
  'read',
  'query',
  'search',
  'buscar',
  'obtener',
  // editar
  'update',
  'edit',
  'patch',
  'modify',
  'actualizar',
  'editar',
  'modificar',
  // borrar
  'delete',
  'remove',
  'destroy',
  'archive',
  'borrar',
  'eliminar',
]);

/** Palabras que hacen que un export hable de LOTES y no de otra cosa. */
const PALABRAS_DE_LOTE = new Set(['batch', 'batches', 'lot', 'lots', 'lote', 'lotes']);

/**
 * 2026-09-18 (QC-92, enmienda al spec aprobada por el humano): conjunto CERRADO de verbos de
 * lectura cuya prohibicion queda DEROGADA. R30 decia que listar, editar y borrar lotes «NO tiene
 * ficha: si hace falta, se pide una»; QC-92 es esa ficha, y sus R22 (panel de lotes) y R23
 * (historial del lote) no existen sin publicar esa lectura en el contrato. No se acota por rama:
 * tras el merge el barrel expone el listado de lotes para siempre. Editar y borrar siguen
 * prohibidos, y `OPERACIONES_PROHIBIDAS` no se toca: cambia que se considera infraccion, no como
 * se caza. No es una lista de excepciones que crezca: se escribe de una vez y con su fecha.
 */
const OPERACIONES_DE_LECTURA_DEROGADAS = new Set([
  'list',
  'listar',
  'get',
  'find',
  'fetch',
  'read',
  'query',
  'search',
  'buscar',
  'obtener',
]);

/** Un nombre infringe si junta una palabra de lote con una operacion prohibida NO derogada. */
function operacionesDeLoteVigentes(nombres: readonly string[]): string[] {
  return nombres
    .filter((nombre) => {
      const partes = words(nombre);
      return (
        partes.some((parte) => PALABRAS_DE_LOTE.has(parte)) &&
        partes.some(
          (parte) =>
            OPERACIONES_PROHIBIDAS.has(parte) && !OPERACIONES_DE_LECTURA_DEROGADAS.has(parte),
        )
      );
    })
    .sort();
}

describe('QC-90 R30 — el contrato de inventario no ofrece editar ni borrar lotes', () => {
  // Se mira lo que el barrel EXPORTA DE VERDAD -las claves del modulo ya cargado-, no un regex
  // sobre su texto: un regex se engana con un comentario, con un reexport indirecto o con un
  // `export * from`. Aqui solo aparecen los exports de VALOR, que es exactamente lo que una
  // «operacion» es: un tipo no ejecuta nada y desaparece al compilar.
  const claves = Object.keys(inventario).sort();

  it('el barrel se pudo cargar y publica exports de valor (ancla anti-vacuidad)', () => {
    // Sin esto, un barrel que dejara de exportar -o un import que devolviera `{}`- haria pasar
    // en verde el caso de abajo sin haber mirado nada. Las dos claves citadas son las que esta
    // misma ficha publico en T3: si desaparecen, el sujeto de R30 cambio y hay que revisarlo.
    expect(
      claves.length,
      'el barrel de inventario no expone ningun export de valor: este archivo no vigila nada',
    ).toBeGreaterThan(10);
    expect(claves).toContain('createProductWithFirstBatchSchema');
    expect(claves).toContain('PRODUCT_BATCH_LOT_MAX_LENGTH');
  });

  it('ningun export del contrato denota editar ni borrar lotes', () => {
    // La regla NO es una lista negra de nombres concretos -de esas hay que acordarse, y nadie
    // se acuerda-: es estructural. Cualquier export NUEVO cuyo nombre junte una palabra de lote
    // con un verbo de editar/borrar pone esto rojo, se llame `deleteBatch` o `updateLote`.
    // 2026-09-18: los verbos de lectura ya no cuentan (ver la nota de OPERACIONES_DE_LECTURA_DEROGADAS).
    const infractores = operacionesDeLoteVigentes(claves);
    expect(
      infractores,
      `el contrato publico de inventario expone operaciones de lote que R30 prohibe: ${infractores.join(', ')}. ` +
        'Editar y borrar lotes no tiene ficha (requirements.md > Lo que NO entra): si hace falta, se pide una, ' +
        'como QC-92 pidio la de listar.',
    ).toEqual([]);
  });

  // 2026-09-18: prueba por mutacion de la derogacion, sobre nombres FABRICADOS y no sobre el
  // barrel real, para no fijar en el archivo el estado del arbol.
  it('tras la derogacion la politica sigue mordiendo editar y borrar, y ya no listar', () => {
    expect(
      operacionesDeLoteVigentes([
        'deleteBatch',
        'updateLot',
        'borrarLotes',
        'editBatch',
        'removeBatch',
      ]),
    ).toEqual(['borrarLotes', 'deleteBatch', 'editBatch', 'removeBatch', 'updateLot']);

    expect(
      operacionesDeLoteVigentes(['listProductBatches', 'findBatchMovements', 'getBatch']),
    ).toEqual([]);

    // El alta nunca estuvo prohibida, ni antes ni despues.
    expect(
      operacionesDeLoteVigentes(['createProductWithFirstBatchSchema', 'addBatchToAlive']),
    ).toEqual([]);
  });
});

// QC-90 R31 prohibia toda presentacion en `ProductView` porque la de entonces era la del LOTE.
// QC-195 (R8-R10) devuelve al producto su presentacion FIJA -la del envase-, en cuatro campos
// opcionales. Este bloque vigila ahora que sean esos cuatro y ninguno mas: la del lote sigue
// fuera del listado.
const CAMPOS_DE_PRESENTACION_FIJA = [
  'presentationContent',
  'presentationId',
  'presentationName',
  'presentationUnitId',
] as const;

describe('QC-90 R31, QC-195 R8-R10 — el listado de productos solo devuelve la presentacion fija', () => {
  // Mordida en TIEMPO DE COMPILACION, ademas de la de tiempo de test: si alguien anade otro
  // campo `presentation*` a `ProductView`, `pnpm run typecheck` se pone rojo aqui mismo.
  type CamposPresentacion<T> = Extract<keyof T, `presentation${string}`>;
  type SoloLaFija<T> = [CamposPresentacion<T>] extends [(typeof CAMPOS_DE_PRESENTACION_FIJA)[number]]
    ? [(typeof CAMPOS_DE_PRESENTACION_FIJA)[number]] extends [CamposPresentacion<T>]
      ? true
      : never
    : never;
  const productViewSoloPresentacionFija: SoloLaFija<ProductView> = true;
  void productViewSoloPresentacionFija;

  it('QC-195 R8-R10: ProductView declara solo los cuatro campos de la presentacion fija', () => {
    const fuente = stripComments(
      readFileSync(
        join(repoRoot, 'lib', 'modules', 'inventario', 'domain', 'product-view.ts'),
        'utf8',
      ),
    );
    const bloque = /export type ProductView = \{([\s\S]*?)^\}/m.exec(fuente);
    expect(
      bloque,
      'no se encontro la declaracion de ProductView: este caso no vigila nada',
    ).not.toBeNull();
    const cuerpo = bloque?.[1] ?? '';
    expect(cuerpo, 'ancla anti-vacuidad: el cuerpo de ProductView debe traer sus campos').toContain(
      'qtyAlert',
    );
    const declarados = [...new Set(cuerpo.match(/\bpresentation\w*/gi) ?? [])].sort();
    expect(
      declarados,
      'ProductView declara una presentacion distinta de la fija del producto: la del lote no ' +
        'vuelve al listado (QC-90 R31).',
    ).toEqual([...CAMPOS_DE_PRESENTACION_FIJA]);
  });

  it('la opcion del autocomplete de nombre llega sin presentationId poblado desde el listado', () => {
    // El hilo esta puesto en `ProductNameOption` -`presentationId`/`presentationName`
    // OPCIONALES- pero `listProductsAction` devuelve `ProductView`, que no los trae: el mapeo
    // del picker solo puede poblar `id`, `name` y `qtyAlert`. Coste aceptado de R31 y de la
    // alternativa B: al elegir un producto existente el selector de presentacion queda EN
    // BLANCO y se elige a mano.
    const picker = stripComments(
      readFileSync(
        join(repoRoot, 'app', '(private)', 'inventario', 'components', 'product-name-picker.tsx'),
        'utf8',
      ),
    );

    // Los dos campos siguen siendo OPCIONALES en el tipo: volverlos obligatorios seria afirmar
    // que el listado los trae, y hoy no los trae.
    expect(picker, 'ProductNameOption debe declarar presentationId opcional').toMatch(
      /readonly presentationId\?:/,
    );
    expect(picker, 'ProductNameOption debe declarar presentationName opcional').toMatch(
      /readonly presentationName\?:/,
    );

    // El mapeo de la pagina del listado a opciones: ahi es donde se poblarian si vinieran.
    const mapeo = /result\.data\.items\.map\(\(item\) => \(\{([\s\S]*?)\}\)\)/.exec(picker);
    expect(
      mapeo,
      'no se encontro el mapeo de listProductsAction a opciones en product-name-picker.tsx: ' +
        'este caso no vigila nada',
    ).not.toBeNull();
    const cuerpo = mapeo?.[1] ?? '';
    expect(cuerpo, 'ancla anti-vacuidad: el mapeo debe poblar al menos el nombre').toContain(
      'name:',
    );
    expect(
      cuerpo,
      'el picker esta poblando la presentacion desde el listado: eso es la alternativa B de ' +
        '`design.md > 10`, descartada en R31 porque obliga a devolver presentacion en ' +
        'ProductView y a meter un join «ultimo lote» en la consulta mas caliente de la pantalla.',
    ).not.toMatch(/presentation/i);
  });
});
