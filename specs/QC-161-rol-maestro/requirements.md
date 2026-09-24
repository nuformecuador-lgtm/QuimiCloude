# QC-161 — rol-maestro · requirements.md

> **Zona** backend · **Complejidad** — · **depends_on** — · **Rama** feature/QC-161-rol-maestro
>
> **Alcance.** Nace el rol **Maestro** (dueño de la plataforma, por encima de las empresas) y el
> catálogo gana `empresas.consultar` y `empresas.modificar`. El Maestro recibe **solo** esos dos. El
> primer Maestro lo crea el seed con credenciales de `.env`, igual que el Administrador inicial. El
> Maestro no pertenece a ninguna empresa y nunca aparece en el selector de roles.
>
> **Lo que NO entra.** Operar sobre empresas (listar, alta, edición, baja) y su pantalla: **QC-162**
> «Gestión de empresas por el Maestro». Aquí los permisos nacen y nadie los exige todavía.
>
> Sembrado por `/afinar-feature` el 2026-09-24. El bloque de Alcance y la tabla de «Decisiones cerradas»
> los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los reescribe: su
> trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

_Pendiente: los escribe spec_author (F1.2)._

## Preguntas abiertas

Ninguna.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-09-24 | ¿Quién es el Maestro? | **Dueño de la plataforma**, por encima de las empresas. El Administrador sigue gestionando solo la suya. |
| 2026-09-24 | ¿Qué rol nace? | **«Maestro»** en `SEED_ROLES`, con su descripción. El literal se escribe solo en `roles.ts` (heredado de **QC-54**). Rol **global** (heredado de **QC-94/QC-144**). |
| 2026-09-24 | ¿Qué permisos nacen? | `empresas.consultar` y `empresas.modificar`; `modificar` cubre alta, edición y baja. Nombre en español `<modulo>.<accion>` (heredado de **QC-74 R1/R3**). Es una enmienda más al catálogo y se dice así en el código (**QC-38/66/86/144**). Recuento y ordinal contra `dev` al implementar: QC-142 y QC-153 también lo tocan (heredado de **QC-144**). |
| 2026-09-24 | ¿Qué recibe cada rol? | **Maestro:** solo los dos de empresas. **Administrador, Operador, Empacador:** sin cambios. Escritos uno a uno en `SEED_ROLE_PERMISSIONS` (heredado de **QC-74**). |
| 2026-09-24 | ¿Cómo nace el primer Maestro? | **Por seed, igual que el Administrador inicial**: usuario, contraseña y correo desde `.env`, con tres variables análogas a `SEED_ADMIN_*` (heredado de **QC-6**). |
| 2026-09-24 | ¿Autorización? | **Por permiso, nunca por nombre de rol** (guardia `guard-autorizacion-por-permiso`, **QC-86/QC-87**). |
| 2026-09-24 | ¿Quién usa los permisos? | **Nadie en esta ficha**: los exige QC-162. |
| 2026-09-24 | ¿E2E? | **No: se difiere a QC-162**, que tiene la pantalla (precedente **QC-94 → QC-67**, **QC-144 → QC-145**). Unitarios e integración **sí**, incluido el que fija que el seed da a cada rol exactamente sus permisos. |
| 2026-09-24 | ¿Dependencia o tabla nueva? | **Ninguna.** Solo migración y seed, que crea lo que falta (heredado de **QC-6**). |
| 2026-09-24 | ¿Maestro aparece en el selector de roles? | **Nunca.** Ni en el alta ni en la edición, y el **service rechaza** asignarlo aunque se fuerce la petición: un Maestro solo nace por seed. Cierra la escalada del Administrador de cualquier empresa a dueño de la plataforma. Enmienda **QC-94/QC-67** (todo rol aparecía en el selector). |
| 2026-09-24 | ¿A qué empresa pertenece el Maestro? | **A ninguna.** `users.company_id` sigue **obligatoria para todos menos el Maestro**: enmienda **QC-47**. La base debe garantizar que solo un Maestro tenga la empresa vacía. |
| 2026-09-24 | ¿Cómo inicia sesión el Maestro? | **Como cualquiera, y entra en esta ficha**: aterriza en su **área propia** (las pantallas son **QC-166**). Las pantallas de empresa le niegan el acceso **por permiso**, igual que a cualquiera sin permiso (**QC-93**). |
