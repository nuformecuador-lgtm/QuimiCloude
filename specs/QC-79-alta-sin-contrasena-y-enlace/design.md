# QC-79 — alta-sin-contrasena-y-enlace · design.md

> Zona: `fullstack` · Complejidad: `high` · depends_on: `QC-66` ·
> Rama: `feature/QC-79-alta-sin-contrasena-y-enlace`
>
> El **qué** está en `requirements.md` (R1–R41) y su alcance lo cerró el humano el 2026-09-11 en la
> tabla de **12 decisiones**. Aquí va el **cómo**: la tabla nueva y su migración con `down.sql`, la
> **seguridad del secreto** —qué se guarda, cómo se compara, cuánta entropía tiene, cómo viaja—, por
> qué «un enlace vivo por persona» lo garantiza un **índice** y no un `SELECT`, el **puerto de
> correo** y su adaptador único, la **propuesta de dependencia** con sus cuatro checks, la página
> pública, el ripple sobre QC-66 y QC-70, y cómo se verifica todo esto incluyendo el **E2E completo**
> de la decisión 10.
>
> **Precedentes literales, que son la mitad del trabajo**: `specs/QC-66-crud-de-usuarios/` (el alta
> que esta ficha enmienda, el actor por parámetro, el puerto de credencial que devuelve solo el hash,
> la transacción con bloqueo), `specs/QC-19-politica-de-contrasenas/` (la política y sus códigos de
> regla), `specs/QC-65-estado-de-cuenta-de-usuario/` (los cuatro estados y el `NULL` del autor),
> `specs/QC-70-errores-centralizados/` (el catálogo cerrado y el traductor único),
> `specs/QC-71-identificador-de-request/` (el `reference` del error inesperado),
> `specs/QC-25-imagen-de-receta/` + la fila de `@supabase/storage-js` en `docs/dependencias.md` (el
> patrón de «SDK externo detrás de un puerto, aislado en UN archivo»). **Este diseño no inventa nada
> donde esos ya decidieron**; cada vez que se aparta, lo dice y explica por qué.

---

## 1. Qué construye esta feature, y qué archivos toca

| Archivo | Qué se hace |
| --- | --- |
| `db/schema.prisma` | **Modelo nuevo** `CredentialSetupToken` con `/// @module identity`. Es el único cambio del esquema. |
| `db/migrations/<ts>_credential_setup_tokens/migration.sql` + `down.sql` | La tabla, sus dos índices, el índice único **parcial** de R11, la FK a `users`, RLS activado **y forzado** (§ 3). |
| `lib/modules/identity/domain/credential-setup-link.ts` | **NUEVO.** Constante de vida (**7 días**, R8), tipo `CredentialSetupLink` y `evaluateLink(link, now)` puro (§ 4.4). |
| `lib/modules/identity/domain/issue-credential-setup-link.ts` | **NUEVO.** El caso de uso de **reenvío** (R14–R16). |
| `lib/modules/identity/domain/set-credential-with-link.ts` | **NUEVO.** El caso de uso **público** (R17–R23). |
| `lib/modules/identity/domain/credential-setup-input.ts` | **NUEVO.** Esquemas `zod` de las dos entradas nuevas (§ 5.2). |
| `lib/modules/identity/domain/user-input.ts` | **MODIFICADO.** `createUserSchema` gana el campo **opcional** de credencial (R1). |
| `lib/modules/identity/domain/create-user.ts` | **MODIFICADO.** Las dos ramas del alta (R2–R4, R7, R30). |
| `lib/modules/identity/domain/errors.ts` | **MODIFICADO.** Dos clases nuevas: `CredentialLinkInvalidError`, `UserNotPendingError` (§ 5.4). |
| `lib/modules/identity/ports/credential-setup-link-repository.ts` | **NUEVO.** Emitir, consumir y aplicar (§ 6). |
| `lib/modules/identity/ports/credential-setup-secret-factory.ts` | **NUEVO.** Devuelve `{ secret, digest }` (§ 4.2). |
| `lib/modules/identity/ports/credential-setup-mailer.ts` | **NUEVO.** Envía el enlace y **devuelve un valor**, no lanza (§ 7.1). |
| `lib/modules/identity/ports/user-admin-repository.ts` | **MODIFICADO.** `create` acepta el hash **o** la ausencia de credencial (§ 6.1). |
| `lib/modules/identity/adapters/driven/persistence/credential-setup-link-prisma.ts` | **NUEVO.** Las dos transacciones de § 4.5 y § 4.6. |
| `lib/modules/identity/adapters/driven/persistence/user-admin-prisma.ts` | **MODIFICADO.** El alta sin credencial utilizable (§ 6.1). |
| `lib/modules/identity/adapters/driven/security/credential-setup-secret-crypto.ts` | **NUEVO.** `randomBytes(32)` + SHA-256 (§ 4.2, § 4.3). |
| `lib/modules/identity/adapters/driven/mail/credential-setup-mailer-resend.ts` | **NUEVO.** **EL ÚNICO archivo del repositorio que importa `resend`** (R27, § 8). |
| `lib/modules/identity/adapters/driven/mail/credential-setup-mailer-outbox.ts` | **NUEVO.** El transporte de buzón en disco que hace posible el E2E (§ 9.2). |
| `lib/modules/identity/adapters/driven/config/mail-config-env.ts` | **NUEVO.** Las cuatro variables de entorno, leídas en la invocación (§ 7.3). |
| `lib/modules/identity/adapters/driving/credential-setup-actions.ts` | **NUEVO.** Las **dos** Server Actions nuevas, con `FormData` (§ 5.3). |
| `lib/modules/identity/adapters/driving/user-actions.ts` | **MODIFICADO.** `CreateUserFormState` gana dos variantes (§ 5.3). |
| `lib/modules/identity/index.ts` | Gana tipos, esquemas, errores y las dos factories nuevas — solo de `./domain`. |
| `lib/composition/index.ts` | Cablea los tres puertos nuevos y **elige el transporte de correo** (§ 9.2). **Único** sitio de cableado. |
| `lib/modules/errores/domain/error-codes.ts`, `error-catalog.ts` | **MODIFICADOS.** Dos códigos nuevos: de 32 a **34** (§ 5.4). |
| `lib/shared/routes.ts` | **MODIFICADO.** `CREDENTIAL_SETUP_ROUTE` y su helper (§ 5.1). |
| `app/(public)/establecer-contrasena/[token]/page.tsx` + `components/` | **NUEVOS.** La página pública (§ 5.1). |
| `.env.example`, `docs/dependencias.md` | Las cuatro variables nuevas y la fila de `resend` (§ 8). |
| `e2e/establecer-contrasena.spec.ts` | **NUEVO.** El camino completo de la decisión 10 (§ 9.2). |
| `tests/**` | Los nuevos de § 9 **y los ajenos de § 2**. |

