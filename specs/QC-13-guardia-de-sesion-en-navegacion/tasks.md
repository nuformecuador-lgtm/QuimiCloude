# QC-13 — guardia-de-sesion-en-navegacion · tasks.md

> Checklist discreto y verificable. `[P]` = paralelizable con la tarea anterior/hermana. Cada
> task cita el/los archivo(s) que toca y su criterio de "hecho".

## T1 — Retirar los cuatro ítems de placeholder de `private-nav.ts`

**Archivo:** `lib/shared/navigation/private-nav.ts`

- Quitar las declaraciones de `NOTIFICATIONS_ROUTE`, `PURCHASE_ORDERS_ROUTE`, `SUPPLIERS_ROUTE`
  y `BATCHES_ROUTE`.
- Quitar de `PRIVATE_NAV_ITEMS` el ítem `nav-notificaciones` y el grupo `nav-compras` completo
  (con sus dos hijos).
- Quitar del grupo `nav-produccion` el hijo `nav-produccion-lotes`; conservar
  `nav-produccion-formulas` sin tocarlo.
- Actualizar el comentario de cabecera del archivo para que ya no describa cinco rutas de
  ejemplo, sino las que quedan.
- **NO tocar** `FORMULAS_ROUTE`, `DASHBOARD_ROUTE`, `INVENTORY_ROUTE`, tipos, `groupNavItemsBySection`
  ni las constantes de marca.

**Hecho cuando:** `PRIVATE_NAV_ITEMS` tiene exactamente 3 entradas de nivel superior
(`nav-dashboard`, `nav-inventario`, `nav-produccion`) y `nav-produccion` tiene exactamente 1
hijo (`nav-produccion-formulas`); `tsc` no reporta ninguna referencia rota a las cuatro
constantes retiradas en el resto del repo (`grep` de cada nombre solo debe aparecer en
`private-nav.ts` como comentario histórico, si acaso, o en ningún sitio).

**Depende de:** nada. Es la primera tarea.

---

## T2 — Tests que hacen morder el borrado (R1–R6, R14) [P con T3]

**Archivo:** `tests/unit/app-sidebar.test.tsx` (ampliado) — o un archivo unitario hermano
dedicado a `private-nav.ts`, a elección del implementer (`design.md > 4`, alternativa
descartada 2).

- Test que afirma que el módulo `private-nav.ts` **no exporta** `NOTIFICATIONS_ROUTE`,
  `PURCHASE_ORDERS_ROUTE`, `SUPPLIERS_ROUTE` ni `BATCHES_ROUTE` (R1).
- Test que recorre `PRIVATE_NAV_ITEMS` (nivel superior y todos los hijos) y afirma que ningún
  `href` es `/notificaciones`, `/compras/ordenes`, `/compras/proveedores` ni
  `/produccion/lotes`, y que ningún `testId` es `nav-notificaciones` ni `nav-compras` (R2, R3).
- Test que afirma `PRIVATE_NAV_ITEMS.length === 3` y el `testId` de cada entrada en orden
  (`nav-dashboard`, `nav-inventario`, `nav-produccion`) (R5).
- Test que afirma que el grupo `nav-produccion` tiene `items.length === 1` y que ese único hijo
  es `nav-produccion-formulas` (R6).
- Test que afirma el valor literal de `FORMULAS_ROUTE` (`/produccion/formulas`) y que el ítem
  `nav-produccion-formulas` conserva `href`, `label` (`'Fórmulas'`) y `testId` sin cambios (R4,
  R14) — la barrera contra pisar terreno de QC-26.

**Hecho cuando:** los cinco tests están escritos, cada uno referenciado a su(s) `R<n>` en un
comentario, y **fallan si se revierte T1** (verificarlo mentalmente o con un `git stash` local
de T1 antes del commit final; no hace falta dejar rastro de esa comprobación).

**Depende de:** T1 (necesita el estado final de `PRIVATE_NAV_ITEMS` para escribir los valores
esperados).

---

## T3 — Migrar el test de agrupación a una fixture propia (R9, R10) [P con T2]

**Archivo:** `tests/unit/app-sidebar.test.tsx`

- Los dos casos que hoy usan `SUPPLIERS_ROUTE` («marca con `aria-current` solo el enlace del
  hijo activo» y «si la ruta activa es la de un hijo, su submenu arranca expandido…», los
  actuales R8/R12 heredados de QC-11 sobre `SUPPLIERS_ROUTE` en ese archivo) pasan a construir y
  usar una fixture `NavItem[]` local con dos grupos de un hijo cada uno, en vez de leer
  `primerGrupo()` / `SUPPLIERS_ROUTE` de `PRIVATE_NAV_ITEMS`.
- Quitar el import de `SUPPLIERS_ROUTE` de `@/lib/shared/navigation/private-nav`.
- El resto de los tests del archivo, que siguen apoyándose en `PRIVATE_NAV_ITEMS` real
  (precedente de QC-11, decisión cerrada 6), **no se tocan**.
