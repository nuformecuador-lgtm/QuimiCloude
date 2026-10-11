# QC-257 — shell-rediseno · design.md

## Lo que ya existe

**Términos buscados.** En el board (`feature_list.json`, todos los estados): «menú», «barra
lateral», «sidebar», «icono», «tooltip», «cabecera», «tema», «idioma». En `specs/`:
`components/ui/sidebar.tsx`, `PanelLeft`, `transition-none`, `R21`/`R48`. En el código (grafo y
Grep): `NAV_ICONS`, `NavIconName`, `SidebarToggle`, `ThemeToggle`, `LogoutButton`,
`SIDEBAR_EDGE_TOGGLE_LABEL`, `SidebarTrigger`, `TooltipProvider`, `lang=`.

**Qué apareció y qué se hace con ello.**

| Hallazgo | Qué es | Decisión |
| --- | --- | --- |
| QC-11, QC-40, QC-227, QC-228, QC-29 (`done`) | El layout privado, el ajuste de la barra, la marca de los componentes, el movimiento y el tema | Se **reutiliza** todo. Esta ficha solo cambia iconos, textos, tooltips y una transición. Enmienda QC-227 D12/R39 (iconos de panel → flecha), por D2 |
| QC-244 (`pending`, sin asignar) «Menú de Clientes con Contactos» | Convierte el ítem Clientes en grupo y cita el icono `contact` | **No es la misma ficha**: solapa en un dato (el icono de Clientes, P3) y en un archivo (`private-nav.ts`, P7). No bloquea |
| QC-258 (`pending`) «Raíz con pantalla de aviso» | Toca `app/layout.tsx` (metadata) | Solapa en un archivo (P7). El `lang` es de esta ficha (D3) |
| QC-256 (`pending`, en paralelo) «Piezas compartidas» | Button con tallas nuevas y otras piezas | Esta ficha **no** edita `components/ui/button.tsx` ni crea piezas compartidas |
| `NAV_ICONS` + `NavIconName` (`lib/shared/navigation/`) | El mapa nombre → icono, separado por la frontera servidor/cliente | Se **extiende** con tres nombres y tres filas |
| `ChevronRightIcon` que gira 90° en los grupos del menú (`components/private/app-sidebar.tsx`, QC-228 R12) | Precedente de flecha que gira con `--dur-base` / `--ease-standard` | Se **reutiliza** el patrón para el control de la barra |
| `SidebarTrigger` pinta `children` si se le pasan (QC-227 P13) | Punto de extensión ya abierto | Se **reutiliza**: `SidebarToggle` le pasa la flecha |
| `Tooltip`, `TooltipTrigger`, `TooltipContent`, `TooltipProvider` (`components/ui/tooltip.tsx`) | Primitivo de Base UI ya en el catálogo | Se **reutiliza** (paso 1 de la regla). No hace falta un Tooltip compartido nuevo |
| Iconos `dark:scale-0` / `dark:scale-100` con `transition-none` en `ThemeToggle` | El cruce sol/luna ya existe, sin animación | Se **reutiliza** el cruce por CSS y se le quita el `transition-none` |

**Filas de `components/shared/CATALOGO.md` consultadas.** `Button` (sin cambios), `Sheet` (sin
cambios; su «Close» en inglés queda en P8), `SidebarProvider`/`Sidebar` (se toca: textos en
español, P1), `Tooltip` (se reutiliza tal cual), `BrandLogo` (isotipo de la cabecera móvil, sin
cambios), `readSidebarOpenState` y `THEME_*` (sin cambios).

**Componentes nuevos:** ninguno. Todo cae en el paso 1 (reutilizar) o 2 (extender) de la regla
de decisión.

## 1. Tableros que respaldan cada cambio visual

