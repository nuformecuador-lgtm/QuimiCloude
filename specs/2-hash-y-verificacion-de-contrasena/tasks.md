# tasks.md — Feature 2: hash-y-verificacion-de-contrasena

Convenciones: `[P]` = paralelizable con las otras `[P]` del mismo bloque.

**No hay tareas bloqueadas y no hace falta base de datos ni `.env`.** Todos los tests de esta
feature son unitarios y estaticos: nada toca Postgres, nada toca Prisma, no hay migracion.

**Presupuesto de coste de la suite (leelo antes de escribir el primer test).** Con los
parametros de produccion, una transformacion cuesta del orden de 10^2 ms. Regla dura:

- Todo caso de comportamiento usa **parametros de test** (`{ n: 1024, r: 8, p: 1 }`, ~1 MiB).
- **Como maximo 4 transformaciones con parametros de produccion en TODA la suite**, y todas
  viven en `tests/unit/password/password-cost.test.ts` (T7).
- El resto de archivos **no puede** importar `DEFAULT_SCRYPT_PARAMS` para hashear. La tarea T9
  lo comprueba, no queda en la buena voluntad.
- Objetivo verificable: el tiempo que esta feature anade a `pnpm test` es **< 3 s** (T10).

Nomenclatura obligatoria de la API: `createPasswordHash` / `verifyPasswordHash`, parametros
`plaintext` y `storedHash`. **No es preferencia de estilo:** `hashPassword`, `verifyPassword` y
un parametro llamado `password` ponen en rojo la guardia
`tests/guards/guard-password-never-plaintext.test.ts` de la feature 1. El porque, con la tabla
de veredictos, esta en `design.md > 9.1`.

---

## Bloque A — Modulo

### [x] T1. Escribir `lib/utils/password-hash.ts`
- Dep: ninguna.
- Exporta `ScryptCostParams`, `DEFAULT_SCRYPT_PARAMS` (`n: 65536, r: 8, p: 2`),
  `MAX_SCRYPT_MEMORY_BYTES` (192 MiB), `createPasswordHash`, `verifyPasswordHash`
  (`design.md > 9`).
- `crypto.scrypt` **asincrono** envuelto en promesa (nunca `scryptSync`), `maxmem` explicito,
  sal de 16 bytes de `crypto.randomBytes`, clave derivada de 32 bytes, `normalize('NFC')` sobre
  el `plaintext` en las dos funciones, comparacion con `crypto.timingSafeEqual` previa
  comprobacion de longitud.
- Formato de salida exactamente el de `design.md > 4`:
  `$scrypt$n=<n>,r=<r>,p=<p>$<sal base64url>$<clave base64url>`.
- Parseo de `verifyPasswordHash`: valida **antes** de derivar (algoritmo, 5 segmentos, rangos de
  `n`/`r`/`p`, potencia de dos, decodificacion base64url, longitudes de sal y clave, techo de
  memoria) y devuelve `false` ante cualquier fallo, sin lanzar y sin registrar nada.
- Sin `console.*`, sin lectura de `process.env`, sin dependencias nuevas en `package.json`.
- **Hecho cuando:** `pnpm run typecheck` y `pnpm run lint` pasan, `package.json` no cambio, y
  `pnpm run test:guardias` (con las guardias de la feature 1) sigue verde — en particular
  `guard-password-never-plaintext`, que barre `lib/`.

### [x] T2. [P] Helper de parametros baratos para tests
- Dep: T1.
- `tests/support/password-test-params.ts` exporta `TEST_SCRYPT_PARAMS = { n: 1024, r: 8, p: 1 }`
  con un comentario que diga que son **criptograficamente insuficientes** y que existen solo
  para que la suite sea usable.
- No vive en `lib/`: no debe poder importarse desde codigo de produccion.
- **Hecho cuando:** typecheck pasa y ningun archivo de `lib/` o `app/` lo importa.

---

## Bloque B — Tests de comportamiento (parametros de test, baratos)

