# QC-127 — decimales-caso-r14-sin-actualizar · tasks.md

> Requisitos: `requirements.md` (R1–R16). Diseño: `design.md`.
> **Esta ficha NO toca código de producción.** Si una task te lleva a editar `app/` o `lib/` de
> forma permanente, párate: algo se torció (R5, R13). Las mutaciones de T4 son **temporales y se
> revierten**.
>
> `[P]` = paralelizable con las tasks marcadas igual dentro de su misma tanda.

---

## Tanda A — el caso R14

### [x] T1 — Endurecer el texto pintado a igualdad exacta (R1)
**Archivos:** `tests/unit/pedidos-ui/order-form.test.tsx` (caso «R14 — sin ningun lote…», ~línea 774).
**Depende de:** nada.

Sustituir `await waitFor(() => expect(restante).toHaveTextContent('-0.2'))` por la espera con
**igualdad exacta** del `textContent`, en la misma forma que usan los tres vecinos del bloque
(líneas 711, 713, 739).

**Hecho cuando:** la afirmación es `expect(restante.textContent).toBe('-0.2')` dentro del `waitFor`,
no queda ningún `toHaveTextContent` sobre esa celda en ese caso, y `pnpm vitest run
tests/unit/pedidos-ui/order-form.test.tsx` pasa.

### [x] T2 — Añadir la afirmación del `title` exacto (R2)
**Archivos:** `tests/unit/pedidos-ui/order-form.test.tsx` (mismo caso).
**Depende de:** T1.

Añadir `expect(restante).toHaveAttribute('title', '-0.201')`. Ojo a la distribución de nodos que
describe `design.md > 2`: el `title` va en el **`<td>`** (`restante`), la clase en su
**`firstElementChild`**.

**Hecho cuando:** el caso afirma el `title` `'-0.201'` y el archivo pasa. Con esto, por primera vez
un test afirma que el cálculo de ese caso da `-0.201`.

### [x] T3 — Dejar escrito lo que se ratifica y lo que se acepta (R3, R4, R6)
**Archivos:** `tests/unit/pedidos-ui/order-form.test.tsx` (comentario del caso).
**Depende de:** T2.

Confirmar que la afirmación de clase `text-destructive` sobre `restante.firstElementChild` sigue en
pie (R3) y actualizar el comentario fechado del caso para que diga: (a) que el resalte se decide con
el valor **exacto** y no con el pintado (R4), y (b) que **en móvil o impreso no hay `title`** y allí
el único aviso es el color, aceptado a sabiendas, con la alternativa `<0.01` evaluada y descartada
(R6, `[D3]`).

**Hecho cuando:** el caso R14 tiene las tres afirmaciones del patrón completo (texto exacto, `title`
exacto, clase) y el comentario fechado 2026-09-18 con los dos puntos anteriores. `pnpm lint` y
`pnpm typecheck` en verde.

---

## Tanda B — demostrar que muerde

### [x] T4 — Mutar, ver el rojo y revertir (R1, R2, R3, R4)
**Archivos:** temporalmente `app/(private)/pedidos/components/order-ingredients-table.tsx` y el
escenario del caso en `order-form.test.tsx`. **Ambos revertidos al terminar.**
**Depende de:** T3. **No paralelizable.**

Aplicar, una a una, las tres mutaciones de `design.md > 7`, correr **solo**
`tests/unit/pedidos-ui/order-form.test.tsx`, anotar el mensaje de rojo y **revertir**. En la
mutación de R1 se corren **dos** variantes —con la afirmación nueva y con el
`toHaveTextContent('-0.2')` antiguo— para dejar constancia de que la vieja **pasaba en verde** con
el cálculo roto.

**Hecho cuando:** `progress/impl_QC-127-decimales-caso-r14-sin-actualizar.md` tiene una tabla con
una fila por mutación (mutación aplicada · rojo obtenido · revertida), la variante comparativa de R1
incluida, y `git status` sobre `app/` y `lib/` está **limpio**.

---

## Tanda C — el censo de `[D5]`

> Las seis revisiones son independientes entre sí: **todas `[P]`**. Dependen de T3 solo para no
> mezclar diffs; el orden entre ellas da igual.

### [x] T5 `[P]` — Censar `tests/unit/pedidos-ui/order-columns.test.tsx` (R7, R8, R9)
### [x] T6 `[P]` — Censar `tests/unit/pedidos-ui/order-form.test.tsx` (R7, R8, R9)
### [x] T7 `[P]` — Censar `tests/unit/pedidos-ui/order-sheet.test.tsx` (R7, R8, R9)
### [x] T8 `[P]` — Censar `tests/unit/proveedores-ui/catalog-line-sheet.test.tsx` (R7, R8, R9)
### [x] T9 `[P]` — Censar `tests/unit/proveedores-ui/supplier-detail-page.test.tsx` (R7, R8, R9)
### [x] T10 `[P]` — Censar `tests/unit/recetas-ui/recipe-form.test.tsx` (R7, R8, R9)

**Para cada una de T5–T10**, con el mismo procedimiento:

1. Buscar las **tres formas** del defecto (`design.md > 4`): (a) afirmación de **presentación** que
   exija **más de dos decimales**; (b) afirmación de presentación por **subcadena**
   (`toHaveTextContent` con literal numérico donde debería ir `.textContent).toBe(...)`); (c) valor
   **redondeado** afirmado **sin** su `title` exacto.
2. **Descartar explícitamente** lo que NO es hallazgo (R8): valores **enviados**
   (`enviado.get('cost')`) y `value` de un `input`. **Deben** ser exactos. En
   `catalog-line-sheet.test.tsx` y `recipe-form.test.tsx` las coincidencias con cuatro decimales son
   exactamente eso y **no** son hallazgos.
3. Escribir la fila del archivo en la tabla del censo de
   `progress/impl_QC-127-decimales-caso-r14-sin-actualizar.md`: `archivo | formas buscadas (a/b/c) |
   líneas inspeccionadas | resultado`.

**Hecho cuando:** el archivo tiene **su fila escrita**, con líneas concretas y un resultado de los
tres posibles (`sin hallazgos` · `hallazgo del mismo tipo` · `hallazgo de otro tipo`). Una fila
vacía o un «revisado, nada» sin líneas **no cuenta como hecho**.

> **Fuera del censo, y se dice:** `tests/unit/shared-ui/decimal-display.test.ts`. Es el test de la
> utilidad, no de una pantalla (`[D5]`).

### [x] T11 — Cerrar el censo (R7, R9)
**Archivos:** `progress/impl_QC-127-decimales-caso-r14-sin-actualizar.md`.
**Depende de:** T5–T10.

**Hecho cuando:** la tabla tiene **exactamente seis filas**, ninguna vacía, y el informe dice
cuántos hallazgos salieron de cada clase.

---

## Tanda D — qué se hace con lo que aparezca

### [x] T12 — Corregir los hallazgos **del mismo tipo** (R10)
**Archivos:** el archivo de test donde salió el hallazgo.
**Depende de:** T11. **Se salta si el censo no encontró ninguno**, y eso se escribe.

Aplicar el mismo patrón de T1–T3: igualdad exacta del texto pintado y `title` con el valor exacto.
Añadir el `R<n>` correspondiente en una **nota fechada al final de `requirements.md`**, sin
reescribir ni reordenar nada de lo existente, para que la trazabilidad no quede coja.

**Hecho cuando:** cada hallazgo del mismo tipo tiene su corrección, su `R<n>` nuevo y su mutación de
T4 equivalente (romper, ver el rojo, revertir) anotada. O, si no hubo ninguno, la línea explícita
«el censo no encontró hallazgos del mismo tipo».

### [x] T13 — Reportar los hallazgos **de otro tipo**, sin arreglarlos (R11)
**Archivos:** `progress/impl_QC-127-decimales-caso-r14-sin-actualizar.md` únicamente.
**Depende de:** T11.

**El implementer NO arregla un hallazgo de otro tipo** —un cálculo mal, una pantalla que redondea
donde no debe, un valor enviado que sí se redondea—. Lo deja **tal cual** y lo **reporta**: archivo,
línea, valor esperado, valor obtenido y cómo lo comprobó. **Tampoco abre la ficha por su cuenta**:
la propone en su informe y el leader decide.

**Hecho cuando:** cada hallazgo de otro tipo tiene su anotación con **lo medido** y una ficha
propuesta, y el código sigue **sin tocar**. O la línea explícita «no apareció ninguno».

---

## Tanda E — cierre

### [x] T14 `[P]` — Comprobar los requisitos negativos por diff (R5, R12, R13, R14, R15, R16)
**Archivos:** ninguno; se inspecciona `git diff --stat` de la rama contra `dev`.
**Depende de:** T12, T13.

**Hecho cuando:** el diff **no** toca `app/`, `lib/`, `e2e/`, `tests/baseline-rojos.json`,
`package.json`, el lockfile, `lib/shared/ui/decimal-display.ts` ni
`tests/unit/shared-ui/decimal-display.test.ts`, y **no** añade ninguna guardia nueva (`[D6]`, R12).
El diff son archivos de `tests/`, `specs/` y `progress/`, y nada más. Cada uno de los seis
requisitos negativos queda anotado como comprobado en el informe.

### [x] T15 — Cerrar la tanda con el gate rápido
**Depende de:** T14.
**Hecho cuando:** `./init.sh --rapido` termina en verde.

### [x] T16 — Cerrar la feature con el gate completo
**Depende de:** T15.
**Hecho cuando:** `./init.sh` completo termina en verde. Referencia de `dev` al 2026-09-18: 562
archivos, 8176 pasados, cero rojos. **Un rojo nuevo es de este cambio**, no de la base. Sin este
paso no hay PR (regla 5 de `CLAUDE.md`).

### [x] T17 — Mapa de trazabilidad completo
**Depende de:** T16.
**Hecho cuando:** `progress/impl_QC-127-decimales-caso-r14-sin-actualizar.md` contiene el mapa
`R1`–`R16` (más los `R<n>` que haya añadido T12) → test o comprobación concreta, en la forma de
`design.md > 10`. Un requisito sin fila es un fallo de la feature y el reviewer lo rechaza.
