# QC-109 — procesamiento-de-pdf-por-estrategia · review (F2.2)

> Rama `feature/QC-109-procesamiento-de-pdf-por-estrategia`, tip `4228e9d`, árbol limpio.
> Diff revisado: `git diff origin/dev...HEAD` (19 archivos, +2505/-8).
> El revisor no edita código. Todo lo que aquí se afirma se corrió en este worktree.

## Veredicto

**OK (aprobado).** 0 bloqueantes · 6 menores.

Condición de cierre, no de aprobación: **T11 (`./init.sh` completo) sigue `[ ]`** y lo corre el
leader en F2.3. Hoy el gate del repo está rojo por **deuda ajena** (ver sección 3).

## 1. Checklist

### Especificación
- [x] `requirements.md` con R1–R17 en EARS numerados, cada uno citando su decisión `[D<n>]`.
- [x] `design.md` con **dos** alternativas descartadas y su porqué (seccion 7: los `.md` leídos de
      disco; seccion 8: la estrategia como objeto con comportamiento).
- [~] `tasks.md`: **T0–T10 en `[x]`, T11 en `[ ]`**. T11 es el gate completo, que por
      `AGENTS.md > Regla del gate: quien corre qué` no es del implementer. Ver menor 1.

### Trazabilidad
- [x] Los 17 requisitos mapean a un caso concreto que existe, afirma el enunciado y muerde.
      Auditoría caso por caso en la sección 2.
- [x] `progress/impl_QC-109-...md` trae el mapa `R<n> -> test` completo, 17/17, con el nombre exacto
      de cada caso. Comprobado uno a uno contra los archivos de test: todos existen.

### Calidad de código
- [x] `pnpm typecheck` — sin errores.
- [x] `pnpm lint` — sin hallazgos.
- [x] `pnpm vitest run` sobre los 4 archivos de test del diff: **57 pasan, 0 fallos, 0 saltados**.
- [x] `pnpm vitest run tests/guards` — **39 archivos, 492 pasan, 5 saltados, 0 fallos**.
- [x] E2E: **no aplica**, diferido con motivo escrito (`[D14]`, R17). No hay pantalla ni recorrido y
      nadie invoca la capacidad; lo aporta QC-107. No es hallazgo.
- [x] UI: no aplica. El diff no toca `app/`, `components/` ni `hooks/`. La regla multiplataforma no
      tiene superficie que revisar aquí.
- [x] Dependencias: `package.json`, `pnpm-lock.yaml`, `tsconfig.json` y `next.config` **no están en
      el diff**. `docs/dependencias.md` no necesita fila nueva.

### Datos y seguridad
- [x] `db/schema.prisma` no se toca: ningún modelo nuevo, así que la guardia de empresa en el
      esquema no tiene nada que exigir. Tampoco hay consultas de datos de operación: el caso de uso
      no habla con Prisma. Aislamiento por empresa: sin superficie.
- [x] Sin migraciones, sin RLS, sin webhooks, sin secretos. Ningún literal de clave, URL ni variable
      de entorno en los archivos nuevos. Construir la fachada no lee entorno ni toca la red, y eso lo
      comprueba `tests/unit/composition/documentos-facade.test.ts`, verde.
- [x] Sin permisos que validar, y es deliberado (`[D7]`, R12): la firma no admite actor, y el
      `@ts-expect-error` del caso R12 hace que admitirlo algún día ponga rojo el typecheck.

### Módulos hexagonales
- [x] Los `domain/` y `ports/` nuevos no importan framework, BD, `shared` ni adaptadores. El caso de
      uso depende de una función inyectada, no del puerto de IA, y está razonado en `design.md` 3.3
      punto 3: reconstruirlo duplicaría plazo y topes.
- [x] De otro módulo solo se importa su contrato: `@/lib/modules/errores` (tipo `ErrorCode`), nunca
      ruta profunda. Mismo precedente que `read-pdf-with-ai.ts:18`. Ver menor 2.
- [x] Ningún `driving` instancia su `driven`; el cableado vive en `lib/composition/index.ts`.
- [x] El barril publica la fábrica y no el puerto, ni los `.json`, ni el adaptador. El contrato sigue
      importable desde cliente: el cierre de imports de `module-contract.test.ts` está verde.
- [x] Nada reaparece en `lib/services|repositories|interfaces`. Ningún archivo fuera del módulo salvo
      `lib/composition/index.ts`.

### Comentarios (`docs/conventions.md > Comentarios`)
- [x] **Ninguna línea de producción añadida cita `QC-<n>`, `R<n>`, `design.md` ni «decisión
      cerrada».** Verificado sobre las líneas añadidas de `lib/` en el diff: cero coincidencias.
