# QC-85 — pantalla-de-grupos-de-trabajo · design.md

> El **QUÉ** está en `requirements.md`, con las 13 decisiones cerradas del humano arriba. Aquí va
> el **CÓMO**: qué archivos nacen, qué archivos ya existentes se tocan, qué contratos se consumen,
> qué alternativas se descartaron y qué hallazgos deja la lectura del código mergeado.
>
> **Regla de oro de esta ficha:** `lib/modules/` **no se abre**. Si el diseño obligara a tocarlo,
> el diseño está mal (R36).

---

## 1. Punto de partida: lo que ya existe y no se vuelve a montar

| Pieza | Dónde vive | Quién la trajo |
| --- | --- | --- |
| Pantalla de usuarios y su corte por permiso | `app/(private)/configuracion/usuarios/page.tsx` | QC-67 |
| Tabla de datos compartida (paginación 10/25, búsqueda, orden, fijado de columnas) | `components/shared/data-table` (barrel) | QC-55 / QC-57 |
| Panel lateral (`Sheet`) y diálogo de confirmación (`AlertDialog`) | `components/ui/sheet.tsx`, `components/ui/alert-dialog.tsx` | QC-45 / QC-67 |
| Estados de vacío / cargando / error de lista | `.../usuarios/components/user-list-{empty,skeleton,error}.tsx` | QC-67 |
| Parser y serializador de parámetros de lista | `.../usuarios/components/user-list-params.ts` | QC-67 |
| Traductor de error a `ErrorState` y aviso del inesperado | `lib/modules/errores`, `components/shared/unexpected-error-notice` | QC-70 / QC-71 |
| Las **siete** Server Actions de grupos | `lib/modules/identity/adapters/driving/work-group-actions.ts` | QC-84 |
| La consulta de personas | `lib/modules/identity/adapters/driving/user-actions.ts` → `listUsersAction` | QC-66 |
| Contrato público (tipos, esquemas, listas blancas, normalización) | `lib/modules/identity/index.ts` | QC-83 / QC-84 |
| `<Toaster />`, sidebar, `<main>` | `app/(private)/layout.tsx` | QC-11 |

**Nada de esa columna se copia, se reescribe ni se modifica.** La única excepción son los dos
archivos de la ruta que sí se tocan (§ 2.2).

---

## 2. Estructura de archivos

### 2.1 Archivos NUEVOS — todos bajo `app/(private)/configuracion/usuarios/components/`

| Archivo | Frontera | Qué hace |
| --- | --- | --- |
| `usuarios-tabs.ts` | puro | `TAB_PARAM`, `USERS_TAB`, `GROUPS_TAB`, `USUARIOS_TABS`, `parseUsuariosTab(searchParams)`, `usuariosTabHref(tab)`. Sin DOM, sin React, sin `next/*` (R1, R2, R3) |
| `usuarios-tabs-switch.tsx` | cliente | El conmutador: dos disparadores que navegan con `router.push(usuariosTabHref(...))`. No renderiza contenido (R3) |
| `work-group-labels.ts` | puro | Copy y `data-testid` de la pestaña de grupos; el catálogo de constantes que los tests usan en vez del copy (R41) |
| `work-group-list-params.ts` | puro | `parseWorkGroupListParams` / `buildWorkGroupListQuery` / `workGroupListHref`. Hermano de `user-list-params.ts`: **sin filtros**, con búsqueda, y el orden acotado contra `WORK_GROUP_QUERYABLE.sortable` (R15, R16, R17). Conserva el `tab` en el `href` (R3, R7) |
| `work-group-columns.tsx` | cliente | **Una** columna de datos (`name`) + la de acciones. Ningún conteo (R12) |
| `work-group-list-section.tsx` | servidor `async` | Pide `listWorkGroupsAction(params)` y despacha a vacío / error / tabla (R18, R19) |
| `work-group-list-empty.tsx` | servidor | Vacío con «limpiar búsqueda» y «volver a la primera página» (R18) |
| `work-group-list-error.tsx` | servidor | Error con mensaje devuelto y reintentar (R19) |
| `work-group-list-skeleton.tsx` | servidor | Esqueleto de N filas (R19) |
| `work-group-table.tsx` | cliente | Dueña del estado de las escrituras: monta **una** instancia del panel y **una** del diálogo para toda la página, como `user-table.tsx` (R9, R20) |
| `work-group-sheet.tsx` | cliente | El panel: arriba el formulario del nombre, abajo los miembros. Un solo panel para alta y edición (R20, R25) |
| `work-group-form.tsx` | cliente | El campo del nombre, su validación **en vivo** y el envío a crear o renombrar (R21, R22, R23, R24) |
| `work-group-members.tsx` | cliente | Lista paginada de miembros, buscador para añadir y acción para sacar (R25–R32) |
| `delete-work-group-dialog.tsx` | cliente | Confirmación nombrando al grupo (R33, R34) |

