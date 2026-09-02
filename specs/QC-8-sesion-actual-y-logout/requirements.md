# QC-8 — sesion-actual-y-logout · requirements.md

> **Zona** `backend` · **Complejidad** `medium` · **depends_on** `QC-7`, `QC-15`
> **Rama** `feature/QC-8-sesion-actual-y-logout`
>
> **Alcance.** Leer en cada petición la cookie de sesión que QC-7 dejó escrita, verificar su
> firma y su caducidad, y resolver quién es el usuario y cuál es su rol — o que no hay sesión.
> Y cerrar sesión: retirar la cookie desde el servidor y devolver al login.
>
> **Lo que NO entra.** La protección de rutas y el `middleware.ts` que corta antes de renderizar
> son **QC-9**. La invalidación real de un código de sesión ya copiado, y el «cerrar sesión en
> todos mis dispositivos», son **QC-23 — Registro de sesiones y cierre en todos los
> dispositivos** (creada el 2026-09-02, bloqueada por esta ficha). No hay trabajo de UI: el botón
> de cerrar sesión ya existe desde QC-11 (`components/private/nav-user.tsx`) y su Server Action
> tiene la firma congelada.
>
> Sembrado por `/afinar-feature` el 2026-09-02. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

_Pendiente: los escribe spec_author (F1.2)._

## Preguntas abiertas

1. **Resolver el usuario dos veces en la misma petición.** El layout privado lo resuelve, y el
   `middleware.ts` de QC-9 va a necesitarlo también. Si acaban siendo dos consultas por página,
   ¿se memoiza por petición? Se deja a `spec_author` y a QC-9; no condiciona el alcance.
2. **`roleName` nunca será `null` en QC-8.** El rol es obligatorio en la base (`users.role_id`
   `NOT NULL` con `ON DELETE RESTRICT`), así que esa rama del tipo `SessionUser` —que QC-11
   congeló como anulable— no se ejercita. No se cambia el tipo; queda anotado para que nadie
   escriba un test que no puede fallar.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-09-02 | ¿Cerrar sesión invalida un código de sesión ya copiado? | **No.** El servidor retira la cookie de ese navegador y nada más; una copia robada sigue valiendo hasta su caducidad (8 h). Riesgo asumido: exige un robo previo, es reversible y hay salida de emergencia real (ver la decisión siguiente). La invalidación de verdad es **QC-23**, bloqueada por esta ficha. |
| 2026-09-02 | ¿Sigue dentro un empleado dado de baja, o uno al que le cambiaron el rol? | **No.** El usuario se resuelve contra la base en cada petición; si no está activo (`deleted_at`) se trata como **sin sesión** y vuelve al login en su siguiente clic. El rol que se aplica es **siempre el actual**, nunca el que tenía al entrar. No cuesta nada: la consulta ya hace falta para el nombre y el rol. |
| 2026-09-02 | ¿Qué nombre se muestra en la barra lateral? | **Primer nombre + primer apellido** — `first_names` «Ana María» y `last_names` «Pérez Gómez» dan **«Ana Pérez»**, iniciales **«AP»**. Cabe sin recortarse y es el trato del día a día. |
| 2026-09-02 | ¿Qué hace la zona privada si no hay sesión válida? | **Redirige al login ya en QC-8.** Evita la ventana entre QC-8 y QC-9 en la que entrar sin sesión rompería la página. QC-9 añade después el corte en `middleware.ts`, que es anterior y más barato, sin deshacer esto. |
| 2026-09-02 | ¿Lleva prueba en navegador real? | **Sí, en QC-8.** Entrar, comprobar el nombre real en la barra, cerrar sesión, comprobar el retorno al login y que no se vuelve atrás. Playwright ya está montado desde QC-7. |
| 2026-09-01 | Formato del valor de la cookie | **Heredado de QC-7 `design.md > 5.1`, congelado:** `v1.<payload-base64url>.<hmac-base64url>`, con `sub` / `iat` / `exp`. La verificación reutiliza `signSessionValue()`, que QC-7 exporta a propósito, y compara en tiempo constante (`timingSafeEqual`). QC-8 no reimplementa la firma. |
| 2026-09-01 | Caducidad | **Heredada de QC-7 (D10):** 8 h absolutas desde la emisión, sin renovación deslizante y sin «recordarme». Se comprueba sobre el `exp` **firmado**, no sobre el `Max-Age`, que lo controla el navegador. |
| 2026-09-01 | Atributos y manejo de la cookie | **Heredados de QC-7 `design.md > 5.2` (D3):** `qc_session`, `httpOnly`, `sameSite: lax`, `secure` en producción, `path: /`. La pone y la quita **solo el servidor**; el JavaScript del navegador no puede leerla ni borrarla. |
| 2026-08-06 | Tipo `SessionUser` | **Congelado por QC-11:** `id`, `username`, `displayName`, `roleName`. `displayName` y `roleName` llegan ya resueltos como texto mostrable; la UI no compone nombres ni traduce roles. |
| 2026-08-06 | Firma de `logoutAction()` | **Congelada por QC-11:** sin parámetros y sin valor de retorno. QC-8 le añade el `redirect` al login sin tocar la firma. |
| 2026-09-01 | Capas | **Heredado de QC-15:** la lectura de la cookie es un **adaptador driven** detrás del puerto `SessionProvider`; el cableado vive solo en `lib/composition/index.ts`. El dominio decide qué es una sesión válida; el adaptador sabe cómo viaja. |
| 2026-08-06 | Idioma de los identificadores y borrado lógico | **Heredados de QC-4:** identificadores de base en inglés; «usuario dado de baja» es `deleted_at`, no una fila borrada. |
