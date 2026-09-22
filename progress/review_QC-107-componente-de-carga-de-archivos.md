# QC-107 — componente-de-carga-de-archivos · review

> Fase F3. Escrito por el `reviewer` el 2026-09-21 sobre el worktree
> `.worktrees/QC-107-componente-de-carga-de-archivos`, rama
> `feature/QC-107-componente-de-carga-de-archivos`.
> Diff de la ficha: `f97b594a..HEAD` (42 archivos). **Ojo**: `origin/dev..HEAD` NO es el diff de
> esta ficha — la rama esta 15 commits por detras de `dev` y ese rango mezcla trabajo ajeno (ver
> BLOQUEANTE 1).

## Veredicto

**RECHAZADO** — 1 bloqueante, 11 menores.

El bloqueante **no es del codigo entregado**, que esta bien construido y verificado: es de
**integracion**. Todo lo demas que se pedia juzgar esta comprobado y en verde.

## Lo que verifique ejecutando, no leyendo

| Que | Resultado |
| --- | --- |
| `./init.sh` completo (T17) | **VERDE**. `== init OK ==`. 591 archivos, 8392 tests, 111 saltados, **0 rojos**. Aviso: los 6 archivos del baseline ya pasan y tocaria limpiarlos |
| `pnpm exec playwright test e2e/documentos.spec.ts` | **2 passed (22.0s)**: chromium 8.5s, webkit 10.3s. Corrido por mi, no leido del informe |
| R25 observado DENTRO del servidor | La salida canalizada del `webServer` da, seis veces, `[process-pdf-by-strategy] estrategia=catalogo modo=images ... paginas=1 longitud=53`. El rasterizado vive y la IA recibe bytes: R24 y R25 a la vez, en ejecucion real |
| R24 muerde | Degrade `paraLaLibreria` a devolver el arreglo tal cual y caen **5** casos: los tres de `pdf-converter.test.ts`, el encadenado y el de `process-pdf-by-strategy.test.ts` con `invalid_input` exacto |
| R25 muerde | Vacie `serverExternalPackages` y `next-config-externos.test.ts` sale rojo (`expected [] to include '@napi-rs/canvas'`) |
| R13 muerde | Pinte `entry.extractedText` en la fila y `un archivo listo no muestra el texto extraido (R13)` sale rojo |
| R23 muerde | Rearme el temporizador tras `data: null` y caen los **dos** casos de R23, el del hook y el del componente |
| Arbol restaurado | `git status --porcelain` vacio tras cada degradacion |

## Checklist

### Especificacion
- [x] `requirements.md` con 25 requisitos EARS numerados.
- [x] `design.md` con alternativas descartadas y su porque (tres solo en `## 8`).
- [ ] `tasks.md` con todas las tasks `[x]` — **T12** (fuera de alcance, a QC-142) y **T17** (del
      leader) sin marcar. Menor 10.

### Trazabilidad
- [x] **Los 25 `R<n>` mapean a un test que existe, se llama como dice el mapa y cuyo CUERPO prueba
      el requisito.** Comprobado **caso por caso**, abriendo cada archivo (detalle abajo).
- [x] `progress/impl_...md` contiene el mapa `R<n> -> test`.

### Calidad de codigo
- [x] typecheck, lint y las tres suites (ui, node, integration) pasan dentro del gate completo.
- [x] Flujo critico con E2E: `e2e/documentos.spec.ts`, en Chromium y WebKit, sin red.
- [x] Multiplataforma (R21): `min-h-11 min-w-11` (44 px) en disparador, enviar, quitar y reanudar;
      `text-base` (16 px) en el selector de archivos; activacion por `label` atado por `for` sin
      `:hover`; `100vh` y `h-screen` ausentes en el DOM **y en la fuente**; WebKit ejercitado.
- [x] **Ninguna dependencia nueva**: `package.json` y `docs/dependencias.md` **no aparecen en el
      diff**. Verificado. El caso de R9 ademas lee el manifiesto y exige que `swr`,
      `@tanstack/react-query`, `react-dropzone` y `axios` sigan ausentes.

### Datos y seguridad
- [x] Ninguna tabla nueva: `db/schema.prisma` no esta en el diff. Sin migracion, sin RLS pendiente,
      sin `down.sql` que escribir.
