# review QC-230 — seed de datos de demostración (vuelta 1)

Diff revisado: `origin/dev...feature/QC-230-seed-de-datos-de-demostracion` (commits 38a9e9c5..fce8759b).
sdd: false. El alcance es la ficha QC-230 y `progress/features/QC-230.md`. El humano aceptó tres huecos el 2026-10-08 y no se cuentan como hallazgos: no hay pedido ENTREGADO, no hay Administrador ni Maestro de demo, y los usuarios de demo quedan con `must_change_credential = true`.

## Verificación ejecutada (salida propia, no la de la bitácora)
- `./init.sh` (rápido): `== init OK ==`, exit 0.
  - typecheck verde.
  - lint `0 errors, 7 warnings`. Los 7 avisos vienen de dev, en `confirm-catalog-import.test.ts` y `order-service.test.ts`.
  - `vitest related`: 3 archivos y 28 tests en verde, entre ellos `tests/integration/scripts/seed-demo.int.test.ts` contra una base efímera.
  - guardias: 59 archivos, 773 tests en verde.
- `vitest run` de los dos archivos unit del seed: 27/27 en verde.
- Pruebas de mutación. Revertí cada una con `git checkout` y el árbol de `scripts/` quedó limpio.
  1. En `guard.ts`, cambié `SEED_DEMO_FORZAR === '1'` por `!== undefined`. Sale rojo «cualquier otro valor de SEED_DEMO_FORZAR no fuerza nada». **Muerde.**
  2. En `guard.ts`, quité la rama de `VERCEL_ENV === 'production'`. Salen rojos 2 tests. **Muerde.**
  3. En `gateway.ts`, hice que `findOrder` devuelva siempre `null`. El `.int` sale rojo, porque los conteos por tabla difieren entre corridas. **Muerde.**
- Sondeo de la guarda con URLs engañosas (`tsx -e` sobre `evaluateDemoSeedGuard`):
  - Se rechazan bien:
    - `localhost` en el usuario o en la contraseña;
    - `#@localhost` y `?a=@localhost`;
    - `localhost.evil`, `localhost%2eevil`, `LOCALHOST.`;
    - `127.0.0.1.nip.io`, `0x7f000001`, `127.1`;
    - `[::1]`, que se rechaza aunque sea local. Es lo seguro.
  - Se aceptan mal: `postgresql://u:p@localhost/x?host=db.remoto.co` y `...?sslmode=require&host=10.0.0.5`. Ver H1.
- Sondeo con Prisma real (`new PrismaClient({datasources:{db:{url}}})` y `select 1`):
  - con `DATABASE_URL` local más `&host=nohay-remoto.invalid`, Prisma responde «Can't reach database server at `nohay-remoto.invalid:5433`»;
  - es decir, **el motor de Prisma conecta al host del parámetro `host`, no al de la autoridad de la URL**, y la guarda le dio `allowed: true`.

## Checklist

### Alcance de la ficha
- [x] `pnpm db:seed:demo` (`package.json:20`) crea:
  - unidades, presentaciones, productos de los 3 tipos con lotes y ajustes;
  - proveedores con catálogo;
  - recetas con líneas y pasos, y una de ellas con 2 versiones;
  - clientes;
  - pedidos en todos los estados alcanzables y con las 4 prioridades;
  - usuarios por rol, grupos y responsables.
  El `.int` lo comprueba y pide que cada tabla tenga más de 0 filas.
- [x] Pasa por el dominio. Toda escritura va por los casos de uso de `lib/composition` (`gateway.ts`), sin SQL suelto. Prisma solo lee, y siempre con `companyId` en el `where`.
- [x] Es idempotente. Lo prueban el unit con doble en memoria y el `.int` de doble corrida contra Postgres, que sale con conteos idénticos en 19 tablas. La mutación 3 confirma que el test muerde.
- [~] **Nunca en producción.** Rechaza `VERCEL_ENV=production` y los hosts no locales, salvo bandera. **Falla en un caso, el H1.**
- [x] Las contraseñas vienen del entorno, sin valor por defecto. Si falta alguna, el error nombra las variables y no imprime ningún valor (`guard.ts:73-88`, con test). `.env.example` solo lleva los nombres.
- [x] La doc está en `docs/verification.md > Datos de demostración`.
- [x] No añade dependencias: `package.json` solo suma el script.

