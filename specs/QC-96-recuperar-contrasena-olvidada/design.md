# QC-96 — recuperar-contrasena-olvidada · design.md

> Zona: `fullstack` · Complejidad: `medium` · depends_on: `QC-79`, `QC-23` ·
> Rama: `feature/QC-96-recuperar-contrasena-olvidada`
>
> El **qué** está en `requirements.md` (R1–R37) y su alcance lo cerró el humano el 2026-09-12 en la
> tabla de **7 decisiones**. Aquí va el **cómo**: la columna de propósito y su migración con
> `down.sql`, **cómo se consigue una respuesta indistinguible** —mismo contenido, mismo tiempo—, **por
> qué el límite por correo no es un oráculo y dónde vive su conteo sin almacén nuevo**, cómo se
> **cumple la regla de escritura de QC-23** sin invocar a nadie (§ 7), la reutilización de la pantalla de
> QC-79, y cómo se verifica todo incluyendo el E2E.
>
> **Precedente literal, que es el 80 % del trabajo**: `specs/QC-79-alta-sin-contrasena-y-enlace/` y
> el código que dejó —`credential_setup_tokens`, `credential-setup-link-prisma.ts`,
> `credential-setup-secret-crypto.ts`, `credential-setup-mailer-{resend,outbox}.ts`,
> `mail-config-env.ts`, `app/(public)/establecer-contrasena/[token]/`—. **Este diseño no reconstruye
> nada de eso.** Cada vez que se aparta de QC-79, lo dice con el número de requisito que enmienda.
>
> **La idea que gobierna la ficha, en una frase**: la diferencia con QC-79 no es el mecanismo, es
> **quién dispara**. Allí un administrador con sesión sobre un usuario que acaba de crear; aquí
> cualquiera, sin sesión, escribiendo un correo que puede no ser suyo. De ahí sale todo lo de abajo.

---

## 1. Qué construye esta feature, y qué archivos toca

| Archivo | Qué se hace |
| --- | --- |
| `db/schema.prisma` | `CredentialSetupToken` gana `purpose` (enum `CredentialSetupPurpose`). **Único** cambio del esquema; `User` no se toca. |
| `db/migrations/<ts>_credential_setup_purpose/migration.sql` + `down.sql` | El tipo enum, la columna con su `DEFAULT`, el backfill implícito y el índice de § 4.2. |
| `lib/modules/identity/domain/credential-setup-link.ts` | **MODIFICADO.** El propósito como tipo de dominio, la constante de **1 hora** y `credentialSetupLinkExpiresAt(issuedAt, purpose)` (§ 3.3). |
| `lib/modules/identity/domain/credential-recovery-input.ts` | **NUEVO.** Esquema `zod` de la solicitud (§ 5.2). |
| `lib/modules/identity/domain/request-credential-recovery.ts` | **NUEVO.** El caso de uso **público sin actor** (R2–R19). |
| `lib/modules/identity/domain/constant-response-time.ts` | **NUEVO.** El presupuesto fijo de tiempo de R6 (§ 6.2), dominio puro. |
| `lib/modules/identity/domain/set-credential-with-link.ts` | **MODIFICADO.** El camino de consumo se vuelve consciente del propósito (§ 7.2). |
| `lib/modules/identity/ports/credential-setup-link-repository.ts` | **MODIFICADO.** `issueRecoveryLink`, `consumeLink` y `applyRecoveryCredential` (§ 5.1). |
| ~~`lib/modules/identity/ports/session-revoker.ts`~~ | **NO SE CREA.** La enmienda del 2026-09-12 lo eliminó: el corte de sesiones es una columna del `UPDATE`, no un puerto (§ 7). |
| `lib/modules/identity/adapters/driven/persistence/credential-setup-link-prisma.ts` | **MODIFICADO.** Las transacciones de § 4.3, § 4.4 y § 6.3. |
| `lib/modules/identity/adapters/driving/credential-setup-actions.ts` | **MODIFICADO.** Una Server Action nueva, `requestCredentialRecoveryAction` (§ 5.3). |
| `lib/modules/identity/index.ts` | Gana los tipos y la factory nueva — solo de `./domain`. |
| `lib/composition/index.ts` | Cablea **solo** el caso de uso nuevo. Ningún puerto de sesiones que cablear (§ 7.3). |
| `lib/shared/routes.ts` | **MODIFICADO.** `FORGOT_PASSWORD_ROUTE` deja de ser «ruta aún inexistente». |
| `app/(public)/recuperar-contrasena/page.tsx` + `components/` | **NUEVOS.** La pantalla de R1. |
| `e2e/recuperar-contrasena.spec.ts` | **NUEVO.** R37 (§ 9.3). |
| `tests/**` | Los de § 9 y los ajenos de § 2. |

**Declaración explícita para la validación de conflicto del leader** (`tasks.md` la repite):
`db/schema.prisma` **SÍ**; `db/migrations/` **SÍ** (carpeta nueva); `lib/modules/identity/**` **SÍ**;
`lib/composition/index.ts` **SÍ**; `lib/shared/routes.ts` **SÍ**; `app/(public)/` **SÍ** (carpeta
nueva + ninguna modificación de `login/` ni de `establecer-contrasena/`, ver § 8.1); `e2e/` **SÍ**.
**NO** se toca: `package.json`, `middleware.ts`, `app/(private)/**`, `components/**`,
`lib/modules/errores/**` (R32: cero códigos nuevos), ni ningún otro módulo.

**Choque de archivos a vigilar**: cualquier otra feature en vuelo que toque
`lib/modules/identity/domain/set-credential-with-link.ts`,
`credential-setup-link-repository.ts` o `credential-setup-actions.ts` —hoy, en `origin/dev`,
ninguna—. **QC-23 ya tocó `users` y `credential-setup-link-prisma.ts`** (el sello junto al hash), así
que QC-96 se escribe **sobre** su árbol y no al lado: § 7.3 dice qué hereda y qué ya no le debe.

---

## 2. El ripple: qué se pone rojo

Se atiende **en la misma tanda que el cambio que lo provoca**, nunca al final. La lista se cierra
corriendo `pnpm exec vitest related --run <archivos tocados>` antes de cada tanda — que es lo que en
QC-79 encontró ocho archivos ajenos donde el diseño había escrito seis.

