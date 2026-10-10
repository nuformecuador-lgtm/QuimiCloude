# QC-251 — Catálogo de componentes compartidos — tasks

Implementer: `frontend_dev`. Sin código de producción ejecutable: un `.md` en `components/shared/`,
una guardia, texto en docs del perfil y la copia versionada de la fuente de diseño.
Verificación de cada tanda: `pnpm run typecheck`, `pnpm run lint`, `pnpm exec vitest run guard`.

## Tanda 0 — la fuente de diseño en el repo (sin dependencias; puede ir primero)

- [x] **T0a [P] — Copiar la fuente de diseño** a `docs/diseno/` (`design.md > 5.5`), copia
  literal, sin editar:
  - `_trabajo/marca/guia-de-marca.html` → `docs/diseno/guia-de-marca.html`;
  - `_trabajo/rediseno/canvas/qc.css` → `docs/diseno/sistema.css`;
  - todo `_trabajo/rediseno/canvas/` → `docs/diseno/canvas/` (89 archivos hoy).
  Las rutas `_trabajo/` están en la raíz del checkout principal
  (`R:/job/singularis/projects/QuimiCloude/_trabajo/`), no en el worktree.
  *Hecho:* los conteos coinciden con el origen (pegados en el `impl_`); `sistema.css` y
  `canvas/qc.css` son idénticos (R34). No se copia `support.js` (no existe) ni nada más de `_trabajo/`.
- [x] **T0b [P] — `docs/diseno/README.md`** con las secciones de `design.md > 5.5` (qué hay, el
  canvas privado con su enlace, convención de nombres, que `support.js` no se versiona (H8), flujo
  `/design` en seis pasos según H9: cualquier persona desde Claude Code, tablero en el canvas del
  proyecto o en uno propio compartido con el humano, aprobación, copia en la rama de la ficha).
  *Hecho:* contiene la URL del canvas, «privado», `support.js`, «Claude Code», «rama de la ficha»
  y los seis pasos (R33).
- [x] **T0c — `progress/rediseno.md` apunta a `docs/diseno/`** (R35). Depende de T0a.
  *Hecho:* cita `docs/diseno/canvas/`, `docs/diseno/sistema.css` y `docs/diseno/guia-de-marca.html`;
  el brief sigue en `_trabajo/rediseno/brief/`.

## Tanda 1 — la guardia, primero en rojo

- [x] **T1 — Analizador y parser, con muestras.** Crear
  `tests/guards/guard-catalogo-de-componentes.test.ts` con las funciones puras de
  `design.md > 4.1` y `> 4.4`, y el `describe` de muestras sintéticas (una que viola y otra que
  cumple por regla, incluidas las de `Diseño`; árbol sintético de R13; texto del informe de R12).
  *Hecho:* las muestras pasan; los casos contra el repo real fallan porque no existe el catálogo
  (rojo esperado, anotado en `progress/impl_QC-251-catalogo-de-componentes.md`). R3–R14, R28–R31.
- [x] **T2 — Casos contra el repo real** (`design.md > 4.2`, 1–8, y los de `> 4.4`: `docs/diseno`,
  `progress/rediseno.md`) en el mismo archivo.
  *Hecho:* el caso «el recorrido ve el repo» pasa (R14); los de correspondencia fallan listando
  todas las piezas sin fila (la lista sirve de checklist para T3–T5). Depende de T1.

## Tanda 2 — el catálogo (depende de T2)

Cada fila se escribe **leyendo la pieza**: props opcionales reales, qué pinta y qué no, de qué
piezas del catálogo se compone. Nada de memoria; si algo no se puede verificar, se deja escrito
como tal en la fila y se anota en `progress/impl_QC-251-catalogo-de-componentes.md`. La columna
`Diseño` de todas las filas existentes es `previo al rediseño` (o `sin UI` donde R28 lo permite).

- [x] **T3 [P con T4, T5] — Sección Primitivos.** Una fila por cada `components/ui/*.tsx` (24).
  *Hecho:* los hallazgos de R7 de Primitivos desaparecen.
