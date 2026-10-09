# QC-237 — conexion-whatsapp-por-empresa · tasks.md

> Zona: `fullstack` · Complejidad: `medium` · depends_on: QC-234 · Bloquea a: QC-238, QC-242,
> QC-250 · Rama: `feature/QC-237-conexion-whatsapp-por-empresa`
>
> El **qué** está en `requirements.md` (R1–R43) y el **cómo** en `design.md`. `[P]` marca las
> tareas que pueden ir en paralelo con las que llevan la misma marca dentro de su bloque.
>
> **Cómo se cierra cada task.** `pnpm run typecheck`, `pnpm run lint`,
> `pnpm exec vitest related --run <archivos tocados>` y `pnpm exec vitest run guard`, salvo que la
> task diga otra cosa. La feature se cierra con `./init.sh` en verde y `gate-completo` en CI.
>
> **Regla transversal** (`docs/conventions.md > Comentarios`). Ningún comentario nuevo cita
> `QC-<n>`, `R<n>`, `design.md` ni «decisión cerrada». En los tests, `R<n>` va en el nombre del
> caso. Ningún identificador nuevo lleva `password`/`pass`.
>
> **Antes de T1.** Las preguntas P1–P8 están cerradas (humano, 2026-10-09) como D9–D16 de
> `requirements.md`; no queda ninguna abierta. Sincronizar con `git fetch origin dev && git merge origin/dev` y medir: conteo de
> `ERROR_CODES` (hoy 79), último timestamp de `db/migrations/` y las listas exactas de
> `module-shape.test.ts`.

## T1–T2 — Base de datos y catálogo

- [x] **T1.** Esquema y migración (`design.md > 2`): los dos enums y `WhatsappConnection` con
      `/// @module integraciones` al final de `db/schema.prisma`; migración
      `20261009120000_whatsapp_connections` escrita a mano con su `down.sql`; `prisma generate`.
      Tests `tests/integration/integraciones/whatsapp-connection-migration.int.test.ts` (ida, vuelta
      e ida) y la parte de R5 (RLS forzada) del `.int` de T5. Se tensa `module-shape.test.ts` R13 a
      exactamente un modelo. Sin columna de versión de clave (D9); índices únicos parciales de
      empresa y de `phone_number_id` (D16); IDs de Meta `text` sin límite (D14).
      **Hecho cuando:** `guard-empresa-en-esquema`, `guard-rls-force`, `guard-arquitectura-modulos`
      y el test de migración en verde. Cubre R5. Depende de: —.

- [x] **T2. [P]** Catálogo (`design.md > 7`): tres códigos al final de `ERROR_CODES` con su línea de
      enmienda, claves y textos en `error-catalog.ts`; `catalogo.test.ts` a 82 (o `dev` + 3).
      **Hecho cuando:** `catalogo.test.ts` y `guard-catalogo-de-errores` en verde. Cubre parte de
      R3, R6, R7. Depende de: —.

## T3–T4 — Dominio y puertos

- [x] **T3.** Tipos, actor, ámbito, errores y saneado (`design.md > 3.1` a `> 3.4`), puertos de
      `> 4.1`, `> 4.3`, `> 4.4`. Tests `connection-view.test.ts` y `graph-failure.test.ts`.
      **Hecho cuando:** los dos tests y `guard-arquitectura-modulos` en verde. Cubre R10 (vista),
      R20. Depende de: T2.

- [x] **T4.** Los seis casos de uso (`design.md > 3.5`) con dobles de los puertos. Tests
      `authorization.test.ts`, `create-whatsapp-connection.test.ts`,
      `update-whatsapp-connection.test.ts`, `test-and-enable.test.ts`,
      `regenerate-verify-token.test.ts`.
      Validación de IDs de Meta como texto libre no vacío, sin dígitos obligatorios (D14); edición
      fallida sin escribir (D10); habilitar fallido sigue `DISABLED` (D11); estado tras prueba buena
      por `lastWebhookAt` (D12).
      **Hecho cuando:** los cinco tests en verde. Cubre R1, R2 (dominio), R3, R6 (chequeo), R8,
      R9, R11–R15, R19, R21–R32. Depende de: T3.

## T5–T7 — Adaptadores driven

- [x] **T5. [P]** Persistencia (`design.md > 4.2`): `persistence/company-scope.ts` y
      `persistence/whatsapp-connection-prisma.ts`; guardia nueva
      `tests/guards/guard-ambito-empresa-integraciones.test.ts`; test
      `tests/integration/integraciones/whatsapp-connection-prisma.int.test.ts`.
      **Hecho cuando:** el `.int` y la guardia en verde. Cubre R2, R3, R5, R6, R7, R9 (base).
      Depende de: T1, T3.

