# QC-256 — piezas-compartidas-rediseno · tasks.md

Orden: T1 primero (tokens que usan casi todas). Después, las marcadas `[P]` en paralelo. T11 y T12
al final. Cada task cierra con `pnpm run typecheck`, `pnpm run lint`,
`pnpm exec vitest related --run <archivos tocados>` y, si toca `components/ui`, `components/shared`,
`lib/shared/ui` o `hooks`, la fila del catálogo en el mismo commit y `pnpm exec vitest run guard`.

## Tareas

- [ ] **T1. Tokens (R6, R15, R41).** Añadir a `app/globals.css`, en `:root` y `.dark`, los tokens de
  `design.md > 5` con sus `--color-*` y `@keyframes status-pulse`. Test nuevo
  `tests/unit/shared-ui/tokens-rediseno.test.ts`.
  *Hecho:* el test lee `globals.css` y encuentra cada token en los dos temas, con los valores de
  `qc.css`.

- [ ] **T2 [P]. Button (R1–R5).** Depende de nada. Cambiar el mapa de tallas, añadir `xl` y
  `touch: 'mobile'` (`design.md > 2`). Test nuevo `tests/unit/shared-ui/button-tallas.test.tsx`.
  Ajustar `tests/unit/login-skin.test.tsx` (enmienda a QC-30) y cualquier test que fije `h-8`/`h-7`
  en `button.tsx`. Fila `Button` del catálogo: tallas nuevas, `touch="mobile"`, `Diseño`
  `docs/diseno/canvas/Botones.dc.html`.
  *Hecho:* `button-tallas`, `button-touch` y `login-skin` en verde; ningún consumidor cambiado.

- [ ] **T3 [P]. StatusBadge y mapa de pedido (R6–R11, R47).** Depende de T1. Crear
  `components/shared/status-badge.tsx` y `components/shared/order-status.ts`; pasar las cuatro rutas
  de `design.md > 3.3` a leer del mapa. Tests nuevos `status-badge.test.tsx` y
  `order-status.test.ts`. Filas nuevas `StatusBadge` y mapa de pedido (`Diseño`: `Estados.dc.html`).
  *Hecho:* los dos tests en verde; `badges-estado.test.tsx` y los tests de pedidos, asignación y
  dashboard que importan esas constantes, en verde sin tocarlos.

- [ ] **T4 [P]. PriorityMark (R12–R14).** Depende de T3 (usa `ORDER_PRIORITY_LABELS`). Crear
  `components/shared/priority-mark.tsx`. Test nuevo `priority-mark.test.tsx`. Fila nueva
  (`Diseño`: `Estados.dc.html`).
  *Hecho:* test en verde.

- [ ] **T5 [P]. Alert y Notice (R15–R18, R48).** Depende de T1. `pnpm exec shadcn add alert`
  (comprobar con `git diff -- package.json` que no añade nada; si añade, parar y preguntar). Crear
  `components/shared/notice.tsx`. Test nuevo `notice.test.tsx`. Filas nuevas `Alert` y `Notice`
  (`Diseño`: `Avisos.dc.html`).
  *Hecho:* test en verde; `package.json` sin cambios.

- [ ] **T6 [P]. PasswordField (R19–R26).** Crear `components/shared/password-field.tsx`; ajustar el
  estilo de regla cumplida en `components/shared/credential-requirements.tsx`; borrar
  `components/shared/credential-field.tsx`. Migrar `tests/unit/credential-field.test.tsx` a
  `tests/unit/shared-ui/password-field-requisitos.test.tsx` y actualizar
  `tests/unit/credential-help-contract.test.ts`. Test nuevo `password-field.test.tsx`. Filas: nueva
  `PasswordField` (`Diseño`: `Campos.dc.html`), `CredentialRequirements` actualizada, `CredentialField`
  borrada.
  *Hecho:* los dos tests de `PasswordField` y `credential-requirements.test.tsx` en verde; Grep de
  `CredentialField` en `app/`, `components/` y `tests/` sin resultados.

- [ ] **T7 [P]. PageShell y PageHeader (R27–R30).** Crear `components/shared/page-shell.tsx` y
  `components/shared/page-header.tsx`. Test nuevo `page-header.test.tsx` (cubre los dos). Filas
  nuevas (`Diseño`: `Superficies.dc.html`).
  *Hecho:* test en verde.

- [ ] **T8 [P]. Tabs y UrlTabs (R31).** Añadir `TabsIndicator` a `components/ui/tabs.tsx` (verificar
  antes las variables CSS de `Tabs.Indicator` en la versión instalada). Crear
  `components/shared/url-tabs.tsx`. Test nuevo `url-tabs.test.tsx`. Filas: `Tabs` actualizada,
  `UrlTabs` nueva (`Diseño`: `Superficies.dc.html`).
  *Hecho:* test en verde; los tests actuales de `assignment-view-tabs`, `usuarios-tabs-switch` y
  `product-type-tabs` siguen en verde sin tocarlos.