**Declaración explícita para la validación de conflicto del leader** (`tasks.md` la repite):
`db/schema.prisma` **SÍ** se toca; `db/migrations/` **SÍ** (una carpeta nueva); `lib/composition/`
**SÍ**; `lib/modules/identity/index.ts` **SÍ**; `lib/modules/errores/domain/**` **SÍ**;
`lib/shared/routes.ts` **SÍ**; `app/(public)/` **SÍ** (carpeta nueva); `e2e/` **SÍ** (archivo nuevo);
`package.json` **SÍ** (una dependencia). **NO** se toca `middleware.ts`, `app/(private)/**`,
`components/**`, ni `lib/modules/<otro>/**` distinto de `errores`.

---

## 2. El ripple: qué se pone rojo al tocar dos catálogos y una firma

**Medido sobre el árbol de este worktree el 2026-09-11**, no estimado. Se atiende **en la misma tanda
que el cambio que lo provoca**, nunca al final (precedente: QC-38 y QC-66 con el catálogo de
permisos).

| # | Archivo ajeno | Qué afirma hoy | Qué pasa a afirmar |
| --- | --- | --- | --- |
| 1 | `tests/unit/errores/catalogo.test.ts` | L45 `expect(ERROR_CODES).toHaveLength(32)` | `34`. Las demás aserciones **se derivan** de `ERROR_CODES` y no cambian: clave por código, texto único, sin `not_found` ni `duplicate_name`. |
| 2 | `tests/guards/guard-catalogo-de-errores.test.ts` | compara claves contra códigos y prohíbe códigos huérfanos | Nada que tocar **si** los dos códigos nuevos entran con su clave y su texto; se corre para comprobarlo. |
| 3 | `tests/unit/identity/usuarios/errors.test.ts` | recorre las clases de `IdentityError` y afirma que su `code` está en el catálogo | **Gana dos casos**: las dos clases nuevas. Ninguna expectativa se borra ni se debilita. |
| 4 | `tests/unit/identity/usuarios/user-service.test.ts`, `user-input.test.ts` | el alta genera credencial **siempre** y el esquema **no admite** ningún campo de contraseña | Se reescriben los casos que fijan QC-66 R15 y el rechazo del campo: **es la enmienda, no una relajación**, y cada caso reescrito conserva su ancla (el campo sigue siendo el **único** nuevo, y sigue prohibido `companyId`, `accountStatus`, `mustChangeCredential` y los tres contadores). |
| 5 | `tests/unit/identity/usuarios/user-actions.test.ts` | `CreateUserFormState` tiene tres variantes | Cinco: `idle`, `success` (con el resultado del correo), `invalid_credential`, `error`. |
| 6 | `tests/guards/guard-dependencias-aprobadas.test.ts` | `package.json` ⊆ `docs/dependencias.md` | Verde **solo** si la fila de `resend` entra **antes** que la instalación (T2). |
| 7 | `tests/guards/guard-password-never-plaintext.test.ts` | todo identificador que nombre la contraseña acaba en `hash` | **No se relaja**: los nombres nuevos dicen `credential` y `digest`, nunca `password` (§ 4.2). |
| 8 | `tests/unit/identity/schema/*` y las guardias de RLS y de módulos | RLS forzado en toda tabla, `/// @module` en todo modelo | La tabla nueva entra cumpliéndolas; se corren para comprobarlo. |

**Cómo se caza uno más.** Antes de cerrar cada tanda se corre
`pnpm exec vitest related --run <archivos tocados>`, que es exactamente lo que en QC-38 encontró seis
archivos ajenos y en QC-66 encontró nueve donde el diseño había escrito seis.

---

## 3. La tabla nueva, su migración y su `down.sql` (R35, R36, R37)

### 3.1 El modelo

```prisma
/// @module identity
/// QC-79. Enlace de un solo uso con el que una persona ESTABLECE su contrasena la primera vez.
/// NO guarda el secreto: guarda su HUELLA (`token_digest`, SHA-256 en hexadecimal). Ver design.md > 4.
model CredentialSetupToken {
  id           String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  userId       String    @map("user_id") @db.Uuid
  tokenDigest  String    @map("token_digest")
  expiresAt    DateTime  @map("expires_at") @db.Timestamptz(6)
  consumedAt   DateTime? @map("consumed_at") @db.Timestamptz(6)
  supersededAt DateTime? @map("superseded_at") @db.Timestamptz(6)
  createdAt    DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)

  user User @relation(fields: [userId], references: [id], onDelete: Restrict, onUpdate: Cascade)

  @@unique([tokenDigest], map: "credential_setup_tokens_token_digest_key")
  @@index([userId], map: "credential_setup_tokens_user_id_idx")
  @@map("credential_setup_tokens")
}
```

Cuatro cosas que parecen detalle y no lo son:

- **No lleva `company_id`, y es correcto (R37).** `docs/architecture.md > Dominio` exige columna de
  empresa en **toda tabla de operación**; esta no lo es: es una tabla del **sistema de identidad**
  que cuelga 1-a-N de `users`, que es una de las tres exentas. Su empresa es, por definición, la del
  usuario al que apunta, y duplicarla crearía dos verdades que pueden divergir cuando ni siquiera se
  puede cambiar la empresa de un usuario (QC-66 R20). **Toda** consulta suya entra por `user_id` o por
  `token_digest`, nunca por empresa.
- **No lleva `updated_at`.** Una fila de esta tabla tiene exactamente tres transiciones posibles
  —nace, se consume, o se sustituye— y cada una tiene su **propia** columna con su instante. Un
  `updated_at` sería un cuarto instante que no dice cuál de las tres ocurrió.
- **`onDelete: Restrict`.** El borrado de usuario es **lógico** (QC-66 R37), así que en operación
  normal no se dispara; un borrado físico con enlaces colgando tiene que ser ruidoso, no arrastrarlos
  en silencio. Mismo criterio que `product_batches_*_fkey`.
- **Nada se borra físicamente (R12).** Consumir y sustituir son `UPDATE` de una columna. La tabla
  crece; § 10.3 dice cuánto y por qué no entra una limpieza aquí.

### 3.2 El índice que **es** el requisito R11

```sql
-- «Como maximo UN enlace vivo por persona» (R11). VIVO = ni consumido ni sustituido.
CREATE UNIQUE INDEX "credential_setup_tokens_one_live_per_user"
  ON "credential_setup_tokens" ("user_id")
  WHERE "consumed_at" IS NULL AND "superseded_at" IS NULL;
```

**Por qué un índice único parcial y no un `SELECT` previo.** Comprobar antes de insertar es una
**carrera**: entre el `SELECT` y el `INSERT` cabe otra petición, y dos reenvíos simultáneos dejarían
**dos** enlaces vivos para la misma persona — o sea, el enlace que el administrador cree haber matado
seguiría sirviendo. Es exactamente el criterio que QC-66 R17 ya fijó para los tres duplicados de
`users` («la garantía la da el índice, nunca un `SELECT` previo»), aplicado aquí. Con el índice, el
segundo `INSERT` **falla con `23505` (P2002)** y el adaptador lo traduce a un resultado discriminado;
la base decide, no la disciplina. Prisma no modela índices parciales, así que **se escribe a mano en
la migración y es drift declarado**, igual que los tres índices funcionales de QC-47.

