# QC-86 - modelo-de-asignacion-de-pedidos - bitacora de implementacion

> Rama `feature/QC-86-modelo-de-asignacion-de-pedidos`, nacida de `origin/dev` en `398dfd6`.
> Worktree `.worktrees/QC-86-modelo-de-asignacion-de-pedidos/`. Commit de la tanda: `673b102`.
> **Zona backend puro**: **cero** archivos de `app/**`, `components/**`, `hooks/**` o
> `lib/composition/**` en el diff - verificado en la seccion 5, no supuesto.

## 0. Base de datos propia, ANTES de la primera migracion

El worktree no tenia `.env` (solo `.env.example`). Se creo **antes** de tocar ninguna migracion,
copiando la forma del `.env` del repo principal -misma credencial, mismo host- y cambiando **solo**
el nombre de la base: **`QuimiCloude_QC86`**. Se creo vacia, se le aplicaron las 23 migraciones
previas y se sembro. Ninguna operacion de esta ficha toco `QuimiCloude` ni la base de ninguna otra
ficha en curso.

```
CREADA  -> QuimiCloude_QC86
db:migrate -> All migrations have been successfully applied.  (23 previas)
db:seed    -> roles: 2 - permisos creados: 11 (2 ya estaban) - asignaciones: 14
```

## 1. Archivos tocados

**Nuevos**

| Archivo | Que |
| --- | --- |
| `lib/modules/asignaciones/index.ts` | Contrato publico del modulo nuevo (R31) |
| `lib/modules/asignaciones/domain/order-assignment.ts` | `OrderAssignment` y `AssignmentOrigin` |
| `db/migrations/20260911120000_order_assignments/migration.sql` | UP: tabla, 2 indices, CHECK, 3 FK, permisos, RLS |
| `db/migrations/20260911120000_order_assignments/down.sql` | DOWN (R34, R35) |
| `tests/unit/asignaciones/schema/order-assignments-migration.test.ts` | **A** - esquema y migracion (44 casos) |
| `tests/unit/asignaciones/module-contract.test.ts` | **E** - forma del modulo y frontera (20 casos) |
| `tests/integration/asignaciones/order-assignments-constraints.int.test.ts` | **B** - constraints contra Postgres real (30 casos) |
| `progress/impl_QC-86-modelo-de-asignacion-de-pedidos.md` | esta bitacora |

**Modificados**

| Archivo | Que cambia |
| --- | --- |
| `db/schema.prisma` | **Solo** el modelo `OrderAssignment`: 97 lineas anadidas, **0 eliminadas**. Ni una linea de `User`, `Company`, `WorkGroup`, `WorkGroupMember` u `Order` (R32) |
| `lib/modules/identity/domain/permissions.ts` | Dos entradas en `PERMISSIONS`, dos codigos al Administrador, uno al Operador, y la enmienda escrita: trece -> **quince** |

## 2. Los tests ajenos retensados, uno a uno, con su motivo

**Ninguna asercion se debilito.** Ninguna igualdad (`toBe`, `toEqual`, `toHaveLength`) se convirtio
en `toContain`, `toBeGreaterThan` ni `expect.arrayContaining`. Solo se **sube el numero** y se
**amplia la lista escrita a mano** - riesgo 6 de `design.md`.

### 2.a Los cinco que afirman el numero exacto del catalogo (T4)

