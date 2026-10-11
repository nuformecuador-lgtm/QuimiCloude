# QC-257 — shell-rediseno · tasks.md

Orden: T0 primero. T1, T2, T3 y T5 son independientes entre sí (`[P]`). T4 va después de T3
(comparten tests). T6 va después de T5 (mismo archivo). T7 cuando estén T1–T6. T8 cierra.

Verificación de cada tanda: `pnpm run typecheck`, `pnpm run lint`,
`pnpm exec vitest related --run <archivos tocados>` y `pnpm exec vitest run guard`. Nunca
`pnpm test` entero.

Comentarios: solo el porqué que el código no muestra. Sin `QC-<n>`, `R<n>` ni `design.md` en
código de producción. Se limpian los comentarios **de las líneas que se tocan**
(`docs/conventions.md > Comentarios`).

---

### T0 — Respuestas a las preguntas abiertas

- [x] Leer en `requirements.md > Preguntas abiertas` lo que respondió el humano al aprobar. Lo que
      no respondió vale como su propuesta.
- [x] Si P3 cambia (Clientes se queda en `Contact`), ajustar la tabla de R2 en T1. Si P2 cambia,
      usar los textos aprobados en T2. Si P7 pide esperar a QC-258 o a QC-244, parar y avisar al
      leader.

**Hecho cuando:** las decisiones de P1–P9 están anotadas en `progress/impl_QC-257.md`.

### T1 [P] — Iconos del menú (R1, R2, R3)

- [x] `lib/shared/navigation/private-nav.ts`: añadir `'clipboard-check'`, `'ruler'` y
      `'square-user'` a `NavIconName`. Cambiar `icon` de `nav-asignacion` → `'clipboard-check'`,
      `nav-unidades` → `'ruler'` y `nav-clientes` → `'square-user'`. Nada más del array.
- [x] Limpiar los comentarios de las líneas tocadas, por ejemplo el que justifica reutilizar
      `flask-conical` en Unidades, que deja de ser cierto.
- [x] `lib/shared/navigation/nav-icons.ts`: filas `ClipboardCheck`, `Ruler` y `SquareUser`.
- [x] Test nuevo `tests/unit/shell/nav-iconos.test.ts`: R1 (sin repetidos, nivel superior e
      hijos), R2 (la tabla) y R3 (etiqueta, ruta, `testId`, permiso, sección y orden).
- [x] Enmendar con nota `ENMIENDA QC-257` el icono de Unidades en
      `tests/unit/configuracion-ui/private-nav-usuarios.test.ts` y
      `tests/unit/configuracion-ui/private-nav-unidades.test.ts`.

**Hecho cuando:** los tests nuevos y los enmendados pasan, y `guard-nav-serializable` y
`guard-nav-permisos-declarados` siguen verdes.

### T2 [P] — Idioma (R14, R15, R16)

- [x] `app/layout.tsx`: `lang="es"`.
- [x] `components/ui/sidebar.tsx`: solo los cuatro literales de `design.md > 7`. Ni clases ni
      lógica.
- [x] `components/shared/CATALOGO.md`: en la fila `SidebarProvider`/`Sidebar`, poner en `Alcance`
      que los textos del cajón y del disparador están en español, y en `Diseño` poner
      `docs/diseno/canvas/Sidebar.dc.html`.
- [x] Test nuevo `tests/unit/shell/idioma.test.tsx`: R14, R15 y R16.

**Hecho cuando:** el test pasa, y `guard-catalogo-de-componentes` y
`guard-primitivas-ui-usan-el-cn-del-repo` siguen verdes.

### T3 [P] — Flecha de la pastilla (R4, R6, R8)

- [x] `components/private/app-sidebar.tsx`: la pastilla pinta `ChevronLeftIcon` (`size-3.5`) con
      `transition-transform duration-(--dur-base) ease-(--ease-standard)` y `rotate-180` cuando
      `open` es `false`. Quitar los imports de `PanelLeftCloseIcon` y `PanelLeftOpenIcon`.
- [x] Limpiar el comentario de la pastilla en las líneas tocadas. Dice que la pastilla «no
      sustituye» al control del encabezado y cita R23/R31.
- [x] Test nuevo `tests/unit/shell/control-barra.test.tsx` (parte de la pastilla): R4, R6 y R8.
- [x] Enmendar con nota `ENMIENDA QC-257` el caso R39 de la pastilla en
      `tests/unit/marca/sidebar-carril.test.ts`.

**Hecho cuando:** el test nuevo y el enmendado pasan, y los demás casos de `sidebar-carril`,
`sidebar-desktop` y `app-sidebar` siguen verdes sin tocarlos.

### T4 — Botón móvil: flecha y aspecto (R5, R6, R8, R9) · después de T3