**Ojo con lo que este índice NO dice:** un enlace **caducado** que nadie ha sustituido sigue ocupando
la ranura. Es deliberado y es lo que se quiere: caducado ya no sirve (R8, R22), y el reenvío lo
sustituye explícitamente antes de insertar (§ 4.5), así que la ranura se libera en la misma
transacción. Definir «vivo» incluyendo `expires_at > now()` haría el índice **no inmutable** y
Postgres lo rechazaría: `now()` no es `IMMUTABLE` y no puede aparecer en el predicado de un índice.
Esto no es una concesión, es la razón técnica por la que la definición correcta es la de arriba.

### 3.3 UP y DOWN

El `migration.sql` lo genera Prisma para la tabla, la FK y los dos índices; **se completan a mano**
el índice único parcial de § 3.2 y los dos `ALTER` de RLS, que Prisma no modela:

```sql
-- RLS activado Y forzado (mismo patron que `product_batches`). Sin policies: deny-by-default para
-- cualquier via que no sea Prisma. NO sustituye a la autorizacion del service (R35).
ALTER TABLE "credential_setup_tokens" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "credential_setup_tokens" FORCE ROW LEVEL SECURITY;
```

```sql
-- down.sql (R36): revierte EXACTAMENTE el UP. Se cae el indice parcial con la tabla, pero se
-- escribe explicito para que el DOWN se lea como el inverso linea a linea del UP.
DROP INDEX IF EXISTS "credential_setup_tokens_one_live_per_user";
DROP TABLE IF EXISTS "credential_setup_tokens";
```

No hay backfill ni pérdida de datos: la tabla nace vacía y `users` **no se toca** (R37). El ciclo
real `db:migrate` → `db:rollback` → `db:migrate` es una task propia (T6), con su salida pegada en la
bitácora: el test estático lee texto, el ciclo prueba que funciona.

---

## 4. La seguridad del secreto: lo que decide esta ficha

Es el corazón de QC-79 y donde más se mira. Las cinco preguntas, respondidas una a una.

### 4.1 Qué se guarda en la base: **la huella, nunca el secreto**

En `token_digest` va **SHA-256 del secreto, en hexadecimal (64 caracteres)**. El secreto en claro no
se persiste en ningún sitio, no se registra y no se devuelve por ninguna operación (R9, R13). Quien
obtenga un volcado completo de la base —una copia de seguridad, un `SELECT *` de un becario, una
fuga— **no puede fabricar un enlace vivo**: tendría que invertir SHA-256 sobre un valor de 256 bits.

**Por qué SHA-256 y no bcrypt, que es lo que el repo ya usa para contraseñas.** Dos razones, y las
dos son estructurales:

1. **El coste de bcrypt existe para secretos de BAJA entropía.** Una contraseña humana tiene
   ~30 bits y hay que encarecer cada intento. Este secreto tiene **256 bits de un CSPRNG** (§ 4.2):
   no hay diccionario que probar, y ralentizar la comprobación no aporta seguridad ninguna.
2. **bcrypt lleva sal por fila, así que la huella no es determinista y no se puede BUSCAR.** Para
   validar un enlace habría que leer **todas** las filas vivas y ejecutar un bcrypt contra cada una:
   una consulta O(n) con n operaciones caras por petición, que es un vector de denegación de servicio
   servido en bandeja. Con SHA-256 la comprobación es **una** búsqueda por índice único.

### 4.2 Cómo se genera, y cuánta entropía tiene

```ts
// lib/modules/identity/ports/credential-setup-secret-factory.ts
/**
 * Produce el secreto del enlace y su HUELLA. A diferencia del `InitialCredentialFactory` de QC-66
 * —que devuelve SOLO el hash porque la credencial no debe existir fuera del adaptador—, aqui el
 * secreto SI tiene que salir: su unico destino es la URL del correo (R13). Ver § 4.7.
 */
export interface CredentialSetupSecretFactory {
  create(): { readonly secret: string; readonly digest: string };
}
```

El adaptador (`credential-setup-secret-crypto.ts`):

- `randomBytes(32)` de `node:crypto` → **256 bits** exactos (R10). No `Math.random`, no `randomUUID`
  (122 bits útiles), no derivado del identificador del usuario, del correo ni de ningún instante: un
  secreto predecible a partir de datos que el atacante ya conoce no es un secreto.
- Se codifica en **base64url** → 43 caracteres, seguros en una URL sin escapar nada.
- `digest = createHash('sha256').update(secret).digest('hex')`.
- El nombre dice `secret` y `digest`, **nunca `password` ni `token` a secas**, para no chocar de
  frente con `guard-password-never-plaintext`: se adaptan los nombres, no se relaja la guardia
  (mismo criterio que QC-19 y QC-66 § 4.1).

### 4.3 Cómo se compara

Con una **igualdad sobre la columna indexada**: `WHERE token_digest = $1`, dentro del `UPDATE`
condicional de § 4.6. No hay comparación en memoria y por tanto no hay comparación no constante que
filtre información por tiempo: lo que varía con el tiempo de respuesta es el recorrido de un índice
B-tree sobre un valor que el atacante **no puede ir refinando**, porque no tiene forma de generar
candidatos parciales de un valor de 256 bits. Añadir `timingSafeEqual` sobre un valor que ya se buscó
por índice sería teatro de seguridad; lo que sí se hace es **no distinguir los casos de fallo**
(R22), que es la fuga real y de la que habla § 4.8.

### 4.4 Cómo viaja en la URL

**En el camino y no en la cadena de consulta**: `/establecer-contrasena/<secreto>`.

- El secreto **no se propaga por `Referer`**: la página declara
  `<meta name="referrer" content="no-referrer">` y **no carga ningún recurso de terceros** (ni fuente,
  ni analítica, ni imagen externa). Es la fuga clásica de los enlaces de este tipo y se cierra aquí.
- **Nunca se registra.** QC-71 R12 ya prohíbe escribir la URL con sus parámetros en la línea de log
  del error, y la única línea de log de la aplicación es esa; el adaptador de correo tampoco la
  escribe (§ 7.2).
- **No entra en el historial de una sesión de navegador ajena**: la página es pública y no abre
  sesión; establecer la contraseña **no** inicia sesión, la persona va al login después (es lo que
  ejerce el E2E de R41).
- **No hay redirección con el secreto**: el formulario lo manda a la Server Action en un campo oculto
  de `FormData`, no reescribiendo la URL.

### 4.5 Emitir: la transacción del «un enlace vivo por persona»

