# QC-65 — estado-de-cuenta-de-usuario · design.md

> Zona `backend` · complejidad `low` · depende de QC-47 (la empresa ya es columna de `users`).
> Requisitos en `requirements.md`. El **Alcance** y la tabla de **Decisiones cerradas** de ese
> archivo los fijó el humano y aquí no se reabren: este documento solo dice CÓMO.

---

## 0. Qué cambia, en una frase

`users` gana **un tipo enumerado y tres columnas** —el estado, cuándo cambió y quién lo cambió—,
más su migración con `down.sql`, más la constante del dominio que es la única definición del
conjunto de valores, más el estado explícito del administrador que crea el seed. **Nada lee el
estado** (R19).

Lo que NO se toca, escrito para que quede en el diff de nadie: `verify-credentials.ts`,
`account-lock.ts`, `failed_login_attempts` / `lock_level` / `locked_until`, `deleted_at`, los
tres índices únicos de `users`, el RLS, `middleware.ts`, la sesión y toda la UI.

---

## 1. Modelo de datos

### 1.1 El conjunto cerrado: un `enum` de Postgres

```prisma
/// Estado de la cuenta de un usuario (QC-65, decisiones cerradas 1 y 2). Conjunto CERRADO en
/// el propio esquema: anadir un quinto valor es una migracion (`ALTER TYPE ... ADD VALUE`), y
/// el humano lo asumio a conciencia — este conjunto NO tiene que crecer sin desplegar.
/// Se aparta del precedente de `DocumentType` (QC-4) y del catalogo `Unit` (QC-32), que son
/// TABLAS porque debian crecer con un INSERT; sigue el de `OrderStatus` (QC-33).
///
/// Los valores van en INGLES y en minuscula, literalmente como los fijo la decision cerrada 1.
/// Se apartan de `OrderStatus`/`OrderPriority`, que son MAYUSCULAS en espanol, a proposito:
/// la decision escribe los cuatro nombres, y tener una segunda grafia («ACTIVE» en el codigo,
/// «active» en la ficha) es exactamente la clase de traduccion silenciosa que se desincroniza.
///
/// QUE SIGNIFICA CADA UNO (decision cerrada 2):
///   active   — la cuenta funciona.
///   pending  — creada, aun no habilitada para entrar.
///   inactive — apagada a proposito por un administrador. REVERSIBLE.
///   blocked  — bloqueada por seguridad. Es LA MISMA COSA que el bloqueo por intentos
///              fallidos de QC-19, pero QC-65 no los unifica: eso es QC-78.
/// NADIE lee todavia este valor para decidir nada (R19).
enum UserAccountStatus {
  active
  pending
  inactive
  blocked
}
```

El orden de declaración **no significa nada** aquí (a diferencia de `OrderPriority`, donde sí),
pero se escribe en el mismo orden que la decisión cerrada 1 para que el test que compara la
lista del dominio con la del esquema pueda ser una igualdad ordenada y no un conjunto.

### 1.2 Las tres columnas de `users`

```prisma
  /// QC-65 (R1, R5). Estado de la cuenta. NOT NULL con `@default(pending)`: una cuenta nueva
  /// nace PENDIENTE (decision cerrada 3), y la migracion deja en `active` a las filas que ya
  /// existian (R6). SIN indice a proposito: hoy no hay ninguna consulta que filtre por el
  /// (R19); el que haga falta lo anade quien estrene la consulta (QC-67).
  accountStatus          UserAccountStatus @default(pending) @map("account_status")

  /// QC-65 (R8, R9). CUANDO cambio el estado por ultima vez. NOT NULL con `@default(now())`:
  /// en una fila recien creada vale lo mismo que `createdAt`, y eso es correcto — el estado
  /// cambio, de nada a `pending`, en ese instante.
  accountStatusChangedAt DateTime          @default(now()) @map("account_status_changed_at") @db.Timestamptz(6)

  /// QC-65 (R10, R11, R12). QUIEN lo cambio. OPCIONAL: NULL significa «lo cambio el sistema,
  /// no una persona» —el backfill de la migracion, el seed, y manana el bloqueo automatico de
  /// QC-19 cuando QC-78 lo unifique—, nunca «se perdio el dato».
  ///
  /// OJO — es un ESCALAR uuid SIN `@relation`, y es deliberado (`design.md > 1.3`). La FK real
  /// (`users_account_status_changed_by_fkey`, ON DELETE RESTRICT ON UPDATE CASCADE) vive
  /// escrita A MANO en la migracion. Es DRIFT para Prisma: toda migracion futura de `users`
  /// hay que revisarla a mano para que no emita su `DROP CONSTRAINT`, igual que ya pasa con
  /// los tres indices unicos funcionales de QC-4.
  accountStatusChangedBy String?           @map("account_status_changed_by") @db.Uuid
```