### Que no rompa nada
- [x] `pnpm db:seed` (`scripts/seed.ts`) no está en el diff y no importa nada de `seed-demo`.
- [x] `scripts/build.mjs` solo ejecuta `tsx scripts/seed.ts` (`build.mjs:22`). Ningún workflow ni `init.sh` nombra `seed:demo` ni `seed-demo`.
- [x] El `.int` corre sobre una empresa efímera en la base efímera de la corrida y la borra entera en `afterAll`. Pasó, también la limpieza. Está registrado en `tests/integration/aislamiento.json`.
- [x] El seed solo usa el cliente de runtime (`url = env("DATABASE_URL")`). `DIRECT_URL` es solo del CLI (`directUrl`) y este script no lanza el CLI, así que la guarda mira la variable correcta.

### CHECKPOINTS.md
- [n/a] Especificación (requirements, design, tasks, «Lo que ya existe»): sdd false, por decisión del humano del 2026-10-08.
- [x] Equipo: el assignee está en el board y el candado en el commit 38a9e9c5.
- [x] Trazabilidad: no hay R<n>. `progress/impl_QC-230.md` trae el mapa comportamiento → test, y lo verifiqué: cada fila apunta a un test que existe y comprueba lo que dice.
- [x] typecheck y lint sin errores.
- [ ] `gate-completo` en CI: todavía no hay PR.
- [n/a] E2E de flujo crítico: es un script de desarrollo que reutiliza casos de uso existentes y no añade ningún flujo.
- [x] No añade dependencias.
- [x] Seguridad: no hay secretos hardcodeados. Las contraseñas del `.int` son fixtures de test. No hay webhooks.
- [x] Configuración: nada cambia entre entornos sin pasar por env.
- [x] `./init.sh` en verde.
- [ ] El review con veredicto OK: este review no lo da.
- [ ] La sección Cierre de la ficha y el desmontaje del worktree: pendientes, porque son posteriores al review.

### docs/checkpoints-proyecto.md
- [x] typecheck y lint.
- [n/a] UI y multiplataforma: no toca UI.
- [n/a] No hay tablas nuevas, RLS, migraciones ni `down.sql`: el esquema no cambia.
- [x] Los permisos los valida el caso de uso: el actor se construye con `findActiveSessionUserById`, que lee los permisos reales de la base.
- [x] Sin cliente de Supabase.
- [~] Módulos hexagonales: `gateway.ts:28` importa por ruta profunda un adaptador driven de `identity`. Ver H4.
- [x] No hay código de negocio nuevo en `lib/`. El script vive en `scripts/`.

### perfil-agentes > reviewer
- [x] 5. Calidad y seguridad: sin secretos y con capas separadas. El mensaje de rechazo imprime solo el host, nunca la URL entera.
- [n/a] 6. Multiplataforma.
- [x] 7. Dependencias: no hay ninguna nueva.
- [x] 8. Aislamiento por empresa: todas las lecturas filtran por `companyId`, y `findUser` rechaza un usuario de otra empresa.
- [x] 9. Comentarios: ninguna línea añadida en `scripts/seed-demo*` cita `QC-<n>`, `R<n>`, `design.md` ni «decisión cerrada».

## Hallazgos

### H1 — BLOQUEANTE: la guarda de host se salta con el parámetro `?host=` de la URL
- **Dónde:** `scripts/seed-demo/guard.ts:31-37` (`databaseHost`) y `:45-50` (`refusal`).
- **Qué pasa:** la guarda mira solo `new URL(...).hostname`. Pero el motor de Prisma 6 (quaint) da prioridad al parámetro de consulta `host` sobre la autoridad de la URL. Lo comprobé con Prisma real: con `postgresql://u:p@localhost:5433/db?schema=public&host=<remoto>`, la guarda devuelve `{allowed:true, forced:false}` y Prisma conecta a `<remoto>`.
- **Por qué es grave:** es justo el camino que la ficha pide cerrar, una base remota que pasa por local. Es la única barrera del seed, que escribe y consume stock, y no queda ningún aviso de «forzado».
- **Qué falta:**
  - rechazar, salvo `--forzar`, una URL que lleve `host` en `searchParams`, o tomar como host efectivo el del parámetro si está presente;
  - añadir el caso a `tests/unit/scripts/seed-demo-guard.test.ts`.
  Si se toma el host del parámetro, un `host=/ruta/socket` (socket Unix local) sí se puede permitir.

