# impl_5-hash-y-verificacion-de-contrasena.md

> Bitacora del BACKEND_DEV. **Sustituye entera** a `progress/impl_2-hash-y-verificacion-de-contrasena.md`
> (version scrypt), que se borra en esta misma tanda para que no queden dos historias
> contradictorias en `progress/`. La implementacion vigente es bcrypt via `bcryptjs`.

## Que se hizo (T1-T9 de `specs/5-hash-y-verificacion-de-contrasena/tasks.md`)

| Task | Estado |
| --- | --- |
| T1 borrar la implementacion de scrypt | hecho |
| T2 anadir `bcryptjs` | hecho |
| T3 escribir `lib/utils/password-hash.ts` | hecho |
| T4 tope de 64 caracteres en el login | hecho |
| T5 `tests/unit/password/password-hash.test.ts` | hecho |
| T6 `tests/unit/password/password-verify-fail-closed.test.ts` | hecho |
| T7 `tests/guards/guard-password-hash-module.test.ts` | hecho |
| T8 `tests/unit/password-max-length.test.ts` | hecho |
| T9 cerrar la tanda (`./init.sh --rapido`) | hecho, verde |

## Archivos

**Borrados (T1 — la version scrypt):**

- `lib/utils/password-hash.ts` (reescrito desde cero en T3)
- `tests/support/password-test-params.ts`
- `tests/unit/password/password-hash.test.ts` (reescrito en T5)
- `tests/unit/password/password-verify-fail-closed.test.ts` (reescrito en T6)
- `tests/unit/password/password-cost.test.ts` (la medicion de coste salio de la feature)
- `tests/guards/guard-password-hash-module.test.ts` (reescrito en T7)
- `progress/impl_2-hash-y-verificacion-de-contrasena.md`

Comprobado antes de borrar: ningun archivo de `lib/`, `app/`, `scripts/` ni `db/` importaba
`password-hash` ni `password-test-params`. `package.json` no tenia ninguna dependencia de
hashing que desinstalar (scrypt venia de `node:crypto`).

**Creados:**

- `lib/utils/password-hash.ts` — **37 lineas** (la version scrypt tenia 196).
- `tests/unit/password/password-hash.test.ts` (8 casos)
- `tests/unit/password/password-verify-fail-closed.test.ts` (12 casos)
- `tests/guards/guard-password-hash-module.test.ts` (2 reglas, cada una con su autocomprobacion)
- `tests/unit/password-max-length.test.ts` (4 casos)

**Modificados:**

- `package.json` / `pnpm-lock.yaml` — `bcryptjs@^3.0.3` en `dependencies`. **Trae sus propios
  tipos** (`index.d.ts` + `types.d.ts`, comprobado en `node_modules/bcryptjs`), asi que **no**
  se anade `@types/bcryptjs`.
- `lib/types/auth.ts` — `CREDENTIAL_MAX_LENGTH = 64`, `PASSWORD_TOO_LONG_ERROR` y
  `.max(CREDENTIAL_MAX_LENGTH)` en el campo `password` del `loginInputSchema`. `LoginInput` y
  `LoginFormState` intactos.
- `lib/actions/login.ts` — `toFieldErrors` recibe ahora los issues de zod (antes solo los
  `path`) y distingue `too_big` en el campo `password` para devolver `PASSWORD_TOO_LONG_ERROR`
  en vez de `REQUIRED_FIELD_ERROR`.

## Desviacion del spec: el nombre de la constante del tope

`tasks.md > T4` pedia llamarla `PASSWORD_MAX_LENGTH`. **Ese nombre pone en rojo la guardia
`guard-password-never-plaintext` de la feature 1** (comprobado ejecutando la funcion
`findPlaintextPasswordDeclarations` de la guardia sobre
`export const PASSWORD_MAX_LENGTH = 64` en `lib/types/auth.ts`, que devuelve
`["PASSWORD_MAX_LENGTH"]`): la guardia marca todo identificador declarado cuyos segmentos
incluyan `password` y cuyo ultimo segmento no sea `hash` ni uno de los sufijos no-columna
(`error`, `route`, `id`, `label`...); `length` no esta entre ellos, y la allowlist de
`lib/types/auth.ts` solo tolera el identificador `password`.

Se adapta el nombre, **no la guardia** (mismo criterio que `design.md > 2` aplica a
`createPasswordHash` / `verifyPasswordHash`): la constante se llama **`CREDENTIAL_MAX_LENGTH`**.
`PASSWORD_TOO_LONG_ERROR` si conserva su nombre del spec: acaba en `error` y la guardia lo
acepta. Los tests de T8 afirman contra `CREDENTIAL_MAX_LENGTH` y `PASSWORD_TOO_LONG_ERROR`,
nunca contra literales.

## Mapa `R<n>` -> test

