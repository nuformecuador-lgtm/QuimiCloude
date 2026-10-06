# Review QC-199 — presentacion-por-unidad-en-alta-de-producto

## Vuelta 1 (completa, origin/dev...8b769fa1)

Revisor: reviewer (F2.2). Fecha: 2026-10-05. Grafo de codigo: no consultado; revision con Grep/Read sobre el diff.

### Verificacion ejecutada por el reviewer

- `pnpm run typecheck`: 0 errores.
- `pnpm run lint`: 0 errores (8 avisos previos, ninguno del diff).
- Vitest (ui + node) sobre los tests del diff y `tests/guards/` completo: 73 archivos, 1149 passed,
  1 failed. El rojo es `product-page.test.tsx` › «R18 — el nombre del producto se pinta junto a la
  unidad guardada», listado en `tests/baseline-rojos.json`. No es hallazgo.
- Integracion: `product-batch-require-unit`, `product-unit-without-presentation`,
  `unit-catalog-visible`, `order-ingredients-cost`, `order-cost-quote`, `order-batches`:
  6 archivos, 46 passed.
- No se corrio el gate completo ni E2E (los corre el leader). Los logs de E2E de la bitacora
  (`progress/e2e_QC-199_chromium.log`, `progress/e2e_QC-199_webkit.log`) dan 8/9 con el rojo conocido de R26.

### Checklist

| Punto | Estado | Nota |
|---|---|---|
| 1. Trazabilidad R1..R20 a test | OK | Cada R tiene al menos un test con aserciones reales. Leidos: R1-R5 (`product-form-unidad.test.tsx`), R8 (rechazo antes de zod y sin tocar unidades ni puerto), R9 (forma exacta de `NewProduct` y lote), R14 (aplica `down.sql` dentro de la transaccion y vuelve a subir), R20 (pagina y caso de uso). |
| 2. Tasks marcadas | NO | T12 sin marcar. Motivo: R26 de `e2e/inventario.spec.ts:783`, deuda conocida pendiente del humano. No se cuenta como hallazgo nuevo; impide `done` hasta que el humano decida. |
| 3. CHECKPOINTS / Especificacion | Parcial | requirements EARS, design con alternativas descartadas (§8): OK. Tasks: ver punto 2. |
| 3. CHECKPOINTS / Trazabilidad | OK | Mapa R1..R20 en la bitacora. |
| 3. CHECKPOINTS / Calidad | OK | typecheck, lint y tests afectados en verde (salvo baseline). E2E de movimiento de inventario: `e2e/insumo-por-unidad.spec.ts` (R19). |
| 3. CHECKPOINTS / Multiplataforma | OK con nota | Targets de 44x44 (`TOUCH_TARGET`) en el boton de ayuda nuevo; sin `100vh`, sin inputs de texto nuevos. Ver m1 sobre el tooltip. |
| 3. CHECKPOINTS / Dependencias | OK | `package.json` sin cambios. `lucide-react` y el tooltip ya estaban en uso. |
| 3. CHECKPOINTS / Datos y seguridad | OK | Sin tablas ni modelos nuevos (`db/schema.prisma` intacto). Migracion con `down.sql`. Permiso `inventario.modificar` en el servicio (`create-product.ts`, `list-product-form-units.ts`) con tests. Unidad validada contra la empresa con `findRefs` (R7). `listVisibleUnitRefs` usa `companyScopeWhere`, con test de otra empresa. Sin secretos. |
| 3. CHECKPOINTS / Hexagonal | OK | `domain/` importa solo el contrato `@/lib/modules/unidades`. `inventario` no toca `prisma.unit`: va por `UnitCatalog`. Cableado en `lib/composition`. Guardias en verde. |
| 3. CHECKPOINTS / Permisos | OK | La pagina pide las unidades en el servidor y las baja por props. |
| 3. CHECKPOINTS / Verificacion final | Pendiente | Gate completo y E2E: leader. history y worktree: cierre. |
| 5. Calidad y seguridad | OK | Ver arriba. Sin webhooks. |
| 6. Multiplataforma | OK con nota | m1. |
| 7. Dependencias | OK | Sin cambios. |
| 8. Aislamiento por empresa | OK | Sin modelo nuevo. Las consultas nuevas (`findAliveIdByNameInUnit`, `listVisibleUnitRefs`) filtran por empresa y tienen test de acceso cruzado (`product-unit-without-presentation.int.test.ts:190`, `unit-catalog-visible.int.test.ts`). |
| 9. Comentarios | NO | B1. |

