# QC-131 — prompts-en-vercel-y-revision-firmada · requirements.md

> **Zona** `backend` · **Complejidad** `low` · **depends_on** QC-107, QC-111 ·
> **Rama** `feature/QC-131-prompts-en-vercel-y-revision-firmada`
>
> **Alcance (acotado el 2026-09-23 por `[D3]`: SOLO CATÁLOGO).** Poner el texto **definitivo** del
> prompt de `catalogo` en Vercel como `CATALOG_PROMPT` (el texto entero va en el **valor** de la
> variable), y pasar un catálogo de proveedor **real** por su estrategia, firmando el veredicto
> **campo por campo** en `docs/revision-de-prompts.md`. Nace el 2026-09-18 al cerrar QC-129: es la
> mitad catálogo de sus T10 y T11 `[HUMANO]`.
>
> **Lo que NO entra.** Todo lo de **fórmula** (`FORMULA_PROMPT`, su borrador, su pasada y su
> firma) → **QC-157** `prompt-de-formula-en-vercel`, bloqueada por QC-142. El mecanismo (QC-129,
> PR #93), la pantalla (QC-107) y la cola (QC-111). Sin código, sin test nuevo, sin migración, sin
> dependencia.
>
> **Ficha HUMANA.** Ningún agente tiene acceso a Vercel, ninguno decide el texto definitivo y
> ninguno firma. El arnés aporta un **borrador fuera de lo versionado** y una **guía**
> (`design.md`); lo demás lo hace una persona.

## Requisitos (EARS)

> Cada requisito cita entre corchetes su origen: `[QC-129 Rn]` para los heredados, `[Dn]` para las
> decisiones de esta ficha (tabla al final). Los que solo aplican a fórmula se marcan **«va a
> QC-157»** y **no se renumeran**.

### Heredados de QC-129 (citados tal cual; no se reescriben)

La fuente es `specs/QC-129-textos-definitivos-de-los-prompts/requirements.md`. El texto va copiado
literal; si difiere, **manda el original**. Donde el original cita `[Dn]`, se refiere a la tabla de
QC-129. Donde el original dice «los dos prompts / los dos textos», **en esta ficha se aplica solo al
de `catalogo`** (`[D3]`); la mitad fórmula va a QC-157.

**R1 = QC-129 R10.** El prompt de `catalogo` DEBE pedir, para cada línea del catálogo, exactamente
estos seis datos: **nombre, presentación, unidad, precio, compra mínima y tiempo de entrega**. NO
DEBE pedir moneda, vigencia ni referencia del proveedor. `[QC-129 D1]`

**R2 = QC-129 R11 — va a QC-157.** ~~El prompt de `formula` DEBE pedir el **nombre** de la fórmula,
su **descripción**, cada **materia prima con su cantidad y su unidad**, y los **pasos** de
preparación **en su orden**.~~ `[QC-129 D2]` `[D3]`
*Nota 2026-09-23 (`[D4]`): el borrador de fórmula pide cada materia prima en **porcentaje** (p. ej.
«Hipoclorito 12,50 %»), como guarda la receta desde QC-147. Es una **enmienda a este R11 de QC-129**
que formalizará **QC-157**; esta ficha no la aplica ni la verifica.*

**R3 = QC-129 R12.** Los dos prompts DEBEN exigir que la IA conteste en **JSON**, y DEBEN declarar
la forma exacta de ese JSON **dentro del propio texto del prompt**. El módulo NO DEBE interpretar,
validar ni transformar esa respuesta: sigue devolviéndola tal cual. `[QC-129 D3]`
*En esta ficha: solo el de `catalogo`; el de `formula` va a QC-157.*

**R4 = QC-129 R13.** Los dos prompts DEBEN ordenar que un dato que el PDF **no trae** se devuelva
**vacío (`null`)**, y DEBEN prohibir explícitamente inventarlo o deducirlo del contexto.
`[QC-129 D4]`
*En esta ficha: solo el de `catalogo`; el de `formula` va a QC-157.*

**R5 = QC-129 R14.** Los dos textos DEBEN escribirse **en el entorno de despliegue** (variables de
Vercel) y no en el repositorio. Quién los pone en **preview** y con qué valores **no está
decidido**: es la **pregunta abierta 1**, y hasta que se cierre este requisito solo está garantizado
para producción. `[QC-129 D7]` `[QC-129 D9]`
*Nota 2026-09-23: la pregunta abierta 1 de QC-129 queda cerrada por `[D2]` (lo cubre R8). En esta
ficha: solo `CATALOG_PROMPT`; `FORMULA_PROMPT` va a QC-157.*

**R6 = QC-129 R17.** La revisión DEBE hacerse sobre **PDFs reales aportados por el humano** —al
menos un catálogo de proveedor y una fórmula—, en **una pasada** por estrategia, y DEBE quedar
**firmada por una persona**. Ningún agente DEBE poder darla por hecha. `[QC-129 D5]` `[QC-129 D6]`
*En esta ficha: la pasada del **catálogo**; la de la fórmula va a QC-157.*

### Nuevos de esta ficha

**R7.** El arnés DEBE dejar el **borrador completo** del prompt de `catalogo`, que cumpla R1, R3 y
R4, **fuera de lo versionado**, en `borradores-de-prompts/catalogo.md` en la raíz del repositorio
principal (carpeta cubierta por `.gitignore`), y una **guía paso a paso** en `design.md`. Ningún
archivo versionado —`design.md` incluido— DEBE contener el texto de un prompt ni un fragmento
reconocible (QC-129 R9). Los borradores NO DEBEN producir diff en ningún archivo versionado. `[D1]`

**R8.** El humano DEBE poner `CATALOG_PROMPT` en los entornos **Production** y **Preview** de
Vercel, con **el mismo texto** en los dos. `[D2]` `[D3]`

**R9.** El texto que queda en Vercel DEBE ser el que el humano decide; ningún agente DEBE escribir
en Vercel ni DEBE dar un borrador por texto definitivo. `[D1]`

**R10.** CUANDO se pone o se cambia `CATALOG_PROMPT`, el humano DEBE redesplegar el entorno afectado
ANTES de la pasada de revisión; una pasada sobre un despliegue anterior al cambio NO DEBE contar
como evidencia. `[D1]` `[D2]`

**R11.** Cada pasada DEBE ocupar **su propia sección** en `docs/revision-de-prompts.md`, con la ficha
de pasada (fecha, estrategia, PDF de muestra, firma), la tabla de veredictos de `catalogo` y las dos
filas de cierre. `[D1]`

**R12.** Una sección firmada NO DEBE editarse. SI una pasada contiene algún **mal**, ENTONCES el
humano DEBE corregir el texto en Vercel —en Production y en Preview, por R8—, redesplegar (R10) y
repetir la pasada en una **sección nueva**. `[D1]` `[D2]`

**R13.** La ficha solo DEBE darse por cerrada CUANDO la **última** sección firmada de `catalogo` no
tenga ningún **mal**. `[D1]` `[D3]`

**R14.** El único diff de la ficha fuera de `specs/` y `progress/` DEBE ser el **contenido** que el
humano añade a `docs/revision-de-prompts.md`; la plantilla existente (cabecera, definiciones de
veredicto, regla de cierre) NO DEBE modificarse. `[D1]`

## Preguntas abiertas

1. ~~Borradores en el spec vs QC-129 R9~~ → **cerrada** por `[D1]` (2026-09-23).
2. ~~No hay pantalla para `formula`~~ → **cerrada** por `[D3]` (2026-09-23): va a QC-157.
3. ~~Cantidad y unidad vs porcentaje~~ → **cerrada** por `[D4]` (2026-09-23): va a QC-157.
4. **En qué entorno se hace la pasada firmada (no bloqueante).** `[D2]` pone el texto en Preview,
   pero no consta a qué despliegue apunta `QSTASH_TARGET_URL` en Preview ni si Preview tiene
   `GEMINI_*`, buckets y base propios. **Propuesta: firmar en Production.** Si el humano la quiere
   en Preview, hay que confirmar antes esa configuración. No bloquea R8. `[D5]`

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-09-23 | ¿Qué aporta el arnés en una ficha humana, y dónde viven los borradores? | El arnés prepara **borradores** de los prompts y una **guía** paso a paso; el texto **definitivo** lo decide, lo pone en Vercel y lo firma el humano. **Los borradores viven FUERA de lo versionado**, en `borradores-de-prompts/` de la raíz del repo principal (cubierta por `.gitignore` en `dev`: `/borradores-de-prompts/`). `design.md` **no contiene** el texto de ningún prompt (QC-129 R9 / `[QC-129 D13]`), solo qué debe cumplir y la ruta. Sin diff de código ni de configuración. *(Enmendada el 2026-09-23: la primera versión los dejaba en el spec.)* `[D1]` |
| 2026-09-23 | ¿Quién pone las variables en Preview? (pregunta abierta 1 de QC-129) | El humano pone las variables **también en Preview**, con el **mismo texto** que en Production. Cierra la pregunta abierta 1 de QC-129. `[D2]` |
| 2026-09-23 | La fórmula no se puede disparar (el montaje en fórmulas es QC-142). ¿Qué hace QC-131? | **QC-131 queda SOLO con catálogo.** La mitad fórmula (`FORMULA_PROMPT`, su pasada y su firma) pasa a la ficha nueva **QC-157** `prompt-de-formula-en-vercel`, **bloqueada por QC-142**. Los requisitos que solo aplican a fórmula se marcan «va a QC-157» sin renumerar. `[D3]` |
| 2026-09-23 | ¿Cantidad y unidad (QC-129 R11) o porcentaje (QC-147)? | El borrador de fórmula pide cada materia prima en **porcentaje** (p. ej. «Hipoclorito 12,50 %»), como guarda la receta desde QC-147. Es una **enmienda a QC-129 R11** que formaliza **QC-157**; aquí solo queda anotada. `[D4]` |
| 2026-09-23 | ¿A qué apunta `QSTASH_TARGET_URL` en Preview? | **Sigue abierta, no bloqueante**; la pasada se propone firmar en **Production**. `[D5]` |

Cobertura: `[D1]` → R7, R9, R10, R11, R12, R14. `[D2]` → R8, R10, R12. `[D3]` → R2 (va a QC-157), R8,
R13 y las notas de R3–R6. `[D4]` → nota de R2. `[D5]` → pregunta abierta 4; guía `design.md > 4.3`.
