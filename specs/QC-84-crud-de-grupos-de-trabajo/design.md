# QC-84 — crud-de-grupos-de-trabajo · design.md

> Zona: `backend` · Complejidad: `medium` · depends_on: `QC-83` (mergeada) · Épica QC-17 ·
> Rama: `feature/QC-84-crud-de-grupos-de-trabajo`
>
> El **qué** está en `requirements.md` (R1–R50) y su alcance lo cerró el humano el 2026-09-11 en la
> tabla de **17 decisiones**. Aquí va el **cómo**: dónde viven los siete casos de uso dentro de
> `lib/modules/identity/`, el puerto de datos, cómo se lee el filtro de miembros **sin escribir una
> segunda copia** de la regla del estado efectivo, los **códigos de error nuevos** que entran al
> catálogo único de QC-70 y su ripple medido, y qué **no** se toca.
>
> **Precedentes literales, que son la mitad del trabajo**: `specs/QC-66-crud-de-usuarios/` (el CRUD
> dentro de `identity`: autorización en el service, Server Actions con `FormData`, errores con `code`
> estable, listado paginado con desempate estable, borrado lógico), `specs/QC-83-modelo-de-grupos-de-trabajo/`
> (el modelo que esta ficha **consume y no define**), `specs/QC-94-consulta-de-roles/` (la consulta
> más reciente de `identity` y su frontera) y `specs/QC-86-modelo-de-asignacion-de-pedidos/` (la
> congelación que R18 y R39 tienen que respetar). **Este diseño no inventa nada donde esos ya
> decidieron**; cada vez que se aparta, lo dice y explica por qué.
>
> **El modelo ya existe y está mergeado.** `WorkGroup` y `WorkGroupMember` están completos en
> `db/schema.prisma`, con `work_groups_name_unique` (funcional, compuesto con `company_id` y
> **parcial** `WHERE deleted_at IS NULL`), la PK compuesta `(work_group_id, user_id)` y las dos FK
> **compuestas** con `company_id`. Esta ficha **no lo re-especifica y no lo cambia**: lo consume (R46).

---

## 1. Qué construye esta feature, y qué archivos toca

| Archivo | Qué se hace |
| --- | --- |
| `lib/modules/identity/domain/work-group-input.ts` | **NUEVO.** Esquemas `zod` del borde: crear, renombrar, meter, sacar, dar de baja (§ 4). |
| `lib/modules/identity/domain/work-group-view.ts` | **NUEVO.** `WorkGroupRow` (listado) y `WorkGroupMemberRow` (miembros), con claves exactas (§ 4.3). |
| `lib/modules/identity/domain/work-group-queryable.ts` | **NUEVO.** Las **dos** listas blancas de campos consultables: la del grupo y la del miembro (§ 6). |
| `lib/modules/identity/domain/create-work-group.ts`, `rename-work-group.ts`, `delete-work-group.ts`, `add-work-group-member.ts`, `remove-work-group-member.ts`, `list-work-groups.ts`, `list-work-group-members.ts` | **NUEVOS.** Los **siete** casos de uso, uno por archivo, como factory `createXxx(deps)`. |
| `lib/modules/identity/domain/errors.ts` | **SE AMPLÍA.** Siete clases nuevas al final del archivo, sin tocar las diez existentes (§ 7). |
| `lib/modules/identity/ports/work-group-repository.ts` | **NUEVO.** El puerto único de lectura/escritura de grupos y pertenencias (§ 5). |
| `lib/modules/identity/adapters/driven/persistence/work-group-prisma.ts` | **NUEVO.** Implementación Prisma; único archivo de la feature que toca `@prisma/client`. |
| `lib/modules/identity/adapters/driving/work-group-actions.ts` | **NUEVO.** Las siete Server Actions (R42). |
| `lib/modules/identity/index.ts` | Bloque **nuevo al final**: tipos, esquemas, los siete errores y las siete factories — solo de `./domain`. No se reordena nada de lo que hay. |
| `lib/composition/index.ts` | La fachada `identity` gana las siete claves y el repositorio. **Único** sitio de cableado (R44). |
| `lib/modules/errores/domain/error-codes.ts`, `…/error-catalog.ts` | **SE AMPLÍAN** con los siete códigos nuevos, su clave y su texto (§ 7.2). Es la **cuarta enmienda** documentada a un catálogo cerrado del repo. |
| `tests/**` | Los nuevos de § 10 **y el ajeno de § 7.3**. |

**Declaración explícita para la validación de conflicto del leader** (`tasks.md` la repite):
`db/schema.prisma` **NO se toca**; `db/migrations/` **NO se toca**; `lib/composition/index.ts`
**SÍ**; `lib/modules/identity/index.ts` **SÍ**; `lib/modules/errores/domain/**` **SÍ** (dos archivos).
No se toca `app/`, `components/`, `middleware.ts`, `e2e/`, `lib/shared/**`, `lib/modules/asignaciones/**`
ni ningún otro módulo.

---

