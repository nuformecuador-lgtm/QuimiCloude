# QC-154 — crud-de-clientes · requirements.md

> **Zona** backend · **Complejidad** — (la asigna el leader en F1.0) · **depends_on** QC-153 · **Rama** feature/QC-154-crud-de-clientes
>
> **Alcance.** Casos de uso y Server Actions del módulo `clientes`: alta, edición, baja lógica, detalle
> y listado paginado con búsqueda, siguiendo el contrato de listados del repo. Leer exige
> `clientes.consultar` y escribir `clientes.modificar`, validado en el service y con test.
>
> **Lo que NO entra.** El modelo (**QC-153**, bloquea esta). La pantalla (**QC-155**). El enlace pedido
> ↔ cliente (**QC-156**).
>
> Sembrado por `/afinar-feature` el 2026-09-23. El bloque de Alcance y la tabla de «Decisiones cerradas»
> los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los reescribe: su
> trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

Notación EARS (`docs/specs.md`). **«El sistema»** aquí es el módulo **`clientes`** —sus casos de uso,
sus puertos y sus adaptadores—, su cableado en `lib/composition/index.ts` y la **enmienda al catálogo
cerrado de errores** (`lib/modules/errores/`). El modelo ya existe y **no se re-especifica**: lo aportó
**QC-153** (`db/schema.prisma > Customer`, migración `20260924120000_customers`, permisos
`clientes.consultar` y `clientes.modificar` sembrados solo al Administrador). Mismo encuadre que
**QC-43** (CRUD de proveedores) con el aislamiento por empresa de **QC-59** y la autorización por
permiso de **QC-74**.

Las **cinco operaciones** a las que se refieren los requisitos son: **dar de alta, editar, dar de baja,
consultar la ficha y listar** clientes. Las tres primeras son **de escritura**; las dos últimas, **de
lectura**.

Los **seis datos de negocio** del cliente son: nombres, apellidos, ciudad, teléfono, correo y dirección
(decisión 1).

### Autorización y actor

**R1.** El sistema DEBE recibir el actor —su identificador, su empresa y su conjunto de permisos— **como
parámetro de entrada** de cada una de las cinco operaciones, y NO DEBE leer la sesión, la cookie ni
ninguna cabecera desde el dominio.

**R2.** SI el conjunto de permisos del actor no contiene `clientes.consultar`, ENTONCES la ficha y el
listado DEBEN rechazar la operación con el error de autorización, y NO DEBEN realizar ninguna lectura
por ningún puerto.

**R3.** SI el conjunto de permisos del actor no contiene `clientes.modificar`, ENTONCES el alta, la
edición y la baja DEBEN rechazar la operación con el error de autorización, y NO DEBEN realizar ninguna
lectura ni ninguna escritura por ningún puerto.

**R4.** SI la operación llega sin actor, con un actor sin conjunto de permisos o con el conjunto vacío,
ENTONCES el sistema DEBE rechazarla igual que en R2 y R3 (falla cerrado); y NO DEBE tratar ningún
permiso como implicación de otro: `clientes.modificar` NO concede la lectura y `clientes.consultar` NO
concede la escritura.

**R5.** CUANDO un actor sin el permiso exigido envía además una entrada inválida, el sistema DEBE
responder con el error de autorización y NO con el de entrada inválida.

**R6.** El sistema NO DEBE autorizar por nombre de rol: ningún archivo del módulo `clientes` DEBE
nombrar un rol, leer un campo de rol del actor ni importar una constante de rol; la comprobación DEBE
delegar en la regla de permisos que publica el contrato de `identity`.

**R7.** CUANDO un adaptador driving del módulo ejecuta una operación, DEBE obtener el usuario y la
empresa de la sesión a través de `@/lib/composition`, con **una sola** lectura de sesión por invocación,
y NO DEBE repetir la comprobación de permiso ni ninguna otra regla de negocio.

**R8.** CUANDO el conjunto de permisos del actor es exactamente el que el seed asigna al
**Administrador**, las cinco operaciones DEBEN autorizarse; y CUANDO es exactamente el que el seed
asigna al **Operador** o al **Empacador**, las cinco DEBEN rechazarse con el error de autorización.

### Empresa

**R9.** CUANDO se da de alta un cliente, el sistema DEBE asignarlo a la **empresa del actor**, y NO DEBE
tomar la empresa de la entrada aunque la entrada traiga una.

