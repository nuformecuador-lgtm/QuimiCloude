# QC-160 — boton-de-subida-de-pdf · design.md

> Zona `frontend` · depende de **QC-142** (en implementación, todavía no en `dev`). Medido el 2026-09-24
> sobre el árbol del worktree `.worktrees/QC-160-boton-de-subida-de-pdf` (rama recién sacada de
> `origin/dev`), más el spec aprobado de QC-142, que se lee y no se toca.

## 0. Qué cambia, en una frase

La subida de QC-107 deja de estar montada a la vista en `/proveedores/[id]`. Pasa a abrirse desde un
botón, en un diálogo de shadcn/Base UI ya instalado, y el mismo botón aparece en el listado
`/produccion/formulas` con la estrategia `formula`. Solo lo pinta el servidor, y solo para quien tiene
`documentos.modificar`. El componente de subida, sus acciones y el módulo `documentos` no cambian de
comportamiento.

## 1. Estado medido

### 1.1 El componente de subida (QC-107)

- `components/shared/document-upload/`: `document-upload.tsx`, `document-upload-row.tsx`, `labels.ts`,
  `upload-file.ts`, `use-batch-status.ts` e `index.ts` (barrel).
- `DocumentUpload({ strategy })` es `'use client'` y **guarda todo su estado dentro**: archivos
  elegidos, fase de navegador, `batchId`, errores y `busy` (`document-upload.tsx:50-57`). El sondeo
  (`use-batch-status.ts`) se arma con `batchId` y se desarma cuando el componente se desmonta
  (`:67-70`). Por eso cerrar la ventana a mitad de tanda es sobre todo una cuestión de **montaje** (sección 5).
- Test ids estables: `document-upload`, `-input`, `-trigger`, `-submit`, `-clear`,
  `-selection-error`, `-error` (con `data-code`), `-resume`, `-missing` y `-list`, más los de fila.
- Área táctil: `TOUCH_TARGET = 'min-h-11 min-w-11 text-base'` (`:37`). El `<input type="file">` es
  `sr-only text-base` y la selección se hace por un `<label>`.

### 1.2 Dónde se monta hoy

- `app/(private)/proveedores/[id]/page.tsx:126`: `<DocumentUpload strategy="catalogo" />` sin
  condición, al final de la rama de éxito, detrás de `requirePagePermission('proveedores.consultar')`
  (`:79`). Tras QC-140, los componentes de la ruta viven en `[id]/components/` (barrel `index.ts`) y
  los compartidos de proveedor en `components/shared/supplier/`. La cabecera `SupplierDetailHeader`
  (`[id]/components/supplier-detail-header.tsx`) agrupa editar y dar de baja en `:22-25`.
- `/produccion/formulas` (`app/(private)/produccion/formulas/page.tsx`) no monta la subida. Es un
  Server Component con `requirePagePermission('recetas.consultar')` en `:25`, una fila de título con
  el enlace «Nueva fórmula» (`recipe-create-open`, `:31-44`) y la sección de lista en `<Suspense>`.

### 1.3 El diálogo que ya existe

- `components/ui/dialog.tsx`: shadcn sobre `@base-ui/react/dialog`, versión 1.7.0 medida en
  `node_modules`. Lo usan `app/(private)/inventario/components/adjust-batch-dialog.tsx` y
  `app/(private)/produccion/formulas/components/recipe-form.tsx`.
- `DialogContent` monta `DialogPortal` **sin pasarle props** (`:51`). El `Popup` lleva
  `sm:max-w-sm`, y su botón de cerrar integrado es `size="icon-sm"` (`size-7`, 28 px) con un
  `sr-only` en inglés («Close»). Con eso no se cumplen los 44x44 px de R15.
- `DialogPrimitive.Portal` de Base UI acepta `keepMounted?: boolean` (por defecto `false`;
  `DialogPortal.d.ts:17` en 1.7.0): con `true` el portal sigue montado mientras el popup está oculto.

### 1.4 Cómo llega un permiso a un componente

`docs/architecture.md > Permisos y autenticacion`: la página (Server Component) resuelve la sesión y
baja un booleano por props. En el repo hay dos formas de hacerlo:

