# QC-251 — Catálogo de componentes compartidos — tasks

Implementer: `frontend_dev`. Sin código de producción ejecutable: un `.md` en `components/shared/`,
una guardia y texto en docs del perfil. Verificación de cada tanda:
`pnpm run typecheck`, `pnpm run lint`, `pnpm exec vitest run guard`.

## Tanda 1 — la guardia, primero en rojo

- [ ] **T1 — Analizador y parser, con muestras.** Crear
  `tests/guards/guard-catalogo-de-componentes.test.ts` con las funciones puras de
  `design.md > 4.1` y el `describe` de muestras sintéticas (una que viola y otra que cumple por
  regla; árbol sintético de R13; texto del informe de R12).
  *Hecho:* las muestras pasan; los casos contra el repo real fallan porque no existe el catálogo
  (rojo esperado, anotado en `progress/impl_QC-251-catalogo-de-componentes.md`).
  R3–R14.
- [ ] **T2 — Casos contra el repo real** (`design.md > 4.2`, 1–8) en el mismo archivo.
  *Hecho:* el caso «el recorrido ve el repo» pasa (R14); los de correspondencia fallan listando
  todas las piezas sin fila (la lista sirve de checklist para T3–T5). Depende de T1.

## Tanda 2 — el catálogo (depende de T2)

Cada fila se escribe **leyendo la pieza**: props opcionales reales, qué pinta y qué no, de qué
piezas del catálogo se compone. Nada de memoria; si algo no se puede verificar, se deja escrito
como tal en la fila y se anota en `progress/impl_QC-251-catalogo-de-componentes.md`.

- [ ] **T3 [P con T4, T5] — Sección Primitivos.** Una fila por cada `components/ui/*.tsx` (24).
  *Hecho:* los hallazgos de R7 de Primitivos desaparecen.
- [ ] **T4 [P con T3, T5] — Sección Compuestos.** Filas para los componentes públicos (a), (b), (c)
  y los archivos de entrada `.ts` (`design.md > 3.2`).
  *Hecho:* desaparecen los hallazgos R5, R6 y R8 de Compuestos.
- [ ] **T5 [P con T3, T4] — Sección Apoyos.** Una fila por archivo de `lib/shared/ui/` (9) y
  `hooks/` (3). *Hecho:* desaparecen los hallazgos R7 de Apoyos.
- [ ] **T6 — `Base de`, orden y citas.** Rellenar `Base de` con nombres que sean `Pieza` de alguna
  fila; ordenar cada sección por `Archivo`; comprobar que no hay `QC-<n>` ni `R<n>`.
  Depende de T3–T5. *Hecho:* `pnpm exec vitest run guard-catalogo-de-componentes` verde en los
  casos de catálogo (R1–R11, R15).

## Tanda 3 — docs y configuración (puede empezar en paralelo a la Tanda 2)

- [ ] **T7 [P] — Regla de decisión y deberes** en `docs/perfil-agentes.md` (`design.md > 5.1`):
  subsección `### Regla de decisión para componentes`, punto en `spec_author`, regla 12 en
  `frontend_dev`, punto 10 en `reviewer`. *Hecho:* casos R16–R19 de §4.3 verdes.
- [ ] **T8 [P] — Alinear `docs/architecture.md`** (`design.md > 5.2`). *Hecho:* caso R20 verde y
  ninguna otra frase del doc contradice «segunda ruta».
- [ ] **T9 [P] — Casilla en `docs/checkpoints-proyecto.md`** (R21). *Hecho:* caso R21 verde.
- [ ] **T10 [P] — `arnes.config.json > equipo.archivos_compartidos`** (`design.md > 5.4`).
  *Hecho:* caso R22 verde; `node scripts/archivos-en-vuelo.mjs` sigue tratando
  `tests/baseline-rojos.json` y `progress/deudas.md` como compartidos (salida pegada en el
  `impl_`); `node scripts/check-perfil.mjs` y `node scripts/validate-features.mjs` no se quejan
  de la clave nueva.

## Tanda 4 — cierre (depende de T6–T10)

- [ ] **T11 — Sincronizar con `dev`** (`git fetch origin dev && git merge origin/dev`) y añadir la
  fila de cualquier pieza que haya entrado mientras tanto (R15, `design.md > 9`).
  *Hecho:* guardia verde tras el merge.
- [ ] **T12 — Gate local** `./init.sh` verde y mapa `R<n> -> test` completo en
  `progress/impl_QC-251-catalogo-de-componentes.md` (`design.md > 11`).

## Archivos esperados

- `components/shared/CATALOGO.md`
- `tests/guards/guard-catalogo-de-componentes.test.ts`
- `docs/perfil-agentes.md`
- `docs/architecture.md`
- `docs/checkpoints-proyecto.md`
- `arnes.config.json`
