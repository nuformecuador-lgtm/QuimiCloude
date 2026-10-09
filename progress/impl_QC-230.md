# impl QC-230 — seed de datos de demostración (backend_dev)

sdd: false (sin spec). Alcance: ficha Jira QC-230, según el encargo del leader.

## Archivos
- Creados:
  - `scripts/seed-demo.ts`: la cáscara, que carga el entorno, aplica las guardas, lee las contraseñas y delega.
  - `scripts/seed-demo/guard.ts`: guardas puras de entorno y lectura de contraseñas.
  - `scripts/seed-demo/data.ts`: el dataset ficticio, con el prefijo `DEMO`.
  - `scripts/seed-demo/run.ts`: el recorrido idempotente sobre el puerto `DemoSeedGateway`, y `stepsToReach`.
  - `scripts/seed-demo/gateway.ts`: el gateway real. Escribe por los casos de uso de `lib/composition` y lee con Prisma.
  - `tests/unit/scripts/seed-demo-guard.test.ts`.
  - `tests/unit/scripts/seed-demo-run.test.ts`.
  - `tests/integration/scripts/seed-demo.int.test.ts`.
- Modificados:
  - `package.json`: script `db:seed:demo`. No añade dependencias.
  - `.env.example`: los nombres de las variables, sin valores.
  - `docs/verification.md`: nueva sección «Datos de demostración».
  - `tests/integration/aislamiento.json`: entrada `commit`.

## Mapa comportamiento → test (sin spec: no hay R<n>)
| Comportamiento pedido | Test |
|---|---|
| Rechaza `VERCEL_ENV=production` | seed-demo-guard › rechaza VERCEL_ENV=production aunque la base sea local |
| Rechaza cualquier `VERCEL_ENV` no vacio distinto de `development`, con o sin `--forzar` (H6) | seed-demo-guard › --forzar no anula VERCEL_ENV=preview…; --forzar no anula un VERCEL_ENV arbitrario distinto de development; VERCEL_ENV=development sigue la regla normal…; VERCEL_ENV vacio cuenta como no definido |
| Rechaza un host que no es local | seed-demo-guard › rechaza una DATABASE_URL que no apunta a una base local…; no confunde un host que solo empieza por localhost…; rechaza cuando falta DATABASE_URL… |
| La bandera lo permite (solo base no local) | seed-demo-guard › la bandera --forzar permite una base remota…; --forzar no anula VERCEL_ENV=production; rechaza dentro de CI, con o sin --forzar…; CI vacia, 0 o false no cuenta como CI; una variable de entorno no fuerza nada… |
| Host efectivo `?host=` (H1) | seed-demo-guard › toma como host efectivo el parametro ?host= y rechaza uno remoto; admite ?host=localhost; admite un socket Unix local en ?host=; rechaza un parametro host repetido…; rechaza un parametro host vacio; databaseHost devuelve el host efectivo… |
| Contraseñas del entorno, sin valor por defecto | seed-demo-guard › sin alguna variable falla nombrandolas todas…; el mensaje de error no incluye ningun valor… |
| Idempotencia (unit) | seed-demo-run › es idempotente: la segunda corrida no escribe nada…; retoma un pedido que quedo a medias…; activa un usuario… |
| Idempotencia (integración, base real) | seed-demo.int › dos corridas dejan los mismos conteos por tabla… |
| Todos los estados alcanzables y todas las prioridades | seed-demo-run › hay un pedido en cada estado alcanzable del enum y solo ENTREGADO queda fuera; hay pedidos con todas las prioridades |
| Tipos de producto, lotes, una receta con dos versiones, marcador DEMO | seed-demo-run › cobertura del dataset (4 casos) |
| Transiciones válidas | seed-demo-run › caminos de estado (4 casos) |

## Salida real
- `pnpm run typecheck`: limpio. Hizo falta `pnpm install --frozen-lockfile`, `prisma generate` y `next typegen` en el worktree recién creado.
- `pnpm run lint`: `ESLint: 0 errors, 7 warnings in 2 files`. Los 7 avisos son heredados, de `confirm-catalog-import.test.ts` y `order-service.test.ts`. `eslint` sobre los archivos tocados: `No issues found`.
- `pnpm exec vitest related --run <archivos>`: `Test Files 3 passed (3) / Tests 28 passed (28)`.
- `pnpm exec vitest run guard`: `Test Files 59 passed (59) / Tests 773 passed | 11 skipped`.

## `pnpm db:seed:demo` contra la base local (dos corridas)
- 1.ª corrida: se creó todo. usuarios 5, grupos 2, miembros 4, unidades 2, presentaciones 5, lotes 15, ajustes 3, proveedores 2, catálogo 5, clientes 4, recetas 4, versiones 2, pedidos 10, asignaciones 10, transiciones 22.
- 2.ª corrida: `0 creados` en todo. Conteos por tabla idénticos (`diff` vacío):
  companies 1, users 8, work_groups 2, work_group_members 4, units 7, presentations 5, products 16,
  product_batches 18, inventory_movements 43, reservation_movements 65, suppliers 2,
  supplier_catalog_lines 5, customers 4, recipes 6, recipe_lines 21, recipe_tools 5, orders 10,
  order_presentation_lines 10, order_assignments 34, order_execution_entries 18.
- Una 3.ª corrida, ya con el código final, dio el mismo resultado.

