# review_2-hash-y-verificacion-de-contrasena.md

> Reviewer · 2026-08-06 · rama `feature/2-hash-y-verificacion-de-contrasena`, ya mergeada con
> `origin/dev`. Worktree `.worktrees/2-hash-y-verificacion-de-contrasena/`.
> Nada de lo que sigue se copia de la bitacora del implementer: todo se volvio a ejecutar aqui.

## Veredicto

**OK (APROBADO).** Cero hallazgos bloqueantes. Cuatro hallazgos menores, ninguno condiciona el merge.

---

## 1. Checklist de CHECKPOINTS.md

### Especificacion
- [x] `specs/2-.../requirements.md` con R1-R18 en EARS, numerados.
- [x] `specs/2-.../design.md` con cuatro alternativas descartadas y su porque (bcrypt, argon2id,
      PBKDF2, Supabase Auth).
- [x] `specs/2-.../tasks.md` con T1-T12 **todas** marcadas `[x]`. T10 llevaba la nota "parcial: el
      init.sh completo lo corre el leader" — **corrido aqui y en verde**, la nota queda saldada.

### Trazabilidad
- [x] Cada `R<n>` mapea a un test concreto que lo verifica. Detalle en el §2, requisito por requisito.
- [x] `progress/impl_2-...md > 5` contiene el mapa `R<n> -> test` con la salida real.

### Calidad de codigo
- [x] `pnpm run typecheck` sin errores.
- [x] `pnpm run lint` sin hallazgos.
- [x] `pnpm test`: **13 archivos, 143 tests, todos verdes, 11.53 s** (suite completa del repo tras el
      merge, no el subconjunto de la feature).
- [x] E2E: no aplica todavia. Esta feature no expone flujo alcanzable (ni ruta, ni action, ni UI); el
      flujo critico de autenticacion es la feature 4 y ahi si tendra que haber E2E.

### Datos y seguridad
- [x] Ninguna tabla nueva -> RLS no aplica. Verificado que **no hay ningun cambio de esquema**:
      `git diff origin/dev -- db/` vacio, sin migracion nueva y sin columna nueva (ni `salt`, ni
      `password_algorithm`, ni `password_updated_at`).
- [x] Ningun permiso que validar en service: el modulo no expone operacion de negocio.
- [x] Ninguna lectura/escritura de datos: no toca Prisma ni Supabase.
- [x] Migraciones/`down.sql`: `./init.sh` lo comprueba y pasa; no hay migracion nueva.
- [x] **Sin secretos y sin contexto hardcodeado.** `process.env` no aparece en el modulo salvo dentro
      de un comentario. Los parametros de coste no se leen de entorno a proposito (`design.md > 11`).
- [x] Webhooks: no aplica.

### Patron de capas
- [x] Helper puro en `lib/utils/`, que es lo que `docs/architecture.md` reserva para eso. Sin
      controller, sin service, sin repositorio, sin HTTP. La decision de **no** crear
      `PasswordService` + `IPasswordHasher` esta razonada en `design.md > 2` y es correcta.
- [x] `lib/interfaces/` no se toca porque no se anade ninguna interfaz.

### Permisos / Configuracion
- [x] No aplica (sin paginas, sin cookies, sin actions).
- [x] Nada que cambie entre entornos quedo hardcodeado.

### Verificacion final
- [x] `./init.sh` completo termina en `== init OK ==`.
- [x] Este archivo existe y su veredicto es OK.
- [ ] Entrada en `progress/history.md` y desmontaje del worktree: **pendientes del leader**.

---

## 2. Trazabilidad R1-R18, leyendo los asserts

Abreviaturas: **H** = `tests/unit/password/password-hash.test.ts` · **F** =
`tests/unit/password/password-verify-fail-closed.test.ts` · **C** =
`tests/unit/password/password-cost.test.ts` · **G** =
`tests/guards/guard-password-hash-module.test.ts`.

