# QC-85 — pantalla-de-grupos-de-trabajo · tasks.md

> 43 requisitos en `requirements.md`, diseño en `design.md`. Aquí el desglose ejecutable.
> `[P]` = se puede hacer en paralelo con sus hermanas de la misma tanda.
> Cada task tiene **criterio de hecho** verificable; ninguna se da por buena sin él.
>
> **Cierre de tanda:** `./init.sh --rapido`. **Cierre de feature y antes del PR:** `./init.sh`
> completo (`CLAUDE.md` regla 5).

---

## Archivos que SÍ se tocan

**Nuevos** — todos en `app/(private)/configuracion/usuarios/components/`:

```
usuarios-tabs.ts                usuarios-tabs-switch.tsx        work-group-labels.ts
work-group-list-params.ts       work-group-columns.tsx          work-group-list-section.tsx
work-group-list-empty.tsx       work-group-list-error.tsx       work-group-list-skeleton.tsx
work-group-table.tsx            work-group-sheet.tsx            work-group-form.tsx
work-group-members.tsx          delete-work-group-dialog.tsx
```

**Nuevos, fuera de la ruta:**

```
components/ui/tabs.tsx                                  (por CLI de shadcn, T1; nunca a mano)
tests/unit/configuracion-ui/grupos/*.test.tsx|ts        (T3–T13)
e2e/grupos-de-trabajo.spec.ts                           (T14)
```

**Existentes que se modifican — exactamente dos:**

```
app/(private)/configuracion/usuarios/page.tsx           (T2: conmutador + pestaña vigente)
app/(private)/configuracion/usuarios/components/index.ts (T2 y siguientes: barrel)
```

## Archivos que NO se tocan (si aparecen en el diff, el reviewer rechaza)

```
lib/modules/**                      (R36 — ni dominio, ni puertos, ni adaptadores, ni actions)
db/schema.prisma · db/migrations/** (R36 — cero migraciones)
lib/composition/**                  (R36)
lib/shared/navigation/private-nav.ts(R5 — el menú no gana ítem)
lib/shared/routes.ts                (R4 — ni USERS_ROUTE ni PRIVATE_ROUTE_PREFIXES)
components/shared/data-table/**     (R12 — la tabla compartida se consume, no se edita)
components/ui/** escrito a mano     (R37 — solo por CLI)
package.json                        (R37 — ninguna dependencia nueva)
e2e/usuarios.spec.ts · e2e/permisos.spec.ts · demás *.spec.ts existentes  (R43)
tests/guards/**                     (R5, R39 — verdes sin relajar ni nombrar excepciones)
app/(private)/configuracion/usuarios/components/user-*.tsx|ts            (R6 — la pestaña de
                                     personas no cambia; su href canónico sin `tab` sigue válido)
```

---

## Tanda 0 — cimientos

### [x] T1 — La primitiva de pestañas
Traer `components/ui/tabs.tsx` con `pnpm dlx shadcn@latest add tabs`. **No se escribe a mano.**
Antes de aceptar: comprobar que `package.json` **no cambió**.
- **Hecho:** existe `components/ui/tabs.tsx`, `git diff package.json pnpm-lock.yaml` está vacío y
  `pnpm typecheck` pasa.
- **Si `package.json` cambia:** **PARAR**. No instalar. Escribir la propuesta de dependencia con
  los cuatro checks (`design.md > 9`) y subirla al leader. La salida alternativa está en
  `design.md > 11 (E)`. (R37)

### [x] T2 — El conmutador y la dirección · depende de T1
`usuarios-tabs.ts` (`TAB_PARAM`, `USERS_TAB`, `GROUPS_TAB`, `USUARIOS_TABS`, `parseUsuariosTab`,
`usuariosTabHref`), `usuarios-tabs-switch.tsx` y la modificación de `page.tsx`: el corte por
permiso **sigue siendo la primera línea del cuerpo**, la pestaña se resuelve después, y se renderiza
**una sola** sección con su `<Suspense>`. Republicar en el barrel.
- **Hecho:** con `?tab=grupos` la pantalla pinta el hueco de grupos; sin `tab` o con basura pinta
  personas; el conmutador navega y el `href` que emite lleva **solo** `tab`. La pestaña de personas
  sigue funcionando con sus parámetros de siempre. (R1, R2, R3, R6, R7, R8)

