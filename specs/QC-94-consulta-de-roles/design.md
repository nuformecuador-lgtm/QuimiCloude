# QC-94 — consulta-de-roles · design.md

> Zona: `backend` · Complejidad: `low` · depends_on: — · Rama: `feature/QC-94-consulta-de-roles`
>
> El **qué** está en `requirements.md` (R1–R21) y su alcance lo cerró el humano el 2026-09-11 en la
> tabla de **8 decisiones**. Aquí va el **cómo**: dónde vive el caso de uso dentro de
> `lib/modules/identity/`, cómo se exige «uno de dos permisos» **sin escribir una segunda
> implementación de la pertenencia**, la forma exacta del puerto y de la salida, y por qué esta
> consulta **no** usa el contrato de listado que usan las otras seis.
>
> **Precedente literal, que es la mitad del trabajo**: `specs/QC-66-crud-de-usuarios/` — mismo módulo,
> mismo `Actor`, misma jerarquía de errores, misma forma de Server Action de consulta
> (`getUserAction`, `listUsersAction`) y misma traducción por `code`. **Este diseño no inventa nada
> donde QC-66 ya decidió**; cada vez que se aparta, lo dice y explica por qué.
>
> **El modelo ya existe y está mergeado.** `Role` está completo en `db/schema.prisma`
> (`/// @module identity`, `id` uuid, `name` **único en toda la tabla**, `description`, marcas de
> tiempo) y **no tiene columna de empresa**, que es exactamente la decisión cerrada 1. Esta ficha **no
> lo re-especifica, no lo cambia y no lo migra** (R19): lo lee.

---

## 1. Qué construye esta feature, y qué archivos toca

| Archivo | Qué se hace |
| --- | --- |
| `lib/modules/identity/domain/require-permission.ts` | **Se le suma `assertAnyPermission`** junto a `assertPermission`, compartiendo **un solo** cuerpo de pertenencia (§ 3.1). No cambia la firma ni el comportamiento de `assertPermission`. |
| `lib/modules/identity/domain/actor.ts` | **Se le suma `requireAnyPermission`**, hermano de `requirePermission`, con la misma firma de aserción y el mismo `UnauthorizedError` (§ 3.1). |
| `lib/modules/identity/domain/role-view.ts` | **NUEVO.** El tipo de salida `RoleOption = { id, name }` (§ 4.1). |
| `lib/modules/identity/domain/list-roles.ts` | **NUEVO.** El caso de uso, como factory `createListRoles(deps)` (§ 3.2). |
| `lib/modules/identity/ports/role-catalog-repository.ts` | **NUEVO.** Puerto de **solo lectura** del catálogo (§ 4.2). |
| `lib/modules/identity/adapters/driven/persistence/role-catalog-prisma.ts` | **NUEVO.** Implementación Prisma: único archivo de la feature que toca `@prisma/client`. |
| `lib/modules/identity/adapters/driving/role-actions.ts` | **NUEVO.** La Server Action `listRolesAction` (§ 6). |
| `lib/modules/identity/index.ts` | Gana `RoleOption`, `createListRoles`/`ListRolesDeps` y `requireAnyPermission` — **solo de `./domain`** (R15). |
| `lib/composition/index.ts` | La fachada `identity` gana `listRoles` y el repositorio del catálogo. **Único** sitio de cableado (R16). |
| `tests/**` | Los cinco archivos nuevos de § 9. Ningún test ajeno cambia (§ 9.3). |

**Declaración explícita para la validación de conflicto del leader** (`tasks.md` la repite):
`db/schema.prisma` **NO se toca**; `db/migrations/` **NO se toca**; `package.json` **NO se toca**.
**SÍ** se tocan `lib/composition/index.ts`, `lib/modules/identity/index.ts`,
`lib/modules/identity/domain/require-permission.ts` y `lib/modules/identity/domain/actor.ts`. No se
toca `app/`, `components/`, `middleware.ts`, `e2e/`, `lib/shared/**` ni `lib/modules/<otro>/**`.

**Aviso de paralelismo:** los dos archivos de dominio compartidos que esta ficha modifica
—`require-permission.ts` y `actor.ts`— son de los más citados del módulo. Los cambios son **aditivos**
(un `export` nuevo en cada uno) y **no reordenan ni reformatean** nada de lo que hay; aun así, el
leader debe comprobar que ninguna otra feature `in_progress` de la zona los declare en su `tasks.md`
antes de arrancar. Se declara aquí para que la comprobación sea posible, no se resuelve aquí.

