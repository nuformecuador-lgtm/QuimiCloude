# QC-87 — asignar-responsables-a-un-pedido · review

> Mitad **BACKEND**. Rama `feature/QC-87-asignar-responsables-a-un-pedido`, worktree propio.
> Diff revisado: `git diff origin/dev...HEAD` — **cuatro** commits (`1608ae6`, `4f81669`,
> `52fc99b`, `a25e87f`), 56 archivos, +9458/-62.
> Revisado el 2026-09-13. Todo lo que sigue se comprobo **en disco y ejecutando**, no leyendo
> la bitacora.

## Veredicto

**OK — aprobado.** Cero hallazgos mayores. Cinco menores, ninguno bloqueante.

---

## 1. Checklist de `CHECKPOINTS.md`

### Especificacion
- [x] `requirements.md` con EARS numerados R1–R51.
- [x] `design.md` con alternativas descartadas y su porque (`> 11. Alternativas descartadas`).
- [x] `tasks.md` con las **quince** tareas en `[x]`; ninguna `[ ]` (verificado por grep).

### Trazabilidad
- [x] Cada `R<n>` mapea a un test que **existe** y **verifica lo que dice**. Detalle en §2.
- [x] `progress/impl_QC-87-...md` contiene el mapa `R<n> -> test` completo.

### Calidad de codigo
- [x] `./init.sh` **completo, verde**, corrido por el reviewer: `== init OK ==`,
      `Test Files 428 passed (428)`, `Tests 6095 passed | 66 skipped (6161)`,
      «sin rojos nuevos (0 rojos, todos en el baseline de 8)». typecheck y lint verdes.
- [x] E2E: **diferido a QC-102 con motivo escrito** (R50 + `design.md > 0` hallazgo 1). Ver
      menor 5.
- [x] UI: **no aplica** — la feature no toca `app/**` ni `components/**` (diff vacio, §3).
- [x] Dependencias: **ninguna nueva**; `package.json` y `pnpm-lock.yaml` con diff vacio (§3).

### Datos y seguridad
- [x] **Sin tabla nueva**: `db/**` con diff vacio. El modelo entero es de QC-86, ya mergeado.
- [x] Aislamiento por empresa: la empresa sale **del actor** y **no** de la entrada
      (`strictObject` sin `companyId`), y `companyId` es el **primer parametro** de los tres
      metodos del puerto que lo llevan. Test de acceso cruzado: `company-scope.int.test.ts`
      (persona ajena, grupo ajeno, consulta desde la otra empresa, borrado desde la otra
      empresa) contra Postgres real. Salvedad documentada: menor 1.
- [x] Permiso validado **en el service, primera linea**, con su test
      (`tests/unit/asignaciones/authorization.test.ts`). No hay comprobacion en la Server
      Action, y eso esta afirmado.
- [x] Acceso a datos solo por repositorio/adaptador Prisma. Ninguna lectura por cliente
      Supabase.
- [x] Sin migraciones nuevas -> nada de `down.sql` que exigir.
- [x] Sin secretos en el diff (barrido de `SECRET|API_KEY|PASSWORD|Bearer|sk_|postgres://`).
- [x] Sin webhooks.

### Modulos hexagonales
- [x] `domain/` y `ports/` puros: el puerto no importa nada; el dominio solo `zod` y barriles
      de otros modulos. El unico `@prisma/client` y el unico `@/lib/shared/db/prisma` del
      modulo estan en `adapters/driven/persistence/`.
- [x] De otro modulo solo el **contrato**: `@/lib/modules/pedidos` y `@/lib/modules/identity`,
      nunca ruta profunda. Los tres contratos nuevos (`OrderCatalog`, `PeopleDirectory`,
      `WorkGroupDirectory`) se publican **por tipo**, sin arrastrar adaptador.
- [x] **R47 verificado por grep**: el unico archivo de produccion que importa los tres
      adaptadores driven es `lib/composition/index.ts` (lineas 243, 245, 247). Ningun driving
      instancia un driven.
- [x] **R46**: el barril **no** reexporta el puerto, ni el adaptador driven, ni las Server
      Actions. Cierre de imports limpio, vigilado sobre el cierre y no sobre el archivo suelto
      (`module-contract.test.ts` bloque (c), con sus dos mutaciones sinteticas).
- [x] **`prisma.orderAssignment` solo en `order-assignment-prisma.ts`** (4 usos, grep sobre
      `lib/`, `app/`, `components/`).
- [x] Logica de negocio en `domain/`, no en la Server Action: las tres actions resuelven actor,
      traducen `FormData` y traducen el error por `code`. Nada mas.

### Permisos
- [x] Nada autoriza por rol. `guard-autorizacion-por-permiso.test.ts` **recorre ahora
      `asignaciones`** como sexto modulo de negocio (`BUSINESS_MODULES`), y la ampliacion va con
      su motivo escrito.