Abreviaturas: **H** = `tests/unit/password/password-hash.test.ts` · **F** =
`tests/unit/password/password-verify-fail-closed.test.ts` · **G** =
`tests/guards/guard-password-hash-module.test.ts` · **L** =
`tests/unit/password-max-length.test.ts`.

| R | Test (ejecutado, en verde) |
| --- | --- |
| R1 | H · "el valor guardado no contiene la contrasena en claro" |
| R2 | H · "dos transformaciones de la misma contrasena dan valores distintos, y las dos verifican correctamente" |
| R3 | H · "verifica la contrasena correcta" (incluye espacios y acentos) |
| R4 | H · "rechaza la contrasena incorrecta" (primer caracter, ultimo, mayusculas, longitud) |
| R5 | F · 10 valores guardados invalidos (`false` y no lanza) + control "un hash valido con su contrasena correcta sigue devolviendo true" |
| R6 | H · "el valor guardado declara 10 rondas" |
| R7 | H · "el valor guardado son 60 caracteres ASCII con formato bcrypt" |
| R8 | G · "el modulo no escribe en ningun canal de salida" (+ autocomprobacion sintetica) · H · "el error de longitud no incluye la contrasena en su mensaje" |
| R9 | H · "rechaza una contrasena de mas de 72 bytes UTF-8" (73 ASCII lanza, 40 acentuados = 80 bytes lanza, 72 bytes exactos pasa) |
| R10 | L · los cuatro casos: 65 caracteres rechazados con `PASSWORD_TOO_LONG_ERROR`, cero llamadas a `verifyCredentials`, 64 aceptados, vacia sigue dando obligatorio |

La guardia G anade una segunda regla ("nada de `hashSync` / `compareSync` / `genSaltSync`")
que hace cumplible la exigencia de API asincrona de `design.md > 2` y T3.

## Verificacion (salida real)

`pnpm run typecheck`

```
> quimicloude@0.1.0 typecheck
> tsc --noEmit
```

(sin salida: cero errores)

`pnpm run lint`

```
> quimicloude@0.1.0 lint
> eslint
```

(sin salida: cero errores, cero warnings)

Tests de la feature mas los vecinos que podia romper (`login-action`, guardias),
`npx vitest run tests/unit/password tests/unit/password-max-length.test.ts tests/unit/login-action.test.ts tests/guards`:

```
 Test Files  7 passed (7)
      Tests  47 passed (47)
   Duration  2.31s
```

`./init.sh --rapido`

```
✓ dependencias presentes
✓ worktrees bajo control (3 ademas del principal)
✓ typecheck paso
✓ lint paso
[test:rapido] tests relacionados con 4 archivo(s) del diff vs origin/dev
 Test Files  3 passed (3)
      Tests  24 passed (24)
[test:rapido] todas las guardias
 Test Files  3 passed (3)
      Tests  14 passed (14)
✓ test:rapido paso
! modo rapido: solo los tests relacionados con tus cambios + las guardias.
✓ todas las migraciones tienen down.sql
✓ .env presente
== init OK ==
```

Nota: la seleccion por grafo de `test:rapido` se calcula sobre el diff **commiteado** vs
`origin/dev`, asi que no incluye `tests/unit/password-max-length.test.ts` ni
`tests/unit/login-action.test.ts` mientras la tanda esta sin commitear; por eso se corrieron
ademas a mano (bloque de arriba, 47 tests). El `./init.sh` completo y el PR los corre el leader.

## Lo que NO se hizo (a proposito)

Nada de rotacion de algoritmo, pepper, parametros configurables, medicion de coste, formato
PHC ni columnas nuevas: todo eso salio de la feature en la reescritura del 2026-08-06. Sin
migraciones, sin RLS, sin service ni repositorio (no hay nada que inyectar ni que mockear) y
sin tocar UI.

## Preguntas abiertas

1. **`progress/review_2-hash-y-verificacion-de-contrasena.md`** sigue en disco y revisa la
   version scrypt, ya inexistente. No lo toco (es material del reviewer/leader), pero conviene
   borrarlo o marcarlo como obsoleto junto con esta tanda.
2. **El tope de 64 caracteres no esta reflejado en la UI.** El util y la Server Action ya lo
   imponen (R9, R10), pero el `maxLength` del input del formulario es zona del FRONTEND_DEV y
   queda fuera del alcance de esta feature.
3. **Politica de contrasena** (longitud minima real, complejidad): sigue sin definir, tal como
   dejo `requirements.md > Preguntas abiertas`. Esta feature no la impone.

## Veredicto

T1-T9 completas: bcrypt (10 rondas) en 37 lineas, los 10 requisitos con test ejecutado en
verde y `./init.sh --rapido` en verde; falta el gate completo y el PR, que son del leader.
