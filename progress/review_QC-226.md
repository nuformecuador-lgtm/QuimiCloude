# review QC-226 — tema-y-marca-base

Revisor: reviewer, 2026-10-08. Diff: `origin/dev...feature/QC-226-tema-y-marca-base` (HEAD `0421acdf`).
Spec: R1–R34, D1–D22. Fuentes de marca: `<raíz>/_trabajo/marca/`.

## Veredicto: OK

No hay hallazgos bloqueantes. Quedan cinco menores y dos tareas de cierre que son del leader
(T10 se marca con esta revisión; T11 y la comprobación de `og:image` en el preview, abajo).

## Verificación ejecutada (salida real)

| Comando | Resultado |
| --- | --- |
| `cmp` de los 11 archivos del kit (4 SVG de `svg/`, 3 PNG y 4 de `web/`) contra `public/brand/`, `public/icons/` y `app/` | los 11 idénticos byte a byte |
| Script node: declaraciones `--*` de `:root`/`.dark`/`@theme inline` de `tokens.css` contra `app/globals.css` | `:root` 55 claves, 0 diferencias; `.dark` 47 claves, 0 diferencias; `@theme inline` 16 claves, 0 diferencias. Lo único que el repo tiene de más es `--sidebar-panel-gradient` |
| Lienzo A (`Main.dc.html:102-114`) contra `globals.css:183,187,235-245` | paradas claro/oscuro exactas; activo 26 %/5 %, anillo 32 %, `#fff`, 600 sobre `--sidebar-primary` = `#80C5FF` en los dos modos (`tokens.css:29,80`) |
| Lienzo C (`Login.dc.html:19-20,72-85,120-150`) contra `globals.css:289-450` y `login-background.tsx` | fondo, vidrio, sombra, `blur(14px)`, 3 moléculas (150/110/190, posiciones, 0.22/0.18/0.14), polígonos, trazos y colores, 22/30/26 s con `alternate`/`alternate-reverse`/`alternate`, keyframes `translateY(-36px) rotate(24deg)` y entrada 300 ms: exactos |
| `pnpm run typecheck` | **rojo local por entorno**, no por código: 9 `TS1xxx` en `.next/dev/types/{routes.d.ts,validator.ts}`, que están corruptos. Hay un `next dev -p 3001` de este worktree en marcha (PID 11364, desde las 15:32) que es dueño de esos archivos. Con un tsconfig temporal que excluye `.next/dev` y usa los tipos de `next typegen`: `tsc --noEmit` exit 0 |
| `pnpm run lint` | `0 errors, 7 warnings` (los 7 previos, ajenos) |
| `pnpm exec vitest related --run <ts/tsx/css del diff>` y `pnpm run test:rapido` | `95 passed`, `1 failed` (96 archivos); `1484 passed`, `1 failed`, `20 skipped` |
| El rojo de arriba: `tests/unit/navegacion/pantallas-exigen-permiso.test.tsx > '/pedidos' …` | Está en `tests/baseline-rojos.json:12`. Corrido sobre un checkout limpio de `origin/dev` (`8bdf98d8`) falla igual: `TypeError … reading 'status'`, `1 failed / 45 passed`. Es el **único** rojo |
| `pnpm exec vitest run guard` | `57 passed`; `754 passed`, `11 skipped` |
| `./init.sh` | Se para en el typecheck por los `.next/dev/types` corruptos de arriba. Los pasos previos, en verde: fichas, assignee, cupo, specs, perfil, arnés, worktrees, `.env` y base al día. Avisa `prisma generate fallo`, casi seguro por el `next dev` de 3001, que bloquea el motor |
| E2E `login-skin.spec.ts` + `brand-assets.spec.ts` (chromium + webkit) | `28 passed (11.7s)`. Corrieron contra el `next dev` de 3001, que es de este worktree (lo comprobé por la línea de comando del proceso). El 3117 del config no pudo arrancar porque Next no deja dos `dev` en el mismo directorio |
| E2E `e2e/login.spec.ts` (chromium + webkit) | `10 passed (18.5s)`, el mismo servidor; ahora la base local sí está arriba |
| `git diff --stat origin/dev...HEAD -- package.json pnpm-lock.yaml components/ui` | vacío |
| Líneas añadidas en `app/`, `components/` y `lib/` que citan `QC-<n>`, `R<n>`, `D<n>`, `design.md` o «decisión cerrada» | ninguna |

Nota para el leader: antes del `./init.sh` de cierre hay que parar el `next dev` del puerto 3001
(o regenerar `.next/dev/types`). Si no, el typecheck sigue rojo por esos archivos, que no son
del diff.

## Checklist

