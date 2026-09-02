# QC-30 — rediseno-login · requirements.md

> **Zona:** `frontend` · **Complejidad:** `medium` · **depends_on:** `QC-29` ·
> **Rama:** `feature/QC-30-rediseno-login`
>
> **Alcance.** Vestir la pantalla de login con el lenguaje visual de la aplicación: tarjeta
> flotante de **vidrio esmerilado** sobre un fondo de agua con **tres burbujas** lentas, con los
> tokens de color que definió **QC-29** en los dos modos; campos y botón a **44 px**, tarjeta de
> **400 px** con radio 18 px y padding 28 px; y la tarjeta **adaptada a móvil**. Los valores
> exactos viven en `design-input-login.md`, en esta misma carpeta.
>
> **Lo que NO entra.** Controles que hoy no existen —mostrar/ocultar contraseña, «recordarme»,
> ilustración lateral—: son alcance nuevo y no tienen ficha. Cerrar el hueco de accesibilidad del
> aviso de credenciales (una región `aria-live` en la tarjeta): otra ficha, sin crear. Tocar la
> Server Action, la verificación de credenciales o el contrato de estados del formulario.
>
> Sembrado por `/afinar-feature` el 2026-09-02. El bloque de Alcance y la tabla de
> «Decisiones cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los
> reabre y no los reescribe: su trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

_Pendiente: los escribe spec_author (F1.2)._

## Preguntas abiertas

No se rellenan con supuestos (regla 6 de `CLAUDE.md`).

1. **Degradación del vidrio esmerilado.** `backdrop-filter` no está en todos los navegadores ni
   en todos los modos de ahorro. No se decidió qué se ve cuando falta: un color sólido
   equivalente o el fondo tal cual. Lo resuelve el diseño de esta ficha.
2. **¿Basta la prueba de extremo a extremo que ya existe para el login?** El flujo es crítico
   (`CHECKPOINTS.md`), pero esta ficha no cambia comportamiento. Queda por decidir si se amplía
   con una aserción visual o de medidas, o si se deja como está.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
| --- | --- | --- |
| 2026-09-02 | ¿A quién aplican los 44 px de alto? | **Solo a la pantalla de login.** El resto de la aplicación se queda en 32 px. La regla se acota al login, **fuera de `@layer`** y **sin editar `components/ui/`** — precedente de **QC-29** (`specs/QC-29-tema-claro-oscuro/design.md > 6`): dentro de `@layer base` pierde contra las utilidades y el test sale verde en falso |
| 2026-09-02 | ¿Entra la vista móvil? | **Sí.** La tarjeta se adapta al teléfono. El artboard existe pero **lo dibujó la sesión de diseño por criterio propio, no el humano**: entra porque el humano lo decidió hoy al acotar, no porque el canvas lo trajera |
| 2026-09-02 | Anatomía de la pantalla | **No cambia**: tarjeta centrada, campos Usuario y Contraseña, botón de envío, y el enlace de recuperación en el pie de la tarjeta y fuera del formulario |
| 2026-09-02 | Mecánica del formulario | **No se toca.** `<form action>` con campos **no controlados** y `useFormStatus`. El prototipo del canvas usa campos controlados y un `setTimeout`: es un prototipo. **Se copia la piel, no la mecánica.** El comentario de `login-form.tsx` sobre el `key` del campo de usuario sigue siendo válido |
| 2026-09-02 | El copy | **Desde constantes** (`GENERIC_CREDENTIALS_ERROR`, `REQUIRED_FIELD_ERROR`), nunca literales: los tests afirman sobre ellas |
| 2026-09-02 | El error de credenciales | Sigue siendo **genérico y único**, por notificación, sin decir cuál de los dos campos falló. Se re-colorea, no se cambia |
| 2026-09-02 | Los cuatro estados del formulario | Se conservan tal cual: reposo, error de campo, enviando, y credenciales incorrectas por notificación |
| 2026-09-02 | Cuántas burbujas y a qué velocidad | **Tres**, grandes, **17–19 s** por ciclo. Se bajó de 16 a 3 a propósito: `backdrop-filter` sobre una capa animada obliga al navegador a recomponer cada fotograma. Si el diseño propone más, tiene que decir por qué |
| 2026-09-02 | Las burbujas y la accesibilidad | **Decorativas**: `aria-hidden` y `pointer-events: none`, no alcanzables por lector de pantalla ni por tabulación. **Desaparecen** con animaciones reducidas en el sistema |
| 2026-09-02 | Medidas que coinciden y no se tocan | Radio de campo y botón (`rounded-lg`, 10 px), anillo de foco de 3 px (`focus-visible:ring-3`) y la tipografía (Geist) |
| 2026-09-02 | Landmarks | El `<main>` de la página de login sigue siendo **el único** landmark `main` de la zona pública: la composición nueva no introduce un segundo |
| 2026-09-02 | Los dos modos | La pantalla se pinta con los tokens de **QC-29** en claro y en oscuro. No se define paleta nueva |
| 2026-09-02 | Colisión con trabajo vivo | `app/globals.css` lo está tocando en paralelo una rama **sin ficha** (`feature/fix-ajuste-sidebar`, bloque del panel flotante, líneas 148-156). Acuerdo entre sesiones: **bloques separados, nadie reordena ni reindenta el archivo, y quien vaya a tocar líneas del otro avisa antes de escribir** |
| 2026-09-02 | Librería nueva | **Ninguna.** Es CSS y composición de componentes que ya existen. Regla 7 de `CLAUDE.md` sin propuesta que abrir |
