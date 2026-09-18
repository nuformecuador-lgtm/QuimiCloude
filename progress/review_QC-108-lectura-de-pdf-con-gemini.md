# QC-108 — lectura-de-pdf-con-gemini · review

> Revisado sobre el worktree `.worktrees/QC-108-lectura-de-pdf-con-gemini`, rama
> `feature/QC-108-lectura-de-pdf-con-gemini`, tip `1bbf89c`, arbol limpio.
> Merge-base con `origin/dev`: `b8e3d5e`.
> Contrastado contra `specs/QC-108-lectura-de-pdf-con-gemini/`, la bitacora del implementer,
> `docs/` y `CHECKPOINTS.md`.
>
> **El gate completo lo corre el leader.** Aqui se corrio: `typecheck`, `lint`, los 61 archivos de
> `tests/unit/documentos`, `tests/unit/composition`, `tests/unit/errores/catalogo.test.ts` y
> `tests/guards` (754 pasan, 13 skip, 0 rojos, 21,6 s), mas `tests/unit/navegacion` para confirmar
> el rojo conocido de QC-75.

## Contexto aceptado sin reabrir (F1.4, humano, 2026-09-18)

1. La **octava enmienda VA**: `ai_unavailable` entra; el plan B de `design.md > 5.1` esta
   descartado. **No se revisa como hallazgo.**
2. `@google/genai` **aprobada**, instalada por el leader, con fila en `docs/dependencias.md:36`.
3. El conflicto con QC-68 se resuelve por la **salida (d)**: cableado incluido. **No es hallazgo.**
4. **E2E diferido con motivo** (D5, destinatario QC-107). **No es hallazgo.**
5. `tests/unit/navegacion/qc75-convenciones.test.ts:425` esta rojo a proposito, es defecto de esa
   guardia y esta en manos del humano. **No se cuenta como hallazgo** y no ha estorbado a ningun
   juicio de este informe.

## Checklist

### Especificacion
- [x] `requirements.md` con R1-R27 en EARS, numerados.
- [x] `design.md` con alternativas descartadas y su porque (seccion 8.4, y el descarte a sabiendas
      de la respuesta estructurada por D3).
- [x] `tasks.md` con **T0-T13, las catorce marcadas `[x]`**. Verificado linea a linea.

### Trazabilidad
- [x] La bitacora contiene el mapa `R<n> -> test` de los **27**.
- [x] **Los 27 mapean a un test que existe en disco y que de verdad ejercita el requisito.**
      Verificado leyendo los ocho archivos de test nuevos, no transcribiendo la bitacora. Detalle
      del juicio abajo.

### Calidad de codigo
- [x] `pnpm run typecheck` verde (`tsc --noEmit`, sin salida).
- [x] `pnpm run lint` verde (`eslint`, sin salida).
- [x] Tests de la ficha verdes: 61 archivos, 754 casos.
- [x] E2E: **no aplica, diferido con motivo a QC-107** (D5, R19, T12). Deuda con destinatario,
      escrita, no exencion silenciosa.
- [x] UI: **la ficha no toca UI**. `app/`, `components/` y `e2e/` con cero archivos en el diff,
      comprobado por la guardia de alcance y por `git diff --stat`. La regla multiplataforma no
      aplica.
- [x] Dependencias: `@google/genai` con su fila en `docs/dependencias.md`, los cuatro checks y la
      aprobacion humana citada; el `design.md` la lleva escrita en 8.2.
      `guard-dependencias-aprobadas` en verde.

### Datos y seguridad
- [x] **Cero archivos bajo `db/`** en el diff: sin modelo, sin migracion, sin `down.sql` (R20).
      No hay tabla nueva, asi que RLS, `FORCE ROW LEVEL SECURITY` y columna de empresa **no
      aplican**.
- [x] **Aislamiento por empresa: no aplica.** La ficha no anade modelo a `db/schema.prisma` ni
      toca ninguna consulta de datos de operacion. El schema es identico al de la base y
      `ai-config.test.ts` lo afirma (no matchea `/gemini/i` ni `/AiCredential/i`).
- [x] **Sin credencial por empresa** (R14): `AiConfig` son dos campos, `apiKey` y `model`, sin
      `company`/`empresa`/`tenant`, con test.
- [x] **Ningun secreto hardcodeado.** `.env.example` declara las dos variables **vacias**, y un
      test barre que ninguna lleve valor. La clave se lee dentro de funcion, nunca al importar.
- [x] Webhooks: no aplica.

