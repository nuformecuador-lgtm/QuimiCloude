# QC-256 — piezas-compartidas-rediseno · requirements.md

> **Zona:** `frontend` · **Complejidad:** `high` · **Rama:** `feature/QC-256-piezas-compartidas-rediseno`
> · **Depende de:** QC-251 (cerrada en `dev`)
>
> Sin `/afinar-feature`. Las decisiones salen de la ficha del board, de `progress/rediseno.md`
> (D1, D2, D3, D7, D12 y D14, humano, 2026-10-10) y de la regla de reutilización
> (`docs/perfil-agentes.md > Regla de decisión para componentes`). Tableros aprobados:
> `docs/diseno/canvas/Botones.dc.html`, `Estados.dc.html`, `Campos.dc.html`, `Avisos.dc.html`,
> `Tabla.dc.html`, `Superficies.dc.html` y `Dominio.dc.html`, más la sección «Piezas consolidadas»
> de `docs/diseno/canvas/qc.css`.
>
> **Aprobado por el humano el 2026-10-10.** Sus respuestas a P1–P7 están en D10–D16; P2 y P4 amplían
> el alcance (R49–R58).

## Alcance

Llevar a `components/` las piezas compartidas del canvas, cada una con su fila en
`components/shared/CATALOGO.md`, para que las fichas de rediseño por módulo (QC-260 a QC-267) las
usen sin crear nada.

**Entra:**
- **Button:** tallas sm 32 · default 36 · `touch` 44 · xl 52 (D7), y `touch` solo en teléfono.
- **StatusBadge** con los siete tonos (D3) y el **mapa único de pedido** (estado, cobertura y
  prioridad: etiqueta y tono) en `components/shared/`, del que pasan a leer las cuatro copias que hay
  hoy en las rutas.
- **PriorityMark** (D1).
- **Notice** con los tonos success, warning, info y danger, sobre el primitivo `Alert` de shadcn/ui.
- **PasswordField** con ojo mostrar/ocultar (`aria-pressed`). Absorbe `CredentialField` (D12), que
  se borra.
- **PageShell**, **PageHeader** y **UrlTabs** con indicador deslizante.
- **DataTable:** acciones de fila en el menú ⋯ (D2), menú que no se corta en las últimas filas,
  tarjetas en contenedor estrecho y «Acciones» con el menú centrado en la pantalla visible.
- **DataTable:** barra de filtros en chips (chip punteado que pasa a sólido con el valor dentro y
  «Limpiar filtros»), que heredan todas las listas (D14).
- **ArrowLink:** los botones de navegación «Volver…» / «Ir a…» con flecha (`b-back`, `b-go`)
  (D13).
- **Avatar** con color estable por persona.
- **Spinner** único.
- Las piezas de `qc.css > Piezas consolidadas` que aplican a piezas compartidas: color de avatar
  por persona (`.av.c6`), spinner único, menú de fila (`.pop.at-row`), menú centrado (`.dlg.menu`) y
  reglas de contraseña (`.rule`). El resto, en «Lo que NO entra».
- Los tokens de color que esas piezas necesitan, en `app/globals.css`, para claro y oscuro.

**Lo que NO entra:**
- **Aplicar las piezas en cada pantalla** (ficha del board): sustituir `OrderStatusBadge`,
  `OrderPriorityBadge`, `OrderCoverageBadge` y `UserStatusBadge` por `StatusBadge` o
  `PriorityMark`; poner `PasswordField` en el login y en establecer contraseña (hoy
  `CredentialInput`, de la ruta); pasar las pestañas existentes a `UrlTabs`, los títulos a
  `PageHeader` y las tablas a tarjetas. Va en las fichas de rediseño por módulo (QC-260 a QC-267).
- Los mapas de estado que hoy usa **una sola ruta**: usuario (`configuracion/usuarios`) y marcas de
  versión de receta (`produccion/formulas`). Por la regla de subida a `shared`, se quedan en su
  ruta y les pone tono su ficha (QC-267, QC-264). Los de documento ya viven en
  `components/shared/document-upload/labels.ts` y su tono lo pone la ficha que pinte esos estados.
