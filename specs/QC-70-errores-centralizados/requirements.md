# QC-70 — errores-centralizados · requirements.md

> **Zona** `fullstack` · **Complejidad** `high` · **depends_on** `QC-54` ·
> **Rama** `feature/QC-70-errores-centralizados`
>
> ## Alcance
>
> Dejar **un solo sitio donde vivan el código de error y su mensaje**. Hoy cinco módulos
> (`inventario`, `pedidos`, `proveedores`, `recetas`, `unidades`) declaran cada uno su familia
> de errores, y **siete** adaptadores driving llevan copiada la misma `toErrorState` que la
> convierte en `{ status: 'error', code, message }`. Entra el catálogo único, una sola
> implementación del traductor, y los cinco módulos migrados.
>
> El código **sigue siendo una palabra estable** (`duplicate_name`), no un número: siete
> pantallas ya deciden por él y en un log se lee solo. El catálogo pasa a ser **cerrado** —el
> código deja de ser `string` y pasa a ser la lista, así que uno mal escrito rompe el
> typecheck— y una **guardia ejecutable** da rojo si un módulo declara errores fuera de él.
>
> Los códigos **se abren por caso concreto**: `not_found` hoy significa cinco cosas distintas
> según quién lo lance, y un código con un solo mensaje no puede decir a la vez «el pedido» y
> «la receta». Las pantallas que hoy comparan contra el código genérico se actualizan — por eso
> la zona es `fullstack`.
>
> El mensaje sale **siempre** del catálogo, y el catálogo mapea el código a una **clave
> estable** y la clave a su texto, con el español como único idioma cargado. Eso es «preparado
> para traducir» **por forma**, sin librería y sin dependencia nueva.
>
> ## Lo que NO entra
>
> - **El identificador de petición y lo que se escribe en los logs** → **QC-71**, que depende
>   de esta.
> - **La internacionalización de la aplicación** → **QC-72**. QC-70 deja las claves; resolverlas
>   contra archivos de idioma, y elegir la librería, es una decisión de toda la aplicación que
>   hoy no está tomada en ningún sitio.
> - **`identity`.** No tiene familia de errores que migrar, y su login devuelve **a propósito**
>   un mensaje genérico que no revela si falló el usuario o la contraseña (QC-7). Meterlo al
>   catálogo sin romper eso es trabajo distinto. Anotado, sin ficha — mismo criterio con el que
>   QC-54 dejó fuera el tipo `Actor`.
> - **Ningún cambio en `db/`**: ni migración, ni esquema, ni seed. No hay tabla de errores.
> - **El valor de los códigos que ya consumen las pantallas no se renombra por gusto**: solo
>   cambian los que la apertura por caso obliga a partir.
>
> _Sembrado por `/afinar-feature` el 2026-09-07. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`._

## Lo que el código dice hoy (contado, no recordado)

Verificado sobre el árbol de este worktree el 2026-09-08. Corrige y precisa los números de la
ficha; **ninguna decisión cerrada cambia por esto**.

- **Cinco familias**, una por módulo, en `lib/modules/<m>/domain/errors.ts`: `InventarioError`,
  `PedidosError`, `ProveedoresError`, `RecetasError`, `UnidadesError`. Confirmado.
- **31 clases** de error concretas repartidas así: inventario 5, pedidos 8, proveedores 5,
  recetas 4, unidades 9. Entre ellas declaran **16 valores de `code` distintos**, porque
  `unauthorized`, `invalid_input`, `not_found` y `duplicate_name` se repiten en varios módulos
  con **mensajes distintos** en el caso de los dos últimos.
- **Siete adaptadores driving** con la misma `toErrorState` copiada, byte a byte:
  `inventario/.../product-actions.ts`, `inventario/.../presentation-actions.ts`,
  `pedidos/.../order-actions.ts`, `proveedores/.../supplier-actions.ts`,
  `proveedores/.../supplier-catalog-actions.ts`, `recetas/.../recipe-actions.ts`,
  `unidades/.../unit-actions.ts`. Confirmado.
- **Once archivos de UI** deciden o fabrican un `code` (la ficha decía «siete pantallas»; siete
  son las **rutas**, once los archivos). Lista exacta en `design.md > 4`.
- **Los cinco barrels** (`lib/modules/<m>/index.ts`) reexportan clases de error, así que la
  apertura por caso los toca a los cinco.
- **Discrepancia con la fila 4 de la tabla de decisiones, confirmada y corregida el 2026-09-08:**
  hoy las siete copias del traductor **NO** devuelven un código genérico ante un error ajeno —
  hacen `throw error`. Hay tests que fijan ese relanzado (`rejects.toBe(ajeno)` en las suites de
  acciones de los cinco módulos). La decisión cerrada («código genérico y mensaje neutro») se
  mantiene y se confirmó; lo falso era la frase que la justificaba («es lo que ya hacen las siete
  copias»). Queda escrito en «Fila 4 — la justificación anterior y por qué era falsa», bajo la
  tabla de decisiones, y arrastra dos consecuencias: los cinco tests se reescriben y entra un
  E2E (R33).

## Requisitos (EARS)

**Catálogo: forma y cierre**

- **R1.** El sistema DEBE publicar **un** catálogo de errores en el que cada código tenga
  exactamente una clave estable y cada clave exactamente un texto en español.
- **R2.** El sistema DEBE tratar el catálogo como **cerrado**: el tipo del código es la unión de
  los literales declarados, de modo que un código que no esté en la lista NO compila.
- **R3.** El sistema DEBE mantener el código como **palabra estable** en minúsculas con guion
  bajo (`duplicate_symbol`), y NO DEBE usar números ni identificadores opacos.
- **R4.** El catálogo NO DEBE contener dos códigos con el mismo texto: si dos casos necesitan
  frases distintas, son códigos distintos, y si necesitan la misma frase, son el mismo código.
- **R5.** El sistema DEBE mapear el código a una **clave estable** y la clave al texto, con el
  español como único idioma cargado, y NO DEBE incorporar ninguna dependencia nueva para ello.

**Familias por módulo y migración**

- **R6.** Cada uno de los cinco módulos (`inventario`, `pedidos`, `proveedores`, `recetas`,
  `unidades`) DEBE conservar su clase base de error, y toda clase de error del módulo DEBE
  derivar de ella.
- **R7.** CUANDO una clase de error de dominio se construye, el sistema DEBE tomar su mensaje
  del catálogo a partir de su código, y NO DEBE admitir un mensaje pasado por el sitio que lanza.
- **R8.** Todo código declarado por una clase de error de cualquiera de los cinco módulos DEBE
  existir en el catálogo.
- **R9.** El catálogo NO DEBE contener entradas que ningún módulo pueda emitir, con la única
  excepción del código genérico de R14.
- **R10.** El sistema DEBE tener **una sola** implementación del traductor de error de dominio a
  estado serializable, y los siete adaptadores driving DEBEN usarla; ningún otro archivo del
  repositorio DEBE definir una propia.

**Traducción y error genérico**

- **R11.** CUANDO el traductor recibe un error de la familia del módulo, DEBE devolver
  `{ status: 'error', code, message }` con el código de la clase y el mensaje del catálogo, y NO
  DEBE decidir por el texto del error.
- **R12.** CUANDO el traductor recibe un error que NO pertenece a la familia del módulo, DEBE
  devolver el estado de error con el **código genérico** y su mensaje neutro del catálogo.
- **R13.** El estado de error genérico NO DEBE contener el mensaje original, la traza, nombres de
  tabla, SQL ni ningún otro detalle interno.
- **R14.** CUANDO el traductor produce el estado genérico, el sistema DEBE entregar el error
  original al registro del servidor, que es el único sitio donde ese detalle aparece.
- **R15.** La forma del estado de error DEBE declarar el hueco **opcional** de la referencia de
  petición, y QC-70 DEBE dejarlo siempre sin rellenar (lo rellena QC-71).

**Apertura por caso concreto**

- **R16.** El catálogo NO DEBE contener los códigos genéricos `not_found` ni `duplicate_name`.
- **R17.** El sistema DEBE distinguir por código cada caso concreto de «no existe»:
  `product_not_found`, `presentation_not_found`, `order_not_found`, `supplier_not_found`,
  `catalog_line_not_found`, `recipe_not_found` y `unit_not_found`.
- **R18.** El sistema DEBE distinguir por código cada caso concreto de «nombre repetido»:
  `presentation_duplicate_name`, `supplier_duplicate_name`, `recipe_duplicate_name` y
  `unit_duplicate_name`.
- **R19.** El sistema DEBE conservar sin renombrar los códigos que hoy ya son inequívocos:
  `unauthorized`, `invalid_input`, `presentation_in_use`, `invalid_transition`,
  `not_cancellable`, `not_deletable`, `duplicate_number`, `duplicate_catalog_line`,
  `duplicate_symbol`, `system_unit`, `invalid_derivation`, `unit_in_use` e
  `incompatible_units`.
- **R20.** CUANDO una pantalla decide por el código, DEBE compararlo contra el código abierto que
  corresponde a su caso, y NO DEBE quedar ninguna comparación contra `not_found` ni contra
  `duplicate_name` en `app/**` ni en `components/**`.
- **R21.** DONDE una pantalla fabrica ella misma un estado de error (entrada que no llega a
  formarse), el código fabricado DEBE ser uno del catálogo.

**Guardia**

- **R22.** SI un módulo declara una clase de error cuyo código no está en el catálogo, ENTONCES
  la guardia DEBE fallar nombrando el archivo y el código.
- **R23.** SI un archivo distinto del traductor único define su propia traducción de error a
  `{ status: 'error', … }`, ENTONCES la guardia DEBE fallar nombrando el archivo.
- **R24.** SI una clase de error de dominio admite un mensaje por parámetro, ENTONCES la guardia
  DEBE fallar (R7 dejaría de estar protegida en el futuro).

**Frontera con lo que no entra**

- **R25.** El sistema NO DEBE modificar `db/` ni `lib/modules/identity/**`, y el catálogo NO DEBE
  contener ningún código de `identity`; el mensaje genérico del login sigue siendo el que fija
  QC-7.
- **R26.** El sistema DEBE conservar el contrato de QC-54: la fábrica de permisos de cada módulo
  sigue recibiendo el `UnauthorizedError` **de su módulo**.
- **R27.** Salvo el valor del código, el texto de los mensajes que la apertura por caso obliga a
  precisar y el paso del relanzado al estado genérico (R12), el comportamiento observable de los
  cinco módulos y de las siete rutas NO DEBE cambiar.
  *(Reformulado el 2026-09-08: la redacción anterior añadía «y no entra ninguna prueba E2E
  nueva», que decae con la decisión de ese día; ver «¿Hace falta E2E?» bajo la tabla.)*

**Diagnóstico: al log, nunca al navegador** _(decisión cerrada del 2026-09-08)_

- **R28.** DONDE un error de dominio tenga un dato variable que ayude a diagnosticarlo (el estado
  de origen y el de destino de una transición, los identificadores de dos unidades, el factor), el
  sistema DEBE llevar ese dato en un **campo de diagnóstico del error**, separado del mensaje.
- **R29.** CUANDO el sistema entrega un error al registro del servidor, DEBE escribir el código y
  el campo de diagnóstico; y CUANDO lo serializa hacia el navegador, el objeto resultante NO DEBE
  contener el campo de diagnóstico ni ningún dato variable: solo `status`, `code`, `message` y, en
  su día, `reference`.
- **R30.** SI alguien añade el campo de diagnóstico —o cualquier campo no declarado— a la forma
  serializada del error, o lo lee desde `app/**` o `components/**`, ENTONCES la guardia DEBE
  fallar nombrando el archivo.

**Frontera con la validación del front** _(decisión cerrada del 2026-09-08)_

- **R31.** El sistema NO DEBE cambiar los mensajes que la UI escribe para **sus propias**
  comprobaciones de formulario (campo requerido, formato, «Revisa los campos marcados»): esta
  ficha no toca la validación del front.
- **R32.** CUANDO el back devuelve un error, la pantalla DEBE mostrar el mensaje del catálogo para
  ese código, y NO DEBE sustituirlo por un texto propio para ese mismo caso.

**Prueba de extremo a extremo** _(decisión cerrada del 2026-09-08)_

- **R33.** CUANDO una acción de servidor falla con un error que NO es de dominio, la pantalla DEBE
  seguir en pie y mostrar el mensaje neutro del código genérico, y el navegador NO DEBE recibir
  ningún detalle interno ni caer en la pantalla de error del framework. Se verifica con **una**
  prueba E2E.

## Preguntas abiertas

1. ~~**Dónde vive el catálogo.**~~ **RESUELTA en `design.md > 2`.** El `domain/` de un módulo no
   puede importar `lib/shared/**`, pero sí el **barrel de otro módulo**
   (`docs/architecture.md > La regla de dependencias`, y lo confirma
   `guard-arquitectura-modulos.test.ts`: «el barrel del propio o de otro modulo» está permitido
   también desde `driven` y `driving`). El catálogo vive en un **módulo nuevo**,
   `lib/modules/errores/`, con solo `index.ts` + `domain/`. Alternativas descartadas y motivo,
   en `design.md > 2.3`.
2. ~~**Los mensajes con detalle incrustado.**~~ **CERRADA el 2026-09-08.** El dato variable va al
   **log del servidor y nunca al navegador**, en un campo de diagnóstico que no se serializa. Es
   la misma regla que ya regía para el error genérico, así que ahora es una sola. Fila propia en
   la tabla de decisiones; requisitos **R28-R30**; forma en `design.md > 4.2`.
3. ~~**El relanzado que hoy existe y R12 cambia.**~~ **CERRADA el 2026-09-08.** Confirmado: el
   error ajeno se traduce a código genérico y los cinco tests que fijan el relanzado se
   reescriben. Consecuencia aceptada: **sí entra E2E** (R33) y la fila «¿Hace falta E2E?» se
   reescribió, conservando debajo de la tabla su redacción anterior y el motivo del cambio.

**No queda ninguna pregunta abierta.**

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-09-07 | ¿El código es un número (`code: 30`), como pedía la ficha original? | **No: sigue siendo una palabra estable.** Siete pantallas ya comparan contra `'duplicate_name'`, `'not_found'` e `'invalid_input'`, y un número obligaría a tocarlas todas y a mantener una tabla aparte para leer un log. Lo que se arregla no es la forma del código, sino que la lista viva en un sitio y no en cinco. |
| 2026-09-07 | «Un solo tipo de error»: ¿desaparecen las cinco familias por módulo? | **No.** Cada módulo conserva la suya y toma de ahí el código y el mensaje; lo que se unifica es el catálogo y las siete copias del traductor, que pasan a ser una. **Heredado de QC-54 (2026-09-07)**, que descartó un error compartido por la misma razón: no puede heredar de cinco bases a la vez y caería fuera de los siete `catch` que hoy funcionan. |
| 2026-09-07 | ¿La ficha construye la pieza, o además migra? | **Migra los cinco módulos** y borra las siete copias de `toErrorState`. Solo construir la pieza dejaría seis formas vivas a la vez y nada obligaría a cerrar la migración, o sea añadiría duplicación en vez de quitarla. |
| 2026-09-07 · **corregida el 2026-09-08** | ¿Qué ve quien provoca un error que NO está en el catálogo (fallo de base de datos, bug)? | **Un código genérico y mensaje neutro.** El detalle real va al log del servidor y **nunca** al navegador: un mensaje de Prisma en pantalla filtra nombres de tablas y a veces datos. **La decisión no cambia; se corrige su justificación, que era falsa** — ver «Fila 4 — la justificación anterior y por qué era falsa», debajo de la tabla. |
| 2026-09-07 | **(revisada el mismo día, al acotar QC-71)** ¿El error genérico lleva alguna referencia para buscarlo en el log? | **Sí la lleva, y esta fila SUSTITUYE a la anterior en ese punto.** Al acotar QC-71 se decidió que el identificador de petición acompaña al error inesperado, para que quien reporta el fallo pueda decir cuál buscar — que es el motivo por el que QC-71 existe. **Lo que no cambia:** el mensaje sigue siendo neutro y el detalle interno (traza, nombres de tablas, SQL) sigue sin salir al navegador. QC-70 deja el hueco en la forma del error; QC-71 lo rellena. La `description` del board se actualizó el mismo día. |
| 2026-09-07 | `not_found` significa hoy cinco cosas. ¿Un código o uno por caso? | **Uno por caso concreto.** Es lo único compatible con que cada código tenga UN mensaje. El catálogo nace con ~20 entradas en vez de ~6, y las pantallas que comparan contra el código genérico se actualizan. |
| 2026-09-07 | ¿El mensaje se puede sobreescribir en el sitio que lanza? | **No: sale siempre del catálogo.** Poder sobreescribirlo dejaría el mensaje fuera del catálogo, que es justo lo que la ficha centraliza, y nada impediría que la frase volviera a escribirse en cinco sitios. |
| 2026-09-07 | ¿Entra algo contra la reincidencia? | **Sí: guardia ejecutable en `tests/guards` y catálogo cerrado.** La guardia da rojo si un módulo declara errores fuera del catálogo; el tipo cerrado hace que un código mal escrito rompa el typecheck. **Mismo criterio que QC-54**: sin ella la ficha limpia el presente y no el futuro, que es el motivo por el que existe. |
| 2026-09-07 | ¿Los mensajes se pueden traducir? | **Preparado por forma, sin librería.** El catálogo mapea código → clave estable y clave → texto, con el español como único idioma cargado. **No entra ninguna dependencia**: la internacionalización de la aplicación es QC-72, creada al acotar esta. |
| ~~2026-09-07~~ · **reescrita el 2026-09-08** | ¿Hace falta E2E? | **Sí, uno, y acotado.** El motivo de la versión anterior —«no hay cambio de comportamiento observable»— resultó falso al leer el código: el error ajeno hoy se **relanza**, y traducirlo a genérico **sí se ve en un navegador**. Entra **un** E2E sobre el camino del error inesperado; el resto sigue cubierto por los unitarios de los cinco módulos y de los once archivos de UI. Redacción anterior y motivo del cambio, debajo de la tabla. |
| 2026-09-07 | ¿Antes o después de QC-54? | **Después: `depends_on: QC-54`.** QC-54 está sembrada, con worktree montado, y su decisión cerrada parametriza `requireAdmin` por una fábrica que recibe **el `UnauthorizedError` de cada módulo**. QC-70 toca esos mismos cinco `domain/errors.ts`. El que llegue segundo se come el conflicto, y QC-54 llegó primero. |
| **2026-09-08** | Cuatro sitios construyen hoy el error con un texto que **lleva datos** (`Un pedido en estado X no puede pasar a Y`, ids de unidad, el factor). Si el mensaje sale del catálogo, ¿ese dato se pierde? | **No se pierde: va al log del servidor, y NUNCA al navegador.** La forma del error gana un **campo de diagnóstico** que se escribe en el registro y **no se serializa al cliente**. Ejemplo aprobado: navegador → «Las unidades no son compatibles.»; log → `unit_incompatible` + `no se puede convertir litro a gramo`. Es **la misma regla** que ya regía para el error genérico —detalle al log, mensaje neutro a pantalla—, así que a partir de hoy es **una sola regla** y no dos. Cierra la pregunta abierta 2. |
| **2026-09-08** | ¿Se confirma que el error ajeno pasa de relanzarse a traducirse a genérico, sabiendo que **sí** cambia el comportamiento? | **Confirmado.** Se traduce a código genérico, tal como decía la fila 4, y **los cinco tests que hoy fijan el relanzado con `rejects.toBe(ajeno)` se reescriben**. Consecuencia aceptada y anotada: la fila «¿Hace falta E2E?» queda desfasada y se reescribe. Cierra la pregunta abierta 3. |
| **2026-09-08** | «El mensaje sale siempre del catálogo», ¿alcanza también a las validaciones del formulario? | **No. La validación del front se queda como está: esta ficha no la toca.** Los mensajes que el front escribe para sus propias comprobaciones de formulario (campo requerido, formato, «Revisa los campos marcados») siguen donde están y con su texto. **Pero cuando el back emite un error, el mensaje de su código en el catálogo MANDA** sobre cualquier texto que el front tuviera para ese caso. Sin esta fila, «siempre del catálogo» se podía leer como que había que migrar la validación de formulario, y no es eso. |

### Fila 4 — la justificación anterior y por qué era falsa

**Decía, hasta el 2026-09-08:**

> …un mensaje de Prisma en pantalla filtra nombres de tablas y a veces datos. **Es lo que ya hacen
> las siete copias del traductor; se conserva.**

**Por qué era falsa.** Las siete copias **no** hacen eso: hacen `throw error`. Verificado archivo a
archivo el 2026-09-08 (§ «Lo que el código dice hoy»), y además hay cinco suites de acciones que
**fijan** ese relanzado con `rejects.toBe(ajeno)`. O sea que lo que la fila describía como
«conservar» era en realidad **estrenar**. La **decisión** (código genérico, mensaje neutro) se
mantiene intacta —la cerró el humano y el 2026-09-08 la confirmó—; lo que se corrige es la frase
que la justificaba, para que el próximo que lea la tabla no dé por hecho que el código ya se
comportaba así.

### «¿Hace falta E2E?» — la versión anterior y por qué cambia

**Decía, hasta el 2026-09-08:**

> | 2026-09-07 | ¿Hace falta E2E? | **No, y se difiere aquí con motivo.** No hay cambio de
> comportamiento observable: la prueba de que nada se movió son los tests de los cinco módulos y
> los de las siete pantallas, que deben seguir verdes cambiando solo el código que se comparaba.
> **Heredado de QC-54.** |

**Por qué cambia.** Su motivo se apoyaba entero en «no hay cambio de comportamiento observable», y
eso ya no se sostiene: al confirmarse que el error ajeno pasa de **relanzarse** (pantalla de error
del framework) a **devolverse como estado genérico** (mensaje neutro dentro de la pantalla), hay un
cambio que **se ve en un navegador y no se ve en un unitario**. El unitario prueba que el traductor
devuelve el estado correcto; no prueba que la pantalla lo pinte en vez de romperse. Por eso entra
**un** E2E, el mínimo que cubre ese salto (R33), y no una batería: el resto del cambio —valores de
código y textos— sí lo cubren los unitarios de siempre, y ahí el motivo heredado de QC-54 sigue
siendo bueno.
