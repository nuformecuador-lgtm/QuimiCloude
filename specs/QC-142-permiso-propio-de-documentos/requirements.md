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

> Cada requisito cita entre corchetes la fila de «Decisiones cerradas» que cubre (`[D1]` es la
> primera fila de la tabla, `[D8]` la última). Ningún requisito fija el número total de permisos
> del catálogo ni de asignaciones del seed [D2].

### El catálogo

- **R1** [D1] — El catálogo de permisos DEBE declarar exactamente dos entradas nuevas,
  `documentos.consultar` y `documentos.modificar`, cada una con módulo `documentos`, acción
  `consultar` o `modificar` respectivamente, código igual a `<modulo>.<accion>`, descripción no
  vacía y ningún campo de empresa.
- **R2** [D1, D2] — El catálogo DEBE ser el que existía antes de esta feature más esas dos
  entradas: ningún código previo DEBE desaparecer, cambiar de módulo, de acción o de descripción, y
  no DEBE existir ningún otro código cuyo módulo sea `documentos`.
- **R3** [D2] — Ningún test ni guardia del repositorio DEBE afirmar como literal numérico el total
  de entradas del catálogo de permisos ni el total de asignaciones permiso-rol del seed; toda ancla
  contra el verde por vacuidad sobre esos conjuntos DEBE derivarse de las constantes del catálogo y
  del seed, o afirmar la presencia de códigos concretos.

### Cómo entran: migración y seed

- **R4** [D3, D8] — CUANDO se aplica la migración de esta feature sobre una base que no tiene los
  dos permisos, el sistema DEBE crear las dos filas en el catálogo persistido con el mismo código,
  módulo, acción y descripción que declara el catálogo de la aplicación.
- **R5** [D3, D4] — CUANDO se aplica la migración, el rol Administrador DEBE quedar con
  `documentos.consultar` y con `documentos.modificar`.
- **R6** [D5] — CUANDO se aplica la migración, todo rol que tenga `proveedores.modificar` DEBE
  quedar con `documentos.modificar`, sea cual sea su nombre.
- **R7** [D4, D5] — CUANDO se aplica la migración, ningún rol distinto del Administrador DEBE
  recibir `documentos.consultar`, y ningún rol que no sea el Administrador ni tenga
  `proveedores.modificar` DEBE recibir `documentos.modificar`.
- **R8** [D5] — CUANDO se aplica la migración, ningún rol DEBE perder ninguna asignación que ya
  tuviera, incluida `proveedores.modificar`.
- **R9** [D3] — SI la migración se aplica sobre una base donde los dos permisos o alguna de las
  asignaciones que escribe ya existen, ENTONCES el sistema DEBE completar la migración sin error y
  sin modificar ni duplicar las filas existentes.
- **R10** [D3] — CUANDO se revierte la migración, el sistema DEBE retirar los dos permisos y todas
  sus asignaciones a cualquier rol, y NO DEBE retirar, crear ni modificar ninguna otra fila de
  permisos, asignaciones ni roles.
- **R11** [D3, D8] — La migración NO DEBE crear, alterar ni borrar ninguna tabla, columna,
  índice, restricción, tipo ni política; solo DEBE escribir filas de permisos y de asignaciones
  permiso-rol.
- **R12** [D4] — Los permisos que el seed asigna al Administrador DEBEN incluir
  `documentos.consultar` y `documentos.modificar`, escritos uno a uno; los que asigna al Operador
  y al Empacador DEBEN ser exactamente los mismos que antes de esta feature.
- **R13** [D3, D4] — CUANDO el seed corre sobre una base vacía o sobre una base sembrada antes de
  esta feature, el sistema DEBE dejar al Administrador con los dos permisos de `documentos` y al
  Operador y al Empacador sin ninguno; CUANDO el seed corre por segunda vez, NO DEBE cambiar el
  número de permisos ni de asignaciones persistidos.

### Dónde se valida

- **R14** [D6] — Los casos de uso de `documentos` que hoy exigen permiso (emitir los enlaces de
  subida, encolar una tanda y consultar el estado de una tanda) DEBEN exigir `documentos.modificar`
  como primera comprobación, antes de validar la entrada y antes de tocar ningún puerto.
- **R15** [D6] — SI el actor no tiene `documentos.modificar`, aunque tenga `proveedores.modificar`,
  `proveedores.consultar` o `documentos.consultar`, ENTONCES cada uno de esos tres casos de uso
  DEBE rechazar con el error de autorización del módulo, sin tocar ningún puerto.
- **R16** [D6] — SI el actor tiene `documentos.modificar` y ningún permiso de `proveedores`,
  ENTONCES esos tres casos de uso DEBEN autorizar la operación.
- **R17** [D6] — La autorización del módulo `documentos` DEBE decidirse por el código de permiso y
  NO DEBE depender del nombre del rol del actor; el código exigido DEBE escribirse una sola vez
  dentro del módulo.
- **R18** [D6, Alcance] — Las dos lecturas del módulo (firmar un enlace de lectura y descargar
  bytes) DEBEN conservar su comportamiento actual: exigen la empresa del actor y NO DEBEN exigir
  ninguno de los dos permisos nuevos.

### Recorrido completo

- **R19** [D7] — CUANDO un usuario con el rol Administrador sembrado sube tres PDFs desde el
  detalle de un proveedor, el sistema DEBE llevar cada archivo hasta el estado terminado, igual que
  antes de esta feature.
- **R20** [D7] — CUANDO un usuario cuyo rol tiene `proveedores.consultar` y `proveedores.modificar`
  pero no `documentos.modificar` intenta subir PDFs desde el detalle de un proveedor de su empresa,
  el sistema DEBE mostrar el error de autorización, NO DEBE enviar ningún archivo al almacenamiento
  y NO DEBE persistir ninguna tanda en esa empresa.

### Sin dependencias ni tablas

- **R21** [D8] — Esta feature NO DEBE añadir ninguna dependencia al manifiesto del proyecto ni
  ningún modelo, campo o enum al esquema de datos.

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
