# QC-140 — catalogo-visual-de-proveedores · revisión (F2.2)

> Reviewer, 2026-09-24. Worktree `.worktrees/QC-140-catalogo-visual-de-proveedores`, rama
> `feature/QC-140-catalogo-visual-de-proveedores` en `33f1e9eb`. Merge-base con `origin/dev`:
> `6c95b95a`. Leídos `requirements.md` (R1-R41, D1-D20), `design.md`, `tasks.md` (T0-T15),
> `progress/impl_QC-140-…md`, `docs/architecture.md`, `docs/conventions.md > Comentarios` y
> `CHECKPOINTS.md`.
>
> **Lo que corrí yo.** Nada de `./init.sh` ni la suite completa: el leader tiene el completo en
> marcha. Corrí `pnpm exec vitest run` sobre `tests/unit/proveedores-ui`, `tests/unit/proveedores`,
> las cuatro enmiendas de otras fichas (`data-table-alcance`, `migracion-listas-alcance`,
> `guard-identificador-de-request`, `guard-ambito-empresa-proveedores`), `guard-dependencias-aprobadas`,
> `pantallas-exigen-permiso` y `supplier-detail-upload`: **46 archivos, 614 passed, 6 skipped, 0 rojos**.
> Comprobé en verbose que los casos R29 y D20 de `guard-convenciones-showcase` **no** se saltan.
> No corrí la integración (usa base) ni los E2E: R51 es rojo heredado decidido por el humano.

## Checklist

| # | Punto | Estado |
|---|---|---|
| 1 | Trazabilidad R1-R41 → test | **Pasa con salvedades.** Cada R tiene al menos un test real. Hay pruebas débiles, anotadas como menores |
| 2 | Tasks `[x]` | **No todas.** T0-T13 `[x]`. T14 (dispositivos reales, humana) y T15 (cierre con `./init.sh`) abiertas, como se esperaba |
| 3 | CHECKPOINTS | Ver abajo. Fallan: tasks sin cerrar (esperado), `./init.sh` pendiente del leader, multiplataforma (M1) |
| 4 | Verificación ejecutable | Tests dirigidos en verde (arriba). `./init.sh` lo cierra el leader |
| 5 | Calidad y seguridad | Pasa. Sin tablas, sin migraciones ni `db/` en el diff, sin secretos, capas separadas |
| 6 | Multiplataforma | **Falla** en el tamaño de letra de los filtros a partir de 768 px (M1) |
| 7 | Dependencias | Pasa. Solo entra `react-intersection-observer@^11.0.1`, con su fila, aprobación citada en `design.md > 7` y un único importador |
| 8 | Aislamiento por empresa | Pasa. Sin modelos nuevos. Todas las consultas pasan por `supplierCompanyScope`/`catalogLineCompanyScope`. El acceso cruzado tiene test (integración R28 y E2E de aislamiento) |
| 9 | Comentarios | Pasa lo bloqueante: ninguna cita a `QC-`, `R<n>`, `D<n>`, `design.md` ni «decisión cerrada» en líneas añadidas o reescritas, ni en producción ni en tests/e2e. La única cita (`QC-71 (R17, R18)` en `delete-supplier-dialog.tsx`) es preexistente y la rama no la toca: el diff con renombrado lo confirma. Hay menores de longitud |

### CHECKPOINTS.md, punto por punto

- Especificación: requirements EARS numerados ✔; design con alternativas descartadas (`## 7.3`, `## 9`) ✔; tasks todas `[x]` ✘ (T14, T15).
- Trazabilidad: mapa `R<n> -> test` en `progress/impl_…` ✔ (R1-R41).
- Calidad: typecheck, lint y `pnpm test` los cierra el `./init.sh` del leader, sin verificar aquí. Flujo crítico: la ficha no toca autenticación, importes, inventario ni webhooks. Se lee con permiso, y el 404 tiene E2E ✔. Multiplataforma ✘ (M1). Dependencia con fila, cuatro checks y aprobación ✔.
- Datos y seguridad: sin tablas nuevas (RLS y `down.sql` no aplican). Permiso `proveedores.consultar` validado en el service antes de zod y del puerto, con test (`showcase-service.test.ts` R4) ✔. Sin cliente Supabase ✔. Sin secretos ✔.
- Hexagonal: `domain/` solo importa `zod` y el propio dominio. `ports/` solo tipos. La composición cablea. Driven → driven del mismo módulo (`buildCatalogLineWhere`), admitido por `docs/architecture.md`. Ningún `use server` reexportado ✔. La lógica de negocio (permiso, esquema, orden y tanda fijos, traducción de `supplier_not_found`, proyección) está en `domain/` ✔.
- Permisos: página con `requirePagePermission` ✔; componentes cliente sin composición ni BD (guardia) ✔; lecturas por Server Actions ✔.
- Configuración: nada hardcodeado que cambie entre entornos ✔.
- Verificación final: `./init.sh` (leader), review OK ✘, `history.md` y desmontaje del worktree: pendientes del cierre.

### Puntos pedidos por el leader

