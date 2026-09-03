// lib/modules/pedidos/domain/order-contents.ts
import type { RecipeId } from '@/lib/modules/recetas';
import type { UnitId } from '@/lib/modules/unidades';

/** Lo que un pedido guarda de la receta y de la unidad: SUS IDENTIFICADORES, nada mas
 *  (`docs/architecture.md > Dominio` n.o 2). `pedidos` no conoce la tabla de recetas ni la de
 *  unidades, y quien necesite el nombre de la receta o el simbolo de la unidad para pintarlos
 *  los pedira al contrato de su dueno.
 *
 *  Los importes viajan como TEXTO decimal, no como `number`: 14 digitos con 4 decimales no
 *  caben en un `number` de JavaScript sin riesgo de redondeo, y el dominio no puede importar
 *  el `Decimal` de Prisma (`docs/architecture.md > Anti-patrones`). */
export type OrderContents = {
  readonly recipeId: RecipeId;
  readonly quantity: string;
  readonly unitId: UnitId;
  readonly unitPrice: string;
};
