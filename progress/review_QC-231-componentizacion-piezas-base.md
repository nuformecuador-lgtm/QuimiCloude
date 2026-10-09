# QC-231 — componentizacion-piezas-base · review

Rama `feature/QC-231-componentizacion-piezas-base`, HEAD `2cda7887`, merge-base con `origin/dev`
`d5eb43a4` (0 commits por detrás). 45 commits, 291 archivos. Revisado el 2026-10-08.
MCP del grafo: no se ha usado. Todo se verificó con git, Grep, Read y ejecución.

## Verificación ejecutada (no copiada de la bitácora)

| Qué | Resultado |
|---|---|
| `./init.sh` (rápido) | `== init OK ==`, exit 0. Typecheck en verde. Lint: 0 errores y 7 warnings ajenos al diff. Related: 269/270 archivos. De los tests de árbol, 97/99 en verde. Hay tres rojos (`pantallas-exigen-permiso > /pedidos`, `recetas/module-contract`, `recetas/scope`) y los tres están en `tests/baseline-rojos.json`: **no son hallazgo** |
| `vitest run grupos/alcance.test.ts tests/unit/shared tests/unit/paridad tests/unit/shared-ui` | 51 archivos; 527 en verde y 20 saltados. Los 20 saltados son los 18 de QC-85 y los 2 de QC-56, con su motivo escrito |
| `vitest run guard-piezas-base --reporter=verbose` | 24/24. El caso R33 **corre** en esta rama y no se salta |
| Paridad: `git log` de cada `.snap` y de cada `*-paridad.test.tsx` desde el merge-base | Los 15 snapshots y los 15 tests solo aparecen en `203a31f9` (T0). La excepción es `login-paridad.test.tsx.snap`, que además cambia en `73834fb4`. El commit de T0 no toca ningún archivo de producción |
| Diff de `73834fb4` | Solo añade `min-h-11 min-w-11` a la clase de `login-submit`, en reposo y enviando. Coincide con D10 |
| Archivos D11, la credencial y `step-document-view.tsx` | `git diff --quiet` sobre los 17: ninguno se ha tocado |
| `package.json` / `pnpm-lock.yaml` | Sin cambios (R30) |
| Capturas (R3) | Comparación propia píxel a píxel (PIL, umbral 30) de las 42 parejas de `_trabajo/marca/capturas-{antes,despues}`: los nombres son los mismos y los tamaños también. 36 salen idénticas. Recorté y miré las 6 que difieren: es el tiempo «en curso» del dashboard (13 min frente a 4 h 48 min) y la insignia de Next en desarrollo («Compiling»/«Rendering»). **No hay diferencias de la feature** |
| Poder de detección de los tests de alcance en la rama de su feature | Monté un worktree temporal en HEAD separado (ya desmontado) y simulé el CI con `GITHUB_HEAD_REF`. **Con `feature/QC-85-pantalla-de-grupos-de-trabajo` corren los 34 casos, no se salta ninguno y 8 se ponen rojos** contra el diff ajeno, el ancla de no-vacuidad incluida. **Con `feature/QC-56-migrar-listas-a-tabla-compartida`, R20 y R28 corren y se ponen rojos.** Sin `GITHUB_HEAD_REF`, los dos archivos saltan, como debe ser |

## Checklist

### Reviewer (puntos 1-4)
- [x] **1. Trazabilidad.** R1-R33 tienen todos su test real. El detalle va abajo, y la salvedad de R12 y R18 está en los hallazgos.
- [ ] **2. Tasks.** **T16 sigue en `[ ]`** en `tasks.md:191`, aunque el leader la hizo y yo la he verificado (H4).
- [ ] **3. Checkpoints.** Ver abajo: fallan «tasks todas `[x]`» (H4) y «comentarios» (H1).
- [x] **4. Verificación ejecutable.** Ver la tabla de arriba.

