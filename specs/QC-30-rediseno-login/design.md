# QC-30 — rediseno-login · design.md

> Decisiones técnicas antes de escribir código. Los valores (alfas, sombras, tamaños y tiempos)
> salen de `design-input-login.md`; **aquí no se recalculan ni se copian sus tablas**: se citan
> por sección. Los tokens de color salen de QC-29 y tampoco se tocan.
>
> Esta ficha es de **piel**. **Modelo de datos: ninguno.** No hay tabla, migración, RLS,
> endpoint, route handler ni Server Action nueva. No hay contrato de entrada/salida que
> definir: el único contrato en juego es `LoginFormState`, que **no cambia** (R8). No hay
> integración externa.

## 1. Qué toca esta feature (y qué no)

| Archivo | Cambio |
| --- | --- |
| `app/(public)/login/page.tsx` | Monta la capa de fondo, marca el ámbito del login y ajusta clases de la tarjeta. Sigue siendo Server Component |
| `app/(public)/login/components/login-background.tsx` | **nuevo** — la capa decorativa con las tres burbujas. Sin `'use client'`: es marcado puro |
| `app/(public)/login/components/index.ts` | reexporta `LoginBackground` |
| `app/globals.css` | **un bloque nuevo al final del archivo**, delimitado por comentarios (§6) |
| `e2e/login-skin.spec.ts` | **nuevo** — lo que solo se puede medir en navegador (§8) |
| `tests/unit/login-skin.test.tsx` | **nuevo** — contrato del CSS y del marcado |

**No se toca**: `components/ui/` (R19), `login-form.tsx`, `submit-button.tsx`,
`app/(public)/layout.tsx`, la Server Action, `login-form-state.ts`, `package.json` ni
`docs/dependencias.md` — **no hay dependencia que aprobar** (R25).

`login-form.tsx` y `submit-button.tsx` quedan **fuera de la lista a propósito**. Ahí vive todo
lo que la decisión 4 congela: `<form action>`, los campos no controlados, el `key` del campo de
usuario con su comentario, y el `useFormStatus` que obliga a que el botón viva en su propio
archivo. El rediseño no necesita entrar: el color y la altura llegan por CSS de ámbito (§6), no
editando el componente. **Si una tarea acaba pidiendo tocarlos, es señal de que el diseño se
torció**, no de que la decisión estuviera mal.

## 2. La regla de oro de esta ficha: la piel se aplica desde fuera

Tres piezas ya existen y ninguna se reescribe: la página, el formulario y las primitivas de
`components/ui/`. El rediseño entra por dos puertas y solo dos:

1. **Marcado nuevo puramente decorativo** (la capa de burbujas), que se añade como hermano de
   la tarjeta dentro del `<main>` que ya hay.
2. **Reglas CSS de ámbito acotado**, que alcanzan a los primitivos por su `data-slot` **dentro
   del ámbito del login** y no fuera (R16, R17).

Esto es lo que hace que la decisión 1 y la decisión 4 se cumplan a la vez: el `Input` sube a
44 px sin que nadie edite `components/ui/input.tsx` **ni** `login-form.tsx`.

## 3. El ámbito: cómo se acota al login

El `<main>` de la página lleva `data-login="screen"`. Todas las reglas nuevas cuelgan de ese
atributo:

```css
[data-login='screen'] [data-slot='input'] { min-height: 44px; }
```

Los `data-slot` que se usan son los que las primitivas ya emiten hoy y que se han leído del
código: `input` (`components/ui/input.tsx`), `button` (`components/ui/button.tsx`), y `card`,
`card-header`, `card-content`, `card-footer` (`components/ui/card.tsx`). Son parte de la
convención de shadcn, no un atributo que inventemos.

**Por qué un atributo propio y no una clase.** `data-login` crea un espacio de nombres de una
sola palabra, greppable, que no colisiona con los `data-slot` de shadcn, con `data-testid` ni
con ninguna utilidad de Tailwind. El marcado interno de la capa decorativa usa el mismo
espacio: `data-login="bubbles"` para la capa y `data-login="bubble"` con `data-login-index`
1..3 para cada burbuja.