**R10.** SI la ficha, la edición o la baja apuntan a un cliente de **otra empresa**, ENTONCES el sistema
DEBE responder exactamente igual que ante un cliente inexistente (R23), y NO DEBE leer para el actor ni
modificar ningún dato de esa fila.

**R11.** El sistema DEBE devolver en el listado **solo** clientes de la empresa del actor, y el total
DEBE contar solo esos; ningún término de búsqueda ni ningún filtro DEBE ampliar el conjunto visible más
allá de esa empresa.

**R12.** El sistema DEBE exigir el ámbito de empresa en **toda** función de persistencia del módulo
`clientes`, de modo que una lectura o una escritura de clientes sin empresa no pueda escribirse sin que
una comprobación estática la señale.

### Alta y edición

**R13.** CUANDO un actor autorizado da de alta un cliente con datos válidos, el sistema DEBE
persistirlo y DEBE devolver su identificador.

**R14.** SI los nombres, los apellidos o la ciudad llegan ausentes, vacíos o solo con espacios,
ENTONCES el sistema DEBE rechazar el alta y la edición como entrada inválida **en la validación de
aplicación**, sin llegar al repositorio; y CUANDO son válidos, DEBE recortar los espacios de sus
extremos antes de guardarlos.

**R15.** El sistema DEBE aceptar un cliente al que le falte cualquier combinación de teléfono, correo y
dirección —incluidos los tres—; CUANDO uno de ellos llega vacío o solo con espacios, DEBE persistirlo
como **ausencia de valor**; y CUANDO llega con contenido, DEBE recortar los espacios de sus extremos.

**R16.** SI, ya recortado, algún dato supera su largo máximo —nombres **80**, apellidos **80**, ciudad
**80**, teléfono **40**, correo **160**, dirección **200** caracteres—, ENTONCES el sistema DEBE
rechazar la operación como entrada inválida en la validación de aplicación; y DEBE aceptar un dato
cuyo largo sea exactamente el máximo.

**R17.** El sistema NO DEBE exigir ningún formato al correo ni al teléfono: DEBE aceptar como correo y
como teléfono cualquier texto que respete su largo máximo.

**R18.** El sistema NO DEBE persistir, desde la entrada, ningún dato distinto de los seis de negocio:
cualquier otra clave de la entrada —empresa, autores, fechas, identificador, marca de baja, NIT,
documento o persona de contacto— DEBE quedar sin efecto.

**R19.** El sistema DEBE aceptar el alta y la edición de un cliente cuyos seis datos coincidan
exactamente con los de otro cliente vivo de la misma empresa, y NO DEBE existir ningún error de
«cliente duplicado».

**R20.** CUANDO se edita un cliente, el sistema DEBE reemplazar el conjunto completo de sus seis datos
de negocio —un dato opcional que no llega queda como ausencia de valor—, y NO DEBE ofrecer edición
parcial campo a campo.

**R21.** CUANDO se da de alta un cliente, el sistema DEBE registrar al actor como autor de la creación
**y** de la última modificación; y CUANDO se edita o se da de baja, DEBE registrar al actor como autor
de la última modificación y actualizar el instante de la última modificación, **sin alterar** el autor
ni el instante de la creación.

### Ficha y baja

**R22.** CUANDO un actor autorizado consulta la ficha de un cliente vivo de su empresa, el sistema DEBE
devolver su identificador, sus seis datos de negocio, los dos instantes y los dos autores, y NO DEBE
devolver ni la empresa ni la marca de baja.

**R23.** SI la ficha, la edición o la baja apuntan a un cliente que no existe, que ya está dado de baja,
o con un identificador que no tiene forma de identificador, ENTONCES el sistema DEBE responder con el
error «cliente no encontrado» y NO DEBE crear ni modificar ninguna fila.

**R24.** CUANDO se da de baja un cliente, el sistema DEBE conservar su fila completa y registrar el
instante de la baja, y NO DEBE eliminarla físicamente.

**R25.** El sistema DEBE excluir los clientes dados de baja de **toda** consulta —ficha y listado—, y NO
DEBE ofrecer ninguna operación de restauración ni ningún listado de clientes dados de baja.

### Listado

**R26.** CUANDO se consulta el listado, el sistema DEBE devolver como máximo tantos elementos como
indique el tamaño de página efectivo —**10** si no se indica, **25** como máximo aunque se pida más—
junto con el total de clientes que cumplen la consulta; y SI el número o el tamaño de página no son
enteros mayores o iguales a 1, ENTONCES DEBE rechazar la consulta sin leer del repositorio.