---

## 2. Por qué no hace falta nada más que esto

La ficha se lee en una línea —«devuelve los roles con id y nombre»— y la tentación es escribirla como
un `findMany` dentro de la Server Action. No se hace, y el motivo no es ceremonia:

- **La autorización tiene que estar en el service** (`docs/architecture.md > Acceso a datos y
  autorizacion`, `docs/checkpoints-proyecto.md > Permisos`). Un `findMany` en la action deja la comprobación en el
  borde, que es exactamente lo que el arnés llama «un permiso no implementado».
- **Un adaptador driving no puede importar `@prisma/client`** (`docs/architecture.md > La regla de
  dependencias`): `guard-arquitectura-modulos.test.ts` se pondría roja.

Así que el mínimo honesto es: caso de uso en `domain/`, puerto, adaptador driven, cableado en
`lib/composition`, Server Action. Cinco archivos pequeños, ninguno opcional.

---

## 3. Autorización: «uno de dos permisos», con una sola implementación de la pertenencia

### 3.1 La decisión de forma: `assertAnyPermission` al lado de `assertPermission`

La decisión cerrada 2 pide algo que hoy **no existe** en el repo: hasta ahora todo caso de uso exigía
**un** código (`assertPermission(actor, code, onDenied)`), y aquí valen **dos alternativos**. QC-74 R12
dice que la pertenencia («el actor tiene este permiso») tiene **una sola implementación** en
`domain/require-permission.ts`, y esa regla no se rompe por conveniencia.

```ts
// lib/modules/identity/domain/require-permission.ts  (AÑADIDO, no reescrito)

/** Pertenencia EXACTA, sin normalizacion y sin implicacion entre permisos. Cuerpo UNICO: las dos
 *  aserciones de abajo preguntan por aqui, asi que la regla de QC-74 R13 sigue escrita una vez. */
function holdsPermission(actor: PermissionBearer | null | undefined, permission: PermissionCode): boolean {
  return Boolean(actor) && Array.isArray(actor!.permissions) && actor!.permissions.includes(permission);
}

export function assertPermission(actor, permission, onDenied): void {
  if (!holdsPermission(actor, permission)) throw onDenied();
}

/** QC-94 R1, R3: basta con UNO de los codigos. Falla cerrado igual que su hermana (R2): actor
 *  ausente, sin conjunto, conjunto vacio, conjunto que no es lista o sin ninguno de los codigos. */
export function assertAnyPermission(
  actor: PermissionBearer | null | undefined,
  permissions: readonly [PermissionCode, ...PermissionCode[]],
  onDenied: () => Error,
): void {
  if (!permissions.some((permission) => holdsPermission(actor, permission))) throw onDenied();
}
```

- **El parámetro es una tupla no vacía**, no un `PermissionCode[]`. Con un array normal,
  `assertAnyPermission(actor, [])` compilaría y **concedería a todo el mundo** —`[].some()` es
  `false`, así que en realidad denegaría a todo el mundo; peor todavía: sería un fallo silencioso en
  la dirección opuesta el día que alguien invirtiera la condición—. Con la tupla, la lista vacía **no
  compila**, y eso es más barato que un test.
- **`assertPermission` no cambia de firma ni de comportamiento.** Sus trece casos de test siguen
  valiendo tal cual y no se tocan (§ 9.3): lo único que cambia es que su cuerpo delega en
  `holdsPermission`.
- **El error lo pone quien llama** (QC-74 R15): esta función no conoce ninguna jerarquía de errores.

```ts
// lib/modules/identity/domain/actor.ts  (AÑADIDO)
export function requireAnyPermission(
  actor: Actor | null | undefined,
  permissions: readonly [PermissionCode, ...PermissionCode[]],
): asserts actor is Actor {
  assertAnyPermission(actor, permissions, () => new UnauthorizedError());
}
```

Mismo `Actor` de QC-66, mismo `UnauthorizedError` —subclase de `IdentityError`—, así que el traductor
del adaptador driving lo serializa exactamente igual que hoy, sin tocar nada (R14).

### 3.2 El caso de uso

```ts
// lib/modules/identity/domain/list-roles.ts
export type ListRolesDeps = { readonly roles: RoleCatalogRepository };

export function createListRoles(
  deps: ListRolesDeps,
): (actor: Actor | null | undefined) => Promise<readonly RoleOption[]> {
  return async function listRoles(actor) {
    requireAnyPermission(actor, ['usuarios.consultar', 'usuarios.modificar']);
    return deps.roles.listAll();
  };
}
```