- [x] Aislamiento por empresa: la ficha no anade consultas de operacion; la empresa sale del actor
      dentro del caso de uso (QC-106/QC-111) y el componente **no la pasa**. R23 exige ademas que la
      pantalla **no distinga** «no existe» de «es de otra empresa», y su caso lo comprueba contra un
      regex de delatores y contra la aparicion del identificador de tanda.
- [x] Permisos en el caso de uso, no en la pantalla (R14): dos casos, uno en el componente y otro en
      la pantalla que lo monta.
- [x] Sin secretos. Los dos prompts de `webServer.env` son texto ficticio y estan dichos como tales.
- [x] Sin webhook nuevo.

### Modulos hexagonales
- [x] Las tres Server Actions se importan **por su ruta exacta** y **nunca** desde el barril
      (`document-upload.tsx:8-9`, `use-batch-status.ts:6`). El caso de R4 lo cierra por el otro lado:
      afirma que el barril **no** exporta `issueUploadLinksAction` ni `enqueueBatchAction`.
- [x] El componente solo importa el barril del modulo, las acciones por ruta, `components/ui` y
      `@/lib/utils`. Ni `lib/composition` ni un adaptador driven.
- [x] La flecha prohibida se evita a proposito: `runDocumentJob` sale a un `const` en
      `lib/composition/index.ts` y entra **por parametro** en la cola en linea, en vez de que un
      adaptador driven importe la composicion.
- [x] `domain/` y `ports/` intactos: del modulo `documentos` el diff solo toca `adapters/**`.
- [x] Contrato importado, no reescrito (R22): el caso prohibe el literal del tope, la redeclaracion
      de los cuatro tipos y hasta el literal de estrategia en la capa de interfaz.

### Verificacion final
- [x] `./init.sh` verde (lo corri yo).
- [x] Este archivo existe.
- [ ] Entrada en `progress/history.md` — no esta. Es paso de cierre del leader. Menor 11.
- [ ] Worktree por desmontar al cerrar.

## Trazabilidad, caso por caso

Abri los 42 archivos del diff y **cada** caso citado en el mapa. Lo que mire en cada uno fue el
cuerpo, no el nombre. Ninguno resulto ser una promesa vacia.

