# QC-38 — crud-de-unidades · tasks.md

> Requisitos en `requirements.md` (R1–R36), diseño en `design.md`. `[P]` = paralelizable con la
> tarea indicada. Cada tarea dice **qué archivos toca** y **cuándo está hecha**. Nada se marca sin
> que su criterio se cumpla; el cierre de tanda es `./init.sh --rapido` y el cierre de feature
> `./init.sh` completo (regla 5 de `CLAUDE.md`).
>
> **Sin preguntas abiertas.** Las dos que `spec_author` levantó las **cerró el humano el
> 2026-09-08** y son las decisiones **23** y **24** de `requirements.md`: se crea
> `unidades.modificar` —el catálogo pasa a once, enmendando **QC-74 R2**— y el **símbolo vacío o en
> blanco se rechaza**. Las dos entran aquí como trabajo firme, no como posición por defecto.
>
> **Esta ficha no trae migración** (R32). Si alguna tarea acaba proponiendo una, es señal de que se
> salió del alcance: parar y preguntar.

## Fase A — El permiso

> **T1 ya no existe**: era «confirmar P1 con el humano», y el humano la cerró el 2026-09-08. La
> numeración del resto **no se toca** para no invalidar las dependencias ya escritas.

- [ ] **T2. El catálogo de permisos gana `unidades.modificar`.**
  - Toca: `lib/modules/identity/domain/permissions.ts`.
  - Una entrada nueva en `PERMISSIONS` con `code`, `module`, `action` y `description`
    (`design.md > 2`), y `'unidades.modificar'` en `SEED_ROLE_PERMISSIONS[ROLE_ADMINISTRADOR]`
    **junto a `'unidades.consultar'`, que ya está**: QC-74 decidió que `modificar` **no implica**
    `consultar` y que el seed los escribe **los dos, uno a uno**, así que aquí se **suma**, no se
    sustituye. **Nada** para `ROLE_OPERADOR`. El comentario de cabecera que dice «diez permisos» y el
    que nombra a `unidades` como módulo sin escritura se actualizan: si no, mienten. El comentario
    nuevo DEBE dejar escrito que **esto enmienda QC-74 R2** y por qué (decisión cerrada 23).
  - **Hecho cuando**: `pnpm typecheck` en verde, `PermissionCode` incluye el código nuevo y
    `PERMISSIONS.length === 11`. Cubre: R2, R4, R5.

- [ ] **T3. Actualizar los seis tests ajenos que cuentan diez permisos.** (depende de T2)
  - Toca: `tests/guards/guard-permisos-sembrados.test.ts`,
    `tests/guards/guard-nav-permisos-declarados.test.ts`,
    `tests/unit/navegacion/qc75-convenciones.test.ts`, `tests/unit/identity/permissions.test.ts`,
    `tests/unit/identity/seed/seed-initial-access.test.ts`,
    `tests/integration/identity/identity-seed.int.test.ts`.
  - Se ajusta **el conteo y el texto de los casos**, no la intención: donde decía «los diez
    permisos» pasa a once, y se añade el caso de que el `Operador` **sigue** teniendo exactamente
    `inventario.consultar`. Es la lección de QC-76: los tests ajenos se arreglan **en la misma
    tanda**, no al final.
  - **Hecho cuando**: los seis en verde y `./init.sh --rapido` también. Cubre: R4, R5.

## Fase B — Dominio

- [ ] **T4. Errores nuevos.** (depende de T2) [P con T5]
  - Toca: `lib/modules/unidades/domain/errors.ts`.
  - Las seis clases de `design.md > 4`, todas extendiendo `UnidadesError` con su `code` estable:
    `NotFoundError`, `SystemUnitError`, `DuplicateNameError`, `DuplicateSymbolError`,
    `InvalidDerivationError`, `UnitInUseError`. Se **reexportan** desde `index.ts` junto a las que
    ya están.
  - **Hecho cuando**: `pnpm typecheck` en verde y un test comprueba que los seis códigos son
    distintos entre sí y de los tres existentes. Cubre: R30.

