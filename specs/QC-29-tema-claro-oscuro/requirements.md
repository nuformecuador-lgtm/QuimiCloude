# QC-29 — tema-claro-oscuro · requirements.md

> Notación EARS (`docs/specs.md`). Cada `R<n>` mapea a un test nombrado en `tasks.md`.
> El insumo de diseño (`design-input-tokens.md`) es la fuente de los colores y de las
> decisiones ya cerradas por el humano: aquí no se re-abren ni se re-inventan.

## Alcance

Dos cosas en la misma ficha porque tocan los mismos archivos:

1. **Esquema de color.** Reemplazar la paleta neutra que dejó `shadcn init` en
   `app/globals.css` por la del diseño aprobado (base agua + acento naranja), definida sobre
   los **mismos** tokens que ya existen, en `:root` (claro) y `.dark` (oscuro), en oklch.
2. **Elección de modo.** `light` / `dark` / `system`, con `system` por defecto la primera vez,
   preferencia recordada entre recargas y entre sesiones del navegador, sin parpadeo del modo
   equivocado, y un control con nombre accesible en el encabezado de la zona privada.

Como el diseño describe la barra lateral como **panel flotante con degradado tenue**, las
medidas de ese panel entran en esta ficha (R18–R20), con una restricción dura: se aplican
**desde fuera** de `components/ui/` (R21).

**No entra:** rediseñar pantallas, tocar el contenido del dashboard (sigue vacío a propósito,
QC-12 R3), añadir acentos nuevos, cambiar la estructura o la navegación de la barra lateral, y
los `--chart-*` (ver Preguntas abiertas).

## Decisiones cerradas (no reabrir)

| # | Decisión | Valor | Quién y cuándo | Cubierta por |
| --- | --- | --- | --- | --- |
| D1 | Alcance | Una sola feature: esquema de color **y** conmutador de modo | humano, 2026-09-02 | R1–R6, R7–R17 |
| D2 | Mecanismo | **Código propio**: cookie de preferencia de UI escrita en cliente y leída en el layout servidor, más script propio anti-parpadeo. Mismo patrón que `SIDEBAR_STATE_COOKIE` (`lib/shared/ui/sidebar-state.ts` + `app/(private)/layout.tsx`) | humano, 2026-09-02 (revisión del spec) | R7, R9, R10, R11, R17, R29; `design.md > 3` |
| D3 | Opciones de modo | `light`, `dark`, `system` | humano, 2026-09-02 | R8, R14 |
| D4 | Valor por defecto | `system` la primera vez | humano, 2026-09-02 | R7 |
| D5 | Ubicación del control | Encabezado de la zona privada, junto a `SidebarToggle` | humano, 2026-09-02 | R13 |
| D6 | Paleta base | Agua: `#ffffff · #cceae8 · #a8dcd9 · #68c3b7 · #539091` | humano, 2026-09-02 | R1, R2, R3 |
| D7 | Acento | Naranja, profundizado en modo claro | humano, 2026-09-02 | R4 |
| D8 | Medidas del panel flotante | Entran en la ficha, pero **sin editar `components/ui/`** | spec_author, 2026-09-02 (`design.md > 4`) | R18, R19, R20, R21 |
| D9 | Dependencias | **Ninguna dependencia nueva entra en esta feature.** `next-themes` fue propuesta con estado `excepcion` (18 meses sin publicar) y el humano la **rechazó**: prefiere pagar el script anti-parpadeo propio antes que meter una librería que lleva año y medio sin release en una superficie que este repo ya sabe resolver. La regla 7 de `CLAUDE.md` pide no reinventar lo que resuelve una librería *mantenida*, y el humano decidió que esta no lo está lo suficiente | humano, 2026-09-02 (revisión del spec) | R28 |
| D10 | Contraste del acento en modo claro | Se acepta `3,75:1` para `--primary-foreground` sobre `--primary`. Un botón es **componente de UI**, y AA le exige `3:1`, no `4.5:1`. No se añade requisito que exija AA de texto sobre el acento ni se retoca el naranja del diseño | humano, 2026-09-02 (revisión del spec) | R25 (que deliberadamente **no** incluye ese par) |

