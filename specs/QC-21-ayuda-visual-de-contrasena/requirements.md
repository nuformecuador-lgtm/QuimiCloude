# QC-21 — ayuda-visual-de-contrasena · requirements.md

> Zona: `frontend` · Complejidad: `medium` · `depends_on`: `QC-19` · Rama: `feature/QC-21-ayuda-visual-de-contrasena`
>
> **Alcance:** el **componente reutilizable** que enseña, mientras alguien escribe una contraseña
> nueva, los requisitos que debe cumplir y cuáles va cumpliendo. Pinta a partir del catálogo
> `CREDENTIAL_RULES` que ya exporta QC-19 y **no vuelve a declarar ninguna regla**. Las seis
> reglas comprobables sin red se marcan en vivo; la séptima —contraseñas filtradas— se muestra en
> la lista pero no se resuelve hasta que responde el servidor. Mientras falte alguna de las seis,
> el formulario que lo use no se puede enviar.
>
> **Lo que NO entra:**
> - **Las reglas en sí** — las decide QC-19, que está `done`. Aquí solo se muestran.
> - **La pantalla que fija o cambia una contraseña** — va a **QC-36 (cambiar-mi-contrasena)**,
>   creada en el board el 2026-09-02 al acotar esta ficha. Hoy **no existe ninguna pantalla que
>   fije una contraseña**: el login solo verifica. Esta ficha entrega el componente y sus tests;
>   QC-36 es su primer consumidor.
> - **Puntuar la fuerza** de la contraseña (barra de "débil/fuerte"). QC-19 lo descartó
>   explícitamente y esta ficha no lo reabre.
> - **Recuperar la contraseña olvidada** — es de QC-10 y de quien no puede entrar.
>
> **Precondición heredada (no se re-crea aquí):** shadcn/ui inicializado, Tailwind, Vitest +
> Testing Library, y `components/ui/{input,label,button}.tsx`, todo montado por QC-10 y QC-11.
> De QC-19 se heredan `CREDENTIAL_RULES` (siete códigos estables, independientes del idioma) y
> `evaluateCredentialRules` — **pura, síncrona y usable en el navegador**.
>
> Sembrado por `/afinar-feature` el 2026-09-02. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

_Pendiente: los escribe spec_author (F1.2)._

## Preguntas abiertas

1. **Quién decide el texto en español de cada código.** Los siete códigos de `CREDENTIAL_RULES`
   (`min_length`, `max_length`, `no_uppercase`, `no_lowercase`, `no_digit`, `no_symbol`,
   `breached`) son deliberadamente independientes del idioma: QC-19 dejó dicho que «el mensaje que
   ve una persona lo compone la UI (QC-21)». Ninguna ficha dice **cuál** es ese texto ni si el
   producto va a ser multi-idioma. El spec lo hereda como abierto.
2. **Si el campo lleva el botón de mostrar/ocultar la contraseña escrita.** No lo cubre ni esta
   ficha ni QC-30 (rediseño del login). Si entra, entra aquí; si no, hay que decir dónde.
3. **Cómo se anuncia el cambio a quien usa lector de pantalla.** Una lista que cambia de estado a
   cada pulsación puede volverse ruidosa. El repo no tiene precedente de decisión de
   accesibilidad, así que no se hereda nada.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-09-02 | Hoy no existe ninguna pantalla que fije o cambie una contraseña. ¿Dónde vive la ayuda? | **Solo el componente reutilizable, con sus tests.** Se crea en el board **QC-36 — cambiar-mi-contrasena** como su primer consumidor, con el link *is blocked by* QC-21. Se asume el coste: hasta que QC-36 se haga, el componente no lo ve nadie — la misma deuda que ya arrastran los 5 ítems del sidebar de QC-11. |
| 2026-09-02 | La regla de contraseñas filtradas necesita un diccionario de 1,63 MiB que solo vive en el servidor. ¿Qué hace la ayuda con ella? | **Se muestra en la lista, en estado neutro, y solo se resuelve al enviar.** Las otras seis se marcan en vivo. **Sin red mientras se escribe** y sin arrastrar el diccionario al navegador: no se consulta al servidor por pulsación ni se añade endpoint. |
| 2026-09-02 | ¿La ayuda impide enviar el formulario mientras falten requisitos? | **Sí, bloquea el envío** mientras falte alguna de las **seis comprobables en vivo**. Consecuencia aceptada: como la de filtradas no se resuelve hasta enviar, **el bloqueo es parcial** — con las seis en verde el botón se activa aunque la contraseña esté filtrada, y el rechazo llega del servidor. El spec tiene que describir ese estado, no darlo por imposible. |
| 2026-09-02 | ¿Hace falta E2E en navegador real? | **No, y se difiere aquí con motivo.** `CHECKPOINTS.md` lo pide para flujos críticos (autenticación, permisos, importes): esto es ayuda visual y no decide si se entra ni si se guarda. Lo cubren los tests de componente. Cuando exista QC-36, el E2E del flujo de cambio es de esa ficha. |
| 2026-09-02 | ¿El componente redeclara las reglas para poder evaluarlas en el navegador? | **No.** Consume `CREDENTIAL_RULES` y `evaluateCredentialRules` de QC-19, que son puras y síncronas justo para esto. Heredado de la deuda que dejó escrita QC-19: «una segunda copia es exactamente lo que "la regla vive en el dominio" vino a impedir». |
| 2026-09-02 | ¿Se puntúa la fuerza de la contraseña? | **No.** Heredado de QC-19, que lo descartó al elegir instalar solo el diccionario y no `@zxcvbn-ts/core`. Si algún día hace falta, es ficha nueva. |