```
$transaction {
  1. UPDATE credential_setup_tokens
        SET superseded_at = $now
      WHERE user_id = $userId AND consumed_at IS NULL AND superseded_at IS NULL;   -- mata el anterior (R11, R16)
  2. INSERT INTO credential_setup_tokens (user_id, token_digest, expires_at)
      VALUES ($userId, $digest, $now + 7 dias);                                    -- R8, R16
}
```

Si dos emisiones corren a la vez, el índice de § 3.2 hace que **una de las dos** falle con `23505`.
El adaptador traduce ese choque a `'superseded'` y **el caso de uso no vuelve a intentarlo y no envía
ningún correo**: la perdedora tira su secreto —que no llegó a persistirse— y responde «hay un enlace
vivo y se envió», que es **verdad**, porque la ganadora acaba de emitirlo y enviarlo. No se inventa
un error nuevo para una carrera cuyo resultado observable es el correcto.

### 4.6 Usar: la transacción del consumo, sin lectura previa

```
$transaction {
  1. UPDATE credential_setup_tokens
        SET consumed_at = $now
      WHERE token_digest = $digest
        AND consumed_at IS NULL AND superseded_at IS NULL AND expires_at > $now
      RETURNING user_id;                                  -- 0 filas => invalido (R22)
  2. UPDATE users
        SET password_hash = $hash,
            account_status = 'active',
            account_status_changed_at = $now,
            account_status_changed_by = NULL              -- el NULL de QC-65 R10 (R19)
      WHERE id = $userId
        AND deleted_at IS NULL
        AND account_status = 'pending';                   -- 0 filas => ROLLBACK, invalido (R22)
}
```

- **El paso 1 es un compare-and-set atómico**, no un `SELECT` seguido de un `UPDATE`: solo la primera
  de dos peticiones simultáneas ve `consumed_at IS NULL`, y la segunda recibe 0 filas (R12, R20).
- **El paso 2 lleva su propia condición**, y esa es la mitad que cierra la decisión 8: si entre el
  correo y el clic el administrador borró al usuario, lo bloqueó o lo activó, el `WHERE` no encaja,
  la transacción **revierte entera** —el enlace no queda consumido, pero tampoco sirve— y la
  respuesta es la misma de R22.
- **La empresa no aparece por ningún lado, y es correcto:** aquí no hay actor ni sesión (R18); el
  ámbito lo da el propio secreto, que apunta a un `user_id` concreto.
- **El dominio nunca ve una transacción** (precedente QC-66 § 9.3): pide `applyCredentialAndActivate`
  y traduce el resultado discriminado.

### 4.7 La única concesión respecto de QC-66, dicha de frente

QC-66 § 4.1 hizo que la credencial inicial **no pudiera** salir del adaptador: el puerto devolvía
solo el hash y por eso R16 era una propiedad del **tipo** y no una promesa. Aquí eso **no es
posible**: el secreto tiene que llegar a la URL del correo, o no hay enlace. Lo que se hace en su
lugar:

1. El secreto sale de la fábrica y **entra directo al puerto de correo**; el caso de uso no lo
   devuelve, no lo mete en ningún error y no lo escribe (R13).
2. El tipo de retorno de los dos casos de uso **no tiene ningún campo de texto libre**: el alta
   devuelve `{ id, mail }` y el reenvío `{ mail }`, donde `mail` es `'sent' | 'failed'`. No hay hueco
   donde colar el secreto sin romper el typecheck.
3. Un **test de alcance** recorre los archivos nuevos y falla ante cualquier `console.*`, y otro
   afirma que el estado serializado de las dos actions no contiene el secreto que el doble emitió.

### 4.8 La respuesta única de R22: por qué no se distingue nada

Enlace inexistente, caducado, consumido, sustituido, usuario borrado, usuario ya activo: **una sola
respuesta**, con el código `credential_link_invalid` y su texto del catálogo. Distinguirlos
convertiría el enlace en un **oráculo**: probando secretos se sabría si existen, y —peor— sabiendo un
enlace viejo se sabría si la cuenta ya se activó. Es el mismo criterio con el que QC-66 hace que «de
otra empresa», «borrado» y «soy yo» compartan `user_not_found`, y la razón por la que ese código
**no** se reutiliza aquí: este caso no habla de un usuario, habla de un enlace, y QC-70 R4 prohíbe
dos códigos con el mismo texto tanto como un código con dos significados.

---

## 5. Superficie: rutas, contratos de entrada y salida, errores

### 5.1 La página pública

| Ruta | Tipo | Quién entra |
| --- | --- | --- |
| `/establecer-contrasena/[token]` | Página pública (`app/(public)/`) | Cualquiera con el enlace. **Sin sesión** (R17, R18) |

- **No entra en `PRIVATE_ROUTE_PREFIXES`**, a propósito: `decideRouteAccess` deja pasar sin
  redirigir todo lo que no sea privado ni el login (regla 1 de `route-access.ts`), así que el
  middleware **no se toca**. La constante y su helper viven en `lib/shared/routes.ts`, como
  `LOGIN_ROUTE`: ningún archivo de producto escribe la URL como literal.
- **La página es un Server Component delgado**: recibe el secreto del segmento, lo pasa como campo
  oculto al formulario de cliente y **no consulta la base** — no hay nada que mostrar antes de que la
  persona escriba (R24), así que tampoco hay «validar el enlace al pintar», que sería un oráculo de
  lectura y un segundo camino de comprobación que podría divergir del de § 4.6.
- **Multiplataforma (R25)**: `min-h-dvh`, campos con `text-base` (16 px), botones de 44 px de alto,
  y el mostrar/ocultar contraseña es un botón, no un `:hover`.
- **No se inicia sesión al terminar.** Se muestra el éxito y un enlace al login. Iniciar sesión sola
  sería fabricar una sesión desde una superficie pública sin que ningún requisito lo pida.

### 5.2 Contratos de entrada (`zod`, R33)

```ts
// domain/user-input.ts — el UNICO campo nuevo del alta (R1)
credential: z.string().min(1).optional()      // dentro del strictObject existente
```

`optional()` **y** el tratamiento de la cadena vacía como ausencia lo hace la Server Action al montar
el objeto desde `FormData` (un `<input>` vacío llega como `''`, no como ausente); el dominio recibe
`undefined` o un texto no vacío. **Sin `trim` y sin `max`**: QC-19 R10 prohíbe recortar o normalizar
la candidata —un espacio al final es parte de la contraseña— y el máximo lo pone la propia política
(`max_length`, QC-19 R11), no un segundo número escrito aquí.

```ts
// domain/credential-setup-input.ts
export const setCredentialWithLinkSchema = z.strictObject({
  secret: z.string().min(1),
  credential: z.string().min(1),
  credentialConfirmation: z.string().min(1),
});

export const resendCredentialSetupLinkSchema = z.strictObject({ userId: z.string().uuid() });
```