## 2. Lo que se hereda montado y no se vuelve a construir

Verificado en el árbol de esta rama antes de escribir este diseño:

| Pieza | Dónde está | Qué aporta a esta ficha |
| --- | --- | --- |
| `WorkGroup`, `WorkGroupMember` | `db/schema.prisma` L308-377 | Las dos tablas, el índice único parcial, la PK compuesta y las dos FK compuestas con `company_id` (R12, R32) |
| `normalizeWorkGroupName` | `domain/work-group-name.ts`, exportado por el barril | La **única** definición de «mismo nombre de grupo» (R13). No se escribe una segunda |
| `Actor`, `requirePermission` | `domain/actor.ts` | La autorización del módulo (R1–R5). Ya existe desde QC-66; **no se crea otra** |
| `PERMISSIONS` con **quince** entradas | `domain/permissions.ts` | `usuarios.consultar` y `usuarios.modificar` (R47). **El archivo no se toca** |
| `effectiveAccountStatus` | `domain/effective-account-status.ts` (QC-78) | La **única** traducción de «lo que la columna dice» a «lo que significa ahora» (R19, R21) |
| `ListQuery`, `Page`, `sanitizeListQuery`, `ListQueryLog` | `domain/list-query.ts`, `domain/page.ts`, `ports/list-query-log.ts` | El contrato de listado de QC-57, **ya copiado a `identity` por QC-66** (R24, R27) |
| `lib/shared/pagination.ts` | `DEFAULT_PAGE_SIZE = 10`, `MAX_PAGE_SIZE = 25` | El 10/25 de R24, consumido **desde el driven** |
| `buildDisplayName` | `domain/display-name.ts` | El nombre mostrable de cada miembro (R19). No se concatena a mano |
| `IdentityError` + traductor único | `domain/errors.ts`, `lib/modules/errores` | La forma del error con `code` estable (R43) |

**Consecuencia que ahorra una ficha entera:** como QC-66 ya trajo el contrato de listado a `identity`,
**esta feature no crea una séptima copia** y por tanto **no toca**
`tests/guards/guard-contrato-listados.test.ts`. Es la diferencia más importante con QC-66 § 8.1.

---

## 3. Autorización y actor (R1–R7)

Copia exacta de QC-66 § 5, sin una sola variación:

- `requirePermission(actor, 'usuarios.consultar' | 'usuarios.modificar')` como **primera línea** de
  los siete casos de uso, **antes** del `zod` y antes de tocar el puerto. El test lo demuestra con
  dobles que **lanzan si los llaman**: un `if` decorativo puesto después de la consulta no pasa.
- **Falla cerrado** y **sin implicación entre permisos**: lo garantiza `assertPermission`, que ya es
  la única implementación de la regla en el repo (R2, R3).
- **No se usa `requireAnyPermission`** (el de QC-94): aquí cada operación exige **un** código exacto,
  no cualquiera de dos. Se dice porque son dos funciones vecinas en el mismo archivo y confundirlas
  abriría las cinco escrituras a quien solo tiene `consultar`.
- El actor entra **por parámetro** (`{ id, companyId, permissions }`, R5); las Server Actions lo
  arman con las **dos caras** de la sesión —`identity.getSessionUser()` + el contexto de sesión— vía
  `@/lib/composition` (R6).
- La RLS de las dos tablas sigue **activada y forzada** desde QC-83 y **no autoriza nada** (R7):
  Prisma se conecta como dueño. No se escribe ningún test de RLS con Prisma —saldría verde pase lo
  que pase—; lo cierra la guardia estática `guard-rls-force.test.ts`, que ya existe.

---

## 4. Contratos de entrada y salida

### 4.1 Entrada (`domain/work-group-input.ts`), validada con `zod` en el borde (R14)

| Esquema | Campos | Notas |
| --- | --- | --- |
| `createWorkGroupSchema` | `name: string` (trim, min 1, max 80) | **No admite `companyId`** (R11) ni `deletedAt`. `strictObject`: mandar un campo de más **falla**, no se ignora |
| `renameWorkGroupSchema` | `workGroupId: uuid`, `name` | |
| `workGroupMemberSchema` | `workGroupId: uuid`, `userId: uuid` | Sirve a **meter** y a **sacar**: la entrada es la misma; los casos de uso son dos (R33) |
| `deleteWorkGroupSchema` | `workGroupId: uuid` | |

El **tope de 80** es la posición por defecto de este diseño, no una decisión del humano: la columna es
`TEXT` **sin límite a propósito** (QC-83 R2, «el tope vive en `zod`, no en el tipo, para que cambiarlo
no sea una migración»). Ningún requisito lo cita por su valor.

**No hay ningún esquema que reciba una lista de miembros** (R33): la forma misma del borde hace
inexpresable el «mandar el conjunto completo» que la decisión 6 descartó.

### 4.2 Las dos consultas

```ts
listWorkGroups(actor, query: ListQuery): Promise<Page<WorkGroupRow>>
listWorkGroupMembers(actor, workGroupId: string, query: ListQuery, now: Date):
  Promise<Page<WorkGroupMemberRow>>
```

