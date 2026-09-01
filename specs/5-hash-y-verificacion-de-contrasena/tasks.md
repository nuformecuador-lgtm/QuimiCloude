# tasks.md — Feature 5: hash-y-verificacion-de-contrasena

> **Reescrito el 2026-08-06.** La version anterior (scrypt) esta implementada en la rama y
> **hay que borrarla**, no dejarla conviviendo con esta. Esa es T1.

Convenciones: `[P]` = paralelizable con las otras `[P]` del mismo bloque. No hace falta base de
datos ni `.env`: todos los tests son unitarios.

---

### [x] T1. Borrar la implementacion de scrypt
- Dep: ninguna. **Primera tarea, antes de escribir nada nuevo.**
- Eliminar:
  - `lib/utils/password-hash.ts` (se reescribe entero en T3; borrar y volver a crear, no
    parchear)
  - `tests/support/password-test-params.ts`
  - `tests/unit/password/password-hash.test.ts`
  - `tests/unit/password/password-verify-fail-closed.test.ts`
  - `tests/unit/password/password-cost.test.ts`
  - `tests/guards/guard-password-hash-module.test.ts`
- **No hay dependencia que desinstalar:** scrypt venia de `node:crypto` y `package.json` no
  gano ningun paquete de hashing. Verificarlo antes de dar la tarea por hecha.
- Ningun archivo de produccion importa `password-hash` hoy, asi que el borrado no rompe nada;
  comprobarlo con una busqueda antes de borrar.
- **Hecho cuando:** los seis archivos ya no existen, una busqueda de `password-hash` y de
  `password-test-params` en `lib/`, `app/`, `scripts/` y `tests/` no devuelve nada, y
  `pnpm run typecheck` pasa.

### [x] T2. Anadir `bcryptjs`
- Dep: T1.
- `pnpm add bcryptjs`. Si la version instalada no trae sus propios tipos, anadir tambien
  `pnpm add -D @types/bcryptjs` — se comprueba, no se supone.
- **Hecho cuando:** `bcryptjs` esta en `dependencies` (no en `devDependencies`: corre en
  produccion) y `pnpm run typecheck` pasa importandolo.

### [x] T3. Escribir `lib/utils/password-hash.ts`
- Dep: T2.
- Exporta `BCRYPT_ROUNDS = 10`, `BCRYPT_MAX_INPUT_BYTES = 72`, `createPasswordHash(plaintext)` y
  `verifyPasswordHash(plaintext, storedHash)` (`design.md > 2`).
- API **asincrona** de `bcryptjs` (nunca `hashSync` / `compareSync`).
- `createPasswordHash` lanza si `Buffer.byteLength(plaintext, 'utf8') > 72`, con un mensaje que
  **no** incluye la contrasena.
- `verifyPasswordHash` falla cerrado: comprobacion previa de formato + `try/catch`, devuelve
  `false`, nunca lanza (`design.md > 6`).
- Sin `console.*`, sin lectura de `process.env`.
- **Hecho cuando:** `pnpm run typecheck` y `pnpm run lint` pasan y `pnpm run test:guardias`
  sigue verde (en particular `guard-password-never-plaintext`, que barre `lib/`).

### [x] T4. Poner el tope de 64 caracteres en el login
- Dep: ninguna (paralelizable con T2/T3).
- `lib/types/auth.ts`: anadir `CREDENTIAL_MAX_LENGTH = 64`, `PASSWORD_TOO_LONG_ERROR` y el
  `.max(CREDENTIAL_MAX_LENGTH)` al campo `password` del `loginInputSchema`.
- `lib/actions/login.ts`: en `toFieldErrors`, distinguir el issue `too_big` para devolver
  `PASSWORD_TOO_LONG_ERROR` en vez de `REQUIRED_FIELD_ERROR` (`design.md > 5`).
- **No cambiar** `LoginInput` ni `LoginFormState`: la feature 7 los dejo congelados en su forma.
- **Hecho cuando:** `pnpm run typecheck` pasa y `tests/unit/login-action.test.ts` (feature 7)
  sigue verde sin modificarlo.

### [x] T5. [P] `tests/unit/password/password-hash.test.ts`
- Dep: T3.
- Casos:
  1. "el valor guardado no contiene la contrasena en claro" y empieza por `$2` — **(R1)**
  2. "dos transformaciones de la misma contrasena dan valores distintos, y las dos verifican
     correctamente" — el segundo assert es el que impide que el caso pase con una funcion rota
     que devuelva basura distinta cada vez. **(R2)**
  3. "verifica la contrasena correcta" (incluye una con espacios y una con acentos) — **(R3)**
  4. "rechaza la contrasena incorrecta": difiere en el primer caracter, en el ultimo, solo en
     mayusculas, y por longitud — **(R4)**
  5. "el valor guardado declara 10 rondas": extrae el segmento de coste del hash y exige `10`
     (si alguien cambia `BCRYPT_ROUNDS`, cae) — **(R6)**
  6. "el valor guardado son 60 caracteres ASCII" y casa con el formato de bcrypt — **(R7)**
  7. "rechaza una contrasena de mas de 72 bytes UTF-8": una de 73 caracteres ASCII lanza; una de
     40 caracteres acentuados (80 bytes, pero solo 40 de `length`) **tambien** lanza — este
     segundo caso es el que distingue bytes de caracteres; y una de exactamente 72 bytes **no**
     lanza — **(R9)**
  8. "el error de longitud no incluye la contrasena en su mensaje" — **(R8, R9)**