**Por qué el atributo va en el `<main>` y no en el `<body>`.** El `<body>` es del root layout y
lo comparten las dos zonas: marcarlo ahí volvería a filtrar los 44 px a toda la aplicación por
la puerta de atrás. El `<main>` de login es el ámbito exacto que pide la decisión 1, y además
es el único landmark `main` de la zona pública (R15), así que no hay ambigüedad sobre cuál es.

**Por qué CSS y no utilidades de Tailwind en el JSX.** Las medidas *podrían* entrar como
`className` en cada componente: `cn()` + `tailwind-merge` resolverían `h-8` contra `h-11`. Se
descarta en §7 (A2): la decisión 1 fija «regla acotada, fuera de `@layer`», y además el vidrio
—cinco sombras encadenadas, dos degradados y un `@supports`— no se escribe con utilidades sin
volverse ilegible. Manteniendo **todas** las medidas en el mismo bloque CSS hay un solo sitio
donde mirar y un solo test de contrato que las lee.

## 4. Vidrio esmerilado y su degradación (pregunta abierta 1 — RESUELTA)

**La decisión: mejora progresiva, con la opacidad como base.**

```
base            → tarjeta OPACA con el color de tarjeta del modo activo (var(--card))
@supports blur  → se sustituye por el degradado translúcido + backdrop-filter
reduced-transp. → vuelve a la base opaca
```

Las tres razones, en orden de peso:

1. **Translúcido sin desenfoque es el peor de los tres resultados.** Lo dice el propio insumo
   (`> 3`): «la tarjeta se ve translúcida y sucia, que es peor que opaca». Sobre un fondo con
   tres burbujas en movimiento, además, el texto del formulario pasaría por encima de bordes de
   burbuja: un problema de contraste real, no estético.
2. **El fallback no inventa ningún color.** `var(--card)` es el token que QC-29 ya definió en
   los dos modos y es **exactamente** lo que la tarjeta de login muestra hoy. Elegir un color
   sólido «equivalente» a mano sería inventar valores (regla 6 de `CLAUDE.md`); esto es
   degradar a la pantalla que ya está en `dev`.
3. **La base opaca no necesita `@supports not`.** Escribir la mejora dentro de
   `@supports ((backdrop-filter: blur(22px)) or (-webkit-backdrop-filter: blur(22px)))` cubre a
   la vez el navegador que no la conoce y el que la desactiva por configuración, sin negaciones
   anidadas que son justo donde estas consultas se escriben mal.

**Transparencia reducida.** `@media (prefers-reduced-transparency: reduce)` devuelve la tarjeta
a la base opaca. Es la misma familia de ajustes de accesibilidad que `prefers-reduced-motion`,
y el usuario que la activa está pidiendo literalmente esto. Su soporte todavía es parcial: si
el navegador no la entiende, ignora el bloque y se queda con el vidrio, que es el
comportamiento de hoy y no rompe nada.

**Lo que NO se recorta bajo ningún concepto** (insumo `> 3`): el filo de 1 px y el brillo
interior superior. Se conservan **también** en la rama opaca; son lo que separa «tarjeta de
vidrio» de «tarjeta a media opacidad».

**`-webkit-backdrop-filter` va declarado junto al estándar** (R10), en la propia regla y en la
condición del `@supports`. No es opcional: sin él, WebKit —el motor de iOS, obligatorio por
`docs/architecture.md > Componentes > multiplataforma`— entra por la rama del vidrio y no
desenfoca, que es el escenario 1 de arriba.

## 5. Las burbujas

**Marcado** (`login-background.tsx`, Server Component, sin `'use client'`: no tiene estado ni
manejadores):

```tsx
<div data-login="bubbles" aria-hidden="true">
  <span data-login="bubble" data-login-index="1" />
  <span data-login="bubble" data-login-index="2" />
  <span data-login="bubble" data-login-index="3" />
</div>
```

- **`aria-hidden` y `pointer-events: none`** (R13). Son `<span>` vacíos sin `tabindex`, así que
  no entran en el orden de tabulación por construcción, no solo por convención.
