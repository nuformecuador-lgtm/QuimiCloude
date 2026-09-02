# QC-30 — rediseno-login · tasks.md

> Orden ejecutable. `[P]` = puede correr en paralelo con la task marcada igual **de su mismo
> grupo**, porque tocan archivos distintos. Dos tasks que editan `app/globals.css` **nunca** son
> `[P]` entre sí, aunque su contenido sea independiente.
>
> Referencias: `requirements.md` (R), `design.md` (§) y `design-input-login.md` (valores).
> Regla transversal: **no se abre `components/ui/`, `login-form.tsx` ni `submit-button.tsx`**
> (`design.md > 1`). Si una task parece pedirlo, para y pregunta.

## Grupo 1 — el bloque de estilos

- [x] **T1. Abrir el bloque de QC-30 en `app/globals.css`.**
  Archivos: `app/globals.css`.
  Depende de: —.
  Añade **al final del archivo**, después de `@layer base`, los delimitadores
  `/* ══ QC-30 · pantalla de login — INICIO … ══ */` / `— FIN`, el comentario que explica por
  qué las reglas van **fuera de `@layer`** (§6, precedente QC-29), y dentro de ellos los `:root`
  y `.dark` con las variables `--qc30-login-*` de `design-input-login.md > 3` y `> 4`.
  **Hecho cuando:** el archivo compila, ninguna línea preexistente se ha desplazado, reindentado
  ni modificado (`git diff` solo muestra líneas añadidas al final) y la pantalla se ve igual que
  antes. R21, R24.

- [x] **T2. Medidas de ámbito.**
  Archivos: `app/globals.css` (dentro del bloque).
  Depende de: T1.
  Alto mínimo de 44 px para `[data-slot='input']` y `[data-slot='button']`, ancho máximo 400 px,
  radio 18 px y `--card-spacing: 28px` para `[data-slot='card']`, **todo** colgando de
  `[data-login='screen']` (§3). No se toca el tamaño de letra del campo, ni el radio de campo y
  botón, ni el anillo de foco.
  **Hecho cuando:** en `/login` campo y botón miden 44 px y la tarjeta 400 px / 18 px / 28 px; en
  el dashboard **nada** cambia de tamaño. R16, R17, R18, R20.

- [x] **T3. Vidrio esmerilado y su degradación.**
  Archivos: `app/globals.css` (dentro del bloque).
  Depende de: T2 (mismo archivo).
  Base **opaca** con `var(--card)`; `@supports ((backdrop-filter: …) or (-webkit-backdrop-filter:
  …))` con el degradado translúcido, el desenfoque **con y sin prefijo**, el filo de 1 px, el
  brillo interior y la sombra de `design-input-login.md > 3`, en los dos modos; y
  `@media (prefers-reduced-transparency: reduce)` de vuelta a la base opaca (§4). El pie de la
  tarjeta se re-colorea para no romper el vidrio.
  **Hecho cuando:** con desenfoque disponible se ve vidrio en claro y en oscuro; desactivándolo
  en el navegador la tarjeta queda opaca y legible, nunca translúcida-sin-desenfocar. R9, R10,
  R11.

- [x] **T4. Burbujas: CSS y animación.**
  Archivos: `app/globals.css` (dentro del bloque).
  Depende de: T3 (mismo archivo).
  Capa `[data-login='bubbles']` con `pointer-events: none` y `z-index` 1 contra 2 de la tarjeta;
  las tres burbujas por `data-login-index`, **valores móviles como base** y los de escritorio en
  `@media (min-width: 640px)`; un único `@keyframes qc30-login-bubble-rise` parametrizado, con
  los retardos negativos; relleno, borde y halo propios de cada modo; y
  `@media (prefers-reduced-motion: reduce) { display: none }` (§5). Nada de valores en `style`
  en línea.
  **Hecho cuando:** al abrir la pantalla hay tres burbujas ya repartidas en altura, se animan
  solo con `transform`/`opacity`, y con movimiento reducido activado en el sistema **no aparece
  ninguna**. R12, R14, R22.

## Grupo 2 — el marcado

- [x] **T5. `[P]` Componente de fondo decorativo.**
  Archivos: `app/(public)/login/components/login-background.tsx` (nuevo),
  `app/(public)/login/components/index.ts`.
  Depende de: — (puede escribirse a la vez que T2–T4: archivos distintos).
  Server Component sin `'use client'`: un `<div data-login="bubbles" aria-hidden="true">` con
  tres `<span data-login="bubble" data-login-index="1|2|3" />` vacíos. Sin `tabindex`, sin
  props, sin lógica. Se exporta por el barrel de la ruta (`docs/architecture.md > Componentes`).
  **Hecho cuando:** `pnpm run typecheck` y `lint` verdes y el componente se importa como
  `import { LoginBackground } from './components'`. R13.

