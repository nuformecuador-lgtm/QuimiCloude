# QC-228 — movimiento-de-la-interfaz · requirements.md

> **Zona:** `frontend` · **Complejidad:** `low` · **Rama:** `feature/QC-228-movimiento-de-la-interfaz`
> · **Depende de:** QC-226 (cerrada)
>
> Sin `/afinar-feature`: la ficha del board ya acota alcance y frontera, y el humano pidió avanzar
> rápido (`progress/features/QC-228.md > Estado`). Las decisiones de la tabla salen de la ficha, de
> la guía de marca v1 (§08) y de las respuestas del humano del 2026-10-08 registradas en
> `progress/features/QC-226.md > Decisiones` (lienzo `/design` «Degradados y movimiento de marca»,
> tablero 3, copia en `<raíz>/_trabajo/marca/lienzo/Movimiento.dc.html`).

## Alcance

Aplicar los principios de movimiento de la guía de marca v1 (§08, con la enmienda aprobada el
2026-10-08) a la app, con los tokens `--dur-*` / `--ease-*` que dejó QC-226 y con
`tw-animate-css`, que ya está instalado. **Sin cambio de comportamiento:** lo que el usuario puede
hacer, lo que ve al final de cada transición y los datos no cambian; solo cambia cómo se llega.

**Entra:**
- Duraciones y curvas de la guía en todo el movimiento de la app (D2, D3, D4).
- Hover, foco y pulsación de controles: color en 100 ms con la curva estándar.
- Entrada y salida de diálogos, paneles laterales (`Sheet`), menús y desplegables, tooltips,
  pestañas y toasts.
- Barra lateral: el colapso y la expansión, y el ítem activo que se desliza (lienzo, tablero 3.2).
- Botón primario con brillo de degradado y botón secundario con velo petróleo (tablero 3.3).
- Entrada de pantalla escalonada al cambiar de módulo (tablero 3.1).
- La regla global de `prefers-reduced-motion` del kit (`tokens.css`).

**Lo que NO entra:**
- **Tarjetas que suben al hover (tablero 3.4):** hoy no hay ninguna tarjeta pulsable en la app
  (las cinco que usan `Card` son el login, el establecimiento de contraseña, la ejecución del
  operario y dos filas de importación; ninguna es un enlace ni un botón). Sin consumidor, no se
  crea la regla. Ver P3.
- **Gráficos que se animan una vez al cargar:** no hay gráficos ni librería de gráficos en el repo
  (`_trabajo/marca/inventario-ui.md > Datos que cambian el plan`). Ver P3.
- Restyling de componentes (colores, badges, tablas, inputs) y la barra de acento de 3 px del ítem
  activo (QC-226 D18): son de QC-227.
- El fondo y la entrada de la tarjeta del login: ya los hizo QC-226 (R17–R22) y no se tocan.
- Movimiento ambiental nuevo (la «Aurora» del panel que menciona el lienzo no se eligió: QC-226 D5
  dejó el panel estático).
- Cambiar qué se carga, cuándo o cómo; cambiar textos, rutas o permisos.

## Decisiones cerradas (no reabrir)