| R | Donde | Que prueba el CUERPO |
| --- | --- | --- |
| R1 | `document-upload-selection.test.tsx:55,70` | Sube el tope exacto y exige viva la fila anterior al tope y ausente la siguiente; con uno de mas exige error visible, **cero** filas, enviar deshabilitado y las dos acciones sin llamar — con dobles que **revientan** si se invocan, no contadores |
| R2 | idem `:95` | `accept="application/pdf"` y `multiple` en el DOM, un `.txt` que no llega a fila, y la accion invocada con `contentType: 'application/pdf'` |
| R3 | `document-upload-strategy.test.tsx:65` | Prop tipada con el contrato; cero `select`, cero radios, cero combobox dentro del componente; y el encolado lleva una sola estrategia para toda la tanda |
| R4 | `document-upload-flow.test.tsx:96` | La accion se dobla **por su ruta exacta** y se comprueba que el barril NO la exporta |
| R5 | idem `:70` | El `PUT` sale con el enlace firmado y `body instanceof File`; recorre **todos** los argumentos de las tres acciones exigiendo que ninguno contenga `%PDF` ni sea un `File` |
| R6 | idem `:131,150` y `document-upload-rows.test.tsx:49` | Un fallo de subida deja `data-phase="failed"` y encola **solo** la ruta que subio; sin ninguna subida, ni encolado ni sondeo. Ver menor 7 |
| R7 | `document-upload-flow.test.tsx:117` | Encola con las rutas **devueltas** por R4, en su orden, y la estrategia de la prop |
| R8 | `use-batch-status.test.tsx:42,62,77,100` | Cuatro casos con temporizadores falsos: la fila recorre en cola, procesando y listo; para con listo mas error; con una consulta colgada cinco intervalos solo hay **una** llamada; al desmontar no hay una llamada mas en diez intervalos |
| R9 | `document-upload-convenciones.test.ts:88` | Los imports de paquete de toda la carpeta son **exactamente** `['react']`, y el manifiesto sigue sin las cuatro candidatas |
| R10 | `use-batch-status.test.tsx:134` | Doscientos intervalos con la fila en cola: sigue en cola, sin error, con **mas de cien** consultas. Nadie se rinde solo |
| R11 | `document-upload-rows.test.tsx:33` | Los cuatro estados, uno a uno, con su atributo y su etiqueta, exigiendo **un solo** elemento de estado y ninguna fase de navegador |
| R12 | `document-upload-errors.test.tsx:75,116` | **Mismo** motivo de texto libre y dos codigos distintos dan dos textos distintos, y el texto del error **no contiene** el motivo. Y el error de la consulta se pinta por su codigo y detiene el sondeo de verdad (un intervalo entero sin consulta nueva), con el reanudar funcionando |
| R13 | `document-upload-rows.test.tsx:63` | Con texto extraido poblado: se ve «Listo» y el texto **no aparece** ni por contenido ni por consulta de texto. **Comprobado que muerde** |
| R14 | `document-upload-errors.test.tsx:187` y `supplier-detail-upload.test.tsx:252` | Se monta entero antes de saber nada de permisos; con el error de autorizacion sigue visible y habilitado y lo pinta como cualquier otro |
| R15 | `document-upload-convenciones.test.ts:108` | Regex sobre la fuente sin comentarios: nada de supabase, `createClient`, realtime, canal, suscripcion, `WebSocket` ni `EventSource` |
| R16 | idem `:116` | Nada de sonner, toast, notificacion del navegador, vibracion ni `alert` |
| R17 | `supplier-detail-upload.test.tsx:227` | Renderiza la pagina **de verdad** (resolviendo sus Server Components), comprueba con `compareDocumentPosition` que la subida va **despues** del catalogo y colgando del mismo contenedor, y que el encolado sale en modo catalogo |
| R18 | `document-upload-convenciones.test.ts:171` (negativo) y R3 (positivo) | Recorre **todas** las fuentes de la carpeta de formulas —derivada de `FORMULAS_ROUTE`, no escrita a mano— exigiendo que ninguna nombre el componente ni tome prestado un permiso de proveedores; y que ningun codigo del catalogo case con documento, subir o carga, con el centinela de que el permiso que el modulo exige **ya existia** |
| R19 | idem `:124` | `routes.ts` y `private-nav.ts` sin rastro de documentos, carpeta propia inexistente, y **la lista de `page.tsx` que montan el componente es exactamente una** |
| R20 | `documentos-facade.test.ts` (2), `guard-dobles-e2e.test.ts` (5) y `e2e/documentos.spec.ts` | La bifurcacion se observa por **cual de los dos adaptadores recibio la llamada**, no por un espia de la variable. El E2E afirma tres filas con su nombre exacto, la fase previa, el estado final por atributo, **tres** intercepciones del `PUT` contadas, y ademas lee Postgres: una tanda, estrategia catalogo, tres filas terminadas |
| R21 | `document-upload-a11y-tactil.test.tsx:90,129` | 44 px en los cuatro controles, 16 px en el selector, `label` atado al `id`, cero `title`, cero clases que descubran algo al pasar el puntero, y alto de pantalla ausente **tambien en la fuente** |
| R22 | `document-upload-convenciones.test.ts:143` | Import del tope y del tipo desde el barril, etiquetas indexadas por el tipo del modulo, y prohibicion del literal del tope, de las redeclaraciones de tipo y del literal de estrategia |
| R23 | `use-batch-status.test.tsx:117` y `document-upload-errors.test.tsx:148,168` | Sin tanda: se marca como desconocida, sin error, sin una consulta mas en diez intervalos; en pantalla, aviso con rol de estado, sin control de reanudar, y el texto **no** casa con «no existe», «otra empresa», «permiso» ni «acceso», ni contiene el identificador. **Comprobado que muerde** |
| R24 | `pdf-converter.test.ts:176-241` y `process-pdf-by-strategy.test.ts:605` | Tras contar, extraer y rasterizar, el arreglo conserva longitud, tamano de bufer y **contenido byte a byte**; mas el encadenado de las tres. Y con el conversor **real** y solo la IA doblada, las **dos** estrategias llegan a la IA: formula con los bytes completos comparados uno a uno, catalogo con una imagen no vacia de la pagina 1, y el registro confirma una pagina contada (sin conteo previo el defecto no se ejercitaria). Ningun caso menciona la copia. **Comprobado que muerde: 5 rojos** |
| R25 | `next-config-externos.test.ts` y el E2E | El test **no nombra el paquete**: lo **deriva** de los `import()` diferidos del adaptador, con centinela de que la lista no sea vacia, y afirma sobre la **configuracion resuelta**, no sobre el texto del archivo. El E2E es el unico que lo observa dentro del servidor, que es lo que R25 exige. **Comprobado que muerde** |

