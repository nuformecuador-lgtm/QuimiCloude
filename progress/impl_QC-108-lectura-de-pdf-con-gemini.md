# QC-108 — lectura-de-pdf-con-gemini · bitacora de implementacion

> Rama `feature/QC-108-lectura-de-pdf-con-gemini`, worktree
> `.worktrees/QC-108-lectura-de-pdf-con-gemini`, desde `fdb33c5`.
> El gate completo lo corre el leader (`AGENTS.md > Regla del gate`).

## T0 — La puerta F1.4, cerrada por el humano el 2026-09-18

Las tres respuestas, tal como salieron:

1. **La OCTAVA enmienda al catalogo cerrado: SI.** Se anade `ai_unavailable`.
   **El plan B de `design.md > 5.1` queda DESCARTADO**: el fallo del proveedor NO cae a
   `unexpected`. **El camino de R12 que se ejecuta es el de la enmienda**, no el plan B, asi que
   no hay perdida de matiz que anotar: QC-107 podra distinguir un corte del proveedor de un bug
   nuestro, y el registro tambien.
2. **La dependencia `@google/genai`: SI, y ya estaba instalada por el humano** al abrir F2.0:
   `2.23.0` en `package.json`, con su fila ya escrita en `docs/dependencias.md:36`.
   La implementacion **no la reinstala y no toca esa fila**.
3. **El conflicto con QC-68 por `lib/composition/index.ts`: salida (d)** — se implementa
   **entero, T10 incluida**. No se espera a QC-68 y el cableado no se deja fuera. La escritura va
   **al final del bloque `documentos`** (`:1083-1155`), sin reordenar ni reformatear nada, y
   reutilizando la constante `pdfConverter` que QC-106 cableo en `:1118`.

### Efecto colateral de la instalacion aprobada, arreglado como primer paso de T0

`tests/guards/guard-identificador-de-request.test.ts` lleva el censo de dependencias **escrito a
mano** (QC-71, R20). La instalacion de `@google/genai` lo puso en rojo: declaraba 34 y esperaba
33. Se sube `DEPENDENCIAS_ESPERADAS` a **34** (`:250`) y se actualiza el comentario de cabecera
(`:238-243`) con la nota fechada del alta, con el mismo patron con el que ese archivo registro
las altas anteriores. **No se silencio ni se salto la guardia.**

## Los tres DESCONOCIDOS de `design.md > 8.3`, CERRADOS con la API real

`design.md > 8.3` los declaro desconocidos porque se escribio sin red y sin `node_modules`. Con el
paquete ya instalado se leyeron **sus declaraciones de tipos**, no de memoria. Todas las citas son
de `node_modules/@google/genai/dist/genai.d.ts`, version **2.23.0**
(`node_modules/@google/genai/package.json:3`).

| Pregunta | Estado | Lo que dice la API real |
|---|---|---|
| Como se pide un **plazo maximo** | **CERRADO** | Dos vias, y **son distintas**. (a) `GenerateContentConfig.httpOptions?: HttpOptions` (`genai.d.ts:5899`), y `HttpOptions.timeout?: number` en `genai.d.ts:8173`, cuyo docblock de la linea justo anterior (`genai.d.ts:8172`) dice *«Timeout for the request in milliseconds»*. (b) `GenerateContentConfig.abortSignal?: AbortSignal` (`genai.d.ts:5906`) |
| Como viaja un **PDF** | **CERRADO** | Como `Part.inlineData?: Blob` (`genai.d.ts:12352`), donde `Blob` es `{ data?: string, mimeType?: string, displayName?: string }` y `data` esta **codificado en base64** (`genai.d.ts:1378-1386`). Hay helper: `createPartFromBase64(data, mimeType)` (`genai.d.ts:2903`). `mimeType` = `application/pdf` |
| Como viaja una **imagen** | **CERRADO** | **Por el mismo camino**: `inlineData` con `mimeType` = `image/png`. El `.d.ts` no ofrece ninguna forma distinta para imagen: el docblock de `Part.inlineData` dice literalmente *«can be used to include images, audio, or video»* (`genai.d.ts:12351`) |