Los nombres de esas catorce piezas se republican **enteros** por el barrel
`.../usuarios/components/index.ts` (R38): `usuarios-convenciones.test.ts` ya ata los dos sentidos
—cada archivo aparece y cada nombre exportado está republicado—, así que el barrel no es opcional.

### 2.2 Archivos EXISTENTES que se tocan — exactamente dos

1. **`app/(private)/configuracion/usuarios/page.tsx`** — resuelve la pestaña después del corte por
   permiso y renderiza el conmutador más el contenido de **la pestaña vigente** (R1, R6).
2. **`app/(private)/configuracion/usuarios/components/index.ts`** — republica lo nuevo (R38).

Se toca `page.tsx` y **no** `user-list-params.ts`: el listado de personas es la pestaña por
defecto, así que su `href` canónico **sin** `tab` sigue siendo correcto y `parse(build(p)) === p`
se conserva sin tocar una línea (R6). Es el precio que la decisión 1 declara —«hay que tocar la
pantalla de QC-67»— pagado al mínimo.

### 2.3 Archivos que NO se tocan, y son gate si aparecen en el diff

`lib/modules/**` entero · `db/schema.prisma` y `db/migrations/**` · `lib/composition/**` ·
`lib/shared/navigation/private-nav.ts` · `lib/shared/routes.ts` (ni `USERS_ROUTE` ni
`PRIVATE_ROUTE_PREFIXES`) · `components/shared/data-table/**` · `components/ui/**` escrito a mano ·
`package.json` · los `*.spec.ts` de `e2e/` que ya existen.

---

## 3. La pestaña: cómo se refleja en la dirección

```
/configuracion/usuarios                       → pestaña personas (por defecto)
/configuracion/usuarios?tab=personas          → pestaña personas (forma explícita)
/configuracion/usuarios?tab=grupos            → pestaña grupos
/configuracion/usuarios?tab=cualquier-cosa    → pestaña personas, sin error (R2)
```

- `TAB_PARAM = 'tab'`, `USERS_TAB = 'personas'`, `GROUPS_TAB = 'grupos'`. Los dos valores viven en
  `USUARIOS_TABS` y de ahí salen el conmutador, el parser y los tests (R1).
- `parseUsuariosTab` sigue la convención de `user-list-params.ts`: de un parámetro repetido se toma
  el **primer** valor, y lo desconocido **no es un error**, es el valor por defecto (R2, R17).
- **El contenido lo decide el servidor**, no el cliente. `page.tsx` renderiza **una** de las dos
  secciones, envuelta en su `<Suspense>` con `key` propia; el conmutador es un componente de
  cliente que solo navega. Consecuencia buscada: **la lista de grupos no se consulta** para quien
  nunca abre esa pestaña, y `?tab=grupos` compartido por enlace pinta grupos ya en el HTML
  servido (R3).
- **Los parámetros de lista de cada pestaña son independientes** (R7): el `href` del conmutador
  lleva **solo** `tab`, sin arrastrar `page`, `sort`, `q` ni `status`. Un `sort=lastNames:asc` de
  personas aplicado a grupos sería un campo que la lista blanca de grupos no declara —se omitiría
  en silencio— y un `status=pending` sería un filtro inexistente. Se corta de raíz: cambiar de
  pestaña empieza limpio.
