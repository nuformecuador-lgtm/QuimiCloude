# QC-87 — asignar-responsables-a-un-pedido · bitácora de implementación

> Mitad **BACKEND** de la ficha partida en F1.0. La mitad de pantalla es **QC-102**.
> Spec aprobado por el humano el 2026-09-12. Rama
> `feature/QC-87-asignar-responsables-a-un-pedido`, worktree propio.
> Las quince tareas de `tasks.md` están cerradas.

## 1. Lo que se construyó

Cuatro casos de uso (`assignResponsibles`, `unassignResponsible`,
`removeWorkGroupFromOrder`, `listOrderResponsibles`), el puerto propio y su adaptador
Prisma, **tres contratos nuevos** para que `asignaciones` sepa del pedido, la persona y el
grupo sin saltarse la frontera de módulos, el cableado y las tres Server Actions.

**Sin migración, sin permiso nuevo, sin pantalla y sin dependencias** (R48–R51).

## 2. Archivos tocados

### Producción — nuevos
```
lib/modules/asignaciones/domain/{actor,errors,assignment-input,assignment-view,order-state}.ts
lib/modules/asignaciones/domain/{assign-responsibles,unassign-responsible}.ts
lib/modules/asignaciones/domain/{remove-work-group-from-order,list-order-responsibles}.ts
lib/modules/asignaciones/ports/order-assignment-repository.ts
lib/modules/asignaciones/adapters/driven/persistence/order-assignment-prisma.ts
lib/modules/asignaciones/adapters/driving/order-assignment-actions.ts
lib/modules/pedidos/domain/order-catalog.ts
lib/modules/pedidos/adapters/driven/persistence/order-catalog-prisma.ts
lib/modules/identity/domain/{people-directory,work-group-directory}.ts
lib/modules/identity/adapters/driven/persistence/assignment-directory-prisma.ts
```

### Producción — modificados
```
lib/modules/asignaciones/index.ts          (de 2 tipos a las 4 factories + errores + esquemas)
lib/modules/errores/domain/{error-codes,error-catalog}.ts   (4 códigos, quinta enmienda)
lib/modules/identity/index.ts              (4 líneas)
lib/modules/pedidos/index.ts               (2 líneas)
lib/composition/index.ts                   (los 3 adaptadores driven + las 4 operaciones)
```

### Tests — nuevos
```
tests/unit/asignaciones/{assign-responsibles,unassign-responsible}.test.ts
tests/unit/asignaciones/{remove-work-group-from-order,list-order-responsibles}.test.ts
tests/unit/asignaciones/{authorization,order-state,assignment-input}.test.ts
tests/unit/asignaciones/{order-assignment-repository,order-assignment-actions}.test.ts
tests/unit/pedidos/order-catalog.test.ts
tests/integration/asignaciones/{company-scope,reapply-work-group,active-members-only}.int.test.ts
tests/integration/asignaciones/{atomicity,frozen-name,unassign}.int.test.ts
tests/integration/asignaciones/{remove-work-group,list-order-responsibles}.int.test.ts
tests/integration/asignaciones/order-assignment-prisma.int.test.ts
tests/integration/asignaciones/{use-case-fixture,prisma-tx-holder}.ts   (apoyo, no suites)
tests/integration/identity/assignment-directory.int.test.ts
```

### Tests — modificados
```
tests/guards/guard-autorizacion-por-permiso.test.ts   (`asignaciones` es el SEXTO módulo, T13)
tests/unit/asignaciones/module-contract.test.ts       (enmienda del centinela (e) de QC-86)
tests/integration/aislamiento.json                    (8 entradas nuevas en `transaccion`)
tests/unit/{errores/catalogo,identity/account-status-scope,pedidos/module-contract}.test.ts
tests/integration/identity/identity-constraints.int.test.ts
```

## 3. Mapa `R<n> -> test` — los 51, ninguno sin test

Abreviaturas: `U/` = `tests/unit/asignaciones/`, `I/` = `tests/integration/asignaciones/`,
`G/` = `tests/guards/`.

