# QC-103 — lote-y-fecha-de-compra-en-el-alta · tasks.md

Convención: los nombres de test citan `R<n>`, nunca `QC-nn` (regla del harness). "Hecho" en cada
task exige typecheck + lint locales sobre los archivos tocados; el gate completo (`./init.sh`) se
corre una sola vez al final, antes del PR (regla 5 de `CLAUDE.md`).

## Backend — el lote de vuelta (R12, R13, R4/D4)

- [x] **T1.** Ampliar `lib/modules/inventario/ports/product-repository.ts`: `createWithFirstBatch`
      devuelve `Promise<{ id: string; batchId: string; lot: string }>` y `addBatchToAlive` devuelve
      `Promise<{ batchId: string; lot: string } | null>`. Solo firma y comentario; sin lógica.
      **Hecho cuando**: el puerto compila con la nueva firma (el adaptador y el dominio aún no la
      cumplen, así que romperá typecheck hasta T2-T3; se hacen en el mismo commit).

- [x] **T2.** `lib/modules/inventario/adapters/driven/persistence/product-prisma.ts`: en
      `createWithFirstBatch` y `addBatchToAlive`, incluir `lot` (la variable local que
      `resolveBatchLot()` ya captura) en el objeto que cada función retorna.
      **Hecho cuando**: `pnpm run typecheck` no marca error en este archivo y un test unitario
      nuevo en `tests/unit/modules/inventario/` —`createWithFirstBatch devuelve el lote escrito
      cuando R12 lo pide`, `addBatchToAlive devuelve el lote escrito cuando R13 lo pide`— pasa
      contra un doble de Prisma o la base de test, cubriendo tanto el lote generado (`lot: null`
      en la entrada) como el lote tecleado a mano.

- [x] **T3.** `lib/modules/inventario/domain/create-product.ts`: cambiar el tipo de retorno de
      `createCreateProduct` a `Promise<{ id: string; lot: string }>` y devolver `lot` en los dos
      caminos (`{ id: existente, lot: agregado.lot }` y `{ id: creado.id, lot: creado.lot }`).
      **Hecho cuando**: test unitario `createProduct devuelve el lote asignado al crear un
      producto nuevo (R12)` y `createProduct devuelve el lote asignado al agregar batch a un
      producto existente (R13)` pasan en `tests/unit/modules/inventario/create-product.test.ts`
      (ampliando el archivo existente, sin archivo nuevo). Incluye un test de autorización que ya
      exista o se confirme vigente: `createProduct rechaza sin el permiso inventario.modificar
      (R10)`.

- [x] **T4.** `lib/modules/inventario/adapters/driving/product-actions.ts`: ampliar
      `CreateProductFormState` con `lot: string` en la rama `success`, y `createProductAction`
      desestructura y devuelve `lot`.
      **Hecho cuando**: test unitario `createProductAction devuelve el lote en el estado de éxito
      (R12)` pasa en `tests/unit/modules/inventario/product-actions.test.ts` (o el archivo
      equivalente que ya exista).

## Frontend — fecha de compra (R1-R5)

- [x] **T5. [P]** Crear `app/(private)/inventario/components/product-batch-date-field.tsx`:
      componente con `Popover` + `Calendar` en `mode="single"`, valor por defecto "hoy" en hora
      local, `disabled={{ after: hoy }}`, e `<input type="hidden" name="purchaseDate">` que
      sincroniza el valor elegido para viajar en el `FormData` del formulario no controlado.
      Exportar desde `app/(private)/inventario/components/index.ts`.
      **Hecho cuando**: test de componente en `tests/unit/` —`el campo de fecha de compra abre con
      la fecha de hoy seleccionada (R2)`, `el campo de fecha de compra no permite elegir un día
      futuro (R5)`— pasan con Testing Library.

