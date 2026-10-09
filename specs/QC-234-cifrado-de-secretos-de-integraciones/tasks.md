# QC-234 — cifrado-de-secretos-de-integraciones · tasks.md

> Zona: `backend` · Complejidad: `low` · depends_on: — · Bloquea a: QC-237 · Rama:
> `feature/QC-234-cifrado-de-secretos-de-integraciones`
>
> El **qué** está en `requirements.md` (R1–R23) y el **cómo** en `design.md`. `[P]` marca las
> tareas que pueden ir en paralelo con las que llevan la misma marca dentro de su bloque.
>
> **Cómo se cierra cada task.** Con `pnpm run typecheck`, `pnpm run lint`,
> `pnpm exec vitest related --run <archivos tocados>` y `pnpm exec vitest run guard`, salvo que la
> task diga otra cosa. La feature se cierra con `./init.sh` en verde (regla 5 de `CLAUDE.md`).
>
> **Regla transversal** (`docs/conventions.md > Comentarios`). Ningún comentario nuevo cita
> `QC-<n>`, `R<n>`, `design.md` ni «decisión cerrada». En los tests, `R<n>` va en el nombre del
> caso. Ningún nombre nuevo lleva el segmento `password`/`pass` (`guard-password-never-plaintext`).
>
> **Antes de T1.** Medir en `dev` el conteo de `ERROR_CODES` (hoy 74): si otra ficha lo cambió,
> manda el de `dev` + 1. D6–D8 de `requirements.md` ya están cerradas por el humano (2026-10-09).

## T1–T2 — Catálogo, dominio y puertos

- [x] **T1.** Catálogo de errores (`design.md > 4`): `integration_secret_unreadable` al final de
      `ERROR_CODES` con su línea de enmienda, su clave y su texto en `error-catalog.ts`; conteo de
      `tests/unit/errores/catalogo.test.ts` a 75 con su línea de comentario.
      **Hecho cuando:** `catalogo.test.ts` y `guard-catalogo-de-errores` en verde. Cubre R21.
      Depende de: —.

- [x] **T2.** `domain/errors.ts` (`IntegracionesError`, `SecretUnreadableError`,
      `ValidationError`), `domain/secret-context.ts` y `domain/stored-secret.ts` (`design.md > 3.1`
      a `> 3.3`), y los puertos `ports/secret-cipher.ts` y `ports/secret-digest.ts`
      (`design.md > 3.4`). Contrato `index.ts` con los cuatro símbolos de `design.md > 7`. Se
      borran `domain/.gitkeep` y `ports/.gitkeep`.
      Test `tests/unit/integraciones/stored-secret.test.ts`: partir y unir, cada forma inválida de
      R7 da `null`, base64 permisivo rechazado, y la codificación del contexto de R6 da cadenas
      distintas para los dos contextos del ejemplo.
      **Hecho cuando:** el test y `guard-catalogo-de-errores` (el barrido ve el `errors.ts` nuevo)
      en verde. Cubre R3 (forma), R6 (codificación), R7 (forma), R20 (contrato).
      Depende de: T1.

## T3–T5 — Adaptadores

- [x] **T3. [P]** `adapters/driven/config/encryption-keys-env.ts` (`design.md > 5`), con
      `tests/unit/integraciones/encryption-keys-env.test.ts`: un caso por fila de la tabla de
      `design.md > 5`, la versión activa ausente, mal formada y ausente de la lista, la lectura en
      cada llamada y el barrido de no-fuga de `design.md > 8`.
      **Hecho cuando:** el test en verde. Cubre R10 (lectura al llamar), R11, R12 (lectura), R14
      (errores de config). Depende de: T2.

- [x] **T4. [P]** `adapters/driven/security/secret-digest-sha256.ts` (`design.md > 6.2`), con
      `tests/unit/integraciones/secret-digest-sha256.test.ts`: vector `abc`, determinismo,
      verdadero y falso, resumen mal formado (largo, mayúsculas fuera de rango, no hex) da `false`
      sin lanzar, y el espía de `timingSafeEqual` de `design.md > 8`.
      **Hecho cuando:** el test en verde. Cubre R14 (resumidor), R15, R16, R17. Depende de: T2.

- [x] **T5.** `adapters/driven/security/secret-cipher-aes-gcm.ts` (`design.md > 6.1`), con
      `tests/unit/integraciones/secret-cipher-aes-gcm.test.ts`: ida y vuelta (ASCII, no ASCII, 1 y
      4096 caracteres), dos cifrados distintos, forma del valor guardado, alteración de IV, tag y
      ciphertext, cada componente del contexto cambiado, los dos contextos de R6, versión ausente,
      rotación `v1`→`v2`, descifrar sin versión activa, texto y contexto vacíos, sin fuga y sin
      consola. Se borra `adapters/driven/.gitkeep`.
      **Hecho cuando:** el test en verde. Cubre R1–R9, R12 (descifrar sin activa), R13, R14.
      Depende de: T3.

