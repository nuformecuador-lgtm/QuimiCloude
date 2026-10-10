# Review QC-228 — movimiento-de-la-interfaz

Rama `feature/QC-228-movimiento-de-la-interfaz`, HEAD `91d88b96`, base `origin/dev` (`92d514c9`, con QC-232).
Revisor: reviewer, 2026-10-09. Vuelta 1.

## Checklist

### Especificación
- [x] `requirements.md` con R1–R25 en EARS, D1–D10 y P1–P5 (resueltas por el humano en `progress/features/QC-228.md > Decisiones`).
- [x] `design.md` abre con `## Lo que ya existe` (tabla con 9 entradas) y trae cuatro alternativas descartadas (§11).
- [x] El diff no re-crea nada de esa lista: no hay primitivos nuevos; tokens `--dur-*`/`--ease-*` de QC-226 reutilizados; Sonner y `tw-animate-css` sin tocar; regla R11 de QC-226 sin editar (solo se añade la regla `[data-indicator-ready]`).
- [x] `tasks.md`: T1–T10 marcadas `[x]`.

### Trazabilidad
- [x] Mapa consolidado `R<n> -> test` en `progress/impl_QC-228.md`; cada R1–R25 tiene al menos un test con aserciones reales.
  - R1, R2, R23: `guard-movimiento.test.ts` (casos negativos por patrón, ancla de no vacuidad ≥ 50 archivos, y prueba de que quitar los delimitadores del login sí da infracciones).
  - R3, R10, R16–R18, R21, R22: `motion-tokens.test.ts` (16 casos, 49 `expect`).
  - R4–R9, R11, R12, R16–R18: `motion-classes.test.tsx` (un caso por R).
  - R13–R15: `sidebar-active-indicator.test.tsx` (14 casos, incl. SSR sin JS).
  - R19, R20: `nav-module.test.ts`, `screen-enter.test.tsx`.
  - R4–R6, R10, R13, R15, R19–R21 además en navegador real: `e2e/movimiento.spec.ts` (salida local 22/22 Chromium+WebKit con `login-skin.spec.ts`, en la bitácora).
  - R24: suite existente + enmiendas declaradas; R25: `guard-dependencias-aprobadas.test.ts`.

### Calidad de código (ejecutado por el reviewer)
- [x] `pnpm run typecheck`: exit 0.
- [x] `pnpm run lint`: 0 errores, 7 avisos preexistentes (tests de pedidos/documentos, fuera del diff).
- [x] `pnpm exec vitest related --run <archivos .ts/.tsx/.css del diff>`: 285 archivos, 4364 tests verdes.
- [x] `pnpm exec vitest run tests/unit/paridad tests/unit/clientes/scope.test.ts guard`: 88 archivos, 1309 verdes.
- [x] `./init.sh` (rápido): `== init OK ==` (104/104 archivos, 1459 tests).
- [ ] `gate-completo` en CI: pendiente de PR (no lo corre el reviewer).
- [x] Sin dependencias nuevas (`package.json` fuera del diff).

### Seguridad / configuración
- [x] Sin secretos ni valores de entorno hardcodeados. Sin webhooks, tablas, migraciones ni consultas de datos (punto 8 no aplica).

### Módulos hexagonales
- [x] `lib/shared/navigation/nav-module.ts` es hoja: solo importa un tipo de `./private-nav`. Nada nuevo en la raíz de `lib/`.
- [x] Componentes `private/` sin fetch.