- El shell: cabecera, menú lateral, `.sheet.nav-l` (QC-257).
- De `qc.css > Piezas consolidadas`: `.pop.full`, `.dlg.full-m`, `.dlg-ic.success`, `.g2`/`.g3`,
  `.in.num`, `.in.has-suf`/`.suf`, `.lbox`/`.lrow`, `.num-dot`, `.pcard`/`.strip`, `.stat dd.*`,
  `.low`, `.op-hd`/`.op-ft`/`.op-t`, `.form-ft`, `.ed*` y `.seg`. Son de una pantalla o de un
  módulo y van en su ficha (D12).
- Cambiar la altura de `TextField` y demás campos (el canvas dibuja 40 px; el repo usa 44 px).
- Las tallas `xs` y `lg` de `Button` (D11).
- Sustituir los enlaces «Volver…» que ya existen en las pantallas por `ArrowLink`: va en la ficha de
  cada módulo (D7).

## Decisiones cerradas (no reabrir)

| # | Decisión | Quién y cuándo | Enmienda a | Cubierta por |
| --- | --- | --- | --- | --- |
| D1 | Prioridad con **PriorityMark**: barras neutras; solo «Crítica» en color e icono, no con Badge de color | humano, 2026-10-10 (`progress/rediseno.md` D1) | — | R12, R13, R14 |
| D2 | Acciones de fila **siempre en el menú ⋯**. En teléfono la tabla pasa a tarjetas y «Acciones» abre el menú **centrado en la pantalla visible** | humano, 2026-10-10 (D2) | — | R32, R33, R34, R35, R36, R37, R38, R39 |
| D3 | Tonos por significado: neutral, progress con punto que late, waiting, success, danger, info y muted. Un único StatusBadge y un único mapa de etiquetas por dominio | humano, 2026-10-10 (D3) | — | R6, R7, R8, R9, R10, R11 |
| D4 | Tallas de botón: sm 32 · default 36 · touch 44 · xl 52 (operario). Hoy son 28/32 | humano, 2026-10-10 (D7) | QC-30 (el test `login-skin` fija `h-8` en `button.tsx`) | R1, R2, R3, R4, R5 |
| D5 | Fusionar `credential-field` en un único **PasswordField** con ojo (mostrar/ocultar), para todo sitio donde se pueda ver una contraseña o una key | humano, 2026-10-10 (D12) | QC-21 (`CredentialField` y sus tests pasan a `PasswordField`) | R19, R20, R21, R22, R23, R24, R25, R26 |
| D6 | Lo demás del canvas queda aprobado. Cada pantalla se adapta a escritorio, tablet y teléfono | humano, 2026-10-10 (D14) | — | R27, R28, R29, R30, R31, R40, R41, R42, R43, R44 |
| D7 | Aplicar las piezas en cada pantalla queda fuera: va en las fichas de rediseño por módulo | humano (ficha QC-256, «Fuera de alcance») | — | R38, R47 |
| D8 | Cada pieza nueva o cambio visual cita su tablero aprobado; cada pieza gana o actualiza su fila del catálogo en el mismo commit | humano, 2026-10-10 (`docs/perfil-agentes.md > Pase de diseño`, regla 12 de `frontend_dev`) | — | R45, R46 |
| D9 | Sin dependencias nuevas. `Alert` entra con `pnpm exec shadcn add alert`, que copia código y no añade paquetes | humano, 2026-08-28 (regla 1 de `frontend_dev`: «nunca inventes componentes si los tiene shadcn/ui») | — | R48 |
| D10 (P1) | De `qc.css > Piezas consolidadas` entran solo `.av.c6`, el spinner, `.pop.at-row`, `.dlg.menu` y `.rule`; el resto va con la ficha de la pantalla que lo pinta | humano, 2026-10-10 (aprobación del spec) | — | R33, R36, R40, R43, R25 |
| D11 (P3) | La talla `lg` de `Button` (y `xs`) no se toca | humano, 2026-10-10 (aprobación del spec) | — | R5 |
| D12 (P5) | `PasswordField` a 44 px de alto y 16 px de letra, no los 40 px del tablero | humano, 2026-10-10 (aprobación del spec) | — | R23 |
| D13 (P2) | **Entran** los botones «Volver…» / «Ir a…» con flecha (`b-back`, `b-go`) como pieza compartida: «Volver» y similares son botones, no enlaces de texto (D2 del humano, tablero `Botones`) | humano, 2026-10-10 (aprobación del spec) | — | R49, R50, R51 |
| D14 (P4) | **Entra** la barra de filtros en chips de `DataTable` (chip punteado → sólido con el valor dentro, «Limpiar filtros»; tablero `Tabla`), porque la heredan todas las listas | humano, 2026-10-10 (aprobación del spec) | QC-55 (la barra de filtros de `DataTable` y sus tests) | R52, R53, R54, R55, R56, R57, R58 |
| D15 (P6) | Los textos del ojo para keys los pone el consumidor (`PasswordField` acepta textos propios); los decide QC-237 o la ficha de Integraciones | humano, 2026-10-10 (aprobación del spec) | — | R21 |
| D16 (P7) | Tarjetas y acciones a todo el ancho con contenedor ≤ 760 px; `touch="mobile"` y el relleno de `PageShell` con ventana < 768 px | humano, 2026-10-10 (aprobación del spec) | — | R4, R27, R30, R34 |

