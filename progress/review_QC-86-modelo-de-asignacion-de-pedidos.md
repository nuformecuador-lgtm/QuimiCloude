# QC-86 — modelo-de-asignacion-de-pedidos · review

> Rama `feature/QC-86-modelo-de-asignacion-de-pedidos`, nacida de `origin/dev` en `398dfd6`.
> Revisado en el worktree `.worktrees/QC-86-modelo-de-asignacion-de-pedidos/`.
> **Veredicto: APROBADO** — 0 hallazgos bloqueantes, 5 menores, **22 mutaciones probadas**
> (18 sobre archivos, 4 sobre las restricciones de la base real). Todas cayeron en rojo y el
> estado se restauro verde despues de cada una.

---

## 1. Checklist

### Especificacion
- [x] `requirements.md` con 37 requisitos EARS numerados `R1`..`R37`.
- [x] `design.md` con seis alternativas descartadas (9.1 a 9.6) y su porque, mas el bloque `> 0`
      con los tres hallazgos y la lista de ocho riesgos.
- [~] `tasks.md`: **13 de 16 tasks marcadas `[x]`**. Las tres sin marcar —**T5**, **T9** y
      **T16**— son los cierres de tanda y de feature, es decir el **gate**, que es del leader
      (`AGENTS.md > Regla del gate`) y no del implementer. Ver menor-1.

### Trazabilidad — los 37, abriendo el test
- [x] Los 37 requisitos tienen test nombrado en `progress/impl_...md > 6` y **los 37 se
      comprobaron abriendo el archivo y ejecutandolo**, no leyendo la tabla. No hay ningun `R<n>`
      apuntando a un test vacio, a un titulo inexistente ni a una asercion que no afirme lo que
      dice. Detalle en la seccion 2.
- [x] `progress/impl_QC-86-modelo-de-asignacion-de-pedidos.md` contiene el mapa `R<n> -> test`.

### Verificacion ejecutable (corrida por el reviewer, no leida de la bitacora)
- [x] `pnpm run typecheck` — verde.
- [x] `pnpm run lint` — verde.
- [x] `tests/unit/asignaciones/**` — **64 passed (64)**.
- [x] `tests/integration/asignaciones/order-assignments-constraints.int.test.ts` — **30 passed
      (30)**, contra Postgres real.