### [x] T3. [P] `tests/unit/password/password-hash.test.ts`
- Dep: T1, T2.
- Casos:
  1. "el valor almacenado no contiene la contrasena en ninguna codificacion reversible" — busca
     la contrasena como texto plano, en base64, en base64url y en hexadecimal dentro del valor.
     **(R1)**
  2. "dos transformaciones de la misma contrasena producen sales distintas" — 200 transformaciones,
     decodifica el segmento de sal, exige 200 valores distintos y 16 bytes cada uno. **(R2, R3)**
  3. "dos transformaciones de la misma contrasena producen claves derivadas distintas" — sobre la
     misma tanda, aisla el **ultimo** segmento y exige 200 valores distintos. Este es el assert que
     impide la tautologia descrita en `design.md > 5`: comparar el valor entero completo pasaria
     aunque la sal no entrara en la derivacion. **(R2)**
  4. "las 200 verificaciones de la tanda devuelven true" — una sal que varia no sirve si rompe la
     verificacion. **(R2, R6)**
  5. "verifica correctamente la contrasena correcta" (incluye contrasena con espacios, emoji y
     acentos). **(R6)**
  6. "rechaza una contrasena incorrecta que difiere en el primer caracter, en el ultimo, solo en
     mayusculas, y por longitud". **(R7)**
  7. "no trunca: dos contrasenas que comparten 72 bytes y difieren despues no verifican cruzado" —
     construye `'a'.repeat(72) + 'X'` y `'a'.repeat(72) + 'Y'` y comprueba las cuatro
     combinaciones. **(R4)**
  8. "una contrasena en NFD verifica contra el hash de su forma NFC, y al reves" — usa un par
     conocido (`'ñ'` frente a `'ñ'`). **(R5)**
  9. "el valor almacenado declara el algoritmo y sus parametros" — comprueba el prefijo `$scrypt$`
     y que los `n`, `r`, `p` del segmento son los usados. **(R12)**
  10. "verifica un valor generado con parametros distintos de los vigentes, sin recibir ninguna
      configuracion" — genera con `{n:1024,...}` y con `{n:2048,...}` y verifica ambos con la
      misma llamada de dos argumentos. **(R9, R12, R13)**
  11. "el valor almacenado son a lo sumo 256 caracteres ASCII imprimibles" — con parametros de
      test y con `DEFAULT_SCRYPT_PARAMS` **sin hashear** (comprueba la cota de longitud sobre el
      formato, no genera un hash caro de mas). **(R15)**
- **Hecho cuando:** los 11 casos pasan y el archivo no importa `DEFAULT_SCRYPT_PARAMS` para
  hashear.

### [x] T4. [P] `tests/unit/password/password-verify-fail-closed.test.ts`
- Dep: T1, T2.
- Tabla de valores almacenados invalidos, cada uno con su nombre: cadena vacia; solo espacios;
  `'$scrypt$'`; menos de 5 segmentos; mas de 5 segmentos; algoritmo `$bcrypt$`; algoritmo vacio;
  parametros sin `n`; `n` no numerico; `n` que no es potencia de dos (`65535`); `n` bajo el
  minimo (`512`); `r = 0`; `p = 0`; `p = 99`; sal que no decodifica en base64url; sal de 8 bytes;
  clave de 4 bytes; clave de 128 bytes; un hash valido con un caracter alterado en la clave; y
  `null` / `undefined` / un numero forzados con un `as unknown as string`.
- Cada caso afirma **dos cosas**: que devuelve `false` y que **no lanza**. **(R10)**
- Caso aparte de R11: un valor almacenado con `n = 2^30` devuelve `false` en **menos de 100 ms**
  (si llegara a `crypto.scrypt` tardaria o reventaria por memoria; la cota temporal es lo que
  demuestra que el rechazo ocurre en el parseo, antes de reservar nada). **(R11)**
- Caso de control, para que la tabla no sea vacua: un valor almacenado **valido** con la
  contrasena correcta devuelve `true` en el mismo archivo. Sin el, una implementacion que
  devolviera siempre `false` pasaria el archivo entero.