- [ ] **T9. RowActionsMenu y DataTable (R32–R39).** Depende de T2 (talla del botón «Acciones»).
  - T9a. `RowActionsMenu`: `presentation`, `title`, `texts`; menú desplegable con `side="bottom"` y
    volteo (verificar el nombre de la prop de Base UI). Test nuevo
    `row-actions-menu-centrado.test.tsx`; `row-actions-menu-href.test.tsx` sigue en verde.
  - T9b. `actionsColumn` con `menu`; `DataTable` con `card` y los dos cuerpos;
    `data-table-cards.tsx` interno; tipos y textos opcionales. Tests nuevos
    `data-table-acciones.test.tsx` y `data-table-tarjetas.test.tsx`.
  - T9c. E2E nuevo `e2e/piezas-compartidas.spec.ts`: en una lista existente con `RowActionsMenu` y
    ventana baja, el menú ⋯ de la última fila queda entero dentro de la ventana (R33). Correr solo
    ese spec.
  - Filas `RowActionsMenu` y `DataTable` actualizadas (`Diseño`: `Tabla.dc.html`).
  *Hecho:* los tres tests unitarios y el E2E en verde; los tests de las tablas existentes en verde
  sin tocarlos (R38).

- [ ] **T10 [P]. Avatar y Spinner (R40–R44).** Depende de T1. Crear `lib/shared/ui/avatar-tone.ts`;
  `tone` en `components/ui/avatar.tsx`; `ResponsibleAvatars` lo pasa. `Spinner` con `lg` y 0,9 s;
  `components/ui/sonner.tsx` usa `Spinner`. Tests: nuevo `avatar-tone.test.ts`; ampliar
  `responsible-avatars.test.tsx` y `spinner.test.tsx`. Filas: `avatarTone` nueva (`sin UI`),
  `Avatar`, `ResponsibleAvatars`, `Spinner` y `Toaster` actualizadas (`Diseño`: `Dominio.dc.html`,
  `Avisos.dc.html`).
  *Hecho:* tests en verde; Grep de `animate-spin` y `Loader2Icon` solo en `spinner.tsx`.

- [ ] **T11. Catálogo (R45, R46).** Depende de T2–T10. Test nuevo
  `tests/unit/shared-ui/catalogo-qc256.test.ts`: cada pieza de R45 y R46 tiene fila con su tablero
  en `Diseño`, y no hay fila de `CredentialField`. Revisar que ninguna fila quedó a medias.
  *Hecho:* `catalogo-qc256` y `pnpm exec vitest run guard` en verde.

- [ ] **T12. Cierre.** Depende de todo. `./init.sh` en verde. Escribir `progress/impl_QC-256.md` con
  el mapa R → test de `design.md > 14`, las enmiendas a QC-21, QC-30 y QC-232, y el aviso del DOM
  doble de las tarjetas para las fichas de módulo.
  *Hecho:* gate local verde y el mapa completo.

## Archivos esperados

- `app/globals.css`
- `components/ui/button.tsx`
- `components/ui/tabs.tsx`
- `components/ui/alert.tsx`
- `components/ui/avatar.tsx`
- `components/ui/sonner.tsx`
- `components/shared/CATALOGO.md`
- `components/shared/status-badge.tsx`
- `components/shared/order-status.ts`
- `components/shared/priority-mark.tsx`
- `components/shared/notice.tsx`
- `components/shared/password-field.tsx`
- `components/shared/credential-field.tsx`
- `components/shared/credential-requirements.tsx`
- `components/shared/page-shell.tsx`
- `components/shared/page-header.tsx`
- `components/shared/url-tabs.tsx`
- `components/shared/row-actions-menu.tsx`
- `components/shared/responsible-avatars.tsx`
- `components/shared/spinner.tsx`
- `components/shared/data-table/actions-column.tsx`
- `components/shared/data-table/data-table.tsx`
- `components/shared/data-table/data-table-types.ts`
- `components/shared/data-table/data-table-cards.tsx`
- `components/shared/data-table/index.ts`
- `lib/shared/ui/avatar-tone.ts`
- `app/(private)/pedidos/components/order-status-badge.tsx`
- `app/(private)/asignacion/components/company-orders-columns.tsx`
- `app/(private)/asignacion/components/assigned-orders-columns.tsx`
- `app/(private)/dashboard/components/execution-trace-format.ts`
- `tests/unit/shared-ui/tokens-rediseno.test.ts`
- `tests/unit/shared-ui/button-tallas.test.tsx`
- `tests/unit/login-skin.test.tsx`
- `tests/unit/shared-ui/status-badge.test.tsx`
- `tests/unit/shared-ui/order-status.test.ts`
- `tests/unit/shared-ui/priority-mark.test.tsx`
- `tests/unit/shared-ui/notice.test.tsx`
- `tests/unit/shared-ui/password-field.test.tsx`
- `tests/unit/shared-ui/password-field-requisitos.test.tsx`
- `tests/unit/credential-field.test.tsx`
- `tests/unit/credential-help-contract.test.ts`
- `tests/unit/shared-ui/page-header.test.tsx`
- `tests/unit/shared-ui/url-tabs.test.tsx`
- `tests/unit/shared-ui/row-actions-menu-centrado.test.tsx`
- `tests/unit/shared-ui/data-table-acciones.test.tsx`
- `tests/unit/shared-ui/data-table-tarjetas.test.tsx`
- `tests/unit/shared-ui/avatar-tone.test.ts`
- `tests/unit/shared-ui/responsible-avatars.test.tsx`
- `tests/unit/shared-ui/spinner.test.tsx`
- `tests/unit/shared-ui/catalogo-qc256.test.ts`
- `e2e/piezas-compartidas.spec.ts`
- `progress/impl_QC-256.md`