- **Primera línea, antes de tocar el puerto** (R1). El test de R2 usa un doble que **lanza si lo
  llaman** y afirma `expect(...).not.toHaveBeenCalled()`: es lo que distingue una autorización real de
  un `if` decorativo.
- **No recibe ningún argumento además del actor** (R12). No hay `query`, no hay `page`: el catálogo se
  devuelve entero.
- **No usa `actor.companyId`** (R11). El `Actor` la trae porque es el mismo tipo que los seis casos de
  uso de QC-66, pero aquí **no entra en ningún `where`**, y eso es el requisito, no un olvido. Un test
  lo fija: dos actores con `companyId` distinto reciben el mismo conjunto, con el mismo doble.
- **No reordena lo que devuelve el puerto** (§ 4.3).
- **El rol del actor no viaja hasta aquí** (R4): `Actor` no tiene campo de rol desde QC-66.

---

## 4. Contratos

### 4.1 La salida

```ts
// lib/modules/identity/domain/role-view.ts
/** R9: DOS datos y ningun otro. `description` NO sale -existe en la tabla y hoy no la pinta
 *  nadie-, y los permisos del rol tampoco (los declara QC-74 y no se exponen aqui). */
export type RoleOption = { readonly id: string; readonly name: string };
```

El nombre es `RoleOption`, no `RoleRow` ni `RoleListItem`, **a propósito**: dice para qué existe —una
opción de un selector— y no sugiere que sea la fila de un listado con paginación (R12). El test de R9
afirma las **claves exactas** del objeto (`Object.keys(...)` ordenado), no solo que falten algunas:
«no está `description`» es una afirmación que se queda corta el día que la tabla gane una columna.

### 4.2 El puerto

```ts
// lib/modules/identity/ports/role-catalog-repository.ts
export interface RoleCatalogRepository {
  /** TODOS los roles, ordenados por nombre ascendente (R8, R10). Sin empresa: el catalogo es
   *  GLOBAL (decision cerrada 1) y este metodo no tiene donde recibirla. SOLO LECTURA (R17). */
  listAll(): Promise<readonly RoleOption[]>;
}
```

- **Un solo método y sin parámetros.** Que `listAll()` **no reciba empresa** es lo que hace imposible
  filtrar por ella por accidente (R11), igual que en QC-66 los nombres `…AliveInCompany` hacían
  imposible olvidarse del filtro. La forma del puerto es donde se escriben estas garantías, porque el
  tipo las verifica y un comentario no.
- **Ningún método de escritura** (R17): crear, editar o borrar roles no es expresable a través de este
  puerto, y el catálogo se cambia por migración, como dice el propio `db/schema.prisma`.
- El puerto lo cablea **solo** `lib/composition/index.ts` (R16); no se reexporta desde `index.ts`.

### 4.3 El adaptador driven

```ts
// lib/modules/identity/adapters/driven/persistence/role-catalog-prisma.ts
export async function listAllRoles(): Promise<readonly RoleOption[]> {
  return prisma.role.findMany({
    select: { id: true, name: true },   // ENUMERADO: `description` no entra ni por accidente
    orderBy: { name: 'asc' },           // R10
  });
}
```

- **`select` enumerado, nunca un `findMany` sin él** (R9). Es el mismo criterio de QC-66 § 6.3, y el
  motivo es el mismo: así es como un campo que nadie decidió exponer acaba en un payload del cliente.
- **`prisma.role` es un modelo `/// @module identity`**: no se cruza ninguna frontera de módulo
  (`guard-arquitectura-modulos.test.ts`).
- **El orden lo hace la base** (`ORDER BY name ASC`), no JavaScript. Se decide así porque tiene que
  haber **un** sitio que ordene: si el adaptador ordenara y el dominio reordenara con `localeCompare`,
  las dos podrían discrepar en acentos y mayúsculas según la collation de la base, y el desacuerdo
  aparecería solo con datos reales. La alternativa está descartada en § 8.2.
- **No hace falta desempate.** `roles.name` es `@unique` **en toda la tabla**: no hay dos roles con el
  mismo nombre, así que el orden por nombre ya es total y determinista (R10). Esto es distinto de
  QC-66 § 8.2, donde dos personas sí pueden llamarse igual y por eso hacía falta `id ASC`.

---

## 5. Punto de composición (R16)

