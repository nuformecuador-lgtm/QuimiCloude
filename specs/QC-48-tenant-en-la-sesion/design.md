# QC-48 — tenant-en-la-sesion · design.md

> Cómo se implementa `requirements.md`. Nada de esto reabre el alcance ni la tabla de decisiones
> cerradas: aquí solo se decide el CÓMO.

## 0. El resumen en cinco líneas

1. El contenido firmado de la cookie gana **una** clave: el UUID de la empresa. La versión del
   formato sube a `v3` **sin compatibilidad** (R7, R8).
2. Las **dos** consultas que el módulo ya hace —la del login y la de la sesión— ganan un `JOIN` a
   `companies`. **Cero consultas nuevas por petición** (R2, R13).
3. El login corta si la empresa no está viva, en el dominio, sin escribir nada (R3, R4).
4. `resolveSessionUser` gana dos cortes al final de su cadena: empresa que no casa y empresa muerta
   (R14, R15, R17).
5. El middleware **no cambia ni una línea**: el corte del borde lo hace el esquema del contenido
   firmado, que es su dueño (R9, R10). Sí gana tests.

**No hay migración, no hay tabla, no hay columna, no hay RLS que tocar** (R24). QC-47 ya dejó
`users.company_id` obligatoria con FK `ON DELETE RESTRICT` y `companies.deleted_at`; esta ficha es
lectura pura sobre ese modelo.

## 1. Modelo de datos

**Ninguno nuevo.** Lo que esta feature usa, tal y como está hoy en `db/schema.prisma`:

| Modelo | Campo | Por qué lo necesita QC-48 |
| --- | --- | --- |
| `User` | `companyId` (`company_id`, `NOT NULL`, `@db.Uuid`) | Es la empresa de la persona (QC-47 R9). Fuente única, tanto al emitir como al comprobar |
| `User` | relación `company` + índice `users_company_id_idx` | Permite el `JOIN` por clave primaria de `companies` sin lectura extra |
| `Company` | `deletedAt` (`deleted_at`) | `NULL` = empresa viva (QC-47 R6). Es el único criterio de «sigue viva» |

Consecuencia de que no haya esquema nuevo: **no hay `migration.sql` ni `down.sql`**, y la lista de
`CHECKPOINTS.md > Datos y seguridad` sobre tablas nuevas, RLS y `FORCE ROW LEVEL SECURITY` no
aplica a esta feature porque no crea ninguna tabla. Se dice explícitamente para que el reviewer no
lo lea como un olvido.

## 2. El contenido firmado: `v3`

### 2.1 El payload

`lib/modules/identity/adapters/driven/session/session-token.ts` (`SessionPayload`) pasa de

```
{ sub, iat, exp, role }        // v2, QC-9
```

a

```
{ sub, iat, exp, role, cid }   // v3, QC-48
```

- `cid` es el **UUID de la empresa y nada más** (R6). Ni nombre, ni normalizado, ni `deleted_at`:
  el nombre puede cambiar y una foto vieja mentiría durante las 8 h que dura la sesión (decisión
  cerrada 6). Quien necesite mostrarlo lo lee de la base, igual que ya hace el rol (QC-8 R12).
- Se llama `cid` y no `companyId` por la misma razón por la que existen `sub`, `iat` y `exp`: este
  valor viaja **en cada petición** y el UUID ya cuesta 36 caracteres. La traducción `cid ->
  companyId` la hace `parseSessionClaims`, en el mismo sitio donde hoy se traduce
  `role -> roleName`, así que fuera del codec nadie ve la abreviatura.

### 2.2 La versión

`SESSION_VALUE_VERSION` pasa de `'v2'` a `'v3'`. **No se toca nada más**: el corte por versión ya
existe y ya ocurre en los dos sitios correctos, antes de leer el secreto —`hasCurrentVersion()`
en `session-cookie.ts:readSessionClaims` y el `if (version !== SESSION_VALUE_VERSION)` de
`verifySessionValue`, que está por encima del `signSessionValue`—. Es exactamente lo que hizo QC-9
R27 al pasar de `v1` a `v2`, y por eso R8 no cuesta código: cuesta **tests** que afirmen que un
valor `v2` con firma válida y sin caducar se resuelve como «sin sesión».

**Consecuencia aceptada por escrito en la decisión cerrada 7: al desplegar, todas las sesiones
vivas caen.** No hay compatibilidad, no hay lectura de `v2`, no hay dos caminos de verificación.