| Cambio | Tablero | Qué dice |
| --- | --- | --- |
| Iconos del menú | `docs/diseno/canvas/Sidebar.dc.html` (mapa `I`) | Un dibujo distinto por destino: `asignacion` es un portapapeles con marca de verificación, `unidades` una regla, `clientes` una persona en un cuadrado |
| Flecha de la pastilla | `docs/diseno/canvas/Sidebar.dc.html` (`.railbtn`, trazo `m15 6-6 6 6 6`) y `docs/diseno/canvas/qc.css` (`.railbtn .ic`, `.side.col .railbtn .ic{rotate:180deg}`) | Chevron a la izquierda que gira 180° al plegar, con `var(--d-b) var(--e-std)` |
| Flecha del botón móvil | Igual que la pastilla, por D2 (P9) | Los tableros de cabecera pintan aún un icono de panel; el humano pidió la flecha en los dos controles |
| Cabecera y cabecera móvil | `docs/diseno/canvas/Superficies.dc.html` (`.topbar`, `.tb-left`, `.tb-right`) y cabecera de `docs/diseno/canvas/Pedidos.dc.html` | Izquierda solo en móvil: «Alternar barra lateral» + isotipo. Derecha: tema y cerrar sesión. Los tres botones con el mismo aspecto (`.tb-btn`) |
| Tooltips | `docs/diseno/canvas/Superficies.dc.html` (`<span class="tip">`) y `qc.css` (`.tb-btn .tip`) | Debajo del botón, con fundido de 150 ms; «Cerrar sesión» alineado a la derecha en el teléfono |
| Sol y luna | `docs/diseno/canvas/Superficies.dc.html` (ficha «Animación») y `qc.css` (`.theme-ic`) | «sol y luna se cruzan girando 90° con escala en 200 ms» |

## 2. Iconos del menú (R1, R2, R3)

Todo de `lucide-react` (ya instalado, `^1.29.0`). Los tres nuevos existen en esa versión
(`ClipboardCheck`, `Ruler`, `SquareUser`, comprobado en `lucide-react.d.ts`).

| Destino | Icono | Por qué |
| --- | --- | --- |
| Asignación | `ClipboardCheck` | Es el trabajo asignado al operario, que se cumple y se marca. Lo dibuja así el canvas. Lo separa de Pedidos, con el que compartía `ClipboardList` |
| Dashboard | `LayoutDashboard` | Paneles de un tablero de resumen. Igual que hoy y que el canvas |
| Inventario | `Package` | Un paquete: existencias en almacén. Igual que hoy y que el canvas |
| Pedidos | `ClipboardList` | La hoja de un pedido, con sus líneas. Se queda con este icono porque Asignación pasa a `ClipboardCheck`. Igual que el canvas |
| Usuarios | `Users` | Personas de la organización. Igual que hoy y que el canvas |
| Producción (grupo) | `Factory` | La planta. Igual que hoy y que el canvas |
| Fórmulas (hijo) | `FlaskConical` | El matraz es la fórmula química. Los hijos de un grupo no se dibujan con icono, pero el dato existe y ahora es único (Unidades deja el matraz) |
| Proveedores | `Truck` | Lo que llega de fuera. Igual que hoy y que el canvas |
| Clientes | `SquareUser` | Una persona externa en un recuadro, como en el canvas. No se confunde con Usuarios (`Users`, personas internas). Ver P3 |
| Presentaciones | `Boxes` | Varias cajas: los formatos de envase de un producto. Igual que hoy y que el canvas. No choca con `Package` (una sola caja, el inventario) |
| Unidades | `Ruler` | Una regla: unidades de medida. Lo dibuja así el canvas. Libera el matraz para Fórmulas |
| Integraciones (grupo) | `Puzzle` | Piezas que encajan con otros sistemas. Igual que hoy y que el canvas |
| Proveedor IA, Inventarios, WhatsApp | sin icono | Son hijos de grupo y el diseño los dibuja sin icono. No cambia |

**Cambios de código.**
- `lib/shared/navigation/private-nav.ts`: `NavIconName` gana `'clipboard-check'`, `'ruler'` y
  `'square-user'`. Tres ítems cambian su `icon`: `nav-asignacion`, `nav-unidades`, `nav-clientes`.
  Nada más del array se toca (R3).
- `lib/shared/navigation/nav-icons.ts`: tres filas nuevas en `NAV_ICONS`. El `Record` ya obliga a
  que cuadren.
