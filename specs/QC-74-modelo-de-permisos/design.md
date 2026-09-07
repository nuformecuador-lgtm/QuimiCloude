# QC-74 — modelo-de-permisos · design.md

> Cubre `requirements.md` (R1-R24). Las decisiones cerradas del humano (2026-09-07) no se
> reabren aqui: este documento dice **como** se cumplen.

## 0. Punto de partida (lo que deja QC-54)

En `origin/dev` (`fa116cd`) ya esta mergeada QC-54, y con ella:

- `lib/modules/identity/domain/roles.ts` — UNICO sitio que escribe `'Administrador'` y `'Operador'`
  (`ROLE_ADMINISTRADOR`, `ROLE_OPERADOR`, `SEED_ROLES`).
- `lib/modules/identity/domain/require-admin.ts` — UNICA implementacion de «el actor es
  Administrador»: `assertAdminRole(actor: RoleBearer | null | undefined, onDenied: () => Error): void`.
  Devuelve `void` a proposito y **no conoce ninguna jerarquia de errores**: el error lo fabrica quien
  llama.
- Cinco envoltorios identicos, uno por modulo, en `lib/modules/<m>/domain/actor.ts`:
  ```ts
  export type Actor = { readonly id: string; readonly roleName: string | null };
  export function requireAdmin(actor: Actor | null | undefined): asserts actor is Actor {
    assertAdminRole(actor, () => new UnauthorizedError());
  }
  ```
  La firma `asserts actor is Actor` es la que estrecha el tipo dentro de los casos de uso, y el
  `UnauthorizedError` es el de **cada modulo** (subclase de `InventarioError`, `RecetasError`,
  `UnidadesError`, `ProveedoresError`, `PedidosError`), que es lo que hace que los adaptadores
  driving puedan seguir serializando con `error instanceof <Modulo>Error`.

**Esa es exactamente la pieza que esta ficha sustituye**, y por eso el `depends_on`: se cambia una
implementacion y cinco envoltorios de tres lineas, no cinco copias.

El actor lo construye el adaptador driving a partir de `identity.getSessionUser()`
(`{ id: sessionUser.id, roleName: sessionUser.roleName }`), y `getSessionUser` lee **la base en cada
peticion** (`resolve-session.ts` -> `resolve-session-user.ts` -> `session-user-prisma.ts`), no la
cookie. Eso importa: el conjunto de permisos puede ser el vigente sin firmar nada nuevo.

## 1. Modelo de datos

Dos tablas nuevas, ambas de `identity` (`/// @module identity`). Identificadores en **ingles y
`snake_case`**; los **valores** de permiso, en español (decision 9).

### 1.1 `permissions` — el catalogo

```prisma
/// Catalogo cerrado de permisos (QC-74, R1, R2). Como `roles`, NO lleva `deletedAt`:
/// un permiso no se da de baja, se retira con una migracion.
/// @module identity
model Permission {
  code        String   @id                       // 'inventario.consultar'
  module      String                             // 'inventario'
  action      String                             // 'consultar' | 'modificar'
  description String
  createdAt   DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt   DateTime @updatedAt @map("updated_at") @db.Timestamptz(6)

  roles RolePermission[]

  @@unique([module, action])
  @@map("permissions")
}
```

`code` es la clave primaria **de texto**, no un uuid: es el mismo patron que `document_types.code`,
que ya existe en este esquema, y hace que `role_permissions` sea legible en una consulta directa sin
un JOIN mas. `module`/`action` van desnormalizados en columnas propias porque la guardia y las
consultas de QC-75 («¿que modulos puede ver este usuario?») preguntan por modulo, y partir la cadena
en SQL en cada consulta es peor que dos columnas.

### 1.2 `role_permissions` — la asignacion