- **Hermano de la tarjeta dentro del `<main>` que ya existe** (R15): no se añade un segundo
  landmark, ni se envuelve la página en otro elemento seccionador.
- **`z-index` 1 la capa, 2 la tarjeta**, con `position: relative` en ambas, tal como fija el
  insumo (`> 4`).

**Por qué tres y no más.** La decisión 8 lo cerró y este diseño **no propone más**: el
`backdrop-filter` de la tarjeta obliga a recomponer la capa desenfocada en cada fotograma en
que algo se mueve debajo. Tres burbujas grandes y lentas dan la misma lectura visual que
dieciséis pequeñas a una fracción del coste, y en un teléfono esa diferencia se nota en batería.

**Cero valores en el JSX.** Posición, diámetro, duración, deriva, retardo y opacidad de cada
burbuja viven **en el CSS**, seleccionados por `data-login-index`. Nada de `style` en línea, y
por una razón concreta: una propiedad personalizada escrita en `style` gana a cualquier hoja de
estilos, así que la media query móvil **no podría** sobrescribirla (R22). Con todo en CSS,
mobile-first, los valores móviles del insumo son la base y los de escritorio entran en un
`@media (min-width: 640px)`.

Una sola animación `@keyframes qc30-login-bubble-rise` compartida por las tres, parametrizada
con propiedades personalizadas por burbuja (`--qc30-bubble-travel`, `--qc30-bubble-drift`,
`--qc30-bubble-scale-*`). Los retardos son **negativos** (0, −7 s, −13 s): al abrir la pantalla
el movimiento ya está repartido en toda la altura.

**Movimiento reducido: las burbujas DESAPARECEN** (R14).

```css
@media (prefers-reduced-motion: reduce) {
  [data-login='bubbles'] { display: none; }
}
```

> **Discrepancia documentada, no zanjada por mí.** `design-input-login.md > 4` dice
> «`prefers-reduced-motion: reduce` las deja quietas al 22% de opacidad, **no las borra**» y lo
> llama requisito. La tabla `## Decisiones cerradas` de `requirements.md`, escrita por el humano
> **después** del insumo (2026-09-02), dice «**desaparecen** con animaciones reducidas en el
> sistema». Manda la decisión cerrada: es posterior, es del humano y es la que la ficha prohíbe
> reabrir. Queda escrito aquí para que nadie lea la diferencia como un descuido, y para que
> revertirlo sea cambiar una regla si el humano decide lo contrario.

## 6. El bloque de `app/globals.css` (y la colisión viva)

**Colisión declarada** (decisión 13): `feature/fix-ajuste-sidebar` está tocando en paralelo el
bloque del panel flotante (líneas 148-156) y añadiendo una regla para el elemento activo. El
acuerdo entre sesiones es *bloques separados, nadie reordena ni reindenta*. Cómo se cumple:

- **Todo lo de QC-30 va en UN bloque contiguo al FINAL del archivo**, después de `@layer base`
  (R24). El final del archivo es la posición con menos superficie de conflicto textual: ninguna
  línea existente se desplaza, y `git merge` resuelve un añadido al final sin intervención.
- **La cascada no sufre por ir al final.** En el modelo de *cascade layers*, cualquier regla sin
  capa gana a cualquier regla dentro de una capa, esté donde esté en el archivo. Y entre las
  reglas sin capa, las nuestras no compiten con las del panel: los selectores son disjuntos
  (`[data-login=...]` contra `[data-slot='sidebar-*']`).
- **Las variables del login se declaran DENTRO del bloque**, en sus propios `:root` y `.dark`,
  igual que hizo QC-29 con `--sidebar-panel-gradient`. Así no hay que tocar los bloques de
  tokens de las líneas 57-126, que es donde un merge sí dolería. Prefijo `--qc30-login-*` para
  que sean inconfundibles.
- **Delimitadores explícitos**, con el motivo escrito dentro:

```css
/* ══ QC-30 · pantalla de login — INICIO (bloque propio; no reordenar ni reindentar) ══ */
...
/* ══ QC-30 · pantalla de login — FIN ══ */
```