- **Hecho cuando:** todos los casos pasan y existe el caso de control.

---

## Bloque C — Tests de coste y de propiedades estaticas

### [x] T5. [P] `tests/guards/guard-password-hash-module.test.ts`
- Dep: T1.
- Lee el fuente de `lib/utils/password-hash.ts` como texto y afirma:
  1. contiene `timingSafeEqual` y **no** compara la clave derivada con `===`, `==`,
     `Buffer.compare`, `.equals(` ni `localeCompare`. **(R8)**
  2. no contiene `scryptSync` ni `pbkdf2Sync`. **(R16)**
  3. no contiene ningun `console.`. **(R17)**
  4. barre el arbol y comprueba que ningun `middleware.ts` ni ningun archivo con
     `runtime = 'edge'` importa `password-hash`. **(R18)**
- **Autocomprobacion obligatoria** (mismo patron que las guardias de la feature 1): cada una de
  las cuatro reglas se ejerce ademas sobre fuentes **sinteticos** que la violan y se afirma que
  la guardia los detecta. La regla 4 hoy no tiene ningun archivo Edge real que barrer: sin su
  caso sintetico seria un assert vacio disfrazado de proteccion.
- La guardia recorre archivos, no imports: por eso vive en `tests/guards/` y la selecciona
  `pnpm run test:guardias` (`vitest run guard`).
- **Hecho cuando:** `pnpm run test:guardias` pasa con las tres guardias (las dos de la feature 1
  y esta) y cada regla tiene su caso sintetico en rojo comprobado.

### [x] T6. Medir el coste real con los parametros por defecto
- Dep: T1.
- Ejecutar 5 transformaciones con `DEFAULT_SCRYPT_PARAMS` y registrar mediana y maximo, junto
  con la version de Node (`node -v`) y la maquina, en
  `progress/impl_2-hash-y-verificacion-de-contrasena.md`.
- Aplicar la regla de `design.md > 3.3`: si la mediana supera **1 s**, bajar a
  `{ n: 32768, r: 8, p: 3 }`; si baja de **50 ms**, subir a `{ n: 131072, r: 8, p: 1 }`. Si se
  cambia, actualizar `design.md > 3.2` con la medicion que lo motiva.
- Comprobar tambien que la llamada **no** falla por `maxmem` (el fallo seria
  `ERR_CRYPTO_INVALID_SCRYPT_PARAMS`): es la trampa anotada en `design.md > 3.2`.
- **Hecho cuando:** la medicion esta pegada en el archivo de progreso y los parametros vigentes
  quedan justificados por ella, no por la spec.

### [x] T7. `tests/unit/password/password-cost.test.ts` — el unico test caro
- Dep: T1, T6.
- Tres casos, con **4 transformaciones de coste real como maximo en total** y `timeout` de 15 s:
  1. "los parametros por defecto exigen al menos 64 MiB por transformacion" — calcula
     `128 * n * r` sobre `DEFAULT_SCRYPT_PARAMS` y exige `>= 67_108_864`. Sin hashear. **(R14)**
  2. "una transformacion con los parametros por defecto cuesta al menos 50 ms" — una sola
     transformacion medida. Cota **inferior**: es la que detecta que alguien abarato el coste;
     una cota superior seria un rojo aleatorio en una maquina cargada. **(R14)**
  3. "la transformacion no bloquea el hilo principal" — arranca un `setInterval` de 5 ms,
     `await` de una transformacion con parametros por defecto, y exige que el intervalo haya
     disparado **al menos 3 veces** durante la espera. Con `scryptSync` el contador se queda en 0.
     **(R16)**
- **Hecho cuando:** los tres pasan, el archivo declara en un comentario su presupuesto de
  transformaciones caras, y `pnpm test` completo no supera el objetivo de T10.

---

## Bloque D — Anti-vacuidad y cierre