```prisma
/// Permisos asignados a un rol (QC-74, R7, R8, R9). SIN columna de empresa (R6, decision 10):
/// el permiso cuelga del rol y de nada mas.
/// @module identity
model RolePermission {
  roleId         String   @map("role_id") @db.Uuid
  permissionCode String   @map("permission_code")
  createdAt      DateTime @default(now()) @map("created_at") @db.Timestamptz(6)

  role       Role       @relation(fields: [roleId], references: [id], onDelete: Restrict, onUpdate: Cascade)
  permission Permission @relation(fields: [permissionCode], references: [code], onDelete: Restrict, onUpdate: Cascade)

  @@id([roleId, permissionCode])
  @@index([permissionCode])
  @@map("role_permissions")
}
```

- Clave primaria compuesta: una asignacion no puede duplicarse, y el indice de la PK cubre la
  consulta caliente (`WHERE role_id = ?`).
- `@@index([permissionCode])` para el sentido inverso, que es el que necesita la guardia de
  integridad y cualquier revision futura.
- `onDelete: Restrict` en las dos FKs, igual que `users.role_id`: no se borran roles ni permisos
  arrastrando asignaciones en silencio.
- `Role` gana `permissions RolePermission[]`. **`users` no cambia**: el rol sigue siendo
  `users.role_id` (QC-47 R13/R14).

### 1.3 Migracion

Carpeta `db/migrations/<timestamp>_permissions_and_role_permissions/` con:

- `migration.sql` (UP, generado con `pnpm run db:migrate:create`): `CREATE TABLE` de las dos, FKs,
  indices, y al final —siguiendo el orden de `20260904180600_companies_and_user_company`— los cuatro
  `ALTER TABLE ... ENABLE/FORCE ROW LEVEL SECURITY` (R22). Sin `FORCE`, el dueño de la tabla —que es
  con quien se conecta Prisma— la ignora entera.
- `down.sql` (manual, obligatorio): `DROP TABLE "role_permissions"` y luego `DROP TABLE
  "permissions"`, en ese orden.

**La migracion NO inserta filas.** Las filas del catalogo y las asignaciones las escribe el seed
(§3). Es distinto del precedente de `units`, que si inserto sus cuatro filas arrancadoras en la
migracion, y la razon es que aqui esas filas tienen que estar **derivadas del mismo dato que leen
las guardias**: si el catalogo estuviera en SQL y la guardia en TypeScript, habria dos verdades y la
guardia R19 podria pasar en verde contra una base distinta de la que se despliega.

### 1.4 RLS

`ENABLE` + `FORCE` en ambas, sin ninguna policy (mismo estado que `roles` y `document_types` desde
QC-4): defensa en profundidad para quien entre por PostgREST, que aqui no se usa. **No autoriza
nada** — la frontera es el service (`docs/architecture.md > Acceso a datos y autorizacion`).

## 2. El catalogo en codigo: un solo dueño

Archivo nuevo `lib/modules/identity/domain/permissions.ts`, hermano exacto de `roles.ts`:

```ts
export const PERMISSIONS = [
  { code: 'dashboard.consultar',    module: 'dashboard',    action: 'consultar', description: '...' },
  { code: 'inventario.consultar',   module: 'inventario',   action: 'consultar', description: '...' },
  { code: 'inventario.modificar',   module: 'inventario',   action: 'modificar', description: '...' },
  { code: 'recetas.consultar',      module: 'recetas',      action: 'consultar', description: '...' },
  { code: 'recetas.modificar',      module: 'recetas',      action: 'modificar', description: '...' },
  { code: 'unidades.consultar',     module: 'unidades',     action: 'consultar', description: '...' },
  { code: 'proveedores.consultar',  module: 'proveedores',  action: 'consultar', description: '...' },
  { code: 'proveedores.modificar',  module: 'proveedores',  action: 'modificar', description: '...' },
  { code: 'pedidos.consultar',      module: 'pedidos',      action: 'consultar', description: '...' },
  { code: 'pedidos.modificar',      module: 'pedidos',      action: 'modificar', description: '...' },
] as const;

export type PermissionCode = (typeof PERMISSIONS)[number]['code'];

/** Los permisos de cada rol, ESCRITOS UNO A UNO (decision 2). Sin comodin. */
export const SEED_ROLE_PERMISSIONS: Readonly<Record<string, readonly PermissionCode[]>> = {
  [ROLE_ADMINISTRADOR]: [ /* los diez, literales */ ],
  [ROLE_OPERADOR]: ['inventario.consultar'],
};
```

