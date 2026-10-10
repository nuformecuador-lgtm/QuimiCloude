# impl QC-234 — cifrado-de-secretos-de-integraciones

> Implementer, F2.1, 2026-10-09. Rama `feature/QC-234-cifrado-de-secretos-de-integraciones`,
> commits `2f243008..` (sobre `eba763f4`). Solo `backend_dev`, en tres tandas (T1+T2+T8, T3–T5,
> T6+T7). T9 es esta bitácora; su «Hecho cuando» (`./init.sh` en verde) lo corre el leader.
>
> Nombre: `tasks.md > T9` dice `progress/impl_QC-234-cifrado-de-secretos-de-integraciones.md`; el
> leader y el protocolo del implementer piden `progress/impl_<key>.md`. Se usa este.

## Archivos

**Producción, nuevos**

- `lib/modules/integraciones/domain/errors.ts`
- `lib/modules/integraciones/domain/secret-context.ts`
- `lib/modules/integraciones/domain/stored-secret.ts`
- `lib/modules/integraciones/ports/secret-cipher.ts`
- `lib/modules/integraciones/ports/secret-digest.ts`
- `lib/modules/integraciones/adapters/driven/config/encryption-keys-env.ts`
- `lib/modules/integraciones/adapters/driven/security/secret-cipher-aes-gcm.ts`
- `lib/modules/integraciones/adapters/driven/security/secret-digest-sha256.ts`

**Producción, modificados**

- `lib/modules/integraciones/index.ts` (contrato: tres errores + tipo `SecretContext`)
- `lib/composition/index.ts` (bloque `integraciones` al final, en un solo trozo, con sus imports)
- `lib/modules/errores/domain/error-codes.ts`, `lib/modules/errores/domain/error-catalog.ts`
  (`integration_secret_unreadable` al final)
- `.env.example` (dos variables vacías con comentario)

**Producción, borrados:** `domain/.gitkeep`, `ports/.gitkeep`, `adapters/driven/.gitkeep` del módulo.

**Tests nuevos:** `tests/unit/integraciones/stored-secret.test.ts`,
`encryption-keys-env.test.ts`, `secret-digest-sha256.test.ts`, `secret-cipher-aes-gcm.test.ts`.

**Tests modificados:** `tests/unit/integraciones/module-shape.test.ts`,
`tests/unit/errores/catalogo.test.ts` (74 → 75).

**Specs y estado:** `specs/QC-221-permiso-y-modulo-de-integraciones/requirements.md` (enmienda en
cursiva bajo R11 y R12), `specs/QC-234-.../tasks.md` (marcas), `progress/deudas.md` (D36,
re-cifrado a la versión activa).

Fuera de alcance, no tocados (R22): `db/`, `package.json`, `pnpm-lock.yaml`,
`docs/dependencias.md`, `app/`, `components/`, `hooks/`, `middleware.ts`.

## Mapa R<n> -> test

Rutas relativas a `tests/unit/`. Los casos citados son el nombre (o su prefijo) del `it`.