### Modulos hexagonales
- [x] `domain/` y `ports/` de `documentos` **no** importan `@google/genai`, `next/*`,
      `@prisma/client`, `lib/shared/` ni `lib/composition`. Comprobado por el cierre transitivo
      real de `module-contract.test.ts`, que ademas **muerde**: el caso que inyecta un import
      falso de `@google/genai` en `read-pdf-with-ai.ts` exige el hallazgo, y lo obtiene.
- [x] `read-pdf-with-ai.ts` importa de otro modulo **solo su contrato**: `@/lib/modules/errores`,
      y solo como tipo.
- [x] **El cableado vive solo en `lib/composition`.** El barril del modulo no publica ni `AiReader`
      ni `readWithGenai`, y un test lo afirma contra los especificadores del fuente.
- [x] **`lib/composition/index.ts`: 13 lineas anadidas, 0 borradas** (`git diff --numstat` contra
      `b8e3d5e`). Tres hunks, todos de adicion: dos en el grupo de imports de `documentos`
      (:290, :303) y uno al final del bloque `documentos` (:1124 y :1167). **El bloque `recetas`
      de QC-68 (:182, :882) esta intacto.** La salida (d) se sostiene.
- [x] **`tests/integration/inventario/list-query-indexes.int.test.ts` NO esta tocado.** Fuera del
      diff, y ademas la guardia de alcance lo compara contra la base con ancla anti-vacuidad.
- [x] `pdf-converter.ts` y `pdf-converter-unpdf.ts` identicos a la base (R4), mismo mecanismo.

### Permisos
- [x] No aplica: capacidad interna, sin ruta ni pantalla. `permissions.ts` identico a la base (R18).

### Configuracion
- [x] Nada que cambie entre entornos queda hardcodeado. El plazo vive en **una sola definicion**
      (`AI_READ_TIMEOUT_SECONDS` en `domain/limits.ts`) y un test barre el arbol del modulo para
      que ni el nombre se redeclare ni el numero (`60_000`, `60 * 1000`) se repita fuera. Igual
      para `MAX_PDF_PAGES` y `PAGE_RENDER_DPI`.

### Verificacion final
- [ ] `./init.sh` completo: **lo corre el leader**. Aqui: typecheck, lint y 61 archivos en verde.
- [x] `progress/review_*.md` existe — es este.
- [ ] Entrada en `progress/history.md`: **no existe aun para QC-108** (la ultima es la de QC-59).
      Paso de cierre del leader, no hallazgo del implementer.
- [ ] Desmontaje del worktree: paso de cierre del leader.

---

## Lo que se pidio verificar de verdad

### 1. Trazabilidad R1-R27: comprobada caso a caso, no transcrita

Los 27 tienen test y los tests **muerden**. Lo que sostiene ese juicio, y no es un resumen de la
bitacora:

- Los dobles del puerto y del convertidor **registran llamadas**, asi que «cero reintentos», «sin
  llamar al proveedor» y «sin renderizar ni una pagina» son aserciones, no supuestos
  (`read-pdf-with-ai.test.ts`, `ai-timeout.test.ts`).
- Las guardias de barrido llevan **ancla anti-vacuidad**: `qc108-alcance.test.ts` exige que el
  rango de git traiga algo bajo la carpeta del spec antes de afirmar ninguna ausencia, y su
  comparador exige que el archivo de la base contenga una marca conocida. Sin eso, un rango mal
  calculado pasaria en verde sin mirar nada. Ademas falla **en rojo**, no en `skip`, si estando en
  la rama no se puede calcular el merge-base.
- Cinco casos son **detectores probados contra si mismos** («el detector muerde con X y no con lo
  que solo se le parece»): interfaz, base de datos, driving, identificador de modelo y el
  comparador de intocables. Eso es lo que impide que pasen por suerte.
- `module-contract.test.ts` prueba que la regla de capas **muerde** inyectando un import de
  `@google/genai` un salto mas alla del barril, y que muerde si alguien cuelga el adaptador del
  barril aunque el archivo no exista.

**R24 — juicio pedido.** Se cubre «por ausencia» de forma correcta en su mitad de base de datos:
un identificador de tabla, columna o indice solo puede entrar por `db/schema.prisma` o por una
migracion, y la guardia afirma que el diff no trae ninguno de los dos, con ancla. La mitad de
«identificadores en ingles» la juzgo por lectura: **los nombres de archivo y todo lo publico estan
en ingles** (`ai-read-input.ts`, `read-pdf-with-ai.ts`, `ai-reader.ts`, `ai-config-env.ts`,
`ai-reader-genai.ts`; `createReadPdfWithAi`, `AiReader`, `AiDocumentPart`, `readAiConfigFromEnv`,
`AI_READ_TIMEOUT_SECONDS`, `AiUnavailableError`...). **Falla en cuatro helpers privados en
espanol** — ver hallazgo m1. No es bloqueante, pero R24 no esta limpio y darlo por «cubierto» sin
mas no seria cierto.

