# QC-23 — registro-de-sesiones · requirements.md

> **Zona** `backend` · **Complejidad** `high` · **depends_on** `QC-8` ·
> **Rama** `feature/QC-23-registro-de-sesiones`
>
> ## Alcance
>
> Que cerrar sesión invalide **de verdad** el código de sesión, y no solo retire la cookie: hoy una
> copia del código hecha antes de cerrar seguiría funcionando hasta que caduque.
>
> Se hace con **dos mecanismos distintos**, porque las dos acciones son distintas: un **sello por
> usuario** —una fecha de «válido desde»— que mata todo lo emitido antes, y un **identificador de
> sesión** dentro del token más el registro de las sesiones cerradas una a una.
>
> ## Lo que NO entra
>
> - **El botón del usuario** («cerrar todas mis sesiones») → **QC-53**.
> - **El botón del administrador** → **QC-101**, creada el 2026-09-12 al re-acotar esta. Antes no
>   tenía dónde colgar y la capacidad quedaba sin poder invocarse; hoy la pantalla existe.
> - **La lista de dispositivos abiertos** con cierre uno a uno: **descartada a propósito y NO
>   genera ficha** — obliga a una lectura por petición, justo lo que **QC-28** quiere quitar.
> - **Guardar en memoria rápida la comprobación** → **QC-28**.
> - **Cualquier maquinaria de trabajo en segundo plano**: no existe en el ERP y esta ficha no la
>   construye.
>
> _Re-sembrado por `/afinar-feature` el 2026-09-12. **Sustituye al spec del 2026-09-03**, que se
> escribió antes de QC-65, QC-66, QC-67, QC-70, QC-71, QC-78 y QC-79 y no los menciona; sus tres
> archivos siguen en `dc1c6ae`. El bloque de Alcance y la tabla de «Decisiones cerradas» los fijó
> el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los reescribe: su trabajo
> aquí es `## Requisitos (EARS)`._

## Requisitos (EARS)

_Pendiente: los escribe spec_author (F1.2)._

## Preguntas abiertas

Ninguna. Las dos que dejó el spec del 2026-09-03 quedan cerradas: la purga, por decisión del
humano; y la del botón del administrador, **por los hechos** —decía «no hay pantalla de
administración de usuarios ni ficha que la cree» y hoy existen QC-66 y QC-67, las dos mergeadas—.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
| --- | --- | --- |
| 2026-09-12 | ¿Qué corta exactamente las sesiones vivas? | Cuenta **bloqueada**, cuenta **inactiva**, usuario **borrado** y **cambio de rol**: los cuatro cortan **todo lo abierto al instante**. `pending` **no aplica** —una cuenta pendiente nunca llegó a tener sesión—. **Sustituye** a «un cambio de rol o una baja» del spec anterior, escrito cuando no existían los cuatro estados (**QC-65**, **QC-78**) ni el borrado lógico (**QC-66**) |
| 2026-09-12 | ¿Cambiar la contraseña cierra sesiones? | **Sí: todas menos la actual.** Quien la cambia sigue trabajando; el resto de dispositivos vuelven al login. Aplica a los tres caminos que existen hoy: **QC-36** (cambiar la mía), **QC-89** (el administrador restablece la de otro) y el enlace de **QC-79** |
| 2026-09-12 | ¿Qué se hace con las filas de sesiones cerradas ya caducadas? | **Borrado perezoso al leer**: quien consulta las sesiones de un usuario borra de paso las suyas caducadas. Sin tarea programada, que este ERP no tiene. **Cierra la pregunta abierta 1** del spec anterior |
| 2026-09-12 | ¿El botón del administrador entra aquí? | **No: sale a QC-101** (`frontend`). Coherente con que esta ficha es `backend` y sus botones ya salían fuera. **Cierra la pregunta abierta 2** |
| 2026-09-12 | Errores | Todo código nuevo entra por el **catálogo cerrado de QC-70** con su traductor único, sin mensaje en el sitio que lanza; y el error inesperado lleva su **identificador de petición de QC-71**. Ninguna de las dos existía al escribir el spec original |
| 2026-09-03 | ¿Cómo se invalida un código ya emitido? | **Con dos mecanismos, no uno**: sello por usuario (mata todo lo anterior a una fecha) e identificador de sesión (mata una sola) |
| 2026-09-03 | ¿El sello cambia el formato del token? | **No.** El token ya lleva `iat` firmado (**QC-7**/**QC-8**): el sello se compara contra algo que ya viaja |
| 2026-09-03 | ¿Y el identificador de sesión? | **Sí, sube la versión del token** y las sesiones vivas se rompen. Aceptado con el mismo criterio que ya se aceptó antes |
| 2026-09-03 | ¿Cerrar sesión cierra un dispositivo o todos? | **Solo ese dispositivo.** Quien sale en el móvil sigue dentro en la oficina |
| 2026-09-03 | ¿Y «cerrar todas mis sesiones»? | **Todas, incluida la actual**, así que quien la usa acaba en el login |
| 2026-09-03 | ¿El administrador puede cerrar una sesión suelta de otro? | **No: lo suyo es siempre total.** No elige dispositivo |
| 2026-09-03 | ¿El usuario ve sus dispositivos abiertos? | **No, y no genera ficha.** Obliga a una lectura por petición y no da nada que no dé el cierre total |
| 2026-09-03 | ¿Qué pasa si no se puede comprobar si una sesión fue cerrada? | **Se corta**: se trata como inválida y la persona vuelve al login. Una revocación que se puede saltar provocando un fallo no es una revocación |
| 2026-09-03 | ¿Dónde se aplica la comprobación? | **Donde ya se resuelve el usuario contra la base en cada petición** (**QC-8 D2**) |
| 2026-09-03 | ¿Cambia el «cerrar sesión» que ya existe? | **En el efecto sí, en la firma no**: `logoutAction()` sigue sin parámetros y sin valor de retorno, congelada por **QC-11** |
| 2026-09-03 | Caducidad | **Sin cambios: 8 h absolutas**, sin renovación deslizante y sin «recordarme» (**QC-7 D10**) |
| 2026-09-03 | Permisos | El **Administrador** cierra las sesiones de otro; **cualquiera** cierra las suyas. Se valida **en el service**, no en el middleware, con su test |
| 2026-09-03 | ¿Cuántas implementaciones del HMAC? | **Una sola en todo el repositorio** (**QC-8 R5**, **QC-9**) |
| 2026-09-03 | Módulo y capas | **`identity`**: la lógica en `domain/`, el almacén como **adaptador driven** detrás de un puerto, cableado solo en `lib/composition/` |
| 2026-09-03 | Borrado y marcas de tiempo | **Borrado lógico** donde aplique, con `created_at` / `updated_at` / `deleted_at` (**QC-4**) |
| 2026-09-03 | Idioma de los identificadores de la DB | **Inglés** — tablas, columnas, índices y restricciones (**QC-4**) |
| 2026-09-03 | RLS | **Activada y forzada.** No sustituye a la autorización en el service (**QC-4 R19**) |
| 2026-09-03 | Migración | `migration.sql` más **`down.sql` obligatorio**, y revertirla deja el esquema exactamente como estaba (**QC-4 R20**) |
| 2026-09-03 | E2E | **Diferida con motivo a QC-53**, que trae el botón y el recorrido navegable. Aquí no hay pantalla que visitar |
| 2026-09-03 | ¿Librería nueva? | **Ninguna.** Es esquema, migración y dominio |