### H2 — menor: `SEED_DEMO_FORZAR=1` en `.env` desactiva la guarda para siempre y también vale en producción
- **Dónde:** `guard.ts:27-29` y `.env.example:39-41`.
- **Qué pasa:** la bandera por variable se lee también del `.env`, que carga `seed-demo.ts:17-19`. Si alguien la deja en `1`, cualquier corrida futura queda forzada, también después de cambiar `DATABASE_URL` a una base remota. Además, el forzado anula `VERCEL_ENV=production` (lo prueba `seed-demo-guard.test.ts:57`).
- **Hoy no hay un camino automático:** ni build, ni CI, ni Vercel ejecutan `db:seed:demo`, y `gate.yml` no define la variable.
- **Sugerencia:**
  - que el forzado sea solo por la bandera `--forzar` de la línea de comandos;
  - o que la variable no valga si `CI` o `VERCEL` están definidas, ni con `VERCEL_ENV=production`;
  - y quitar `SEED_DEMO_FORZAR=` de `.env.example`, para no invitar a dejarla en el archivo.

### H3 — menor: la clave «receta + cantidad» puede adoptar un pedido creado a mano y hacerlo avanzar
- **Dónde:** `gateway.ts:331-338` y `run.ts:399-452`.
- **Qué pasa:** el seed reconoce un pedido por receta efectiva + cantidad (+ empresa, sin borrar). Si alguien crea a mano un pedido con la misma receta `DEMO …` y la misma cantidad, el seed lo toma por el suyo:
  - si no tiene responsables, le asigna los de demo;
  - lo **lleva por transiciones** hasta el estado objetivo, consumiendo material y dando de alta producto terminado.
- **El riesgo es bajo:** solo pasa con recetas `DEMO` y en una base local, y está anotado como abierto en `impl_QC-230.md`.
- **No hay duplicados dentro del dataset:** la clave sale única para las 10 órdenes (las 4 de `multiusos` llevan cantidades o versiones distintas), y lo vigila el test `seed-demo-run.test.ts:191`. La resolución por `recipeId` efectivo coincide con lo que guarda `pedidos/create-order.ts`, que guarda el id de la versión.
- **Sugerencia, para otra vuelta o como deuda:** que el seed solo avance un pedido que encontró si ese pedido tiene responsables de demo, o si su creador es el Administrador base.

### H4 — menor: import profundo de un adaptador driven de otro módulo
- **Dónde:** `scripts/seed-demo/gateway.ts:28`, que importa `lib/modules/identity/adapters/driven/persistence/session-user-prisma`.
- **Por qué es menor:** el checkpoint «de otro módulo solo su contrato» está escrito para los módulos, y `lib/composition/index.ts:17` hace lo mismo.
- **Sugerencia:** pedir el lector de sesión a `lib/composition` en vez de ir por la ruta profunda.

### H5 — menor: `[::1]` se rechaza aunque es local
- **Dónde:** `guard.ts:16`.
- Es lo seguro y solo obliga a usar `localhost` o `127.0.0.1`. Basta con anotarlo en la doc si se quiere.

## Veredicto
**RECHAZADO (CAMBIOS)** por H1. Una URL con `?host=` remoto pasa la guarda sin `--forzar`, y la ficha pide que el seed nunca corra contra una base remota. Lo demás está bien:
- la idempotencia es real y los tests muerden (3 mutaciones);
- no toca el seed base, ni el build, ni CI;
- la limpieza del `.int` funciona;
- no imprime secretos;
- no añade dependencias.

Para pasar: arreglar H1 y añadir su test. H2 a H5 son menores y pueden quedar como deuda.

