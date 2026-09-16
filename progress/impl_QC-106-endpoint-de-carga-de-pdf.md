# QC-106 — endpoint-de-carga-de-pdf · bitacora de implementacion

> Fase 2, implementada dentro del worktree `.worktrees/QC-106-endpoint-de-carga-de-pdf`
> sobre la rama `feature/QC-106-endpoint-de-carga-de-pdf`.
> Spec aprobado por el humano en F1.4 el 2026-09-16.

## T0 — las dos respuestas de la puerta F1.4

Las dos llegaron **aprobadas** con el spec. Se escriben aqui porque T1 no se cierra sin la
segunda y T8 no se abre sin la primera.

### T0.1 — la dependencia: **SI**

`unpdf` y `@napi-rs/canvas`, aprobadas por el humano, con sus filas **ya escritas** en
`docs/dependencias.md` por el commit anterior a esta implementacion.

Instaladas en las versiones exactas de la aprobacion:

```
+ unpdf 1.8.1
+ @napi-rs/canvas 1.0.9
```

**Condicion de la aprobacion, tal como la escribe la fila**: las dos quedan **aisladas en un
solo archivo**, `pdf-converter-unpdf.ts`, detras del puerto de conversion. Ningun otro archivo
del repositorio puede importarlas. Ninguna otra dependencia se instalo.

**Hallazgo que conviene no repetir.** Las filas del registro estaban escritas y los paquetes no
estaban instalados, y eso dejaba `tests/guards/guard-dependencias-aprobadas.test.ts` **en rojo
antes de escribir una sola linea de la feature**. La guardia es **bidireccional**: su segundo
caso, «el registro no lista paquetes que ya no estan instalados», recoge las filas del registro
que no aparecen en `package.json`. Escribir la fila y no instalar deja el gate rojo igual que
instalar sin fila. Verificado en verde tras la instalacion:

```
RUN  v4.1.10
Test Files  1 passed (1)
     Tests  2 passed (2)
```

### T0.2 — el permiso exigido: **`proveedores.modificar`**

Decision humana cerrada. Verificada en disco antes de implementar, en
`lib/modules/identity/domain/permissions.ts`:

- **Existe** en el catalogo cerrado de quince permisos. No nace ningun `documentos.*`, no hay
  migracion, ni seed, ni guardia de permisos que tocar.
- En `SEED_ROLE_PERMISSIONS` lo tiene **unicamente el Administrador**. El Operador nace con dos
  permisos, `inventario.consultar` y `asignaciones.consultar`, y ese no esta entre ellos.
- Se valida **en el service**, como primer paso, antes de `zod` y antes de tocar ningun puerto.
  **No se compara el nombre del rol** (prohibido desde QC-74).

### Lo demas que T0 manda anotar

- **Enmienda a `docs/dependencias.md`**: la fila de `@supabase/storage-js` ya quedo enmendada por
  el leader. Decia «lo consume **un solo archivo**» y ahora declara **dos**, los dos detras de un
  puerto: el de `recetas` (bucket publico de imagenes) y el de `documentos` (bucket privado de
  PDFs con enlaces firmados). No es dependencia nueva y no hay cuatro checks que rehacer.
- **`documentos` en `BUSINESS_MODULES` de `guard-autorizacion-por-permiso.test.ts`**: **no** entra
  en esta ficha. Es tocar la guardia de otra, y `design.md > 12` lo dejo propuesto para que lo
  decida el humano en ficha propia.

## Archivos creados y modificados

**Produccion, nuevos (15), todos bajo el modulo nuevo `documentos`:**

```
lib/modules/documentos/index.ts
lib/modules/documentos/domain/actor.ts
lib/modules/documentos/domain/errors.ts
lib/modules/documentos/domain/limits.ts
lib/modules/documentos/domain/pdf-content.ts
lib/modules/documentos/domain/document-path.ts
lib/modules/documentos/domain/upload-input.ts
lib/modules/documentos/domain/issue-upload-links.ts
lib/modules/documentos/domain/convert-pdf.ts
lib/modules/documentos/ports/document-storage.ts
lib/modules/documentos/ports/pdf-converter.ts
lib/modules/documentos/adapters/driven/config/document-storage-config-env.ts
lib/modules/documentos/adapters/driven/storage/document-storage-supabase.ts
lib/modules/documentos/adapters/driven/pdf/pdf-converter-unpdf.ts
lib/modules/documentos/adapters/driving/document-upload-actions.ts
```

