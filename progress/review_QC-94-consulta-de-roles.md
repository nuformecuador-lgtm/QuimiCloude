# QC-94 — consulta-de-roles · review

> Reviewer · 2026-09-11 · Worktree `.worktrees/QC-94-consulta-de-roles`, rama
> `feature/QC-94-consulta-de-roles`, base `13fc41c` (7 commits, 17 rutas en el diff).
> Leido: `specs/QC-94-consulta-de-roles/{requirements,design,tasks}.md`,
> `progress/impl_QC-94-consulta-de-roles.md`, `docs/architecture.md`, `docs/conventions.md`,
> `CHECKPOINTS.md`. El codigo no se toca aqui: esto es un veredicto.

## 1. Checklist

### Especificacion
- [x] `requirements.md` con EARS numerados R1-R21; el bloque de Alcance y la tabla de decisiones
      cerradas del humano estan intactos.
- [x] `design.md` con alternativas descartadas y su porque (seccion 8, cinco de ellas).
- [~] `tasks.md`: T1-T13 marcadas `[x]`. **T14 sigue `[ ]`** y es del leader por diseno
      (`./init.sh` completo + entrada en `progress/history.md`). Ver menor-3.

### Trazabilidad (regla 4 de CLAUDE.md)
- [x] Los 21 requisitos tienen test y cada uno lo verifica de verdad. Comprobado leyendo el codigo
      de cada test, no la bitacora:

| R | Test que lo sostiene | Verificado |
| --- | --- | --- |
| R1 | `roles/list-roles-authorization.test.ts` — doble del puerto que **lanza si lo llaman** mas `not.toHaveBeenCalled()` en los seis rechazos | si |
| R2 | idem (actor null/undefined, sin conjunto, conjunto vacio, conjunto que no es lista, permiso ajeno) y `require-any-permission.test.ts` con 14 rechazados: caja, prefijo, sufijo, espacios, codigo contenedor | si |
| R3 | `list-roles-authorization.test.ts` (solo consultar, solo modificar, los dos) y `require-any-permission.test.ts` | si |
| R4 | `roles/scope.test.ts` (ningun archivo nuevo escribe el literal de un nombre de rol, patrones construidos desde las constantes y ancla positiva en `domain/roles.ts`) y `role-actions.test.ts` (ni `username` ni `roleName` viajan al caso de uso, con `toStrictEqual`) | si |
| R5 | `roles/list-roles.test.ts` — aridad 1 y resolucion con el actor por parametro | si |
| R6 | `roles/role-actions.test.ts` — las dos caras una vez por invocacion; faltando cada una por separado el actor es null, sale `unauthorized` y el puerto REAL no se toca | si |
| R7 | `scope.test.ts` (contenido: ninguna grafia de RLS en los cinco archivos nuevos, con ancla positiva en una migracion que si la declara; rama: ninguna carpeta de `db/migrations/`) y guardia `guard-rls-force.test.ts` | si |
| R8 | `list-roles.test.ts` (no recorta, no reordena, no pagina; catalogo vacio es lista vacia) y `role-catalog.int.test.ts` (`count(*)` contra la tabla real) | si |
| R9 | `list-roles.test.ts` y `role-catalog.int.test.ts` con `Object.keys(rol).sort()` igual a `['id','name']`: claves exactas, no un «falta description» | si |
| R10 | `role-catalog.int.test.ts`, tres casos | si, con reserva (menor-1) |
| R11 | `list-roles.test.ts` — dos actores de empresas distintas reciben el mismo conjunto; el puerto se llama con cero argumentos; el puerto no tiene donde recibir la empresa | si |
| R12 | `list-roles.test.ts` y `scope.test.ts` (ListQuery, sanitizeListQuery, ROLE_QUERYABLE, ListQueryable y `\bPage\b`, con ancla positiva en `list-users.ts`) | si |
| R13 | `role-actions.test.ts` — `toHaveLength(0)` sobre la action, invocacion sin argumentos, un unico argumento al caso de uso | si |
| R14 | `role-actions.test.ts` — `unauthorized` con el MENSAJE MUTADO (decide el code, no la frase) y error ajeno a `unexpected` sin filtrar el texto, con `console.error({ code, cause })` | si |
| R15 | `scope.test.ts` — el contrato no nombra `role-actions`, `adapters/` ni `ports/`, con ancla positiva; y guardia `guard-arquitectura-modulos.test.ts` | si |
| R16 | `guard-arquitectura-modulos.test.ts` y `unit/composition/identity-facade.test.ts` (`identity.listRoles` cableado) | si |
| R17 | `scope.test.ts` — dos detectores (cliente Prisma y SQL crudo) probados en positivo y en negativo; el puerto no declara ninguna escritura | si |
| R18 | `scope.test.ts` — detector de rama sobre `app/`, `components/`, `e2e/` y navegacion colada en `lib/` | si |
| R19 | `scope.test.ts` — `db/schema.prisma` fuera del diff y ninguna carpeta de `db/migrations/` | si |
| R20 | `scope.test.ts` — `package.json` y `pnpm-lock.yaml` fuera del diff, y guardia `guard-dependencias-aprobadas.test.ts` | si |
| R21 | `scope.test.ts` — `PERMISSIONS.length` igual a 13, los dos codigos presentes y ninguno `roles.*` | si |

