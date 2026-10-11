# QC-257 — shell-rediseno · requirements.md

> **Zona:** `frontend` · **Complejidad:** `medium` · **Rama:** `feature/QC-257-shell-rediseno`
> · **Depende de:** QC-251 (cerrada en `dev`)
>
> Sin `/afinar-feature`. Las decisiones salen de la ficha del board, de `progress/rediseno.md`
> (D11 y D14, humano, 2026-10-10) y de lo que el humano pidió por escrito al encargar este spec
> (2026-10-10): un icono por destino con su tabla, una flecha que gira para el control del menú,
> el idioma y la cabecera. Tableros aprobados: `docs/diseno/canvas/Sidebar.dc.html`,
> `docs/diseno/canvas/Superficies.dc.html` y la cabecera de `docs/diseno/canvas/Pedidos.dc.html`.

## Alcance

Cerrar los detalles del shell privado que dejó pendientes la pasada `/design`: los iconos del
menú lateral, el icono del control que abre y pliega el menú, el idioma del documento y del menú
móvil, los tooltips de la cabecera y la transición del icono de tema.

**Entra:**
- Un icono distinto por destino del menú lateral (hoy se repiten Asignación = Pedidos y
  Unidades = Fórmulas). El set completo está en la tabla de R2.
- El control de la barra lateral con una flecha (chevron) que gira, en la pastilla del borde
  (escritorio) y en el botón «Alternar barra lateral» de la cabecera (móvil).
- `lang="es"` en el documento. Los textos del menú móvil (`Sheet`) y del disparador del primitivo,
  en español.
- Tooltips en «Cambiar tema» y «Cerrar sesión».
- Transición sol/luna al cambiar de tema.
- La cabecera móvil como en el canvas: «Alternar barra lateral» + isotipo a la izquierda; tema y
  cerrar sesión a la derecha, los tres con el mismo aspecto.

**Lo que NO entra:**
- La raíz `/` con pantalla de aviso y el `start_url` de la PWA: es QC-258.
- Las piezas compartidas del rediseño (Button con tallas nuevas, StatusBadge, PageHeader…): es
  QC-256.
- El plegado automático a modo icono en tablet (el canvas lo hace por debajo de 1100 px). Ver P6.
- La forma de la pastilla del borde (el canvas la pinta redonda, de 28 px y con fondo de tarjeta).
  Solo cambia su icono. Ver P5.
- El texto «Close» del botón X de `Sheet` y `Dialog` (en el menú móvil ese botón está oculto). Ver
  P8.
- La transición de fondo y texto de toda la página al cambiar de tema («tema: fondo y texto 300 ms»
  en la ficha de `Superficies.dc.html`).
- Cambiar etiquetas, rutas, permisos, secciones u orden del menú.

## Decisiones cerradas (no reabrir)

| # | Decisión | Quién y cuándo | Enmienda a | Cubierta por |
| --- | --- | --- | --- | --- |
| D1 | Reconsiderar cada icono del menú: uno distinto por destino, con iconos de `lucide-react`, y el set completo se propone en el spec | humano, 2026-10-10 (`progress/rediseno.md` D11; encargo del spec) | — | R1, R2, R3 |
| D2 | El control que abre y pliega el menú usa una flecha que gira (el humano prefiere una flecha o un chevron que gira), tanto en la pastilla del borde como en el botón móvil «Alternar barra lateral» | humano, 2026-10-10 (D11; encargo del spec) | QC-227 D12 y R39 (`PanelLeftOpen` / `PanelLeftClose`) | R4, R5, R6, R7 |
| D3 | `lang="es"`. El `Sheet` móvil del menú y el disparador del primitivo, en español | humano, 2026-10-10 (D11) | — | R14, R15, R16 |
| D4 | Tooltip en «Cambiar tema» y en «Cerrar sesión» | humano (ficha); tablero `Superficies.dc.html` | — | R10, R11, R12, R13 |
| D5 | Transición sol/luna al cambiar de tema (hoy cambia sin animación) | humano (ficha); tablero `Superficies.dc.html` | — | R17, R18, R19 |
| D6 | Lo demás del canvas queda aprobado. Cada pantalla se adapta a escritorio, tablet y teléfono | humano, 2026-10-10 (D14) | — | R9 |
| D7 | El control de la cabecera queda solo en móvil y la pastilla del borde solo en escritorio («existen 2 botones para contraer el sidebar, quita el de la cabecera») | humano, 2026-09-02 (registrada en `app/(private)/layout.tsx`) | — | R8, R9 |
| D8 | Sin dependencias nuevas: `lucide-react` y `@base-ui/react` ya están instalados | humano (encargo del spec) | — | R20 |

## Requisitos (EARS)

«El sistema» es la app web: el layout raíz, el layout privado, su cabecera, la barra lateral
privada y el primitivo `Sidebar`. «Destino del menú» es cada ítem de la navegación privada que
declara icono: los enlaces y grupos de nivel superior y los enlaces hijos que lo declaren.
«Control de la barra» es la pastilla del borde (solo escritorio) o el botón «Alternar barra
lateral» de la cabecera (solo móvil).

