# review QC-234 — cifrado-de-secretos-de-integraciones

> Reviewer, F2.2, 2026-10-09. Rango revisado `eba763f4..1b593f2f` (+ `908bc863`, solo progress).
> Worktree `.worktrees/QC-234-cifrado-de-secretos-de-integraciones`. Grafo no usado: el módulo es
> nuevo y pequeño; todo leído con Read/Grep.

## Verificación ejecutada por el reviewer

```
pnpm exec vitest run --project node tests/unit/integraciones tests/unit/errores/catalogo.test.ts
   Test Files  8 passed (8) · Tests  296 passed (296)
pnpm exec vitest run --project node tests/unit/integraciones/module-shape.test.ts --reporter=verbose
   R22 «el diff de la rama contra dev no toca …» ✓ (ejecutado, NO saltado)
pnpm exec vitest run guard
   Test Files  62 passed (62) · Tests  829 passed | 15 skipped (844)
pnpm run typecheck                     -> sin errores
pnpm exec eslint lib/modules/integraciones lib/composition/index.ts tests/unit/integraciones -> sin salida
grep de comentarios QC-/R<n>/design.md/«decisión cerrada» en líneas añadidas de lib/ y .env.example -> 0
```

El rojo `tests/integration/proveedores/catalog-line.int.test.ts` (R32) no se cuenta: el diff de
QC-234 no toca nada de `proveedores` (`git diff --name-only origin/dev...HEAD | grep proveedores`
vacío) y el leader lo reprodujo en `dev` f374bc07.

## Checklist

### CHECKPOINTS.md
- [x] requirements.md con R1–R23 en EARS.
- [x] design.md con alternativas descartadas (11.1–11.7) y su porqué.
- [x] tasks.md: T1–T9 marcadas `[x]`.
- [x] design.md abre con `## Lo que ya existe`, no vacía; el diff no re-crea nada de esa lista
      (no importa ni duplica `credential-setup-secret-crypto.ts` ni `cron-secret-env.ts`; no toca
      `session-token.ts`; no hay `createHmac`/`crypto.subtle`).
- [x] Equipo: assignee y rama publicada (progress/features/QC-234.md).
- [x] Trazabilidad: cada R1–R23 tiene test concreto (tabla abajo); mapa en `progress/impl_QC-234.md`.
- [x] Typecheck y lint sin errores.
- [ ] `gate-completo` en CI: pendiente (F2.3), no es de esta fase.
- [x] Flujos críticos: no toca autenticación, permisos, inventario, importes ni webhooks → sin E2E.
- [x] Sin dependencias nuevas (`package.json`, `pnpm-lock.yaml`, `docs/dependencias.md` intactos; R22 lo prueba).
- [x] Seguridad: ningún secreto hardcodeado; las claves de test se generan con `randomBytes`.
- [x] Configuración: claves y versión activa por env, leídas al llamar.
- [ ] Verificación final / Cierre / worktree: corresponden a F2.3+.

### docs/checkpoints-proyecto.md
- [x] `domain/` y `ports/` sin framework, base, `shared` ni `node:crypto`. `domain/errors.ts` importa
      solo el contrato `@/lib/modules/errores` (mismo patrón que `unidades/domain/errors.ts`).
- [x] Ningún import profundo de otro módulo.
- [x] Cableado solo en `lib/composition/index.ts` (R19 lo prueba barriendo `lib/ app/ components/ hooks/ middleware.ts`).
- [x] Sin modelos, tablas, RLS ni migraciones (fuera de alcance).
- [x] Sin UI: multiplataforma no aplica.
- [x] Raíz de `lib/` sin carpetas nuevas.

### docs/perfil-agentes.md > reviewer
- [x] 5 Calidad y seguridad: AES-256-GCM con IV aleatorio de 12 bytes, `authTagLength: 16` en los dos
      lados, AAD canónico en JSON con etiqueta y versión, excepción de OpenSSL tragada sin `cause`,
      `timingSafeEqual` sobre 32+32 bytes. Capas separadas.