- [x] Los cuatro casos de familia B (los que leen el diff de rama) **corren de verdad, no se saltan**:
      `vitest run tests/unit/identity/roles` da 4 archivos, **43 tests, 0 saltados**.

### Verificacion ejecutable (corrida por mi en el worktree, no heredada de la bitacora)
- [x] `pnpm run typecheck` — sin salida, exit 0.
- [x] `pnpm run lint` — sin salida, exit 0.
- [x] `pnpm exec vitest run tests/unit/identity tests/unit/composition` — 54 archivos, **919 pasados**, 12 saltados.
- [x] `pnpm exec vitest run tests/guards` — 23 archivos, **230 pasados**.
- [x] `pnpm exec vitest run tests/integration/identity` (con `.env` cargado) — 8 archivos, **171 pasados**.
- [ ] `./init.sh` completo: **no corrido**. Es T14 y es del leader, y hoy no puede cerrarse porque la
      base local va por detras de migraciones ya mergeadas (los ~61 rojos de proveedores, unidades,
      recetas e inventario por `The column 'existe' does not exist`). **Ningun rojo de identity,
      composition ni guards**: todo lo que esta feature toca esta verde. La deriva es ajena y no se le
      imputa a QC-94.

### Calidad y seguridad
- [x] **Autorizacion en el service, como primera linea.** `domain/list-roles.ts` son dos sentencias:
      `requireAnyPermission(actor, ['usuarios.consultar','usuarios.modificar'])` y despues el puerto.
      El adaptador driving no repite la comprobacion ni decide nada.
- [x] **Falla cerrado** con actor ausente (null y undefined), sin conjunto de permisos, conjunto vacio,
      conjunto que no es lista y permiso ajeno; pertenencia exacta, sin normalizacion ni parcial.
- [x] **Decide por permiso y nunca por rol** (CHECKPOINTS > Permisos): el `Actor` no tiene campo de rol,
      la action no cuela `roleName` (igualdad estricta) y ningun archivo nuevo incrusta el literal.
- [x] **Salida: solo `id` y `name`, ordenados por nombre.** `select` enumerado en el adaptador,
      `RoleOption = { readonly id; readonly name }`, claves exactas afirmadas en unitario y en
      integracion. Sin `description`, sin permisos del rol, sin marcas de tiempo. **Sin acotacion por
      empresa**: `listAll()` no tiene parametro donde colarla y no hay `where`.
- [x] **Ninguna migracion, cero diff en `db/schema.prisma`, ninguna dependencia y ningun permiso nuevo.**
      Verificado contra el diff real: las 17 rutas tocadas son `lib/**`, `tests/**` y `progress/impl_*`.
      `PERMISSIONS` sigue en **trece**.