### Reviewer (1–4)
- [x] **Trazabilidad.** Los 34 requisitos tienen un test concreto (mapa abajo).
- [ ] **Tasks.** Faltan dos por marcar:
  - T10 es mía: hecha y en verde (sección siguiente). Que el leader la marque `[x]`.
  - T11 es el cierre y está pendiente: `./init.sh` verde, con el mapa ya en la bitácora.
  - T8 está marcada `[x]`, pero le falta la comprobación del preview de Vercel (menor m1).
- [x] **Checkpoints.** Los recorrí punto por punto (sección propia).
- [x] **Verificación ejecutable.** Tabla de arriba.

### T10 — tests de specs cerrados (D16, D21)

Contrasté el diff de `tests/` y `e2e/` con la tabla de `design.md > 8`. Cumple.

- **color-tokens.test.ts.** Los siete casos de QC-29 tienen equivalente, con «ENMIENDA QC-226» en el nombre:
  - 26 claro y 26 oscuro → R1 y R2;
  - acromáticos y `--chart-*` → R1 y R2;
  - hue del acento → «primario petróleo / acento azul»;
  - radio → R4;
  - contraste 4.5 → R5 `it.each(modes)`, con 14 pares de texto (incluye el de D22) y 2 de interfaz a 3:1.

  Casos nuevos: R3, R6 y R32.
- **theme-provider.test.tsx.** Solo cambia el mock de `next/font/google`, con su nota.
- **sidebar-panel.test.tsx.** Cambian las regex de las paradas (nota en `:90`). Se suma el caso de R9 estático.
- **login-skin.test.tsx.** Los 15 casos de burbujas, `--qc30-` y delimitadores tienen equivalente:
  - cada uno con «ENMIENDA QC-226»;
  - es la tabla de `impl_QC-226.md > T7 > D16`, que contrasté caso a caso;
  - ninguno se borra sin sustituto.

  Casos nuevos: R16, R20 (orden), R21 y R22 (fundido y ámbito).
- **app-sidebar, sidebar-desktop, sidebar-mobile y sidebar-ajuste.** Las aserciones
  `private-brand-long/short/tagline/mark` pasan a afirmar el `src` y el `height` del `<img>`, con
  nota en cada caso. El nombre accesible `BRAND_LABEL` se sigue afirmando.
- **e2e/login-skin.spec.ts.** Los dos casos de burbujas pasan a moléculas (R22 y R18/R19). Se suman R17 y R21.
- **login-form.test.tsx (D21).** Solo cambia el caso de `:375-381`, que ahora exige
  `getByRole('heading', { level: 1, name: 'QuimiCloude' })` y lleva «ENMIENDA QC-226 (D21)» en el
  nombre. El resto del archivo no se tocó (diff `+3 −4`).

Las notas de enmienda de los specs cerrados existen. Son solo inserciones: `numstat` sin una línea borrada.

| Spec | Notas | Requisitos que cubren |
| --- | --- | --- |
| QC-29 | 8 | D6/D7/D10, R1–R2, R3, R4, R5, R6, R25 y R18 |
| QC-30 | 9 | R1, R9, R12, R14, R20, R21, R22, R26 y D3/D8/D9/D10/D12 |
| QC-11 | 2 | R24 y D7 |
| QC-13 | 1 | R7 |

### Mapa R<n> → test (verificado)