---

## Tanda 1 — la lista de grupos

### [x] T3 [P] — `work-group-list-params.ts` · depende de T2
Parser y serializador puros, hermanos de `user-list-params.ts`: **sin filtros**, con búsqueda,
orden acotado contra `WORK_GROUP_QUERYABLE.sortable` **leída del contrato**, tamaño contra
`PAGE_SIZE_OPTIONS`, y el `tab=grupos` conservado en el `href`.
- **Hecho:** `parse(build(p)) === p`; ninguna entrada produce excepción; el test lee la lista
  blanca del contrato en vez de repetirla. (R13, R15, R16, R17, R3)

### [x] T4 [P] — `work-group-labels.ts` y `work-group-columns.tsx` · depende de T2
Una columna de datos (`name`) más la de acciones. Sin conteo de miembros.
- **Hecho:** un test afirma que las claves de `WorkGroupRow` usadas son **exactamente** `id` y
  `name`, y que ninguna celda pinta un número. (R12)

### [x] T5 [P] — Vacío, error y esqueleto · depende de T2
`work-group-list-{empty,error,skeleton}.tsx`, calcados de sus hermanos de personas.
- **Hecho:** el vacío ofrece limpiar búsqueda solo si la había y volver a la página 1 solo si la
  página pedida era mayor; el error pinta el mensaje devuelto y un reintento. (R18, R19)

### [x] T6 — `work-group-list-section.tsx` · depende de T3, T4, T5
Server Component `async`: `listWorkGroupsAction(params)` con los parámetros **enteros y sin
traducir**, y despacho a los tres estados.
- **Hecho:** con `status: 'error'` no se pinta tabla; con cero elementos se pinta el vacío; con
  elementos se pinta la tabla. Ningún import de `lib/composition` ni lectura de sesión. (R11, R18,
  R19, R36)

### [x] T7 — `work-group-table.tsx` · depende de T6
Tabla compartida por su barrel. Dueña del estado de las escrituras: **una** instancia del panel y
**una** del diálogo para toda la página. `canModify` por props.
- **Hecho:** `git diff components/shared/data-table/` vacío; sin `usuarios.modificar` no se emite
  **ningún** disparador de escritura en el árbol servido; cambiar orden, búsqueda, tamaño o página
  **navega** en vez de recortar en cliente. (R9, R10, R12, R13, R14, R15, R40)

---

## Tanda 2 — las escrituras

### [x] T8 — `work-group-form.tsx` · depende de T7
Campo único del nombre. Validación **en vivo** con `createWorkGroupSchema` /
`renameWorkGroupSchema` **y** `normalizeWorkGroupName(name) !== ''`, las dos importadas del
contrato. Envío a `createWorkGroupAction` o `renameWorkGroupAction` según el modo.
- **Hecho:** escribir `!!!` muestra el aviso **antes** de enviar y el botón no invoca ninguna
  action; un nombre válido sí la invoca; `work_group_duplicate_name` se pinta **junto al campo**,
  el panel sigue abierto y no se pierde lo escrito; ningún regex propio en el archivo. (R21, R22,
  R23, R24)

### [x] T9 — `work-group-members.tsx` · depende de T7
Lista paginada (estado de React, 10 por página), cargando y error propios, buscador de candidatos
con `listUsersAction` + *debounce*, meter y sacar de a una, y **recarga de la lista tras cada
éxito**.
- **Hecho:** la lista pinta solo `displayName`; no hay ningún campo de estado de cuenta, correo ni
  documento; los **cuatro** `work_group_member_exists*` producen cuatro mensajes distintos,
  distinguidos por `code`; `work_group_member_not_found` no retira a la persona; ninguna inserción
  optimista. (R25, R26, R27, R28, R29, R30, R31, R32)

### [x] T10 — `work-group-sheet.tsx` · depende de T8, T9
Un solo panel: alta (solo nombre) y edición (nombre + miembros). Sin segunda lectura de ficha.
Salvaguarda «la respuesta solo vale si es la del grupo abierto».
- **Hecho:** al cerrar, la lista de detrás conserva página, tamaño, orden, búsqueda **y pestaña**;
  el éxito cierra, avisa por el `<Toaster />` del layout —no se monta otro— y refresca. (R20, R35)

