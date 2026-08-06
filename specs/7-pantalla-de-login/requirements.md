# Feature 7 — pantalla-de-login · requirements.md

> Zona: `frontend` · Complejidad: `low` · `depends_on`: null · Rama: `feature/7-pantalla-de-login`
> Alcance: **maquetación** de la pantalla pública de login y sus estados (vacío, enviando,
> error, éxito). La autenticación real llega en la feature 10; aquí se fija el contrato.
>
> **Revisión 2026-08-06** tras respuesta humana: el error de credenciales se muestra por
> **toast**, no por alerta inline (R11, R16, R21); se añade el enlace «¿Olvidaste tu
> contraseña?» (R22); el runner de tests entra en el alcance de esta feature; la pantalla
> lleva la marca «QuimiCloude» (R23).

## Glosario

- **Intento de login**: envío del formulario con los campos `username` y `password`.
- **Forma válida**: ambos campos presentes y no vacíos tras recortar espacios.
- **Credenciales no aceptadas**: resultado negativo del punto de verificación de
  credenciales, sea cual sea su causa.
- **Mensaje genérico**: un único texto de error que no distingue si falló el usuario o la
  contraseña.
- **Toast**: notificación transitoria superpuesta, no anclada al formulario.
- **Error de campo**: mensaje de validación de un campo concreto (p. ej. «obligatorio»),
  que se muestra **inline** bajo su input. No es el mensaje genérico.

## Requisitos (EARS)

### Estructura y estado vacío

**R1** — El sistema DEBE exponer una pantalla de login accesible en la ruta `/login` sin
requerir sesión previa.

**R2** — La pantalla de login DEBE presentar, dentro de un único elemento `<form>`, un
campo de usuario con etiqueta visible, un campo de contraseña con etiqueta visible y su
contenido enmascarado, y un botón de envío.

**R3** — MIENTRAS no se haya producido ningún intento de login, el sistema DEBE mostrar el
formulario sin ningún mensaje de error visible, sin toast, y con ambos campos vacíos.

**R4** — El sistema DEBE asociar cada etiqueta con su campo de forma programática, de modo
que activar la etiqueta enfoque el campo correspondiente.

**R23** — La pantalla de login DEBE mostrar la marca del producto («QuimiCloude») como
encabezado de la tarjeta de login.

### Envío

**R5** — CUANDO el usuario envía el formulario, el sistema DEBE ejecutar la operación de
login con los valores de usuario y contraseña introducidos.

**R6** — MIENTRAS un intento de login está en curso, el sistema DEBE mantener el botón de
envío deshabilitado, de forma que un segundo envío no pueda dispararse desde ese botón.

**R7** — MIENTRAS un intento de login está en curso, el sistema DEBE indicar visualmente y
de forma accesible que el envío está en progreso.

**R8** — CUANDO un intento de login termina sin haber autenticado al usuario, el sistema
DEBE volver a habilitar el botón de envío para permitir un nuevo intento.

### Validación de entrada (inline, no toast)

**R9** — SI el usuario envía el formulario con el campo de usuario vacío, o con el campo de
contraseña vacío, o con ambos vacíos, ENTONCES el sistema DEBE rechazar el envío sin
intentar verificar credenciales y mostrar un error de campo en cada campo vacío.

**R10** — CUANDO se muestra un error de campo, el sistema DEBE mostrarlo **inline bajo el
campo afectado**, marcar ese campo como inválido de forma accesible y vincular el mensaje al
campo.

### Error de credenciales (toast)

**R11** — SI las credenciales enviadas no son aceptadas, ENTONCES el sistema DEBE mostrar el
mensaje genérico como **notificación toast**.

**R12** — El mensaje genérico de credenciales DEBE ser idéntico con independencia de si el
usuario no existe o de si la contraseña es incorrecta, y NO DEBE mencionar cuál de los dos
datos falló.

**R21** — CUANDO un intento de login es rechazado, el sistema DEBE emitir exactamente **un**
toast por intento: NO DEBE emitirlo al montar la pantalla, ni volver a emitirlo en
re-renderizados posteriores que no correspondan a un intento nuevo.