| # | Archivo ajeno | Qué afirma hoy | Qué pasa a afirmar |
| --- | --- | --- | --- |
| 1 | `tests/unit/identity/credencial/link-lifetime.test.ts` | 7 días y el borde exacto | **Gana** los casos de **1 hora** para `recovery`; los de 7 días **no se tocan** (R11). |
| 2 | `tests/unit/identity/credencial/set-credential-with-link.test.ts` | los seis rechazos indistinguibles y la activación | **Gana** el camino `recovery` y el caso de propósito cruzado; **ninguna expectativa se borra ni se debilita**. |
| 3 | `tests/unit/identity/credencial/credential-setup-actions.test.ts` | dos actions | Tres. Las dos de QC-79 conservan sus casos. |
| 4 | `tests/unit/identity/schema/credential-setup-migration.test.ts` | el UP de QC-79 y su `down.sql` | **No se toca**: la migración nueva tiene **su propio** test estático (§ 9.1). Se corre para comprobar que sigue verde. |
| 5 | `tests/unit/composition/identity-facade.test.ts` | las claves de la fachada | **Gana** la clave nueva del caso de uso público, y **solo esa**: no hay ningún puerto de sesiones que cablear (§ 7.3). |
| 6 | `e2e/establecer-contrasena.spec.ts` | el camino de QC-79 | **No se toca**. Se corre: si el propósito por defecto no fuera `setup`, se pondría rojo, y eso es exactamente lo que se quiere que vigile. |
| 7 | `tests/guards/guard-envio-de-correo.test.ts`, `guard-dependencias-aprobadas`, `guard-arquitectura-modulos`, `guard-rls-force`, `guard-password-never-plaintext`, `guard-catalogo-de-errores` | invariantes del repo | Verdes **sin tocarlas** (R30, R32, R33, R34). |

---

## 3. El propósito: una columna, dos plazos

### 3.1 El modelo

```prisma
/// QC-96. Para QUE se emitio el enlace. `setup` = el alta de QC-79 (7 dias, cuenta `pending`);
/// `recovery` = la recuperacion sin sesion (1 hora, cuenta `active`). El propósito decide el plazo
/// (R11) y el estado que el consumo exige (R23). Ver design.md > 3.
enum CredentialSetupPurpose {
  setup
  recovery
}
```

```prisma
model CredentialSetupToken {
  // ... sin cambios ...
  purpose      CredentialSetupPurpose @default(setup)
  // ... sin cambios ...
  @@index([userId, purpose, createdAt], map: "credential_setup_tokens_user_purpose_created_idx")
}
```

**Por qué un enum de Postgres y no `text` con `CHECK`.** Precedente literal del repo:
`UserAccountStatus` (QC-65) es un enum de Postgres, y la aplicación ya castea con `::"..."` en el SQL
crudo del mismo adaptador que esta ficha modifica. Un `text` admitiría por descuido un tercer valor
escrito a mano, y la lista **es cerrada**.

**Por qué `@default(setup)` y no `NOT NULL` sin defecto.** Es lo que hace el backfill gratis y
correcto: **toda** fila existente es del alta, porque hasta hoy no había otro propósito (R33). Y deja
intacto el código de QC-79, que no pasa el propósito al insertar del alta — aunque § 4.3 lo pasa
explícito igual, para que la decisión se lea en el sitio donde se toma y no dependa del defecto.

### 3.2 Lo que NO cambia de la tabla, y es la mitad de la decisión 6

- **El índice único parcial `credential_setup_tokens_one_live_per_user` se queda exactamente como
  está**, sin el propósito (R14). Es deliberado: «un enlace vivo por persona» sigue significando
  **uno**, no «uno de cada tipo». Consecuencia buscada: emitir una recuperación **mata** un enlace de
  alta vivo, y al revés. ¿Puede eso dejar a alguien fuera? No: un enlace de alta vivo pertenece a una
  cuenta `pending`, y una cuenta `pending` **nunca** llega a emitir recuperación (R9). La única
  combinación posible —cuenta activada a mano por el administrador con su enlace de alta todavía
  vivo— es justo aquella en la que matar el enlace de alta es lo correcto, porque ese enlace ya no
  sirve para nada (QC-79 R22).
- **Nada se borra físicamente**, ni aquí ni en el conteo de § 6.3: consumir y sustituir siguen siendo
  `UPDATE` de una columna. Eso **es** lo que hace posible el límite sin almacén nuevo.
- **Sigue sin `company_id`** y sigue siendo correcto: cuelga de `users`, que es una de las tres tablas
  del sistema exentas (`docs/architecture.md > Dominio` n.º 1), y su empresa se deriva del usuario.
- **RLS activado y forzado**: ya lo está; la migración **no** lo toca y el test estático lo reafirma.

### 3.3 Los dos plazos, derivados del propósito

`domain/credential-setup-link.ts` gana una constante y una firma:

```ts
export const CREDENTIAL_RECOVERY_LINK_TTL_MINUTES = 60;                      // R11, decision 1
export const CREDENTIAL_RECOVERY_LINK_TTL_MS = CREDENTIAL_RECOVERY_LINK_TTL_MINUTES * 60 * 1000;

export function credentialSetupLinkExpiresAt(issuedAt: Date, purpose: CredentialSetupPurpose): Date;
```

El parámetro es **obligatorio**, no opcional con `setup` por defecto: un valor por defecto haría que
olvidarlo compilara, y olvidarlo en el camino de recuperación significa **un enlace de 7 días** que
cualquiera puede pedir sobre un correo ajeno. Que el typecheck obligue a decirlo es el punto.

---

## 4. Emitir la recuperación

### 4.1 El camino entero, en orden

```
requestCredentialRecovery(input)                       // SIN actor (R2)
  1. zod estricto: { email }                           // R3
  2. presupuesto de tiempo: t0 = now()                 // R6, § 6.2
  3. secretos: uno por destinatario potencial          // § 4.3
  4. links.issueRecoveryLinks({ email, ... })          // UNA transaccion, § 4.3
  5. por cada emision concedida: mailer.send(...)      // R15, sin await mas alla del presupuesto
  6. esperar hasta t0 + PRESUPUESTO                    // R6
  7. devolver SIEMPRE { status: 'submitted' }          // R4
```

Ninguna rama entre 3 y 5 cambia lo que devuelve 7. **Eso es R4 escrito como estructura**: el tipo de
retorno del caso de uso es `Promise<void>` y el estado de la action no tiene ningún campo, así que no
hay hueco donde colar una diferencia sin romper el typecheck. Mismo criterio que QC-79 § 4.7 usó para
el secreto, aplicado aquí a la **existencia de la cuenta**.

### 4.2 Quién es el destinatario: resolución por correo, sin empresa

