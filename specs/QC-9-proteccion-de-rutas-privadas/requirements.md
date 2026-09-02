# QC-9 — proteccion-de-rutas-privadas · requirements.md

> **Zona:** `backend` · **Complejidad:** `high` · **depends_on:** `QC-8`, `QC-15` ·
> **Rama:** `feature/QC-9-proteccion-de-rutas-privadas`
>
> **Alcance.** El portero. Un `middleware.ts` que protege **por convención** todo lo que cuelga
> de `app/(private)/`, valida la sesión **de verdad** —firma y caducidad, no solo que la cookie
> exista— y redirige en los dos sentidos. Incluye **migrar el firmado de sesión de QC-8 de
> `node:crypto` a WebCrypto** para que exista **una sola** implementación del HMAC, válida en Node
> y en el borde, y **sin cambiar el formato del token**. Y, antes de escribir `middleware.ts`,
> ampliar las dos guardias a los `.ts` de primer nivel del repo.
>
> **Lo que NO entra.** La costura de UI —que el formulario de login autentique de verdad, que el
> layout privado muestre el usuario real y que su cerrar sesión funcione—: va a **QC-13**. Las
> reglas concretas de rol por ruta: las trae la ficha de cada módulo (la primera será la pantalla
> de productos, solo Administrador). Tampoco entra la revocación de sesiones, que es **QC-23**.
>
> Sembrado por `/afinar-feature` el 2026-09-02. El bloque de Alcance y la tabla de
> «Decisiones cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los
> reabre y no los reescribe: su trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

_Pendiente: los escribe spec_author (F1.2)._

## Preguntas abiertas

Ninguna. Las dos que abrió la acotación se cerraron el mismo día y están abajo (D9 y D10).

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
| --- | --- | --- |
| 2026-09-02 | ¿Cómo comprueba el middleware la sesión, si el borde no tiene `node:crypto`? | **La firma migra a WebCrypto (`crypto.subtle`)**, que existe en Node y en el borde, y el middleware **valida de verdad**: firma y caducidad. Se descartan las otras dos salidas: verificar solo la existencia de la cookie (deja pasar una caducada o falsificada hasta la página) y correr el middleware en runtime Node (sale del camino por defecto y cuesta en cada navegación) |
| 2026-09-02 | ¿Cuántas implementaciones del HMAC quedan? | **Una sola, en todo el repositorio.** Es R5 de QC-8 y la razón de ser de esta decisión: el middleware era el candidato número uno a convertirse en la segunda |
| 2026-09-02 | ¿La migración puede cambiar el formato del token? | **No.** Mismo formato, mismo algoritmo, misma codificación: **las sesiones ya emitidas siguen valiendo**. Es además la mejor red para tocar código ajeno — los tests de QC-8 deben seguir verdes **byte a byte**, sin reescribir sus vectores |
| 2026-09-02 | ¿Qué rutas se protegen? | **Por convención: todo lo que cuelga de `app/(private)/`.** Una pantalla nueva queda protegida **por nacer ahí**, sin tocar el middleware ni acordarse de una lista. Se descarta la lista explícita: olvidar una entrada no rompe ningún test, simplemente deja la pantalla abierta |
| 2026-09-02 | ¿Se vuelve a la ruta pedida tras entrar? | **Sí.** Quien pide una pantalla concreta sin sesión aterriza en ella después de entrar, no en el dashboard |
| 2026-09-02 | ¿Y el riesgo de redirector abierto? | **La ruta de vuelta se valida como interna**, siempre. Sin eso, un enlace fabricado sacaría al usuario del ERP justo después de autenticarse, que es el agujero clásico de este patrón |
| 2026-09-02 | ¿Y si tiene sesión pero no acceso a esa ruta? | **Va al dashboard, no al login.** «No autorizado» no es «no autenticado»: mandarlo al login le haría creer que su sesión caducó y reintentaría en bucle |
| 2026-09-02 | ¿Quién comprueba ese permiso? | **El middleware**, que es quien decide si devuelve al usuario a la ruta pedida. O sea que el gancho de reglas ruta→rol **se construye en esta ficha**, aunque hoy no haya ninguna regla que aplicar |
| 2026-09-02 | ¿Y el login con sesión válida? | **Redirige al dashboard.** El login sigue siendo público para quien no tiene sesión |
| 2026-09-02 | Frontera con QC-13 | **QC-9 es el portero** (middleware, validación y redirecciones). **QC-13 es la costura de UI** (el formulario autentica de verdad, el layout muestra al usuario real, su cerrar sesión funciona). Sin solape: una es servidor, la otra es UI |
| 2026-09-02 | Las guardias no ven la raíz del repo | **Se amplían `PRODUCTION_DIRS` (`guard-firma-sesion-unica`) y `SCAN_ROOTS` (`guard-arquitectura-modulos`) a los `.ts` de primer nivel ANTES de escribir `middleware.ts`.** Hoy las dos barren solo `lib`, `app`, `components` y `hooks`, así que un `createHmac` propio en la raíz **pasa el gate en verde** — verificado por el reviewer de QC-8 creando el archivo y borrándolo. Encargo ya anotado en `progress/current.md`; R5 dice «en el repositorio», no «en `lib/`» |
| 2026-09-02 | `docs/architecture.md` deja de ser cierto | **Hay que actualizarlo.** `> Permisos y autenticacion` dice hoy que el middleware «verifica existencia de cookie de sesión», y esta ficha lo cambia a validación real. Es el documento que el `reviewer` usa para juzgar: si no se actualiza, la implementación correcta se leerá como una desviación |
| 2026-09-02 | Módulo propietario | **`identity`.** El middleware es un adaptador driving de ese módulo; la lógica de validar la sesión vive en su dominio, no en el archivo de Next (**QC-15**, y `CHECKPOINTS.md > Modulos hexagonales`: «la lógica de negocio está en `domain/`, no en la Server Action» — aquí, no en el middleware) |
| 2026-09-02 | Librería nueva | **Ninguna.** WebCrypto es API estándar de la plataforma, no una dependencia. Regla 7 de `CLAUDE.md` sin propuesta que abrir |
