# QC-74 — modelo-de-permisos · review

> Rama `feature/QC-74-modelo-de-permisos` (HEAD `8a99d1d`), nacida de `origin/dev` (`fa116cd`).
> Worktree `.worktrees/QC-74-modelo-de-permisos/`. Revisado el 2026-09-07.
>
> **Veredicto: APROBADO — 0 mayores, 6 menores.** Trazabilidad completa: los 24 requisitos
> tienen test que existe y que muere cuando se rompe el codigo (ver seccion 4, mutaciones).

## 1. Checklist

### Especificacion
- [x] `requirements.md` con R1-R24 en EARS, mas Alcance, «Lo que NO entra» y once decisiones cerradas.
- [x] `design.md` con 10 secciones y **siete** alternativas descartadas con su porque (7).
- [~] `tasks.md`: **17 de 18 en `[x]`**. T18 (`./init.sh` completo) sigue en `[ ]` a proposito:
      la corre el leader. Es lo unico que falta del checkpoint de especificacion.

### Trazabilidad
- [x] Cada `R<n>` mapea a al menos un test concreto que **existe y verifica lo que dice**.
- [x] `progress/impl_QC-74-modelo-de-permisos.md` contiene el mapa `R<n> -> test`, y el mapa es
      fiel: se abrieron los tests citados, no se confio en la bitacora.

### Calidad de codigo (corrido por el reviewer, no leido de la bitacora)
- [x] `pnpm run typecheck` — verde, sin salida.
- [x] `pnpm run lint` — verde, sin salida.
- [x] `pnpm exec vitest run tests/guards tests/unit/identity` — 48 archivos, 618 tests, verde.
- [x] `pnpm exec vitest run tests/unit/{inventario,recetas,unidades,proveedores,pedidos}` —
      117 archivos, 1462 pasados, 7 saltados, verde.
- [x] `pnpm exec vitest run tests/integration/identity` — 4 archivos, 76 tests, verde contra la
      base de la feature. R7 y R11 se comprueban ahi contra Postgres real.
- [ ] Suite completa: **no la corro** (`AGENTS.md > Regla del gate`); es T18 del leader.
- [~] E2E de flujo critico «permisos»: **no hay**. Desviacion declarada y aprobada por la
      decision cerrada 12 del humano (2026-09-07) y `design.md > 10`, asignada a QC-75. Menor 6.
- [x] UI: la feature no toca `app/` ni `components/` (diff vacio). La regla multiplataforma no aplica.
- [x] Dependencias: `git diff origin/dev -- package.json pnpm-lock.yaml` **vacio**. Ninguna nueva,
      como declara `design.md > 9`. Nada que buscar en `docs/dependencias.md`.

### Datos y seguridad
- [x] Tablas nuevas: `permissions` y `role_permissions`. **No llevan columna de empresa, y es
      correcto**: son tablas de identidad —hermanas de `roles`—, no de operacion, y
      `docs/architecture.md > Dominio` n.1 lista «permisos por empresa mas alla de su rol» entre
      lo que el reviewer rechaza como sobre-ingenieria. La excepcion esta declarada en R6, en la
      decision cerrada 10 y en `design.md > 1.2`, y anclada por test
      (`permissions.test.ts` -> «R6: ninguna entrada del catalogo lleva campo de empresa»). Ver menor 3.
- [x] El permiso se valida en el **service**, primera linea del caso de uso, con su test por caso
      de uso. Ninguna policy de RLS autoriza nada, y el diseño lo dice en voz alta.
- [x] RLS: `ENABLE` **y** `FORCE ROW LEVEL SECURITY` en las dos tablas nuevas, al final del UP.
      `guard-rls-force` barre todos los `migration.sql` y sigue verde.
- [x] Migracion versionada con su `down.sql` (dos `DROP TABLE` en el orden correcto, sin `CASCADE`).
- [x] Acceso a datos solo por Prisma; ninguna lectura/escritura con el cliente de Supabase.
- [x] Ningun secreto en el diff; nada hardcodeado que cambie entre entornos.
- [x] Webhooks: la feature no toca ninguno.

