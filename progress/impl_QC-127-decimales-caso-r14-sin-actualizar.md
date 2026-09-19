# QC-127 — decimales-caso-r14-sin-actualizar · bitacora de implementacion

> Rama `feature/QC-127-decimales-caso-r14-sin-actualizar` · worktree
> `.worktrees/QC-127-decimales-caso-r14-sin-actualizar` · zona `frontend`.
> Spec: `specs/QC-127-decimales-caso-r14-sin-actualizar/{requirements,design,tasks}.md`.
>
> **Esta ficha no toca codigo de produccion.** Las unicas escrituras permanentes son archivos de
> `tests/`, `specs/` y `progress/` (R5, R13). No se delego nada a `backend_dev`: no hay modelo,
> endpoint, migracion, RLS ni Server Action en esta ficha — se dice explicitamente en vez de
> inventar una delegacion.

## Estado de las tasks

(se completa al cierre)

## Censo de [D5] (T5-T11, R7-R9)

Seis archivos, una fila cada uno. `tests/unit/shared-ui/decimal-display.test.ts` **queda fuera a
proposito**: es el test de la utilidad, no de una pantalla.

Formas buscadas (`design.md > 4`): **(a)** afirmacion de presentacion que exija mas de dos
decimales · **(b)** afirmacion de presentacion por **subcadena** (`toHaveTextContent` con literal
numerico donde deberia ir `.textContent).toBe(...)`) · **(c)** valor **redondeado** pintado sin
afirmar su `title` exacto.

| archivo | formas buscadas | lineas inspeccionadas | resultado |
|---|---|---|---|
| `tests/unit/pedidos-ui/order-columns.test.tsx` | a, b, c | 220-241, 252-262, **264-290** (bloque «la cantidad se pinta REDONDEADA A DOS DECIMALES»), 296-305 | **(a)** no: los valores esperados son `12.5`, `15`, `0.13`, `1.01`, ninguno con mas de dos decimales. **(b)** no: los tres casos del bloque numerico usan `container.textContent).toBe(...)`, igualdad exacta; los `toHaveTextContent` de 238/259/297/305 son sobre etiquetas de texto (marcador de ausencia, estado, prioridad), no sobre decimales. **(c)** el test no puede afirmar un `title` porque **la celda no lo renderiza**: `app/(private)/pedidos/components/order-columns.tsx:201` pinta `formatDecimalDisplay(order.quantity)` **sin** `exactDecimalTitle`. Eso **no es un defecto del test** sino de la pantalla, que esta ficha tiene prohibido tocar -> **hallazgo de OTRO tipo, no se arregla aqui** (R11), anotado mas abajo. Del mismo tipo: **ninguno**. |
| `tests/unit/pedidos-ui/order-form.test.tsx` | a, b, c | 692-717 (vecino «requerida/restante»), 718-742 (vecino «restante negativo»), 743-760 (R12/R13), **761-786 (caso R14)** | **(b) + (c): hallazgo del mismo tipo, el que origina la ficha** — el caso R14 afirmaba `toHaveTextContent('-0.2')` (subcadena) y **no** afirmaba el `title` exacto. **Corregido aqui en T1-T3 (R1, R2, R3).** Resto del archivo: los vecinos ya tienen el patron completo (`.textContent).toBe(...)` + `title` exacto + clase de resalte); los `toHaveTextContent('40')` / `('—')` / `('0')` de 703-704 y 743-760 son marcadores de ausencia o enteros que el redondeo no cambia, no decimales redondeados. **(a)** ninguna. |
| `tests/unit/pedidos-ui/order-sheet.test.tsx` | a, b, c | 461-484 (precarga al editar), 499-521 (reapertura en blanco), y barrido completo del archivo por `textContent` / `toHaveValue` / `toHaveTextContent` | **Sin hallazgos.** Las dos unicas afirmaciones numericas —`(... as HTMLInputElement).value).toBe('12.5')` (480) y `.value).toBe('')` (518)— son el **`value` de un campo editable** precargado con `trimDecimal`, que **no redondea**: R8 las excluye expresamente y el propio archivo lo explica en su comentario de 474-479. Este archivo **no pinta ninguna celda de solo lectura con decimal**. |
| `tests/unit/proveedores-ui/catalog-line-sheet.test.tsx` | a, b, c | 512-526, 569-578, 605-617, 632-663, 679-687, 716-718, 744-757, 875-892 | **Sin hallazgos.** Las coincidencias de cuatro decimales son exactamente la trampa que [D5]/R8 excluye: `'0.1005'` (616-617, 680, 687) y `'1234.5678'` (679, 686) son **valores enviados** (`enviado.get('cost')`, `enviado.get('minPurchase')`) o el **`value` de un `input`** precargado — **deben** ser exactos y llevar todos sus decimales porque el dato vuelve a la base. **Contarlos habria sido trabajo falso.** Los `toHaveTextContent` de 640/718/744/781/784/819/849 son simbolo de unidad y mensajes de error, no decimales. Es un panel de formulario: **no tiene celdas de solo lectura**. |
| `tests/unit/proveedores-ui/supplier-detail-page.test.tsx` | a, b, c | 361-387, 563-576, 605-612, **636-641**, **643-661**, 665-672 | **(a)** no. **(b)** no: las afirmaciones decimales usan `.textContent).toBe(...)`, igualdad exacta. **(c): HALLAZGO DEL MISMO TIPO** en el caso «el costo y el minimo de compra se pintan REDONDEADOS A DOS DECIMALES» (636-641): el escenario trae `minPurchase: '0.1005'` y el caso afirma que se pinta `'0.1'` —el redondeo **cambia** lo que se ve— **sin afirmar el `title`**. El caso vecino de 643-661 **no lo cubre**: alli `minPurchase` vale `'25.0000'` y lo que afirma es justo `.not.toHaveAttribute('title')`. Resultado: **ningun test del repositorio afirmaba que esa celda conserva `'0.1005'`**, que es literalmente el defecto de R14. La pantalla **si** lo renderiza (`app/(private)/proveedores/[id]/components/catalog-columns.tsx:198,210`), asi que se corrige **solo en el test** -> **R17, T12**. |
| `tests/unit/recetas-ui/recipe-form.test.tsx` | a, b, c | 383, 418-427, 555-586, **588-616**, 805-838, 865, 1143-1149, 1343-1377 | **Sin hallazgos.** `'3.25'` (566, 570, 586) y `'0.1255'` (609, 616) son el **`value` de un `input`** precargado con `trimDecimal` y el **valor enviado** en el `payload`: R8 los excluye, y el propio archivo lo razona en su comentario de 578-585 («la precarga NO REDONDEA»). Los `toHaveTextContent` de 562-563, 835-838, 1143-1145 y 1345 son texto de pasos, simbolo de unidad y nombres. Este formulario **no pinta ninguna celda de solo lectura con decimal**. |

