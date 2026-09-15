import { requirePermission, type Actor } from './actor';
import { ProductNotFoundError, ValidationError } from './errors';
import {
  createProductWithFirstBatchSchema,
  type CreateProductWithFirstBatchInput,
} from './product-batch-input';
import { deriveUnitCost } from './unit-cost';

import type { NewProductBatch } from './product-batch';
import type { NewProduct } from './product-view';
import type { ProductRepository } from '../ports/product-repository';

export type CreateProductDeps = {
  readonly products: ProductRepository;
  /**
   * El spec (`design.md > 7`) exige que el puerto reciba un `now: Date`, pero no dice de
   * donde sale ese instante -no es una entrada del actor, ni algo que el borde valide-.
   * Se resuelve como dependencia INYECTABLE, con `() => new Date()` por defecto, para que
   * el test de servicio pueda fijar el instante sin tocar el reloj global. No se lee
   * `next/headers` ni ninguna sesion aqui: eso violaria R1.
   */
  readonly now?: () => Date;
};

/** Entrada ya validada por el esquema del alta: el unico tipo que este archivo manipula. */
type EntradaValidada = CreateProductWithFirstBatchInput;

/**
 * Costo unitario que se guarda, en CADENA decimal (R6, R7, R10).
 *
 * El unitario recibido PREVALECE y el total ni se mira: no se comparan uno con otro a
 * proposito -`total / existencia` redondea a 4 decimales y una discrepancia de un centimo
 * por redondeo seria un rechazo que nadie puede corregir- (pregunta abierta 4).
 *
 * El `ValidationError` de la derivacion nula (R9) es DEFENSA EN PROFUNDIDAD: el esquema ya
 * caza ese caso -y lo cuelga del campo del costo total, que es donde R9 pide pintarlo-. Se
 * repite aqui porque el caso de uso no puede TIPAR `unitCost: string` apoyandose en una
 * regla que vive en otro archivo; sin esta rama, el `null` se colaria en el lote.
 *
 * Ningun importe se convierte a numero de coma flotante en este archivo (R4): entra cadena,
 * sale cadena, y la unica aritmetica -`deriveUnitCost`- es con `BigInt`. El barrido de texto
 * de `create-product.test.ts` es lo que lo mantiene cierto, y por eso este comentario NO
 * escribe los nombres de las funciones prohibidas: las cazaria a si mismo.
 */
function resolverCostoUnitario(entrada: EntradaValidada): string {
  if (entrada.unitCost != null) return entrada.unitCost;

  if (entrada.totalCost == null) throw new ValidationError();

  const derivado = deriveUnitCost(entrada.totalCost, entrada.stock);
  if (derivado === null) throw new ValidationError();

  return derivado;
}

/**
 * «Hoy» como fecha CIVIL en UTC (`YYYY-MM-DD`), a partir del instante que se le pasa.
 *
 * UTC y no la zona del servidor por coherencia con el adaptador, que escribe la fecha civil como
 * `YYYY-MM-DDT00:00:00Z`, y con el relleno de la migracion, que lee `created_at AT TIME ZONE
 * 'UTC'` (`design.md > 2.1`, `> 4.3`). Con la zona local, la misma alta daria dos «hoy» distintos
 * segun la maquina.
 */
function fechaCivilUtc(instante: Date): string {
  return instante.toISOString().slice(0, 10);
}

/**
 * Fecha de compra que se guarda (QC-81 R2, R3, R4, R5).
 *
 * - No vino ⇒ HOY, derivado del instante que recibe, que es el MISMO que el alta usa para
 *   `created_at`/`updated_at` (R2). No se lee un segundo reloj: con dos, un alta hecha justo en el
 *   cambio de dia podria guardar la compra un dia y la creacion otro.
 * - Vino y es posterior a hoy ⇒ `ValidationError` con `purchaseDate` en el diagnostico (R4). Lo que
 *   aun no llego no es existencia.
 * - Vino y es hoy o antes ⇒ TAL CUAL, sin corregirla (R3, R5).
 *
 * La comparacion es entre CADENAS civiles `YYYY-MM-DD`: con año, mes y dia de ancho fijo el orden
 * lexicografico es el del calendario, y asi no se convierte ninguna fecha a instante -que es por
 * donde entra el corrimiento de dia-. La forma y que el dia exista ya los garantizo el esquema (R6).
 */