Argumento **ya tipado**, no `FormData`: nadie las llama desde un `<form>` (R42), igual que
`listUsersAction` y `listRolesAction`. Las dos devuelven **la misma forma de página** y aceptan la
página y el tamaño **en la misma forma** (R54): QC-85 pagina las dos listas igual. De `query`, la
consulta de miembros usa hoy **la página y el tamaño**; el orden es fijo (R22) y no hay filtro ni
búsqueda declarados — y por eso `sanitizeListQuery` **omite** lo que no esté en la lista blanca en vez
de romper, que es el punto del contrato de QC-57.

### 4.3 Salida

```
WorkGroupRow        (listado, R26)  = { id, name }
WorkGroupMemberRow  (miembros, R19) = { id, displayName }
```

- **Nada más.** Ni `nameNormalized`, ni `companyId`, ni `deletedAt`, ni marcas de tiempo (R26); ni
  `passwordHash` ni ningún dato de credencial en el miembro (R19). El adaptador **enumera** las
  columnas en el `select` de Prisma: nunca un `findMany` sin `select`. Un test afirma las **claves
  exactas** del objeto, no solo que falten algunas.
- **`displayName` se compone con `buildDisplayName`**, que ya existe y ya tiene tests.
- **El miembro no trae su estado de cuenta**, y es deliberado: R19 ya garantiza que todos los que
  salen están efectivamente `active`, así que un campo de estado sería una columna constante que
  invita a que alguien la pinte y a que alguien la filtre otra vez.

---

## 5. El puerto de datos (R44)

```ts
// lib/modules/identity/ports/work-group-repository.ts
export type MemberBlockReason = 'pending' | 'inactive' | 'blocked';

export type AddMemberOutcome =
  | { kind: 'created' }
  | { kind: 'group_not_found' }
  | { kind: 'user_not_found' }
  | { kind: 'already_member'; hiddenBy: MemberBlockReason | null };

export interface WorkGroupRepository {
  createInCompany(companyId: string, name: string, nameNormalized: string):
    Promise<{ id: string } | 'duplicate_name'>;

  renameAliveInCompany(companyId: string, id: string, name: string, nameNormalized: string):
    Promise<'ok' | 'not_found' | 'duplicate_name'>;

  softDeleteAliveInCompany(companyId: string, id: string, now: Date):
    Promise<'ok' | 'not_found'>;

  listAliveInCompany(companyId: string, query: SanitizedListQuery): Promise<Page<WorkGroupRow>>;

  /** Devuelve TODOS los miembros vivos con su estado CRUDO y su plazo de bloqueo, YA ORDENADOS
   *  (apellidos, nombres, id): quien decide quien esta «active de verdad» es el DOMINIO con
   *  `effectiveAccountStatus`, y quien PAGINA es el caso de uso, despues de filtrar (§ 5.2). NO
   *  recibe pagina ni tamano de pagina a proposito: cortar antes de filtrar daria paginas de
   *  tamano irregular y un total mentiroso (R51, R52). */
  listMembersAliveInCompany(companyId: string, id: string):
    Promise<MemberCandidate[] | 'not_found'>;

  addMemberAliveInCompany(companyId: string, id: string, userId: string, now: Date):
    Promise<AddMemberOutcome>;

  removeMemberAliveInCompany(companyId: string, id: string, userId: string):
    Promise<'ok' | 'group_not_found' | 'member_not_found'>;
}
```

- **`…AliveInCompany` en el nombre no es adorno**: los filtros `deleted_at IS NULL` (R9) y
  `company_id = ?` (R8) son **del puerto**, no del dominio, así que ningún caso de uso puede
  olvidarlos. `companyId` es el **primer** parámetro obligatorio de los siete métodos: una llamada
  que lo olvide **no compila** (R8).
- **Resultados discriminados, nunca excepciones de Prisma.** El adaptador traduce el `P2002`
  (`SQLSTATE 23505`) contra `work_groups_name_unique` a `'duplicate_name'`, y el `P2002` contra
  `work_group_members_pkey` a `already_member`. El dominio no ve ni un código de Postgres.
- **El puerto NO expone ninguna búsqueda por nombre** (R12): la comprobación previa de existencia
  —que es una carrera— ni siquiera es expresable. La unicidad la garantiza **el índice**.
- **Sacar es un `DELETE` de verdad** (R34); **dar de baja es un `UPDATE` de `deleted_at`** (R37). Los
  dos métodos se llaman distinto a propósito: es la confusión que QC-83 avisó por escrito en su
  decisión 5.

### 5.1 `addMemberAliveInCompany`: una transacción, dos garantías distintas