### [x] T8. Comprobacion por mutacion (obligatoria, se registra)
- Dep: T3, T4, T5, T7.
- Por cada mutacion: aplicarla en local, correr `pnpm test`, **confirmar rojo y anotar que test
  cayo**, revertir. Si alguna mutacion deja la suite en verde, el test que decia protegerla no
  sirve y hay que rehacerlo antes de seguir.

  | # | Mutacion | Test que DEBE caer |
  | --- | --- | --- |
  | M1 | Sal fija a una constante en vez de `randomBytes` | T3.2 y T3.3 (R2, R3) |
  | M2 | Sal de 4 bytes en vez de 16 | T3.2 (R3) |
  | M3 | `timingSafeEqual` sustituido por `===` | T5.1 (R8) |
  | M4 | El parseo devuelve `true` ante una cadena vacia | T4 (R10) |
  | M5 | Se quita el techo de memoria del parseo | T4 caso R11 (cota de 100 ms) |
  | M6 | Se trunca el `plaintext` a 72 bytes antes de derivar | T3.7 (R4) |
  | M7 | Se quita el `normalize('NFC')` | T3.8 (R5) |
  | M8 | `DEFAULT_SCRYPT_PARAMS.n` baja a 1024 | T7.1 y T7.2 (R14) |
  | M9 | `crypto.scrypt` se cambia por `scryptSync` | T5.2 y T7.3 (R16) |
  | M10 | Se anade un `console.log(plaintext)` | T5.3 (R17) y `guard-password-never-plaintext` |

- **Hecho cuando:** las 10 mutaciones estan probadas y su resultado (rojo esperado, test que
  cayo) esta pegado en `progress/impl_2-hash-y-verificacion-de-contrasena.md`.

- **Ejecutadas el 2026-08-06. Dos correcciones a esta tabla, con su detalle en el archivo de
  progreso (secciones 6.1 y 6.2):**
  - **M5 sobrevivio** en la primera pasada: el unico caso de R11 (`n = 2^30`) lo rechazaba el rango
    de `n`, no el techo de memoria, y la cota de 100 ms no distinguia un rechazo en el parseo de un
    fallo rapido de `crypto.scrypt` por `maxmem`. El test de R11 se rehizo (espia sobre
    `crypto.scrypt` + caso `n = 2^20, r = 32` con ambos parametros en rango) y ahora M5 muere.
  - **M10 no cae por `guard-password-never-plaintext`**, solo por la regla 3 de la guardia nueva:
    `console.log(plaintext)` no es una declaracion y `plaintext` no es un identificador prohibido.
    La expectativa escrita en la columna derecha era incorrecta; R17 sigue cubierto.

### [x] T9. [P] Verificar el presupuesto de coste
- Dep: T3, T4, T7.
- Comprobar por barrido que **solo** `password-cost.test.ts` hashea con parametros de produccion:
  ningun otro archivo de `tests/` llama a `createPasswordHash` sin pasar `params`.
- **Hecho cuando:** el barrido no encuentra ninguna llamada sin `params` fuera de
  `password-cost.test.ts`.

### [x] T10. Gate y tiempo de suite  — *parcial: el delta se midio sobre los archivos de la feature (2.17 s < 3 s). `pnpm test` completo y `./init.sh --rapido` los corre el leader (`AGENTS.md > Regla del gate`).*
- Dep: T1-T9.
- Medir `pnpm test` antes y despues de la feature (`git stash` o comparando con `origin/dev`) y
  registrar la diferencia. Objetivo: **< 3 s**.
- `./init.sh --rapido` al cerrar la tanda. El `./init.sh` completo y el merge con `dev` los corre
  el leader antes del PR (`AGENTS.md > Regla del gate`).
- **Hecho cuando:** el delta de tiempo esta registrado y `./init.sh --rapido` termina en verde.

### [x] T11. Documentar el mapa `R<n> → test`
- Dep: T10.
- Copiar la tabla de trazabilidad de abajo a
  `progress/impl_2-hash-y-verificacion-de-contrasena.md`, con la salida real de los tests y el
  resultado de las mutaciones de T8.
