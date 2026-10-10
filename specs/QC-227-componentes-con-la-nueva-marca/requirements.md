# QC-227 — componentes-con-la-nueva-marca · requirements.md

> **Zona:** `frontend` · **Complejidad:** `medium` · **Rama:** `feature/QC-227-componentes-con-la-nueva-marca`
> · **Depende de:** QC-226, QC-232 y QC-233 (en `dev`). Choca en archivos con QC-228, en vuelo (P7).
>
> Sin `/afinar-feature`: el alcance sale de la ficha del board, de la guía de marca v1 (§06 paleta y
> tabla de contraste, §07 tipografía) y del lienzo (`<raíz>/_trabajo/marca/lienzo/Main.dc.html`,
> opción A; `Movimiento.dc.html`, tablero 3.3). Las decisiones de la tabla salen de la ficha y de
> respuestas del humano ya registradas en QC-226 y QC-228. Lo que la ficha no resuelve está en
> `## Preguntas abiertas`, con su propuesta por defecto.

## Alcance

Llevar la guía de marca v1 a los componentes que ya existen (primitivos de shadcn en
`components/ui/` y compuestos de `components/shared/`), sin crear componentes nuevos, con los
tokens que dejó QC-226.

**Entra (ficha):**
- Badges de estado (pedidos, lotes, usuarios…) con los tokens de estado: `*-subtle` de fondo y
  `*-text` de texto, AA en claro y en oscuro.
- Tablas: cabecera en `muted`; lotes, cantidades y fechas en IBM Plex Mono con cifras tabulares.
- Barra lateral en petróleo oscuro (`--sidebar`), ítem activo en `--sidebar-primary` e ítems
  inactivos en `--sidebar-muted-foreground`.
- Botones primario, secundario y destructivo; inputs (`--input`) y anillo de foco (`--ring`) según
  la guía.
- Gráficos del dashboard con `--chart-1..5`. **No hay gráficos en la app** (P4): el dashboard es
  un `DataTable` de recorridos y no hay librería de gráficos en `package.json`.

**No entra:**
- Animaciones de cualquier tipo: son de QC-228 (en vuelo).
- Cambios de comportamiento o de datos: textos, rutas, permisos, consultas y lo que se puede hacer
  en cada pantalla quedan igual.
- Componentes nuevos, incluido un `StatusBadge` compartido (P5).
- Convertir en badge los estados que hoy son texto plano (P5).
- Las unificaciones visuales que QC-231, QC-232 y QC-233 dejaron anotadas «para QC-227» y que la
  ficha no nombra (P6).
- Dependencias nuevas.
- Cambiar el valor de cualquier token: la paleta la cerró QC-226 (D2).

## Decisiones cerradas (no reabrir)

| # | Decisión | Quién y cuándo | Enmienda a | Cubierta por |
| --- | --- | --- | --- | --- |
| D1 | Fuente: guía de marca v1 (§06 paleta y tabla de contraste WCAG, §07 tipografía) y lienzo (Main A; Movimiento 3.3) | humano (ficha) | — | R1–R26 |
| D2 | Sin componentes nuevos: se tocan los que existen (shadcn y compartidos) | humano (ficha) | — | `tasks.md > T11` (proceso: diff sin archivos `.tsx` nuevos en `components/` ni en `app/`) |
| D3 | Badges de estado con `*-subtle` de fondo y `*-text` de texto, AA en claro y en oscuro | humano (ficha) | — | R1, R2, R3–R9 |
| D4 | Tablas: cabecera en `muted`; lotes, cantidades y fechas en IBM Plex Mono con cifras tabulares | humano (ficha) | — | R10–R13 |
| D5 | Barra lateral en petróleo oscuro (`--sidebar`), ítem activo en `--sidebar-primary`, inactivos en `--sidebar-muted-foreground` | humano (ficha) | — | R14–R17 |
| D6 | Botones primario, secundario y destructivo; inputs con `--input`; anillo de foco con `--ring`, según la guía | humano (ficha) | — | R18–R25 |
| D7 | No entran animaciones (QC-228) ni cambios de comportamiento o de datos | humano (ficha) | — | R29, R30; datos: `tasks.md > T11` |
| D8 | Sin dependencias nuevas | humano (ficha) | — | R28 |
| D9 | «Botón secundario» es la variante `outline` (la de los «Cancelar»); la variante `secondary` no la usa ninguna pantalla | humano, 2026-10-09 (respuesta a QC-228 P1) | — | R19 |
| D10 | Los valores de los tokens no se tocan: la paleta «Verde Petróleo» la cerró QC-226 | humano, 2026-10-08 (QC-226 D2) | — | R2, R10, R15, R18, R20, R21, R23 |

