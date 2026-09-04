import { listPresentationsAction } from '@/lib/modules/inventario/adapters/driving/presentation-actions';
import type { UnitRef } from '@/lib/modules/unidades';
import { MAX_PAGE_SIZE } from '@/lib/shared/pagination';

/**
 * Diccionarios id -> nombre de presentacion y de unidad (R22, `design.md > 6.2`).
 *
 * `CatalogLineView` entrega `presentationId` y `unitId` **en crudo** -QC-52 lo dejo escrito y lo
 * reenvio a esta ficha-, asi que resolverlos es trabajo de esta pantalla. Se hace **en el
 * servidor y UNA sola vez por render de la seccion, nunca por fila**: pedir el detalle por fila
 * serian hasta 25 consultas por pagina, el peor patron que esta pantalla podia adoptar
 * (`design.md > 13.F`).
 *
 * **Unidades**: NO se piden aqui. El catalogo entero -ya acotado a 200 por QC-26- lo pide la
 * pagina de detalle **una sola vez** con `listUnitsAction()` y baja por props hasta esta funcion
 * (R46, `design.md > 8.2`). Construir el diccionario es entonces recorrer un arreglo que ya esta
 * en memoria: cero consultas. Pedirlas de nuevo aqui era trabajo duplicado en cada carga.
 *
 * **Presentaciones**: `listPresentationsAction` **solo existe paginada** (tope 25). Se recorren
 * paginas mientras queden y **hasta la cota declarada** `MAX_PRESENTATION_PAGES`, de modo que no
 * exista ninguna secuencia de consultas sin limite superior -mismo criterio que el `MAX_UNITS` de
 * QC-26-.
 *
 * SI un identificador no aparece en su diccionario -unidad ausente, presentacion fuera de la
 * cota, o directorio que fallo-, la resolucion devuelve `null` y la celda pinta un **marcador
 * identificable**, nunca el uuid (R22). El diccionario incompleto no es un error de la pantalla:
 * es la carencia de backend anotada como `P4` en `requirements.md`, cuya solucion de fondo es una
 * operacion de lectura por ids en `inventario` -ficha de backend, que R49 prohibe abrir aqui-.
 *
 * Este archivo **no decide ningun permiso** (R7): las dos operaciones que llama ya exigen
 * Administrador en su caso de uso, y si responden con error el resultado es un diccionario vacio,
 * es decir marcadores, nunca datos inventados.
 */

/** La primera pagina de presentaciones. */
const FIRST_PAGE = 1;

/**
 * Cota superior de paginas de presentaciones que se recorren (500 presentaciones con el tope de
 * 25 por pagina). Es una **cota declarada**, no un limite tecnico: sin ella este bucle seria una
 * secuencia de consultas sin limite superior, que es lo que ninguna pantalla de este repo puede
 * tener. Un catalogo mas grande no rompe nada -las presentaciones que queden fuera pintan el
 * marcador de R22-, y la solucion de fondo esta anotada como `P4`.
 */
export const MAX_PRESENTATION_PAGES = 20;

export type CatalogDirectories = {
  /** id de presentacion -> nombre. Incompleto si el catalogo excede la cota o la consulta fallo. */
  readonly presentations: ReadonlyMap<string, string>;
  /** id de unidad -> etiqueta (`symbol` cuando existe, `name` cuando no). */
  readonly units: ReadonlyMap<string, string>;
};

/** Diccionarios vacios: todo se resuelve a marcador. Util para el esqueleto y para los tests. */
export const EMPTY_CATALOG_DIRECTORIES: CatalogDirectories = {
  presentations: new Map(),
  units: new Map(),
};

/**
 * Nombre de la presentacion, o `null` cuando no se puede resolver (R22). Devolver `null` -y no el
 * identificador- es lo que impide que la celda acabe pintando un uuid.
 */
export function resolvePresentationName(
  directories: CatalogDirectories,
  presentationId: string,
): string | null {
  return directories.presentations.get(presentationId) ?? null;
}

/**
 * Etiqueta de la unidad, o `null` cuando no se puede resolver (R22).
 *
 * La unidad es **opcional** en la linea (QC-52), asi que un `unitId` nulo de entrada es un caso
 * normal y no un fallo: quien decide como se pinta esa ausencia es la columna, que usa la marca de
 * «sin dato» y no el marcador de «no resuelto». Aqui los dos siguen devolviendo `null` porque para
 * esta funcion la pregunta es una sola -¿hay nombre que mostrar?-, y devolver el identificador
 * jamas es una respuesta.
 */
export function resolveUnitLabel(
  directories: CatalogDirectories,
  unitId: string | null,
): string | null {
  if (unitId === null) return null;
  return directories.units.get(unitId) ?? null;
}

/**
 * Diccionario de unidades a partir del catalogo **ya cargado** por la pagina. Funcion pura: no
 * consulta nada. Un arreglo vacio -el catalogo no llego- deja el diccionario vacio, y entonces
 * cada unidad pinta el marcador de «no resuelto» (R22).
 */
function buildUnitDirectory(units: readonly UnitRef[]): ReadonlyMap<string, string> {
  const directory = new Map<string, string>();
  for (const unit of units) {
    // `symbol` cuando existe y `name` cuando no: mismo criterio que QC-26 (`design.md > 8.2`).
    directory.set(unit.id, unit.symbol ?? unit.name);
  }
  return directory;
}

/**
 * Presentaciones pagina a pagina, **hasta `MAX_PRESENTATION_PAGES`**. Las paginas se piden en
 * serie a proposito: cuantas quedan solo se sabe leyendo `totalPages` de la anterior, y pedirlas
 * todas a la vez seria pedir a ciegas.
 */
async function buildPresentationDirectory(): Promise<ReadonlyMap<string, string>> {
  const directory = new Map<string, string>();

  for (let page = FIRST_PAGE; page <= MAX_PRESENTATION_PAGES; page += 1) {
    // Cada pagina depende del `totalPages` de la anterior, asi que se piden en serie.
    const result = await listPresentationsAction({ page, pageSize: MAX_PAGE_SIZE });
    // Un fallo deja el diccionario como este: lo ya resuelto se muestra y el resto pinta marcador.
    if (result.status === 'error') return directory;

    for (const presentation of result.data.items) {
      directory.set(presentation.id, presentation.name);
    }
    if (result.data.page >= result.data.totalPages) break;
  }

  return directory;
}

/**
 * Construye los dos diccionarios. Se llama UNA vez por render de la seccion del catalogo.
 *
 * Las unidades llegan **por parametro**, no se vuelven a pedir: son las mismas que la pagina de
 * detalle ya resolvio para el panel lateral (R46).
 */
export async function buildCatalogDirectories(
  units: readonly UnitRef[],
): Promise<CatalogDirectories> {
  return {
    presentations: await buildPresentationDirectory(),
    units: buildUnitDirectory(units),
  };
}