**R27.** El sistema DEBE aceptar en el listado **la misma forma de consulta** que los demás listados del
repositorio —página, tamaño, un orden, filtros y búsqueda—, validada y saneada con **una copia idéntica**
del contrato de listados; y CUANDO la consulta pide ordenar o filtrar por un campo no declarado, o con
una forma de filtro distinta de la declarada, DEBE omitir esa parte sin fallar y registrar **solo el
nombre** del campo omitido, nunca su valor.

**R28.** El sistema DEBE declarar como ordenables del listado de clientes **solo** nombres, apellidos,
ciudad, instante de creación e instante de modificación, y como filtrables **solo** la ciudad (texto) y
el instante de creación (rango de fechas); y NO DEBE admitir la marca de baja ni la empresa como campo
ordenable ni filtrable.

**R29.** CUANDO el listado no pide orden, el sistema DEBE ordenar por **apellidos ascendente, después
nombres ascendente**, y en todo orden DEBE desempatar de forma estable, de modo que ningún cliente
aparezca en dos páginas ni se omita de todas mientras el conjunto no cambie.

**R30.** CUANDO el listado trae un término de búsqueda, el sistema DEBE devolver solo los clientes en
los que **cada palabra** del término aparece, sin distinguir mayúsculas de minúsculas, en sus nombres,
en sus apellidos o en su ciudad; DEBE buscar literalmente los caracteres que el motor usa como comodín;
y SI el término está vacío o es solo espacios, ENTONCES DEBE tratarlo como ausencia de búsqueda.

**R31.** El sistema DEBE aplicar el orden, los filtros y la búsqueda en la base de datos **antes** de
paginar, y el total DEBE describir el conjunto ya filtrado, no la página.

### Borde, errores y módulo

**R32.** El sistema DEBE exponer las cinco operaciones como **Server Actions** en `adapters/driving/` del
módulo `clientes`, recibiendo `FormData` en el alta, la edición y la baja, y argumentos ya tipados en la
ficha y el listado; y NO DEBE crear ningún route handler ni llamar por `fetch` a ninguna ruta propia.

**R33.** El sistema DEBE señalar cada fallo con una clase de error de dominio del módulo que lleve un
`code` estable del catálogo cerrado, y el adaptador driving DEBE traducirlo a `{ status: 'error', code,
message }` con el traductor único del módulo `errores`, usando el `code` y **nunca** el texto; y NO DEBE
existir ningún `catch` que descarte un error sin manejarlo ni propagarlo.

**R34.** El catálogo cerrado de errores DEBE contener el código `customer_not_found` con su clave y un
texto no vacío, y DEBE ser **exactamente el catálogo previo a esta ficha más ese código**, sin añadir,
quitar ni renombrar ningún otro; y el módulo `clientes` NO DEBE señalar «cliente no encontrado» con
ningún otro código.

**R35.** El sistema DEBE alojar las operaciones en `lib/modules/clientes/domain/`, con el acceso a datos
detrás de puertos implementados en `adapters/driven/` y cableados **solo** en `lib/composition/`; el
dominio y los puertos NO DEBEN importar framework, Prisma, `lib/shared/`, `lib/composition` ni las
tripas de otro módulo; ningún adaptador del módulo DEBE consultar un modelo de otro módulo; y el
contrato `lib/modules/clientes/index.ts` DEBE reexportar solo de `./domain`, sin ningún `'use server'`
alcanzable desde él.

**R36.** El sistema DEBE resolver el cálculo de la paginación con el util de `lib/shared/`, y NO DEBE
reimplementar esa aritmética dentro del módulo `clientes`.

### Límite de alcance

**R37.** El sistema NO DEBE incluir en esta ficha ninguna migración ni ningún cambio de
`db/schema.prisma`.
*(Enmendado por la nota F1.4 del 2026-09-24: la única excepción es la migración de búsqueda sin
acentos de R43–R46. Lo demás de R37 sigue vigente: ninguna otra migración ni ningún otro cambio de
esquema.)*

**R38.** El sistema NO DEBE incluir en esta ficha ninguna pantalla, página, componente, entrada de menú
ni ruta bajo `app/` —van a **QC-155**—, ni ningún test E2E; su verificación es **unitaria, estática y de
integración**.

**R39.** El sistema NO DEBE incorporar ninguna dependencia de terceros nueva para cumplir los requisitos
anteriores.