| Archivo | Que se retenso |
| --- | --- |
| `tests/unit/identity/permissions.test.ts` | `CODIGOS_DEL_REQUISITO` +2; `MODULOS` y `MODULOS_CON_ESCRITURA` +`asignaciones`; `Set.size` 13 -> **15**; los **tres** casos del Operador pasan de la igualdad con solo `inventario.consultar` a la igualdad con `inventario.consultar` y `asignaciones.consultar`. Dos casos NUEVOS (QC-86 R25 y R27) que APRIETAN |
| `tests/guards/guard-permisos-sembrados.test.ts` | `toBe(13)` -> **`toBe(15)`**, y el mensaje pasa a "quince entradas ... enmendado por QC-38, por QC-66 y por QC-86" |
| `tests/unit/navegacion/qc75-convenciones.test.ts` | `CODIGOS_QC74` +2; `MODULOS_DE_NEGOCIO` +`asignaciones`; `toHaveLength(13)` -> **15** |
| `tests/unit/identity/seed/seed-initial-access.test.ts` | "trece permisos y catorce asignaciones" -> **quince y diecisiete**; `toBe(14)` -> **`toBe(17)`**; `toHaveLength(13)` -> **15** |
| `tests/integration/identity/identity-seed.int.test.ts` | Total del seed 14 -> **17**; los casos del Operador a los **dos** codigos exactos (aqui el orden es **alfabetico**: el helper ordena por `permissionCode`); `createdRolePermissions` 1 -> **2** al resembrar el rol Operador |

**Prueba de que el retensado muerde:** se quito a mano `asignaciones.modificar` del catalogo y los
cuatro unitarios cayeron (4 archivos rojos, 7 casos). Restaurado, verde otra vez.

### 2.b Los de lista blanca de rutas (T13) - se ejecuto CADA UNO, se toco solo el rojo

| Archivo | Resultado | Que se hizo |
| --- | --- | --- |
| `tests/unit/recetas-ui/recipe-route-contract.test.ts` | **ROJO** | Retensado: bloque `MIGRACION_QC86` que **nombra** los dos `.sql` de la ficha y `db/schema.prisma`, con el comentario del porque, junto a `MIGRACION_QC83`/`MIGRACION_QC66`. Cualquier OTRO archivo de `db/` lo sigue poniendo rojo |
| `tests/guards/guard-identificador-de-request.test.ts` | **ROJO** | Retensado: `20260911120000_order_assignments` anadida a `MIGRACIONES_ESPERADAS` con su comentario. La comprobacion sobre `db/schema.prisma` -que ningun termino del identificador aparezca- se deja **intacta** y sigue pasando |
| `tests/unit/recetas/module-contract.test.ts` | verde | **no se toco** |
| `tests/unit/unidades/unidades-convenciones.test.ts` | verde | **no se toco** |
| `tests/unit/unidades/consumidores-catalogo.test.tsx` | verde | **no se toco** |
| `tests/unit/navegacion/qc75-convenciones.test.ts` | verde (2 skip) | solo lo de 2.a. Su bloque "QC-75 R22" **salta** por su deteccion conjuntiva: solo aplica en la rama de QC-75 |

## 3. El rollback, verificado contra Postgres real (T7)

No leido: ejecutado. Snapshot de `orders` y `users` -columnas, indices, constraints y RLS- antes del
UP, despues del UP y despues del rollback.

