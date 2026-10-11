# Review QC-251 — catálogo de componentes (vuelta 1)

Revisado: `origin/dev...HEAD` (`7f6a8c25`), rama `feature/QC-251-catalogo-de-componentes`, 2026-10-10.
Grafo: no se usó. El diff no toca código de producción ejecutable (un `.md` en `components/shared`,
una guardia, docs y la copia de diseño), así que no hay funciones de las que medir impacto. Se usó
Grep/Read y se ejecutó código.

## Verificación ejecutada (salida real)

- `./init.sh` (rápido): **verde**, `EXIT 0`. Typecheck pasa; lint con `0 errors, 7 warnings`, todos
  en tests que el diff no toca; `test:rapido` con `Test Files 109 passed (109)`,
  `Tests 1526 passed | 35 skipped (1561)` (todas las guardias, más `vitest related` sobre la guardia
  y sobre `recipe-route-contract`). Avisos: sin `.env` y sin `DATABASE_URL`, los dos ajenos a la
  ficha.
- `guard-catalogo-de-componentes`: 54/54 verde dentro del gate.
- **Sondas de sensibilidad.** Las corrí desde el scratchpad, sin tocar el repo. Importan las
  funciones exportadas de la guardia y las alimentan con el catálogo real y el árbol real mutados.
  | Mutación | Resultado |
  |---|---|
  | Quito la fila de `EmptyState` | rojo: `sin-fila`, `archivo-sin-fila` y `base-desconocida` (en `DataTable`, que la cita) |
  | Quito la fila de `components/ui/badge.tsx` | rojo: `archivo-sin-fila` |
  | Quito la fila de `hooks/use-mobile.ts` | rojo: `archivo-sin-fila` y `base-desconocida` |
  | Una fila apunta a `components/shared/spinnerx.tsx`, que no existe | rojo: `fila-huerfana` (y además `sin-fila`/`archivo-sin-fila` de `Spinner`, más `diseno-requerido`) |
  | `.tsx` nuevo en `components/shared` con fila y `previo al rediseño` | rojo: `diseno-requerido` |
  | Lo mismo con un tablero inexistente | rojo: `diseno-inexistente` |
  | Lo mismo con `docs/diseno/canvas/Botones.dc.html` | verde |
  | Primitivo nuevo (`components/ui/zz.tsx`) o apoyo nuevo (`lib/shared/ui/zz.tsx`) sin fila | rojo: `archivo-sin-fila` |
  | Componente nuevo **dentro de un archivo previo** (`SpinnerGrande` en `spinner.tsx`) sin fila | rojo: `sin-fila` |
  | El mismo componente añadido a la fila previa de `Spinner` | **verde, sin pedir Diseño** (ver m2) |
  | `components/shared/nueva/pieza.tsx` en una subcarpeta **sin `index.ts`** | **verde, sin pedir fila** (ver m1) |
- **Copia de diseño:** `diff -rq _trabajo/rediseno/canvas docs/diseno/canvas` sin diferencias
  (89 = 89 archivos). `cmp` de la guía de marca igual. `sistema.css` y `canvas/qc.css`, idénticos.
  El blob de `Tabla.dc.html` en git es igual al origen quitando los `\r`.
- `node scripts/archivos-en-vuelo.mjs`: QC-237 (en vuelo, Christian) también toca
  `tests/unit/recetas-ui/recipe-route-contract.test.ts`, pero en otro hunk (línea ~1419 frente a
  ~1295). El merge textual no choca.

## Checklist

### Trazabilidad (punto 1)
- [x] R1–R4, R11: muestras `cabecera`/`celda`/`orden`/`cita` (roja y verde) y el caso real de formato.
- [x] R5: muestras (a), (b), (c) y `fila-duplicada`, más el caso real.
- [x] R6, R7: muestras `archivo-sin-fila` y `fila-duplicada`, más el caso real.
- [x] R8: muestras «archivo inexistente» y «pieza no exportada (tipo)», más el caso real.
- [x] R9, R10: muestra roja; la simétrica verde es la muestra base. Más el caso real.
- [x] R12: el informe contiene regla, archivo, pieza o fila y acción.
- [x] R13: el árbol sintético está rojo sin las filas y verde añadiendo solo las filas.
- [x] R14: muestra base verde; el recorrido ve el repo (más de 30 públicos).
- [x] R15: casos reales sin exclusiones.
- [x] R16–R21, R23–R27, R32: casos de docs con marcas estables. Leí los textos: dicen lo que piden los R.
- [x] R22: caso real sobre `arnes.config.json`.
- [x] R28–R31: muestras roja y verde de cada regla, más los casos reales.
- [x] R33–R35: casos reales (README, igualdad byte a byte, `rediseno.md`) y la muestra `sistema-desincronizado`.
- [x] R36: el gate entero en verde con `docs/diseno/` en el árbol, sin excepciones nuevas. Lo comprobé con `./init.sh`.
- [x] `progress/impl_` tiene el mapa `R<n> -> test` (R1–R36).