## T6–T7 — Cableado y forma del módulo

- [x] **T6.** Bloque `integraciones` en `lib/composition/index.ts` (`design.md > 7`), y caso de
      R10 que importa `@/lib/composition` sin las variables (`vi.resetModules()` + `import()`).
      **Hecho cuando:** `pnpm run typecheck` pasa, el caso está en verde y
      `guard-arquitectura-modulos` también. Cubre R10 (importar), R19. Depende de: T4, T5.

- [x] **T7.** Actualizar `tests/unit/integraciones/module-shape.test.ts` según la tabla de
      `design.md > 8`: sustituir los dos casos de R11 y los de R12 por R18, R19 y R20, y añadir el
      caso sintético de R18 con `findDomainPurityFindings`. Añadir un caso de R22 que comprueba
      que el diff de la rama contra `dev` no toca `db/`, `package.json`, `pnpm-lock.yaml`,
      `docs/dependencias.md`, `app/`, `components/`, `hooks/` ni `middleware.ts` (o, si el test no
      puede ver git, dejarlo como «revisión» en el mapa de T9).
      Anotar en `specs/QC-221-permiso-y-modulo-de-integraciones/requirements.md`, bajo R11 y R12,
      una línea en cursiva: «*(QC-234 enmienda este requisito: el módulo gana el cifrado de
      secretos y su cableado.)*», igual que QC-222 enmendó R15.
      **Hecho cuando:** `module-shape.test.ts` en verde y añadir un `domain/x.ts` sintético con
      `node:crypto` pone en rojo el caso de R18. Cubre R18, R19, R20, R22. Depende de: T6.

## T8–T9 — Entorno, deuda y cierre

- [x] **T8. [P]** `.env.example`: las dos variables vacías, con el comentario de
      `design.md > 5` (formato, cómo generar una clave, los tres pasos de rotación, y que preview
      y producción comparten base y por tanto valor). Caso en
      `tests/unit/integraciones/encryption-keys-env.test.ts` que comprueba que las dos están
      declaradas una vez y vacías (plantilla: `tests/unit/recetas/storage-config.test.ts`).
      Bloque de deuda en `progress/deudas.md` con el texto de `design.md > 10`.
      **Hecho cuando:** el caso en verde. Cubre R22 (`.env.example`). Depende de: —.

- [x] **T9.** Mapa `R<n> -> test` completo (R1–R23) en
      `progress/impl_QC-234-cifrado-de-secretos-de-integraciones.md`. R23 se justifica con
      `./init.sh` y el check `gate-completo`.
      **Hecho cuando:** `./init.sh` en verde. Depende de: T1–T8.

## Archivos esperados

**Producción, nuevos:**

- `lib/modules/integraciones/domain/errors.ts`
- `lib/modules/integraciones/domain/secret-context.ts`
- `lib/modules/integraciones/domain/stored-secret.ts`
- `lib/modules/integraciones/ports/secret-cipher.ts`
- `lib/modules/integraciones/ports/secret-digest.ts`
- `lib/modules/integraciones/adapters/driven/config/encryption-keys-env.ts`
- `lib/modules/integraciones/adapters/driven/security/secret-cipher-aes-gcm.ts`
- `lib/modules/integraciones/adapters/driven/security/secret-digest-sha256.ts`

**Producción, modificados:**

- `lib/modules/integraciones/index.ts`
- `lib/composition/index.ts`
- `lib/modules/errores/domain/error-codes.ts`
- `lib/modules/errores/domain/error-catalog.ts`
- `.env.example`

**Producción, borrados:**

- `lib/modules/integraciones/domain/.gitkeep`
- `lib/modules/integraciones/ports/.gitkeep`
- `lib/modules/integraciones/adapters/driven/.gitkeep`

**Tests nuevos:**

- `tests/unit/integraciones/stored-secret.test.ts`
- `tests/unit/integraciones/encryption-keys-env.test.ts`
- `tests/unit/integraciones/secret-digest-sha256.test.ts`
- `tests/unit/integraciones/secret-cipher-aes-gcm.test.ts`

**Tests modificados:**

- `tests/unit/integraciones/module-shape.test.ts`
- `tests/unit/errores/catalogo.test.ts`

**Specs y estado:**

- `specs/QC-221-permiso-y-modulo-de-integraciones/requirements.md`
- `progress/deudas.md`
- `progress/impl_QC-234-cifrado-de-secretos-de-integraciones.md`

**Choques previsibles.** `lib/composition/index.ts` lo toca casi toda ficha de backend: el bloque
va al final y en un solo trozo para que el merge sea trivial. `error-codes.ts`, `error-catalog.ts`
y `catalogo.test.ts` chocan con cualquier ficha en vuelo que amplíe el catálogo: la que mergee
después reubica su código detrás y sube el conteo. QC-237 depende de esta ficha y no debe empezar
código antes de su merge.