```
===== A. ANTES DEL UP =====
order_assignments existe: false
permissions -> 13        role_permissions -> 14
(sin fila de 20260911120000_order_assignments en _prisma_migrations)

===== B. DESPUES DEL UP =====
order_assignments existe: true
permissions -> 15        role_permissions -> 17
  asignaciones.consultar | asignaciones | consultar | Consultar los pedidos asignados.
  asignaciones.modificar | asignaciones | modificar | Asignar y desasignar responsables de un pedido.
  Administrador -> asignaciones.consultar / asignaciones.modificar
  Operador      -> asignaciones.consultar
--- constraints ---
  order_assignments_pkey               | p | PRIMARY KEY (order_id, user_id)
  order_assignments_order_id_fkey      | f | FOREIGN KEY (order_id) REFERENCES orders(id) ON UPDATE CASCADE ON DELETE RESTRICT
  order_assignments_user_id_fkey       | f | FOREIGN KEY (user_id, company_id) REFERENCES users(id, company_id) ON UPDATE CASCADE ON DELETE RESTRICT
  order_assignments_work_group_id_fkey | f | FOREIGN KEY (work_group_id, company_id) REFERENCES work_groups(id, company_id) ON UPDATE CASCADE ON DELETE RESTRICT
  order_assignments_work_group_name_matches_group | c | CHECK (((work_group_id IS NULL AND work_group_name IS NULL) OR (work_group_id IS NOT NULL AND work_group_name IS NOT NULL)))
--- RLS --- relrowsecurity=true | relforcerowsecurity=true

diff <orders+users ANTES> <orders+users DESPUES>  ->  DIFF VACIO   (R32 contra la base)

===== C. DESPUES DEL ROLLBACK =====
order_assignments existe: false
permissions -> 13        role_permissions -> 14
grep 20260911120000_order_assignments en _prisma_migrations -> 0

diff <estado ANTES del UP> <estado DESPUES del rollback>
  -> DIFF VACIO COMPLETO  (R34: conteos, catalogo, columnas/indices/constraints/RLS
     de orders y users, y la lista entera de _prisma_migrations)

===== D. REAPLICACION =====
Applying migration 20260911120000_order_assignments -> All migrations have been successfully applied.
prisma migrate status -> Database schema is up to date!   (sin drift)
permissions -> 15   role_permissions -> 17   RLS -> true/true
```

El ciclo rollback -> migrate se ejecuto **tres veces**, limpio las tres.

## 4. Salida real de los tests que se corrieron

El gate es del leader (`AGENTS.md > Regla del gate`): `./init.sh --rapido` por tanda y `./init.sh`
completo antes del PR. Aqui solo se corrieron `typecheck`, `lint` y los archivos de la ficha.

```
pnpm run typecheck  -> tsc --noEmit   (sin salida, verde, en las seis tandas)
pnpm run lint       -> eslint         (sin salida, verde, en las seis tandas)

tests/unit/asignaciones/schema/order-assignments-migration.test.ts    44 passed (44)
tests/unit/asignaciones/module-contract.test.ts                       20 passed (20)
tests/integration/asignaciones/order-assignments-constraints.int.test.ts
                                                                      30 passed (30)  x4 pasadas
    -> SELECT count(*) FROM order_assignments = 0 al terminar (sin residuo)
tests/integration/identity/identity-seed.int.test.ts                  14 passed (14)  x2 pasadas
permissions + guard-permisos-sembrados + qc75-convenciones + seed-initial-access
                                                                      65 passed | 2 skipped (67)
guard-rls-force + guard-arquitectura-modulos + guard-permisos-sembrados
                                                                      69 passed (69)
tests/guards/guard-dependencias-aprobadas.test.ts                      2 passed (2)
tests/unit/recetas-ui/recipe-route-contract.test.ts                   25 passed (25) (tras retensar)
tests/guards/guard-identificador-de-request.test.ts                   23 passed (23) (tras retensar)
tests/unit/recetas/module-contract.test.ts                             5 passed (5)
tests/unit/unidades/unidades-convenciones.test.ts                     18 passed | 3 skipped (21)
tests/unit/unidades/consumidores-catalogo.test.tsx                     5 passed | 1 skipped (6)
```

## 5. R32, R36 y R37 verificados sobre el diff, no supuestos

`git diff --name-only origin/dev...HEAD` devuelve **exactamente** los 17 archivos que `tasks.md`
autoriza. El filtro contra la lista "Archivos que NO se tocan" sale **VACIO**:

```
app/ . components/ . hooks/ . middleware.ts . lib/composition/ .
lib/shared/navigation/private-nav.ts . scripts/seed.ts .
lib/modules/{pedidos,recetas,inventario,unidades,proveedores}/ . e2e/ .
package.json . pnpm-lock.yaml            -> (vacio)
```

**R37**: `git diff origin/dev -- package.json pnpm-lock.yaml` -> **vacio**, y
`guard-dependencias-aprobadas` en verde. Ninguna dependencia nueva.