- **`react-intersection-observer`**: solo la importa `app/(private)/proveedores/components/showcase-load-trigger.tsx`. Ningún `new IntersectionObserver` ni escucha de `scroll` en `app/`, `components/`, `lib/` ni `hooks/`. `package.json` añade solo esa dependencia, y el lock añade solo ella (sin transitivas). Fila en `docs/dependencias.md` con los cuatro checks y lo confirmado al instalar ✔. Verifiqué en `node_modules` que `useInView` con `skip` vuelve a observar al pasar `skip` a `false` y dispara `onChange(true)` si el centinela sigue visible, así que la carga encadenada no se atasca ✔.
- **D19**: la cabecera del detalle monta `SupplierSheet supplier` (desde `@/components/shared/supplier`) y `DeleteSupplierDialog`, que se mudó a `[id]/components/` y entra en su barrel. Tras una baja, `router.replace(SUPPLIERS_ROUTE)` + toast, sin `refresh` ✔. Ningún archivo de `[id]/` importa de `../components` ni de `@/app/(private)/proveedores/components` (`catalog-route-contract` en verde) ✔.
- **Renames a `components/shared/supplier/`**: `supplier-{sheet,form,field}.tsx` salen con similitud del 100 % (0 líneas cambiadas) ✔. La enmienda de `scope.test.ts` nombra solo esa carpeta ✔.
- **Desbordamiento con nombres largos**: `b68d8570` (h1 con `min-w-0 flex-1 break-words`) y `ce1c8527` (`span min-w-0 break-words` dentro del `Link` con `max-w-full`). Los dos commits solo tocan el componente y su test. El motivo está verificado en la bitácora con medición antes y después en Pixel 7. Los tests afirman clases, que es lo que jsdom permite ✔.
- **D14-D17**: `some` de líneas solo con filtro de producto; el mismo `normalizeSupplierName` en el `some` y en `buildCatalogLineWhere`, así que no puede salir un proveedor con carrusel vacío bajo filtro ✔. «Cargar más» con `productSearch` ✔. Proveedor sin líneas con «Sin productos todavía» y enlace ✔. Aviso con «Reintentar» al pie y en la fila, también ante rechazo de transporte ✔. Orden `name asc, id asc` en las dos consultas ✔.
- **Autorización y empresa**: ver checklist 8 y Datos y seguridad ✔.
- **Enmiendas a tests de otras fichas**: `scope`, `guard-identificador-de-request` (36→37), `migracion-listas-alcance`, `data-table-alcance` (21→20), `guard-ambito-empresa-proveedores` (5→6), `supplier-service`, `list-use-cases` y `module-contract`, todas con motivo y fecha en el propio test. `tests/baseline-rojos.json` no está en el diff ✔. Pero ver M2: el borrado de `supplier-page.test.tsx` se llevó cobertura que no era de la lista.
- **Mensajes de commit**: ninguno de `origin/dev..HEAD` contiene «QC-44» ✔.

## Hallazgos

### Mayores (BLOQUEANTES)

**M1 — Los filtros de la vista pintan a 14 px desde 768 px de ancho (R39; `docs/architecture.md > Regla: multiplataforma`).**
`supplier-showcase-filters.tsx` pasa `FIELD_TEXT` = `text-base` al `Input` compartido. Ese `Input`
lleva `md:text-sm`, y `tailwind-merge` no lo anula porque es otra variante. Desde 768 px el campo
se queda en 14 px. La propia bitácora lo midió («14 px por `md:text-sm` del `Input` compartido
(≥768 px)»). R39 exige «al menos 16 px» sin excepción de ancho, `design.md > 5.4` dice «Sin
excepción de escritorio», y un iPad en vertical (820 px o más) ya cae en ese tramo. El test de R39
(`supplier-showcase-filters.test.tsx` «los dos campos cumplen text-base (>=16px)») solo busca la
subcadena `text-base`, así que pasa aunque el tamaño efectivo sea 14 px: es un test placebo para
este punto.
**Qué falta:** usar la convención ya asentada en el repo, `text-base md:text-base` (así en
`product-field.tsx`, `user-form.tsx`, `cancel-order-dialog.tsx` y otros). El test tiene que ponerse
rojo con la clase actual, por ejemplo afirmando `md:text-base` o que `md:text-sm` no queda efectiva.

**M2 — Al borrar `tests/unit/proveedores-ui/supplier-page.test.tsx` se perdió cobertura de componentes que siguen vivos y sin cambios.**
El archivo borrado no solo probaba la tabla paginada, que D2 retira. También probaba
`DeleteSupplierDialog` y `SupplierSheet`/`SupplierForm`, que siguen en producción: movidos, y en
el caso del diálogo con un solo cambio. T7 exigía «sin cambiar ninguna aserción de
comportamiento». Estos casos desaparecen sin sucesor en ningún test de la rama (comprobado por
`data-testid` y por nombre de caso):
- Diálogo de baja: «sin confirmar no invoca la operación de baja, y el diálogo nombra al proveedor y avisa del arrastre» (`delete-supplier-cascade`); «una baja rechazada mantiene el diálogo abierto con el mensaje a la vista»; y los dos casos QC-71 «el diálogo de baja enseña el identificador del error inesperado» y «…con un error del catálogo no enseña identificador ninguno». Su fila en `ADMITIDOS` de `migracion-listas-alcance.test.ts` se retiró como si fuera de la lista paginada, y no lo es.
- Panel de proveedor: «la edición precarga los valores actuales y envía el reemplazo completo» (el nuevo caso R38 vacía el campo y teclea, pero no afirma la precarga ni lo enviado, y R38 pide «precargado con sus datos»); «un supplier_duplicate_name se pinta junto al campo nombre, sin cerrar el panel ni perder lo escrito»; «un supplier_not_found ofrece volver a la lista desde la región de error del formulario»; «la validación previa aplica el MISMO esquema del contrato público y ni llama a la operación»; y «los campos y las acciones del panel se usan igual en viewport angosto y en ancho».