- **No se quitan nombres sin uso** (`bell`, `shopping-cart` y ahora `contact`). Quitar `contact`
  rompería la ficha de QC-244, que lo cita. Limpiar la unión no es de esta ficha.

**R1 lo vigila un test, no la memoria de quien añada el próximo ítem.** Recorre
`PRIVATE_NAV_ITEMS` (nivel superior e hijos), junta los `icon` declarados y exige que no se
repitan y que cada uno tenga fila en `NAV_ICONS`.

## 3. Control de la barra: una flecha que gira (R4–R8)

Un **solo** icono, `ChevronLeftIcon`, en los dos controles. La dirección la da un giro, no un
cambio de icono:

| Control | Estado | Flecha |
| --- | --- | --- |
| Pastilla del borde (escritorio) | expandida | ← (sin giro): plegar |
| Pastilla del borde (escritorio) | modo icono | → (`rotate-180`): desplegar |
| «Alternar barra lateral» (móvil) | panel cerrado | → (`rotate-180`): abrir |
| «Alternar barra lateral» (móvil) | panel abierto | ← (sin giro): cerrar |

Regla única: **la flecha apunta hacia donde se va a mover el panel.** El panel entra por la
izquierda: cerrado o plegado, la flecha apunta a la derecha; abierto, a la izquierda. Es lo que
pintan el canvas (`.side.col .railbtn .ic{rotate:180deg}`) y el chevron de los grupos.

**Clases del icono:** `transition-transform duration-(--dur-base) ease-(--ease-standard)` y
`rotate-180` cuando está cerrado o plegado. En Tailwind v4, `rotate-180` escribe la propiedad
`rotate`, y `transition-transform` ya la incluye. Es lo mismo que hace el chevron de los grupos
(`group-data-open/menu-button:rotate-90`).

**De dónde sale el estado, y por qué no da giros fantasma (R7).**
- **Pastilla:** de `open`. El servidor lo siembra desde la cookie (`readSidebarOpenState`), así que
  el primer render del cliente coincide con el HTML y no hay giro al hidratar.
- **Botón móvil:** de `openMobile`, **no** de `isMobile ? openMobile : open`. `useIsMobile`
  arranca en `false` y en el primer render el primitivo cree que es escritorio. Si la flecha
  leyera `open` (que puede ser `true` por la cookie de escritorio), en el teléfono giraría sola al
  hidratar. Con `openMobile` sale `false` en el servidor y en el cliente, y solo cambia cuando el
  usuario abre el panel. El botón solo se ve en viewport angosto (D7), así que en escritorio su
  flecha no se ve.
- El `aria-expanded` del botón móvil **no cambia**: sigue siendo `isMobile ? openMobile : open`.
  QC-11 lo exige así y R8 lo conserva.

**Cambios de código.**
- `components/private/app-sidebar.tsx`: la pastilla deja `PanelLeftCloseIcon` /
  `PanelLeftOpenIcon` y pinta `ChevronLeftIcon` con las clases de arriba. Tamaño `size-3.5`, como
  hoy (14 px, el mínimo de QC-227 R38). Nombre, `aria-*`, `data-testid`, colores y forma no
  cambian (P5).
- `app/(private)/components/sidebar-toggle.tsx`: le pasa a `SidebarTrigger` el `ChevronLeftIcon`
  girado según `openMobile`.

## 4. Cabecera móvil (R9)

El canvas pinta los tres botones de la cabecera iguales (`.tb-btn`). Hoy «Cambiar tema» y «Cerrar
sesión» son `variant="outline"` de 44 px, y el control móvil es el `ghost` de 32 px que trae
`SidebarTrigger`.

`SidebarToggle` le pasa a `SidebarTrigger` `variant="outline"` y `className="size-11"`.
`SidebarTrigger` reparte sus props después de sus valores por defecto, y `cn` resuelve el tamaño,
así que **no se edita el primitivo** para esto. Resultado: tres botones de contorno de 44 × 44 px
(P4), y el control móvil cumple el objetivo táctil del repo, que hoy no cumple.