- [x] **T4 [P con T3, T5] — Sección Compuestos.** Filas para los componentes públicos (a), (b), (c)
  y los archivos de entrada `.ts` (`design.md > 3.2`).
  *Hecho:* desaparecen los hallazgos R5, R6 y R8 de Compuestos.
- [x] **T5 [P con T3, T4] — Sección Apoyos.** Una fila por archivo de `lib/shared/ui/` (9) y
  `hooks/` (3). *Hecho:* desaparecen los hallazgos R7 de Apoyos.
- [x] **T6 — `Base de`, orden, citas y lista cerrada.** Rellenar `Base de` con nombres que sean
  `Pieza` de alguna fila; ordenar cada sección por `Archivo`; comprobar que no hay `QC-<n>` ni
  `R<n>`; volcar los `Archivo` de Compuestos y Primitivos en `PIEZAS_PREVIAS_AL_REDISENO` con la
  fecha de la instantánea. Depende de T3–T5.
  *Hecho:* `pnpm exec vitest run guard-catalogo-de-componentes` verde en los casos de catálogo
  (R1–R11, R15, R28–R31).

## Tanda 3 — docs y configuración (puede empezar en paralelo a la Tanda 2)

- [x] **T7 [P] — Reglas y deberes** en `docs/perfil-agentes.md` (`design.md > 5.1`): las dos
  subsecciones obligatorias bajo `## Todos los agentes`, los dos puntos de `spec_author`, las
  reglas 12 y 13 de `frontend_dev` y los puntos 10 y 11 de `reviewer`.
  *Hecho:* casos R16–R19 y R23–R27 de §4.3 verdes.
- [x] **T8 [P] — `docs/architecture.md`** (`design.md > 5.2`): «segunda ruta» en `Regla: sin
  sobre-ingenieria` y la línea del pase de diseño al principio de `## Componentes`.
  *Hecho:* casos R20 y R24 verdes; ninguna otra frase del doc contradice «segunda ruta».
- [x] **T9 [P] — Casillas en `docs/checkpoints-proyecto.md`** (R21, R32). *Hecho:* casos verdes.
- [x] **T10 [P] — `arnes.config.json > equipo.archivos_compartidos`** (`design.md > 5.4`).
  *Hecho:* caso R22 verde; `node scripts/archivos-en-vuelo.mjs` sigue tratando
  `tests/baseline-rojos.json` y `progress/deudas.md` como compartidos (salida pegada en el
  `impl_`); `node scripts/check-perfil.mjs` y `node scripts/validate-features.mjs` no se quejan
  de la clave nueva.
- [x] **T10b — Guardias con `docs/diseno/` en el árbol** (R36, `design.md > 12`). Depende de T0a.
  *Hecho:* `pnpm exec vitest run guard` y `pnpm run lint` verdes sin excepciones nuevas; si alguna
  guardia se queja, se para y se vuelve al spec (no se añade la excepción por cuenta propia).

## Tanda 4 — cierre (depende de T0c, T6–T10b)

- [ ] **T11 — Sincronizar con `dev`** (`git fetch origin dev && git merge origin/dev`) y añadir la
  fila de cualquier pieza que haya entrado mientras tanto, también a `PIEZAS_PREVIAS_AL_REDISENO`
  si ya estaba en `dev` (R15, `design.md > 9`). *Hecho:* guardia verde tras el merge.
- [ ] **T12 — Gate local** `./init.sh` verde y mapa `R<n> -> test` completo (R1–R36) en
  `progress/impl_QC-251-catalogo-de-componentes.md` (`design.md > 11`).

## Archivos esperados

- `components/shared/CATALOGO.md`
- `tests/guards/guard-catalogo-de-componentes.test.ts`
- `docs/perfil-agentes.md`
- `docs/architecture.md`
- `docs/checkpoints-proyecto.md`
- `arnes.config.json`
- `docs/diseno/README.md`
- `docs/diseno/guia-de-marca.html`
- `docs/diseno/sistema.css`
- `docs/diseno/canvas/qc.css`
- `docs/diseno/canvas/canvas.json`
- `docs/diseno/canvas/` (los 87 `*.dc.html` copiados de `_trabajo/rediseno/canvas/`)
- `progress/rediseno.md`