### Reglas del proyecto (perfil reviewer)
- [x] 5 Calidad: capas separadas, CSS en `globals.css`, lógica de cliente mínima (`ScreenEnter`, `SidebarActiveIndicator`).
- [x] 6 Multiplataforma: los hover de `btn-shine`/`btn-veil` van en `@media (hover: hover)` y son decoración, no vía de activación; tallas táctiles intactas (`button-touch` verde); sin `100vh` nuevo (`top-[50vh]` de la flecha es preexistente); indicador medido en WebKit por el E2E.
- [x] 7 Dependencias: ninguna.
- [x] 8 Aislamiento por empresa: no aplica.
- [x] 9 Comentarios: en las líneas añadidas de `app/`, `components/` y `lib/` no hay ninguna cita de `QC-<n>`, `R<n>`, `D<n>`, `design.md` ni «decisión cerrada» (grep sobre el diff: 0 coincidencias). Las citas `ENMIENDA QC-228` están solo en tests y specs.

## Puntos pedidos por el leader

1. **T6 (`28046e6e`, 17 `.snap`).** Verificado de forma independiente: extraje los 17 archivos en `7c943774` y `28046e6e`, comparé línea a línea con los atributos `class="…"` normalizados: **724 líneas cambiadas, 0 diferencias fuera de `class`**, misma longitud de archivo, una sola `class` por línea. Diferencia de tokens: salen `active:not-aria-[haspopup]:translate-y-px` (404), `hover:bg-muted`/`hover:text-foreground`/`dark:hover:bg-input/50` (243), `hover:bg-primary/80` (161), `duration-100` (177), `duration-150`/`duration-200`/`ease-in-out` (45), `zoom-in-95`/`zoom-out-95` (65); entran `scale-[0.98]` (404), `btn-veil` (243), `btn-shine` (161), `duration-(--dur-*)`, `ease-(--ease-*)`, `data-closed:`/`data-ending-style:` de salida, `after:duration/ease` de tabs y `zoom-in-96`/`zoom-out-96` (65). Todo es movimiento o sustitución de hover por brillo/velo. El commit solo contiene `.snap`. Paridad 21/21 verde.
2. **`scope.test.ts > R28`.** Solo +3 líneas: comentario del motivo (sin citar fichas) y `'movimiento.spec.ts'` en `E2E_PERMITIDOS`. La lista sigue cerrada; el caso pasa. Conforme a la decisión del leader con precedente QC-156/QC-223.
3. **Choque con QC-223 en `guard-identificador-de-request.test.ts`.** `git diff origin/dev...HEAD`: **+5 −0**, todas al final de `E2E_ESPERADOS` (comentario + `'movimiento.spec.ts'`). Solo adiciones, como aprobó el humano.
4. **`prefers-reduced-motion` y accesibilidad.** Regla global del kit copiada tal cual (0.01 ms, 1 iteración, `scroll-behavior: auto`), más `animation-delay: 0ms !important` para los bloques escalonados (sin él quedarían ocultos hasta 120 ms). Flechas de tabla con `behavior: 'auto'` si hay movimiento reducido. Login de QC-226 intacto (R32 enmendado solo para permitir la regla global y afirmar el bloque del login). Indicador del menú `aria-hidden`, fuera de la lista (no cambia el árbol accesible ni el recuento de ítems); sin JS el botón activo sigue pintándose con la regla de R11. `ScreenEnter` usa `display: contents` sobre un `div` (sin semántica que perder) y la animación termina en el estado final aunque no hidrate. El E2E lo comprueba con `emulateMedia({ reducedMotion: 'reduce' })` en los dos motores.
5. **Regla 9.** Cumple (ver checklist).

## Hallazgos

- **menor** — `components/ui/button.tsx`, variante `outline`: además de `hover:bg-muted` (lo que lista `design.md > 8`) se retiran `hover:text-foreground` y `dark:hover:bg-input/50`. Lo exige R17 (texto a `--primary`; el velo sustituye al fondo también en oscuro) y está anotado en la bitácora, pero `design.md > 8` no se actualizó para reflejarlo.
- **menor** — Desvío de `design.md > 5` documentado en la bitácora: la primera colocación del indicador es inmediata y sin fundido (el CSS ya pinta ese resaltado). Compatible con R14 («como mucho un fundido»); el design no se actualizó.
- **menor** — `progress/features/QC-228.md > Estado` está desfasado («implementación completa salvo T6») y su segunda línea quedó truncada («del board ya acota alcance…»). Es del leader; actualizarlo al cerrar.
- **menor** — Hallazgo de T9 sobre diálogos montados solo al abrir (salida sin animar, R5): el humano lo asignó a QC-232, ya en dev; `grep "Open && <"` en `app/` y `components/` ya no da coincidencias. Conviene cerrar la entrada «Pendientes» de la bitácora como resuelta.