**Fuera de `@layer`, y por qué** (R18). Es el precedente de QC-29
(`specs/QC-29-tema-claro-oscuro/design.md > 6`), y aquí el riesgo es el mismo: `min-height: 44px`
dentro de `@layer base` perdería contra la utilidad `h-8` que el primitivo ya trae, la pantalla
saldría igual que hoy y el test de contrato —que lee texto CSS— saldría **verde en falso**. El
motivo va anotado como comentario en el propio CSS, no solo aquí.

**Qué contiene el bloque, en orden:**

1. `:root` y `.dark` con las variables `--qc30-login-*` (degradado de la tarjeta, anillo, brillo,
   sombra, relleno/borde/halo de burbuja).
2. Medidas de ámbito: alto de campo y botón, ancho/radio/espaciado de la tarjeta (§3).
3. Tarjeta: base opaca, y `@supports` con el vidrio (§4).
4. Capa de burbujas, las tres burbujas por índice, `@keyframes`, y el `@media (min-width: 640px)`
   con los valores de escritorio.
5. Los dos bloques de preferencias: `prefers-reduced-motion` y `prefers-reduced-transparency`.

**Lo que el bloque NO hace:** no toca `--card-spacing` globalmente (se redefine solo dentro del
ámbito del login, que es como el espaciado de 28 px llega a header, contenido y pie de la
tarjeta sin editar `card.tsx`), no redefine ningún token de QC-29 (R21) y no añade ninguna
utilidad ni `@apply`.

## 7. Alternativas descartadas

**A1 — Editar `components/ui/input.tsx`, `button.tsx` y `card.tsx`.** Es lo directo: cambiar
`h-8` por `h-11`, `rounded-xl` por `rounded-[18px]` y el `--card-spacing` por defecto.
Descartada por dos motivos independientes, cada uno suficiente: (a) subiría **toda** la
aplicación a 44 px, que es exactamente lo que la decisión 1 prohíbe; (b) `components/ui/` es
código generado por el CLI de shadcn y este repo lo trata como no editable —QC-29 (A6) ya pagó
el coste de rodearlo y dejó el precedente—. Editarlo convierte cada `npx shadcn add` futuro en
un conflicto silencioso.

**A2 — Las medidas como utilidades Tailwind en el JSX** (`className="h-11"`, `w-[400px]`,
`rounded-[18px]`, `[--card-spacing:28px]`). Funcionaría: los tres primitivos aceptan `className`
y `tailwind-merge` resuelve el conflicto, y quedaría acotado al login sin ninguna regla global.
Descartada porque la decisión 1 fija literalmente «la regla se acota al login, **fuera de
`@layer`**», y porque partiría la piel en dos sitios: las medidas en el JSX y el vidrio en el
CSS. Un solo bloque significa un solo test de contrato y un solo lugar donde mirar cuando algo
no cuadre. Se deja anotada porque es la alternativa más barata si algún día el bloque CSS se
vuelve incómodo.

**A3 — Un CSS Module para la pantalla de login.** Aislamiento gratis y sin tocar `globals.css`,
lo que además esquivaría la colisión con `feature/fix-ajuste-sidebar`. Descartada: el repo no
tiene ni un solo CSS Module y todo el estilo vive hoy en Tailwind v4 + `globals.css`; introducir
un segundo mecanismo de estilos por una pantalla es una decisión de arquitectura que ninguna
ficha ha tomado. Además los módulos generan nombres de clase con hash, y el test de contrato
—que lee el CSS como texto y afirma valores— dejaría de ser trivial.

**A4 — Las burbujas como SVG animado o como `<canvas>`.** Daría control fino sobre las
trayectorias. Descartada: tres `<span>` con `transform` y `opacity` se componen en la GPU y no
provocan *layout*; un `<canvas>` obliga a JavaScript en una pantalla que hoy es un Server
Component sin más cliente que el formulario, y a resolver a mano el `prefers-reduced-motion` que
el CSS da en tres líneas.

