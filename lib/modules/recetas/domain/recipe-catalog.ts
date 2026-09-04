// lib/modules/recetas/domain/recipe-catalog.ts
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
   *  `isDeleted: true`. Un id que no existe simplemente no vuelve. El nombre es explicito
   *  para que nadie lo confunda con `ProductCatalog.findRefs`/`UnitCatalog.findRefs`, que
   *  devuelven SOLO lo vivo. */
  findRefsIncludingDeleted(ids: readonly RecipeId[]): Promise<readonly RecipeRef[]>;
}