La forma completa de la llamada, tambien leida:
`new GoogleGenAI({ apiKey })` (`genai.d.ts:7084`, opcion `apiKey` en `:7192`) →
`ai.models.generateContent(params: GenerateContentParameters): Promise<GenerateContentResponse>`
(`genai.d.ts:11445`), con `{ model: string, contents: ContentListUnion, config?: GenerateContentConfig }`
(`genai.d.ts:6060-6069`) y el texto en el getter `GenerateContentResponse.text: string | undefined`
(`genai.d.ts:6117`). `createPartFromText` (`genai.d.ts:2928`) y `createUserContent`
(`genai.d.ts:3046`) arman el turno.

### Lo que este cierre **confirma**, y es un limite, no una buena noticia

El limite 2 de `design.md > 12` era una sospecha; ahora esta **verificado en el `.d.ts`**. El
docblock de `abortSignal` lo dice con todas las letras (`genai.d.ts:5900-5905`):

> *«NOTE: AbortSignal is a client-only operation. Using it to cancel an operation will not cancel
> the request in the service. You will still be charged usage for any applicable operations.»*

Es decir: **abortar deja de esperar, pero no deja de pagar**. Ni `abortSignal` ni
`httpOptions.timeout` evitan el cobro de una lectura que el proveedor ya empezo. Consecuencia
directa: el plazo de la libreria **no sustituye** al de R7. El plazo de 60 s lo hace cumplir **el
dominio**, con un `Promise.race` sobre un `TimeoutRunner` inyectable, que es lo unico que puede
probarse sin red (D9) y lo unico que garantiza el plazo **sea cual sea** lo que haga la libreria.
El plazo se le pasa **ademas** al adaptador para que aborte de verdad la peticion HTTP en vez de
dejarla viva. Destinatario del limite del gasto: **QC-111** — con la salvedad de la pregunta
abierta 3, que dice que **hoy nadie lo mide**.

## T12 — El E2E, diferido como deuda con destinatario

**No hay E2E en esta ficha**, y no es una exencion de `CHECKPOINTS.md > Calidad de codigo`: es
**deuda con destinatario**. El motivo es que esta ficha **no anade ningun recorrido navegable** que
un test E2E pueda visitar — no hay pantalla, ni ruta, ni Server Action (R17, D5), porque es una
capacidad interna que invocara por dentro el trabajo de la cola de QC-111. **El destinatario de la
deuda es QC-107**, que es la ficha que trae la pantalla. Mismo criterio que QC-106 D17 y QC-25 D23.
La verificacion de esta ficha es **unitaria** (R19), y se cita desde el mapa de trazabilidad.

## Un SEGUNDO censo de dependencias en rojo, que NO he tocado — decision del leader

Al cerrar la tanda 1 con `./init.sh --rapido`, la unica prueba roja de 349 archivos fue:

    tests/unit/navegacion/qc75-convenciones.test.ts:425
    "QC-75 R22 y decision cerrada «¿Libreria nueva? No»: dependencias nuevas en esta rama:
     @google/genai"

**Es el mismo fallo de diseno que el censo de QC-71, pero peor, y por eso no lo arreglo por mi
cuenta.** El de QC-71 era un numero escrito a mano pensado para subirlo cuando una dependencia se
aprueba, y el propio archivo tiene un comentario diciendo que es fragil: subirlo con su nota
fechada **es** el procedimiento, y eso se hizo. El de QC-75 es distinto: compara `package.json`
contra **el merge-base de la rama que se este ejecutando** y exige **cero** dependencias nuevas.
Como la guardia no sabe en que rama corre, **afirma sobre QC-108 una decision cerrada de QC-75**
(«¿Libreria nueva? No»), que es una decision que **nunca fue de esta ficha**. No hay numero que
subir: cualquier rama posterior que anada una dependencia legitima, aprobada y con su fila, la
pone en rojo.

**Lo que NO hago, y por que:** no la silencio, no la salto y no la reescribo. Reescribirla es
rediseñar la guardia de alcance de **otra** feature —acotarla a su propia rama, que es lo que
deberia haber hecho desde el principio— y eso no cabe en el alcance de QC-108 ni en `tasks.md`.
**Lo decide el leader.** Las tres salidas que veo, sin recomendar ninguna por mi cuenta:

1. **Acotar la guardia a la rama de QC-75**, que es el arreglo correcto de raiz y el que evita
   que la proxima dependencia aprobada vuelva a romperla. Es tocar una ficha ajena.
2. **Anotarla en `tests/baseline-rojos.json`** con motivo y destinatario, si el arnes admite esa
   salida para un rojo que no es de esta feature.