### 2.3 El esquema del contenido (`domain/session-claims.ts`)

`SESSION_CLAIMS_SCHEMA` gana `cid: z.string().uuid()`, y `SessionClaims` gana
`readonly companyId: string`. `.uuid()` y no `.min(1)` a propósito, mismo criterio que `sub`
(QC-8 `design.md > 4.2`): el valor acaba comparándose contra una columna `@db.Uuid`, y un texto sin
forma de UUID tiene que morir en el borde y no en Prisma.

Esto **es** R9 y **es** el corte del middleware: `parseSessionClaims` devuelve `null` ante un
contenido sin `cid` o con un `cid` mal formado, `verifySessionValue` propaga ese `null`, y el
adaptador driving lo traduce a `{ kind: 'anonymous' }` con el `if (claims === null …)` que ya
existe. Una feature que exige algo nuevo en el borde **sin añadir un `if` en el borde** es la señal
de que el formato es el dueño del contrato, no el portero.

### 2.4 El ticket (`domain/session.ts`)

`SessionTicket` gana `readonly companyId: string`, obligatorio y sin valor por defecto —mismo
criterio que `roleName` en QC-9: una empresa por defecto sería una empresa inventada (R5)—. La
firma pasa a `createSessionTicket(userId, roleName, companyId, now = new Date())`. Posicional y no
objeto: el compilador en `strict` marca todos los sitios de llamada, que son dos (el caso de uso y
sus tests), y un refactor a objeto sería ruido en un diff que ya toca ocho archivos.

## 3. El login (R1-R5)

### 3.1 El puerto gana dos campos

`ports/user-credentials-reader.ts`, `AuthenticatableUser`:

```ts
readonly companyId: string;
readonly companyDeletedAt: Date | null;   // null = empresa viva
```

Se traen los **dos** y no un `companyIsAlive: boolean` ya cocinado: «viva» es una regla de dominio
(QC-47 R6 la define como `deleted_at IS NULL`) y cocinarla en el adaptador la mudaría fuera del
sitio donde se puede testear con objetos planos.

### 3.2 El adaptador: un `JOIN` más, cero consultas más

`adapters/driven/persistence/user-credentials-prisma.ts:findActiveByUsername` va con `$queryRaw`
—y tiene que seguir yendo, porque `mode: 'insensitive'` genera `ILIKE` y perdería el índice
funcional parcial `users_username_unique`—. Se le añade, literalmente, lo mismo que QC-9 le añadió
para el rol:

```sql
SELECT u.id, u.password_hash, u.failed_login_attempts, u.lock_level, u.locked_until,
       r.name AS role_name,
       u.company_id, c.deleted_at AS company_deleted_at
FROM users u
JOIN roles r ON r.id = u.role_id
JOIN companies c ON c.id = u.company_id
WHERE lower(u.username) = lower(${username}) AND u.deleted_at IS NULL
LIMIT 1
```

`INNER JOIN` y no `LEFT`, mismo razonamiento que el de `roles`: `users.company_id` es `NOT NULL`
con FK `ON DELETE RESTRICT` (QC-47 R9, R10, R11), así que todo usuario vivo tiene empresa. Si algún
día no la tuviera, la persona **no se encontraría y no entraría**, en vez de emitirse una sesión
con una empresa inventada (R5).

**Coste medido en consultas: cero.** El `JOIN` resuelve por la clave primaria de `companies`. El
plan gana una búsqueda de índice; no gana un viaje a la base.

### 3.3 El corte, en el dominio

En `domain/verify-credentials.ts`, dentro del camino de éxito y **después** de la única
verificación de hash y de la comprobación de bloqueo:

```
… verify(hash)  →  isLocked?  →  !correcta? → registrarFallo  →
   [NUEVO] empresa no viva → return REJECTED, sin escribir nada
   attempts.set(...)  →  startSession(createSessionTicket(id, roleName, companyId, now))
```

Por qué ahí y no antes:

- **Después del hash** (R4): cortar antes respondería en microsegundos y sería un oráculo de
  tiempo, exactamente lo que QC-7 R29 y el `DECOY_SECRET` existen para evitar.
- **Después de `!correcta`**: una contraseña incorrecta sobre una empresa muerta tiene que seguir
  contando para el bloqueo. Si el corte fuera antes, una empresa dada de baja sería un modo de
  desactivar el contador de intentos.