**R19 — juicio pedido.** Es un requisito de pura ausencia («NO DEBE aportar ningun recorrido
navegable»), y un requisito de ausencia solo puede demostrarse por ausencia. La guardia lo hace
bien —cero archivos bajo `app/`, `components/` y `e2e/`, con ancla y con detector que muerde— y la
nota de T12 le pone destinatario (QC-107) y motivo. **Lo doy por cubierto.** El cierre no es
«guardia + nota» a secas: es «guardia con ancla + detector probado + nota con destinatario».

### 2. Los tres desconocidos del design 8.3: citas verificadas una a una

Leidas en `node_modules/@google/genai/dist/genai.d.ts` (18.694 lineas), version **2.23.0**
confirmada en `node_modules/@google/genai/package.json:3`.

| Afirmacion de la bitacora | Veredicto |
|---|---|
| `GenerateContentConfig.httpOptions?: HttpOptions` en :5899 | **Exacta**, literal en esa linea |
| `HttpOptions.timeout?: number`, «Timeout for the request in milliseconds», :8172 | **Cierta**; :8172 es el docblock con esa frase literal y el campo esta en :8173 |
| `GenerateContentConfig.abortSignal?: AbortSignal` en :5906 | **Exacta** |
| El NOTE de `abortSignal` en :5900-5905 | **Exacta y literal**, palabra por palabra: «AbortSignal is a client-only operation... You will still be charged usage for any applicable operations.» El limite 2 del design queda verificado, no supuesto |
| `Part.inlineData?: Blob` en :12351 | **Cierta con desfase de 1**: :12351 es el docblock, `inlineData?: Blob_2;` esta en :12352 |
| `Blob` = `{ data?, mimeType?, displayName? }` con `data` en base64, :1378-1386 | **Exacta**; `@remarks Encoded as base64 string` en :1380 |
| `createPartFromBase64(data, mimeType)` en :2903 | **Exacta** (la firma real admite un tercer parametro opcional `mediaResolution`, no usado) |
| Docblock «can be used to include images, audio, or video», :12350 | **Cierta con desfase de 1**: la frase esta en :12351 |
| `GoogleGenAI` :7084, `apiKey` :7192, `generateContent` :11445, `GenerateContentParameters` :6060-6069, el getter `text` :6117, `createUserContent` :3046 | **Exactas** |
| `createPartFromText` en :2927 | **Cierta con desfase de 1**: :2927 es el cierre del docblock, la declaracion esta en :2928 |

**Ninguna cita afirma algo que el archivo no diga.** Los cuatro desfases de una linea son
docblock-frente-a-declaracion, y en dos de los cuatro la frase citada esta justo en la linea
citada. No es el fallo que QC-68 cazo. Queda como m2, menor.

### 3. El plazo de 60 s se ejercita sin dormir y sin red

Confirmado. `ai-timeout.test.ts` tiene los dos lados:

- Con un `TimeoutRunner` inyectado que vence al instante: `ai_unavailable` y **una** llamada.
- Con el `TimeoutRunner` **real** del dominio, temporizadores falsos limitados a `setTimeout`,
  `clearTimeout` y `Date`, un doble que nunca resuelve y `advanceTimersByTimeAsync(60_000)`.
  **`process.hrtime` se deja fuera de lo falseado a proposito** y se usa como reloj de pared para
  aserir menos de 5.000 ms reales. Ese detalle es lo que convierte «no duerme» en algo probado.
- Barrido: ningun test de la ficha contiene `setTimeout(`.

**Ningun test llama a Gemini ni a la red.** `ai-reader-adapter.test.ts` dobla `@google/genai` con
`vi.mock` y ademas **verifica que el doble esta puesto** (`vi.isMockFunction`), que es lo que
impide que el archivo pase en verde por no haber llegado nunca a la libreria.
`documentos-facade.test.ts` borra las dos variables **en `vi.hoisted`, antes del import**, y dobla
tanto Prisma como el adaptador de IA. La suite corre sin claves.

### 4. Capas

Verificado por lectura y por el cierre transitivo real que ejecuta `module-contract.test.ts`:
`domain/` y `ports/` de `documentos` no arrastran `@google/genai`, `next/*`, `@prisma/client`,
`@supabase/*`, `unpdf` ni `@napi-rs/*`. El unico import externo del dominio nuevo es `zod`. El
adaptador es el **unico** archivo de produccion del repo que importa `@google/genai`, barrido sobre
`lib`, `app`, `components` y `scripts` con ancla (mas de 100 fuentes recorridas). El cableado esta
solo en `lib/composition/index.ts` y no invoca nada al construirse.

