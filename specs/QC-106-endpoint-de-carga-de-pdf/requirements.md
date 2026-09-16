# QC-106 — endpoint-de-carga-de-pdf · requirements.md

> **Zona** `backend` · **Complejidad** `high` · **depends_on** ninguna · **Rama**
> `feature/QC-106-endpoint-de-carga-de-pdf`
>
> **Alcance.** Subida de **hasta 10 PDFs por tanda** a un bucket **privado y nuevo** de Supabase
> Storage, cada uno con su **enlace de subida firmado** que emite el servidor, y las **dos
> conversiones** —el PDF a imagen de sus páginas y el PDF a texto— publicadas **detrás de un
> puerto** como capacidad del módulo **nuevo `documentos`**. La conversión **no** viaja en la
> respuesta de la subida: la ejecuta el trabajo de la cola (**QC-111**), que usa esta capacidad por
> dentro.
>
> **Lo que NO entra.** Encolar y procesar, el estado por archivo y **el borrado del PDF temporal**
> → **QC-111**. La pantalla y el componente de subida → **QC-107**. La lectura con Gemini →
> **QC-108**. La estrategia catálogo/fórmula → **QC-109**. El recorte de imágenes → **QC-110**.
>
> Sembrado por `/afinar-feature` el 2026-09-16. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

Notación EARS (`docs/specs.md`). **«El sistema»** aquí es el módulo **NUEVO `documentos`** —su
dominio, sus puertos y sus adaptadores driven y driving— **más el cableado de `lib/composition`**.
No hay modelo de datos que especificar: esta ficha **no toca `db/schema.prisma`**, no crea migración
y no añade `down.sql` (decisión 5), así que el aislamiento no es una columna sino la ruta
(decisión 6).

Las decisiones cerradas se citan como **`[D1]`…`[D18]`**, en el orden en que están escritas en
`## Decisiones cerradas (no reabrir)`. **Son dieciocho filas**, aunque el bloque de Alcance y la
ficha del board hablen de «17 decisiones»: aquí se numeran por fila para que ninguna se quede sin
requisito. El desajuste se anota, no se resuelve por cuenta propia (regla 6 de `CLAUDE.md`).

Las **dos operaciones** a las que se refieren los requisitos son: **emitir los enlaces de subida de
una tanda** y **convertir un PDF** (a imagen de sus páginas o a texto). La segunda no la invoca esta
ficha: la publica como capacidad y la consumirá **QC-111**.

### Autorización y actor

**R1.** El sistema DEBE recibir el actor —su identificador, **su empresa** y su conjunto de
permisos— **como parámetro de entrada** de cada operación, y el dominio NO DEBE leer la sesión, la
cookie ni ninguna cabecera por su cuenta. `[D4]` `[D6]` `[D18]`

**R2.** SI el conjunto de permisos del actor no contiene el código de escritura que exige la emisión
de enlaces, ENTONCES el sistema DEBE rechazar la operación con el código de error `unauthorized`, y
NO DEBE firmar ningún enlace ni realizar ninguna llamada al almacenamiento. `[D4]` `[D16]`

**R3.** SI la operación llega sin actor, con un actor sin conjunto de permisos, con un conjunto
vacío o con un valor que no sea una lista, ENTONCES el sistema DEBE rechazarla igual que en R2
(**falla cerrado**), y NO DEBE tratar la ausencia como permiso. `[D4]`

**R4.** El sistema DEBE exigir un permiso **que ya exista** en el catálogo cerrado de quince de
`identity` y que, en el sembrado vigente de roles, **pertenezca únicamente al rol Administrador**; y
NO DEBE añadir ninguna entrada a ese catálogo, NO DEBE crear migración ni seed de permisos, y NO
DEBE decidir comparando el **nombre del rol** del actor. `[D4]`

**R5.** El sistema DEBE hacer la comprobación de R2 **en el caso de uso (service)**, como primer
paso y **antes** de validar la entrada y de tocar cualquier puerto; una policy de RLS o un corte de
ruta NO cuentan como implementación de este requisito. `[D4]`

### Emisión de los enlaces de subida