- **Antes de `attempts.set` y de `startSession`** (R3): ese camino **no escribe nada**. No registra
  fallo —la credencial era correcta y bloquear a alguien por algo que no puede arreglar es un
  castigo por una decisión administrativa— y tampoco reinicia los contadores, porque no hubo login.
- Devuelve el **mismo objeto congelado `REJECTED`** que los otros dos rechazos, no uno nuevo: si
  cada camino construyera el suyo, cualquier día uno se llevaría un campo de más y el login pasaría
  a ser un oráculo (QC-7 R2, R3, R28).

## 4. El lector de sesión (R13-R17)

### 4.1 El puerto y el `select`

`ports/session-user-reader.ts`, `SessionUserRecord`, gana `companyId: string` y
`companyDeletedAt: Date | null`. `adapters/driven/persistence/session-user-prisma.ts` amplía su
`select`, que ya es explícito y mínimo:

```ts
select: {
  id: true, username: true, firstNames: true, lastNames: true,
  role: { select: { name: true } },
  companyId: true,
  company: { select: { deletedAt: true } },   // NUEVO
}
```

**Aquí está la respuesta a «comprobar que la empresa sigue viva puede necesitar un dato que hoy
`findActiveById` no trae», y su coste, dicho explícitamente:**

- `companyId` **ya está en la fila que se lee**: es una columna de `users`. Traerla no cuesta nada.
- `company.deletedAt` **no está en esa fila**: vive en `companies`. Prisma lo resuelve en la
  **misma llamada** que el `role`, por la relación ya declarada y por la clave primaria de
  `companies`. **No añade una consulta por petición**, que era la condición.
- Lo que **sí** cuesta, y se acepta por escrito: (a) el plan de esa consulta gana un `JOIN` más —
  una búsqueda por clave primaria, en la ruta más caliente de la aplicación, que ya hacía otro
  `JOIN` por `users_role_id_idx`—; (b) el `select` deja de ser tan estrecho: sale de la base una
  marca de tiempo más, que **no es PII** y no se registra en ningún log; (c) esa comprobación es
  **por petición**, así que una empresa dada de baja expulsa a sus usuarios en la siguiente
  navegación, no al cabo de 8 h — que es justamente lo que se quería.

Prisma emite hoy este acceso como un `JOIN` correlacionado; si en algún momento lo emitiera como
una segunda consulta, seguiría siendo **una lectura por petición del mismo `findFirst`** y no una
consulta pedida por nuestro código. Es el mismo compromiso que QC-8 aceptó para `role.name`.

### 4.2 La cadena, en un solo sitio

Hoy `domain/resolve-session-user.ts` contiene «el encadenado de cortes que ES la política». Esta
feature necesita **dos** proyecciones de esa misma política (el `SessionUser` de la zona privada y
el contexto de empresa que consumirán QC-49…QC-60), y duplicar la cadena sería tener dos
definiciones de «hay sesión» — justo lo que R21 prohíbe.

Diseño: un archivo nuevo `domain/resolve-session.ts` con la cadena **completa**, y
`resolve-session-user.ts` reducido a una proyección suya.

```ts
// domain/session-context.ts  (tipo nuevo)
export type SessionContext = {
  readonly userId: string;
  readonly companyId: string;
  readonly roleName: string;
};

// domain/resolve-session.ts
export type ResolvedSession = { readonly user: SessionUser; readonly context: SessionContext };
export function createResolveSession(deps): (now?: Date) => Promise<ResolvedSession | null>
```

Cadena, con los cortes nuevos **al final** (R17):

1. `session.readClaims()` → `null` ⇒ sin sesión. *(sin cookie, versión no vigente, firma que no
   casa, contenido inválido — aquí cae R9)*
2. `isSessionExpired` ⇒ sin sesión.
3. `users.findActiveById(claims.sub)` → `null` ⇒ sin sesión. *(inexistente o dado de baja)*
4. **NUEVO** `record.companyId !== claims.companyId` ⇒ sin sesión (R14).
5. **NUEVO** `record.companyDeletedAt !== null` ⇒ sin sesión (R15).
6. Compone `{ user, context }`.

Los pasos 4 y 5 van **detrás** del 3 y no antes: no se puede comparar contra una fila que todavía
no se ha leído, y adelantarlos haría que una sesión caducada costara una consulta (R17). Se
comparan por separado —y no con un único `if` combinado— para que cada uno tenga su test y su
`R<n>`.

