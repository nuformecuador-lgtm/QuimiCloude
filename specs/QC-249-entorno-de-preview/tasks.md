# QC-249 — entorno-de-preview · tasks.md

> Escrito por `spec_author` (F1.2) el 2026-10-09. Diseño en `design.md`; requisitos R1–R17 en
> `requirements.md`. `[P]` = puede ir en paralelo con las demás `[P]` de su bloque. Cada task
> cierra con `pnpm run typecheck`, `pnpm run lint` y
> `pnpm exec vitest related --run <archivos tocados>` en verde (más `pnpm exec vitest run guard`
> si toca una guardia).

## Bloque A — piezas independientes

### [x] T1 [P] — Comprobación previa de preview (R9, R10)
- Crear `scripts/entorno-de-preview.mjs` con `VARIABLE_REF_DE_PREVIEW`, `apuntanAPreview(env,
  nombres)` y `comprobarEntornoDePreview(env)` (`design.md > 4`). Node puro, sin imports de `lib/`.
- `DOCUMENTS_E2E_DOUBLES` solo se lee (índice o elemento de arreglo), nunca se asigna.
- Test nuevo `tests/unit/scripts/entorno-de-preview.test.ts`.
- **Hecho:** el test cubre ref ausente/vacía, cada URL sin el ref, cada condición de R10 por
  separado y juntas, ningún mensaje contiene un valor, y el literal de la variable de dobles
  coincide con el de `e2e-doubles-env.ts`. `pnpm exec vitest run guard` sigue verde.

### [x] T2 [P] — Transporte de correo `desactivado` (R11, R12)
- `mail-config-env.ts`: añadir `'desactivado'` al final de `MAIL_TRANSPORTS` (`resend` sigue
  primero).
- Crear `lib/modules/identity/adapters/driven/mail/credential-setup-mailer-desactivado.ts`
  (`design.md > 6`).
- `lib/composition/index.ts`: rama `case 'desactivado'` en `credentialSetupMailer`.
- Tests: `tests/unit/identity/credencial/mail-config.test.ts` (ampliar),
  `tests/unit/identity/credencial/mailer-desactivado.test.ts` (nuevo),
  `tests/unit/composition/identity-facade.test.ts` (ampliar).
- **Hecho:** devuelve `'failed'`, no llama a `fetch` ni escribe archivos, la línea registrada no
  contiene destinatario/URL/secreto; ausente o vacía sigue siendo `resend`;
  `guard-envio-de-correo.test.ts` verde.

### [x] T3 [P] — Workflow de preview (R1–R6)
- Crear `.github/workflows/preview.yml` (`design.md > 3`): `pull_request` a `dev`, `if:` de fork,
  concurrencia por PR sin cancelar, `environment: preview` con la URL, comprobación de secrets,
  `npx --yes vercel@63.1.0 deploy --yes`, resumen, `curl` que falla ante `2xx`.
- Guardia nueva `tests/guards/guard-despliegue-preview.test.ts` (`design.md > 10`), con la misma
  técnica que `guard-despliegue-produccion.test.ts` (texto sin comentarios, sin parser de YAML).
- **Hecho:** la guardia nueva y `guard-despliegue-produccion.test.ts` en verde; la versión de la
  CLI es la misma en los dos workflows (lo afirma la guardia nueva).

## Bloque B — depende de T1

### [x] T4 — Build de preview (R7, R8, R9, R10) · depende de T1
- `scripts/build.mjs`: `SEMBRAR_DEMO`, `CON_TODO_Y_DEMO`, rama `VERCEL_ENV=preview` con
  `comprobarEntornoDePreview`, `problemas` en `ejecutarBuild` (`design.md > 5`). Actualizar el
  comentario de cabecera y el mensaje de la rama sin base.
- Ampliar `tests/unit/scripts/build.test.ts` (el caso «preview se salta migrate y seed» cambia).
- **Hecho:** preview cumple → cinco pasos en orden; preview no cumple → `ejecutarBuild` devuelve 1
  sin ejecutar ningún paso y escribe cada problema; production, development, vacío, ausente y fuera
  de Vercel dan los mismos pasos que antes; `tests/unit/identity/seed/deploy-hook.test.ts` verde.

### [x] T5 [P] — Enmienda de la guarda del seed de demo (R13, R14, R15) · depende de T1
- `scripts/seed-demo/guard.ts`: rama de preview con `apuntanAPreview(env, ['DATABASE_URL',
  'DIRECT_URL'])` (`design.md > 8`); cabecera con la nota de enmienda fechada (2026-10-09, QC-249).