**A5 — Convertir los campos en controlados para pintar estados de foco/relleno,** como hace el
prototipo del canvas. Descartada sin matices: `login-form.tsx` documenta por qué el campo es no
controlado y por qué lleva `key`, la decisión 4 lo congela, y los estados visuales que el
prototipo consigue con estado de React se consiguen con `:focus-visible`, `:placeholder-shown` y
`aria-invalid`, que ya están en el marcado.

**A6 — Meter las burbujas en `app/(public)/layout.tsx`** para que las hereden futuras páginas
públicas. Descartada: hoy la única página pública es el login, la recuperación de contraseña ni
siquiera existe (devuelve 404), y el layout público tiene una responsabilidad clara —montar el
`Toaster`—. Sería sobre-ingeniería (`docs/architecture.md > Regla: sin sobre-ingeniería`): se
promueve cuando haya una segunda página que lo necesite.

**A7 — Congelar el `package.json` entero en un test para garantizar R25.** Descartada por el
mismo motivo que la descartó QC-29: convertiría el test en un peaje para toda feature futura, y
`tests/guards/guard-dependencias-aprobadas.test.ts` ya cubre el caso general contra
`docs/dependencias.md`. R25 se verifica comprobando que `package.json` no cambia respecto a las
familias que este diseño podría haber tentado (animación, glassmorphism, partículas).

## 8. Verificación (pregunta abierta 2 — RESUELTA)

**La decisión: se amplía, en un spec E2E nuevo, y `e2e/login.spec.ts` no se toca.**

El razonamiento, porque la respuesta fácil («no cambia comportamiento, no hace falta») es
justamente la que dejaría los requisitos sin test:

- Las dos pruebas de `e2e/login.spec.ts` cubren el **flujo crítico** (autenticación, cookie,
  error genérico) y esta ficha no lo cambia. Editarlas para colgarles aserciones de píxeles
  añadiría riesgo a lo único que no debe romperse, en un archivo con fixtures de base de datos,
  limpieza de huérfanos y comentarios sobre el bloqueo por intentos fallidos. **Se quedan
  exactamente como están** (R26, segunda mitad).
- Pero **R16, R17, R22 y R23 no se pueden verificar en jsdom**: jsdom no compila la hoja de
  Tailwind ni calcula estilos en cascada, así que un `expect(input).toHaveStyle('44px')` allí
  sería teatro. El alto computado de un campo solo existe en un navegador de verdad.
- Y **R14** (movimiento reducido) y **R11** (sin desenfoque) son consultas de medio: Playwright
  las emula (`emulateMedia`), jsdom no.

Así que el reparto queda en tres niveles:

**Nivel 1 — contrato de texto del CSS** (`tests/unit/login-skin.test.tsx`). Lee `app/globals.css`
como texto —mismo patrón que `tests/unit/theme/sidebar-panel.test.tsx`— y afirma: que existe el
bloque delimitado de QC-30 y que **está fuera de toda `@layer`** (R18, R24); que el bloque del
panel flotante sigue textualmente presente y sin reindentar (R24); que el desenfoque aparece con
y sin prefijo `-webkit-` (R10); que hay `@supports` y base opaca (R11); que hay exactamente
**tres** selectores de burbuja por índice (R12); que existe el bloque de `prefers-reduced-motion`
con `display: none` (R14); que las medidas 44/400/18/28 aparecen **solo** dentro de selectores
con `[data-login='screen']` (R16, R17).

**Nivel 2 — contrato del marcado y regresión** (mismo archivo, jsdom). Renderiza `LoginPage` y
afirma: un solo elemento con rol `main` (R15); la capa de burbujas está presente, con
`aria-hidden` y sin nodos enfocables (R13); el enlace de recuperación sigue fuera del `<form>`
(R1); `components/ui/input.tsx`, `button.tsx` y `card.tsx` **siguen conteniendo** `h-8`,
`rounded-xl` y `[--card-spacing:--spacing(4)]` (R19) —misma técnica que usó QC-29 para R21, y
por el mismo motivo: el gate corre sin red y no puede diffear contra `origin/dev`—.
`tests/unit/login-form.test.tsx` (QC-7) cubre ya R2–R7 y **debe seguir verde sin editarse**: eso
es la prueba de que la mecánica no se tocó.