> **ENMIENDA DEL 2026-10-08 (QC-226).** D6 y D7 quedan sustituidas por la paleta «Verde
> Petróleo» de QC-226 D2: la base agua y el acento naranja salen; los valores son los de
> `tokens.css` del kit, en los dos modos. D10 queda sin objeto: el par
> `--primary-foreground`/`--primary` es ahora un par de texto y QC-226 R5 le exige `4.5:1`.

## Requisitos (EARS)

### Esquema de color

**R1.** El sistema DEBE definir en `:root` de `app/globals.css`, en notación `oklch`, los tokens
del modo claro con exactamente los valores de `design-input-tokens.md > 3`: `--background`,
`--foreground`, `--card`, `--card-foreground`, `--popover`, `--popover-foreground`, `--primary`,
`--primary-foreground`, `--secondary`, `--secondary-foreground`, `--muted`, `--muted-foreground`,
`--accent`, `--accent-foreground`, `--destructive`, `--border`, `--input`, `--ring`, `--sidebar`,
`--sidebar-foreground`, `--sidebar-primary`, `--sidebar-primary-foreground`, `--sidebar-accent`,
`--sidebar-accent-foreground`, `--sidebar-border` y `--sidebar-ring`.

**R2.** El sistema DEBE definir en `.dark` de `app/globals.css`, en notación `oklch`, los mismos
26 tokens de R1 con los valores del modo oscuro de `design-input-tokens.md > 3`.

> **ENMIENDA DEL 2026-10-08 (QC-226).** R1 y R2: los valores de `design-input-tokens.md > 3`
> quedan sustituidos por los de `tokens.css` del kit (QC-226 D2, R1, R2), que además declara
> `--chart-*`, los tokens de estado y `--sidebar-muted-foreground`.

**R3.** El sistema NO DEBE conservar ningún token de color acromático heredado de `shadcn init`
(croma `0` con luminosidad distinta de `1`) en `:root` ni en `.dark`, salvo los `--chart-*`
(R6). El blanco puro `oklch(1 0 0)` sí es un valor del diseño y está permitido.

> **ENMIENDA DEL 2026-10-08 (QC-226).** La regla sigue para los 26 tokens de R1, ahora con los
> valores de QC-226 D2. La excepción de los `--chart-*` queda sin objeto: QC-226 D2 les da
> valores de la paleta (R6, enmendado).

**R4.** El sistema DEBE usar para `--primary` y `--sidebar-primary` el **mismo** hue (`50.5`) en
los dos modos, con luminosidad `0.623` en claro y `0.750` en oscuro.

> **ENMIENDA DEL 2026-10-08 (QC-226).** El hue y las luminosidades del acento naranja quedan
> sustituidos: `--primary` y `--sidebar-primary` toman los valores petróleo de QC-226 D2 (R1, R2).

**R5.** El sistema DEBE mantener `--radius` en `0.625rem`.

> **ENMIENDA DEL 2026-10-08 (QC-226).** `--radius` pasa a `0.5rem` (QC-226 D3, R4).

**R6.** El sistema NO DEBE modificar los valores de `--chart-1` … `--chart-5` en ninguno de los
dos bloques.

> **ENMIENDA DEL 2026-10-08 (QC-226).** R6 queda sustituido: `--chart-1` … `--chart-5` toman los
> valores de `tokens.css` en los dos modos (QC-226 D2, R1, R2).

**R25.** El sistema DEBE alcanzar un contraste WCAG de al menos `4.5:1`, en los dos modos, en
los pares `--foreground` sobre `--background` y `--sidebar-foreground` sobre `--sidebar`.

> **ENMIENDA DEL 2026-10-08 (QC-226).** El contraste se mide ahora sobre la paleta de QC-226 D2,
> con la lista de pares de QC-226 R5: trece de texto a `4.5:1` y dos de interfaz a `3:1`.

### Elección de modo

**R7.** SI no hay preferencia de modo guardada en el navegador, ENTONCES el sistema DEBE
resolver el modo efectivo a partir de `prefers-color-scheme` del sistema operativo.