### Iconos del menú

**R1.** El sistema DEBE asignar a cada destino del menú un icono distinto del de todos los demás
destinos.

**R2.** El sistema DEBE dibujar cada destino del menú con este icono de `lucide-react`:

| Destino | Icono | Cambia |
| --- | --- | --- |
| Asignación | `ClipboardCheck` | sí (era `ClipboardList`) |
| Dashboard | `LayoutDashboard` | no |
| Inventario | `Package` | no |
| Pedidos | `ClipboardList` | no |
| Usuarios | `Users` | no |
| Producción (grupo) | `Factory` | no |
| Fórmulas (hijo de Producción) | `FlaskConical` | no (el hijo no lo dibuja) |
| Proveedores | `Truck` | no |
| Clientes | `SquareUser` | sí (era `Contact`; ver P3) |
| Presentaciones | `Boxes` | no |
| Unidades | `Ruler` | sí (era `FlaskConical`) |
| Integraciones (grupo) | `Puzzle` | no |
| Proveedor IA, Inventarios, WhatsApp (hijos) | sin icono | no |

El motivo de cada icono está en `design.md > 2`.

**R3.** El sistema NO DEBE cambiar la etiqueta, la ruta, el `testId`, el permiso, la sección ni el
orden de ningún destino del menú.

### Control de la barra

**R4.** MIENTRAS la barra lateral de escritorio está expandida, la pastilla del borde DEBE mostrar
una flecha que apunta a la izquierda (plegar). MIENTRAS está en modo icono, DEBE mostrar la misma
flecha girada 180°, apuntando a la derecha (desplegar).

**R5.** MIENTRAS el panel móvil está cerrado, el control «Alternar barra lateral» de la cabecera
DEBE mostrar la misma flecha que la pastilla, apuntando a la derecha (abrir). MIENTRAS está
abierto, DEBE apuntar a la izquierda (cerrar).

**R6.** CUANDO el usuario cambia el estado de la barra con un control de la barra, el sistema DEBE
girar la flecha de ese control, sin sustituirla por otro icono, en `--dur-base` con
`--ease-standard`.

**R7.** CUANDO se carga o se hidrata una pantalla privada sin que el usuario haya tocado un
control de la barra, el sistema NO DEBE girar la flecha de ningún control de la barra.

**R8.** El sistema DEBE conservar en los dos controles de la barra su nombre accesible
(«Plegar o desplegar la barra lateral» la pastilla, «Alternar barra lateral» el de la cabecera),
su `aria-expanded`, su `aria-controls`, su `data-testid` y dónde se muestran: la pastilla solo en
viewport ancho y el de la cabecera solo en viewport angosto (D7).

### Cabecera

**R9.** MIENTRAS el viewport es angosto, la cabecera privada DEBE mostrar a la izquierda el control
«Alternar barra lateral» seguido del isotipo, y a la derecha «Cambiar tema» y «Cerrar sesión»;
los tres botones DEBEN tener el mismo aspecto (variante de contorno) y una caja de al menos
44 × 44 px.

**R10.** CUANDO el puntero se posa sobre «Cambiar tema» o el foco de teclado llega a él, el sistema
DEBE mostrar debajo del botón un tooltip con el texto «Cambiar tema».

**R11.** CUANDO el puntero se posa sobre «Cerrar sesión» o el foco de teclado llega a él, el
sistema DEBE mostrar debajo del botón un tooltip con el texto «Cerrar sesión», entero dentro de
la ventana también en un teléfono de 390 px de ancho.

**R12.** CUANDO el puntero sale del botón o el foco lo abandona, el sistema DEBE ocultar su
tooltip.

**R13.** El sistema DEBE conservar como nombre accesible de «Cambiar tema» y de «Cerrar sesión» el
mismo texto de hoy, y DEBE conservar su comportamiento: un clic alterna el tema; un clic envía el
formulario de cierre de sesión y deja el botón deshabilitado mientras envía.

### Idioma

**R14.** El sistema DEBE declarar `lang="es"` en el elemento `html` de todas las páginas, públicas
y privadas.

**R15.** MIENTRAS el panel móvil del menú está abierto, el sistema DEBE exponer como nombre
accesible del panel «Menú» y como descripción un texto en español (propuesta en P2).

**R16.** El sistema NO DEBE exponer textos en inglés en el disparador ni en el carril del
primitivo de la barra lateral: su texto para lectores de pantalla, su `aria-label` y su `title`
DEBEN decir «Alternar barra lateral».

### Tema

**R17.** CUANDO el modo de tema cambia entre claro y oscuro, el sistema DEBE cruzar los iconos del
control de tema: el que sale gira 90° y se reduce a escala 0 con fundido; el que entra pasa de
−90° y escala 0 a 0° y escala 1 con fundido; todo en `--dur-base` con `--ease-standard`.

**R18.** El sistema NO DEBE hacer depender del modo de tema resuelto el marcado del control de
tema: el HTML del servidor y el del cliente DEBEN ser iguales, y el icono visible DEBE salir solo
de la clase `dark` del documento.