**Recuento del censo (T11).** 6 archivos censados, 6 filas, ninguna vacia.

- Hallazgos **del mismo tipo**: **2** — el caso R14 de `order-form.test.tsx` (el que motiva la
  ficha; R1-R3, tanda A) y el caso de 636-641 de `supplier-detail-page.test.tsx` (R17, T12). Los
  dos **se corrigen aqui** (R10).
- Hallazgos **de otro tipo**: **1** — la columna «Cantidad» del listado de pedidos. **No se
  arregla** (R11): se deja tal cual y se reporta con lo medido, abajo.
- Coincidencias **descartadas por R8** (valor enviado o `value` de `input`; **no** son hallazgos):
  `catalog-line-sheet.test.tsx` 616-617, 679-680, 686-687; `recipe-form.test.tsx` 566, 570, 586,
  609, 616; `order-sheet.test.tsx` 480, 518.

## Hallazgo de OTRO tipo — se reporta, NO se arregla (T13, R11)

**Donde, medido.** `app/(private)/pedidos/components/order-columns.tsx:201` (columna
`QUANTITY_COLUMN_ID`), contrastado con `tests/unit/pedidos-ui/order-columns.test.tsx:278-281`.

**Que se midio.**

- Valor de origen del escenario: `quantity: '0.1255'`.
- Valor pintado, esperado por el test y obtenido: `'0.13'`. El redondeo **cambia** lo que se ve.
- `title` presente en el DOM: **ninguno**. La celda pinta `formatDecimalDisplay(order.quantity)`
  **sin** envolverlo en `exactDecimalTitle`, asi que el valor exacto **no queda en ninguna parte
  del DOM**.
