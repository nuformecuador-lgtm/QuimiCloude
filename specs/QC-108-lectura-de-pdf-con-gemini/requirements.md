# QC-108 — lectura-de-pdf-con-gemini · requirements.md

> **Zona** `backend` · **Complejidad** `high` · **depends_on** `QC-106` · **Rama**
> `feature/QC-108-lectura-de-pdf-con-gemini`
>
> **Alcance.** Leer un PDF con **Google Gemini Flash**, detrás de un **puerto** del módulo
> `documentos`, recibiendo un **prompt personalizado** de quien llama. **Dos modos de lectura**: el
> PDF tal cual, o sus páginas ya convertidas a imagen, **reutilizando el `PdfConverter` que QC-106
> ya construyó** — la conversión no se re-implementa. Devuelve **el texto que la IA escribió, tal
> cual**. Es una **capacidad interna**: no añade pantalla, ni ruta, ni Server Action; la ejecutará
> por dentro el trabajo de la cola (**QC-111**).
>
> **Lo que NO entra.** La estrategia catálogo/fórmula y sus archivos de prompt → **QC-109**. La
> detección de coordenadas, el recorte y la subida de imágenes → **QC-110**. La cola, el estado por
> archivo y **los reintentos** → **QC-111**. La pantalla → **QC-107**.
>
> Sembrado por `/afinar-feature` el 2026-09-18. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

Notación EARS (`docs/specs.md`). **«El sistema»** aquí es el módulo **`documentos`** —que **ya
existe** desde QC-106: su dominio, sus puertos y sus adaptadores driven— **más su cableado en
`lib/composition`**. No hay modelo de datos que especificar: esta ficha **no toca `db/schema.prisma`**,
no crea migración y no añade `down.sql` (D10).

Las decisiones cerradas se citan como **`[D1]`…`[D12]`**, en el orden en que están escritas en
`## Decisiones cerradas (no reabrir)`. **Son DOCE filas**, aunque el encargo hablara de once: se
numeran por fila para que ninguna se quede sin requisito, igual que hizo QC-106 con su desajuste
17/18. El desajuste se anota, no se resuelve por cuenta propia (regla 6 de `CLAUDE.md`), y la tabla
no se toca.

La **operación** a la que se refieren todos los requisitos es **una sola**: *leer un PDF con la IA,
con un prompt dado y en uno de los dos modos*. Esta ficha no la invoca desde ninguna parte: la
publica como capacidad y la consumirá **QC-111**.

### La capacidad, su forma y sus dos modos

**R1.** El sistema DEBE publicar la lectura de un PDF con la IA como capacidad del módulo
`documentos` **detrás de un puerto**, implementado por un adaptador driven; el caso de uso y el
dominio NO DEBEN conocer la librería concreta ni el nombre del proveedor. `[D8]`

**R2.** El sistema DEBE recibir el **prompt** por parámetro en cada lectura, de quien la pide, y NO
DEBE llevar ningún texto de prompt escrito en su código ni leerlo de ningún archivo de prompt —eso es
**QC-109**—; SI el prompt llega ausente o en blanco, ENTONCES la lectura DEBE rechazarse **sin llamar
al proveedor**.

**R3.** CUANDO se pide una lectura, el sistema DEBE admitir **exactamente dos modos** —el PDF tal
cual, o sus páginas ya convertidas a imagen— y NO DEBE ofrecer ningún tercer modo; SI llega un modo
que no es uno de los dos, ENTONCES la lectura DEBE rechazarse **sin llamar al proveedor**. `[D11]`

**R4.** CUANDO la lectura se pide en **modo imagen**, el sistema DEBE obtener las páginas invocando
el **`PdfConverter` que QC-106 ya dejó montado** —contar páginas y renderizar a la resolución única
del módulo—, y NO DEBE implementar ninguna conversión propia, NO DEBE añadir, renombrar ni cambiar
ningún método de ese puerto y NO DEBE modificar su adaptador. `[D11]`

**R5.** SI en modo imagen el PDF supera el **tope de páginas** ya declarado por el módulo, ENTONCES
la lectura DEBE fallar **sin renderizar ninguna página y sin llamar al proveedor**; y el sistema NO
DEBE volver a escribir ese tope, ni el de tamaño, ni la resolución: los **importa** de su definición
única y no los duplica en ningún archivo nuevo. `[D11]`

