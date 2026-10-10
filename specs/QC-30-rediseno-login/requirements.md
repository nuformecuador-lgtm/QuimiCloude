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

Notación EARS (`docs/specs.md`). **«El sistema»** aquí es la **pantalla pública de login**:
`app/(public)/login/` (página y componentes de ruta) más las reglas de estilo que la visten en
`app/globals.css`. Esta ficha es de **piel**: no hay modelo de datos, ni endpoint, ni Server
Action nueva, así que ningún requisito habla de persistencia ni de autorización.

Los **valores exactos** (alfas del degradado, sombras, tamaños y tiempos de las burbujas) no se
repiten aquí: viven en `design-input-login.md`, en esta misma carpeta, y los requisitos los
citan por sección. Duplicarlos garantizaría que un día dejaran de coincidir.

### Anatomía y mecánica que no cambian

**R1.** El sistema DEBE presentar una tarjeta centrada en el alto de la ventana que contenga, en
este orden: el título de la aplicación, el campo **Usuario** con su etiqueta, el campo
**Contraseña** con su etiqueta, el botón de envío, y —en el pie de la tarjeta y **fuera** del
elemento `<form>`— el enlace de recuperación de contraseña.

> **ENMIENDA DEL 2026-10-08 (QC-226).** El título de la aplicación pasa a ser el logo vertical para fondo
> oscuro dentro de un único `h1` con nombre accesible `BRAND_LABEL`, sin título de texto visible
> (QC-226 D9, R16). El resto de la anatomía y el enlace fuera del `<form>` siguen (QC-226 R23).

**R2.** El sistema DEBE enviar las credenciales mediante un elemento `<form>` con atributo
`action`, con los campos de usuario y contraseña **no controlados**, y NO DEBE mantener el valor
de esos campos en estado de React, ni registrar un manejador de envío propio, ni simular el
envío con un temporizador.

**R3.** MIENTRAS el envío del formulario está en curso, el sistema DEBE mostrar el botón de
envío deshabilitado, marcado como ocupado para tecnologías de asistencia y con su texto de
espera, derivando ese estado **únicamente** del estado del formulario ancestro (`useFormStatus`)
y no de estado local ni de props.

**R4.** CUANDO un intento de acceso falla y el formulario se vuelve a renderizar, el sistema
DEBE volver a mostrar en el campo de usuario el nombre escrito, DEBE dejar el campo de
contraseña vacío, y NO DEBE emitir advertencias de consola por cambio de valor inicial en un
campo no controlado.

**R5.** El sistema DEBE tomar el texto del error de credenciales y el del campo obligatorio de
las constantes exportadas `GENERIC_CREDENTIALS_ERROR` y `REQUIRED_FIELD_ERROR`, y NO DEBE
declarar en la pantalla de login ningún literal equivalente a esos mensajes.

**R6.** SI las credenciales no son válidas, ENTONCES el sistema DEBE mostrar **un único** aviso
por notificación con el mensaje genérico, y ese aviso NO DEBE indicar cuál de los dos campos
falló ni si el usuario existe.

**R7.** El sistema DEBE seguir distinguiendo los cuatro estados del formulario —reposo, error de
campo mostrado bajo el campo afectado, envío en curso y credenciales incorrectas por
notificación— y, MIENTRAS un campo tiene error, DEBE marcarlo como inválido y asociarlo a su
mensaje para tecnologías de asistencia.

**R8.** El sistema NO DEBE modificar la Server Action de acceso, el contrato de estados del
formulario ni la verificación de credenciales.

### Vidrio esmerilado

**R9.** DONDE el navegador soporta el desenfoque de fondo, el sistema DEBE pintar la tarjeta
**translúcida y desenfocada**, con el filo de 1 px y el brillo interior superior, usando los
valores de `design-input-login.md > 3` para el modo claro y para el modo oscuro.

> **ENMIENDA DEL 2026-10-08 (QC-226).** El vidrio se recolorea: la tarjeta usa el fondo, la sombra y el
> desenfoque de QC-226 R20, los mismos en los dos temas, porque el login se pinta siempre con los
> tokens oscuros (QC-226 R17). Siguen el prefijo `-webkit-` (R10) y la base opaca con `--card` (R11).

**R10.** El sistema DEBE declarar el desenfoque de fondo **también con el prefijo `-webkit-`**
junto a la propiedad estándar, de modo que el motor de WebKit aplique el desenfoque y la tarjeta
nunca quede translúcida sin desenfocar.

**R11.** SI el navegador no soporta el desenfoque de fondo, O el usuario ha pedido transparencia
reducida en su sistema, ENTONCES el sistema DEBE pintar la tarjeta con un **fondo opaco
equivalente** —el color de tarjeta del modo activo—, conservando su filo, su sombra y el
contraste de su texto, y NO DEBE dejarla translúcida sobre el fondo animado.

### Fondo animado