### Modulos hexagonales
- [x] `guard-arquitectura-modulos` verde. Los dos modelos nuevos llevan `/// @module identity`.
- [x] `assertPermission` y `PermissionCode` se importan por el **barrel** `@/lib/modules/identity`
      en los cinco modulos; ninguna ruta profunda.
- [x] `domain/` sigue sin importar framework, Prisma ni `shared`. El catalogo es dominio puro.
- [x] Los adaptadores driving no instancian su driven; el actor sale de `identity.getSessionUser()`
      via `lib/composition`.

## 2. Las cinco cosas declaradas por el implementer, una a una

### 2.1 El migration.sql no arrastra ningun DROP — VERIFICADO
Se leyo entero `db/migrations/20260907183034_permissions_and_role_permissions/migration.sql`.
Contiene, y nada mas: dos `CREATE TABLE`, `permissions_module_action_key`,
`role_permissions_permission_code_idx`, las dos FK `ON DELETE RESTRICT ON UPDATE CASCADE`, y los
cuatro `ALTER TABLE ... ENABLE/FORCE ROW LEVEL SECURITY` al final. **Cero DROP CONSTRAINT, cero
DROP INDEX, cero INSERT.** El unico objeto preexistente que toca es `roles`, y solo como destino
de una FK. La cabecera documenta que borro los 17 + 9 del drift y por que, con el precedente
citado. `down.sql` existe, borra `role_permissions` antes que `permissions` y no usa `CASCADE` a
proposito.

*Residual declarado:* el ciclo vivo `migrate -> rollback -> migrate` NO lo reejecute (implica
mutar la base de la feature, y leer el `.env` esta bloqueado en mi entorno). Lo cubren: la lectura
del SQL, `guard-rls-force` en verde, `scripts/db-rollback.ts` sin tocar en el diff y generico
(busca el `down.sql` de la ultima migracion y borra su fila en la misma transaccion), y la salida
de `pg_class` / `_prisma_migrations` que la bitacora deja copiada en su seccion 3.1.

### 2.2 guard-permisos-no-administrables.test.ts cubre R5 de verdad — VERIFICADO
No es un test que pase por construccion. Tiene las dos mitades de R5 (nadie escribe sobre las dos
tablas; el contrato no ofrece por donde), anclas anti-vacuidad reales (el barrido tiene que
encontrar mas de 200 archivos de produccion, tiene que **contener** al exento, y
`listExportedNames` tiene que saber parsear de verdad), y deriva el accessor de Prisma de
`PERMISSION_MODELS` contrastado contra `db/schema.prisma`. Mutaciones: MUT4 y MUT4b.
El detalle que la bitacora subraya es cierto y es lo que la salva: el patron
`\.<accessor>\.<verbo>\b` deja libre el receptor, asi que caza `db.permission.createMany` dentro
del `$transaction` del seed — un patron anclado a `prisma.` habria estado verde sin ver la unica
escritura que existe.

### 2.3 Las guardias disparan ante la infraccion y no ante el caso correcto — VERIFICADO CON MUTACIONES
Ver seccion 4. Las tres se pusieron rojas rompiendo el codigo a proposito, y verdes con la
mutacion simetrica correcta. **Con un matiz encontrado por el camino**, que es el menor 1: el
comentario simetrico solo queda verde si el archivo tiene finales de linea LF.

### 2.4 middleware.ts, route-role-rules.ts y e2e/ con diff vacio — VERIFICADO
`git diff origin/dev -- middleware.ts lib/composition/route-role-rules.ts`
`lib/modules/identity/domain/route-role-rules.ts lib/modules/identity/domain/route-access.ts`
`e2e/ app/ components/ lib/modules/identity/domain/roles.ts`
`tests/guards/guard-rol-administrador-unico.test.ts` -> **salida vacia**. R23 se cumple, y de paso
queda comprobado que la feature no toca UI ni añade E2E.

### 2.5 R15, la jerarquia de errores por modulo — VERIFICADO
- Los cinco `UnauthorizedError` siguen extendiendo su raiz: `InventarioError`, `RecetasError`,
  `UnidadesError`, `ProveedoresError`, `PedidosError`, todas `abstract class ... extends Error`.
- Los cinco `code = 'unauthorized'` estan intactos; el diff de los `errors.ts` es **solo JSDoc**
  en tres modulos y los otros dos no aparecen.
