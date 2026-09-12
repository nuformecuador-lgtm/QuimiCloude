# QC-96 — recuperar-contrasena-olvidada · requirements.md

> **Zona** `fullstack` · **Complejidad** `medium` · **depends_on** `QC-79`, `QC-23` ·
> **Rama** `feature/QC-96-recuperar-contrasena-olvidada`
>
> ## Alcance
>
> Que quien olvidó su contraseña pueda recuperarla **por sí mismo**, sin llamar al administrador:
> la pide desde la pantalla de acceso escribiendo su correo, recibe un enlace, establece una
> contraseña nueva y entra con ella.
>
> **La diferencia con QC-79 no es el mecanismo, es quién dispara.** El enlace del alta lo emite un
> administrador con sesión abierta sobre un usuario que él acaba de crear. Éste lo dispara
> **cualquiera, sin sesión**, escribiendo un correo que puede no ser suyo. De ahí sale todo lo que
> esta ficha decide distinto.
>
> ## Lo que NO entra
>
> - **El límite por origen** (la IP) → **QC-73**, que trae el mecanismo general de límite de
>   peticiones. Aquí entra **solo** el límite por correo.
> - **El alta sin contraseña** → **QC-79**, ya mergeada.
> - **Que el administrador restablezca la de otro** → **QC-89**.
> - **El mecanismo de revocar sesiones** → lo construye **QC-23**; aquí solo se invoca.
>
> _Sembrado por `/afinar-feature` el 2026-09-12. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`._

## Requisitos (EARS)

_Pendiente: los escribe spec_author (F1.2)._

## Preguntas abiertas

Ninguna. Las cinco que la ficha traía del 2026-09-11 quedan cerradas.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
| --- | --- | --- |
| 2026-09-12 | ¿Cuánto vive el enlace? | **1 hora**, no los 7 días del alta. La diferencia es deliberada: éste lo dispara cualquiera sin sesión, y quien olvidó su contraseña está delante del teclado **ahora**. Si caduca, se vuelve a pedir y no cuesta nada |
| 2026-09-12 | ¿Qué ve quien escribe un correo que no existe? | **Exactamente el mismo mensaje** que si existiera, y con el **mismo tiempo de respuesta**. Es lo único que impide que la pantalla se use para averiguar quién trabaja en la empresa probando direcciones |
| 2026-09-12 | ¿Qué cuentas pueden recuperar? | **Solo `active`**, y las otras tres **en silencio**: no reciben enlace, pero la pantalla responde igual. Distinguir revelaría el estado de la cuenta de alguien. Una cuenta `pending` ya tiene el enlace de **QC-79**; `inactive` o `blocked` hablan con el administrador |
| 2026-09-12 | ¿Hay límite de intentos? | **Sí, por correo y dentro de esta ficha**: un tope por ventana, sin librería ni almacén nuevo. El límite **por origen** se queda en **QC-73** |
| 2026-09-12 | ¿Qué pasa con las sesiones abiertas? | **Se cierran TODAS.** No hay «actual» que preservar —la persona no está dentro— y el caso para el que la recuperación existe es justamente que otro entró a la cuenta. **Cierra el hueco de QC-23**, cuya enumeración decía tres caminos y omitía éste |
| 2026-09-12 | ¿Comparte tabla con el enlace del alta? | **Sí: `credential_setup_tokens` de QC-79**, con un campo que distingue **alta** de **recuperación**. La huella, el uso único y el índice de «uno vivo por persona» ya existen y **no se duplican**. Las dos caducidades sí son distintas: 7 días y 1 hora |
| 2026-09-12 | Precedentes de QC-79 que se heredan y no se reabren | En la base **solo la huella**, nunca el secreto; **un enlace vivo por persona** garantizado por índice de la base, no por un `SELECT` previo; **un solo uso**; la contraseña pasa por la política de **QC-19** y el hashing de **QC-5**, sin excepción; errores por el **catálogo cerrado de QC-70** con el identificador de **QC-71**; el remitente sale de **configuración**, no del código; y el envío con **`resend`**, ya aprobada y con su fila en `docs/dependencias.md` |
