# QC-127 — decimales-caso-r14-sin-actualizar · requirements.md

> **Zona** `frontend` · **Complejidad** `low` · **depends_on** ninguna ·
> **Rama** `feature/QC-127-decimales-caso-r14-sin-actualizar`
>
> **Alcance.** Terminar lo que el PR #85 dejó a medias. El caso **R14** de
> `tests/unit/pedidos-ui/order-form.test.tsx` recupera el **patrón completo** de sus tres vecinos
> —igualdad exacta del texto pintado, `title` con el valor exacto y la clase de resalte— y se
> **censan los seis archivos de test de pantalla** que aquel PR tocó, para corregir cualquier otro
> que haya quedado igual. La pantalla **no cambia**: su comportamiento actual queda ratificado.
>
> **Lo que NO entra.** Rehacer el redondeo de `lib/shared/ui/decimal-display.ts`, que es del PR #85
> y funciona. Cambiar la pantalla, que queda ratificada. Una guardia automática que impida la
> reincidencia → **descartada a propósito**, ver `[D6]`. Cualquier hallazgo que **no** sea del mismo
> tipo → ficha propia, ver `[D7]`.
>
> *Sembrado por `/afinar-feature` el 2026-09-18. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`.*

## Requisitos (EARS)

> Cada requisito cita entre corchetes la decisión cerrada que lo origina. Las 10 decisiones
> (`[D1]`…`[D10]`) quedan citadas al menos una vez.
>
> **Nota de lectura.** «El sistema» aquí incluye, además de la pantalla, el **cuerpo de prueba**:
> buena parte de lo que esta ficha arregla **son los tests mismos**. Un requisito que habla de una
> afirmación de test es igualmente testeable: se comprueba leyendo el archivo y, sobre todo,
> **rompiendo a propósito lo afirmado y viendo el rojo** (ver `design.md > Cómo se demuestra que un
> test corregido muerde`).

**R1.** El caso **R14** de `tests/unit/pedidos-ui/order-form.test.tsx` DEBE afirmar el texto pintado
de la celda «restante» por **igualdad exacta** del `textContent` con `'-0.2'`. NO DEBE afirmarlo con
`toHaveTextContent`, que casa por **subcadena** y por tanto pasaría igual si el cálculo diera
`-0.201`, `-0.2001` o `-0.25`. `[D1]`

**R2.** El caso **R14** DEBE afirmar además que la celda «restante» lleva el atributo `title` con el
valor **exacto** `'-0.201'`. Hoy ningún test afirma que el cálculo de ese caso da `-0.201`, y sin esa
afirmación el valor exacto no está cubierto por nada. `[D1]` `[D8]`

**R3.** El caso **R14** DEBE seguir afirmando que el valor pintado del «restante» lleva la clase de
resalte `text-destructive`, de modo que el caso quede con el **patrón completo** de sus tres vecinos
del mismo bloque: texto exacto, `title` exacto y clase de resalte. `[D1]`

**R4.** El sistema DEBE decidir el resalte de faltante con el valor **exacto** del restante y nunca
con el valor **pintado**. SI el restante exacto es negativo pero se pinta «0» por el redondeo a dos
decimales, ENTONCES la celda DEBE seguir resaltada y DEBE llevar el valor exacto en su `title`.
`[D2]` `[D4]`

**R5.** El comportamiento actual de la pantalla queda **ratificado**: esta ficha NO DEBE modificar
ningún archivo de `app/` ni de `lib/`. El redondeo a dos decimales de las celdas de solo lectura, el
marcador de ausencia y la regla de resalte se quedan exactamente como están. `[D2]` `[D8]`

**R6.** El sistema DEBE dejar constancia escrita, junto a los casos afectados, de que **en un
teléfono o en un impreso no hay `title`** y de que allí el único aviso del faltante es el **color**,
y de que la alternativa de pintar `<0.01` se evaluó y se descartó. La ficha acepta esa limitación **a
sabiendas**; NO DEBE resolverse aquí. `[D3]`

**R7.** El sistema DEBE censar, **archivo por archivo**, exactamente los **seis** archivos de test de
pantalla que tocó el PR #85 —`tests/unit/pedidos-ui/order-columns.test.tsx`,
`tests/unit/pedidos-ui/order-form.test.tsx`, `tests/unit/pedidos-ui/order-sheet.test.tsx`,
`tests/unit/proveedores-ui/catalog-line-sheet.test.tsx`,
`tests/unit/proveedores-ui/supplier-detail-page.test.tsx` y
`tests/unit/recetas-ui/recipe-form.test.tsx`— buscando las **tres** formas del defecto: (a) una
afirmación de **presentación** que exija más de dos decimales, (b) una afirmación de presentación
hecha por **subcadena**, y (c) un valor **redondeado** que se pinta sin afirmar su `title` exacto.
`tests/unit/shared-ui/decimal-display.test.ts` NO entra en el censo: es el test de la utilidad, no de
una pantalla. `[D5]`

**R8.** El censo NO DEBE tratar como hallazgo un valor **enviado** (por ejemplo
`enviado.get('cost')`) ni el `value` de un `input`: esos valores **deben** ser exactos y llevar todos
sus decimales, porque el dato vuelve a la base. Solo cuenta como hallazgo lo que se **pinta** en una
celda de solo lectura. `[D5]` `[D8]`

**R9.** El censo DEBE dejar **constancia por escrito, archivo por archivo**, de que se revisó y de
qué resultó —hallazgo o nada—, en `progress/impl_QC-127-decimales-caso-r14-sin-actualizar.md`. Un
archivo del censo sin su línea de constancia cuenta como no censado. `[D5]`

**R10.** SI el censo encuentra un caso **del mismo tipo** que R14 —falta el `title` exacto, o se
afirma la presentación por subcadena—, ENTONCES el sistema DEBE corregirlo **en esta ficha**, con el
mismo patrón de R1–R3. `[D7]`

**R11.** SI el censo encuentra **cualquier otra cosa** —un cálculo mal, una pantalla que redondea
donde no debe, un valor enviado que sí se redondea—, ENTONCES el sistema NO DEBE arreglarlo aquí:
DEBE dejarlo **tal cual**, anotar lo **medido** (archivo, línea, valor esperado y valor obtenido) y
proponer **ficha propia**. `[D7]`

**R12.** Esta ficha NO DEBE añadir ninguna guardia automática que intente impedir la reincidencia
—ni totales del repositorio, ni listas cerradas de archivos, ni recorridos del diff de rama—. El
motivo DEBE quedar escrito en `design.md` citando **QC-99**: guardias de censo de esa forma rompieron
**tres** guardias ajenas al cerrar QC-79. `[D6]`

**R13.** Esta ficha NO DEBE modificar `lib/shared/ui/decimal-display.ts` ni sus tests. La separación
entre `trimDecimal` —precargar un campo editable, sin redondear— y `formatDecimalDisplay` —pintar una
celda de solo lectura— se **respeta tal cual**. `[D8]`

**R14.** Esta ficha NO DEBE añadir ninguna especificación en `e2e/`: no hay recorrido de usuario
nuevo ni pantalla nueva, y la cobertura de R1–R13 DEBE quedar en **tests unitarios de UI** sobre
casos que ya existen. `[D9]`

**R15.** Esta ficha NO DEBE añadir `tests/unit/pedidos-ui/order-form.test.tsx` —ni ningún otro
archivo— a `tests/baseline-rojos.json`: ya no hay rojo que listar, y listar ese archivo apagaría sus
**33 casos** enteros para el comparador. `[D10]`

**R16.** Esta ficha NO DEBE añadir ninguna dependencia a `package.json`: todo lo que necesita
—`@testing-library/react`, `vitest` y `jest-dom`— ya está aprobado y en uso en los seis archivos del
censo. `[D5]` `[D6]`

## Preguntas abiertas

**Ninguna.** La que traía la ficha —si algún otro caso quedó en la misma situación— deja de ser una
pregunta y pasa a ser trabajo acotado: `[D5]` fija qué se censa y `[D7]` qué se hace con lo que
aparezca.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-09-18 | ¿Qué le falta al caso R14? | **El patrón completo de sus tres vecinos**: igualdad **exacta** del texto (`.textContent).toBe('-0.2')`, no `toHaveTextContent`, que casa por **subcadena** y hoy pasaría también con `-0.201`), más `title` con el valor exacto `'-0.201'`, más la clase `text-destructive`. Hoy **ningún test afirma que el cálculo de ese caso da `-0.201`**. `[D1]` |
| 2026-09-18 | Un faltante de −0,001 se pinta «0». ¿Se ratifica o se cambia? | **Se ratifica tal como está.** La celda pinta «0», el resalte rojo lo decide el valor **exacto** y la cifra entera viaja en el `title`. **La pantalla no se toca**, así que `complexity` se queda en `low`. Corrige a una versión anterior de la ficha que decía que esta decisión «entró por inercia»: **no es exacto**, el PR #85 la razonó en un comentario fechado el 2026-09-17 dentro del propio test. Lo que faltaba era ratificarla. `[D2]` |
| 2026-09-18 | ¿Qué se acepta al ratificarlo? | **Que en un teléfono o impreso no hay `title`**: ahí el único aviso es el color. Se acepta **a sabiendas**, con la alternativa —pintar `<0.01`— evaluada y descartada. Queda escrito porque `docs/architecture.md > Regla: multiplataforma` obliga a pensar en el móvil. `[D3]` |
| 2026-09-18 | ¿Con qué valor se decide el resalte? | **Con el exacto, nunca con el pintado.** Un faltante que redondea a «0» sigue en rojo. *Heredado del PR #85 y del código vivo (`isShort`).* `[D4]` |
| 2026-09-18 | ¿Hasta dónde llega el censo? | **Los seis archivos de test de pantalla que tocó el PR #85** —`order-columns`, `order-form`, `order-sheet`, `catalog-line-sheet`, `supplier-detail-page` y `recipe-form`—, archivo por archivo. `decimal-display.test.ts` no cuenta: es el test de la utilidad, no de una pantalla. Lo que se busca: afirmaciones de **presentación** que exijan más de dos decimales, que afirmen por subcadena, o que pinten un valor redondeado sin su `title` exacto. `[D5]` |
| 2026-09-18 | ¿Se deja una guardia que impida la reincidencia? | **No, y el motivo tiene ficha propia.** **QC-99** existe porque las guardias de censo —totales del repo, listas cerradas, recorridos del diff— rompieron **tres** guardias ajenas al cerrar QC-79, sin que nadie hiciera nada mal. Añadir otra aquí sería repetir el patrón que ese trabajo pretende retirar. `[D6]` |
| 2026-09-18 | ¿Y si el censo encuentra otro caso? | **Si es del mismo tipo** —falta el `title`, o se afirma por subcadena— **se arregla aquí**: es el mismo trabajo repetido. **Cualquier otra cosa** —un cálculo mal, una pantalla que redondea donde no debe— **no se arregla aquí**: nace ficha, con lo medido. `[D7]` |
| 2026-09-18 | ¿Se toca la utilidad de presentación? | **No.** `decimal-display.ts` es del PR #85 y funciona. Su separación entre `trimDecimal` —precargar un campo editable, sin redondear— y `formatDecimalDisplay` —pintar una celda de solo lectura— **se respeta**: los valores **enviados** y los de `input` siguen exactos y no se redondean. `[D8]` |
| 2026-09-18 | ¿Hace falta E2E? | **No, y el motivo va escrito**: no hay recorrido de usuario nuevo ni pantalla nueva. Es cobertura unitaria de UI sobre casos que ya existen. `[D9]` |
| 2026-09-18 | ¿Entra en `tests/baseline-rojos.json`? | **No.** Ya no hay rojo que listar, y la razón original sigue valiendo por si reapareciera: listar ese archivo apagaría sus **33 casos** enteros para el comparador. *Heredado de la ficha y del criterio de QC-126.* `[D10]` |

## Nota fechada — requisito anadido por el censo (2026-09-18)

> Anadido por el `implementer` al cerrar el censo de `[D5]`, siguiendo `design.md > 5` y R10: un
> hallazgo **del mismo tipo** se corrige en esta ficha y recibe su propio `R<n>` en una nota al
> final, **sin reescribir ni reordenar nada de lo anterior**, para que la trazabilidad no quede
> coja. Nada de arriba cambia.

**R17.** El caso «el costo y el minimo de compra se pintan REDONDEADOS A DOS DECIMALES» de
`tests/unit/proveedores-ui/supplier-detail-page.test.tsx` DEBE afirmar, ademas del texto pintado,
el atributo `title` con el valor **exacto** del **minimo de compra**, `'0.1005'`, que es la unica de
las dos celdas cuyo valor exacto **no afirmaba ningun caso**. (El `title` del costo, `'1234.5678'`,
**ya lo cubria** el caso vecino «el redondeo de la celda no esconde la cifra»; se afirma tambien en
este caso para dejarlo con el patron completo, pero **no es cobertura nueva** y R17 no se lo apunta.
Precision anadida el 2026-09-18 al cerrar la revision.) Es la forma **(c)** del defecto
(`design.md > 4`): el redondeo cambia lo que se ve —`0.1005` se pinta `0.1`— y hoy **ningun test
del repositorio afirma que esa celda conserva `0.1005`**; el caso vecino no lo cubre, porque alli
el minimo vale `'25.0000'` y lo que afirma es `.not.toHaveAttribute('title')`. La correccion es
**solo del test**: la pantalla ya renderiza ese `title`
(`app/(private)/proveedores/[id]/components/catalog-columns.tsx:198,210`), asi que R5 y R13 siguen
intactos. `[D5]` `[D7]`