- El **corte por permiso sigue siendo el primero del cuerpo** y se resuelve **antes** de mirar
  `searchParams`, tal como está hoy (R8). `canModifyUsers()` de `page.tsx` se reutiliza tal cual:
  la decisión de R9 es la **misma** que la de las escrituras de personas.

**Primitiva del conmutador.** shadcn/ui en este repo monta sobre **`@base-ui/react`**, que ya está
en `package.json` y en `docs/dependencias.md` (fila `heredada`). `components/ui/tabs.tsx` se añade
**por la CLI de shadcn**, sin escribirlo a mano (R37). Ver § 9 para el check y su salida si falla.

---

## 4. El listado de grupos

### 4.1 Contrato de entrada y salida

```ts
listWorkGroupsAction(query: unknown): Promise<
  | { status: 'success'; data: Page<WorkGroupRow> }   // WorkGroupRow = { id, name }
  | ErrorState                                        // { status: 'error', code, message, ... }
>
```

`DataTableParams` es **campo a campo** la misma forma que `ListQuery`, y
`createListQuerySchema()` es un `z.strictObject`: el objeto acotado se pasa **entero y sin
traducir**, exactamente como hace `user-list-section.tsx`. Traducirlo aquí solo podría introducir
una clave de más.

### 4.2 Acotado de parámetros (`work-group-list-params.ts`)

| Parámetro | Fuente de verdad | Comportamiento ante basura |
| --- | --- | --- |
| `page` | entero positivo | → `1` |
| `pageSize` | `PAGE_SIZE_OPTIONS` del barrel de la tabla | → `DEFAULT_PAGE_SIZE` (10) |
| `sort` | `WORK_GROUP_QUERYABLE.sortable` (`['name','createdAt']`), **leída del contrato** | → `null` (orden por defecto del adaptador: `name ASC, id ASC`) |
| `filters` | **siempre `{}`** — `WORK_GROUP_QUERYABLE.filterable` está vacío (R16) | n/a |
| `q` | `searchable: true` | `trim()`; vacío no se emite |

`createdAt` es ordenable en el contrato pero **no es una columna visible** (R12: `WorkGroupRow` no
la trae). No se pinta ni se ofrece ordenar por ella desde la cabecera: la lista blanca dice lo que
la consulta *admite*, no lo que la tabla *muestra*. Si un enlace trae `sort=createdAt:desc`, se
acota como válido y la consulta lo respeta; eso es R17 funcionando, no una columna oculta.

### 4.3 Los tres estados

Copiados de la pestaña de personas, pieza por pieza: `<Suspense key={buildWorkGroupListQuery(...)}>`
con esqueleto, sección `async` que despacha, vacío con las dos salidas y error con reintento. El
vacío **no** ofrece «crea el primero» —mismo criterio que QC-67 R18—: el disparador de alta ya está
arriba, visible, cuando hay permiso.

---

## 5. El panel lateral: nombre arriba, miembros abajo

Un solo `Sheet` para los dos modos, como `user-sheet.tsx`:

- **Alta** (`group === null`): solo el formulario del nombre. **No** hay lista de miembros, porque
  el grupo todavía no existe y no hay identificador al que añadir a nadie. Al guardar con éxito se
  cierra el panel (R35); meter gente es abrirlo otra vez sobre el grupo ya creado.
- **Edición** (`group !== null`): formulario del nombre **precargado con `group.name`** y, debajo,
  el bloque de miembros. **No hace falta una segunda lectura de ficha** —a diferencia de QC-67, que
  pedía `getUserAction` porque la fila traía seis claves y el formulario necesitaba nueve—: aquí la
  fila trae `{ id, name }` y el formulario necesita `name`. **QC-84 no publica ninguna consulta de
  grupo individual**, y esta ficha no la echa de menos.

### 5.1 Validación del nombre, en vivo (R21, R22)

Dos comprobaciones, las dos **derivadas del contrato** y ninguna escrita a mano:

1. **Forma**: `createWorkGroupSchema` / `renameWorkGroupSchema` (recorte, no vacío,
   `WORK_GROUP_NAME_MAX_LENGTH`). Se importan de `@/lib/modules/identity` —son dominio puro, el
   contrato es importable desde cliente— y se evalúan con `safeParse` en cada pulsación.
2. **Contenido**: `normalizeWorkGroupName(name) !== ''`. Esa función es la **única** definición de
   «mismo nombre de grupo» (QC-83 R3) y quita todo lo que no sea `[a-z0-9]`; si su resultado es
   vacío, el nombre **no tiene ni una letra ni un número**. Escribir aquí un
   `/[\p{L}\p{N}]/u` propio sería una segunda definición libre de divergir el día que la
   normalización cambie: el requisito es explícitamente que se derive de ella.

Mientras cualquiera de las dos falle: mensaje bajo el campo (`aria-describedby`, `aria-invalid`) y
**el envío no ocurre**. Es lo que cierra la pendiente que QC-84 dejó: «!!!» y «¿¿¿» normalizan los
dos a `''` y colisionarían en el índice único; desde la pantalla dejan de ser alcanzables. **El
backend no se toca**: su R12 sigue siendo la garantía real, porque otro cliente podría intentarlo.

### 5.2 Envío

| Modo | Action | `FormData` |
| --- | --- | --- |
| Alta | `createWorkGroupAction` | `name` |
| Edición | `renameWorkGroupAction` | `workGroupId`, `name` |

Las cinco mutaciones de QC-84 comen **`FormData`** y se usan con `useActionState`; las dos
consultas reciben **argumentos tipados** y se invocan directamente. El estado inicial
`{ status: 'idle' }` lo construye **esta pantalla**: un archivo `'use server'` no puede exportar
constantes (R36).

### 5.3 Los miembros (`work-group-members.tsx`)

```ts
listWorkGroupMembersAction(workGroupId: string, query: unknown): Promise<
  | { status: 'success'; data: Page<WorkGroupMemberRow> }  // { id, displayName }
  | ErrorState
>
```

- **La paginación de miembros vive en estado de React del panel, no en la URL.** El panel no está
  reflejado en la dirección (R20: cerrarlo devuelve a la lista con los mismos parámetros), así que
  una página de miembros en la URL sería estado huérfano de un panel que puede estar cerrado.
  `WORK_GROUP_MEMBER_QUERYABLE` tiene las tres listas vacías: solo viajan `page` y `pageSize`
  (R26). `pageSize` = `DEFAULT_PAGE_SIZE` (10), que es además el defecto que QC-84 R51 aplica.
- **Presentación mínima**: `displayName` y la acción de sacar. Nada más existe en el tipo (R31).
- **Cargando y error dentro del panel** (R27), con el mismo patrón de tres estados de
  `user-sheet.tsx`, incluida la salvaguarda de «la respuesta solo vale si es la del grupo abierto»
  para que una respuesta tardía no pinte los miembros de otro grupo.
- **Buscador para añadir** (R28): `listUsersAction({ page: 1, pageSize: 10, sort: null, filters: {},
  search })` con *debounce* (`SEARCH_DEBOUNCE_MS` del barrel de la tabla). Es la consulta de
  personas que QC-66 ya publicó y que la pestaña de al lado ya usa; se autoriza con
  `usuarios.consultar`, el mismo permiso que la pantalla. **No se crea ninguna consulta de
  «candidatos»**: sería backend (R36). Elegir a una persona envía `addWorkGroupMemberAction` con
  `workGroupId` + `userId`, **de a una** (el esquema del borde no admite listas).
- **Sacar** (R32): `removeWorkGroupMemberAction` con los mismos dos campos.
- **Tras cualquier éxito se vuelve a pedir la lista de miembros** y se pinta lo que devuelva (R30).
  Nunca se inserta ni se retira una fila en el cliente: es lo que hace que una persona `pending`
  —que **sí entra** en el grupo pero **no se ve** (§ 10.2)— no aparezca fantasma en la lista.