**Modificados (4):** `lib/composition/index.ts` (bloque nuevo al final, +80 lineas, 0 borradas),
`.env.example` (bloque nuevo al final, +18), `package.json` y `pnpm-lock.yaml` (las dos
dependencias aprobadas).

**Tests, nuevos (10 archivos, 145 casos):**

```
tests/unit/documentos/authorization.test.ts
tests/unit/documentos/module-contract.test.ts
tests/unit/documentos/limits-and-path.test.ts
tests/unit/documentos/upload-input.test.ts
tests/unit/documentos/issue-upload-links.test.ts
tests/unit/documentos/convert-pdf.test.ts
tests/unit/documentos/storage-config.test.ts
tests/unit/documentos/pdf-converter.test.ts
tests/unit/documentos/document-upload-actions.test.ts
tests/unit/documentos/qc106-alcance.test.ts
```

**Lo que toco despues la enmienda D19** (5 de produccion + 5 de test, ninguno nuevo):
`domain/limits.ts`, `ports/document-storage.ts`, `domain/issue-upload-links.ts`,
`adapters/driven/storage/document-storage-supabase.ts`, `index.ts`, y los tests
`issue-upload-links`, `limits-and-path`, `module-contract`, `authorization` y `storage-config`.
Los dos cambios de contrato:

| Constante | Valor | Quien lo impone |
| --- | --- | --- |
| `READ_LINK_TTL_SECONDS` | `15 * 60` | **Este modulo.** Es el antiguo `UPLOAD_LINK_TTL_SECONDS`, renombrado para que diga de quien es. Viaja de verdad: `createSignedReadUrl(path, expiresInSeconds)` lo conserva y el servicio lo aplica |
| `PROVIDER_UPLOAD_LINK_TTL_SECONDS` | `2 * 60 * 60` | **El proveedor.** Su docblock dice que este modulo NO lo elige y NO lo promete, y que se declara solo para poder informar cuando muere el enlace |

Y `DocumentStorage.createSignedUpload(path)` **pierde el parametro `expiresInSeconds`**: un puerto
que pide un plazo que nadie puede honrar es una mentira en el contrato. `createSignedReadUrl` lo
conserva, porque ahi si se cumple. `lib/composition/index.ts` **no hizo falta tocarlo**: el tipo
del puerto acepta la funcion con un parametro menos.

**Intactos a proposito, y una guardia de esta ficha lo afirma contra el diff:**
`db/schema.prisma`, `db/migrations/**`, `app/**` (incluido `app/api/`), `components/**`,
`e2e/**`, `lib/modules/errores/**`, `lib/modules/identity/domain/permissions.ts`,
`lib/modules/recetas/**`.

## Mapa `R<n>` -> test

Los 34, sin ninguno huerfano. Tres llevan un limite declarado (R10, R18, R22); se dice en la fila
en vez de disimularlo.