**R6.** CUANDO un actor autorizado pide subir una tanda de PDFs, el sistema DEBE devolver, **por
cada archivo de la tanda**, un **enlace de subida firmado** y la **ruta** que ese archivo tendrá
dentro del bucket. `[D2]`

**R7.** El sistema NO DEBE recibir, leer, almacenar ni reenviar los **bytes** de ningún PDF al
emitir los enlaces: los bytes viajan del navegador al almacenamiento sin atravesar la aplicación; y
esta ficha NO DEBE usar el almacenamiento para ningún **dato de negocio**, que sigue entrando y
saliendo únicamente por Prisma. `[D2]`

**R8.** SI la tanda trae **más de 10** archivos, ENTONCES el sistema DEBE rechazar la operación con
`invalid_input` y NO DEBE firmar **ninguno** de los enlaces, ni siquiera los diez primeros.

**R9.** SI la tanda no trae ningún archivo, ENTONCES el sistema DEBE rechazarla con `invalid_input`
y NO DEBE llamar al almacenamiento.

**R10.** El sistema DEBE hacer caducar **15 minutos** después de su emisión cada enlace de
**lectura** que firme, y ese plazo DEBE estar escrito en **una sola** definición del módulo, no
repetido en cada sitio que lo use. En los enlaces de **subida** el plazo lo impone **el proveedor**
—**2 horas**, fijas—: el sistema NO lo elige, NO lo puede cambiar y por tanto **NO DEBE prometer
otro**; DEBE declarar ese plazo en una sola definición y DEBE informar la caducidad real del enlace
que emite. El sistema NO DEBE emitir enlaces sin caducidad. `[D3]` `[D19]`

> **Enmendado el 2026-09-16 (D19).** La redacción original exigía 15 minutos **también** en la
> subida, y eso **no es implementable** con la librería aprobada: verificado en las declaraciones
> de tipos del paquete instalado (`@supabase/storage-js@2.115.0`,
> `node_modules/@supabase/storage-js/dist/index.d.cts`), `createSignedUploadUrl(path, options?:
> { upsert: boolean })` **no admite plazo**, mientras que `createSignedUrl(path, expiresIn:
> number, ...)` sí. Prometer quince minutos en la subida habría sido escribir en el código una
> garantía que el servicio no da.

**R11.** El sistema DEBE emitir los enlaces contra un bucket **privado y propio de estos PDFs**,
distinto del bucket de la imagen de receta; y NO DEBE modificar, leer ni escribir el bucket público
de recetas, que sigue siendo público. `[D1]`

**R12.** Toda ruta que el sistema firme DEBE empezar por el **identificador de la empresa del
actor**; y SI se pide firmar —de subida o de lectura— una ruta que no esté bajo ese prefijo,
ENTONCES el sistema DEBE rechazarla con `unauthorized`, **exista o no** el archivo, y sin revelar si
existe. `[D6]`

**R13.** El sistema DEBE devolver **la ruta del archivo dentro del bucket**, y NO DEBE devolver ni
persistir en ninguna parte la URL completa de lectura. `[D6]`

**R14.** El sistema NO DEBE crear, leer ni escribir ninguna fila de base de datos en ninguna de las
dos operaciones: esta ficha NO DEBE añadir ningún modelo a `db/schema.prisma`, ninguna migración y
ningún `down.sql`. `[D5]`

**R15.** El sistema NO DEBE devolver el resultado de ninguna conversión en la respuesta de la
subida: la respuesta son rutas y enlaces, y nada más.

### Validación de entrada y límites por archivo

**R16.** El sistema DEBE validar con un esquema **toda entrada externa** de la emisión de enlaces en
el borde, y NO DEBE dejar que ningún dato sin validar ni tipar cruce hacia el dominio. `[D18]`

**R17.** El sistema DEBE publicar una comprobación de que un archivo es un PDF **por su
contenido** —la firma del archivo— y DEBE aplicarla **antes de convertir**; y NO DEBE aceptar un
archivo como PDF por su extensión ni por el tipo que declare quien lo sube. `[D12]`

