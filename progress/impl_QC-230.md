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