---

## Hallazgos

### BLOQUEANTE 1 — Un comentario de produccion afirma algo falso, y el codigo que describe manda un fallo NUESTRO al usuario como «la IA no esta disponible»

`lib/modules/documentos/domain/read-pdf-with-ai.ts:136`:

    // Ni el esquema ni el tope de paginas fallaron: lo que quedo fue el proveedor o el plazo.
    return { code: new AiUnavailableError().code, reason: causaDe(error) };

**Es falso, y se demuestra en el mismo archivo.** `conDiagnostico()` (:77-87) captura el fallo de
`countPages` y de `renderPages` y **relanza un `Error` plano**, no un `DocumentosError`:

    throw new Error(diagnostico(operation, path, causaDe(error)));

Por tanto un PDF corrupto, o un fallo del rasterizador, **no** es «el esquema», **no** es «el tope
de paginas» y **no** es «el proveedor o el plazo»: cae por ese mismo `else` y sale etiquetado con
el codigo `ai_unavailable`. El propio test de R8 recorre ese camino —«si el convertidor lanza, el
fallo nombra la operacion y la ruta»— y **no comprueba el `code`**, que es justo por lo que nadie
lo vio.

Dos cosas mal, no una:

1. **El comentario.** `docs/conventions.md > Comentarios`: «Si el motivo no esta verificado, no se
   escribe. Un comentario con la razon equivocada es peor que ninguno: invita a romper lo que
   protege.» Es la misma clase de defecto que QC-68 cazo con el comentario del puerto.
2. **La consecuencia, que toca R10 de frente.** R10 pide un codigo «distinto del de una entrada
   invalida **y distinto del de un bug nuestro**, de modo que la pantalla y el registro puedan
   distinguir un corte del proveedor». Con este `else` general, un fallo de **nuestro** convertidor
   le dira a QC-107 «La lectura automatica no esta disponible en este momento» y al registro le
   dira «corte del proveedor». Es exactamente el matiz que la octava enmienda existe para dar, y
   este camino lo borra. La decision de implementacion 1 de la bitacora razona bien el caso
   simetrico —el tope de paginas va a entrada invalida para no convertir `ai_unavailable` en
   «fallo cualquiera»— y luego el `catch` general hace justo eso.

**Que falta para cumplirlo:** que el fallo del convertidor no se confunda con el del proveedor
—envolverlo en un `DocumentosError` con el codigo que le corresponda, o distinguir en `fallo()` el
error que viene de `countPages`/`renderPages` del que viene de `read`— y que el comentario diga lo
que el codigo hace de verdad. Y un test que fije el `code` de los dos caminos, no solo el `reason`.

### BLOQUEANTE 2 — Comentario de produccion nuevo que cita la ficha, y un test anadido en esta rama que lo obliga

`lib/modules/errores/domain/error-codes.ts`, dos lineas **anadidas por este diff**:

     * **Octava enmienda, el 2026-09-18 (QC-108)**: `ai_unavailable`.
     * Aprobada por el humano el 2026-09-18 en la puerta F1.4 de QC-108.

`docs/conventions.md > Comentarios`: «**Nunca se cita una ficha ni un requisito** en un comentario
de produccion: ni `QC-<n>`, ni `R<n>`, ni `design.md`, ni "decision cerrada". **Sin excepciones.**»
`lib/` es produccion por la definicion de esa misma seccion.

Agravante, y es lo que lo separa de un descuido: `tests/unit/errores/catalogo.test.ts:210-214`,
**anadido en esta rama**, exige literalmente la cita con dos `toContain`: uno sobre la cadena
«**Octava enmienda, el 2026-09-18 (QC-108)**» y otro sobre «Aprobada por el humano el 2026-09-18
en la puerta F1.4 de QC-108».

Es decir: la rama no solo incumple la regla, sino que **la clava con un test** para que nadie la
pueda limpiar sin ponerse en rojo. Y `tasks.md > T4` no pedia eso: pedia «la cabecera de
`error-codes.ts` con la **octava** enmienda», no la clave de la ficha. El propio encabezado de
`tasks.md` lo dice: «Comentarios del codigo: explican el porque, y **no citan fichas, requisitos ni
design.md**».

**No es hallazgo** la linea preexistente de la **sexta** enmienda con «(QC-81)»: el diff no la toca
y los comentarios preexistentes se limpian por modulo, en fichas del board.