**R36 - E2E**: `git diff --name-only origin/dev...HEAD -- e2e/` -> **0 archivos**. Ningun
`test(...)` de E2E cambio de guion y no se anadio ningun E2E nuevo (decision cerrada 16).

### El E2E esta ROJO, y NO es de esta ficha - queda ABIERTO para el leader

`pnpm run e2e` -> **53 passed, 13 failed (8.7m)**. Los 13 rojos son los mismos seis specs en los dos
navegadores (`errores`, `inventario`, `pedidos`, `permisos`, `proveedores`, `recetas`) y **todos**
son casos de usuario no-Administrador / Operador. Se investigo en vez de suponer:

1. Repetido con `--workers=1`: **fallan igual**, asi que no es solo agotamiento de conexiones
   (el log con 6 workers trae ademas el error de que no alcanza el servidor de base de datos).
2. **Experimento controlado**: se borro **solo de la base**, sin tocar codigo, la fila
   `Operador -> asignaciones.consultar`, dejando al Operador exactamente como estaba antes de esta
   ficha, y se repitieron `permisos.spec.ts` e `inventario.spec.ts`. **Fallan exactamente igual**,
   con el mismo error (`private-user-trigger` no encontrado; `waitForURL` timeout). La fila se
   restauro despues: la base queda correcta con
   `Operador -> asignaciones.consultar, inventario.consultar`.

**Conclusion: los 13 rojos son previos y ajenos a QC-86** -del entorno `next dev` del E2E-, y esta
ficha no los introduce ni los tapa. No se toco ningun spec para "arreglarlos": eso habria sido
cambiar el guion, que es justo lo que R36 prohibe.

## 6. Mapa de trazabilidad R1..R37 -> test

Abreviaturas: **A** = `tests/unit/asignaciones/schema/order-assignments-migration.test.ts` .
**B** = `tests/integration/asignaciones/order-assignments-constraints.int.test.ts` .
**C** = `tests/unit/identity/permissions.test.ts` . **D** = `tests/guards/guard-permisos-sembrados.test.ts` .
**E** = `tests/unit/asignaciones/module-contract.test.ts` . **F** = `tests/guards/guard-arquitectura-modulos.test.ts` .
**G** = `tests/integration/identity/identity-seed.int.test.ts` . **H** = `tests/guards/guard-rls-force.test.ts` .
**I** = `tests/guards/guard-dependencias-aprobadas.test.ts` .
**J** = `tests/unit/identity/seed/seed-initial-access.test.ts` . **T7** = el rollback real de la seccion 3 .
**T13** = la verificacion de diff de la seccion 5.