- [ ] **T5. Esquemas zod de alta y edición.** (depende de T2) [P con T4]
  - Toca: `lib/modules/unidades/domain/unit-input.ts` (nuevo).
  - Un **único** esquema para los dos casos de uso (R18): nombre con `trim`, 1..60 y rechazo si
    `normalizeUnitName(name) === ''`; símbolo **opcional**, ≤ 10, y **rechazado si viene vacío o
    solo con espacios** (R36, decisión cerrada 24) —**no** se recorta a `null`: mandar símbolo
    obliga a que tenga contenido, y **no** mandarlo sigue siendo legal—; `baseUnitId`/`factor` con
    `superRefine` de «los dos o ninguno»; factor como **cadena** contra `^\d{1,10}(\.\d{1,4})?$` y
    `> 0` (`design.md > 3.1`). **Sin `.partial()`**: no existe la edición parcial.
  - **Hecho cuando**: `tests/unit/unidades/unit-input.test.ts` cubre la tabla de casos de R8, R9,
    R10, R13, R14 y R36, incluidos `'---'`, `'  kilo  '`, `0.5`, `0`, `-1`, `1.00001`, y —para el
    símbolo— `undefined` (acepta), `''` y `'   '` (rechazan, y **no** producen `null`).
    Cubre: R8, R9, R10, R13, R14, R17, R28, R36.

- [ ] **T6. Puerto de escritura.** (depende de T4)
  - Toca: `lib/modules/unidades/ports/unit-write-repository.ts` (nuevo).
  - Los cinco métodos y los tres tipos de `design.md > 5`, con `companyId` como **argumento propio**
    de `create` y **fuera** de `UnitWriteRow`. `ports/unit-repository.ts` **no se toca**.
  - **Hecho cuando**: `pnpm typecheck` en verde y un `UnitWriteRow` con `companyId` **no compila**.
    Cubre: R7, R19.

- [ ] **T7. Los tres casos de uso.** (depende de T5, T6)
  - Toca: `lib/modules/unidades/domain/create-unit.ts`, `update-unit.ts`, `delete-unit.ts` (nuevos);
    `lib/modules/unidades/index.ts` (reexporta las tres fábricas y sus tipos de deps, **nunca** una
    action).
  - El orden de `design.md > 6` es el requisito: `requirePermission('unidades.modificar')` **primera
    línea** → zod → `findOwnership` (sistema / otra empresa / no existe) → equivalencia (§6.4) →
    puerto. `deleteUnit` sin zod y **sin ninguna consulta de uso previa** (R24).
  - **Hecho cuando**: `tests/unit/unidades/create-unit.test.ts`, `update-unit.test.ts`,
    `delete-unit.test.ts` y `unit-write-permissions.test.ts` en verde, con dobles del puerto que
    **registran si fueron llamados**: los casos de rechazo prueban que el puerto de escritura **no**
    se tocó. Cubre: R1, R3, R6, R7, R8–R19, R21, R22, R25, R26, R28, R36.

## Fase C — Persistencia y superficie

- [ ] **T8. Adaptador Prisma de escritura.** (depende de T6)
  - Toca: `lib/modules/unidades/adapters/driven/persistence/unit-write-prisma.ts` (nuevo).
  - `updateMany`/`deleteMany` para distinguir «no existe» sin depender de `P2025`; el mapeo de
    `meta.target` de `design.md > 7.1`, con **relanzado** del índice desconocido; `P2003` →
    `'in_use'`. `unit-prisma.ts` y `unit-catalog-prisma.ts` **no se tocan** (R33, QC-76 R36).
  - **Hecho cuando**: `pnpm typecheck` y `pnpm lint` en verde y el archivo es el único del módulo,
    junto a los dos existentes, que importa `@prisma/client`. Cubre: R11, R12, R23, R24.