Y el índice del lado hijo de la FK, que Postgres no crea solo:
`@@index([accountStatusChangedBy], map: "users_account_status_changed_by_idx")`.

**No hay historial** (R13): tres columnas sobre la propia fila, como `failed_login_attempts` o
`must_change_credential`. Es estado actual, no hecho histórico.

### 1.3 Por qué `account_status_changed_by` es escalar y no una relación Prisma

Es una auto-referencia dentro de `users`, o sea dentro del mismo módulo: por
`docs/architecture.md` no hay frontera de módulo que proteger y, en principio, tocaría dejar
que Prisma genere la FK (es el argumento con el que QC-47 justificó `@relation` hacia
`Company`). **Aun así se elige el escalar**, por dos razones concretas:

1. **Rompería una guardia ajena.** `tests/unit/proveedores/module-contract.test.ts` afirma dos
   veces `expect(relationTargets('User')).toEqual(['Company', 'DocumentType', 'Role'])`, una
   igualdad **exacta** sobre el conjunto de relaciones de `User`. Una auto-relación mete `User`
   en esa lista y pone en rojo un test de otra feature que no tiene nada que ver con esta —y
   retensarlo sería relajarlo, porque su sujeto es «`User` no gana relaciones nuevas».
2. **Una auto-relación obliga a declarar el lado inverso** (`accountStatusChangesMade User[]`,
   con `@relation` nombrada) que nadie consulta, y habilita `include` desde cualquier lectura de
   usuario: una puerta abierta para que QC-66/QC-67 arrastren la ficha entera del autor sin
   quererlo.

Coste que se acepta y se escribe: la FK queda como **drift** para Prisma. Se mitiga con el
comentario `OJO` del esquema (arriba) y con el test estático de la migración (§5.2), que es lo
mismo que ya se hace con `products.created_by`, `recipes.created_by` y las cuatro FK a mano de
`supplier_catalog_lines`.

### 1.4 RLS

`users` ya está con `ENABLE` **y** `FORCE ROW LEVEL SECURITY` desde QC-4, y añadir columnas no
lo altera. La migración **no toca** el RLS y `tests/guards/guard-rls-force.test.ts` sigue
mandando (R17).

### 1.5 Aislamiento por empresa

No aplica: `users` es una de las **tres tablas exentas** de la columna de empresa
(`docs/architecture.md > Dominio`, n.º 1), y además ya tiene `company_id` desde QC-47. Esta
ficha no añade ninguna tabla.

---

## 2. El dominio: una sola definición del conjunto

`lib/modules/identity/domain/account-status.ts` (nuevo, dominio puro, sin framework ni Prisma):

```ts
export const USER_ACCOUNT_STATUSES = ['active', 'pending', 'inactive', 'blocked'] as const;
export type UserAccountStatus = (typeof USER_ACCOUNT_STATUSES)[number];

/** Estado con el que NACE una cuenta nueva (decision cerrada 3). */
export const INITIAL_USER_ACCOUNT_STATUS: UserAccountStatus = 'pending';

/** Estado del administrador que crea el seed (decision cerrada 4). NO es el default. */
export const SEED_ADMIN_ACCOUNT_STATUS: UserAccountStatus = 'active';
```