## Requisitos (EARS)

«El sistema» es la app web: los primitivos de `components/ui/`, los compuestos de
`components/shared/`, los componentes de ruta que pintan badges, tablas o campos, y
`app/globals.css`. «Tono» es una pareja fondo/texto de un badge. «En los dos modos» quiere decir
con el tema claro y con el oscuro.

### Badges de estado

**R1.** El sistema DEBE ofrecer en el `Badge` existente cinco tonos de estado: **éxito** (fondo
`--success-subtle`, texto `--success-text`), **aviso** (`--warning-subtle`, `--warning-text`),
**error** (`--destructive-subtle`, `--destructive-text`), **información** (`--info-subtle`,
`--info-text`) y **neutro** (`--muted`, `--muted-foreground`). El tono de error DEBE ser el que pinta
la variante `destructive` ya existente.

**R2.** El sistema DEBE alcanzar, en los dos modos, al menos `4.5:1` de contraste WCAG entre el
texto y el fondo de cada tono de R1.

**R3.** CUANDO se muestra el badge de estado de un pedido, el sistema DEBE pintarlo con este tono
(propuesta de P2): `PENDIENTE` neutro; `EN_CURSO`, `EN_EMPAQUE` y `EN_ACONDICIONAMIENTO`
información; `POR_EMPACAR` y `POR_ACONDICIONAR` aviso; `TERMINADO` y `ENTREGADO` éxito; `CANCELADO`
y `BLOQUEADO` error.

**R4.** CUANDO se muestra el badge de prioridad de un pedido, el sistema DEBE pintarlo con este
tono (P2): `BAJA` neutro, `MEDIA` información, `ALTA` aviso y `CRITICA` error.

**R5.** CUANDO se muestra el badge de cobertura de un pedido, el sistema DEBE pintarlo con este
tono (P2): `full` éxito, `none` neutro y `partial` aviso.

**R6.** CUANDO se muestra el badge de estado de cuenta de un usuario, el sistema DEBE pintarlo con
este tono (P2): `active` éxito, `pending` aviso, `inactive` neutro y `blocked` error.

**R7.** MIENTRAS un lote está sobre-reservado, el sistema DEBE pintar su marca «Sobre-reservado»
del panel de lotes como un badge de tono error.

**R8.** MIENTRAS una versión de receta está en revisión, el sistema DEBE pintar su marca «En
revisión» (en la lista de versiones y en el formulario de versión) como un badge de tono
información.

**R9.** El sistema DEBE conservar en cada badge de R3–R8 su texto visible, su `data-testid` y sus
atributos `data-*` actuales: el color acompaña a la etiqueta y nunca la sustituye.

### Tablas

**R10.** El sistema DEBE pintar la fila de cabecera de toda tabla construida con `Table` con fondo
`--muted` y texto `--muted-foreground`, también en las columnas fijadas, y DEBE alcanzar en los dos
modos al menos `4.5:1` entre ese texto y ese fondo.

**R11.** El sistema DEBE pintar en IBM Plex Mono (`--font-mono`) y con cifras tabulares
(`font-variant-numeric: tabular-nums`) las celdas de cuerpo de las columnas de lote, cantidad y
fecha de la lista cerrada de `design.md > 4.2`.

**R12.** MIENTRAS el panel de lotes de un producto está visible, el sistema DEBE pintar el número de
lote, las cantidades (existencia, apartado y disponible) y las fechas (compra y vencimiento) en IBM
Plex Mono con cifras tabulares (propuesta de P8).

**R13.** El sistema DEBE seguir pintando en IBM Plex Sans las cabeceras de tabla y las celdas de
las columnas que no están en la lista de R11.

### Barra lateral

**R14.** El sistema DEBE conservar el fondo del panel lateral que fijó QC-226 (R9): color de base
`--sidebar` y el degradado `--sidebar-panel-gradient`, en los dos modos.

**R15.** MIENTRAS un ítem del menú de navegación lateral (de primer nivel o de submenú) no es el
activo y no tiene ni el puntero encima ni el foco, el sistema DEBE pintar su texto y su icono en
`--sidebar-muted-foreground`, con al menos `4.5:1` de contraste contra `--sidebar` y contra cada
parada del degradado del panel, en los dos modos.