- [ ] **T9. Server Actions y cableado.** (depende de T7, T8)
  - Toca: `lib/modules/unidades/adapters/driving/unit-actions.ts` (se **añaden** tres funciones y
    dos tipos de estado; `listUnitsAction`, `currentActor` y `toErrorState` no se reescriben),
    `lib/composition/index.ts` (bloque `unidades`, ampliado sin reordenar lo de arriba).
  - Las actions leen `FormData` distinguiendo **clave ausente** de **clave vacía** con
    `formData.has(...)` (`design.md > 8`): sin esa distinción, un símbolo que el formulario no manda
    y uno que manda vacío llegarían igual y R36 se comería a R10.
  - **Hecho cuando**: `tests/unit/unidades/unit-actions.test.ts` cubre sesión ausente, contexto
    ausente, traducción de cada error de dominio a su `code`, el relanzado de un error que no es de
    dominio, y el caso `FormData` **sin** clave `symbol` (pasa) frente a **con** `symbol` vacío
    (`invalid_input`); y `tests/unit/unidades/module-contract.test.ts` sigue verificando que
    `index.ts` no exporta ninguna action. Cubre: R27, R29, R30, R31, R36.

- [ ] **T10. Guardias de convenciones y de límites de alcance.** (depende de T9) [P con T11]
  - Toca: `tests/unit/unidades/unidades-convenciones.test.ts` (nuevo),
    `tests/unit/unidades/module-contract.test.ts`.
  - Comprueba: ninguna comparación por nombre de rol en `lib/modules/unidades/**` (R2); ningún
    `route.ts` nuevo (R27); el cierre de imports de `index.ts` sin `'use server'` (R31); `units` sin
    `deleted_at` y `db/schema.prisma` sin cambios (R23, R32); `package.json` sin dependencias nuevas
    (R35); ninguna ruta, pantalla ni item de menú de unidades (R34).
  - **Hecho cuando**: en verde, y falla si se añade a mano cualquiera de esas cosas.
    Cubre: R2, R23, R27, R31, R32, R34, R35.

- [ ] **T11. Tests de integración de escritura.** (depende de T8) [P con T10]
  - Toca: `tests/integration/unidades/unit-write.int.test.ts` (nuevo).
  - Contra base real: alta con y sin símbolo y con y sin derivación; nombre normalizado repetido
    **en la misma empresa** → `DuplicateNameError`, y **aceptado** en otra empresa y frente a una de
    sistema (R11); símbolo repetido → `DuplicateSymbolError`, y dos sin símbolo conviven (R12);
    edición que borra símbolo y derivación (R17); edición que **no** cambia `company_id` (R19);
    cambiar base y factor de una unidad referenciada por un producto y por una línea de receta, y
    comprobar que esas filas siguen intactas (R20); borrado que deja cero filas (R23); borrado
    bloqueado por producto, por línea de receta y por unidad derivada → `UnitInUseError` con las
    filas intactas (R24); `0.5` se guarda como `0.5000` (R14).
  - **Hecho cuando**: en verde y **`pnpm vitest run tests/integration` ENTERO en verde**, no sólo
    `tests/integration/unidades` (no hay script `test:integration` en `package.json`). Esto es
    explícito por el bloqueante de QC-76 —una restricción
    nueva sobre `units` dejó once archivos de test ajenos en rojo hasta el final—; esta ficha **no**
    añade ninguna restricción (R32, `design.md > 3`), y esta tarea es lo que lo demuestra en vez de
    afirmarlo. Cubre: R6, R7, R11, R12, R14, R16, R17, R19, R20, R23, R24.

## Fase D — Cierre

- [ ] **T12. Trazabilidad y gate completo.** (depende de T3, T10, T11)
  - Toca: `progress/impl_QC-38-crud-de-unidades.md`.
  - El mapa `R<n> → test` real —el archivo y el nombre del caso, no la intención—, contrastado
    contra `design.md > 12`. Los **36** requisitos, sin hueco (regla 4 de `CLAUDE.md`,
    `CHECKPOINTS.md > Trazabilidad`).
  - **Hecho cuando**: `./init.sh` completo en verde antes del PR, y ningún `R<n>` sin test.
    Cubre: la trazabilidad de R1–R36.

- [ ] **T13. E2E: diferido, y escrito.** (depende de T12)
  - Toca: `progress/impl_QC-38-crud-de-unidades.md` (sección de verificación).
  - **No se escribe ningún `.spec.ts`.** Se deja anotado el motivo —esta ficha no tiene pantalla ni
    flujo navegable que visitar; lo decide **QC-39**— tal y como lo fija la decisión cerrada 21.
  - **Hecho cuando**: `e2e/` no ha ganado ningún archivo y el motivo está escrito. Cubre: R34.