- [x] 6 Multiplataforma: no aplica.
- [x] 7 Dependencias: ninguna.
- [x] 8 Aislamiento por empresa: no hay modelo ni consulta; el `companyId` va en el AAD (R5).
- [x] 9 Comentarios: ninguno nuevo cita `QC-<n>`, `R<n>`, `design.md` ni «decisión cerrada».

### Puntos que pidió el leader
- [x] `node:crypto` solo en `adapters/driven/security/*` (y el test R18 lo hace cumplir).
- [x] Dominio puro: `stored-secret.ts` y `secret-context.ts` sin `Buffer` ni cripto.
- [x] Cableado solo en `lib/composition/index.ts`, tipado por los puertos.
- [x] Config leída dentro de `readEncryptionKeyRing`/`readActiveKeyVersion`, llamadas desde
      `encrypt`/`decrypt`; nada a nivel de módulo. R10 importa `@/lib/composition` sin variables.
- [x] Ningún secreto ni valor de variable en los errores: los mensajes nombran la variable, una
      versión ya validada o una posición; los tests serializan `message`, `stack` y propiedades
      propias y buscan claves, texto, valor guardado y fragmentos de 5 caracteres.

## Trazabilidad R → test (verificada leyendo cada caso)

| R | Test | Verifica de verdad |
|---|---|---|
| R1 | `secret-cipher-aes-gcm.test.ts` › R1 (ASCII, no ASCII, 1, 4096) | sí |
| R2 | › R2 | sí (valores e IV distintos, los dos descifran) |
| R3 | › R3 ×2; `stored-secret.test.ts` › R3 ×3 | sí (regex de forma, 12/16 bytes, sin claro ni base64) |
| R4 | › R4/R14 ×3 | sí (instancia, `name`, `code`, sin `cause`, sin fuga) |
| R5 | › R5 ×3 | sí |
| R6 | › R6; `stored-secret.test.ts` › R6 ×4 | sí |
| R7 | › R7/R14 ×14; `stored-secret.test.ts` › R7 | sí (incluye base64 permisivo de Node) |
| R8 | › R8/R14 | sí (diagnóstico `versión v2 no configurada`, sin claves) |
| R9 | › R9 ×2 | sí (v1 legible tras activar v2; usa la clave de la versión del valor) |
| R10 | `encryption-keys-env.test.ts` › R10 ×2 y R10/R19; cifrador › R10 | sí |
| R11 | `encryption-keys-env.test.ts` › R11 (ausente/vacía/espacios, posición, clave mala, repetida); cifrador › R11/R14 cifrar y descifrar | sí |
| R12 | `encryption-keys-env.test.ts` › R12 ×4 bloques; cifrador › R12 ×2 | sí (descifrar sin/con activa mala funciona) |
| R13 | cifrador › R13 ×2; `stored-secret.test.ts` › R13 | sí |
| R14 | casos `*/R14` + espías de `console.*` en `afterEach` de los tres archivos de adaptador | sí |
| R15 | `secret-digest-sha256.test.ts` › R15 ×2 | sí (vector `abc`) |
| R16 | › R16 ×2, R16/R17 ×6 | sí |
| R17 | › R17 con `vi.mock('node:crypto')` | sí (una llamada por comparación, 32+32) |
| R18 | `module-shape.test.ts` › R18 ×5 (incluye `findDomainPurityFindings` con `domain/x.ts` sintético) + guardia | sí |
| R19 | `module-shape.test.ts` › R19 ×3; `encryption-keys-env.test.ts` › R10/R19 | sí |
| R20 | `module-shape.test.ts` › R20 ×2; `stored-secret.test.ts` › R20 ×2 | sí |
| R21 | `errores/catalogo.test.ts` › 75 entradas + `guard-catalogo-de-errores` | sí |
| R22 | `module-shape.test.ts` › R22 ×3 (git, ejecutado en esta rama); `encryption-keys-env.test.ts` › R22 `.env.example` | sí |
| R23 | todo unitario sin base ni red; `./init.sh` rápido verde salvo rojo heredado; `gate-completo` pendiente en F2.3 | sí para esta fase |

## Desvíos declarados: juicio

1. **`impl_QC-234.md` en vez del nombre largo de T9.** Aceptado. `CHECKPOINTS.md` pide
   `progress/impl_<key>.md`; el que se desvía es `tasks.md`. Ver hallazgo menor M4.