- **Hecho cuando:** cada `R1`-`R18` tiene al menos un test **ejecutado** (no solo escrito) y el
  reviewer lo valida.

### [x] T12. Cerrar la pregunta abierta heredada de la feature 1
- Dep: T11.
- La pregunta abierta 3 de `specs/1-modelo-usuarios-y-roles/design.md > 11` (¿hacen falta
  columnas `password_algorithm` / `password_updated_at`?) queda respondida **NO** en
  `design.md > 8` de esta feature. Anotarlo en
  `progress/impl_2-hash-y-verificacion-de-contrasena.md` para que el reviewer no la busque
  abierta, y llevar a `progress/current.md > Deudas y cosas abiertas` las preguntas 3 y 4 de
  `requirements.md`, que apuntan a la feature 4. La pregunta 5 (pepper) **ya no va ahi**: la
  cerro el humano el 2026-08-06 con un no (`design.md > 8.1`).
- **Hecho cuando:** la respuesta esta escrita y las preguntas que sobreviven estan anotadas donde
  las va a leer quien arranque la feature 3 o la 4.

---

## Trazabilidad `R<n> → test`

Abreviaturas: **H** = `tests/unit/password/password-hash.test.ts` · **F** =
`tests/unit/password/password-verify-fail-closed.test.ts` · **C** =
`tests/unit/password/password-cost.test.ts` · **G** =
`tests/guards/guard-password-hash-module.test.ts` · **G1** =
`tests/guards/guard-password-never-plaintext.test.ts` (heredada de la feature 1).

| R | Test | Mutacion que lo respalda |
| --- | --- | --- |
| R1 | H · "el valor almacenado no contiene la contrasena en ninguna codificacion reversible" | — |
| R2 | H · "dos transformaciones producen sales distintas" · H · "dos transformaciones producen claves derivadas distintas" · H · "las 200 verificaciones de la tanda devuelven true" | M1 |
| R3 | H · "dos transformaciones producen sales distintas" (16 bytes cada una) | M1, M2 |
| R4 | H · "no trunca: dos contrasenas que comparten 72 bytes y difieren despues no verifican cruzado" | M6 |
| R5 | H · "una contrasena en NFD verifica contra el hash de su forma NFC, y al reves" | M7 |
| R6 | H · "verifica correctamente la contrasena correcta" | — |
| R7 | H · "rechaza una contrasena incorrecta que difiere en el primer caracter, en el ultimo, solo en mayusculas, y por longitud" | — |
| R8 | G · "la comparacion usa timingSafeEqual y no cortocircuita" | M3 |
| R9 | H · "verifica un valor generado con parametros distintos de los vigentes, sin recibir ninguna configuracion" | — |
| R10 | F · tabla de 21 valores almacenados invalidos (`false` y no lanza) + caso de control valido | M4 |
| R11 | F · "un valor almacenado con n = 2^30 devuelve false en menos de 100 ms" | M5 |
| R12 | H · "el valor almacenado declara el algoritmo y sus parametros" | — |
| R13 | H · "verifica un valor generado con parametros distintos de los vigentes" | — |
| R14 | C · "los parametros por defecto exigen al menos 64 MiB" · C · "una transformacion cuesta al menos 50 ms" | M8 |
| R15 | H · "el valor almacenado son a lo sumo 256 caracteres ASCII imprimibles" | — |
| R16 | C · "la transformacion no bloquea el hilo principal" · G · "el modulo no usa scryptSync" | M9 |
| R17 | G · "el modulo no escribe en ningun canal de salida" · G1 (heredada) | M10 |
| R18 | G · "ningun archivo Edge importa el modulo de contrasena" (con su caso sintetico) | — |

Los 18 requisitos tienen test ejecutable. R8, R17 y R18 se cierran **solo** con guardias
estaticas y es deliberado: un test de reloj de pared para el tiempo constante es ruido
estadistico (`design.md > 6`), y las otras dos son propiedades del arbol de archivos que ningun
test de comportamiento puede observar.