- [x] **R3 verificado**: la consulta exige `pedidos.consultar` y **rechaza** a quien solo trae
      `asignaciones.consultar`, solo `asignaciones.modificar`, o los dos
      (`list-order-responsibles.test.ts:127-144`, mas el caso de integracion `:153`). La
      no-implicacion en los dos sentidos esta en `authorization.test.ts:93-112`, incluidos los
      «parecidos» (espacio final, mayusculas, prefijo suelto).
- [x] Mutaciones por Server Action, sin route handler ni `fetch` a ruta propia.

### Configuracion / Verificacion final
- [x] Nada hardcodeado que cambie entre entornos.
- [x] `./init.sh` verde (arriba). Este archivo existe con veredicto OK.

---

## 2. Trazabilidad R1–R51 — comprobada, no heredada

Los 51 tienen test **existente y con asercion real**. Lo que se verifico caso a caso, mas alla
de que el archivo exista:

- **R1, R2, R4**: `authorization.test.ts` cubre las cuatro operaciones con actor `null`,
  `undefined`, sin conjunto, con conjunto vacio y sin el codigo; y afirma que no se toca ningun
  puerto. La primera linea es literal en los cuatro casos de uso (leido en codigo).
- **R3**: ver el bloque de Permisos.
- **R5**: `company-scope.int.test.ts:51-86` — las filas llevan la empresa del actor, y mandar
  `companyId` en la entrada **falla** (`strictObject`), no se ignora.
- **R6, R7**: `company-scope.int.test.ts:88-165` — persona ajena / de baja / inexistente son el
  mismo `user_not_found`; lo mismo para el grupo; la consulta desde la otra empresa devuelve
  lista vacia y el borrado desde la otra empresa no borra nada.
- **R8–R13**: `order-state.test.ts` recorre la tabla **celda a celda** sobre las **tres**
  escrituras, afirma que los dos rechazos llevan `code` **distinto** y que «no existe» y
  «entregado» **no** son el mismo error (R12); `remove-work-group-from-order.test.ts:335-369` y
  `unassign-responsible.test.ts` repiten la tabla en su caso de uso. El mapa
  `ERROR_POR_ESTADO` es `satisfies Record<OrderStatus, …>`: un estado nuevo no compila.
- **R14–R18**: `assign-responsibles.test.ts` + `atomicity.int.test.ts:83-105`, que afirma que
  **la fila anterior sigue exactamente igual** tras un rechazo, no solo que no se creo nada.
- **R19–R21, R25, R26**: `active-members-only.int.test.ts`. El caso de R21 es el bueno: la
  bloqueada **por plazo vencido** entra al reaplicar **moviendo solo el reloj**, y se afirma que
  su cuenta (`accountStatus`, `lockedUntil`, `updatedAt`) **no cambio**. Eso demuestra que el
  filtro es `effectiveAccountStatus` y no un `WHERE account_status='active'`.
- **R22–R24**: `reapply-work-group.int.test.ts` compara la **foto entera** de las filas viejas
  (origen, `workGroupId`, nombre congelado, `createdAt`) y cubre suelta-gana-al-grupo y
  grupo-viejo-no-se-toca.
- **R27**: `atomicity.int.test.ts:53-81` provoca un `23503` real con la fila del medio del lote
  y afirma cero filas. Cae si `insertMissing` se parte en un `create` por fila.
- **R28, R36**: `frozen-name.int.test.ts` renombra **y da de baja** el grupo despues, y ademas
  saca a la persona del grupo para probar que la lista **no** se deriva de la pertenencia
  vigente.
- **R29–R31**: `unassign.int.test.ts` — ver §4, punto 1.
- **R32–R34**: `remove-work-group.int.test.ts` (incluido el grupo renombrado y dado de baja) y
  `remove-work-group-from-order.test.ts`, que ademas tiene **dos casos negativos de tipo**: el
  puerto no admite borrado masivo por pedido ni `update`, y las deps **no tienen hueco** para un
  directorio de grupos (que es R32 escrito como ausencia).
- **R35, R37–R40**: `list-order-responsibles.test.ts` e `.int.test.ts`.
- **R38**: ver §4, punto 2.
- **R41, R43, R44**: `order-assignment-actions.test.ts` — aridad declarada, campo a campo lo que
  llega al caso de uso, valores **crudos**, traduccion por `code` y no por texto, y el caso de
  las claves castellanas que **no aportan ningun valor**.
- **R42**: `assignment-input.test.ts` afirma que el doble del puerto **no se llamo**.
- **R45, R46, R47**: `module-contract.test.ts` + `guard-arquitectura-modulos` + grep propio.
- **R48–R51**: §3.

---