- Cabecera de `scripts/seed-demo.ts`: quitar «preview incluido» y lo de compartir base.
- Ampliar `tests/unit/scripts/seed-demo-guard.test.ts` (el caso «--forzar no anula preview» cambia
  de sentido).
- **Hecho:** R13 permitido sin `--forzar` aunque haya `CI` y base remota; R14 negado sin `VERCEL`,
  sin ref o con URL de otro proyecto, también con `--forzar`; R15 igual que hoy;
  `tests/unit/scripts/seed-demo-run.test.ts` verde.

## Bloque C — documentación (depende de T1, T2, T4, T5)

### [x] T6 — Tabla de variables y docs (R17)
- `docs/architecture.md`: nueva sección `## Previews (QC-249)` con el flujo, la comprobación previa
  y `### Variables por entorno` (tabla de `design.md > 11`); corregir el «Por qué» de
  `## Despliegue a produccion`.
- `docs/verification.md > Datos de demostración`: reglas nuevas de la guarda y nota fechada de la
  enmienda.
- `.env.example`: `PREVIEW_SUPABASE_REF=`, comentario de `MAIL_TRANSPORT`, bloque de
  `INTEGRATIONS_ENCRYPTION_*`; `DOCUMENTS_E2E_DOUBLES=` sigue vacía.
- `docs/dependencias.md`: fila de la CLI de Vercel, uso ampliado a `preview.yml`.
- Guardia nueva `tests/guards/guard-variables-por-entorno.test.ts`.
- **Hecho:** la guardia nueva verde con caso de sensibilidad; `guard-dobles-e2e.test.ts` y el test
  de `.env.example` de `deploy-hook.test.ts` verdes.

### [x] T7 [P] — Notas de enmienda en specs cerrados · depende de T2
- Nota fechada en `specs/QC-79-alta-sin-contrasena-y-enlace/design.md > 9.2` (transporte
  `desactivado`) y en `specs/QC-107-componente-de-carga-de-archivos/design.md > 8` (variable en el
  scope Preview de Vercel).
- **Hecho:** las dos notas citan QC-249 y la fecha, y no reescriben el texto original.

## Bloque D — cierre

### T8 — Gate local · depende de T1–T7
- `./init.sh` en verde.
- **Hecho:** verde, y el mapa `R<n> -> test` de `design.md > 10` queda en `progress/impl_QC-249.md`.

### T9 — [HUMANO] Configurar Vercel y comprobar el primer despliegue · depende de T8
- El humano deja el scope Preview como `design.md > 11` y `> 13`.
- Con el PR de esta feature abierto contra `dev`, el workflow `preview` despliega: el log del
  build muestra la línea `[build] Vercel preview -> con migrate, seed y seed de demostracion`, el
  PR muestra el entorno `preview` con su URL, el paso de protección pasa, y la URL abre con una
  cuenta de Vercel del equipo y deja entrar con un usuario de demo.
- **Hecho:** el humano lo confirma; el enlace del run queda en `progress/features/QC-249.md`.
  Si el build falla por R9/R10, se corrige la variable que nombra y se repite.

## Archivos esperados

- `.github/workflows/preview.yml`
- `scripts/entorno-de-preview.mjs`
- `scripts/build.mjs`
- `scripts/seed-demo.ts`
- `scripts/seed-demo/guard.ts`
- `lib/modules/identity/adapters/driven/config/mail-config-env.ts`
- `lib/modules/identity/adapters/driven/mail/credential-setup-mailer-desactivado.ts`
- `lib/composition/index.ts`
- `tests/unit/scripts/entorno-de-preview.test.ts`
- `tests/unit/scripts/build.test.ts`
- `tests/unit/scripts/seed-demo-guard.test.ts`
- `tests/unit/identity/credencial/mail-config.test.ts`
- `tests/unit/identity/credencial/mailer-desactivado.test.ts`
- `tests/unit/composition/identity-facade.test.ts`
- `tests/guards/guard-despliegue-preview.test.ts`
- `tests/guards/guard-variables-por-entorno.test.ts`
- `docs/architecture.md`
- `docs/verification.md`
- `docs/dependencias.md`
- `.env.example`
- `specs/QC-79-alta-sin-contrasena-y-enlace/design.md`
- `specs/QC-107-componente-de-carga-de-archivos/design.md`
- `progress/impl_QC-249.md`