- [x] El `loDefine` de los `.json` no es hallazgo: es un campo de datos, no un comentario, y así lo
      cierran `[D15]` y `design.md` 3.2.
- [x] Prosa desmentida: no queda ninguna en código ni en `specs/`. Detalle en la sección 4.
- [~] Cabeceras de archivo de más de ~5 líneas. Ver menor 6.

### Verificación final
- [~] `./init.sh` completo: rojo por deuda ajena, detalle en la sección 3. T11 queda para el leader.
- [x] Este archivo existe y su veredicto es OK.
- [ ] `progress/history.md` y el desmontaje del worktree: son de F2.3 en adelante, no de esta
      revisión.

## 2. Trazabilidad, caso por caso

`P` = `tests/unit/documentos/process-pdf-by-strategy.test.ts` ·
`A` = `tests/unit/documentos/qc109-alcance.test.ts`

| R | Caso | ¿Afirma el enunciado entero? | ¿Muerde? |
|---|---|---|---|
| R1 | P `R1 — una estrategia desconocida se rechaza…` | Sí: `ok:false`, código `invalid_input`, modo nulo, `readPdfWithAi` NO llamado y `countPages` tampoco. Que los valores aceptados sean exactamente dos lo cierra A/R15 con `pdfStrategySchema.options`. | Sí |
| R2 | P `R2 — catalogo pide la lectura en modo images` | Sí: se inspecciona el modo de la entrada que cruza al doble, no solo el retorno. | Sí, probado con mutación |
| R3 | P `R3 — formula pide la lectura en modo pdf` | Sí, idem. | Sí, probado con mutación |
| R4 | A `R4: el prompt … sin tocar disco ni red` | Sí: que el import resuelva es la mitad del requisito, y el detector barre los 7 archivos buscando `fs`, `path` y `process.cwd`. | Sí, el detector tiene su caso de «muerde» con entrada infractora |
| R5 | P `R5 — la entrada que construye cada estrategia…` | Sí, y de más: valida el prompt y la entrada entera contra `aiReadInputSchema`, para las dos estrategias, sin que el llamante aporte texto. | Sí |
| R6 | A `R6: los dos .json traen provisional true…` | Sí: `provisional`, `loDefine` y prompt no vacío, archivo por archivo. | Sí |
| R7 | P `R7 — devuelve el texto de la IA byte a byte…` | Sí: el texto de prueba lleva espacios al borde, saltos de línea de Windows, tabulador y caracteres no ASCII, así que cualquier normalización se ve. | Sí, probado con mutación |
| R8 | P `R8 — registra exactamente una vez…` más el caso de la enmienda | Sí: éxito y fallo, una sola invocación en ambos, claves del resumen congeladas a cinco y comparación del resumen completo. El segundo caso no es un trozo del enunciado: es el supuesto que añade la enmienda. | Sí, probado con mutación |
| R9 | P `R9 — el resumen registrado no contiene el texto…` | Sí: recorre todos los valores primitivos del resumen, no los campos conocidos, y compara `textLength` con la longitud real. Reforzado por el caso del adaptador. El compilador lo blinda además: el puerto no tiene campo donde quepa el texto. | Sí |
| R10 | P `R10 — un fallo de la lectura vuelve con su mismo code y reason…` | Sí: dos códigos distintos, `code` y `reason` sin traducir, `ok:false` y ausencia del campo `text`. Si lanzara, el caso reventaría. | Sí |
| R11 | A `R11: ningún archivo nuevo escribe a mano un literal de límite…` | Sí: los cinco literales más el import de `limits`. | Sí, cada literal tiene su caso de «muerde» |
| R12 | P `R12 — la firma no admite actor…` | Sí: el `@ts-expect-error` es la afirmación real, la hace cumplir `tsc`, y además el caso corre a fondo sin actor. | Sí: si la firma admitiera actor, el typecheck daría rojo por directiva sobrante |
| R13 | A, dos casos | Sí: el barril reexporta la fábrica y el esquema y no el puerto, los prompts ni el adaptador —medido sobre reexportaciones, no sobre el texto—, y nadie de `app/` ni de `adapters/driving` la invoca. No hay crons en el repo, así que esa parte del enunciado no tiene superficie. | Sí |
| R14 | A `R14: ningún archivo de domain/ ni de ports/ …` | Sí, sobre todos los `domain/` y `ports/` del módulo, con ancla que exige que el caso de uso de esta ficha esté entre los medidos. | Sí |
| R15 | A `R15: los símbolos y campos … son los nombres ingleses esperados` | Sí: igualdad exacta de los 11 exports, campos esperados, detector de castellano y la excepción de `[D1]` acotada a los dos valores del enum. | Sí |
| R16 | A, dos casos | Sí en las dos mitades: imports de los archivos nuevos, y archivos de build en el diff. | Sí |
| R17 | A `R17: el diff de la rama no trae ningún archivo bajo e2e/` | Sí, con ancla anti-vacuidad —la carpeta del spec tiene que aparecer en el rango— y falla, no salta, si estando en la rama no puede calcular la merge-base. | Sí |