`PermissionCode` es una **union de literales**, no `string`: un caso de uso que exija
`'inventaro.consultar'` no compila. Eso convierte media clase de errores en rojo de `typecheck` en
vez de en un test que nadie escribio.

**Por que el catalogo vive en `identity` y no repartido en cada modulo.** La regla de dependencias
permite que el dominio de un modulo importe el **barrel** de otro, asi que `identity` podria importar
`@/lib/modules/inventario` para recoger los permisos que ese modulo declara. Se descarta: `inventario`
ya importa `@/lib/modules/identity` (para `requirePermission`), asi que seria un **ciclo entre
barriles**, y un ciclo ESM entre modulos que exportan constantes acaba con una de ellas valiendo
`undefined` en tiempo de inicializacion segun quien cargue primero — un fallo intermitente que ningun
test de dominio ve venir. El catalogo centralizado no pierde nada de lo que la decision 7 protege:
la guardia R19 comprueba exactamente lo mismo (un permiso declarado que ningun rol tiene). Alternativa
descartada, anotada tambien en §7.

Los diez codigos y la union se publican por el barrel `lib/modules/identity/index.ts`
(`PERMISSIONS`, `SEED_ROLE_PERMISSIONS`, `type PermissionCode`, `assertPermission`,
`type PermissionBearer`). Dominio puro: ni `next/*`, ni Prisma, ni `'use server'` — el barrel sigue
siendo importable desde un componente de cliente, que es lo que QC-75 va a necesitar.

## 3. Seed

`seedInitialAccess` (`lib/modules/identity/domain/seed-initial-access.ts`) gana un paso, **entre la
creacion de roles y la del administrador**:

1. leer los codigos de permiso que ya existen (`repository.findExistingPermissionCodes(codes)`),
2. crear solo los que falten (`repository.createPermissions(rows)`),
3. leer las asignaciones existentes de los roles sembrados
   (`repository.findRolePermissionCodes(roleIds)`),
4. crear solo las que falten (`repository.createRolePermissions(pairs)`).

Sin `upsert` y sin `delete`, igual que el resto del seed: **lee que falta y crea exactamente eso**
(R10). Una asignacion añadida a mano en produccion no se borra; un permiso retirado del catalogo se
retira con migracion, no con el seed. `SeedOutcome` gana `createdPermissions: readonly string[]` y
`createdRolePermissions: number` para la linea de resumen de `scripts/seed.ts`.

El puerto `InitialAccessRepository` gana esos cuatro metodos; el adaptador
`initial-access-repository-prisma.ts` los implementa con `createMany` sobre `permissions` y
`role_permissions`. El dominio sigue sin conocer Prisma y se testea con dobles.

**Consecuencia aceptada de la decision 4:** el `Operador` no tiene `dashboard.consultar`. Es
coherente con la decision 5, que ya previo que el login deja de poder llevar siempre al dashboard y
que eso lo resuelve QC-75.

## 4. Como llega el conjunto de permisos al servicio

Una sola lectura, la que ya existe, con un JOIN mas:

```ts
// lib/modules/identity/adapters/driven/persistence/session-user-prisma.ts
select: {
  id: true, username: true, firstNames: true, lastNames: true,
  role: { select: { name: true, permissions: { select: { permissionCode: true } } } },
  companyId: true, company: { select: { deletedAt: true } },
}
```