`lib/composition/index.ts` —**el único sitio donde se cablea**— gana, **sin reordenar ni reformatear
nada de lo que hay** (hay otras sesiones tocando este archivo):

```ts
const roleCatalogRepository: RoleCatalogRepository = { listAll: listAllRoles };

export const identity = {
  ...,                                                       // lo que ya hay, intacto
  listRoles: createListRoles({ roles: roleCatalogRepository }),
} as const;
```

El actor **no** se resuelve aquí, mismo criterio que los otros seis casos de uso (R5): lo construye la
Server Action con las dos caras de la sesión.

---

## 6. La Server Action (R13, R14, R15)

`adapters/driving/role-actions.ts`, archivo **nuevo** y no dentro de `user-actions.ts`: aquel es la
administración de usuarios y este es el catálogo de roles; mezclarlos obligaría a QC-67 a importar un
archivo cuyo nombre no dice lo que trae.

```ts
'use server';

export type RoleOptionsResult =
  | { status: 'success'; data: readonly RoleOption[] }
  | ErrorState;

const toErrorState = createErrorStateTranslator(IdentityError);

export async function listRolesAction(): Promise<RoleOptionsResult> {
  const actor = await currentActor();
  try {
    return { status: 'success', data: await identity.listRoles(actor) };
  } catch (error) {
    return toErrorState(error);
  }
}
```

- **Sin `FormData`** (R13): nadie la llama desde un `<form>`. De hecho no recibe **ningún** argumento,
  que es la forma más pequeña de cumplir R12.
- **`currentActor()` es la misma función que ya existe en `user-actions.ts`**, con las dos caras de la
  sesión (`getSessionUser()` + `getSessionContext()`) y fallando cerrado a `null` (R6). **Se copia en
  este archivo** en vez de exportarse desde el otro: un archivo `'use server'` **solo puede exportar
  funciones `async`** (restricción real de Next.js, ya anotada en `user-actions.ts`), así que
  exportarla convertiría un detalle interno en una Server Action pública. Son ocho líneas; el precio
  de la alternativa —un módulo compartido nuevo bajo `adapters/driving/`— se discute en § 8.3.
- **La empresa se sigue exigiendo para construir el actor**, aunque la consulta no la use (R11): si
  falta el contexto de sesión, el actor es `null` y la consulta rechaza. Es deliberado: «no hay sesión
  completa» no puede ser más permisivo aquí que en el resto del módulo.
- **Traducción por `code` con el traductor único de QC-70** (R14). El único error de dominio que esta
  feature puede producir es `UnauthorizedError` (`code: 'unauthorized'`); cualquier otro fallo —la
  base caída— sale como `unexpected` con su mensaje neutro y el detalle real solo en el registro del
  servidor. **No se declara ninguna clase de error nueva y ningún código nuevo en el catálogo de
  `errores`**: no hace falta ninguno, porque la consulta no tiene «no encontrado» —un catálogo vacío
  es una lista vacía, no un error— ni entrada que validar.
- **No se reexporta desde `index.ts`** (R15): QC-67 la importa por su ruta exacta
  `@/lib/modules/identity/adapters/driving/role-actions`.
- **Sin `revalidatePath`**: esta ficha no crea ninguna ruta (R18) y adivinar la de QC-67 sería
  inventarla.

---

## 7. Lo que esta ficha NO toca, dicho una vez

- **Ninguna migración y ningún cambio de esquema** (R19). La tabla `roles` existe desde QC-4 y está
  sembrada; el seed (`seedInitialAccess`) tampoco se toca.
- **Ningún permiso nuevo** (R21). Los dos códigos son los de QC-66 y el catálogo sigue en **trece**
  entradas, así que **no hay ripple de tests ajenos**: ese fue el coste de QC-66, y esta ficha lo
  hereda ya pagado.
- **Ninguna escritura sobre `roles`** (R17).
- **Nada bajo `app/`, `components/` ni `e2e/`** (R18).
- **Ninguna dependencia nueva** (R20, § 10).

---

## 8. Alternativas descartadas

### 8.1 Reutilizar el contrato de listado de QC-57 (`ListQuery`/`Page`/`ROLE_QUERYABLE`) — descartada

