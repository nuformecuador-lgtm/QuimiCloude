# Review QC-227 — componentes-con-la-nueva-marca

- Rama `feature/QC-227-componentes-con-la-nueva-marca`, HEAD `6c0f0594`, base `origin/dev`.
- Revisor: reviewer, 2026-10-10.
- Decisiones del leader y del humano que no se reabren: la regeneración del snapshot
  `login-paridad`, R26 sin `fetchpriority`, R16 con el foco igualado al hover, y el CHOCA con
  QC-217/QC-223.

## Veredicto: RECHAZADO

Hay tres bloqueantes:

- B1: R15 y R16 no se cumplen en los disparadores de grupo.
- B2: un comentario de producción cita `R16`.
- B3: hay tasks sin marcar.

El resto está bien.

## Verificación ejecutada (por el revisor)

| Comando | Resultado |
| --- | --- |
| `set -a; . ../../.env; set +a; ./init.sh` | `== init OK ==`, exit 0. Typecheck y lint pasan (0 errores; 7 warnings ajenos). Related: 290 archivos, 4429 passed y 3 skipped. Siempre: 105 archivos en verde |
| `pnpm exec vitest run tests/unit/shared tests/unit/clientes tests/unit/paridad tests/guards tests/unit/marca` | 157 archivos, 2131 passed y 19 skipped, exit 0 |
| Sonda jsdom en el scratchpad, fuera del repo (`AppSidebar` con `PRIVATE_NAV_ITEMS`) | Los disparadores de grupo «Producción» e «Integraciones» se renderizan con `data-slot="collapsible-trigger"`, no con `sidebar-menu-button` (ver B1) |
| Medición de píxeles en `_trabajo/marca/capturas-componentes-despues/` (PIL, contraste WCAG) | Ver B1 y la observación O2 |
| `git diff --diff-filter=A -- components app` / `-- lib db package.json pnpm-lock.yaml` | Vacíos en los dos casos (D2, D7 y R28) |
| Transiciones, animaciones o duraciones añadidas en el diff de producción (`--word-diff`) | Ninguna (R30) |
| Valores de tokens en `globals.css` | Sin cambios (R27) |

No se corrió el E2E. La bitácora da 98/98 en Chromium y WebKit. B1 no depende del E2E: el E2E
de R15 y R16 solo mide `nav-dashboard`, que es un enlace.

## Checklist

### Reviewer (puntos 1 a 4)
- [ ] **Trazabilidad.** Cada R tiene un test real (mapa en `progress/impl_QC-227.md > T11`; he
  comprobado los casos por R en `tests/unit/marca/*`, `brand-logo`, la guardia y el E2E). Pero
  la cobertura de R15 y R16 no alcanza a los disparadores de grupo, y por eso el defecto B1 pasa
  en verde.
- [ ] **Tasks.** T0, T9, T10 y T11 siguen en `[ ]` (B3).
- [ ] **Checkpoints.** Ver más abajo.
- [x] **Verificación ejecutable.** Hecha (tabla de arriba).

### Reglas del proyecto (`docs/perfil-agentes.md > reviewer`)
- [x] 5. **Calidad y seguridad.** Sin RLS, webhooks ni secretos en juego. Las capas no se tocan.
- [x] 6. **Multiplataforma.**
  - No hay `100vh`.
  - El hover no es la única vía: el foco se iguala al hover.
  - Los targets no cambian; en modo icono, el de 44 px se mantiene.
  - Los inputs conservan `text-base md:text-sm`.
- [x] 7. **Dependencias.** `package.json` no cambia.
- [x] 8. **Aislamiento por empresa.** No toca esquema ni consultas.
- [ ] 9. **Comentarios.** Hay una cita de `R16` en `app/globals.css` (B2).

### CHECKPOINTS.md
- [x] `requirements.md` con EARS R1–R39; `design.md` con alternativas descartadas (§12 y §16.6).
- [ ] Todas las tasks marcadas `[x]` (B3).
- [x] `design.md` abre con `## Lo que ya existe`. El diff no re-crea nada: amplía `Badge`, no
  crea un `StatusBadge`, y no hay `.tsx` nuevos en `components/` ni en `app/`.
- [x] Assignee y rama publicada (`progress/features/QC-227.md`).
- [x] Mapa `R<n> -> test` en `progress/impl_QC-227.md`.
- [x] Typecheck y lint sin errores.
- [ ] `gate-completo` en CI. Queda para el PR.
- [x] Flujo crítico: no toca ninguno (autenticación, permisos, inventario, importes, webhooks).
  Solo cambia la piel.