Ningún bloqueante.

## Veredicto

**OK**

## Vuelta 2 (acotada a cb4a1fa5..0ffc330f)

### Checklist

- [x] **2e5ee47d (rojo de CI).** `e2e/movimiento.spec.ts` entra en la lista cerrada de
  `tests/unit/shared/data-table-alcance.test.ts` en su sitio alfabético (entre `login` y
  `pasos-de-envasado`), centinela 34 → 35, con nota fechada. Es real: el spec usa
  `data-table-search` (línea 86). El archivo figura en `tasks.md`.
- [x] **e9871c66 (enmienda D11).** Fila D11 en la tabla de decisiones (humano, 2026-10-09,
  enmienda D8 en R17/R18), cobertura D11→R17, R18 añadida, notas `Enmienda 2026-10-09 (D11)` bajo
  R17 y R18 en `requirements.md` y en `design.md`. `button.tsx` coincide con la enmienda:
  `outline-dashed`, `secondary` y `ghost` pasan a `btn-veil` + `scale-[0.98]`, pierden sus
  `hover:bg-*`/`hover:text-*`/`dark:hover:*` y conservan los `aria-expanded:*`; `destructive` solo
  cambia la pulsación y conserva `hover:bg-destructive/*`; `link` sin cambio.
- [x] **Tests de D11.** `motion-classes.test.tsx`: R17 (velo y sin hover anterior en las tres
  variantes), R17 (destructive/link sin velo; destructive conserva el hover rojo), R18 (las seis
  variantes escalan y ninguna se desplaza; link al revés). `motion-tokens.test.ts`: R17 nuevo de
  contraste del texto petróleo sobre el velo compuesto en `secondary` y `background`, claro y
  oscuro; los helpers de color se suben al `describe` sin cambiar su lógica.
- [x] **d4c9b6a4 (snapshots).** Comprobado por script sobre `git diff -U0` de los `.snap`:
  463 líneas quitadas / 463 añadidas, todas con `class=`, y quitando el atributo `class` las líneas
  son idénticas (0 diferencias fuera de `class`). Clases quitadas: `active:not-aria-[haspopup]:translate-y-px`
  (463), `hover:bg-muted` y `hover:text-foreground` (419), `dark:hover:bg-muted/50` (374),
  `dark:hover:bg-input/50` (45). Añadidas: `active:not-aria-[haspopup]:scale-[0.98]` (463) y
  `btn-veil` (419). Solo movimiento/hover de D11.
- [x] **Regla 9 (comentarios).** `components/ui/button.tsx` no añade comentarios. Los comentarios
  nuevos están en tests y no citan ficha ni requisito fuera del nombre del caso.
- [x] **Verificación ejecutada:** `vitest run` de motion-classes, motion-tokens,
  data-table-alcance y `tests/unit/paridad` → 24 archivos, 424 pasan, 2 skipped; `tsc --noEmit`
  limpio; `eslint` de los archivos tocados sin problemas. `tasks.md` sin casillas abiertas.

### Hallazgos

- `menor`: en oscuro, `--button-veil-color` es `color-mix(in oklch, … transparent)`; el test de
  contraste lo compone en sRGB con alfa 0.1, una aproximación. El margen (5.6:1) hace improbable
  que cambie el resultado.

Ningún bloqueante.

### Veredicto vuelta 2

**OK**