- `SessionUserRecord` (puerto) gana `permissions: readonly string[]`.
- `SessionUser` (dominio, `session-user.ts`) gana `permissions: readonly string[]`. **`roleName` se
  queda**: lo pinta `nav-user.tsx` y es display, no autorizacion.
- `resolve-session-user.ts` pasa el array tal cual.

**Coste, declarado (mismo criterio que QC-48 al añadir `company.deletedAt`):** la consulta mas
caliente de la aplicacion —una busqueda por clave primaria que ya hace dos JOIN— gana un tercero,
sobre `role_permissions` por su PK `(role_id, permission_code)`, que devuelve hoy como maximo diez
filas. **Ni una consulta adicional por peticion** (R11), que era la condicion. La pregunta abierta 1
(invalidacion de cache) queda donde esta: se decide al acotar QC-28.

Los adaptadores driving cambian una linea cada uno:

```ts
return { id: sessionUser.id, permissions: sessionUser.permissions };
```

## 5. `requirePermission`: firma y jerarquia de errores

`lib/modules/identity/domain/require-permission.ts` (sustituye a `require-admin.ts`):

```ts
/** Lo minimo que la regla necesita saber del actor. Cada modulo conserva su propio `Actor`. */
export type PermissionBearer = { readonly permissions: readonly string[] };

/**
 * UNICA implementacion de «el actor tiene este permiso» (R12-R14). Falla cerrado y compara por
 * PERTENENCIA EXACTA: sin normalizar, sin `startsWith`, sin jerarquia (R13).
 * El error lo pone quien llama (R15): esta funcion no conoce ninguna jerarquia de errores.
 */
export function assertPermission(
  actor: PermissionBearer | null | undefined,
  permission: PermissionCode,
  onDenied: () => Error,
): void {
  if (!actor || !Array.isArray(actor.permissions) || !actor.permissions.includes(permission)) {
    throw onDenied();
  }
}
```

Y en cada modulo, `lib/modules/<m>/domain/actor.ts`:

```ts
export type Actor = { readonly id: string; readonly permissions: readonly string[] };

export function requirePermission(
  actor: Actor | null | undefined,
  permission: PermissionCode,
): asserts actor is Actor {
  assertPermission(actor, permission, () => new UnauthorizedError());
}
```

**Lo que esto conserva, punto por punto:**

1. **La jerarquia de errores por modulo (R15).** `assertPermission` recibe la fabrica y nunca
   construye un error propio; el `UnauthorizedError` sigue siendo el del modulo, subclase de su
   `<Modulo>Error`. Los adaptadores driving **no se tocan** en su bloque de errores: siguen
   traduciendo con `error instanceof InventarioError` (y sus cuatro hermanos) y devolviendo el mismo
   `code` estable. Es el mismo contrato que QC-54 dejo escrito, con un parametro mas.
2. **El estrechamiento de tipos.** El envoltorio de modulo conserva su firma `asserts actor is
   Actor` y `assertPermission` sigue devolviendo `void`: TypeScript no verifica el cuerpo de una
   funcion de asercion, asi que la asercion tiene que quedarse en el envoltorio nombrado que invoca
   el caso de uso, exactamente como en QC-54.
3. **El sitio.** Primera linea del caso de uso, antes de zod y antes de cualquier puerto (R12). En
   `listProducts`, por ejemplo, sigue siendo el paso 1 de los cinco que su JSDoc ya enumera.

La llamada pasa de `requireAdmin(actor)` a `requirePermission(actor, 'inventario.consultar')` en los
~30 casos de uso de la tabla R16. Es un cambio mecanico, y el permiso concreto es el unico dato que
hay que mirar caso por caso.