```
$transaction {
  1. SELECT id FROM work_groups WHERE id=$id AND company_id=$c AND deleted_at IS NULL
     -> si no hay fila: 'group_not_found'
  2. SELECT id, account_status, locked_until FROM users
     WHERE id=$u AND company_id=$c AND deleted_at IS NULL
     -> si no hay fila: 'user_not_found'      (R29: inexistente, borrada o de otra empresa)
  3. INSERT INTO work_group_members (work_group_id, user_id, company_id) VALUES (...)
     -> 23505 sobre work_group_members_pkey: leer la fila de `users` del paso 2 y devolver
        { kind: 'already_member', hiddenBy: <motivo o null> }
}
```

**La garantía de no duplicar es el paso 3, no el 2** (R32). El paso 2 existe por dos motivos
independientes: distinguir «persona inexistente» de «persona duplicada» (R29 vs R30) y **elegir el
mensaje** de R31. Si dos intentos simultáneos corren, el segundo choca contra la PK y **se traduce al
mismo error** que habría dado la lectura: el mensaje puede llegar por dos caminos, la fila de más no
puede existir por ninguno.

**`hiddenBy` lo calcula el DOMINIO**, no el adaptador: el puerto devuelve el estado crudo + el plazo,
y el caso de uso llama a `effectiveAccountStatus(view, now)`. Si el resultado es `'active'`, la
persona **se ve** y el error es el de R30; si no, el motivo del error es ese estado efectivo (R31).
Así el «por qué no se ve» y el «quién sale en la lista» salen **de la misma función**, y no pueden
divergir.

### 5.2 El filtro de miembros: por qué se decide en el dominio (R19, R20, R21)

`effectiveAccountStatus(view, now)` es, por **QC-78 R7**, la única función por la que pasan todos los
lectores del estado de una cuenta: depende del **reloj** y del plazo de bloqueo, no solo de la
columna. Es exactamente lo que hace verdadero el segundo precio de la decisión 3 —«la cuenta
bloqueada desaparece del grupo y **vuelve sola** al desbloquearse»—, que con un `WHERE account_status
= 'active'` a secas **no se cumpliría**: una fila bloqueada por intentos fallidos puede seguir
diciendo `active` en la columna (QC-78 R11).

Por eso el puerto devuelve **candidatos** —los miembros vivos de la empresa con su estado crudo y su
`locked_until`— y el **caso de uso** filtra y proyecta. El `now` entra por parámetro al dominio, como
en todo el módulo.

### 5.3 La paginación de los miembros, decidida por el humano el 2026-09-11 (R51–R54)

**P2 se cerró al aprobar el spec: la consulta de miembros SÍ se pagina** (decisión 18). Esto cambia
una decisión técnica de este diseño y se reescribe aquí en vez de dejarla desmentida por el propio
archivo.

**Dónde se pagina: en el caso de uso, DESPUÉS de filtrar.** El puerto sigue devolviendo **todos** los
candidatos ya ordenados (§ 5), el caso de uso aplica `effectiveAccountStatus` y **después** corta la
página:

```
candidatos (SQL, ordenados: last_names, first_names, id)
  -> filtro del estado efectivo (dominio, con `now`)        <- R19, R20, R21
  -> total = longitud del conjunto filtrado                 <- R52
  -> corte por (page, pageSize efectivo)                    <- R51, R53
  -> Page<WorkGroupMemberRow>                               <- R54
```

- **El orden y el desempate son del SQL** (`ORDER BY last_names, first_names, id`), no del corte:
  filtrar conserva el orden, así que el desempate por `id` que impide que dos homónimas se
  intercambien entre páginas (R53) viene ya dado. Cortar en memoria sobre una lista **ordenada** es
  estable por construcción.
- **El total cuenta el conjunto YA filtrado** (R52). Es la razón de no paginar en SQL: un `LIMIT`
  antes del filtro devolvería «10 filas menos las ocultas», y un `COUNT(*)` sin el filtro prometería
  personas que la pantalla nunca va a mostrar.
- **El 10 y el 25 entran por `deps`**, no por `lib/shared` importado desde el dominio (que no puede):
  `createListWorkGroupMembers({ workGroups, pagination })`, con `pagination` cableado en
  `lib/composition` sobre `lib/shared/pagination.ts` —la **misma** implementación que usa el resto de
  la aplicación—. **Esto se aparta de QC-66 § 12.4**, que descartó inyectar la paginación en el caso
  de uso, y el motivo de apartarse es exactamente el que allí no existía: allí el filtro y el corte
  vivían los dos en SQL; aquí el filtro vive en el dominio, así que el corte tiene que vivir con él o
  el total miente. Ventaja añadida: el defecto y el tope quedan probados **en unitario**.
- **El listado de grupos NO cambia**: sigue paginando en SQL (§ 6), porque su filtro —empresa y
  vivos— sí es expresable en el `WHERE` sin copiar ninguna regla.

**Lo que esto cuesta, dicho entero:** se leen todas las filas de pertenencia del grupo para servir
una página de 10. Es una lectura acotada por el tamaño de un grupo de trabajo dentro de una empresa,
con la PK `(work_group_id, user_id)` cubriendo la consulta, y es el precio de que el total sea
verdadero y de que la regla del estado efectivo siga viviendo en **un solo sitio** (QC-78 R7).