## Requisitos (EARS)

### Button (tablero `Botones.dc.html`)

- **R1.** El sistema DEBE pintar `Button` con 36 px de alto en la talla `default` y 32 px en la talla
  `sm`, y los botones de solo icono con 36 × 36 px en `icon` y 32 × 32 px en `icon-sm`.
- **R2.** DONDE `Button` lleve la talla `xl`, el sistema DEBE pintarlo con 52 px de alto, letra de
  16 px en peso 600 y radio de 10 px.
- **R3.** DONDE `Button` lleve `touch` activado, el sistema DEBE darle un objetivo táctil de al
  menos 44 × 44 px, como hoy.
- **R4.** DONDE `Button` lleve `touch="mobile"`, el sistema DEBE darle al menos 44 px de alto
  mientras la ventana mida menos de 768 px de ancho, y su talla normal a partir de 768 px.
- **R5.** Los consumidores actuales de `Button` NO DEBEN cambiar de código para seguir funcionando:
  las variantes, la prop `touch` booleana y `buttonVariants` conservan su firma.

### StatusBadge y mapa de pedido (tablero `Estados.dc.html`)

- **R6.** El sistema DEBE ofrecer un `StatusBadge` con exactamente siete tonos: `neutral`,
  `progress`, `waiting`, `success`, `danger`, `info` y `muted`, cada uno con su color de fondo, de
  texto y de punto tomados de tokens del tema.
- **R7.** El sistema DEBE pintar en todo `StatusBadge` la etiqueta como texto visible y un punto
  decorativo oculto a los lectores de pantalla, y la etiqueta NO DEBE partirse en dos líneas.
- **R8.** MIENTRAS un `StatusBadge` tenga el tono `progress`, el sistema DEBE animar su punto con un
  pulso en bucle de 1,6 s; en los demás tonos el punto NO DEBE animarse.
- **R9.** CUANDO cambie el tono de un `StatusBadge` ya pintado, el sistema DEBE pasar el fondo y el
  color del texto al nuevo tono en 200 ms con la curva estándar, sin animar el ancho.
- **R10.** El sistema DEBE tener **una sola** fuente de etiqueta y tono para el estado, la cobertura
  y la prioridad de un pedido, en `components/shared/`, con este reparto de tonos: Pendiente
  `neutral`; En curso, En empaque y En acondicionamiento `progress`; Por empacar y Por acondicionar
  `waiting`; Terminado y Entregado `success`; Cancelado `muted`; Bloqueado `danger`; Apartado
  `success`; Sin apartar `neutral`; Sin cobertura completa `waiting`.
- **R11.** Las constantes de etiquetas de estado y prioridad de pedido que hoy declaran las rutas
  (`ORDER_STATUS_LABELS`, `ORDER_PRIORITY_LABELS`, `ORDER_COVERAGE_LABELS`,
  `COMPANY_ORDER_STATUS_LABELS`, `COMPANY_ORDER_PRIORITY_LABELS`, `ASSIGNED_ORDER_STATUS_LABELS`,
  `ASSIGNED_ORDER_PRIORITY_LABELS` y `TRACE_ORDER_STATUS_LABELS`) DEBEN leer de la fuente de R10,
  conservando su nombre y su contenido, y ningún archivo de `app/` DEBE volver a declarar un mapa
  propio de etiquetas indexado por estado, prioridad o cobertura de pedido.

### PriorityMark (tablero `Estados.dc.html`)

- **R12.** El sistema DEBE ofrecer un `PriorityMark` que pinte la prioridad de un pedido como tres
  barras de alturas crecientes más la etiqueta visible, con una barra llena en Baja, dos en Media y
  tres en Alta, y las vacías atenuadas.