**R16.** CUANDO el puntero pasa sobre un ítem inactivo del menú lateral, o el ítem recibe el foco,
el sistema DEBE pintar su texto en `--sidebar-accent-foreground`, como hoy.

**R17.** MIENTRAS un ítem del menú lateral es el activo, el sistema DEBE pintarlo como fija QC-226
R11 (fondo y anillo de `--sidebar-primary`, texto blanco en 600 e icono en `--sidebar-primary`), y
la barra de acento del borde izquierdo (`::before`) NO DEBE cambiar (propuesta de P3). El enlace de
marca de la cabecera y los controles del pie de la barra NO DEBEN cambiar de color.

### Botones

**R18.** El sistema DEBE pintar el texto del botón primario (variante `default`) en
`--primary-foreground` y conservar su fondo de marca (`--primary`, o el degradado que deje QC-228),
con al menos `4.5:1` entre ese texto y `--primary` en los dos modos.

**R19.** El sistema DEBE pintar el botón secundario (variante `outline`, D9) con texto
`--foreground`, borde `--border` y fondo `--background` en modo claro, y con borde `--input` en
modo oscuro, como hoy. La variante `secondary` DEBE seguir pintándose con `--secondary` y
`--secondary-foreground`, con al menos `4.5:1` entre los dos en los dos modos.

**R20.** El sistema DEBE pintar el botón destructivo (variante `destructive`) con fondo
`--destructive` y texto `--destructive-foreground`, con al menos `4.5:1` entre los dos en los dos
modos. CUANDO el puntero está encima, el sistema DEBE mezclar el fondo con un 10 % de
`--foreground`, sin bajar de ese contraste.

### Anillo de foco

**R21.** CUANDO un botón, una casilla, una pestaña, un día del calendario o un badge enlazable
recibe el foco por teclado, el sistema DEBE dibujar a su alrededor un contorno **opaco** de
`--ring` de 2 px, separado 2 px del control, con al menos `3:1` de contraste contra `--card` y contra
`--background` en los dos modos.

**R22.** El sistema NO DEBE pintar ningún anillo ni contorno de foco con `--ring` translúcido: no
DEBE quedar `ring-ring/<n>` ni `outline-ring/<n>` en `app/`, en `components/` ni en
`app/globals.css`.

### Campos

**R23.** El sistema DEBE pintar con un borde de 1 px de `--input` los campos de texto, las áreas de
texto, los disparadores de selector, los campos de autocompletar y los disparadores de fecha, con al
menos `3:1` de contraste contra `--card` y contra `--background` en los dos modos.

**R24.** CUANDO un campo de R23 recibe el foco, el sistema DEBE pintar su borde en `--ring` y un
anillo opaco de `--ring` de 1 px pegado al borde, sin separación.

**R25.** SI un campo o un botón está marcado como inválido (`aria-invalid`), ENTONCES el sistema
DEBE seguir pintando su borde en `--destructive`, como hoy.

### Logo del login (sujeto a P1)

**R26.** CUANDO se carga la pantalla de login, el sistema DEBE pedir el logo vertical con prioridad
alta y sin carga diferida. Los demás usos de `BrandLogo` (barra lateral y encabezado privado) DEBEN
seguir como hoy.

### Lo que no cambia

**R27.** El sistema NO DEBE cambiar el valor de ningún token de color de `:root` ni de `.dark` de
`app/globals.css` (D10).

**R28.** El sistema NO DEBE añadir entradas a `dependencies` ni a `devDependencies` de
`package.json`.

**R29.** El sistema DEBE conservar el comportamiento existente: las pruebas unitarias, de
integración y E2E que ya existen DEBEN seguir verdes sin editar sus aserciones de comportamiento.
Solo se regeneran los snapshots de paridad y se ajustan las aserciones de clase de la lista cerrada
de `design.md > 9`.

**R30.** El sistema NO DEBE añadir animaciones ni transiciones nuevas: ni `@keyframes`, ni
`animation`, ni clases `animate-*`, ni `transition-*` que no existieran ya en la línea que se toca.

### Cobertura de las decisiones cerradas

D1→R1–R26 · D2→`tasks.md > T11` (proceso, no conducta del sistema) · D3→R1–R9 · D4→R10–R13 ·
D5→R14–R17 · D6→R18–R25 · D7→R29, R30 y `tasks.md > T11` · D8→R28 · D9→R19 · D10→R2, R10, R15,
R18, R20, R21, R23, R27.

## Preguntas abiertas

Cada una lleva una propuesta por defecto. Si el humano aprueba el spec sin responderla, vale la
propuesta.