---

## 6. El listado de grupos (R24–R27)

Contrato compartido de QC-57, **el que `identity` ya tiene** desde QC-66 —no se copia nada—:

```ts
export const WORK_GROUP_QUERYABLE: ListQueryable = {
  sortable: ['name', 'createdAt'],
  filterable: {},      // ningun filtro declarado: ninguna decision pide uno
  searchable: true,    // busqueda por nombre
};
```

- **Orden por defecto `name ASC, id ASC`** (R25). El `id` no es adorno: dos grupos vivos de la misma
  empresa **no** pueden llamarse igual (R12), pero dos de **empresas distintas** sí, y el listado de
  una empresa podría crecer con un orden pedido por otra columna (`createdAt`), donde el empate es
  trivial. Cuando llega un `sort` de la lista blanca, se aplica esa columna y **se conserva `id ASC`
  como último desempate**.
- **`deletedAt` no está en ninguna de las dos listas**, y `NEVER_QUERYABLE` lo bloquea además por su
  cuenta: nadie puede pedir ver los grupos dados de baja por la puerta del filtro (R9, R40).
- **10/25 desde `lib/shared/pagination.ts`, consumido en el driven** (el dominio no puede importar
  `lib/shared/**`). Mismo reparto que QC-66 § 8.2.
- **`filterable` vacío hoy no cierra nada** (R27): añadir mañana un filtro es **una línea** aquí y no
  cambia la firma, que es la lección QC-38 → QC-39 que la decisión 13 hereda.

**Y la de los miembros**, en el mismo archivo, para que la consulta de R51–R54 use el mismo contrato:

```ts
export const WORK_GROUP_MEMBER_QUERYABLE: ListQueryable = {
  sortable: [],        // el orden es FIJO (R22): apellidos, nombres, id
  filterable: {},      // el unico filtro es el de R19, y no lo pide quien llama
  searchable: false,
};
```

Las tres listas vacías **no son un olvido**: son la forma de decir «de la consulta compartida, aquí
solo se usan la página y el tamaño», y `sanitizeListQuery` **omite** lo que no esté declarado —y lo
anota por el puerto de registro de QC-57— en vez de romper. Si mañana QC-85 pide buscar dentro de un
grupo, es **una línea** aquí y la firma no cambia (R54).

---

## 7. Errores: siete códigos nuevos en el catálogo único (R43)

### 7.1 Las clases, al final de `domain/errors.ts`

| Clase | `code` | Cuándo |
| --- | --- | --- |
| `WorkGroupNotFoundError` | `work_group_not_found` | el grupo no existe, está dado de baja o es de **otra empresa** (R8, R9) |
| `WorkGroupDuplicateNameError` | `work_group_duplicate_name` | choque contra `work_groups_name_unique`, al crear y al renombrar (R12, R17) |
| `WorkGroupMemberExistsError` | `work_group_member_exists` | la persona ya pertenece **y se ve** en la lista (R30) |
| `WorkGroupMemberExistsPendingError` | `work_group_member_exists_pending` | ya pertenece; no se ve porque su cuenta está **pendiente** (R31) |
| `WorkGroupMemberExistsInactiveError` | `work_group_member_exists_inactive` | ya pertenece; no se ve porque su cuenta está **inactiva** (R31) |
| `WorkGroupMemberExistsBlockedError` | `work_group_member_exists_blocked` | ya pertenece; no se ve porque su cuenta está **bloqueada** (R31) |
| `WorkGroupMemberNotFoundError` | `work_group_member_not_found` | se saca a quien no pertenece (R36) |

**La persona inexistente, borrada o de otra empresa reutiliza `UserNotFoundError` / `user_not_found`**
(R29): ya existe desde QC-66 con exactamente ese significado —«no existe, está borrado, es de otra
empresa»— y crear un octavo código para repetirlo sería partir un mensaje en dos. El grupo de otra
empresa responde `work_group_not_found` y **no** `unauthorized`, por el mismo criterio de oráculo de
existencia de QC-38, QC-43 y QC-66.

### 7.2 El hallazgo que hay que decir: el mensaje **no puede** llevar el nombre del grupo

La decisión 5 pide un error que diga «ya pertenece a **Turno noche**; su cuenta está bloqueada». Con
**QC-70 tal y como está mergeado eso no es implementable literalmente**, y no se cambia la decisión:
se dice aquí, como pide el encargo.

- `IdentityError` **no admite un texto** desde el sitio que lanza (QC-70 R7, `errors.ts` L19); el
  mensaje sale del catálogo **a partir del código**, y el catálogo no interpola: `errorMessage(code)`
  devuelve una constante (`error-message.ts` L11).
- El dato variable viaja en `diagnostic`, que por QC-70 R28/R29 va al **registro del servidor y solo
  ahí**: no cruza al navegador. Meter ahí el nombre del grupo **no** lo pondría delante del operador.