Nota: el worktree tiene sin commitear un cambio en `progress/features/QC-230.md` (las decisiones del humano y «Preguntas abiertas: (ninguna)»). No es del diff revisado ni lo hice yo.

## Vuelta 2 (acotada a fce8759b..2085939e)

Reviso solo los arreglos de H1 y H2 y lo que puedan haber roto. 43f49769 solo trae docs y progress.

### Verificación
- `pnpm exec vitest run tests/unit/scripts`: 3 archivos, 48 tests en verde.
- `./init.sh` (rápido): `== init OK ==`.
  - `related`: 35 tests en verde.
  - guardias: 59 archivos, 780 tests en verde.
- Repetí la prueba con Prisma real: `DATABASE_URL=<local>?schema=public&host=nohay-remoto.invalid pnpm db:seed:demo` sale con exit 1 y el mensaje «DATABASE_URL apunta a "nohay-remoto.invalid", que no es una base local…». Lo rechaza antes de cargar Prisma.
- Mutaciones (revertidas, `scripts/` queda limpio):
  1. Ignorar el parámetro `?host=`: fallan 3 tests. **Muerde.**
  2. Quitar la rama de `CI`: falla 1 test. **Muerde.**
- Sondeo de la guarda nueva:

| Caso | Resultado | ¿Correcto? |
|---|---|---|
| `?host=` remoto | rechaza | sí |
| `?HOST=` remoto | rechaza (la guarda es más estricta que Prisma) | sí |
| `?host=` repetido | rechaza (test en la línea 100) | sí |
| `?host=` vacío | rechaza | sí |
| `?host=localhost,db.remoto.co` | rechaza | sí |
| socket Unix `?host=/var/run/postgresql` | permite, sin forzar | sí |
| `VERCEL_ENV=production` con `--forzar` | rechaza | sí |
| `CI=true` con `--forzar` | rechaza | sí |
| `CI=1` con base local | rechaza | sí |
| `SEED_DEMO_FORZAR=1` con base remota | rechaza | sí |
| `?hostaddr=10.255.255.1` | permite, pero Prisma **ignora** `hostaddr` y conecta a localhost (lo probé contra Postgres real) | no es un bypass |

### H1: CERRADO
- `databaseHost` (`guard.ts:37-52`) toma como host efectivo el del parámetro `host`.
- Si la URL es ambigua (`host` repetido, `host` vacío o una URL ilegible), la rechaza.
- Un socket Unix, que es una ruta absoluta, se admite como local.
- Cada caso tiene su test (`seed-demo-guard.test.ts:83-121`).

### H2: CERRADO
- Solo la bandera `--forzar` de la línea de comandos fuerza (`guard.ts:99`).
- `hardRefusal` (`guard.ts:66-74`) rechaza `VERCEL_ENV=production` y `CI` antes de mirar la bandera.
- `SEED_DEMO_FORZAR` ya no aparece en `.env.example`, en `docs/` ni en `scripts/`. Solo queda en el test que comprueba que ya no fuerza (`seed-demo-guard.test.ts:78-81`).
- **La regla de `CI`** se rechaza salvo que esté vacía, sea `0` o sea `false`. **Me parece suficiente.**
  - GitHub Actions pone `CI=true` y el build de Vercel pone `CI=1`.
  - Un `CI=false` explícito es una decisión consciente de quien lo escribe.

### Hallazgo nuevo (menor, no bloquea)
- **H6, menor:** `--forzar` sí permite escribir con `VERCEL_ENV=preview` contra una base remota.
  - Según `scripts/build.mjs:43`, la base de preview es la de producción.
  - No hay un camino automático: el build de Vercel lleva `CI=1` y se rechaza.
  - El camino es manual: hacer `vercel env pull` del entorno preview y luego correr con `--forzar` a propósito.
  - Sugerencia: que `hardRefusal` rechace también cualquier `VERCEL_ENV` distinto de `development`, o con `VERCEL` definida.

### Veredicto vuelta 2
**OK.** H1 y H2 están cerrados, con tests que muerden y la prueba con Prisma real repetida. Ningún arreglo rompió nada. Quedan como menores H3, H4, H5 y H6, sin bloqueantes.