Es lo que hacen los **seis** listados del repo, incluido `listUsers` de QC-66, y la coherencia es un
argumento de verdad: la tabla de datos compartida de QC-55 conecta sin traducir y añadir un campo
consultable es una línea. Se descarta por la **decisión cerrada 5**, y el diseño coincide con el
humano: el catálogo es **cerrado y corto** —dos roles en el seed, cambiables solo por migración—, así
que paginar significa devolver siempre una única página, y buscar significa filtrar dos elementos.
El precio de traerlo sería una **séptima copia** del contrato dentro de `identity` (`list-query.ts`,
`page.ts`, `role-queryable.ts`, el puerto `ListQueryLog`), una entrada más en
`tests/guards/guard-contrato-listados.test.ts` y una firma que un selector no sabe rellenar. Si algún
día el catálogo crece y hace falta, **es una ficha, no un hueco de esta**: cambiar
`listRoles(actor)` por `listRoles(actor, query)` es aditivo y no rompe a QC-67, que hoy llamaría sin
argumentos.

### 8.2 Ordenar en el dominio con `localeCompare` — descartada

Tiene una ventaja real: el orden pasaría a ser testeable en unitario, sin Postgres. Se descarta porque
crearía **dos** sitios que ordenan —la base ya tiene que decidir un orden en cuanto haya `ORDER BY`, y
sin él el orden de un `findMany` no está definido— y porque `localeCompare` y la collation de Postgres
**no coinciden** en acentos y en mayúsculas: el desacuerdo no aparecería en ningún test con dobles y
sí con datos reales. Se ordena en la base, y R10 se verifica con el test de integración de § 9.2. Si
algún día se quisiera un orden insensible a acentos, se cambia el `ORDER BY`, en un solo sitio.

### 8.3 Extraer `currentActor()` a un archivo compartido de `adapters/driving/` — descartada

Sería lo correcto a la tercera copia. Hoy son **dos** (`user-actions.ts` y `role-actions.ts`) y la
función son ocho líneas sin ninguna decisión de negocio: extraerla ahora significa un archivo nuevo que
**no puede llevar `'use server'`** —o sus exports pasarían a ser Server Actions— importado desde dos
archivos que sí lo llevan, y eso es una frontera cliente/servidor más que explicar por ocho líneas.
Se anota como deuda explícita: **cuando aparezca la tercera copia, se extrae**, y el sitio natural es
`lib/modules/identity/adapters/driving/current-actor.ts`. No se hace aquí para no meter en una ficha
`low` un refactor que toca la feature ajena que está recién mergeada.

### 8.4 Un permiso propio, `roles.consultar` — descartada por el humano

Consta para que no se reconsidere: **decisión cerrada 2**. Habría sido más preciso y habría costado un
permiso nuevo, su migración de catálogo, su seed y el ripple de los tests que cuentan el catálogo —todo
lo que QC-66 pagó al pasar de once a trece— para una consulta que solo sirve a la pantalla de usuarios.
Los dos permisos de usuarios ya delimitan exactamente a quién le hace falta.

### 8.5 Dejar la consulta abierta a cualquier sesión válida — descartada por el humano

**Decisión cerrada 2**, segunda mitad. El argumento a favor existe —el nombre de un rol no es un dato
sensible— y aun así no se hace: toda operación de este repo valida un permiso en el service y
`docs/checkpoints-proyecto.md > Permisos` exige su test. Una excepción «porque este dato no importa» es exactamente
la clase de precedente que después se cita para la siguiente.

---

## 9. Cómo se verifica

**Sin E2E, y con motivo** (decisión cerrada 7, R18): esta ficha es backend puro y no aporta ningún
flujo navegable; Playwright no tendría pantalla que abrir. Lo trae **QC-67**, cuya E2E ya crea un
usuario eligiendo rol —es decir, ejerce esta consulta de extremo a extremo—. **El diferimiento se
declara aquí, no al final.**

### 9.1 Unitarios