- [x] **T6. Montar el fondo y el ámbito en la página.**
  Archivos: `app/(public)/login/page.tsx`.
  Depende de: T5.
  El `<main>` gana `data-login="screen"` y `position: relative`; `<LoginBackground />` entra como
  **hermano** de la `Card`, antes que ella; la `Card` recibe la clase que la sitúa por encima.
  **No** se añade ningún elemento seccionador nuevo, **no** se toca el `<form>` ni el enlace de
  recuperación, que sigue en el pie y fuera del formulario. La página sigue siendo Server
  Component.
  **Hecho cuando:** `/login` se ve con fondo y vidrio en los dos modos, sigue habiendo un solo
  `main`, y `tests/unit/login-form.test.tsx` **pasa sin editarse**. R1, R2, R3, R4, R5, R6, R7,
  R8, R15, R23.

## Grupo 3 — verificación

- [x] **T7. Test de contrato del CSS.**
  Archivos: `tests/unit/login-skin.test.tsx` (nuevo).
  Depende de: T4.
  Lee `app/globals.css` como texto (patrón de `tests/unit/theme/sidebar-panel.test.tsx`) y afirma
  lo del nivel 1 de `design.md > 8`: bloque delimitado y **fuera de `@layer`**; bloque del panel
  flotante intacto y sin reindentar; desenfoque con y sin `-webkit-`; `@supports` y base opaca;
  exactamente **tres** selectores de burbuja; `prefers-reduced-motion` con `display: none`; y
  que 44 px / 400 px / 18 px / 28 px aparecen **solo** bajo `[data-login='screen']`.
  **Hecho cuando:** el test es rojo si se quitan los delimitadores, si el bloque se envuelve en
  `@layer base` o si una medida se escribe fuera del ámbito. R10, R11, R12, R14, R16, R17, R18,
  R24.

- [x] **T8. `[P]` Test de marcado y de no-regresión.**
  Archivos: `tests/unit/login-skin.test.tsx` (mismo archivo, otro `describe`).
  Depende de: T6. Paralelizable con T9 (archivos distintos).
  Nivel 2 de `design.md > 8`: un solo elemento con rol `main`; capa de burbujas presente, con
  `aria-hidden` y sin nodos enfocables; enlace de recuperación fuera del `<form>`; y que
  `components/ui/input.tsx`, `button.tsx` y `card.tsx` **siguen conteniendo** `h-8`,
  `rounded-xl` y `[--card-spacing:--spacing(4)]`.
  **Hecho cuando:** el test muerde si alguien mete las medidas dentro de `components/ui/` o si
  las burbujas dejan de ser decorativas. R1, R13, R15, R19.

- [x] **T9. `[P]` E2E de la piel.**
  Archivos: `e2e/login-skin.spec.ts` (nuevo).
  Depende de: T6. Paralelizable con T8.
  Chromium + WebKit, **sin fixtures de base de datos**: navega a `/login` sin sesión y mide alto
  computado de campo y botón, ancho de tarjeta, ausencia de scroll horizontal en viewport de
  teléfono, y capa de burbujas no visible con `emulateMedia({ reducedMotion: 'reduce' })`
  (nivel 3 de `design.md > 8`). **`e2e/login.spec.ts` no se abre.**
  **Hecho cuando:** pasa en los dos proyectos y `e2e/login.spec.ts` sigue verde sin una sola
  línea modificada. R14, R16, R22, R23, R26.

- [x] **T10. Revisión visual de los cuatro escenarios.**
  Archivos: ninguno (o retoques dentro del bloque de T2–T4).
  Depende de: T7, T8, T9.
  A ojo, en navegador: modo claro y modo oscuro; ventana de teléfono; desenfoque desactivado; y
  movimiento reducido. Se comprueba también que el error de campo, el aviso de credenciales y el
  estado «enviando» siguen legibles sobre el vidrio en los dos modos.
  **Hecho cuando:** los cuatro escenarios se ven correctos y cualquier ajuste ha entrado **solo**
  dentro del bloque de QC-30. R7, R9, R11, R14, R21, R22.

- [ ] **T11. Gate y trazabilidad.**
  Archivos: `progress/impl_QC-30-rediseno-login.md`.
  Depende de: T10.
  `./init.sh --rapido` durante el trabajo y **`./init.sh` completo** al cerrar (regla 5 de
  `CLAUDE.md`). Se escribe el mapa `R<n> -> test` de los 26 requisitos, se anota que
  `package.json` y `docs/dependencias.md` no cambiaron (R25) y se deja constancia de que
  `app/globals.css` solo creció por el final, por el acuerdo con `feature/fix-ajuste-sidebar`.
  **Hecho cuando:** `./init.sh` verde, ningún `R<n>` sin test y `CHECKPOINTS.md > Trazabilidad`
  satisfecho. R25, R26.

## Lo que ninguna task puede hacer

- Editar `components/ui/` (R19), `login-form.tsx` o `submit-button.tsx` (R2–R4, R8).
- Convertir un campo en controlado o añadir un manejador de envío propio (R2).
- Escribir un literal de copy en vez de usar las constantes exportadas (R5).
- Añadir una cuarta burbuja o subir la velocidad (R12).
- Reordenar, reindentar o mover líneas existentes de `app/globals.css` (R24).
- Instalar una dependencia: si aparece la necesidad, **para** y sube la propuesta con los cuatro
  checks (regla 7 de `CLAUDE.md`, R25).
