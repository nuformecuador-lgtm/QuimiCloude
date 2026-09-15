# QC-101 — cierre-de-sesiones-de-otro-desde-la-pantalla · requirements.md

> **Zona** `fullstack` (era `frontend`; cambio al acotar) · **Complejidad** `medium` ·
> **depends_on** QC-23 (cerrada) ·
> **Rama** `feature/QC-101-cierre-de-sesiones-de-otro-desde-la-pantalla`
>
> **Alcance.** El Administrador puede cerrar **todas** las sesiones de otra persona desde el **panel
> de detalle del usuario**. Entra la **Server Action que hoy falta** —el caso de uso
> `end-all-sessions` existe en el dominio y esta probado, y **nada lo expone**—, el boton en el
> panel, un **dialogo de confirmacion con el nombre de la persona dentro**, y el **E2E del recorrido
> completo**: el administrador cierra, y el otro, que tenia sesion abierta, acaba en el login. Solo
> se ofrece sobre **cuentas activas**, y **nunca sobre uno mismo**.
>
> **La zona cambio de `frontend` a `fullstack` al acotar, y ese es el hallazgo principal.** La ficha
> nacio creyendo que solo faltaba un boton, y falta tambien **la puerta por la que ese boton llama**.
>
> **Lo que NO entra.**
> - **El boton del propio usuario sobre sus sesiones**: es **QC-53**, y es tambien donde vive la
>   autoaplicacion, con su aviso de que te echa de la sesion actual.
> - **Decir cuantas sesiones se cerraron.** `end-all-sessions.ts:64` devuelve `void`; contar
>   exigiria la lectura por peticion que **QC-23 descarto a proposito**.
> - **Listar las sesiones vivas de nadie.** No existe tal lista: la revocacion es un **sello de
>   tiempo**, no un borrado por sesion. QC-23 lo descarto y dijo que **no habria ficha**.
> - **Un permiso nuevo `sesiones.modificar`**: se usa `usuarios.modificar`, y el porque ya esta
>   escrito en `end-all-sessions.ts:33-35`.
>
> *Sembrado por `/afinar-feature` el 2026-09-13. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijo el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aqui es `## Requisitos (EARS)`.*

## Requisitos (EARS)

_Pendiente: los escribe spec_author (F1.2)._

## Preguntas abiertas

Ninguna. Las **cinco** que la ficha traia quedan cerradas: **tres las contesto el disco** —no hay
menu de fila, el caso de uso no devuelve numero, y no existe ninguna lista de sesiones— y **dos las
decidio el humano** el 2026-09-13.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-09-13 | La ficha es `frontend`, pero no hay Server Action que el botón pueda llamar. ¿Cómo se reparte? | **Pasa a `fullstack` e incluye la acción.** El caso de uso ya existe y está probado; la Server Action es un envoltorio fino. Partirla en una ficha `backend` de un solo archivo serían **dos ciclos SDD completos** para exponer una función ya escrita, y esa mitad no le sirve a nadie sola |
| 2026-09-13 | ¿Dónde vive el botón? | **En el panel de detalle del usuario** (`user-sheet`), no en la fila. Es una acción poco frecuente que **expulsa a alguien que puede estar trabajando**: pedirla desde el detalle obliga a mirar de quién se trata antes de pulsar. La fila se queda con sus tres iconos |
| 2026-09-13 | ¿Existe un menú de la fila donde colgarlo? | **No, y esto lo contestó el disco.** Hoy son **tres botones de icono** —editar, cambiar estado, borrar— en `user-row-actions.tsx:98,110,122`. La pregunta de la ficha daba por hecho un menú que no existe |
| 2026-09-13 | ¿Pide confirmación, y con qué texto? | **Sí, con el nombre de la persona dentro** —«¿Cerrar todas las sesiones de Ana Rodríguez?»— y la advertencia de que tendrá que volver a entrar. Reutiliza el patrón que ya usan cambiar estado y borrar en esta misma pantalla. **El nombre dentro es lo que convierte un «¿seguro?» en una comprobación real** |
| 2026-09-13 | ¿Puede el administrador aplicárselo a sí mismo? | **No: sobre uno mismo no se ofrece.** El dominio lo permite —si el destino es uno mismo no exige permiso—, pero quien pulsa desde la pantalla de administración no está pensando en sí mismo y acabaría en el login sin esperarlo. Ese botón es **QC-53**, donde se explica lo que va a pasar |
| 2026-09-13 | ¿Se ofrece sobre cuentas no activas? | **No: solo sobre cuentas activas.** En una cuenta dada de baja o suspendida las sesiones **ya se cortaron** al cambiar el estado (QC-23). Ofrecerlo ahí invita a pulsar algo que no hace nada visible y siembra la duda de si el corte automático funcionó |
| 2026-09-13 | ¿Qué se dice al terminar, y qué si no había ninguna sesión abierta? | **Se confirma la acción sin prometer número** —«Se cerraron las sesiones de Ana Rodríguez»—. **El sistema no sabe cuántas cerró**: `end-all-sessions.ts:64` devuelve `void`. El mensaje es verdad tanto con cinco sesiones como con ninguna: en ambos casos el resultado es el mismo |
| 2026-09-13 | ¿El listado muestra cuántas sesiones vivas hay? | **No, y es imposible sin trabajo nuevo de backend.** La revocación es un **sello de tiempo**, no un borrado por sesión: **no hay ninguna lista que leer**. QC-23 descartó esa lectura por dar nada que no dé el cierre total, y dijo que no habría ficha |
| 2026-09-13 | ¿Hace falta E2E? | **Sí, el recorrido completo**: el administrador cierra y el otro, con sesión abierta, acaba en el login. `CHECKPOINTS.md` lo pide para autenticación y permisos, y esto es las dos cosas. Es **el único sitio donde se demuestra que la revocación de QC-23 sirve de punta a punta**: hasta hoy está probada en el servicio y nunca ejercitada desde la interfaz |
| 2026-09-13 | Permiso, y quién lo valida | **`usuarios.modificar`, validado en el service. Heredado de QC-23**, y **no** se crea un permiso nuevo `sesiones.modificar`: el porqué ya está escrito en `end-all-sessions.ts:33-35` —obligaría a migración y seed de `role_permissions` y no separa nada útil—. El administrador **nunca elige dispositivo**: lo suyo es siempre total |
