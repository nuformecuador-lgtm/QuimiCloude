# Feature 8 — layout-privado-con-sidebar · requirements.md

> Zona: `frontend` · Complejidad: `medium` · `depends_on`: null · Rama: `feature/8-layout-privado-con-sidebar`
> Alcance: **maquetación** del armazón compartido por las pantallas privadas (barra lateral
> con marca, navegación con submenús, pie de usuario, área de contenido, colapso a modo icono
> en escritorio y panel superpuesto en pantallas angostas). Los datos del usuario entran **por
> props** y el cierre de sesión es un **disparador vacío**; el cableado real llega en la
> feature 10.
>
> **Revisión 2026-08-06** tras respuesta humana a las 10 preguntas abiertas: la navegación
> soporta **ítem simple e ítem con submenú** y se queman **5 ítems de ejemplo** (R6–R13); el
> pie muestra **nombre y rol** con **iniciales** y es un **menú desplegable** (R14–R21); el
> colapso es **doble mecanismo** — modo icono en escritorio (R23–R28) y panel superpuesto en
> angosto (R29–R34), especificados por separado; la marca tiene **versión corta «QC»** (R4,
> R24); **no se monta ningún `<Toaster />`** en la zona privada (R36); el route group se queda
> en `app/(private)/`; el E2E se difiere.
>
> **Revisión 2026-08-06 (b)** tras cerrar las dos últimas preguntas: la **persistencia del
> estado colapsado pasa a ser requisito propio (R28, nuevo)** y el menú de usuario contiene
> **sólo** el cierre de sesión (**D12**). **Renumeración**: los antiguos R28–R35 son ahora
> **R29–R36**. No quedan preguntas abiertas.
>
> **Precondición heredada (no se re-crea aquí):** esta feature se implementa después de que
> la feature 7 esté `done`. Da por hecha su base: shadcn/ui inicializado (`components.json`,
> `lib/utils.ts` con `cn`), Vitest + Testing Library, `components/ui/button.tsx` y
> `lib/types/auth.ts` con `DASHBOARD_ROUTE`. Ver `design.md > 0` y la task **T0** de
> `tasks.md`.

## Glosario

- **Zona privada**: el conjunto de pantallas que se renderizan dentro del layout de esta
  feature (hoy ninguna; la primera es el dashboard de la feature 9).
- **Layout privado**: el armazón compartido por la zona privada — barra lateral + área de
  contenido.
- **Barra lateral**: el panel lateral izquierdo con tres regiones: **marca** (arriba),
  **navegación** (centro) y **pie de usuario** (abajo).
- **Ítem simple**: entrada de navegación que es un enlace directo a una ruta.
- **Ítem con submenú**: entrada de navegación que no navega por sí misma; agrupa **un solo
  nivel** de ítems simples hijos y se expande o colapsa.
- **Ítems de ejemplo**: los 5 ítems quemados en esta feature (3 simples + 2 con submenú). Son
  **datos de relleno (placeholder)**; sus rutas destino **no existen todavía** y la feature
  que traiga cada módulo los sustituye.
- **Usuario de sesión**: la identidad que el layout recibe **por props**. En esta feature es
  un valor de relleno provisto por un stub; en la feature 10 es la sesión real.
- **Menú de usuario**: el menú desplegable anclado al pie de la barra lateral, que contiene el
  cierre de sesión.
- **Disparador de cierre de sesión**: la acción que ejecuta el elemento «cerrar sesión». En
  esta feature no tiene efectos observables (ver R22).
- **Modo icono**: presentación de la barra lateral en **viewport ancho** reducida a iconos,
  sin etiquetas de texto visibles. **Modo expandido**: la presentación por defecto, con
  etiquetas.
- **Viewport angosto**: ancho de viewport **menor que el breakpoint `md` de Tailwind
  (768 px)**. **Viewport ancho**: mayor o igual a ese valor.