## Abierto (para el humano)
1. **`ENTREGADO` no se alcanza.** Ningún caso de uso lleva hoy un pedido a `ENTREGADO`. La matriz admite `TERMINADO -> ENTREGADO`, pero `transitionAliveById` lo reserva y no hay acción propia. No se fuerza por SQL: el seed lo dice como aviso.
2. **No hay Administrador de demo.** `createUser` rechaza el rol Administrador (`action_not_allowed`), así que actúa el Administrador del seed base.
3. **`must_change_credential` queda en `true`.** Lo escribe el alta de usuarios con contraseña y ningún caso de uso lo baja. Ningún código de login lo lee (verificado con grep), así que en la práctica no obliga a cambiar la contraseña. Ponerlo en `false` exigiría escribir fuera del dominio.
4. **Clave de idempotencia del pedido.** Un pedido no tiene nombre: se reconoce por receta efectiva + cantidad. Un pedido creado a mano con la misma receta DEMO y la misma cantidad se tomaría por el de demo.

Veredicto: hecho. Seed idempotente por los casos de uso, con guardas y tests en verde. Quedan abiertos ENTREGADO, el Administrador de demo y `must_change_credential`.

## Correccion tras review (H1, H2)
- H1: `databaseHost` toma como host efectivo el parametro `host` de la query si viene (Prisma lo
  prioriza). Repetido (sin distinguir mayusculas) o vacio se rechaza; un socket Unix (`/...`) se admite.
- H2: se elimina `SEED_DEMO_FORZAR` (codigo, `.env.example`, `docs/verification.md`). Solo fuerza la
  bandera `--forzar`, y solo la regla de base local: `VERCEL_ENV=production` y `CI` (no vacia, ni `0`
  ni `false`) se rechazan siempre. `seed-demo.int.test.ts` no pasa por la guarda: no le afecta.
- Archivos: `scripts/seed-demo/guard.ts`, `scripts/seed-demo.ts` (comentario),
  `tests/unit/scripts/seed-demo-guard.test.ts`, `.env.example`, `docs/verification.md`.
- `pnpm exec vitest run tests/unit/scripts`: 3 archivos, 48 tests, todos verdes.
- `pnpm run typecheck`: sin errores. `pnpm run lint`: 0 errores, 7 warnings previos en archivos no tocados.
- Veredicto: H1 y H2 corregidos y cubiertos por test.

## Correccion tras review, vuelta 2 (H6)
- H6: la guarda rechaza siempre, tambien con `--forzar`, cualquier `VERCEL_ENV` no vacio (con trim)
  distinto de `development`: `production`, `preview` (usa la base de produccion, `scripts/build.mjs`)
  y cualquier otro valor. El mensaje nombra el valor y dice que `--forzar` no lo anula. Con
  `VERCEL_ENV=development` o sin definir, sigue la regla de base local o `--forzar`.
- Archivos: `scripts/seed-demo/guard.ts`, `scripts/seed-demo.ts` (comentario), `docs/verification.md`,
  `tests/unit/scripts/seed-demo-guard.test.ts`.
- El test muerde: con la condicion revertida a `=== 'production'`, fallan los tests de `preview` y
  `staging` (2 failed | 22 passed); restaurada, verdes.
- `pnpm exec vitest run tests/unit/scripts`: 3 archivos, 52 tests, todos verdes.
- `pnpm run typecheck`: sin errores. `pnpm run lint`: 0 errores, 7 warnings previos en archivos no tocados.
- Veredicto: H6 corregido y cubierto por test.

## Correccion tras CI (contratos de modulo)
- Rojo: `tests/unit/{asignaciones,pedidos,unidades}/module-contract.test.ts`. Barren `lib`, `app`,
  `scripts`... y solo admiten que los adaptadores driven de cada modulo consulten `units`, `orders`
  y `order_assignments` (pedidos R31, asignaciones R30). `scripts/seed-demo/gateway.ts` hacia
  `prisma.unit`, `prisma.order` y `prisma.orderAssignment`.
- Arreglo, solo en `scripts/seed-demo/gateway.ts`: esas lecturas van por casos de uso de
  `lib/composition`, con el Administrador base como actor: `unidades.listUnits` (`isSystem`
  distingue las de sistema), `pedidos.listOrders` (todas las paginas, por `createdAt` asc),
  `pedidos.getOrder` y `asignaciones.listOrderResponsibles`. La interfaz `DemoSeedGateway` no cambia.
- Los demas contratos (documentos, inventario, proveedores, recetas) no barren `scripts/`, o solo
  miran `scripts/seed.ts`. La importacion de `identity/adapters/.../session-user-prisma` no la
  prohibe ningun contrato ni guardia (`scripts/` queda fuera de `guard-arquitectura-modulos`), y la
  composicion no publica otra forma de construir un actor fuera de una peticion: se mantiene.
- 3 contratos: 58 passed. `vitest run module-contract`: 99 passed, 1 failed (recetas, en baseline,
  por `app/(private)/pedidos/page.tsx`, que esta rama no toca). `tests/unit/scripts`: 52 passed.
  `tests/unit`: 3 failed, 12365 passed, 123 skipped. Los 3 rojos estan en el baseline (recetas
  module-contract y scope, navegacion/pantallas-exigen-permiso). typecheck limpio; lint 0 errores
  y 7 warnings heredados. `seed-demo.int.test.ts`: 1 passed. `pnpm db:seed:demo` en la base local:
  `0 creados` en todo.
- Veredicto: los tres contratos en verde. El seed sigue siendo idempotente.