- [x] **T6. [P]** Graph y configuración (`design.md > 4.3`, `> 4.5`): `whatsapp-config-env.ts`,
      `whatsapp-graph-client-fetch.ts`, `public-base-url-env.ts`; tests
      `whatsapp-graph-client-fetch.test.ts`, `whatsapp-config-env.test.ts`.
      **Hecho cuando:** los dos tests en verde. Cubre R17, R18, R42 (parte). Depende de: T3.

- [x] **T7. [P]** Aleatoriedad y doble (`design.md > 4.4`, `> 9`): `random-source-node.ts`,
      `e2e-doubles-env.ts`, `whatsapp-graph-client-canned.ts`; tests `random-source-node.test.ts` y
      `whatsapp-graph-client-canned.test.ts`.
      **Hecho cuando:** los dos tests en verde. Cubre R14 (generación), R41 (doble). Depende de: T3.

## T8–T9 — Composición, rutas y acciones

- [x] **T8.** `lib/shared/routes.ts` (`design.md > 4.6`), bloque de composición (`> 5`), contrato
      `index.ts`. Tests `whatsapp-webhook-url.test.ts`,
      `tests/unit/composition/integraciones-graph-doubles.test.ts`. Se tensan en
      `module-shape.test.ts` R17, R18, R19 y R20 (`design.md > 11.3`). Se parametriza
      `guard-dobles-e2e.test.ts` (`> 9`).
      **Hecho cuando:** los tests nombrados, `module-shape.test.ts` y todas las guardias en verde.
      Cubre R33, R34 (URL), R41 (elección), R42. Depende de: T4, T5, T6, T7.

- [x] **T9.** Server Actions (`design.md > 6`). Test `whatsapp-connection-actions.test.ts`;
      `session-once-per-request-actions.test.ts` sigue verde sin tocarlo.
      **Hecho cuando:** los dos en verde. Cubre R10 (acciones), R14, R15. Depende de: T8.

## T10–T11 — Pantalla

- [ ] **T10.** Componentes de `design.md > 8.1` y `> 8.3` con su barrel y los textos aprobados
      (D13: «Pendiente», «Error» con `lastError` junto al estado). Tests
      `whatsapp-connection-card.test.tsx`, `whatsapp-connection-form.test.tsx` y
      `whatsapp-webhook-panel.test.tsx`.
      **Hecho cuando:** los tres tests en verde. Cubre R34, R36–R40. Depende de: T9.

- [ ] **T11.** `page.tsx` reescrita (`design.md > 8.2`). Test `whatsapp-page.test.tsx`. Se tensa
      `integration-pages.test.tsx` (`> 11.3`).
      **Hecho cuando:** los dos tests, `guard-pantallas-exigen-permiso` y
      `guard-rutas-privadas-cubiertas` en verde. Cubre R4, R16, R35, R36, R37. Depende de: T10.

## T12–T13 — E2E, entorno y cierre

- [ ] **T12.** `.env.example` y `playwright.config.ts` (`design.md > 9`); `e2e/integraciones-whatsapp.spec.ts`
      (`> 11.4`); ajuste del caso Administrador de `e2e/integraciones.spec.ts`; entrada en
      `E2E_ESPERADOS` de `guard-identificador-de-request.test.ts`.
      **Hecho cuando:** `pnpm exec playwright test e2e/integraciones-whatsapp.spec.ts e2e/integraciones.spec.ts`
      en verde en Chromium y WebKit, y `guard-dobles-e2e` y `guard-identificador-de-request` en
      verde. Cubre R11, R16, R22, R23, R29, R30, R35, R38, R41 (activación), R42 (`.env.example`).
      Depende de: T11.

- [ ] **T13.** Cierre: mapa `R<n> -> test` completo en `progress/impl_QC-237.md`; comprobar R43
      (`package.json`, permisos, seed y `private-nav.ts` intactos en el diff); `./init.sh` en verde.
      Anotar en el progreso que `WHATSAPP_GRAPH_API_VERSION` e `INTEGRATIONS_ENCRYPTION_*` deben
      existir en Vercel antes de desplegar, y que `APP_BASE_URL` se fija por entorno para que una
      preview no apunte a producción (`design.md > 10`, D15).
      **Hecho cuando:** `./init.sh` verde y el mapa sin huecos. Cubre R43. Depende de: T12.

## Archivos esperados

