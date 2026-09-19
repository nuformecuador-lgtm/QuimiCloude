# QC-127 — decimales-caso-r14-sin-actualizar · design.md

> Zona `frontend` · complejidad `low` · **no toca código de producción**.
> Requisitos: `specs/QC-127-decimales-caso-r14-sin-actualizar/requirements.md` (R1–R16).

## 1. Qué clase de trabajo es esto

No hay modelo de datos, no hay tabla, no hay RLS, no hay migración, no hay ruta nueva ni endpoint
nuevo, no hay contrato de entrada/salida nuevo y no hay integración externa. **Nada de eso aplica y
se dice explícitamente en vez de dejarlo en blanco.** Lo único que cambia son **archivos de test**, y
la pantalla queda **ratificada** tal cual está (`[D2]`, R5).

El código vivo que se ratifica ya existe y está leído:

- `app/(private)/pedidos/components/order-ingredients-table.tsx` — la celda «restante» pinta
  `formatDecimalDisplay(remaining)` dentro de un `<span>`, pone `title={exactDecimalTitle(remaining)}`
  en el **`<td>`**, y aplica la clase de resalte al **`<span>`** cuando `isShort(remaining)` —que
  mira `remaining.startsWith('-')`, es decir el **exacto**, no el pintado (R4, `[D4]`)—.
- `lib/shared/ui/decimal-display.ts` — `trimDecimal` no redondea (campo editable),
  `formatDecimalDisplay` redondea a dos decimales (celda de solo lectura), `exactDecimalTitle`
  devuelve el exacto **o `undefined`** cuando lo pintado ya es exacto. **No se toca** (R13, `[D8]`).

## 2. El defecto del caso R14, sin ambigüedad

El caso vive en `tests/unit/pedidos-ui/order-form.test.tsx`, alrededor de la línea 774
(«R14 — sin ningun lote…»). Sus tres vecinos del mismo bloque están en 692–772. Hoy el caso afirma:

```
await waitFor(() => expect(restante).toHaveTextContent('-0.2'));
expect(restante.firstElementChild).toHaveClass('text-destructive');
```

Son **dos defectos distintos** y **los dos entran** (`[D1]`, R1 y R2):

1. **Afirmación por subcadena.** `toHaveTextContent('-0.2')` casa por subcadena sobre el texto
   normalizado del nodo. `'-0.201'`, `'-0.2001'` y `'-0.25'` **contienen** `-0.2`, así que la
   afirmación **pasaría igual** si la celda dejara de redondear o si el cálculo cambiara. Los tres
   vecinos usan `expect(<nodo>.textContent).toBe(<valor>)` —igualdad exacta, líneas 711, 713, 739—.
   R14 tiene que usar la misma forma.
2. **Falta el `title`.** Los tres vecinos afirman el valor exacto en el atributo (`'0.201'`,
   `'39.799'`, `'-0.001'`; líneas 712, 714, 740). R14 **no afirma nada** sobre el exacto: hoy
   **ningún test del repositorio afirma que el cálculo de ese caso da `-0.201`**. Sin esa
   afirmación, `0 − 0.201` podría dar cualquier cosa que redondee a `-0.2` y nadie se enteraría.

### Detalle que el implementer no debe equivocar

El `title` cuelga del **`<td>`** (el nodo con `data-testid="order-ingredient-remaining"`), y la clase
de resalte cuelga de su **`firstElementChild`** (el `<span>`). Por eso el vecino de la línea 739–741
afirma `restante.textContent`, `restante` → `title`, y `restante.firstElementChild` → clase. El caso
R14 replica **esa** distribución, no otra. (El vecino de 715 usa `restante.firstChild` porque allí no
hay resalte y el nodo hijo es texto; no es el patrón a copiar.)

Forma objetivo del caso R14, como contrato (no como parche literal):

- `expect(restante.textContent).toBe('-0.2')`
- `expect(restante).toHaveAttribute('title', '-0.201')`
- `expect(restante.firstElementChild).toHaveClass('text-destructive')`

Los valores salen del propio escenario del caso: `productStock: 0`, `LINEA_INGREDIENTE.quantity`
por `CANTIDAD` da `0.201` requerido, y `0 − 0.201 = -0.201`, que `formatDecimalDisplay` pinta `-0.2`
y `exactDecimalTitle` conserva como `-0.201`.