```sql
SELECT u.id, u.email, u.account_status, u.locked_until
  FROM users u
  JOIN companies c ON c.id = u.company_id
 WHERE lower(u.email) = lower($1)
   AND u.deleted_at IS NULL
   AND c.deleted_at IS NULL
```

- **`lower(...)` y no `mode: 'insensitive'`**, por la misma razón escrita en
  `user-credentials-prisma.ts`: `ILIKE` no usa el índice funcional `users_email_unique` y convertiría
  la consulta en un *seq scan* sobre `users` en una ruta que **cualquiera sin sesión puede
  disparar**. Aquí eso no es una cuestión de rendimiento, es la diferencia entre una pantalla pública
  barata y una palanca de denegación de servicio.
- **Sin `LIMIT 1`**: puede haber varias (R10, P1). El índice es `("company_id", lower("email"))`, así
  que la búsqueda solo por correo no lo usa como único pero sí puede recorrerlo; si el plan resultara
  malo con volumen, la salida es un índice funcional propio sobre `lower(email)` — **no se añade
  hoy**, porque optimizar sin medir es inventar (regla 6).
- **El estado efectivo se decide en el dominio** con `effectiveAccountStatus` (QC-78 R7), por eso la
  consulta devuelve `account_status` y `locked_until` **crudos** y no un booleano ya cocinado. Solo
  pasan las que dan `active` (R9).
- **La empresa no aparece en la entrada por ningún lado** (R3): no hay actor, no hay sesión, y el
  ámbito no lo pone el llamante. Es la única operación de escritura del módulo sin ámbito de empresa,
  y lo que la hace segura es que **no devuelve nada** y que **solo puede escribir una fila de token
  del usuario que ella misma resolvió**.

### 4.3 La transacción de emisión

Por cada destinatario que pasa R9, dentro de **una** transacción:

```
1. SELECT count(*) FROM credential_setup_tokens                 -- el limite, § 6.3
    WHERE user_id = $u AND purpose = 'recovery' AND created_at > $now - VENTANA;
   -- si count >= TOPE: no se emite para ESTE usuario. Sin error, sin marca, sin log (R17, R19).
2. UPDATE credential_setup_tokens SET superseded_at = $now
    WHERE user_id = $u AND consumed_at IS NULL AND superseded_at IS NULL;   -- R14
3. INSERT (user_id, token_digest, expires_at, purpose='recovery');          -- 23505 => 'superseded'
```

Es **la misma forma** que `issueForPendingUser` de QC-79 (§ 4.5 de aquel diseño), con dos cambios: el
usuario ya viene resuelto por § 4.2 y el paso 1 es nuevo. El `23505` del índice parcial se sigue
traduciendo a `'superseded'` y **no se reintenta ni se manda un segundo correo**: otra emisión
simultánea ganó y ya envió, que es la verdad observable.

### 4.4 Qué devuelve el puerto, y por qué tan poco

```ts
issueRecoveryLinks(input: {
  email: string; now: Date; expiresAt: Date; ttl... ;
  secretsFor: (n: number) => ReadonlyArray<{ secret: string; digest: string }>;
}): Promise<ReadonlyArray<{ readonly email: string; readonly secret: string }>>
```

Devuelve **solo la lista de envíos que hay que hacer** —vacía si no hay ninguno, y vacía es el caso
mayoritario—. No devuelve cuántas cuentas había, ni por qué no se emitió, ni el identificador de
nadie: **si el puerto no lo devuelve, el caso de uso no lo puede filtrar por descuido**. Es la misma
disciplina con la que QC-79 decidió que `ApplyOutcome` tuviera dos valores y no seis.

La fábrica de secretos entra **como función** en vez de generarse dentro del adaptador: el adaptador
no puede importar `domain/`… al revés, es el dominio quien no puede importar `node:crypto`. Se
generan en el caso de uso (que ya tiene el puerto `CredentialSetupSecretFactory`) y se pasan; el
número de secretos que hacen falta no se sabe hasta resolver el correo, y por eso viaja una función y
no un valor. **Alternativa considerada y descartada**: dos viajes a la base (resolver, luego emitir).
Abre una carrera entre los dos viajes y duplica el coste de la ruta pública.

---

## 5. Superficie: rutas, contratos y errores

### 5.1 Puertos

| Puerto | Método | Para qué |
| --- | --- | --- |
| `CredentialSetupLinkRepository` | `issueRecoveryLinks` | § 4.3 |
| " | `consumeLink(digest, now) → { userId, purpose } \| 'invalid'` | § 7.2 paso 1 |
| " | `applyRecoveryCredential({ userId, credentialHash, now }) → 'ok' \| 'invalid'` | § 7.2 paso 3 |
| " | `applyCredentialAndActivate` (QC-79) | **se conserva intacto**, es el camino `setup` |

**No hay ningún puerto de sesiones, y la enmienda del 2026-09-12 lo quitó a propósito** (§ 7).
`applyRecoveryCredential` sube el sello de QC-23 como una columna más de su `UPDATE`: el corte de
sesiones no es una dependencia del dominio, es parte de la escritura.

**Sigue sin haber ningún método de lectura de enlaces** (`findByDigest`), y es deliberado, igual que
en QC-79 § 6.2: `consumeLink` es un *compare-and-set* que **escribe y devuelve**, no un `SELECT`
previo. Un lector sería a la vez una carrera y un segundo camino de comprobación que puede divergir
del primero.

### 5.2 Contratos de entrada

```ts
// domain/credential-recovery-input.ts
export const requestCredentialRecoverySchema = z.strictObject({
  email: z.string().trim().min(1).email(),
});
```

`strictObject` por R3: ninguna clave desconocida, y por tanto **ninguna forma de pasar `companyId`,
`userId`, `purpose`, `ttl` ni `to`**. Aquí sí se recorta (`trim`) y la comparación es insensible a
mayúsculas, a diferencia de la contraseña —que QC-19 R10 prohíbe normalizar—: un correo con un
espacio pegado al pegarlo es el mismo correo, y el índice de la base ya compara en `lower`.

### 5.3 Contratos de salida y la Server Action

```ts
export type RequestRecoveryFormState =
  | { status: 'idle' }
  | { status: 'submitted' }            // R4: SIEMPRE esta. Sin campos. Sin datos.
  | ErrorState;                        // solo invalid_input (R3) y unexpected (QC-71)
```

- **`submitted` no lleva nada**, ni siquiera el correo escrito: repintarlo sería inofensivo, pero
  abre el hueco por el que mañana alguien mete «te lo enviamos a j\*\*\*@empresa.com».