`require-admin.ts` y `assertAdminRole` se **borran**, junto con su export del barrel y
`tests/unit/identity/require-admin.test.ts`. Queda sin consumidores en produccion: el unico otro uso
del rol es `lib/composition/route-role-rules.ts`, que compara `ROLE_ADMINISTRADOR` directamente y
sigue vivo hasta QC-75 (R23). Dejar `assertAdminRole` ahi seria codigo muerto y, peor, la puerta que
la guardia R20 existe para cerrar. `roles.ts`, `ROLE_ADMINISTRADOR` y
`tests/guards/guard-rol-administrador-unico.test.ts` **no se tocan**: siguen protegiendo el literal
que el middleware todavia usa.

## 6. Las dos guardias (decision 7)

Mismo patron que `tests/guards/guard-rol-administrador-unico.test.ts`, que es el precedente exacto:
recorrido del arbol de archivos de produccion, funciones puras exportadas, fuentes sinteticos que
demuestran que la regla dispara **y** el caso simetrico que no la viola, y el patron **derivado** del
dato real y nunca escrito a mano (R21).

### 6.1 `tests/guards/guard-permisos-sembrados.test.ts` (R19)

Compara `PERMISSIONS` contra `SEED_ROLE_PERMISSIONS`, ambos importados del barrel de `identity`:

- todo `code` de `PERMISSIONS` aparece en al menos un rol de `SEED_ROLE_PERMISSIONS` → si no, rojo
  nombrando el permiso huerfano y diciendo que un modulo nuevo tiene que sumarse al seed;
- todo codigo de `SEED_ROLE_PERMISSIONS` existe en `PERMISSIONS` (el sentido inverso: una asignacion
  a un permiso inexistente reventaria la FK en el despliegue, no en el gate);
- anclas contra el verde por vacuidad: `PERMISSIONS` no esta vacio, tiene exactamente diez entradas,
  y `SEED_ROLE_PERMISSIONS` nombra los dos roles de `SEED_ROLES`;
- casos sinteticos sobre las funciones puras (`findUnseededPermissions(catalogo, seed)`): dispara con
  un catalogo que declara un permiso sin asignar; no dispara con el caso correcto.

### 6.2 `tests/guards/guard-autorizacion-por-permiso.test.ts` (R20)

Barre los archivos `.ts` de `lib/modules/{inventario,recetas,unidades,proveedores,pedidos}/**`
—produccion, con `stripComments` **de linea antes que de bloque**, por el cegado ya documentado en el
precedente— y pone en rojo cualquiera que contenga:

- el literal del rol Administrador u Operador, con el patron **derivado** de `ROLE_ADMINISTRADOR` /
  `ROLE_OPERADOR` (las tres comillas), o
- el identificador `ROLE_ADMINISTRADOR`, `ROLE_OPERADOR`, `assertAdminRole` o `requireAdmin`, o
- el identificador `roleName`.

Fuera del barrido, con su razon escrita en el archivo:

- `lib/modules/identity/**` — el nombre del rol es suyo (display, seed, middleware);
- `lib/composition/route-role-rules.ts` y `middleware.ts` — el corte de ruta por rol sigue vivo a
  proposito hasta QC-75 (R23);
- `tests/`, `e2e/`, `scripts/`, `db/` — mencionan los nombres de rol a proposito.

Casos sinteticos: un `actor.ts` con `roleName` dispara; el `actor.ts` nuevo con `permissions` no; un
comentario que mencione «Administrador» no dispara.

**Lo que estas dos guardias NO cubren, dicho aqui para que nadie lo suponga:** que el permiso exigido
en un caso de uso sea *el correcto* (R16). Eso no es analizable por texto sin un analisis semantico
que no vale la pena; lo cubren los tests de autorizacion por caso de uso (R16, R17), uno por fila de
la tabla.

## 7. Alternativas descartadas

1. **Cada modulo declara sus permisos en su propio `domain/permissions.ts` y `identity` los
   recolecta.** Es lo que sugiere literalmente la frase «un modulo declara dos permisos», y se
   descarta por el **ciclo entre barriles** descrito en §2: `identity -> inventario -> identity` con
   constantes exportadas es `undefined` intermitente en tiempo de carga. La guardia R19 comprueba lo
   mismo con el catalogo centralizado.