| R | Test | Que afirma de verdad (no por vacuidad) | Veredicto |
| --- | --- | --- | --- |
| R1 | H · "no contiene la entrada en ninguna codificacion reversible" | Busca el plaintext en claro, base64, base64 sin padding, base64url y hex dentro del valor. | OK |
| R2 | H · sales distintas · claves derivadas distintas · 200 verificaciones true | Tanda de 200 de la MISMA entrada. El assert que cuenta es el del **ultimo segmento** aislado: 200 claves distintas. Evita la tautologia de `design.md > 5`. Muere con M1. | OK |
| R3 | H · "200 sales distintas, de 16 bytes cada una" | Decodifica cada sal y exige 16 bytes. Muere con M2. | OK (ver menor 3) |
| R4 | H · "no trunca: 72 bytes compartidos" | Comprueba `byteLength === 72` del prefijo y las **cuatro** combinaciones cruzadas: dos true, dos false. | OK |
| R5 | H · "NFD verifica contra el hash de NFC, y al reves" | El par se escribe con escapes Unicode para que ninguna herramienta lo normalice en disco, y lo comprueba antes de usarlo. Verifica en las dos direcciones. | OK |
| R6 | H · "verifica la entrada correcta" | Cinco entradas: simple, con espacios en los bordes, con emoji, acentuada y **vacia**. | OK |
| R7 | H · "rechaza una entrada incorrecta" | Seis candidatas: primer caracter, ultimo, mayusculas, mas corta, mas larga y vacia. Cubre posicion y longitud. | OK |
| R8 | G · regla 1 (+ sintetico) | El fuente usa `timingSafeEqual` y ninguna linea que mencione material derivado lo compara con algo que cortocircuite. El sintetico ejerce las cuatro formas malas **y** las dos buenas (comparar longitudes, guarda de ausencia), asi que la exencion no es un agujero. Muere con M3. | OK |
| R9 | H · "verifica valores generados con parametros distintos, sin configuracion" | Dos argumentos y nada mas. Incluye los dos negativos, asi que no pasa por vacuidad. | OK |
| R10 | F · 22 casos invalidos + clave alterada + **caso de control** | Cada caso afirma dos cosas: que no lanza y que devuelve `false` (si lanza, el resultado se sustituye por un string, o sea que un throw no puede colarse como `false`). El caso de control con hash valido devolviendo `true` impide que un `return false` constante pase el archivo. Muere con M4. | OK |
| R11 | F · dos bombas + "el contador de derivaciones esta vivo" | Ver §3.1. | OK |
| R12 | H · "declara el algoritmo y sus parametros" | Prefijo, 5 segmentos y coste coincidente, con **dos** juegos de parametros distintos. | OK |
| R13 | H · mismo caso de R9 | Genera con dos juegos de parametros, comprueba que los segmentos de coste difieren y verifica ambos. Rotacion real. | OK |
| R14 | C · 64 MiB (aritmetica sobre 128*n*r) · C · >= 50 ms medidos | Cota **inferior** de tiempo, deliberada. Muere con M8 (4 rojos). | OK |
| R15 | H · "a lo sumo 256 caracteres ASCII imprimibles" | Regex de ASCII imprimible y cota de 256 sobre el hash barato, mas la cota del formato con los parametros de produccion **sin hashear** (longitud exacta 90). | OK |
| R16 | C · "no bloquea el hilo principal" · G · regla 2 | El intervalo de 5 ms exige >= 3 ticks durante la derivacion; con `scryptSync` se queda en 0. Muere con M9 (3 rojos, uno de comportamiento). | OK |
| R17 | G · regla 3 (+ sintetico) | Sin canales de salida en el fuente; el sintetico detecta tres formas y no marca un comentario. Muere con M10. | OK (ver menor 2) |
| R18 | G · regla 4 (+ sintetico) | Barre `app/`, `lib/`, `scripts/` y el `middleware.ts` de raiz; el barrido real es hoy vacio y el test lo sabe: exige que la lista de archivos no sea vacia y anade tres sinteticos (middleware, runtime edge con import, runtime edge con require) y tres controles negativos. Sin los sinteticos seria un assert vacio; con ellos no lo es. | OK |