| R | Qué exige | Test |
| --- | --- | --- |
| R1 | `asignaciones.modificar` en la primera línea de las tres escrituras | `U/authorization.test.ts` |
| R2 | Actor ausente / sin permisos / vacío / sin el código → rechazo, fallo cerrado | `U/authorization.test.ts` · `U/order-assignment-actions.test.ts` (las dos caras de la sesión) |
| R3 | La consulta exige `pedidos.consultar`, no `asignaciones.*` | `U/list-order-responsibles.test.ts` · `I/list-order-responsibles.int.test.ts` |
| R4 | El actor entra **por parámetro**; el dominio no lee sesión | `U/authorization.test.ts` (firma) · `U/order-assignment-actions.test.ts` (la sesión se resuelve en el driving) |
| R5 | La empresa de cada fila sale **del actor**, nunca de la entrada | `I/company-scope.int.test.ts` · `U/order-assignment-actions.test.ts` (un `companyId` colado en el `FormData` no llega) |
| R6 | Persona o grupo inexistente / de baja / de otra empresa → mismo rechazo | `I/company-scope.int.test.ts` |
| R7 | La consulta solo devuelve asignaciones de la empresa del actor | `I/company-scope.int.test.ts` |
| R8 | Pedido inexistente o de baja → `order_not_found` | `U/order-state.test.ts` · `U/list-order-responsibles.test.ts` |
| R9 | `PENDIENTE` y `EN_CURSO` admiten las tres escrituras | `U/order-state.test.ts` (tabla de `design.md > 4`, celda a celda) |
| R10 | `ENTREGADO` las rechaza con `order_delivered_frozen` | `U/order-state.test.ts` |
| R11 | `CANCELADO` las rechaza con `order_cancelled_not_assignable` | `U/order-state.test.ts` · `U/unassign-responsible.test.ts` |
| R12 | El estado se decide **sobre la lectura**, no en el `WHERE` | `U/order-state.test.ts` — «no existe» y «entregado» dan errores **distintos** |
| R13 | La consulta devuelve lo mismo en los cuatro estados | `U/list-order-responsibles.test.ts` · `I/list-order-responsibles.int.test.ts` |
| R14 | Asignar personas sueltas crea su fila con origen directo | `U/assign-responsibles.test.ts` |
| R15 | Quien ya está asignado no se duplica ni se altera | `I/reapply-work-group.int.test.ts` · `I/order-assignment-prisma.int.test.ts` |
| R16 | Devuelve **cuántas** se añadieron | `U/assign-responsibles.test.ts` · `I/reapply-work-group.int.test.ts` (added = 2, no 3) |
| R17 | Persona inexistente / de baja / de otra empresa → rechazo entero | `U/assign-responsibles.test.ts` |
| R18 | Persona con estado efectivo ≠ `active` → `user_not_assignable`, **ninguna fila** | `U/assign-responsibles.test.ts` · `I/atomicity.int.test.ts` |
| R19 | Aplicar un grupo crea fila por miembro `active`, con nombre congelado | `I/active-members-only.int.test.ts` |
| R20 | No crea fila para los miembros no `active` | `I/active-members-only.int.test.ts` |
| R21 | «Activo» se decide con `effectiveAccountStatus`, la **misma** definición | `I/active-members-only.int.test.ts` — la bloqueada **por plazo vencido** entra al reaplicar moviendo solo el reloj, **sin escribir nada** · `tests/integration/identity/assignment-directory.int.test.ts` |
| R22 | Reaplicar un grupo crea solo las que faltan y **no toca ni una fila vieja** | `I/reapply-work-group.int.test.ts` (compara la foto entera: origen, `workGroupId`, nombre, `createdAt`) · `U/assign-responsibles.test.ts` |
| R23 | Desasignada a mano y aún miembro → al reaplicar vuelve | `I/reapply-work-group.int.test.ts` · `U/assign-responsibles.test.ts` |
| R24 | Deduplicación determinista: gana la **primera** aparición | `U/assign-responsibles.test.ts` · `I/reapply-work-group.int.test.ts` |
| R25 | Grupo inexistente / de baja / ajeno → `work_group_not_found` | `I/active-members-only.int.test.ts` · `I/company-scope.int.test.ts` |
| R26 | Grupo vivo sin ningún miembro `active` → no falla, no crea nada | `I/active-members-only.int.test.ts` |
| R27 | Todas las filas de una operación, en **una sola transacción** | `I/atomicity.int.test.ts` · `U/assign-responsibles.test.ts` (una sola escritura, cero borrados) |
| R28 | El nombre del grupo se congela en la misma escritura | `I/frozen-name.int.test.ts` — renombrar **y dar de baja** el grupo después no cambia ninguna fila |
| R29 | Desasignar borra **una** fila, físicamente | `I/unassign.int.test.ts` · `U/unassign-responsible.test.ts` |
| R30 | Desasignar a quien no es responsable → `order_assignment_not_found` | `I/unassign.int.test.ts` · `U/unassign-responsible.test.ts` |
| R31 | Desasignar opera sobre **exactamente una** persona | `U/unassign-responsible.test.ts` (lista → `invalid_input`; el puerto no tiene `deleteByOrder`) · `I/unassign.int.test.ts` |
| R32 | Quitar un grupo borra **solo** las filas con ese origen congelado | `I/remove-work-group.int.test.ts` — funciona con el grupo **renombrado y dado de baja después** |
| R33 | Grupo sin filas en el pedido → termina bien, cero eliminadas | `I/remove-work-group.int.test.ts` · `U/remove-work-group-from-order.test.ts` |
| R34 | Devuelve **cuántas** filas eliminó | `I/remove-work-group.int.test.ts` · `U/remove-work-group-from-order.test.ts` (el número sale del puerto, no de un conteo a mano) |
| R35 | Una entrada por responsable: id, nombre mostrable y origen | `U/list-order-responsibles.test.ts` · `I/list-order-responsibles.int.test.ts` |
| R36 | La lista **no** se deriva de la pertenencia vigente | `I/frozen-name.int.test.ts` · `U/list-order-responsibles.test.ts` |
| R37 | Persona de baja, inactiva o bloqueada **sigue saliendo** | `I/list-order-responsibles.int.test.ts` · `U/list-order-responsibles.test.ts` (usa el método que INCLUYE a las de baja) |
| R38 | Orden determinista: por nombre, con desempate por `userId` | `U/list-order-responsibles.test.ts` — dos homónimas · `I/list-order-responsibles.int.test.ts` |
| R39 | Sin credencial, correo, documento ni estado de cuenta | `U/list-order-responsibles.test.ts` (claves exactas + diez valores prohibidos ausentes) · `I/list-order-responsibles.int.test.ts` |
| R40 | Pedido sin asignaciones → lista vacía, no error | `U/list-order-responsibles.test.ts` · `I/list-order-responsibles.int.test.ts` |
| R41 | Las tres mutaciones reciben `FormData`; la consulta, argumentos tipados | `U/order-assignment-actions.test.ts` |
| R42 | Entrada validada con zod **sin tocar puertos** | `U/assignment-input.test.ts` (el doble del puerto **no se llamó**) · `U/order-assignment-actions.test.ts` |
| R43 | Cada error lleva un `code` estable del catálogo cerrado | `U/order-assignment-actions.test.ts` (traduce por `code`, no por mensaje) · `G/guard-catalogo-de-errores.test.ts` · `tests/unit/errores/catalogo.test.ts` |
| R44 | Archivos, símbolos y campos **en inglés** | `U/order-assignment-actions.test.ts` (claves castellanas no aportan valor) |
| R45 | Conoce pedido, persona y grupo **por contrato público** | `G/guard-arquitectura-modulos.test.ts` · `U/module-contract.test.ts` |
| R46 | El contrato público no arrastra `next/*`, `@prisma/client` ni la directiva de servidor | `G/guard-arquitectura-modulos.test.ts` · `U/module-contract.test.ts` (cierre de imports del barril) |
| R47 | Cada puerto se cablea **solo** en `lib/composition` | `G/guard-arquitectura-modulos.test.ts` |
| R48 | No modifica `db/schema.prisma` ni añade migración | `G/guard-rls-force.test.ts` + **diff de `db/` vacío**, verificado abajo |
| R49 | No añade, quita ni renombra ningún permiso: siguen **quince** | `tests/unit/identity/permissions.test.ts` (existente, **sin tocar**) · `G/guard-permisos-sembrados.test.ts` + diff vacío, abajo |
| R50 | Ninguna pantalla, página, componente ni ruta | Los E2E existentes sin cambios + **diff de `app/`, `components/` y `e2e/` vacío**, abajo · `U/module-contract.test.ts` (ni `app/` ni `components/` nombran `asignaciones.*`) |
| R51 | Ninguna dependencia nueva | `G/guard-dependencias-aprobadas.test.ts` + **diff de `package.json` y `pnpm-lock.yaml` vacío**, abajo |

