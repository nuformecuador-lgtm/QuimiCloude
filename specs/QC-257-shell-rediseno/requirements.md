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
| D9 (P1) | Se edita `components/ui/sidebar.tsx`, **solo** en sus cuatro literales de texto (título y descripción del `Sheet`, `sr-only` del disparador, `aria-label` y `title` del carril). Ni clases ni comportamiento | humano, 2026-10-10 (aprobación del spec) | R21 y R48 de los specs del layout privado («el primitivo no se edita») | R15, R16 |
| D10 (P2) | Textos del `Sheet` móvil: título «Menú», descripción «Navegación principal de QuimiCloude.» | humano, 2026-10-10 (aprobación del spec) | — | R15 |
| D11 (P3) | Clientes pasa a `SquareUser`, como el canvas. QC-244 ajustará su icono | humano, 2026-10-10 (aprobación del spec) | — | R2 |
| D12 (P4) | Los tres botones de la cabecera miden 44 × 44 px (no los 40 px del tablero) | humano, 2026-10-10 (aprobación del spec) | — | R9 |
| D13 (P5) | La pastilla del borde no cambia de forma; solo su icono | humano, 2026-10-10 (aprobación del spec) | — | R4, R8 |
| D14 (P6) | El plegado automático a modo icono en tablet queda fuera de esta ficha | humano, 2026-10-10 (aprobación del spec) | — | — (fuera de alcance) |
| D15 (P7) | El orden de integración con QC-258 y QC-244 lo decide el leader | humano, 2026-10-10 (aprobación del spec) | — | — (proceso) |
| D16 (P8) | El «Close» en inglés de `Sheet` y `Dialog` queda fuera; va en la ficha de textos generales (D9 de `progress/rediseno.md`) | humano, 2026-10-10 (aprobación del spec) | — | — (fuera de alcance) |
| D17 (P9) | D11 de `progress/rediseno.md` aprueba la flecha también en el botón móvil, aunque el tablero dibuje un icono de panel. No hace falta un tablero nuevo | humano, 2026-10-10 (aprobación del spec) | Icono de panel de `Superficies.dc.html` y `Pedidos.dc.html` | R5 |

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
accesible del panel «Menú» y como descripción «Navegación principal de QuimiCloude.» (D10).

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
D6→R9 · D7→R8, R9 · D8→R20 · D9→R15, R16 · D10→R15 · D11→R2 · D12→R9 · D13→R4, R8 · D17→R5.
D14, D15 y D16 no llevan requisito: dejan algo fuera de alcance o son de proceso.

## Preguntas abiertas

Ninguna. El humano aprobó el spec el 2026-10-10 con los valores propuestos. Las antiguas P1–P9
son las decisiones D9–D17 (la columna `#` conserva su número `P`, porque `design.md` y el texto de
arriba las citan así).
