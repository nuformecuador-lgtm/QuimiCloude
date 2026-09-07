# QC-54 — unificar-constante-rol-administrador · tasks.md

> Orden pensado para que **el gate nunca se quede rojo por medias tintas**: primero nace la pieza
> compartida (T1), luego los cinco módulos delegan (T2-T6), y **solo entonces** se retira el símbolo
> viejo de los barriles (T7). Retirarlo antes deja el `typecheck` rojo durante toda la tanda y
> esconde los fallos reales.
>
> `[P]` = paralelizable con las otras `[P]` del mismo bloque (tocan archivos disjuntos).
> Cierre de cada tanda con `./init.sh --rapido`; `./init.sh` completo en T12.

## Bloque 1 — la pieza compartida

- [x] **T1. `identity` publica la única implementación de la regla.**
  - Archivos: `lib/modules/identity/domain/require-admin.ts` (nuevo),
    `lib/modules/identity/index.ts`.
  - `RoleBearer` + `assertAdminRole(actor, onDenied)` según `design.md > 2.1`. Dominio puro: el
    único import es `./roles`.
  - **Hecho:** `tests/unit/identity/require-admin.test.ts` verde, cubriendo: actor `null`,
    `undefined`, `roleName` `null`, `''`, `'Operador'`, `'Administradores externos'` → lanza **el
    error que devuelve `onDenied`** (se le pasa una clase de prueba propia del test, para probar que
    la fábrica manda); `roleName === ROLE_ADMINISTRADOR` → no lanza; y que `onDenied` **no se
    invoca** en el caso que pasa.
  - Cubre: R6, R7.

## Bloque 2 — los cinco módulos delegan (depende de T1)

> Cada task de este bloque toca **solo** el `domain/actor.ts` de su módulo. Ninguna toca todavía el
> barrel: eso es T7.

- [x] **T2. `inventario` delega.** [P]
  - Archivo: `lib/modules/inventario/domain/actor.ts`.
  - `requireAdmin` pasa a `assertAdminRole(actor, () => new UnauthorizedError())`. Se borra
    `ADMIN_ROLE_NAME` y su JSDoc de deuda; se conserva el JSDoc que explica la igualdad exacta.
  - **Hecho:** `tests/unit/inventario/authorization.test.ts` verde tras cambiar únicamente cómo
    obtiene el nombre del rol. Cubre: R6, R8, R9.

- [x] **T3. `recetas` delega.** [P] — `lib/modules/recetas/domain/actor.ts`.
  **Hecho:** `tests/unit/recetas/authorization.test.ts` verde con el mismo criterio que T2.

- [x] **T4. `unidades` delega.** [P] — `lib/modules/unidades/domain/actor.ts`.
  `unidades` no tiene `authorization.test.ts` propio: sus casos de rechazo viven en
  `tests/unit/unidades/list-units.test.ts` y `unit-actions.test.ts`, y ahí el rol se escribe como
  literal crudo en el fixture, no vía `ADMIN_ROLE_NAME`.
  **Hecho:** esos dos archivos verdes **sin una línea de diff**.

- [x] **T5. `pedidos` delega.** [P] — `lib/modules/pedidos/domain/actor.ts`.
  Ya importa `ROLE_ADMINISTRADOR`; se retira ese import si deja de usarse.
  **Hecho:** `tests/unit/pedidos/authorization.test.ts` verde **sin tocar el archivo** (incluido su
  centinela local, que se conserva). Cubre: R6, R8, R9, R15.

- [ ] **T6. `proveedores` delega.** [P] — `lib/modules/proveedores/domain/actor.ts`.
  **Hecho:** `tests/unit/proveedores/authorization.test.ts` verde **sin tocar el archivo**.

## Bloque 3 — se retira el símbolo viejo (depende de T2, T3, T4)

- [x] **T7. Los tres barriles dejan de exportar `ADMIN_ROLE_NAME`.**
  - Archivos: `lib/modules/inventario/index.ts` (línea 5), `lib/modules/recetas/index.ts` (línea 5),
    `lib/modules/unidades/index.ts` (línea 21).
  - `requireAdmin` y `Actor` siguen exportándose. No se deja re-export ni alias (decisión 1).
  - **Hecho:** `pnpm typecheck` rojo **solo** en los consumidores que T8/T9 migran, y ninguno más;
    los tests de contrato de módulo (`module-contract.test.ts` de cada uno) verdes.
  - Cubre: R2.

- [x] **T8. El cableado de rutas lee el rol de `identity`.** (depende de T7)
  - Archivo: `lib/composition/route-role-rules.ts`.
  - `import { ROLE_ADMINISTRADOR } from '@/lib/modules/identity'`; las tres filas pasan a
    `[ROLE_ADMINISTRADOR]`. Se reescriben la cabecera (líneas 1-28) y el JSDoc de `ROUTE_ROLE_RULES`
    (líneas 34-49): el párrafo del «recorrido» y el que dice que el rol se toma del barrel de
    `inventario` describen un estado que esta ficha deroga.
  - **Hecho:** `tests/unit/identity/route-role-rules.test.ts` verde tras cambiar únicamente cómo
    obtiene el nombre del rol —incluido su caso «las filas se derivan de … y no de literales
    propios»—, y `pnpm vitest run tests/guards/guard-middleware-edge.test.ts` verde, con sus dos
    casos (`findings` vacío y la cadena que sí recorre).
  - Cubre: R3, R13, R14, R17.