function resolverFechaDeCompra(entrada: EntradaValidada, instante: Date): string {
  const hoy = fechaCivilUtc(instante);

  if (entrada.purchaseDate == null) return hoy;

  if (entrada.purchaseDate > hoy) {
    throw new ValidationError(`purchaseDate: fecha de compra futura (${entrada.purchaseDate} > ${hoy})`);
  }

  return entrada.purchaseDate;
}

/**
 * Alta de producto CON su primer lote (QC-90 R1). No hay un segundo caso de uso al lado:
 * dejar dos altas de producto significaria dejar una capaz de crear un producto sin lote,
 * que es justo lo que R1 prohibe (`design.md > 10 C`).
 *
 * `requirePermission(actor, 'inventario.modificar')` es la PRIMERA linea, antes de zod y
 * antes de tocar el puerto (R23): un actor sin permiso ni siquiera dispara la validacion.
 *
 * Orden fijo (QC-81 `design.md > 4.3`, que amplia el de QC-90): permiso -> zod -> fecha de
 * compra (hoy por defecto, rechazo de la futura) -> derivacion del costo -> resolucion por
 * nombre -> escritura. La fecha va ANTES de tocar el puerto: una fecha futura se rechaza sin
 * consultar el nombre y sin escribir nada (QC-81 R4).
 *
 * QC-81 (R2): el instante se lee UNA vez, justo despues de zod, y de el salen «hoy» para la fecha
 * de compra Y el `now` que el puerto escribe en `created_at`/`updated_at`. Hasta QC-81 se leia
 * tras la consulta por nombre; adelantarlo unas lineas es lo que permite que haya un solo reloj.
 * Sigue sin leerse antes del permiso: un actor sin permiso no dispara ni el reloj (R24).
 *
 * QC-49 (R17, R18): la empresa que se escribe en las filas es LA DEL ACTOR y sale de un solo
 * sitio, el ambito que se construye aqui tras el permiso. No entra por la entrada del llamante
 * -`createProductWithFirstBatchSchema` no declara ningun campo de empresa y rechaza los
 * desconocidos, asi que enviarlo es `invalid_input`- ni viaja en `NewProduct` ni en
 * `NewProductBatch`: lo que no esta en el tipo no se puede escribir por accidente. La
 * resolucion por nombre del paso 4 mira solo los vivos de esa empresa, asi que un homonimo de
 * otra empresa NO captura el lote: el alta crea un producto nuevo en la del actor.
 */