### [x] T11 — `delete-work-group-dialog.tsx` · depende de T7
Confirmación que nombra el grupo. El único camino hasta la action es confirmar.
- **Hecho:** abrir el diálogo no invoca nada; un rechazo se pinta dentro, por `code`, con el
  diálogo abierto y la fila intacta. (R33, R34, R35)

### [x] T12 — Barrel completo · depende de T2–T11
`components/index.ts` republica las catorce piezas nuevas y **todos** sus nombres públicos.
- **Hecho:** `usuarios-convenciones.test.ts` verde por los dos lados; ningún import por ruta
  profunda desde `page.tsx` ni desde los tests. (R38)

---

## Tanda 3 — verificación

### [x] T13 [P] — Unitarios y guardias · depende de T12
Completar `tests/unit/configuracion-ui/grupos/**` hasta cubrir el mapa de trazabilidad, y correr
las guardias heredadas **sin tocarlas**.
- **Hecho:** todo `R<n>` del mapa tiene su test; `pnpm test:guardias` verde; `git diff
  tests/guards/ lib/shared/navigation/ lib/shared/routes.ts` vacío. (R5, R39, R41)

### [x] T14 [P] — E2E · depende de T12
`e2e/grupos-de-trabajo.spec.ts`: entrar → cambiar a la pestaña de grupos → crear → renombrar →
meter a una persona → sacarla → borrar, comprobando en cada paso lo que la pantalla presenta.
Selectores por rol ARIA o `data-testid`, nunca por copy.
- **Hecho:** `pnpm e2e` verde, incluido el spec nuevo; `git diff e2e/` solo muestra el archivo
  nuevo. (R42, R43)

### T15 — Cierre · depende de T13, T14
`./init.sh` completo, `progress/impl_QC-85-pantalla-de-grupos-de-trabajo.md` con el mapa
`R<n> -> test` real y la revisión del diff contra la lista de «archivos que NO se tocan».
- **Hecho:** gate verde, mapa escrito, diff limpio de los prohibidos.

---

## Trazabilidad `R<n> -> test`

El implementer confirma este mapa (o lo corrige con los nombres reales) en
`progress/impl_QC-85-pantalla-de-grupos-de-trabajo.md`.