- [x] Sin dependencias nuevas, sin secretos y sin nada que varíe por entorno.
- [x] `./init.sh` en verde.
- [ ] `progress/features/QC-227.md > Cierre` completo, desmontaje del worktree. Le toca al
  leader después del OK.

### docs/checkpoints-proyecto.md
- [x] Typecheck, lint y E2E en Playwright.
- [x] Multiplataforma (punto 6).
- [x] Datos y seguridad, módulos hexagonales y permisos: no aplican (no toca `lib/`, `db/` ni
  Server Actions).

## Hallazgos

### B1 — BLOQUEANTE: R15 y R16 no se cumplen en los disparadores de grupo del menú lateral

En la sonda (jsdom), los ítems de primer nivel con submenú se renderizan con otro `data-slot`:

```
BUTTON collapsible-trigger menu-button  Producción
BUTTON collapsible-trigger menu-button  Integraciones
```

Hay dos casos:

- **Barra expandida.** Esos ítems pasan por `CollapsibleTrigger render={<SidebarMenuButton/>}`
  (`components/private/app-sidebar.tsx:284`). El `data-slot="collapsible-trigger"` del trigger
  pisa el `sidebar-menu-button` del primitivo.
- **Modo icono.** Pasan por `DropdownMenuTrigger` (`app-sidebar.tsx:334`), que pone
  `dropdown-menu-trigger`. Lo infiero leyendo el código y no lo he medido.

Las dos reglas nuevas de `app/globals.css` seleccionan por
`:is([data-slot='sidebar-menu-button'], [data-slot='sidebar-menu-sub-button'])`. Por eso no
alcanzan a esos ítems, que siguen en `--sidebar-foreground`:

- **R15.** Un ítem inactivo de primer nivel debe ir en `--sidebar-muted-foreground`. No se cumple.
- **R16, con foco.** La regla de foco tampoco los alcanza. Con foco no cambian de color, aunque
  el texto ya sea claro.

La medición de `sidebar-expandido-claro.png` confirma lo que señaló el coordinador. El valor es
el píxel de mayor contraste contra el fondo dominante:

| Ítem | Contraste |
| --- | --- |
| «Producción» | 11.4:1 |
| «Integraciones» | 13.8:1 |
| «Inventario», inactivo | 6.1:1 |
| «Proveedores», inactivo | 6.8:1 |

Los dos grupos se leen como activos: el blanco pleno es la señal del ítem activo (R17).

**Por qué pasó en verde:**

- `tests/unit/marca/sidebar-inactivo.test.ts` solo comprueba el texto del selector.
- El E2E de R15 y R16 solo mide `nav-dashboard`, que es un enlace.

**Qué falta:**

1. Que la regla del inactivo y la del foco alcancen a los disparadores de grupo en los dos modos.
   Una opción es seleccionar por `data-sidebar='menu-button'` y `data-sidebar='menu-sub-button'`,
   que sí se conservan. La sonda lo muestra: `data-sidebar` sigue en `menu-button`.
2. Mantener las exclusiones de `[data-active]`, `:hover` y `:focus-visible`, y que no alcance a
   la marca ni al pie (siguen fuera de `sidebar-content`).
3. Un caso que lo pruebe sobre un disparador de grupo. Puede ser E2E (color calculado de
   `nav-produccion` o equivalente, en reposo y con foco, en claro y oscuro) o un unitario que
   renderice `AppSidebar` y compruebe que el disparador de grupo casa con el selector de la regla.

Toca solo `app/globals.css` y los tests de la ficha. El primitivo no se toca.

### B2 — BLOQUEANTE: un comentario de producción cita un requisito (regla 9)

`app/globals.css`, línea añadida en `6c0f0594`:

```css
/* Con foco de teclado, el inactivo toma el color del hover (R16, decision humana 2026-10-10): ...
```

La regla 9 de `docs/perfil-agentes.md > reviewer` dice que un comentario que cite `R<n>` (o
«decisión cerrada») en una línea que el diff añade es BLOQUEANTE. Hay que quitar
«(R16, decision humana 2026-10-10)» y dejar solo el porqué técnico. Lo demás del comentario vale.

### B3 — BLOQUEANTE: tasks sin marcar

