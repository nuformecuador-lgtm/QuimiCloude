# QC-144 — rol-empacador · requirements.md

> **Zona:** `backend` · **Complejidad:** `medium` · **depends_on:** — ·
> **Rama:** `feature/QC-144-rol-empacador`
>
> **Alcance.** Un tercer rol de semilla, **Empacador**, con la misma lógica y la misma pantalla
> `/asignacion` que el Operador: ve lo que le asignaron y lo prepara. **No ve inventario.** Además,
> nace un **permiso nuevo para ver todos los pedidos terminados de la empresa**, que tienen el
> Empacador y el Administrador y el Operador no. La lista que ese permiso abre la construye
> **QC-145**.
>
> **Lo que NO entra.** La lista de pedidos terminados, la fecha de terminado y lo que el
> Administrador ve en Asignación → **QC-145** (`pedidos-terminados-en-asignacion`), bloqueada por
> ésta. Ninguna pantalla nueva ni cambios en el selector de roles (QC-94/QC-67 ya leen la tabla).
> Ninguna tabla nueva.
>
> Sembrado por `/afinar-feature` el 2026-09-22. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

_Pendiente: los escribe spec_author (F1.2)._

## Preguntas abiertas

Ninguna.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-09-22 | ¿Qué rol nace? | **«Empacador»**, añadido a `SEED_ROLES` con su descripción. El literal se escribe **solo** en `lib/modules/identity/domain/roles.ts`, como los otros dos (heredado de **QC-54**). Rol **global**, sin empresa (heredado de **QC-94**) |
| 2026-09-22 | ¿Qué hace el Empacador? | **Lo mismo que el Operador, con la misma lógica y la misma pantalla `/asignacion`**: ve lo que le asignaron y lo prepara. La ejecución exige solo `asignaciones.consultar` (heredado de **QC-63 D13**). Su lista de trabajo sigue mostrando solo lo asignado (heredado de **QC-88**). **Sin inventario** |
| 2026-09-22 | ¿Qué lo distingue del Operador? | **Ver todos los pedidos terminados de la empresa**, sin filtro por usuario (la lista es **QC-145**). El Operador **no** los ve. Se descartó que el Operador también los viera |
| 2026-09-22 | ¿Cómo se hace la diferencia? | **Con un permiso nuevo, nunca por nombre de rol**: en este repo se autoriza por permiso (guardia `guard-autorizacion-por-permiso`, **QC-86/QC-87**). El catálogo **gana exactamente una entrada** (hoy 15 → 16) y es una **enmienda más** al catálogo de QC-74, dicha así en el código como las anteriores (QC-38, QC-66, QC-86). **QC-142** (`permiso-propio-de-documentos`, `pending`) también suma un permiso: el recuento y el ordinal de la enmienda se fijan contra el catálogo que haya en `dev` al implementar, no contra el de hoy. El código lo fija `spec_author` con la forma `<modulo>.<accion>` de QC-74 R1. Cambia **solo por migración y seed** (QC-74 R5) |
| 2026-09-22 | ¿Qué permisos lleva cada rol? | **Empacador:** `asignaciones.consultar` + el permiso nuevo, y nada más: **sin** `inventario.consultar` y **sin** `asignaciones.modificar` (no asigna ni desasigna responsables). **Administrador:** gana el permiso nuevo. **Operador:** **sin cambios** (`inventario.consultar` + `asignaciones.consultar`, QC-86 R26/R27). Escritos uno a uno en `SEED_ROLE_PERMISSIONS` (heredado de **QC-74**) |
| 2026-09-22 | ¿Quién usa el permiso nuevo? | **Nadie en esta ficha**: la lista que lo exige es QC-145. Aquí solo nace en el catálogo y se asigna a los dos roles |
| 2026-09-22 | ¿Cómo llega a los usuarios? | Aparece en el selector de **alta y edición** sin tocar la pantalla (heredado de **QC-94/QC-67**). Los usuarios los sigue creando quien tenga `usuarios.modificar` (**QC-66**) |
| 2026-09-22 | ¿E2E? | **No en esta ficha: se difiere a QC-145**, que tiene la pantalla; su E2E entra como Empacador y como Operador. Precedente **QC-94 → QC-67**. Unitarios e integración **sí**, incluido el que fija que el seed da a cada rol exactamente sus permisos |
| 2026-09-22 | ¿Dependencia o tabla nueva? | **Ninguna dependencia y ninguna tabla nueva.** El rol y el permiso entran por migración y seed, que crea solo lo que falta (heredado de **QC-6**) |