| R | Test previsto |
| --- | --- |
| R1 | `grupos/usuarios-tabs.test.ts` — dos pestañas, constantes exportadas, el parámetro sale de `TAB_PARAM` |
| R2 | `grupos/usuarios-tabs.test.ts` — sin `tab`, `tab` repetido y `tab` desconocido → personas, sin lanzar |
| R3 | `grupos/usuarios-tabs-switch.test.tsx` — el conmutador navega al `href` derivado de `USERS_ROUTE`; `?tab=grupos` renderiza grupos |
| R4 | `grupos/alcance.test.ts` — no hay `page.tsx` nuevo bajo `app/(private)/`; `PRIVATE_ROUTE_PREFIXES` sin cambios + `guard-rutas-privadas-cubiertas` |
| R5 | `guard-nav-permisos-declarados` · `guard-nav-serializable` · `private-nav-usuarios.test.ts` + `grupos/alcance.test.ts` (diff vacío en `private-nav.ts`) |
| R6 | `grupos/usuarios-page.test.tsx` — sin `tab` se monta la sección de personas con sus parámetros intactos |
| R7 | `grupos/usuarios-tabs.test.ts` — `usuariosTabHref` emite **solo** `tab` |
| R8 | `grupos/usuarios-page.test.tsx` — `requirePagePermission('usuarios.consultar')` sigue siendo la primera llamada y es la única; ningún código nuevo |
| R9 | `grupos/work-group-table.test.tsx` — con `canModify: false` no hay disparador, ni panel, ni diálogo |
| R10 | `grupos/work-group-table.test.tsx` — el módulo no importa `lib/composition` ni lee sesión (test de imports) |
| R11 | `grupos/work-group-list-section.test.tsx` — `unauthorized` → error, cero filas |
| R12 | `grupos/work-group-columns.test.tsx` — claves exactas `{id,name}`, una columna de datos, ningún número; `alcance.test.ts` para el diff de `data-table/` |
| R13 | `grupos/work-group-list-params.test.ts` + `work-group-table.test.tsx` — 10/25, defecto 10, indicador |
| R14 | `grupos/work-group-table.test.tsx` — cambiar el término navega; no se recorta en cliente |
| R15 | `grupos/work-group-list-params.test.ts` — el orden se valida contra `WORK_GROUP_QUERYABLE.sortable` importada |
| R16 | `grupos/alcance.test.ts` — ningún filtro declarado; `WORK_GROUP_QUERYABLE` sin cambios |
| R17 | `grupos/work-group-list-params.test.ts` — tabla de entradas basura → params válidos, sin throw |
| R18 | `grupos/work-group-list-empty.test.tsx` — las dos salidas, cada una bajo su condición |
| R19 | `grupos/work-group-list-{skeleton,error}.test.tsx` — esqueleto y error con mensaje y reintento |
| R20 | `grupos/work-group-sheet.test.tsx` — es `Sheet`, no navega, y al cerrar conserva params + pestaña |
| R21 | `grupos/work-group-form.test.tsx` — `!!!` avisa mientras se escribe y no invoca la action; el archivo no contiene regex propio |
| R22 | `grupos/work-group-form.test.tsx` — un solo campo; validación con el esquema importado (vacío, espacios, tope) |
| R23 | `grupos/work-group-form.test.tsx` — alta → `createWorkGroupAction`; edición → `renameWorkGroupAction` con `workGroupId` |
| R24 | `grupos/work-group-form.test.tsx` — `work_group_duplicate_name` junto al campo; otros códigos en la región; panel abierto |
| R25 | `grupos/work-group-members.test.tsx` — pinta lo que devuelve la action, sin reordenar ni filtrar |
| R26 | `grupos/work-group-members.test.tsx` — avanzar/retroceder, posición dentro del total |
| R27 | `grupos/work-group-members.test.tsx` — cargando y error dentro del panel |
| R28 | `grupos/work-group-members.test.tsx` — candidatos vienen de `listUsersAction`; elegir → `addWorkGroupMemberAction` con dos campos |
| R29 | `grupos/work-group-members.test.tsx` — los cuatro `work_group_member_exists*` dan cuatro presentaciones distintas, por `code` |
| R30 | `grupos/work-group-members.test.tsx` — tras el éxito se vuelve a consultar; nada optimista |
| R31 | `grupos/work-group-members.test.tsx` — solo `displayName` en el DOM de cada miembro |
| R32 | `grupos/work-group-members.test.tsx` — sacar invoca la action; `work_group_member_not_found` no retira la fila |
| R33 | `grupos/delete-work-group-dialog.test.tsx` — nombra el grupo; abrir no invoca nada |
| R34 | `grupos/delete-work-group-dialog.test.tsx` — rechazo dentro, por `code`, diálogo abierto |
| R35 | `grupos/work-group-{sheet,members}.test.tsx` + `delete-work-group-dialog.test.tsx` — cerrar + toast + refresh; un solo `<Toaster />` |
| R36 | `grupos/alcance.test.ts` — imports por ruta exacta, ningún `fetch` propio, diff vacío en `lib/modules/**` y `db/**` |
| R37 | `guard-dependencias-aprobadas.test.ts` + `grupos/alcance.test.ts` (diff vacío en `package.json`) |
| R38 | `usuarios-convenciones.test.ts` (heredado, tensado con los archivos nuevos) |
| R39 | `pnpm test:guardias` + `grupos/alcance.test.ts` (diff vacío en `tests/guards/`) |
| R40 | `grupos/work-group-a11y.test.tsx` — sin `100vh`, sin hover-only, `min-h-11 min-w-11`, fuente ≥ 16 px |
| R41 | `grupos/alcance.test.ts` — los tests de la carpeta no afirman sobre literales de copy |
| R42 | `e2e/grupos-de-trabajo.spec.ts` — el recorrido completo |
| R43 | `e2e/usuarios.spec.ts` y `e2e/permisos.spec.ts` verdes, con `git diff e2e/` mostrando solo el archivo nuevo |
