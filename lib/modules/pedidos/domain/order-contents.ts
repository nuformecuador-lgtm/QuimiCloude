// lib/modules/pedidos/domain/order-contents.ts
import type { RecipeId } from '@/lib/modules/recetas';

/** Lo que un pedido guarda de la receta: SU IDENTIFICADOR, nada mas
 *  (`docs/architecture.md > Dominio` n.o 2). `pedidos` no conoce la tabla de recetas, y quien
 *  necesite el nombre de la receta para pintarlo lo pedira al contrato de su dueno.
 *
 *  QC-35bis (2026-09-07): aqui vivian tambien `unitId` y `unitPrice`. La decision humana los
 *  saco del pedido, y con `unitId` se fue la unica referencia de este modulo al catalogo de
 *  `unidades`.
 *
 *  La cantidad viaja como TEXTO decimal, no como `number`: 14 digitos con 4 decimales no caben
 *  en un `number` de JavaScript sin riesgo de redondeo, y el dominio no puede importar el
 *  `Decimal` de Prisma (`docs/architecture.md > Anti-patrones`). */
export type OrderContents = {
  readonly recipeId: RecipeId;
  readonly quantity: string;
};
