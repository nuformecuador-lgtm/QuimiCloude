# QC-233 — componentizacion-buscadores · review

Reviewer, 2026-10-09. Rama `feature/QC-233-componentizacion-buscadores`, HEAD `0d2e3d59`, base
`origin/dev` = merge-base `a81e531b`. Se revisó con Grep/Read/git; el grafo no hizo falta (diff
acotado a 6 archivos de producción).

## Verificación ejecutable (corrida por el reviewer)
- `./init.sh` (rápido): **`== init OK ==`, exit 0**. typecheck y lint pasan. `test:rapido`: tres rojos,
  todos heredados y listados en `tests/baseline-rojos.json` (`navegacion/pantallas-exigen-permiso`,
  `recetas/module-contract`, `recetas/scope`). El diff no toca la baseline.
- A mano, con `CI=1` (no escribe snapshots): `buscadores-paridad`, `guard-buscadores`,
  `async-autocomplete-ampliado`, `async-autocomplete` y `order-customer-picker`. **5 archivos, 138
  tests en verde.** El árbol queda limpio después: ningún `.snap` se reescribió.
- `guard-buscadores --reporter=verbose` en la rama: los casos de diff R4, R21 y R22 **corren** (no
  se saltan) y pasan.

## Checklist

### Encargo del leader
- [x] **Paridad sin regenerar.** `git log --follow` del `.snap` y del test: un solo commit,
  `2e8d5d18`, que solo contiene esos dos archivos. `git diff origin/dev 2e8d5d18 -- app components
  hooks lib` está vacío, así que se congeló contra la producción sin tocar. Pasa hoy con `CI=1`.
- [x] **Capturas (R3).** Hay 54 «antes» y 54 «después», con los mismos nombres. Repetí la
  comparación píxel a píxel con `sharp`:
  - 40 parejas son idénticas byte a byte;
  - 13 difieren como mucho en 1 nivel RGB, en entre 4 y 39 píxeles: es suavizado, no cambio visible;
  - solo `02-recipe-picker-abierto-movil` difiere de verdad. Lo miré: es el indicador de Next en
    desarrollo («Rendering…» frente a «N»). El campo y el desplegable son iguales.

  **No difieren.** Confirmo la lectura del leader.
- [x] **Desviaciones frente a design §4:**
  - `isOptionDisabled`: la tabla de §4 ya lo lista para `PackagingSelect` y `PresentationSelect`.
    Cambia solo el mecanismo: el `return` del manejador pasa a `handleSelect`, con la misma condición
    (`== null`) y sin cerrar. Lo cubren R13 y la paridad. Sin hallazgo.
  - `scrollThreshold={48}` explícito: es el mismo valor que el defecto, y R16 lo permite.
    `ProductPicker`, que tenía el 48 literal, usa el defecto. Sin hallazgo.
  - La limpieza de comentarios va en el mismo commit que el código: es `menor` (ver hallazgos).
- [x] **`guard-buscadores`.** `EXCEPCIONES` son exactamente las tres de design §7, con sus reglas y
  motivos, y un test fija la lista. No hay patrones.
- [x] **Sin citas en comentarios nuevos de producción.** En las líneas `+` de `app/`, `components/` y
  `hooks/` no hay `QC-<n>`, `R<n>`, `D<n>`, `design.md` ni «decisión cerrada». Los `(R45)` que
  quedan son líneas preexistentes que el diff no toca.
- [x] **Enmienda QC-35 §9.1 (R23, P3 = sí).** Es una línea fechada «Enmienda 2026-10-08 (QC-233)»,
  justo bajo el párrafo, y no se borra nada.
- [x] **Ningún test ni guardia existentes editados.** En `tests/` el diff solo trae los 4 archivos
  nuevos. No toca `baseline-rojos.json`, `e2e/` ni `package.json`.
- [x] **QC-223.** `git diff --name-only origin/dev...origin/feature/QC-223-entregar-producto-terminado`
  devuelve 92 archivos. **La intersección con este diff está vacía.** El diff tampoco toca
  `order-customer-picker.tsx`, ningún barrel ni `app/(public)/**`.

### Trazabilidad (R → test)
- [x] **R1, R2, R8:** `buscadores-paridad.test.tsx`, 64 casos y 128 snapshots. Congelan el árbol y
  las llamadas a la Server Action por estado.
- [x] **R3:** la revisión de las capturas, arriba.
- [x] **R4:** el caso de diff de `guard-buscadores` (41 rutas congeladas, cuya existencia también se
  comprueba, más los snapshots de paridad ajenos); lo verifiqué con git.
- [x] **R5:** la comparación de exports de los cinco archivos frente a `origin/dev`, que sale
  idéntica; ningún tipo `*Props` cambia. Además, el typecheck sin tocar consumidores ni barrels.
- [x] **R6, R7, R20:** `guard-buscadores`, con `primitivo-fuera`, `hook-fuera` y muestras que muerden
  (por alias, ruta relativa, reexportación, `import()`, espacio de nombres y renombrado).