| # | Decisión | Quién y cuándo | Enmienda a | Cubierta por |
| --- | --- | --- | --- | --- |
| D1 | Fuente: guía de marca v1 §08 + lienzo «Degradados y movimiento de marca», tablero 3 | humano, 2026-10-08 | — | R1–R25 |
| D2 | Duraciones: 100 ms hover/foco/pulsación · 150 ms salidas, tooltips y cierre de menús · 200 ms desplegables, pestañas y cambios de estado · 300 ms diálogos, paneles laterales y toasts que entran. Nada por encima de 400 ms | humano (ficha y guía §08) | — | R1, R3–R12, R19 |
| D3 | Curvas: estándar `cubic-bezier(.2,0,0,1)`, entrada `cubic-bezier(0,0,.2,1)`, salida `cubic-bezier(.4,0,1,1)`, por los tokens `--ease-*` de QC-226 | humano (ficha y guía §08) | — | R2–R13, R16–R19 |
| D4 | Se animan: opacidad y transformaciones; color en hover y foco; entrada y salida de toasts, diálogos, menús y barra lateral | humano (ficha y guía §08) | — | R3–R12 |
| D5 | Con `prefers-reduced-motion: reduce`: sin desplazamientos ni escalados; como mucho un fundido corto. El bloque global de movimiento reducido del kit va en esta ficha, no en QC-226 | humano (ficha); 2026-10-08 (QC-226 D14) | QC-226 R32 | R21, R22 |
| D6 | No se animan: filas y celdas de tabla al cargar, ordenar o filtrar; cifras de stock, precios y totales; badges de estado; el logo dentro de la app. Nada en bucle sobre el contenido, sin rebotes ni parallax | humano (ficha y guía §08) | — | R23 |
| D7 | Enmienda a la §08: se permite movimiento ambiental en bucle solo detrás del contenido, con ciclos ≥ 20 s, sin rebotes y quieto con movimiento reducido (hoy solo lo usa el login de QC-226) | humano, 2026-10-08 (QC-226 D11) | guía §08 | R1, R2, R23 |
| D8 | Tablero 3 del lienzo aprobado entero como alcance de QC-228: entrada de pantalla escalonada, ítem activo que se desliza, botón primario con brillo, botón secundario animado (velo petróleo de 200 ms; borde y texto a petróleo en 100 ms), tarjetas que suben al hover, toast y diálogo | humano, 2026-10-08 | — | R4–R6, R10, R13–R20 (tarjetas: «Lo que NO entra», P3) |
| D9 | Sin dependencias nuevas | humano (ficha) | — | R25 |
| D10 | Sin cambio de comportamiento: el estado final de cada pantalla, control y dato es el mismo con y sin animación | leader, 2026-10-09 (consigna del humano: cerrar el rediseño hoy) | — | R15, R24 |

## Requisitos (EARS)

«El sistema» es la app web: `app/globals.css`, los primitivos de `components/ui/`, la barra
lateral privada, el layout privado y las pantallas que cuelgan de él. «Módulo» es el ítem del menú
lateral cuyo `href` es el prefijo más largo de la ruta actual.

### Duraciones y curvas

**R1.** El sistema NO DEBE declarar en `app/`, `components/` ni `app/globals.css` ninguna duración
de transición o de animación de más de 400 ms. La única excepción es el movimiento ambiental del
login de QC-226 (D7).

**R2.** El sistema NO DEBE usar en las clases de `components/` ni de `app/` las curvas
`ease-linear`, `ease-in`, `ease-out` ni `ease-in-out`, ni un `cubic-bezier(...)` literal: toda
curva de una transición o animación de la interfaz DEBE ser `--ease-standard`, `--ease-enter` o
`--ease-exit`. Quedan fuera el bloque del login de QC-226 (D7) y los indicadores de carga (P2).

**R3.** CUANDO un control interactivo (botón, campo de texto, casilla, disparador de selector,
pestaña, ítem de menú, fila de tabla con hover) cambia de color de fondo, de borde, de texto o de
anillo por hover, foco o pulsación, el sistema DEBE hacer esa transición en `--dur-instant`
(100 ms) con `--ease-standard`.

### Diálogos y paneles

**R4.** CUANDO se abre un diálogo (`Dialog` o `AlertDialog`), el sistema DEBE hacer entrar el
contenido con fundido y escala de 96 % a 100 % en `--dur-slow` (300 ms) con `--ease-enter`, y el
velo con un fundido en `--dur-base` (200 ms).

**R5.** CUANDO se cierra un diálogo, el sistema DEBE hacer salir el contenido y el velo con
fundido (y el contenido con escala a 96 %) en `--dur-fast` (150 ms) con `--ease-exit`.

**R6.** CUANDO se abre un panel lateral (`Sheet`), el sistema DEBE hacerlo entrar desde su lado,
con fundido y desplazamiento, en `--dur-slow` con `--ease-enter`; CUANDO se cierra, DEBE hacerlo
salir en `--dur-fast` con `--ease-exit`. El velo DEBE seguir las duraciones de R4 y R5.

### Menús, desplegables, tooltips y pestañas

**R7.** CUANDO se abre un menú o desplegable (`DropdownMenu`, `Select`, `Popover`,
`Autocomplete`), el sistema DEBE hacerlo entrar en `--dur-base` con `--ease-enter`; CUANDO se
cierra, DEBE hacerlo salir en `--dur-fast` con `--ease-exit`.