- Como se comprobo: lectura de la declaracion de la columna (`order-columns.tsx:192-202`) y del
  bloque de test (`order-columns.test.tsx:264-290`), mas un `grep` de `exactDecimalTitle` sobre
  `app/` y `lib/`, que devuelve sus usos en `order-ingredients-table.tsx` (160, 173, 183, 190) y
  `catalog-columns.tsx` (198, 210) y **ninguno en `order-columns.tsx`**.

**Por que es de OTRO tipo y no se toca aqui.** Corregirlo exige cambiar **la pantalla** (`app/`),
que esta ficha **ratifica** y tiene prohibido modificar (R5, R13). El test no esta flojo: afirma
correctamente lo que la pantalla hace hoy. Lo que hay es una **incoherencia entre pantallas** —las
otras dos celdas decimales de solo lectura del producto, ingredientes del pedido y catalogo del
proveedor, si llevan el exacto en su `title`; esta no—.

**Matiz honesto, para que el leader decida con el dato completo:** el comentario de
`order-columns.tsx:55-64` razona el redondeo de esta celda, pero **no dice nada sobre el `title`**.
No consta si la ausencia fue decision o descuido, y **no se rellena con un supuesto**.

**Ficha propuesta** (el implementer **no** la abre; la propone y el leader decide con el humano):
«la columna Cantidad del listado de pedidos pierde el decimal exacto al redondear — llevarlo al
`title`, como ya hacen las otras dos celdas decimales de solo lectura». Zona `frontend`; tocaria
`app/(private)/pedidos/components/order-columns.tsx` y
`tests/unit/pedidos-ui/order-columns.test.tsx`.

## Prueba de mordida (T4 y T12, `design.md > 7`)

«Lo cambie y sigue verde» **no es una verificacion** cuando lo que se cambia es la afirmacion: un
test que no afirma nada tambien esta verde. Cada afirmacion nueva o endurecida se sometio a una
mutacion **temporal**, se corrio **solo** su archivo, se anoto el rojo y se **revirtio**.

| # | Afirmacion | Mutacion temporal | Rojo obtenido | Revertida |
|---|---|---|---|---|
| M1-A | R1, texto exacto `-0.2` | `order-ingredients-table.tsx`: pintar `{remaining}` sin pasar por `formatDecimalDisplay`, con lo que la celda pasa a pintar `-0.201` | **ROJO**: `AssertionError: expected '-0.201' to be '-0.2'` en `order-form.test.tsx:796`. Cayeron los 3 casos del bloque que usan esa celda | si |
| M1-B | **la comparativa: R1 contra la afirmacion VIEJA** | la **misma** mutacion de produccion, devolviendo el caso a la forma antigua `toHaveTextContent('-0.2')` | **VERDE**: 31 de 33 pasan y **R14 NO aparece entre los fallos**, pese a que la celda pintaba `-0.201`. La afirmacion por subcadena **no detecta el calculo roto**; la nueva si | si |
| M2 | R2, `title` exacto `-0.201` | escenario del propio caso R14: `productStock: 0` -> `productStock: 0.001`; el restante exacto pasa a `-0.2`, que es ya lo pintado, asi que `exactDecimalTitle` devuelve `undefined` y el atributo desaparece | **ROJO**: `expected the element to have attribute: title="-0.201" / Received: null` en `order-form.test.tsx:797`. Cayo solo R14 (32/33) | si |
| M3 | R3 + R4, clase de resalte | `order-ingredients-table.tsx`: `isShort` mira el valor **pintado** (`formatDecimalDisplay(remaining).startsWith('-')`) en vez del exacto | **ROJO**: `expected the element to have class: text-destructive / Received: ""` en `order-form.test.tsx:741`, el caso vecino de `-0.001`, que pinta «0» y pierde el resalte. **R14 no cayo**, y es correcto: su exacto `-0.201` pinta `-0.2`, que tambien empieza por `-`. Demuestra **R4** de paso | si |
| M4 | **R17**, `title` exacto `0.1005` | escenario del caso de `supplier-detail-page.test.tsx`: `minPurchase: '0.1005'` -> `'0.10'` | **ROJO**: `expect(element).toHaveAttribute("title", "0.1005") ... Received: null` en `supplier-detail-page.test.tsx:649` (1 failed / 28 passed) | si |
| M4-B | **la comparativa de R17** | la misma mutacion con las dos afirmaciones nuevas comentadas, o sea la version «antigua» del caso, solo `textContent` | **VERDE**: 29 passed, 0 failed. El caso antiguo **no habria detectado** la perdida del valor exacto | si |

