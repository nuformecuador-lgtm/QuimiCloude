# QC-209 — importar-inventario-desde-excel · requirements.md

> Zona: fullstack · Complejidad: high · depends_on: — · Rama: feature/QC-209-importar-inventario-desde-excel
>
> **Alcance.** El Administrador descarga una plantilla, sube un .xlsx o .csv de hasta 2.000 filas y
> ve una vista previa validada fila a fila: qué se crea, qué suma un lote a un producto existente,
> qué filas tienen error y qué unidades o presentaciones faltan. Las que faltan las crea desde ahí,
> y la vista previa se vuelve a validar. Al confirmar entran solo las filas válidas; las filas con
> error se descargan para corregirlas. Entran insumos, envases, instrumentos y producto terminado
> ligado a su fórmula.
>
> **Lo que NO entra.** Proveedores y precios de proveedor. Mapeo libre de columnas. Procesamiento en
> segundo plano o archivos de más de 2.000 filas (QC-176 es el precedente para PDF). Unicidad
> nombre + unidad ante importaciones simultáneas (QC-205). Conversión por familia de unidad (QC-203).
>
> Sembrado por `/afinar-feature` el 2026-10-06. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

Vocabulario. **Archivo**: el .xlsx o .csv que sube el Administrador. **Fila**: una fila de datos del
archivo (la cabecera no cuenta). **Estado de fila**: uno y solo uno de `crear`, `sumar lote`,
`duplicado` o `error`. **Faltante**: una unidad o presentación que una fila nombra y que no existe en
la empresa. **Vista previa** y **confirmación** son las dos operaciones del servicio de importación;
la forma exacta de su entrada y su salida está en `design.md > 1. Contrato de servicios`.

### Permisos y acceso

- **R1** (D9) SI quien invoca la vista previa o la confirmación no tiene sesión válida o no tiene el
  permiso `inventario.modificar`, ENTONCES el sistema DEBE rechazar la operación con el código
  `unauthorized`, sin leer el archivo, sin consultar el inventario y sin escribir nada.
- **R2** (D9) CUANDO alguien sin el permiso `inventario.modificar` pide la pantalla de importación,
  el sistema DEBE responder 404, igual que cualquier otra ruta privada inexistente.

### Plantilla y archivo

- **R3** (D5) CUANDO el Administrador pide la plantilla, el sistema DEBE entregarle un archivo con
  exactamente las columnas fijas de `design.md > 1.1`, con sus nombres en español y en ese orden, y
  una sola fila de ejemplo.
- **R4** (D3) El sistema DEBE aceptar archivos .xlsx y .csv. SI el archivo tiene otra extensión, o
  su contenido no corresponde a su extensión, o no se puede leer, ENTONCES el sistema DEBE rechazar
  el archivo entero diciendo el motivo, sin evaluar ninguna fila.
- **R5** (D5) SI a la cabecera del archivo le falta una columna obligatoria, ENTONCES el sistema
  DEBE rechazar el archivo entero nombrando cada columna que falta. SI la cabecera trae una columna
  que no es de la plantilla o trae una columna repetida, ENTONCES el sistema DEBE rechazar el
  archivo entero nombrándola. La comparación de nombres de columna DEBE ignorar mayúsculas, tildes
  y espacios de los extremos.
- **R6** (D6) SI el archivo tiene más de 2.000 filas, ENTONCES el sistema DEBE rechazarlo entero
  indicando cuántas trae y pidiendo partirlo. SI el archivo pesa más del tope de `design.md > 1.1`
  o no trae ninguna fila, ENTONCES el sistema DEBE rechazarlo entero diciendo el motivo. Las filas
  completamente vacías NO DEBEN contar como filas.
- **R7** (D6) El sistema DEBE resolver la vista previa y la confirmación dentro de la misma
  petición que las pide, sin dejar ningún trabajo pendiente en segundo plano.
- **R8** (D5) SI una fila es idéntica a la fila de ejemplo de la plantilla, ENTONCES el sistema
  DEBE ignorarla, NO DEBE importarla y la vista previa DEBE decir que se ignoró.

