# QC-199 — presentacion-por-unidad-en-alta-de-producto · bitácora de implementación

## T0 — lotes con unidad de presentación distinta de la del producto

- Fecha: 2026-10-05.
- Base: `QuimiCloude` (la de `.env` del worktree; 55 filas en `product_batches`).
- Consulta: la de `design.md > 9`, literal.
- Resultado: **0 filas**. Se sigue con T6 y T7.
- Nota: esa base va 1 migración atrás (`20261004150000_execution_permission`, ajena a esta ficha);
  no afecta a la consulta (no toca `products`, `product_batches` ni `presentations`).

## Contrato

(pendiente)
