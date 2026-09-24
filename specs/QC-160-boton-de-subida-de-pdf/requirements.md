# QC-160 — boton-de-subida-de-pdf · requirements.md

> **Zona** frontend · **Complejidad** — · **depends_on** QC-142 · **Rama** feature/QC-160-boton-de-subida-de-pdf
>
> **Alcance.** La subida de PDFs de QC-107 deja de estar siempre a la vista: un **botón** la abre en una
> **ventana emergente**. Se monta en `/proveedores/[id]` (estrategia `catalogo`, hoy montada a la vista) y
> en el **listado** de fórmulas `/produccion/formulas` (estrategia `formula`, montaje nuevo traído de
> QC-142). Solo PDF, hasta 10 por tanda, con estado por archivo, tal como ya lo hace el componente.
>
> **Lo que NO entra.** El permiso propio de documentos (**QC-142**). Convertir el PDF de fórmula en receta
> (**QC-159**). El catálogo desde PDF y su revisión (**QC-158**). La lógica del componente de subida
> (**QC-107**, se reutiliza tal cual).
>
> Sembrado por `/afinar-feature` el 2026-09-24. El bloque de Alcance y la tabla de «Decisiones cerradas»
> los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los reescribe: su
> trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

_Pendiente: los escribe spec_author (F1.2)._

## Preguntas abiertas

1. **Cerrar la ventana a mitad de tanda.** No está decidido qué pasa si se cierra con archivos en cola o
   procesando: ¿se avisa?, ¿al reabrir se ve la tanda en curso o una vacía? El procesamiento sigue en el
   servidor de todas formas (QC-111).
2. **Choque con QC-158.** QC-158 (`in_progress`) también toca `/proveedores/[id]`. El orden no está
   decidido: lo mira el leader en F1.0/F2.0 por la regla de paralelismo.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-09-24 | ¿Cómo aparece la subida? | Un **botón** que la abre en una **ventana emergente** (diálogo); al cerrarla la pantalla queda limpia. |
| 2026-09-24 | ¿Dónde? | `/proveedores/[id]` (estrategia `catalogo`) y el **listado** `/produccion/formulas` (estrategia `formula`). |
| 2026-09-24 | ¿El montaje en fórmulas? | **Sale de QC-142 y entra aquí.** QC-142 queda solo con el permiso (y pasa a `zone: backend`). |
| 2026-09-24 | ¿Tipos de archivo? | **Solo PDF**, hasta 10 por tanda. Heredado de QC-107: el componente ya lo cumple y no se toca. |
| 2026-09-24 | ¿Quién ve el botón? | Solo quien tiene el permiso que exige la subida. Heredado de QC-142 (`documentos.modificar`); la autorización sigue en el service (QC-106/QC-111). |
| 2026-09-24 | ¿E2E? | **Sí.** Se ajusta el recorrido de QC-107 (pulsar el botón primero) y se suma fórmulas. IA y cola simuladas; el gate corre sin red. |
| 2026-09-24 | ¿Librería nueva? | **No.** El diálogo sale de shadcn, ya montado; no se re-crea. |
