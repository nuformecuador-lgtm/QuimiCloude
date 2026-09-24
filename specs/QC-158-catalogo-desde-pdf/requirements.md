# QC-158 — catalogo-desde-pdf · requirements.md

> **Zona** fullstack · **Complejidad** high · **depends_on** — · **Rama** feature/QC-158-catalogo-desde-pdf
>
> **Alcance.** Lo que la IA devuelve al leer un **PDF de catálogo** (subido en `/proveedores/[id]` con
> estrategia `catalogo`, por imagen; QC-107/QC-109/QC-111) se convierte en **líneas del catálogo de ese
> proveedor** tras una **revisión humana**: la pantalla muestra lo encontrado, se corrige y solo al
> confirmar se guarda. Las líneas ganan dos campos nuevos, `material` y `measurements`.
>
> **Lo que NO entra.** La receta desde PDF de fórmula (**QC-159**, bloqueada por QC-142). El permiso
> propio de documentos y el montaje en fórmulas (**QC-142**). Poner el prompt definitivo en Vercel y
> firmarlo (**QC-131**, humano). El catálogo visual (**QC-140**), que consume las imágenes que esta
> ficha asigna.
>
> Sembrado por `/afinar-feature` el 2026-09-23. El bloque de Alcance y la tabla de «Decisiones cerradas»
> los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los reescribe: su
> trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

_Pendiente: los escribe spec_author (F1.2)._

## Preguntas abiertas

1. **Unidad de una presentación nueva.** Una presentación exige unidad (QC-80, `unit_id` NOT NULL). Si la
   IA lee una unidad que no está en el catálogo de unidades, no está decidido qué pasa (¿el revisor
   elige una?, ¿se rechaza la línea?).
2. **Unidad de cada medida.** No está decidido si diámetro, alto y boca guardan cada uno su unidad (cm,
   mm) o si se fija una sola.
3. **Emparejar imagen y línea.** Cómo sabe el sistema qué recorte de QC-110 corresponde a qué producto
   depende de lo que devuelven la IA y el recorte; hay que medirlo en el código antes de decidir.
4. **Contrato JSON del prompt.** El prompt de catálogo debe devolver también `material` y las medidas:
   **enmienda R10 de QC-129** (seis campos). El spec fija la forma JSON que el sistema acepta y el borrador
   de QC-131 (`borradores-de-prompts/catalogo.md`, fuera de git) se ajusta a ella. Nada valida hoy la
   salida de la IA (se guarda en `document_files.extracted_text` tal cual): esta ficha es la primera que
   la interpreta.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-09-23 | ¿Qué pasa al terminar la lectura? | Lo que devuelve la IA se convierte en **líneas del catálogo de ese proveedor**. |
| 2026-09-23 | ¿Directo o revisado? | **Revisión antes de guardar**: la pantalla muestra lo encontrado, se corrige y solo al confirmar se guarda. |
| 2026-09-23 | ¿Producto que ya está en el catálogo (mismo nombre y presentación)? | Se **actualizan solo sus precios**; en la revisión sale como «cambia» con el precio viejo y el nuevo. |
| 2026-09-23 | ¿Presentación que no existe? | **Se crea** al confirmar, con lo que leyó la IA (ver pregunta 1 sobre su unidad). |
| 2026-09-23 | ¿Imágenes? | Cada línea lleva su **imagen recortada** (QC-110): se ve en la revisión, se puede quitar, y al confirmar queda como imagen de la línea (alimenta QC-140). |
| 2026-09-23 | Campos nuevos de la línea de catálogo | **`material`** (texto, opcional) y **`measurements`** (JSON, opcional: diámetro, alto y medida de la boca). Los lee la IA del PDF y se pueden corregir en la revisión. |
| 2026-09-23 | ¿Fórmulas? | No entran: **QC-159**, bloqueada por QC-142. |
| 2026-09-23 | ¿Permiso? | Revisar y confirmar exige **`proveedores.modificar`** (heredado de QC-107) hasta que QC-142 traiga el permiso propio de documentos. Validado en el service. |
| 2026-09-23 | ¿E2E? | **Sí**: toca importes y datos del catálogo (`CHECKPOINTS.md`), con la IA y la cola **simuladas** para que el gate corra sin red (patrón de QC-107). |