**R12.** El sistema DEBE pintar **exactamente tres** burbujas en una capa situada **bajo** la
tarjeta, con los tamaños, posiciones, duraciones (17–19 s por ciclo), derivas, escalas, retardos
negativos y opacidades de `design-input-login.md > 4`, y con el relleno propio de cada modo.

> **ENMIENDA DEL 2026-10-08 (QC-226).** Las burbujas salen. En su lugar van exactamente tres isotipos
> decorativos («moléculas») con los tamaños, posiciones y opacidades de QC-226 R18, animados con
> ciclos de 22, 30 y 26 s (QC-226 D10, R19). Siguen siendo decorativos (R13).

**R13.** El sistema DEBE marcar la capa de burbujas como decorativa: oculta para tecnologías de
asistencia, no alcanzable con el tabulador y sin capturar eventos de puntero.

**R14.** MIENTRAS el sistema operativo indica preferencia por movimiento reducido, el sistema NO
DEBE mostrar ninguna burbuja ni ejecutar su animación.

> **ENMIENDA DEL 2026-10-08 (QC-226).** Con movimiento reducido, las moléculas se quedan **visibles y
> quietas**, y la tarjeta entra como mucho con un fundido de 150 ms; la regla se acota al login
> (QC-226 D10, R22).

**R15.** El sistema DEBE exponer exactamente **un** elemento con rol `main` en la página de
login.

### Medidas

**R16.** El sistema DEBE presentar, dentro de la pantalla de login, los campos de texto y el
botón de envío con una altura mínima de **44 px**, y la tarjeta con un ancho máximo de
**400 px**, radio de **18 px** y espaciado interior de **28 px**.

**R17.** El sistema NO DEBE alterar la altura de los campos ni la de los botones, ni el radio ni
el espaciado de las tarjetas, **fuera** de la pantalla de login: el resto de la aplicación
conserva sus 32 px de alto y las medidas de tarjeta de hoy.

**R18.** El sistema DEBE declarar las reglas de estilo nuevas **fuera de toda `@layer`**, de modo
que ganen a las utilidades del framework, y NO DEBE envolverlas en `@layer base` ni en ninguna
otra capa.

**R19.** El sistema NO DEBE modificar ningún archivo de `components/ui/`: las primitivas de
campo, botón y tarjeta conservan intactas sus clases y variantes actuales.

**R20.** El sistema DEBE conservar sin cambios el radio de campo y botón (10 px), el grosor de
3 px del anillo de foco visible y la familia tipográfica actual.

> **ENMIENDA DEL 2026-10-08 (QC-226).** La familia tipográfica pasa de Geist a IBM Plex Sans (QC-226 D4,
> R7), y el radio de campo y botón pasa de 10 px a 8 px al bajar `--radius` a `0.5rem` (QC-226 D3,
> R4).

### Los dos modos y el móvil

**R21.** El sistema DEBE pintar la pantalla de login con los tokens de color definidos por QC-29
en modo claro y en modo oscuro, y NO DEBE redefinir esos tokens ni introducir una paleta de
tokens de color nueva; las variables propias del login derivan de los valores del insumo.

> **ENMIENDA DEL 2026-10-08 (QC-226).** Los tokens de QC-29 quedan sustituidos por los de QC-226 D2. El
> login se pinta con los tokens del **modo oscuro en los dos temas** de la app, mediante un ámbito
> `.dark` en el `main`, y sobre el fondo petróleo de QC-226 R17 (QC-226 D10).

**R22.** MIENTRAS la ventana es angosta, el sistema DEBE mostrar la tarjeta ocupando el ancho
disponible hasta el máximo de 400 px, sin desbordar horizontalmente ni provocar barra de scroll
lateral, y DEBE usar los valores móviles de las burbujas de `design-input-login.md > 4`.

> **ENMIENDA DEL 2026-10-08 (QC-226).** Los valores móviles de las burbujas quedan sin objeto, porque las
> burbujas salen (QC-226 R18). El ancho fluido hasta 400 px sigue (QC-226 R23, D20).

**R23.** El sistema DEBE medir el alto de la pantalla con la unidad de viewport dinámica, DEBE
presentar los campos con tamaño de letra de al menos 16 px en viewport angosto y DEBE mantener
todo destino táctil de la pantalla en 44 × 44 px como mínimo.

### Convivencia y verificación

**R24.** El sistema DEBE añadir sus reglas a `app/globals.css` en **un bloque propio, contiguo y
delimitado por comentarios**, y NO DEBE reordenar, reindentar, mover ni modificar ninguna regla
ya existente del archivo, incluidas las del panel flotante de la barra lateral.

**R25.** El sistema NO DEBE incorporar ninguna dependencia de terceros nueva para cumplir los
requisitos anteriores.