La **confirmación** se compara en el dominio y su desacuerdo se responde como un fallo de formulario
(§ 5.3), no como un error de catálogo: es una comprobación de formulario, y QC-70 R31 deja esas
fuera del catálogo explícitamente.

### 5.3 Contratos de salida y las Server Actions

```ts
// El alta (user-actions.ts) — DOS variantes nuevas
export type CreateUserFormState =
  | { status: 'idle' }
  | { status: 'success'; id: string; mail: 'sent' | 'failed' | 'not_needed' }   // R30
  | { status: 'invalid_credential'; unmet: readonly CredentialRule[] }          // R2
  | ErrorState;

// La pantalla publica (credential-setup-actions.ts)
export type SetCredentialFormState =
  | { status: 'idle' }
  | { status: 'success' }
  | { status: 'invalid_credential'; unmet: readonly CredentialRule[] }          // R23
  | { status: 'mismatch' }                                                      // confirmacion
  | ErrorState;

export type ResendLinkFormState =
  | { status: 'idle' }
  | { status: 'success'; mail: 'sent' | 'failed' }                              // R14, R30
  | ErrorState;
```

- **`mail` en el resultado del alta es lo que hace cierta la decisión 7 (R30)**: `sent`, `failed`
  —creado igual, en `pending`, con enlace vivo, y la pantalla de QC-67 ofrece el reenvío— o
  `not_needed` cuando el administrador escribió la contraseña y no hubo enlace (R3).
- **`invalid_credential` NO es un `ErrorState`, y es una decisión** (§ 11.3): las reglas incumplidas
  son **datos que la persona necesita** para corregir, y QC-70 R29 prohíbe que el campo de
  diagnóstico —el único hueco para datos variables— cruce al navegador. Los códigos de regla de
  QC-19 R23 son estables e independientes del idioma y la UI compone el texto, que es exactamente
  para lo que se diseñaron.
- **Las dos actions nuevas reciben `FormData`** (R33) y **no deciden nada**: traducen entrada y
  resultado. La pública **no resuelve actor** (R18); la de reenvío resuelve el actor de las dos caras
  de la sesión, como las seis de QC-66.
- **Ningún route handler y ningún `fetch` a ruta propia.** El proveedor de correo se llama desde el
  **adaptador driven**, en servidor, no desde una ruta nuestra.
- La acción pública llama a `revalidatePath` de su propia ruta: no hay más que revalidar.

### 5.4 Errores: dos códigos nuevos en el catálogo cerrado de QC-70

| Clase (en `identity/domain/errors.ts`) | `code` | Cuándo |
| --- | --- | --- |
| `CredentialLinkInvalidError` | `credential_link_invalid` | R22: **los seis** casos, indistinguibles |
| `UserNotPendingError` | `user_not_pending` | R15: reenviar a alguien que ya no está en `pending` |

`ERROR_CODES` pasa de **32 a 34**, con su clave y su texto en `error-catalog.ts`. **Esto vuelve a
apoyarse en la enmienda a QC-70 R25 que ya escribió QC-66** («`identity` es el sexto módulo del
catálogo»): no hay enmienda nueva que redactar, solo dos entradas más bajo el mismo encabezado, y se
dice ahí con estas palabras. Los demás fallos siguen usando los códigos que ya existen:
`unauthorized` (R6, R14), `user_not_found` (R15, ámbito), `invalid_input` (R1) y `unexpected` con su
`reference` de QC-71 (R34).

**`user_not_pending` sí se distingue de `user_not_found`, y a propósito**: quien reenvía trae
`usuarios.modificar` y ya **ve el estado de cuenta** de esa persona en el listado de QC-66 (R31), así
que el código no le revela nada nuevo; a cambio permite a QC-67 decir «esta cuenta ya está activa» en
vez de mentir. Es el mismo razonamiento con el que QC-66 separó `self_operation`.

---

## 6. Los puertos

### 6.1 `UserAdminRepository.create` — la firma que cambia

```ts
create(
  companyId: string,
  data: NewUser,
  credential: { readonly kind: 'hash'; readonly value: string } | { readonly kind: 'none' },
  accountStatus: 'pending',
  now: Date,
): Promise<{ id: string } | DuplicateKey | 'role_not_found'>;
```

**Una unión discriminada y no `string | null`**, porque `null` es lo que alguien olvida y un tipo con
nombre no: la ausencia de credencial es una **decisión explícita del llamante**, no un descuido.

**Qué escribe el adaptador con `kind: 'none'` (R4).** `users.password_hash` es `NOT NULL` y esta
ficha **no cambia el modelo de `users`** (R37). Se escribe un **centinela imposible de verificar**:
la cadena `'!'`, que no es un hash bcrypt válido y con la que `verifyPasswordHash` devuelve `false`
para **cualquier** entrada. Es la convención `!`/`*` de `/etc/shadow`, y se elige frente a las dos
alternativas obvias:

- *Hacer la columna anulable* — es una migración sobre `users` que R37 prohíbe, y dejaría a todo el
  código de login teniendo que tratar un `null` que hoy no puede llegar.
- *Guardar el hash de una cadena al azar* — funciona, pero cuesta un bcrypt por alta para producir un
  valor que nadie va a verificar nunca, y deja indistinguible «no tiene credencial» de «tiene una que
  nadie conoce», que es justo la ambigüedad que esta ficha viene a quitar.

El centinela se declara **una vez** en el dominio (`NO_CREDENTIAL_SENTINEL`) y un test de integración
afirma sobre Postgres real que ninguna contraseña —ni la cadena centinela misma— verifica contra él.

### 6.2 `CredentialSetupLinkRepository`

```ts
export type IssueOutcome = 'issued' | 'superseded' | 'user_not_pending' | 'not_found';
export type ApplyOutcome = 'ok' | 'invalid';

export interface CredentialSetupLinkRepository {
  /** § 4.5. `'superseded'` = otra emision simultanea gano; no se envia correo (R11). */
  issueForPendingUser(input: {
    userId: string; companyId: string | null; digest: string; expiresAt: Date; now: Date;
  }): Promise<IssueOutcome | { readonly email: string }>;

  /** § 4.6. Consumo + credencial + activacion, en UNA transaccion (R19, R20, R22). */
  applyCredentialAndActivate(input: {
    digest: string; credentialHash: string; now: Date;
  }): Promise<ApplyOutcome>;
}
```

- **`companyId` es `string | null` a propósito**: el alta lo pasa `null` —acaba de crear la fila con
  la empresa del actor y no hay nada que reacotar—; el **reenvío** lo pasa siempre, y el adaptador
  añade `AND users.company_id = $companyId` a la resolución del usuario, que es lo que hace cierto el
  ámbito de R15 sin que el dominio tenga que acordarse.
- **El método de emisión devuelve el correo del destinatario**, y eso evita una segunda lectura y
  —más importante— evita que el correo llegue del llamante: enviar a una dirección que venga por
  parámetro sería un vector para usar el ERP como reenviador.