- `git diff origin/dev -- lib/modules/*/adapters/driving/*.ts`: los siete adaptadores cambian
  **una linea de codigo cada uno** (`roleName` -> `permissions` al construir el actor) mas
  comentarios. **Ningun bloque `if (error instanceof <Modulo>Error)` cambia**; los siete siguen ahi.
- `assertPermission` recibe la fabrica `onDenied` y nunca construye un error: no conoce ninguna
  jerarquia, exactamente como el `assertAdminRole` que sustituye.
- Comprobado por mutacion (MUT8): hacer que `unidades` lance un `Error` plano en vez de su
  `UnauthorizedError` pone 14 tests en rojo en 2 archivos. La regresion silenciosa que se temia
  **no es silenciosa**.

## 3. Trazabilidad R1-R24 — 24/24

Verificado abriendo cada test citado. **PT** = probado ademas por mutacion (seccion 4).

| R | Que exige | Test que lo verifica | Estado |
|---|---|---|---|
| R1 | codigo modulo.accion, español, minusculas | `unit/identity/permissions.test.ts` (2 casos: forma del codigo y modulo del repo) | OK |
| R2 | exactamente diez | idem, contra `CODIGOS_DEL_REQUISITO` **copiados del requisito**, no derivados | OK |
| R3 | modulo con escritura declara los dos; modificar cubre borrado | idem, mas los `delete*` que exigen `<m>.modificar` en los 30 casos de uso | OK |
| R4 | modulo sin escritura, solo consultar | idem (`dashboard`, `unidades`) | OK |
| R5 | ninguna via de aplicacion administra permisos | `guards/guard-permisos-no-administrables.test.ts` (12 casos, dos mitades) | OK · PT |
| R6 | sin empresa | `permissions.test.ts` + `db/schema.prisma` + columnas del `migration.sql` | OK |
| R7 | persistido y resuelto por asignacion | `integration/identity/identity-seed.int.test.ts` y `session-user.int.test.ts` («un rol sin asignaciones devuelve permissions vacio») | OK |
| R8 | Administrador con los diez, sin comodin | `permissions.test.ts` + integracion | OK |
| R9 | Operador con exactamente uno | `permissions.test.ts` + integracion | OK |
| R10 | seed crea solo lo que falta, idempotente | `unit/identity/seed/seed-initial-access.test.ts` (4 casos con dobles) + integracion | OK |
| R11 | permisos en la misma lectura de sesion | `session-user.int.test.ts`: espia sobre `prisma.user.findFirst` (1 llamada) y `prisma.rolePermission.findMany` (0) | OK |
| R12 | antes de todo puerto y antes de validar | `require-permission.test.ts`, los cuatro `authorization.test.ts` y `unidades/list-units-query` | OK · PT |
| R13 | pertenencia exacta, sin implicacion | `require-permission.test.ts` (prefijo, caja, espacios, codigo que lo contiene) + cruzado en los cinco modulos | OK · PT |
| R14 | falla cerrado | `require-permission.test.ts` (7 formas) + por modulo | OK · PT |
| R15 | error del propio modulo, subclase de su raiz | ver 2.5 | OK · PT |
| R16 | la tabla exacta de permisos por caso de uso | los cuatro `authorization.test.ts` y `unidades`; contrastado ademas con el grep de los 30 `requirePermission(` reales contra la tabla del requisito: **coinciden uno a uno** | OK · PT |
| R17 | concede quien tiene el codigo, sea cual sea el rol | idem, mas el rechazo cruzado entre modulos | OK · PT |
| R18 | ningun Actor con nombre de rol | los cinco `actor.ts` son `{ id, permissions }`; grep de `roleName` en los cinco modulos: **cero en codigo** | OK · PT |
| R19 | guardia del permiso sin rol | `guards/guard-permisos-sembrados.test.ts` | OK · PT |
| R20 | guardia del servicio que autoriza por rol | `guards/guard-autorizacion-por-permiso.test.ts` (barre 124 archivos) | OK · PT |
| R21 | guardias derivadas del dato real, disparan y no disparan | las tres guardias, con casos sinteticos; ademas mutadas por el reviewer | OK · PT |
| R22 | migracion con down, RLS forzada, rollback | `guards/guard-rls-force.test.ts` + lectura completa del SQL (2.1) | OK (residual en 2.1) |
| R23 | el corte de rutas por rol no cambia | diff vacio verificado (2.4) + los cinco tests de ruta, sin tocar | OK |
| R24 | concesion y rechazo en los cinco servicios; sin E2E | los cuatro `authorization.test.ts` + los tres de `unidades` | OK (menor 6) |

