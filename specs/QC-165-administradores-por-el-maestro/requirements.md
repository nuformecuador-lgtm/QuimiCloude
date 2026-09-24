# QC-165 — administradores-por-el-maestro · requirements.md

> **Zona** backend · **Complejidad** — · **depends_on** QC-161 · **Rama** feature/QC-165-administradores-por-el-maestro
>
> **Alcance.** El Maestro da de **alta**, **edita** y da de **baja** usuarios con rol **Administrador**
> en **cualquier** empresa, eligiendo la empresa al crearlos, y consulta quién es Administrador en cada
> una. Solo Administradores: no crea ni toca Operadores ni Empacadores.
>
> **Lo que NO entra.** Las pantallas del área del Maestro (**QC-166**). La gestión de empresas
> (**QC-162**). El rol Maestro y sus permisos (**QC-161**).
>
> Sembrado por `/afinar-feature` el 2026-09-24. El bloque de Alcance y la tabla de «Decisiones cerradas»
> los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los reescribe: su
> trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

_Pendiente: los escribe spec_author (F1.2)._

## Preguntas abiertas

1. **El último Administrador de una empresa.** No está decidido si el Maestro puede darlo de baja (o
   quitarle el rol) dejando la empresa sin ningún Administrador.
2. **Cambiar de empresa a un Administrador.** No está decidido si se puede al editarlo o si la empresa
   queda fija desde el alta.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-09-24 | ¿Qué usuarios gestiona el Maestro? | **Solo los de rol Administrador**, de **cualquier** empresa. No crea ni toca Operadores ni Empacadores. |
| 2026-09-24 | ¿Qué puede hacer con ellos? | **Alta** (eligiendo la empresa), **edición**, **baja** y consultar la **lista** por empresa. |
| 2026-09-24 | ¿Qué permiso lo autoriza? | **`empresas.modificar`** para escribir y **`empresas.consultar`** para la lista (**QC-161**). **Sin permiso nuevo**: el catálogo no se toca. Validado en el service (**QC-86**). |
| 2026-09-24 | ¿Qué datos lleva el Administrador? | **Los mismos campos y validaciones** del alta actual (**QC-4/QC-66**). |
| 2026-09-24 | ¿Unicidad? | **Dentro de la empresa** elegida: correo, usuario y documento (**QC-47**). |
| 2026-09-24 | ¿Contraseña? | **Nace sin ella** y recibe el enlace para fijarla (**QC-79**). |
| 2026-09-24 | ¿Baja? | **Lógica**, como la del resto de usuarios (**QC-4**). |
| 2026-09-24 | ¿E2E? | **Se difiere a QC-166**, que tiene las pantallas (precedente **QC-94 → QC-67**). Unitarios e integración **sí**, incluido el rechazo por permiso y el de crear un rol distinto de Administrador. |