## 3. Lo que se acepta al ratificar la pantalla (`[D3]`, R6)

`docs/architecture.md > Regla: multiplataforma` obliga a pensar en el móvil. Un `title` **no existe**
en táctil ni en un impreso: allí el único aviso de que el restante es negativo es el **color** del
`<span>`. Se acepta a sabiendas.

Alternativa evaluada y **descartada**: pintar `<0.01` (o `≈0`) en lugar de `0` cuando el redondeo se
come el signo. Se descarta porque (a) cambia la pantalla, y `[D2]` la ratifica —`complexity` se queda
en `low` precisamente por eso—; (b) introduce un segundo idioma de presentación en una columna que
hoy tiene uno solo, y habría que replicarlo en las otras tres columnas numéricas para no quedar
incoherente; (c) el aviso que importa —«no alcanza»— ya lo da el color, que sí sobrevive al móvil.
Queda **escrito en el propio test**, como comentario fechado junto al caso, para que la próxima
lectura no lo reabra creyendo que es un descuido.

## 4. El censo de `[D5]`: qué se busca y cómo se deja constancia (R7–R9)

Seis archivos, uno por uno. `tests/unit/shared-ui/decimal-display.test.ts` **queda fuera**: es el
test de la utilidad, no de una pantalla.

**Qué cuenta como hallazgo** (las tres formas, R7):

| # | Forma | Cómo se reconoce |
|---|---|---|
| a | Presentación con más de dos decimales | Una afirmación sobre `textContent` / `toHaveTextContent` de una celda de **solo lectura** cuyo valor esperado tiene **tres o más** decimales. La pantalla pinta dos: si el test espera más, o el test miente o la pantalla no redondea. |
| b | Afirmación por subcadena | `toHaveTextContent(<literal numérico>)` sobre una celda de solo lectura, donde debería ir `.textContent).toBe(...)`. |
| c | Redondeado sin su `title` | Una afirmación de presentación cuyo valor **esperado** difiere del valor **de origen** del escenario (o sea: el redondeo cambió lo que se ve) y el caso **no** afirma el `title` exacto. |

**Qué NO cuenta como hallazgo** (R8) — la trampa que ya detectó el leader:

- `tests/unit/proveedores-ui/catalog-line-sheet.test.tsx:616-617, 679-680, 686` — `'0.1005'` y
  `'1234.5678'` con cuatro decimales son **valores enviados** (`enviado.get('cost')`) o el `value`
  de un `input` precargado. **Deben** ser exactos: el dato vuelve a la base y redondearlo la
  reescribiría. Es otra clase de cosa.
- `tests/unit/recetas-ui/recipe-form.test.tsx:567-616` — `'3.25'`, `'0.1255'` son el `value` de un
  `input` precargado con `trimDecimal` y el valor enviado. Mismo caso: **no** son hallazgos, y el
  propio archivo lo explica en su comentario de la línea 584.

**Cómo se deja constancia** (R9): una tabla en
`progress/impl_QC-127-decimales-caso-r14-sin-actualizar.md` con **una fila por archivo del censo** y
las columnas `archivo | qué se buscó (a/b/c) | líneas inspeccionadas | resultado`. `resultado` es
`sin hallazgos`, `hallazgo del mismo tipo → corregido en R<n>` o `hallazgo de otro tipo → ficha
propuesta`. Seis filas, ninguna vacía. Ese es el criterio de «hecho» del censo: no «mirar los
archivos», sino **seis filas escritas**.

**Punto de partida ya medido** (no sustituye al censo, lo orienta): el único caso del repositorio
que afirma un `title` de decimal fuera de `order-form` es
`tests/unit/proveedores-ui/supplier-detail-page.test.tsx:643-661`, y ahí el patrón está **completo**
—`.textContent).toBe('1234.57')`, `title` exacto `'1234.5678'`, y el caso negativo
(`.not.toHaveAttribute('title')` cuando el redondeo no cambia nada)—. `order-columns.test.tsx:265-289`
usa igualdad exacta sobre `container.textContent` en sus tres casos. Ninguno de los dos aparenta
hallazgo; el censo lo confirma o lo desmiente con las tres formas a/b/c.

## 5. Qué pasa con un hallazgo (`[D7]`, R10–R11)