**R19.** MIENTRAS el sistema operativo pide movimiento reducido, el sistema DEBE dejar la flecha de
los controles de la barra y los iconos de tema en su estado final sin giro ni escala visibles
(regla global de QC-228 R21).

### Comportamiento y dependencias

**R20.** El sistema NO DEBE añadir entradas a `dependencies` ni a `devDependencies` de
`package.json`.

**R21.** El sistema DEBE conservar el comportamiento existente del shell: las pruebas unitarias y
E2E que ya cubren la barra lateral, la cabecera, el tema y el cierre de sesión DEBEN seguir
verdes. Solo se enmiendan los casos que fijan un icono que esta ficha cambia, con nota de
enmienda (lista cerrada en `design.md > 9`).

### Cobertura de las decisiones cerradas

D1→R1, R2, R3 · D2→R4, R5, R6, R7 · D3→R14, R15, R16 · D4→R10, R11, R12, R13 · D5→R17, R18, R19 ·
D6→R9 · D7→R8, R9 · D8→R20.

## Preguntas abiertas

Cada una lleva una propuesta por defecto. Si el humano aprueba el spec sin responderla, vale la
propuesta.

**P1. Editar el primitivo `components/ui/sidebar.tsx`.** La regla que cita `app/(private)/layout.tsx`
(R21 y R48 de los specs del layout privado) dice que el primitivo no se edita y se compone por
`className`. Los textos en inglés de R15 y R16 están escritos dentro del primitivo y no hay prop ni
`className` que los cambie desde fuera. **Propuesta:** se edita el primitivo, **solo** en sus cuatro
literales de texto (título y descripción del `Sheet`, texto `sr-only` del disparador, `aria-label`
y `title` del carril). Ninguna clase ni comportamiento cambia. Ya hay precedente: QC-227 (P13) y
QC-228 tocaron ese archivo. Alternativas descartadas en `design.md > 10`.

Efecto a saber: los textos nuevos del primitivo valen para cualquier consumidor del `Sidebar`. Hoy
el único es la barra privada.

**P2. Textos del `Sheet` móvil.** **Propuesta:** título «Menú» (es el `aria-label` del panel móvil en
`Superficies.dc.html`) y descripción «Navegación principal de QuimiCloude.». Los dos son solo para
lectores de pantalla (`sr-only`).

**P3. Icono de Clientes.** El canvas (`Sidebar.dc.html`, icono `clientes`) dibuja una persona dentro
de un cuadrado, que es `SquareUser`; hoy es `Contact` (una tarjeta de agenda). `Contact` ya era
único, así que no hace falta cambiarlo para cumplir R1. **Propuesta:** `SquareUser`, como el canvas
aprobado (D6). Ojo: QC-244 (pendiente, sin asignar) convierte Clientes en grupo y su ficha cita el
icono `contact`; la que llegue segunda adapta ese dato.

**P4. Tamaño de los botones de la cabecera.** La nota de `Superficies.dc.html` dice «a 40 px con
objetivo de 44 px». Hoy «Cambiar tema» y «Cerrar sesión» miden 44 px y tienen tests que lo fijan.
**Propuesta:** los tres botones a 44 × 44 px (se mantiene lo de hoy y el control móvil sube de 32 a
44 px, que además cumple el objetivo táctil del repo).

**P5. Forma de la pastilla del borde.** El canvas la pinta redonda, de 28 px y con fondo de tarjeta.
La de hoy es cuadrada con radio de 10 px y fondo del panel, con colores fijados por QC-227 R38.
**Propuesta:** esta ficha solo cambia el icono; la forma se queda como está.

**P6. Plegado automático en tablet.** El canvas pliega la barra a modo icono por debajo de 1100 px
sin que nadie la toque. **Propuesta:** fuera de esta ficha. Si se quiere, va en una ficha propia,
porque cambia el estado que guarda la cookie de la barra.

**P7. Choque de archivos con otras fichas.** `app/layout.tsx` también lo tocará QC-258
(`theme_color` / `viewport` en la metadata), y `lib/shared/navigation/private-nav.ts` lo tocará
QC-244. Esta ficha solo cambia una línea en cada uno (`lang` y tres valores `icon`). **Propuesta:**
que las tome la persona que tenga esta ficha en vuelo, o que se ordenen; decide el leader con
`scripts/archivos-en-vuelo.mjs`.

**P8. «Close» en inglés de `Sheet` y `Dialog`.** El catálogo lo anota en las filas de los dos
primitivos. En el menú móvil el botón X está oculto, así que no se ve ni se anuncia. **Propuesta:**
fuera de esta ficha; entra en la de textos generales (D9 de `progress/rediseno.md`).

**P9. Tablero del control móvil.** `Superficies.dc.html` y `Pedidos.dc.html` pintan el botón móvil
con un icono de panel. La flecha que gira sale de la pastilla de `Sidebar.dc.html` y de D2 (el
humano pidió aplicarla a los dos controles). **Propuesta:** D2 vale como aprobación del cambio
visual y no hace falta un tablero nuevo para el botón móvil.