**R18.** El sistema NO DEBE hacer cumplir **en su propio código** el tamaño máximo de **20 MB** ni
el tipo `application/pdf`: los impone el **bucket** (`fileSizeLimit` y `allowedMimeTypes`), de modo
que un archivo de 25 MB o que no sea PDF se rechaza **aunque su enlace esté firmado y vivo**.
`[D10]` `[D11]`

**R19.** SI un PDF tiene **más de 50 páginas**, ENTONCES la **conversión** DEBE rechazarlo con
`invalid_input` y NO DEBE renderizar ninguna página ni devolver texto; el sistema NO DEBE intentar
aplicar ese límite en el momento de firmar el enlace, porque ahí todavía no se conoce.
`[D10]` `[D11]`

**R20.** El sistema DEBE declarar el tope de páginas, el tope de tamaño y la resolución de salida
**cada uno en una sola definición** del módulo, y NO DEBE incrustar ninguno de esos valores
repetido en varios archivos ni en la documentación como número suelto.

### Conversión, detrás de un puerto

**R21.** El sistema DEBE publicar **las dos conversiones** —el PDF a imagen de sus páginas y el PDF
a texto— como capacidad del módulo `documentos` **detrás de un puerto**, implementado por un
adaptador driven; el caso de uso y el dominio NO DEBEN conocer la librería concreta. `[D7]` `[D14]`

**R22.** CUANDO el sistema convierte un PDF a imagen, DEBE producir **una imagen PNG por página a
150 DPI**, y NO DEBE producir ningún formato con pérdida ni una resolución distinta de la
declarada. `[D9]`

**R23.** SI un PDF está cifrado, corrupto o no se puede abrir, ENTONCES el sistema DEBE fallar
**solo ese archivo**, con un error que diga qué operación falló y sobre qué ruta, y NO DEBE impedir
ni revertir el tratamiento de los otros archivos de la tanda; NO DEBE descartar ese fallo en un
`catch` vacío ni en silencio. `[D12]`

**R24.** El sistema DEBE resolver las dos conversiones con **una sola** librería de terceros más su
par opcional, y NO DEBE incorporar ninguna dependencia con licencia fuera de MIT, Apache-2.0, BSD o
ISC; ninguna dependencia nueva DEBE quedar instalada ni escrita en `package.json` **antes** de la
aprobación humana y de su fila en `docs/dependencias.md`. `[D7]`

**R25.** DONDE el par **opcional** de la conversión a imagen no esté disponible en el entorno de
ejecución, el sistema DEBE **seguir ofreciendo la conversión a texto** y DEBE fallar la de imagen
con un error explícito que nombre la causa; NO DEBE fallar la conversión a texto por ese motivo.
`[D7]`

**R26.** El sistema NO DEBE incorporar `@supabase/storage-js` como dependencia nueva —ya está
aprobada e instalada—, y DEBE quedar como su **segundo consumidor**, con el adaptador de este módulo
como **único** archivo nuevo que la importa. `[D8]`

### Módulo, capas, borde y verificación

**R27.** El sistema DEBE alojar este código en el módulo **nuevo `documentos`**, con su `index.ts`
—que solo reexporta de `./domain`—, su `domain/`, sus `ports/` y sus `adapters/`; y NO DEBE colgarlo
de `recetas` ni de `proveedores` ni de `lib/` fuera de un módulo. `[D13]`

**R28.** El sistema DEBE atar puerto → adaptador **solo** en `lib/composition`; el `domain/` y los
`ports/` de `documentos` NO DEBEN importar `@supabase/storage-js`, la librería de conversión,
`next/*`, `@prisma/client`, `lib/shared/**` ni `lib/composition`. `[D14]` `[D18]`

**R29.** El sistema DEBE exponer la emisión de los enlaces como **Server Action** en
`adapters/driving/` del módulo, y NO DEBE crear ningún Route Handler ni ningún archivo bajo
`app/api/`. `[D2]` `[D18]`

**R30.** El sistema NO DEBE introducir ningún identificador de base de datos —tabla, columna o
índice—, porque no crea ninguna tabla; y los nombres de archivo y símbolos que añada DEBEN seguir
las convenciones del repositorio. `[D5]` `[D18]`

