# QC-78 — estado-de-cuenta-en-el-acceso · design.md

> Zona: `backend` · depends_on: `QC-65` (cerrada, PR #48, merge `c640c7a`) ·
> Rama: `feature/QC-78-estado-de-cuenta-en-el-acceso`
>
> Cubre `requirements.md` R1–R28, más R29 y R30 (ampliación del 2026-09-10, sección 10). Módulo
> `identity`, arquitectura hexagonal de
> `docs/architecture.md`: el dominio no conoce Prisma, `next/*` ni `lib/shared/**`, y nada de
> fuera del módulo importa por ruta profunda.

## 0. Punto de partida medido (y un aviso de contexto)

Lo que ya existe y esta ficha reutiliza sin tocarlo:

- `lib/modules/identity/domain/account-lock.ts` — `MAX_FAILED_ATTEMPTS = 5`,
  `LOCK_DURATIONS_MS` (1/5/15/60 min), `isLocked(state, now)`, `nextLockState(state, outcome, now)`
  y el tipo `AccountLockState = { failedAttempts, lockLevel, lockedUntil }`. **La política de
  escalada no se toca** (R14).
- `lib/modules/identity/domain/verify-credentials.ts` — el caso de uso de login, con el corte de
  «empresa dada de baja» de QC-48 como precedente exacto de dónde va un corte y por qué, y el
  objeto `REJECTED` congelado y compartido (R3).
- `lib/modules/identity/domain/resolve-session.ts` — la cadena única de cortes de «hay sesión»,
  que ya relee la ficha del usuario en cada petición con **una sola** consulta.
- `lib/modules/identity/domain/account-status.ts` — lo que dejó QC-65: los cuatro valores del
  estado y sus constantes.
- Columnas de QC-65, ya migradas: `account_status` (enum `UserAccountStatus`),
  `account_status_changed_at` (NOT NULL, `DEFAULT now()`, **sin** `@updatedAt`) y
  `account_status_changed_by` (nullable, FK a `users`; vacío = lo hizo el sistema).

> **Aviso de contexto, no invención (regla 6).** El árbol principal desde el que se escribió este
> spec está en la rama de QC-65 **anterior al merge**, así que `account-status.ts` todavía no
> aparece en él; los datos de arriba salen de `progress/history.md` (entrada de QC-65 del
> 2026-09-08) y del `requirements.md` de QC-65, no de suposiciones. **Los nombres exactos de los
> símbolos exportados por `account-status.ts` (constantes y tipo) se leen del archivo real en
> `dev` al implementar; este diseño los referencia por su papel, no por un identificador
> inventado.** Si algún nombre no existiera tal cual, se usa el real: no se crea un alias.

## 1. La pieza nueva: el estado efectivo, en un solo sitio

Archivo nuevo: **`lib/modules/identity/domain/effective-account-status.ts`**. Dominio puro, sin
reloj propio (`now` por parámetro), sin framework y sin Prisma. Tres funciones y nada más:

```ts
type AccountStatusView = { accountStatus: AccountStatus; lockedUntil: Date | null };

// R7–R12. Total: para cualquier par (estado almacenado, plazo) devuelve un estado efectivo.
effectiveAccountStatus(view: AccountStatusView, now: Date): AccountStatus;

// R13, R15, R16. Qué estado corresponde persistir tras un intento, dado el estado ALMACENADO y
// el estado de bloqueo que ya calculó `nextLockState`. Devuelve `null` cuando no hay que tocar
// la columna (R17).
accountStatusAfterAttempt(stored: AccountStatus, next: AccountLockState): AccountStatus | null;

// R24. El estado de bloqueo que corresponde a una cuenta que sale de `blocked`.
clearedLockState(): AccountLockState;   // { failedAttempts: 0, lockLevel: 0, lockedUntil: null }
```

Reglas, todas testeables con objetos planos:

| Estado almacenado | `locked_until` | Estado efectivo | Requisito |
|---|---|---|---|
| `blocked` | futuro | `blocked` | R10 |
| `blocked` | vacío | `blocked` (administrativo, no caduca) | R9 |
| `blocked` | pasado | `active` | R8 |
| `active` | futuro | `blocked` (fila bloqueada por QC-19 antes de esta ficha) | R11 |
| `active` | vacío o pasado | `active` | — |
| `pending` / `inactive` | cualquiera | el mismo valor | R12 |

`effectiveAccountStatus` usa `isLocked` de `account-lock.ts` para la parte del plazo: **la
comparación de plazos sigue teniendo una sola implementación**.

`accountStatusAfterAttempt` es la otra mitad de R14 —el estado de cuenta se **deriva** del estado
de bloqueo, no se decide aparte—:

- `next.lockedUntil !== null` → `blocked` si el almacenado no lo era ya; `null` si ya lo era (R17).
- `next.lockedUntil === null` y almacenado `blocked` → `active` (R15: esto es lo que impide que un
  fallo suelto sobre un bloqueo ya caducado deje la fila en `blocked` con plazo vacío, que R9 lee
  como «bloqueo administrativo eterno»).
- resto → `null`, no se toca la columna (R17).

`pending` e `inactive` nunca llegan a esta función: el corte de R5 les cierra el paso antes.

### Alternativa descartada — meter las funciones en `account-status.ts` (el archivo de QC-65)

Descartada por dos motivos: (a) `account-status.ts` es el **catálogo** de valores, y mezclar allí
una política que depende del reloj y del bloqueo lo convierte en dos cosas; (b) QC-66
(`crud-de-usuarios`) es la siguiente ficha de la épica y va a tocar ese archivo — un archivo nuevo
deja el diff sin intersección. Coste aceptado: un archivo más en `domain/`.

### Alternativa descartada — calcular el estado efectivo en SQL (`CASE WHEN ... THEN 'active'`)

Es tentador porque «corrige la ficha al leerla» sin código nuevo. Descartada: la regla quedaría
**dos veces** (la consulta del login y la de la sesión son distintas: `$queryRaw` una, API tipada
la otra), solo se podría afirmar contra Postgres y no con objetos planos, y contradice el
precedente escrito en `user-credentials-prisma.ts` para el corte de empresa —«una regla de acceso
escondida en un `WHERE` solo se puede afirmar contra Postgres»—. R7 exige un único sitio, y ese
sitio es el dominio.

### Alternativa descartada — escribir la corrección al leer (un `UPDATE` en el camino de lectura)

«Blocked con plazo vencido → escribir `active` en cuanto alguien lo lea» dejaría la fila siempre
coherente. Descartada: convertiría la resolución de sesión —que corre en **cada petición** de la
zona privada— en un camino de escritura, y el login en un camino que escribe antes de saber si la
contraseña es correcta. R21 lo prohíbe explícitamente. La fila se corrige en el camino de
escritura que ya existe (R15, R16); mientras tanto, todo lector ve `active` porque pasa por
`effectiveAccountStatus`.

## 2. Login: `verify-credentials.ts`

Orden final de la función (lo nuevo en **negrita**):

1. `safeParse` de la entrada → `REJECTED` sin tocar puertos.
2. `now = new Date()` — un solo reloj por invocación.
3. `findActiveByUsername` (una consulta).
4. Usuario inexistente → verificación contra el señuelo + `REJECTED`, sin escribir.
5. `hasher.verify(...)` — **exactamente una** verificación, en los tres caminos (R2).
6. **`const efectivo = effectiveAccountStatus(usuario, now); if (efectivo !== ACTIVE) return REJECTED;`**
   — sustituye al `if (isLocked(usuario, now))` actual, que queda **subsumido** por R10 y R11: una
   fila con plazo vigente da efectivo `blocked` diga lo que diga la columna. Sin escrituras (R6).
7. `!correcta` → `registrarFallo(...)` (bucle de `compareAndSet` ya existente).
8. Empresa dada de baja → `REJECTED` (QC-48, intacto).
9. Éxito: `attempts.set(...)` + `session.startSession(...)`.

**Por qué el corte va en 6 y no entre 7 y 8** (que es donde QC-48 puso el suyo): la decisión
cerrada del 2026-09-08 dice que `pending` e `inactive` **no escriben nada**, y ponerlo tras el
`!correcta` los haría sumar intentos. La asimetría con el corte de empresa es deliberada y se
anota en el propio comentario del archivo, junto a los tres motivos que ya explican el de QC-48.
Consecuencia asumida por escrito en la decisión: quien pruebe contraseñas contra una cuenta no
activa no se topa con un bloqueo. Lo que **no** cambia es el coste en tiempo: el corte va después
del hash, así que no hay oráculo de tiempo (R2), y el resultado es la misma instancia congelada
(R3).

`registrarFallo` gana dos cosas:

- pasa a `compareAndSet` el estado de cuenta esperado (el leído) y el que corresponde escribir
  (`accountStatusAfterAttempt`, que puede ser `null` = no tocar) — R13, R15, R17, R18;
- al releer la fila fresca tras perder la carrera, corta si `effectiveAccountStatus(fresco, now)`
  ya no es `active` (R19), además de los cortes que ya tenía (fila desaparecida o id distinto).

El camino de éxito llama a `attempts.set(usuario.id, nextLockState(usuario, 'success', now), accountStatusAfterAttempt(usuario.accountStatus, UNLOCKED))` → R16.

## 3. Puertos (contratos hacia adentro)

`lib/modules/identity/ports/user-credentials-reader.ts`:

```ts
export type AuthenticatableUser = {
  readonly id: string;
  readonly passwordHash: string;
  readonly roleName: string;
  readonly companyId: string;
  readonly companyDeletedAt: Date | null;
  readonly accountStatus: AccountStatus;   // NUEVO (R1)
} & AccountLockState;
```

Se trae el valor **crudo**, no un booleano `estaActiva` ya cocinado, por el mismo motivo escrito
para `companyDeletedAt`: «activa» es una regla de dominio y cocinarla al otro lado del puerto la
mudaría fuera del único sitio donde se prueba con objetos planos.

`lib/modules/identity/ports/login-attempt-recorder.ts`: las dos primitivas ganan un parámetro
final `estadoCuenta: AccountStatus | null`, donde `null` significa **no tocar la columna ni su
rastro** (R17). El nombre y la aridad cambian, no la semántica: el dominio sigue **calculando** y
el puerto solo persiste.

`lib/modules/identity/ports/session-user-reader.ts`: `SessionUserRecord` gana `accountStatus` y
`lockedUntil`. Coste declarado: el `select` de la sesión deja de ser tan estrecho como lo dejó
QC-8 R14 —sale una marca de tiempo más y un enum—; **ninguno de los dos es PII** y ninguno se
registra en un log, mismo argumento que aceptó QC-48 con `companyDeletedAt`. Sin `lockedUntil` no
se puede aplicar R7 en la sesión y habría que duplicar la traducción del plazo, que es justo lo
que R7 prohíbe.

### Alternativa descartada — un puerto nuevo `AccountStatusReader`

Un puerto propio para leer el estado sería más «limpio» conceptualmente y dejaría los puertos
existentes intactos. Descartado: sería **una consulta más por petición** en la ruta más caliente
de la aplicación, y R21 exige cero consultas nuevas. El estado es una columna de `users`, la
misma fila que las dos consultas ya leen.

## 4. Adaptadores driven (Prisma)

`lib/modules/identity/adapters/driven/persistence/user-credentials-prisma.ts`:

- `findActiveByUsername`: el `$queryRaw` gana `u.account_status` en el `SELECT` y la fila cruda
  gana su campo. **No** se añade nada al `WHERE`: el corte por estado es del dominio, igual que el
  de empresa. Sigue siendo una sola lectura, sin `JOIN` nuevo (es columna de `users`).
- `compareAndSetLoginAttempt`: el `where` gana `accountStatus: esperado` (R18) y el `data` gana
  `accountStatus`, `accountStatusChangedAt: now` y `accountStatusChangedBy: null` **solo cuando
  el parámetro no es `null`** (R13, R17). El predicado por rango de `locked_until` que evita el
  ABA se conserva **tal cual**: esta ficha no lo toca.
- `setLoginAttempt`: mismo tratamiento condicional del trío de columnas de estado (R16, R17).

`lib/modules/identity/adapters/driven/persistence/session-user-prisma.ts`: el `select` gana
`accountStatus: true` y `lockedUntil: true`. Sigue siendo **un solo** `findFirst` (R21).

**`lib/composition/index.ts` NO se toca.** El cableado es por nombre de función
(`compareAndSet: compareAndSetLoginAttempt`, `set: setLoginAttempt`, `findActiveById: ...`); al
cambiar la firma del puerto y la del adaptador en el mismo cambio, la comprobación estructural de
TypeScript sigue casando y el archivo de composición queda idéntico. Esto es deliberado: QC-83
(`in_progress`) declara ese archivo, y no cruzarse con él permite arrancar sin esperarla.

## 5. Sesión: `resolve-session.ts`

Se añade **un corte más** a la cadena, como sexto, justo detrás del de empresa no viva:

```ts
// 6. QC-78 R20 — el estado de cuenta ya no es `active`. Detrás del paso 3 porque necesita la
// fila, y con `if` propio y no combinado: cada corte tiene su test y su R<n>.
if (effectiveAccountStatus(record, now) !== ACCOUNT_STATUS_ACTIVE) return null;
```

Salida por `null`, el mismo camino de siempre: el layout privado redirige al login y **no se borra
ninguna cookie** (R20). Cero consultas nuevas y cero escrituras (R21). No se consulta ningún
registro de sesiones ni sello por usuario (R22): QC-23 sigue sin ser dependencia.

### Alternativa descartada — cortar solo por el estado almacenado en la sesión

Comparar `record.accountStatus !== 'active'` sin pasar por la traducción es una línea más corta y
no obliga a traer `lockedUntil`. Descartada: dejaría fuera de la aplicación a quien tiene un
bloqueo **ya vencido** hasta que volviera a hacer login, y rompería R7 (la traducción existiría en
un sitio y su ausencia en otro, que es la misma enfermedad que dos definiciones).

## 6. El desbloqueo administrativo (R24, R25)

Esta ficha entrega **el mecanismo**, no la operación: `clearedLockState()` en el archivo de dominio
nuevo, con su test. QC-66, cuando implemente «mover el estado a mano», tiene que aplicarlo en la
misma escritura que saca la cuenta de `blocked`, o la cuenta se vuelve a bloquear al primer fallo
(QC-19 R27 sentó el precedente con el ingreso correcto).

**No se exporta por `lib/modules/identity/index.ts` en esta ficha.** El contrato publica lo que se
consume desde fuera del módulo, y hoy no lo consume nadie: los tres consumidores del dominio nuevo
(`verify-credentials`, `resolve-session`, sus tests) están dentro. Quien lo saque al contrato es
QC-66, en el mismo cambio en que lo necesite.

### Alternativa descartada — exportarlo ya por el barrel

Sería «dejarlo listo». Descartada por dos motivos, uno de arquitectura y uno de proceso: publicar
en el contrato algo que nadie consume es superficie pública sin usuario —y `docs/architecture.md`
rechaza preparar infraestructura «por si acaso»—, y `lib/modules/identity/index.ts` es uno de los
cinco archivos que declara QC-83, hoy `in_progress`. Tocarlo convertiría dos fichas paralelizables
en un conflicto por un `export` que nadie usa todavía.

## 7. Contratos de entrada/salida, rutas y datos

- **Rutas y endpoints:** ninguno nuevo. El login sigue entrando por la Server Action
  `login-action.ts`, que **no cambia** (el caso de uso conserva nombre y firma), y la sesión por
  el layout privado y el middleware, que tampoco cambian.
- **Contrato de salida del login:** sin cambios. Sigue siendo `{ ok: boolean }`, y el rechazo
  sigue siendo la misma instancia congelada (R3).
- **Modelo de datos:** sin cambios. Ninguna tabla, columna, enum, índice ni migración (R26);
  `db/schema.prisma` y `db/migrations/` no se tocan. RLS: nada que declarar, no hay tabla nueva.
- **Integraciones externas:** ninguna.
- **UI:** ninguna. La ficha es de backend puro; la regla multiplataforma no aplica porque no entra
  ni un componente.

## 8. Dependencias de terceros

**Ninguna.** No se propone ninguna librería nueva: todo el mecanismo —comparación de plazos,
escalada, escritura condicional— ya existe en `identity`, y la decisión cerrada del 2026-09-08 lo
fija (R27). `package.json` no cambia, así que
`tests/guards/guard-dependencias-aprobadas.test.ts` no tiene nada nuevo que aprobar.

## 9. Verificación (esbozo del mapa `R<n> → test`)

El mapa definitivo lo escribe el implementer en `progress/impl_QC-78.md`; aquí queda dónde vive
cada familia de pruebas, que es lo que decide el reparto de tareas:

| Requisitos | Dónde se prueban |
|---|---|
| R7–R12, R14 (derivación), R24 | `tests/unit/identity/effective-account-status.test.ts` (objetos planos, `now` fijo) |
| R1–R6, R13, R15–R19, R25 | `tests/unit/identity/verify-credentials.test.ts` (puertos falsos; incluye el conteo de verificaciones de hash y la identidad referencial del rechazo) |
| R20–R22 | `tests/unit/identity/resolve-session.test.ts` (incluye contador de invocaciones para «ni una consulta más») |
| R13, R17, R18 (predicado y trío de columnas) | `tests/unit/identity/verify-credentials.test.ts` + los tests del adaptador que ya existan; el CAS contra Postgres real es integración y hereda el límite conocido del repo |
| R23, R26, R27 | guardia de alcance de la ficha: sin cron, sin diff en `db/`, sin diff en `package.json` |
| R28 | `e2e/login.spec.ts`, `e2e/session.spec.ts` |
| R29, R30 (regla 3 con marca, y que la marca no altera las reglas 1, 2 y 4) | `tests/unit/identity/route-access.test.ts` |
| R29 (el adaptador declara la marca; sigue sin tocar base ni cookie) | `tests/unit/identity/route-guard-middleware.test.ts` |
| R29 (las dos salidas del servidor redirigen **con** marca) | `tests/unit/private-layout.test.tsx`, `tests/unit/identity/require-page-permission.test.ts` |
| R29, R30 (una sola redirección de punta a punta, para los tres cortes) | `e2e/session.spec.ts` |

Nivel de gate: `./init.sh --rapido` por tanda; `./init.sh` completo para cerrar y **antes del PR**.

## 10. La marca de sesión cortada: cómo se rompe el bucle (R29, R30) — 2026-09-10

Contexto y descarte de las otras tres salidas: `requirements.md > Ampliación del 2026-09-10`. Aquí
va **cómo** se implementa la elegida.

### 10.1 Dónde vive el literal, y por qué no en el contrato del módulo

**`lib/shared/routes.ts`** gana dos constantes y nada más:

```ts
/** Nombre del parámetro que marca «este login viene de un corte de sesión» (QC-78 R29, R30). */
export const SESSION_ENDED_PARAM = 'sesion';

/** El destino al que redirige el servidor cuando la sesión se cortó. Un solo texto para los TRES
 *  cortes (QC-8 R11, QC-48 R15, QC-78 R20): la marca no dice por qué (R30 a). */
export const LOGIN_ROUTE_SESSION_ENDED = `${LOGIN_ROUTE}?${SESSION_ENDED_PARAM}=fin`;
```

Es el mismo patrón que ya usa `PRIVATE_ROUTE_PREFIXES`: una constante de rutas que vive en
`lib/shared/routes.ts` y **entra al dominio como parámetro**, porque el dominio tiene prohibido
importar `lib/shared` (lo hace cumplir `tests/guards/guard-arquitectura-modulos.test.ts`). Los dos
consumidores de producto —el layout privado y `requirePagePermission`— ya importan de ese archivo.

El valor es `fin` y no `cuenta-bloqueada`, `inactivo` ni nada parecido: R30 (a) exige un texto
único para los tres cortes. Y la pantalla de login **no se toca**: hoy solo lee `next` de la
cadena de consulta e ignora cualquier otro parámetro, así que renderiza exactamente igual con
marca y sin ella (R30 a, segunda mitad), sin escribir una línea.

#### Alternativa descartada — publicar el literal por `lib/modules/identity/index.ts`

Sería el sitio «natural» si la marca fuera un concepto de dominio, como lo es `RETURN_PARAM`.
Descartada por dos motivos: es una constante de **ruta** (vive donde `LOGIN_ROUTE`, del que se
deriva), y **`lib/modules/identity/index.ts` lo declara QC-66 (`crud-de-usuarios`), hoy en curso**
— tocarlo convertiría dos fichas paralelizables en un conflicto de archivos. Lo mismo vale para
`lib/composition/index.ts`, que esta ficha sigue sin tocar. Con el literal en `lib/shared/routes.ts`
la intersección con QC-66 queda **vacía**.

### 10.2 La regla 3 del dominio deja de disparar con la marca

`lib/modules/identity/domain/route-access.ts`:

```ts
export type RouteAccessInput = {
  // …lo de siempre…
  /** Nombre del parámetro que marca un login que viene de un corte de sesión (R29). OPCIONAL a
   *  propósito: ver más abajo. */
  readonly sessionEndedParam?: string;
};
```

y el paso 3 gana una condición previa:

```ts
// 3 — El login con sesión válida no se sirve… SALVO que traiga la marca de sesión cortada
// (QC-78 R29): la cookie sigue firmada y viva, pero el servidor acaba de decidir con la base que
// esa sesión ya no vale. Sin esta excepción, servidor y borde se contradicen en cada salto y la
// navegación entra en un bucle de redirecciones.
if (esLogin && session.kind === 'authenticated' && !traeMarcaDeSesionCortada(search, input)) {
  …
}
```

`traeMarcaDeSesionCortada` comprueba **presencia** del parámetro (`URLSearchParams.has`), no su
valor: el valor lo fija un único sitio (`LOGIN_ROUTE_SESSION_ENDED`) y comparar también el texto
solo añadiría un segundo literal que mantener sincronizado.

**El campo es opcional, y esto es una decisión con coste.** Hacerlo obligatorio rompía el
typecheck de cinco archivos de test de otras zonas que construyen un `RouteAccessInput` literal
(`tests/unit/proveedores/supplier-route-contract.test.ts`,
`tests/unit/pedidos-ui/permiso-ruta-pedidos.test.ts`, `tests/unit/recetas-ui/recipe-route-contract.test.ts`,
`tests/unit/inventario/product-route-contract.test.ts` y el propio de identity), y esta ampliación
es quirúrgica. Sin marca declarada, el comportamiento es **el de hoy** (regla 3 dispara siempre),
así que ningún test existente cambia de significado. El riesgo de que el adaptador «olvide»
pasarla se cierra con un test explícito sobre el adaptador (T22), no con la confianza.

**Por qué esto cumple R30 (b).** La marca entra en **una sola** condición, y esa condición está
dentro del `if` del paso 3, que solo se evalúa cuando `pathname === routes.login`. Los pasos 1, 2 y
4 no la leen: una ruta privada con `?sesion=fin` se decide exactamente igual que sin ella —el
anónimo sigue yendo al login (paso 2) y la sesión válida sigue pasando (paso 4)—. La marca no toca
la cookie, no se guarda en ningún sitio y no viaja en el `next` (la redirección del corte lleva
**solo** la marca, sin destino de vuelta, igual que hoy lleva solo `LOGIN_ROUTE`), así que su
efecto muere con la petición que la lleva. Lo peor que puede conseguir alguien con sesión legítima
escribiendo la URL a mano es ver el formulario público de login: no cambia ninguna otra decisión.

### 10.3 Las dos salidas del servidor

Los **dos** puntos que redirigen al login por no haber sesión resuelta pasan de `LOGIN_ROUTE` a
`LOGIN_ROUTE_SESSION_ENDED`:

- `app/(private)/layout.tsx` — `if (user === null) redirect(LOGIN_ROUTE_SESSION_ENDED);`
- `lib/modules/identity/adapters/driving/require-page-permission.ts` — misma línea. **No basta con
  el layout**: layout y página se renderizan en la misma petición y cualquiera de los dos puede
  ganar el `redirect`; si la página lo emitiera sin marca, el bucle seguiría vivo por ese camino.

Ninguno de los dos distingue **por qué** falló la resolución: los dos reciben `null`, que es
justamente lo que hace que la marca sea la misma para los tres cortes sin esfuerzo (R30 a). Y
ninguno de los dos toca la cookie (R29).

**`logout-action.ts` NO cambia.** Ahí la sesión se cierra de verdad —la cookie se borra—, el borde
ve un anónimo y la regla 3 ni siquiera se plantea: no hay bucle que romper y añadir la marca solo
ensuciaría la URL de un cierre de sesión normal.

`lib/modules/identity/adapters/driving/route-guard-middleware.ts` gana **una línea**: pasar
`sessionEndedParam: SESSION_ENDED_PARAM` en la llamada a `decideRouteAccess`. Sigue sin tocar la
base y sin tocar la cookie, así que `guard-middleware-edge` no tiene nada nuevo que reprochar.

### 10.4 Alternativa descartada — marcar con una cabecera o una cookie en vez de con la URL

Una cookie efímera («acabo de cortarte») la leería el borde sin ensuciar la URL. Descartada por
dos motivos: **escribe estado**, y el corte vive en un layout, que en el App Router no puede
escribir cookies durante el render; y una cookie sobrevive a la petición, con lo que violaría
R30 (b) —su efecto tiene que agotarse en el salto que la lleva—. Una cabecera de petición tampoco
sirve: el navegador no la propaga en la redirección que él mismo sigue.

## 11. Riesgos y costes aceptados

1. **La asimetría de los dos cortes** (estado antes del `!correcta`, empresa después) es fácil de
   «arreglar» por accidente en una refactorización futura. Mitigación: el comentario del archivo lo
   explica y hay test para cada uno de los dos órdenes.
2. **`blocked` con plazo vacío es ambiguo por construcción**: significa «lo puso una persona». R15
   es la única barrera que impide que una escritura automática cree esa combinación por error, y por
   eso tiene test propio con el caso «fila en `blocked` vencido + un fallo que no consuma bloqueo».
3. **Sesiones abiertas de cuentas ya no activas sobreviven hasta la siguiente navegación.** Es la
   decisión cerrada del 2026-09-08 y el precedente de QC-48; el corte inmediato es QC-23.
4. **La guardia de alcance de QC-65** (`tests/unit/identity/account-status-scope.test.ts`) acota
   quién puede leer `accountStatus`. Esta ficha añade lectores **dentro** de `identity`; si la
   guardia los rechaza, se amplía su lista **en esta rama** y se deja dicho en el impl. No se
   relaja la guardia: se le añaden los archivos que el spec autoriza.