`tasks.md` tiene en `[ ]` T0, T9, T10 y T11:

- **T9.** Hecha según la bitácora (commits `211bca44` y `f8c0d3f2`). Falta marcarla.
- **T11.** El mapa y las comprobaciones de diff están hechos. Su «Hecho cuando» exige «sin
  CHOCA», que el leader ya gestiona. Hay que marcarla con una nota que remita a esa decisión.
- **T0 y T10.** Las capturas «antes» y «después» existen en `_trabajo/marca/`, pero
  `progress/features/QC-227.md` no tiene el índice de parejas que exigen los dos «Hecho cuando».
  Le toca al leader.

Corregir B1 obliga además a volver a correr T10 (E2E).

### m1 — menor: dos enmiendas de tests fuera de la lista cerrada de `design.md > 9`, sin nota `ENMIENDA QC-227`

- `tests/unit/clientes/scope.test.ts`: alta en `E2E_PERMITIDOS`.
- `tests/unit/shared/data-table-alcance.test.ts`: alta en la lista cerrada (de 35 a 36).

Las dos son puntos de extensión de listas cerradas de E2E, igual que `E2E_ESPERADOS`. Llevan su
nota fechada, están en `tasks.md > Archivos esperados` y figuran en la bitácora. No cambian
ninguna aserción de comportamiento. Solo lo anoto, porque §9 dice «Si falla otro test, no se
enmienda: se para y se reporta».

### m2 — menor: diff de fin de línea en dos archivos

`data-table-header-menu.tsx` y `data-table-types.ts` salen enteros en el diff porque pasan de
CRLF a LF (`.gitattributes eol=lf`). Ignorando espacios, el cambio real es de 3 líneas. Está
anotado en la bitácora. No hay que hacer nada.

### O1 — Las tres enmiendas fuera de lista que pidió evaluar el leader: correctas

Las tres cambian solo la clase o la variante esperada, cada una lleva `ENMIENDA QC-227` y el
requisito aprobado las justifica:

| Test | Cambio | Requisito |
| --- | --- | --- |
| `tests/unit/pedidos-ui/order-columns.test.tsx` | `secondary`/`default`/`secondary` → `warning`/`info`/`success` | R3 |
| `tests/unit/login-skin.test.tsx` | `ring-3` → `ring-1` en el campo y `outline-2` en el botón | R21, R24 |
| `tests/unit/shared-ui/motion-classes.test.tsx` | hover del destructivo → `color-mix(... --foreground 10%)` | R20 |

Ninguna toca una aserción de comportamiento: la etiqueta, el `data-status` y la ausencia de
`btn-veil` siguen afirmándose.

Las enmiendas de la lista cerrada también son correctas:

- `button-touch`: solo el foco.
- `sidebar-ajuste`: `10px` → `14px`, P12.
- `guard-identificador-de-request`: alta del E2E.
- `color-tokens`: la conversión se mueve sin cambios de lógica a `tests/unit/theme/contraste.ts`;
  he comparado los coeficientes.

### O2 — Cabecera de tabla en oscuro: cumple el umbral, sin hallazgo

Medido en `pedidos-tabla-oscuro.png`:

| Modo | Fondo | Texto | Contraste |
| --- | --- | --- | --- |
| Oscuro | `rgb(31,40,42)` (`--muted`) | `rgb(135,145,148)` (`--muted-foreground`) | **4.66:1** |
| Claro | — | — | 6.74:1 |

- En oscuro, el valor coincide con la guía (4.66) y con la medida del E2E.
- El color es el mismo en «Nº de pedido», «Estado», «Receta» y «Cliente». La impresión de que
  «Receta» y «Cliente» se ven más apagados viene de que no llevan icono de orden; el color no
  cambia.
- R10 pide `≥ 4.5:1`, y se cumple.
- El margen es escaso (0.16). Subirlo exige cambiar el token, y eso lo prohíben D10 y R27: sería
  una ficha de paleta.

### O3 — Resto, sin hallazgo

- **Alcance.** No toca `lib/modules`, `db` ni dependencias. No hay componentes nuevos, ni
  transiciones nuevas, ni cambios de tokens.
- **Snapshots de paridad.** Solo cambian clases, y el `loading="lazy"` aprobado (R26).
- **Comentarios.** Fuera de B2, los comentarios de producción añadidos explican el porqué y no
  citan fichas.