- [x] **La Server Action no se reexporta desde `lib/modules/identity/index.ts`**: el bloque nuevo del
      contrato solo trae `requireAnyPermission`, `RoleOption`, `createListRoles` y `ListRolesDeps`,
      todos de `./domain`. La guardia de arquitectura sigue verde.
- [x] Sin secretos, sin `console.*` en produccion, sin `process.env`, sin `revalidatePath` y sin ningun
      `catch` que descarte un error.
- [x] Capas separadas: dominio y puerto sin framework, Prisma, `shared` ni `composition`; unico cableado
      en `lib/composition/index.ts`; el driving no instancia su driven.

### Aislamiento por empresa (architecture > Dominio n.1)
- [x] **Ningun modelo nuevo** en `db/schema.prisma` (cero diff). `roles` es una de las tres tablas del
      sistema exentas, y que el catalogo sea GLOBAL es **decision cerrada 1 del humano**, no un olvido:
      la tabla no tiene columna de empresa. El test de «dos empresas, mismo conjunto» afirma justo lo
      que pide R11, que aqui es lo contrario del rechazo cruzado.

### Multiplataforma y dependencias
- [x] Multiplataforma no aplica: la feature no toca `app/`, `components/` ni `e2e/`, verificado contra
      el diff y no de palabra.
- [x] `package.json` fuera del diff: ninguna fila que anadir a `docs/dependencias.md`. Ninguna utilidad
      escrita a mano que ya resuelva el stack: el orden lo hace Postgres, no un colador casero.

## 2. Los dos puntos que se pidieron mirar con lupa

### A. El cuerpo de `assertPermission` movido a `holdsPermission` — correcto, sin cambio de comportamiento

El antes era `if (!actor || !Array.isArray(actor.permissions) || !actor.permissions.includes(p)) throw`.
El ahora es `if (!holdsPermission(actor, p)) throw`, con
`holdsPermission = Boolean(actor) && Array.isArray(actor!.permissions) && actor!.permissions.includes(p)`.
Es la negacion de De Morgan del original, termino por termino y en el mismo orden de cortocircuito:
mismo trato de null y undefined, mismo rechazo del `permissions` que no es array, misma pertenencia
exacta por `includes`. `Boolean(actor)` no introduce ningun caso nuevo, porque el parametro esta tipado
`PermissionBearer | null | undefined` y no hay `0` ni cadena vacia posibles.

Consumidores revisados uno a uno, **ninguno tocado y ninguno afectado**: `identity/domain/actor.ts`
(`requirePermission`), `identity/adapters/driving/require-page-permission.ts` (con
`onDenied: () => notFound()`) y los `domain/actor.ts` de inventario, pedidos, proveedores, recetas y
unidades, que importan `assertPermission` por el contrato. Firma publica y export del barrel intactos.

Sus tests siguen cubriendolo: **`tests/unit/identity/require-permission.test.ts` tiene cero diff en la
rama** y pasa en mi corrida. Ademas `assertAnyPermission` **no** se exporta desde el barrel —solo
`requireAnyPermission`—, asi que la regla de QC-74 R12 (una sola implementacion de la pertenencia) se
conserva sin ensanchar la superficie del contrato. La tupla no vacia esta bien elegida y verificada con
`@ts-expect-error`.

### B. La unica desviacion declarada de design.md (seccion 9.2, el orden del test de integracion) — aceptada

El implementer cambio la comparacion contra `[...names].sort()` por preguntarle el orden a la propia
base con `SELECT name FROM roles ORDER BY name ASC`. **Acierta**: `Array.prototype.sort()` compara por
unidades de codigo UTF-16 y la collation de Postgres no, que es exactamente el desacuerdo con el que
`design.md > 8.2` descarta `localeCompare` en el dominio; con los roles efimeros en minusculas de
`e2e/login.spec.ts`, el `sort()` habria podido pintar rojo sin defecto — el riesgo que el propio 9.2
avisaba. Esta declarada en la bitacora (seccion 5), no afloja ningun requisito y es un endurecimiento
frente a la fragilidad. Lo unico que hay que decir al respecto, y no es culpa del cambio, es menor-1.