- **R13.** SI la prioridad es Crítica, ENTONCES el sistema DEBE pintar un triángulo de aviso en lugar
  de las barras, con la etiqueta y el icono en el color de texto de peligro y la etiqueta en peso
  600; las otras tres prioridades NO DEBEN llevar color de estado.
- **R14.** El sistema DEBE ocultar a los lectores de pantalla el icono de `PriorityMark`, dejar la
  etiqueta como nombre leído y no partirla en dos líneas.

### Notice (tablero `Avisos.dc.html`)

- **R15.** El sistema DEBE ofrecer un `Notice` con los tonos `success`, `warning`, `info` y `danger`,
  cada uno con fondo, texto y borde tomados de tokens del tema, y SIN colores escritos a mano en el
  componente.
- **R16.** El sistema DEBE pintar en cada `Notice` un icono propio de su tono, oculto a los lectores
  de pantalla, un título opcional en peso 600 y el cuerpo.
- **R17.** DONDE el tono sea `danger`, el sistema DEBE exponer el `Notice` con `role="alert"`; en
  los otros tres tonos, con `role="status"`.
- **R18.** CUANDO un `Notice` se monta, el sistema DEBE hacerlo entrar subiendo 10 px con un
  fundido en 300 ms y la curva de entrada.

### PasswordField (tablero `Campos.dc.html`)

- **R19.** El sistema DEBE ofrecer un `PasswordField` con etiqueta, un campo que nace oculto
  (`type="password"`) y un botón de ojo con `aria-pressed="false"`, `aria-controls` apuntando al
  campo y el nombre accesible «Mostrar la contraseña».
- **R20.** CUANDO se pulse el ojo con el campo oculto, el sistema DEBE mostrar el valor
  (`type="text"`), poner `aria-pressed="true"` y cambiar el nombre accesible a «Ocultar la
  contraseña»; CUANDO se pulse de nuevo, DEBE volver al estado de R19.
- **R21.** DONDE el consumidor pase sus propios textos para el ojo, el sistema DEBE usarlos en lugar
  de «Mostrar la contraseña» y «Ocultar la contraseña».
- **R22.** El sistema DEBE enviar el valor del `PasswordField` en el `FormData` bajo el `name` que
  elija el consumidor, esté visible u oculto, y pasar tal cual el `autoComplete` que reciba.
- **R23.** El sistema DEBE pintar el campo del `PasswordField` con letra de 16 px y al menos 44 px de
  alto, y el ojo con un objetivo táctil de 44 × 44 px.
- **R24.** DONDE el `PasswordField` lleve la variante de secreto (keys de integración), el sistema
  DEBE pintar el valor en Plex Mono y, mientras esté oculto, con más espacio entre los puntos.
- **R25.** DONDE el `PasswordField` lleve activada la lista de requisitos, el sistema DEBE pintar
  debajo los siete requisitos de contraseña con su estado en vivo, enlazados al campo por
  `aria-describedby`, y avisar al consumidor de si se cumplen las seis reglas locales al montar y
  cada vez que ese veredicto cambie (nunca en cada pulsación).
- **R26.** CUANDO el `PasswordField` reciba un error, el sistema DEBE marcar el campo con
  `aria-invalid="true"` y pintar el mensaje enlazado por `aria-describedby`. Tras esta ficha NO
  DEBE existir `CredentialField` en el código ni en el catálogo.

### PageShell, PageHeader y UrlTabs (tablero `Superficies.dc.html`)

- **R27.** El sistema DEBE ofrecer un `PageShell` que envuelva el contenido de una página privada con
  margen interior de 16 px arriba y a los lados y 24 px abajo por debajo de 768 px de ancho de
  ventana, y de 24 px arriba, 28 px a los lados y 32 px abajo desde 768 px, 20 px entre bloques y el
  contenedor declarado como contenedor de
  consultas de ancho; `PageShell` NO DEBE añadir una animación de entrada propia.
- **R28.** El sistema DEBE ofrecer un `PageHeader` con el título de la página como el único `h1` y,
  si el consumidor las pasa, sus acciones alineadas a la derecha del título.
- **R29.** DONDE el `PageHeader` reciba una miga de pan, el sistema DEBE pintarla sobre el título
  dentro de un `nav` con el nombre accesible que pase el consumidor, con el último paso marcado
  `aria-current="page"` y los separadores ocultos a los lectores de pantalla.