**Ningun requisito pasa por vacuidad. Ninguno queda sin test. R1-R18 completos.**

Merece reconocerse que los tres puntos donde el riesgo de test vacuo era real (unicidad de sal,
tabla de fallo cerrado, guardias estaticas) traen **su propio caso de control**, sin que hubiera que
pedirlo.

## 3. Las 10 mutaciones, re-ejecutadas por el reviewer

No me fie de la bitacora: aplique las 10 sobre una copia intacta del modulo y corri la suite con
cada una. Resultado comparado con lo que declara `progress/impl_2-...md > 6`:

| # | Mutacion | Resultado del reviewer | Coincide |
| --- | --- | --- | --- |
| M1 | sal fija | 2 failed: sales distintas · claves derivadas distintas | si |
| M2 | sal de 4 bytes | 1 failed: sales distintas (16 bytes) | si |
| M3 | comparacion con `===` sobre hex | 1 failed: G regla 1 | si |
| M4 | cadena vacia devuelve true | 1 failed: F "cadena vacia" | si |
| M5 | se quita el techo de memoria | **1 failed** (ver 3.1) | si |
| M6 | truncado a 72 bytes | 1 failed: H "no trunca" | si |
| M7 | sin normalize NFC | 1 failed: H NFD/NFC | si |
| M8 | n por defecto a 1024 | 4 failed: 64 MiB · 50 ms · no bloquea · cota de 256 (colateral) | si |
| M9 | derivacion sincrona | 3 failed: G regla 2 · C no bloquea · F "el contador esta vivo" | si |
| M10 | escritura del plaintext a la salida | 1 failed: G regla 3. `guard-password-never-plaintext` **verde** | si |

Tras cada pasada el modulo se restauro y `git diff` quedo vacio. Estado final del worktree: limpio.

### 3.1 M5 muere ahora, y el espia no es tautologico

**Muere.** Con el techo de memoria eliminado, el rojo es el caso nuevo:

```
x un valor almacenado con n = 2^20 y r = 32 (4 GiB), ambos dentro de rango
  devuelve false en menos de 100 ms y sin derivar nada (R11)
AssertionError: expected 5 to be 4     <- contador de llamadas a la derivacion
```

El diagnostico del implementer era correcto y la correccion ataca la causa, no el sintoma:

1. **El caso viejo (n = 2^30) no probaba el techo de memoria:** excede tambien el rango maximo de
   `n`, asi que lo rechazaba el rango y quitar el techo no cambiaba nada. Se mantiene en la tabla
   como caso de R10, que es lo que realmente es.
2. **La cota de 100 ms sola tampoco servia**, y esto es lo fino del hallazgo: como el limite de
   memoria se pasa explicitamente a la derivacion, un valor que llegue a ella falla **rapido** con
   `ERR_CRYPTO_INVALID_SCRYPT_PARAMS` y el `try/catch` lo convierte en `false`. Rapido y en verde,
   con la memoria ya rechazada por otro. El unico observable que distingue "rechazado en el parseo"
   de "rechazado por la propia derivacion" es que la derivacion **no se invoque**, que es literalmente
   lo que exige R11.
3. **El caso nuevo (n = 2^20, r = 32, p = 1) tiene los tres parametros dentro de rango** —verificado
   contra las constantes de rango del modulo— y pide 4 GiB: solo lo puede rechazar el techo. Es el
   caso correcto.

**El espia no vuelve tautologico el test, y lo comprobe aparte.** Un mock mal enganchado dejaria el
contador en 0 pase lo que pase y el assert seria verde por accidente. Tres cosas lo impiden:
- el mock **delega en el original**, no lo sustituye: los demas casos siguen derivando de verdad;
- existe el caso de control **"el contador de derivaciones esta vivo"**, que exige que una
  verificacion legitima lo incremente;