| R | Archivo | Test |
| --- | --- | --- |
| R1 | `authorization.test.ts` | «R1 — el actor entra por parametro y trae la empresa junto con los permisos»; «R1 — el dominio no lee la sesion, ni una cookie, ni una cabecera» |
| R2 | `authorization.test.ts` | «R2, R3 — <6 actores>: rechaza con el codigo 'unauthorized'»; «R2 — el actor con el codigo exigido pasa»; «R2 — un codigo del mismo modulo pero de lectura no concede la escritura»; «R2 — no hay normalizacion, coincidencia parcial ni comodines» |
| R3 | `authorization.test.ts` | La misma matriz parametrizada: nulo, ausente, sin `permissions`, lista vacia, valor que no es lista |
| R4 | `authorization.test.ts` | «R4 — el codigo exigido YA EXISTE en el catalogo: no se amplia nada»; «R4 — en el sembrado vigente lo tiene el administrador y NO el operador, leido del contrato»; «R4 — el codigo del permiso se escribe UNA sola vez en todo el modulo» |
| R5 | `authorization.test.ts` | «R2, R5 — <actor>: no se llama a NINGUN metodo de NINGUN puerto» |
| R6 | `issue-upload-links.test.ts` | «tres archivos dan tres entradas, cada una con su ruta y su enlace firmado»; «un actor sin el permiso recibe `unauthorized` y el puerto no se llama NI UNA vez» |
| R7 | `issue-upload-links.test.ts` | «los BYTES no tienen por donde entrar: una tanda que los traiga se rechaza y nada se sube» |
| R8 | `upload-input.test.ts`, `issue-upload-links.test.ts` | «R8 — una tanda con un archivo de mas se rechaza ENTERA»; «once archivos: `invalid_input` y CERO enlaces firmados, ni siquiera los diez primeros» |
| R9 | `upload-input.test.ts`, `issue-upload-links.test.ts` | «R9 — una tanda sin ningun archivo se rechaza»; «una tanda vacia se rechaza con `invalid_input` y no llama al almacenamiento» |
| R10 | `issue-upload-links.test.ts`, `limits-and-path.test.ts` | **Subida (plazo del proveedor):** «R10 — la caducidad es la emision mas las DOS HORAS del proveedor, con el reloj inyectado»; «R10 — la SUBIDA no promete los quince minutos: ese plazo es el de LECTURA y aqui no se usa»; «R10 — al puerto NO se le pasa ningun plazo: quien lo impone es el proveedor»; «R10 — toda la tanda caduca a la vez aunque el reloj avance entre firma y firma». **Lectura (plazo nuestro):** «R10 — el plazo de LECTURA lo fija este modulo: quince minutos, y el puerto SI los pide»; «R10 — el plazo de SUBIDA lo impone el PROVEEDOR: dos horas, y el puerto NO las pide»; «R10 — el docblock del plazo de subida dice que el modulo NO lo elige y NO lo promete». **Reescrito por la enmienda D19; ya no queda limite abierto** |
| R11 | `storage-config.test.ts` | «R11, R32 — con las tres presentes resuelve el bucket PROPIO de los documentos, no el de las imagenes»; «R11, R32 — la direccion y la credencial se REUTILIZAN: no nace ninguna variable duplicada» |
| R12 | `limits-and-path.test.ts`, `issue-upload-links.test.ts` | «R12 — `empresa-A2/x.pdf` NO pasa como ruta de `empresa-A`»; «R12 — la travesia de directorios y la carpeta sola tampoco pasan»; «cada ruta cae bajo el prefijo de LA EMPRESA DEL ACTOR»; «dos actores de empresas distintas con la MISMA entrada caen en prefijos distintos» |
| R13 | `issue-upload-links.test.ts` | «la salida son rutas y enlaces: ninguna URL de lectura y ninguna conversion» |
| R14 | `issue-upload-links.test.ts`, `qc106-alcance.test.ts` | «no se escribe ni se lee ninguna fila: el caso de uso no tiene por donde»; «R14: el diff de la rama no trae ningun archivo bajo `db/`» |
| R15 | `issue-upload-links.test.ts` | «la salida son rutas y enlaces: ninguna URL de lectura y ninguna conversion» |
| R16 | `upload-input.test.ts`, `document-upload-actions.test.ts` | Los ocho casos del esquema; «R16 — al caso de uso cruza el valor YA VALIDADO por el esquema del contrato»; «R16 — %s: 'invalid_input' y el almacenamiento NO se toca» (8 entradas invalidas) |
| R17 | `limits-and-path.test.ts`, `convert-pdf.test.ts` | «R17 — un PNG, un texto plano y un archivo vacio son invalidos aunque se llamen `.pdf`»; «unos bytes que no son PDF se rechazan ANTES de llamar a `countPages`» |
| **R18** | `limits-and-path.test.ts` | «R18 — el docblock de `MAX_PDF_BYTES` dice que lo impone el bucket y que el codigo no lo hace cumplir» (+ afirma que ningun archivo COMPARA contra el tope). **LIMITE: no hay test contra el bucket, y no puede haberlo — ver abajo** |
| R19 | `convert-pdf.test.ts` | «un PDF con 51 paginas se rechaza con CERO llamadas a `renderPages`»; «el tope es INCLUSIVO: con 50 paginas se renderiza»; «tampoco se extrae texto de un archivo por encima del tope» |
| R20 | `limits-and-path.test.ts` | «R20 — cada nombre se declara exactamente una vez en el arbol del modulo»; «R20 — ningun otro archivo del modulo escribe los valores: se importan, no se repiten» (busqueda por VALOR) |
| R21 | `convert-pdf.test.ts`, `module-contract.test.ts` | «el dominio no nombra ninguna libreria de conversion: solo conoce el puerto»; «pedir el texto no renderiza ninguna pagina, y pedir imagenes no extrae texto» |
| **R22** | `convert-pdf.test.ts`, `pdf-converter.test.ts` | «las paginas se piden a la resolucion unica del modulo, y vuelven como PNG»; «R22 — contar paginas y rasterizar son operaciones SEPARADAS». **LIMITE: nadie ejecuta un render real — ver abajo** |
| R23 | `convert-pdf.test.ts` | «si el convertidor revienta con el 2.o de 3, el 1.o y el 3.o siguen saliendo bien»; «el fallo del archivo roto nombra la operacion, la ruta y la causa, y no se traga»; «la conversion de una tanda NUNCA lanza: el fallo es un valor, no una excepcion» |
| R24 | `pdf-converter.test.ts`, `qc106-alcance.test.ts` | «R24 — `unpdf` lo importa un UNICO archivo, el adaptador»; «R24 — `@napi-rs/canvas` lo importa un UNICO archivo»; «R24 — el detector dispara»; «R24: las unicas dependencias nuevas respecto de dev son las dos aprobadas en F1.4» |
| R25 | `convert-pdf.test.ts`, `pdf-converter.test.ts` | «el render falla nombrando la causa y la extraccion de texto del mismo archivo sale bien»; «R25 — si el par nativo no carga, el error NOMBRA esa causa y dice que el texto sigue disponible»; «R25 — extraer texto no pasa por el par nativo» |
| R26 | `storage-config.test.ts`, `qc106-alcance.test.ts` | «R26 — exactamente DOS archivos de produccion importan la libreria, y este modulo aporta el segundo»; «R26 — el barrido recorre de verdad el arbol de produccion»; «R26: `@supabase/storage-js` no entra como dependencia nueva» |
| R27 | `module-contract.test.ts` | «R27 — el modulo tiene `index.ts` en su raiz y ninguna carpeta fuera de `domain/ports/adapters`»; «R27 — el barril exporta EXACTAMENTE los simbolos de ejecucion previstos, ni uno mas ni uno menos»; «R27 — la regla MUERDE» |
| R28 | `module-contract.test.ts` | «R28 — el cierre real no arrastra `'use server'`, Prisma, `next/*`, el SDK del almacenamiento, la libreria de conversion ni ningun adaptador»; «R28 — la Server Action y los adaptadores driven existen en el arbol y NO son alcanzables desde el contrato»; «R28 — la regla MUERDE» |
| R29 | `document-upload-actions.test.ts`, `qc106-alcance.test.ts` | «R29 — el archivo declara `'use server'` y no se reexporta desde el contrato del modulo»; «R29 — la emision de enlaces no estrena ningun Route Handler»; «R29: el diff de la rama no trae ningun archivo bajo `app/api/`» |
| R30 | `qc106-alcance.test.ts` | «R30: `permissions.ts` es identico al de dev»; «R30: y por lo tanto no introduce ningun identificador de base —tabla, columna o indice—» |
| R31 | `storage-config.test.ts` + las 10 suites del modulo | «R32, R31 — importar el adaptador con las tres variables vacias no lanza». Los **145 casos corren sin red, sin bucket y sin variables de entorno**. **LIMITE: `tests/unit/composition` no es ejecutable en esta maquina — ver abajo** |
| R32 | `storage-config.test.ts` | «R32 — invocar sin configuracion lanza nombrando las tres variables, sin ningun valor»; «R32 — con una sola presente, el mensaje nombra solo las que faltan»; «R32 — una variable vacia o solo espacios cuenta como ausente»; «R32 — `SUPABASE_DOCUMENTS_BUCKET` esta declarada, VACIA y con su documentacion»; «R32 — el archivo no contiene ningun secreto» |
| R33 | `module-contract.test.ts`, `qc106-alcance.test.ts` | «R27, R33 — el barril expone el actor, los dos errores, los limites, la ruta y el esquema» (los dos unicos codigos: `unauthorized`, `invalid_input`); «R33: `error-codes.ts` es identico al de dev» |
| R34 | `qc106-alcance.test.ts` | «R34: el diff de la rama no trae ningun archivo bajo `app/`, `components/` ni `e2e/`»; «R34 — el detector muerde». E2E **diferido a QC-107**, con motivo |