`createResolveSessionUser` se conserva con **la misma firma pública** (`(now?) =>
Promise<SessionUser | null>`) y pasa a ser `resolveSession(...)?.user`. Así ni el puerto
`SessionProvider`, ni `lib/composition`, ni el layout privado, ni los tests de QC-8 cambian de
forma.

### 4.3 Qué pasa cuando el corte salta

Nada nuevo (R16, decisión cerrada 4): `getSessionUser()` devuelve `null`, y el layout privado
—última línea de defensa, `docs/architecture.md > Permisos y autenticacion`— redirige al login,
igual que cuando el usuario se da de baja a mitad de sesión (QC-8 R11). **No se borra la cookie**:
el lector de sesión no escribe cookies, nunca lo ha hecho, y hacerlo aquí abriría un camino de
escritura desde un Server Component. La cookie muere sola en su `exp`, y mientras tanto no vale
para nada porque el corte se reevalúa en cada petición.

**Consecuencia aceptada por escrito en la decisión cerrada 4: quien esté a mitad de un formulario
pierde lo escrito.**

## 5. `SessionUser` no cambia, y por qué

`domain/session-user.ts` dice en su cabecera que está **CONGELADO desde la feature 8**. Esta ficha
**no lo descongela**: `companyId` va en el tipo nuevo `SessionContext`, no en `SessionUser`.

Razones, en orden de peso:

1. `SessionUser` es **lo que la UI recibe por props** (menú de usuario, iniciales, nombre
   mostrable). El identificador de empresa no se pinta en ninguna pantalla —y ninguna pantalla que
   lo muestre entra en esta ficha (R25)—, así que metérselo sería repartir un identificador de
   tenant por el árbol de componentes sin que nadie lo use.
2. Lo que QC-49…QC-60 necesitan **no es un `SessionUser`**: es el actor `{ id, roleName }` que sus
   casos de uso ya reciben por parámetro, más la empresa. `SessionContext` es exactamente eso, y
   ahorra que cada Server Action tenga que recomponerlo.
3. Un campo obligatorio nuevo en un tipo congelado obliga a tocar todas las fixtures de
   `SessionUser` de los tests de QC-8, QC-10 y QC-12 sin ganar nada.

**Coste que esto impone y se acepta:** una Server Action que necesite *a la vez* el nombre mostrable
y la empresa tendría que llamar a las dos funciones y pagar **dos** consultas. No hay ningún sitio
así hoy —el layout pinta, las acciones actúan—, y si aparece, la salida ya está escrita:
`getSession()` devolviendo el `ResolvedSession` entero, que la cadena de §4.2 ya construye.

## 6. Lo que se expone al servidor (R18-R22)

- `ports/session-provider.ts` gana `getSessionContext(): Promise<SessionContext | null>`.
- `lib/composition/index.ts` lo cablea junto a `getSessionUser`, con **la misma** instancia de
  `createResolveSession` (una sola construcción, no dos: dos serían dos cableados que pueden
  divergir, mismo criterio que `checkCredentialPolicy` en QC-19).
- El contrato público `lib/modules/identity/index.ts` reexporta el **tipo** `SessionContext` y
  `createResolveSession`. Sigue siendo dominio puro: no arrastra Prisma ni `next/*`.
- Consumo: `const contexto = await identity.getSessionContext();` desde una Server Action o un
  Server Component.

`SessionContext` lleva `companyId`, `userId` y `roleName` y **nada más** (R22). No expone
capacidades, no expone permisos y no responde «¿puedo?». Que la empresa esté ahí **no autoriza**:
`docs/architecture.md > Acceso a datos y autorizacion` sigue mandando entero, la frontera es el
service, y un aislamiento implementado solo porque «la empresa viaja en la sesión» **no cuenta como
implementado**. Esta feature no filtra ni una consulta de negocio (R25): eso es QC-49, QC-50,
QC-51, QC-59 y QC-60.

**`companyId` sale de la base, no de la cookie** (R20). Tras el paso 4 de §4.2 los dos valores son
iguales por construcción, así que la elección no cambia el valor — cambia de quién es la culpa el
día que dejen de serlo. Exponer el de la base hace que el dato que filtra consultas de negocio
tenga como origen la fila, y el valor firmado quede reducido a lo único que es: material de
comparación.