### Tasks (punto 2)
- [x] T0a–T12 marcadas `[x]`.

### CHECKPOINTS.md
- [x] requirements EARS, design con alternativas descartadas (A–I) y tasks completas.
- [x] `design.md` abre con `## Lo que ya existe` (no vacía). El diff no re-crea `guard-piezas-base` ni `guard-catalogo-de-errores`: reutiliza su patrón.
- [x] Rama publicada (`ls-remote` la ve). Commit «feature tomada por ArqDev».
- [ ] Assignee en Jira: **no verificable desde aquí**. El `feature_list.json` local de la raíz dice `pending` y `assignee: null`, y `progress/features/QC-251.md` dice `in_progress`, de Carlos Restrepo. Es una copia local desactualizada; el leader debe reimportar (F0) y confirmarlo. No es un hallazgo del diff.
- [x] Typecheck y lint sin errores.
- [ ] `gate-completo` en CI: pendiente de PR (no es de esta vuelta).
- [x] Sin flujos críticos, dependencias, secretos, webhooks ni configuración por entorno.
- [x] `./init.sh` rápido verde en el worktree.

### docs/checkpoints-proyecto.md
- [x] Calidad de código: typecheck y lint. No toca UI de la app, así que no aplica la multiplataforma.
- [x] Casilla nueva «catálogo al día»: el catálogo cubre todas las piezas (guardia verde).
- [x] Casilla nueva «pase /design»: no aplica, porque la ficha no crea componentes ni cambia lo visual.
- [x] Datos/Supabase, módulos hexagonales y permisos: no aplican (no toca `db/`, `lib/`, `app/`).

### Reglas del proyecto (`perfil-agentes.md > reviewer`, 5–11)
- [x] 5 a 8: no aplican.
- [ ] 9 y `docs/conventions.md > Comentarios`: **falla**, ver B1.
- [x] 10 y 11: el diff no crea componentes.

### Regla dura y pase /design, escritos sin ambigüedad
- [x] Las dos subsecciones cuelgan de `## Todos los agentes` y llevan «obligatoria/o», «SIEMPRE», la fecha y el origen. Los pasos 1–4 están en orden.
- [x] spec_author (R17, R25), frontend_dev 12–13 (R18, R26), reviewer 10–11 (R19, R27) y `architecture.md` (R20, R24) están escritos y no contradicen la regla.
- [ ] **Hay una ambigüedad de origen en el spec**, ver m3.

## Hallazgos

### BLOQUEANTE

- **B1 — Citas de requisito en comentarios de la guardia.**
  `tests/guards/guard-catalogo-de-componentes.test.ts` tiene cuatro comentarios que citan
  requisitos:
  - línea 201: `// El parser del catálogo (R1–R4, R11, R28)`;
  - línea 413: `// El analizador de código (R5–R10)`;
  - línea 775: `/** La columna \`Diseño\` contra el árbol y la lista de piezas previas (R29–R31). */`;
  - línea 824: `/** \`sistema.css\` y \`canvas/qc.css\` son el mismo archivo (R34). */`.

  `docs/conventions.md > Comentarios` dice: «**Tests**: la misma regla para los comentarios, pero
  `R<n>` **sí** va en el nombre del caso». También dice: «Quién lo verifica: el `reviewer`, como
  bloqueante». El propio `design.md > 8` de esta ficha lo pide igual: «`R<n>` solo en los nombres
  de los casos». El punto 9 de `perfil-agentes.md > reviewer` habla de producción, pero manda el doc
  del perfil (`perfil-agentes.md`, preámbulo).
  **Arreglo:** quitar los `(R…)` de esos cuatro comentarios. Los nombres de los `it` ya llevan la
  trazabilidad.

### menor

- **m1 — La guardia no ve una subcarpeta de `components/shared` sin `index.ts`.** Si alguien crea
  `components/shared/nueva/pieza.tsx` sin barrel, la guardia queda verde: no pide fila ni `Diseño`
  (sonda arriba). Cumple el spec, porque el glosario solo define (a) `.tsx` sueltos, (b) módulos
  con barrel y (c) imports profundos en módulos con barrel. El implementer lo anotó («hoy no hay
  ninguna»). Pero es un agujero real en «toda pieza nueva tiene fila», y justo por ahí se colaría
  una pieza de QC-256. **Recomendado:** una regla `carpeta-sin-barrel` (una subcarpeta de
  `components/shared` con `.tsx` y sin `index.ts` da rojo), o que el leader abra una ficha para
  ello. Cambia el spec, así que lo decide el leader.