- [x] **T9. Migrar los consumidores restantes de `ADMIN_ROLE_NAME`.** (depende de T7) [P con T8]
  - Archivos: `e2e/session.spec.ts` (líneas 49-51 y sus tres usos) y los 15 archivos bajo `tests/`
    que hoy importan el símbolo (`tests/unit/{inventario,recetas,proveedores,identity,recetas-ui}/…`).
  - **Solo cambia cómo obtienen el nombre del rol.** Si alguno necesita otro cambio —una aserción,
    un dato de prueba, una expectativa—, **se para y se reporta**: es señal de que el refactor movió
    comportamiento (decisión 5).
  - **Hecho:** `pnpm typecheck` verde en todo el repo, `e2e/` incluido; `git diff` de `tests/` y
    `e2e/` sin ninguna línea que no sea de import o del identificador del rol.
  - Cubre: R3, R15.

- [x] **T10. Actualizar los comentarios que describen el estado viejo.** [P con T8, T9]
  - Archivos: `lib/modules/identity/index.ts` (líneas 42-45) y
    `lib/modules/identity/domain/route-role-rules.ts` (líneas ~16-22).
  - Los dos afirman que nombrar el rol exige el barrel de `inventario`. Pasan a decir que el rol sale
    de `identity/domain/roles.ts` y que la lista sigue en `lib/composition` **solo** por
    `lib/shared/routes`.
  - **Hecho:** ningún comentario de producción menciona ya `ADMIN_ROLE_NAME`
    (`rg ADMIN_ROLE_NAME lib/ app/ components/ hooks/` sin resultados). Cubre: R17.

## Bloque 4 — la guardia (independiente de los bloques 2 y 3; se cierra al final)

- [ ] **T11. Guardia contra la reincidencia.**
  - Archivo: `tests/guards/guard-rol-administrador-unico.test.ts` (nuevo). Nada más.
  - Patrón, alcance del barrido, orden de `stripComments` y derivación del patrón desde el valor:
    `design.md > 5`. Funciones puras exportadas para poder ejercitarlas con fuentes sintéticos.
  - **Hecho:** verde sobre el repo real **después** del bloque 3; y se demuestra que dispara —los
    cinco casos sintéticos de R12— y que ancla el archivo exento. Comprobación manual del
    implementer, documentada en `progress/impl_QC-54-…`: añadir
    `const X = "Administrador";` a `lib/modules/recetas/domain/actor.ts` la pone **roja**, y quitarlo
    la devuelve a verde.
  - Cubre: R1, R11, R12.

## Bloque 5 — cierre

- [ ] **T12. Gate completo y trazabilidad.** (depende de todo lo anterior)
  - `./init.sh` completo en verde, sin excepción (regla 5 de `CLAUDE.md`).
  - Comprobar a mano lo que ningún test afirma por sí solo:
    - `git diff --stat` **no toca** `db/`, `app/` ni `components/` (R5, y el «Lo que NO entra»).
    - `ROLE_ADMINISTRADOR` sigue valiendo `'Administrador'` y `SEED_ROLES` sigue derivándolo (R4).
    - `tests/unit/inventario/schema/inventario-schema.test.ts` **sin una línea de diff** y verde
      (R16).
    - No se añadió ningún `.spec.ts` a `e2e/` (R15).
  - Escribir el mapa `R<n> -> test` en `progress/impl_QC-54-unificar-constante-rol-administrador.md`
    (`CHECKPOINTS.md > Trazabilidad`).
  - **Hecho:** gate verde + mapa escrito con los 17 requisitos cubiertos.

## Mapa de trazabilidad propuesto

> Lo confirma el implementer en `progress/impl_…`; aquí va la intención, para que ningún requisito
> llegue al final sin test.

| R | Test |
|---|---|
| R1 | `guard-rol-administrador-unico` · «el literal del rol solo se declara en identity/domain/roles.ts» |
| R2 | `tests/unit/{inventario,recetas,unidades}/module-contract.test.ts` + `typecheck` |
| R3 | `guard-rol-administrador-unico` + `tests/unit/identity/route-role-rules.test.ts` |
| R4 | `tests/unit/pedidos/authorization.test.ts` · `expect(ROLE_ADMINISTRADOR).toBe('Administrador')` (ancla que ya existe, no se toca) + el ancla equivalente de la guardia nueva |
| R5 | `tests/unit/identity/seed/seed-initial-access.test.ts` e `tests/integration/identity/identity-seed.int.test.ts`, verdes **sin tocar** + T12 (`git diff --stat` de `db/`) |
| R6 | `tests/unit/identity/require-admin.test.ts` + los cinco `authorization.test.ts` |
| R7 | `tests/unit/identity/require-admin.test.ts` · «lanza el error que devuelve onDenied» |
| R8 | los cinco `authorization.test.ts` · casos rechazados, sin tocar ningún puerto |
| R9 | los cinco `authorization.test.ts` · caso Administrador |
| R10 | los tests de los siete adaptadores driving (`*-actions.test.ts`), verdes sin tocar |
| R11 | `guard-rol-administrador-unico` · caso real del repo |
| R12 | `guard-rol-administrador-unico` · casos sintéticos (tres comillas, comentario, simétrico) |
| R13 | `tests/unit/identity/route-role-rules.test.ts` |
| R14 | `tests/guards/guard-middleware-edge.test.ts` |
| R15 | `git diff` acotado de `tests/`/`e2e/` (T9) + la suite completa en T12 |
| R16 | `tests/unit/inventario/schema/inventario-schema.test.ts`, sin diff y verde |
| R17 | `guard-rol-administrador-unico` (los comentarios se descuentan, así que además se comprueba con `rg ADMIN_ROLE_NAME` en T10) |