**Que falta para cumplirlo:** quitar la clave de la ficha de esas dos lineas —la fecha y «aprobada
por el humano en F1.4» son el porque y pueden quedarse— y ajustar en consecuencia las dos
aserciones del test. Es un arreglo de tres lineas.

### m1 (menor) — R24: cuatro helpers privados nuevos en espanol

`lib/modules/documentos/domain/read-pdf-with-ai.ts`: `diagnostico`, `causaDe`, `conDiagnostico`,
`fallo`. R24 pide que **los simbolos que el sistema anada** esten en ingles.

Lo peso como menor, no como bloqueante, por tres razones y las digo para que no se lea como
indulgencia: son **privados** —nada de eso sale por el barril—; son **copia exacta** de los helpers
homonimos de `domain/convert-pdf.ts:81-111`, que QC-106 dejo mergeados en `dev` en el mismo modulo,
asi que renombrarlos aqui deja el modulo hablando dos idiomas; y todo lo publico, todos los nombres
de archivo y todas las constantes **si** estan en ingles. Es deuda de modulo, no invento de esta
ficha. Que quede anotado: **R24 no esta limpio**, y la ficha que limpie `documentos` tiene aqui
trabajo.

### m2 (menor) — Cuatro de las doce citas a `genai.d.ts` van una linea desplazadas

`Part.inlineData` esta en :12352 y no en :12351; `HttpOptions.timeout` en :8173 y no en :8172;
`createPartFromText` en :2928 y no en :2927; el docblock «can be used to include images...» en
:12351 y no en :12350. En los cuatro casos la linea citada es el docblock inmediato y **lo afirmado
es cierto**. No cambia ninguna conclusion de 8.3 ni el limite 2 del design, cuya cita (:5900-5905)
es literal y exacta.

### m3 (menor) — Comentarios de cabecera en tests que citan la ficha

`tests/unit/composition/documentos-facade.test.ts:1` («QC-108 T10 — ...»),
`tests/unit/documentos/module-contract.test.ts` (bloque «QC-108: la lectura de PDF con IA...»).
`docs/conventions.md` da a los tests **la misma regla para los comentarios** y abre la excepcion
solo para `R<n>` **en el nombre del caso**. Los nombres de los `describe`/`it` estan bien; los
comentarios de cabecera, no. Menor porque no son produccion y no afirman nada falso.

### m4 (menor) — El esquema recorta el prompt, y el test que dice «EXACTAMENTE el que entro» no lo detecta

`ai-read-input.ts:19` usa `z.string().trim()`, que **transforma**: lo que llega al proveedor es el
prompt recortado, no el que entro. R2 no prohibe normalizar, asi que **no es incumplimiento**. Pero
el caso «R2 — el prompt que recibe la IA es EXACTAMENTE el que entro, sin prefijos ni sufijos»
(`read-pdf-with-ai.test.ts:112`) usa un prompt sin espacios en los bordes y por eso pasa: el titulo
promete mas de lo que el caso prueba. O el caso cubre el prompt con espacios al borde y fija el
comportamiento, o el titulo se ajusta.

### m5 (menor) — Bloques de comentario largos en los archivos de produccion nuevos

`read-pdf-with-ai.ts:1-22` (22 lineas de cabecera, con la lista numerada del orden fijo que el
codigo ya dice), `ai-reader-genai.ts:13-28` (16), `limits.ts` (+14 lineas de docblock para una
constante), `ai-config-env.ts:1-11`. `docs/conventions.md`: «**Corto.** Un bloque de mas de ~5
lineas es senal de que ese porque pertenece al `design.md`» — y en este caso **ya esta** en el
design, secciones 1, 4 y 6. Ninguno afirma nada falso salvo el del BLOQUEANTE 1.

---

## Recuento de la primera vuelta

| Severidad | N.o |
|---|---|
| **BLOQUEANTE** | **2** |
| menor | 5 |

## Veredicto de la primera vuelta

**RECHAZADO.**

Se rechaza por los dos bloqueantes, no por el resto. Y conviene decir lo que hay debajo, porque el
trabajo es bueno: los 27 requisitos tienen test, los tests muerden de verdad —con anclas
anti-vacuidad, detectores probados contra si mismos y dobles que registran llamadas—, el plazo de
60 s se ejercita con reloj de pared real como testigo y sin dormir, ninguna prueba toca la red, las
capas estan limpias, las citas a la API del tercero son ciertas, el cableado son 13 lineas anadidas
y cero borradas con el bloque de QC-68 intacto, y el intocable `list-query-indexes.int.test.ts` ni
se roza. Nada de eso se toca al arreglar los dos hallazgos.

Vuelve al implementer con dos encargos concretos:

1. **`read-pdf-with-ai.ts:136`** — que el fallo del convertidor deje de salir como `ai_unavailable`
   y que el comentario diga lo que el codigo hace. Con test que fije el `code` de los dos caminos,
   no solo el `reason`.
2. **`error-codes.ts`** y las dos aserciones de `catalogo.test.ts:210-214` — fuera la clave de la
   ficha del comentario de produccion.

Los cinco menores no bloquean; m1 y m4 merecen quedar anotados aunque no se arreglen aqui.

---

# SEGUNDA VUELTA — 2026-09-18

> Tip **`4da3642`**, arbol limpio. Arreglos en `9f15b12`; `c561e10` es bitacora; `4da3642` es del
> leader y solo amplia `tests/baseline-rojos.json`.
> **No se rehace la revision.** Lo que la primera vuelta dio por bueno sigue en pie: ningun arreglo
> movio las citas al `.d.ts`, el plazo sin dormir, el cierre transitivo de capas, el «13 0» de
> `lib/composition/index.ts` ni el intocable de QC-68. El diff de la segunda vuelta toca tres
> archivos de produccion y cuatro de test, y nada mas.
>
> Verificacion propia: `typecheck` y `lint` verdes; 61 archivos de test, **757 casos** (tres mas
> que en la primera vuelta), 0 rojos. Y **seis mutaciones aplicadas a mano** sobre el codigo de
> produccion, corridas y deshechas, para no fiarme de que los tests nuevos muerdan.

## B1 — CERRADO, y arreglado en la causa

El arreglo no parchea el sintoma: `conDiagnostico` pasa de envolver todo en un `Error` plano a
recibir **el constructor del error que le corresponde a cada operacion**, asi que el `code` se
decide donde se sabe cual es la operacion, no en un `else` final que adivina. `UnexpectedError`
reutiliza el codigo `unexpected`, que ya estaba en el catalogo.

**Verificado que no queda ningun camino cruzado.** Lo compruebo rompiendo el codigo, no leyendolo:

| Mutacion aplicada a `read-pdf-with-ai.ts` | Que paso |
|---|---|
| `countPages` vuelve a senalar `AiUnavailableError` | **Rojo**: cae «R8, R10 — si countPages lanza, el code es unexpected y NO ai_unavailable» |
| `renderPages` vuelve a senalar `AiUnavailableError` | **Rojo**: cae «R8, R10 — si renderPages lanza, el code es unexpected y NO ai_unavailable» |
| El `read` deja de senalar `AiUnavailableError` | **Rojo, y cuadruple**: caen los tres casos de `ai-timeout.test.ts` (plazo vencido al instante, `TimeoutRunner` real y puerto que lanza) mas «R9, R10 — si el puerto de IA lanza, el code SI es ai_unavailable» |

**Los tres casos nuevos muerden de verdad**, y el del corte del proveedor esta ademas sostenido por
los tres del plazo. El reparto declarado se cumple en el codigo: `countPages`/`renderPages` dan
`unexpected`; el tope da `invalid_input` via `ValidationError`; `read` y el plazo agotado dan
`ai_unavailable`; el `else` de `fallo()` da `unexpected`. **R10 queda servido**: la pantalla de
QC-107 y el registro ya pueden distinguir un corte del proveedor de un bug nuestro, que es lo que
el bloqueante pedia.

Un matiz que no es hallazgo pero conviene que este escrito: `conDiagnostico` relanza **tal cual**
cualquier `DocumentosError`, asi que si algun dia un adaptador del puerto `AiReader` lanzara un
`DocumentosError` propio, un corte del proveedor podria salir con otro `code`. Hoy no ocurre
—`readWithGenai` lanza `Error` plano— y el puerto documenta «Lanza si no puede», sin prometer
clase. Queda dicho para quien escriba el segundo adaptador.

**No se colo ningun codigo nuevo.** El diff completo contra el merge-base anade a `ERROR_CODES`
**una sola** entrada, la de `ai_unavailable`. El codigo `unexpected` ya existia en la base
(`error-codes.ts:12` en `b8e3d5e`). La octava enmienda queda tal como se aprobo y no se amplia.

**`UnexpectedError` fuera del barril: decision correcta, no esconde nada.** El barril publica
`DocumentosError`, `UnauthorizedError`, `ValidationError` y `AiUnavailableError`, y la asimetria
tiene un porque real: esas se lanzan desde casos de uso que **propagan** hacia su Server Action, y
quien las recibe las reconoce por su clase. `UnexpectedError` solo vive dentro de `readPdfWithAi`,
que **nunca lanza**: convierte todo en el discriminado `AiReadResult`, donde el consumidor
discrimina por `code`, no por clase. Publicarla no daria a nadie nada que no tenga ya, y ensanchar
la lista curada que `module-contract.test.ts` congela por un simbolo que nadie puede usar seria
ruido. Ademas el `code` que emite **si** es publico y **si** esta en el catalogo cerrado, asi que
no hay nada oculto para la pantalla ni para el log.

