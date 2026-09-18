# QC-92 — ajuste-de-inventario · bitácora de implementación

> Rama `feature/QC-92-ajuste-de-inventario`, desde `origin/dev` en `b579707`.
> Worktree `.worktrees/QC-92-ajuste-de-inventario`.

## T0 — Séptima enmienda del catálogo de errores: **APROBADA**

**Fecha:** 2026-09-17. **Quién:** el humano, expresamente, en la puerta F1.4 junto con el spec.

**Qué se aprobó:** los dos códigos que propone `design.md > 7`:

| Código | Para qué |
|---|---|
| `batch_not_found` | El lote pedido no existe o es de otra empresa (R18) |
| `batch_stock_negative` | El ajuste dejaría el lote bajo cero (R4) |

**Consecuencias, escritas para que no se reabran:**

- **T4 vive** y se implementa: las dos entradas en `ERROR_CODES` + `error-catalog.ts`, la enmienda
  fechada en la cabecera de `error-codes.ts` y las dos clases en `errors.ts` del módulo.
- **El plan B de `design.md > 7` queda descartado.** `batch_not_found` NO cae a
  `product_not_found` y `batch_stock_negative` NO cae a `invalid_input`. T8 no aplica plan B.

## Estado de las tasks

Ver `specs/QC-92-ajuste-de-inventario/tasks.md`.

## Archivos tocados

(se completa por tanda)

## Mapa R<n> -> test

(se completa en T17)

## Salida de los tests

(se completa por tanda)