## Salida de los tests

Corrida por el implementer al cerrar la feature. **`./init.sh` NO se corrio**: su validador aborta
con exit 1 antes de typecheck, lint y tests porque la zona `backend` tiene tres features
`in_progress` (QC-60, QC-104, QC-106), que es una **decision humana explicita y registrada** y no
un fallo de esta ficha. Se verifico con los comandos dirigidos que manda `AGENTS.md > Regla del
gate`.

```
$ pnpm lint
> quimicloude@0.1.0 lint
> eslint
                                   <- sin un solo hallazgo

$ pnpm exec vitest run tests/unit/documentos
 Test Files  10 passed (10)
      Tests  149 passed (149)
   Duration  2.45s

$ pnpm exec vitest run guard
 Test Files  41 passed (41)
      Tests  445 passed | 9 skipped (454)
   Duration  4.97s

$ pnpm typecheck
335 errores en total
0 que mencionen `modules/documentos` o `composition/index`
```

**Las guardias quedan 41 de 41.** Los 149 casos del modulo son los 145 originales mas los **cuatro
nuevos** que trajo la enmienda D19, que afirman de quien es cada plazo.

### El rojo bloqueante, CERRADO por decision humana (2026-09-16)

Se deja el historial porque explica por que el numero era el que era.

**Lo que pasaba:** `tests/guards/guard-identificador-de-request.test.ts`, caso «package.json no
gana ninguna dependencia, ni una libreria de identificadores (R20)», fallaba con «declara 33
dependencies y se esperaban 31». **Lo causaba la instalacion aprobada de esta ficha** —el
manifiesto tenia exactamente 31 y las dos dependencias de F1.4 lo dejan en 33—, asi que **no era
un rojo heredado**; decirlo al reves habria sido falso. **No estaba en `tests/baseline-rojos.json`**,
y por `docs/verification.md > Rojos heredados` todo lo que no este ahi y salga rojo es
**bloqueante**.