## Barrido de comentarios (`docs/conventions.md > Comentarios`)

Corri **mi propio** barrido sobre **las lineas anadidas o modificadas** del diff en `lib/`, `app/`,
`components/`, `db/`, `scripts/`, `next.config.ts` y `middleware.ts`, buscando `QC-<n>`, `R<n>`,
`design.md`, `requirements.md`, `tasks.md`, «decision cerrada» y las marcas de decision entre
corchetes.

**Resultado: cero coincidencias.** Y el detector **muerde**: lo valide contra una linea de control
que lleva las seis formas a la vez —salta— junto a una linea limpia —no salta—. Las citas que hay
viven en `tests/`, `e2e/`, `.env.example` y `playwright.config.ts`, donde la regla las admite, y los
nombres de caso llevan su `R<n>` como debe ser.

Los comentarios nuevos de produccion explican **porques verificados**: el detach de la libreria, por
que la bifurcacion es una y se consulta en cada llamada, por que los dobles nunca se cablean solos.
Ninguno repite lo que hace el codigo. Ninguno pasa de cinco lineas salvo las cabeceras de archivo,
que es donde el repo las pone.

## Hallazgos

### BLOQUEANTE 1 — La rama va 15 commits por detras de `dev`, y R25 re-arregla lo que QC-136 ya mergeo

**Donde.** `next.config.ts:6` (esta rama) frente al `next.config.ts` de `origin/dev`;
`tests/unit/documentos/next-config-externos.test.ts` frente a
`tests/unit/documentos/canvas-no-empaquetado.test.ts` (existe en `dev`, no aqui);
`specs/QC-107-componente-de-carga-de-archivos/design.md:438`; `feature_list.json`.

**Que pasa.** `git merge-base origin/dev HEAD` es `f97b594a`, y `dev` ha avanzado 15 commits desde
entonces. Uno de ellos es **`d3e13aaf` — `fix(QC-136): el par nativo del canvas sale del empaquetado
y dev vuelve a compilar`**, mergeado por el **PR #101 el mismo 2026-09-21**, que hace **exactamente**
lo que hacen T20 y R25: declarar `@napi-rs/canvas` en `serverExternalPackages`. Y trae su propia
guardia, `canvas-no-empaquetado.test.ts`, con su caso de sensibilidad.

Consecuencias concretas, todas verificadas:

1. **Conflicto seguro en `next.config.ts`.** Las dos ramas escriben la misma clave con el mismo valor
   y comentarios distintos. Git no lo resuelve solo.
2. **Cobertura duplicada de un mismo invariante.** Tras el merge quedan dos tests afirmando que el
   par nativo esta declarado externo. El de esta ficha es mejor —deriva el paquete del adaptador en
   vez de nombrarlo—, pero eso hay que **decidirlo**, no dejarlo pasar.
3. **La evidencia escrita en el spec es falsa contra `dev`.** `design.md > 13` afirma, como prueba de
   la causa, que «`next.config.ts` **esta vacio** — trae el comentario de plantilla de
   `create-next-app` y nada mas». Era cierto en el merge-base y **ya no lo era en `dev`** cuando se
   escribio la tercera enmienda. El spec, la bitacora y `progress/current.md` **no mencionan QC-136
   ni una vez** (comprobado por grep). El diagnostico se pago dos veces.
4. **`feature_list.json` tambien diverge**: `dev` ya trae QC-137 desde el F0 del 2026-09-21; QC-142
   solo existe en esta rama. Otro conflicto al integrar.

**Por que es bloqueante y no una observacion.** El gate completo que corri esta verde, pero **sobre
un arbol que no es el que se va a mergear**. La regla 5 de `CLAUDE.md` pide `./init.sh` completo
«antes de cada PR, sin excepcion», y lo que importa es el estado que entra en `dev`. Aqui ademas no
es teorico: hay un conflicto de contenido garantizado en el archivo que R25 modifica.

