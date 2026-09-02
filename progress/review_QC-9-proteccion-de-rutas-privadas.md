# QC-9 — proteccion-de-rutas-privadas · review

> Revisor: subagente `reviewer`. Todo ejecutado dentro del worktree
> `.worktrees/QC-9-proteccion-de-rutas-privadas` (rama `feature/QC-9-proteccion-de-rutas-privadas`,
> HEAD `2120054`). Base de comparacion: `origin/dev` (`31c572e`).
> **No se ejecuto `./init.sh`** (lo corria el leader en paralelo): se corrieron sus piezas a mano.

## Veredicto

**RECHAZADO** — un bloqueante: el recorrido E2E que cierra **R24** esta **rojo en HEAD**. La causa
es un defecto **preexistente en `dev`** que entro al worktree con el merge `2120054`, no codigo de
QC-9; pero R24 no tiene evidencia verde y `CHECKPOINTS.md > Verificacion final` no se cumple.
Todo lo demas —incluidos los tres puntos de riesgo que se pidieron medir— esta **verificado y en
orden**.

## Verificacion ejecutada (salida propia, no la bitacora)

```
pnpm run typecheck        -> verde (sin salida)
pnpm run lint             -> verde (sin salida)
pnpm exec vitest run      -> 73 archivos, 794 tests, TODOS en verde (unit + integracion)
                             (`identity-seed.int.test.ts` incluido, sin contencion)
pnpm exec playwright test e2e/login.spec.ts   --project=chromium -> 2 passed
pnpm exec playwright test e2e/session.spec.ts --project=chromium -> 1 FAILED (dos veces, reproducible)
```

## Checklist de `CHECKPOINTS.md`

### Especificacion
- [x] `requirements.md` con R1–R30 en EARS. D3 aparece tachada y derogada **a proposito**, con su
      motivo en la tabla; no es un descuido.
- [x] `design.md` con alternativas descartadas y su porque (seccion 10).
- [~] `tasks.md`: T1–T20 en `[x]`. **T21 (gate completo + PR) sigue en `[ ]`** y la propia bitacora
      lo declara: es del leader. No cuenta como incumplimiento del implementer, pero el checkpoint
      «todas las tasks marcadas» aun no se cumple.

### Trazabilidad
- [x] Los 30 requisitos tienen su fila `R<n> -> test` en
      `progress/impl_QC-9-proteccion-de-rutas-privadas.md`.
- [x] Los tests nombrados **existen** y se corresponden con lo que dicen (verificados uno a uno
      leyendo el archivo, no la tabla).
- [ ] **Todos pasan menos uno: R24** (`e2e/session.spec.ts`). Ver hallazgo B1.

### Calidad de codigo
- [x] typecheck, lint y `pnpm test` (vitest) en verde.
- [x] Flujo critico (autenticacion/permisos) con E2E Playwright: **existe** (`e2e/session.spec.ts`),
      pero esta rojo. Ver B1.
- [x] UI: el unico cambio de UI es un `<input type="hidden">` en el formulario de login y que
      `login/page.tsx` pase a `async`. Sin `100vh` (la pagina ya usaba `min-h-svh`), sin `:hover`
      como unica via, sin cambiar tamaños de fuente ni targets tactiles, sin libreria nueva.
      `tests/unit/login-form.test.tsx` afirma explicitamente «sin cambio visual».
- [x] Dependencias: `package.json` **no aparece en el diff**. Ninguna dependencia nueva (R25).
      La unica utilidad escrita a mano —`equalsInConstantTime`— esta justificada en
      `design.md > 3.4`: `timingSafeEqual` es de `node:crypto` y no existe en el borde.

### Datos y seguridad
- [x] Ninguna tabla nueva, ninguna migracion, ningun webhook. La feature no toca el esquema.
- [x] Ningun secreto hardcodeado. `SESSION_SECRET` se lee en la llamada, nunca al cargar el modulo,
      y el mensaje de error no incluye el valor (test de R18 lo afirma).