**R40.** El sistema NO DEBE enlazar clientes con pedidos en esta ficha: ningún archivo del módulo
`clientes` DEBE nombrar el módulo `pedidos` ni sus tablas, y ningún archivo de `lib/modules/pedidos/`
DEBE nombrar el módulo `clientes`, el modelo de cliente ni su tabla.

### Cobertura de las decisiones cerradas

Cada fila de `## Decisiones cerradas (no reabrir)`, en el orden en que está escrita, con el requisito
que la hace testeable en **esta** ficha. Ninguna queda sin `R<n>` (regla 4 de `CLAUDE.md`).

| # | Decisión cerrada | Requisito(s) |
| --- | --- | --- |
| 1 | Nombres y apellidos separados y obligatorios, ciudad obligatoria; teléfono, correo y dirección opcionales; sin NIT ni persona de contacto | R14, R15, R18, R22 |
| 2 | Nada es único: se admiten duplicados | R19 |
| 3 | `clientes.consultar` (ver) y `clientes.modificar` (alta, edición, baja), solo del Administrador; autorización en el service | R1, R2, R3, R4, R5, R6, R7, R8 |
| 4 | Borrado lógico con auditoría y fechas; identificadores en inglés; aislamiento por empresa desde el primer día | R21, R24, R25 (borrado y auditoría); R9, R10, R11, R12 (empresa); R37 (esta ficha no crea identificadores de base: los de QC-153 no se tocan) |
| 5 | Tres fichas como Proveedores: QC-153 modelo, QC-154 CRUD, QC-155 pantalla | R32, R35, R37, R38 |
| 6 | Pedido ↔ cliente no entra (QC-156) | R40 |
| 7 | E2E en la pantalla (QC-155); modelo y CRUD con unitarios e integración | R38 |
| QC-153 F1.4 (2026-09-24) | Largos máximos (nombres 80, apellidos 80, teléfono 40, correo 160, ciudad 80, dirección 200) y sin formato de correo ni teléfono, aplicados en QC-154 | R16, R17 |
| — (regla 7 de `CLAUDE.md`) | Ninguna librería nueva | R39 |
| — (contrato de listados, QC-57) | Misma forma de consulta y copia idéntica del contrato en cada módulo | R26, R27, R28, R29, R30, R31, R36 |
| — (catálogo cerrado de errores, QC-70) | Códigos estables del catálogo; uno nuevo solo por enmienda | R33, R34 |

Requisitos que no salen de una fila de la tabla, y de dónde salen: **R13**, **R20**, **R22** y **R23**
del propio alcance —los caminos felices, la forma de la edición y el caso de la ficha inexistente—, con
el precedente de QC-43 (R7, R14, R24); **R28**, **R29** y **R30** concretan el «listado paginado con
búsqueda» del alcance y llevan posición por defecto abierta (P2, P3 abajo).

## Preguntas abiertas

1. **Largo máximo de cada campo y validación de formato del correo y del teléfono.** No se preguntó; el
   precedente es proveedores (`Supplier`: `phone` y `email` opcionales). `spec_author` lo toma de ahí
   y lo dice, o lo lleva a F1.4 si el precedente no lo cierra.

   > **Nota 2026-09-24 (spec_author, F1.2): cerrada por QC-153.** La F1.4 de QC-153 (su tabla de
   > decisiones, fila «Largos máximos y formato») fijó los valores que aplica **esta** ficha: nombres
   > 80, apellidos 80, teléfono 40, correo 160, ciudad 80, dirección 200, y **sin** validación de
   > formato del correo ni del teléfono. Precedentes: `lib/modules/proveedores/domain/supplier-input.ts`
   > (teléfono 40, correo 160, sin formato) y `lib/modules/identity/domain/user-input.ts` (nombres y
   > apellidos 80). Lo escriben **R16** y **R17**. La pregunta no se reescribe; queda respondida.

2. **¿La búsqueda distingue acentos?** *Añadida por `spec_author` en F1.2.* Proveedores busca contra
   una columna **normalizada** (sin acentos ni mayúsculas); `customers` no tiene ninguna, y QC-153 no
   dejó índice de texto. **Posición por defecto escrita, no decidida** (`design.md > 6.2`): búsqueda
   **insensible a mayúsculas pero sensible a acentos** —«maria» encuentra «Maria» y «MARIA», pero no
   «María»—, sin migración. La alternativa (columna normalizada o `unaccent`, con índice) exige una
   migración que R37 excluye y que sería otra ficha. R30 está escrito para no prejuzgarlo más allá de
   las mayúsculas.

   > **RESUELTA en F1.4 (2026-09-24) en sentido CONTRARIO a la posición por defecto:** la búsqueda
   > **ignora acentos**. Ver la nota F1.4 al final y R41–R47.

