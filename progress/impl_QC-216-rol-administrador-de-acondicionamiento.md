# QC-216 — rol-administrador-de-acondicionamiento · bitácora de implementación

## Catálogo previo

Medido en `1a1db86e` (= `origin/dev` al empezar) y verificado contra
`lib/modules/identity/domain/permissions.ts` y `roles.ts` del worktree antes de tocar nada.

**`PERMISSIONS`: 24 códigos, en este orden:**

1. `dashboard.consultar`
2. `inventario.consultar`
3. `inventario.modificar`
4. `recetas.consultar`
5. `recetas.modificar`
6. `unidades.consultar`
7. `unidades.modificar`
8. `proveedores.consultar`
9. `proveedores.modificar`
10. `pedidos.consultar`
11. `pedidos.modificar`
12. `usuarios.consultar`
13. `usuarios.modificar`
14. `asignaciones.consultar`
15. `asignaciones.modificar`
16. `asignaciones.ejecutar`
17. `terminados.consultar`
18. `clientes.consultar`
19. `clientes.modificar`
20. `documentos.consultar`
21. `documentos.modificar`
22. `empaque.modificar`
23. `empresas.consultar`
24. `empresas.modificar`

**`SEED_ROLES`: 4, en este orden:** Administrador, Operador, Empacador, Maestro.

**Última migración:** `20261006140000_inventory_movements_adjustment_count`.

Coincide con lo que dice `tasks.md`; las líneas de `design.md > 5` no se relocalizan por cambio de
catálogo (sí se comprueban una a una al editar).

## Tanda 1 (T1–T3)