**R6.** CUANDO el proveedor responde, el sistema DEBE devolver **el texto tal cual lo escribió la
IA** —sin recortarlo, reordenarlo, interpretarlo ni convertirlo en ninguna estructura— y NO DEBE
devolver ningún dato derivado de ese texto. `[D3]`

### El plazo, el fallo y los reintentos

**R7.** El sistema DEBE imponer un **plazo máximo de 60 segundos** a cada lectura, y ese plazo DEBE
estar escrito en **una sola definición** del módulo, no repetido en cada sitio que lo use. `[D1]`

**R8.** SI el plazo se agota, o el proveedor no responde o falla, ENTONCES la lectura DEBE fallar
**para ese archivo**, DEBE devolver el fallo a quien la pidió y NO DEBE afectar, revertir ni impedir
la lectura de ningún otro archivo; el fallo NO DEBE descartarse en un `catch` vacío ni en silencio, y
DEBE viajar diciendo qué operación falló y sobre qué ruta. `[D1]`

**R9.** El sistema NO DEBE reintentar ninguna lectura: ante un fallo o un plazo agotado DEBE haber
hecho **exactamente una** llamada al proveedor y devolver el fallo. Los reintentos son de **QC-111**.
`[D1]`

**R10.** CUANDO una lectura falla porque el proveedor no respondió, no estaba disponible o agotó el
plazo, el sistema DEBE señalarlo con un **código de error estable propio**, distinto del de una
entrada inválida y distinto del de un bug nuestro, de modo que la pantalla y el registro puedan
distinguir un corte del proveedor; ese código es **`ai_unavailable`**. `[D2]`

**R11.** SI se incorpora `ai_unavailable`, ENTONCES DEBE quedar declarado en **los dos archivos** del
catálogo cerrado —la lista de códigos y el catálogo de mensajes—, con un texto propio **distinto del
de todos los demás códigos**, y el sistema NO DEBE renombrar, retirar ni reordenar ningún código ya
existente. `[D2]`

**R12.** SI la enmienda de R11 **no se aprueba** en F1.4, ENTONCES el fallo de R10 DEBE señalarse con
el código `unexpected` del catálogo vigente y DEBE quedar escrito que se pierde el matiz; en ningún
caso el sistema DEBE emitir un código que no esté en el catálogo cerrado. `[D2]`

### Configuración: la clave y el modelo

**R13.** El sistema DEBE resolver la credencial del proveedor por **una sola variable de entorno del
despliegue**, DEBE leerla **en el momento de la invocación** —nunca al importar el módulo, de modo que
importar el adaptador sin invocarlo no falle—, DEBE declararla **vacía y documentada** en
`.env.example` y NO DEBE incluir su valor escrito en el código ni en ningún archivo versionado.
`[D4]`

**R14.** El sistema NO DEBE admitir ninguna credencial **por empresa**: no crea tabla, ni columna de
empresa, ni cifrado de credencial guardada, ni pantalla para cargarla. `[D4]`

**R15.** El sistema DEBE resolver **el nombre del modelo** por variable de entorno, leída con el
mismo criterio de R13, y NO DEBE llevarlo escrito en el código. `[D6]`

**R16.** SI la variable del modelo falta o está vacía, ENTONCES la lectura DEBE fallar con un error
**explícito que nombre la variable ausente**, NO DEBE caer a ningún modelo por defecto, NO DEBE
continuar de forma degradada y NO DEBE incluir en el mensaje ningún valor de configuración. `[D6]`

### Capacidad interna: ni ruta, ni permiso, ni pantalla

**R17.** El sistema NO DEBE exponer esta capacidad como Server Action, Route Handler, ruta ni
pantalla: esta ficha NO DEBE añadir ningún archivo bajo `app/**`, `components/**` ni `app/api/**`, ni
ningún adaptador driving nuevo. La invoca por dentro el trabajo de la cola (**QC-111**). `[D5]`

**R18.** El sistema NO DEBE comprobar ningún permiso en la lectura ni añadir ninguna entrada al
catálogo cerrado de quince permisos de `identity`, y NO DEBE crear migración ni seed de permisos: el
corte por permiso lo hizo la emisión de enlaces de subida de QC-106. `[D5]`