- **Del mismo tipo** (a, b o c): se corrige **aquí**, con el mismo patrón de R1–R3, y se le asigna
  su propio `R<n>` en una nota fechada al final de `requirements.md` —sin reescribir nada existente—
  para que la trazabilidad no quede coja.
- **De otro tipo** (un cálculo mal, una pantalla que redondea donde no debe, un valor enviado
  redondeado): **no se arregla**. Se deja tal cual, se anota **lo medido** —archivo, línea, valor
  esperado, valor obtenido, cómo se comprobó— y se propone ficha. El implementer **no abre esa
  ficha por su cuenta**: la propone en su informe y el leader decide.

## 6. Por qué NO se escribe ninguna guardia automática (`[D6]`, R12)

La tentación evidente aquí es dejar un test de convenciones que recorra los seis archivos y falle si
alguien vuelve a afirmar presentación por subcadena. **Se descarta a propósito.**

**QC-99 existe exactamente por esto.** Las guardias de censo —las que cuentan totales del
repositorio, las que llevan una lista cerrada de archivos, las que recorren el diff de la rama—
rompieron **tres guardias ajenas** al cerrar QC-79, sin que nadie hiciera nada mal: basta con que
otra ficha añada un archivo, renombre uno o toque el diff para que la guardia falle en trabajo que
no tiene relación con ella. Añadir una cuarta aquí sería repetir el patrón que QC-99 pretende
retirar, y encima para un defecto que se corrige una vez y cuya reincidencia cuesta menos que el
mantenimiento de la guardia.

**Si el diseño de esta ficha propusiera una guardia, sería la señal de que algo se torció.** No la
propone.

## 7. Cómo se demuestra que un test corregido **muerde**

Este es el riesgo propio de la ficha: como lo que se toca **son los tests**, «lo cambié y sigue
verde» no demuestra nada — un test que no afirma nada también está verde. El precedente del repo es
**romper a propósito lo afirmado, ver el rojo y revertir**. Se aplica así, y se deja constancia:

Para **cada** afirmación nueva o endurecida (R1, R2, R3 y cualquier corrección de R10), el
implementer hace una **mutación temporal en el código de producción o en el escenario**, corre solo
ese archivo de test, **anota el mensaje de rojo** y **revierte**:

| Afirmación | Mutación temporal | Rojo esperado |
|---|---|---|
| R1 (texto exacto `-0.2`) | En `order-ingredients-table.tsx`, pintar `remaining` sin pasar por `formatDecimalDisplay` (queda `-0.201`) | El `.toBe('-0.2')` falla con `-0.201`. **Comprobación clave**: con el `toHaveTextContent('-0.2')` de hoy esta misma mutación **pasaría en verde**. Las dos ejecuciones se anotan: es la prueba de que el cambio de R1 añade mordida. |
| R2 (`title` exacto `-0.201`) | En el escenario del caso, cambiar `productStock: 0` por `productStock: 0.001` El restante exacto pasa a `-0.2`, que es ya lo pintado, así que `exactDecimalTitle` devuelve `undefined` y **el atributo desaparece**: la afirmación falla. |
| R3 (clase de resalte) | En `order-ingredients-table.tsx`, hacer que `isShort` mire el valor **pintado** en lugar del exacto | El vecino de `-0.001` y/o R14 pierden el resalte y fallan. Demuestra R4 de paso. |

La mutación se revierte **antes** de cerrar la task, y el archivo queda idéntico a `dev` salvo el
test. La constancia (mutación aplicada, rojo obtenido, revertido) va en
`progress/impl_QC-127-decimales-caso-r14-sin-actualizar.md`, junto a la tabla del censo.

## 8. Alternativas descartadas

1. **Una guardia automática anti-reincidencia.** Descartada por `[D6]` y la sección 6 (precedente
   QC-79 → QC-99).
2. **Pintar `<0.01` en vez de `0` cuando el redondeo se come el signo.** Descartada por `[D2]` y
   `[D3]`: cambia la pantalla, que esta ficha ratifica, y el aviso que importa ya lo da el color.
   Detalle en la sección 3.
3. **Usar `formatDecimalDisplay(...)` dentro de la afirmación** —como hace la línea 660-662 con la
   cantidad— en lugar de escribir el literal `'-0.2'`. Descartada: afirmar con la misma función que
   la pantalla usa para pintar es una tautología, pasa siempre y **no muerde**. El literal escrito a
   mano es justo lo que hace que la mutación de la sección 7 se ponga roja.