## B2 — CERRADO, y la limpieza es completa sin vaciar el test

- Las dos lineas quedan sin clave de ficha y sin puerta: «**Octava enmienda, el 2026-09-18**:
  `ai_unavailable`. / Aprobada por el humano el 2026-09-18.» El porque —que es una enmienda, cuando
  y que la aprobo un humano— sobrevive; la historia de la ficha se va a `specs/` y a git, que es
  donde `docs/conventions.md` la manda.
- **Barrido de todo el diff contra el merge-base** sobre `lib/`, `app/`, `components/`, `hooks/`,
  `db/` y `middleware.ts` buscando `QC-<n>`, `R<n>`, `design.md` y «decision cerrada» en lineas
  anadidas: **ninguna**. La limpieza no dejo un resto en otro archivo.
- **Siguen mordiendo.** Borre de `error-codes.ts` las dos lineas de la octava enmienda y
  `catalogo.test.ts` cayo en «la cabecera de error-codes.ts redacta la octava enmienda con su fecha
  y su aprobacion». No se cambio una infraccion por un test vacio.
- **La linea preexistente de la sexta con «(QC-81)» esta intacta**, con su texto original. Correcto:
  el diff no la toca y esa limpieza es de una ficha de modulo, no de esta.

## Los menores

| # | Estado | Juicio |
|---|---|---|
| m2 | **ARREGLADO** | Reverificado por mi contra el `.d.ts`: :12352, :8173, :2928 y :12351 son **exactos**, y la bitacora ahora distingue el docblock de la declaracion en vez de fundirlos |
| m3 | **ARREGLADO** | Fuera «QC-108 T10» de `documentos-facade.test.ts:1` y la cita de ficha de la cabecera de bloque de `module-contract.test.ts`. Los nombres de los casos conservan `R<n>`, que es lo que la regla si permite y lo que sostiene la trazabilidad |
| m4 | **ARREGLADO, y mejor de lo que pedi** | El titulo ya no promete lo que no hace y el caso **pasa un prompt con espacios al borde**, asi que ahora **muerde**: si alguien quitara el recorte del esquema, el caso caeria. Antes el titulo mentia y el caso no probaba nada de eso |
| m1 | **RECHAZADO por el leader** | Ver abajo |
| m5 | **A MEDIAS** | Ver abajo |

### m1 — el rechazo fue correcto, y no invalida la cobertura de R24

Preguntas si fue mala decision. **No lo fue.** Renombrar `diagnostico`, `causaDe`, `conDiagnostico`
y `fallo` solo en el archivo nuevo dejaria a `documentos` con dos helpers homonimos en dos idiomas
—`convert-pdf.ts:81-111` ya los tiene en espanol y esta mergeado en `dev`—, y eso es peor que la
inconsistencia que arregla: quien lea el modulo tendria que preguntarse si `causaDe` y un
`causeOf` hacen lo mismo. La regla que se estaria sirviendo es de nombres; el precio, legibilidad
real.

**La cobertura de R24 no se invalida** porque la parte del requisito que puede romper algo esta
limpia y probada: no entra ningun identificador de base de datos (guardia con ancla), y **todo lo
publico** —nombres de archivo, la factory, el puerto, los tipos, las constantes— esta en ingles.
Lo que queda en espanol son **cuatro funciones privadas** que no cruzan el barril. R24 no queda
limpio, y sigue escrito como tal en este informe; **pero es deuda de modulo, con dueno claro: la
ficha que limpie `documentos` renombra los ocho a la vez.** El error seria dejar de anotarlo, no
dejar de arreglarlo hoy.

### m5 — se acepta a medias, y sigue abierto como deuda

El arreglo bueno es el que se hizo: la lista numerada de `read-pdf-with-ai.ts` **contaba el orden
que el codigo ya dice**, que es justo lo que `docs/conventions.md` prohibe, y ya no esta — la
cabecera pasa de 22 lineas a 13.

Las tres que se conservan **siguen sin pasar la regla de longitud**: `ai-reader-genai.ts` tiene un
docblock de 16 lineas, `ai-config-env.ts` 11, y `limits.ts` dedica 14 lineas de docblock a una
constante. La regla dice «un bloque de mas de ~5 lineas es senal de que ese porque pertenece al
`design.md`» — y en el caso de `ai-reader-genai.ts` **ya esta ahi**, en `design.md > 12`, y tambien
en la bitacora.