3. **Ficha propia** para arreglar los dos censos a la vez —el de QC-71 y el de QC-75— porque son
   la misma clase de error: un absoluto del repositorio escrito dentro de la guardia de alcance
   de una feature concreta.

La dependencia en si **esta limpia**: aprobada por el humano en F1.4, con los cuatro checks y con
su fila en `docs/dependencias.md:36`. `tests/guards/guard-dependencias-aprobadas.test.ts` —que es
la guardia que responde de verdad a «toda dependencia declarada esta aprobada»— **esta en verde**.

## Archivos tocados

### Produccion — NUEVOS
| Ruta | Task |
|---|---|
| `lib/modules/documentos/domain/ai-read-input.ts` | T2 |
| `lib/modules/documentos/domain/read-pdf-with-ai.ts` | T5, T6 |
| `lib/modules/documentos/ports/ai-reader.ts` | T3 |
| `lib/modules/documentos/adapters/driven/config/ai-config-env.ts` | T7 |
| `lib/modules/documentos/adapters/driven/ai/ai-reader-genai.ts` | T8 |

### Produccion — MODIFICADOS (todos ampliados al final; nada reordenado ni reformateado)
| Ruta | Task | Cambio |
|---|---|---|
| `lib/modules/documentos/domain/limits.ts` | T1 | +1 constante `AI_READ_TIMEOUT_SECONDS = 60` |
| `lib/modules/documentos/domain/errors.ts` | T4 | +1 clase `AiUnavailableError`, y la cabecera, que decia «dos clases y CERO codigos nuevos» y habia dejado de ser cierta |
| `lib/modules/errores/domain/error-codes.ts` | T4 | +1 entrada y la cabecera con la OCTAVA enmienda; la sexta sigue escrita |
| `lib/modules/errores/domain/error-catalog.ts` | T4 | +1 clave y +1 texto |
| `lib/modules/documentos/index.ts` | T9 | Bloque de exports al final |
| `lib/composition/index.ts` | T10 | +13 lineas, CERO borrados |
| `.env.example` | T7 | Bloque nuevo al final, las dos vacias |

### Tests — NUEVOS
En `tests/unit/documentos/`: `ai-limits.test.ts`, `ai-read-input.test.ts`, `ai-errors.test.ts`,
`read-pdf-with-ai.test.ts`, `ai-timeout.test.ts`, `ai-config.test.ts`, `ai-reader-adapter.test.ts`,
`qc108-alcance.test.ts`. Y `tests/unit/composition/documentos-facade.test.ts`.

### Tests — MODIFICADOS
`tests/unit/errores/catalogo.test.ts` (T4: conteo 46 a 47, rotulos desfasados corregidos, la octava
en la cabecera), `tests/unit/documentos/module-contract.test.ts` (T9),
`tests/guards/guard-identificador-de-request.test.ts` (T0: censo 33 a 34 y su nota fechada).

### Lo que NO se toco, y se comprueba
`lib/modules/documentos/ports/pdf-converter.ts` y `adapters/driven/pdf/pdf-converter-unpdf.ts`
—identicos a `dev`, R4—, `lib/modules/identity/domain/permissions.ts`, `db/**`, `app/**`,
`components/**`, `e2e/**`, `package.json`, `pnpm-lock.yaml`, `docs/dependencias.md`, y el intocable
de QC-68 `tests/integration/inventario/list-query-indexes.int.test.ts`. La guardia
`tests/unit/documentos/qc108-alcance.test.ts` lo afirma contra el merge-base con `origin/dev`.

## T13 — Mapa de trazabilidad: los 27 requisitos, cada uno a un test concreto

Todos los nombres de test de esta tabla estan verificados en disco, no transcritos de un informe.