- **`ErrorState` solo aparece por causas que no dependen de la base**: entrada malformada (lo que la
  persona escribió) y fallo inesperado con su `reference` de QC-71. **Ningún código nuevo** en el
  catálogo (R32).
- La action recibe **`FormData`** (R31) y **no decide nada**: ni resuelve actor —no hay—, ni mira
  cookies, ni interpreta el correo. `currentActor()` de `credential-setup-actions.ts` **no se llama
  desde aquí**, y esa ausencia es R2, exactamente como la de `setCredentialWithLinkAction`.
- **Sin `revalidatePath`**: no hay nada cacheado que cambie.

### 5.4 Errores

| Situación | Qué se devuelve |
| --- | --- |
| Correo malformado o clave desconocida | `invalid_input` (ya existe) |
| Cualquier resultado de la resolución, del límite o del correo | **`{ status: 'submitted' }`** (R4) |
| Enlace inválido al establecer, **por cualquiera de los siete casos** | `credential_link_invalid` (ya existe, QC-79) |
| Fallo de la transacción que escribe credencial + sello (R28) | `unexpected` con su `reference` de QC-71 |

**Cero códigos nuevos** (R32), y eso no es suerte: cada código nuevo habría sido una forma de
distinguir ramas que R5 exige indistinguibles.

---

## 6. La respuesta indistinguible, y el límite que no delata

Es el corazón de la ficha y donde el reviewer va a mirar más fuerte. Cuatro piezas.

### 6.1 Mismo contenido

Una sola variante de éxito sin campos (§ 5.3), construida en **un solo sitio** del caso de uso —la
última línea, fuera de toda rama—. La pantalla pinta un texto fijo del tipo «si esa dirección
corresponde a una cuenta, el enlace va de camino» **sin consultar nada** y sin repintar el correo. Un
test de la UI afirma que el DOM resultante es **byte a byte el mismo** con un correo que existe y con
uno que no.

### 6.2 Mismo tiempo

```ts
// domain/constant-response-time.ts
export const RECOVERY_RESPONSE_BUDGET_MS = 700;

/** Espera hasta que se cumpla el presupuesto desde `startedAt`. Nunca acorta, nunca depende de la base. */
export async function holdUntilBudget(startedAt: number, now: () => number, sleep: (ms:number)=>Promise<void>): Promise<void>;
```

- El presupuesto **es una constante de dominio**, no una variable de entorno: no cambia entre
  entornos, y si cambiara por entorno el atacante podría medir el de producción y compararlo.
- **El reloj y el `sleep` entran inyectados**, para que el test los fije y afirme el tiempo **sin
  dormir de verdad** ni depender de la máquina. Es lo mismo que ya hace `now?: () => Date` en los dos
  casos de uso de QC-79.
- **El envío no se espera más allá del presupuesto** (R6). Si el proveedor tarda más, el caso de uso
  responde igual y el envío queda en vuelo. **Consecuencia aceptada y escrita**: en un entorno
  serverless la función puede congelarse antes de que el envío termine, y ese correo se pierde. Se
  acepta porque el remedio ya existe y es barato —**volver a pedirlo**, que es literalmente el
  argumento de la decisión cerrada 1— y porque la alternativa es peor: esperar al proveedor hace que
  la rama «el correo existe» tarde sistemáticamente más que «no existe», que es la fuga que la
  decisión 2 viene a cerrar.
- **Lo que este diseño NO promete**: tiempo *constante* a nivel de microsegundos. El presupuesto es un
  **suelo** que domina el trabajo real (una consulta indexada y una transacción corta, decenas de
  milisegundos) y aplana la diferencia entre ramas hasta hacerla inobservable a través de la red. Un
  atacante con acceso local y millones de muestras podría seguir midiendo ruido; el modelo de amenaza
  de la decisión 2 es «alguien prueba direcciones desde internet para averiguar quién trabaja en la
  empresa», y contra eso un suelo fijo es suficiente. Decirlo así es más honesto que prometer
  «tiempo constante».
- **Cómo se prueba** (R6): con reloj y `sleep` dobles, se ejerce cada una de las nueve ramas de R5 y
  se afirma que **todas** resuelven en el mismo presupuesto; y un caso de sensibilidad que quita el
  `hold` y pone el test en rojo.

### 6.3 El límite por correo: dónde vive el conteo

**Vive en `credential_setup_tokens`**, contando filas con `purpose = 'recovery'` y
`created_at > now − ventana` para ese `user_id` (§ 4.3 paso 1). No hace falta ningún almacén nuevo
porque **la tabla ya es el registro de lo que se emitió**: QC-79 decidió que nada se borra
físicamente (R12 de aquella ficha), así que las filas sustituidas y consumidas **siguen ahí**, y son
exactamente la historia que el límite necesita. El índice
`(user_id, purpose, created_at)` de § 3.1 hace que el conteo sea una lectura de índice, no un escaneo.

**Por qué esto no es un oráculo** (R19), que es la pregunta de verdad:

1. El resultado del límite **no cambia la respuesta**: llegar al tope produce exactamente lo mismo que
   no llegar y que no existir (R4, R5 g/h/a). No hay «has pedido demasiados» en ningún sitio.
2. El límite **no se aplica a direcciones que no existen**, y no hace falta que se aplique: sobre
   ellas no se envía nada, así que no hay buzón que inundar. Un contador por dirección inexistente
   solo serviría para crear un estado que después habría que consultar — y consultar un estado que
   solo existe para las direcciones reales es **precisamente** cómo un límite se convierte en un
   oráculo. Aquí no existe ese estado.
3. Por tanto el conteo **cuelga del `user_id`**, no del texto del correo. «Por correo» de la decisión
   4 se implementa como «por la persona a la que ese correo pertenece», que es lo mismo para todos los
   efectos observables y **la única forma de no crear un registro de direcciones probadas**.
4. El coste del límite **está dentro del presupuesto de tiempo** (§ 6.2): una consulta indexada más.

**Varias instancias del servidor.** El conteo vive en Postgres, así que es **uno solo** para todas las
instancias (R18) — esa es la mitad de la razón para ponerlo ahí y no en memoria del proceso, donde N
instancias darían N veces el tope y un reinicio lo borraría. Bajo concurrencia exacta el `count` no
bloquea filas que aún no existen, así que dos peticiones simultáneas podrían leer el mismo conteo y
emitir las dos: el tope se puede exceder **en uno**, y solo si las peticiones son simultáneas. Dos
cosas lo acotan: el **índice único parcial** de «un enlace vivo por persona» hace que de dos
inserciones simultáneas **una falle** con `23505`, así que la concurrencia para el mismo usuario ya
está serializada por la base; y el límite existe para que nadie use el ERP para inundar un buzón, no
para ser una cuota contable. **Se acepta y se anota**; la alternativa —`SELECT … FOR UPDATE` sobre la
fila de `users`, o un *advisory lock* por usuario— añade contención en una ruta pública a cambio de
un caso que el índice ya cubre.