- ese caso de control **cae con M9** (mi ejecucion lo confirma): cuando la derivacion deja de pasar
  por la funcion espiada, el contador se queda quieto y el test se pone rojo. Un espia muerto no
  habria podido producir ese rojo.

Los asserts previos (cota de 100 ms, `false`, no lanza) siguen ahi: la correccion **anadio**, no
debilito.

### 3.2 La correccion sobre M10 es correcta, no una excusa

Verificado leyendo la guardia y ejecutandola, no aceptando el argumento:

- su extractor de identificadores en TS/JS solo recoge tres formas —claves y asignaciones con `:` o
  `=`, declaraciones `const|let|var|function`, y asignaciones a propiedad—, y una llamada a un canal
  de salida con el plaintext como argumento **no declara nada**;
- aunque encajara, el identificador `plaintext` no contiene ninguno de los segmentos prohibidos
  (`password`, `pass`, `contrasena`, `contraseña`), asi que tampoco seria un hallazgo;
- ejecutado: con M10 puesta, `guard-password-never-plaintext` **queda verde** y el unico rojo es la
  regla 3 de la guardia nueva.

La que estaba mal era la expectativa de la columna derecha de `tasks.md`, no el test. **R17 sigue
cubierto** por la regla 3, que si mata M10. La correccion esta anotada en `tasks.md` y en
`impl_2-...md > 6.2` en vez de borrada, que es la forma correcta de corregir una tabla.

## 4. Fallo cerrado (R10, R11)

Leido el codigo y ejercitado por la tabla de F. El parseo valida **en este orden** y devuelve `null`
(nunca lanza) ante: no-string o vacio; distinto de 5 segmentos; prefijo no vacio; algoritmo distinto
de scrypt; segmento de coste que no case el patron; `n`/`r`/`p` no enteros seguros, fuera de rango o
`n` no potencia de dos; **memoria por encima del techo**; sal que no decodifica en base64url estricto
(ida y vuelta, porque el decodificador de Node ignora caracteres fuera del alfabeto — bien visto) o
de menos de 16 bytes; clave que no decodifica o fuera de [16, 64] bytes. Solo despues se deriva, y un
error de derivacion tambien es `false`. La comparacion final es en tiempo constante, con la
comprobacion de longitud delante.

**No encontre ningun camino por el que un hash invalido, vacio, truncado o con parametros absurdos
devuelva "coincide".** Los 22 casos mas la clave alterada lo confirman en ejecucion, y el caso de
control impide que ese `false` sea el de una implementacion muerta.

## 5. Alcance, esquema y decisiones humanas

- **Sin pepper.** Un barrido por `lib/`, `tests/`, `app/` y `db/` no encuentra la palabra ni el
  concepto. La decision humana del 2026-08-06 esta respetada y documentada, no reinterpretada.
- **Sin columnas nuevas ni cambios de esquema.** `git diff origin/dev -- db/` vacio. La pregunta
  abierta 3 de la feature 1 queda respondida NO con razonamiento (`design.md > 8`), no por omision.
- **Parametros exactamente los del spec:** por defecto `n = 65536, r = 8, p = 2`, sal de 16 bytes,
  clave derivada de 32 bytes, y el techo de memoria (192 MiB) pasado **explicitamente** en la llamada
  a la derivacion — que es la trampa que `design.md > 3.2` anticipaba: sin el, 64 MiB reventarian
  contra el limite por defecto de 32 MiB de Node.
- **Alcance respetado.** Los unicos archivos de codigo que la rama anade son el modulo, el helper de
  parametros de test y tres archivos de tests. Ni seed, ni login, ni sesion, ni cookie, ni UI, ni
  rutas, ni Server Actions.

## 6. La guardia heredada no se relajo