**Búsqueda específica de «demostrado por partes» (el patrón que casi cuela con R6 en QC-68): no
aparece.** Los seis requisitos de comportamiento —R1, R5, R7, R8, R9, R10— tienen cada uno un solo
caso que ejercita el enunciado completo, no varios cubriendo trozos. Los tres sitios de riesgo real:

- **R8** podría haberse repartido entre «se registra en éxito», «se registra en fallo» y «lleva los
  cinco campos». No lo está: el caso hace las tres cosas de corrido, con comparación del resumen
  entero en las dos ramas.
- **R1** podría haberse repartido entre «rechaza» y «no llama». Mismo caso.
- **R16** sí va en dos casos, pero porque el requisito tiene dos cláusulas independientes —imports de
  los archivos y archivos del build— y cada caso agota la suya. No hay hueco entre ellas.

**Verificación activa de mordida.** No me fié de que los casos pasen: muté el código en tres sitios y
comprobé el rojo, revirtiendo cada vez y dejando el árbol limpio:

1. invertir el mapa estrategia a modo (`catalogo` a `pdf`, `formula` a `images`): **3 rojos**;
2. recortar con `trim()` el texto devuelto en la rama de éxito: **3 rojos**;
3. suprimir el registro en la rama de estrategia inválida: **2 rojos**.

## 3. El gate, y por qué su rojo no es de esta rama

`./init.sh --rapido` corrido por mí en el worktree: node, dependencias, cliente de Prisma y tipos de
ruta de Next en verde, y después

```
✗ feature_list.json invalido: faltan specs para features sdd en vuelo: QC-82
```

`node scripts/validate-features.mjs` da ese único error. QC-82 está en `spec_ready` con `sdd: true` y
sin carpeta en `specs/`, y **esta rama no toca su entrada**: el diff de `feature_list.json` solo mueve
QC-61 a `done`, QC-109 a `in_progress` con `complexity: medium`, y añade QC-129 en `pending`. Es deuda
que entra por la importación del board, y el validador se para antes de typecheck, así que el gate no
llega a mirar nada de QC-109.

Lo que el gate no llegó a correr lo corrí yo y está en el checklist: typecheck limpio, lint limpio,
los cuatro archivos de test del diff verdes (57 de 57) y **las 39 guardias verdes (492 casos)**. No lo
cuento como hallazgo de esta ficha, y T11 no se puede cerrar hasta que board y disco concuerden en
QC-82: eso es del leader.

## 4. Las decisiones D1 a D16 contra el código

| D | Comprobado en | Veredicto |
|---|---|---|
| D1 | `domain/pdf-strategy.ts:14,26-29` | Enum cerrado de dos valores y `Record` en vez de `switch`: un tercer valor sin modo no compila. Cumple. |
| D2 | A, caso de R13 | Nadie la dispara. Cumple. |
| D3 | los dos `.json` y P/R5 | Los textos son frases reales que pasan `trim().min(1)`. Cumple. |
| D4 | `catalogo.json:2-3`, `formula.json:2-3` | `provisional` y `loDefine` presentes. Cumple. |
| D5 | `process-pdf-by-strategy.ts:128-137` | Devuelve el texto y además registra. Cumple. |
| D6 | `domain/prompts/index.ts:10-11` | Import de módulo; ni `fs`, ni `path`, ni `process.cwd` en ninguno de los 7 archivos. Cumple. |
| D7 | `ProcessPdfByStrategyInput` | Sin actor, blindado por el typecheck. Cumple. |
| D8 | `domain/` y `ports/` nuevos | No nombran proveedor ni adaptador; el cableado es de `lib/composition`. Cumple. |
| D9 | `process-pdf-by-strategy.ts` | No importa `limits.ts` ni escribe 50, 150, 60, 1000 ni 1024. Cumple. |
| D10 | P, caso de R7 | Texto tal cual, byte a byte. Cumple. |
| D11 | A, caso de R15 | Los 11 exports en inglés; solo los dos valores del enum no lo están. Cumple. |
| D12 | `git diff --stat` | **`package.json` no está en el diff.** Cero dependencias nuevas: los archivos nuevos importan `zod`, código del módulo y el tipo `ErrorCode`. Cumple (ver menor 2 por la letra de R16). |
| D13 | `pdfStrategySchema` | Unión de literales zod, como el modo de QC-108. Nada de enum de Prisma. Cumple. |
| D14 | A, caso de R17 | Sin `e2e/`. Cumple. |
| D15 | los `.json` y `tsconfig.json:12` | `resolveJsonModule` ya activo; sin loader y sin tocar el build. La marca de provisional es dato, no comentario. Cumple. |
| D16 | `ports/strategy-run-log.ts:15-26` y el adaptador | **El resumen lleva estrategia, modo, ruta, páginas y longitud, y NO tiene campo donde quepa el texto.** La línea del adaptador escribe la longitud, nunca el texto, y usa huecos legibles en vez de volcar nulos. Cumple, y lo sostiene el compilador además del test. |

