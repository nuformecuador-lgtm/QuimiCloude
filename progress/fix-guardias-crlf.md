# Fix: strippers de comentarios ciegos con CRLF (5 guardias)

## Archivos modificados

- `tests/guards/guard-arquitectura-modulos.test.ts` — `stripComments` (Arreglo A) + test de
  regresion CRLF en el describe "bloque 14 — no se ciega por comentarios".
- `tests/guards/guard-firma-sesion-unica.test.ts` — `stripComments` (Arreglo A) + test de
  regresion CRLF junto al test "no se ciega" existente (QC-9).
- `tests/guards/guard-middleware-edge.test.ts` — `stripComments` (Arreglo A) + nuevo describe
  "guardia: no se ciega por comentarios" con el caso CRLF.
- `tests/guards/guard-password-never-plaintext.test.ts` — `stripSqlComments` y
  `stripLineComments` (Arreglo A + Arreglo B: invertido el orden bloque→linea a linea→bloque en
  `stripSqlComments`) + dos tests de regresion (mencion en comentario SQL con CRLF, y comodin
  `/*` dentro de un `--` con CRLF que escondia una columna real).
- `tests/guards/guard-politica-de-contrasenas.test.ts` — `stripComments` (Arreglo A + Arreglo B:
  invertido el orden) + dos tests de regresion (comodin `/*` dentro de un `//` con CRLF que
  escondia una llamada real a `hasher.hash(`, y mencion en comentario con CRLF que no cuenta).

No se toco ninguna regla, umbral, mensaje ni lista de archivos barridos; solo el despojado de
comentarios y los tests nuevos. No se toco codigo de produccion ni nada bajo
`app/(private)/configuracion/usuarios/` ni `tests/unit/configuracion-ui/` (verificado con
`git status` al cierre: sin cambios mios ahi).

## El arreglo en dos lineas

Arreglo A (los 5): normalizar `\r\n?` a `\n` como PRIMER paso del stripper, antes de partir por
lineas, para que `//.*$` y `--.*$` sin bandera `m` casen igual en CRLF que en LF. Arreglo B (solo
en `guard-password-never-plaintext` y `guard-politica-de-contrasenas`): invertido el orden a
linea-primero-bloque-despues, igual que QC-9 ya dejo hecho en los otros tres.

## Tests de regresion anadidos (por archivo)

1. `guard-arquitectura-modulos.test.ts`: `'no se ciega con CRLF: el mismo cegado con \r\n tampoco
   esconde los imports que van debajo'` (import real sobrevive) + variante que un comentario que
   solo MENCIONA un import no cuenta.
2. `guard-firma-sesion-unica.test.ts`: `'no se ciega con CRLF: el mismo cegado con \r\n NO esconde
   el createHmac que va debajo'` + variante de mencion sin uso real.
3. `guard-middleware-edge.test.ts`: nuevo describe con `'un comentario de linea con CRLF y un
   comodin app/** NO esconde el reexport que va debajo'` + variante de mencion.
4. `guard-password-never-plaintext.test.ts`: `'un comentario SQL que solo menciona la contrasena,
   con CRLF, sigue sin ser una declaracion'` (el falso positivo real de las migraciones) y `'no se
   ciega con CRLF: una nota SQL con /* dentro de un comentario -- no esconde la columna real'`
   (columna `plain_password` sigue detectada).
5. `guard-politica-de-contrasenas.test.ts`: `'no se ciega con CRLF: un comentario de linea con /*
   no esconde el hash real que va debajo'` (`hasher.hash(` sigue detectado) y `'un comentario con
   CRLF que solo MENCIONA la politica sigue sin contar como referencia'`.

## Verificacion ejecutada

- `pnpm run typecheck` → limpio, sin ningun error (ni siquiera el de
  `configuracion/usuarios/components/index.ts` mencionado como conocido; no aparecio en esta
  corrida).
- `pnpm run lint` → limpio, sin hallazgos.
- `pnpm exec vitest run tests/guards/guard-arquitectura-modulos.test.ts
  tests/guards/guard-firma-sesion-unica.test.ts tests/guards/guard-middleware-edge.test.ts
  tests/guards/guard-password-never-plaintext.test.ts
  tests/guards/guard-politica-de-contrasenas.test.ts` → antes del fix, 5 en rojo (el defecto
  diagnosticado); despues del fix: **5 test files passed (5), 97 tests passed (97)**.
- `pnpm run test:guardias` → **43 test files passed (43), 511 tests passed | 9 skipped (520)**,
  sin ninguna otra guardia rota.

Nota operativa: durante la sesion, algo externo al agente reseteo 4 de los 5 archivos a su
estado previo al fix en mitad del trabajo (confirmado comparando contenido leido vs. disco);
se detecto por `git diff --stat` mostrando solo 1 archivo cambiado cuando debian ser 5, y se
rehizo la edicion verificando con `grep` tras cada `Edit` hasta que los 5 quedaron estables en
disco (confirmado con `git diff --stat` mostrando los 5 archivos, antes y despues de correr los
tests).

## Veredicto

Los 5 tests en rojo por el defecto CRLF quedan en verde, con 8 tests de regresion nuevos que
fijan el comportamiento, sin tocar reglas, produccion, ni la feature de usuarios en vuelo;
typecheck, lint y las 43 guardias (511 tests) pasan limpio.