### Vista previa: reglas por fila

- **R9** (D8) CUANDO el Administrador sube un archivo aceptado, el sistema DEBE devolver una vista
  previa que asigne a cada fila exactamente un estado de fila, con el total por estado, y NO DEBE
  escribir nada en la base.
- **R10** (D8) El sistema DEBE validar cada fila con las mismas reglas de campo que el alta manual
  del mismo tipo (nombre, existencia, costo unitario o total, lote, fechas, alerta de cantidad, y
  existencia entera en envase). SI una fila incumple alguna, ENTONCES su estado DEBE ser `error` con
  un motivo por cada regla incumplida, y cada motivo DEBE nombrar la columna afectada.
- **R11** (D4, D8) SI una fila trae valor en una columna que no aplica a su tipo según
  `design.md > 1.1`, ENTONCES su estado DEBE ser `error` nombrando esa columna.
- **R12** El sistema DEBE leer los importes y cantidades de un .csv con coma o con punto como
  separador decimal, según `design.md > DS-2`. SI un valor trae separador de miles o más de un
  separador decimal, ENTONCES su fila DEBE quedar en `error` nombrando la columna.
- **R13** (D8) El sistema DEBE leer las fechas en las formas de `design.md > DS-2`. SI la fecha de
  compra está vacía, ENTONCES el sistema DEBE tomar la fecha de hoy, igual que el alta manual. SI la
  fecha de compra es futura o una fecha no existe en el calendario, ENTONCES la fila DEBE quedar en
  `error`.
- **R14** (D8) El sistema DEBE identificar el producto de una fila con la misma regla que el alta
  manual: insumo por nombre + unidad, envase por nombre, instrumento por nombre sin unidad. SI ya
  existe un producto vivo con esa identidad en la empresa, ENTONCES el estado DEBE ser
  `sumar lote`; SI NO, `crear`. SI la fila es un envase cuyo homónimo vivo tiene otra presentación,
  ENTONCES la fila DEBE quedar en `error`.
- **R15** (D8) SI dos o más filas del mismo archivo tienen la misma identidad de producto y ese
  producto no existe todavía, ENTONCES la primera DEBE quedar en `crear` y las siguientes en
  `sumar lote` sobre el producto que crea la primera.
- **R16** (D4) CUANDO una fila es de tipo producto terminado, el sistema DEBE exigir la columna
  «Fórmula», que DEBE nombrar una fórmula original viva de la empresa, y la columna «Presentación»,
  que DEBE nombrar una presentación de la empresa con contenido declarado; DEBE identificar el
  producto por fórmula + presentación y crearlo ligado a esa fórmula, con el nombre, la existencia
  y el costo que fija `design.md > DS-1`. SI falta cualquiera de las dos, o la fórmula no existe, o
  la presentación no tiene contenido, ENTONCES la fila DEBE quedar en `error`.
- **R17** (D4, D8) SI una fila de insumo, envase o instrumento coincide por identidad con un
  producto terminado vivo, ENTONCES la fila DEBE quedar en `error`, igual que en el alta manual.
- **R18** (D7) SI el lote de una fila ya existe en el producto que la fila identifica, en la base o
  en una fila anterior del mismo archivo, ENTONCES su estado DEBE ser `duplicado` y esa fila NO DEBE
  importarse.
- **R19** (D7, D8) SI el lote de una fila ya lo usa otro producto de la empresa, en la base o en una
  fila anterior del mismo archivo, ENTONCES la fila DEBE quedar en `error`, porque el código de lote
  es único por empresa.

### Vista previa: unidades y presentaciones faltantes

- **R20** (D2) CUANDO una o más filas nombran una unidad o una presentación que no existe en la
  empresa, la vista previa DEBE listar cada faltante una sola vez, aparte de las filas y con las
  filas que la nombran, y esas filas DEBEN quedar en `error` con ese motivo.