**Lo que sí se entrega, que es la sustancia de la decisión:** el error dice **que ya pertenece** y
**por qué no se ve**, con un `code` distinto por motivo, y sus textos son explícitos —p. ej.
`errors.work_group_member_exists_blocked`: «Esa persona ya pertenece al grupo; no aparece en la lista
porque su cuenta está bloqueada.»—. **El nombre del grupo lo pone la pantalla**, que es QC-85 y que
sabe en qué grupo está el operador porque acaba de abrirlo. Tres códigos y no uno: QC-70 R4 prohíbe
que dos códigos compartan texto, y «pendiente», «inactiva» y «bloqueada» son tres frases distintas —y
tres acciones distintas para quien las lee—.

**Si el humano quiere el nombre del grupo DENTRO del mensaje**, eso es una enmienda a QC-70
(interpolación en el catálogo) y es **otra ficha**: no se abre aquí por la puerta de atrás.

### 7.3 El ripple del catálogo compartido, medido

Pasar de **32** a **39** códigos pone en rojo **un** archivo ajeno, leído en el árbol de esta rama:

| Archivo | Qué afirma hoy | Qué pasa a afirmar |
| --- | --- | --- |
| `tests/unit/errores/catalogo.test.ts` | L45 `expect(ERROR_CODES).toHaveLength(32)` | `39`. El comentario de L43-44 gana la cita de esta ficha. **Ninguna otra expectativa cambia**: las demás se derivan de `ERROR_CODES` |

`ERROR_MESSAGE_KEY` y `ERROR_MESSAGES_ES` no necesitan ningún ajuste de conteo: el
`satisfies Record<ErrorCode, string>` pone rojo el **typecheck** si falta una clave, que es el
mecanismo correcto. **Cómo se caza un segundo archivo**: antes de cerrar la tanda se corre
`pnpm exec vitest related --run lib/modules/errores/domain/error-codes.ts`. Se toca **en la misma
tanda** que el código (decisión heredada de QC-66 § 2), nunca al final.

**Ninguna expectativa se elimina ni se debilita** (R43): ni un `expect` borrado, ni un `toEqual`
degradado, ni un caso saltado.

---

## 8. Las siete Server Actions (R42) y el punto de composición (R44)

`adapters/driving/work-group-actions.ts`, con `'use server'`:

- **Mutaciones** (`create`, `rename`, `delete`, `addMember`, `removeMember`) reciben **`FormData`**;
  **consultas** (`list`, `listMembers`) reciben argumentos ya tipados.
- **La acción no decide nada**: resuelve el actor de las dos caras de la sesión, traduce entrada y
  traduce el error **por su `code`** con el traductor único de QC-70. Ni una regla de negocio, ni una
  segunda comprobación de permiso.
- **Ningún route handler y ningún `fetch` a ruta propia**; **sin `revalidatePath`**: no hay ninguna
  ruta que revalidar todavía (R48), y adivinar la de QC-85 sería inventarla.
- **No se reexportan desde `index.ts`** (R44): un `'use server'` en el cierre transitivo del contrato
  lo haría inimportable desde un componente de cliente. QC-85 las importa por su **ruta exacta**,
  igual que QC-67 con las de QC-66 y QC-94.
- `lib/composition/index.ts` gana el `workGroupRepository` y las siete claves de la fachada
  `identity`, **sin reordenar ni reformatear nada de lo que hay** (hay otras sesiones tocando este
  archivo).

---

## 9. Alternativas descartadas

### 9.1 Filtrar los miembros con `WHERE account_status = 'active'` en SQL — **descartada**

Es lo obvio y permitiría paginar. Se descarta porque **no cumple la decisión 3**: una cuenta bloqueada
por la política de intentos puede tener la columna en `active` con un `locked_until` vigente (QC-78
R11), así que ese `WHERE` la **mostraría**; y una bloqueada con el plazo ya vencido **no volvería
sola**, habría que esperar a que alguien escribiera la fila. Además sería una **segunda copia** de la
regla del estado efectivo, que QC-78 R7 puso en una sola función a propósito. § 5.2.

### 9.1.b Paginar los miembros **en SQL**, con el filtro dentro del `WHERE` — **descartada**

Es la forma natural de paginar y la que usa el listado de grupos. Se descarta por el mismo motivo que
9.1 y por uno más: el `WHERE` tendría que reproducir la regla del estado efectivo —columna **y**
plazo **y** reloj—, que es una **segunda copia** de `effectiveAccountStatus` (QC-78 R7), y sería una
copia especialmente cara de detectar, porque la divergencia solo se ve en las cuentas bloqueadas con
el plazo recién vencido. La alternativa intermedia —`LIMIT` en SQL y filtro después— es peor todavía:
daría páginas de tamaño irregular y un total que promete personas que la pantalla no muestra (R52).
§ 5.3.

### 9.2 Un único código `work_group_member_exists` con el motivo en el `diagnostic` — **descartada**