---

## 6. El borrado

`AlertDialog` calcado de `delete-user-dialog.tsx`: nombra el grupo (`{group.name}`), advierte que
no se puede deshacer, y el **único** camino hasta `deleteWorkGroupAction` es enviar el formulario
del botón de confirmar (R33). Un rechazo se pinta **dentro** del diálogo, por `code`, con el
diálogo abierto y la fila intacta (R34). El diálogo se monta solo mientras está abierto, así que un
rechazo anterior no reaparece.

---

## 7. Errores: qué código se pinta y dónde

Todos llegan como `ErrorState` (`{ status: 'error', code, message, ... }`), traducidos por el
`createErrorStateTranslator` de QC-70 **por `code` y nunca por texto**.

| `code` | Origen | Dónde se presenta |
| --- | --- | --- |
| `unauthorized` | cualquiera de las siete | Estado de error de la lista, o región del panel/diálogo; **sin datos** (R11) |
| `invalid_input` | cualquier mutación | Región de error del formulario (R24) |
| `work_group_not_found` | renombrar, borrar, meter, sacar, listar miembros | Región del panel o del diálogo, según quién falló |
| `work_group_duplicate_name` | crear, renombrar | **En línea, junto al campo del nombre** (R24) |
| `work_group_member_exists` | meter | Región del buscador del panel (R29) |
| `work_group_member_exists_pending` | meter | Región del buscador — **frase propia**, distinta (R29) |
| `work_group_member_exists_inactive` | meter | Región del buscador — **frase propia**, distinta (R29) |
| `work_group_member_exists_blocked` | meter | Región del buscador — **frase propia**, distinta (R29) |
| `user_not_found` | meter | Región del buscador |
| `work_group_member_not_found` | sacar | Región del panel, sin retirar a la persona (R32) |
| `unexpected` | cualquiera | `<UnexpectedErrorNotice>`, que conserva el identificador de petición (QC-71 R17) |

**Los tres «existe pero no se ve» son tres casos y no uno** porque QC-84 los separó por escrito
(`design.md > 7.2` de QC-84): «pendiente», «inactiva» y «bloqueada» son tres frases y tres
acciones distintas para quien las lee. El mensaje llega ya traducido del catálogo; la pantalla
decide **dónde** pintarlo, nunca **qué** dice.

---

## 8. Modelo de datos, rutas y migraciones

**Ninguno de los tres cambia.**

- **Modelo de datos**: cero tablas, cero columnas, cero índices, cero RLS, cero migraciones. El
  modelo lo fijó QC-83 y esta ficha solo lee y escribe a través de los casos de uso de QC-84 (R36).
- **Rutas**: cero rutas nuevas. `USERS_ROUTE` y `PRIVATE_ROUTE_PREFIXES` quedan como están, y por
  eso `guard-rutas-privadas-cubiertas` —que compara la lista de prefijos con las carpetas que
  tienen `page.tsx` bajo `app/(private)/`— sigue verde por los dos sentidos sin tocar nada (R4).
- **Endpoints**: ningún route handler y ningún `fetch` a ruta propia. Todo entra por Server
  Actions importadas **por ruta exacta**; nunca por `@/lib/modules/identity`, que un `'use server'`
  en su cierre transitivo volvería inimportable desde cliente (R36, guardia de arquitectura).
- **Navegación**: `PRIVATE_NAV_ITEMS` intacto (R5). Las guardias de QC-75
  (`guard-nav-permisos-declarados`, `guard-nav-serializable`,
  `private-nav-usuarios.test.ts`) siguen verdes **sin excepciones nombradas**.

---

## 9. Dependencias de terceros

**Propuesta: ninguna dependencia nueva** (decisión cerrada 13, R37).

Lo único que el repo no tiene hoy es el archivo `components/ui/tabs.tsx`. Eso **no es una
dependencia**: es una primitiva que la CLI de shadcn copia al repo, como ya se hizo con `sheet`,
`alert-dialog`, `select` y las demás. La librería sobre la que monta es **`@base-ui/react`**, que
`package.json` ya declara (`^1.7.0`) y `docs/dependencias.md` ya registra como `heredada`, igual
que la propia CLI `shadcn`.