- **Panel superpuesto**: la presentación de la barra lateral en **viewport angosto**, encima
  del contenido y en modo modal. No es el modo icono: son dos mecanismos distintos.

## Requisitos (EARS)

### Estructura del armazón

**R1** — El sistema DEBE proveer un layout compartido por todas las pantallas de la zona
privada, de modo que cualquier pantalla añadida a ese grupo de rutas se renderice dentro de
él sin declararlo por su cuenta.

**R2** — El layout privado DEBE presentar una barra lateral con tres regiones identificables
de forma estable e independiente: marca, navegación y pie de usuario.

**R3** — La región de navegación DEBE exponerse como landmark de navegación con nombre
accesible, distinguible de cualquier otro landmark de navegación de la página.

**R4** — La marca del producto DEBE mostrarse en la región superior de la barra lateral y DEBE
ser un enlace, con nombre accesible, cuyo destino es la ruta del dashboard.

**R5** — El layout privado DEBE renderizar el contenido de la pantalla activa dentro de un
landmark `main` único, ocupando el área que no ocupa la barra lateral.

### Navegación: ítems simples y submenús

**R6** — La región de navegación DEBE renderizar exactamente una entrada por cada ítem de la
colección de navegación que recibe, en el mismo orden, y NO DEBE renderizar entradas que no
procedan de esa colección.

**R7** — SI la colección de navegación está vacía, ENTONCES el sistema DEBE renderizar la
región de navegación sin ninguna entrada y sin romper el resto del layout.

**R8** — CUANDO la ruta activa coincide con el destino de un ítem simple, el sistema DEBE
marcar ese enlace —y sólo ese— como el actual de forma accesible.

**R9** — DONDE un ítem de la colección tiene hijos, el sistema DEBE renderizarlo como un
control de expansión con nombre accesible, activable por teclado, que agrupa un enlace por
cada hijo y NO DEBE renderizarlo como enlace navegable.

**R10** — MIENTRAS un submenú está colapsado, el sistema DEBE exponer su control con
`aria-expanded="false"` y NO DEBE exponer los enlaces hijos a tecnologías de asistencia;
MIENTRAS está expandido, DEBE exponerlo con `aria-expanded="true"` y sus enlaces hijos
accesibles.

**R11** — CUANDO el usuario activa el control de un submenú, el sistema DEBE alternar su
estado entre expandido y colapsado.

**R12** — SI la ruta activa coincide con el destino de un enlace hijo, ENTONCES el sistema
DEBE renderizar ese submenú ya expandido y marcar ese enlace hijo como el actual de forma
accesible.

**R13** — Todo destino al que enlace el layout privado DEBE resolverse desde una constante
exportada, no desde un literal incrustado en el marcado.

### Usuario de sesión y cierre de sesión

**R14** — El pie de la barra lateral DEBE mostrar el nombre visible y el rol del usuario de
sesión que el layout recibe por props; SI el rol no viene informado, ENTONCES el sistema DEBE
omitir la línea de rol sin romper el pie.

**R15** — El pie de la barra lateral DEBE mostrar las iniciales derivadas del nombre visible
del usuario como representación gráfica de su identidad.

**R16** — El layout privado y sus componentes NO DEBEN obtener los datos del usuario por su
cuenta: no DEBEN leer cookies de sesión, ni consultar base de datos, ni hacer peticiones de
red; los reciben por props desde su componente padre de servidor.

**R17** — El pie de la barra lateral DEBE ofrecer un menú desplegable cuyo disparador tenga
nombre accesible, sea alcanzable por teclado y declare de forma accesible que abre un menú y
si está abierto.

**R18** — CUANDO el usuario pulsa `Escape` con el menú de usuario abierto, el sistema DEBE
cerrarlo y devolver el foco a su disparador.

**R19** — El menú de usuario DEBE contener el control de cierre de sesión, contenido en un
formulario real cuya acción es el disparador de cierre de sesión.