**R8.** CUANDO el usuario selecciona una de las tres opciones (`claro`, `oscuro`, `sistema`) en
el control de tema, el sistema DEBE registrar esa elección como preferencia del navegador.

**R9.** CUANDO el usuario recarga la página o abre una sesión nueva del navegador en el mismo
perfil, el sistema DEBE aplicar la última preferencia registrada, no el valor por defecto.

**R10.** CUANDO se carga por primera vez cualquier página de la aplicación, el sistema DEBE
tener aplicada la marca del modo elegido en el elemento raíz del documento **antes del primer
fotograma pintado**, de modo que nunca se vea el modo equivocado.

**R11.** CUANDO el usuario navega entre rutas de la aplicación, el sistema DEBE mantener el modo
aplicado sin transición al modo contrario en ningún momento de la navegación.

**R12.** El sistema NO DEBE producir advertencias de discrepancia de hidratación de React por la
marca de modo escrita en el elemento raíz.

**R13.** El sistema DEBE presentar el control de tema en el encabezado de la zona privada, junto
a `SidebarToggle`, con un nombre accesible tomado de una constante exportada del módulo (no un
literal suelto en el JSX), siguiendo el precedente de `SIDEBAR_TOGGLE_LABEL`.

**R14.** CUANDO el usuario abre el control de tema, el sistema DEBE ofrecer las tres opciones
—`claro`, `oscuro`, `sistema`— cada una con nombre accesible propio, y DEBE indicar
programáticamente cuál es la seleccionada.

> **ENMIENDA DEL 2026-09-07 (decisión humana).** El control de tema es un **interruptor de dos
> estados**: un gesto alterna `claro` ⇄ `oscuro`. R14 queda sustituido por: *el control DEBE
> alternar entre los dos modos con un solo gesto, y su nombre accesible DEBE venir de una
> constante exportada (R13, sin cambios)*.
>
> `sistema` **no desaparece del modelo**: sigue siendo el valor por defecto y el punto de partida
> —mientras nadie toque el control, la preferencia guardada es `system` y el modo sale del
> sistema operativo, incluidos sus cambios en vivo (R17, intacto)—. Lo que desaparece es la
> *opción elegible*.
>
> Coste asumido, dicho sin adornos: una vez fijado un modo, desde el control ya **no se puede
> volver a «seguir al sistema»** (haría falta borrar la cookie de UI). D3 (`light`, `dark`,
> `system`) sigue describiendo los valores que la cookie admite; ya no los que el menú ofrece.
>
> El menú y sus tres etiquetas (`THEME_OPTION_*`) se retiraron del código y del barrel, y los
> casos de test que los leían se reescribieron sobre el gesto nuevo, cada uno con su nota.

**R15.** CUANDO el usuario selecciona una opción de modo, el sistema DEBE aplicar el modo
inmediatamente, sin recargar la página.

**R16.** El control de tema DEBE tener un área táctil de al menos `44 × 44` px y DEBE ser
accionable sin `hover` (`docs/architecture.md > Componentes > Regla: multiplataforma`).

**R17.** MIENTRAS la preferencia registrada sea `sistema`, CUANDO cambie `prefers-color-scheme`
del sistema operativo, el sistema DEBE reflejar el cambio sin recargar la página.

**R26.** El sistema DEBE aplicar el modo al documento entero, incluidas las rutas públicas
(p. ej. `/login`), y no solo a la zona privada.

### Barra lateral — panel flotante

**R18.** El sistema DEBE renderizar la barra lateral como panel flotante con radio de `22 px`,
margen exterior de `18 px` y un degradado de fondo a `166°` con las cuatro paradas de
`design-input-tokens.md > 4`, una definición por modo.

> **ENMIENDA DEL 2026-10-08 (QC-226).** Las cuatro paradas del degradado quedan sustituidas por
> las de QC-226 D5 (R9), una definición por modo. Las medidas de R18–R20 siguen: radio de 22 px,
> margen de 18 px, ángulo de 166°, 272/78 px de ancho e ítems de al menos 44 px (QC-226 R10).