### 6.4 Lo que el correo inexistente NO produce

Ni fila, ni contador, ni log, ni métrica, ni cabecera, ni tiempo distinto (R7, R8). El caso de uso no
escribe **nada** cuando la resolución de § 4.2 devuelve cero filas: solo espera su presupuesto y
responde. Un test de alcance recorre los archivos de la feature y falla ante cualquier `console.*`.

---

## 7. QC-23: el corte de sesiones **no se invoca, se cumple**

> **ENMENDADO el 2026-09-12, con QC-23 ya implementada en disco y leída línea a línea.** La versión
> anterior de esta sección definía un puerto `SessionRevoker` con la firma **asumida**
> `revokeAllSessionsOf(userId, now)`, derivada de la tabla de decisiones de QC-23 porque entonces no
> había ni `design.md` ni código. **Esa firma no existe, y además QC-96 no necesita invocar nada.**
> Lo de abajo ya no asume: cita archivo y línea.

### 7.1 Lo que QC-23 construyó de verdad, y por qué no encaja como invocación

**Existe `endAllSessions`, pero pide un actor autorizado.**
`lib/modules/identity/domain/end-all-sessions.ts`:

```ts
export function createEndAllSessions(
  deps: EndAllSessionsDeps,
): (actor: Actor | null | undefined, targetUserId: string) => Promise<void>
```

y su cuerpo empieza, literalmente en la primera línea ejecutable:

```ts
if (targetUserId !== actor?.id) requirePermission(actor, 'usuarios.modificar');
else requireActor(actor);
```

Después saca el ámbito de `actor.companyId` para pasárselo a
`SessionRevocationRepository.stampAll({ userId, companyId, validFrom })`
(`lib/modules/identity/ports/session-revocation-repository.ts`).

**Por qué eso cierra la puerta, y no es un detalle de nombres.** QC-96 **no tiene actor**: R2 y R21
dicen que ni la solicitud ni el establecimiento leen sesión, cookie ni cabecera de identidad.
`endAllSessions` no acepta «sin actor» —falla cerrado, que es su R27— y tampoco tiene de dónde sacar
`companyId`. Invocarlo exigiría **fabricar un actor falso con permiso de administrador** dentro del
camino público y sin sesión del ERP: exactamente el agujero que la autorización-en-primera-línea de
QC-23 existe para impedir. No es adaptar una firma; es romperla.

**Y no hace ninguna falta, porque QC-23 no hizo del corte por contraseña una llamada.**
`domain/session-revocation.ts`, al final de `changeRevokesSessions`, lo dice con todas sus letras:

> «Lo que NO decide esta funcion: el cambio de contrasena. Ese no es una variante mas porque no es
> una decision —siempre corta, por los tres caminos (R30)— sino **una regla sobre la escritura**:
> toda transaccion que escriba `users.password_hash` sube `sessions_valid_from` en la MISMA
> sentencia, y lo hace cumplir `tests/guards/guard-sesiones-cortadas.test.ts`.»

Esa guardia vigila **todo** `lib/modules/identity/adapters/driven/persistence/`, en sus **dos**
formas —el objeto `data` de Prisma y el **SQL crudo**—, exime solo la **creación** de filas, y tiene
un caso que ancla **por nombre** el archivo que esta ficha extiende:

> `it('el UPDATE del enlace de credencial esta cubierto de verdad, no por casualidad')`

Hoy, `credential-setup-link-prisma.ts > applyCredentialAndActivate` ya escribe:

```sql
UPDATE "users"
   SET "password_hash" = ${input.credentialHash},
       "sessions_valid_from" = ${floorToSecond(input.now)},
       ...
```

con un comentario de QC-23 T15 que dice que allí el sello **no tiene efecto medible** —la cuenta
venía de `pending` y nunca tuvo sesión— y que se escribe igual porque «**es la puerta que queda
cerrada si QC-89 o QC-96 reutilizan este camino**». QC-96 es exactamente ese caso, y es el primero
en el que el sello **sí** tiene efecto: la cuenta está `active` y puede tener sesiones vivas.

**Conclusión de diseño: QC-96 no invoca ningún revocador y no añade ningún puerto.** Cumple la regla
de escritura, y quien la haga cumplir si alguien la olvida es la guardia de QC-23, no la memoria del
implementer.

### 7.2 Cómo queda el camino: **una transacción**, como en QC-79

`set-credential-with-link.ts`, para el propósito `recovery`:

```
1. consumeLink(digest, now)               -> { userId, purpose } | 'invalid'   (CAS atomico)
2. si purpose = 'setup'    -> el camino de QC-79, INTACTO (activar la cuenta pendiente)
3. si purpose = 'recovery' -> applyRecoveryCredential({ userId, credentialHash, now })
```

y el `UPDATE` del paso 3, dentro de **la misma transacción** que el consumo del paso 1
(`applyCredentialAndActivate` de QC-79 es el molde y **no se toca**):

```sql
UPDATE "users"
   SET "password_hash"       = ${credentialHash},
       "sessions_valid_from" = ${floorToSecond(now)}   -- R27: MISMA sentencia, no una segunda
 WHERE "id" = ${userId}::uuid
   AND "deleted_at" IS NULL
   AND "account_status" = 'active'::"UserAccountStatus"   -- R23, R25: 0 filas => rollback => 'invalid'
```

**Sin `account_status` en el `SET`** (R22: la cuenta ya estaba `active`), **sin
`account_status_changed_*`**, **sin `must_change_credential`** y **sin tocar el bloqueo** (R26).
`floorToSecond` es la función de QC-23 (`domain/session-revocation.ts`) que el adaptador **ya
importa**: no se escribe una segunda forma de truncar, porque dos granularidades convertirían el
borde de la comparación `<=` en un volado — el motivo está escrito en su propio docstring.