**Los cuatro checks, sobre `@base-ui/react`** (`docs/architecture.md > Dependencias de terceros`):

| Check | Resultado |
| --- | --- |
| 1. No marcada `deprecated` en npm | **No verificable desde aquí** (el gate corre sin red). Cubierto por su fila `heredada` del registro, que es lo que la guardia comprueba |
| 2. Release en los últimos 12 meses | **No verificable desde aquí**. Ídem |
| 3. ≥ 10.000 descargas semanales | **No verificable desde aquí**. Ídem |
| 4. Licencia MIT / Apache-2.0 / BSD / ISC | **No verificable desde aquí**. Ídem |

No es un «sí» disfrazado: los cuatro son **desconocidos** por falta de red, y así se dicen
(`CLAUDE.md` regla 6). Lo que sí es un hecho verificable en disco es que **la dependencia ya está
aprobada y en el registro**, así que esta ficha **no abre ninguna puerta nueva**: su fila dice
`Pendiente de auditoría`, y auditarla es la feature propia que `docs/architecture.md` anuncia, no
ésta.

**Condición de parada declarada (R37):** si `pnpm dlx shadcn@latest add tabs` intentara instalar un
paquete que `package.json` **no** tiene, la tarea se detiene, **no se instala nada** y el
implementer sube la propuesta con sus cuatro checks al leader. La alternativa de escribir el
conmutador a mano con dos `<button>` y `role="tablist"` existe y es barata (§ 11, alternativa E),
pero **no se elige por adelantado**: primero se comprueba.

---

## 10. Hallazgos

Ninguna de las 13 decisiones cerradas resultó imposible de mapear a un requisito. Lo que sigue son
tensiones reales encontradas leyendo el código mergeado; **ninguna cambia una decisión**, se
escriben aquí para que no se descubran a mitad de la implementación.

### 10.1 El actor no puede añadirse a sí mismo a un grupo

`listUsers` **excluye al actor** (QC-66, decisión 12), así que quien administra los grupos nunca
aparece en el buscador de R28. Meterse a uno mismo en un grupo no es alcanzable desde esta
pantalla. Abrir una vía sería backend, o sea fuera de alcance (R36). Queda como **pregunta abierta
1** con respuesta por defecto: se acepta el hueco.

### 10.2 Añadir a alguien que no está `active` funciona… y no se ve

`createAddWorkGroupMember` crea la fila **sea cual sea el estado de cuenta**; el estado solo decide
si la persona **se ve** en la lista (QC-84 R19, R28). Consecuencia: añadir a una persona `pending`
—el estado con el que **nace** toda cuenta nueva— devuelve éxito y la lista de miembros **no la
muestra**. Los tres códigos `work_group_member_exists_*` solo aparecen al intentarlo **por segunda
vez**.

La decisión 6 ya escribió ese precio («alguien recién creado nace `pending` y no aparece»), así que
**no se compensa con lógica en la UI**: R30 prohíbe expresamente afirmar que aparece quien la
consulta no devuelve. Si molesta en uso, lo que cambia es la **pregunta abierta 2**, no el diseño.

### 10.3 `createdAt` es ordenable pero no visible

Ver § 4.2. No es un problema, es la diferencia entre lo que la consulta admite y lo que la fila
trae. Se anota porque invita a «arreglarlo» añadiendo una columna que `WorkGroupRow` no tiene
—y eso es exactamente lo que R12 prohíbe—.

### 10.4 Ésta es la primera pantalla de Configuración con pestañas

Lo dice la propia decisión 1. El patrón nace aquí y se deja **en la carpeta de la ruta**
(`usuarios-tabs.ts`), **no** en `components/shared/`: generalizar con un solo consumidor es
inventar una abstracción sin evidencia. Cuando una segunda pantalla lo necesite, se sube con dos
casos reales delante.

---