### Mapa R → test (comprobado)
| R | Test | Estado |
|---|---|---|
| R1, R2, R16-R18 | 15 `tests/unit/paridad/*-paridad.test.tsx`, con 125 snapshots congelados en T0 | ok. R18 tiene una salvedad (H3) |
| R3 | Esta review (tabla de arriba) | ok |
| R4 | Revisé el diff de aserciones de los 27 tests modificados. Son repuntes: `EMPTY_CELL`→`EMPTY_MARK`, renderizar por `CustomerTable`, conteos de convenciones por archivos borrados, y las enmiendas R8 y R32. Ninguno quita una aserción sin sustituirla | ok |
| R5, R6 | `shared-ui/button-touch.test.tsx` y la guardia | ok |
| R7, R21, R25, R29, R31, R33 | `guards/guard-piezas-base.test.ts`, con una muestra que muerde por regla | ok. Las salvedades de las excepciones están en H2 y m3 |
| R8 | Los 3 `*-route-contract` con `llevaLaTallaTactil` y una muestra que muerde | ok |
| R9-R11 | `shared-ui/error-alert.test.tsx` y `error-alert-paridad` | ok |
| R12 | La guardia, regla `compara-inesperado` | **Falla en 4 sitios excluidos sin decisión (H2)** |
| R13-R15 | `empty-state`, `error-state` y `table-skeleton` (`shared-ui/`) | ok |
| R19 | `data-table-states-sustituyen.test.tsx`. `data-table.test.tsx` y `data-table-states.test.tsx` no se tocan | ok |
| R20 | Paridad de la vitrina, de las 4 páginas de fórmula (×2 errores), de las 6 secciones de asignación y de pedidos | ok |
| R22 | `shared-ui/spinner.test.tsx` y la paridad | ok |
| R23, R24 | `shared-ui/date-cell.test.tsx` | ok |
| R26, R27 | `shared-ui/submit-button.test.tsx`, `login-paridad` y `identity-ui/set-credential-form.test.tsx:189`, que sigue exigiendo `min-h-11` y no se ha editado | ok |
| R28 | `shared-ui/entity-image-size.test.tsx` y `order-form-image-paridad` | ok |
| R30 | `guard-dependencias-aprobadas` (sin cambios); `package.json` intacto | ok |
| R32 | `migracion-listas-alcance.test.ts` enmendado, más la nota fechada en `specs/QC-56-…/requirements.md` | ok |

### `CHECKPOINTS.md`
- [x] `requirements.md` con EARS numerados.
- [x] `design.md` con alternativas descartadas (A1-A7).
- [ ] `tasks.md`, todas `[x]`: **no, falta T16** (H4).
- [x] `## Lo que ya existe` presente y no vacía. El diff no re-crea nada de lo listado: `UnexpectedErrorNotice` se reutiliza, y `EntityImage` y `date-civil.ts` se amplían.
- [x] Assignee (Carlos Restrepo) y rama publicada.
- [x] Cada R tiene su test. El mapa R → test está en el impl, aunque quedó desfasado (m1).
- [x] Typecheck y lint sin errores.
- [ ] `gate-completo` en CI: queda para el PR. No es de esta review.
- [x] Flujo crítico: la autenticación se toca solo en el botón del login. `e2e/login-skin.spec.ts` no se edita y corre en CI. No hay flujo nuevo.
- [x] No entra ninguna dependencia.
- [x] Sin secretos, sin webhooks y sin configuración hardcodeada.
- [x] `./init.sh` en verde.

### `docs/checkpoints-proyecto.md`
- [x] Typecheck y lint.
- [x] Multiplataforma: no cambia ningún estilo. Los targets de 44 px se conservan (la paridad de clases lo prueba). No hay `100vh` ni `:hover`, y ningún input baja de 16 px.
- [x] Datos, seguridad, RLS, migraciones y permisos: no aplican, porque no hay modelo, consulta, migración ni Server Action nuevos.
- [x] Módulos hexagonales: `lib/shared/ui/{touch-target,empty-mark,date-civil}.ts` no importan módulos. `components/shared/error-alert.tsx` importa el contrato `@/lib/modules/errores`.

### `docs/perfil-agentes.md > reviewer` (5-9)
- [x] 5. Calidad y seguridad: no aplica nada nuevo.
- [x] 6. Multiplataforma: ver arriba.
- [x] 7. Dependencias: ninguna.
- [x] 8. Aislamiento por empresa: no aplica.
- [ ] 9. Comentarios: **4 líneas nuevas de producción citan `QC-231`, `R<n>` o `D5`** (H1).

## Hallazgos

### H1 — BLOQUEANTE · comentarios con citas en líneas nuevas de producción (perfil, punto 9)
`git diff --ignore-cr-at-eol` sobre `app components lib hooks`, líneas añadidas:
- `components/shared/data-table/data-table-types.ts:167`: `(QC-231 R16-R18). … como hoy (R19).`
- `components/shared/data-table/data-table-types.ts:175`: `… sigue dentro de la tabla (D5). */`
- `components/shared/data-table/data-table-types.ts:212`: `/** Ausente = los estados internos de siempre (R19). */`
- `components/shared/data-table/data-table.tsx`, el comentario antes del primer `return` temprano:
  `… barras y paginacion incluidas (R16-R18).`

