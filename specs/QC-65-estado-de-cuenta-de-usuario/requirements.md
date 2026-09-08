# QC-65 — estado-de-cuenta-de-usuario · requirements.md

> Zona: `backend` · Complejidad: `low` · depends_on: `QC-47` ·
> Rama: `feature/QC-65-estado-de-cuenta-de-usuario`
>
> **Alcance.** El usuario gana un estado de cuenta con cuatro valores en inglés —`active`,
> `pending`, `inactive`, `blocked`— más el rastro de su último cambio: cuándo fue y quién lo
> hizo. Esta ficha SOLO agrega esas columnas, su migración y su persistencia sobre el modelo de
> usuarios que ya existe. Nadie lee todavía el estado para decidir nada.
>
> **Lo que NO entra.** Que el estado mande en el acceso —solo `active` entra al login, el bloqueo
> por intentos fallidos de QC-19 pasa a escribir `blocked`, el desbloqueo manual limpia el contador
> de intentos, y qué ocurre con una sesión ya abierta— → **QC-78**, bloqueada por esta. Los casos
> de uso que cambian el estado → **QC-66**. La pantalla → **QC-67**. Crear un usuario sin
> contraseña y activarlo por enlace → **QC-79**, bloqueada por QC-66.
>
> Sembrado por `/afinar-feature` el 2026-09-08. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

_Pendiente: los escribe spec_author (F1.2)._

## Preguntas abiertas

Ninguna.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-09-08 | ¿El estado es un sí/no o una lista de valores? | Lista **cerrada** de cuatro valores, con nombres en inglés: `active`, `pending`, `inactive`, `blocked`. Un quinto valor entraría por migración; no se diseña para crecer sin migrar. |
| 2026-09-08 | ¿Qué significa cada valor? | `active`: la cuenta funciona. `pending`: creada, aún no habilitada para entrar. `inactive`: apagada a propósito por un administrador, reversible. `blocked`: bloqueada por seguridad. |
| 2026-09-08 | ¿En qué estado nace una cuenta nueva? | `pending`. **Corrige la descripción anterior del board**, que decía «nace habilitada»; la tarjeta ya está reescrita. Quién la pasa a `active`: el administrador desde QC-66, o la propia persona al establecer su contraseña por enlace (QC-79). |
| 2026-09-08 | ¿Y las filas que ya existen, al migrar? | `active`. Incluye al usuario inicial del seed de QC-6, que tiene que seguir entrando: una migración que dejara `pending` a todo el mundo cerraría el sistema sobre sí mismo. |
| 2026-09-08 | ¿Se guarda rastro del cambio de estado? | Sí: **la fecha del último cambio y quién lo hizo**. Quién es **opcional**: vacío significa que lo cambió el sistema, no una persona (es el caso del bloqueo automático de QC-19 cuando QC-78 lo unifique). No es un historial: solo el último cambio. |
| 2026-09-08 | ¿`blocked` es lo mismo que el bloqueo por intentos fallidos de QC-19? | **Sí, son la misma cosa.** Pero unificarlos **no entra aquí**: QC-65 no toca `lock_level`, `locked_until`, la escalada de tiempo ni sus tests de concurrencia. Lo hace QC-78. |
| 2026-09-08 | ¿Qué estados entran al login? | **Solo `active`.** `pending`, `inactive` y `blocked` reciben el resultado genérico que QC-7 dejó congelado, que no revela si falló el usuario, la contraseña o el estado. **Lo implementa QC-78**, no esta ficha. |
| 2026-09-08 | ¿El administrador saca a una cuenta de `blocked`? | Sí: `blocked` es un estado más y puede moverlo (QC-66). Sacarla de `blocked` tiene que limpiar además el contador de intentos fallidos o la cuenta se bloquearía sola al primer intento; esa limpieza es de **QC-78**, dueña del mecanismo. |
| 2026-09-08 | ¿Deshabilitar libera el correo, el nombre de usuario o el documento? | No. Los índices únicos **no cambian**: la cuenta sigue existiendo y se puede volver a habilitar (de la descripción del board). |
| 2026-09-08 | ¿Qué relación tiene con `deleted_at`? | Ninguna: son cosas distintas. El borrado lógico de QC-4 no se toca, y deshabilitar no borra. |
| 2026-09-08 | Idioma de los identificadores de base | Inglés, con `snake_case` en las columnas. Heredado de QC-4. |
| 2026-09-08 | ¿Quién lee el estado en esta ficha? | Nadie. Es el mismo reparto que `must_change_credential`: QC-19 la escribió, QC-7 la lee. Aquí se escribe; QC-78 lee. |