- **Hecho cuando:** los 8 casos pasan.

### [x] T6. [P] `tests/unit/password/password-verify-fail-closed.test.ts`
- Dep: T3.
- Tabla de valores guardados invalidos, cada uno con nombre: cadena vacia; solo espacios; `'$2b$'`;
  un hash bcrypt al que le falta un caracter; uno al que le sobra uno; prefijo `$9z$10$`; texto
  suelto; un hash con un caracter fuera del alfabeto de bcrypt; y `null` / `undefined` forzados
  con `as unknown as string`.
- Cada caso afirma **dos cosas**: devuelve `false` y **no lanza**.
- **Caso de control obligatorio en el mismo archivo:** un hash valido con su contrasena correcta
  devuelve `true`. Sin el, una implementacion que devolviera siempre `false` pasaria el archivo
  entero.
- **Hecho cuando:** todos los casos pasan y existe el caso de control.

### [x] T7. [P] `tests/guards/guard-password-hash-module.test.ts`
- Dep: T3.
- Lee el fuente de `lib/utils/password-hash.ts` como texto y afirma: no contiene ningun
  `console.`, ni `hashSync`, ni `compareSync`. **(R8)**
- **Autocomprobacion obligatoria** (mismo patron que las guardias de la feature 1): la regla se
  ejerce ademas sobre un fuente sintetico que la viola y se afirma que la guardia lo detecta. Un
  `expect(...).toBe(false)` sobre un archivo que ya cumple no demuestra que la guardia funcione.
- Vive en `tests/guards/` porque recorre archivos, no el grafo de imports: la selecciona
  `pnpm run test:guardias`.
- **Hecho cuando:** `pnpm run test:guardias` pasa con las tres guardias y el caso sintetico
  comprobado en rojo.

### [x] T8. `tests/unit/password-max-length.test.ts`
- Dep: T4.
- Casos sobre la Server Action `loginAction`, con `FormData`:
  1. "rechaza una contrasena de 65 caracteres": devuelve `status: 'invalid'` con
     `fieldErrors.password === PASSWORD_TOO_LONG_ERROR` — **(R10)**
  2. "no intenta autenticar cuando la contrasena excede el maximo": espia
     `verifyCredentials` y exige **cero llamadas** — es la mitad de R10 que el mensaje de error
     no demuestra — **(R10)**
  3. "acepta una contrasena de exactamente 64 caracteres": no produce `fieldErrors.password`
     (comprueba que el tope no esta desplazado en uno) — **(R10)**
  4. "una contrasena vacia sigue dando el error de campo obligatorio": el mensaje nuevo no se
     comio el viejo — **(R10)**
- Los asserts van contra las constantes exportadas (`PASSWORD_TOO_LONG_ERROR`,
  `CREDENTIAL_MAX_LENGTH`), nunca contra el literal, como hizo la feature 7.
- **Hecho cuando:** los 4 casos pasan y `tests/unit/login-action.test.ts` sigue verde.

### [x] T9. Cerrar la tanda
- Dep: T1-T8.
- `./init.sh --rapido`. El `./init.sh` completo y el PR los corre el leader
  (`AGENTS.md > Regla del gate`).
- Documentar el mapa `R<n> → test` de abajo en
  `progress/impl_2-hash-y-verificacion-de-contrasena.md` con la salida real de los tests, y
  **reescribir** en ese archivo lo que quedo de la version scrypt, para que no queden dos
  historias.
- **Hecho cuando:** `./init.sh --rapido` termina en verde y cada `R1`-`R10` tiene su test
  ejecutado (no solo escrito).

---

## Trazabilidad `R<n> → test`

Abreviaturas: **H** = `tests/unit/password/password-hash.test.ts` · **F** =
`tests/unit/password/password-verify-fail-closed.test.ts` · **G** =
`tests/guards/guard-password-hash-module.test.ts` · **L** =
`tests/unit/password-max-length.test.ts`.

| R | Test |
| --- | --- |
| R1 | H · "el valor guardado no contiene la contrasena en claro" |
| R2 | H · "dos transformaciones de la misma contrasena dan valores distintos, y las dos verifican correctamente" |
| R3 | H · "verifica la contrasena correcta" |
| R4 | H · "rechaza la contrasena incorrecta" (primer caracter, ultimo, mayusculas, longitud) |
| R5 | F · tabla de valores guardados invalidos (`false` y no lanza) + caso de control valido |
| R6 | H · "el valor guardado declara 10 rondas" |
| R7 | H · "el valor guardado son 60 caracteres ASCII con formato bcrypt" |
| R8 | G · "el modulo no escribe en ningun canal de salida" (con caso sintetico) · H · "el error de longitud no incluye la contrasena" |
| R9 | H · "rechaza una contrasena de mas de 72 bytes UTF-8" (73 ASCII, 40 acentuados = 80 bytes, y 72 bytes exactos que si pasa) |
| R10 | L · los cuatro casos: 65 caracteres rechazados con su mensaje, cero llamadas a `verifyCredentials`, 64 aceptados, vacia sigue dando obligatorio |

Los 10 requisitos tienen test ejecutable. R8 se apoya en una guardia estatica porque "no escribe
en ningun canal de salida" es una propiedad del fuente que ningun test de comportamiento observa.