- [x] Acceso a datos por el repositorio; el borde **no** consulta base (R4, con guardia).
- [x] La frontera de autorizacion sigue siendo el service: ver R29 mas abajo.

### Modulos hexagonales
- [x] `domain/` puro: `route-access.test.ts` afirma que `route-access.ts` **solo** importa de su
      propia carpeta (ni `next/*`, ni Prisma, ni `lib/shared`).
- [x] `middleware.ts` no importa driven (verificado por mutacion, ver M4).
- [x] El barrel reexporta solo `./domain`.
- [~] `guard-arquitectura-modulos` gana una excepcion driven→driven del mismo modulo. Acotada y
      medida (ver punto 3), pero `docs/architecture.md` no se actualizo. Hallazgo m1.

### Permisos
- [x] El layout privado sigue validando en servidor via `cookies()` (R6, test existente intacto).
- [x] Mutaciones por Server Action.

### Verificacion final
- [ ] `./init.sh` verde: **no se puede afirmar** con el E2E rojo.
- [x] Este archivo existe.
- [ ] `progress/history.md` y el desmontaje del worktree: pendientes del leader (T21).

---

## Los tres puntos de riesgo, medidos

### 1. El oraculo de la firma — **INTACTO**

`tests/unit/identity/session-cookie.test.ts` **sigue siendo un oraculo**. Verificado con el diff en
la mano (`git diff origin/dev...HEAD -- tests/unit/identity/session-cookie.test.ts`): los unicos
cambios son exactamente los cinco declarados —nombre del test, `v1`→`v2` (dos sitios), `role` en
`Object.keys`, `role` en el payload literal del test de `sub` no-UUID, y el rol como argumento nuevo
en **12** llamadas a `createSessionTicket`—. **Ninguna linea de recomputacion aparece en el diff.**

- `import { createHmac } from 'node:crypto'` sigue en la linea 6.
- Las tres recomputaciones (lineas 151, 256, 268) siguen usando `createHmac(...).digest('base64url')`.
- `grep` confirma que el archivo **no** menciona `signSessionValue`, `buildSessionValue` ni
  `session-token`: no compara la implementacion consigo misma.
- Importa `SESSION_COOKIE_NAME` de `session-cookie` (que lo reexporta), no del codec: el oraculo no
  se tuvo que tocar para la extraccion.

**Mutacion M1 (prueba de que sigue vivo).** Se corrompio la salida del codec
(`bytesToBase64Url(mac)` -> `.slice(0,42) + 'X'`) en `session-token.ts`:

```
FAIL  tests/unit/identity/session-cookie.test.ts > el valor va firmado con HMAC y solo lleva sub/iat/exp/role
Tests  1 failed | 17 passed
```

El oraculo dispara. Restaurado con `git checkout` inmediatamente.

### 2. El cegado de las dos guardias — **REPRODUCIDO, ARREGLADO Y CUBIERTO**

Reproducido **sobre el `middleware.ts` real** con el orden viejo de `stripComments` (bloques antes
que lineas). La cabecera del archivo contiene `app/**`, cuyo `/*` abre un bloque falso que cierra el
JSDoc siguiente:

```
VIEJO: "\n\n\n\n\n\n\nexport const config = {\n  matcher: [...]\n};\n"     <- el reexport DESAPARECE
NUEVO: "...export { middleware } from '@/lib/.../route-guard-middleware';\n...export const config..."
```

Es decir: **la guardia veia solo `export const config` y pasaba en verde sin mirar nada**. El
diagnostico de la bitacora es exacto y afectaba a la evidencia de R14, R19 y R21.

**Mutacion M2 (prueba de que la regresion esta cubierta).** Se revirtio el orden en las dos guardias:

```
FAIL guard-firma-sesion-unica > no se ciega: un comentario de linea con un comodin app/ ...
FAIL guard-arquitectura-modulos > bloque 14 > un comentario de linea ... NO esconde los imports
FAIL guard-arquitectura-modulos > bloque 14 > el middleware.ts REAL sigue mostrando su reexport
Tests 3 failed | 59 passed
```