| R | Test |
| --- | --- |
| R1, R2 | `tests/unit/theme/color-tokens.test.ts` «R1 (ENMIENDA…)», «R2 (ENMIENDA…)», `--chart-*`, acromáticos; valores contrastados además contra el kit |
| R3 | `color-tokens.test.ts` «R3: expone cada token de estado…» |
| R4 | `color-tokens.test.ts` «R4 (ENMIENDA QC-226): declara --radius en 0.5rem» |
| R5 | `color-tokens.test.ts` R5 `it.each(modes)` (`TEXT_PAIRS` 14, `UI_PAIRS` 2) |
| R6 | `color-tokens.test.ts` «R6: …» |
| R7, R8 | `tests/unit/brand/fonts.test.ts` (4 casos R7, 2 casos R8) |
| R9 | `tests/unit/theme/sidebar-panel.test.tsx` «R9: …» ×2 |
| R10 | `sidebar-panel.test.tsx` «usa 272px…78px», «al menos 44px», radio 22 en «R9»; `sidebar-ajuste.test.tsx` «44px con !important» (ver m3: 18 px sin test) |
| R11 | `tests/unit/sidebar-ajuste.test.tsx` «R11: …» ×2 |
| R12 | `tests/unit/app-sidebar.test.tsx` «R12: …», `sidebar-mobile.test.tsx` (Sheet), `sidebar-ajuste` «R12, R15» |
| R13 | `app-sidebar.test.tsx` «R13: …», `sidebar-ajuste` «R13» ×2, `sidebar-desktop` (ENMIENDA) |
| R14 | `tests/unit/theme/private-header.test.tsx` «R14: …»; `brand-logo.test.tsx` «R14, R15» |
| R15 | `tests/unit/brand/brand-logo.test.tsx` «R15, R30» ×3, «R15: 132 px», «R15: sin fondo…» |
| R16 | `tests/unit/login-skin.test.tsx` «R16: …»; `login-form.test.tsx` (D21) |
| R17 | `login-skin.test.tsx` «R17 …» ×4; `e2e/login-skin.spec.ts` «R17 …» |
| R18, R19 | `login-skin.test.tsx` R18 ×8, R19 ×2; E2E «R18, R19 …» |
| R20 | `login-skin.test.tsx` R20 ×5 |
| R21 | `login-skin.test.tsx` «R21 …»; E2E «R21 …» |
| R22 | `login-skin.test.tsx` R22 ×3; E2E «R22 …» |
| R23 | `login-form.test.tsx` (verde, solo D21 enmendado); `login-skin` medidas/`main`/enlace; `e2e/login.spec.ts` 10/10 en verde (esta revisión) |
| R24–R27, R29, R30 | `tests/unit/brand/metadata-assets.test.ts` |
| R25, R26, R28 | `e2e/brand-assets.spec.ts` (14/14) |
| R31 | `tests/unit/theme/sin-dependencias-nuevas.test.ts` + guardia `guard-dependencias-aprobadas`; diff de `package.json` vacío |
| R32 | `color-tokens.test.ts` «R32: …»; `login-skin.test.tsx` «R32 (ENMIENDA…)» |
| R33 | `tests/unit/theme/ui-primitivas-intactas.test.ts`; diff de `components/ui/` vacío |
| R34 | `brand-logo.test.tsx` «R34: …» ×2 |

### CHECKPOINTS.md
- [x] `requirements.md` en EARS con `R1`–`R34`.
- [x] `design.md` con 4 alternativas descartadas (§10).
- [ ] `tasks.md` todo en `[x]`: faltan T10 (hecha aquí) y T11 (cierre).
- [x] `design.md` abre con `## Lo que ya existe`, y el diff no re-crea nada de esa lista:
  - reutiliza el mecanismo de tema, el ámbito `[data-login]`, el matcher y la regla del ítem activo;
  - no había ningún componente de logo previo.
- [x] Equipo: rama del candado (`998f4425 chore(QC-226): feature tomada por ArqDev`); `init.sh` da «6 en vuelo con assignee».
- [x] Cada `R<n>` tiene un test, y el mapa está en `progress/impl_QC-226.md`, repartido por fases.
- [~] Typecheck: verde sobre el código. El rojo local es de entorno (`.next/dev/types`).
- [x] Lint: 0 errores.
- [ ] `gate-completo`: es del CI y se ve en el PR.
- [~] Flujo crítico (la pantalla de autenticación): `e2e/login-skin.spec.ts` (Playwright) en
  verde, con salida en la bitácora. La de `e2e/login.spec.ts` no está en la bitácora; la corrí
  aquí, 10/10 (m4).