**Lo decidido y hecho:** el humano autorizo subir `DEPENDENCIAS_ESPERADAS` de **31 a 33** en esa
guardia. **No se metio al baseline**, y esa parte importa: listar el archivo lo habria apagado
entero para el comparador, dejando ciegos tambien sus otros veintidos casos, que es exactamente el
coste que el propio baseline advierte en cada una de sus entradas.

**Lo que queda dicho y no es de esta ficha:** que el conteo sea un **absoluto** es fragil —no
distingue «alguien colo una libreria» de «entro una aprobada», asi que lo rompe cualquier feature
posterior con una legitima, como ya le paso a `resend` con cuatro guardias distintas—. La pregunta
«¿toda dependencia declarada esta aprobada?» la responde `guard-dependencias-aprobadas`, que
compara contra el registro y siempre estuvo verde. **El arreglo de fondo es que esa guardia compare
contra el merge-base de su propia rama en vez de contar absolutos**, y queda propuesto, no hecho:
es la guardia de otra ficha.

### Errores fantasma de `@prisma/client`, explicados

Los 335 errores de `typecheck` **no son de esta ficha** y ninguno menciona sus archivos. La causa
esta medida: `pnpm` reporta `Ignored build scripts: @prisma/client, @prisma/engines, esbuild,
prisma`, asi que el cliente de Prisma **nunca se genero** en este worktree. Es el primer caso
exacto de la tabla de `docs/verification.md > El gate regenera los artefactos`: el sintoma miente
sobre su causa. Por lo mismo `tests/unit/composition` no es ejecutable aqui —revienta al importar,
con 0 tests fallados y 15 saltados—, y esa es la unica parte del criterio de T10 que esta maquina
no puede acreditar.