## 11. Alternativas descartadas

**A. Ruta propia `/configuracion/usuarios/grupos` (o `/configuracion/grupos`).**
Descartada: la **decisión 1 del humano ya la cerró**, y el código confirma su precio. Una ruta más
significa una fila más en `PRIVATE_ROUTE_PREFIXES`, un segundo `requirePagePermission`, un segundo
`page.tsx` con su metadata y su corte, un segundo E2E de «sin permiso → 404» y —si no se quiere
ítem de menú— una ruta navegable que ningún enlace declara.

**B. Pestañas resueltas **solo** en el cliente, con los dos paneles montados a la vez.**
Descartada por dos motivos medibles: (1) obligaría a consultar **las dos listas** en cada carga de
la pantalla, incluida la de grupos para quien nunca abre esa pestaña; (2) no reflejaría la pestaña
en la dirección, que es justo lo que la decisión 3 exige —recargar volvería a personas—. La
variante «cliente + `history.replaceState`» arregla la URL pero deja la consulta doble y monta un
segundo mecanismo de estado de lista al margen de la cadena de consulta, que es la alternativa G
que QC-67 ya descartó.

**C. Usar `<DataTable>` también para la lista de miembros.**
Descartada: `WORK_GROUP_MEMBER_QUERYABLE` declara `sortable: []`, `filterable: {}` y
`searchable: false` **a propósito** (el orden es fijo y lo garantiza el SQL, QC-84 R22/R53). La
tabla compartida traería barra de búsqueda, menús de columna y controles de orden que **no harían
nada**: controles que mienten. Una lista simple con «anterior / siguiente» y el indicador de
posición dice exactamente lo que el contrato soporta.

**D. Gestionar los miembros en un diálogo anidado dentro del panel, o en una fila expandible.**
Descartada: la **decisión 4** fijó el panel, y el código la respalda —la tabla compartida de QC-55
no soporta filas expandibles hoy, y añadirlo tocaría un componente que usan las siete pantallas
(R12 lo prohíbe)—. Un diálogo sobre un `Sheet` además apila dos capas de foco atrapado, que es un
agujero de accesibilidad conocido.

**E. Escribir el conmutador a mano con `role="tablist"` en vez de traer la primitiva.**
Descartada **como primera opción**: el repo tiene la CLI de shadcn precisamente para no escribir
primitivas a mano (`docs/architecture.md > Componentes`), y hacerlo significaría implementar el
patrón ARIA de pestañas —roving tabindex, flechas, `aria-controls`— que la primitiva ya trae
probado. Se mantiene **solo** como salida si § 9 detecta que la primitiva arrastra un paquete
nuevo, y entonces se escribe en el `impl_*.md` por qué.

**F. Un segundo `parseListParams` genérico compartido por personas y grupos.**
Descartada: los dos parsers difieren en lo que importa —grupos no tiene filtros, personas sí; las
listas blancas son distintas— y el genérico acabaría parametrizado por casi todo. `user-list-params`
y `order-list-params` ya convivieron así por el mismo motivo. Se prefiere el hermano al genérico
prematuro.

---

## 12. Verificación

- **Unitarios** (`tests/unit/configuracion-ui/…`): parsers puros (`usuarios-tabs`,
  `work-group-list-params`), la validación en vivo del nombre, las columnas (claves exactas de
  `WorkGroupRow`), los tres estados de lista, el panel, el buscador de miembros y el diálogo.
- **Guardias**: las de navegación de QC-75, la de rutas privadas cubiertas, la de arquitectura de
  módulos, la de dependencias aprobadas y `usuarios-convenciones.test.ts` (barrel completo) deben
  seguir verdes **sin tocarse ni relajarse** (R5, R39).
- **E2E** (`e2e/grupos-de-trabajo.spec.ts`, nuevo): el recorrido completo de R42. Los
  `e2e/usuarios.spec.ts` y `e2e/permisos.spec.ts` existentes **no se editan** (R43).
- El mapa `R<n> -> test` completo está en `tasks.md > Trazabilidad`.
