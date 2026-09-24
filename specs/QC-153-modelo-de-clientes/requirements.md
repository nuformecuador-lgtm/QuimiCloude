# QC-153 — modelo-de-clientes · requirements.md

> **Zona** backend · **Complejidad** — (la asigna el leader en F1.0) · **depends_on** — · **Rama** feature/QC-153-modelo-de-clientes
>
> **Alcance.** La tabla de clientes (`customers`) con sus campos, migración escrita y revisada con su
> `down.sql`, RLS como el resto de tablas del dominio, y la **enmienda al catálogo de permisos**:
> `clientes.consultar` y `clientes.modificar`, asignados **solo al Administrador** en el seed.
>
> **Lo que NO entra.** Casos de uso y Server Actions (**QC-154**). La pantalla (**QC-155**). El enlace
> pedido ↔ cliente (**QC-156**).
>
> Sembrado por `/afinar-feature` el 2026-09-23. El bloque de Alcance y la tabla de «Decisiones cerradas»
> los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los reescribe: su
> trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

_Pendiente: los escribe spec_author (F1.2)._

## Preguntas abiertas

1. **Largo máximo de cada campo y validación de formato del correo y del teléfono.** No se preguntó; el
   precedente es proveedores (`Supplier`: `phone` y `email` opcionales). `spec_author` lo toma de ahí
   y lo dice, o lo lleva a F1.4 si el precedente no lo cierra.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-09-23 | ¿Qué datos tiene un cliente? | **Nombres** y **apellidos** en columnas separadas (obligatorios), **ciudad** (obligatoria); **teléfono**, **correo** y **dirección** opcionales. Sin NIT y sin persona de contacto: el cliente es una persona. |
| 2026-09-23 | ¿Qué no se puede repetir? | **Nada**: se admiten clientes duplicados (sin índice único de negocio). |
| 2026-09-23 | ¿Quién puede? | Permisos nuevos `clientes.consultar` (ver) y `clientes.modificar` (alta, edición, baja), **solo del Administrador** en el seed. Enmienda al catálogo cerrado de permisos (precedente: **QC-144**). La autorización se valida en el service (`docs/architecture.md`). |
| 2026-09-23 | Borrado, identificadores, empresa | **Borrado lógico** con auditoría `created_by`/`updated_by` y fechas; **identificadores en inglés**; **aislamiento por empresa desde el primer día** con `company_id` y FK compuesta (heredados de **QC-4**, **QC-42/QC-43** y **QC-59**). |
| 2026-09-23 | ¿Cómo se reparte el módulo? | Tres fichas como Proveedores (QC-42/43/44): **QC-153** modelo, **QC-154** CRUD, **QC-155** pantalla, en la épica nueva **QC-152 Clientes**. |
| 2026-09-23 | ¿Pedido ↔ cliente? | **No entra** en el módulo base: ficha aparte **QC-156** (bloqueada por QC-154). |
| 2026-09-23 | ¿E2E? | **Sí**, en la pantalla (**QC-155**), por tocar permisos (`CHECKPOINTS.md`). El modelo y el CRUD se verifican con tests unitarios y de integración. |