## 4. Mutaciones ejecutadas por el reviewer

Cada mutacion se aplico al fuente REAL, se corrio el subconjunto pertinente y se revirtio con
`git checkout --`. El worktree quedo limpio (`git status --short` vacio).

| # | Mutacion | Esperado | Resultado real |
|---|---|---|---|
| MUT1 | quitar `pedidos.modificar` del Administrador en `SEED_ROLE_PERMISSIONS` | R19 rojo nombrando el permiso | **rojo**: «...ningun rol los recibe: pedidos.modificar» |
| MUT2 | añadir un permiso 11 al catalogo **y** al seed (simetrico correcto) | la regla de huerfanos NO dispara | **no disparo**; solo salto el ancla «exactamente diez», que es su trabajo y lo dice en el mensaje |
| MUT3 | meter `roleName` y el literal del rol en `recetas/domain/list-recipes.ts` | R20 rojo nombrando archivo y patron | **rojo**: «list-recipes.ts (literal del rol Administrador, roleName)» |
| MUT3b | los mismos dos textos, pero **solo como comentarios** (simetrico correcto) | R20 verde | **rojo** -> menor 1 (finales de linea CRLF). Con LF, verde |
| MUT4 | `permission-actions.ts` sintetico con `prisma.rolePermission.create` | R5 rojo por las dos mitades | **rojo** en las dos: escritura de Prisma y export `assignPermissionToRole` |
| MUT4b | el mismo archivo pero con `findMany` (simetrico correcto) | R5 verde | **verde**, 12/12 |
| MUT5 | `assertPermission` concede `consultar` a quien tiene `modificar` | R13 rojo | **rojo**: 7 tests en 5 archivos |
| MUT6 | `assertPermission` compara solo el modulo (`consultar` abre `modificar`) | R13 rojo | **rojo**: 30 tests en 7 archivos |
| MUT8 | `unidades` lanza `Error` plano en vez de su `UnauthorizedError` | R15 rojo | **rojo**: 14 tests en 2 archivos |
| MUT9 | mover `requirePermission` por debajo de zod en `createProduct` | R12 rojo | **rojo**: 1 test |
| MUT10 | `assertPermission` concede a cualquier actor con al menos un permiso | R17 rojo (cruce entre modulos) | **rojo**: 52 tests en 7 archivos |

Ningun requisito de los mutados sobrevivio con la suite en verde. R5, R12, R13, R15, R17, R19 y
R20 estan cubiertos por tests que **mueren** cuando el codigo se rompe.

## 5. Hallazgos

### Mayores (bloqueantes)

**Ninguno.**

### Menores

**menor 1 — `stripComments` de las guardias es ciego a los comentarios de linea si el archivo
tiene finales CRLF.** En `guard-autorizacion-por-permiso.test.ts:127` y
`guard-permisos-no-administrables.test.ts:168` (y en el precedente
`guard-rol-administrador-unico.test.ts:119`, de donde viene copiado literal):
`line.replace(/\/\/.*$/, '')`. Sin la bandera `m`, `$` solo ancla al final del string, y el punto
no casa `\r` porque `\r` es terminador de linea en JS. Con `split('\n')` sobre un archivo CRLF
cada linea termina en `\r`, asi que **el comentario de linea no se quita**. Demostrado (MUT3b):
reescribiendo `lib/modules/recetas/domain/list-recipes.ts` con CRLF y anteponiendole dos
comentarios —uno de linea que menciona `roleName` y el rol, otro de bloque que menciona
`requireAdmin`—, sin una sola linea de codigo infractor, la guardia se puso **roja**.
Hoy no afecta al gate: el worktree esta en LF, no hay `.gitattributes` y `core.autocrlf` no esta
fijado. Pero con `core.autocrlf=true` —el default de muchas instalaciones de Git for Windows— la
guardia pasa a (a) ponerse roja por documentacion y (b) volver a ser vulnerable al cegado por
bloque falso que la propia guardia documenta como razon de ordenar linea-antes-que-bloque.
**Es deuda heredada del precedente, no introducida por QC-74**, y por eso no bloquea: arreglarla
aqui obligaria a tocar tres guardias mas, fuera del alcance de la ficha. Merece ficha propia.
Arreglo de una linea: `/\/\/.*/` sin `$`, o `split(/\r?\n/)`.