Se reexporta desde `lib/modules/identity/index.ts` (el contrato). Es dominio puro: no arrastra
servidor, así que el contrato sigue importable desde un componente de cliente.

**Por qué existe si nadie lo lee todavía** (y no es sobre-ingeniería): es el sujeto de R3 y de
R7. Sin él, la lista de cuatro valores viviría solo en el esquema y el `SEED_ADMIN_...` sería un
literal suelto dentro del adaptador del seed; con él, el test puede comparar la lista de
TypeScript contra el `enum` del esquema y contra el SQL de la migración, que es el mismo patrón
con el que `INITIAL_COMPANY_NAME` (QC-47) y `DOCUMENT_TYPE_CODES` (QC-4) vigilan sus literales.

**Lo que este archivo NO contiene**: ninguna función de transición, ningún `canTransition`,
ningún `isLoginAllowed`. Eso es QC-66 y QC-78 (R14, R19).

---

## 3. La migración

Carpeta `db/migrations/<ts>_user_account_status/`, generada con
`pnpm run db:migrate:create` y **completada a mano** (el backfill y la FK no salen del esquema).

### 3.1 `migration.sql` (UP), en este orden

1. `CREATE TYPE "UserAccountStatus" AS ENUM ('active', 'pending', 'inactive', 'blocked');`
   — lo emite Prisma.
2. `ALTER TABLE "users" ADD COLUMN "account_status" "UserAccountStatus" NOT NULL DEFAULT 'pending', ADD COLUMN "account_status_changed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP, ADD COLUMN "account_status_changed_by" UUID;`
   — lo emite Prisma. Las filas que ya existen se rellenan con los defaults: `pending`.
3. **Backfill, a mano (R6):** `UPDATE "users" SET "account_status" = 'active';` — SIN `WHERE`:
   **también** las filas con `deleted_at` no nulo. `account_status_changed_by` se queda NULL a
   propósito: la migración es «el sistema» (R10).
4. **FK a mano (R11, R12):**
   `ALTER TABLE "users" ADD CONSTRAINT "users_account_status_changed_by_fkey" FOREIGN KEY ("account_status_changed_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;`
5. `CREATE INDEX "users_account_status_changed_by_idx" ON "users"("account_status_changed_by");`
6. **Borrar a mano** cualquier `DROP CONSTRAINT` / `DROP INDEX` que
   `prisma migrate dev --create-only` haya emitido por drift sobre otras tablas
   (`products`, `recipes`, `recipe_lines`, `suppliers`, `supplier_catalog_lines`, `orders`,
   `units`): es lo que pasa siempre en este repo y ya mordió en QC-47.

**Por qué el backfill va en el paso 3 y no antes**: la columna tiene que existir. Y por qué el
`DEFAULT 'pending'` se deja puesto después del backfill: es el valor de las filas **nuevas**
(R5), no el de las viejas; las dos cosas conviven sin contradecirse porque el `UPDATE` posterior
solo alcanza a lo que ya estaba.

**Sobre `FORCE ROW LEVEL SECURITY` y el backfill**: QC-47 ya se hizo esta pregunta (su T5) y la
respuesta quedó escrita en `progress/impl_QC-47-...md`. Se **relee** antes de escribir el UP en
vez de asumirla (T3 de `tasks.md`); si allí dijera que el `UPDATE` no pasa, se aplica la misma
salida que aplicó QC-47 y se anota. No se elige a ciegas.

### 3.2 `down.sql` (DOWN), en orden inverso (R17)

```sql
DROP INDEX IF EXISTS "users_account_status_changed_by_idx";
ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_account_status_changed_by_fkey";
ALTER TABLE "users"
  DROP COLUMN IF EXISTS "account_status_changed_by",
  DROP COLUMN IF EXISTS "account_status_changed_at",
  DROP COLUMN IF EXISTS "account_status";
DROP TYPE IF EXISTS "UserAccountStatus";
```