4. **Añadir el caso a `tests/baseline-rojos.json`.** Descartada por `[D10]`: no hay rojo que listar,
   y listar el archivo apagaría sus 33 casos enteros para el comparador.
5. **Cubrirlo con un E2E.** Descartada por `[D9]`: no hay recorrido de usuario nuevo ni pantalla
   nueva; es cobertura unitaria de UI sobre casos que ya existen.

## 9. Dependencias de terceros

**Ninguna nueva** (R16). Todo lo que la ficha necesita —`vitest`, `@testing-library/react`,
`@testing-library/jest-dom`— ya está aprobado y en uso en los seis archivos del censo, con su fila en
`docs/dependencias.md`. Los cuatro checks de `docs/architecture.md > Dependencias de terceros` **no
llegan a aplicarse porque no se propone ninguna librería**. Si la implementación necesitara una,
sería señal de que algo se torció y debe pararse y preguntar.

## 10. Trazabilidad `R<n>` → test

| Requisito | Test que lo demuestra |
|---|---|
| R1 | `tests/unit/pedidos-ui/order-form.test.tsx` → caso «R14 — sin ningun lote…», `expect(restante.textContent).toBe('-0.2')` + mutación de la sección 7 |
| R2 | mismo caso, `expect(restante).toHaveAttribute('title', '-0.201')` |
| R3 | mismo caso, `expect(restante.firstElementChild).toHaveClass('text-destructive')` |
| R4 | mismo archivo, caso «un restante negativo se resalta en rojo» (líneas 718-742: `.toBe('0')` + `title '-0.001'` + clase) — ya existente, se ratifica; más la mutación de `isShort` de la sección 7 |
| R5 | `git diff --stat` de la rama: cero archivos bajo `app/` y `lib/`. Verificado por el reviewer y por `./init.sh` (la suite de `pedidos-ui` sigue verde sin tocar producción) |
| R6 | Comentario fechado junto al caso R14 en `order-form.test.tsx` + sección 3 de este `design.md`. Verificación documental del reviewer |
| R7 | Tabla del censo en `progress/impl_QC-127-…md`: seis filas, una por archivo |
| R8 | Misma tabla: las coincidencias de `catalog-line-sheet.test.tsx` y `recipe-form.test.tsx` aparecen clasificadas como **valor enviado / `input`**, no como hallazgo |
| R9 | Misma tabla: ninguna fila vacía, cada una con líneas inspeccionadas y resultado |
| R10 | Si hay hallazgo: el caso corregido, con su `R<n>` en la nota fechada de `requirements.md`. Si no: la fila `sin hallazgos` de las seis |
| R11 | Si hay hallazgo de otro tipo: la anotación con lo medido y la ficha propuesta en el informe del implementer. Si no: constancia de que no apareció ninguno |
| R12 | `git diff` de la rama: cero archivos nuevos o modificados bajo `tests/**/*convenciones*` y cero guardias nuevas. `./init.sh` sigue con el mismo número de guardias que en `dev` |
| R13 | `git diff` de la rama: `lib/shared/ui/decimal-display.ts` y `tests/unit/shared-ui/decimal-display.test.ts` sin cambios |
| R14 | `git diff` de la rama: cero archivos bajo `e2e/` |
| R15 | `git diff` de la rama: `tests/baseline-rojos.json` sin cambios |
| R16 | `git diff` de la rama: `package.json` y el lockfile sin cambios |

> R5 y R12–R16 son requisitos **negativos** (nada cambia en tal sitio). Se demuestran con el diff de
> la rama y con el gate completo, no con un caso de test nuevo: escribir una guardia para
> comprobarlos sería exactamente lo que `[D6]` prohíbe.

## 11. Verificación

- Durante el trabajo: `pnpm typecheck`, `pnpm lint` y el archivo de test concreto.
- Para cerrar la tanda: `./init.sh --rapido`.
- Para cerrar la feature y antes del PR: `./init.sh` completo, **sin excepción**
  (`docs/verification.md`, regla 5 de `CLAUDE.md`). Referencia: el gate del 2026-09-18 sobre `dev`
  dio 562 archivos y 8176 pasados, cero rojos. Un rojo nuevo es de este cambio.