**Que falta para cumplirlo** (no lo arreglo yo; vuelve al implementer y al leader):

- Traer `origin/dev` a la rama y resolver `next.config.ts` dejando **una** version.
- Decidir cual de los dos tests de R25 sobrevive y **dejarlo escrito en la bitacora**, citando
  QC-136 y su PR. Si sobrevive el de esta ficha, borrar el de `dev` es un cambio sobre trabajo ajeno
  y hay que decirlo; si sobrevive el de `dev`, R25 se queda sin test propio y hay que reapuntar el
  mapa de trazabilidad.
- Reconciliar `feature_list.json` sin duplicar QC-137 ni perder QC-142.
- Volver a correr `./init.sh` completo **y** el recorrido de `e2e/documentos.spec.ts` sobre el arbol
  ya integrado.

### Menores

1. **La bitacora contradice al spec en R18.** `progress/impl_...md:91` y el parrafo «R18, dicho
   entero» (`:100-104`) siguen diciendo **BLOQUEADO** y repiten el razonamiento **anterior** al
   cierre de la pregunta abierta 1 («quien trabaja recetas necesitaria ese permiso ajeno»). El spec
   ya la cerro y la derivo a QC-142, y R18 hoy **no esta bloqueado**: esta cubierto, en positivo por
   el caso de la prop y en negativo por el de convenciones. Texto obsoleto en el artefacto que
   `CHECKPOINTS.md > Trazabilidad` usa como mapa.
2. **La bitacora se contradice a si misma en R20.** `:106-110` afirma que el recorrido «**termina en
   rojo** en su ultimo aserto» y que «**R20 no se puede dar por cerrado**», mientras la tabla
   (`:18`) y el punto 4 (`:187-209`) dicen cerrado y verde — que es lo que yo mismo medi. Parrafo que
   la tercera y la cuarta enmienda dejaron sin limpiar.
3. **`design.md:3` dice «Cubre `R1`–`R22`»** cuando el propio documento cubre ya R23, R24 y R25 en
   sus secciones 12 y 13. La cabecera no se actualizo con las enmiendas.
4. **`tests/guards/guard-identificador-de-request.test.ts:121-127`**: el alta de `documentos.spec.ts`
   anade **nueve** lineas de comentario que reproducen casi literalmente el bloque de la entrada
   anterior, incluida la frase entera sobre el diferimiento de QC-71 R21. Bastaba la linea que
   describe el recorrido. Comentario largo y redundante.
5. **Estilo de punto y coma inconsistente.** `tests/unit/documentos/next-config-externos.test.ts` y
   `tests/guards/guard-dobles-e2e.test.ts` van **sin** punto y coma; el resto de los tests de la
   ficha —y del repo— los lleva. El lint no lo caza; la lectura si lo nota.
6. **`lib/modules/documentos/adapters/driven/pdf/pdf-converter-unpdf.ts:33`**: `paraLaLibreria` es el
   unico identificador en castellano de un archivo cuyo resto es `countPages`, `extractPdfText`,
   `describeCause` y `resolveRasterizer`. Mezcla de idioma dentro del mismo archivo.
7. **La mitad «en curso» de R6 se prueba por inyeccion, no por observacion.** El unico caso que mira
   la fase de subida en curso la recibe **por prop** (`document-upload-rows.test.tsx:50`). Ningun
   test observa que el componente **ponga** esa fase mientras los bytes viajan de verdad, y el E2E
   tampoco: afirma la fase previa antes y el estado final despues. Las otras dos mitades de R6 —fila
   senalada y no encolar— si estan probadas sobre el flujo real.
8. **`document-storage-memory.ts:104` devuelve siempre la MISMA instancia** del PDF minimo a todos
   los `download`. Hoy es seguro **solo porque** T19 garantiza que nadie detacha el bufer del
   llamante. Es una dependencia implicita entre el doble y el arreglo de R24: el dia que alguien
   toque la copia del adaptador, el E2E caera con un sintoma que no apunta a la causa. Una copia por
   descarga lo cerraria.