| R | Archivo | Titulo exacto del caso |
| --- | --- | --- |
| R1 | A | `las tres columnas de referencia y las dos marcas de tiempo son obligatorias (R1, R23)` / `declara las tres referencias y las dos marcas de tiempo obligatorias (R1, R23)` |
| R1 | B | `R1: rechaza la asignacion a la que le falta el pedido, la persona o la empresa` (23502) |
| R2 | B | `R2: rechaza la asignacion cuyo pedido no existe` (23503) |
| R3 | B | `R3: rechaza asignar dos veces a la misma persona al mismo pedido` / `R3: rechaza la segunda llegada venga con un grupo o con otro grupo distinto` (23505) |
| R4 | B | `R4: acepta un pedido con varias personas y una persona en varios pedidos` |
| R5 | A | `no hay ninguna columna que guarde un segundo origen de la misma persona (R5)` / mutacion `anadir una columna que guarde un segundo origen cae (R5)` |
| R6 | A | `el grupo y su nombre congelado son las dos unicas columnas anulables (R6)` / `declara el grupo y su nombre congelado como anulables (R6)` |
| R6 | B | `R6: acepta las dos columnas juntas y distingue en la fila el origen de la persona` |
| R7 | A | `el CHECK de la congelacion existe con sus dos ramas unidas por OR (R7)` / mutacion `quitarle una rama al CHECK, o cambiar el OR, cae (R7)` |
| R7 | B | `R7: rechaza el grupo sin nombre congelado y el nombre congelado sin grupo` (23514 x2) |
| R8 | B | `R8: renombrar el grupo despues de asignar no cambia el nombre congelado` / `R8: dar de baja el grupo no cambia ninguna columna de la asignacion` |
| R9 | B | `R9: meter y sacar personas del grupo despues de asignar no crea, borra ni modifica ninguna asignacion` |
| R10 | A | `las tres claves foraneas son ON DELETE RESTRICT y ON UPDATE CASCADE (R10, R20, R22)` |
| R10 | B | `R10: rechaza borrar fisicamente un grupo con asignaciones, y grupo y filas quedan intactos` |
| R11 | A | `las dos claves foraneas hacia identity llevan company_id en los dos lados (R11)` / mutacion `simplificar una FK compuesta a simple cae (R11, riesgo 1)` |
| R11 | B | `R11: rechaza la asignacion con persona de la empresa A y grupo de la empresa B` / `R11: rechaza la misma asignacion cruzada declarando la empresa del grupo` / `R11: rechaza la asignacion cuya empresa no es la de la persona ni la del grupo` / `R11: rechaza tambien AL MODIFICAR la asignacion hacia un grupo de otra empresa` / `R11: acepta la asignacion cuando la persona, el grupo y la empresa son la misma` |
| R12 | B | `R12: rechaza cambiar de empresa a una persona con una asignacion de grupo` / `R12: rechaza cambiar de empresa a un grupo ya aplicado a un pedido` / `R12: acepta mover de empresa a un grupo sin aplicar y a una persona sin asignaciones` |
| R13 | A | `ninguna clave foranea declara el modo de coincidencia estricto (R13)` / mutacion `meter el modo de coincidencia estricto cae, y el modo por defecto no (R13, riesgo 2)` |
| R13 | B | `R13: acepta la asignacion sin grupo cuya empresa es la de su persona` / `R13: rechaza la asignacion sin grupo cuya empresa no es la de su persona` |
| R14 | A | `la clave foranea del pedido es simple y el UP no le anade empresa a orders (R14)` / mutacion `anadirle company_id a la clave foranea del pedido cae (R14)` |
| R15 | A | `ni el SQL ni el esquema declaran deleted_at en la tabla (R15)` / mutacion `meter un deleted_at en la tabla o en el modelo cae (R15, riesgo 4)` |
| R15 | B | `R15: elimina fisicamente la fila y no deja ningun rastro` |
| R16 | B | `R16: borrar una sola fila de un grupo deja las demas de ese grupo intactas` |
| R17 | A | `existen los dos indices que la PK no cubre, y ninguno mas (R17)` |
| R17 | B | `R17: borrar por pedido y grupo se lleva solo las de ese grupo, ni las sueltas ni las de otro grupo` |
| R18 | B | `R18: un pedido sin asignaciones existe, y borrar la ultima no cambia ni una columna del pedido` |
| R19 | B | `R19: dar de baja el pedido conserva intactas todas sus asignaciones` |
| R20 | A | `las tres claves foraneas son ON DELETE RESTRICT y ON UPDATE CASCADE (R10, R20, R22)` |
| R20 | B | `R20: rechaza borrar fisicamente un pedido con asignaciones, y pedido y filas quedan intactos` |
| R21 | B | `R21: dar de baja a una persona, o dejarla inactive o blocked, conserva sus asignaciones` |
| R22 | A | `las tres claves foraneas son ON DELETE RESTRICT y ON UPDATE CASCADE (R10, R20, R22)` |
| R22 | B | `R22: rechaza borrar fisicamente a una persona con asignaciones, y persona y filas quedan intactas` |
| R23 | A | `las tres columnas de referencia y las dos marcas de tiempo son obligatorias (R1, R23)` |
| R23 | B | `R23: created_at y updated_at se rellenan solos y el segundo cambia al modificar la fila` |
| R24 | A | `nombra en ingles y en snake_case todo lo que crea (R24)` / `la guardia de idioma cae con un identificador en espanol, con acentos o en camelCase (R24)` |
| R25 | C | `R2: contiene exactamente los quince codigos del requisito, ni uno mas ni uno menos` / `R2: cada entrada trae descripcion no vacia` / `QC-86 R25: el Administrador tiene asignaciones.consultar Y asignaciones.modificar, escritos uno a uno` |
| R26 | C | `R8: el Administrador tiene los quince permisos, escritos uno a uno` / `R9 (enmendado por QC-86 R26): el Operador tiene exactamente dos permisos: inventario.consultar y asignaciones.consultar` |
| R26 | D | `el catalogo real no esta vacio y tiene exactamente quince permisos` / `ningun permiso declarado se queda sin rol` |
| R26 | G | `la primera corrida deja el catalogo completo, el Administrador con los quince permisos y el Operador solo con inventario.consultar y asignaciones.consultar; la segunda no cambia ningun conteo` |
| R26 | J | `sobre una base vacia crea los quince permisos del catalogo y las diecisiete asignaciones del seed` |
| R27 | C | `QC-86 R27: el Operador recibe asignaciones.consultar y NO asignaciones.modificar` / `QC-38 R4: el Operador no recibe ninguno de unidades (su conjunto exacto lo enmendo QC-86)` / `QC-66 R9: el Operador no recibe ninguno de los dos permisos de usuarios` |
| R27 | G | el caso de la fila de R26, mas el `not.toContain('recetas.consultar')` anadido en T12 |
| R28 | A | `codigos, modulos, acciones y descripciones coinciden con PERMISSIONS del barril (R28)` / `los INSERT son idempotentes y resuelven el rol por nombre, sin ningun uuid literal (R28)` / mutaciones `meter un uuid literal, quitar el ON CONFLICT o resolver el rol por id cae (R28)` y `cambiar una descripcion del SQL lo separa del catalogo y cae (R28)` |
| R28 | G | `aplicar el SQL de permisos de la migracion de asignaciones sobre la base ya sembrada no duplica, no reescribe y no borra nada, ni a la primera ni a la segunda` |
| R29 | E | `asignaciones.consultar y asignaciones.modificar solo aparecen en lib/modules/identity/domain/permissions.ts (R29)` / `detecta el consumo de los dos codigos desde app/, components/, lib/shared/ y otro modulo (R29)` / mutacion `consumir asignaciones.modificar desde un archivo real de app/ pone la regla en rojo (R29)` |
| R30 | A | `declara que su dueno es el modulo asignaciones (R30)` / mutacion `quitar el /// @module o cambiarlo de dueno cae (R30)` |
| R30 | E | `ningun archivo del repo fuera de lib/modules/asignaciones consulta prisma.orderAssignment (R30)` / mutacion `consultar prisma.orderAssignment desde un archivo real de otro modulo pone la regla en rojo (R30)` |
| R30 | F | bloque de propiedad de modelos: todo modelo de `db/schema.prisma` declara su `/// @module` |
| R31 | A | `no declara ninguna @relation: sus tres FK van a mano (R31)` / mutacion `meter una @relation cae (R31)` |
| R31 | E | `ningun archivo real de lib/modules/asignaciones importa una ruta interna de otro modulo ni el cliente Prisma (R31)` / `el cierre de imports del barril real no arrastra next/*, @prisma/client ni use server (R31)` |
| R31 | F | bloques 1, 5 y 6: barril presente, imports entre modulos por barril, contrato sin servidor |
| R32 | A | `no ejecuta ningun DDL sobre ninguna tabla preexistente (R32)` / `lo unico que escribe sobre tablas preexistentes son los INSERT de permisos (R32)` / mutacion `colar un ALTER TABLE sobre una tabla preexistente cae, y nombrarla en un comentario no (R32)` |
| R32 | T13 | `git diff db/schema.prisma` = 97 anadidas / **0 eliminadas**; snapshot de `orders` y `users` identico antes y despues del UP |
| R33 | A | `queda con ENABLE y con FORCE, y los dos ALTER son el ultimo bloque del archivo (R33)` / mutacion `quitar el FORCE, quitar el ENABLE o colar algo detras de ellos cae (R33)` |
| R33 | H | `toda tabla creada tiene RLS activado y forzado` (descubre `order_assignments` leyendo el SQL) |
| R34 | A | `revertir devuelve el catalogo persistido a sus trece entradas (R34)` / `el DROP TABLE se lleva solo la tabla de la ficha y no lleva CASCADE (R34, R35)` |
| R34 | T7 | rollback real de la seccion 3: DIFF VACIO COMPLETO entre el estado previo al UP y el posterior al rollback |
| R35 | A | `no lleva ningun INSERT, UPDATE ni ALTER TABLE (R35)` / `los dos DELETE van acotados por los dos codigos, y las asignaciones caen primero (R35)` / `no nombra orders, users, work_groups ni companies en ninguna linea ejecutable (R35)` / mutaciones `meter un UPDATE, un INSERT o un ALTER TABLE cae (R35)`, `desacotar un DELETE, cambiar un codigo o meter un CASCADE cae (R35)` y `nombrar una tabla preexistente en el down cae (R35)` |
| R36 | E | `el modulo real tiene index.ts y solo la carpeta domain/, sin ports/ ni adapters/ (R36)` / mutacion `anadir ports/ al arbol real del modulo pone la regla en rojo (R36)` |
| R36 | T13 | `git diff --name-only origin/dev...HEAD -- e2e/` = 0 archivos; ningun `test(...)` de E2E cambio de contenido; ningun E2E nuevo |
| R37 | I | `guard-dependencias-aprobadas` en verde |
| R37 | T14 | `git diff origin/dev -- package.json pnpm-lock.yaml` -> vacio |