| R | Test que lo demuestra |
|---|---|
| R1 | `module-contract.test.ts` > «R1 — el barril publica la factory, sus dependencias, el limite del plazo y el error nuevo» |
| R2 | `ai-read-input.test.ts` > «R2: un prompt vacio se rechaza», «R2: un prompt de puros espacios se rechaza», «R2: un prompt ausente se rechaza»; `read-pdf-with-ai.test.ts` > «R2 — el prompt que recibe la IA es EXACTAMENTE el que entro, sin prefijos ni sufijos» |
| R3 | `ai-read-input.test.ts` > «R3: un modo que no es pdf ni images se rechaza», «R3: un modo ausente se rechaza»; `read-pdf-with-ai.test.ts` > «R3, R23 — un modo desconocido se rechaza SIN tocar ningun puerto» |
| R4 | `read-pdf-with-ai.test.ts` > «R3, R4 — modo pdf manda UNA parte pdf y no toca el convertidor» y «R3, R4 — modo images con 3 paginas manda TRES partes image en orden, a la resolucion del modulo»; `qc108-alcance.test.ts` > «R4: ports/pdf-converter.ts es identico al de dev» y «R4: adapters/driven/pdf/pdf-converter-unpdf.ts es identico al de dev» |
| R5 | `read-pdf-with-ai.test.ts` > «R5 — 51 paginas se rechaza con CERO llamadas a renderPages y CERO a la IA» y «R5 — el tope es INCLUSIVO: con 50 paginas se lee»; `ai-limits.test.ts` > «R5: MAX_PDF_PAGES y PAGE_RENDER_DPI siguen declarados una sola vez y sin duplicar en los archivos nuevos» |
| R6 | `read-pdf-with-ai.test.ts` > «R6 — el texto devuelto es IDENTICO al de la IA, saltos de linea y espacios incluidos»; `ai-reader-adapter.test.ts` > «R6, R26 — devuelve exactamente response.text, sin recortar ni interpretar» |
| R7 | `ai-limits.test.ts` > «R7: el plazo vale 60 segundos» y «R7: el numero aparece una sola vez en el arbol del modulo, y los demas archivos lo importan»; `ai-timeout.test.ts` > «R7 — el plazo que se pasa a la IA sale de AI_READ_TIMEOUT_SECONDS, no de un numero suelto» |
| R8 | `read-pdf-with-ai.test.ts` > «R8 — si el convertidor lanza, el fallo nombra la operacion y la ruta»; `ai-timeout.test.ts` > «R7, R8, R9 — un TimeoutRunner que vence al instante falla con ai_unavailable y UNA sola llamada» |
| R9 | `ai-timeout.test.ts` > «R9 — si el puerto lanza, hay UNA sola llamada y ningun reintento» y «R7, R8, R9 — …UNA sola llamada» |
| R10 | `catalogo.test.ts` > «QC-108 R10, R11 — ai_unavailable es la octava enmienda al catalogo cerrado»; `ai-errors.test.ts` > «R10, R12 — un AiUnavailableError lleva el codigo del catalogo y el mensaje del catalogo, no propio» |
| R11 | `ai-errors.test.ts` > «R11 — el texto de ai_unavailable es distinto del de invalid_input y del de unexpected»; `catalogo.test.ts` > «QC-108 R10, R11 — …» |
| R12 | `catalogo.test.ts` > «R12 — el codigo emitido para el corte del proveedor esta en el catalogo cerrado»; `ai-errors.test.ts` > «R10, R12 — …» |
| R13 | `ai-config.test.ts` > «R13, R15 — importar el archivo con las dos variables vacias no lanza», «R13 — una variable vacia o solo-espacios cuenta como ausente», «R13, R16 — el mensaje de error no contiene ningun valor de las variables configuradas» |
| R14 | `ai-config.test.ts` > «R14 — AiConfig no tiene ningun campo de empresa: es una unica configuracion por despliegue» y «R14 — el arbol de la ficha no anade nada bajo db/**: sin tabla, columna ni cifrado de credencial» |
| R15 | `ai-config.test.ts` > «R13, R15, R16 — invocar sin configuracion lanza nombrando las dos variables» y «R15 — GEMINI_MODEL esta declarada, VACIA y documentada» |
| R16 | `ai-config.test.ts` > «R15, R16 — falta solo GEMINI_MODEL: lanza nombrandola y no cae a ningun modelo por defecto» y «R16 — en todo el arbol del modulo no existe escrita ninguna cadena de identificador de modelo» |
| R17 | `qc108-alcance.test.ts` > «R17: el diff de la rama no trae ningun archivo nuevo bajo adapters/driving/ de documentos» y «R17: el detector muerde con un driving de documentos y no con un driven o de otro modulo» |
| R18 | `qc108-alcance.test.ts` > «R18: permissions.ts es identico al de dev» |
| R19 | `qc108-alcance.test.ts` > «R19: el diff de la rama no trae ningun archivo bajo app/, components/ ni e2e/»; mas la nota de T12 de esta bitacora, que es donde vive la deuda del E2E con destinatario QC-107 |
| R20 | `qc108-alcance.test.ts` > «R20: el diff de la rama no trae ningun archivo bajo db/» y «R20: el detector muerde con el schema, la migracion y su down, y no con parecidos» |
| R21 | `module-contract.test.ts` > «R21 — el cierre real del barril no arrastra @google/genai ni ningun otro paquete de plataforma» y «R21 — el puerto AiReader y su adaptador @google/genai NO salen por el contrato publico»; `documentos-facade.test.ts` > «R21 — expone readPdfWithAi junto a las cuatro claves que ya tenia, y todas son funciones» |
| R22 | `ai-reader-adapter.test.ts` > «R22 — un unico archivo de produccion importa @google/genai, y es el adaptador»; `documentos-facade.test.ts` > «R22, R26 — construir la fachada con GEMINI_API_KEY y GEMINI_MODEL ausentes no lanza» |
| R23 | `ai-read-input.test.ts` > «R23: un campo desconocido rechaza la entrada entera» y «R23: unos bytes vacios se rechazan»; `read-pdf-with-ai.test.ts` > «R2, R23 — un prompt vacio se rechaza SIN tocar ningun puerto» |
| R24 | `qc108-alcance.test.ts` > «R24: y por lo tanto no introduce ningun identificador de base —tabla, columna o indice—». Y se dice sin disimulo, como ya anticipaba `tasks.md`: «identificadores en ingles» NO tiene guardia propia y se comprueba por lectura del reviewer; no se invento una guardia de nombres para esta ficha |
| R25 | `ai-reader-adapter.test.ts` > «R25 — importar el adaptador con las dos variables vacias no lanza» y «R25, R26 — importar el adaptador sin claves no lanza, y no toca la red». El lado «nada se instala antes de la aprobacion» lo cierra T0: la aprobacion es del 2026-09-18 en F1.4, con los cuatro checks y la fila en `docs/dependencias.md:36`, y lo vigila `tests/guards/guard-dependencias-aprobadas.test.ts`, en verde |
| R26 | `ai-reader-adapter.test.ts` > «R26 — el doble reemplaza a la libreria de verdad: ninguna llamada real ocurre»; `documentos-facade.test.ts` > «R22, R26 — construir la fachada … no lanza» y «R26 — el cableado no invoca el adaptador de IA al construirse». Ningun test de la ficha usa red ni depende de que las variables tengan valor |
| R27 | `ai-timeout.test.ts` > «R7, R8, R27 — el TimeoutRunner real vence sin esperar 60 s reales, con un doble que nunca resuelve» y «R27 — barrido: ningun test de esta ficha llama a setTimeout de verdad para dormir el plazo» |

**Ningun requisito queda huerfano: los 27 tienen test.**

## Cuatro decisiones de implementacion que el reviewer debe mirar

1. **El tope de paginas falla con `invalid_input`, NO con `ai_unavailable`.** R5 solo exige «falla
   sin renderizar y sin llamar al proveedor», y no fija el codigo. Se eligio `invalid_input` —via
   `ValidationError`— porque es el **mismo criterio que ya usa `convert-pdf.ts`** para ese mismo
   caso, y porque R10 y R11 piden explicitamente que `ai_unavailable` sea **distinto del de una
   entrada invalida**: usarlo aqui lo convertiria en «fallo cualquiera» y romperia justo el matiz
   que la enmienda existe para dar. `ai_unavailable` queda reservado a «el proveedor no respondio,
   no estaba disponible o se agoto el plazo».
2. **Dos mecanismos de plazo, y no son redundantes.** El dominio impone los 60 s con un
   `Promise.race` sobre un `TimeoutRunner` inyectable: es la garantia de R7 y lo unico que puede
   probarse sin red. El adaptador **ademas** pasa `httpOptions.timeout` y un `AbortSignal` a la
   libreria, para no dejar viva la peticion HTTP cuando el llamante ya se fue. El segundo **no
   sustituye** al primero, y su limite esta escrito mas arriba: abortar no cancela en el servicio.
3. **El barril publica cuatro simbolos de ejecucion y tres de tipo, y NI el puerto NI el
   adaptador**: `ports/` y `adapters/` los ve solo `lib/composition`, igual que en el resto del
   modulo.
4. **El cableado son 13 lineas anadidas y CERO borradas**, reutilizando la constante `pdfConverter`
   que QC-106 dejo cableada en vez de construir una segunda instancia del mismo puerto.

## Los siete limites de `design.md > 12`, al cerrar

1. **La API de `@google/genai` ya NO es un desconocido**: los tres se cerraron en T8 con cita de
   archivo y linea. **El limite se retira.**
2. **Abortar no deja de pagar**: verificado en `genai.d.ts:5900-5905`, ya no es sospecha sino
   hecho. Destinatario **QC-111**, con la salvedad de que hoy nadie mide el gasto.
3. **Nadie valida lo que la IA contesta.** Sigue abierto, **sin ficha**.
4. **El gasto no tiene tope.** Sigue abierto, **sin ficha**: una tanda en modo imagen son hasta
   500 llamadas.
5. **QC-110 recibe texto, no coordenadas.** Escrito para quien acote QC-110.
6. **Colision de la enmienda con QC-92: NO se materializo.** Al tocar el catalogo **no habia
   septima enmienda en disco**, asi que el conteo quedo en **47** y la cabecera lleva **sexta y
   octava**. Si QC-92 mergea despues, el conflicto es suyo y se resuelve **sumando las dos**, nunca
   eligiendo una: conteo **48** y las tres enmiendas en la cabecera.
7. **Colision con QC-68 por `lib/composition/index.ts`: resuelta por la salida (d).** Se implemento
   entero, T10 incluida. El diff en ese archivo es de **solo lineas anadidas**, en el final del
   bloque `documentos` y en el grupo de imports de `documentos` — lejos del bloque `recetas`
   (`:182`, `:882`), que es donde escribe QC-68.

## Estado de la verificacion

`./init.sh --rapido`, corrido por el implementer al cerrar cada tanda. Ultima corrida, con las
catorce tasks en disco:

    Test Files  1 failed | 353 passed (354)
         Tests  1 failed | 5285 passed | 24 skipped (5310)
      Duration  217.87s

**El unico rojo de 354 archivos es el censo de QC-75 descrito arriba**, que no es de esta feature y
cuya salida decide el leader. `typecheck` y `lint` en verde, y **todas las demas guardias en
verde**, incluidas `guard-dependencias-aprobadas`, `guard-catalogo-de-errores`,
`guard-arquitectura-modulos` y `guard-identificador-de-request` (con su censo ya en 34).

**El gate completo (`./init.sh`) lo corre el leader**, no el implementer (`AGENTS.md > Regla del
gate`), y con el la decision sobre ese rojo.

---

# Segunda vuelta — los dos BLOQUEANTES del reviewer, arreglados

Informe que los abrio: `progress/review_QC-108-lectura-de-pdf-con-gemini.md` (veredicto RECHAZADO,
2 bloqueantes y 5 menores). El reviewer tenia razon en los dos.

## BLOQUEANTE 1 — un fallo NUESTRO salia etiquetado como corte del proveedor

**El defecto, confirmado leyendo el archivo:** `conDiagnostico()` relanzaba **cualquier** fallo como
`Error` **plano**. Por eso un PDF corrupto o cifrado que reventara en `countPages` o `renderPages`
caia por el `else` de `fallo()` y salia con el codigo `ai_unavailable`. Y el comentario de ese
`else` —«lo que quedo fue el proveedor o el plazo»— **afirmaba algo falso**. Chocaba de frente con
**R10**, que exige un codigo «distinto del de una entrada invalida **y distinto del de un bug
nuestro**»: QC-107 habria dicho «la lectura automatica no esta disponible» ante un bug de nuestro
convertidor, y el log habria apuntado a Google.

**Arreglado de raiz, no tapando el comentario.** `conDiagnostico` ya no lanza `Error` plano: recibe
el constructor del error que corresponde a **esa** operacion y envuelve con el. Un `DocumentosError`
que venga de mas adentro se **relanza tal cual**, sin reenvolver.

| Operacion | Codigo que emite ahora | Por que |
|---|---|---|
| `countPages` | **`unexpected`** | Es **nuestro** convertidor. `unexpected` ya existe en el catalogo para «lo que no es de dominio: fallo de base, bug» |
| `renderPages` | **`unexpected`** | Lo mismo |
| tope de paginas superado | `invalid_input` | **Sin cambios**: sigue siendo entrada invalida |
| `read` (el puerto de IA) y plazo agotado | **`ai_unavailable`** | Lo unico que de verdad significa «el proveedor no respondio» |
| el `else` de `fallo()` | **`unexpected`** | Antes era `ai_unavailable`. Ahora que `conDiagnostico` envuelve todo lo que puede reventar, llegar ahi es lo **verdaderamente imprevisto**, y eso es un bug nuestro |

**No se invento ningun codigo nuevo**: la octava enmienda no se amplia. Lo que nacio es una
**clase**, `UnexpectedError` en `domain/errors.ts` —la jerarquia unica del modulo—, con el codigo
`unexpected`, sin `message` por parametro, igual que sus hermanas. **Deliberadamente NO se publica
por el barril**: `module-contract.test.ts` congela una lista **curada** de exports y no exige que
salga toda clase de `errors.ts`; fuera del modulo nadie la distingue por su clase, solo por su
codigo. Asi el arreglo no amplia la superficie publica ni toca el contrato.

**El test que dejo pasar esto tambien era nuestro, y tambien se arreglo.** El caso de R8 de ese
camino comprobaba el `reason` y **no el codigo**, asi que pasaba con el bug puesto. Tres casos
nuevos en `read-pdf-with-ai.test.ts`, que **muerden**:

- «R8, R10 — si countPages lanza, el code es unexpected y NO ai_unavailable»
- «R8, R10 — si renderPages lanza, el code es unexpected y NO ai_unavailable»
- «R9, R10 — si el puerto de IA lanza, el code SI es ai_unavailable» (el simetrico, que fija el otro
  camino para que el arreglo no se pase de frenada)

**Se comprobo que muerden de verdad**, no por inspeccion: se reintrodujo el bug exacto —el `Error`
plano y el `else` devolviendo `AiUnavailableError`— y los dos primeros dieron **rojo**, mientras
`ai-timeout.test.ts` seguia **verde**, confirmando que el camino del proveedor no se rompe. Despues
se restauro el arreglo y todo volvio a verde. Un requisito sin un test que falle cuando se rompe no
esta cubierto (regla 4 de `CLAUDE.md`).

## BLOQUEANTE 2 — citas a la ficha en produccion, clavadas por un test

`docs/conventions.md > Comentarios`: **«Nunca se cita una ficha ni un requisito en un comentario de
produccion… Sin excepciones.»** Dos lineas anadidas por esta rama en `error-codes.ts` citaban
`QC-108` y `F1.4`, y —lo que lo convertia en algo peor que un descuido— dos `toContain` **nuevos**
de `catalogo.test.ts` las **clavaban**, de modo que nadie podia limpiarlas sin ponerse en rojo.

Las dos lineas quedan asi, sin la clave de la ficha ni la puerta:

    **Octava enmienda, el 2026-09-18**: `ai_unavailable`.
    Aprobada por el humano el 2026-09-18.

La enmienda y su fecha se quedan —`tasks.md > T4` las pide y un test **preexistente** las exige— y
«aprobada por el humano» tambien, porque es **el porque** y no una referencia al tablero. Los dos
`toContain` ahora exigen **la enmienda y su fecha**, no la ficha, y siguen siendo **rojos** si
alguien borra la enmienda de la cabecera.

**La linea preexistente de la SEXTA enmienda con QC-81 NO se toco**, a proposito: los comentarios
preexistentes no se arrastran a la limpieza, se limpian por modulo en fichas del board.

**Comprobacion final**: el diff de lo **anadido** bajo `lib/` frente al merge-base no devuelve
**ninguna** cita a `QC-`, `F1.4` ni `R<n>`. La rama ya no incumple la regla en produccion.

### Nota sobre el origen de este bloqueante
El encargo que recibi decia «con el mismo formato que la sexta (QC-81)», y esa linea preexistente
**si** cita la ficha. La instruccion contradecia la regla, y **gana la regla**: `docs/conventions.md`
dice ademas que **nunca se imita el estilo de alrededor**. Queda escrito para que no se repita.

## Los cinco menores: tres arreglados, dos NO — con su motivo

| # | Que decia | Que se hizo |
|---|---|---|
| **m1** | Cuatro helpers privados en espanol (`diagnostico`, `causaDe`, `conDiagnostico`, `fallo`), contra R24 | **NO se arregla, y es deliberado.** Son **copia exacta** de los helpers homonimos de `convert-pdf.ts`, que QC-106 ya dejo mergeados en `dev` **en este mismo modulo**: renombrarlos solo aqui dejaria el modulo hablando **dos idiomas**, que es peor que el defecto. Es **deuda de modulo, no invento de esta ficha**, y se limpia en la ficha que limpie `documentos`. **R24 no esta limpio y se dice, no se disimula** |
| **m2** | Cuatro de las doce citas a `genai.d.ts` desplazadas una linea | **ARREGLADO**, y reverificado en el archivo: `Part.inlineData` es **:12352** (su docblock, :12351); `HttpOptions.timeout` es **:8173** (su docblock con la frase literal, :8172); `createPartFromText` es **:2928** (:2927 es el cierre del docblock); la frase «images, audio, or video» esta en **:12351**. Ninguna conclusion de `design.md > 8.3` cambia, pero **una cita que no dice lo que afirma es la misma especie de defecto que el bloqueante 1**, y por eso se corrige |
| **m3** | Cabeceras de test que citan la ficha | **ARREGLADO** en `documentos-facade.test.ts` y `module-contract.test.ts`; los demas archivos nuevos ya estaban limpios. **Los nombres de it/describe NO se tocan**: ahi los `R<n>` son la excepcion expresa de la convencion y son el mapa del reviewer |
| **m4** | El caso «el prompt llega EXACTAMENTE el que entro» no detectaba el recorte de zod | **ARREGLADO fijando el comportamiento**: el caso ahora usa un prompt **con espacios al borde** y afirma que llega **recortado**, que es lo que de verdad pasa. El titulo se ajusto para que sea cierto. **`ai-read-input.ts` no se toco**: el recorte se queda, R2 no prohibe normalizar. Lo que no podia quedarse era un titulo que prometia mas de lo que probaba |
| **m5** | Bloques de comentario largos en los archivos nuevos | **ARREGLADO a medias, y digo cual mitad.** Se quito la **lista numerada del orden fijo** de la cabecera de `read-pdf-with-ai.ts`: repetia en prosa lo que el codigo ya dice y su porque ya vive en `design.md > 1`. **NO se tocan** las cabeceras de `ai-reader-genai.ts`, `limits.ts` ni `ai-config-env.ts`: lo que explican **no es evidente en el codigo** —por que abortar no deja de pagar, por que el plazo vive en una sola definicion, por que la lectura es perezosa— y es justo el tipo de porque verificado que la convencion pide conservar. Recortarlas seria borrar la evidencia que sostiene los limites de esta ficha |

## Cambios en el mapa R -> test

El mapa **no pierde nada**; se **amplia**:

- **R8** suma «R8, R10 — si countPages lanza, el code es unexpected y NO ai_unavailable» y
  «R8, R10 — si renderPages lanza, el code es unexpected y NO ai_unavailable». El caso preexistente
  del `reason` queda intacto.
- **R9** suma el simetrico «R9, R10 — si el puerto de IA lanza, el code SI es ai_unavailable».
- **R10** pasa a estar cubierto **tambien en el dominio**, no solo en el catalogo: los tres casos
  nuevos son los que demuestran que `ai_unavailable` es «distinto del de un bug nuestro», que es
  literalmente lo que R10 pide y lo que antes **no se probaba**.
- **R2** conserva su cobertura; su caso ahora prueba **lo que de verdad ocurre** en vez de una
  afirmacion mas fuerte de la que probaba.

**Siguen siendo 27 de 27, y ahora R8, R9 y R10 muerden donde antes no.**

## El rojo de `qc75-convenciones.test.ts`, aclarado por el leader

**No es de esta feature y ya estaba resuelto antes de que yo lo viera**: ese archivo esta en
`tests/baseline-rojos.json` **desde el 2026-09-11**, puesto por QC-79 al instalar `resend` —el mismo
caso exacto—, asi que **el gate COMPLETO lo tolera**. Lo que me confundio es real y esta documentado
en QC-99: **`./init.sh --rapido` no consulta el baseline, solo el modo completo**. Por eso aparece
rojo en la tanda y verde en el gate. La entrada del baseline y su motivo los mantiene el leader;
**esta bitacora no toca `tests/baseline-rojos.json`**.