**R31.** La verificación de esta feature DEBE poder ejecutarse **sin red y sin bucket**: ningún test
DEBE hacer una llamada real al almacenamiento ni a la red, ni depender de que las variables de
entorno del Storage tengan valor; los puertos se sustituyen por dobles. `[D14]`

**R32.** El sistema DEBE resolver la dirección del almacenamiento, el nombre del bucket y la
credencial de firma **por configuración**, DEBE leerlas **en el momento de la invocación** —nunca al
importar el módulo, de modo que importar el adaptador sin invocarlo no falle—, DEBE declarar las
variables que use, **vacías y documentadas**, en `.env.example`, y NO DEBE incluir ninguno de esos
valores escrito en el código. `[D15]`

**R33.** El sistema DEBE usar únicamente los códigos de error `unauthorized` e `invalid_input` del
catálogo cerrado, y NO DEBE añadir, renombrar ni enmendar ninguna entrada de ese catálogo. `[D16]`

**R34.** Esta feature NO DEBE incluir ninguna pantalla, página ni componente de interfaz —van a
**QC-107**—; por lo tanto no aporta ningún flujo navegable que un test E2E pueda visitar, y su
verificación DEBE ser unitaria. `[D17]`

### Cobertura de las decisiones cerradas

Cada fila de `## Decisiones cerradas (no reabrir)`, **en el orden en que está escrita**, con el
requisito que la hace testeable. Ninguna queda sin `R<n>`.

| # | Decisión cerrada | Requisito(s) |
| --- | --- | --- |
| D1 | Bucket **privado y nuevo**; el de recetas sigue público | R11 |
| D2 | El navegador sube directo con enlace firmado; los bytes no atraviesan la app; Prisma sigue siendo el único camino de datos | R6, R7, R29 |
| D3 | El enlace vive **15 minutos** | R10 |
| D4 | **Solo el Administrador**, validado en el service; el catálogo de 15 permisos no se amplía | R1, R2, R3, R4, R5 |
| D5 | **Ninguna fila** en base; devuelve la ruta; sin tabla de operación ni columna de empresa | R14, R30 |
| D6 | Aislamiento por **prefijo de empresa** en la ruta; en la ruta va la ruta, no la URL | R1, R12, R13 |
| D7 | `unpdf` + `@napi-rs/canvas` (par **opcional**) cubren las dos conversiones; `mupdf` descartada por licencia; nada se instala antes de F1.4 | R21, R24, R25 |
| D8 | `@supabase/storage-js` **no** es dependencia nueva; su fila gana un segundo consumidor | R26 |
| D9 | Páginas en **PNG a 150 DPI** | R22 |
| D10 | **20 MB y 50 páginas** por PDF | R18, R19, R20 |
| D11 | Tamaño y tipo los impone **el bucket**; las páginas las aplica **la conversión** | R18, R19 |
| D12 | En la subida se rechaza lo comprobable, **por contenido y no por extensión**; lo que solo se ve al convertir falla **por archivo** | R17, R23 |
| D13 | Módulo **nuevo `documentos`**, no colgado de `recetas` ni de `proveedores` | R27 |
| D14 | La subida vive **detrás de un puerto**, con doble en los tests | R21, R28, R31 |
| D15 | Variables **declaradas y vacías** en `.env.example`, sin secretos | R32 |
| D16 | **Ningún** código de error nuevo: `unauthorized` e `invalid_input` | R2, R33 |
| D17 | **E2E diferido** a QC-107, con motivo | R34 |
| D18 | Capas, borde e identificadores: zod en el borde, identificadores en inglés, dominio sin Supabase ni `next/*`, cableado solo en `lib/composition` | R1, R16, R28, R29, R30 |
| D19 | **Enmienda a D3**: 15 minutos en los enlaces de **lectura**; en los de **subida**, las **2 horas** que impone el proveedor, que el módulo no elige y no promete | R10 |