**Nivel 3 — E2E nuevo** (`e2e/login-skin.spec.ts`, Chromium + WebKit). No crea ni borra ninguna
fila: navega a `/login` sin sesión y mide. Cuatro comprobaciones: alto computado ≥ 44 px de
campo y botón y ancho de tarjeta ≤ 400 px (R16, R22, R23); con `emulateMedia({ reducedMotion:
'reduce' })` la capa de burbujas no es visible (R14); en un viewport de teléfono no hay scroll
horizontal (`scrollWidth <= clientWidth`, R22); y una página **privada o cualquier otra vista con
un `Input`** conserva 32 px —si no hay ninguna alcanzable sin sesión, esta última se cubre en el
nivel 1 por texto CSS y se anota en el spec por qué—.

**Ningún screenshot comparado.** Sería flaky con tres burbujas animadas y no distingue «cambió el
color» de «se movió un fotograma». Las aserciones de medida y de visibilidad responden
exactamente a lo que preguntan los requisitos.

## 9. Multiplataforma (`docs/architecture.md > Componentes`)

**Sin excepción que declarar**: todo lo de esta ficha funciona en Safari/WebKit y Chrome Android.
Punto por punto, porque aquí es donde una pantalla bonita se rompe en un teléfono:

| Regla | Cómo se cumple |
| --- | --- |
| Nada de `100vh` | El `<main>` conserva `min-h-svh`; R23 lo fija |
| `font-size` ≥ 16 px en inputs | `components/ui/input.tsx` trae `text-base` y baja a `text-sm` solo desde `md:`, o sea nunca en teléfono. El bloque de QC-30 **no** toca el tamaño de letra del campo |
| Destinos táctiles ≥ 44 × 44 px | Es literalmente el objeto de R16; el enlace de recuperación también entra en el ámbito |
| `:hover` no es la única vía | No se añade ninguna interacción nueva; el foco visible de 3 px se conserva (R20) |
| `backdrop-filter` en WebKit | Con prefijo (R10) y con degradación opaca si falla (R11) |
| Librerías | Ninguna nueva (R25) |

Coste conocido y aceptado: `backdrop-filter` sobre una capa animada es caro en móvil. Se mitiga
con tres burbujas en vez de dieciséis (§5), con `transform`/`opacity` como únicas propiedades
animadas —compuestas en GPU, sin *layout*— y con la desaparición completa bajo movimiento
reducido.

## 10. Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Las reglas acaban dentro de `@layer` y la pantalla sale igual que hoy con el gate en verde | §6, comentario en el propio CSS y aserción de nivel 1 que comprueba que el bloque está fuera de capa |
| Los 44 px se filtran a toda la aplicación | Todo selector cuelga de `[data-login='screen']`; el nivel 1 afirma que ninguna de las cuatro medidas aparece fuera de ese ámbito (R17) |
| Alguien «aprovecha» para convertir el campo en controlado | R2 y el test de QC-7 sin editar; §1 marca `login-form.tsx` como archivo que no se toca |
| Conflicto de merge en `app/globals.css` con `feature/fix-ajuste-sidebar` | Bloque contiguo al final del archivo, cero líneas existentes desplazadas, y aserción de nivel 1 de que el bloque del panel sigue textual |
| El vidrio deja el texto sin contraste sobre una burbuja clara | El filo y el brillo interior se conservan siempre (§4); si aun así falla, el fallback opaco es una regla de una línea |
| El E2E nuevo se vuelve lento y desincentiva correr el gate | No toca la base de datos, no crea usuarios y es una sola navegación por proyecto |
| Un valor del insumo se copia mal al CSS | Los requisitos citan el insumo por sección en vez de duplicar sus tablas; el test de nivel 1 compara contra los valores escritos en el propio test, que se transcriben una sola vez |

## 11. Dependencias de terceros

**Ninguna** (R25, decisión 14). Es CSS y composición de componentes que ya existen: no hay
utilidad reimplementada a mano que una librería mantenida resolviera mejor
(`docs/architecture.md > Dependencias de terceros`). Nada que aprobar, ninguna fila nueva en
`docs/dependencias.md`, y `package.json` no se toca.