Con esto, requisitos de las fichas que crearon esos componentes (el diálogo de baja con arrastre,
el error inline de nombre duplicado y el identificador de error inesperado de QC-71 en el diálogo)
quedan sin test en `dev`, y la bitácora no lo declara: «Tests borrados: `supplier-page.test.tsx`».
**Qué falta:** llevar esos casos a su nuevo sitio. Los del diálogo, a `supplier-detail-page.test.tsx`
(o a un `delete-supplier-dialog.test.tsx`), montados desde la cabecera del detalle. Los del panel, a
un test propio de `components/shared/supplier/` o a la página donde se montan (alta en la vista,
edición en el detalle), afirmando la precarga y el `FormData` enviado en R38. Si algún caso se da
por obsoleto, que el test o la bitácora digan por qué, caso a caso.

### Menores

1. **Comentarios largos (más de ~5 líneas) en líneas nuevas o reescritas de producción**: la cabecera de `listShowcaseAliveSuppliers` (13 líneas), `SupplierShowcaseList` (11), `supplier-showcase-params.ts` (9), `list-showcase-lines.ts` (9), `delete-supplier-dialog.tsx` (9, reescrito), `supplier-detail-header.tsx` (bloque reescrito de unas 13), `supplier-showcase.ts` (7), `supplier-showcase-section.tsx` (7), `supplier-showcase-filters.tsx` (6) y el comentario JSX de la h1 del detalle (6). Además, el comentario de la primera línea de `supplier-showcase.ts` repite la ruta del archivo, y `Se llama cuando el centinela entra en vista` (prop `onVisible`) repite el código.
2. **`appendWithoutDuplicates` está duplicada** en `supplier-showcase-list.tsx` y `supplier-showcase-row.tsx`, idéntica salvo el nombre de la variable.
3. **R32, «conservar el foco»**: el test solo mira que `SupplierShowcaseFilters` aparezca antes de `<Suspense` en el fuente de `page.tsx`. No comprueba el foco.
4. **R21 en integración**: el «cargar más» encadenado con `productSearch` activo no se ejercita contra Postgres. Solo el unitario afirma que el término viaja. La integración de R17/R31 siembra los proveedores en orden alfabético de creación, así que no distingue el orden por nombre del orden de inserción. Lo cubre `showcase-prisma.test.ts` con la forma de `orderBy`.
5. **R4, «antes de validar la entrada»**: el test usa una entrada válida. Un caso con entrada inválida y sin permiso, que tenga que dar `UnauthorizedError` y no `ValidationError`, fijaría el orden.
6. **Guardias R29 y D20 de `guard-convenciones-showcase.test.ts`**: comparan contra el merge-base con `origin/dev`. Una vez mergeada la rama, en `dev` el diff es vacío y quedan en verde sin comprobar nada.
7. **`docs/dependencias.md`**: la fila dice que la librería detecta el final «de la lista de proveedores o de un carrusel», pero el carrusel usa un botón «Cargar más» y no la librería.
8. **Bitácora inexacta**: dice que `data-table-alcance` pasa «de 18 a 17», y el test dice de veintiuno a veinte. `aislamiento.json` y la cabecera del test de integración dicen que se siembra una «unidad», pero el test usa la unidad de sistema existente.
9. **Comentarios que la rama deja obsoletos sin tocar su archivo**: `tests/unit/navegacion/pantallas-exigen-permiso.test.tsx:44` cita `supplier-page.test.tsx`, que ya no existe. `supplier-list-empty.tsx` conserva la prop `firstPageHref` y su comentario sobre «la página que se quedó atrás», que ya no tiene ningún consumidor. No es un hallazgo de la regla de comentarios (son líneas preexistentes). Es una nota para la limpieza del módulo.
10. **T14**: sigue abierta hasta la revisión humana en Safari iOS y Chrome Android reales. Condiciona el `done`, no es un defecto del código.

## Veredicto

**RECHAZADO** — 2 mayores (M1, M2) y 10 menores.

Para volver a revisión: arreglar M1 con un test que se ponga rojo con la clase actual, y restituir
la cobertura de M2 (o justificar caso a caso lo que se da por obsoleto). Después, `./init.sh
--rapido` en verde. T14 y T15 siguen su curso: revisión humana y `./init.sh` completo.