**R20** — CUANDO el usuario activa el control de cierre de sesión, el sistema DEBE invocar el
disparador de cierre de sesión exactamente una vez por activación.

**R21** — MIENTRAS un cierre de sesión está en curso, el sistema DEBE mantener el control
deshabilitado, de forma que una segunda activación no pueda dispararse desde ese control.

**R22** — MIENTRAS la sesión real no esté disponible, el disparador de cierre de sesión DEBE
completarse sin efectos observables: NO DEBE emitir ni borrar cookies, NO DEBE navegar a otra
ruta, NO DEBE acceder a base de datos ni a la red.

### Mecanismo A — colapso a modo icono (viewport ancho)

**R23** — MIENTRAS el viewport es ancho, el sistema DEBE mostrar la barra lateral de forma
persistente y DEBE ofrecer un control de colapso con nombre accesible que declare el estado de
la barra mediante `aria-expanded` y la referencie mediante `aria-controls`.

**R24** — CUANDO el usuario activa el control de colapso en viewport ancho, el sistema DEBE
alternar la barra lateral entre modo expandido y modo icono, mostrando la versión corta de la
marca en modo icono y la versión larga en modo expandido.

**R25** — MIENTRAS la barra lateral está en modo icono, el sistema DEBE conservar el nombre
accesible de cada entrada de navegación aunque su etiqueta de texto no sea visible.

**R26** — MIENTRAS la barra lateral está en modo icono, el sistema DEBE seguir permitiendo
alcanzar los enlaces hijos de un ítem con submenú a través de su control.

**R27** — MIENTRAS la barra lateral está en modo icono, el pie DEBE seguir ofreciendo el menú
de usuario y su cierre de sesión.

**R28** — CUANDO el usuario alterna entre modo expandido y modo icono en viewport ancho, el
sistema DEBE persistir ese estado, de modo que una navegación posterior o una recarga
presenten la barra lateral en el último modo elegido.

### Mecanismo B — panel superpuesto (viewport angosto)

**R29** — MIENTRAS el viewport es angosto y no ha habido interacción, el sistema DEBE mantener
la barra lateral oculta y mostrar un control de apertura con nombre accesible.

**R30** — CUANDO el usuario activa el control de apertura en viewport angosto, el sistema DEBE
mostrar la barra lateral como panel superpuesto modal y trasladar el foco dentro del panel.

**R31** — MIENTRAS el viewport es angosto, el control de apertura DEBE reflejar el estado del
panel mediante `aria-expanded` y referenciar el elemento que controla mediante
`aria-controls`.

**R32** — CUANDO el usuario pulsa `Escape` con el panel superpuesto abierto, el sistema DEBE
cerrarlo y devolver el foco al control de apertura.

**R33** — CUANDO el usuario activa un enlace de navegación con el panel superpuesto abierto,
el sistema DEBE cerrar el panel.

**R34** — MIENTRAS el viewport es angosto, el sistema NO DEBE aplicar el modo icono: la barra
lateral está oculta o superpuesta con sus etiquetas de texto visibles.

### Alcance de maquetación

**R35** — El layout privado NO DEBE validar la sesión ni proteger el acceso a las rutas
privadas, ni realizar ninguna lectura o escritura en base de datos, ni leer o emitir ninguna
cookie de sesión. La única cookie admitida es la de **preferencia de UI** que exige R28.

**R36** — El layout privado NO DEBE montar ninguna región de notificaciones para la zona
privada.

## Preguntas abiertas

