# QC-67 — pantalla-de-usuarios · bitacora de implementacion

> Zona `frontend`. Worktree `.worktrees/QC-67-pantalla-de-usuarios`, rama
> `feature/QC-67-pantalla-de-usuarios`. Spec aprobado por el humano el 2026-09-11.
> Esta ficha **no construye backend**: consume QC-66 y QC-94.

## T0 — Inventario de lo heredado (nada de esto se re-crea, R39)

Verificado en el worktree, con `./init.sh --rapido` en verde ANTES de tocar nada
(typecheck + lint + 29 archivos de guardias, 312 tests, 0 fallos).

| Pieza | Donde | Ficha |
| --- | --- | --- |
| `createUserAction`, `updateUserAction`, `deleteUserAction`, `setUserAccountStatusAction`, `getUserAction`, `listUsersAction` | `lib/modules/identity/adapters/driving/user-actions.ts` | QC-66 |
| `listRolesAction` + `RoleOptionsResult` | `lib/modules/identity/adapters/driving/role-actions.ts` | QC-94 |
| `requirePagePermission(code)` | `lib/modules/identity/adapters/driving/require-page-permission.ts` | QC-75 |
| `UserRow`, `UserDetail`, `USER_QUERYABLE`, `USER_ACCOUNT_STATUSES`, `DOCUMENT_TYPE_CODES`, `RoleOption`, `assertPermission` | `lib/modules/identity/index.ts` | QC-65/66/74/94 |
| Tabla compartida con filtro `select` multivalor | `components/shared/data-table/` | QC-55 + QC-57 |
| `PAGE_SIZE_OPTIONS` (10/25), `DEFAULT_PAGE_SIZE` | `lib/shared/pagination.ts` | QC-22 |
| Seccion «Configuración» con **dos** items (Presentaciones, Unidades) | `lib/shared/navigation/private-nav.ts` | QC-45 + QC-39 |
| `<Toaster />`, sidebar, `SidebarInset` | `app/(private)/layout.tsx` | QC-11 |
| `UnexpectedErrorNotice` | `components/shared/unexpected-error-notice.tsx` | QC-71 |
| Precedentes de pantalla completos | `app/(private)/configuracion/{presentaciones,unidades}/` | QC-45 / QC-39 |

Ninguna dependencia nueva, ninguna migracion, ningun archivo de `lib/modules/identity/**`,
`db/**`, `package.json` ni `components/shared/data-table/**` tocado.

## Archivos creados / modificados

(se rellena por tandas)

## Mapa `R<n> -> test`

(se rellena al cierre, con los nombres reales de archivo)

## Salida de los tests

(se rellena al cierre)
