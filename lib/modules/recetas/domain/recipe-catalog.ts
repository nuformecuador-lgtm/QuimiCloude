// lib/modules/recetas/domain/recipe-catalog.ts
import type { RecipeStepView } from './recipe-view';

/** Identificador de una receta visto DESDE FUERA de `recetas`. Es lo unico que otro modulo
 *  guarda de una receta (p. ej. `orders.recipe_id`). Anadido por QC-33; el modelo de QC-24 NO
 *  se toca (R5). */
export type RecipeId = string;

/** Lo que otro modulo puede saber de una receta sin tocar su tabla. `isDeleted` va en el Ref y
 *  no en dos metodos distintos a proposito (QC-34 `design.md > 11.3`): quien lee un pedido
 *  necesita el nombre de una receta dada de baja (QC-34 R44) y quien valida un alta necesita
 *  rechazarla (QC-34 R15), y las dos preguntas se responden con la MISMA lectura. */
export type RecipeRef = {
  readonly id: RecipeId;
  readonly name: string;
  readonly isDeleted: boolean;
};

/** Servicio que `recetas` ofrece a los demas modulos (`docs/architecture.md > Dominio` n.o 2:
 *  «se comparten servicios via interfaz, nunca repositorios ni tablas»). Lo implementa un
 *  adaptador driven DE RECETAS —el unico autorizado a consultar `prisma.recipe`— y lo cablea
 *  `lib/composition`. Es tambien el mecanismo que QC-33 R32 previo para que `pedidos` sepa de
 *  una receta sin consultar su modelo ni importar `recetas` por ruta profunda. */
export interface RecipeCatalog {
  /** Referencias de las recetas pedidas, INCLUIDAS LAS DADAS DE BAJA, que vienen con
   *  `isDeleted: true`. Un id que no existe simplemente no vuelve -y una receta de OTRA
   *  empresa tampoco: para quien pregunta son el mismo caso-. El nombre es explicito para
   *  que nadie lo confunda con `ProductCatalog.findRefs`/`UnitCatalog.findRefs`, que
   *  devuelven SOLO lo vivo.
   *
   *  Recibe `companyId` como cadena suelta y no como un tipo de ambito propio de `recetas`:
   *  ese tipo es interno del modulo, y publicarlo por el barrel para que OTRO modulo lo
   *  construya acoplaria dos modulos por un dato que ya es una cadena en los dos lados. La
   *  firma exige el ambito para que una llamada que lo omita no compile. */
  findRefsIncludingDeleted(
    ids: readonly RecipeId[],
    companyId: string,
  ): Promise<readonly RecipeRef[]>;

  /** El contenido con el que se ejecuta una receta, INCLUIDA UNA DADA DE BAJA (viene con
   *  `isDeleted: true`, nunca `null` por eso). `null` es solo «este id no existe». */
  findExecutionContentById(id: RecipeId): Promise<RecipeExecutionContent | null>;
}

/** Linea de receta tal como la ve la ejecucion: sin `id` propio, sin autoria, sin marcas de
 *  tiempo. `productName` no lo resuelve este catalogo -`recetas` no conoce el nombre de un
 *  producto, ese dato es de `inventario`-, asi que sale siempre `null`; quien orqueste la
 *  pantalla lo completa con su propio `ProductCatalog`. */
export type RecipeExecutionLine = {
  readonly productId: string;
  readonly productName: string | null;
  readonly quantity: string;
  readonly unitId: string;
};

/** Lo que hace falta para EJECUTAR una receta: pasos y lineas, y nada de lo que la pantalla no
 *  pinta (ni `imageUrl`, ni autoria, ni marcas de tiempo). */
export type RecipeExecutionContent = {
  readonly id: RecipeId;
  readonly name: string;
  readonly isDeleted: boolean;
  readonly steps: readonly RecipeStepView[];
  readonly lines: readonly RecipeExecutionLine[];
};