- **No hay ningún método de lectura de enlaces**, y es deliberado, igual que en QC-66 § 7: sin
  `findByDigest` no existe la comprobación previa que sería una carrera, y nadie puede escribir por
  descuido un listado de enlaces vivos.

### 6.3 `CredentialSetupMailer` → § 7.1.

---

## 7. El correo

### 7.1 El puerto **devuelve un valor, no lanza** (R30)

```ts
export interface CredentialSetupMailer {
  /** Nunca lanza: un fallo del proveedor es un VALOR. Ver abajo por que. */
  sendCredentialSetupLink(input: {
    readonly to: string; readonly secret: string;
  }): Promise<'sent' | 'failed'>;
}
```

Que el fallo sea un valor y no una excepción es lo que hace **estructural** la decisión 7: con una
excepción, un `try/catch` olvidado en cualquier punto del camino tumbaría el alta y el humano
perdería la capacidad de dar de alta a nadie cuando el proveedor tenga un mal día. Con un valor, el
compilador obliga a decidir qué se hace con él, y el `mail` del resultado (§ 5.3) no se puede omitir.
**No es un `catch` vacío** (`docs/conventions.md`): el adaptador **maneja** el error —lo registra sin
la URL ni el secreto— y **lo comunica** como resultado.

### 7.2 El adaptador `resend`, aislado en UN archivo (R27)

`lib/modules/identity/adapters/driven/mail/credential-setup-mailer-resend.ts`:

- Es el **único** archivo del repositorio que escribe `from 'resend'`. Una **guardia propia**
  (`tests/guards/guard-envio-de-correo.test.ts`) recorre `lib/`, `app/`, `components/` y `scripts/` y
  se pone roja ante un segundo import. Mismo patrón, y por el mismo motivo, con el que
  `@supabase/storage-js` vive solo en `recipe-image-supabase.ts` y `@tiptap/*` en los archivos que
  enumera QC-64: sustituir la librería es reescribir un archivo, no buscarla por todo el repo.
- Construye la URL con la base de la configuración y el secreto, arma el asunto y el cuerpo, y llama
  al proveedor. **Un fallo se registra sin la URL, sin el secreto y sin el correo del destinatario**
  (es PII, y `docs/architecture.md > Anti-patrones` lo prohíbe): se registra el nombre del error del
  proveedor y nada más.
- El cliente del proveedor **se construye dentro de la función**, con la clave leída en ese momento
  (§ 7.3): construirlo al importar el módulo haría que la suite entera necesitara la clave.

### 7.3 Configuración (R28) — y aquí es donde vive la **pregunta abierta 1**

`mail-config-env.ts`, copiando literalmente el patrón de
`recetas/adapters/driven/config/storage-config-env.ts` (leer en la invocación, error que **nombra**
las que faltan sin filtrar ningún valor):

| Variable | Para qué |
| --- | --- |
| `RESEND_API_KEY` | Credencial del proveedor. **Secreto**: nunca al repo |
| `MAIL_FROM_ADDRESS` | Remitente. **Su valor lo decide el humano** — pregunta abierta 1 |
| `APP_BASE_URL` | Base con la que se construye la URL del enlace |
| `MAIL_TRANSPORT` | `resend` (por defecto) o `outbox` (§ 9.2). Cualquier otro valor **falla** |

**La pregunta abierta 1 no se cierra aquí y no bloquea la implementación**: el requisito R28 la
rodea —el remitente sale de configuración y **no** del código— así que el código se escribe entero y
lo que falta es rellenar una variable de entorno y verificar el dominio por DNS en el panel del
proveedor. En `.env.example` la fila queda **vacía y comentada** diciendo que el valor lo decide el
humano, exactamente como ya están `SEED_ADMIN_*` y `SUPABASE_STORAGE_*`.

**La pregunta abierta 2 (qué dice el correo) tampoco se cierra.** El adaptador deja el asunto y el
cuerpo en **dos constantes al principio del archivo**, en español y con un único hueco —la URL—, para
que cambiarlas sea una línea y para que el día que llegue **QC-72** migrarlas sea mover dos cadenas a
un archivo de idioma. No se inventa el copy definitivo: se escribe el mínimo funcional y se anota.

---

## 8. Dependencia de terceros: **propuesta de `resend`**, no instalada (R38)

> `docs/architecture.md > Dependencias de terceros`: los cuatro checks **no bastan**; la aprueba una
> persona. Esta propuesta viaja en el `design.md` para que se apruebe **junto con el spec (F1.4)** y
> el gate llegue antes que el código. **`resend` NO está en `package.json` en el momento de escribir
> esto.**

**Qué es y qué código nos ahorra.** El SDK oficial de Resend para enviar correo por **API HTTP**.
Nos ahorra: la construcción del cuerpo multipart/MIME y su codificación, el manejo de reintentos y de
los códigos de estado del proveedor, los tipos del contrato de la API, y —lo que más pesa— **no abrir
una conexión SMTP desde una función serverless**, que es el motivo por el que el humano lo eligió
(decisión 6): en Vercel una función no sostiene bien una conexión viva y un `nodemailer` sobre SMTP
acaba en tiempos de espera intermitentes que no se reproducen en local.

**Los cuatro checks, verificados contra el registro de npm el 2026-09-11** (los trae la decisión
cerrada 6; se transcriben aquí para que la fila de `docs/dependencias.md` sea copia directa):

| # | Check | Resultado |
| --- | --- | --- |
| 1 | No marcada `deprecated` | **PASA** — sin `deprecated` |
| 2 | Release en los últimos 12 meses | **PASA** — `6.27.0`, publicada el **2026-09-09** (2 días) |
| 3 | ≥ 10.000 descargas semanales | **PASA** — **8.288.901**/semana |
| 4 | Licencia MIT / Apache-2.0 / BSD / ISC | **PASA** — **MIT** |

**Los cuatro pasan**, así que es `aprobada` y no `excepcion`.

**En qué UN archivo queda aislada**, que es la condición que hace barata la salida:
`lib/modules/identity/adapters/driven/mail/credential-setup-mailer-resend.ts`, detrás del puerto
`CredentialSetupMailer`, con la guardia de § 7.2 vigilando que no aparezca un segundo import.
Sustituirla por `nodemailer`, por `@sendgrid/mail` o por un `fetch` a mano es escribir **un** archivo
nuevo y cambiar **una** línea de `lib/composition/index.ts`. Sigue el precedente escrito de
`@supabase/storage-js`.

**Descartadas** (las tres primeras las descartó el humano en la decisión 6; se transcriben para que
no se reconsideren): `nodemailer` —SMTP desde serverless—, `@sendgrid/mail` —pasa el check 2 por tres
semanas, o sea que el margen es el de un mal trimestre—, `postmark` —el menos usado de los cuatro—.