9. **Tres adaptadores que existen solo para el E2E viven en produccion** (`adapters/driven/storage`,
   `/queue` y `/ai`) y viajan al bundle. Esta **escrito y aceptado** en `design.md > 8` («coste
   aceptado y dicho»), con su guardia y una sola bifurcacion. Lo anoto para que no se descubra
   despues, no como objecion.
10. **`tasks.md` no tiene todas las tasks `[x]`** (`CHECKPOINTS.md > Especificacion`): T12 fuera de
    alcance por decision escrita y T17 pendiente del leader. Incumplido en la letra, justificado en
    el espiritu — pero el checkpoint no admite hoy esa distincion.
11. **`progress/history.md` sin entrada** (`CHECKPOINTS.md > Verificacion final`). Paso de cierre del
    leader, que tambien desmonta el worktree.

## Observaciones — decisiones escritas y aprobadas que digo sin bloquear

- **R18 y T12 fuera de alcance, a QC-142.** Me parece **bien**, y ademas bien resuelto: R18 se
  reescribio para exigir lo que esta ficha **si** entrega y **si** se puede verificar hoy, en vez de
  dejar un requisito vivo a medias, y se conservo numerado para no descuadrar el mapa. La cobertura
  en negativo es de las mas solidas del lote: deriva la carpeta de formulas de `FORMULAS_ROUTE` en
  vez de escribirla, y vigila el catalogo de permisos por dos vias.
- **R24 y R25 dentro de una ficha declarada `frontend`.** Mete backend en una ficha de pantalla, esta
  dicho asi en el spec y aprobado. Lo respaldo: los dos defectos **rompian la aplicacion real** —la
  estrategia catalogo rasteriza siempre y el trabajo de la cola corre dentro de Next— y los destapo
  este E2E precisamente porque es lo primero que encadena las piezas sobre el mismo arreglo y dentro
  del servidor. Separarlos habria dejado un recorrido rojo en `dev` esperando a otra ficha.
- **Canalizar la salida del servidor en `playwright.config.ts`.** Aprobado, con criterio escrito, y
  **util**: es exactamente lo que me permitio comprobar R25 en ejecucion —`paginas=1 longitud=53`—
  en vez de creerme el aserto de estado. Sin eso, un archivo en error solo se distingue de otro por
  el color de la fila.
- **Alta de `documentos.spec.ts` en el censo de `guard-identificador-de-request.test.ts`.** Correcto:
  la lista es cerrada y darse de alta a mano **es** su punto de extension. El ancla no se relajo y el
  diferimiento de QC-71 R21 queda intacto. Lo unico que sobra es la prosa (menor 4).
- **Prompts ficticios en `webServer.env`.** Aceptable y dicho: la IA esta doblada, ese texto no se
  usa nunca y solo evita que leer el prompt lance antes de llegar al adaptador. No son secretos.
- **`@napi-rs/canvas` en el runtime de Vercel sigue DESCONOCIDO.** Anotado con destinatario y sin
  disfrazarlo de resuelto, que es lo que pide la regla 6. **De acuerdo, y conviene subrayarlo**: esta
  ficha arregla el **empaquetado**, no el runtime, y la pregunta lleva abierta desde el 2026-09-16
  como la numero 3 de QC-106. Solo la cierra un despliegue.
- **Pregunta abierta 2 — el texto que la IA devuelve no lo guarda nadie.** Sigue abierta y **es la
  unica pregunta del spec sin destinatario**: QC-137 se llevo el tiempo real, QC-142 el permiso, y
  esta no se la llevo nadie. No bloquea esta ficha —`[D3]` decide que la pantalla no lo pinta y
  QC-131 lo lee del log—, pero conviene que nazca su ficha antes de que la cadena tenga mas
  consumidores, o sera la tercera vez que una pregunta sin dueno reaparece en una ejecucion real.

## Que hace falta para que esto sea OK

Solo lo del bloqueante 1: **integrar `origin/dev`, resolver `next.config.ts`, decidir que pasa con el
test duplicado de R25 dejandolo escrito, reconciliar `feature_list.json` y volver a correr el gate
completo y el E2E**. Los menores 1, 2 y 3 son tres parrafos de spec y bitacora que conviene poner al
dia en el mismo viaje, porque son el mapa con el que se revisa. El resto puede ir a ficha.

**El codigo entregado, tal como esta, lo aprobaria.**
