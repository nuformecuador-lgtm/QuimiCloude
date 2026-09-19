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

_Pendiente: los escribe spec_author (F1.2)._

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