## RESUELTA POR EL HUMANO (2026-09-16) — el plazo del enlace de SUBIDA

**Decision tomada:** se **aceptan las 2 horas** que impone el proveedor en la **subida**, y los
**15 minutos de R10 se acotan a los enlaces de LECTURA**, donde `createSignedUrl(path, expiresIn)`
si los hace exigibles. El humano confirmo el hallazgo contra las declaraciones de tipos **y**
contra la documentacion de Supabase, que lo dice con todas las letras: los enlaces de subida
firmados **«are valid for 2 hours»**, fijas y sin parametro.

**Lo que se hizo con esa decision:** se reescribio **R10** en `requirements.md`, se anadio la
enmienda como **fila nueva (D19)** en la tabla de decisiones cerradas —sin tocar ninguna otra
fila ni el bloque de Alcance— y **el codigo dejo de prometer lo que no cumple**: el `expiresAt`
de la emision y el docblock del adaptador declaran ahora **2 h** para la subida, con su test.

**Consecuencia aceptada, escrita entera y no disimulada:** un enlace de subida filtrado permite
**escribir durante 2 h en UNA ruta concreta que eligio el servidor**, dentro del prefijo de la
empresa, y el bucket sigue rechazando lo que no sea PDF de menos de 20 MB. **No permite leer nada
ajeno** ni escribir en ninguna otra ruta.

El registro de por que se paro y se pregunto se conserva abajo, porque es lo que sostiene la
enmienda.

**Lo que dice el spec.** D3: «el enlace vive **15 minutos**». R10: «Cada enlace de subida DEBE
caducar 15 minutos despues de su emision; el sistema **NO DEBE emitir enlaces sin caducidad**».
`design.md > 3.1` modelo el puerto como `createSignedUpload(path, expiresInSeconds)`, dando por
supuesto que el plazo se le pasa al proveedor.

**Lo que hace de verdad la libreria aprobada.** Verificado en las declaraciones de tipos del
paquete **instalado** (`@supabase/storage-js@2.115.0`,
`node_modules/@supabase/storage-js/dist/index.d.cts`), no de memoria:

```ts
// linea 1076 — la de SUBIDA: NO admite plazo
createSignedUploadUrl(path: string, options?: { upsert: boolean }): Promise<...>

// linea 1302 — la de LECTURA: SI admite plazo
createSignedUrl(path: string, expiresIn: number, options?: {...}): Promise<...>
```

**La consecuencia, dicha sin adornos.** El plazo de los enlaces de **lectura** si lo fija este
modulo y R10 se cumple ahi. El de **subida** **no lo fija nuestro codigo**: la API no lo acepta.
El `expiresAt` que devuelve la emision es **el instante que declara el modulo** (emision + la
constante unica), **no una garantia del proveedor**, y el servicio puede seguir aceptando esa
firma despues de los quince minutos. El adaptador lo dice en su docblock en vez de fingir la
garantia.

**Por que se paro en vez de elegir.** Las decisiones cerradas son del humano, y cuando una resulta
imposible el encargo es **parar y preguntar**, no sustituirla. Las salidas concebibles —aceptar el
plazo que imponga el proveedor y corregir la redaccion de R10; mover el vencimiento a donde si sea
exigible; o descartar la subida directa— **cambiaban el alcance o el significado de D3**, y ninguna
era del implementer.

**Que eligio el humano el 2026-09-16:** la primera. Aceptar las 2 h del proveedor y acotar los 15
minutos a la lectura, que es lo que quedo escrito como **D19** y reescrito en **R10**.

**Lo que esto NO invalida.** El resto de D3 y R10 se sostiene: el plazo vive en **una sola**
definicion del modulo, toda la tanda caduca a la vez y nada se firma sin permiso. Lo unico que no
se sostiene es que la caducidad de la **subida** sea algo que este sistema imponga.

## CONFIRMADA POR EL HUMANO (2026-09-16) — la autorizacion gana a la validacion de entrada