El `DROP TYPE` va **el último**: Postgres lo rechaza mientras una columna dependa del tipo (es
literalmente lo que documenta el `down.sql` de `20260903191204_orders`). El DOWN **no menciona**
`deleted_at`, ni los tres índices únicos, ni el RLS, ni ninguna columna de QC-19: el UP tampoco
los tocó.

---

## 4. El seed (R7) — y por qué es la parte peligrosa

Sobre una instalación **nueva** el orden es: migrar (no hay usuarios, el backfill de §3.1 no
alcanza a nadie) → sembrar. El administrador inicial se crea **después**, así que se llevaría el
`DEFAULT 'pending'` y quedaría fuera del sistema en cuanto QC-78 corte el login por estado. La
decisión cerrada 4 dice exactamente lo contrario: el usuario del seed de QC-6 tiene que seguir
entrando.

Por eso el seed escribe el estado **explícito**, no heredado del default:

- `lib/modules/identity/ports/initial-access-repository.ts`: `createInitialAdmin` gana
  `accountStatus: UserAccountStatus` en su entrada. **Obligatorio**, no opcional: un puerto que
  permitiera omitirlo devolvería el agujero por la puerta de atrás.
- `lib/modules/identity/domain/seed-initial-access.ts`: pasa `SEED_ADMIN_ACCOUNT_STATUS`.
- `.../adapters/driven/persistence/initial-access-repository-prisma.ts`: lo escribe como una
  columna más del mismo `user.create`, en la misma sentencia y la misma transacción — igual que
  `roleId`, `companyId` y `mustChangeCredential` (QC-47 R20). No hay ningún instante en el que
  la fila exista sin estado.
- `accountStatusChangedBy` se deja **sin escribir** (NULL): lo puso el sistema (R10).
- `scripts/seed.ts` **no cambia**: `SeedOutcome` queda igual.

---

## 5. Verificación

### 5.1 Contratos de entrada/salida

**Ninguno.** Esta feature no expone ruta, ni endpoint, ni Server Action, ni componente (R20).
Su superficie pública son tres columnas, un tipo de Postgres y tres símbolos del contrato de
`identity`. Se dice explícitamente para que el reviewer no busque lo que no hay.

### 5.2 Tests previstos (el mapa completo lo cierra el implementer)

| Nivel | Archivo | Qué demuestra |
|---|---|---|
| Unit (esquema) | `tests/unit/identity/schema/account-status-schema.test.ts` (nuevo) | R1, R3, R4, R5, R8, R10, R13: el `enum` del esquema es **igual** a `USER_ACCOUNT_STATUSES` importado de verdad; las tres columnas con su `@map`, su tipo, su default y su opcionalidad; `accountStatusChangedBy` **no** es campo de relación en el dmmf; `relationTargets('User')` sigue siendo `['Company','DocumentType','Role']`; el esquema no gana ninguna tabla ni columna de historial. |
| Unit (migración) | `tests/unit/identity/schema/account-status-migration.test.ts` (nuevo) | R2, R4, R6, R9, R11, R12, R17: predicados puros sobre el texto del `migration.sql` y del `down.sql` —los cuatro valores del `CREATE TYPE` comparados contra la constante del dominio, el `UPDATE ... SET account_status='active'` **sin `WHERE`** y después del `ADD COLUMN`, la FK con `RESTRICT`, el índice, el orden del DOWN con el `DROP TYPE` al final—, y que el UP **no** ejecuta DDL sobre ninguna tabla de otro módulo ni sobre el RLS. Cada aserción se aplica también a una copia **mutada en memoria**, para probar que puede caer (patrón de `companies-migration.test.ts`). |
| Unit (seed) | `tests/unit/identity/seed/seed-initial-access.test.ts` (existente) | R7: con dobles del puerto, `createInitialAdmin` recibe `accountStatus: 'active'` y **no** el default. |
| Integración | `tests/integration/identity/identity-constraints.int.test.ts` (existente) | R2 (valor inválido → `22P02`), R5 (alta sin estado → `pending`), R9 (el instante se rellena solo), R11 (autor inexistente → `23503`), R12 (`DELETE` del autor → `23503`), R14 (`blocked` → `active` es un `UPDATE` normal), R15 (dos usuarios `inactive` no pueden repetir correo/username/documento en la misma empresa, y sí en distinta), R16 (dar de baja no cambia el estado y el estado no cambia la baja). Cada caso dentro de una transacción que acaba en `ROLLBACK`. |
| Integración | `tests/integration/identity/identity-seed.int.test.ts` (existente) | R7 contra Postgres real: tras sembrar, el administrador está en `active` con autor NULL. |
| Unit (alcance) | `tests/unit/identity/account-status-scope.test.ts` (nuevo) | R18, R19, R20, R21: `verify-credentials.ts` y `account-lock.ts` no mencionan el estado; ningún archivo de `lib/`, `app/`, `components/`, `middleware.ts` lee `accountStatus`/`account_status` fuera del esquema, la migración, el dominio nuevo y el seed; no hay adaptador driving, ruta ni pantalla nueva; el diff no toca `package.json` ni `pnpm-lock.yaml`. |