## 3. Limites de alcance — verificados con `git diff --name-only origin/dev...HEAD`

Diff **vacio** en `db/**`, `app/**`, `components/**`, `e2e/**`, `package.json`,
`pnpm-lock.yaml`. Ninguno de esos prefijos aparece en los 56 archivos del diff. **R48, R50 y R51
cumplidos.**

**R49**: `lib/modules/identity/domain/permissions.ts` y `tests/unit/identity/permissions.test.ts`
**no aparecen en el diff**, y el catalogo sigue con **quince** (`grep -c "code:"` = 15). La ficha
**estrena** `asignaciones.modificar`, no lo crea.

---

## 4. Las cuatro declaraciones del implementer — auditadas

1. **El `deleteOne` sin `userId`: CIERTO y corregido.** En HEAD,
   `lib/modules/asignaciones/adapters/driven/persistence/order-assignment-prisma.ts:115-117`
   tiene el `where` completo: `{ orderId, userId, companyId }`. Y el test **cae de verdad** si se
   quita `userId`: `tests/integration/asignaciones/unassign.int.test.ts:59-72` asigna **tres**
   personas al pedido, desasigna a **una** y afirma nominalmente que las **otras dos siguen ahi**
   con su origen intacto — un `where` sin `userId` las borraria y la asercion de la linea 65
   quedaria en rojo. Ademas cubre el otro lado: la misma persona por el mismo grupo en **otro**
   pedido sigue asignada, que es lo que cae si se pierde `orderId`.

2. **R38 (desempate por `userId`): CIERTO, implementado y con test que cae.**
   `lib/modules/asignaciones/domain/list-order-responsibles.ts:94-95` compara los identificadores
   por puntos de codigo tras el `Intl.Collator`. El test
   `tests/unit/asignaciones/list-order-responsibles.test.ts:314-328` monta **tres homonimas** y
   entrega las filas en orden `[CARLA(6…), ANA(1…), BRUNO(2…)]`, esperando `[ANA, BRUNO, CARLA]`.
   Como `Array.prototype.sort` es **estable**, sin el desempate el resultado seria el de llegada
   y la asercion caeria. Verificado leyendo las constantes (`:32-34`), no por confianza.

3. **`ListOrderResponsiblesDeps.now` opcional: NO es un hallazgo.** El implementer se lo apunta
   como deuda, pero `now?: () => Date` es **la convencion del repo**, no una excepcion suya: la
   misma forma esta en 20+ casos de uso de `identity`, `pedidos`, `inventario` y `proveedores`
   (`create-user`, `update-order`, `delete-product`…). Ademas `lib/composition` lo cablea
   **explicito**, asi que el defecto no se ejerce en produccion. Volverlo obligatorio **aqui y
   solo aqui** seria la incoherencia. Se retira como deuda.

4. **Los tres mutantes «equivalentes»: SON equivalentes.** Comprobado en el codigo, no aceptado:
   - Quitar `companyId` o `deletedAt` del `workGroup.findFirst` de
     `findSnapshotAliveInCompany` (`assignment-directory-prisma.ts:166-169`) queda
     **enmascarado** porque `listMembersAliveInCompany` vuelve a resolver el grupo con
     `findAliveGroupId(prisma, companyId, id)` —`where: { id, companyId, deletedAt: null }`,
     `work-group-prisma.ts:308-312`— y devuelve `'not_found'`, que el adaptador traduce a `null`.
     El resultado observable sigue siendo `work_group_not_found`. Equivalente, confirmado.
   - El desempate por `userId` no es observable desde integracion porque el adaptador ya ordena
     por `user_id` y el `sort` de JS es estable. Correcto; lo cubre el unitario (punto 2).

---

## 5. Las tres preguntas abiertas — implementadas tal cual, ninguna reabierta

| Pregunta | Requisito | Donde se verifico |
| --- | --- | --- |
| Asignar **suelta** a cuenta no `active` | **R18: se rechaza** | `atomicity.int.test.ts:94-99` (`accountStatus: 'pending'` -> `user_not_assignable`, lote entero fuera) |
| `CANCELADO` y las **tres** escrituras | **R11: como el entregado, `code` distinto** | `order-state.ts:46-51`; `order-state.test.ts:151`; `remove-work-group-from-order.test.ts:357`; `unassign-responsible.test.ts` |
| «Quitar un grupo» en esta mitad | **R32–R34: si** | `remove-work-group-from-order.ts` (archivo propio + Server Action propia) y `remove-work-group.int.test.ts` |

Ninguna se reabrio ni se reinterpreto en el codigo.

---

## 6. Hallazgos

### Mayores (bloqueantes)

**Ninguno.**

### Menores