El orden «Alternar barra lateral» + isotipo a la izquierda y el `md:hidden` ya existen en
`app/(private)/layout.tsx` y no cambian.

## 5. Tooltips de la cabecera (R10–R13)

Se reutiliza el primitivo `Tooltip` de `components/ui/tooltip.tsx` (Base UI). Sin piezas nuevas.

```tsx
<Tooltip>
  <TooltipTrigger render={<Button variant="outline" className="size-11" aria-label={THEME_TOGGLE_LABEL} … />}>
    …iconos…
  </TooltipTrigger>
  <TooltipContent side="bottom">{THEME_TOGGLE_LABEL}</TooltipContent>
</Tooltip>
```

- **Mismo texto, una sola fuente:** el tooltip pinta la constante que ya da el nombre accesible
  (`THEME_TOGGLE_LABEL`, `LOGOUT_LABEL`). El `aria-label` se queda (R13).
- **Cerrar sesión** sigue siendo un `<button type="submit">` dentro de su `<form>`, con
  `useFormStatus` en `LogoutSubmit`. El `Tooltip` envuelve al botón por `render`, sin tocar el
  formulario ni la Server Action.
- **Retardo:** `app/(private)/layout.tsx` envuelve el grupo de la derecha de la cabecera en un
  `TooltipProvider` (retardo 0 por defecto del primitivo). Sin proveedor, Base UI espera su
  retardo por defecto antes de mostrar el tooltip. El canvas lo muestra al pasar el puntero, sin
  espera. `TooltipProvider` es cliente y el layout sigue siendo Server Component: solo le pasa
  `children`.
- **Posición:** `side="bottom"`, como el canvas. Para «Cerrar sesión», pegado al borde derecho del
  teléfono, el posicionador de Base UI lo desplaza dentro de la ventana (R11). Si el E2E muestra
  que no basta, `align="end"`, como el canvas (`left:auto; right:0`).
- **Movimiento:** el del primitivo, que ya cumple QC-228 R8 (`--dur-fast`, entrada y salida).
- **Multiplataforma:** el tooltip **no** es la única vía. El icono y el nombre accesible siguen
  ahí, y en táctil no hace falta que abra. Cumple «`:hover` nunca es la única forma».

## 6. Sol y luna (R17–R19)

Se queda el cruce por CSS que ya existe: los dos iconos se pintan siempre y la variante `dark:`
decide cuál se ve. Así el HTML no depende del modo resuelto (QC-29 R12, aquí R18). Cambian las
clases:

| Icono | Claro | Oscuro |
| --- | --- | --- |
| `SunIcon` | `rotate-0 scale-100 opacity-100` | `dark:rotate-90 dark:scale-0 dark:opacity-0` |
| `MoonIcon` (`absolute`) | `-rotate-90 scale-0 opacity-0` | `dark:rotate-0 dark:scale-100 dark:opacity-100` |

Los dos llevan `transition-[rotate,scale,opacity] duration-(--dur-base) ease-(--ease-standard)` y
pierden `transition-none`. Son los valores de `qc.css > .theme-ic` (200 ms, curva estándar) con los
tokens de QC-226. Cumplen QC-228 R1 (≤ 400 ms) y R2 (solo curvas de token).

**Sin giro al cargar.** Con preferencia explícita, la clase `dark` sale del servidor. Con
`system`, la pone `THEME_INIT_SCRIPT`, que corre antes de que se pinte el botón. En los dos casos el
primer estilo calculado del icono ya es el final y no hay transición. Cuando el sistema operativo
cambia de modo en vivo (QC-29 R17), los iconos se cruzan, y eso es lo que se quiere.

**Movimiento reducido:** lo resuelve la regla global de `app/globals.css` (QC-228 R21): la
transición dura 0,01 ms y se ve el estado final.

## 7. Idioma (R14, R15, R16)

- `app/layout.tsx`: `lang="en"` → `lang="es"`. Una línea.
- `components/ui/sidebar.tsx` (P1): cuatro literales y nada más.