**Cuarta alternativa, que la decisión no nombra y este diseño sí, por honestidad**: **`fetch` a mano**
contra `https://api.resend.com/emails`. Es un `POST` con `Authorization: Bearer` y un JSON de cuatro
campos: **cero dependencias nuevas y unas 25 líneas**. No se elige porque **la decisión 6 está
cerrada** y este spec no reabre decisiones del humano; pero el dato queda escrito, porque es
exactamente la información que hace falta el día que alguien se pregunte si la fila de
`docs/dependencias.md` valía la pena — y porque es la razón por la que el aislamiento en un archivo
de § 7.2 no es ceremonia: la salida cuesta 25 líneas.

**Ninguna otra dependencia entra.** La generación del secreto y SHA-256 salen de `node:crypto`, que
es el runtime; la validación sigue siendo `zod`; el hash, `bcryptjs` desde QC-5.

---

## 9. Cómo se verifica

### 9.1 Niveles

| Nivel | Archivo | Qué demuestra |
| --- | --- | --- |
| Unit (dominio) | `tests/unit/identity/credencial/create-user-credential.test.ts` | R1–R6: las dos ramas del alta, la política aplicada **antes** de escribir, el permiso como primera línea con dobles que **fallan si los llaman** |
| Unit (dominio) | `tests/unit/identity/credencial/set-credential-with-link.test.ts` | R17–R23: éxito, los seis rechazos **indistinguibles**, la política, el enlace que sobrevive al rechazo por política, la marca intacta (R21) |
| Unit (dominio) | `tests/unit/identity/credencial/resend-link.test.ts` | R14–R16: permiso, ámbito, `pending`, la carrera `'superseded'` que no manda segundo correo |
| Unit (dominio puro) | `tests/unit/identity/credencial/link-lifetime.test.ts` | R8: 7 días exactos, el borde del instante de caducidad |
| Unit (adaptador) | `tests/unit/identity/credencial/secret-factory.test.ts` | R9, R10: 32 bytes, base64url, dos llamadas distintas, la huella reproducible, y que el **secreto** no aparece en la huella |
| Unit (adaptador) | `tests/unit/identity/credencial/mailer-resend.test.ts` | R27–R29: la URL se arma con la configuración, un fallo del proveedor devuelve `'failed'` y **no lanza**, y la línea de registro no lleva URL, ni secreto, ni correo |
| Unit (config) | `tests/unit/identity/credencial/mail-config.test.ts` | R28: se lee en la invocación, el error nombra las que faltan y **no** incluye ningún valor |
| Unit (driving) | `tests/unit/identity/credencial/credential-setup-actions.test.ts` | R18, R33, R34: `FormData`, sin sesión en la pública, traducción por `code`, y el estado serializado **sin** el secreto |
| Unit (UI) | `tests/unit/identity-ui/set-credential-form.test.tsx` | R24, R25: no pinta ningún dato del usuario; 16 px, 44 px, `dvh`, sin `:hover` como única vía |
| Unit (estático) | `tests/unit/identity/schema/credential-setup-migration.test.ts` | R35, R36, R37: el UP crea la tabla con RLS **forzado** y el índice **parcial**; el `down.sql` es su inverso; **no toca `users`** ni los tres índices de QC-47 |
| Unit (alcance) | `tests/unit/identity/credencial/scope.test.ts` | R31, R40: ningún archivo de la feature bajo `app/(private)/`, ningún cron ni route handler, ninguna mención a `failed_login_attempts`/`lock_level`/`locked_until`, ningún `console.*` en los archivos que tocan el secreto |
| Guardia (nueva) | `tests/guards/guard-envio-de-correo.test.ts` | R27, R38: **un solo** import de `resend` en todo el repo; `package.json` sin ninguna otra entrada nueva |
| Integración | `tests/integration/identity/credential-setup.int.test.ts` | R9, R11, R12, R19, R20, R22, R37 contra Postgres real: la huella y no el secreto en la columna; **dos emisiones concurrentes → un solo enlace vivo** (el `23505` del índice parcial); **dos usos concurrentes → uno solo gana**; el usuario borrado/activo hace revertir la transacción entera; el centinela de § 6.1 no verifica contra ninguna contraseña |
| Ciclo real | task T6 | R36: `db:migrate` → `db:rollback` → `db:migrate`, con la salida en la bitácora |
| **E2E** | `e2e/establecer-contrasena.spec.ts` | **R41**, § 9.2 |
| Ajenos (se actualizan) | los **8** de § 2 | R2, R34, R38 |
| Guardias (ya existen) | `guard-arquitectura-modulos`, `guard-rls-force`, `guard-password-never-plaintext`, `guard-dependencias-aprobadas`, `guard-catalogo-de-errores` | R32, R35, R5, R38, R34 |

El mapa completo `R<n> → task` está en `tasks.md > Trazabilidad`; el `R<n> → test` lo confirma el
implementer en `progress/impl_QC-79-alta-sin-contrasena-y-enlace.md`.

### 9.2 El E2E de la decisión 10, y el problema que hay que resolver para tenerlo

El camino es: **alta sin contraseña → enlace → establecerla → entrar con ella**. El obstáculo real es
que el navegador de Playwright **no tiene buzón**, y la base guarda solo la huella (§ 4.1), así que
el secreto **no se puede recuperar de la base**: si se pudiera, el diseño de seguridad estaría mal.

**Solución: un segundo transporte de correo, elegido por configuración.**
`MAIL_TRANSPORT=outbox` cablea `credential-setup-mailer-outbox.ts`, que escribe el mensaje —incluida
la URL— como un JSON en `MAIL_OUTBOX_DIR` en vez de llamar al proveedor. El E2E lee ese archivo y
navega al enlace. Tres condiciones que lo hacen seguro y no un agujero:

1. **El valor por defecto es `resend`**: sin la variable, el transporte real.
2. **El adaptador de buzón se niega a arrancar si `NODE_ENV === 'production'`**, lanzando y nombrando
   la variable. Una configuración equivocada en producción **falla ruidosamente**, no envía en
   silencio a un archivo.
3. Un caso de la guardia de § 7.2 afirma las dos cosas anteriores leyendo el código, para que nadie
   las «simplifique» después.

**Alternativa descartada: un servidor SMTP de prueba en el E2E** (MailHog, `smtp-tester`). Añade un
proceso y una dependencia a la suite para probar un transporte —SMTP— que esta ficha **no usa**: el
adaptador real habla HTTP. Probaría algo que no es lo que corre en producción.

**Lo que el E2E afirma, además del camino feliz**: que tras establecerla, **volver a abrir el mismo
enlace ya no sirve** (R12) y que el login con la contraseña nueva entra al dashboard (R41). Lo que
**no** hace es cubrir los seis rechazos de R22 uno a uno: eso es unitario e integración, y un E2E por
cada rama sería la batería que `CHECKPOINTS.md` no pide.

---

## 10. Consecuencias aceptadas