Requisitos que **no** salen de una fila de la tabla, y de dónde salen: **R8** y **R9** del bloque de
Alcance («hasta 10 PDFs por tanda»), que fija el tamaño de la tanda y por tanto lo que se rechaza
entera; **R15** del Alcance también («la conversión **no** viaja en la respuesta de la subida: la
ejecuta QC-111»); **R20** de `CHECKPOINTS.md > Configuracion` y del anti-patrón de
`docs/architecture.md` sobre valores repetidos entre entornos —las decisiones 9 y 10 fijan los
números, pero no dicen que vivan en un solo sitio, y sin eso el bucket y el código pueden
divergir—; **R5** refuerza D4 con `docs/architecture.md > Acceso a datos y autorizacion` («la
autorización se valida en el service»); **R31** además de D14, de `docs/verification.md` —la suite
corre sin red— y de la pregunta abierta 2, que deja el Storage sin configurar en la máquina de
desarrollo.

## Preguntas abiertas

No se rellenan con supuestos (regla 6 de `CLAUDE.md`). **Ninguna de las tres bloquea el alcance.**

1. **¿Quién crea el bucket privado y sus límites, y dónde queda escrito?** Se verificó en disco que
   **no existe ni un script ni una migración que cree buckets** —`db/migrations/**` y `scripts/` no
   mencionan ninguno—: el bucket de recetas de QC-25 **se creó a mano en la consola de Supabase**.
   Los límites de la decisión 10 (`fileSizeLimit`, `allowedMimeTypes`) viven ahí, o sea **fuera del
   repositorio y fuera del alcance del gate**, así que nada del arnés puede comprobar que estén
   puestos. Es trabajo de entorno, no de código.
2. **Las tres variables `SUPABASE_STORAGE_*` no están en el `.env` de la máquina de desarrollo**
   —solo `DATABASE_URL`, `DIRECT_URL`, `SESSION_SECRET`, `SEED_ADMIN_*` y las de MCP—. En ese árbol
   el Storage **no está configurado ni siquiera para recetas**, así que nada de esta ficha se puede
   probar contra Supabase real ahí. Con la decisión 12 la suite no lo necesita; lo que queda sin
   decidir es si alguien va a querer probarlo a mano alguna vez.
3. **¿`@napi-rs/canvas` corre en el runtime de Vercel?** Es un **binario nativo**, no JavaScript
   puro, y de él depende **solo** la conversión a imagen (es par **opcional** de `unpdf`; la
   conversión a texto no lo necesita). Lo verifica el `design.md` antes de comprometer la decisión
   7; si no corriera, la conversión a texto sigue en pie y la de imagen necesitaría otra vía.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