**R19.** Esta feature NO DEBE aportar ningún recorrido navegable que un test E2E pueda visitar, por
lo que su verificación DEBE ser **unitaria** y el E2E queda **diferido con motivo** a **QC-107**.
`[D5]`

**R20.** El sistema NO DEBE crear, leer ni escribir ninguna fila de base de datos, NO DEBE añadir
ningún modelo a `db/schema.prisma`, ninguna migración y ningún `down.sql`. `[D10]`

### Capas, borde, dependencia y aislamiento del tercero

**R21.** El sistema DEBE atar el puerto nuevo a su adaptador **solo** en `lib/composition`; el
`domain/` y los `ports/` de `documentos` NO DEBEN importar `@google/genai`, `next/*`,
`@prisma/client`, `lib/shared/**` ni `lib/composition`. `[D8]` `[D12]`

**R22.** El adaptador driven DEBE ser el **único** archivo de producción del repositorio que importa
`@google/genai`; y construir la fachada del módulo en el punto de composición NO DEBE leer ninguna
variable de entorno ni tocar la red. `[D7]` `[D8]`

**R23.** El sistema DEBE validar con un **esquema** la entrada de la lectura —prompt y modo— antes de
tocar ningún puerto, y NO DEBE dejar que ningún dato sin validar ni tipar cruce hacia el adaptador ni
hacia el proveedor. `[D12]`

**R24.** Los nombres de archivo y los símbolos que el sistema añada DEBEN estar en **inglés** y seguir
las convenciones del repositorio; y NO DEBE introducir ningún identificador de base de datos, porque
no crea ninguna tabla. `[D12]`

**R25.** El sistema DEBE resolver la conversación con el proveedor con **`@google/genai`**, y NINGUNA
dependencia nueva DEBE quedar instalada ni escrita en `package.json` **antes** de la aprobación
humana y de su fila en `docs/dependencias.md`; NO DEBE incorporar ninguna dependencia con licencia
fuera de MIT, Apache-2.0, BSD o ISC. `[D7]`

### Verificación sin red

**R26.** La verificación de esta feature DEBE poder ejecutarse **sin red y sin claves**: el puerto se
sustituye por un doble, NINGÚN test DEBE llamar a Gemini ni a la red, y ningún test DEBE depender de
que las variables de entorno del proveedor tengan valor. `[D9]`

**R27.** El plazo de R7 DEBE poder ejercitarse en la suite **sin esperar 60 segundos reales**: el
mecanismo que cuenta el tiempo DEBE ser sustituible desde el test, y NO DEBE existir ningún test que
duerma el plazo de verdad. `[D1]` `[D9]`

### Cobertura de las decisiones cerradas

Cada fila de `## Decisiones cerradas (no reabrir)`, **en el orden en que está escrita**, con el
requisito que la hace testeable. Ninguna queda sin `R<n>`.

| # | Decisión cerrada | Requisito(s) |
| --- | --- | --- |
| D1 | **60 s** por lectura en una sola definición; falla ese archivo; **cero reintentos** aquí | R7, R8, R9, R27 |
| D2 | Código **NUEVO `ai_unavailable`**, octava enmienda; plan B a `unexpected` si no se aprueba | R10, R11, R12 |
| D3 | Devuelve **texto plano**, tal cual lo escribió la IA | R6 |
| D4 | **UNA sola clave** del despliegue, por entorno, declarada vacía y leída en la invocación; **sin clave por empresa** | R13, R14 |
| D5 | **Capacidad interna**: sin acción, ruta ni pantalla; el permiso lo corta QC-106; **E2E diferido con motivo** | R17, R18, R19 |
| D6 | El **nombre del modelo** en variable de entorno, **obligatoria**, sin modelo por defecto | R15, R16 |
| D7 | La librería es **`@google/genai`**; fila y aprobación en F1.4; nada se instala antes | R22, R25 |
| D8 | Módulo **`documentos`**: puerto nuevo + adaptador driven; cableado solo en `lib/composition` | R1, R21, R22 |
| D9 | **Se verifica sin red**, y es obligatorio: el puerto se sustituye por un doble | R26, R27 |
| D10 | **Ninguna fila** en la base, sin modelo, sin migración y sin `down.sql` | R20 |
| D11 | **No se re-implementa la conversión**: se reutiliza el `PdfConverter` de QC-106 con sus límites | R3, R4, R5 |
| D12 | Capas, borde e identificadores: esquema en el borde, identificadores en inglés, cableado en `lib/composition` | R21, R23, R24 |