**M1-B y M4-B son el nucleo de esta ficha.** Sin ellas solo habria constancia de que los tests
siguen verdes, que es justo lo que no prueba nada. Con ellas queda **medido** que la afirmacion
vieja pasaba en verde con el calculo roto y la nueva no.

Tras revertir: `order-form.test.tsx` vuelve a **33 passed (33)** y `supplier-detail-page.test.tsx`
a **29 passed (29)**. `git status --short -- app lib` **sin salida**: la produccion quedo
**identica a `dev`**.

## Requisitos negativos comprobados por diff (T14)

El diff de la ficha son **solo** archivos de `tests/`, `specs/` y `progress/`.

| Requisito | Que exige | Comprobacion |
|---|---|---|
| R5 | cero cambios en `app/` y `lib/` | `git status --short -- app lib` **sin salida** y `git diff --numstat origin/dev...HEAD -- app lib` **sin salida**. Las mutaciones de T4 se revirtieron con `git checkout --` |
| R12 | ninguna guardia automatica nueva | `git diff --name-only origin/dev...HEAD -- tests/guards` devuelve **0 archivos**; la rama tiene las mismas **41** guardias que `dev`, y ningun archivo nuevo de convenciones. Motivo escrito en `design.md > 6` citando **QC-99** y las **tres** guardias ajenas rotas al cerrar QC-79 |
| R13 | `decimal-display.ts` y su test, intactos | sin cambios en `lib/shared/ui/decimal-display.ts` ni en `tests/unit/shared-ui/decimal-display.test.ts` |
| R14 | nada en `e2e/` | `git diff --numstat ... -- e2e` **sin salida**. La ficha no necesita E2E (`[D9]`) |
| R15 | `tests/baseline-rojos.json` sin tocar | `git diff --numstat ... -- tests/baseline-rojos.json` **sin salida** |
| R16 | ninguna dependencia nueva | `git diff --numstat ... -- package.json pnpm-lock.yaml` **sin salida** |

## Mapa de trazabilidad R<n> -> evidencia (T17)

| Requisito | Evidencia concreta |
|---|---|
| R1 | `tests/unit/pedidos-ui/order-form.test.tsx`, caso R14: `await waitFor(() => expect(restante.textContent).toBe('-0.2'))`. **Muerde**: mutaciones **M1-A** (rojo) y **M1-B** (la forma vieja pasaba en verde con el calculo roto) |
| R2 | mismo caso: `expect(restante).toHaveAttribute('title', '-0.201')`. **Muerde**: mutacion **M2** (rojo, `Received: null`). Es la primera vez que un test del repo afirma que el calculo de ese caso da `-0.201` |
| R3 | mismo caso: `expect(restante.firstElementChild).toHaveClass('text-destructive')`, en pie. **Muerde**: mutacion **M3** |
| R4 | caso vecino «un restante negativo se resalta en rojo» (`.toBe('0')` + `title '-0.001'` + clase), ratificado; y mutacion **M3**, que al decidir el resalte con el valor pintado deja ese caso sin resalte y lo pone en rojo |
| R5 | T14: ni una linea bajo `app/` ni `lib/` |
| R6 | comentario fechado **2026-09-18** junto al caso R14: el resalte se decide con el exacto; en telefono o impreso **no hay `title`** y el unico aviso es el color, aceptado a sabiendas; alternativa `<0.01` evaluada y descartada. Mas `design.md > 3` |
| R7 | tabla del censo: **seis** filas, una por archivo, con las tres formas a/b/c |
| R8 | misma tabla: las coincidencias de `catalog-line-sheet.test.tsx`, `recipe-form.test.tsx` y `order-sheet.test.tsx` aparecen clasificadas como **valor enviado** o **`value` de `input`**, **no** como hallazgo, con sus lineas |
| R9 | misma tabla: ninguna fila vacia; cada una con lineas inspeccionadas y un resultado de los tres posibles |
| R10 | **2** hallazgos del mismo tipo, los **dos corregidos aqui**: el caso R14 (R1-R3) y el caso de `supplier-detail-page.test.tsx` (**R17**, con su nota fechada al final de `requirements.md`) |
| R11 | **1** hallazgo de otro tipo, la columna «Cantidad» del listado de pedidos: **no se arreglo**, se anoto lo **medido** (archivo, linea, origen `0.1255`, pintado `0.13`, `title` ausente) y se **propuso ficha**. El implementer **no la abrio** |
| R12 | T14: cero guardias nuevas; 41 guardias, las mismas que `dev` |
| R13 | T14: `decimal-display.ts` y su test sin cambios |
| R14 | T14: cero archivos bajo `e2e/` |
| R15 | T14: `tests/baseline-rojos.json` sin cambios |
| R16 | T14: `package.json` y lockfile sin cambios |
| **R17** | `tests/unit/proveedores-ui/supplier-detail-page.test.tsx`, caso «el costo y el minimo de compra se pintan REDONDEADOS A DOS DECIMALES»: `toHaveAttribute('title', '1234.5678')` y `toHaveAttribute('title', '0.1005')`. **Muerde**: mutaciones **M4** (rojo) y **M4-B** (el caso antiguo pasaba en verde) |