**R8.** CUANDO se muestra o se oculta un tooltip, el sistema DEBE hacer la transición en
`--dur-fast`: con `--ease-enter` al mostrarse y con `--ease-exit` al ocultarse.

**R9.** CUANDO cambia la pestaña activa de un `Tabs`, el sistema DEBE hacer la transición del
indicador de pestaña activa en `--dur-base` con `--ease-standard`.

### Toasts

**R10.** CUANDO aparece un toast, el sistema DEBE hacerlo entrar desde abajo, con fundido, en
`--dur-slow` con `--ease-enter`; CUANDO se descarta o vence, DEBE hacerlo salir en `--dur-fast`
con `--ease-exit`. Ninguna transición del toast DEBE superar 400 ms (R1).

### Barra lateral

**R11.** CUANDO la barra lateral de escritorio se contrae a modo icono o se expande, el sistema
DEBE animar el cambio de ancho en `--dur-base` con `--ease-standard`.

**R12.** CUANDO se despliega o se pliega un grupo del menú lateral, el sistema DEBE girar su
chevron en `--dur-base` con `--ease-standard`.

**R13.** CUANDO el ítem activo de una lista del menú lateral pasa a otro ítem de la **misma**
lista, el sistema DEBE desplazar el resaltado del ítem activo (fondo y anillo de QC-226 R11) desde
la posición del ítem anterior hasta la del nuevo en `--dur-base` con `--ease-standard`.

**R14.** SI el nuevo ítem activo está en otra lista (un submenú distinto, o de un submenú al
primer nivel), O la lista no tenía ítem activo, ENTONCES el sistema DEBE mostrar el resaltado en
el nuevo ítem sin desplazamiento, como mucho con un fundido de `--dur-base`.

**R15.** El sistema DEBE pintar el resaltado del ítem activo en la misma posición, tamaño y aspecto
que fija QC-226 R11 una vez terminada la transición, en modo expandido y en modo icono, y DEBE
mostrarlo sin JavaScript tal como hoy. La barra de acento del borde izquierdo (`::before`) NO DEBE
cambiar (QC-226 D18).

### Botones

**R16.** MIENTRAS el puntero está sobre un botón primario (variante `default`) habilitado, el
sistema DEBE desplazar su degradado de marca (`linear-gradient(135deg, #0A4A47 0%, #02605A 45%,
#0B7A72 100%)` a `background-size: 200% 100%` en el tema claro) de la posición 0 % a la 100 % en
`--dur-base` con `--ease-standard`. Los valores del tema oscuro dependen de P1.

**R17.** MIENTRAS el puntero está sobre un botón secundario (variante `outline`, ver P1)
habilitado, el sistema DEBE hacer entrar desde la derecha un velo petróleo al 10 % en `--dur-base`
y DEBE pasar el borde y el texto a petróleo (`--primary`) en `--dur-instant`, los dos con
`--ease-standard`.

**R18.** MIENTRAS un botón primario o secundario está pulsado, el sistema DEBE escalarlo al 98 %
en `--dur-instant` con `--ease-standard`. Las demás variantes conservan su pulsación actual, y
los botones que abren un menú (`aria-haspopup`) y las flechas de desplazamiento de las tablas
siguen sin moverse al pulsarse.

### Entrada de pantalla

**R19.** CUANDO el usuario entra en un módulo distinto del actual de la zona privada (o carga por
primera vez una pantalla de la zona privada), el sistema DEBE hacer entrar los bloques de primer
nivel del contenido de la pantalla de `opacity: 0; translateY(10px)` a su estado final en
`--dur-slow` con `--ease-enter`, escalonados 40 ms entre sí (0, 40, 80 y 120 ms; del quinto bloque
en adelante, 120 ms).

**R20.** MIENTRAS el usuario navega dentro del mismo módulo (filtros, orden, paginación, pestañas,
búsqueda o una pantalla de detalle del mismo módulo), el sistema NO DEBE repetir la entrada de
pantalla de R19.

### Movimiento reducido

**R21.** MIENTRAS el sistema operativo pide movimiento reducido, el sistema DEBE dejar sin
desplazamientos ni escalados toda transición y animación de la app: la duración efectiva de cada
transición y animación DEBE quedar en 0.01 ms, con una sola iteración, y el desplazamiento de
scroll DEBE ser instantáneo (regla global de `tokens.css` del kit), incluido el que hacen las
flechas de desplazamiento horizontal de las tablas. Esto vale también para R4–R19.