**P1. LCP del logo del login (m2 del review de QC-226).** El `next dev` avisa de que el logo
vertical del login es el LCP y carga en diferido (`progress/review_QC-226.md > m2`). La ficha no lo
nombra. **Propuesta: entra aquí** (R26). Es una prop en `BrandLogo`, un componente de marca que ya
existe, y una línea en la página de login; ninguno de los dos archivos lo toca QC-228. Si el humano
dice que no, R26 y T8 se quitan antes de implementar y m2 pasa a una ficha propia.

**P2. Tono de cada estado.** La ficha pide los tokens de estado, pero no dice qué estado lleva qué
tono. **Propuesta:** la de R3–R6. Criterio: en marcha → información; espera una acción → aviso;
terminado bien → éxito; impide trabajar → error; sin empezar o sin dato → neutro. Hay dos cambios
de sentido que conviene confirmar: la cobertura `partial` pasa de error a **aviso** (falta stock,
pero el pedido sigue) y `CANCELADO` se queda en **error**, como hoy, aunque es un estado final.

**P3. Barra de acento del ítem activo (QC-226 D18).** QC-226 dejó la decisión para esta ficha. El
lienzo A no dibuja barra; QC-228 R15 exige que no cambie. **Propuesta: se conserva tal cual**
(R17). Quitarla o cambiarla obligaría a enmendar QC-228 R15 y su test.

**P4. Gráficos del dashboard.** No hay gráficos ni librería de gráficos. Los tokens `--chart-1..5`
ya están declarados y expuestos como colores de Tailwind desde QC-226 (R1, R3). **Propuesta:** en
esta ficha no se hace nada con ellos; la ficha que cree el primer gráfico los usa. No se añade
ninguna librería (D8).

**P5. Estados que hoy son texto plano.** En asignación, dashboard, empaque, acondicionamiento, la
vista previa de importación y el diálogo de estado de usuario, el estado es un `<span data-status>`,
un `<p>` o un `<dd>` sin estilo (`_trabajo/marca/inventario-ui.md`). Pintarlos como badge pide un
mapa de tono compartido entre rutas, que es una pieza nueva (D2). **Propuesta: quedan fuera**, para
una ficha propia que cree el `StatusBadge` compartido y un `ORDER_STATUS_LABELS` único.

**P6. Lo que otras fichas dejaron «para QC-227».** QC-231, QC-232 y QC-233 anotaron como trabajo de
QC-227: unificar el aspecto de `ErrorAlert`, el «sin resultados» de las tablas, los pies de
formulario, los textos «Volver»/«Cancelar» y los anchos de los paneles; adoptar `FieldError` en los
57 `<p className="text-sm text-destructive">`; unificar el marcado de los buscadores y las barras de
búsqueda de las listas; valorar `Spinner`, `Empty` y `Alert` de shadcn; y rehacer
`UserStatusBadge`. La ficha no nombra nada de eso. **Propuesta: queda fuera**, en una ficha nueva de
«unificación visual». `UserStatusBadge` solo cambia de tono (R6) y se queda donde está.

**P7. Choque de archivos con QC-228.** Los dos tocan `app/globals.css`, `components/ui/button.tsx`,
`select.tsx`, `autocomplete.tsx` y `tabs.tsx`, los snapshots de paridad y tres tests
(`design.md > 10`). El choque es inevitable: R21–R24 viven en los mismos primitivos que QC-228
anima. **Propuesta:** el spec se aprueba ya, pero el código de QC-227 (F2) empieza **cuando QC-228
esté mergeada en `dev`**, y esta rama se sincroniza con `dev` antes de T1 (`tasks.md > T0`). Las dos
son de la misma persona.

**P8. Lotes fuera de una tabla.** Los lotes no salen en ninguna tabla: se listan en el panel de
lotes del producto (`product-batches-panel.tsx`), como lista de definiciones. **Propuesta: entra**
(R12), porque es el único sitio donde se leen lotes en serie y la guía §07 pide Plex Mono para
lotes.

**P9. Columnas dudosas.** No se consideran lote, cantidad ni fecha: «Nº de pedido», «# Pedido»,
«Costo», «Duración», «Vueltas atrás», «Pasos», «Tiempo de entrega», «Medidas», «Equivalencia»,
«Teléfono». **Propuesta: se quedan en Plex Sans** (R13). Si el humano quiere alguna en Mono, se
añade a la lista de `design.md > 4.2` antes de implementar.
