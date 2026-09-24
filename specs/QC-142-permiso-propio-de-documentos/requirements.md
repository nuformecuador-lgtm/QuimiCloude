# QC-142 — permiso-propio-de-documentos · requirements.md

> **Zona:** `backend` · **Complejidad:** `low` · **depends_on:** QC-107 ·
> **Rama:** `feature/QC-142-permiso-propio-de-documentos`
>
> **Alcance.** El módulo documentos deja de pedir prestado `proveedores.modificar` y gana permiso
> propio: **`documentos.consultar`** y **`documentos.modificar`**, que recibe **solo el
> Administrador**. Solo backend.
>
> **Lo que NO entra.** El montaje de la subida en fórmulas y el botón en proveedores → **QC-160**.
>
> Sembrado por `/afinar-feature` el 2026-09-24. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

_Pendiente: los escribe spec_author (F1.2)._

## Preguntas abiertas

Ninguna.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-09-24 | ¿Qué permisos nacen? | `documentos.consultar` y `documentos.modificar`, con la forma `<modulo>.<accion>` (QC-74 R1) |
| 2026-09-24 | ¿Cuántos quedan en el catálogo? | **No se fija el total.** El catálogo gana exactamente estos dos. QC-161 y QC-168 también lo amplían y el orden de merge no está fijado, así que ni requisitos ni tests afirman un número; los sitios que hoy afirman el total a mano dejan de hacerlo o se ajustan al mergear |
| 2026-09-24 | ¿Cómo entran? | **Solo por migración y seed** (QC-74 R5; precedente QC-86) |
| 2026-09-24 | ¿Quién los recibe? | **Solo el Administrador**, escrito en `SEED_ROLE_PERMISSIONS`. Operador y Empacador no cambian |
| 2026-09-24 | ¿Qué pasa con quien ya subía? | **Lo hereda en la migración:** todo rol con `proveedores.modificar` recibe `documentos.modificar`, para que nadie que hoy sube PDFs pierda esa posibilidad al desplegar (hoy ese rol es solo el Administrador) |
| 2026-09-24 | ¿Dónde se valida? | En el service de documentos: la constante `DOCUMENT_UPLOAD_PERMISSION` (`lib/modules/documentos/domain/actor.ts`) deja de apuntar a `proveedores.modificar`. Por permiso, nunca por nombre de rol (QC-86/87) |
| 2026-09-24 | ¿E2E? | El E2E de documentos (QC-107) sigue verde y suma el caso de un usuario sin `documentos.modificar` que no puede subir |
| 2026-09-24 | ¿Dependencia o tabla nueva? | **Ninguna.** Solo migración de datos del catálogo y seed |