- [x] Sin dependencias nuevas.
- [x] Sin secretos ni webhooks.
- [x] Sin config de entorno hardcodeada: no se fija `metadataBase`, y la URL de `og:image` queda a cargo de Next.
- [ ] `./init.sh` verde: se para en el typecheck por el entorno, y sin esa parada solo quedaría el rojo del baseline (PR #180).
- [ ] Cierre de `progress/features/QC-226.md` y desmontar el worktree: los hace el leader después de esta revisión.

### docs/checkpoints-proyecto.md
- [x] Typecheck: código verde. Lint: sin errores.
- [x] Los E2E del flujo tocado son de Playwright.
- [x] Multiplataforma:
  - `min-h-svh`, no `100vh`;
  - el isotipo del encabezado no es interactivo, así que no añade ningún destino táctil;
  - el rail sigue en 44 px;
  - `backdrop-filter` lleva el prefijo `-webkit-` y una base opaca;
  - las animaciones solo usan `transform`;
  - los inputs no cambian.
- [x] Datos, permisos y módulos hexagonales: no aplican. No hay tablas, consultas, Server
  Actions ni módulos nuevos, y `lib/shared/navigation/private-nav.ts` solo pierde dos constantes.
  Los componentes `private/` siguen recibiendo los datos por props.

### docs/perfil-agentes.md > reviewer (5–9)
- [x] 5. Sin secretos ni hardcode de contexto, y las capas no cambian.
- [x] 6. Multiplataforma: ver arriba.
- [x] 7. `package.json` sin tocar.
- [x] 8. Sin modelos ni consultas nuevas.
- [x] 9. Ningún comentario añadido o modificado en producción cita fichas, requisitos, decisiones ni `design.md`.

## Lo que el implementer marcó para revisar

- **`BrandLogoProps` como unión** (`components/shared/brand-logo.tsx:34-41`). Correcto:
  - `tone="auto"` solo se admite con `variant="isotipo"`, porque en el repo solo está la versión clara del isotipo (D1: se versiona solo lo que se usa);
  - el compilador rechaza `auto` con un logo completo, que es más estricto que `design.md > 4` y no lo contradice en ningún uso.

  Ver m5: el design no se actualizó.
- **El contenedor `flex items-center gap-2 md:hidden`** (`app/(private)/layout.tsx:125`). Correcto:
  - en Tailwind v4, `md:hidden` sale después de `flex`, así que en viewport ancho se oculta igual;
  - `private-header.test.tsx` R14 afirma `md:hidden` en el mismo contenedor que el control;
  - `private-layout.test.tsx` sigue verde sin editarlo.
- **`brand-assets.spec.ts` en `E2E_ESPERADOS`** (`tests/guards/guard-identificador-de-request.test.ts:111-114`). Bien:
  - lo dio de alta en el mismo sitio y con el mismo formato de nota que las demás;
  - la guardia está en verde.

  Ese archivo no está en `tasks.md > Archivos esperados`, pero el cambio es necesario.
- **El aviso de LCP de Next sobre `/brand/logo-vertical-dark.svg`.** El spec no lo cubre: ningún
  `R<n>` ni `design.md > 4` habla de prioridad de carga. No es hallazgo de esta ficha. Lo dejo
  como menor (m2) para una ficha posterior.

## Hallazgos

- **m1 — menor.** T8 está marcada `[x]` en `specs/QC-226-tema-y-marca-base/tasks.md:43-47`, pero
  le falta un paso. La task pide «Comprobar en el preview de Vercel la URL absoluta de `og:image`»
  (`design.md > 7` y `> 12`), y la bitácora la deja «Pendiente» (`progress/impl_QC-226.md`, sección
  T8). Desde el worktree no se puede hacer. Qué hacer: comprobarla en el preview del PR antes del
  merge y anotarla en `progress/features/QC-226.md > Cierre`. Si el host no es el bueno, a
  `progress/deudas.md`.
- **m2 — menor.** El `next dev` avisa de que el logo vertical del login
  (`app/(public)/login/page.tsx`, `<BrandLogo variant="vertical" … height={79} />`) es el LCP y
  carga en lazy. No incumple ningún requisito. Propuesta para otra ficha (QC-227 o QC-228): que
  `BrandLogo` acepte una prop de precarga y que el login la use.
- **m3 — menor (anterior a esta ficha).** R10 pide conservar el margen exterior de 18 px, y ningún
  test lo afirma: el `p-[18px]` de `components/private/app-sidebar.tsx:107` no aparece en `tests/`.
  El resto de R10 sí está cubierto (22, 272/78 y 44 px). El diff no toca esa línea, así que no es
  una regresión. Es un hueco que viene de QC-29 R18.
- **m4 — menor.** `progress/impl_QC-226.md` no trae ninguna salida en verde de `e2e/login.spec.ts`
  (T7 dice que lo corre el leader), y `CHECKPOINTS.md > Calidad de codigo` la pide en un flujo
  crítico. Aquí salió `10 passed (18.5s)` en chromium y webkit. Qué hacer: pasar esa salida a la
  bitácora o al Cierre.
- **m5 — menor (documentación).**
  - `specs/QC-29-tema-claro-oscuro/requirements.md:92-93` (nota de R25) dice «trece de texto», pero
    desde D22 R5 tiene **14** pares de texto. Tampoco dice que R25 se mantiene, como pide
    `design.md > 8` («**R25 se mantiene** (QC-226 D22)»). Esa nota se escribió antes de D22.
  - `design.md > 4` sigue mostrando `BrandLogoProps` con `tone: 'on-dark' | 'auto'` en las tres
    variantes, y el código ya es una unión.

## Cierre que queda para el leader

1. Marcar T10 `[x]`, verificada en esta revisión.
2. Parar el `next dev` de 3001 o regenerar `.next/dev/types`. Correr `./init.sh` y comprobar que
   el único rojo es `pantallas-exigen-permiso` (baseline, arreglo en PR #180). Entonces marcar T11.
3. Hacer m1 en el preview del PR.