- **Predicado publicado por el módulo dueño del permiso**: `canAdjustBatchStock` en
  `lib/modules/inventario/domain/actor.ts:75` y `canModifyAssignments` en
  `lib/modules/asignaciones/domain/actor.ts:114`. Aceptan un `PermissionBearer`, delegan en
  `assertPermission` de `identity`, nunca lanzan y el código de permiso no sale del módulo. Los
  consumen `product-list-section.tsx:57` y `order-list-section.tsx:129` con
  `identity.getSessionUser()`.
- **`assertPermission` con un literal en la página**: `app/(private)/configuracion/usuarios/page.tsx:63-74`.

`identity.getSessionUser()` comparte **una** lectura por petición con `requirePagePermission`
(QC-104), así que volver a llamarlo en la página no añade ninguna consulta.

### 1.5 El E2E de documentos

- `e2e/documentos.spec.ts`: un caso (`sube tres PDFs ... (R20)`) que crea empresa, Administrador y
  proveedor efímeros con el prefijo `qc107_e2e_` + `RUN_ID`. Intercepta el `PUT` a
  `https://documentos-e2e.invalid/**` y lo cuenta, y espera `data-status="done"` en cada fila.
  Afirma **`batches.length` igual a 1 para la empresa** (`:301-305`).
- Dobles: `playwright.config.ts > webServer.env` enciende `DOCUMENTS_E2E_DOUBLES=1` (almacenamiento
  en memoria, cola en línea, IA de guion) y define `CATALOG_PROMPT` y `FORMULA_PROMPT` ficticios. La
  estrategia `formula` ya tiene su prompt en el doble, así que no hay que tocar configuración.
- Chromium y WebKit, con `fullyParallel: true`: cada worker tiene su propio `RUN_ID` y su propio
  `beforeAll`.

### 1.6 Tests que hoy afirman lo contrario de esta ficha

| Archivo | Qué afirma hoy | Por qué se rompe |
|---|---|---|
| `tests/unit/documentos-ui/supplier-detail-upload.test.tsx:249-272` | la subida se ve montada bajo el catálogo | ahora está detrás del botón |
| `tests/unit/documentos-ui/supplier-detail-upload.test.tsx:274-282` | «el montaje no añade ningún corte de permiso propio» | ahora lo añade (R10, R11) |
| `tests/unit/documentos-ui/document-upload-convenciones.test.ts:124-141` | solo `proveedores/[id]/page.tsx` monta la pieza | ahora la monta también fórmulas |
| `tests/unit/documentos-ui/document-upload-convenciones.test.ts:171-201` | ninguna pantalla de fórmulas monta la subida | ahora sí (D3) |
| `e2e/documentos.spec.ts:253, 257` | `document-upload` visible nada más cargar | ahora hay que pulsar el botón primero |

## 2. Lo que se da por hecho de QC-142

Esta rama sale de `dev` **sin** QC-142. La T0 de `tasks.md` no deja empezar hasta que QC-142 esté en
`dev` y mergeado aquí. Se da por hecho lo que fija su spec aprobado:

- `PERMISSIONS` gana `documentos.consultar` y `documentos.modificar`, y solo el Administrador los
  recibe en el seed. La migración además hereda `documentos.modificar` a todo rol con
  `proveedores.modificar`.
- `DOCUMENT_UPLOAD_PERMISSION` (`lib/modules/documentos/domain/actor.ts`) vale
  `'documentos.modificar'` y es lo primero que exigen los tres casos de uso de subida.
- Las Server Actions, el route handler de la cola y `app/(private)/proveedores/[id]/page.tsx` **no
  cambian** en QC-142.
- QC-142 añade a `e2e/documentos.spec.ts` un caso con un rol efímero que tiene
  `proveedores.consultar` y `proveedores.modificar`, pero no `documentos.modificar`, y que ve el
  error de autorización al subir. Esta ficha cambia ese caso (9.3, D11).

Si al llegar a T0 cualquiera de estos puntos ha cambiado en `dev`, se para y se vuelve al spec. No se
adapta sobre la marcha.