- **R21** (D2, D9) CUANDO el Administrador crea un faltante desde la vista previa, el sistema DEBE
  aplicar los mismos datos, reglas y errores que el alta normal de unidad o de presentación, y
  DEBE exigir el permiso de esa alta normal (`unidades.modificar` para la unidad,
  `inventario.modificar` para la presentación). SI quien la pide no tiene ese permiso, ENTONCES el
  sistema DEBE rechazarla con `unauthorized` sin crear nada.
- **R22** (D2) El sistema NO DEBE crear ninguna unidad ni presentación que el Administrador no haya
  creado expresamente, ni en la vista previa ni en la confirmación.
- **R23** (D2) CUANDO se crea un faltante desde la vista previa, el sistema DEBE volver a validar el
  mismo archivo y mostrar la vista previa resultante, en la que las filas que solo fallaban por ese
  faltante cambian de estado.

### Confirmación

- **R24** (D1) CUANDO el Administrador confirma, el sistema DEBE importar solo las filas en estado
  `crear` o `sumar lote` y NO DEBE importar las filas en `duplicado` ni en `error`. MIENTRAS haya
  filas en `error` o faltantes sin crear, la confirmación DEBE seguir disponible para las filas
  válidas. SI no hay ninguna fila válida, ENTONCES la confirmación NO DEBE escribir nada, tampoco
  el registro de `inventory_imports`, y DEBE devolver `nothing_imported` con las filas y sus motivos
  (enmienda F2.1, humano, 2026-10-06; `design.md > 1.4`).
- **R25** (D1) CUANDO el Administrador confirma, el sistema DEBE volver a validar el archivo contra
  el estado de la base en ese momento, y el resultado DEBE decir, fila a fila, qué se creó, a qué
  producto se sumó lote, qué fue duplicado y qué falló y por qué, incluidas las filas que pasaron a
  `error` o a `duplicado` desde la vista previa.
- **R26** (D8) CUANDO se importa una fila, el sistema DEBE crear su lote (con el código de la fila
  o, si viene vacío, con el correlativo de la empresa), registrar su movimiento de inventario de
  apertura con quien importa como autor, recalcular la existencia del producto y lanzar la revisión
  de pedidos bloqueados de la empresa, exactamente como el alta manual de un lote.
- **R27** (D1) SI la escritura de una fila falla al confirmar, ENTONCES el sistema DEBE conservar
  las filas ya escritas, seguir con las demás y marcar esa fila en `error` con su motivo.
- **R28** (D1) CUANDO la vista previa o el resultado tienen filas en `error`, el sistema DEBE
  ofrecer un archivo descargable con esas filas, sus valores originales, su número de fila y su
  motivo, que se pueda corregir y volver a subir con las mismas columnas.
- **R29** SI la misma confirmación llega dos veces (misma clave de importación en la misma
  empresa), ENTONCES el sistema DEBE escribir solo la primera y responder a la segunda que esa
  importación ya se hizo, sin crear lotes ni movimientos.
- **R30** CUANDO se confirma una importación, el sistema DEBE dejar registrado quién la hizo,
  cuándo, el nombre del archivo y el número de filas por resultado.

### Aislamiento por empresa

- **R31** El sistema DEBE resolver productos, lotes, unidades, presentaciones y fórmulas solo dentro
  de la empresa de quien importa (las unidades de sistema incluidas), DEBE escribir solo en esa
  empresa, y un elemento de otra empresa con el mismo nombre DEBE tratarse como inexistente.

### Contrato y prueba de punta a punta

- **R32** (D10) El sistema DEBE publicar la interfaz de la importación —operaciones, entradas,
  salidas y códigos de error de `design.md > 1`— como un contrato tipado único que consume la
  pantalla. SI la forma del contrato cambia, ENTONCES el test de contrato DEBE fallar.
- **R33** (D11) CUANDO el Administrador sube un archivo mixto, crea desde la vista previa una unidad
  faltante y confirma, el sistema DEBE dejar creados los lotes de las filas válidas con su
  movimiento y DEBE ofrecer el archivo de errores con las filas que no entraron.

## Preguntas abiertas

