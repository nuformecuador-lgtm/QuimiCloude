# QC-222 — menu-de-integraciones · tasks.md

> Implementer: `frontend_dev`. Verificación de cada tanda (`docs/perfil-agentes.md > Todos los
> agentes`):
>
> - `pnpm run typecheck`
> - `pnpm run lint`
> - `pnpm exec vitest related --run <archivos tocados>`
> - `pnpm exec vitest run guard`
>
> La E2E se corre solo con `pnpm exec playwright test e2e/integraciones.spec.ts`. **Nunca**
> `pnpm test`.
>
> Ningún comentario nuevo cita `QC-<n>`, `R<n>`, `design.md` ni «decisión cerrada». En los tests,
> `R<n>` va en el nombre del caso.

## Precondición

QC-221 ya está en `dev` (PR #176, merge `57fa8326`) con `integraciones.modificar` y las tres
constantes de ruta. Esta rama todavía no la tiene: T0 la trae.

## Tasks

> No hay T1: la tarea de añadir la primitiva `empty` de shadcn se eliminó en F1.4 (D11). Los
> demás números no cambian.

- [x] **T0 — Sincronizar con `dev`**
  - Depende de: nada.
  - Hacer: `git fetch origin dev && git merge origin/dev`. Volver a medir contra el árbol
    sincronizado los hallazgos 1, 8 y 10 de `design.md > 0` (líneas de los tests de §7.2 y §7.3).
  - Hecho cuando: `lib/shared/routes.ts` exporta las tres constantes,
    `lib/modules/identity/domain/permissions.ts` contiene `integraciones.modificar`, `./init.sh`
    está en verde sobre la rama y las líneas reales de los tests rojos están anotadas en
    `progress/impl_QC-222-menu-de-integraciones.md`.

- [ ] **T2 [P] — Etiquetas, icono y grupo del menú**
  - Depende de: T0.
  - Hacer:
    - en `private-nav.ts`: las cuatro `*_LABEL`, `'puzzle'` en `NavIconName` y el `NavGroup` como
      último item de `PRIVATE_NAV_ITEMS`, en la sección «Configuración» (`design.md > 3`);
    - en `nav-icons.ts`: la fila `puzzle: Puzzle`.

    No se toca ningún tipo ni ninguna función.
  - Hecho cuando: `typecheck` está verde y `tests/unit/integraciones-ui/private-nav-integraciones.test.ts`
    (escrito en esta task) cubre R1, R3, R4, R5 y R6 en verde. R2 queda en rojo hasta T4, porque
    lee las páginas.

- [x] **T3 [P] — Componente cascarón compartido**
  - Depende de: T0.
  - Hacer: `app/(private)/integraciones/components/integration-placeholder.tsx` (Server Component,
    sin `'use client'`) con `INTEGRATION_EMPTY_MESSAGE` = «Próximamente podrás configurar esta
    integración.» y el marcado de estado vacío del repo
    (`app/(private)/proveedores/components/supplier-list-empty.tsx:11-15`), y su `index.ts`, que
    solo reexporta (`design.md > 4.2`). No se toca `components/ui/`.
  - Hecho cuando: compila, no tiene botón, enlace, formulario ni campo, y no importa nada de
    `components/ui/`.

- [x] **T4 — Las tres páginas**
  - Depende de: T2 y T3.
  - Hacer: `proveedor-ia/page.tsx`, `inventarios/page.tsx` y `whatsapp/page.tsx` con la forma de
    `design.md > 4.3`. El corte es la primera sentencia, y no llevan comentarios.
  - Hecho cuando: `tests/unit/integraciones-ui/integration-pages.test.tsx` (escrito en esta task)
    cubre R9, R10, R11, R12 y la parte de página de R13 en verde, y R2 de T2 pasa a verde.

- [ ] **T5 — Prefijos privados**
  - Depende de: T4. La guardia exige que la página exista antes que el prefijo.
  - Hacer: añadir las tres constantes al final de `PRIVATE_ROUTE_PREFIXES` y borrar el comentario
    que QC-221 dejó encima de ellas (`design.md > 5`).
  - Hecho cuando: `pnpm exec vitest run guard` está verde **sin excepciones nuevas**
    (`guard-rutas-privadas-cubiertas`, `guard-pantallas-exigen-permiso` y
    `guard-nav-permisos-declarados`). Cubre R14.

- [x] **T6 — Enmiendas a los tests de QC-221**
  - Depende de: T5.
  - Hacer: los tres cambios de `design.md > 7.3` en `tests/unit/integraciones/integration-routes.test.ts`
    y `tests/unit/integraciones/module-shape.test.ts`.
  - Hecho cuando:
    - los casos nuevos o renombrados cubren R8, R13, R14, R15, R16 y R17;
    - el R14 de QC-221 sigue verde sin cambios (R18);
    - no queda ningún `AVISO_DE_ENMIENDA` ni ningún mensaje que nombre QC-222;
    - hay un caso de anticegado que ve el código en las cuatro rutas nuevas.

- [ ] **T7 [P] — Tensar los tests que fijan la forma del menú**
  - Depende de: T2.
  - Hacer: las cuatro filas de `design.md > 7.2`. Se tensan a la lista exacta nueva y no se
    relajan a `toContain`.
  - Hecho cuando: `pnpm exec vitest related --run lib/shared/navigation/private-nav.ts` está en
    verde.

- [ ] **T8 — E2E `e2e/integraciones.spec.ts`**
  - Depende de: T5.
  - Hacer: el spec de `design.md > 8`: un caso para el Administrador y un caso por cada rol sin el
    permiso, derivado de `SEED_ROLE_PERMISSIONS` y menos el Maestro, con su motivo escrito.
  - Hecho cuando: `pnpm exec playwright test e2e/integraciones.spec.ts` está verde en Chromium y
    WebKit sobre una base sembrada, y `guard-e2e-landing` sigue verde. Cubre R19, R20 y R21. La
    salida se pega en `progress/impl_QC-222-menu-de-integraciones.md`.

- [ ] **T10 — Tensar cinco tests más y excluir integraciones de los tests de alcance**
  (enmienda 2026-10-08, `design.md > 14`, E1 y E2; va antes de T9 y conserva su número para no
  renumerar las demás)
  - Depende de: T5.
  - Hacer:
    - las cinco filas de la enmienda de `design.md > 7.2`: `app-sidebar.test.tsx:229-242`,
      `private-layout-menu.test.tsx:343-360`, `guard-nav-permisos-declarados.test.ts:112-124`
      (10→13), `private-nav-unidades.test.ts:79,92` (2→3) y `RUTAS_ESPERADAS_HOY` de
      `guard-pantallas-exigen-permiso.test.ts` (21→24, como entradas de la lista). Se tensan a la
      lista o la cifra exactas, nunca a `toContain`;
    - la exclusión de `design.md > 7.5` en `tests/unit/inventario/scope.test.ts` y
      `tests/unit/proveedores/scope.test.ts`: carpeta derivada de las constantes, motivo escrito y
      defensa extra con la lista exacta de lo que casa bajo ella. No se toca ninguna regex.
  - Hecho cuando:
    - los siete archivos están en verde con `pnpm exec vitest related --run` y
      `pnpm exec vitest run guard`;
    - ninguna guardia gana una excepción (R14);
    - el diff de los dos tests de alcance no cambia `screenPattern` ni `PATRON_PROVEEDORES`.

- [ ] **T9 — Cierre**
  - Depende de: T0, T2–T8 y T10.
  - Hacer:
    - `./init.sh`;
    - revisar el diff contra R7 y R22: sin cambios en `components/private/app-sidebar.tsx`,
      `components/ui/**`,
      `lib/modules/**`, `lib/composition/**`, `db/**`, `middleware.ts`, `route-guard-middleware.ts`
      ni `package.json`;
    - escribir el mapa `R<n> -> test` en `progress/impl_QC-222-menu-de-integraciones.md`.
  - Hecho cuando: `./init.sh` está verde, el mapa cubre R1–R22 (R7 y R22 por revisión del diff,
    `design.md > 7.4`) y no hay rutas tocadas fuera de `## Archivos esperados`.

## Mapa de requisitos a tasks

| Requisito | Task | Test |
|---|---|---|
| R1, R3, R4, R5, R6 | T2 | `tests/unit/integraciones-ui/private-nav-integraciones.test.ts` |
| R2 | T2 + T4 | `tests/unit/integraciones-ui/private-nav-integraciones.test.ts` |
| R7 | T2, T9 | revisión del diff |
| R8 | T4, T6 | `tests/unit/integraciones/integration-routes.test.ts` |
| R9, R10, R11, R12 | T4 | `tests/unit/integraciones-ui/integration-pages.test.tsx` |
| R12 (navegador) | T8 | `e2e/integraciones.spec.ts` |
| R13 | T4, T6 | `integration-pages.test.tsx` (página) + `integration-routes.test.ts` (borde) |
| R14 | T5, T6 | guardias + `integration-routes.test.ts` |
| R15, R16 | T6 | `tests/unit/integraciones/integration-routes.test.ts` |
| R17 | T6 | `tests/unit/integraciones/module-shape.test.ts` |
| R18 | T6 | `integration-routes.test.ts` (R14 de QC-221, sin cambios) |
| R19, R20, R21 | T8 | `e2e/integraciones.spec.ts` |
| R22 | T9 | revisión del diff + `guard-dependencias-aprobadas` |

Enmienda 2026-10-08: T10 no añade ni quita ningún requisito ni cambia ninguna fila de arriba. Sus
tests siguen fijando la forma exacta del menú y de las pantallas, y respaldan R1, R6, R8 y R14.

## Enmiendas

- **2026-10-08** (`design.md > 14`, aprobadas por el humano): E1 y E2 entran como T10; E3 cambia
  el paso de teclado de T8 (`design.md > 8`) y no añade task.

## Archivos esperados

- `lib/shared/navigation/private-nav.ts`
- `lib/shared/navigation/nav-icons.ts`
- `lib/shared/routes.ts`
- `app/(private)/integraciones/components/index.ts`
- `app/(private)/integraciones/components/integration-placeholder.tsx`
- `app/(private)/integraciones/proveedor-ia/page.tsx`
- `app/(private)/integraciones/inventarios/page.tsx`
- `app/(private)/integraciones/whatsapp/page.tsx`
- `tests/unit/integraciones-ui/private-nav-integraciones.test.ts`
- `tests/unit/integraciones-ui/integration-pages.test.tsx`
- `tests/unit/integraciones/integration-routes.test.ts`
- `tests/unit/integraciones/module-shape.test.ts`
- `tests/unit/app-sidebar.test.tsx`
- `tests/unit/clientes-ui/private-nav-clientes.test.ts`
- `tests/unit/configuracion-ui/private-nav-configuracion.test.ts`
- `tests/unit/configuracion-ui/private-nav-usuarios.test.ts`
- `e2e/integraciones.spec.ts`
- `progress/impl_QC-222-menu-de-integraciones.md`
- `tests/unit/navegacion/private-layout-menu.test.tsx`
- `tests/guards/guard-nav-permisos-declarados.test.ts`
- `tests/unit/configuracion-ui/private-nav-unidades.test.ts`
- `tests/guards/guard-pantallas-exigen-permiso.test.ts`
- `tests/unit/inventario/scope.test.ts`
- `tests/unit/proveedores/scope.test.ts`