### Los dos sitios de lupa que pedía el encargo

**Las listas congeladas.** Las dos se extendieron manteniendo la igualdad exacta, sin relajar nada:

- `tests/unit/documentos/module-contract.test.ts`: la lista de ejecución gana 2 nombres y la de tipos
  gana 4. La comparación sigue siendo `findFrozenListFindings`, que reporta tanto lo no previsto como
  lo que falta —`:487-495` lo prueba en los dos sentidos— y el caso de «la regla muerde» sigue
  intacto. Además `:478` exige que el lector del fuente vea exactamente tantos tipos como espera la
  lista, así que una lista inflada tampoco pasaría.
- `tests/unit/composition/documentos-facade.test.ts`: sigue comparando las claves ordenadas de la
  fachada con igualdad exacta sobre las 6, y sigue exigiendo que todas sean funciones. No se cambió a
  `arrayContaining` ni se saltó ningún caso.

Ningún caso quedó marcado `skip`, `only` ni `todo` en los archivos del diff.

**Prosa desmentida.** Busqué las formas en que suele aparecer y no queda ninguna en código ni en
`specs/`:

- `design.md` 3.3: el bloque de código de `StrategyRunResult` ya muestra el modo anulable en la rama
  de fallo, con el porqué al lado; el flujo dice que el rechazo se registra; el punto 2 declara esa
  anulabilidad como la única diferencia con `AiReadResult`.
- `design.md` 3.4: la enmienda está fechada, las «dos consecuencias» pasaron a tres, y la firma del
  puerto coincide con el disco campo por campo.
- `design.md` 6: las filas de R1 y R8 mencionan la enmienda.
- `tasks.md` T3: nota fechada con el motivo, y el texto viejo queda derogado sin borrar el rastro.
- `process-pdf-by-strategy.ts`: la cabecera dice que toda llamada registra un resumen, incluida la que
  rechaza la estrategia — cierto; el comentario de la rama inválida explica el porqué del modo vacío —
  cierto; el del `catch` explica que sostiene el contrato — cierto.
- `ports/strategy-run-log.ts`: «la firma no admite el texto, registrarlo por descuido no compila» —
  cierto, comprobado leyendo el tipo.
- `tests/unit/composition/documentos-facade.test.ts`: cabecera y nombre del caso reescritos, y siguen
  siendo exactos: «las cuatro claves que ya tenía» son, en efecto, cuatro.

La única prosa que sí quedó desmentida está en `progress/current.md`, no en código: menor 4.

## 5. Hallazgos

### menor 1 — T11 sigue `[ ]` en `tasks.md`

`CHECKPOINTS.md > Especificación` pide todas las tasks en `[x]`. T11 es `./init.sh` completo, que por
`AGENTS.md` corre el leader y no el implementer, y hoy no puede salir verde por la deuda de QC-82
(sección 3). No bloquea esta revisión, pero la ficha no puede pasar a `done` con T11 abierta.
Qué falta: que el leader resuelva QC-82 en el board o en disco y corra el gate completo.

### menor 2 — el test de R16 permite un import que la letra de R16 no contempla

R16 dice «los archivos nuevos solo pueden importar `zod` y código del propio módulo».
`qc109-alcance.test.ts:269` declara como permitidos `zod` y `@/lib/modules/errores`, y
`process-pdf-by-strategy.ts:18` importa de ahí el tipo `ErrorCode`.
La sustancia de R16 y de `[D12]` se cumple entera: `@/lib/modules/errores` es un módulo del propio
repo y no una dependencia, `package.json` no se toca, y es el mismo import que ya hace
`read-pdf-with-ai.ts:18` —contrato del módulo, no ruta profunda—. Lo que falta es el rastro: ni
`requirements.md` ni `design.md` recogen esa ampliación, así que un lector futuro ve una lista
congelada más ancha que el requisito que dice hacer cumplir.
Qué falta: una línea en `design.md` sección 5, o una nota fechada en R16, diciendo que el catálogo de
`ErrorCode` entra en el perímetro por ser el contrato de otro módulo. Es documentación, no código.