**R28 sale gratis, y eso es la ganancia de la enmienda.** El diseño anterior tenía tres pasos
—consumo, revocación, credencial— con la revocación en medio y un párrafo entero justificando la
ventana «enlace consumido, sesiones cerradas, contraseña sin cambiar» que abría. **Esa ventana
desaparece**: hash y sello son dos columnas del mismo `SET`, dentro de la transacción que consume el
enlace. Si no se confirma, no se confirma nada —ni el consumo—, y la persona puede reusar su enlace.
Es **imposible por construcción** terminar con contraseña nueva y sesión antigua viva.

El consumo sigue siendo **un compare-and-set** y **no** se añade ningún `findByDigest` (R25): los
siete casos de rechazo siguen saliendo por la misma puerta y con el mismo error.

### 7.3 Qué depende todavía de QC-23, y qué ya no

| Qué | Estado |
| --- | --- |
| La columna `users.sessions_valid_from` y `floorToSecond` | **De QC-23.** Tienen que estar en el árbol: por eso QC-96 conserva `QC-23` en su `depends_on` |
| `tests/guards/guard-sesiones-cortadas.test.ts` | **De QC-23.** QC-96 **no la toca**; simplemente su `UPDATE` nuevo tiene que pasarla (R29) |
| Un puerto `SessionRevoker` de QC-96 | **Eliminado.** No se crea |
| El cableado de un revocador en `lib/composition/index.ts` | **Eliminado.** No hay nada que cablear |
| `endAllSessions` / `SessionRevocationRepository` | **No se usan.** QC-96 no tiene actor (§ 7.1) |
| Tasks a la espera de un contrato de QC-23 | **Ninguna.** Ver `tasks.md` |

**Lo que esta ficha sigue sin hacer**: crear ninguna columna ni tabla de sesiones, añadir el `sid` al
token, tocar `revoked_sessions` o `resolve-session.ts`, y —lo más importante— **debilitar la guardia
de QC-23 para que el `UPDATE` nuevo pase**. Si la guardia se pusiera roja, la respuesta es añadir el
sello, nunca aflojar la regla.

---

## 8. Las dos pantallas

### 8.1 La de pedir (R1, R35) — nueva

| Ruta | Tipo | Quién entra |
| --- | --- | --- |
| `/recuperar-contrasena` | Página pública (`app/(public)/`) | Cualquiera. **Sin sesión** |

- La constante **ya existe**: `FORGOT_PASSWORD_ROUTE` en `lib/shared/routes.ts`, y la pantalla de
  login **ya la enlaza** (`data-testid="login-forgot-password"`). Esta ficha solo hace que deje de
  ser un 404 y borra el comentario «ruta aún inexistente (S6)». **`login/page.tsx` no se toca**, y eso
  mantiene el diff fuera del camino de acceso.
- **No entra en `PRIVATE_ROUTE_PREFIXES`**, a propósito: `decideRouteAccess` deja pasar sin redirigir
  todo lo que no es privado ni el login, así que **el middleware no se toca** — mismo razonamiento
  que QC-79 escribió para `/establecer-contrasena`.
- Server Component delgado + formulario de cliente con `useActionState`. **No consulta la base**: no
  hay nada que mostrar antes de que la persona escriba, y consultar al pintar sería un oráculo de
  lectura (QC-79 § 11.4 descartó exactamente eso).
- Multiplataforma (R35): `min-h-dvh`, `text-base` (16 px) en el campo, botón de 44 px, sin `:hover`
  como única vía. Se copia la estructura de `login/page.tsx`, que ya cumple.
- Tras responder, la pantalla enseña el mismo texto fijo siempre y un enlace de vuelta al login.

### 8.2 La de establecer (R21) — **se reutiliza, no se duplica**

El enlace de recuperación apunta a la **misma** `/establecer-contrasena/[token]` de QC-79. Tres
razones, y una objeción respondida:

1. La página **no lee la base y no sabe nada del token**: recibe el secreto del segmento y lo pasa en
   un campo oculto. Para ella, alta y recuperación son idénticos, y lo son de verdad: escribir una
   contraseña y confirmarla.
2. Una segunda página sería una **segunda copia** del formulario, de la política, de los textos y de
   las cuatro reglas multiplataforma, que divergirían el primer día que alguien toque una.
3. **No revela nada**: la URL es la misma para los dos propósitos, así que ni siquiera el camino dice
   si el enlace es de un alta o de una recuperación.

**Objeción, y por qué no aplica**: QC-79 R39 dice «el enlace DEBE servir **solo** para el alta». R39
habla del **token**, no de la ruta; y lo que garantiza que un token de alta siga sirviendo solo para
el alta es la columna `purpose` y la condición `account_status = 'pending'` del paso 3b (R23), que
**no se relajan**. La enmienda a R39 está declarada en `requirements.md`, con sus palabras.

El **título y el texto** de la página siguen sirviendo a los dos casos («establece tu contraseña»), y
**no** cambian según el propósito: cambiarlos exigiría leer la base al pintar, que es lo que 8.2.1
acaba de descartar.

---

## 9. Cómo se verifica

### 9.1 Niveles