| R | Test |
|---|---|
| R1 | `integraciones/secret-cipher-aes-gcm.test.ts` › «R1: un texto %s vuelve exactamente igual» (ASCII, no ASCII, 1 y 4096 caracteres) |
| R2 | `secret-cipher-aes-gcm.test.ts` › «R2: cifrar dos veces el mismo texto da valores e IV distintos, y los dos descifran» |
| R3 | `secret-cipher-aes-gcm.test.ts` › «R3: es v<n>:<iv>:<tag>:<ciphertext> en base64 estándar…», «R3: no contiene el texto en claro ni su base64»; `stored-secret.test.ts` › «R3: unir da las cuatro partes…», «R3: partir lo que se unió…», «R3: acepta versiones de varias cifras…» |
| R4 | `secret-cipher-aes-gcm.test.ts` › «R4/R14: cambiar un carácter de %s falla…» (IV, tag, ciphertext; sin `cause`) |
| R5 | `secret-cipher-aes-gcm.test.ts` › «R5: descifrar con otro contexto en %s falla…» (empresa, registro, campo) |
| R6 | `secret-cipher-aes-gcm.test.ts` › «R6: dos contextos que unidos con «:» darían la misma cadena…»; `stored-secret.test.ts` › «R6: los dos contextos del ejemplo dan cadenas distintas» y afines |
| R7 | `secret-cipher-aes-gcm.test.ts` › «R7/R14: %s falla con el error de secreto ilegible» (14 formas); `stored-secret.test.ts` › «R7: %s da null», «R7: base64 permisivo rechazado…», «R7: isKeyVersion solo acepta…» |
| R8 | `secret-cipher-aes-gcm.test.ts` › «R8/R14: una versión que no está en la lista falla nombrándola en el diagnóstico…» |
| R9 | `secret-cipher-aes-gcm.test.ts` › «R9: se cifra con la activa y se descifra con la del valor guardado; v1 sigue legible tras activar v2», «R9: descifrar usa la clave de la versión del valor…» |
| R10 | `encryption-keys-env.test.ts` › «R10: se lee en cada llamada…» (una por variable), «R10/R19: importar @/lib/composition sin ninguna de las dos variables resuelve y expone integraciones»; `secret-cipher-aes-gcm.test.ts` › «R10: un cambio de la versión activa entre dos llamadas…» |
| R11 | `encryption-keys-env.test.ts` › «R11: %s falla nombrando la variable», «R11/R14: %s da la posición…», «R11/R14: una clave que %s nombra su versión…», «R11/R14: una versión repetida…»; `secret-cipher-aes-gcm.test.ts` › «R11/R14: %s sin lista de claves falla…» |
| R12 | `encryption-keys-env.test.ts` › «R12: una versión de la lista es la activa», «R12: %s falla nombrando la variable», «R12/R14: mal formada (%s)…», «R12/R14: una versión que no está en la lista…»; `secret-cipher-aes-gcm.test.ts` › «R12: descifrar funciona con la versión activa %s», «R12/R14: cifrar sin versión activa…» |
| R13 | `secret-cipher-aes-gcm.test.ts` › «R13: cifrar un texto vacío falla con invalid_input», «R13/R14: cifrar y descifrar con %s vacío…»; `stored-secret.test.ts` › «R13: con %s vacío no está completo» |
| R14 | Los casos `R*/R14` de los tres archivos de adaptador (serializan mensaje, stack y propiedades y buscan texto, clave, valor guardado o fragmentos de 5 caracteres de la variable); espías de `console.*` en `beforeEach`/`afterEach` de los tres; `secret-digest-sha256.test.ts` › «R14/R15: el resumen no contiene el secreto» |
| R15 | `secret-digest-sha256.test.ts` › «R15: el resumen de abc es el vector conocido…», «R15: el resumen es determinista y resume el texto en UTF-8» |
| R16 | `secret-digest-sha256.test.ts` › «R16: el mismo secreto casa…», «R16: un secreto distinto no casa», «R16/R17: un resumen guardado mal formado (%s) da falso sin lanzar y sin comparar» |
| R17 | `secret-digest-sha256.test.ts` › «R17: cada comparación con un resumen bien formado pasa una vez por timingSafeEqual con 32 contra 32 bytes» |
| R18 | `integraciones/module-shape.test.ts` › «node:crypto solo aparece en adapters/driven/…», «la pureza de dominio de guard-arquitectura-modulos da un hallazgo con un domain/x.ts sintetico que importa node:crypto», «el detector de criptografia reconoce node:crypto y crypto…», «los archivos de codigo del modulo son exactamente los del cifrado de secretos»; guardia `guard-arquitectura-modulos` |
| R19 | `module-shape.test.ts` › «el unico archivo de produccion fuera del modulo que lo importa es lib/composition/index.ts», «lib/composition exporta integraciones con exactamente secretCipher y secretDigest, tipados con sus puertos», «el lector del cableado ve un miembro de mas…»; `encryption-keys-env.test.ts` › «R10/R19: …» (en tiempo de ejecución) |
| R20 | `module-shape.test.ts` › «el contrato reexporta exactamente los tres errores y el tipo SecretContext, y solo desde ./domain», «el lector del contrato distingue una reexportacion de ports/…»; `stored-secret.test.ts` › «R20: SecretUnreadableError lleva el código y el texto del catálogo…», «R20: ValidationError usa invalid_input…» |
| R21 | `errores/catalogo.test.ts` › «las 75 entradas estan…»; guardia `guard-catalogo-de-errores` (barre el `errors.ts` nuevo) |
| R22 | `module-shape.test.ts` › «el diff de la rama contra dev no toca db/, package.json, …», «el detector del diff caza cada ruta vigilada…», «el caso del diff se salta con motivo fuera de esta rama…»; `encryption-keys-env.test.ts` › «R22: %s está declarada una sola vez, vacía y con su comentario» |
| R23 | Todo lo anterior es unitario, sin base ni red. `./init.sh` y el check `gate-completo`: los corre el leader (pendiente) |