| --- | --- | --- |
| 2026-09-16 | ¿El bucket es público o privado? | **Privado, y NUEVO**, solo para estos PDFs. **NO deroga QC-25 D5**: el bucket de la imagen de receta sigue siendo **público** y esta ficha no lo toca. Se preguntó expresamente porque QC-25 descartó el bucket privado **a conciencia** («era la recomendación técnica y el humano la descartó», `specs/QC-25-crud-de-recetas/design.md:597,599`), y aquí el contenido es otro: el catálogo de precios o la fórmula de un proveedor, no una foto. Mismo criterio que **QC-110**, que ya tiene decidido un bucket propio para sus recortes |
| 2026-09-16 | ¿Por dónde entran los bytes? | **El navegador sube DIRECTO a Supabase** con un enlace firmado por archivo; **los bytes no atraviesan la aplicación**. Motivo medido, no estético: `next.config.ts` está **vacío** y el límite por defecto de Server Actions es **1 MB**, así que 10 PDFs no caben por el único camino que el repo usa hoy (riesgo ya anotado en `specs/QC-62-pasos-de-receta-enriquecidos/design.md:106-107`). **Es la primera vez que el navegador habla con Supabase**, así que se declara por escrito: esto es **almacenamiento, no datos de negocio**, y el único camino de DATOS sigue siendo Prisma (`docs/architecture.md > Acceso a datos y autorizacion`, que no se relaja) |
| 2026-09-16 | ¿Cuánto vive el enlace de subida? | **15 minutos.** Tiempo de sobra para subir 20 MB por una conexión mala, y corto para que un enlace filtrado sirva de poco |
| 2026-09-16 | ¿Quién puede subir? | **Solo el Administrador**, validado en el **service** con su test — una policy de RLS o un corte de ruta no cuentan como implementado (`CHECKPOINTS.md > Datos y seguridad`). **El catálogo cerrado de 15 permisos NO se amplía**: no nace ningún `documentos.*`, así que no hay migración ni seed de permisos ni guardias que tocar. Heredado de **QC-20 D2** y **QC-25 D1** |
| 2026-09-16 | ¿Deja alguna fila en la base de datos? | **No.** La subida devuelve **la ruta** del archivo. El estado por archivo —en cola, procesando, listo, error— y la tabla donde viva son alcance de **QC-111**, que además tiene declarado abierto «dónde se guarda el estado». Así no hay dos fichas decidiendo la misma tabla. **Consecuencia**: esta ficha no crea ninguna tabla de operación, y por tanto no le aplica la obligación de columna de empresa de `docs/architecture.md > Dominio` — el aislamiento lo da la decisión siguiente |
| 2026-09-16 | ¿Se aísla por empresa? | **Sí: la ruta dentro del bucket empieza por la empresa**, y el servidor **solo firma enlaces dentro del prefijo de la empresa de quien pide**. Sin esto, y al no haber fila en base, conocer un identificador ajeno daría acceso al archivo — justo lo que el dominio prohíbe. Hereda además el criterio de **QC-25 D6**: en la ruta va **la ruta**, nunca la URL completa |
| 2026-09-16 | ¿Qué librería convierte el PDF? | **`unpdf`** más **`@napi-rs/canvas`** como par **opcional**. Una sola librería cubre **las dos** conversiones: se verificó **en el paquete publicado**, no de memoria, que exporta `extractText` **y** `renderPageAsImage`. **Los cuatro checks, verificados el 2026-09-16 contra npm**: `unpdf` sin `deprecated`, `1.8.1` del **2026-08-13**, **2.568.072** descargas/semana, **MIT**, y **cero dependencias propias**; `@napi-rs/canvas` sin `deprecated`, `1.0.9` del **2026-09-09**, **17.616.629** descargas/semana, **MIT**. **Descartada a sabiendas `mupdf`**, que técnicamente es la mejor —hace render y texto de una pieza—: su licencia es **AGPL-3.0-or-later** y **falla el check 4**. Descartadas también `pdf-lib` (última publicación **2022-05-12**, falla el check 2) y `pdf2pic` (falla el check 2 y además exige binarios de ImageMagick). **La aprobación humana y sus filas en `docs/dependencias.md` van en F1.4**, como QC-25 y QC-28: nada se instala antes |
| 2026-09-16 | ¿`@supabase/storage-js` es dependencia nueva? | **No: ya está aprobada** (`docs/dependencias.md:32`, 2026-09-03). Se verificó que la versión **instalada 2.115.0** expone `createSignedUploadUrl`, `uploadToSignedUrl` y `createSignedUrl`, así que la decisión 2 es implementable sin nada nuevo. **Pero su fila dice que «la consume un solo archivo»**, y esta ficha añade un segundo consumidor: **esa fila hay que actualizarla en F1.4**, no dejarla mintiendo |
| 2026-09-16 | ¿En qué formato y resolución salen las páginas? | **PNG a 150 DPI.** Sin pérdida, porque lo que va a leer Gemini (**QC-108**) son tablas de precios y texto pequeño, y la compresión con pérdida cuesta dígitos mal leídos. 150 DPI es donde el texto de 8 pt sigue siendo legible sin disparar el peso ni los tokens de imagen |
| 2026-09-16 | ¿Qué límites tiene cada archivo? | **20 MB y 50 páginas por PDF.** El número de páginas importa tanto como el peso: un PDF de 2 MB con 400 páginas cuesta 400 renders y 400 llamadas de IA, así que un límite solo de tamaño no protegería de nada |
| 2026-09-16 | ¿Cómo se hacen cumplir esos límites, si el servidor no ve los bytes? | **El tamaño y el tipo los impone EL PROPIO BUCKET**: `fileSizeLimit` y `allowedMimeTypes: ['application/pdf']`, verificados como opciones reales de `@supabase/storage-js` 2.115.0. Lo hace cumplir el servicio de Storage, no nuestro código, así que un archivo de 25 MB se rechaza **aunque el enlace esté firmado**. **Las páginas solo se saben abriendo el PDF**, así que ese límite lo aplica **la conversión**. Es la resolución explícita de la tensión entre las decisiones 2 y 9, y se escribe en vez de darse por supuesta |
| 2026-09-16 | ¿Qué pasa con un PDF que no se puede convertir? | En la subida se rechaza **lo comprobable** —la firma del contenido y lo que imponga el bucket—, heredando de **QC-25 D7** que se valida **por contenido y no por extensión**. Lo que solo se descubre al convertir —cifrado, corrupto— **falla como error de ESE archivo** y **no tumba los otros nueve** de la tanda |
| 2026-09-16 | ¿Dónde vive este código? | **Módulo NUEVO `documentos`**, con su `index.ts`, su `domain/`, sus `ports/` y sus `adapters/`. Es legal: la guardia solo exige que existan `identity` e `inventario` (`tests/guards/guard-arquitectura-modulos.test.ts:202-207`). **No se cuelga de `recetas`**, cuyo puerto de storage es específico —ruta cableada a `recetas/<uuid>` y extensión limitada a `jpg\|png\|webp`—, ni de `proveedores`: toda la épica QC-105 va a colgar de aquí |
| 2026-09-16 | ¿Dónde vive la subida? | **Detrás de un puerto del módulo `documentos`**, con su adaptador driven. El caso de uso no conoce Supabase, y **un doble en los tests hace que la suite no necesite red ni bucket** — que es condición para que `./init.sh` siga corriendo sin red. Heredado de **QC-25 D10** |
| 2026-09-16 | Configuración del Storage | Las variables que necesite quedan **declaradas y vacías** en `.env.example` y documentadas. Ningún secreto en el repositorio (`CHECKPOINTS.md > Configuracion`). Heredado de **QC-25 D11** |
| 2026-09-16 | ¿Códigos de error nuevos? | **Ninguno.** Se reutilizan `unauthorized` e `invalid_input`; **el catálogo cerrado de QC-70 no se enmienda**, y por tanto no hay sexta/octava familia ni enmienda que aprobar |
| 2026-09-16 | ¿Hace falta E2E? | **Diferido a QC-107, con motivo**: esta ficha no añade ninguna pantalla ni ruta navegable, así que no hay recorrido que visitar. Es **deuda con destinatario, no exención** de `CHECKPOINTS.md > Calidad de codigo`. Mismo criterio que **QC-25 D23** y **QC-20 D4** |
| 2026-09-16 | Capas, borde e identificadores | Validación de entrada con **zod** en el borde (`docs/conventions.md`). Identificadores de la base en **inglés** (**QC-4**). El dominio no conoce Supabase ni `next/*`; el cableado puerto → adaptador vive **solo** en `lib/composition` |
| 2026-09-16 | ¿Cuánto vive el enlace, de verdad? (**ENMIENDA A LA DECISIÓN 3**) | **Los 15 minutos se acotan a los enlaces de LECTURA**, que es donde este módulo sí los impone con `createSignedUrl(path, expiresIn)`. **En la SUBIDA se aceptan las 2 horas que fija el proveedor.** Motivo, verificado en las declaraciones de tipos del paquete **instalado** y no de memoria: `createSignedUploadUrl(path, options?: { upsert: boolean })` **no admite plazo** —la documentación de Supabase lo confirma: los enlaces de subida firmados «are valid for 2 hours», fijas—. La decisión 3 pedía quince minutos para la subida y **eso no es implementable**: el módulo no elige ese plazo, así que **no lo promete**; lo declara en una sola definición y **informa la caducidad real**. **Consecuencia aceptada, dicha entera**: un enlace de subida filtrado permite **escribir durante 2 h en UNA ruta concreta que eligió el servidor**, dentro del prefijo de la empresa, y el bucket sigue rechazando lo que no sea PDF de menos de 20 MB; **no permite leer nada ajeno** ni escribir en ninguna otra ruta. El resto de la decisión 3 sigue en pie: nada se firma sin permiso y toda la tanda caduca a la vez |