## 7. El middleware (R10-R12)

`adapters/driving/route-guard-middleware.ts` y `middleware.ts`: **cero cambios de código.**

- R10 lo cumple la cadena `parseSessionClaims → null → { kind: 'anonymous' } → decideRouteAccess →
  redirect al login con `next=`', que ya existe entera desde QC-9.
- R11 lo cumple —y lo **hace cumplir**— `tests/guards/guard-middleware-edge.test.ts`, que recorre
  el cierre de imports desde `middleware.ts`. Esta feature no importa nada nuevo ahí:
  `session-token.ts` y `session-claims.ts` ya están dentro y siguen sin tocar Prisma ni
  `next/headers`. **Nada de Prisma en el borde**, que era la restricción dura.
- R12 se cumple por omisión: `RouteAccessSession` **no** gana `companyId` (ver §8, alternativa C) y
  `ROUTE_ROLE_RULES` sigue siendo ruta→rol.

Lo que sí gana el middleware son **tests** (§10). Un requisito cuyo código ya existe pero cuya
garantía nadie afirma es un requisito que se rompe en la siguiente feature.

## 8. Alternativas descartadas

**A. Consultar la empresa aparte, con un puerto propio (`CompanyReader.isAlive(id)`), desde
`resolveSessionUser`.** Es la lectura literal del enunciado «comprobar que sigue viva» y sería el
diseño más ortogonal: `identity` tendría un lector de empresas reutilizable. **Descartada** porque
cuesta **una consulta más en cada petición autenticada** de toda la aplicación, y la decisión
cerrada 3 dice lo contrario con todas las letras: «`company_id` está en **esa misma fila** y
comparar cuesta cero consultas nuevas». Ampliar un `select` que ya se hace es gratis; una segunda
ida a la base, no.

**B. Cortar la empresa muerta en el `WHERE` del login (`AND c.deleted_at IS NULL`), en vez de en el
dominio.** Es más corto, hace el caso indistinguible del «usuario inexistente» de forma automática
—decoy, sin escrituras, rechazo genérico— y tiene precedente: `findActiveByUsername` ya filtra
`u.deleted_at IS NULL` en el puerto y no en el dominio. **Descartada** por dos razones: (1) el
dominio necesita `companyId` de todas formas para el ticket, así que el `JOIN` entra igual y el
ahorro es ilusorio; (2) `CHECKPOINTS.md` exige que **cada regla de acceso se valide en el service y
tenga su test ahí**, y una regla escondida en un `WHERE` solo se puede afirmar con un test de
integración contra Postgres — más lento, más frágil y en el archivo equivocado. Con el corte en
`verify-credentials.ts`, R3 y R4 se prueban con objetos planos y puertos falsos.

**C. Añadir `companyId` a `RouteAccessSession` y pasarlo a `decideRouteAccess`.** Dejaría el borde
«consciente del tenant» y prepararía reglas ruta→empresa. **Descartada**: ninguna regla de acceso
depende hoy de la empresa, `docs/architecture.md > Dominio` n.º 1 llama sobre-ingeniería
—rechazable por el reviewer— a todo lo que no está pedido, y un campo que nadie lee invita a que
alguien lo use un día como si autorizara, que es exactamente el error contra el que avisa el
comentario R29 de `route-access.ts`. R12 fija por escrito que la decisión de ruta **no** depende de
ese valor.

**D. Mantener `v2` y hacer la empresa opcional en el contenido firmado, con compatibilidad.** No
tiraría las sesiones vivas al desplegar. **Descartada por decisión cerrada 7**, y la razón que
QC-9 ya escribió en `session-token.ts` sigue en pie: mantener dos formatos son **dos caminos de
verificación vivos para siempre**, uno de ellos sin empresa; y un contenido firmado con empresa
opcional obliga a decidir qué hacer con una sesión sin empresa en cada punto de uso, que es la
puerta trasera que la feature venía a cerrar.

**E. Firmar también el nombre de la empresa, para poder mostrarlo sin consultar.** **Descartada por
decisión cerrada 6**: el nombre puede cambiar y una foto vieja mentiría durante 8 h. Además ninguna
pantalla lo muestra en esta ficha (R25).

## 9. Dependencias de terceros

**Ninguna nueva** (R28). Todo lo que hace falta ya está: `zod` para el esquema del contenido
firmado, WebCrypto para la firma —de plataforma, no un paquete— y Prisma para las dos consultas que
ya existían. `package.json` no se toca y `docs/dependencias.md` no gana ninguna fila, así que
`tests/guards/guard-dependencias-aprobadas.test.ts` no tiene nada nuevo que aprobar. Si durante la
implementación apareciera la necesidad de una, **no se instala**: se para, se documentan los cuatro
checks de `docs/architecture.md > Dependencias de terceros` y lo aprueba el humano (regla 7 de
`CLAUDE.md`).

## 10. Verificación

Nivel por nivel (`docs/verification.md`), con el mapa que el implementer copiará a
`progress/impl_QC-48-tenant-en-la-sesion.md`.

| Nivel | Archivo | Cubre |
| --- | --- | --- |
| Unit dominio | `tests/unit/identity/session-claims.test.ts` | R6, R9 |
| Unit codec | `tests/unit/identity/session-token.test.ts` | R6, R7, R8 |
| Unit codec | `tests/unit/identity/session-cookie.test.ts` | R8 (corte de versión antes del secreto) |
| Unit dominio | `tests/unit/identity/session.test.ts` | R5 (ticket sin empresa no compila / no se construye) |
| Unit dominio | `tests/unit/identity/verify-credentials.test.ts` | R1, R2, R3, R4, R5, R26 |
| Unit dominio | `tests/unit/identity/resolve-session-user.test.ts` (+ `resolve-session.test.ts`) | R13, R14, R15, R16, R17, R19, R20, R21, R22 |
| Unit driving | `tests/unit/identity/route-guard-middleware.test.ts` | R10, R12, R23 |
| Guardia | `tests/guards/guard-middleware-edge.test.ts` (ya existe) | R11 |
| Guardia | `tests/guards/guard-arquitectura-modulos.test.ts` (ya existe) | frontera hexagonal del archivo nuevo |
| Unit composición | `tests/unit/composition/identity-facade.test.ts` | R18 (la fachada expone `getSessionContext`), R22 (y nada más) |
| Unit esquema | `tests/unit/schema/*` (ya existen) | R24 (el esquema no se mueve) |
| No-regresión | suites ya existentes de `inventario`, `recetas`, `unidades`, `proveedores`, `pedidos` | R25 (ninguna consulta suya cambia) |
| Integración | `tests/integration/identity/*` | R2, R13 (el `JOIN` devuelve empresa y su `deleted_at`) |
| E2E | `e2e/login.spec.ts` **extendido** | R3, R27 |

El E2E añade **un** `test(...)` al `describe` existente: el fixture crea una segunda empresa con
`deletedAt` puesto —el índice `companies_name_unique` es parcial (`WHERE deleted_at IS NULL`), así
que su nombre no choca— y un usuario dentro; el login con credenciales correctas se queda en
`/login`, muestra `GENERIC_CREDENTIALS_ERROR` y **no** deja cookie. El `afterAll` la borra en el
mismo orden que ya usa (usuarios → rol → empresas), porque `users.company_id` es `ON DELETE
RESTRICT`.

Gate: `./init.sh --rapido` por tanda; `./init.sh` completo antes del PR, sin excepción (regla 5 de
`CLAUDE.md`).

## 11. Riesgos

1. **Todas las sesiones vivas caen al desplegar.** Aceptado por escrito (decisión cerrada 7). No es
   un fallo: es el precio de no mantener dos formatos. Efecto visible: quien esté dentro aparece en
   el login en su siguiente navegación.
2. **Fixtures de test que construyan un `SessionTicket` o un `SessionUserRecord` a mano dejan de
   compilar.** Es deseado —así se descubren todos los sitios de llamada— y `typecheck` lo señala
   uno a uno.
3. **El E2E de login crea y borra empresas.** Ya lo hace desde QC-47 y su barrido por prefijo con
   edad mínima está probado; el caso nuevo solo añade una empresa más con el mismo prefijo. Si el
   barrido fallara, `identity-constraints.int.test.ts` se pondría rojo — ruidoso, no silencioso.
4. **La comprobación de empresa viva es por petición.** Una empresa dada de baja expulsa a sus
   usuarios en la siguiente navegación. Es lo pedido, pero conviene que la ficha que construya la
   baja de empresas lo sepa: dar de baja una empresa **echa a todo el mundo al instante**.
