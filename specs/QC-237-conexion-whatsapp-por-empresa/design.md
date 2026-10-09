# QC-237 — conexion-whatsapp-por-empresa · design.md

> Zona: `fullstack` · Complejidad: `medium` · depends_on: QC-234 · Rama:
> `feature/QC-237-conexion-whatsapp-por-empresa`
>
> El **qué** está en `requirements.md` (R1–R43). Aquí va el **cómo**. Precedentes que se copian:
>
> - **QC-234** (`specs/QC-234-cifrado-de-secretos-de-integraciones/design.md`): puertos
>   `SecretCipher`/`SecretDigest`, `SecretContext`, errores del módulo y su `§9 Fronteras`.
> - **`clientes`**: actor y `requirePermission` (`domain/actor.ts`), `company-scope.ts` como punto
>   único del ámbito, Server Actions con `currentActor()` dentro de `runInRequestScope`
>   (`customer-actions.ts`), migración escrita a mano con FK de drift y RLS forzada al final
>   (`db/migrations/20260924120000_customers/migration.sql`), y su guardia
>   `guard-ambito-empresa-clientes.test.ts`.
> - **`documentos`**: dobles de E2E elegidos en la composición con `documentsE2EDoublesEnabled()`
>   (`adapters/driven/config/e2e-doubles-env.ts`), activados solo en `playwright.config.ts` y
>   vigilados por `guard-dobles-e2e.test.ts`.
> - **QC-222**: la página cascarón de `/integraciones/whatsapp`, su menú y su E2E.
>
> **Regla transversal.** Manda `docs/conventions.md > Comentarios`: ningún comentario nuevo cita
> `QC-<n>`, `R<n>`, `design.md` ni «decisión cerrada». En los tests, `R<n>` va en el nombre del caso.
> Ningún identificador nuevo lleva el segmento `password`/`pass` (`guard-password-never-plaintext`):
> los campos de secreto se llaman `accessToken` y `appSecret`.

---

## Lo que ya existe

Buscado `whatsapp`, `conexión`/`connection`, `graph.facebook`/`Graph`, `phone_number_id`/`phoneNumberId`,
`verify_token`, `webhook` y `APP_BASE_URL`/URL pública en tres sitios:

- `feature_list.json`, por `name` y `description`, en todos los estados;
- `specs/`, con grep (`WhatsappConnection`, `whatsapp_connections`, `graph.facebook`: nada);
- el código, con el grafo del worktree (`search_graph` «whatsapp connection graph phone number
  verify token webhook»: solo símbolos de sesión y pedidos, nada del dominio) y con grep sobre
  `lib/`, `app/`, `components/`, `db/`, `tests/`, `e2e/` y `scripts/`.