| Archivo | Qué demuestra |
| --- | --- |
| `tests/unit/identity/roles/list-roles-authorization.test.ts` | **R1, R2, R3, R4**: rechaza con actor ausente, con conjunto vacío, con conjunto que no es lista y con permiso ajeno (`inventario.consultar`), **sin tocar el puerto** —doble que lanza si lo llaman, más `not.toHaveBeenCalled()`—; acepta con **solo** `usuarios.consultar`, acepta con **solo** `usuarios.modificar`, y no exige los dos; ningún caso pasa el rol del actor. |
| `tests/unit/identity/require-any-permission.test.ts` | **R2, R3** sobre `assertAnyPermission`/`requireAnyPermission`: pertenencia exacta, sin normalización (`'USUARIOS.CONSULTAR'` no concede) y sin coincidencia parcial (`'usuarios.'`, `'usuarios.consultarlo'` no conceden). |
| `tests/unit/identity/roles/list-roles.test.ts` | **R8, R9, R11, R12**: devuelve todo lo que da el puerto sin recortar; el caso de uso **no** llama al puerto con ningún argumento; dos actores con `companyId` distinto obtienen el mismo resultado; las claves de cada elemento son exactamente `id` y `name`. |
| `tests/unit/identity/roles/role-actions.test.ts` | **R6, R13, R14**: la action no recibe `FormData`; el actor sale de las dos caras de la sesión y es `null` si falta cualquiera; `UnauthorizedError` se traduce a `{ status: 'error', code: 'unauthorized' }` **por el código** y un error cualquiera a `unexpected`. |
| `tests/unit/identity/roles/scope.test.ts` | **R15, R17, R19, R20, R21**: `index.ts` no reexporta `role-actions`; ningún archivo nuevo contiene `create`/`update`/`upsert`/`delete` sobre `role`; cero diff en `db/schema.prisma`; ninguna carpeta nueva en `db/migrations/`; `package.json` sin dependencias nuevas; `PERMISSIONS` sigue con trece entradas y sin ninguna añadida por esta ficha. |

### 9.2 Integración

| Archivo | Qué demuestra |
| --- | --- |
| `tests/integration/identity/role-catalog.int.test.ts` | **R8, R9, R10** contra Postgres real: el adaptador devuelve los roles del catálogo con **exactamente** dos claves, y la secuencia está ordenada por nombre ascendente. |

**Aviso para el implementer, aprendido en `e2e/login.spec.ts`**: ese spec **crea y borra roles
efímeros** (`qc9_e2e_rol_<RUN_ID>`). El test de integración **no** debe afirmar igualdad exacta contra
«los dos roles del seed»: afirma que los del seed **están**, que cada elemento tiene las dos claves y
que la secuencia completa está ordenada (`names` igual a `[...names].sort()` con el mismo criterio que
la base). Si no, se pone rojo por culpa de otra suite.

### 9.3 Lo que NO cambia

**Ningún test ajeno se toca.** El catálogo de permisos no crece (R21), así que no hay ripple como el de
QC-66 § 2. `tests/unit/identity/require-permission.test.ts` **conserva sus casos intactos**: el cuerpo
de `assertPermission` pasa a delegar en `holdsPermission`, pero su firma y su comportamiento son los
mismos, y esa es precisamente la afirmación que esos casos ya hacen. Si alguno se pusiera rojo, el
refactor está mal y se arregla el refactor, **no el test**.

---

## 10. Dependencias de terceros (R20)

**Ninguna dependencia nueva, y ninguna propuesta que abrir** (`docs/architecture.md > Dependencias de
terceros`). Todo lo que este diseño necesita está instalado y registrado en `docs/dependencias.md`:
`@prisma/client` (la única lectura), `vitest` (los tests). No se usa `zod`, porque **no hay entrada
externa que validar**: la consulta no recibe ningún argumento del llamante (R12).

Los cuatro checks de salud **no llegan a evaluarse** porque no se propone ninguna librería. Una
candidata que podría parecerlo y no lo es:

| Candidata | Qué haría | Por qué no entra |
| --- | --- | --- |
| Cualquier utilidad de ordenación o de colación (`intl-collator`, `natural-orderby`…) | Ordenar los roles por nombre | El orden lo hace la base con `ORDER BY name ASC` (§ 4.3, § 8.2). Ordenar en JavaScript sería un segundo sitio que ordena, no un ahorro. |

Si durante la implementación apareciera la tentación de instalar algo, **se para y se propone**, no se
instala (regla 7 de `CLAUDE.md`); `tests/guards/guard-dependencias-aprobadas.test.ts` lo pondría en
rojo igualmente.

---

## 11. Preguntas abiertas que deja este diseño

**Ninguna que bloquee la implementación.** `requirements.md > Preguntas abiertas` dice «Ninguna» y este
diseño no abre ninguna nueva.

Dos deudas menores, anotadas para que no se descubran dos veces: la **tercera** copia de
`currentActor()` obliga a extraerla (§ 8.3), y el día que el catálogo de roles deje de ser cerrado y
corto, la firma `listRoles(actor)` gana un argumento de consulta **de forma aditiva** (§ 8.1). Ninguna
de las dos es trabajo de esta ficha.