3. **Orden por defecto y campos consultables del listado.** *Añadida por `spec_author` en F1.2.* La
   tabla no lo cierra. **Posición por defecto escrita, no decidida**: orden por **apellidos y después
   nombres**, ascendente (R29); ordenables nombres, apellidos, ciudad y las dos fechas; filtrables la
   ciudad (texto) y la fecha de alta (rango) (R28). Cambiarlo es una línea de la lista blanca y su
   test: no bloquea la implementación.

   > **RESUELTA en F1.4 (2026-09-24):** se acepta la posición por defecto tal cual.

4. **Texto del código nuevo `customer_not_found`.** *Añadida por `spec_author` en F1.2.* Es la
   **decimotercera enmienda** al catálogo cerrado de errores (R34) y la aprueba el humano en F1.4.
   **Propuesta:** «El cliente solicitado no existe.», gemela de la de `supplier_not_found`
   (`design.md > 7`).

   > **RESUELTA en F1.4 (2026-09-24):** aprobada la enmienda con el texto «El cliente solicitado no
   > existe.».

5. **Un identificador sin forma de identificador.** *Añadida por `spec_author` en F1.2.* Proveedores no
   lo valida y lo deja llegar a la base. **Posición por defecto escrita, no decidida** (R23,
   `design.md > 5.3`): responder «cliente no encontrado» **sin tocar el repositorio**, porque un
   identificador que no puede existir es, para quien pregunta, lo mismo que uno inexistente.

   > **RESUELTA en F1.4 (2026-09-24):** se acepta la posición por defecto tal cual.

Si durante la implementación aparece cualquier otra ambigüedad, el implementer **para y la reporta al
leader**; no la rellena con supuestos.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-09-23 | ¿Qué datos tiene un cliente? | **Nombres** y **apellidos** en columnas separadas (obligatorios), **ciudad** (obligatoria); **teléfono**, **correo** y **dirección** opcionales. Sin NIT y sin persona de contacto: el cliente es una persona. |
| 2026-09-23 | ¿Qué no se puede repetir? | **Nada**: se admiten clientes duplicados (sin índice único de negocio). |
| 2026-09-23 | ¿Quién puede? | Permisos nuevos `clientes.consultar` (ver) y `clientes.modificar` (alta, edición, baja), **solo del Administrador** en el seed. Enmienda al catálogo cerrado de permisos (precedente: **QC-144**). La autorización se valida en el service (`docs/architecture.md`). |
| 2026-09-23 | Borrado, identificadores, empresa | **Borrado lógico** con auditoría `created_by`/`updated_by` y fechas; **identificadores en inglés**; **aislamiento por empresa desde el primer día** con `company_id` y FK compuesta (heredados de **QC-4**, **QC-42/QC-43** y **QC-59**). |
| 2026-09-23 | ¿Cómo se reparte el módulo? | Tres fichas como Proveedores (QC-42/43/44): **QC-153** modelo, **QC-154** CRUD, **QC-155** pantalla, en la épica nueva **QC-152 Clientes**. |
| 2026-09-23 | ¿Pedido ↔ cliente? | **No entra** en el módulo base: ficha aparte **QC-156** (bloqueada por QC-154). |
| 2026-09-23 | ¿E2E? | **Sí**, en la pantalla (**QC-155**), por tocar permisos (`CHECKPOINTS.md`). El modelo y el CRUD se verifican con tests unitarios y de integración. |
| 2026-09-24 (F1.4) | ¿La búsqueda distingue acentos? (P2) | **No: ignora acentos además de mayúsculas.** Se aparta de la posición por defecto del spec y **mete una migración en esta ficha**, con el mecanismo que ya usa el repositorio (columna `*_normalized` calculada por la aplicación, relleno de las filas existentes, índice GIN de trigramas parcial). Aplica a nombres, apellidos y ciudad. |
| 2026-09-24 (F1.4) | Texto de `customer_not_found` (P4) | **Decimotercera enmienda** al catálogo cerrado de errores con el texto «El cliente solicitado no existe.». |
| 2026-09-24 (F1.4) | Orden y campos consultables del listado (P3) | La propuesta: orden por defecto apellidos, nombres, id (ascendente); ordenables nombres, apellidos, ciudad y las dos fechas; filtrables ciudad (texto) y fecha de alta (rango). |
| 2026-09-24 (F1.4) | Identificador sin forma de uuid (P5) | La propuesta: responde `customer_not_found` **sin llegar a la base**. |