| Nivel | Archivo | Qué demuestra |
| --- | --- | --- |
| Unit (dominio) | `tests/unit/identity/recuperacion/request-recovery.test.ts` | R2–R5, R8–R10, R16, R17: las **nueve** ramas de R5 devuelven **el mismo** valor; sin actor y sin lectura de sesión; el esquema estricto; varias cuentas con el mismo correo; el tope; ningún puerto suena cuando no debe (dobles que **fallan si los llaman**) |
| Unit (dominio puro) | `tests/unit/identity/recuperacion/response-budget.test.ts` | R6: las nueve ramas resuelven en el **mismo** presupuesto con reloj y `sleep` dobles; el envío lento no lo alarga; caso de sensibilidad sin `hold` → rojo |
| Unit (dominio puro) | `tests/unit/identity/credencial/link-lifetime.test.ts` (ampliado) | R11: **1 hora** para `recovery` y **7 días** para `setup`, con el borde exacto de cada uno |
| Unit (dominio) | `tests/unit/identity/credencial/set-credential-with-link.test.ts` (ampliado) | R21–R26: el camino `recovery` no cambia el estado; el propósito cruzado se rechaza con el **mismo** error; la política deja el enlace vivo; `must_change_credential` y el bloqueo intactos |
| Unit (estático) | `tests/unit/identity/recuperacion/sello-en-la-misma-sentencia.test.ts` | R27, R29: el SQL de `applyRecoveryCredential` escribe `"sessions_valid_from"` **en el mismo `SET`** que `"password_hash"`, con `floorToSecond` y **sin** filtro de empresa; caso de sensibilidad: quitar el sello lo pone rojo (y también pone roja la guardia de QC-23) |
| Unit (driving) | `tests/unit/identity/credencial/credential-setup-actions.test.ts` (ampliado) | R31, R32, R4: `FormData`, **sin** resolución de actor, estado sin campos, traducción por el traductor único |
| Unit (UI) | `tests/unit/identity-ui/request-recovery-form.test.tsx` | R1, R4, R35: el DOM es **el mismo** con correo existente y con inexistente; 16 px, 44 px, `dvh`, sin `:hover` |
| Unit (estático) | `tests/unit/identity/schema/credential-purpose-migration.test.ts` | R33: el UP crea el tipo y la columna con su `DEFAULT`, **no** toca `users`, **no** toca los tres índices de QC-47 ni el parcial de «uno vivo»; el `down.sql` es su inverso |
| Unit (alcance) | `tests/unit/identity/recuperacion/scope.test.ts` | R7, R20, R34, R36: ningún `console.*`, ninguna lectura de cabecera de origen (`x-forwarded-for`, `request.ip`), ningún route handler, ningún cron, `package.json` sin entradas nuevas |
| Integración | `tests/integration/identity/credential-recovery.int.test.ts` | R9, R10, R12–R14, R17, R18, R22, R23, R25 contra Postgres real: la huella y no el secreto; **dos** cuentas con el mismo correo en dos empresas reciben **dos** enlaces; el tope corta la cuarta; la recuperación **sustituye** un enlace de alta vivo; el consumo cruzado de propósitos falla; el `active` requerido; RLS forzado sigue en pie |
| Ciclo real | task T6 | R33: `db:migrate` → `db:rollback` → `db:migrate`, con la salida en la bitácora |
| **E2E** | `e2e/recuperar-contrasena.spec.ts` | **R37**, § 9.3 |
| Guardias (ya existen) | `guard-arquitectura-modulos`, `guard-rls-force`, `guard-password-never-plaintext`, `guard-dependencias-aprobadas`, `guard-catalogo-de-errores`, `guard-envio-de-correo`, **`guard-sesiones-cortadas` (QC-23)** | R30, R32, R33, R34 y **R27/R29** — verdes **sin tocarlas** |

### 9.2 Las sesiones, probadas de verdad y sin dobles

**La enmienda del 2026-09-12 quitó el único punto ciego que tenía esta ficha.** Antes, R27–R29 solo
se podían cubrir con dobles del puerto asumido —«se llamó al revocador, en este orden»—, y demostrar
que las sesiones **caen de verdad** quedaba bloqueado hasta que QC-23 entrara. Ahora el corte es una
columna del `UPDATE`, así que se prueba en tres niveles y ninguno es un doble de sí mismo:

1. **Estático** (fila nueva de § 9.1): el sello está en el mismo `SET`, con su caso de sensibilidad.
2. **La guardia de QC-23**, que ya vigila ese directorio y ese archivo por nombre: si alguien quita
   el sello, se pone roja **en ese commit**, sin que QC-96 tenga que acordarse de nada.
3. **Integración contra Postgres real** (T16): tras recuperar, `users.sessions_valid_from` de esa
   persona es el instante de la operación **truncado al segundo**, y una sesión emitida antes queda
   invalidada por `isStampedOut` de QC-23.

### 9.3 El E2E: **sí lleva, y por qué**

`CHECKPOINTS.md` exige E2E cuando la feature toca un flujo crítico y nombra la **autenticación** la
primera. Ésta no solo la toca: **añade una superficie de escritura que cualquiera puede disparar sin
sesión**. Diferirla sería el peor sitio posible para ahorrar.

El camino, en un navegador: la pantalla de acceso → «¿Olvidaste tu contraseña?» → escribir el correo
de una cuenta activa → el enlace sale por el **buzón** (`MAIL_TRANSPORT=outbox`, exactamente el
montaje de `e2e/establecer-contrasena.spec.ts`: variables en **el propio proceso del spec**, directorio
temporal por worker, `APP_BASE_URL` al `baseURL` de Playwright, `playwright.config.ts` **sin tocar**)
→ establecer la contraseña nueva → **entrar** con ella → el mismo enlace **ya no sirve**. Y un caso
más, que es el que justifica que este E2E exista y no sea decorativo: **pedirlo con un correo que no
existe pinta exactamente la misma pantalla** (R37).

**Lo que el E2E NO hace**: las nueve ramas de R5 una a una (son unitarias), y la medición de tiempos
(es unitaria y determinista; medir tiempos en un navegador es un *flake* garantizado). La
comprobación de que las sesiones se cerraron **ya no está bloqueada** (§ 9.2) y **sí entra** en el
E2E, que es donde se puede hacer bien: se deja una sesión abierta en un segundo contexto de
navegador, se recupera la contraseña y se comprueba que ese contexto acaba en el login.

---

## 10. Dependencias de terceros: **ninguna** (R34)

`docs/architecture.md > Dependencias de terceros` obliga a declararlo aunque la respuesta sea cero, y
aquí lo es: **esta feature no propone ninguna librería nueva y no toca `package.json`**.

- El **envío** usa `resend`, ya aprobada, ya instalada y con su fila en `docs/dependencias.md` (QC-79).
- El **secreto y su huella**, `node:crypto` (el runtime).
- La **validación**, `zod`, incluida su comprobación de correo: no se escribe ninguna expresión
  regular propia, que es justo lo que la regla «no reimplementes lo que ya resuelve una librería»
  prohíbe.
- El **hashing**, `bcryptjs` desde QC-5.
- El **límite por correo** es una consulta `count` sobre una tabla que ya existe (§ 6.3): no entra
  ninguna librería de *rate limiting* ni ninguna caché. Si hiciera falta una, sería **QC-73**, que es
  quien trae el mecanismo general — y su elección es de esa ficha, no de ésta.

`tests/guards/guard-dependencias-aprobadas.test.ts` lo hace cumplir sin que haya que hacer nada.

---

## 11. Consecuencias aceptadas

1. **El presupuesto de tiempo hace más lenta a propósito una pantalla** (~700 ms mínimos). Es el
   precio literal de la decisión 2 y solo lo paga esta pantalla.
2. **Un correo puede perderse** si el proveedor tarda más que el presupuesto y la función se congela
   (§ 6.2). Remedio: volver a pedirlo.
3. **El tope se puede exceder en uno** bajo concurrencia exacta (§ 6.3).
4. ~~**Consumo y escritura de la credencial dejan de ser una sola transacción** en el camino de
   recuperación, con una ventana que falla del lado seguro.~~ **Ya no aplica** tras la enmienda del
   2026-09-12: el corte de sesiones es una columna del mismo `UPDATE`, así que el camino de
   recuperación es **una sola transacción**, igual que el de alta de QC-79 (§ 7.2).