2. **Mensaje de versión activa sin la versión.** Aceptado. R12 prohíbe que el error contenga el
   valor de cualquiera de las dos variables, y `v3` es el valor de `INTEGRATIONS_ENCRYPTION_ACTIVE`;
   el requisito manda sobre el ejemplo del design. El test lo fija. Ver M1 (design desalineado).
3. **Export extra `isStandardBase64`.** Aceptado. Es pura, vive en el dominio, no sale por
   `index.ts` (R20 lo comprueba) y evita duplicar la regex entre dominio y config, que es lo que
   pide `design.md > 5` («la misma regex»).
4. **Bloque de `.env.example` antes de `DOCUMENTS_E2E_DOUBLES`.** Aceptado: no cambia el
   comportamiento y no tocar la guardia es lo correcto en esta ficha. Pero la fragilidad que el
   implementer describe no quedó en `progress/deudas.md`. Ver M2.
5. **R22 como test git ejecutable.** Aceptado y mejor que un ítem de revisión. Comprobado que en
   esta rama se ejecuta (no salta) y que `gate.yml` crea `dev`/`origin/dev` con `fetch-depth: 0`,
   así que en el PR también compara de verdad.
6. **Enmienda a R11/R12 de QC-221.** Aceptado: la prevé `requirements.md > Preguntas abiertas 1` y
   `design.md > 8`. La tabla de `design.md > 8` se cumple: R10, R12 (detector), R13, R8 y R17 de
   QC-221 siguen; `.gitkeep` de `adapters/driving/` se conserva.
7. **Cambios aditivos en archivos compartidos con QC-218/QC-223.** Verificado en el diff: código y
   clave al final de `ERROR_CODES`/`ERROR_MESSAGE_KEY`/`ERROR_MESSAGES_ES`, línea de enmienda en el
   JSDoc, bloque nuevo al final de `lib/composition/index.ts` sin tocar nada de arriba, conteo 74→75
   con su línea. Nada borrado ni reordenado.

## Hallazgos

- **M1 · menor.** `design.md > 5` sigue poniendo como ejemplo `la versión activa v3 no está en
  INTEGRATIONS_ENCRYPTION_KEYS`, que contradice R12 y el código. Conviene que el leader o el
  spec_author alineen el ejemplo para que QC-237/QC-238 no lo copien. Es documental; no toca código.
- **M2 · menor.** La fragilidad de `guard-dobles-e2e` (su patrón cruza líneas desde
  `DOCUMENTS_E2E_DOUBLES=` hasta la siguiente variable y da falso rojo si se añade algo detrás) solo
  está en la bitácora. Debería quedar como deuda en `progress/deudas.md`, o la próxima variable que
  alguien añada al final volverá a tropezar.
- **M3 · menor.** El comentario de `lib/composition/index.ts` «Bloque nuevo al final, con sus
  imports: no reordena ni reformatea nada de lo de arriba.» habla de la historia del cambio, no del
  código; dentro de un año no dice nada (`docs/conventions.md > Comentarios`). Basta con «`integraciones`».
- **M4 · menor.** `tasks.md > T9` nombra `progress/impl_QC-234-cifrado-de-secretos-de-integraciones.md`,
  pero el archivo es `progress/impl_QC-234.md`. El archivo es correcto; la referencia de tasks.md queda
  desalineada.
- **M5 · menor.** `secret-cipher-aes-gcm.ts`: `ring.get(version) as Buffer` se apoya en que
  `readActiveKeyVersion` ya comprobó `ring.has(version)`. Es correcto hoy; un cambio en
  `readActiveKeyVersion` lo dejaría pasar en silencio. Opcional: que `readActiveKeyVersion` devuelva
  también la clave, o comprobar `undefined`.

Bloqueantes: 0 · Mayores: 0 · Menores: 5.

## Veredicto

**OK (APROBADO).** Ningún hallazgo bloquea; los cinco menores pueden ir en esta rama antes del PR o
quedar anotados. `gate-completo` en CI sigue siendo condición para el merge (F2.3).