export function createCreateProduct(
  deps: CreateProductDeps,
): (input: unknown, actor: Actor | null | undefined) => Promise<{ id: string }> {
  const now = deps.now ?? (() => new Date());

  return async function createProduct(
    input: unknown,
    actor: Actor | null | undefined,
  ): Promise<{ id: string }> {
    // 1. Permiso (R23). Antes de zod y antes del puerto.
    requirePermission(actor, 'inventario.modificar');

    // 1b. QC-49 (R17): el ambito, DESPUES del permiso y a partir del actor. Es lo unico que
    //     este caso de uso hace con la empresa: no construye ninguna condicion de consulta.
    const scope = { companyId: actor.companyId };

    // 2. Revalidacion en el servidor con el MISMO esquema que usa el formulario (R24).
    const parsed = createProductWithFirstBatchSchema.safeParse(input);
    if (!parsed.success) throw new ValidationError();
    const entrada = parsed.data;

    // 3. Fecha de compra (QC-81 R2, R4, R5), con el UNICO instante del alta. Antes del costo y
    //    antes del puerto: una fecha futura no llega a consultar el nombre.
    const instante = now();
    const purchaseDate = resolverFechaDeCompra(entrada, instante);

    // 4. Costo (R6, R7, R9, R10).
    const batch: NewProductBatch = {
      presentationId: entrada.presentationId,
      // R3: una existencia de `0` crea el lote igualmente, con `stock` 0. El `CHECK` de la
      // columna es `>= 0`, asi que no es motivo de rechazo por si sola.
      stock: entrada.stock,
      unitCost: resolverCostoUnitario(entrada),
      // QC-81 (R8, R10): el lote ausente viaja como `null`, y `null` ya NO significa «se guarda
      // vacio» -la columna es NOT NULL desde QC-81- sino «que lo genere el backend»: el adaptador
      // calcula el correlativo dentro de la transaccion que escribe (`design.md > 3.1`). El lote
      // escrito llega recortado por el esquema, que tambien rechazo el de solo espacios, y se
      // pasa tal cual. `?? null` colapsa `undefined` y `null`, que es lo que `nullish()` deja
      // llegar.
      lot: entrada.lot ?? null,
      // R12 (QC-90): la expiracion SI sigue siendo opcional y ausente se guarda `NULL`.
      expiryDate: entrada.expiryDate ?? null,
      // QC-81 (R1, R3): siempre escrita, ya resuelta en el paso 3.
      purchaseDate,
      // R22: la autoria del lote es el ACTOR DE LA SESION. Es para lo que la migracion del
      // 2026-09-09 mudo `created_by`/`updated_by` desde `products` hasta aqui; el actor ya
      // no se usaba mas que para el permiso y ahora si viaja al puerto.
      createdBy: actor.id,
    };

    // 5. ¿El producto ya existe? Se decide POR NOMBRE contra los productos vivos (R15), no
    //    por un identificador que envie el navegador (`design.md > 10 A`). Normalizar y
    //    filtrar los borrados es del adaptador: aqui solo se pasa el nombre.
    //    R20 -que con homonimos vivos se elija siempre el mismo- se cierra en el adaptador
    //    con su `orderBy`; el caso de uso usa lo que el puerto devuelva, sea cual sea.
    const existente = await deps.products.findAliveIdByName(entrada.name, scope);

    if (existente !== null) {
      // 6a. R17: se le agrega el lote a ESE producto y NO se crea otro. R18: el candidato
      //     del producto -nombre, existencia, alerta- NO VIAJA; lo que no se pasa
      //     no se puede escribir por accidente.
      const agregado = await deps.products.addBatchToAlive(existente, batch, instante, scope);

      // El producto dejo de estar vivo entre la consulta y la escritura. Se LANZA en vez de
      // caer al camino de creacion: crear aqui escribiria el nombre, la existencia y la
      // alerta del panel, que en este camino R18 declara IGNORADOS -quien los escribio ya
      // sabe que no se guardan-, y lo haria en silencio. Con el rechazo, quien reintenta
      // vuelve a pasar por `findAliveIdByName`, que ahora dira `null`, y el alta seguira el
      // camino de creacion con la entrada validada de nuevo. R1 se mantiene: no se escribio
      // ningun producto, asi que no queda ninguno sin lote.
      if (agregado === null) throw new ProductNotFoundError(existente);

      // R17: el `id` devuelto es el del producto QUE YA EXISTIA. `CreateProductFormState`
      // no cambia de forma por esto (`design.md > 7`).
      return { id: existente };
    }

    // 6b. R16: producto nuevo. La existencia escrita va en LAS DOS filas -producto y lote-,
    //     transitoriamente, hasta que QC-91 la convierta en la suma de los lotes (decision
    //     cerrada del 2026-09-10). R21 -las dos escrituras en una transaccion- es del
    //     adaptador: el puerto ofrece UNA operacion, no dos, justo para que el dominio no
    //     pueda dejar la mitad escrita.
    //     QC-80 (R21): el producto NO declara unidad y por eso aqui no se escribe ninguna.
    //     La unidad no se perdio: la declara la PRESENTACION del lote (`presentations.unit_id`,
    //     NOT NULL) y la del producto se DERIVA de la presentacion de su lote MAS RECIENTE al
    //     leer (R22), o es «ninguna» si todavia no tiene lotes (R23). No hay nada que copiar.
    const producto: NewProduct = {
      name: entrada.name,
      stock: entrada.stock,
      qtyAlert: entrada.qtyAlert,
    };

    const creado = await deps.products.createWithFirstBatch(producto, batch, instante, scope);
    return { id: creado.id };
  };
}