### Cambios fuera del spec que se pidio mirar

- **Prop `helper` de `components/shared/presentation-unit-select.tsx`.** El design §6 pide un helper,
  asi que el texto si esta en el spec. Lo que no esta es el mecanismo: el selector compartido gana una
  prop opcional que pinta un boton (`type="button"`, 44x44) con tooltip, copiado del bloque de
  `presentation-select.tsx:432-458`. Sin `helper` el componente pinta lo mismo que antes, asi que los
  usos que ya habia no cambian. Hallazgos: m1, m2 y m3.
- **`formUnits` en `product-list-section.tsx`.** Hace falta: el estado vacio del listado monta su
  propio `ProductSheet`. Sin esta prop, ese alta mostraria «Unidad» sin opciones y no se podria dar de
  alta el primer insumo de una empresa. Es correcto, pero ningun test cubre ese camino: m4.
- **Guardias ajustadas en 2a819eb2.** Las revise una por una y no se aflojan:
  `guard-identificador-de-request` y `data-table-alcance` siguen siendo listas cerradas con una entrada
  mas, y `inventario-schema` sigue comparando las factorias por igualdad exacta. En `qc121-alcance` y
  `unidades/module-contract`, la prohibicion total de `unitId` pasa a ser «exactamente una declaracion
  `unitId?: string`, una sola rama `unitId: unitIdSchema` con uuid y una sola lectura de la clave
  unitId en la accion». La unidad como texto sigue prohibida. Es lo minimo que exigen R6 y R9.
- **Esperas de los E2E (19e81a1d, 13b04679).** Son esperas por asercion (`toHaveCount`, `toHaveText`
  con timeout), no `waitForTimeout`. La recarga antes de reabrir el panel compensa una cache de lotes
  que ya habia en `product-batches-sheet.tsx` y no oculta ningun defecto de esta ficha: el valor que se
  comprueba despues sale de la base. Sin hallazgos.

### Hallazgos

- **B1 — BLOQUEANTE (comentarios, `docs/conventions.md > Comentarios`).**
  `app/(private)/inventario/components/product-form.tsx:47`: el diff modifica la linea
  (de «**El costo tampoco**» a «**El costo no esta**») y conserva la cita «QC-52 lo saco del producto
  entero...». Una linea modificada de produccion que cita `QC-<n>` es bloqueante. Hay que quitar la
  referencia a la ficha y dejar solo el motivo (los terminos comerciales son del catalogo del
  proveedor). Es el unico caso: el resto de lineas anadidas o modificadas en `app/`, `components/`,
  `lib/` y `db/` no citan `QC-`, `R<n>`, `design.md` ni «decision cerrada».

- **m1 — menor (multiplataforma, sin verificar).** El helper nuevo de «Unidad» solo se ve con
  hover o con foco de teclado (tooltip de Base UI). En iOS y Android, tocar un boton no garantiza que
  el tooltip se abra, y no he podido comprobar el soporte tactil de `@base-ui/react/tooltip`. No bloquea
  por tres razones: es el mismo patron que ya se acepto en `product-field.tsx` y en
  `presentation-select.tsx` dentro de este formulario, el texto solo informa (no activa nada) y el
  formulario se completa sin el. Si el humano quiere que la ayuda llegue en tactil, es una ficha para
  todos los helpers, no solo para este.
- **m2 — menor (test).** La prop `helper` de `PresentationUnitSelect` no tiene test: ni que se pinte
  el boton y su texto, ni que no se pinte sin `helper`, ni que pulsarlo dentro del formulario no envie
  el alta (`type="button"`). `PRESENTATION_UNIT_HELPER_TESTID` y `PRESENTATION_UNIT_HELPER_TEXT_TESTID`
  se exportan y nadie los usa.