| Dónde | Hoy | Pasa a |
| --- | --- | --- |
| `SheetTitle` del panel móvil | «Sidebar» | «Menú» (P2) |
| `SheetDescription` del panel móvil | «Displays the mobile sidebar.» | «Navegación principal de QuimiCloude.» (P2) |
| `sr-only` de `SidebarTrigger` | «Toggle Sidebar» | «Alternar barra lateral» |
| `aria-label` y `title` de `SidebarRail` | «Toggle Sidebar» | «Alternar barra lateral» |

`SidebarToggle` ya pone `aria-label="Alternar barra lateral"`, que gana como nombre accesible.
Con el `sr-only` en español, el texto oculto dice lo mismo. `SidebarRail` no lo usa la app, pero
vive en el mismo archivo y R16 lo cubre para que no quede inglés en el primitivo.

**Catálogo.** La fila `SidebarProvider`/`Sidebar` se actualiza en el mismo commit: el `Alcance`
dice que los textos del cajón y del disparador están en español y la columna `Diseño` pasa a
`docs/diseno/canvas/Sidebar.dc.html`. La guardia `guard-catalogo-de-componentes` debe seguir
verde.

## 8. Modelo de datos, rutas y contratos

- **Tablas, RLS y migraciones:** ninguna. Esta ficha no toca la base.
- **Rutas y endpoints:** ninguno nuevo ni cambiado.
- **Contratos:** `NavIconName` gana tres literales. `NAV_ICONS` gana tres filas. Las constantes
  exportadas (`SIDEBAR_TOGGLE_LABEL`, `SIDEBAR_EDGE_TOGGLE_LABEL`, `THEME_TOGGLE_LABEL`,
  `LOGOUT_LABEL`, `SIDEBAR_PANEL_ID`) no cambian.
- **Integraciones:** ninguna.
- **Dependencias:** ninguna nueva (R20). `lucide-react` y `@base-ui/react` ya están en
  `docs/dependencias.md`.

## 9. Tests

**Nuevos** (`tests/unit/shell/`, proyecto `ui` de vitest para los `.tsx`):

| Archivo | Cubre |
| --- | --- |
| `tests/unit/shell/nav-iconos.test.ts` | R1 (sin repetidos, nivel superior e hijos), R2 (la tabla, destino por `testId` → nombre de icono → componente de `NAV_ICONS`), R3 (etiqueta, ruta, `testId`, permiso, sección y orden iguales a los de antes, fijados en el test) |
| `tests/unit/shell/control-barra.test.tsx` | R4 (pastilla con `lucide-chevron-left`, sin y con `rotate-180`), R5 (botón móvil según `openMobile`), R6 (el mismo `<svg>` antes y después del clic, clases de transición con los tokens), R8 (nombres, `aria-*`, `data-testid` y `md:hidden` / `hidden md:inline-flex`), R9 (los tres botones de la cabecera `outline` y `size-11`) |
| `tests/unit/shell/cabecera-tooltips.test.tsx` | R10, R11, R12 con puntero (`user.hover` / `user.unhover`); R13 (nombre accesible y comportamiento de clic y de envío, sin cambios) |
| `tests/unit/shell/tema-sol-luna.test.tsx` | R17 (clases de giro, escala, opacidad, duración y curva; sin `transition-none`), R18 (el HTML de `renderToString` es el mismo con preferencia `light` y `dark`) |
| `tests/unit/shell/idioma.test.tsx` | R14 (`RootLayout` renderizado en servidor, mismo arnés que `tests/unit/theme/theme-provider.test.tsx > renderRootLayoutHtml`), R15 (panel móvil abierto: `getByRole('dialog', { name: 'Menú' })` y su descripción), R16 (`SidebarTrigger` y `SidebarRail` sin «Toggle Sidebar») |
| `tests/guards/guard-dependencias-aprobadas.test.ts` (existente, sin cambios) | R20, como en QC-228 R25. Además, `git diff origin/dev -- package.json` vacío, que el reviewer comprueba |
| `e2e/shell-rediseno.spec.ts` | R6 (giro medido: `rotate` calculado y `transition-duration` de 0,2 s), R7 (con la cookie de barra expandida y viewport de 390 px, tras cargar no hay ninguna `CSSTransition` sobre la flecha), R10 y R11 con teclado (Tab) y con puntero, R11 dentro de la ventana a 390 px, R14 (`html[lang=es]` en `/login` y en una privada), R17 (el icono saliente termina con `scale` 0 y `opacity` 0), R19 (con `reducedMotion: 'reduce'`, la flecha y los iconos de tema llegan al estado final sin transición medible) |