**Ninguna.** Las 10 preguntas de la primera versión y las 2 que quedaban vivas tras la
revisión (a) están todas respondidas y trasladadas a `## Decisiones cerradas` con fecha
2026-08-06. Si aparece una nueva ambigüedad durante la implementación, el `frontend_dev`
**para y la reporta al leader** (regla 6 de `CLAUDE.md`); no se rellena con supuestos.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
| --- | --- | --- |
| 2026-08-06 | Ítems de navegación | La estructura soporta **ítem simple e ítem con submenú de un solo nivel**. Se queman **5 ítems de ejemplo**: Dashboard, Inventario, Notificaciones (simples) + dos con submenú. Son **placeholder**: sus rutas no existen (404 esperado) y la feature que traiga cada módulo los sustituye (**D2**) |
| 2026-08-06 | Profundidad del anidamiento | **Un solo nivel.** Garantizado por el tipo, no por convención (`design.md > 4.3`) |
| 2026-08-06 | Qué se muestra del usuario | **Nombre y rol** (**D3**, R14) |
| 2026-08-06 | Avatar | **Iniciales** derivadas del nombre visible (**D3**, R15) |
| 2026-08-06 | Pie de usuario | **Menú desplegable** con la primitiva `dropdown-menu` de shadcn/ui añadida por CLI, no un botón suelto (**D4**, R17–R19) |
| 2026-08-06 | Entrada de perfil en el menú de usuario | **NO.** El menú contiene **sólo** el cierre de sesión. No hay ruta de perfil en el backlog y no se inventa; si algún día hace falta, lo añade la feature que cree esa ruta (**D12**) |
| 2026-08-06 | Persistencia del estado colapsado | **SÍ**, se persiste entre navegaciones y recargas. Deja de ser «comportamiento por defecto del primitivo» y pasa a ser **requisito propio con test** (**D13**, R28). La cookie que lo soporta es **preferencia de UI, no sesión** (`design.md > 5.5`), y por eso R35 la admite explícitamente |
| 2026-08-06 | Colapso | **Dos mecanismos separados**: modo icono en viewport ancho (R23–R28) y panel superpuesto en angosto (R29–R34) (**D5**) |
| 2026-08-06 | Breakpoint de «angosta» | `md` de Tailwind, **768 px** (**D6**) |
| 2026-08-06 | Marca | Texto largo «QuimiCloude», **versión corta «QC»** para el modo icono (**D7**, R4/R24) |
| 2026-08-06 | `displayName` | **Ya compuesto** por quien provee la sesión; el rol llega ya resuelto como texto mostrable. La UI no compone nombre y apellidos (**D8**) |
| 2026-08-06 | `<Toaster />` en la zona privada | **No se monta** (R36). `sonner` no es dependencia de esta feature. La zona privada se queda sin toasts hasta que una feature lo pida (**D9**) |
| 2026-08-06 | Route group privado | **`app/(private)/`**, decisión del humano. Se aparta de la nomenclatura `(dashboard)` de `docs/architecture.md` y **no es una desviación a reportar** (**D1**) |
| 2026-08-06 | E2E | **Diferido**: todavía no hay zona privada navegable. Task cerrada, deuda anotada para el leader (**T16**) |
| 2026-08-06 | Base de shadcn/ui, Vitest y `components/ui/` | **Precondición heredada de la feature 7.** La 8 no la re-crea; sólo añade primitivas nuevas vía `pnpm dlx shadcn@latest add` |
| 2026-08-06 | Librería de componentes | shadcn/ui. Ningún primitivo se escribe a mano ni se edita a mano en `components/ui/` |
| 2026-08-06 | Mutaciones | Server Actions. Prohibido `fetch` a API routes propias |
| 2026-08-06 | Datos del usuario | Entran **por props**; ningún componente privado los fetchea (`CHECKPOINTS.md > Permisos`) |
| 2026-08-06 | Cierre de sesión | Disparador vacío en esta feature; contrato congelado para que la feature 10 lo rellene sin tocar UI (`design.md > 3`) |
| 2026-08-06 | Rutas | Siempre en constantes exportadas, nunca literales (R13) |
| 2026-08-06 | Fase 2 bloqueada | La implementación no arranca hasta que la feature 7 esté `done` y su base esté en `dev` (`progress/current.md > Feature 8`) |
| 2026-08-06 | Asserts de los tests | Sobre roles ARIA, `data-testid` y constantes exportadas; **nunca** sobre literales de copy |