## 4. Las tres preguntas que el humano dejó abiertas

Se implementó **el requisito tal como está escrito**; no se reabrió ninguna.

| Pregunta | Respuesta vigente | Dónde vive |
| --- | --- | --- |
| ¿Asignar suelta a una cuenta no `active`? | **Se rechaza** (R18) | `U/assign-responsibles.test.ts`, `I/atomicity.int.test.ts` |
| ¿Un `CANCELADO` admite desasignar? | **No**, igual que el entregado, con código propio (R11) | `U/order-state.test.ts`, `U/unassign-responsible.test.ts` |
| ¿«Quitar un grupo» es de esta mitad? | **Sí** (R32–R34) | `I/remove-work-group.int.test.ts` |

## 5. Verificación de los límites (R48, R49, R50, R51)

Comprobado contra `origin/dev`, en el árbol final:

```
$ git diff --stat origin/dev -- db/ package.json pnpm-lock.yaml app/ components/ e2e/
(sin salida — el diff es VACÍO)

$ git diff --stat origin/dev -- lib/modules/identity/domain/permissions.ts tests/unit/identity/permissions.test.ts
(sin salida — el catálogo de permisos no se tocó)

$ grep -c "code:" lib/modules/identity/domain/permissions.ts
15
```

**Quince permisos, ni uno más ni uno menos.** `asignaciones.consultar` y
`asignaciones.modificar` ya existían desde QC-86: esta ficha los **estrena**, no los crea.