1. **`menor` — El pedido no se acota por empresa, y el `code` del rechazo lo delata.**
   `lib/modules/pedidos/adapters/driven/persistence/order-catalog-prisma.ts:40-43` busca el
   pedido con `where: { id, deletedAt: null }`, **sin `companyId`**. Consecuencia observable: un
   actor de la empresa A que pase el `orderId` de un pedido `ENTREGADO` de la empresa B recibe
   `order_delivered_frozen` en vez de `order_not_found`, es decir, aprende que ese pedido existe
   y en que estado esta.
   **No es bloqueante y no se le imputa a esta ficha**: `orders` **no tiene `company_id`** (QC-86
   R14, epica QC-46) y el `design.md > 0` hallazgo 4 lo declara por escrito antes de implementar
   —«un pedido de otra empresa no es distinguible hoy, y **R7 es lo maximo exigible** hasta
   QC-46»—. Los datos que si son de esta ficha **si** estan acotados: las asignaciones se leen y
   se borran con `companyId` en el `where`, y `company-scope.int.test.ts` lo prueba. Queda
   anotado para que QC-46 lo cierre y no se pierda.

2. **`menor` — Dos de las mutaciones que un test se atribuye no lo ponen rojo.**
   `tests/integration/asignaciones/company-scope.int.test.ts:17-25`, bloque «CADA ASERCION CAE AL
   MUTAR», afirma que quitar `companyId` de `findSnapshotAliveInCompany` hace caer el caso del
   grupo ajeno, y que quitar `deletedAt: null` hace caer el del grupo de baja. **Los dos son
   equivalentes** por el doble filtro descrito en §4.4, y el propio implementer lo reconoce en
   su bitacora §8. El test **pasa y prueba lo que dice su titulo**; lo inexacto es la nota de
   mutacion, que es justo el sitio del que otro agente se fiara manana para creer que la regla
   esta vigilada donde no lo esta. Corregir el comentario, no el test.

3. **`menor` — El motivo del censo de aislamiento se contradice con la solucion de la propia
   rama.** `tests/integration/aislamiento.json`, entrada
   `identity/assignment-directory.int.test.ts`, justifica el `commit` diciendo que envolver el
   adaptador en una transaccion del test «seria un aislamiento de mentira» porque habla con el
   cliente Prisma **global**. Pero esta misma rama resuelve exactamente ese problema con
   `tests/integration/asignaciones/prisma-tx-holder.ts`, y lo usa para censar los otros **ocho**
   archivos como `transaccion` —incluidos los que ejercitan **ese mismo adaptador**
   (`company-scope`, `active-members-only`)—. La entrada `commit` es admisible (limpia lo suyo y
   el `afterAll` lo afirma), pero el motivo escrito ya no es cierto.

4. **`menor` — La bitacora dice «Tres commits en la rama» y hay cuatro.**
   `progress/impl_QC-87-asignar-responsables-a-un-pedido.md:217-223` lista tres; `a25e87f` (la
   propia bitacora) es el cuarto. Cosmetico; se anota porque el §9 se titula «Estado».

5. **`menor` (aceptado) — Sin E2E, por R50.** `CHECKPOINTS.md > Calidad de codigo` pide E2E para
   flujos criticos y esta ficha estrena un permiso. **Se acepta el diferimiento**: R50 lo escribe
   como requisito con motivo —no hay ninguna ruta que Playwright pueda visitar en esta mitad—,
   `design.md > 0` hallazgo 1 lo razona, y el precedente es QC-84 R48 -> QC-85. La evidencia
   equivalente (tests de integracion contra Postgres real) existe y es solida. **QC-102 hereda el
   E2E del recorrido completo**, y si llega sin el, ahi si es bloqueante.

---

## 7. Lo que merece decirse en positivo

- Los tests de integracion **no** se conforman con «la persona ya no esta»: afirman lo que
  **sobrevive**, nominalmente y con su origen. Es lo que caza un `deleteMany` mal acotado, y de
  hecho lo cazo.
- Los **casos negativos de tipo** (`remove-work-group-from-order.test.ts:222-244`) convierten en
  asercion dos ausencias —no hay borrado masivo por pedido, no hay directorio de grupos en las
  deps— que de otro modo se recuperarian sin que nada se pusiera rojo.
- Las tres enmiendas a centinelas de QC-86 (`stripComments`, forma del modulo, consumo de
  permisos) **retensan en vez de aflojar**: la de la forma cambia de signo la asercion, la del
  cliente Prisma se prueba **por sus dos lados**, y la de permisos abre una puerta nominal
  (`asignaciones.modificar` solo en `domain/`) dejando `asignaciones.consultar` prohibido en
  todas partes. Ninguna borra una asercion para pasar.
- El `stripComments` con CRLF era un centinela que llevaba tiempo sin vigilar nada. Encontrarlo
  desde una ficha que no iba de eso, y dejarlo documentado con fecha, vale mas que su tamano.