## 3. Hallazgos

### menor-1 — R10 esta verificado, pero hoy su test no discrimina la mutacion «quitar el orderBy»

Los tres casos de `role-catalog.int.test.ts` comparan la secuencia del adaptador contra un
`ORDER BY name ASC` de la misma base, y afirman determinismo y que `Administrador` va antes que
`Operador`. Con el contenido actual de la tabla eso no muerde: lo comprobe con una sonda temporal
contra la base local (borrada despues), y el orden fisico coincide con el ordenado —
`SIN ORDER BY: [Administrador, Operador]` / `CON ORDER BY: [Administrador, Operador]` —, de modo que
**borrar `orderBy: { name: 'asc' }` del adaptador dejaria los tres casos en verde**.

La debilidad la tenia **igual** la redaccion original del design (comparar contra `[...names].sort()`
tambien pasa si las filas llegan ya ordenadas por casualidad), asi que **no es una regresion de la
desviacion** y no se cuenta como bloqueante: la propiedad esta afirmada, el oraculo es honesto y con
datos reales discriminaria. Sugerencia barata para cuando toque, sin Postgres: un unitario del adaptador
con un doble de `prisma.role` que afirme los argumentos exactos
(`{ select: { id: true, name: true }, orderBy: { name: 'asc' } }`). No se pide arreglarlo aqui.

### menor-2 — `specs/QC-94-consulta-de-roles/` no esta commiteada en la rama

Los tres archivos del spec estan en disco pero **sin trackear** (`?? specs/QC-94-consulta-de-roles/`):
ninguno de los siete commits los incluye. Hoy los detectores de rama de `scope.test.ts` funcionan porque
leen tambien `git status --porcelain`, pero el spec tiene que viajar con la feature al PR —es la mitad
del arnes (reglas 2 y 3 de CLAUDE.md) y `CHECKPOINTS.md > Especificacion` los da por existentes en la
rama—. **Commitear antes del PR.** No es codigo y no cambia el veredicto tecnico.

### menor-3 — T14 abierta y gate completo pendiente

`tasks.md > T14` sigue `[ ]`, es del leader y la bitacora lo dice. `./init.sh` completo no puede
cerrarse hoy con la base local por detras de migraciones ya mergeadas. Todo lo que QC-94 toca esta verde
en mi corrida; el cierre de T14 queda condicionado a poner la base al dia, que ya esta en curso.

### menor-4 — anotado, no accionable aqui

`currentActor()` va por su **segunda** copia (`user-actions.ts` y `role-actions.ts`), deliberada y
argumentada en `design.md > 8.3`, con compromiso explicito de extraerla a la tercera. Se acepta: la
alternativa hoy es una frontera cliente/servidor mas por ocho lineas sin decision de negocio.

### Sobre el E2E (no es hallazgo)

`CHECKPOINTS.md > Calidad de codigo` pide E2E cuando la feature toca permisos. Aqui no hay pantalla que
Playwright pueda abrir y el diferimiento a QC-67 esta **declarado por el humano** (decision cerrada 7),
repetido en R18 y en `design.md > 9`, con precedente QC-43 -> QC-44 y QC-66 -> QC-67, y verificado por
`scope.test.ts` (la rama no anade nada bajo `app/`, `components/` ni `e2e/`). Excepcion legitima y
documentada: **no bloquea**.

## 4. Veredicto

**APROBADO** — **0 bloqueantes, 4 menores**. Ninguno afecta a codigo de produccion: menor-2 es una
accion mecanica antes del PR y menor-3 es del leader.

La feature hace exactamente lo que su spec manda y nada mas: autoriza por permiso en la primera linea
del service fallando cerrado, devuelve `id` y `name` ordenados por la base, no se acota por empresa, no
migra, no instala y no toca el catalogo de permisos. Las 21 trazas existen y muerden.