- **R30.** MIENTRAS el contenedor del `PageHeader` mida 760 px o menos, el sistema DEBE pintar sus
  acciones a todo el ancho, debajo del título.
- **R31.** El sistema DEBE ofrecer unas `UrlTabs` en las que cada pestaña es un enlace real a su
  dirección (navega con teclado, ratón, tacto y sin JavaScript), la pestaña vigente la decide el
  consumidor y queda marcada como seleccionada, cada pestaña mide al menos 44 px de alto, admite un
  icono y un contador visibles, y un indicador se desliza en 200 ms hasta la pestaña vigente. Por
  debajo del ancho disponible, las pestañas se desplazan en horizontal sin saltar de línea.

### DataTable y menú de fila (tablero `Tabla.dc.html`)

- **R32.** DONDE una columna de acciones declare las acciones de la fila como datos (nombre del menú
  e ítems), el sistema DEBE pintarlas en el menú ⋯ de esa fila (`RowActionsMenu`).
- **R33.** CUANDO se abra el menú ⋯ de una fila y no quepa debajo del disparador dentro de la
  ventana visible, el sistema DEBE abrirlo hacia arriba, de modo que el menú quede entero dentro de
  la ventana visible.
- **R34.** DONDE el consumidor declare la disposición en tarjeta de una `DataTable`, MIENTRAS el
  contenedor de la tabla mida 760 px o menos, el sistema DEBE pintar cada fila como una tarjeta con
  las columnas que esa disposición asigna (identificador y estado arriba, título, datos secundarios
  y pie) en lugar de la tabla; por encima de 760 px DEBE pintar la tabla.
- **R35.** MIENTRAS una fila se pinte como tarjeta y tenga acciones, el sistema DEBE pintar en su
  pie un botón con el texto visible «Acciones», el nombre accesible del menú de esa fila y al menos
  44 px de alto.
- **R36.** CUANDO se pulse «Acciones» en una tarjeta, el sistema DEBE abrir un diálogo modal
  centrado en la ventana visible con el nombre de la fila como título, un botón «Cerrar» y los
  mismos ítems del menú ⋯ de esa fila, cada uno con al menos 48 px de alto.
- **R37.** CUANDO se elija un ítem del menú centrado, el sistema DEBE ejecutar su acción (o navegar
  a su enlace) y cerrar el diálogo; CUANDO se pulse «Cerrar», Escape o el velo, DEBE cerrarlo sin
  ejecutar nada y devolver el foco al botón «Acciones» que lo abrió.
- **R38.** SI el consumidor no declara la disposición en tarjeta, ENTONCES el sistema DEBE pintar la
  `DataTable` como tabla en cualquier ancho, igual que antes de esta ficha.
- **R39.** El sistema DEBE ofrecer en las tarjetas la misma paginación, búsqueda, filtros y estados
  de carga, error y vacío que en la tabla.

### Avatar (tablero `Dominio.dc.html`, `qc.css > Piezas consolidadas`)

- **R40.** El sistema DEBE asignar a cada persona uno de seis colores de avatar a partir de su
  identificador, siempre el mismo para el mismo identificador.
- **R41.** DONDE `Avatar` reciba un color, el sistema DEBE pintar su fondo y sus iniciales con los
  tokens de ese color, definidos para el tema claro y el oscuro.
- **R42.** El sistema DEBE pintar cada persona de `ResponsibleAvatars` con el color de R40 según su
  identificador.

### Spinner (tablero `Avisos.dc.html`)

- **R43.** El sistema DEBE pintar `Spinner` como un solo icono de carga que gira una vuelta cada
  0,9 s a velocidad constante, oculto a los lectores de pantalla, en tallas `sm` (16 px), `lg`
  (20 px) e `inherit`.
- **R44.** El aviso emergente de carga (`Toaster`) DEBE usar `Spinner`; ningún otro archivo de
  `app/` o `components/` DEBE pintar un icono de carga girando por su cuenta.

### Catálogo, alcance y dependencias

- **R45.** Cada pieza nueva de esta ficha (`Alert`, `StatusBadge`, el mapa de pedido,
  `PriorityMark`, `Notice`, `PasswordField`, `PageShell`, `PageHeader`, `UrlTabs`, `ArrowLink` y
  el color de avatar) DEBE tener su fila en `components/shared/CATALOGO.md`, con su tablero de
  `docs/diseno/canvas/` en la columna `Diseño`.