Los tres tests caen, incluido el que **ancla sobre el `middleware.ts` real** (no solo sobre un
fuente sintetico). La cobertura es real, no decorativa. Restaurado.

**Mutacion M3.** Ademas se comprobo que la ampliacion a la raiz muerde de verdad: creando
`firma-pirata.ts` en la raiz con `createHmac`, `guard-firma-sesion-unica` se pone roja nombrando el
archivo (R19). Borrado.

### 3. La excepcion driven→driven — **NO ABRE MAS DE LO QUE DICE**

Lo que la guardia dejaba caer antes y ahora deja pasar es **exactamente una clase**: origen driven y
destino driven **del mismo modulo** (`moduleOfPath(relPath) !== null` y `=== moduleOfPath(target)`).
En todo el repo hoy solo existe **un** import de esa clase: `session-cookie.ts -> ./session-token`,
que es el que el diseño ordena.

**Mutacion M4a (¿sigue cayendo un driven de OTRO modulo?).** Se quito la comparacion de modulo:

```
FAIL guard-arquitectura-modulos > bloque 7 > un driven puede apoyarse en otro driven de su propio
     modulo, pero no en uno de otro modulo
```

Sigue cubierto por su propio test.

**Mutacion M4b (¿R21 se relaja?).** Se inyectaron dos imports reales de driven —uno en
`middleware.ts` (raiz) y otro en `adapters/driving/route-guard-middleware.ts`— y se corrio la guardia
sobre el repo:

```
+ "lib/modules/identity/adapters/driving/route-guard-middleware.ts importa el adaptador driven ... (R11)"
+ "middleware.ts importa el adaptador driven ... (R11)"
+ "middleware.ts importa '...' saltandose el contrato del modulo (R13)"
```

**R21 no se relaja.** La raiz (capa nula, `moduleOfPath === null`) y la capa driving siguen cayendo.
Restaurado.

### 4. QC-7 y QC-8: ¿cambio algo mas que la primitiva y el transporte del rol?

Diff completo de `lib/modules/identity/**` contra `origin/dev`. Lo que cambia:

- `session-cookie.ts`: adelgaza a transporte; **sus tres firmas publicas no cambian**. Delega en el
  codec. Reexporta `SESSION_COOKIE_NAME`.
- `session-token.ts` (nuevo): mismo algoritmo, misma clave (bytes UTF-8), mismo mensaje, misma
  codificacion base64url sin relleno. R16 cumplido.
- `session.ts`, `session-claims.ts`, `verify-credentials.ts`, `user-credentials-reader.ts`: el rol,
  y nada mas.
- `user-credentials-prisma.ts`: `JOIN roles` en la **misma** consulta `$queryRaw`. Cero consultas
  nuevas. `INNER JOIN` es correcto: `users.role_id` es NOT NULL en `db/schema.prisma`.
- `login-action.ts`: `redirect(destino)` en vez de `redirect(DASHBOARD_ROUTE)`, autorizado por R8.
  La firma congelada (`prevState`, `formData`) y `LoginFormState` intactas; el `redirect` sigue
  fuera de todo `try`.

**No hay ningun otro cambio de comportamiento.** `resolve-session-user.test.ts` incluso refuerza
QC-8 R12: pone en los claims un `roleName` que no existe en la base y afirma que quien renderiza
sigue leyendo el rol **de la base**.

### 5. R26 y R29 — los de seguridad

**R26 (el rol sale de la base, nunca del cliente).** Dos tests, ninguno tautologico:

- `verify-credentials.test.ts` ataca por el unico sitio posible: mete `role`/`roleName` de mas en la
  entrada (`as never`) y afirma que el ticket lleva **el de la fila**, no el inyectado. Un segundo
  test cambia la fila y comprueba que el ticket cambia con ella (el rol no esta fijado en el codigo).
- `login.int.test.ts` lo cierra **contra Postgres real**: lee `roles.name` con Prisma, corre el login
  con el adaptador real (`$queryRaw` con el `JOIN`), firma el ticket con el codec de verdad y lo
  vuelve a verificar. Si alguien quita el `JOIN` o fija un rol por defecto, se pone rojo.