**R22.** MIENTRAS el sistema operativo pide movimiento reducido, el sistema DEBE conservar la
conducta de movimiento reducido del login de QC-226 (R22): isotipos visibles y quietos, y la
tarjeta sin desplazamiento.

### Lo que no se anima

**R23.** El sistema NO DEBE aplicar animaciones (`animation`, `@keyframes`, clases `animate-*`) a
filas o celdas de tabla, a los badges de estado, a las cifras de stock, precios y totales, ni al
logo o isotipo dentro de la app; y NO DEBE usar `animate-bounce`, `animate-ping`, curvas con rebote
(puntos de control fuera de [0, 1] en Y) ni animaciones ligadas al scroll (parallax). Las únicas
animaciones en bucle permitidas son el fondo del login (D7) y, según P2, los indicadores de carga.

### Comportamiento

**R24.** El sistema DEBE conservar el comportamiento existente: las pruebas unitarias,
de integración y E2E que ya cubren las pantallas, los diálogos, los paneles, los toasts y la barra
lateral DEBEN seguir verdes sin editar sus aserciones de comportamiento. Solo se enmiendan los
casos que fijan una clase o una regla de CSS de movimiento, con nota de enmienda (lista cerrada en
`design.md > 8`).

**R25.** El sistema NO DEBE añadir entradas a `dependencies` ni a `devDependencies` de
`package.json`.

### Cobertura de las decisiones cerradas

D1→R1–R25 · D2→R1, R3–R12, R19 · D3→R2–R13, R16–R19 · D4→R3–R12 · D5→R21, R22 · D6→R23 ·
D7→R1, R2, R23 · D8→R4–R6, R10, R13–R20 (las tarjetas quedan fuera por P3) · D9→R25 · D10→R15, R24.

## Preguntas abiertas

**P1. Botones en el tema oscuro, y cuál es «el secundario».** El lienzo solo da valores del tema
claro (degradado `#0A4A47 → #02605A → #0B7A72`; velo `rgb(2 96 90 / .10)`). En oscuro `--primary`
es un petróleo claro (`oklch(0.77 0.115 186)`) con texto oscuro, así que esos hex no sirven tal
cual. **Propuesta:** en oscuro, degradado derivado de `--primary` con `color-mix` (más oscuro →
`--primary` → más claro, contraste del texto ≥ 4.5:1 en las tres paradas) y velo de `--primary`
al 10 %. Además, el secundario del lienzo (fondo blanco con borde) corresponde a la variante
`outline`, que es la que usan los botones «Cancelar» de la app (la variante `secondary` no la usa
ninguna pantalla). **Propuesta:** R17 se aplica a `outline`. Bloquea R16 y R17 en oscuro.

**P2. Indicadores de carga en bucle.** «Nada en bucle» choca con `animate-spin` (cargadores de
autocompletar, toast de carga) y `animate-pulse` (`Skeleton`). **Propuesta:** se conservan porque
informan de una espera y no decoran; con movimiento reducido se detienen por R21. Si el humano dice
que no, se cambian por un indicador estático.

**P3. Tarjetas pulsables y gráficos.** No existen hoy (ver «Lo que NO entra»). **Propuesta:** no se
crea nada sin consumidor; la ficha que cree la primera tarjeta pulsable o el primer gráfico aplica
el tablero 3.4 o la regla de «una vez al cargar». Confirmar.

**P4. Coste del ítem que se desliza (R13–R15).** Es lo único de la ficha que pide JavaScript nuevo
(medir la posición del ítem activo; `design.md > 5`). Si el rediseño tiene que cerrar hoy y el
humano prefiere recortar, la alternativa es un fundido de 200 ms del resaltado en el nuevo ítem, y
el deslizamiento pasa a una ficha propia. Las tasks lo separan en la fase 3 para poder cortarlo sin
renumerar.

**P5. Atenuado de tablas al recargar.** Unas 12 tablas pasan a `opacity-60` con
`transition-opacity` mientras recargan al filtrar u ordenar. Es la tabla entera, no sus filas, y es
conducta de specs anteriores. **Propuesta:** se conserva tal cual (con la duración por defecto de
R3). Confirmar que no cuenta como «animar filas al filtrar».