**R26.** El sistema DEBE demostrar en navegador real, en Chromium y en WebKit, el alto computado
de campo y botón, el carácter decorativo de las burbujas y su ausencia bajo preferencia de
movimiento reducido; y DEBE conservar verdes, sin editar sus aserciones de comportamiento, las
pruebas de extremo a extremo del flujo de acceso que ya existen.

> **ENMIENDA DEL 2026-10-08 (QC-226).** La comprobación de «sin burbujas con movimiento reducido» pasa a
> «moléculas quietas y visibles» (QC-226 R22). El resto de R26 sigue.

### Cobertura de las decisiones cerradas

Cada fila de `## Decisiones cerradas (no reabrir)`, en el orden en que está escrita, con el o los
requisitos que la hacen testeable. Ninguna queda sin `R<n>`.

| # | Decisión cerrada | Requisito(s) |
| --- | --- | --- |
| 1 | Los 44 px solo en el login; regla acotada, fuera de `@layer`, sin editar `components/ui/` | R16, R17, R18, R19 |
| 2 | Entra la vista móvil | R22, R23 |
| 3 | La anatomía de la pantalla no cambia | R1 |
| 4 | La mecánica del formulario no se toca (`<form action>`, no controlados, `useFormStatus`, el `key`) | R2, R3, R4, R8 |
| 5 | El copy sale de constantes | R5 |
| 6 | Error de credenciales genérico y único, por notificación | R6 |
| 7 | Los cuatro estados del formulario se conservan | R7 |
| 8 | Tres burbujas, 17–19 s | R12 |
| 9 | Burbujas decorativas; desaparecen con movimiento reducido | R13, R14 |
| 10 | Medidas que coinciden y no se tocan (radio 10 px, anillo 3 px, Geist) | R20 |
| 11 | Un único landmark `main` en la zona pública | R15 |
| 12 | Los dos modos con los tokens de QC-29, sin paleta nueva | R9, R21 |
| 13 | Colisión con `feature/fix-ajuste-sidebar`: bloques separados, nadie reordena | R24 |
| 14 | Ninguna librería nueva | R25 |

Requisitos que no vienen de la tabla: **R10** y **R11** resuelven la pregunta abierta 1 (ver
`design.md > 4`), **R26** resuelve la pregunta abierta 2 (ver `design.md > 8`).

## Preguntas abiertas

No se rellenan con supuestos (regla 6 de `CLAUDE.md`).

1. ~~**Degradación del vidrio esmerilado.**~~ **RESUELTA en `design.md > 4` (2026-09-02).**
   Sin desenfoque de fondo —o con transparencia reducida pedida por el usuario— la tarjeta se
   pinta **opaca** con el color de tarjeta del modo activo, que es exactamente el de hoy. El
   vidrio se declara como mejora progresiva dentro de `@supports`, nunca como base. Queda como
   R9, R10 y R11.
2. ~~**¿Basta la prueba de extremo a extremo que ya existe?**~~ **RESUELTA en `design.md > 8`
   (2026-09-02).** **Se amplía, pero sin tocar `e2e/login.spec.ts`**: las dos pruebas del flujo
   crítico se quedan como están y lo nuevo va en un spec propio, sin datos de base, que mide en
   navegador lo que jsdom no puede computar. Queda como R26.
3. **Deltas móviles de la tarjeta más allá del ancho.** El artboard «Login · móvil» existe, pero
   `design-input-login.md` solo publica valores móviles **de las burbujas**. No consta si en ese
   artboard cambian también el radio, el espaciado interior o el tamaño del título. R22 se
   escribe con lo único que consta —ancho fluido hasta 400 px— y el resto se mantiene igual que
   en escritorio. Si el artboard dice otra cosa, es un ajuste de una línea de CSS y una fila más
   en el test de contrato.
4. **El hueco de accesibilidad del aviso de credenciales.** Sigue abierto y **fuera de alcance**
   por decisión del bloque «Lo que NO entra»: el aviso por notificación se re-colorea, no se
   sustituye. Queda anotado aquí para que la ficha que lo cierre no empiece de cero.

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

> **ENMIENDA DEL 2026-10-08 (QC-226).** QC-226 cita estas decisiones por el número de fila de la tabla de
> «Cobertura de las decisiones cerradas». Quedan enmendadas:
>
> - **D3** (anatomía): el título de texto pasa a ser el logo vertical dentro del `h1` (QC-226 D9).
> - **D8** (tres burbujas, 17–19 s): las burbujas pasan a ser tres moléculas, 22–30 s (QC-226 D10).
> - **D9** (burbujas decorativas que desaparecen con movimiento reducido): las moléculas siguen
>   siendo decorativas, pero se quedan visibles y quietas (QC-226 D10).
> - **D10** (radio 10 px, anillo 3 px, Geist): Geist pasa a Plex (QC-226 D4) y el radio a 8 px
>   (QC-226 D3).
> - **D12** (tokens de QC-29 en los dos modos): tokens de QC-226 D2, y el login siempre en oscuro
>   (QC-226 D10).