**R13** — CUANDO se rechaza un intento de login, el sistema DEBE conservar en el campo de
usuario el valor que el usuario había escrito en ese intento.

**R14** — CUANDO se rechaza un intento de login, el sistema DEBE dejar el campo de
contraseña vacío.

**R15** — El sistema NO DEBE incluir la contraseña introducida en el resultado devuelto por
la operación de login ni en el marcado renderizado tras el intento.

**R16** — CUANDO se emite el toast de error de credenciales, el sistema DEBE anunciarlo a
tecnologías de asistencia mediante una región live, sin requerir que el foco se mueva a la
notificación.

### Éxito

**R17** — SI las credenciales enviadas son aceptadas, ENTONCES el sistema DEBE llevar al
usuario a la ruta del dashboard (`/dashboard`) y NO DEBE emitir ningún toast de error.

### Recuperación de contraseña (solo maquetación)

**R22** — La pantalla de login DEBE mostrar un enlace de recuperación de contraseña,
navegable por teclado y con nombre accesible, que apunte a la ruta de recuperación
acordada.

### Alcance de maquetación

**R18** — MIENTRAS la verificación real de credenciales no esté disponible, el sistema DEBE
tratar todo intento de login con forma válida como credenciales no aceptadas.

**R19** — La pantalla de login NO DEBE realizar ninguna lectura ni escritura en base de
datos, ni emitir cookie de sesión.

### Robustez del formulario

**R20** — El sistema DEBE mantener el formulario funcional como formulario HTML real: cada
campo con su atributo `name`, y el envío disparándose por el `<form>` (incluido pulsar
Enter dentro de un campo), no por un manejador ligado exclusivamente al clic del botón.

## Preguntas abiertas

1. **Destino del enlace de recuperación de contraseña (R22).** Ninguna feature del backlog
   cubre la recuperación de contraseña, así que la ruta destino no existe ni se crea aquí.
   Ver supuesto **S6** en `design.md`: se maqueta apuntando a `/recuperar-contrasena` y hoy
   devuelve 404. Hay que confirmar el slug definitivo (`/recuperar-contrasena` vs
   `/forgot-password` vs `#`) y dar de alta la feature que lo implemente.
2. **¿Los errores de campo también deberían ir a toast?** La decisión humana del 2026-08-06
   nombró sólo el mensaje genérico de credenciales. Se mantienen **inline** (R10) y no se
   asume lo contrario. Confirmar si se quería mover todo.
3. **E2E de éxito.** ¿Se acepta diferir el E2E del camino feliz completo (login → dashboard
   real) a la feature 10, cubriendo aquí sólo el destino de la redirección? Ver T13 de
   `tasks.md`.
4. **¿Hay «recordarme» o «registrarme»?** La descripción no los menciona y no se
   implementan. Confirmar que la ausencia es intencional (el de «olvidé mi contraseña» ya
   quedó confirmado y es R22).
5. **Modo oscuro.** `app/globals.css` ya trae `prefers-color-scheme: dark`. ¿La pantalla
   debe soportarlo explícitamente o basta con los tokens por defecto de shadcn/ui? Afecta
   además al `<Toaster />`, cuyo tema en shadcn se suele enganchar a `next-themes` —
   paquete que **no está instalado** en este repo (ver `design.md > 5.3`).

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
| --- | --- | --- |
| 2026-08-06 | Runner de tests | Vitest + Testing Library + script `test` entran en el alcance de la feature 7 |
| 2026-08-06 | Route group de `/login` | `app/(public)/login/` |
| 2026-08-06 | Copy y marca | Copy provisional aprobada; la pantalla lleva la marca «QuimiCloude» (R23). Los tests siguen sin afirmar sobre literales: roles ARIA, `data-testid` y constantes exportadas |
| 2026-08-06 | Presentación del error de credenciales | Toast de shadcn/ui, no `Alert` inline (R11, R16, R21) |
| 2026-08-06 | Enlace «¿Olvidaste tu contraseña?» | Se maqueta (R22); la ruta destino no se crea |
| 2026-08-06 | `/dashboard` | No existe todavía (feature 9); esta feature no la crea (supuesto S1 de `design.md`) |