## Nota F1.4 (2026-09-24)

El humano respondió las cuatro preguntas que abrió `spec_author` (filas nuevas de «Decisiones
cerradas»). P3, P4 y P5 se aceptan tal como estaban escritas y no cambian ningún requisito. **P2
cambia de sentido**: la búsqueda ignora acentos, y eso trae una migración a esta ficha. Los requisitos
**no se renumeran**. R37 lleva su enmienda escrita en línea, y lo nuevo va de **R41 a R47**:

- **R41 reemplaza la regla de comparación de R30** (sin mayúsculas **y sin acentos**, y el caso
  «término vacío tras normalizar»). Del resto de R30 sigue vigente «cada palabra en nombres, apellidos
  o ciudad». La cláusula de los comodines queda **absorbida**: la normalización los quita.
- **R47 amplía R28**: el filtro de ciudad compara igual que la búsqueda.

Mecanismo copiado del repositorio, sin inventar nada. Detalle en `design.md > 17`.
- **Columnas:** `name_normalized` de productos, recetas y proveedores, escritas por la aplicación con
  su función `normalize*Name`.
- **Relleno:** el de `20260904160000_list_query_indexes`, con `translate` y sin `unaccent`.
- **Índices:** GIN `gin_trgm_ops` parcial `WHERE deleted_at IS NULL`, como en esa misma migración.
- **Búsqueda de pedidos por receta (QC-68):** resuelve contra `recipes.name_normalized`, es decir, con
  el mismo mecanismo.

**R41.** CUANDO el listado trae un término de búsqueda, el sistema DEBE partirlo en palabras,
normalizar cada una —sin acentos, en minúsculas y sin caracteres que no sean letras o dígitos— y
devolver solo los clientes en los que **cada palabra normalizada** aparece en la forma normalizada de
sus nombres, de sus apellidos o de su ciudad; y SI ninguna palabra conserva contenido tras
normalizarla, ENTONCES DEBE tratar el término como ausencia de búsqueda.

**R42.** CUANDO se da de alta o se edita un cliente, el sistema DEBE persistir, junto a los nombres, los
apellidos y la ciudad, su **forma normalizada**, calculada con **una única** función de normalización
del módulo, y DEBE mantener cada dato y su forma normalizada sincronizados en toda escritura.

**R43.** CUANDO se aplica la migración de esta ficha sobre una base que ya tiene clientes, vivos o dados
de baja, el sistema DEBE rellenar la forma normalizada de **todas** esas filas antes de exigirla como
no nula, y el valor rellenado DEBE coincidir con el de la función de normalización de la aplicación
para los caracteres acentuados que cubre el precedente.

**R44.** El sistema DEBE exigir **en la base** que las tres formas normalizadas no sean nulas, y NO DEBE
declarar sobre ellas ningún índice ni restricción de unicidad.

**R45.** El sistema DEBE servir la búsqueda con un índice de trigramas **parcial sobre los clientes
vivos** para cada una de las tres formas normalizadas, y la migración NO DEBE añadir, quitar ni cambiar
ninguna columna, índice ni restricción de otra tabla. Lo único que puede crear fuera de `customers` es
la extensión de trigramas, y solo si no existe ya.

**R46.** CUANDO se revierte la migración de esta ficha, el esquema DEBE quedar **exactamente** en el
estado previo: sin las tres columnas normalizadas ni sus índices, con el resto de `customers` intacto
y **sin retirar** la extensión de trigramas.

**R47.** CUANDO el listado filtra por ciudad, el sistema DEBE comparar la ciudad normalizada con el
valor del filtro normalizado, ignorando acentos y mayúsculas igual que la búsqueda; y NO DEBE devolver
ninguna forma normalizada en la ficha ni en el listado, ni declararla como campo ordenable o filtrable.

| Decisión F1.4 | Requisito(s) |
| --- | --- |
| P2 — la búsqueda ignora acentos (migración) | R41, R42, R43, R44, R45, R46, R47; R37 enmendado |
| P4 — `customer_not_found`, «El cliente solicitado no existe.» | R34 |
| P3 — orden y campos consultables | R28, R29 |
| P5 — id sin forma → `customer_not_found` sin base | R23 |