Requisitos que **no** salen de una fila de la tabla, y de dónde salen:

- **R2** del bloque de **Alcance** («recibiendo un **prompt personalizado** de quien llama»): la
  tabla no dice de dónde viene el prompt, y sin este requisito nada impide que el texto acabe escrito
  dentro del módulo, que es justo lo que pertenece a QC-109.
- **R3** del bloque de **Alcance** («**Dos modos de lectura**») además de D11: D11 solo cierra que la
  conversión no se re-implementa, no que los modos sean exactamente dos.
- **R5** además de D11, de `CHECKPOINTS.md > Configuracion` y del anti-patrón de
  `docs/architecture.md` sobre valores repetidos entre archivos: D11 fija los límites, pero no dice
  que sigan viviendo en una sola definición cuando un archivo nuevo los use.
- **R23** y **R24** se apoyan en D12 y en `docs/conventions.md` (validación en el borde, nombres);
  D12 es una fila de una línea y la convención es la que da el detalle testeable.
- **R26** y **R27** además de D9, de `docs/verification.md` —la suite corre **sin red**— y de
  `CLAUDE.md > regla 5`: un plazo de 60 s probado durmiendo de verdad convertiría el gate en una sala
  de espera, así que el mecanismo tiene que ser sustituible.

## Preguntas abiertas

No se rellenan con supuestos (regla 6 de `CLAUDE.md`). **Ninguna de las tres bloquea el alcance.**

1. **QC-110 y las coordenadas.** Con D3 el retorno es texto plano, así que sacar de ahí las
   coordenadas de una imagen obliga a interpretar texto libre o a **ampliar este puerto** más
   adelante. No se decide aquí: **QC-110 ya tiene declarado abierto «formato de las coordenadas»** y
   es donde toca cerrarlo. Se escribe para que quien acote QC-110 llegue sabiendo que esta ficha le
   entrega texto y no una estructura.
2. **Nadie valida lo que la IA contesta.** Si Gemini devuelve un texto plausible pero inventado
   —un precio que no está en el catálogo—, ningún requisito de esta ficha lo detecta: el puerto
   devuelve lo que le den. Ninguna ficha de la épica QC-105 cubre hoy la verificación del contenido.
3. **El gasto no se mide.** No hay tope de llamadas ni alerta de coste, ni global ni por empresa.
   Con el límite heredado de 50 páginas por PDF y 10 PDFs por tanda, una sola tanda en modo imagen
   son hasta 500 llamadas. Queda fuera de alcance y **sin ficha**.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