| Apareció | Qué es | Qué se hace |
|---|---|---|
| QC-234 (`done`, PR #191) | `integraciones.secretCipher` y `integraciones.secretDigest` en la composición; `SecretContext`; `IntegracionesError`, `SecretUnreadableError`, `ValidationError` | **Se reutiliza entero**. Es la dependencia |
| QC-221 / QC-222 (`done`) | Permiso `integraciones.modificar`, `WHATSAPP_INTEGRATION_ROUTE`, item de menú y página cascarón `app/(private)/integraciones/whatsapp/page.tsx` con `IntegrationPlaceholder` | La página **se reescribe** (la ficha lo pide). Permiso, ruta y menú **no se tocan** |
| `APP_BASE_URL` (`.env.example:103`, `identity/adapters/driven/config/mail-config-env.ts`) | URL pública de la app para el enlace de contraseña | **Se reutiliza la variable** con un lector propio en `integraciones` (no se importa un driven de otro módulo). D15 |
| `documentsE2EDoublesEnabled` (`documentos`) | Patrón de dobles de E2E | **Se copia la forma** con una variable propia, `INTEGRATIONS_E2E_DOUBLES` (§9) |
| `components/ui/tabs.tsx`, `alert-dialog.tsx`, `card.tsx`, `badge.tsx`, `input.tsx`, `label.tsx`, `button.tsx` | Primitivas shadcn ya instaladas | Se reutilizan; ninguna primitiva nueva |
| QC-119 `webhook-whatsapp-recepcion` (`cancelled`) | Recepción, épica antigua | Nada que reutilizar |
| QC-238…QC-248 (`pending`) | Recepción, envío, plantillas, contactos, notificaciones | Consumidores. Fronteras en §13 |
| Ningún modelo, tabla, cliente HTTP de Graph ni componente de copiar al portapapeles | — | Nacen aquí |

Conclusión: no existe nada que resuelva parte del alcance. Se sigue.

---

## 1. Qué cambia (resumen)

```
db/schema.prisma                                              ← modelo WhatsappConnection + 2 enums
db/migrations/20261009120000_whatsapp_connections/{migration,down}.sql
lib/shared/routes.ts                                          ← WHATSAPP_WEBHOOK_ROUTE_BASE + whatsappWebhookPath(id)
lib/modules/integraciones/
  index.ts                                                    ← + errores, tipos y fábricas de casos de uso
  domain/
    errors.ts                                                 ← + 4 clases
    actor.ts                                                  ← Actor y requirePermission
    integraciones-scope.ts                                    ← IntegracionesScope { companyId }
    whatsapp-connection.ts                                    ← tipos: estado, origen, fila, vista
    whatsapp-connection-input.ts                              ← esquemas zod de alta y edición
    graph-failure.ts                                          ← sanea el mensaje de Meta
    connection-status.ts                                      ← estado tras una prueba buena
    get-whatsapp-connection.ts
    create-whatsapp-connection.ts
    update-whatsapp-connection.ts
    test-whatsapp-connection.ts
    set-whatsapp-connection-enabled.ts                        ← deshabilitar y habilitar
    regenerate-whatsapp-verify-token.ts
  ports/
    whatsapp-connection-repository.ts
    whatsapp-graph-client.ts
    random-source.ts
  adapters/driven/
    config/whatsapp-config-env.ts                             ← WHATSAPP_GRAPH_API_VERSION
    config/public-base-url-env.ts                             ← APP_BASE_URL
    config/e2e-doubles-env.ts                                 ← INTEGRATIONS_E2E_DOUBLES
    graph/whatsapp-graph-client-fetch.ts                      ← fetch nativo
    graph/whatsapp-graph-client-canned.ts                     ← doble E2E
    persistence/company-scope.ts
    persistence/whatsapp-connection-prisma.ts
    security/random-source-node.ts                            ← randomUUID + randomBytes
  adapters/driving/
    whatsapp-connection-actions.ts                            ← 'use server'
lib/composition/index.ts                                      ← amplía `integraciones`
lib/modules/errores/domain/{error-codes,error-catalog}.ts     ← + 3 códigos
app/(private)/integraciones/whatsapp/page.tsx                 ← reescrita
app/(private)/integraciones/whatsapp/components/*             ← nuevos (§8)
.env.example, playwright.config.ts
tests/**, e2e/**                                              ← §11
```

`app/(private)/integraciones/components/integration-placeholder.tsx` **se queda**: lo siguen usando
`proveedor-ia` e `inventarios`.

---

## 2. Modelo de datos

### 2.1 Prisma

```prisma
enum WhatsappConnectionOrigin {
  MANUAL
  EMBEDDED_SIGNUP
  @@map("whatsapp_connection_origin")
}

enum WhatsappConnectionStatus {
  PENDING
  ACTIVE
  ERROR
  DISABLED
  @@map("whatsapp_connection_status")
}

/// <comentario corto: los dos índices únicos parciales viven solo en la migración; FK de drift>
/// @module integraciones
model WhatsappConnection {
  id                 String                   @id @db.Uuid
  companyId          String                   @map("company_id") @db.Uuid
  origin             WhatsappConnectionOrigin @default(MANUAL)
  displayName        String                   @map("display_name")
  metaAppId          String                   @map("meta_app_id")
  wabaId             String                   @map("waba_id")
  phoneNumberId      String                   @map("phone_number_id")
  displayPhoneNumber String?                  @map("display_phone_number")
  verifiedName       String?                  @map("verified_name")
  accessTokenEnc     String                   @map("access_token_enc")
  appSecretEnc       String                   @map("app_secret_enc")
  verifyTokenHash    String                   @map("verify_token_hash")
  status             WhatsappConnectionStatus @default(PENDING)
  lastError          String?                  @map("last_error")
  lastCheckedAt      DateTime?                @map("last_checked_at") @db.Timestamptz(6)
  lastWebhookAt      DateTime?                @map("last_webhook_at") @db.Timestamptz(6)
  createdById        String                   @map("created_by") @db.Uuid
  createdAt          DateTime                 @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt          DateTime                 @updatedAt @map("updated_at") @db.Timestamptz(6)
  deletedAt          DateTime?                @map("deleted_at") @db.Timestamptz(6)

  @@unique([companyId, id], map: "whatsapp_connections_company_id_id_key")
  @@index([createdById], map: "whatsapp_connections_created_by_idx")
  @@map("whatsapp_connections")
}
```

- **`id` sin default.** Lo genera la aplicación (`RandomSource.newId()`, `randomUUID`) porque el
  `recordId` del contexto de cifrado tiene que existir **antes** de cifrar (D8; QC-234 §9 deja la
  elección a esta ficha). Insertar y cifrar después obligaría a una fila con secretos de relleno o
  a columnas nulas que no lo son.
- **Valores del enum en mayúscula** (`MANUAL`, `PENDING`…): es la forma de los enums del esquema
  (`OrderExecutionAction`). La ficha los escribe en minúscula; es el mismo valor. Los tests y la UI
  usan las constantes del dominio, nunca el literal.
- **`appSecretEnc` obligatorio.** El plan lo dejaba nulo para `embedded_signup`, pero esa forma no
  existe en fase 1 y preparar su nulabilidad es infraestructura «por si acaso»
  (`docs/architecture.md > Dominio`). Fase 2 lo relaja con su migración.
- **Ninguna columna de versión de clave** (D9). La versión de cada secreto es el prefijo `v<n>:` de
  su valor cifrado; QC-250 sabe qué filas siguen en una versión vieja con
  `split_part(access_token_enc, ':', 1)` y `split_part(app_secret_enc, ':', 1)`.
- **IDs de Meta como `text` sin límite de longitud** (D14): `meta_app_id`, `waba_id` y
  `phone_number_id` son texto libre no vacío; ni la columna ni zod imponen dígitos ni un máximo.
- **`createdById`** con `@map("created_by")`, como pide la ficha y como nombra la columna `customers`.
  Sin `updatedBy`: la ficha no lo pide.
- **Sin `@relation`**: `company_id` y `created_by` son FK escritas a mano (drift), como `customers`,
  para que ningún `include` cruce a `identity`.

### 2.2 Migración `20261009120000_whatsapp_connections`

Escrita a mano (las FK de drift harían que `migrate dev` propusiera un reset, igual que en
`customers`). En orden:

1. `CREATE TYPE "whatsapp_connection_origin" AS ENUM ('MANUAL','EMBEDDED_SIGNUP')` y
   `CREATE TYPE "whatsapp_connection_status" AS ENUM ('PENDING','ACTIVE','ERROR','DISABLED')`.
2. `CREATE TABLE "whatsapp_connections"` con las columnas de §2.1; `updated_at` sin default.
3. `CREATE UNIQUE INDEX "whatsapp_connections_company_id_id_key" ON (company_id, id)`: clave
   candidata para las FK compuestas de QC-238 (`whatsapp_contacts`, `whatsapp_messages`).
4. `CREATE UNIQUE INDEX "whatsapp_connections_company_live_key" ON (company_id) WHERE deleted_at IS NULL` (R6, D2).
5. `CREATE UNIQUE INDEX "whatsapp_connections_phone_number_id_live_key" ON (phone_number_id) WHERE deleted_at IS NULL` (R7, D3, D16).
6. FK `company_id → companies(id)` y `created_by → users(id)`, `ON DELETE RESTRICT ON UPDATE CASCADE`.
7. `CREATE INDEX "whatsapp_connections_created_by_idx"`.
8. `ENABLE ROW LEVEL SECURITY` y `FORCE ROW LEVEL SECURITY`, sin policies, al final.

**Sin filas de permisos**: `integraciones.modificar` existe desde QC-221 (R43).

`down.sql`: `DROP TABLE "whatsapp_connections"` (arrastra índices y FK) y los dos `DROP TYPE`.

`guard-empresa-en-esquema`: la tabla tiene `company_id`, la lista de exentas no cambia.
`guard-rls-force`: la ve por la migración.

---

## 3. Dominio

### 3.1 Tipos (`domain/whatsapp-connection.ts`)

```ts
export const WHATSAPP_CONNECTION_STATUSES = ['PENDING', 'ACTIVE', 'ERROR', 'DISABLED'] as const;
export type WhatsappConnectionStatus = (typeof WHATSAPP_CONNECTION_STATUSES)[number];

/** Lo que el dominio lee y escribe. Lleva los valores cifrados: NUNCA sale del módulo. */
export type WhatsappConnectionRecord = {
  id: string; companyId: string; origin: 'MANUAL' | 'EMBEDDED_SIGNUP';
  displayName: string; metaAppId: string; wabaId: string; phoneNumberId: string;
  displayPhoneNumber: string | null; verifiedName: string | null;
  accessTokenEnc: string; appSecretEnc: string; verifyTokenHash: string;
  status: WhatsappConnectionStatus; lastError: string | null;
  lastCheckedAt: Date | null; lastWebhookAt: Date | null;
};

/** Lo único que sale hacia la UI. Sin secretos ni valores cifrados (R10). */
export type WhatsappConnectionView = {
  id: string; displayName: string; metaAppId: string; wabaId: string; phoneNumberId: string;
  displayPhoneNumber: string | null; verifiedName: string | null;
  status: WhatsappConnectionStatus; lastError: string | null;
  lastCheckedAt: string | null; lastWebhookAt: string | null;   // ISO, serializable
};

export function toWhatsappConnectionView(record: WhatsappConnectionRecord): WhatsappConnectionView;
```

`toWhatsappConnectionView` construye la vista **campo a campo**, nunca con spread: un campo nuevo
de la fila no puede colarse en la vista sin que alguien lo escriba (mismo criterio que
`createErrorStateTranslator`).

### 3.2 Actor y ámbito

- `domain/actor.ts`: `Actor { id, companyId, permissions }` y `requirePermission(actor,
  'integraciones.modificar')` con `assertPermission` del barrel de `identity` y `UnauthorizedError`.
  Es **el único** archivo del módulo que escribe el código del permiso (lo fija el test de §11.3).
- `domain/integraciones-scope.ts`: `IntegracionesScope = { readonly companyId: string }`. Se
  construye **solo** desde `actor.companyId` (R2).

### 3.3 Errores (`domain/errors.ts`, se amplía)

| Clase | `code` | Cuándo |
|---|---|---|
| `UnauthorizedError` | `unauthorized` (existe) | R1 |
| `WhatsappConnectionNotFoundError` | `whatsapp_connection_not_found` (nuevo) | R3 |
| `WhatsappConnectionExistsError` | `whatsapp_connection_exists` (nuevo) | R6 |
| `WhatsappPhoneNumberTakenError` | `whatsapp_phone_number_taken` (nuevo) | R7 |
| `ActionNotAllowedError` | `action_not_allowed` (existe) | R32 |
| `ValidationError`, `SecretUnreadableError` | ya existen | R24, R13 |

**Una prueba fallida no es un error**, es un resultado (§3.5). Motivo: el traductor de errores toma
el mensaje **siempre** del catálogo y nunca del error (`error-state.ts`), y lo que hay que mostrar es
el texto variable de Meta (R23). Meterlo en `diagnostic` lo mandaría al log, no a la pantalla.

### 3.4 Mensaje de Meta (`domain/graph-failure.ts`)

```ts
export type GraphFailure = { kind: 'rejected' | 'unreachable'; message: string | null };
export const GRAPH_UNREACHABLE_MESSAGE = 'No se pudo contactar con Meta.';
export function metaMessageOf(failure: GraphFailure, secrets: readonly string[]): string;
```

`metaMessageOf` (R20): sin `message` → `GRAPH_UNREACHABLE_MESSAGE`; con él, sustituye cada
aparición literal de cada secreto no vacío por `[oculto]` y recorta a 500 caracteres. Se sanea
aunque Meta no suela repetir el token: el texto acaba en la base (`last_error`) y en la pantalla.

### 3.5 Casos de uso

Fábricas `createX(deps)` como en `clientes`. `deps`: `connections: WhatsappConnectionRepository`,
`graph: WhatsappGraphClient`, `cipher: SecretCipher`, `digest: SecretDigest`, `random:
RandomSource`, `now?: () => Date`. Todas abren con `requirePermission` (R1) **antes** de zod y de
tocar un puerto.

| Caso de uso | Firma | Pasos |
|---|---|---|
| `getWhatsappConnection` | `(actor) => Promise<WhatsappConnectionView \| null>` | `findLive(scope)` → vista o `null` |
| `createWhatsappConnection` | `(input, actor) => Promise<CreateResult>` | zod (R24) → `findLive(scope)` ≠ null ⇒ `ConnectionExists` (R6) → **prueba** con el token en claro (R21) → si falla: `{ status: 'test_failed', message }` sin escribir (R23) → si no: `id = random.newId()`, `verifyToken = random.newVerifyToken()`, cifrar los dos secretos con `{companyId, recordId: id, field}` (R9), `digest.digestOf(verifyToken)`, `connections.create(row, scope)` con `PENDING`, número, nombre, `lastCheckedAt = now`, `createdById = actor.id` (R22) → `{ status: 'created', connection: view, verifyToken }` (R14) |
| `updateWhatsappConnection` | `(id, input, actor) => Promise<UpdateResult>` | zod (secretos opcionales; vacío = ausente, R11) → `findLiveById(id, scope)` o `NotFound` (R3) → si hay secreto nuevo o cambia `phoneNumberId`: token efectivo = el nuevo o `cipher.decrypt` del guardado (R13) → prueba → falla: `{status:'test_failed', message}` sin escribir; la fila conserva credenciales, estado y datos (R26, D10); buena: patch con R19 y estado de R31 (salvo `DISABLED`, que se conserva) → solo cifra los secretos escritos (R11, R12) → `connections.update` → `{status:'saved', connection}`. Sin secreto ni teléfono: patch de texto, sin Graph (R27) |
| `testWhatsappConnection` | `(id, actor) => Promise<TestResult>` | `findLiveById` → `DISABLED` ⇒ `ActionNotAllowed` (R32) → `decrypt` (R13) → prueba → buena: R19 + R31; fallida: `ERROR`, `lastError`, `lastCheckedAt` (R28) → `{status:'tested', ok, connection, message?}` |
| `setWhatsappConnectionEnabled` | `(id, enabled, actor)` | `false`: `DISABLED` sin Graph; idempotente (R29). `true`: si no está `DISABLED`, no hace nada; si lo está, `decrypt` + prueba → buena: R19 + R31; fallida: sigue `DISABLED` y devuelve `message` (R30, D11) |
| `regenerateWhatsappVerifyToken` | `(id, actor)` | `findLiveById` → token nuevo → `update({ verifyTokenHash })` sin tocar `status` (R15) → `{status:'regenerated', verifyToken}` |

**R13 en detalle.** Si `decrypt` lanza `SecretUnreadableError`, el caso de uso escribe `ERROR` y
`lastError = 'No se pudo leer una credencial guardada. Vuelve a escribir el Access Token y el App
Secret.'` y **relanza** el error, que la acción traduce con el catálogo. En `enable`, la conexión
sigue `DISABLED` (no pasa a `ERROR`), coherente con D11.

**Estado tras prueba buena** (`domain/connection-status.ts`, R31, D12):
`statusAfterGoodTest(record) = record.lastWebhookAt === null ? 'PENDING' : 'ACTIVE'`.

**Concurrencia.** El chequeo previo de R6 es para dar un error limpio; la garantía son los índices
únicos parciales. El adaptador traduce la violación de cada índice a su error (§4.2), así que dos
altas simultáneas acaban en una fila y un `whatsapp_connection_exists`.

**Teléfono de otra empresa (R7).** El dominio **no** busca el teléfono fuera de su empresa: sería
una lectura que cruza la frontera (`docs/architecture.md > Dominio` n.º 1). Lo detecta solo el
índice único global, y el adaptador lo traduce a `WhatsappPhoneNumberTakenError`, cuyo texto no
nombra la otra empresa. Consecuencia aceptada: en ese caso la prueba contra Graph ya se hizo.

---

## 4. Puertos y adaptadores

### 4.1 `ports/whatsapp-connection-repository.ts`

```ts
export interface WhatsappConnectionRepository {
  findLive(scope: IntegracionesScope): Promise<WhatsappConnectionRecord | null>;
  findLiveById(id: string, scope: IntegracionesScope): Promise<WhatsappConnectionRecord | null>;
  create(row: NewWhatsappConnectionRow, scope: IntegracionesScope): Promise<WhatsappConnectionRecord>;
  update(id: string, patch: WhatsappConnectionPatch, scope: IntegracionesScope): Promise<WhatsappConnectionRecord | null>;
}
```

`scope` al final de **toda** firma: lo vigila la guardia nueva de §11.3.

### 4.2 `adapters/driven/persistence/whatsapp-connection-prisma.ts`

- `where` siempre con `...whatsappConnectionCompanyScope(scope)` y `deletedAt: null`; `update` con
  `updateMany({ where: { id, companyId, deletedAt: null } })` y relectura, como el resto de
  módulos. `findLive` ordena por `createdAt` y toma la primera.
- `create` escribe `companyId` desde `companyScopeColumns(scope)`, nunca desde `row`.
- Violación `P2002`: por el **nombre del índice** (`meta.target`/mensaje), `..._company_live_key`
  ⇒ `WhatsappConnectionExistsError`, `..._phone_number_id_live_key` ⇒
  `WhatsappPhoneNumberTakenError`. Cualquier otra se propaga.
- `select` explícito: no se pide nada que el `Record` no tenga.

### 4.3 `ports/whatsapp-graph-client.ts` y `adapters/driven/graph/whatsapp-graph-client-fetch.ts`

```ts
export type GraphPhoneNumber = { displayPhoneNumber: string; verifiedName: string };
export type GraphProbeResult = { ok: true; phone: GraphPhoneNumber } | ({ ok: false } & GraphFailure);
export interface WhatsappGraphClient {
  fetchPhoneNumber(input: { phoneNumberId: string; accessToken: string }): Promise<GraphProbeResult>;
}
```

Adaptador real:

1. `version = readGraphApiVersion()` (§4.5) **dentro** de la llamada (R18, R42).
2. `fetch(\`https://graph.facebook.com/${version}/${encodeURIComponent(phoneNumberId)}?fields=display_phone_number,verified_name\`,
   { headers: { Authorization: \`Bearer ${accessToken}\` }, signal: AbortSignal.timeout(10_000), cache: 'no-store' })` (R17).
3. 2xx: cuerpo validado con zod (`display_phone_number`, `verified_name` como `string`); si no casa
   ⇒ `{ ok: false, kind: 'rejected', message: null }`.
4. No 2xx: intenta `{ error: { message } }` con zod ⇒ `rejected` con ese `message`; si no se
   entiende ⇒ `rejected` sin mensaje.
5. Excepción de red o `AbortError` ⇒ `{ ok: false, kind: 'unreachable', message: null }`.
6. Nunca registra la URL con token (no la lleva), la cabecera ni el cuerpo.

El Phone Number ID es texto libre (D14): `encodeURIComponent` lo deja dentro de su segmento de
ruta aunque traiga `/`, `?` o `#`, y un ID que Meta no reconoce vuelve como `rejected` con el
mensaje de Graph (R23, R26).

Base `https://graph.facebook.com` fija en el adaptador: no cambia entre entornos (lo que cambia, la
versión, va por env; `docs/architecture.md > Principios` n.º 4).

### 4.4 `ports/random-source.ts` y `adapters/driven/security/random-source-node.ts`

```ts
export interface RandomSource { newId(): string; newVerifyToken(): string }
```

`newId` = `randomUUID()`; `newVerifyToken` = `randomBytes(32).toString('base64url')` (43
caracteres, 256 bits, R14; sin `+`/`/`/`=` para que se copie y se pegue en Meta sin sorpresas).
`node:crypto` solo en `adapters/driven/` (QC-234 R18).

### 4.5 Lectores de configuración (`adapters/driven/config/`)

| Archivo | Variable | Contrato |
|---|---|---|
| `whatsapp-config-env.ts` | `WHATSAPP_GRAPH_API_VERSION` | `readGraphApiVersion(): string`. Ausente/vacía o sin `^v\d+\.\d+$` ⇒ `Error` llano que nombra la variable, no el valor (R18), como `encryption-keys-env.ts` |
| `public-base-url-env.ts` | `APP_BASE_URL` | `readPublicBaseUrl(): string \| null`. Ausente/vacía ⇒ `null` (R34). Quita la barra final. Lector propio de `integraciones`, no se importa el de `identity` (D15) |
| `e2e-doubles-env.ts` | `INTEGRATIONS_E2E_DOUBLES` | `integrationsE2EDoublesEnabled(): boolean`, copia de `documentsE2EDoublesEnabled` |

### 4.6 URL del webhook

- `lib/shared/routes.ts`: `export const WHATSAPP_WEBHOOK_ROUTE_BASE = '/api/integraciones/whatsapp/webhook'`
  y `export function whatsappWebhookPath(connectionId: string): string`. Único sitio con la ruta
  (R33). QC-238 crea `app/api/integraciones/whatsapp/webhook/[conexionId]/route.ts` sobre esa misma
  constante.
- La composición expone `integraciones.whatsappWebhookUrl(connectionId): { url: string; complete: boolean }`:
  `complete = false` y `url` = la ruta relativa cuando `readPublicBaseUrl()` es `null` (R34).

---

## 5. Composición (`lib/composition/index.ts`)

Bloque al final, junto al de QC-234, sin reordenar nada:

```ts
const whatsappGraphClient: WhatsappGraphClient = {
  fetchPhoneNumber: (input) =>
    integrationsE2EDoublesEnabled()
      ? whatsappGraphClientCanned.fetchPhoneNumber(input)
      : whatsappGraphClientFetch.fetchPhoneNumber(input),
};
const whatsappConnectionRepository: WhatsappConnectionRepository = { findLive, findLiveById, create, update };
const randomSource: RandomSource = randomSourceNode;
const whatsappDeps = { connections: whatsappConnectionRepository, graph: whatsappGraphClient,
  cipher: secretCipher, digest: secretDigest, random: randomSource };

export const integraciones = {
  secretCipher, secretDigest,
  getWhatsappConnection: createGetWhatsappConnection(whatsappDeps),
  createWhatsappConnection: createCreateWhatsappConnection(whatsappDeps),
  updateWhatsappConnection: createUpdateWhatsappConnection(whatsappDeps),
  testWhatsappConnection: createTestWhatsappConnection(whatsappDeps),
  setWhatsappConnectionEnabled: createSetWhatsappConnectionEnabled(whatsappDeps),
  regenerateWhatsappVerifyToken: createRegenerateWhatsappVerifyToken(whatsappDeps),
  whatsappWebhookUrl,
} as const;
```

- La elección del doble se hace **en cada llamada** (no al importar), como `documentos`.
- `secretCipher` y `secretDigest` siguen en el objeto: QC-238 los usará.
- Importar la composición sigue sin leer ninguna variable (QC-234 R10 y R42 de aquí).

---

## 6. Server Actions (`adapters/driving/whatsapp-connection-actions.ts`)

`'use server'`. Calcadas de `customer-actions.ts`: `currentActor()` lee **una vez** las dos caras
de la sesión dentro de `runInRequestScope`; errores por
`createErrorStateTranslator(IntegracionesError, observabilidad.readRequestIdHeader)`; tras cada
mutación con éxito, `revalidatePath(WHATSAPP_INTEGRATION_ROUTE)`.

| Acción | Entrada | Estados de salida |
|---|---|---|
| `getWhatsappConnectionAction()` | — | `{status:'success', data: WhatsappConnectionView \| null, webhook: {url, complete} \| null}` \| `ErrorState` |
| `createWhatsappConnectionAction(prev, formData)` | `displayName, metaAppId, wabaId, phoneNumberId, accessToken, appSecret` | `{status:'created', verifyToken, webhook}` \| `{status:'test_failed', message}` \| `ErrorState` |
| `updateWhatsappConnectionAction(id, prev, formData)` | los mismos; secretos opcionales | `{status:'saved'}` \| `{status:'test_failed', message}` \| `ErrorState` |
| `testWhatsappConnectionAction(prev, formData{id})` | `id` | `{status:'tested', ok: true}` \| `{status:'tested', ok: false, message}` \| `ErrorState` |
| `disableWhatsappConnectionAction(prev, formData{id})` / `enableWhatsappConnectionAction(...)` | `id` | `{status:'saved'}` \| `{status:'test_failed', message}` (solo habilitar) \| `ErrorState` |
| `regenerateWhatsappVerifyTokenAction(prev, formData{id})` | `id` | `{status:'regenerated', verifyToken, webhook}` \| `ErrorState` |

Ningún estado lleva `accessToken`, `appSecret`, `*Enc` ni `verifyTokenHash` (R10). El verify token
**solo** viaja en `created` y `regenerated` (R14, R15); la página nunca lo recibe (R16). El
formulario no devuelve los secretos escritos al re-pintar tras un error: los campos de secreto
vuelven vacíos (R39 conserva solo los no secretos).

`session-once-per-request-actions.test.ts` lee el disco: la acción nueva entra sola en su barrido.

---

## 7. Catálogo de errores

Tres entradas al final de `ERROR_CODES`, con su línea de enmienda (fecha, sin cita), su clave y su
texto en `error-catalog.ts`; `tests/unit/errores/catalogo.test.ts` pasa de **79 a 82** con su línea
de comentario. Antes de T1 se mide el conteo en `dev`: si otra ficha lo movió, manda `dev` + 3.

| Código | Texto (aprobado, D13) |
|---|---|
| `whatsapp_connection_not_found` | «No se encontró la conexión de WhatsApp.» |
| `whatsapp_connection_exists` | «La empresa ya tiene una conexión de WhatsApp.» |
| `whatsapp_phone_number_taken` | «Ese número de WhatsApp ya está conectado en otra cuenta.» |

---

## 8. Pantalla

### 8.1 Archivos

```
app/(private)/integraciones/whatsapp/
  page.tsx
  components/
    index.ts
    whatsapp-integration-tabs.tsx       'use client'  Tabs: «Conexión» | «Plantillas» (disabled)
    whatsapp-connection-form.tsx        'use client'  alta y edición (useActionState)
    whatsapp-setup-guide.tsx                          guía corta (Server Component)
    whatsapp-connection-card.tsx                      tarjeta de estado
    whatsapp-connection-actions.tsx     'use client'  Probar, Deshabilitar/Habilitar, Regenerar, Editar
    whatsapp-webhook-panel.tsx          'use client'  URL + copiar + aviso de verify token
    whatsapp-status-badge.tsx                         etiqueta del estado
```

### 8.2 `page.tsx`

1. `await requirePagePermission('integraciones.modificar')` como **primera** sentencia (R4; la
   guardia de pantallas y el test de QC-222 leen ese código de la fuente).
2. `getWhatsappConnectionAction()`; `ErrorState` ⇒ alerta de error de la pantalla.
3. Pinta `WhatsappIntegrationTabs` con el panel «Conexión»: sin conexión, `WhatsappSetupGuide` +
   `WhatsappConnectionForm mode="create"`; con conexión, `WhatsappConnectionCard`,
   `WhatsappWebhookPanel` y `WhatsappConnectionActions`.

Las props son la `WhatsappConnectionView` y `{url, complete}`: nada más (R10).

### 8.3 Comportamiento y textos (aprobados, D13)

- **Pestañas.** `Tabs` de `components/ui/tabs.tsx` (Base UI). «Plantillas» con `disabled` y el
  texto «Disponible próximamente» **visible** junto a la etiqueta (no en un `title`, que en táctil
  no se ve). `TabsList`/`TabsTrigger` con `h-11`: la primitiva mide 32 px de alto y R40 pide 44.
- **Formulario.** `Input` con `type="password"`, `autoComplete="off"` y sin `defaultValue` para los
  dos secretos; en edición, el texto de ayuda dice «Déjalo vacío para conservar el actual». Etiquetas:
  «Nombre visible», «App ID», «WABA ID», «Phone Number ID», «Access Token», «App Secret». Botón
  «Guardar y probar».
- **Guía** (`WhatsappSetupGuide`):
  - App ID y App Secret: en developers.facebook.com, tu app › Configuración › Básica.
  - WABA ID y Phone Number ID: tu app › WhatsApp › Configuración de la API.
  - Access Token: business.facebook.com › Configuración › Usuarios del sistema › Generar token,
    con los permisos `whatsapp_business_management` y `whatsapp_business_messaging`.
- **Tarjeta.** Número (`displayPhoneNumber` o «—»), nombre verificado, estado
  (`PENDING` «Pendiente», `ACTIVE` «Activa», `ERROR` «Error», `DISABLED` «Deshabilitada») y última
  verificación (fecha y hora local). El estado es un bloque (`data-testid="whatsapp-connection-status"`)
  con `WhatsappStatusBadge` y, **con `ERROR`**, el `lastError` justo al lado de la etiqueta «Error»,
  dentro del mismo bloque (texto visible, no un `title`, que en táctil no se ve). No hay una fila
  aparte de «último error»: con otro estado, `lastError` no se pinta (R37, D13).
- **Webhook.** URL en un `Input readOnly` (se puede seleccionar a mano) + botón «Copiar» con
  `navigator.clipboard.writeText` y un aviso «Copiada» en `aria-live`; si el portapapeles falla, el
  texto queda seleccionado. `complete = false` ⇒ aviso «Falta configurar la URL pública de la
  aplicación (APP_BASE_URL).» (R34).
- **Verify token una vez** (R38): tras `created`/`regenerated`, el panel muestra el token en un
  `Input readOnly` con su botón «Copiar» y el texto «Cópialo ahora: no se volverá a mostrar.». Vive
  solo en el estado del cliente; recargar lo pierde (R16).
- **Acciones.** «Deshabilitar» y «Regenerar verify token» piden confirmación con `AlertDialog` (las
  dos cortan algo que funciona: la recepción o el token pegado en Meta). «Probar conexión» no se
  muestra con `DISABLED` (y el caso de uso lo rechaza igual, R32). «Editar» abre el formulario en
  modo edición en el mismo panel.
- **Errores** (R39): `ErrorState` ⇒ su `message`; `test_failed` ⇒ «Meta rechazó la prueba: » +
  `message`.

### 8.4 Multiplataforma (R40)

`font-size` 16 px en los inputs (la primitiva `Input` ya usa `text-base` en móvil), botones y
pestañas de 44 px, nada por `:hover`, sin `100vh`. Portapapeles: `navigator.clipboard.writeText`
existe en Safari iOS y Chrome Android en contexto seguro y con gesto del usuario; el `Input
readOnly` es la salida si no. **No se declara ninguna excepción.**

---

## 9. Doble de Graph para E2E (R41)

- `adapters/driven/graph/whatsapp-graph-client-canned.ts`: `fetchPhoneNumber` sin red.
  - `accessToken` que empieza por `E2E_INVALID` ⇒ `{ ok: false, kind: 'rejected', message:
    'Invalid OAuth access token - Cannot parse access token' }` (texto fijo exportado como constante).
  - Cualquier otro ⇒ `{ ok: true, phone: { displayPhoneNumber: '+57 300 0000000', verifiedName:
    'Empresa de prueba E2E' } }` (constantes exportadas).
- Se elige en la composición con `integrationsE2EDoublesEnabled()` en cada llamada (§5).
- `playwright.config.ts > webServer.env` pone `INTEGRATIONS_E2E_DOUBLES: '1'`,
  `WHATSAPP_GRAPH_API_VERSION: 'v21.0'`, `APP_BASE_URL: E2E_BASE_URL` y las dos variables de cifrado
  con una clave generada al cargar la configuración (`randomBytes(32)`; nunca un literal versionado,
  QC-234 §8). Las de cifrado y `APP_BASE_URL` se ponen solo si no vienen ya en `process.env`.
- `tests/guards/guard-dobles-e2e.test.ts` pasa a vigilar **dos** variables con la misma lógica:
  una tabla `{ variable, consulta, dobles, design }` con la fila de `documentos` y la de
  `integraciones`. Cada fila conserva sus dos motivos de rojo (solo `playwright.config.ts` activa;
  la composición no elige el doble sin consultar) y sus casos de sensibilidad.
- `.env.example`: `INTEGRATIONS_E2E_DOUBLES=` y `WHATSAPP_GRAPH_API_VERSION=` en bloques **antes**
  del de `DOCUMENTS_E2E_DOUBLES` (deuda M2 de QC-234: una variable detrás de ese bloque da un falso
  rojo de la guardia). El comentario de `APP_BASE_URL` pasa a decir que también es la base de la URL
  del webhook.

---

## 10. Variables de entorno y despliegue

| Variable | Nueva | Dónde hace falta |
|---|---|---|
| `WHATSAPP_GRAPH_API_VERSION` | sí | Vercel (producción y preview). Valor: la versión de Graph que fije el humano al desplegar |
| `INTEGRATIONS_E2E_DOUBLES` | sí | Solo `playwright.config.ts`. **Nunca** en Vercel |
| `APP_BASE_URL` | no | Ya existe. En Vercel debe fijarse **por entorno** (producción con su dominio; preview con la URL de la preview), para que la URL del webhook de una preview no apunte a producción (D15) |
| `INTEGRATIONS_ENCRYPTION_KEYS` / `_ACTIVE` | no (QC-234) | **Aún no están en Vercel** (`progress/features/QC-237.md`). Sin ellas, crear una conexión en producción falla con error inesperado. Es condición para desplegar esta ficha, no para mergearla |

---

## 11. Tests

### 11.1 Nuevos

| Archivo | Cubre |
|---|---|
| `tests/unit/integraciones/whatsapp/authorization.test.ts` | R1, R2: cada caso de uso, con actor nulo, sin empresa, sin permiso y con otro permiso, rechaza con `unauthorized` y los puertos (dobles espía) no se llaman; la empresa del alcance es la del actor aunque la entrada traiga `companyId` |
| `tests/unit/integraciones/whatsapp/create-whatsapp-connection.test.ts` | R6 (chequeo previo), R8, R9 (contexto exacto de cada `encrypt`), R14, R21, R22, R23 (ningún `create` si falla), R24 (cada campo inválido, sin Graph; IDs con letras o símbolos, p. ej. `abc-1`, se aceptan y llegan a la prueba) |
| `tests/unit/integraciones/whatsapp/update-whatsapp-connection.test.ts` | R3, R11 (sin `encrypt`/`decrypt` del secreto vacío), R12, R25, R26 (fallida: ningún `update`; la fila guardada no cambia), R27 (sin Graph), R31 |
| `tests/unit/integraciones/whatsapp/test-and-enable.test.ts` | R13, R19, R28, R29, R30, R31, R32 |
| `tests/unit/integraciones/whatsapp/regenerate-verify-token.test.ts` | R15 (el resumen viejo deja de casar con `matches`; estado igual) |
| `tests/unit/integraciones/whatsapp/graph-failure.test.ts` | R20 |
| `tests/unit/integraciones/whatsapp/connection-view.test.ts` | R10 (vista sin claves de secreto; un campo extra en la fila no aparece en la vista) |
| `tests/unit/integraciones/whatsapp/whatsapp-graph-client-fetch.test.ts` | R17 (URL exacta, cabecera, token ausente de la URL, `signal`; un Phone Number ID con `/` o `?` queda codificado en su segmento), R18 (sin `fetch`), respuestas 2xx válida/inválida, 400 con `error.message`, red y timeout |
| `tests/unit/integraciones/whatsapp/whatsapp-config-env.test.ts` | R18, R42 (lectura al llamar; `vi.resetModules` + import sin variables) |
| `tests/unit/integraciones/whatsapp/whatsapp-webhook-url.test.ts` | R33, R34 |
| `tests/unit/integraciones/whatsapp/random-source-node.test.ts` | R14 (UUID v4; token base64url de 43 caracteres; dos llamadas distintas) |
| `tests/unit/integraciones/whatsapp/whatsapp-graph-client-canned.test.ts` | R41 (respuestas del doble) |
| `tests/unit/composition/integraciones-graph-doubles.test.ts` | R41 (con y sin la variable, en el mismo proceso, cambia el adaptador) |
| `tests/unit/integraciones/whatsapp/whatsapp-connection-actions.test.ts` | R10 (cada estado de cada acción, serializado, no contiene el token, el secret, `Enc` ni el hash), R14/R15 (verify token solo en `created`/`regenerated`), traducción de errores |
| `tests/integration/integraciones/whatsapp-connection-prisma.int.test.ts` | R2, R3 (empresa B no lee ni actualiza la de A), R5 (RLS forzada en `pg_class`), R6 (segunda viva rechazada, también en paralelo), R7 (mismo teléfono en otra empresa), R9 (las columnas `*_enc` empiezan por `v<n>:` y no contienen el texto en claro; `verify_token_hash` es hex de 64) |
| `tests/unit/integraciones-ui/whatsapp-page.test.tsx` | R4, R16 (el HTML y las props de la página no contienen el token), R35, R36, R37 |
| `tests/unit/integraciones-ui/whatsapp-connection-card.test.tsx` | R37: la etiqueta de cada estado («Pendiente», «Activa», «Error», «Deshabilitada»); con `ERROR`, el `lastError` está dentro del bloque `whatsapp-connection-status` junto a «Error»; con otro estado y `lastError` no nulo, no se pinta |
| `tests/unit/integraciones-ui/whatsapp-connection-form.test.tsx` | R36, R38, R39, R40 (clases de tamaño en inputs y botones) |
| `tests/unit/integraciones-ui/whatsapp-webhook-panel.test.tsx` | R34, R37 (copiar), R38 |
| `tests/guards/guard-ambito-empresa-integraciones.test.ts` | R2: calcada de `guard-ambito-empresa-clientes`: cada función de `persistence/` declara `scope: IntegracionesScope` y lo pasa a `./company-scope`; casos de sensibilidad |
| `e2e/integraciones-whatsapp.spec.ts` | Recorrido del Administrador con el doble (§11.4): R22, R23, R16, R11, R29, R30, R35, R38 |

### 11.2 Migración

`tests/integration/integraciones/whatsapp-connection-migration.int.test.ts`: aplicar el `down.sql`
y volver a aplicar el `migration.sql` deja el mismo esquema (R5), con el patrón de las
migraciones previas que lo prueban.

### 11.3 Tests de otras fichas que se ponen rojos y se tensan (nunca se relajan)

| Archivo | Qué fija hoy | Cambio |
|---|---|---|
| `tests/unit/integraciones/module-shape.test.ts` R13 | `db/schema.prisma` sin modelos de `integraciones` | Exactamente **un** modelo, `WhatsappConnection` |
| … R18 | Lista exacta de `.ts` del módulo | La lista de §1 |
| … R19 | `integraciones` con exactamente `secretCipher` y `secretDigest` | Exactamente los miembros de §5 |
| … R20 | Contrato con exactamente cuatro símbolos | La lista nueva exacta (errores, tipos, fábricas) |
| … R17 | El código del permiso solo en catálogo, migraciones, tres páginas y menú | + `lib/modules/integraciones/domain/actor.ts` (ruta exacta) |
| `tests/unit/integraciones-ui/integration-pages.test.tsx` | Las tres páginas son cascarón (R9/R10 de QC-222) | Solo `proveedor-ia` e `inventarios`; un caso afirma que `whatsapp` ya **no** importa `IntegrationPlaceholder` |
| `e2e/integraciones.spec.ts` (caso Administrador) | Cada hijo muestra `integration-empty` | WhatsApp muestra el título y la pestaña «Conexión»; los otros dos, igual que hoy |
| `tests/guards/guard-identificador-de-request.test.ts`, `E2E_ESPERADOS` | Lista cerrada de `e2e/*.spec.ts` | + `integraciones-whatsapp.spec.ts`, con su comentario (patrón de QC-222 E4) |
| `tests/guards/guard-dobles-e2e.test.ts` | Solo `DOCUMENTS_E2E_DOUBLES` | Tabla con las dos variables (§9) |
| `tests/unit/errores/catalogo.test.ts` | 79 códigos | 82 |

### 11.4 E2E `e2e/integraciones-whatsapp.spec.ts`

Datos con el patrón de `e2e/integraciones.spec.ts` (prefijo `qc237_e2e_`, empresa efímera por
worker, Administrador real del seed, limpieza por edad y por `RUN_ID`; la limpieza borra las filas
de `whatsapp_connections` de la empresa antes que la empresa). Entra por `loginAndLand`.

1. Abre `/integraciones/whatsapp`: «Plantillas» deshabilitada con «Disponible próximamente».
2. Alta con Access Token `E2E_INVALID…`: aparece el mensaje del doble y no hay tarjeta.
3. Alta válida: tarjeta `PENDING` con el número y el nombre del doble; verify token y URL visibles.
4. Recarga: el verify token no aparece en la página (ni en el HTML).
5. Editar solo el nombre visible: se guarda; el estado no cambia.
6. Deshabilitar (confirmar) ⇒ «Deshabilitada»; Habilitar ⇒ «Pendiente».

`test.setTimeout(180_000)`, como el resto.

---

## 12. Choques previsibles con otras features

| Archivo | Con quién | Cómo se resuelve |
|---|---|---|
| `db/schema.prisma` y `db/migrations/` | Cualquiera que toque esquema; en la épica, QC-236 (teléfono de cliente), QC-238, QC-242. Fuera de la épica, las que estén en vuelo en F2.0 (`archivos-en-vuelo --candidata`) | Bloque nuevo al final del esquema; timestamp de migración se re-fecha en F2.3 si `dev` trae una posterior |
| `lib/composition/index.ts` | Todas las fichas con cableado | Solo se toca el bloque de `integraciones` al final |
| `lib/modules/errores/domain/{error-codes,error-catalog}.ts` y `catalogo.test.ts` | Toda ficha que añada códigos | Se suman al final; el conteo se re-mide al sincronizar |
| `.env.example`, `playwright.config.ts`, `guard-dobles-e2e.test.ts` | Fichas con variables o dobles nuevos (QC-241 con QStash) | Bloques propios; la guardia queda parametrizada para la siguiente |
| `guard-identificador-de-request.test.ts` (`E2E_ESPERADOS`) | Toda ficha con un `e2e/*.spec.ts` nuevo | Una entrada más |
| `lib/shared/routes.ts` | Fichas con rutas nuevas | Dos líneas al final; QC-238 reutiliza la constante |
| `tests/unit/integraciones/module-shape.test.ts` | QC-238, QC-242 (mismo módulo) | Van después; amplían la lista exacta |
| Permisos y navegación | — | **No se tocan** (R43): ni `permissions`, ni seed, ni `private-nav.ts` |

---

## 13. Fronteras con las fichas siguientes

- **QC-238** crea la ruta sobre `WHATSAPP_WEBHOOK_ROUTE_BASE`, compara `hub.verify_token` con
  `secretDigest.matches(token, verifyTokenHash)`, descifra `app_secret` con el contexto
  `{companyId, recordId: id, field: 'app_secret'}`, ignora las conexiones `DISABLED`, escribe
  `lastWebhookAt` y pasa `PENDING → ACTIVE`. Amplía el puerto del repositorio con una búsqueda por
  `id` **sin** empresa (la URL no la trae), que es una decisión de su spec.
- **QC-242** amplía `WhatsappGraphClient` con las llamadas de plantillas sobre `wabaId`.
- **QC-243** habilita la pestaña «Plantillas».
- **QC-250** inventaría versiones de clave con el prefijo del valor cifrado (D9).

---

## 14. Alternativas descartadas

1. **Insertar la fila y cifrar después** (en una transacción), en vez de generar el id en la
   aplicación. Obliga a columnas de secreto nulas o con relleno durante el insert, y a dos
   escrituras por alta. Con el id generado antes, la fila nace completa.
2. **Una columna `keyVersion` única** (como la ficha). Con dos secretos por fila editables por
   separado puede mentir sobre uno de ellos, y repite un dato que ya está en el valor cifrado. Dos
   columnas (`access_token_key_version`, `app_secret_key_version`) serían ciertas pero igual de
   redundantes. D9 cierra: ninguna.
10. **IDs de Meta como solo dígitos (1–32).** Evitaba `/` o `?` en la ruta de Graph, pero que los
    IDs sean siempre numéricos no está verificado; `encodeURIComponent` ya protege la ruta y la
    prueba contra Graph rechaza un ID malo (D14).
11. **Habilitar en `ERROR` cuando la prueba falla.** QC-238 recibiría webhooks de una conexión que
    no pasa la prueba (D11).
3. **Prueba fallida como error de dominio con código propio.** El traductor saca el texto del
   catálogo y nunca del error; el mensaje de Meta acabaría solo en el log. Un resultado
   `test_failed` con el mensaje saneado es lo que permite mostrarlo (§3.3).
4. **Comprobar el teléfono en todas las empresas con una consulta** antes de llamar a Graph. Es
   una lectura que cruza la frontera de empresa; la garantía la da el índice global y el error no
   revela de quién es el número (§3.5).
5. **Token en `?access_token=` de la URL** (forma que también acepta Graph). Las URL acaban en
   logs de proxies y de errores; la cabecera `Authorization` no.
6. **Reutilizar `DOCUMENTS_E2E_DOUBLES`** para el doble de Graph. Mezcla dos módulos en una
   variable, y el lector vive en un driven de `documentos` que `integraciones` no puede importar.
7. **Una librería cliente de Meta/WhatsApp** (p. ej. un SDK de Graph). Para una sola llamada GET
   añade una dependencia que aprobar; la ficha pide `fetch` nativo.
8. **El verify token guardado cifrado** para poder mostrarlo otra vez. D5 lo cierra: basta comparar,
   y si se pierde se regenera.
9. **Una URL de webhook única** que enrute por `phone_number_id`. D7 la descarta: obligaría a leer
   el body antes de validar la firma.

---

## 15. Dependencias de terceros

**Ninguna** (R43). `fetch`, `AbortSignal.timeout` y `node:crypto` son de Node; `zod` ya está.
`package.json` no cambia.