### menor 3 — la rama `catch` defensiva no tiene caso

`process-pdf-by-strategy.ts:110-118` convierte un lanzamiento del `readPdfWithAi` inyectado en un
fallo con el código de `UnexpectedError`. La bitácora, sección 6, sostiene que gracias a eso «no lanza
nunca» y «registra exactamente una vez» son ciertos por este archivo; pero ningún test inyecta un
doble que lance, así que esa afirmación no está demostrada y la rama nunca se ejecuta en la suite. No
incumple R10 —cuyo enunciado habla de la lectura devolviendo el fallo, no lanzándolo— ni R8.
Qué falta: un caso con un `readPdfWithAi` que lance, comprobando `ok:false` y una sola entrada de
registro.

### menor 4 — la sección de QC-109 en `progress/current.md` quedó desmentida por su propio spec

La añade esta rama y dice «14 decisiones cerradas» y «una pregunta abierta», y remata con «la
pregunta que queda abierta es real: cuánto se registra por consola. No se rellena con un supuesto».
El spec vigente tiene 16 decisiones y cero preguntas abiertas: el humano cerró esa misma pregunta el
2026-09-18 como `[D16]`, y `requirements.md > Preguntas abiertas` lo dice explícitamente. Es el mismo
defecto de «razón escrita que dejó de ser cierta», solo que en la bitácora del leader y no en el
código.
Qué falta: una nota fechada al pie de esa sección remitiendo a `[D15]` y `[D16]`, sin borrar el rastro
de lo anterior. Es del leader, no del implementer.

### menor 5 — dos epígrafes numerados 5.2 en la bitácora

`progress/impl_QC-109-...md` tiene «5.2 Prosa que la enmienda dejó desmentida» y «5.2 Nada más
chocó». Cosmético; molesta al releer.

### menor 6 — cabeceras de archivo por encima de las ~5 líneas

`docs/conventions.md > Comentarios` marca que un bloque de más de ~5 líneas es señal de que ese porqué
pertenece al `design.md`, y añade que nunca se imita el estilo de alrededor. Los cinco archivos nuevos
de producción abren con docblocks de 8 a 11 líneas (`process-pdf-by-strategy.ts:1-11`,
`strategy-run-log.ts:1-11`, `pdf-strategy.ts:1-9`, `prompts/index.ts:1-9`,
`strategy-run-log-console.ts:1-8`).
En su descargo: el contenido es porqué verificado y no repetición del código, y es exactamente el
formato que QC-108 dejó aprobado en `read-pdf-with-ai.ts:1-13` y `ports/ai-reader.ts:1-12`. Queda
anotado como menor porque la regla habla de tamaño y el precedente no la deroga; corregirlo solo aquí
dejaría el módulo a dos estilos, así que lo natural es una ficha de limpieza por módulo.

## 6. Lo que NO es hallazgo, dicho para que no se reabra

- **El gate rojo por QC-82.** Deuda ajena; el validador se para antes de typecheck y esta rama no
  toca esa entrada. Comprobado a mano, no aceptado de palabra.
- **La enmienda del 2026-09-18** —modo anulable y registro del rechazo—. Es la decisión vigente del
  humano, con nota fechada en `tasks.md` T3 y `design.md` 3.4 y con el porqué escrito: QC-111 leerá la
  estrategia de la base. No es desviación.
- **Los prompts en `.json` y su `loDefine`.** Campo de datos, no comentario: `[D15]` y `design.md`
  3.2. No roza la regla de citar fichas en producción.
- **`catalogo` a `images` y `formula` a `pdf`.** Contraintuitivo por el nombre, correcto contra
  `read-pdf-with-ai.ts:173-174`. «Leer como texto» no es `PdfConverter.extractText`, y esta ficha no
  lo usa.
- **`pages` desde `countPages`, y `pages` nulo si revienta sin que la lectura falle.** Decidido, con
  su coste escrito en `design.md` 3.4, y con caso propio que compara el resultado entero contra una
  corrida de conteo sano.
- **Sin E2E.** `[D14]` y R17, con motivo. Lo aporta QC-107.
- **Los casos de `qc108-alcance.test.ts` que se saltan** al correr desde esta rama: es el
  comportamiento que esa guardia declara, no un agujero.