**Qué falta:** reescribirlos sin `QC-<n>`, `R<n>` ni `D<n>`, diciendo el porqué. El de la línea 175,
además, tiene que dejar de afirmar algo falso (ver H3).

### H2 — BLOQUEANTE · R12 incumplido en 4 diálogos de borrado, con una excepción que nadie ha decidido
`delete-product-dialog.tsx:94`, `delete-recipe-dialog.tsx`, `delete-catalog-line-dialog.tsx` y
`delete-supplier-dialog.tsx` siguen comparando con `UNEXPECTED_ERROR_CODE` para **decidir qué
pintar**: un `div` con `UnexpectedErrorNotice` o un `p` con el mensaje. R12 solo deja fuera
`ErrorAlert`, `UnexpectedErrorNotice`, D3, D11 y «la lógica que no pinta», y estos cuatro no entran
en ninguna. La guardia los excluye (`guard-piezas-base.test.ts:187-201`) diciendo «Lo unifica
QC-227/QC-232», pero no hay ninguna decisión del humano que lo respalde. En
`progress/features/QC-231.md > Decisiones` las decisiones que remiten a QC-232 son otras:
`step-document-view` y los alias `EMPTY_CELL`.

Los cuatro archivos están en `Archivos esperados`. D6 ya prevé el camino («las diferencias de
marcado de `ErrorAlert` se conservan como props»): una prop que fije la etiqueta del contenedor en
la rama de catálogo, por ejemplo `cataloguedAs="p"`, mete la comparación dentro de `ErrorAlert` sin
cambiar el DOM.

**Qué falta, una de dos:**
- migrar los 4 sitios a `ErrorAlert` con esa prop y quitar las 4 exclusiones de la guardia;
- o una decisión explícita del humano que enmiende R12 para estos 4 archivos y los pase a una ficha
  concreta, anotada en `progress/features/QC-231.md > Decisiones`.

### H3 — BLOQUEANTE · D5: R18, en su forma escrita, no se cumple en 5 listas, y nadie ha decidido la desviación
Hay 5 listas con este problema: catálogo, unidades, presentaciones, usuarios y grupos. En ellas la
sección pasa `states.empty` **también con búsqueda activa**, por ejemplo en
`unit-list-section.tsx:81-98`, con el comentario «Con termino de busqueda tambien es el vacio
propio». La paridad lo fija: en `unidades-paridad`, el caso «R1 R18 — sin resultados, con búsqueda
activa» pinta el `EmptyState` sin barras.

- **Es lo correcto para R1/D2:** antes de la feature, esas listas pintaban con búsqueda su vacío
  propio fuera de la tabla. Pasar a `DataTableEmpty` habría cambiado el DOM. El DOM no cambia y las
  capturas lo confirman.
- **Contradice tres textos:**
  - el segundo punto de R18 («si hay búsqueda o filtro activos, DEBE seguir pintando el “sin
    resultados” de QC-56 D15 dentro de la tabla y con sus barras»);
  - el comentario de `DataTableStates.empty` (`data-table-types.ts:175`, «Solo sin búsqueda ni
    filtro activos»);
  - la nota de T0 en `progress/features/QC-231.md > Tandas` («No se pasa `states.empty` con búsqueda
    activa (D5)»).

  El impl lo marca como «tiene que mirarlo el reviewer», pero no es algo que pueda decidir yo.

**Qué falta:**
- una decisión del humano que enmiende R18 (y D5 si hace falta) para las listas cuyo «sin
  resultados» ya era el vacío de la sección. Se conserva vía `states.empty` y D15 sigue solo donde ya
  existía;
- corregir el comentario de `DataTableStates.empty` para que diga lo que hace el código;
- corregir la nota de T0.

No hace falta cambiar código de comportamiento.

### H4 — BLOQUEANTE (checkpoint) · T16 sin marcar
`tasks.md:191` sigue en `[ ]`. La task está hecha: la anotó el leader en `progress/features/QC-231.md`
y la he verificado arriba. Se arregla marcándola.

### m1 — menor · el mapa R → test del impl quedó desfasado
`progress/impl_…md > Consolidado (T15)` sigue diciendo «R3 pendiente (T16)» y que la parte de
`establecer-contrasena` de R26/R27 está «pendiente (T9l)». Las dos están hechas: T9l en `4d65bd6b`,
T16 en esta review. Lo mismo pasa con el «Pendiente» de esa sección, que aún lista los tests de
alcance como rojos.