**No lo bloqueo, y digo por que para que no se lea como que cedo**: los tres explican porques
**ciertos y verificados** (abortar no cancela el cobro; la configuracion se lee por invocacion), y
eso es de otra especie que el comentario falso del bloqueante 1. Ademas la regla lleva una tilde de
aproximacion y no un limite duro. **Queda abierto como deuda de estilo**, no resuelto, para la
ficha de limpieza del modulo.

## Hallazgos nuevos de la segunda vuelta

Los dos salen de mutaciones que corri yo; ninguno cambia el comportamiento de hoy, que es correcto.

### m6 (menor) — el `code` del tope de paginas no lo fija ningun test, y es la misma clase de punto ciego que dejo entrar B1

Cambie el `ValidationError` del tope de paginas por un `AiUnavailableError` y **los 19 archivos de
`tests/unit/documentos/` siguieron verdes**: 231 casos, ninguno cayo. Es decir, el camino «PDF de
51 paginas» podria pasar manana a decirle al usuario «la lectura automatica no esta disponible» sin
que nada se entere.

Hoy el codigo es **correcto** —sale `invalid_input`— y ningun requisito se incumple: R5 solo exige
fallar sin renderizar y sin llamar al proveedor, y no fija el `code`. Por eso es menor y no
bloqueante. Pero es **exactamente el punto ciego que dejo pasar el bloqueante 1**: un camino cuyo
`code` nadie fija. El arreglo es una linea en el caso de las 51 paginas que ya existe: aserir que
el `code` es `invalid_input`. Con eso los cuatro caminos del reparto quedan clavados y R10 deja de
tener flancos.

### m7 (menor) — el comentario nuevo de `conDiagnostico` nombra un caso que no pasa por ahi

`read-pdf-with-ai.ts:64-70` dice: «Un `DocumentosError` que ya venia de mas adentro (**el tope de
paginas**) se relanza TAL CUAL». El tope de paginas **no pasa por `conDiagnostico`**: su
`ValidationError` se lanza en `buildImageParts`, **entre** las dos llamadas a `conDiagnostico`, no
dentro de ninguna. Lo confirme borrando entera la linea que relanza el `DocumentosError`:
**22 archivos de test siguieron verdes**, 257 casos, ninguno cayo — la rama es defensiva y hoy
inalcanzable.

Lo dejo en **menor y no repito el bloqueante**, y el criterio importa: en la primera vuelta el
comentario falso describia **un comportamiento real y equivocado** que mandaba un fallo nuestro al
usuario como corte del proveedor. Este solo se equivoca al **ejemplificar** que llega a una rama
defensiva sin consecuencia en tiempo de ejecucion. Aun asi es un motivo no verificado escrito en
produccion, que es lo que `docs/conventions.md` desaconseja: o se quita el parentesis, o se guarda
la rama con el caso que de verdad la justifique.

## Recuento de la segunda vuelta

| Severidad | N.o |
|---|---|
| **BLOQUEANTE** | **0** |
| menor nuevo | 2 (m6, m7) |
| menor heredado sin cerrar | 2 (m1 por decision del leader, m5 a medias) |

## VEREDICTO FINAL

**OK — APROBADA.**

Los dos bloqueantes estan cerrados, y cerrados donde tocaba: B1 en la causa —el `code` lo decide
quien sabe que operacion fallo, no un `else` que adivina—, con tres casos nuevos que **compruebo
que muerden**, y B2 sin vaciar el test que lo vigilaba. No se colo ningun codigo al catalogo, la
octava enmienda queda como se aprobo, y `UnexpectedError` se queda fuera del barril por una razon
que se sostiene: nunca sale del modulo.

Quedan cuatro menores, ninguno bloquea y los cuatro tienen dueno escrito: **m6** —una linea, y es
el flanco que dejo entrar el bloqueante 1, asi que es el que recomiendo cerrar antes del PR aunque
no lo exija—, **m7**, y **m1** y **m5** como deuda de la ficha que limpie el modulo `documentos`.

Fuera de alcance y no computa: el rojo de `qc75-convenciones.test.ts`, en
`tests/baseline-rojos.json` desde el 2026-09-11 y tolerado por el gate completo. El intermitente
`user-table.test.tsx` **no me aparecio** en ninguna de mis corridas; QC-108 no toca UI y no hay
nada en su diff que pueda alcanzarlo.

**El gate completo (`./init.sh`) lo corre el leader**, y con el la comprobacion final antes del PR.