## 6. Salida real de los tests

```
$ pnpm typecheck
> tsc --noEmit
(sin salida — verde)

$ pnpm lint
> eslint
(sin salida — verde)

$ npx vitest run tests/unit/asignaciones tests/integration/asignaciones tests/guards
test-db: la corrida de integracion va contra qct_qc87_0bc308fa_mtzwlw5h_57s
 Test Files  49 passed (49)
      Tests  603 passed (603)
   Duration  11.71s
test-db: borrada la base de la corrida.
```

`./init.sh` **completo lo corre el leader** antes del PR (`AGENTS.md`, reparto del gate).

## 7. Tres cosas que los tests destaparon y valen más que su tamaño

1. **R38 no estaba implementado.** El desempate por `userId` estaba *documentado* en el
   comentario del comparador —«no es cosmético: es lo que hace el orden TOTAL»— pero la
   función devolvía solo la comparación de nombres. Dos homónimas salían en el orden de
   llegada de las filas, que es justo lo que R38 prohíbe. El comentario decía la verdad; el
   código, no.

2. **El centinela de QC-86 no vigilaba nada en los comentarios de línea.** Su
   `stripComments` no casaba el retorno de carro y, sin bandera multilínea, el ancla de fin
   era fin de cadena. En un repo con CRLF eso no borra **ningún** comentario de línea, así
   que una **mención en prosa** contaba como infracción — exactamente lo que el propio
   bloque dice que hay que evitar. Corregido y documentado con ficha y fecha.

3. **Un `deleteOne` que borraba de más llegó a estar en la rama.** El commit `4f81669`
   capturó el adaptador mientras la campaña de mutación de T14 corría, y se llevó el mutante
   a HEAD: el `where` sin `userId`, es decir, desasignar a **una** persona borraba a
   **todos** los responsables del pedido. Lo cazó T14 (cuatro tests en rojo) y se corrigió
   en `52fc99b`. Es exactamente para esto que existe el criterio de «cada aserción cae al
   mutar».

## 8. Deudas, dichas y no escondidas

- **`ListOrderResponsiblesDeps.now` sigue siendo opcional**, con `new Date()` por defecto.
  `lib/composition` lo cablea **explícito**, así que el defecto no se ejerce en producción;
  queda solo para los tests que no inyectan reloj. Volverlo obligatorio es un cambio de una
  línea más ajustar sus llamadas: se deja **señalado, no hecho**, porque tocarlo exigía
  reabrir casos de uso ya cerrados y verdes.
- **Tres mutantes sobrevivieron y se declaran equivalentes**, en vez de maquillar la cifra:
  filtrar por empresa o por baja en **una sola** de las dos capas no es observable porque
  `listMembersAliveInCompany` vuelve a filtrar; y el desempate por `userId` no es observable
  **desde integración** porque el adaptador ya ordena por `user_id` y el `sort` de JS es
  estable — lo cubre el unitario de R38.
- La **atomicidad de R27** hoy descansa en que `insertMissing` es **una sola sentencia**. El
  adaptador es una fábrica que puede construirse sobre una transacción, así que el día que
  haya una segunda escritura en la misma operación, el sitio donde abrirla ya existe.
- Los tests de integración enrutan el cliente Prisma **global** a la transacción del test
  con un Proxy del cliente real (`prisma-tx-holder.ts`). No se sustituye ninguna consulta ni
  ningún resultado: el SQL es el de producción y solo cambia la conexión por la que viaja.
  Es lo que permite censar los ocho archivos como `transaccion` y no como `commit`.

## 9. Estado

Las quince tareas de `tasks.md` están en `[x]`. Tres commits en la rama:

```
1608ae6  feat(QC-87): los cuatro casos de uso de asignaciones y sus contratos (T1-T9, T13)
4f81669  feat(QC-87): el barril, el cableado y las tres Server Actions (T10, T11, T12)
52fc99b  test(QC-87): los tests de integracion contra Postgres, y un deleteOne que borraba de mas (T14)
```

**No me autoapruebo.** Falta `./init.sh` completo (leader) y el reviewer.