**Los 37 requisitos tienen test nombrado. Ninguno queda sin cubrir.**

## 7. Cosas abiertas para el reviewer y el leader

1. **El E2E esta rojo (13 de 66) y NO es de esta ficha** - seccion 5, con el experimento controlado
   que lo demuestra. Es lo unico rojo que deja la ficha, y se deja rojo a proposito en vez de tocar
   un spec ajeno.
2. **La cabecera del `migration.sql` dice "los CUATRO INSERT de permisos"** y el paso 5 tiene
   **tres sentencias** ejecutables: una a `permissions` con dos filas y dos a `role_permissions`.
   Viene de la redaccion de `design.md > 5.1` y `tasks.md > T6`. Es **solo el comentario**: el test
   de esquema afirma sobre las sentencias que hay de verdad. No se corrigio porque editar el SQL de
   una migracion ya aplicada invalida su checksum en `_prisma_migrations`; se deja anotado.
3. **QC-94 (`consulta-de-roles`) va en paralelo** y trae `tests/unit/identity/roles/scope.test.ts`,
   que afirma que `PERMISSIONS` sigue con **trece** entradas. Hoy ese archivo **no existe** en esta
   rama y no hay conflicto. El dia que QC-94 entre en `dev` y se haga `git merge origin/dev`, ese
   test se pondra rojo por los dos permisos nuevos: **retensarlo de 13 a 15 es parte de la
   sincronizacion**, con el mismo criterio de la seccion 2 -subir el numero, nunca relajar la
   asercion- y se dira en el PR.
4. **El gate no lo corrio el implementer**: `./init.sh --rapido` por tanda y `./init.sh` completo
   antes del PR son del leader (`AGENTS.md > Regla del gate`).