| --- | --- | --- |
| 2026-09-18 | ¿Qué pasa si Gemini no responde o tarda? | **Plazo máximo de 60 s por lectura**, escrito en **una sola definición** del módulo. Al agotarse, la lectura falla para **ese** archivo y devuelve el fallo a quien la pidió. **Cero reintentos aquí**: los reintentos son de **QC-111**, que ya los tiene declarados como pregunta abierta suya. Motivo dicho entero: dos capas reintentando lo mismo multiplican el gasto en silencio — un catálogo de 50 páginas reintentado 3 veces en dos capas son 450 llamadas que nadie pidió |
| 2026-09-18 | ¿Cómo se llama ese fallo? | **Código de error NUEVO `ai_unavailable`**, que sería la **OCTAVA enmienda** al catálogo cerrado de `lib/modules/errores` (QC-92 está pidiendo la séptima). Permite que la pantalla de QC-107 diga «la lectura automática no está disponible» en vez del mensaje neutro de un bug, y que el log distinga un corte del proveedor de un fallo nuestro. **La aprueba el humano en F1.4**, y el `design.md` debe llevar el **plan B escrito**: si no se aprueba, el fallo cae a `unexpected` y la pantalla pierde ese matiz |
| 2026-09-18 | ¿En qué forma devuelve lo que Gemini contesta? | **Texto plano**, tal cual lo escribió la IA. Interpretarlo es de quien lo pide. Es lo único que **QC-109** necesita hoy: su ficha dice que «el retorno, por ahora, es solo un `console.log` con el resultado». Se descartó a sabiendas admitir respuesta estructurada; la consecuencia está escrita en la pregunta abierta 1 |
| 2026-09-18 | ¿Dónde vive la clave de Gemini? | **UNA SOLA clave del despliegue**, por variable de entorno. **Declarada vacía y documentada** en `.env.example`, y **leída en el momento de la invocación**, nunca al importar el módulo — de modo que importar el adaptador sin invocarlo no falle. Heredado de **QC-106 D15**. **No hay clave por empresa**: eso exigiría tabla nueva con columna de empresa, cifrado de la clave guardada y pantalla para cargarla, y nada de eso está en la épica hoy |
| 2026-09-18 | ¿Quién puede disparar una lectura? | **Capacidad interna.** Sin Server Action, sin Route Handler, sin ruta y sin pantalla: la ejecuta el trabajo de la cola (**QC-111**) por dentro, igual que la conversión de QC-106. **El permiso lo corta quien sube el PDF**, donde QC-106 ya valida Administrador en el service; esta ficha no vuelve a cortarlo ni añade permiso al catálogo cerrado de quince. **Consecuencia aceptada: E2E diferido con motivo** — no añade ningún recorrido navegable que un test pueda visitar, así que la verificación es unitaria. Mismo criterio que **QC-106 D17** |
| 2026-09-18 | «Gemini Flash» es una familia, no una versión. ¿Cuál se usa? | **El nombre del modelo vive en una VARIABLE DE ENTORNO**, no escrito en el código. **Es obligatoria**: si falta, la lectura **falla con un error explícito** y **NO cae a un modelo por defecto**. Decisión textual del humano («via .env»), y el fallo cerrado sigue el precedente de `SESSION_SECRET`, que no se degrada cuando falta. El arnés ya pagó caro lo contrario: un id de modelo escrito a mano dejó de existir y mató a un `backend_dev` al arrancar, en silencio (`AGENTS.md > Modelos`) |
| 2026-09-18 | ¿Qué librería habla con Gemini? | **`@google/genai`**. **Los cuatro checks, corridos contra npm el 2026-09-18 y los cuatro limpios**: sin `deprecated`; **2.23.0** publicada el **2026-09-16**; licencia **Apache-2.0**; **22.124.413** descargas semanales. **La fila en `docs/dependencias.md` y la aprobación humana van en F1.4**, como QC-25, QC-28 y QC-106: **nada se instala antes** (regla 7 de `CLAUDE.md`) |
| 2026-09-18 | ¿Dónde vive este código? | Módulo **`documentos`**, que **ya existe** desde QC-106. **Puerto nuevo + adaptador driven**; el `domain/` y los `ports/` **no** importan `@google/genai`, `next/*` ni `@prisma/client`; el cableado puerto → adaptador vive **solo** en `lib/composition`. Heredado de **QC-106 D13 y D14** |
| 2026-09-18 | ¿Se puede verificar sin red? | **Sí, y es obligatorio.** El puerto se sustituye por un doble en los tests; **ningún test llama a Gemini ni a la red**, ni depende de que las variables de entorno tengan valor. Es condición para que `./init.sh` siga corriendo sin red. Heredado de **QC-106 D14** y de `docs/verification.md` |
| 2026-09-18 | ¿Deja alguna fila en la base? | **No, ninguna.** Sin modelo en `db/schema.prisma`, sin migración y sin `down.sql`. El estado por archivo es de **QC-111**. Heredado de **QC-106 D5** |
| 2026-09-18 | ¿Se re-implementa la conversión a imagen? | **No.** El modo imagen **reutiliza el `PdfConverter` que QC-106 ya dejó montado** —`countPages`, `extractText`, `renderPages(pdf, dpi)`, con PNG a 150 DPI—, y con él sus límites heredados de 20 MB y 50 páginas por PDF. Esta ficha **no toca** ese puerto ni su adaptador |
| 2026-09-18 | Capas, borde e identificadores | Validación de entrada con **zod** en el borde (`docs/conventions.md`). Identificadores en **inglés** (**QC-4**). Heredado de **QC-106 D18** |