**E2E: ninguno nuevo.** `CHECKPOINTS.md` lo pide para flujos críticos, y el login **es** uno —
pero esta ficha no cambia el comportamiento del login ni de ninguna pantalla (R19). Lo que sí
hay que comprobar es que los E2E que ya existen (`login`, `session`) **siguen verdes**: los
fixtures crean usuarios sin estado y ahora nacerían `pending`, cosa que hoy no impide entrar
pero conviene ver corriendo, no razonando. Es la task T9.

### 5.3 Guardias ajenas que hay que **retensar** (no relajar)

Dos tests de otras features llevan congelada la foto de las columnas de `User` y se pondrán
rojos con las tres nuevas. Se actualizan a la verdad nueva, y cada cambio se anota en la
bitácora para que el reviewer los mire uno a uno (tocar la guardia de otra feature siempre
merece un segundo par de ojos):

| Archivo | Qué afirma hoy | Qué pasa a afirmar |
|---|---|---|
| `tests/unit/identity/credential-policy-contract.test.ts` | censo exacto de los campos de `model User` (QC-19 R21: «esta feature no añade columnas») | el mismo censo **más** los tres campos nuevos, con el comentario de por qué entraron (QC-65) — sigue siendo igualdad exacta |
| `tests/unit/identity/schema/identity-schema.test.ts` | lista exacta de escalares de `User` (`BUSINESS_FIELDS` + `roleId` + `companyId` + fechas + `LOCKOUT_FIELDS` + `SEED_FIELDS`) | un bloque nuevo `ACCOUNT_STATUS_FIELDS` sumado a esa lista, en el mismo estilo que `LOCKOUT_FIELDS` |

`tests/unit/proveedores/module-contract.test.ts` **no se toca**: es justo el que se protege
eligiendo el escalar (§1.3), y si hubiera que tocarlo, sería la señal de que el diseño se
desvió.

---

## 6. Alternativas descartadas

**A. `TEXT` + `CHECK (account_status IN (...))` en vez de `enum` de Postgres.** *Descartada.*
Añadir un quinto valor sería `ALTER TABLE ... DROP CONSTRAINT` + `ADD CONSTRAINT` en vez de
`ALTER TYPE ... ADD VALUE`, o sea igual de migración; a cambio, la columna aceptaría cualquier
texto si alguien deja caer el CHECK, y no habría tipo que el cliente Prisma pueda reflejar como
unión de literales. El `enum` da tipado en TypeScript **gratis** y rechaza el valor inválido con
un `22P02` antes de llegar a la fila (R2). Es además el precedente vivo del repo (`OrderStatus`,
QC-33) para el caso «conjunto cerrado que NO debe crecer sin migrar», que es literalmente lo que
dice la decisión cerrada 1.