**R29 (el rol firmado no autoriza).** `decideRouteAccess` devuelve un union de dos formas y nada mas.
El test recorre cinco entradas —incluida una con regla ruta→rol que deniega— y afirma que las claves
de la decision son exactamente `['kind']` o `['kind','reason','to']` y que el JSON serializado **no
contiene** el rol ni el `sub`. No es una tautologia: mide la forma del valor devuelto, no un `toBe`
contra si mismo. `docs/architecture.md` lo dice ademas por escrito y `guard-doc-permisos` tiene un
test negativo («el caso a medias: cuenta la firma pero calla que el rol no autoriza»).

### 6. R27, ruta de vuelta y documentacion

- **R27 (v1 rechazado sin verificar la firma).** `verifySessionValue` corta por version **antes** del
  HMAC. El test construye un `v1` impecable con `node:crypto`, afirma primero que la firma y el `exp`
  son buenos (si no, el `null` no probaria nada), luego espia `crypto.subtle.sign` y comprueba que
  **no se llama**; y hay un **test de contraste** que verifica que con `v2` si se llama exactamente
  una vez. Cerrado de verdad.
- **R9 (ruta de vuelta interna).** `return-path.test.ts` descarta `https://evil.example`,
  `//evil.example`, `/\evil.example`, `javascript:`, `%2F%2Fevil.example` (el caso que decodifica a
  doble barra), cadena vacia y ausencia. Y `loginAction` **revalida** el campo oculto: el test de
  `login-action` afirma que un `next=https://evil.example` aterriza en el dashboard.
- **R23 (`docs/architecture.md > Permisos y autenticacion`).** Actualizado: ya no dice «verifica
  existencia de cookie», dice firma, caducidad y rol firmado, y añade dos parrafos —el layout como
  ultima linea de defensa, y que el middleware **no** es la frontera de autorizacion—.
  `guard-doc-permisos.test.ts` lo vigila con **test negativo** («detecta el documento ANTERIOR a
  QC-9») y con el del caso a medias.

---

## Hallazgos

### BLOQUEANTE

**B1 — R24 sin evidencia: `e2e/session.spec.ts` esta rojo en HEAD.**

`pnpm exec playwright test e2e/session.spec.ts --project=chromium` falla, dos veces seguidas y de
forma reproducible, en el paso 2 del recorrido:

```
waiting for getByTestId('dashboard-title')  -> element(s) not found
error-context.md:  heading "This page couldn t load" / "A server error occurred."
```

Causa raiz, identificada: la zona privada **devuelve 500** al renderizar. El log del servidor lo dice
literalmente:

```
Error: Functions cannot be passed directly to Client Components unless you explicitly expose it by
marking it with "use server". {$$typeof: ..., render: function FlaskConical}
```

`app/(private)/layout.tsx` (Server Component) pasa `PRIVATE_NAV_ITEMS` como prop a
`<AppSidebar>` (`'use client'`), y `lib/shared/navigation/private-nav.ts` mete **componentes de
lucide** (`FlaskConical`, `Boxes`, `Factory`…) dentro de esos datos: funciones no serializables
cruzando la frontera RSC.