1. **`create` cambia de firma** y con ella el cableado y sus tests (§ 2, fila 4). Es el precio de la
   enmienda a QC-66 R15 y no hay forma de pagarlo más barato.
2. **Un fallo entre el `INSERT` del usuario y el `INSERT` del enlace deja un usuario `pending` sin
   enlace.** La alternativa —meter los dos en la misma transacción— obliga a que `create` emita el
   enlace, o sea a mezclar dos responsabilidades en el método que QC-66 dejó deliberadamente
   estrecho, y a arrastrar la fábrica del secreto hasta el adaptador del alta. Se acepta la ventana
   porque **su remedio ya existe y ya está especificado**: el reenvío de R14, que es el mismo camino
   que la decisión 7 creó para el fallo de correo. Queda anotado, no escondido.
3. **La tabla crece y nada la limpia.** Una fila por alta sin contraseña y una por reenvío, de ~200
   bytes. Con mil altas al año son 200 KB: no hay problema que resolver hoy, y una tarea de limpieza
   exige la maquinaria de segundo plano que R31 prohíbe. Anotado como candidato a ficha propia, sin
   ficha.
4. **El correo no se puede probar de extremo a extremo contra el proveedor real** en el gate: lo que
   se prueba es que el adaptador arma bien la petición y traduce el fallo (§ 9.1). Que el dominio
   esté verificado por DNS en el panel del proveedor es trabajo de configuración y depende de la
   pregunta abierta 1.

---

## 11. Alternativas descartadas

### 11.1 Guardar el secreto cifrado (reversible) en vez de su huella — descartada

Permitiría reenviar **el mismo** enlace sin emitir uno nuevo. Se descarta: obliga a custodiar y rotar
una clave de cifrado, y el día que esa clave se filtre —con la copia de seguridad, por ejemplo— todos
los enlaces vivos quedan al descubierto. Con la huella, la copia de seguridad no vale nada. Además
«reenviar el mismo» choca de frente con la decisión 4, que dice que el anterior **muere**.

### 11.2 `HMAC-SHA256(secreto, SESSION_SECRET)` como huella — descartada

Es más fuerte en el papel: quien robe la base sin robar la clave no puede ni confirmar un secreto que
adivine. Se descarta por dos motivos. Primero, **no compra nada aquí**: el secreto tiene 256 bits de
un CSPRNG, así que no hay nada que adivinar ni diccionario que confirmar; el HMAC protege contra un
ataque que no existe en este espacio de claves. Segundo, **introduce una clave que hay que rotar**, y
el día que se rote —o el día que alguien despliegue con otro `SESSION_SECRET`— **todos los enlaces
vivos mueren en silencio**, sin ningún aviso y sin ninguna forma de diagnosticarlo desde la pantalla.
Un coste operativo real a cambio de una defensa nominal.

### 11.3 Devolver las reglas incumplidas en el `diagnostic` del error — descartada

Sería «un error más» y cabría en el catálogo. **No se puede**: QC-70 R29 dice que el campo de
diagnóstico va al registro del servidor y **no se serializa al navegador**, y su guardia da rojo si
alguien lo lee desde `app/**` o `components/**`. La persona que está escribiendo su contraseña
necesita saber **qué regla** falló, o el formulario es inservible. Por eso el fallo de política es
una **variante propia del estado de formulario** y no un `ErrorState` (§ 5.3), que además es lo que
QC-70 R31 deja explícitamente fuera del catálogo.

### 11.4 Que la página valide el enlace al pintarse — descartada

Es lo cómodo: entrar, comprobar, y enseñar «este enlace ya no sirve» sin que la persona escriba nada.
Se descarta por dos razones. Convierte la página en un **oráculo de lectura** —probar secretos sin
coste y sin dejar el enlace consumido— y, sobre todo, crea un **segundo camino de comprobación**
distinto del `UPDATE` condicional de § 4.6, que puede divergir de él: dos verdades sobre si un enlace
vale. La comprobación ocurre **una sola vez**, en el mismo sitio donde se escribe.

### 11.5 Que establecer la contraseña abra sesión automáticamente — descartada

Ahorra un paso a la persona. Se descarta: fabricaría una sesión desde una superficie **pública** a
partir de un secreto que pudo llegar por un correo reenviado o leído por otro, y ningún requisito lo
pide. La persona pasa por el login, que es donde vive la política de acceso (QC-7, QC-78) — y es
justamente lo que el E2E de R41 ejerce.

### 11.6 Hacer `users.password_hash` anulable — descartada

Es lo «limpio» para decir «esta cuenta no tiene credencial». Obliga a una migración sobre `users` que
R37 prohíbe, y a que **todo** el camino de login empiece a tratar un `null` que hoy no puede llegar,
en una ficha que no es la dueña de ese camino. El centinela de § 6.1 consigue lo mismo sin tocar el
modelo, con la misma convención que usa `/etc/shadow` desde hace treinta años.

### 11.7 Un módulo nuevo `lib/modules/correo/` para el envío — descartada

Tentador, porque el correo huele a infraestructura compartida y QC-96 y QC-89 lo van a necesitar. Se
descarta **hoy**: `docs/architecture.md` rechaza preparar infraestructura «por si acaso», y el único
consumidor de este puerto es `identity`. Cuando aparezca el **segundo** módulo que necesite enviar
correo, mover el adaptador es cambiar su carpeta y una línea de composición, porque ya está detrás de
un puerto. Es el mismo criterio con el que QC-70 esperó a tener cinco copias antes de crear
`lib/modules/errores`.

### 11.8 Una cola de reintentos del envío — descartada por el humano

Consta para que no se reconsidere: está en «Lo que NO entra» y lo sostiene R31. No existe ninguna
maquinaria de trabajo en segundo plano en el ERP y esta ficha no la construye; el reintento es el
reenvío a mano de R14.

---

## 12. Preguntas abiertas que deja este diseño

Las **tres** de `requirements.md` no se repiten aquí y **ninguna bloquea la implementación**:

- **P1 (remitente y dominio)** la rodea **R28**: el valor sale de configuración, el código se escribe
  entero, y lo que falta es rellenar `MAIL_FROM_ADDRESS` y verificar el dominio por DNS en el panel
  del proveedor (§ 7.3).
- **P2 (el copy del correo)** la rodea § 7.3: dos constantes al principio del adaptador, en español,
  con un solo hueco. Migrarlas a QC-72 será mover dos cadenas.
- **P3 (la marca de cambio de credencial)** la abre este spec y **sigue abierta**: manda **R21**, la
  marca no se toca, y hoy ningún archivo del repositorio la lee. Cerrarla es un caso de test más y
  una columna en la misma escritura de § 4.6 — sin migración.

Una más, propia y menor, que este diseño **sí resuelve** y conviene dejar dicha: **quién puede pedir
el enlace es solo quien ya administra usuarios**. No hay ninguna forma de que una persona sin sesión
pida uno para sí misma; eso **es QC-96** y es la frontera que R39 protege.