## Estado de las tasks (cierre)

| Task | Estado |
|---|---|
| T1, T2, T3 | **cerradas** (`frontend_dev`) — caso R14 con el patron completo |
| T4 | **cerrada** — tres mutaciones mas la comparativa A/B, todas revertidas |
| T5-T10 | **cerradas** — censo archivo por archivo, seis filas escritas |
| T11 | **cerrada** — recuento: 2 hallazgos del mismo tipo, 1 de otro tipo |
| T12 | **cerrada** (`frontend_dev`) — R17 corregido, con nota fechada en `requirements.md` y su propia prueba de mordida |
| T13 | **cerrada** — hallazgo de otro tipo reportado con lo medido y **sin tocar el codigo** |
| T14 | **cerrada** — los seis requisitos negativos comprobados por diff |
| T15 | **NO la corre el implementer**: `./init.sh --rapido` es gate, y `AGENTS.md > Regla del gate` lo deja en manos del leader |
| T16 | **NO la corre el implementer** — gate completo y PR, del leader |
| T17 | **cerrada** — mapa `R1`-`R17` arriba |

## Verificacion ejecutada (la que toca al implementer, no el gate)

- `pnpm run typecheck` — **verde**, sin errores.
- `pnpm run lint` — **verde**, sin errores.
- `pnpm exec vitest related --run tests/unit/pedidos-ui/order-form.test.tsx` — **33/33**.
- `pnpm exec vitest related --run tests/unit/proveedores-ui/supplier-detail-page.test.tsx` —
  **29/29**.
- **No se corrio `pnpm test` ni `./init.sh`**, ni por el implementer ni por ningun subagente.
- **E2E: no hace falta** (`[D9]`, R14) y no se anadio ninguno.
- **Ningun rojo de baseline en juego:** los dos archivos tocados no estan en
  `tests/baseline-rojos.json`, y no se anadio ninguno (R15).

## Delegacion

- `frontend_dev` — T1-T3 (caso R14), T4 (prueba de mordida) y T12 (R17). Tres delegaciones.
- `backend_dev` — **ninguna, y se dice explicitamente**: la ficha no tiene modelo, migracion, RLS,
  endpoint ni Server Action. Inventar una delegacion habria sido trabajo falso.

### Salida real de la ejecucion conjunta del implementer (2026-09-18)

```
pnpm exec vitest related --run tests/unit/pedidos-ui/order-form.test.tsx \
                               tests/unit/proveedores-ui/supplier-detail-page.test.tsx

 RUN  v4.1.10 .../.worktrees/QC-127-decimales-caso-r14-sin-actualizar

 Test Files  2 passed (2)
      Tests  62 passed (62)
   Duration  104.24s
```

`pnpm run typecheck` y `pnpm run lint`: ambos terminan **sin una sola linea de error**.