- `git diff origin/dev -- tests/guards/guard-password-never-plaintext.test.ts` sale **vacio**: es la
  version afinada que llego con la feature 7, sin tocar.
- Su allowlist contiene exactamente dos rutas, `lib/actions/login.ts` y `lib/types/auth.ts`, ambas de
  la feature 7 y acotadas a un unico identificador. `lib/utils/password-hash.ts` **no esta exento** y
  `lib/` esta entre los directorios barridos.
- Comprobado por mutacion efimera propia (una declaracion prohibida al final del modulo): la guardia
  la marca con `lib/utils/password-hash.ts: <identificador>` y se pone roja. El verde del modulo es
  por sus meritos, no por una exencion silenciosa. Revertido, `git diff` vacio.

## 7. El merge con dev no se colo nada

Confirmado con `git diff origin/dev`, que es lo que se pidio despues de la colision entre las
features 1 y 7:

- `vitest.config.mts`, `scripts/`, `package.json`, `pnpm-lock.yaml` y `db/`: **diff vacio**, byte a
  byte lo de `dev`. Hay un solo archivo de config de vitest y un solo `test-rapido`.
- Lista completa de lo que la rama cambia frente a `dev`: 1 modulo, 4 archivos de test/soporte, 3 de
  spec, 1 bitacora y `progress/current.md`. Nada mas. Ningun archivo de otra feature tocado.
- La suite completa de 143 tests (incluidos los 83 que no son de esta feature) pasa tras el merge:
  tampoco hay rotura silenciosa en la direccion contraria.

## 8. Hallazgos

Ninguno bloqueante.

1. **menor — hay un export sin consumidor.** El validador de rangos de parametros se exporta desde
   `lib/utils/password-hash.ts` pero no esta en el contrato de `design.md > 9` y solo se usa dentro
   del propio modulo. Es la misma "API sin consumidor" que el diseno rechaza para `needsRehash`
   (`design.md > 8`, punto 4). No rompe nada y puede servirle a la feature 4, pero o se despublica o
   se anota en el diseno.
2. **menor — R17 se cubre solo por canales de salida, no por mensajes de error.** El requisito dice
   "ni incluir en mensajes de error"; la regla 3 mira `console.*` y `process.stdout/stderr`. Revisado
   a mano: el unico `throw` del modulo interpola solo los parametros de coste, asi que **no hay fuga
   real hoy**. Lo que falta es el assert que lo impida manana.
3. **menor — R3 prueba unicidad y longitud, no la fuente criptografica.** 200 sales distintas de 16
   bytes las produciria tambien un contador. La palabra "criptografica" hoy la sostiene la lectura del
   codigo, no un assert. Un chequeo estatico en la guardia (usa `randomBytes`, no `Math.random`) lo
   cerraria y encaja en el patron que ya existe.
4. **menor (proceso, del leader) — `feature_list.json` sigue con la feature 2 en `"status":
   "pending"`, `"zone": null` y `"complexity": null`.** Hay que actualizarla, junto con la entrada en
   `progress/history.md` y el desmontaje del worktree, antes de darla por `done`.

## 9. Conclusion

La feature hace lo que dice y lo demuestra. Los 18 requisitos tienen test ejecutado y ninguno pasa
por vacuidad; las 10 mutaciones mueren, incluida la M5 que en la primera pasada sobrevivio y cuya
correccion —espia que delega en el original mas caso de control de vivacidad— es la adecuada y no
introduce tautologia; la correccion sobre la M10 es un hallazgo legitimo sobre la tabla, no una
excusa; el fallo cerrado no tiene ningun camino a "coincide"; no hay pepper, ni columnas nuevas, ni
cambios de esquema; la guardia heredada esta intacta y no exime al modulo nuevo; y el merge con `dev`
no arrastro nada.

**Veredicto: OK.** Los cuatro hallazgos menores no bloquean el PR; el 4 es del leader y hay que
hacerlo antes de marcar `done`.