- `db/schema.prisma`
- `db/migrations/20261009120000_whatsapp_connections/migration.sql`
- `db/migrations/20261009120000_whatsapp_connections/down.sql`
- `lib/modules/errores/domain/error-codes.ts`
- `lib/modules/errores/domain/error-catalog.ts`
- `lib/shared/routes.ts`
- `lib/composition/index.ts`
- `lib/modules/integraciones/index.ts`
- `lib/modules/integraciones/domain/errors.ts`
- `lib/modules/integraciones/domain/actor.ts`
- `lib/modules/integraciones/domain/integraciones-scope.ts`
- `lib/modules/integraciones/domain/whatsapp-connection.ts`
- `lib/modules/integraciones/domain/whatsapp-connection-input.ts`
- `lib/modules/integraciones/domain/graph-failure.ts`
- `lib/modules/integraciones/domain/connection-status.ts`
- `lib/modules/integraciones/domain/get-whatsapp-connection.ts`
- `lib/modules/integraciones/domain/create-whatsapp-connection.ts`
- `lib/modules/integraciones/domain/update-whatsapp-connection.ts`
- `lib/modules/integraciones/domain/test-whatsapp-connection.ts`
- `lib/modules/integraciones/domain/set-whatsapp-connection-enabled.ts`
- `lib/modules/integraciones/domain/regenerate-whatsapp-verify-token.ts`
- `lib/modules/integraciones/ports/whatsapp-connection-repository.ts`
- `lib/modules/integraciones/ports/whatsapp-graph-client.ts`
- `lib/modules/integraciones/ports/random-source.ts`
- `lib/modules/integraciones/adapters/driven/config/whatsapp-config-env.ts`
- `lib/modules/integraciones/adapters/driven/config/public-base-url-env.ts`
- `lib/modules/integraciones/adapters/driven/config/e2e-doubles-env.ts`
- `lib/modules/integraciones/adapters/driven/graph/whatsapp-graph-client-fetch.ts`
- `lib/modules/integraciones/adapters/driven/graph/whatsapp-graph-client-canned.ts`
- `lib/modules/integraciones/adapters/driven/persistence/company-scope.ts`
- `lib/modules/integraciones/adapters/driven/persistence/whatsapp-connection-prisma.ts`
- `lib/modules/integraciones/adapters/driven/security/random-source-node.ts`
- `lib/modules/integraciones/adapters/driving/whatsapp-connection-actions.ts`
- `lib/modules/integraciones/adapters/driving/.gitkeep`
- `app/(private)/integraciones/whatsapp/page.tsx`
- `app/(private)/integraciones/whatsapp/components/index.ts`
- `app/(private)/integraciones/whatsapp/components/whatsapp-integration-tabs.tsx`
- `app/(private)/integraciones/whatsapp/components/whatsapp-connection-form.tsx`
- `app/(private)/integraciones/whatsapp/components/whatsapp-setup-guide.tsx`
- `app/(private)/integraciones/whatsapp/components/whatsapp-connection-card.tsx`
- `app/(private)/integraciones/whatsapp/components/whatsapp-connection-actions.tsx`
- `app/(private)/integraciones/whatsapp/components/whatsapp-webhook-panel.tsx`
- `app/(private)/integraciones/whatsapp/components/whatsapp-status-badge.tsx`
- `.env.example`
- `playwright.config.ts`
- `e2e/integraciones-whatsapp.spec.ts`
- `e2e/integraciones.spec.ts`
- `tests/unit/errores/catalogo.test.ts`
- `tests/unit/integraciones/module-shape.test.ts`
- `tests/unit/integraciones/whatsapp/authorization.test.ts`
- `tests/unit/integraciones/whatsapp/create-whatsapp-connection.test.ts`
- `tests/unit/integraciones/whatsapp/update-whatsapp-connection.test.ts`
- `tests/unit/integraciones/whatsapp/test-and-enable.test.ts`
- `tests/unit/integraciones/whatsapp/regenerate-verify-token.test.ts`
- `tests/unit/integraciones/whatsapp/graph-failure.test.ts`
- `tests/unit/integraciones/whatsapp/connection-view.test.ts`
- `tests/unit/integraciones/whatsapp/whatsapp-graph-client-fetch.test.ts`
- `tests/unit/integraciones/whatsapp/whatsapp-config-env.test.ts`
- `tests/unit/integraciones/whatsapp/whatsapp-webhook-url.test.ts`
- `tests/unit/integraciones/whatsapp/random-source-node.test.ts`
- `tests/unit/integraciones/whatsapp/whatsapp-graph-client-canned.test.ts`
- `tests/unit/integraciones/whatsapp/whatsapp-connection-actions.test.ts`
- `tests/unit/composition/integraciones-graph-doubles.test.ts`
- `tests/unit/integraciones-ui/integration-pages.test.tsx`
- `tests/unit/integraciones-ui/whatsapp-page.test.tsx`
- `tests/unit/integraciones-ui/whatsapp-connection-card.test.tsx`
- `tests/unit/integraciones-ui/whatsapp-connection-form.test.tsx`
- `tests/unit/integraciones-ui/whatsapp-webhook-panel.test.tsx`
- `tests/integration/integraciones/whatsapp-connection-prisma.int.test.ts`
- `tests/integration/integraciones/whatsapp-connection-migration.int.test.ts`
- `tests/guards/guard-ambito-empresa-integraciones.test.ts`
- `tests/guards/guard-dobles-e2e.test.ts`
- `tests/guards/guard-identificador-de-request.test.ts`
- `progress/impl_QC-237.md`