- La fixture NO DEBE importar `SUPPLIERS_ROUTE` ni `FORMULAS_ROUTE` (R10).

**Hecho cuando:** el archivo compila y corre sin ningún import de `SUPPLIERS_ROUTE`, los dos
casos migrados siguen verificando lo mismo que antes (expansión de grupo + `aria-current` sobre
el hijo activo) mirando la fixture en vez de `PRIVATE_NAV_ITEMS`, y ningún otro test del archivo
cambió su fixture de origen.

**Depende de:** T1 (para que `SUPPLIERS_ROUTE` ya no exista y el archivo deje de compilar hasta
que esta tarea lo arregle — es intencional: fuerza a no dejar T3 a medias).

---

## T4 — Modificar el E2E: el retorno pide `/inventario` (R11, R12, R13)

**Archivo:** `e2e/session.spec.ts`

- Cambiar el import de `DASHBOARD_ROUTE` por `INVENTORY_ROUTE` desde `@/lib/shared/routes`.
- Paso 1: `page.goto(INVENTORY_ROUTE)`; el `waitForURL` a `/login` y el `expect` sobre el
  parámetro `RETURN_PARAM` pasan a esperar `INVENTORY_ROUTE`.
- Paso 2: el `waitForURL` post-login pasa a esperar `INVENTORY_ROUTE`. Sustituir
  `expect(page.getByTestId('dashboard-title')).toBeVisible()` por la aserción equivalente sobre
  `/inventario` — antes de escribirla, leer `app/(private)/inventario/page.tsx` en `dev` para
  ver si expone un `testId` propio; si no, afirmar sobre `page.url()` (ver `design.md > 1.3`).
- No tocar los pasos 3, 4 y 5 (nombre en la barra, logout, "atrás" no restaura la zona privada):
  siguen igual, solo que ahora ocurren con `/inventario` como pantalla intermedia.
- Actualizar los comentarios de cabecera que citan `/dashboard` como ejemplo del recorrido.
- Sigue siendo **un único `test()`** (R13): no partir el recorrido.

**Hecho cuando:** el spec importa `INVENTORY_ROUTE` y ya no `DASHBOARD_ROUTE`, todas las
esperas de URL del recorrido apuntan a `/inventario` en el tramo que corresponde, y el archivo
sigue teniendo un solo `test()` dentro de su único `describe()`.

**Depende de:** ninguna de T1–T3 (toca un archivo distinto), pero **QC-22 debe estar en `dev`**
para que `/inventario` exista y sea visitable — ya listado en `depends_on` de la ficha.
Verificar antes de empezar T4 que `app/(private)/inventario/page.tsx` existe en la rama base.

---

## T5 — Sincronizar con `dev` justo antes del PR (terreno compartido con QC-26)

**Archivos:** `lib/shared/navigation/private-nav.ts`, `tests/unit/app-sidebar.test.tsx`
(potencialmente, si QC-26 ya mergeó).

- Inmediatamente antes de abrir el PR —no al empezar la ficha—, traer `dev` a la rama y resolver
  cualquier conflicto textual en los dos archivos compartidos con QC-26.
- Si QC-26 **todavía no está en `dev`** en el momento de sincronizar, la sincronización da un
  no-op sobre esos dos archivos: no es señal de que no habrá conflicto, solo de que la otra
  rama no ha llegado todavía. No cerrar esta tarea como "hecha" hasta que la sincronización se
  haga **con QC-26 ya mergeado**, o hasta que el leader decida explícitamente abrir el PR sin
  esperar (y lo anote en `progress/current.md`).
- Tras resolver, releer `nav-produccion` y confirmar que el hijo `nav-produccion-formulas`
  sigue existiendo con el `href`/`label` que QC-26 haya dejado (puede ya no ser
  `FORMULAS_ROUTE`/`Fórmulas` si QC-26 mergeó primero) y que T2/T3 no rompieron nada de lo que
  QC-26 cambió — sin reescribir lo que QC-26 trae.

**Hecho cuando:** la rama está sincronizada con el `dev` más reciente disponible en el momento
de abrir el PR, sin conflictos pendientes en `private-nav.ts` ni en `app-sidebar.test.tsx`, y
`./init.sh` corre limpio sobre el resultado.

**Depende de:** T1, T2, T3, T4 completas. Es la última tarea antes del PR.

---

## T6 — Gate completo antes del PR

- Correr `./init.sh` (completo, no `--rapido`): typecheck, lint, toda la suite unitaria y de
  integración, todas las guardias (incluida `guard-nav-serializable`) y el E2E.
- Documentar en `progress/impl_QC-13-guardia-de-sesion-en-navegacion.md` el mapa `R<n> -> test`
  que exige `CHECKPOINTS.md > Trazabilidad`.

**Hecho cuando:** `./init.sh` termina en verde y el mapa de trazabilidad cubre R1–R16.

**Depende de:** T5.
