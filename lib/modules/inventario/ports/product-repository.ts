import type { PageQuery, Page } from '../domain/page';

/**
 * Datos de negocio de un producto, ya validados por `product-input.ts` (`design.md >
 * 6.1`, `7`). `cost` sigue siendo cadena aqui: la conversion a `Prisma.Decimal` es del
 * adaptador driven (R31, el dominio no importa `@prisma/client`).
 */
export type NewProduct = {
  readonly name: string;
  readonly presentationId: string;
  readonly stock?: number | null;
  readonly cost?: string | null;
  readonly minPurchase: number;
  readonly deliveryTime?: number | null;
  readonly qtyAlert?: number | null;
  readonly unit?: string | null;
};

/**
 * Salida de una consulta de producto (`design.md > 6.1`). `createdBy`/`updatedBy` son
 * IDENTIFICADORES, no nombres (D20, R8): este modulo no consulta el modelo `User` ni
 * resuelve ningun nombre de autor.
 */
export type ProductView = {
  readonly id: string;
  readonly name: string;
  readonly presentationId: string;
  readonly presentationName: string;
  readonly stock: number | null;
  readonly cost: string | null;
  readonly minPurchase: number;
  readonly deliveryTime: number | null;
  readonly qtyAlert: number | null;
  readonly unit: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly createdBy: string | null;
  readonly updatedBy: string | null;
};

/**
 * Puerto de acceso a datos de producto (`design.md > 7`). El sufijo `Alive` en los
 * nombres de metodo NO es adorno: el filtro `deleted_at IS NULL` es responsabilidad de
 * ESTE puerto/su adaptador, no del dominio (R16). No hay ninguna operacion de listar
 * borrados ni de restaurar (D5).
 *
 * Los resultados son booleanos/objetos discriminados, nunca excepciones de Prisma: el
 * dominio no ve ningun SQLSTATE. Traducirlos es responsabilidad del adaptador driven
 * (Grupo C).
 */
export interface ProductRepository {
  create(data: NewProduct, actorId: string, now: Date): Promise<{ id: string }>;
  findAliveById(id: string): Promise<ProductView | null>;
  updateAlive(id: string, data: NewProduct, actorId: string, now: Date): Promise<boolean>;
  softDeleteAlive(id: string, actorId: string, now: Date): Promise<boolean>;
  listAlive(query: PageQuery): Promise<Page<ProductView>>;
}