- [x] `tests/integration/identity/identity-seed.int.test.ts` — **14 passed (14)**.
- [x] `tests/guards/**` — **24 archivos, 256 passed (256)**.
- [x] Los seis tests con lista blanca de rutas — **95 passed | 6 skipped (101)**.
- [x] Los cinco tests del catalogo retensados — **72 passed | 2 skipped (74)**.
- [x] **Rollback y reaplicacion reales**, ejecutados por el reviewer: `pnpm run db:rollback` deja
      `order_assignments` inexistente, `permissions` en **13**, `role_permissions` en **14**,
      `_prisma_migrations` sin la fila y `orders`+`users` con sus 35 columnas intactas;
      `pnpm run db:migrate` la reaplica limpia y vuelve a **15**/**17** con RLS `true`/`true`.
- El gate largo (`./init.sh`) es del leader y **no se lanzo aqui**, por encargo explicito.

### Calidad, seguridad y alcance
- [x] **Aislamiento por empresa.** `order_assignments` lleva `company_id` propio y la coherencia
      la impone la **base**, no un service: las dos FK hacia `identity` son compuestas
      —`("user_id","company_id") -> users("id","company_id")` y
      `("work_group_id","company_id") -> work_groups("id","company_id")`—, verificado leyendo
      `pg_constraint` de la base real. El rechazo cruzado tiene test (R11, cinco casos) y el
      test **cae de verdad** al convertir cualquiera de las dos en simple (mutaciones D2 y D3).
      La FK del pedido es simple a proposito: `orders` no tiene `company_id` (R14, epica QC-46),
      y esta ficha no se lo anade.
- [x] **RLS** activada **y forzada** en la tabla nueva, comprobado en `pg_class`
      (`relrowsecurity=true`, `relforcerowsecurity=true`) y por `guard-rls-force`.
- [x] **Migracion reversible** con `down.sql`; verificado ejecutandolo.
- [x] **Sin secretos** ni valores de entorno en el diff.
- [x] **Capas separadas**: `lib/modules/asignaciones/` tiene `index.ts` y solo `domain/`; el
      contrato no arrastra `next/*`, `@prisma/client` ni `use server`, y ningun archivo fuera del
      modulo consulta `prisma.orderAssignment`.
- [x] **Multiplataforma: no aplica.** La feature no toca `app/**`, `components/**` ni `hooks/**`;
      no hay UI en el diff.
- [x] **Dependencias: ninguna nueva.** `package.json` y `pnpm-lock.yaml` no aparecen en
      `git diff origin/dev...HEAD --stat`. `guard-dependencias-aprobadas` en verde. R37 cumplido
      y `design.md > 7` lo declara sin propuesta que abrir.
- [x] **Alcance.** `git diff origin/dev...HEAD --stat` devuelve 21 archivos y **ninguno** de la
      lista «Archivos que NO se tocan»: cero en `app/**`, `components/**`, `hooks/**`,
      `middleware.ts`, `lib/composition/**`, `scripts/seed.ts`, `e2e/**`, `package.json`,
      `lib/modules/{pedidos,recetas,inventario,unidades,proveedores}/**`, y de
      `lib/modules/identity/**` solo `domain/permissions.ts`. Ninguna migracion preexistente
      cambia.
- [x] **`db/schema.prisma`**: 97 lineas anadidas, **0 eliminadas**. Solo el modelo
      `OrderAssignment`.

### Las 17 decisiones cerradas
Ninguna implementada a medias. Una a una: (1) modulo nuevo con barril, `/// @module asignaciones`
y contrato propio — hecho; (2) sin caso de uso, service, Server Action ni pantalla — hecho, no hay
`ports/` ni `adapters/`; (3) un solo origen, PK `(order_id,user_id)` — hecho, `23505` probado por
los tres caminos; (4) las personas de un grupo identificables por `(order_id, work_group_id)` —
hecho, y el `design.md > 0` punto 2 declara por que la base no puede hacer mas en esta ficha;
(5) sacar a UNA persona con borrado **fisico** — hecho, sin `deleted_at`; (6) el cruce de empresas
lo impide la BASE — hecho y verificado con DDL real; (7) congelacion del grupo y su nombre de
entonces — hecho, CHECK mas tests de renombrado y de baja; (8) dos permisos, Operador `consultar`,
Administrador los dos, al Operador **no** `recetas.consultar` — hecho, con
`not.toContain('recetas.consultar')` contra base real; (9) persona de baja, `inactive` o `blocked`
sigue responsable — hecho; (10) pedido sin responsables — hecho; (11) asignaciones conservadas al
dar de baja el pedido — hecho; (12) ingles y `snake_case` — hecho; (13) `created_at`/`updated_at` —
hecho; (14) RLS activada y forzada — hecho; (15) `down.sql` que revierte al esquema exacto — hecho
y **ejecutado**; (16) sin E2E nuevo y los existentes sin cambio de guion — hecho, `e2e/` con 0
archivos en el diff; (17) ninguna libreria nueva — hecho.

---

## 2. Trazabilidad verificada: como se comprobo cada bloque

**No se acepto ningun `R<n>` por estar nombrado en una tabla.** Se abrio el test, se leyo la
asercion y, donde el requisito es una garantia de la base, se muto lo que vigila.

- **R1, R5, R6, R7, R10, R11, R13, R14, R15, R17, R20, R22, R23, R24, R28, R30, R31, R32, R33,
  R34, R35** — `tests/unit/asignaciones/schema/order-assignments-migration.test.ts`. El archivo no
  compara cadenas sueltas: extrae la FK con un parser (`foreignKey`), las columnas de la tabla
  (`tableColumns`), los indices y las sentencias **sin comentarios**, y afirma **igualdades
  exactas** —la lista completa de columnas, la lista completa de indices, la lista de tablas
  creadas—. Las descripciones del SQL se comparan contra `PERMISSIONS` **importado del barril**,
  no copiado.
- **R2, R3, R4, R6, R7, R8, R9, R10, R11, R12, R13, R15, R16, R17, R18, R19, R20, R21, R22, R23** —
  `tests/integration/asignaciones/order-assignments-constraints.int.test.ts`. Cada caso corre
  dentro de una transaccion que acaba en `ROLLBACK`, con dos empresas efimeras. El helper
  `expectRejectedByDatabase` **lanza si la base acepta la operacion**, asi que no puede pasar en
  verde por no haber roto nada; y ademas del `SQLSTATE` afirma **el nombre de la restriccion** que
  disparo y que no quedo ninguna fila ni ninguna asignacion desincronizada (`desyncedAssignments`,
  un `JOIN` real contra `users` y `work_groups`).
- **R25, R26, R27** — `tests/unit/identity/permissions.test.ts` (igualdad exacta con la lista
  escrita a mano), `guard-permisos-sembrados`, `seed-initial-access` y, contra base real,
  `identity-seed.int.test.ts`.
- **R28 sobre instalacion existente** — el caso de `identity-seed.int.test.ts` **lee las tres
  sentencias del `migration.sql` real** (no una copia), las aplica **dos veces** sobre una base ya
  sembrada y compara las filas de `permissions` y `role_permissions` **campo a campo**, incluidos
  `created_at` y `updated_at`. Un `DO UPDATE` mal puesto, que no moveria ningun conteo, cae aqui.
- **R29** — `tests/unit/asignaciones/module-contract.test.ts`, en negativo y con mutacion sobre un
  archivo **real** de `app/`.
- **R36** — forma del modulo mas `git diff -- e2e/` vacio.
- **R37** — `git diff -- package.json pnpm-lock.yaml` vacio mas `guard-dependencias-aprobadas`.

---

## 3. Las 22 mutaciones probadas

Cada una se aplico **sobre el archivo o la base reales**, se ejecuto la suite y se restauro. El
arbol de trabajo y la base quedaron limpios al terminar (`git status --porcelain` vacio; las
cinco restricciones de `order_assignments` y los conteos 15/17 verificados tras restaurar).

**Sobre `db/migrations/20260911120000_order_assignments/migration.sql`**

| # | Mutacion | Resultado |
| --- | --- | --- |
| M1 | la FK de la persona simplificada a `FOREIGN KEY ("user_id") REFERENCES "users"("id")` | 2 rojos |
| M2 | `MATCH FULL` en la FK del grupo | 3 rojos |
| M3 | `ON DELETE RESTRICT` a `CASCADE` en la FK del pedido | 2 rojos |
| M4 | quitarle al CHECK la rama `IS NOT NULL` | 2 rojos |
| M5 | un `CREATE INDEX` colado detras de los `ALTER ... ROW LEVEL SECURITY` | 4 rojos |
| M11 | una descripcion del SQL divergente del catalogo | 2 rojos |
| M12 | el rol del Operador resuelto por uuid literal en vez de por nombre | 2 rojos |
| M13 | quitar el `ON CONFLICT ("code") DO NOTHING` | 2 rojos |
| M14 | `ALTER TABLE "orders" ADD COLUMN "company_id"` (DDL sobre tabla preexistente) | 6 rojos |

**Sobre `db/schema.prisma`**

| # | Mutacion | Resultado |
| --- | --- | --- |
| M6 | `deletedAt` en el modelo y `deleted_at` en la tabla (riesgo 4) | 3 rojos |
| M7 | una `@relation` hacia `Order` | 4 rojos |
| M8 | quitar el `/// @module asignaciones` | 2 rojos |

**Sobre `down.sql`**

| # | Mutacion | Resultado |
| --- | --- | --- |
| M9 | `DELETE FROM "permissions";` sin acotar | 2 rojos |
| M10 | `DROP TABLE "order_assignments" CASCADE;` | 2 rojos |

**Sobre `lib/modules/identity/domain/permissions.ts`** (contra los cinco tests del catalogo)

| # | Mutacion | Resultado |
| --- | --- | --- |
| M15 | quitar `asignaciones.modificar` del catalogo y del seed | 5 archivos rojos, 8 casos |
| M16 | el Operador pierde `asignaciones.consultar` | 2 archivos rojos, 5 casos |
| M17 | el Operador gana `asignaciones.modificar` (R27) | 2 archivos rojos, 5 casos |
| M18 | descripcion vacia en `asignaciones.consultar` | 1 rojo |

**Sobre las restricciones de la base de datos real** (DDL aplicado y revertido; es lo unico que
demuestra que el test de integracion mide la base y no su propio fixture)

| # | Mutacion | Resultado |
| --- | --- | --- |
| D1 | `DROP CONSTRAINT order_assignments_work_group_name_matches_group` | 1 rojo (R7) |
| D2 | la FK del grupo recreada **simple** | 4 rojos (R11, R12) |
| D3 | la FK de la persona recreada **simple** | 4 rojos (R11, R12, R13) |
| D4 | la FK del grupo recreada con `MATCH FULL` | **12 rojos** (mata R13, como predijo el riesgo 2) |

Baseline restaurado y verde tras cada bloque: **30 passed (30)** en integracion y **44 passed
(44)** en el test de esquema.

---

## 4. Que se reviso asercion por asercion en los seis tests ajenos

Se leyo el diff completo de los seis. **Ninguna asercion se debilito.** No hay ni una igualdad
(`toBe`, `toEqual`, `toHaveLength`) convertida en `toContain`, `toBeGreaterThan` o
`expect.arrayContaining`; lo que hay es el numero **subido** y la lista escrita a mano
**ampliada**, que es exactamente lo que el riesgo 6 de `design.md` exige.

| Archivo | Cambio | Veredicto |
| --- | --- | --- |
| `tests/unit/identity/permissions.test.ts` | `CODIGOS_DEL_REQUISITO` mas 2 codigos; `Set.size` 13 a 15; `MODULOS` y `MODULOS_CON_ESCRITURA` mas `asignaciones`; los **tres** casos del Operador pasan de `toEqual(['inventario.consultar'])` a `toEqual(['inventario.consultar','asignaciones.consultar'])` —siguen siendo **igualdades**—; **dos casos nuevos** que aprietan (QC-86 R25 y R27) | correcto, y **aprieta** |
| `tests/guards/guard-permisos-sembrados.test.ts` | `toBe(13)` a `toBe(15)` y el mensaje | correcto |
| `tests/unit/navegacion/qc75-convenciones.test.ts` | `CODIGOS_QC74` mas 2; `MODULOS_DE_NEGOCIO` mas `asignaciones`; `toHaveLength(13)` a 15 | correcto |
| `tests/unit/identity/seed/seed-initial-access.test.ts` | `toBe(14)` a `toBe(17)`, `toHaveLength(13)` a 15, el conjunto del Operador a los dos codigos exactos | correcto |
| `tests/integration/identity/identity-seed.int.test.ts` | total del seed 14 a 17, Operador a los dos codigos exactos (orden alfabetico, que es el del helper), `createdRolePermissions` 1 a 2 | correcto |
| `tests/guards/guard-nav-permisos-declarados.test.ts` (**el sexto, que `tasks.md` no listaba**) | `expect(CODIGOS_VALIDOS).toHaveLength(13)` a 15 | **correcto y es el punto fino de la ficha**: es el ancla anti-vacuidad de esa guardia. Relajarla a `toContain` habria devuelto la guardia al verde por vacuidad que ese mismo caso existe para impedir. Se subio el numero. El `toContain('inventario.consultar')` de la linea siguiente y el **ancla de 7 enlaces de menu** del caso anterior quedan **intactos**, que es lo correcto: R29 dice que ningun enlace consume los dos permisos nuevos |

**Los dos tests de lista blanca de rutas**, tambien revisados linea a linea:

- `tests/unit/recetas-ui/recipe-route-contract.test.ts`: se anade el bloque `MIGRACION_QC86` que
  **nombra** los dos `.sql` de la ficha y `db/schema.prisma`, junto a los de QC-34, QC-47, QC-66 y
  QC-83, con el comentario del porque. El filtro se **encadena**, no se sustituye: **cualquier
  otro archivo de `db/` sigue poniendo el caso rojo**. No es un relajamiento.
- `tests/guards/guard-identificador-de-request.test.ts`:
  `20260911120000_order_assignments` anadida a `MIGRACIONES_ESPERADAS`, que es una lista
  **cerrada** medida contra el arbol real. La comprobacion sobre `db/schema.prisma` —que ningun
  termino del identificador de peticion aparezca en el esquema— queda **intacta**.
- Los otros cuatro candidatos (`recetas/module-contract`, `unidades-convenciones`,
  `consumidores-catalogo`, y el bloque R22 de `qc75-convenciones`) se ejecutaron y pasan **sin
  haber sido tocados**. Correcto: retensar uno que no hacia falta habria sido ruido en el diff.

---

## 5. Hallazgos

### Bloqueantes

**Ninguno.**

### Menores

**menor-1 — `tasks.md` deja tres tasks sin marcar.** T5, T9 y T16 siguen en `[ ]`, y
`CHECKPOINTS.md > Especificacion` pide que **todas** esten en `[x]`. Las tres son cierres de gate
(`./init.sh --rapido` dos veces y `./init.sh` completo) y `AGENTS.md > Regla del gate` las asigna
al leader, no al implementer, asi que el hueco es de reparto de roles y no de trabajo sin hacer.
Lo cierra el leader al pasar el gate completo antes del PR.

**menor-2 — la cabecera del `migration.sql` dice «los CUATRO INSERT de permisos» y el paso 5 tiene
tres sentencias.** Una a `permissions` con dos filas y dos a `role_permissions`. Viene de la
redaccion de `design.md > 5.1` y de `tasks.md > T6`; el implementer ya lo dejo anotado en su
bitacora. **Es solo el comentario**: el test de esquema y el de integracion afirman sobre las
sentencias que hay de verdad (`expect(sentencias).toHaveLength(3)`). No se corrige aqui porque
editar el SQL de una migracion ya aplicada invalida su checksum en `_prisma_migrations`; el sitio
de arreglarlo es la ficha que vuelva a tocar ese archivo, si la hay.

**menor-3 — `db/schema.prisma` en `MIGRACION_QC86` es redundante.** Ya estaba en la lista blanca
desde `MIGRACION_QC34` (linea 647 del mismo archivo), asi que nombrarlo otra vez no cambia el
comportamiento del filtro. No debilita nada —es una lista de exclusion, y excluir dos veces lo
mismo excluye lo mismo—, pero el comentario que lo acompana afirma que «SI entra en la lista, y
por eso se nombra», lo que sugiere que hacia falta. Es un comentario que envejecera mal.

**menor-4 — el checkpoint «cada permiso de la feature se valida en el SERVICE y tiene su test» no
se cumple, por diseno.** `asignaciones.consultar` y `asignaciones.modificar` se declaran y se
siembran, y **nadie los exige** desde ningun punto del codigo. Eso no es una omision: es **R29**
escrito como requisito, la **decision cerrada 2** del humano, y el mismo limite con el que se
cerraron **QC-47** y **QC-83**. El corte de autorizacion es de **QC-87** y **QC-88**, y el test E
lo vigila **en negativo** para que nadie lo adelante por accidente. Se anota para que quede
trazado, no como reproche: la deuda tiene ficha y fecha.

**menor-5 — colision anunciada con QC-94.** `tests/unit/identity/roles/scope.test.ts`, que llega
con QC-94, afirma que `PERMISSIONS` tiene **trece** entradas. Hoy ese archivo no existe en esta
rama y no hay conflicto, pero el dia del `git merge origin/dev` se pondra rojo. **Retensarlo de 13
a 15 es parte de la sincronizacion**, con el mismo criterio de esta ficha: subir el numero, nunca
relajar la asercion. El implementer ya lo dejo anotado; se repite aqui para que el leader lo lleve
al PR.

### Comprobado y descartado como hallazgo

- **`tests/unit/inventario/product-page.test.tsx`** — rojo bajo carga, verde en aislado. Flake
  conocido de jsdom de esta maquina. El archivo **no esta en el diff** y su test deriva el catalogo
  de `PERMISSIONS` sin afirmar ningun conteo. No es de esta ficha.
- **Los 13 E2E rojos** — todos de casos no-Administrador, previos a esta ficha. El implementer lo
  midio borrando de la base la fila `Operador -> asignaciones.consultar` y comprobando que fallan
  identicamente. `git diff --name-only origin/dev...HEAD -- e2e/` devuelve **0 archivos**: ningun
  `test(...)` cambio de guion y no se anadio ninguno (decision cerrada 16, R36). No es deuda de
  QC-86.

---

## 6. Veredicto

**APROBADO.**

Cero bloqueantes. Los 37 requisitos tienen test y los 37 tests afirman lo que dicen afirmar: se
comprobo abriendolos y, donde la garantia es de la base, mutando la base. Las 17 decisiones
cerradas estan implementadas enteras, incluidas las dos que el `design.md > 0` declaro como no
cumplibles tal cual —y las declaro **antes**, en vez de cambiar la decision, que es el
comportamiento correcto—. Ninguna asercion ajena se debilito: los seis tests que afirman numeros
exactos subieron el numero, y el sexto, el que `tasks.md` no habia previsto, es precisamente el
ancla anti-vacuidad que mas facil habria sido relajar. El alcance no se desbordo y no entro
ninguna dependencia.

Los cinco menores no vuelven al implementer: tres son del leader (el gate, el PR y la
sincronizacion con QC-94), uno es un comentario en un archivo que no se puede reeditar sin romper
su checksum, y el quinto es una deuda con ficha propia.

Queda para el leader: `./init.sh` completo antes del PR (regla 5 de `CLAUDE.md`, sin excepcion).