- [x] **T6.** Depende de T5. En `product-form.tsx`: añadir `'purchaseDate'` a `BATCH_FIELDS`,
      `FIELD_MESSAGES.purchaseDate`, `FIELD_LABELS.purchaseDate`, montar
      `ProductBatchDateField` junto a los demás campos del lote (solo en el alta, R9), y añadir
      `purchaseDate: readOptionalText(values.purchaseDate)` al objeto que valida
      `createProductWithFirstBatchSchema.safeParse`.
      **Hecho cuando**: test de componente `el alta rechaza el envío sin fecha de compra (R3)` y
      `el alta de producto envía la fecha de compra elegida como YYYY-MM-DD (R4)` pasan; y test ya
      existente de que la edición no pinta campos del lote sigue en verde (cubre R9 sin test
      nuevo si ya existe; si no existe, se añade `la edición no muestra el campo de fecha de
      compra (R9)`).

- [ ] **T7. [P]** En `product-form.tsx`: cambiar el `helper` del campo `lot` al texto de
      `design.md > 3` («Déjalo vacío para que el sistema lo asigne»).
      **Hecho cuando**: test de componente `el campo lote explica que un valor vacío lo asigna el
      sistema (R6)` pasa, y test ya existente de que el lote sigue siendo un `<input type="text">`
      opcional sigue en verde (R7; si no existe, se añade uno).

## Frontend — aviso con el lote (R14-R16)

- [ ] **T8.** Depende de T4, T6. En `product-form.tsx`: `save()` guarda `result.lot` cuando
      `result.status === 'success'` y `onSaved` pasa a aceptar `(lot?: string) => void`; se llama
      `onSaved(result.lot)` en el alta y `onSaved()` en la edición (sin cambio de comportamiento
      ahí).
      **Hecho cuando**: test de componente `tras un alta con éxito, ProductForm llama a onSaved
      con el lote devuelto por el servidor (R12)` pasa.

- [ ] **T9.** Depende de T8. En `product-sheet.tsx`: `handleSaved` recibe `(lot?: string)`, y
      cuando `!isEdit` construye el texto del `toast.success` nombrando el lote (p. ej. `Producto
      creado. Lote ${lot}.`); en la edición el texto no cambia.
      **Hecho cuando**: test de componente —`el aviso de alta nombra el lote asignado por el
      sistema (R14)`, `el aviso de alta nombra el lote tecleado a mano sin decir que lo asignó el
      sistema (R15)`, `el aviso de edición no cambia y no nombra ningún lote (R9)`— pasan; y una
      revisión visual/grep confirma que no se añadió ningún elemento nuevo al DOM del panel para
      mostrar el lote, solo el `toast` existente (R16, se verifica leyendo el diff, no con test).

## Verificación de cierre

- [ ] **T10. [P]** Ampliar `e2e/inventario.spec.ts` con el caso de `design.md > 7`: alta con fecha
      de compra por defecto y lote vacío (correlativo generado), aserto final sobre el texto del
      `toast`.
      **Hecho cuando**: `el alta de producto muestra el lote asignado en el aviso de éxito (R14,
      R17)` pasa con `pnpm run e2e` (o el runner de Playwright del repo) contra un entorno local.

- [ ] **T11.** Depende de T1-T10. Completar `progress/impl_QC-103-lote-y-fecha-de-compra-en-el-alta.md`
      con el mapa `R1..R17 -> test`, incluyendo los tests heredados que ya cubrían R8, R10, R11
      antes de esta ficha (citarlos, no reescribirlos).
      **Hecho cuando**: cada `R<n>` de `requirements.md` aparece con al menos un test concreto en
      el mapa.

- [ ] **T12.** Depende de T11. Correr `./init.sh` completo (no `--rapido`) antes de abrir el PR.
      **Hecho cuando**: termina en verde, incluidas las guardias de arquitectura y de dependencias
      (que deben quedar en verde sin cambios en `docs/dependencias.md`, porque no entra ninguna
      dependencia nueva).