**No es de QC-9.** El diff de QC-9 no toca `components/private/**`, `lib/shared/navigation/**` ni
`app/(private)/**`. El defecto entra por el commit `05efbbe feat(sidebar): iconos, secciones,
contador, simbolo, pastilla y acento activo` (PR #18, `fix-ajuste-sidebar`), que ya esta en
`origin/dev`. Comprobado con `git merge-base --is-ancestor`:

```
e6eba95 (el commit del E2E de QC-9): NO tiene 05efbbe   -> el E2E estaba verde cuando se escribio
15e1822 (bitacora):                  NO tiene 05efbbe
2120054 (merge de origin/dev, HEAD): SI tiene 05efbbe   -> aqui se rompe
```

O sea: la bitacora **no mintio** —el E2E paso en chromium y webkit cuando se corrio—, pero el merge
de `dev` posterior lo puso rojo y nadie lo volvio a correr. Vale la pena decirlo tambien al reves:
**el E2E de QC-9 es el primer test del repo que renderiza de verdad una pantalla privada, y por eso
es el que ha cazado el defecto**; `e2e/login.spec.ts` pasa en verde con esos mismos 500 en el log,
porque solo mira la cookie.

Que falta para levantar el bloqueo: que la zona privada renderice. Eso es un arreglo del sidebar
(pasar el nombre del icono y resolverlo en el cliente, o que el consumidor de la tabla no cruce la
frontera RSC), **ficha propia, no de QC-9**, y despues volver a correr `e2e/session.spec.ts` en
`chromium` **y** `webkit`. Mientras tanto, R24 no tiene evidencia y `./init.sh` no puede estar verde.

Lo que **si** quedo demostrado del recorrido, porque el test llego hasta ahi antes de caer: pedir
`/dashboard` sin sesion aterriza en el login, y entrar con credenciales correctas redirige **a la
pantalla que se habia pedido** (`waitForURL(/dashboard)` paso). O sea que el middleware, el `next` y
la vuelta funcionan en navegador real; lo que falla es pintar la pantalla.

### Menores

**m1 — `docs/architecture.md > La regla de dependencias` no recoge la excepcion driven→driven.**
La fila `lib/modules/M/adapters/driven/**` no lista al driven hermano **en ninguna de las dos
columnas**. El argumento del implementer («la columna *NO PUEDE* no lo prohibe») es razonable, pero
la columna *PUEDE* tampoco lo permite: hoy la guardia es mas permisiva que la lista del documento, y
el documento es lo que el reviewer usa para juzgar. Ademas `design.md > 9` dice, para el caso de la
raiz, «se corrige el archivo, **no** se añade una excepcion a la guardia» — la excepcion va contra la
letra de esa frase aunque no contra su contexto. **No bloquea** porque esta medida (M4a, M4b) y no
abre nada mas, pero hay que cerrar la brecha: añadir «otro `driven` del **mismo** modulo» a la
columna *PUEDE* de esa fila, con el porque. Alternativa que evitaria la excepcion entera: el codec no
hace I/O ni implementa puerto alguno; podria vivir en `domain/`. No lo decido yo, pero conviene
anotarlo.

**m2 — `tasks.md` T21 sigue en `[ ]`.** Correcto segun el reparto (lo cierra el leader), pero el
checkpoint «todas las tasks marcadas `[x]`» no se cumple hasta que se cierre.

**m3 — Higiene de commits, ya declarada por el implementer.** `a5bfbf1` arrastra marcas de tasks y
`cc83f8f` se lleva **todo T18** (`docs/architecture.md` + `guard-doc-permisos.test.ts`): no existe un
commit `docs(QC-9)` propio de T18. No se perdio nada y la historia no se reescribio por falta de
`rebase -i`. Se acepta como deuda anotada, no como incumplimiento.

**m4 — Cambio de comportamiento marginal en `readSessionClaims`.** Con un valor malformado del tipo
`v2.<algo>` (dos trozos) y `SESSION_SECRET` ausente, el codigo viejo devolvia `null` y el nuevo
**lanza** (porque `hasCurrentVersion` mira solo el primer trozo y despues se lee el secreto). El
middleware lo captura y falla cerrado (R18), y el layout ya lanzaba en ese escenario, asi que no hay
agujero. Se anota por completitud.

**m5 — Hallazgo del implementer, confirmado:** Next 16.3.0 deprecó la convencion de fichero
`middleware.ts` en favor de `proxy`. Funciona hoy. El spec, congelado, ordena `middleware.ts`; no
inventar por encima del spec es lo correcto. Merece ficha propia.

---

## Resumen

| | |
| --- | --- |
| Requisitos con test que **existe** | 30 / 30 |
| Requisitos con test que **pasa** | 29 / 30 (falla R24) |
| Bloqueantes | 1 (B1) |
| Menores | 5 |
| **Veredicto** | **RECHAZADO** |

El trabajo de QC-9 en si es solido y las tres zonas de riesgo que se pidieron auditar salen limpias:
el oraculo sigue siendo un oraculo, el cegado de las guardias era real y esta cerrado con una
regresion que muerde, y la excepcion de la guardia abre exactamente lo que dice y nada mas. El unico
bloqueante es evidencia que falta, y su causa vive en `dev`, no en esta rama.

---

# Ronda 2

> HEAD `cd0b124` (merge de `origin/dev` = `1be1021`). Revisado tras el cierre de B1 y de m1, y tras
> el cambio tardio en `app/(public)/login/page.tsx` (`93b3583`), que es posterior a la ronda 1.
> `./init.sh` lo corre el leader; aqui se corrieron sus piezas a mano.

## Veredicto de la ronda 2: **OK**

Sin bloqueantes. B1 esta cerrado y verificado; m1 esta cerrado y verificado; el cambio tardio de
`login/page.tsx` **no debilita R7, R8 ni R9**, y lo digo despues de reproducir el escenario, no de
leer el commit.

## Recuento propio (ejecutado, no declarado)

```
pnpm run typecheck                      -> VERDE
pnpm run lint                           -> VERDE
pnpm exec vitest run                    -> 89 archivos / 957 tests, TODOS verdes
pnpm run test:guardias                  -> 12 archivos / 123 tests verdes
pnpm exec playwright e2e/session.spec.ts --project=chromium -> 1 passed
pnpm exec playwright e2e/session.spec.ts --project=webkit   -> 1 passed
```

**Correccion al recuento del coordinador: no son 75 archivos / 825 tests, son 89 / 957.** El numero
declarado es anterior al ultimo `merge origin/dev` (`cd0b124`), que trajo QC-20 (`inventario`) con su
tanda de tests. Los 12/123 de guardias si coinciden exactos. Conviene anotar el numero real en
`progress/current.md`, porque un baseline desfasado es justo lo que hace que un rojo nuevo pase por
conocido.

**Matiz sobre el aviso de Prisma.** En mi maquina `typecheck` estaba **verde** tambien ANTES de
regenerar; lo que estaba rojo era la **ejecucion**: 30 tests fallando, todos en
`tests/integration/inventario/**` y `tests/integration/recetas/**`, con excepciones de validacion del
cliente Prisma, cero en territorio de `identity`. Tras
`pnpm install --frozen-lockfile && pnpm exec prisma generate && pnpm exec next typegen` la suite
entera queda en verde. Sin `EPERM` (no habia `next dev` vivo). Confirmado: **no es defecto de QC-9 ni
de QC-20**, es la deuda del cliente desincronizado ya anotada en `progress/history.md`.

## B1 — cerrado y verificado

`40b4a85` saca los iconos de los datos que cruzan a un Client Component: `PRIVATE_NAV_ITEMS` lleva
ahora el **nombre** del icono y `lib/shared/navigation/nav-icons.ts` lo resuelve en cliente. El 500 de
la zona privada desaparecio. `e2e/session.spec.ts` pasa **en los dos motores** (chromium y webkit),
o sea que R24 tiene evidencia real, tambien en el motor de iOS que pide la regla multiplataforma.
`tests/guards/guard-nav-serializable.test.ts` afirma sobre **el dato** —que ningun valor de la tabla
de navegacion sea una funcion— y no sobre el render, que es la forma correcta: un test de render
habria vuelto a pasar en verde en cuanto alguien memorizara el arbol.

Mi diagnostico de la ronda 1 queda confirmado en todos sus extremos: causa (iconos de lucide
cruzando la frontera RSC), origen (`05efbbe`, PR #18, ya en `dev`), y que **no era de QC-9**.

## m1 — cerrado y verificado

`729d218` toca **solo el documento**, que era lo que yo pedia. La fila `adapters/driven/**` gana
«otro driven del MISMO modulo» en *PUEDE* y «un driven de OTRO modulo» en *NO PUEDE* —antes solo
implicito—, mas una nota que da el porque (la extraccion del codec que permite una sola
implementacion del HMAC) y aclara que no cablea nada, asi que R11 sigue intacto.

**Comprobado que la guardia no se toco:** `git diff 2120054..HEAD -- tests/guards/` no muestra ningun
cambio en `guard-arquitectura-modulos.test.ts` ni en `guard-firma-sesion-unica.test.ts` (lo unico
nuevo bajo `tests/guards/` es `guard-nav-serializable.test.ts`, que llega de `dev`). Las mutaciones
M2, M4a y M4b de la ronda 1 siguen siendo validas sin repetirlas.

## El cambio tardio en `login/page.tsx` (`93b3583`) — mi juicio

**No debilita R7, R8 ni R9.** Lo que sigue es lo que comprobe, no lo que dice el commit.

### La colision es real: la reproduje

Puse en su sitio la version anterior del archivo (`git show 93b3583^:app/(public)/login/page.tsx`) y
corri los dos tests implicados:

```
Tests  5 failed | 46 passed (51)
FAIL tests/unit/login-skin.test.tsx > expone un unico landmark main, que es el ambito del login
FAIL ... > monta las tres burbujas como capa decorativa e inalcanzable por teclado
FAIL ... > coloca la capa de burbujas como hermana de la tarjeta y antes que ella
FAIL ... > deja el enlace de recuperacion en el pie de la tarjeta y fuera del formulario
FAIL ... > mide el alto de la pantalla con la unidad de viewport dinamica
```

Exactamente los **5** que dice el implementer, y ninguno de `login-form.test.tsx`. Su relato —que ya
fallaban en HEAD antes de tocar nada, porque una funcion `async` devuelve una promesa y RTL montaba
un `<div/>` vacio— es **exacto**. Restaurado el archivo, arbol limpio.

### Por que no debilita R9 (el redirector abierto)

La rama nueva (`!searchParams`) solo puede producir **`DASHBOARD_ROUTE`**, una constante interna. Es
decir: el unico fallo posible de esa rama es caer al destino **seguro**, nunca hacia uno sin validar.
Falla cerrado por construccion. Y la validacion que de verdad protege sigue intacta: `loginAction`
vuelve a pasar el campo del `FormData` por `resolveReturnPath` —el campo oculto es entrada externa y
un POST fabricado no pasa por esta pagina—, y su test de `next=https://evil.example` -> dashboard
sigue verde. `return-path.ts`, `route-access.ts` y `login-action.ts` **no se tocaron** en `93b3583`:
el diff es de un solo archivo.

### Por que no debilita R7 ni R8

- **R7** (la redireccion al login lleva la ruta pedida) vive en `buildLoginRedirect` /
  `decideRouteAccess`, en `domain/`. No se toco.
- **R8** (aterrizar en la pantalla pedida) se decide en `loginAction`, tampoco tocado. Lo que la
  pagina hace es **transporte**: leer `?next=` y pintarlo en el campo oculto.

Y ese transporte **si tiene test, en las dos ramas**, cosa que verifique en lugar de suponerla:

- `tests/unit/login-form.test.tsx` renderiza `LoginPage({ searchParams: Promise.resolve(...) })` —la
  rama **con** promesa, que es la que corre en produccion— y afirma con un valor **discriminante**:
  con `next=/dashboard/reportes?desde=ayer` el campo oculto vale exactamente eso; con
  `https://evil.example/robo` cae al dashboard; con el parametro repetido (llega como lista) cae al
  dashboard; sin parametro, dashboard. Y un test mas comprueba que el campo viaja dentro del
  `FormData` que recibe la Server Action.
- `tests/unit/login-skin.test.tsx` (QC-30) cubre la rama **sin** props.

O sea que la ramificacion nueva no dejo un camino a oscuras: el productivo es justo el que estaba y
sigue estando cubierto con casos que distinguen.

### La firma sigue siendo la que Next exige — comprobado por el validador de Next, no a mano

`tsconfig.json` incluye `.next/types/**/*.ts`, y `.next/types/validator.ts` contiene:

```
// Validate ../../app/(public)/login/page.tsx
type __IsExpected<Specific extends AppPageConfig<"/login">> = Specific
```

Corri `pnpm exec next typegen` **antes** del `typecheck`, asi que `tsc --noEmit` valido de verdad el
export por defecto contra el contrato de Next para `/login`, y esta verde. La firma
`({ searchParams?: Promise<...> }) => ReactElement | Promise<ReactElement>` es aceptada por el propio
Next: no es una forma inventada que solo satisfaga un tipo escrito a mano. (Devolver la promesa solo
cuando hay algo que esperar es legitimo: React consume ambas.)

### Hizo bien en reejecutar el E2E

El cambio esta en el camino critico de R24: su evidencia anterior habria quedado obsoleta. Lo
reejecuto, y yo lo reejecute **por mi cuenta en los dos motores**: verde en chromium y en webkit.

### Lo unico que quiero dejar anotado (menor, n1)

**El E2E de R24, por si solo, no puede distinguir «el `next` funciono» de «cayo al dashboard por
defecto».** Pide `/dashboard`, y el destino por defecto **tambien** es `/dashboard`: los dos caminos
aterrizan en el mismo sitio. No es un defecto de la implementacion ni del test —hoy `/dashboard` es
la unica pantalla privada que existe, asi que R24 no se puede escribir de otra forma—, pero conviene
que quede escrito para que nadie lea ese verde como prueba del transporte del `next`. **Quien
discrimina de verdad** es `login-form.test.tsx` con `/dashboard/reportes?desde=ayer` y
`login-action.test.ts` con el mismo valor. Cuando nazca la segunda pantalla privada (la de productos,
QC-20), el E2E deberia pedir **esa** y no el dashboard: ahi el recorrido pasaria a discriminar solo.

## Hallazgos nuevos de la ronda 2

| # | Severidad | Hallazgo |
| --- | --- | --- |
| n1 | menor | El E2E de R24 no discrimina el `next` del destino por defecto (ambos son `/dashboard`). Cubierto por unit; anotar para cuando exista una segunda pantalla privada. |
| n2 | menor | El recuento declarado (75 archivos / 825 tests) esta **desfasado**: el real tras el ultimo merge es **89 / 957**. Anotar el bueno en `progress/current.md`. |
| n3 | menor (entorno, ajeno) | La suite completa sale **roja (30 tests)** en un worktree con el cliente de Prisma desincronizado —todos en `integration/inventario` y `integration/recetas`, ninguno en `identity`—. Se arregla con `prisma generate` + `next typegen`. Deuda ya conocida (`progress/history.md`, QC-6); lo repito porque le costo una ronda a esta ficha. |

Los menores m1..m5 de la ronda 1: **m1 cerrado**. m2 (T21) se cierra al abrir el PR. m3 (higiene de
commits), m4 (`readSessionClaims` lanza con un `v2.` malformado sin secreto) y m5 (`middleware.ts`
deprecado en Next 16.3) siguen abiertos como deuda anotada, ninguno bloqueante.

## Recuento final

| | Ronda 1 | Ronda 2 |
| --- | --- | --- |
| Requisitos con test que existe | 30 / 30 | 30 / 30 |
| Requisitos con test que **pasa** | 29 / 30 | **30 / 30** |
| Bloqueantes | 1 | **0** |
| Menores abiertos | 5 | 6 (m2–m5, n1–n3; m1 cerrado) |
| **Veredicto** | RECHAZADO | **OK** |

Queda pendiente lo que es del leader: `./init.sh` completo en verde, `progress/current.md`,
`progress/history.md`, el PR (con las tres advertencias que pide T21: sesiones vivas invalidadas al
subir a `v2`, el rol firmado que envejece hasta 8 h y lo arregla QC-23, y la pregunta abierta 2 sobre
que hace `/`) y el desmontaje del worktree.