- [x] `app/(private)/components/sidebar-toggle.tsx`: pasarle a `SidebarTrigger` el mismo
      `ChevronLeftIcon`, con `rotate-180` cuando `openMobile` es `false` (no `isExpanded`; motivo
      en `design.md > 3`). Pasarle `variant="outline"` y `className="size-11"`. El
      `aria-expanded` se queda como está.
- [x] Completar `tests/unit/shell/control-barra.test.tsx`: R5, R8 del botón móvil y R9.
- [x] Enmendar con nota `ENMIENDA QC-257` el caso R39 del encabezado en
      `tests/unit/marca/sidebar-carril.test.ts`.

**Hecho cuando:** pasan los tests, y `sidebar-mobile`, `theme/private-header` y `sidebar-ajuste`
siguen verdes sin tocarlos.

### T5 [P] — Tooltips de la cabecera (R10–R13)

- [x] `app/(private)/components/theme-toggle.tsx` y `app/(private)/components/logout-button.tsx`:
      envolver el botón en `Tooltip` / `TooltipTrigger render={<Button …/>}` /
      `TooltipContent side="bottom"`, con la constante de su etiqueta como texto. El `aria-label`,
      el `data-testid`, el `<form>` y `useFormStatus` no cambian.
- [x] `app/(private)/layout.tsx`: envolver el `div` de la derecha de la cabecera en
      `TooltipProvider`. Limpiar los comentarios de las líneas tocadas.
- [x] Test nuevo `tests/unit/shell/cabecera-tooltips.test.tsx`: R10, R11 y R12 con puntero, y R13.

**Hecho cuando:** pasan el test nuevo, `tests/unit/theme/theme-toggle.test.tsx` y
`tests/unit/logout-button.test.tsx` sin tocarlos.

### T6 — Sol y luna (R17, R18, R19) · después de T5

- [x] `app/(private)/components/theme-toggle.tsx`: las clases de `design.md > 6`, sin
      `transition-none`.
- [x] Test nuevo `tests/unit/shell/tema-sol-luna.test.tsx`: R17 y R18.

**Hecho cuando:** pasan el test nuevo y `tests/unit/theme/*` sin tocarlos.

### T7 — E2E (R6, R7, R10, R11, R14, R17, R19) · después de T1–T6

- [ ] `e2e/shell-rediseno.spec.ts` con los casos de `design.md > 9`.
- [ ] Enmendar con nota `ENMIENDA QC-257` los casos R39 de `e2e/marca-componentes.spec.ts`.
- [ ] Correr solo esos dos: `pnpm exec playwright test e2e/shell-rediseno.spec.ts
      e2e/marca-componentes.spec.ts`.

**Hecho cuando:** los dos specs pasan en local. Si el contraste de R38 con hover del control móvil
cambia por el paso a `outline`, se anota el valor medido en `progress/impl_QC-257.md` y se avisa
al leader. No se enmienda.

### T8 — Cierre

- [ ] `./init.sh` en verde.
- [ ] `progress/impl_QC-257.md` con el mapa `R1…R21 → test`. R20 apunta a
      `tests/guards/guard-dependencias-aprobadas.test.ts` más `git diff origin/dev -- package.json`
      vacío. R21 apunta a la lista de enmiendas de `design.md > 9` y a la suite de CI
      (`gate-completo`).
- [ ] Revisar que el diff solo toca los archivos de abajo.

**Hecho cuando:** `./init.sh` está verde, el mapa está completo y no hay archivos fuera de la
lista.

---

## Archivos esperados

- `lib/shared/navigation/private-nav.ts`
- `lib/shared/navigation/nav-icons.ts`
- `components/private/app-sidebar.tsx`
- `components/ui/sidebar.tsx`
- `components/shared/CATALOGO.md`
- `app/layout.tsx`
- `app/(private)/layout.tsx`
- `app/(private)/components/sidebar-toggle.tsx`
- `app/(private)/components/theme-toggle.tsx`
- `app/(private)/components/logout-button.tsx`
- `tests/unit/shell/nav-iconos.test.ts`
- `tests/unit/shell/control-barra.test.tsx`
- `tests/unit/shell/cabecera-tooltips.test.tsx`
- `tests/unit/shell/tema-sol-luna.test.tsx`
- `tests/unit/shell/idioma.test.tsx`
- `tests/unit/marca/sidebar-carril.test.ts`
- `tests/unit/configuracion-ui/private-nav-usuarios.test.ts`
- `tests/unit/configuracion-ui/private-nav-unidades.test.ts`
- `e2e/shell-rediseno.spec.ts`
- `e2e/marca-componentes.spec.ts`
- `progress/impl_QC-257.md`