## 3. Componentes

### 3.1 `DocumentUploadDialog` (nuevo, compartido)

`components/shared/document-upload/document-upload-dialog.tsx`, `'use client'`, exportado por el
barrel de la carpeta. Va en `shared/` y no junto a una ruta porque lo usan **dos** pantallas con la
misma API (`docs/architecture.md > Regla: sin sobre-ingenieria`).

```ts
export type DocumentUploadDialogProps = {
  readonly strategy: PdfStrategy;
};
```

Composición:

```
<Dialog>
  <DialogTrigger render={<Button variant="outline" className={TOUCH_TARGET} data-testid="document-upload-open" />}>
    {OPEN_LABEL}
  </DialogTrigger>
  <DialogContent keepMounted showCloseButton={false} data-testid="document-upload-dialog"
                 className="sm:max-w-lg max-h-[85dvh] overflow-y-auto">
    <DialogHeader>
      <DialogTitle>{DIALOG_TITLE}</DialogTitle>
      <DialogDescription>{dialogDescription(MAX_FILES_PER_BATCH)}</DialogDescription>
    </DialogHeader>
    <DocumentUpload strategy={strategy} />
    <DialogFooter>
      <DialogClose render={<Button variant="ghost" className={TOUCH_TARGET} data-testid="document-upload-close" />}>
        {CLOSE_LABEL}
      </DialogClose>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

- **No recibe nada sobre permisos.** Quien decide si se monta es la página (sección 4). El test de
  convenciones de QC-107 exige que ningún archivo de la carpeta nombre «permission» ni «permiso», y
  sigue en vigor.
- **No escribe la estrategia como literal.** Le llega por prop, igual que a `DocumentUpload`, porque la
  misma guardia prohíbe `'catalogo'` y `'formula'` dentro de la carpeta.
- `showCloseButton={false}` y un `DialogClose` propio en el pie: el cerrar integrado mide 28 px y dice
  «Close». El propio lleva `TOUCH_TARGET` y texto en castellano (R15).
- `max-h-[85dvh] overflow-y-auto`: una tanda de diez filas no cabe en un móvil. Se usa `dvh` y no
  `vh` por la barra de direcciones de iOS (R15).
- Escape y el foco de vuelta al disparador (R3, R4) los da Base UI por defecto. Solo se prueban.
- `keepMounted` mantiene la tanda viva al cerrar la ventana (D8, R21; sección 5).

> **Nota 2026-09-24 (D9, choque con QC-158 resuelto al sincronizar; decisión del leader, opción A).**
> QC-158 montó en `/proveedores/[id]` el envoltorio `CatalogPdfUpload`
> (`[id]/components/catalog-pdf-upload.tsx`), que pasa a `DocumentUpload` la prop
> `reviewHrefFor` (el acceso «Revisar» de cada fila lista). Por eso `DocumentUploadDialogProps` gana
> `readonly reviewHrefFor?: (documentFileId: string) => string`, opcional, que se pasa tal cual a
> `DocumentUpload`. El diálogo sigue sin saber nada de permisos ni de rutas.

### 3.2 Textos (`labels.ts`, se amplía)

`OPEN_LABEL = 'Subir PDFs'`, `DIALOG_TITLE = 'Subir PDFs'`, `CLOSE_LABEL = 'Cerrar'` y
`dialogDescription(max)` → «Solo PDF, hasta {max} archivos por tanda.». El tope llega importado del
contrato (`MAX_FILES_PER_BATCH`), nunca escrito, que es lo que exige la guardia R22 de QC-107. El texto
del botón, «Subir PDFs», lo fija D10 (R22 de esta ficha); el título, «Cerrar» y la descripción son
propuesta de este spec, aprobada con él.

### 3.3 `components/ui/dialog.tsx`

`DialogContent` gana una prop opcional `keepMounted?: boolean` que se reenvía a `DialogPortal` (D8).
El valor por defecto sigue siendo el de Base UI (`false`), así que `adjust-batch-dialog` y
`recipe-form` no cambian. Es una línea en la primitiva ya instalada: **no se re-crea el diálogo** (D7,
R20).

### 3.4 Lo que NO se toca

`document-upload.tsx`, `document-upload-row.tsx`, `upload-file.ts`, `use-batch-status.ts`, las Server
Actions de `documentos` y los casos de uso (R9). Los tests de componente de QC-107
(`document-upload-flow`, `-rows`, `-selection`, `-errors`, `-strategy`, `-a11y-tactil` y
`use-batch-status`) tienen que seguir verdes **sin editarlos**.

## 4. El permiso en el servidor

### 4.1 Predicado del módulo `documentos`

En `lib/modules/documentos/domain/actor.ts`, junto a la constante:

```ts
export function canUploadDocuments(actor: PermissionBearer | null | undefined): boolean {
  try {
    assertPermission(actor, DOCUMENT_UPLOAD_PERMISSION, () => DENIED);
    return true;
  } catch {
    return false;
  }
}
```

- Es el patrón de `canAdjustBatchStock` y `canModifyAssignments`. Usa **la misma** constante que los
  casos de uso de subida, así que el botón y el service no pueden divergir (R12). El literal sigue
  escrito una sola vez en el módulo, que es la regla R17 de QC-142.
- No lanza: es presentación, no autorización (R13, R14).
- Se publica por el barrel (`lib/modules/documentos/index.ts`). La lista cerrada
  `EXPORTACIONES_DE_EJECUCION` de `tests/unit/documentos/module-contract.test.ts` gana
  `canUploadDocuments`. `PermissionBearer` se importa del barrel de `identity`
  (`lib/modules/identity/index.ts:23`).

### 4.2 Las dos páginas

```ts
await requirePagePermission('proveedores.consultar');          // o 'recetas.consultar'
// ... lecturas de la página, igual que hoy
const canUpload = canUploadDocuments(await identity.getSessionUser());
```

- El corte de la página va **primero**, antes de cualquier lectura, también la del permiso de subida
  (R14). `tests/unit/navegacion/pantallas-exigen-permiso.test.tsx` ya lo vigila y tiene que seguir
  verde sin cambios.
- `{canUpload ? <DocumentUploadDialog strategy="…" /> : null}`: sin permiso, el diálogo **no se
  renderiza**. Ni botón ni subida viajan en el HTML (R11). Al cliente solo le llega el árbol ya
  decidido, nunca la lista de permisos (R12).
- `identity.getSessionUser()` reutiliza la lectura de `requirePagePermission` dentro de la misma
  petición (1.4). No hay segunda consulta.

## 5. Cerrar la ventana a mitad de tanda (D8, R21)

El estado de la tanda vive **dentro** de `DocumentUpload` (1.1), así que sobrevive a cerrar la ventana
solo si el componente no se desmonta. Por defecto, Base UI desmonta el popup cerrado.

Decisión: **sin aviso, y al reabrir se ve la misma tanda con su estado.** Se implementa con
`keepMounted` en el portal (3.1, 3.3). El componente sigue montado y oculto, y el sondeo continúa hasta
que todos los archivos terminan, igual que hoy con la subida a la vista.

- **No toca la lógica de QC-107** (Alcance y D4). Un aviso habría necesitado saber desde fuera si hay
  una tanda en curso, y eso obliga a que `DocumentUpload` publique su estado hacia arriba.
- **No miente**: el servidor sigue procesando (QC-111). Reabrir y ver la tanda en marcha cuenta lo que
  de verdad pasa.
- **Coste aceptado**: con la ventana cerrada, el sondeo sigue consultando cada 2 s hasta que la tanda
  termina, lo mismo que hoy con la subida a la vista. El componente sigue en el DOM aunque oculto: los
  tests afirman «no visible» (`toBeHidden` / `not.toBeVisible()`), no «no existe». El botón no muestra
  ningún indicador de tanda en curso, porque no está pedido.

La otra opción, desmontar al cerrar, queda en la sección 14 como alternativa descartada. El E2E de R16
y R17 no cierra la ventana a mitad de tanda; R21 lo prueba el unit del diálogo.

## 6. Montaje por pantalla

### 6.1 `/proveedores/[id]`

- Se quita el `<DocumentUpload strategy="catalogo" />` de `page.tsx:126`.
- `DocumentUploadDialog strategy="catalogo"` en una fila propia de la página, **entre**
  `SupplierDetailHeader` y el `<Suspense>` del catálogo, alineada a la derecha (D10, R22). No se mete
  dentro de `SupplierDetailHeader`, para no tocar un componente de ruta que QC-158 puede estar cambiando
  (D9).
- Solo en la rama de éxito. Con proveedor inexistente o error de carga no se monta (R7).

> **Nota 2026-09-24 (D9, decisión del leader, opción A).** En `dev`, `page.tsx` ya no monta
> `<DocumentUpload strategy="catalogo" />`: monta `<CatalogPdfUpload supplierId={…} />` (QC-158).
> El montaje en proveedores pasa por ese envoltorio. `CatalogPdfUpload` renderiza
> `<DocumentUploadDialog strategy="catalogo" reviewHrefFor={…} />` y la página monta
> `{canUpload ? <CatalogPdfUpload supplierId={…} /> : null}` entre `SupplierDetailHeader` y el
> `<Suspense>` del catálogo. «Revisar» sigue disponible dentro de la ventana, y lo afirma
> `tests/unit/proveedores-ui/catalog-pdf-upload.test.tsx`, enmendado con su motivo escrito en el test.
> Fórmulas no cambia (6.2). En la guardia de convenciones, los puntos de montaje de la pieza pasan a
> ser `formulas/page.tsx` y `catalog-pdf-upload.tsx`. La regla «llaman a `canUploadDocuments`» se
> afirma sobre las dos páginas.

### 6.2 `/produccion/formulas`

- En la fila del título, junto al enlace «Nueva fórmula» (D10, R22), agrupados en un
  `div className="flex flex-wrap items-center gap-2"`. `strategy="formula"`.
- Solo en el listado (`page.tsx`). `nueva/page.tsx` y `[id]/page.tsx` no se tocan (R7).
- La página importa `identity` de `@/lib/composition` y `canUploadDocuments` del barrel de
  `documentos`. Las dos cosas están permitidas en `app/**` de servidor.

## 7. Contratos I/O

No cambia ninguno. Las Server Actions `issueUploadLinksAction`, `enqueueBatchAction` y
`getBatchStatusAction` se llaman igual y desde el mismo componente. La única superficie pública nueva
es `canUploadDocuments(actor): boolean` en el contrato de `documentos`. No hay rutas nuevas, ni
constantes de ruta, ni ítems de menú (la guardia R19 de QC-107 sigue en vigor para eso).

## 8. Datos

Ninguno. No hay tabla, columna, migración, RLS ni seed. El permiso lo trae QC-142.

## 9. Pruebas

### 9.1 Unit nuevos

- `tests/unit/documentos/can-upload-documents.test.ts`: devuelve `true` con `documentos.modificar` y
  `false` con `proveedores.modificar`, `documentos.consultar`, `recetas.modificar`, conjunto vacío,
  `null` o `undefined`. No lanza. Usa la constante del módulo y no un literal, y el literal
  `documentos.modificar` aparece una sola vez en `lib/modules/documentos` (R12).
- `tests/unit/documentos-ui/document-upload-dialog.test.tsx`: con las acciones dobladas, como en los
  tests de QC-107:
  - cerrado, la subida no está visible y el botón sí (R1);
  - pulsar abre un `role="dialog"` con nombre accesible y `document-upload` dentro (R2);
  - cerrar con `document-upload-close` y con Escape la oculta (R3), y el foco vuelve a
    `document-upload-open` (R4);
  - `accept="application/pdf"` y rechazo de `MAX_FILES_PER_BATCH + 1` archivos dentro de la ventana
    (R8);
  - `issueUploadLinksAction` en `unauthorized` muestra `document-upload-error` con
    `data-code="unauthorized"` y no llama a `enqueueBatchAction` (R13);
  - botón y cerrar con `min-h-11 min-w-11`, y el popup con `max-h-[85dvh]` y `overflow-y-auto` (R15);
  - con archivos elegidos y con una tanda en `processing`, cerrar y reabrir muestra las mismas filas
    con su fase y estado, sin ningún diálogo de confirmación al cerrar, y el sondeo sigue llamando a
    `getBatchStatusAction` con la ventana cerrada (R21);
  - el botón dice «Subir PDFs» (R22).
- `tests/unit/documentos-ui/formulas-upload.test.tsx`: la página de fórmulas con sesión que tiene
  `recetas.consultar` + `documentos.modificar` pinta el botón, y al subir encola `strategy: 'formula'`
  (R6, R10). Con `recetas.consultar` + `recetas.modificar` + `documentos.consultar` y sin
  `documentos.modificar`, no hay ni `document-upload-open` ni `document-upload` (R11).

### 9.2 Unit que se reescriben

- `supplier-detail-upload.test.tsx`: el caso de montaje pasa a «con el permiso de subida hay botón, la
  subida está oculta hasta pulsarlo, y al subir se encola `catalogo`» (R1, R5, R10). El caso «no
  añade ningún corte de permiso» pasa a «sin `documentos.modificar` (con `proveedores.consultar` y
  `proveedores.modificar`) no hay botón ni subida» (R11), más «proveedor inexistente: sin botón» (R7).
  Caso nuevo (R22): `document-upload-open` va después de `supplier-detail` y antes de `catalog-list` en
  el orden del documento (`compareDocumentPosition`). En `formulas-upload.test.tsx`, el botón comparte
  contenedor padre con `recipe-create-open`.
- `document-upload-convenciones.test.ts`:
  - R19 de QC-107: la lista de páginas que montan la pieza pasa a ser exactamente
    `[formulas/page.tsx, proveedores/[id]/page.tsx]`, y `nueva/` y `[id]/` de fórmulas no la montan
    (R7). El listado de proveedores tampoco.
  - R18 de QC-107: se sustituye por «la única pantalla de fórmulas que monta la pieza es el listado; y
    ninguna fuente de fórmulas nombra `proveedores.*`». Lo del catálogo cerrado ya lo ajustó QC-142
    (ver riesgo 13.2: solo se toca aquí si sigue en rojo en `dev` al empezar).
  - Nuevo: ninguna página de `app/` escribe el literal `documentos.modificar`, las dos que montan el
    diálogo llaman a `canUploadDocuments`, y ningún fuente de la carpeta del componente contiene
    `permission`, `permiso` ni `roleName` (R12).
  - Nuevo: `package.json` no cambia respecto de `dev` en dependencias, y la carpeta del componente
    solo importa del diálogo de `@/components/ui/dialog`, nunca de `@base-ui/react` directamente
    (R20).
- `module-contract.test.ts`: `canUploadDocuments` en `EXPORTACIONES_DE_EJECUCION`.
- Tests de componente de QC-107: **sin cambios**. Si alguno se pone rojo, se ha roto R9.

### 9.3 E2E (`e2e/documentos.spec.ts`)

No nace ningún archivo: la lista cerrada de E2E de `guard-identificador-de-request.test.ts` no cambia.

- **R16** (caso existente de QC-107, ajustado): tras `goto(supplierDetailRoute)`, afirma
  `document-upload-open` visible y `document-upload` oculto (`toBeHidden`: con `keepMounted` está
  en el DOM pero no visible). Pulsa el botón, espera `document-upload-dialog` visible y sigue el recorrido de siempre. La
  afirmación de base de datos pasa de «una tanda en la empresa» a «**una tanda nueva con estrategia
  `catalogo`**»: se cuentan antes y después, filtrando por empresa y estrategia, porque el caso de
  fórmulas puede compartir empresa si cae en el mismo worker.
- **R17** (nuevo): mismo Administrador y misma empresa del worker. Hace `goto(FORMULAS_ROUTE)` (la
  constante, nunca el literal), pulsa el botón, elige **dos** PDFs con nombres
  `qc107_e2e_formula_<n>_<RUN_ID>.pdf`, sube, espera `data-status="done"` en las dos filas y afirma una
  tanda nueva con estrategia `formula` y dos archivos `done`. El contador de `PUT` interceptados sube
  en 2.
- **R18** (el caso que añade QC-142, D11): mismo rol efímero y mismo usuario. Tras abrir
  el detalle de un proveedor de su empresa, afirma `document-upload-open` y `document-upload` con
  `toHaveCount(0)`, cero `PUT` interceptados y el mismo conteo de tandas antes y después. El nombre del
  caso lleva `R18` y conserva la referencia a QC-142 R20.
- **R19**: los tres casos dependen solo de los dobles de `playwright.config.ts` y del
  `page.route()` al origen `.invalid`. El contador de `PUT` de cada caso es el ancla de que no se ha
  escapado nada.
- Limpieza: la cadena `try/finally` y el barrido de huérfanos existentes ya cubren tandas y archivos
  por empresa, sin cambios. Los prefijos de fixture siguen siendo `qc107_e2e_`.

## 10. Multiplataforma

- Botón y cerrar: `min-h-11 min-w-11` (44 px). La selección de archivos sigue siendo el `<label>` del
  componente, sin arrastrar y sin `:hover` (R15).
- El popup es `position: fixed` con scroll interno. `docs/architecture.md` pide comprobarlo en iOS: el
  E2E corre en **WebKit**, que es el motor de iOS, y recorre la ventana abierta con filas dentro. No es
  un iPhone real; es lo que el gate puede ejercitar sin dispositivo.
- No hay inputs de texto nuevos. Si alguno entrara al implementar, lleva `text-base md:text-base`
  (el `md:text-sm` de la primitiva haría zoom en iOS).
- No hay excepción de escritorio que declarar.

## 11. Dependencias de terceros

Ninguna (D7, R20). El diálogo es `components/ui/dialog.tsx` (shadcn sobre `@base-ui/react`, que ya está
en `docs/dependencias.md`). No se ejecuta `npx shadcn add`. No se tocan `package.json`,
`pnpm-lock.yaml` ni `docs/dependencias.md`.

## 12. Mapa de trazabilidad previsto

| R | Test |
|---|---|
| R1, R2, R3, R4 | `tests/unit/documentos-ui/document-upload-dialog.test.tsx` |
| R5 | `tests/unit/documentos-ui/supplier-detail-upload.test.tsx` |
| R6 | `tests/unit/documentos-ui/formulas-upload.test.tsx` |
| R7 | `document-upload-convenciones.test.ts` (páginas que montan) y `supplier-detail-upload.test.tsx` (proveedor inexistente) |
| R8 | `document-upload-dialog.test.tsx` |
| R9 | los siete tests de componente de QC-107, verdes y sin editar (diff vacío sobre ellos) |
| R10, R11 | `supplier-detail-upload.test.tsx` y `formulas-upload.test.tsx` |
| R12 | `tests/unit/documentos/can-upload-documents.test.ts` y `document-upload-convenciones.test.ts` |
| R13 | `document-upload-dialog.test.tsx` |
| R14 | `tests/unit/navegacion/pantallas-exigen-permiso.test.tsx` (existente, sin cambios) |
| R15 | `document-upload-dialog.test.tsx` y E2E en WebKit |
| R16 | `e2e/documentos.spec.ts` (caso de QC-107 ajustado) |
| R17 | `e2e/documentos.spec.ts` (nuevo, fórmulas) |
| R18 | `e2e/documentos.spec.ts` (caso de QC-142 ajustado) |
| R19 | `e2e/documentos.spec.ts` (contadores de `PUT` de los tres casos) |
| R20 | `document-upload-convenciones.test.ts` y `tests/guards/guard-dependencias-aprobadas.test.ts` |
| R21 | `document-upload-dialog.test.tsx` (reabrir conserva filas, fases y estado; sin confirmación al cerrar) |
| R22 | `document-upload-dialog.test.tsx` (texto), `supplier-detail-upload.test.tsx` y `formulas-upload.test.tsx` (posición) |

## 13. Riesgos

1. **QC-158 (`in_progress`, fullstack) y `/proveedores/[id]`** (D9). Esta ficha toca
   `app/(private)/proveedores/[id]/page.tsx` y `supplier-detail-upload.test.tsx`, y además
   `lib/modules/documentos/domain/actor.ts` e `index.ts`. El choque se revisa en T0, al sincronizar
   con `dev` y antes de implementar. Si QC-158 toca cualquiera de ellos, se para y decide el leader.
2. **`document-upload-convenciones.test.ts:188-192` de QC-107** afirma que ningún código del catálogo
   casa con `/documento/i`, y QC-142 lo rompe al añadir `documentos.*`. El arreglo le corresponde al
   implementer de QC-142, al que ya se le ha pasado. T0 comprueba en `dev` si sigue en rojo, y **solo
   en ese caso** lo arregla la T6 de esta ficha, dejándolo anotado.
3. **Imports en tests de fórmulas.** `recipe-page.test.tsx` y `pantallas-exigen-permiso.test.tsx`
   importan `formulas/page.tsx`. Ahora esa página arrastra el componente de cliente y sus acciones
   `'use server'`. Si el import no resuelve en jsdom, se añade el `vi.mock` de las dos acciones de
   `documentos`, como ya hace `supplier-detail-upload.test.tsx`. No se toca ningún caso.
4. **`keepMounted` en jsdom.** Queda por verificar en T2 que Base UI 1.7.0 oculta el
   popup cerrado (atributo `hidden` o `display: none`) de forma que `not.toBeVisible()` lo detecte en
   jsdom. Si no lo hace, la afirmación de R1 pasa a comprobar el estado cerrado del popup
   (`data-closed`) y se anota.

## 14. Alternativas descartadas

1. **Decidir el botón en la página con `assertPermission(user, 'documentos.modificar', …)`**, como
   `configuracion/usuarios/page.tsx`. Descartada: escribe el código de permiso fuera del módulo
   `documentos`, dos veces (una por página), y puede divergir de `DOCUMENT_UPLOAD_PERMISSION` el día que
   cambie. El predicado del módulo garantiza que el botón y el service miden lo mismo (R12).
2. **Pasar los permisos o un `canUpload` al componente compartido y que él se oculte.** Descartada: el
   HTML llevaría el componente aunque fuera para ocultarlo, y la carpeta del componente nombraría un
   permiso, que la guardia de QC-107 prohíbe. No montarlo desde el servidor es más simple y cumple R11
   literalmente.
3. **Enseñar el botón deshabilitado a quien no tiene permiso.** Descartada: D5 dice que solo lo ve
   quien tiene el permiso, y además un botón deshabilitado anuncia una capacidad que el usuario no
   tiene.
4. **`Sheet` (panel lateral) en vez de diálogo.** Descartada: D1 fija una ventana emergente, y el panel
   lateral ya se usa en esa misma pantalla para la línea de catálogo. Dos paneles laterales en una
   pantalla se confunden.
5. **Sacar el estado de la tanda a un contexto o a la página, para que sobreviva al desmontar.**
   Descartada: reescribe el estado de `DocumentUpload`, que el Alcance y D4 dejan fuera. `keepMounted`
   da lo mismo con una línea en la primitiva.
6. **Componer el diálogo con `@base-ui/react/dialog` directamente dentro de
   `components/shared/document-upload/`** para usar `keepMounted` sin tocar `components/ui/dialog.tsx`.
   Descartada: sería un segundo diálogo (D7), y la guardia de QC-107 exige que la carpeta solo importe
   el paquete `react`.
7. **Desmontar la subida al cerrar la ventana**, con o sin aviso. Descartada por D8. Sin aviso, quien
   cierra en mitad del envío ve la ventana vacía al reabrir, aunque la tanda siga encolándose en el
   servidor, y eso invita a subir dos veces el mismo PDF. Con aviso, `DocumentUpload` tendría que
   publicar su estado hacia fuera, lo que toca el componente de QC-107 que D4 deja fuera.
8. **Un archivo E2E nuevo para fórmulas.** Descartada: la lista cerrada de E2E de
   `guard-identificador-de-request.test.ts` tendría que cambiar, y el fixture (empresa, Administrador,
   intercepción del `PUT`) ya está en `documentos.spec.ts`.