Un código menos y el motivo viajando como dato. Se descarta porque el `diagnostic` de QC-70 va al
**log del servidor y solo ahí** (R28, R29): el operador leería «ya pertenece» sobre una lista donde
esa persona no aparece, que es **exactamente** el caso que la decisión 5 quiere cerrar. § 7.2.

### 9.3 Editar el grupo mandando su nombre **y** su lista de miembros — **descartada por el humano**

Consta para que no se reconsidere: **decisión 6**. Si dos encargados editan a la vez, la segunda
escritura **borra en silencio** lo que hizo la primera, y el error no puede decir **a quién** se
refiere. El diseño lo hace además inexpresable: ningún esquema del borde acepta una lista (§ 4.1).

### 9.4 Un módulo nuevo `grupos` — **descartada**

Lo sugiere el nombre de la ficha. Se descarta: las dos tablas llevan `/// @module identity` desde
QC-83 (su decisión 15 y su R22), y `guard-arquitectura-modulos.test.ts` prohíbe que el driven de otro
módulo consulte `prisma.workGroup`. Mudar la propiedad arrastraría QC-83 entera y no compraría nada:
un grupo es un conjunto de personas y las personas viven en `identity`.

### 9.5 Crear permisos `grupos.consultar` / `grupos.modificar` — **descartada por el humano**

**Decisión 1**, con su precio escrito: quien administra usuarios administra sus grupos. Además
costaría una **migración de datos** del catálogo (QC-66 § 3) y pondría en rojo los cinco tests que hoy
afirman **quince** entradas, que R47 declara intocables.

### 9.6 Borrar las pertenencias al dar de baja el grupo — **descartada por el humano**

**Decisión 8**: se quedan, así no se pierde quién estaba dentro y la baja sigue siendo del **grupo**.
Borrarlas tampoco habría hecho nada por los pedidos: QC-86 congeló a las **personas**, no la
pertenencia (R39).

### 9.7 Restaurar un grupo dado de baja — **descartada por el humano**

**Decisión 8** (R40). Choca además con que el nombre queda **libre** (R41): otro grupo puede haberlo
tomado, y «restaurar» fallaría con un duplicado incomprensible. Mismo razonamiento que QC-66 § 12.8.

---

## 10. Cómo se verifica

**Sin E2E, y con motivo** (decisión 16, R48): esta ficha es backend puro y no aporta ningún flujo
navegable; Playwright no tendría pantalla que abrir. Lo trae **QC-85**, igual que QC-67 lo trajo para
QC-66. **El diferimiento se declara aquí, no al final.**

| Nivel | Archivo | Qué demuestra |
| --- | --- | --- |
| Unit (dominio) | `tests/unit/identity/grupos/authorization.test.ts` | R1–R5: los **siete** casos de uso rechazan al actor sin el código **sin tocar ningún puerto** (dobles que lanzan si los llaman); `modificar` no concede `consultar` ni al revés; el rol del actor no participa |
| Unit (dominio) | `tests/unit/identity/grupos/work-group-service.test.ts` | R8–R18, R28–R38, R40 con dobles del puerto: ámbito de empresa, grupo de baja como inexistente, crear/renombrar/dar de baja, meter y sacar |
| Unit (dominio) | `tests/unit/identity/grupos/members-filter.test.ts` | **R19, R20, R21, R22, R23**: `pending` no sale; `blocked` con plazo vigente no sale; el **mismo doble** con el plazo vencido y **sin ninguna escritura** vuelve a salir; orden determinista; el caso de uso no llama a ningún método de escritura |
| Unit (dominio) | `tests/unit/identity/grupos/members-pagination.test.ts` | **R51, R52, R53, R54**: defecto 10 y tope 25 (pedir 100 da 25, no un error); el **total cuenta solo a las filtradas** —un grupo con 12 miembros de los que 4 están ocultos devuelve `total: 8` y **una** página—; recorrer todas las páginas devuelve a **cada** persona **exactamente una vez**, con dos homónimas dentro; y la forma de la página es la misma que la del listado de grupos |
| Unit (dominio) | `tests/unit/identity/grupos/add-member-errors.test.ts` | **R30, R31**: los cuatro caminos del duplicado (visible, `pending`, `inactive`, `blocked`) devuelven **cuatro `code` distintos**, y ninguno es el de R30 salvo el visible |
| Unit (borde) | `tests/unit/identity/grupos/work-group-input.test.ts` | R11, R14, R33: los esquemas; mandar `companyId` o una lista de miembros **falla** el `parse` |
| Unit (driving) | `tests/unit/identity/grupos/work-group-actions.test.ts` | R6, R42, R43: `FormData` en las cinco mutaciones, argumento tipado en las dos consultas, actor de las dos caras de la sesión, traducción por `code` |
| Unit (alcance) | `tests/unit/identity/grupos/scope.test.ts` | **R46, R47, R48, R49, R50**: cero diff en `db/schema.prisma` y en `db/migrations/`; `PERMISSIONS.length === 15`; nada nuevo bajo `app/`, `components/` ni `e2e/`; `package.json` sin dependencias nuevas; ningún archivo de la feature nombra `order_assignments` ni `prisma.orderAssignment` |
| Integración | `tests/integration/identity/work-group-crud.int.test.ts` | R8, R9, R12, R15, R17, R24, R25, R26, R34, R35, R37, R38, R41 contra Postgres real, incluido que el duplicado llega del **`SQLSTATE 23505`** del índice parcial y que la baja **libera** el nombre |
| Integración | `tests/integration/identity/work-group-membership.int.test.ts` | R19, R20, R21, R28, R29, R30, R31, R32, R36: miembros con las cuatro cuentas; **dos inserciones concurrentes** de la misma persona acaban en **una sola fila** y la segunda da el error de duplicado |
| Integración | `tests/integration/identity/work-group-assignments.int.test.ts` | **R18 y R39**, el test que la ficha exige: un pedido con un grupo aplicado (QC-86); se **renombra** y se **da de baja** el grupo; las filas de `order_assignments` quedan **byte a byte iguales** —mismas personas, misma referencia, mismo nombre congelado— y el pedido **conserva sus responsables** |
| Ajeno (se actualiza) | `tests/unit/errores/catalogo.test.ts` | R43 (§ 7.3) |
| Guardia (ya existe) | `guard-arquitectura-modulos.test.ts`, `guard-rls-force.test.ts`, `guard-dependencias-aprobadas.test.ts`, `guard-catalogo-de-errores.test.ts`, `guard-permisos-sembrados.test.ts` | R44, R7, R49, R43, R47 |

