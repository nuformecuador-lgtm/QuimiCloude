# QC-153 — modelo-de-clientes · bitácora de implementación

## T0 — Preparación

- Base propia: `QuimiCloude_QC153`, creada con `CREATE DATABASE "QuimiCloude_QC153" TEMPLATE
  "qct_tpl_664cc76c19c8"` (plantilla ya migrada+sembrada de esta rama, 45 migraciones,
  reutilizada por `pnpm run db:test template`).
- `.env` del worktree apunta `DATABASE_URL`/`DIRECT_URL` a `QuimiCloude_QC153` (no se commitea).
- `pnpm run db:test status` con `DATABASE_URL`/`DIRECT_URL` exportadas a `QuimiCloude_QC153`:
  `✓ base de desarrollo «QuimiCloude_QC153» al dia: 45 migracion(es) aplicada(s)`.
- Última migración de `dev` (y de esta rama, que parte de `dev`):
  `20260923140000_product_batch_nullable_machine`, confirmado contra `origin/dev` (`git ls-tree`).
  Ramas en origin con migración posterior no mergeada: `feature/QC-141-...` termina en
  `20260923150200_reserve_existing_orders`; `feature/QC-158-...` termina en
  `20260923180000_supplier_catalog_line_material_and_measurements`. Ninguna aplicada a `dev`
  todavía. `<ts>` elegido para esta ficha: **`20260924120000`** (posterior a las tres).
- Catálogo de `PERMISSIONS` en `dev`/esta rama antes de la ficha (`lib/modules/identity/domain/permissions.ts`):
  **16 códigos**: `dashboard.consultar`, `inventario.consultar`, `inventario.modificar`,
  `recetas.consultar`, `recetas.modificar`, `unidades.consultar`, `unidades.modificar`,
  `proveedores.consultar`, `proveedores.modificar`, `pedidos.consultar`, `pedidos.modificar`,
  `usuarios.consultar`, `usuarios.modificar`, `asignaciones.consultar`, `asignaciones.modificar`,
  `terminados.consultar`.
  Administrador: los 16. Operador: 2 (`inventario.consultar`, `asignaciones.consultar`).
  Empacador: 2 (`asignaciones.consultar`, `terminados.consultar`). Total de asignaciones del
  seed: 20.
  Tras esta ficha (T4): **18** códigos (suma `clientes.consultar`, `clientes.modificar`),
  Administrador **18**, Operador y Empacador sin cambio, total de asignaciones **22**.
- `pnpm install` fue necesario (worktree recién montado, `node_modules` ausente). `pnpm approve-builds`
  en modo no interactivo escribió de más en `pnpm-workspace.yaml` (`ignoredBuiltDependencies`
  ampliado): se revirtió con `git checkout -- pnpm-workspace.yaml` y se corrió
  `pnpm exec prisma generate` directo, que generó el cliente sin problema.

## T1 — `db/schema.prisma`

Modelo `Customer` añadido al final del archivo, tras `DocumentFile`, tal cual `design.md > 2.1`.
`pnpm prisma validate` y `pnpm exec prisma generate` en verde. `pnpm exec next typegen` fue
necesario para que `typecheck` no fallara por `LayoutProps` sin generar (deuda del worktree
recién montado, no de esta ficha). `typecheck` en verde tras eso.
`guard-empresa-en-esquema.test.ts` y `guard-arquitectura-modulos.test.ts`: 77 tests verdes.

## T2 — Migración `20260924120000_customers`

`migration.sql` y `down.sql` escritos a mano según `design.md > 2.2`/`2.3`. Aplicados sobre
`QuimiCloude_QC153` con `pnpm run db:migrate`; probado migrar → `pnpm run db:rollback` →
migrar de nuevo, los tres pasos sin error. `db:test status` confirma 46 migraciones al día tras
la reaplicación.

Alta de `20260924120000_customers` al final de `MIGRACIONES_ESPERADAS`
(`tests/guards/guard-identificador-de-request.test.ts`). `guard-identificador-de-request.test.ts`
y `guard-rls-force.test.ts`: 27 tests verdes.

## T3 — Armazón `lib/modules/clientes/`

`index.ts` (reexporta solo `Customer` de `./domain/customer`), `domain/customer.ts` (el tipo
puro), `ports/.gitkeep`, `adapters/.gitkeep`. `typecheck` en verde;
`guard-arquitectura-modulos.test.ts`: 62 tests verdes.

## T5 — `tests/unit/identity/permissions.test.ts`

`CODIGOS_DEL_REQUISITO`, `MODULOS` y `MODULOS_CON_ESCRITURA` ampliados con `clientes`/los dos
codigos; recuentos subidos a 18; caso «QC-144 R5» reescrito con slicing por indice de
`terminados.consultar` para que no rompa por el orden con los dos codigos nuevos detras (sigue
afirmando exactamente lo mismo: previo + terminados.consultar + lo que venga despues); casos
nuevos R21 (catalogo con los dos codigos exactos y catalogo = previo + los dos), R22
(Administrador con los dos; Operador y Empacador intactos, sin `clientes.*`) y R25 (parrafo de
la enmienda: ≤5 lineas, contiene "enmienda", nombra los dos codigos, sin citas). El detector de
citas sintetico ya existente (linea ~168) sigue mordiendo un JSDoc con `QC-144`.

Verificado con T4 revertido en local (sin commitear, restaurado byte a byte despues): 10 de 31
casos caen, incluidos los tres de R21/R22 nuevos y los que ya afirmaban el recuento/lista del
Administrador. Con T4 en su sitio: 31/31 verdes.

## Verificación T0

```
pnpm run db:test template
  test-db: plantilla reutilizada: qct_tpl_664cc76c19c8 (las migraciones no han cambiado)
  ✓ plantilla de esta rama: qct_tpl_664cc76c19c8 (45 migraciones)

pnpm run db:test status  (DATABASE_URL/DIRECT_URL -> QuimiCloude_QC153)
  ✓ base de desarrollo «QuimiCloude_QC153» al dia: 45 migracion(es) aplicada(s)
```