- **m2 — Un componente nuevo dentro de un archivo previo no pide `Diseño`.** Añadirlo a la `Pieza`
  de una fila previa basta para el verde. La guardia exige la fila (R5), pero no el tablero. Es la
  misma limitación que `design.md > 9` reconoce para los cambios visuales. El reviewer la cubre
  (punto 11: «un componente nuevo… sin referencia de diseño… BLOQUEANTE»). Convendría que
  `design.md > 9` o la cabecera del catálogo la nombren también para que nadie la tome por
  cubierta.
- **m3 — La regla 13 de `frontend_dev` (= R26) choca a la letra con el paso 4 de la regla de
  decisión.** El paso 4 dice «Crea la pieza en la carpeta `components/` de la ruta». La regla 13
  dice «No crees un componente que no tenga fila en el catálogo». Pero el catálogo no cubre las
  carpetas de ruta: una fila para `app/.../components/x.tsx` sale `fila-huerfana`. Leído al pie de
  la letra, un `frontend_dev` no puede ejecutar nunca el paso 4. Además, «componente nuevo» no está
  acotado: no queda claro si un subcomponente interno de un archivo exige pase `/design`.
  La redacción es fiel a R26 y a `design.md > 5.1`, así que no es culpa del implementer. Es una
  ambigüedad del spec aprobado, justo en la regla que el leader pidió revisar.
  **Recomendado:** que el leader lo lleve al humano y aclare, por ejemplo, «… que no tenga fila en
  el catálogo **si vive en `components/ui`, `components/shared`, `lib/shared/ui` o `hooks`**, ni
  referencia de diseño en el `design.md`…». Y que defina si el pase aplica a los componentes
  internos.
- **m4 — Desviación 1 (Tandas 1–3 en un solo commit, `93ef38c0`).** Aceptable: la bitácora conserva
  el rojo de la Tanda 1 con su salida real, y la Tanda 2 tiene su propia sección. Falta una sección
  «Tanda 3» con su verificación. T10 pedía la salida de `node scripts/archivos-en-vuelo.mjs` pegada
  en el `impl_` y no está. La corrí yo: el script lee `equipo.archivos_compartidos`, sin queja. La
  bitácora del Cierre dice además que el arreglo de `recipe-route-contract` vino tras la primera
  corrida de T12, pero el cambio ya está en `93ef38c0`. Es una incoherencia de bitácora sin efecto.
- **m5 — Desviación 2 (`recipe-route-contract.test.ts` fuera de `Archivos esperados`).** Justificada
  y mínima: dos líneas en `TESTS_QUE_LO_NOMBRAN`, con el mismo criterio que `guard-editor-aislado`.
  Sin ella el contrato da un falso rojo, porque la guardia nombra la ruta de `step-reader`. Pero
  QC-237 (en vuelo, de Christian) toca el mismo archivo en otro hunk. El merge no choca, pero el
  candado no lo ve. **Recomendado:** añadirlo a `tasks.md > ## Archivos esperados` para que
  `archivos-en-vuelo` lo muestre.
- **m6 — Desviación 3 (redacción de `architecture.md`).** Aceptable y necesaria. «Reutilizables
  entre features» pasa a «entre rutas», que alinea la línea con H1/D4. T8 exige que ninguna otra
  frase contradiga «segunda ruta». Grep: no queda ningún «dos features» sobre la subida a `shared`.
- **m7 — Desviación 4 (`Tabla.dc.html`, de CRLF a LF).** Aceptable. La impone `.gitattributes`
  (`* text=auto eol=lf`) y el contenido es el mismo: el blob es igual al origen quitando los `\r`.
  No afecta a R34, porque `qc.css` ya estaba en LF. Tocar `.gitattributes` para una copia sería
  peor. No requiere acción; como mucho, una línea en `docs/diseno/README.md` («copia literal salvo
  fin de línea»).
- **m8 — La cabecera de la guardia tiene 13 líneas.** `conventions.md` pide «corto» y avisa a partir
  de unas 5 líneas. Explica el porqué, pero parte de ese texto ya está en `design.md > 4`.

## Veredicto

**RECHAZADO**, por B1: cuatro comentarios de la guardia citan `R<n>`, contra
`docs/conventions.md > Comentarios` y `design.md > 8`. El arreglo es trivial (quitar los `(R…)`).
Todo lo demás está bien:
- la trazabilidad R1–R36 está completa y con tests que verifican de verdad;
- la guardia es sensible en los tres casos pedidos: falta una fila, una fila apunta a algo
  inexistente, y una pieza nueva no cita su `Diseño` o cita un tablero que no existe;
- `./init.sh` está en verde;
- la copia de diseño es fiel.

m1 y m3 piden decisión del leader o del humano, no del implementer. Vuelta 2: acotada al commit
que arregle B1. m4 y m5, si se quieren, en el mismo commit.