- **R46.** Cada pieza existente que esta ficha extiende o cambia de aspecto (`Button`, `Tabs`,
  `Avatar`, `Toaster`, `Spinner`, `RowActionsMenu`, `DataTable`, `ResponsibleAvatars` y
  `CredentialRequirements`) DEBE actualizar su fila: puntos de extensión nuevos y su tablero en
  `Diseño`; la de `DataTable` DEBE decir además que su barra de filtros es de chips con «Limpiar
  filtros». La fila de `CredentialField` DEBE desaparecer.
- **R47.** Las pantallas que hoy pintan estado o prioridad con `Badge` NO DEBEN cambiar de aspecto
  por esta ficha.
- **R48.** Esta ficha NO DEBE añadir ninguna dependencia a `package.json`.

### ArrowLink: «Volver…» e «Ir a…» (tablero `Botones.dc.html`, D13)

- **R49.** El sistema DEBE ofrecer un `ArrowLink` que sea un enlace real (`<a href>`, navega y no
  envía ningún formulario) con el aspecto de `Button` (sus variantes, tallas y `touch`), y con una
  flecha oculta a los lectores de pantalla: hacia la izquierda y delante del texto en la dirección
  «volver», hacia la derecha y detrás del texto en la dirección «seguir».
- **R50.** MIENTRAS el puntero esté sobre un `ArrowLink` en un dispositivo con puntero que puede
  pasar por encima, el sistema DEBE desplazar la flecha 3 px en su dirección en 200 ms con la curva
  estándar, y devolverla al salir; en tacto la flecha NO DEBE moverse y el enlace funciona igual.
- **R51.** DONDE `ArrowLink` no reciba variante, el sistema DEBE pintar la dirección «volver» con la
  variante `outline` y la dirección «seguir» con la variante `default`, y su nombre accesible DEBE
  ser el texto visible.

### Barra de filtros en chips de DataTable (tablero `Tabla.dc.html`, D14)

- **R52.** El sistema DEBE pintar en la barra de filtros de `DataTable` un chip por cada columna que
  declare filtro, con la etiqueta de la columna, un icono de añadir, borde discontinuo y al menos
  44 px de alto MIENTRAS su filtro no esté activo.
- **R53.** CUANDO se pulse un chip, el sistema DEBE abrir el control de su filtro: lista de casillas
  para `select`, campo de texto para `text`, mínimo y máximo para `numberRange`, y calendario con
  atajos para `dateRange`. Cada cambio DEBE emitir los parámetros igual que antes de esta ficha
  (sin filtrar en el cliente y sacando la clave del filtro cuando queda vacío).
- **R54.** MIENTRAS el filtro de un chip esté activo, el sistema DEBE pintar el chip con borde sólido
  y el color primario, sin el icono de añadir, y mostrar el valor dentro del chip, tras un separador,
  en peso 600; el nombre accesible del chip DEBE incluir la etiqueta y el valor.
- **R55.** El sistema DEBE escribir el valor del chip así: `select`, la etiqueta de la opción elegida,
  y si hay más de una, la primera seguida de «+N»; `text`, el texto; `numberRange`, «mín – máx»,
  «≥ mín» o «≤ máx» según los extremos que haya; `dateRange`, «desde – hasta» en formato
  `AAAA-MM-DD`.
- **R56.** MIENTRAS haya al menos un filtro activo, el sistema DEBE pintar al final de la barra un
  botón «Limpiar filtros»; CUANDO se pulse, DEBE quitar todos los filtros en una sola emisión,
  conservando la búsqueda, el orden y el tamaño de página. Sin filtros activos, el botón NO DEBE
  existir.
- **R57.** MIENTRAS el filtro de un chip esté activo, el sistema DEBE ofrecer junto al chip el botón
  de quitar solo ese filtro (44 × 44 px, el nombre accesible de hoy); sin filtro activo ese botón NO
  DEBE existir.
- **R58.** MIENTRAS el contenedor de la `DataTable` mida 760 px o menos, el sistema DEBE pintar el
  campo de búsqueda a todo el ancho y los chips debajo, partiendo línea cuando no quepan; el velo de
  `hover` del chip solo DEBE aplicarse en dispositivos con puntero que puede pasar por encima.

## Preguntas abiertas

Ninguna. P1–P7 las resolvió el humano al aprobar el spec (2026-10-10) y están en D10–D16.