Se llevo a la puerta humana como **desviacion declarada** de la letra de `tasks.md` T9, caso (a)
(«entrada invalida ⇒ el doble del caso de uso **no se llama**»). **Queda CONFIRMADA como decision
humana**, no como deuda ni como desviacion pendiente: no hay nada que devolver ni que arreglar.

**La tension era real y no reconciliable al pie de la letra.** El codigo del permiso vive **dentro
del dominio y no sale por el contrato**, asi que el borde **no tiene forma de saber si el actor
esta autorizado sin invocar el caso de uso**. Por tanto «rechazar la entrada sin llamar al caso de
uso» y «el veredicto de autorizacion gana siempre» **no pueden ser ciertas a la vez** para un actor
**sin** permiso.

**Lo decidido:** gana la **autorizacion**. Pre-validar en el borde le contaria a quien **no puede
operar** si su entrada estaba bien formada, y eso rompe el **falla cerrado** de R2 y R3. Las dos
alternativas eran peores: pre-validar siempre (el fallo que se acaba de describir) o **sacar el
codigo del permiso al contrato** para decidir en el borde, que seria una **segunda definicion de la
autorizacion**, justo lo que el dominio prohibe por escrito.

**Lo que la letra de T9(a) protegia si se cumple, y esta probado:** con entrada invalida **el
almacenamiento no se toca ni una vez** y **no se firma ningun enlace**, afirmado metodo a metodo
sobre **ocho** entradas invalidas distintas y contra un puerto cuyos tres metodos **revientan** si
alguien los llama. Y la frontera sigue intacta: la accion **no comprueba ningun permiso** ni nombra
ningun codigo de permiso — eso sigue siendo la primera linea del caso de uso (R5).

## Limites y deudas declaradas

- **El E2E se difiere a QC-107**, con motivo: esta ficha no anade ninguna pantalla, pagina ni
  ruta navegable, asi que no hay recorrido que un test de navegador pueda visitar. Es **deuda con
  destinatario, no exencion** de `CHECKPOINTS.md > Calidad de codigo`.
- **`@napi-rs/canvas` en el runtime de Vercel: DESCONOCIDO.** Es un binario nativo y
  `design.md > 9` lo dejo sin resolver a proposito, sin rellenarlo con un «si». No bloquea: la
  conversion a **texto** no necesita el par nativo, asi que si el binario no cargara solo caeria
  la conversion a imagen. Destinatario **QC-111**, que es quien primero invoca la conversion.
- **Los limites del bucket (20 MB y `application/pdf`) no los verifica el gate.** Son opciones
  del bucket y no hay ni un script ni una migracion que cree buckets en este repositorio. Es
  trabajo de entorno.
- **El PNG a 150 DPI no se ejercita de verdad (R22).** `design.md > 10` prohibe que un test
  construya el adaptador real de `unpdf` para convertir, y «cero binarios nuevos» impide meter un
  PDF de muestra en el repositorio. Lo que si se verifica sin uno: que contar paginas y rasterizar
  sean operaciones separadas, que importar el adaptador no lance, que la conversion dpi->escala
  exista y que el par nativo sea de verdad opcional. **Nadie ejecuta un render**, asi que la
  pagina real queda sin ejercitar hasta que **QC-111** la invoque. Se dice en vez de fabricar un
  fixture que fingiera cubrirlo.
- **`tests/unit/composition` no es ejecutable en esta maquina**, por el cliente de Prisma sin
  generar. Es la unica parte del criterio de «Hecho» de T10 que no se pudo acreditar ejecutando;
  lo que si esta cubierto, por los tests del adaptador que si corren, es que construir la fachada
  no lee ninguna variable de entorno ni carga el par nativo.
- **La caducidad que se informa es la del reloj del dominio, no la de cada firma.** El caso de uso
  calcula `expiresAt` **una sola vez por tanda** y sobreescribe el que devuelve el adaptador, a
  proposito: firmar diez archivos no puede dar diez vencimientos distintos. El efecto secundario,
  que hasta ahora no estaba escrito en ningun sitio: el instante informado para el **ultimo**
  archivo queda **ligeramente anterior** al real, porque su firma se emitio unos milisegundos
  despues. Es **conservador** —nunca dice que un enlace vive mas de lo que vive, asi que no engana
  a favor de quien sube— y por eso se acepta en vez de corregirse.