**Cuatro avisos para el implementer:**

- **El test de R39 lee `order_assignments` directamente con Prisma, y eso es legal en un test**: la
  frontera de módulo de `guard-arquitectura-modulos` vigila `lib/modules/**`, no `tests/**`. Lo que
  **no** puede hacer es que un archivo de producción de esta feature toque esa tabla (R50).
- **Se afirma sobre el `SQLSTATE`** (`23505`), nunca sobre el texto del mensaje: en esta máquina
  Postgres responde en español.
- **El test de R21 no escribe nada para «desbloquear»**: cambia el `now` que entra al caso de uso. Si
  hiciera falta un `UPDATE`, el requisito estaría mal implementado.
- **El test de concurrencia de R32 necesita dos conexiones de verdad**, no dos promesas sobre la
  misma transacción.

---

## 11. Dependencias de terceros (R49)

**Ninguna dependencia nueva, y ninguna propuesta que abrir** (decisión 17). Todo lo que este diseño
necesita está instalado y registrado en `docs/dependencias.md`: `zod` (borde), `@prisma/client`
(persistencia y la transacción de § 5.1), `vitest`. La paginación ya está en `lib/shared/pagination.ts`
y la normalización del nombre en `domain/work-group-name.ts`.

Los cuatro checks de `docs/architecture.md > Dependencias de terceros` **no llegan a evaluarse**
porque no se propone ninguna librería. Una candidata que podría parecerlo y no lo es: una librería de
*slug*/normalización de texto (`slugify`, `unidecode`) — **no entra**: la normalización del nombre de
grupo ya existe, es la **única definición** publicada por el contrato (R13), y sustituirla cambiaría
en silencio el contenido de la columna `name_normalized` que QC-83 ya escribió.

Si durante la implementación apareciera la tentación de instalar algo, **se para y se propone**, no se
instala (regla 7 de `CLAUDE.md`); `tests/guards/guard-dependencias-aprobadas.test.ts` lo pondría en
rojo igualmente.

---

## 12. Hallazgos que este diseño deja escritos y no resuelve por su cuenta

1. **«Las seis operaciones» eran siete, y el número se corrigió al aprobar (F1.4).** El Alcance
   enumera siete casos de uso; la tabla decía «las seis», heredando la redacción de QC-66. **Ninguna
   decisión cambió**: se aplican a la enumeración completa del Alcance, que es lo que pedían en
   sustancia.
2. **El mensaje del duplicado oculto no puede nombrar el grupo** con QC-70 tal y como está: § 7.2. Se
   entrega la sustancia (dice que ya pertenece y por qué no se ve, con un código por motivo) y se
   deja escrito qué haría falta para lo literal (interpolación en el catálogo = otra ficha).
3. **P2 quedó CERRADA el 2026-09-11 al aprobar el spec (F1.4): la consulta de miembros SÍ se
   pagina.** Es la **fila 18** de la tabla de decisiones y la escriben **R51–R54**. El efecto en este
   diseño está en **§ 5.3** —se pagina en el caso de uso, después del filtro, con el 10/25 inyectado
   por `deps`—, en § 4.2, en § 6 (`WORK_GROUP_MEMBER_QUERYABLE`) y en la alternativa descartada
   § 9.1.b. El resto del diseño no cambia.
4. **P1 del humano sigue abierta y no bloquea**: a quién se puede **asignar** según su estado de
   cuenta es de **QC-87**; esta ficha solo decide qué se **muestra** (R50).