- [x] **R8–R17:** `async-autocomplete-ampliado.test.tsx`, con 24 casos reales. Al menos uno por R, y
  revisé que aseveran lo que dicen: R10 en los dos sentidos, R13 con `aria-disabled` y sin cerrar,
  y R14 con el orden de eventos. R16 queda cubierto también por `async-autocomplete.test.tsx`, que
  no se editó.
- [x] **R18:** `guard-identificador-de-request`, `inventario/module-contract` y
  `recipe-route-contract`, sin editar y en verde. En el código, cada `pedirPagina` y su
  `throw new Error` siguen en su archivo.
- [x] **R19:** `recipe-route-contract` y el caso `.filter(` de la guardia. El compositor usa `flatMap`.
- [x] **R21, R22:** los casos de diff de la guardia, que corren en esta rama, y la comprobación
  manual de arriba.
- [x] **R23:** revisión de QC-35 §9.1.

### CHECKPOINTS.md
- [x] Los tres archivos de spec existen; `design.md` tiene 5 alternativas descartadas.
- [x] Todas las tasks están `[x]`, de TA a T6.
- [x] **`## Lo que ya existe`** abre el design y no está vacía. El diff no re-crea nada de esa lista:
  `AsyncAutocomplete` se amplía y el hook y los primitivos no se tocan. No aparece ningún compositor
  nuevo (A2 descartada).
- [x] Equipo: hay assignee en el board y la rama sale de `wt.sh` (commit de toma `b8e4a048`).
- [x] El mapa R → test está en el impl.
- [x] typecheck y lint en verde.
- [ ] `gate-completo` en CI: pendiente del PR. No me toca.
- [x] Flujo crítico: no aplica, porque es una refactorización de UI sin cambio de comportamiento.
  Los 16 E2E con testids de buscadores corren en CI sin editarse.
- [x] Dependencias: ninguna nueva.
- [x] Seguridad y configuración: no hay secretos, hardcode de entorno ni webhooks.
- [x] `./init.sh` en verde en el worktree.
- [ ] `Cierre` de `progress/features/QC-233.md` y desmontaje del worktree: los hace el leader después
  del merge.

### docs/checkpoints-proyecto.md
- [x] typecheck y lint.
- [x] **Multiplataforma.** No hay estilos nuevos: las clases pasan tal cual por `slots`, y la paridad
  de clases y las capturas en móvil lo confirman. Siguen `touchTarget` y `text-base md:text-base`.
  No aparecen `100vh` ni `:hover`.
- [x] Datos, permisos, módulos hexagonales y migraciones: no aplican, porque el diff no toca
  `lib/`, `db/` ni las Server Actions.

### Reglas del perfil (reviewer, puntos 5–9)
- [x] **5.** No hay secretos y las capas están separadas: la consulta sigue en cada buscador y el
  compuesto de UI no conoce dominio (A4 descartada).
- [x] **6.** Multiplataforma: ver arriba.
- [x] **7.** `package.json` no se toca.
- [x] **8.** El diff no toca esquema ni consultas.
- [x] **9.** No hay citas prohibidas en líneas nuevas. Hay limpieza mezclada con código, que es
  `menor` (abajo).

## Hallazgos

1. `menor`: **limpieza de comentarios en el mismo commit que el código** (perfil, reviewer 9).
   - `398be052` (ProductPicker) quita unas 50 líneas de cabecera, y `ae6826ca` (RecipePicker) unas 35.
   - `tasks.md` pedía un `chore(QC-233): limpia comentarios de <archivo>` aparte «si abulta».
   - El implementer lo declaró. El texto nuevo es correcto y no cita claves.
2. `menor`: **`requirements.md` sigue diciendo «borrador … pendiente de aprobación humana»** y
   muestra P1–P5 como abiertas. Las respuestas solo están en `progress/features/QC-233.md`.
   - Convendría poner al día la línea de estado y remitir a esas respuestas.
3. `menor`: **dos bitácoras desfasadas.**
   - La fila R3 del mapa de `progress/impl_…md` dice «"después" pendiente del leader (T6)», y la
     sección `Pendiente` sigue listando T6, que ya está hecha.
   - Las carpetas de capturas se llaman `capturas-buscadores-{antes,despues}`, no
     `capturas-{antes,despues}-buscadores` como en `tasks.md` y `design.md`. El cambio lo fijó el
     leader y está anotado en `progress/features`.
4. `menor`: **`NO_SE_TOCAN_R21` de `guard-buscadores` protege los seis archivos que heredó de
   QC-231, no los 92 reales de QC-223.**
   - No tiene efecto hoy: verifiqué a mano que la intersección está vacía.
   - Los casos de diff se saltan fuera de la rama, por diseño.
5. Observación, no es hallazgo: **un caso límite teórico en `PackagingSelect`.**
   - Si el hook tuviera error y `failure` fuera `null`, antes se pintaba la lista y ahora no se pinta
     nada.
   - No es alcanzable: `fetchPage` siempre fija `failure` antes de lanzar. La paridad cubre los
     estados de error reales.

Ningún hallazgo BLOQUEANTE.

## Veredicto

**OK**