## Salida real de la verificación (implementer, al cierre)

```
pnpm run typecheck                                  -> exit 0
pnpm run lint                                       -> ✖ 7 problems (0 errors, 7 warnings)   (ninguno en archivos de la feature)
pnpm exec vitest run --project node tests/unit/integraciones tests/unit/errores/catalogo.test.ts
   Test Files  8 passed (8)
        Tests  296 passed (296)
pnpm exec vitest run guard
   Test Files  62 passed (62)
        Tests  829 passed | 15 skipped (844)
```

De los subagentes (vitest related):

- T6/T7, `vitest related --run --project node` (composición, encryption-keys-env, module-shape):
  `Test Files 62 passed (62) / Tests 1351 passed (1351)`.
- T6, `vitest related --run --project ui lib/composition/index.ts`: `1 failed | 210 passed (211)`;
  el rojo es `navegacion/pantallas-exigen-permiso.test.tsx` › «'/pedidos' se sirve con el
  permiso», ya en `tests/baseline-rojos.json`.
- T1/T2 `--project node`: además del rojo previsto de `module-shape` (cerrado en T7),
  `recetas/module-contract.test.ts`, en baseline. `--project ui`: `inventario/product-page.test.tsx`
  por timeout bajo carga (pasa solo, 84/84; flake de deudas D6).
- «Hecho cuando» de T7: con un `lib/modules/integraciones/domain/x.ts` sintético que importa
  `node:crypto`, `Tests 4 failed | 160 passed` (los dos casos de R18 y el de
  `guard-arquitectura-modulos`). El archivo se borró después.

`vitest related` sin `--project` se para por falta de `DATABASE_URL` (proyecto de integración).

## Desviaciones y avisos para el reviewer

1. **Mensaje de versión activa ausente de la lista.** `design.md > 5` pone como ejemplo un mensaje
   que nombra la versión (`v3`); R12 prohíbe que el error contenga el valor de cualquiera de las dos
   variables, y esa versión es el valor de `INTEGRATIONS_ENCRYPTION_ACTIVE`. Manda el requisito: el
   mensaje es `INTEGRATIONS_ENCRYPTION_ACTIVE: la versión activa no está en
   INTEGRATIONS_ENCRYPTION_KEYS` y el test comprueba que `v3` no aparece.
2. **Export extra** `isStandardBase64` en `domain/stored-secret.ts` (no listado en `design.md > 3.2`):
   lo reutiliza `encryption-keys-env.ts` para validar la clave con «la misma regex» (`design.md > 5`).
   No sale por el contrato `index.ts`.
3. **`.env.example`:** el bloque nuevo va antes del de `DOCUMENTS_E2E_DOUBLES` y no al final: al final,
   `guard-dobles-e2e` daba un falso rojo (su patrón cruza líneas desde `DOCUMENTS_E2E_DOUBLES=` hasta
   la siguiente variable). La guardia no se tocó; queda frágil para la próxima variable que se añada
   detrás.
4. **R22 como test de git** (no «revisión»): copia el patrón de `guard-qc102-limites-de-la-ficha`;
   compara contra el merge-base con `dev` (o `origin/dev`), solo corre en esta rama (en CI lee
   `GITHUB_HEAD_REF`) y se salta con motivo fuera de ella, para no volverse rojo tras el merge.
5. **R10/R19 en tiempo de ejecución** vive en `encryption-keys-env.test.ts` (importa la composición
   con `vi.mock('@/lib/shared/db/prisma')`, presupuesto 60 s); `module-shape` comprueba lo mismo
   leyendo el fuente.
6. Choque aceptado con QC-218/QC-223: cambios aditivos al final de `lib/composition/index.ts`,
   `error-codes.ts`, `error-catalog.ts`, y conteo literal 75 en `catalogo.test.ts`. El que mergee
   después reubica y sube el conteo.