**Se enmiendan, con nota `ENMIENDA QC-257`** (lista cerrada, R21):

| Archivo | Caso | Cambio |
| --- | --- | --- |
| `tests/unit/marca/sidebar-carril.test.ts` | R39 (pastilla y control del encabezado) | `lucide-panel-left-open` / `-close` → `lucide-chevron-left` con o sin `rotate-180`. El caso «SidebarTrigger sin children sigue pintando PanelLeftIcon» **no cambia** |
| `e2e/marca-componentes.spec.ts` | R39 (pastilla y encabezado) | Mismo cambio de clases. Los casos R38 no cambian: miden caja y contraste del icono, no su nombre. Si el contraste de R38 con hover cambia por pasar a `outline`, se mide y se anota (es el velo de QC-228 R17) |
| `tests/unit/configuracion-ui/private-nav-usuarios.test.ts` | Línea que fija el icono de Unidades | `'flask-conical'` → `'ruler'` |
| `tests/unit/configuracion-ui/private-nav-unidades.test.ts` | Caso que fija el icono de Unidades | `'flask-conical'` → `'ruler'` |

Si el implementer encuentra otro test que fije un icono, un texto o una clase que esta ficha
cambia, **para y lo anota** en `progress/impl_QC-257.md`. No lo enmienda sin pasar por el leader:
la lista de arriba es cerrada.

## 10. Alternativas descartadas

**A. Dos iconos que se alternan (`ChevronLeft` / `ChevronRight`, o los `PanelLeftOpen` /
`PanelLeftClose` de hoy).** Funciona y es lo que hay ahora, pero cambiar de icono no se puede
animar: el humano pidió «un chevron que gira». Con un solo icono y un giro, el estado y la
transición salen de la misma clase.

**B. `ChevronsLeft` (doble flecha) en la pastilla.** Es el icono de «plegar» de muchos paneles.
Se descarta porque el canvas aprobado usa una flecha simple (`m15 6-6 6 6 6`) y porque así la
pastilla habla el mismo idioma que el chevron simple de los grupos.

**C. Hamburguesa (`Menu`) en el botón móvil.** Es lo habitual en móvil, pero el humano pidió la
misma flecha en los dos controles (D2).

**D. Textos del `Sheet` como props opcionales del `Sidebar` (paso 2 de la regla, «extender»), con
el inglés por defecto.** Deja el primitivo sin editar sus literales, pero mantiene el inglés como
valor por defecto en una app que solo habla español. Además añade API que nadie más necesita. Se
prefiere cambiar los cuatro literales (P1).

**E. Sacar el panel móvil del primitivo y montar un `Sheet` propio en `AppSidebar`.** Evita tocar
`components/ui/sidebar.tsx`, pero duplica el estado `openMobile`, el cierre al navegar y el
`aria-hidden` del resto. Demasiado código para cambiar dos textos.

**F. Un `ShellTooltip` compartido en `components/shared`.** Lo usarían dos botones de la misma
ruta. Por la regla, una pieza sube a `shared` con la segunda ruta, y el primitivo ya da todo lo que
hace falta.

**G. Elegir el icono del tema en el render según `resolved`.** Permitiría animar con estado de
React, pero rompe QC-29 R12: el HTML del servidor no sabe el modo con `system` y habría
discrepancia de hidratación y parpadeo. Se queda el cruce por CSS.

## 11. Multiplataforma

Nada es solo de escritorio. Los tooltips no son la única vía (el nombre accesible y el icono
siguen ahí). Los tres botones de la cabecera miden 44 × 44 px. Los giros y escalas son `rotate`,
`scale` y `opacity`, que soportan Safari/WebKit y Chrome Android. Con movimiento reducido no hay
giro visible (R19).