**R19.** El sistema DEBE usar `272 px` como ancho de la barra lateral expandida y `78 px` como
ancho en modo icono, en viewport ancho.

**R20.** El sistema DEBE dar a cada item de menú de la barra lateral una altura de al menos
`44 px`.

### Requisitos en negativo

**R21.** El sistema NO DEBE modificar ningún archivo de `components/ui/`: las medidas de R18–R20
se aplican desde `app/globals.css`, desde props públicas del primitivo o desde
`components/private/`. En particular, `components/ui/sidebar.tsx` DEBE conservar
`SIDEBAR_WIDTH = "16rem"`, `SIDEBAR_WIDTH_ICON = "3rem"` y su `rounded-lg` del panel flotante.

**R22.** El sistema NO DEBE cambiar la estructura ni la navegación de la barra lateral: los
mismos items, los mismos `data-testid`, el mismo marcado de ruta activa (`aria-current="page"`)
y el mismo comportamiento de colapso que dejó QC-11.

**R23.** El sistema NO DEBE añadir contenido al dashboard, que sigue vacío a propósito
(QC-12 R3).

**R24.** El sistema NO DEBE romper la estructura del encabezado privado: exactamente un landmark
`main` en la zona privada y el `SidebarToggle` sigue presente con su nombre accesible.

**R27.** El sistema NO DEBE convertir `app/(private)/layout.tsx` en Client Component: sigue
siendo Server Component y el único punto que llama al proveedor de sesión (QC-11 R16).

**R28.** El sistema NO DEBE añadir ninguna entrada nueva a `dependencies` ni a
`devDependencies` de `package.json` (D9). Todo el mecanismo de tema es código de este repo.

**R29.** El sistema NO DEBE tratar la preferencia de tema como dato de sesión: la cookie de
tema es preferencia de UI —sin PII, sin identificar a nadie, no la consume ningún service— y no
altera ni lee la cookie de sesión de QC-8, igual que la cookie de la barra lateral
(`lib/shared/ui/sidebar-state.ts`).

## Preguntas abiertas

1. **`--chart-*`.** Hoy son cinco grises acromáticos y **no hay ninguna gráfica en el repo**.
   Re-colorearlos sin un consumidor sería inventar (regla 6 de `CLAUDE.md`), así que quedan
   intactos (R6). ¿Se definen cuando entre la primera feature con gráficas, o el humano quiere
   fijarlos ya con una paleta derivada del agua?
2. ~~**Contraste del acento como fondo de texto pequeño.**~~ **RESUELTA el 2026-09-02 por el
   humano (D10).** Medido sobre los valores del insumo: `--primary-foreground` (`#ffffff`)
   sobre `--primary` (`#c76b2f`) da ≈ `3.75:1` en modo claro; en oscuro el par es ≈ `7.2:1`.
   **Se queda como está**: un botón es componente de UI y el umbral AA que le aplica es `3:1`,
   no el `4.5:1` de texto. No se retoca el naranja del diseño y R25 sigue sin cubrir ese par —
   está escrito así a propósito, no por olvido.
3. **Ancho del panel en viewport angosto.** `components/ui/sidebar.tsx` fija
   `SIDEBAR_WIDTH_MOBILE = "18rem"` (288 px) en un `style` **inline** del `Sheet`, que no se
   puede sobrescribir desde fuera sin editar el archivo (R21 lo prohíbe). El diseño no da un
   ancho móvil. Se deja en 288 px. ¿Correcto, o el humano quiere un ancho móvil concreto y con
   él una excepción explícita a R21?
4. **Alcance de la persistencia.** La preferencia vive en el navegador, así que no viaja entre
   dispositivos ni entre perfiles del mismo usuario. ¿Basta, o en algún momento la preferencia
   de tema debe guardarse por usuario en base de datos?
5. **Control en la zona pública.** El modo se aplica en `/login` (R26) pero el control solo
   existe en la zona privada (D5). ¿Se quiere también un control en el login, o se asume que
   ahí manda el sistema operativo?