**menor 2 — dos `errors.ts` conservan JSDoc que describe autorizacion por rol.**
`lib/modules/inventario/domain/errors.ts:21` («R2, R3: actor sin rol Administrador, o sin actor»)
y `lib/modules/pedidos/domain/errors.ts:27` («actor ausente, o con rol nulo, vacio o distinto de
ROLE_ADMINISTRADOR»). La bitacora dice que se actualizo el JSDoc de tres `errors.ts` (recetas,
unidades, proveedores); estos dos quedaron describiendo exactamente lo que R18 retiro. Es prosa,
no comportamiento, y la guardia R20 no lo ve porque descarta comentarios, que es lo correcto.

**menor 3 — `docs/architecture.md > Dominio` n.1 sigue diciendo que la lista de tablas exentas de
columna de empresa es «corta y cerrada: users, roles, document_types».** QC-74 añade dos tablas de
sistema mas que legitimamente no la llevan. La excepcion esta bien fundada y bien declarada (R6,
decision cerrada 10, `design.md > 1.2`, y el propio doc rechaza «permisos por empresa» como
sobre-ingenieria), asi que **no bloquea**; pero mientras el doc no las nombre, ese parrafo y el
checkpoint de datos chocan en cada revision futura. Una linea en `architecture.md` lo cierra.

**menor 4 — un caso de test promete mas de lo que comprueba.**
`tests/unit/identity/permissions.test.ts` -> «R8: no hay comodin ni regla implicita en el conjunto
del Administrador» solo verifica que cada codigo asignado exista en el catalogo; no comprueba nada
sobre comodines. El contenido real de R8 si queda cubierto por el caso anterior (igualdad exacta
contra los diez codigos copiados del requisito) y por MUT10. Cosmetico: o se renombra el caso, o
se le añade la asercion que su nombre promete.

**menor 5 — T18 sigue en `[ ]`.** `CHECKPOINTS.md > Especificacion` pide todas las tasks en `[x]`.
Es el gate completo y lo corre el leader por diseño del arnes, no un olvido del implementer. La
feature no puede pasar a `done` hasta que `./init.sh` termine en verde y quede anotado.

**menor 6 — sin E2E, con excepcion declarada.** `CHECKPOINTS.md > Calidad de codigo` pide un E2E
cuando la feature toca un flujo critico, y nombra «permisos». Aqui no hay pantalla que abrir y la
**decision cerrada 12 del humano (2026-09-07)** lo asigna explicitamente a QC-75, con
`design.md > 10` recogiendolo. Lo anoto porque ese checkpoint —a diferencia del de UI
multiplataforma— no tiene clausula de excepcion escrita: el leader deberia confirmarlo al cerrar,
y QC-75 hereda la deuda con nombre.

### Ruido conocido, no imputable a esta feature

Los timeouts intermitentes de `tests/unit/proveedores-ui/catalog-line-sheet.test.tsx` y de algun
caso de `pedidos-ui/order-form|order-sheet` son anteriores a QC-74 y tienen ficha propia (QC-58).
No aparecieron en ninguna de mis corridas y no se cuentan como hallazgo.

## 6. Veredicto

**APROBADO.** Cero bloqueantes.

Los 24 requisitos estan mapeados a tests que existen y que mueren al romper el codigo; las tres
guardias disparan ante la infraccion y callan ante el caso correcto simetrico; el `migration.sql`
esta limpio de drift y trae RLS activada y forzada con su `down.sql`; y la jerarquia de errores
por modulo —el riesgo estructural de la ficha, cinco modulos a un `instanceof` de una regresion
silenciosa— sobrevive intacta y esta anclada por test. Los seis menores son deuda documental, un
caso de test mal nombrado y las dos casillas que le tocan al leader.