- **m3 — menor (duplicacion).** El bloque etiqueta + boton + tooltip de
  `presentation-unit-select.tsx:136-160` copia casi literal `presentation-select.tsx:428-458` (y
  `product-field.tsx`). Un tercer uso justifica extraer un componente compartido, en esta ficha o en otra.
- **m4 — menor (test).** Ningun test cubre `formUnits` en `ProductListSection`, es decir, el alta
  que se abre desde el estado vacio del listado. Los dos casos R20 de `product-page.test.tsx` abren
  el alta de la cabecera. Si se pierde la prop, el selector del estado vacio sale vacio y no salta
  nada.

### Fuera de hallazgos (ya conocido)

- R26 de `e2e/inventario.spec.ts:783`, rojo en los dos navegadores: deuda previa de `a543c84d`.
- La cobertura de QC-22 R24 (presentacion en linea sin perder lo escrito) se pierde en
  `e2e/inventario.spec.ts`: pendiente del humano.
- Por eso T12 sigue sin marcar.

### Veredicto

**RECHAZADO**: 1 bloqueante (B1) y 4 menores (m1-m4).

Para pasar: corregir B1 (quitar `QC-52` de la linea modificada en `product-form.tsx:47`). Los menores
m2 y m4 se cierran con tests baratos y conviene hacerlos en la misma vuelta. Ademas, la feature no
puede pasar a `done` mientras T12 siga sin marcar, y eso depende de la decision del humano sobre R26.

## Vuelta 2 (acotada a 8b769fa1..8447d9d6)

### Verificacion ejecutada por el reviewer
- `npx tsc --noEmit`: verde.
- `npx eslint` sobre los 3 archivos de codigo/test del diff: verde.
- `npx vitest related --run` sobre los 3 archivos: 2 rojos, ambos en `tests/baseline-rojos.json`:
  `product-page.test.tsx` › «R18 — el nombre del producto se pinta junto a la unidad guardada»
  (ya anotado en la vuelta 1) y `pantallas-exigen-permiso.test.tsx` › «'/pedidos' se sirve con el
  permiso» (deuda ajena de dev). No son hallazgo. Los casos nuevos de m2 y m4 pasan.
- `npx vitest run tests/guards`: 44 archivos, 610 tests en verde.

### Estado de los hallazgos de la vuelta 1
| Hallazgo | Estado | Evidencia |
|---|---|---|
| B1 | CERRADO | `c02b74ea`: el JSDoc de `TEXT_FIELDS` en `product-form.tsx:44-50` ya no cita `QC-52` ni `(R5)`. Las lineas añadidas en `app/` no contienen `QC-<n>`, `R<n>`, `design.md` ni «decision cerrada». |
| m2 | CERRADO | `e4fafbb2`: 3 casos en `presentation-unit-select.test.tsx` (sin `helper` no pinta disparador ni texto; con `helper` pinta el disparador con nombre accesible y su texto al hover; el disparador es `type="button"` y no envia el formulario). Asertan comportamiento real. |
| m3 | ACEPTADO sin cambio | Anotado en la bitacora (`impl_...md`, «Review, vuelta 1»), decision del leader. |
| m1 | ACEPTADO sin cambio | Anotado en la bitacora, decision del leader. |
| m4 | CERRADO | `99fe9be7`: el caso abre el alta desde el estado vacio (`testId.vacio`) con `listUnitsAction` y `listProductFormUnitsAction` devolviendo unidades distintas y aserta que las opciones son solo las del formulario. Discrimina: el estado vacio pasa `formUnits` en `product-list-section.tsx:88`; sin el, `ProductForm` cae a `formUnits = []` y no habria opciones. |

### Regresiones en el diff
Ninguna. El unico cambio de produccion es el texto de un comentario. Los tests añadidos no tocan
mocks compartidos fuera de su caso (`mockResolvedValue` dentro del `it`, como el resto del archivo).

### Hallazgos nuevos
Ninguno.

### Veredicto
**OK**: B1, m2 y m4 cerrados; m1 y m3 aceptados por el leader y anotados en la bitacora. Sin
bloqueantes ni regresiones. R26 y QC-22 R24 quedan fuera de esta revision (pendientes del humano).