### m2 — menor · desviación aceptada en QC-56: sin `--diff-filter=d`
Es correcta. He comprobado que el bloque de QC-56 de `data-table-alcance.test.ts` solo lista
nombres (`git diff --name-only`) y no lee ningún archivo, así que no hay ENOENT que evitar. Con el
filtro, un borrado bajo `components/shared/data-table/` dejaría de contar para R20 y R28, y eso
violaría la otra mitad de la decisión del humano («ningún caso se debilita»). La simulación de
arriba confirma que R20 y R28 muerden en la rama de QC-56. Queda un hilo suelto: `design.md > 13`
(la enmienda) sigue diciendo que «el diff usa `--diff-filter=d`» en los dos tests, y conviene
corregirlo. La decisión la aceptó el leader, no el humano. Sugiero dejarla anotada en `Decisiones`
para que la vea.

### m3 — menor · las excepciones con nombre de la guardia que citan QC-232 no tienen dónde aterrizar
- **Respaldadas por spec o por el humano:**
  - D7, D11 y D13;
  - `step-document-view.tsx`;
  - los alias `EMPTY_CELL` de `product-columns.tsx` y `catalog-columns.tsx`.
- **Sin respaldo:**
  - los 4 diálogos (H2);
  - el alias `MISSING_VALUE_MARK` de `assigned-orders-columns.tsx`. R31 lo prohíbe fuera de D11 y
    este archivo no es D11. Se defiende por analogía con D11, porque lo reexporta el barrel D11 de
    asignación, pero no está decidido.
- **Constantes que siguen valiendo `—`** (`NO_EQUIVALENCE_LABEL`, `MISSING_PERSON_MARK` y
  `MISSING_RESPONSIBLES_MARK`, como alias): la guardia las deja pasar porque no son el literal. R25
  dice «ninguna otra constante con ese valor».
- **QC-232 no tiene ficha ni spec en el repo** (`specs/`, `progress/features/`, `progress/deudas.md`).
  Nada recoge todo lo que QC-231 le traspasa.

Sugerencia: que el leader liste en la ficha de QC-232, o en `progress/deudas.md`, cada excepción
que la cita (archivo y motivo), para que la guardia pueda apretarse cuando QC-232 cierre.

### m4 — menor · `user-table.tsx` sale entero en el diff por el paso de CRLF a LF
Es ruido de revisión. Sin el cambio de fin de línea, sus líneas de comentario con citas
preexistentes no son añadidas, así que no son hallazgo del punto 9. Aun así, ensucian el diff del PR.

## Puntos que pidió mirar el leader, uno a uno
- **Trazabilidad:** ok, salvo R12 (H2) y R18 (H3).
- **Los tests de alcance endurecidos:** **no pierden poder de detección en la rama de su feature.**
  Lo comprobé ejecutándolos con el nombre de rama simulado en HEAD separado: 0 saltados y rojos
  contra un diff ajeno. Sus muestras puras (igualdad exacta, `null`/`HEAD`, QC-67 y QC-231) son
  correctas. Que `archivosDeLaPantalla()` excluya los borrados no debilita nada, porque un archivo
  borrado no puede declarar un filtro ni un `fetch`.
- **`--diff-filter=d` en QC-56:** la desviación es correcta (m2).
- **D5:** es BLOQUEANTE de decisión y comentario, no de comportamiento (H3).
- **Las excepciones con nombre que citan QC-232:** dos sin respaldo (H2 y m3), y QC-232 sin un sitio
  donde recogerlas (m3).
- **El snapshot del login (D10):** ok. Un solo commit aparte (`73834fb4`) y la única diferencia es
  `min-h-11 min-w-11`. En las capturas, el login sale idéntico en claro, oscuro y móvil.
- **T9l, establecer contraseña (D12):** ok. El diff toca un solo archivo de la ruta y conserva la
  firma (`label`, `pendingLabel`) y el testid. Las clases pasan de `min-h-11 w-full` a
  `… min-h-11 min-w-11 w-full`, que es la excepción declarada de R1. `set-credential-form.test.tsx`
  y `scope.test.ts` no se tocan y siguen en verde.

## Veredicto

**RECHAZADO.** Hay 4 bloqueantes:

| Hallazgo | Qué es | Qué hace falta |
|---|---|---|
| H1 | Comentarios con citas | Una edición de comentarios |
| H2 | R12 en 4 diálogos | Código, o una decisión del humano |
| H3 | R18/D5 | Una decisión del humano y corregir el comentario |
| H4 | T16 sin marcar | Marcar la casilla |

El «cero cambio» está demostrado: la paridad está intacta, salvo la excepción declarada, y las
capturas no difieren. Los bloqueantes no tocan el comportamiento: son dos huecos de decisión y dos
de forma.
