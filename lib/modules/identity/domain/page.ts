// lib/modules/identity/domain/page.ts
/**
 * Tipo de salida del listado paginado de USUARIOS (QC-57 R29, QC-66 `design.md > 8.1` y `> 8.2`).
 * El `pageSize` siempre es el EFECTIVO, ya acotado por `lib/shared/pagination` en el adaptador
 * driven -nunca el pedido: pedir 100 se acota a 25, no se rechaza- (QC-66 R27).
 *
 * Declarado aqui de forma ESTRUCTURAL, como ya lo declaran `inventario`, `recetas`,
 * `proveedores`, `unidades` y `pedidos` en su propio `domain/page.ts`: el dominio no puede
 * importar `lib/shared/**` ni el `domain/` de otro modulo (`docs/architecture.md > La regla de
 * dependencias`). Es la misma duplicacion deliberada de `list-query.ts`, y por el mismo motivo.
 *
 * Igual que en `unidades`, aqui NO hay `pageQuerySchema`: la pagina de usuarios entra por el
 * contrato generico (`page`/`pageSize` de `ListQuery`), que es quien la valida (QC-66 R36).
 */
export type Page<T> = {
  readonly items: readonly T[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  readonly totalPages: number;
};