5. **Una cuenta bloqueada temporalmente por intentos fallidos no puede recuperar** hasta que el plazo
   venza, porque R9 usa el **estado efectivo** de QC-78. Es incómodo justo para quien más lo
   necesita —quien olvidó la contraseña suele ser quien falló cinco veces—, y aun así se elige así
   por dos razones: la decisión 3 dice «solo `active`», y QC-78 R7 exige que **todos** los lectores
   pasen por la misma función; leer la columna cruda sería crear una segunda verdad sobre «está
   activa». El bloqueo automático caduca solo. Si el humano quiere lo contrario, es cambiar R9 y su
   test — sin migración.
6. **La tabla crece un poco más** (una fila por solicitud concedida, ~200 bytes). Sigue sin haber
   limpieza, y sigue sin ficha, igual que anotó QC-79 § 10.3.

---

## 12. Alternativas descartadas

### 12.1 Una tabla propia de tokens de recuperación — descartada (y por decisión cerrada)

Sería lo «limpio»: cada flujo con su tabla, cada una con su plazo y su semántica. Se descarta porque
**la decisión cerrada 6 dice lo contrario**, y porque el coste real es alto: duplicaría el índice
parcial de «uno vivo por persona», el uso único, la huella, el adaptador y sus tests, y crearía **dos
sitios** donde arreglar el día que se encuentre un fallo en el mecanismo del token. La columna de
propósito cuesta una migración de una línea.

### 12.2 Guardar el contador del límite en memoria del proceso — descartada

Es lo más barato de escribir (un `Map` con ventana deslizante) y es **falso** en producción: con
varias instancias en Vercel cada una tendría su contador, así que el tope real sería N × tope, y un
despliegue o un arranque en frío lo borraría entero. Contradice R18 de frente. La tabla que ya existe
no tiene ninguno de los dos problemas.

### 12.3 Un contador por **dirección de correo**, incluidas las que no existen — descartada

Es la lectura literal de «límite por correo» y es **exactamente cómo se fabrica un oráculo**: obliga a
guardar en algún sitio las direcciones probadas —un registro de correos que alguien escribió, que es
PII que hoy no existe— y, sobre todo, crea un estado consultable que difiere entre direcciones reales
e inventadas. Basta con que ese estado exista para que mañana alguien lo exponga en una pantalla de
administración o en una métrica. Se descarta: § 6.3 punto 2.

### 12.4 Responder distinto según exista o no la dirección — descartada por el humano

Consta para que no se reconsidere: es la decisión cerrada 2, y es **la** razón de ser de la ficha.
Distinguir convierte la pantalla de acceso en un directorio de empleados consultable desde internet.

### 12.5 Esperar al proveedor de correo antes de responder — descartada

Es lo natural y es una fuga: la rama «la cuenta existe» incluiría una llamada de red a un tercero y la
otra no, así que la diferencia de tiempos sería de **cientos de milisegundos** y trivial de medir.
Anula la mitad de la decisión 2. Se descarta en favor del presupuesto de § 6.2, asumiendo la
consecuencia 2 de § 11.

### 12.6 Que la recuperación inicie sesión al terminar — descartada

Ahorra un paso. Fabricaría una sesión desde una superficie pública a partir de un secreto que pudo
llegar por un correo reenviado o leído por otro, y encima justo después de cerrar **todas** las
sesiones por desconfianza (R27): abrir una acto seguido contradice el motivo por el que se cerraron.
Mismo criterio que QC-79 § 11.5.

### 12.7 Que la página valide el enlace al pintarse — descartada

Mismo argumento que QC-79 § 11.4, y aquí **más fuerte**: convertiría la página en un oráculo de prueba
de secretos sin coste y crearía un segundo camino de comprobación que puede divergir del `UPDATE`
condicional. La comprobación ocurre **una sola vez**, donde se escribe.

### 12.8 Invocar `endAllSessions` de QC-23 con un actor fabricado — descartada (enmienda 2026-09-12)

Sustituye a la alternativa que había aquí antes («un adaptador provisional del puerto de sesiones que
no revoque nada»), que dejó de existir junto con el puerto.

Al ver que `endAllSessions(actor, targetUserId)` exige actor, la salida rápida sería fabricar uno
—«el sistema», con `usuarios.modificar` y la empresa del usuario objetivo— y llamarlo. Se descarta por
tres motivos, cualquiera de ellos suficiente:

1. **Pondría un actor con permiso de administrador en el único camino público y sin sesión del ERP.**
   La autorización-en-primera-línea de QC-23 (su R27) existe precisamente para que eso no se pueda
   hacer, y un actor sintético la convierte en decorado.
2. **Serían dos transacciones sobre la misma fila**: la del hash y la del sello, con la ventana que
   la decisión cerrada 2 de QC-23 prohíbe por escrito en el mensaje de remedio de su guardia.
3. **No hace falta.** El sello en el mismo `SET` consigue lo mismo, es atómico y ya está vigilado.

Y la variante «ampliar QC-23 con un `endAllSessionsWithoutActor`» tampoco: sería pedir una puerta sin
autorización a la ficha cuyo requisito es que no la haya, para un efecto que la escritura ya produce.

### 12.9 Pedir también el nombre de usuario o la empresa en el formulario — descartada

Resolvería P1 sin ambigüedad. Se descarta: quien olvidó su contraseña a menudo ha olvidado también su
nombre de usuario, y pedir la empresa obliga a **listarlas** —o a confirmar cuál existe—, que es otro
oráculo, esta vez de empresas. La ambigüedad se resuelve enviando a todas (R10), que no filtra nada.

---

## 13. Preguntas abiertas que deja este diseño

**Queda una: P1** (un correo que existe en dos empresas). No bloquea escribir el código —su respuesta
propuesta es **R10**, ya redactada como requisito— y cambiarla cuesta R10, su test y una línea del
`WHERE`, sin migración.

- **P2** (el tope y la ventana) la cerró el humano el 2026-09-12: **3 por hora**, que es lo que R17
  ya decía.
- **P3** (la firma con la que se invoca QC-23) la cierra la **enmienda del 2026-09-12**, leyendo
  QC-23 en disco: **no se invoca nada**, el corte llega por la regla de escritura (§ 7). Con ella
  desaparece lo que sí bloqueaba cerrar la feature; ya no hay ninguna task a la espera de un
  contrato ajeno.