2. **Comodin para el Administrador** (`'*'`, o `roleName === 'Administrador'` como atajo). Descartada
   por la decision 2: deja la ruta del permiso sin ejercitar para el unico rol que hoy importa.
3. **Jerarquia implicita `modificar ⊃ consultar`.** Descartada por la decision 3: ahorra dos filas de
   seed y a cambio mete una regla invisible que envejece mal en cuanto aparezca «aprobar» o
   «exportar».
4. **Meter el conjunto de permisos dentro de la cookie de sesion firmada** (junto a `roleName`, que
   ya viaja ahi desde QC-9). Se descarta: los permisos quedarian congelados hasta 8 h —un cambio de
   permisos de un rol no llegaria al service— y la cookie crece con cada permiso nuevo. La lectura de
   sesion ya va a la base en cada peticion, asi que el dato vigente sale gratis salvo por el JOIN de
   §4.
5. **`permissions.id` uuid con `code` unico.** Descartada: `role_permissions` necesitaria un JOIN mas
   para ser legible y no se gana nada; el precedente `document_types.code` ya usa clave de texto.
6. **Una columna `permissions text[]` en `roles`.** Descartada: sin FK, un codigo mal escrito entra en
   silencio y ninguna guardia de base lo ve.
7. **Resolver los permisos con un puerto propio (`PermissionReader`) consultado por cada caso de
   uso.** Descartada: es una consulta mas por operacion sobre la ruta caliente, y obliga a los cinco
   modulos a conocer un puerto nuevo, cuando el actor ya viaja por parametro desde el driving.

## 8. El tercer rol (pregunta abierta 2, sin respuesta)

El spec asume los dos roles que siembra QC-6. **Que haria falta para añadir un tercero sin migrar
datos sembrados**, con este diseño:

1. una constante mas en `identity/domain/roles.ts` y una fila mas en `SEED_ROLES`;
2. una entrada mas en `SEED_ROLE_PERMISSIONS` con sus codigos;
3. correr el seed.

**Ninguna migracion y ningun dato existente tocado**: el seed solo crea lo que falta (R10), y ni
`permissions` ni `role_permissions` cambian de forma. Lo que si obligaria a migrar es lo contrario
—**cambiar el conjunto de permisos de un rol ya sembrado**—, porque el seed no borra asignaciones: eso
seria un `DELETE` explicito en una migracion. Por eso la pregunta 2 sigue mereciendo respuesta antes
de que haya instalaciones en produccion, aunque no bloquee esta ficha.

## 9. Dependencias de terceros

**Ninguna nueva.** Todo lo que hace falta ya esta en el repo: Prisma, zod, vitest y `node:fs` para las
guardias. No se propone ninguna libreria, asi que no hay cuatro checks que reportar
(`docs/architecture.md > Dependencias de terceros`).

## 10. Lo que esta feature NO cambia

- **UI**: cero archivos de `app/` y `components/`. Ni menu, ni 404 por ruta, ni destino del login
  (QC-75).
- **Middleware y `ROUTE_ROLE_RULES`**: intactos (R23). El corte de ruta por rol sigue siendo lo que
  es —y sigue sin ser la frontera de autorizacion, `docs/architecture.md > Permisos y
  autenticacion`—.
- **`users`, `roles`, la sesion firmada y el login**: sin cambios de esquema.
- **E2E**: ninguno nuevo. `CHECKPOINTS.md` pide un E2E cuando la feature toca permisos; la decision
  12 del humano (2026-09-07) lo asigna explicitamente a QC-75, porque aqui no hay pantalla que abrir.
  Se anota como desviacion **declarada y aprobada con el spec**, no como olvido: lo que cierra esta
  ficha son los tests de autorizacion en los cinco servicios, con el rechazo probado (R24).