- ~~Producto terminado: qué presentación lleva, si la fórmula tiene varias, y qué coste toma su
  lote.~~ **Cerrada: `design.md > DS-1`, aprobada en F1.4 el 2026-10-06.**
- ~~Decimales con coma o con punto en el .csv.~~ **Cerrada: `design.md > DS-2`, aprobada en F1.4
  el 2026-10-06.**
- ~~Salud de la librería .xlsx sin verificar.~~ **Cerrada el 2026-10-06**: checks medidos por el
  leader (`design.md > 9.1`). En F1.4 el humano aprobó `read-excel-file` y pidió librería también
  para .csv (`papaparse`), porque más adelante se descargará en .csv o .xlsx.
- **De dónde sale el .xlsx de prueba** (`design.md > DS-13`, aprobada: lo produce el humano o el
  implementer si tiene la herramienta). La librería propuesta solo lee; el
  fixture binario lo tiene que producir alguien (el humano con Excel/LibreOffice, o una herramienta
  que el implementer tenga a mano). Sin él, el lector .xlsx solo se prueba contra la librería
  simulada.

## Decisiones cerradas (no reabrir)

| # | Decisión | Fuente | Cubierta por |
|---|---|---|---|
| D1 | Importación parcial: al confirmar entran solo las filas válidas; las filas con error se descargan en un archivo con su motivo. | Humano, 2026-10-06 | R24, R25, R27, R28 |
| D2 | Una unidad o presentación que no existe en la empresa se avisa ANTES de cargar, listada aparte en la vista previa, con la opción de crearla desde ahí con los mismos datos y reglas que su alta normal. Nada se crea solo. Tras crearla, la vista previa se revalida. | Humano, 2026-10-06 | R20, R21, R22, R23 |
| D3 | Formatos .xlsx y .csv. Leer .xlsx necesita una librería nueva: el spec propone una, con los cuatro checks de salud, y entra solo con aprobación humana, que va junto con la del spec (regla 7). | Humano, 2026-10-06 | R4 (librería: `design.md > DS-3`) |
| D4 | Tipos: insumo (con unidad), envase (con presentación), instrumento y producto terminado. El producto terminado lleva una columna «Fórmula», que debe existir en la empresa, y se crea ligado a ella. Es una regla nueva: hoy el terminado solo nace del empaque. | Humano, 2026-10-06 | R11, R16, R17 |
| D5 | Plantilla fija con columnas de nombre fijo en español y una fila de ejemplo. Si falta una columna obligatoria, se rechaza el archivo entero indicando cuál falta. | Humano, 2026-10-06 | R3, R5, R8 |
| D6 | Hasta 2.000 filas, procesado en línea. Un archivo más grande se rechaza pidiendo partirlo. | Humano, 2026-10-06 | R6, R7 |
| D7 | Duplicados: la vista previa marca las filas cuyo lote (mismo producto y mismo código de lote) ya existe, y esas no se importan. | Humano, 2026-10-06 | R18, R19 |
| D8 | Mismas reglas que el alta manual: identidad nombre + unidad, homónimo en la misma unidad suma un lote, lote opcional que se genera si falta, movimiento de inventario y revisión de pedidos bloqueados por cada lote. | Heredado QC-121, QC-199, QC-141 | R9, R10, R13, R14, R15, R17, R26 |
| D9 | Permiso `inventario.modificar`, validado en el servicio. Crear unidades o presentaciones desde la vista previa exige además el permiso de su alta normal. | Heredado | R1, R2, R21 |
| D10 | Contrato primero: `design.md` fija ANTES que nada la interfaz de los servicios (Server Actions, DTOs de entrada y salida, códigos de error). T0 publica ese contrato en código (tipos y fachada con stub), para que `frontend_dev` y `backend_dev` trabajen en paralelo sobre él. La feature no se parte en dos. | Humano, 2026-10-06 | R32 |
| D11 | Una prueba E2E: subir un archivo mixto, crear una unidad faltante, confirmar, y comprobar los lotes creados y el archivo de errores. | CHECKPOINTS (movimientos de inventario) | R33 |