**B. Tabla catálogo `account_statuses` con FK, como `document_types` (QC-4) o `units` (QC-32).**
*Descartada.* Ese patrón existe para conjuntos que **deben** poder crecer con un `INSERT`, sin
desplegar. La decisión cerrada 1 dice lo contrario con todas las letras: «un quinto valor
entraría por migración; no se diseña para crecer sin migrar». Una tabla añadiría un `JOIN` a
toda lectura futura de usuario y una tabla de sistema más que mantener, para comprar una
flexibilidad que el humano rechazó.

**C. Auto-relación Prisma para `account_status_changed_by`.** *Descartada*, con su porqué
completo en §1.3: rompe la igualdad exacta de `relationTargets('User')` en la guardia de
`proveedores` y abre `include` hacia la ficha del autor. Se paga con drift, y el drift se vigila
con el test estático de §5.2.

**D. Un booleano `is_enabled` (lo que decía la descripción original del board).** *Descartada
por el humano* antes del spec (decisiones cerradas 1 y 3), no por este diseño. Se anota aquí
porque la tarjeta vieja sigue circulando: quien la lea verá «nace habilitada» y cuatro valores
donde esperaba dos.

**E. Tabla de historial de cambios de estado.** *Descartada.* La decisión cerrada 5 lo dice:
«No es un historial: solo el último cambio». Tres columnas sobre la propia fila, como
`failed_login_attempts` y `must_change_credential`. Si algún día hace falta la auditoría
completa, es ficha propia y una tabla nueva; retrofitearla no cuesta migrar datos, porque el
rastro actual seguiría siendo válido.

**F. Índice sobre `account_status`.** *Descartada por ahora.* Nadie consulta por estado (R19):
sería un índice para una query que no existe, que es la definición de infraestructura «por si
acaso» que `docs/architecture.md > Dominio` rechaza. Lo añade, con su forma y su parcialidad,
quien estrene la consulta — el listado de QC-67.

---

## 7. Dependencias de terceros

**Ninguna nueva** (R21). Todo lo que esta ficha necesita —Prisma, el `enum` de Postgres, vitest—
ya está en `docs/dependencias.md`. No hay ninguna propuesta que aprobar junto con el spec
(`docs/architecture.md > Dependencias de terceros`).

---

## 8. Riesgos

1. **El seed en instalación nueva** (§4). Es el riesgo n.º 1 y el único que puede cerrar el
   sistema sobre sí mismo, pero **solo cuando QC-78 corte el login por estado**: si aquí se
   olvida el `SEED_ADMIN_ACCOUNT_STATUS`, hoy no se nota nada —todo pasa en verde— y el fallo
   aparece semanas después, en otra feature. Por eso R7 es un requisito con nombre y tiene test
   unitario **y** de integración.
2. **`prisma migrate dev --create-only` emite `DROP` de todo el drift del repo** (las FK a mano
   de `products`, `recipes`, `orders`, `supplier_catalog_lines`, los índices funcionales de
   `users`, el disparador de `units`). Si uno se cuela, el esquema sigue validando, el cliente
   compila y la suite pasa. Mitigación: paso 6 del §3.1 y el test estático de §5.2.
3. **Las dos guardias ajenas de §5.3** se pueden «arreglar» relajándolas (cambiar la igualdad
   exacta por un `toContain`) en vez de retensarlas. Sería perder la protección de QC-19 y QC-4
   a cambio de un verde. El reviewer las mira una a una.
4. **La grafía en minúscula del `enum`** se aparta de `OrderStatus`. Alguien puede «normalizarla»
   a mayúsculas en una feature posterior, y eso sería una migración del tipo (no un rename
   cosmético) más una divergencia con la decisión cerrada 1. Queda escrita en el comentario del
   esquema.
5. **La FK auto-referencial con `RESTRICT`** hace que un `DELETE` físico de un usuario que fue
   autor de un cambio de estado falle. En este repo el borrado es lógico y eso es deseado (R12),
   pero **puede morder a un fixture de test que barra usuarios con `deleteMany` en su
   `afterAll`**: si el barrido borra en el orden equivocado, choca. Mitigación: T8 revisa los
   fixtures de integración/E2E que crean y borran usuarios.
