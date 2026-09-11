# QC-71 — identificador-de-request · requirements.md

> **Zona** `fullstack` · **Complejidad** `medium` · **depends_on** `QC-70` ·
> **Rama** `feature/QC-71-identificador-de-request`
>
> ## Alcance
>
> Que **cada petición lleve un identificador propio** y que ese identificador aparezca en la
> línea de log del fallo, para poder encontrar en los registros la petición concreta que falló.
> El id se genera en el middleware, viaja hasta la capa que ya atrapa los errores, y se escribe
> **solo cuando hay error**.
>
> El **error inesperado** —el genérico de QC-70, el que sale cuando revienta algo que no está en
> el catálogo— **lleva el identificador de vuelta al navegador**, para que quien reporta el fallo
> pueda decir cuál buscar. Lo que no cambia: el mensaje sigue siendo neutro y el detalle interno
> (traza, nombres de tablas, SQL) sigue sin salir. Mostrarlo obliga a tocar los componentes de
> error de las pantallas — por eso la zona es `fullstack`.
>
> **Sin dependencia nueva:** `crypto.randomUUID()` es global en los dos runtimes.
>
> ## Lo que NO entra
>
> - **El catálogo de códigos y el tipo de error** → **QC-70**, de la que esta depende.
> - **Una línea de log por petición**, con ruta y duración. Se descartó: es volumen, y las rutas
>   del ERP llevan identificadores de pedido y de proveedor y a veces el texto buscado, que
>   `docs/architecture.md > Anti-patrones` prohíbe registrar. Anotado, sin ficha.
> - **El identificador dentro del `domain/`** de los módulos. Se queda en la capa que atrapa los
>   errores; el dominio no lo ve y no se declara ningún puerto nuevo.
> - **Ningún cambio en `db/`**: el identificador no se guarda en ninguna tabla.
> - **La política de retención o el destino de los logs.** Hoy los logs son `console.*`; esta
>   ficha no cambia adónde van.
>
> _Sembrado por `/afinar-feature` el 2026-09-07. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Enmiendas del 2026-09-10 (revisión F2.2)

El `reviewer` rechazó la primera entrega con **2 mayores y 4 menores**
(`progress/review_QC-71-identificador-de-request.md`). Ninguno era un defecto de implementación:
los dos mayores eran **defectos de redacción de este archivo**. El humano decidió, y aquí queda
escrito para que nadie lo reabra:

| # | Qué | Decisión | Efecto |
|---|---|---|---|
| Mayor 1 | R11 chocaba con R29 de QC-70 | **Enmendar R11** (Opción A) | Cero código. La salida entregada era la correcta |
| Mayor 2 | R17 no se cumple en 5 superficies que aplanan el estado a `string` | **Opción B: acotar R17 Y añadir la guardia** | R17 acotado + lista cerrada en `guard-identificador-de-request`. La Opción A —ampliar `AsyncAutocomplete`— queda **descartada** |
| Menor 1 | R9 literal prohibía el diseño que `design.md > 1` aprobó | **Reescribir R9** nombrando a sus dos módulos dueños | Requisito y guardia dicen ya lo mismo |
| Menor 2 | R13/R16 decían «identificador» a secas | **Nombrar el símbolo: `reference`** | — |
| Menor 3 | El `console.warn` por cookie ilegible es de QC-9 | **No se toca**, queda anotado en R11 | — |
| Menor 4 | El caso de R11 «camino feliz» era casi vacuo | **Hacerlo valer** | Cambio de test, no de producción |

## Requisitos (EARS)`._

## Requisitos (EARS)

### Generación del identificador (el borde)

- **R1.** CUANDO el middleware atiende una petición que entra por su `matcher`, el sistema DEBE
  generar **un** identificador de petición para esa petición, distinto del de cualquier otra.
- **R2.** El sistema DEBE obtener ese identificador de la API **global** del runtime
  (`crypto.randomUUID()`), sin importar ningún módulo de criptografía y sin añadir ninguna
  dependencia al proyecto. El valor DEBE tener el formato UUID canónico de 36 caracteres.
- **R3.** El cierre de imports completo desde `middleware.ts` DEBE seguir **sin** `node:crypto`,
  `crypto`, `@prisma/client` ni `next/headers`, y sin el cliente Prisma compartido, después de
  este cambio.
- **R4.** CUANDO el middleware deja pasar la petición, el sistema DEBE propagarla hacia el
  servidor con el identificador en la cabecera de **petición** `x-request-id`.
- **R5.** SI la petición entrante ya trae una cabecera `x-request-id` puesta por el cliente,
  ENTONCES el sistema DEBE ignorar su valor y sustituirlo por el que acaba de generar.
- **R6.** El sistema NO DEBE escribir el identificador en la respuesta HTTP hacia el navegador
  (ni cabecera de respuesta, ni cookie): el único camino de vuelta al navegador es el estado de
  error de R11.

### Recogida del identificador (la capa que ya atrapa los errores)

- **R7.** CUANDO la capa que traduce errores a estado serializable —el traductor único que dejó
  QC-70— atiende una invocación, el sistema DEBE resolver el identificador de la petición en
  curso leyendo la cabecera `x-request-id`.
- **R8.** SI la petición en curso no trae la cabecera `x-request-id`, ENTONCES el sistema DEBE
  generar un identificador de respaldo en ese momento, usarlo como si fuera el de la petición, y
  registrar en la línea de log que su **origen** fue el respaldo y no el borde.
- **R9.** El identificador NO DEBE atravesar el contrato de ningún módulo hacia adentro: ni
  aparece en el `domain/**` ni en el `ports/**` de los **módulos de negocio** —`identity`,
  `inventario`, `pedidos`, `proveedores`, `recetas` y `unidades`—, ni se declara ningún puerto
  nuevo para él **en ninguno de los módulos**.
  > **Enmendado el 2026-09-10** (revisión F2.2, menor 1), y no reabre nada: la redacción anterior
  > decía `lib/modules/*/domain/**` sin excepción, lo que **prohibía el diseño que el propio
  > `design.md > 1` aprobó** —`newRequestId` vive en `observabilidad/domain/request-id.ts` y el
  > traductor en `errores/domain/error-state.ts`—. Los dos módulos **dueños** del identificador,
  > `errores` y `observabilidad`, quedan fuera del barrido a propósito: son el sitio donde el
  > identificador tiene que estar. Lo que R9 protege —que no se cuele hacia adentro del negocio y
  > que no nazca un puerto por él— se conserva entero, y la mitad literal («ningún puerto nuevo»)
  > sigue comprobándose sobre **los ocho** módulos. Ahora el requisito y la guardia dicen lo mismo.

### Log (solo cuando falla)

- **R10.** CUANDO la capa traduce un error que **no** está en el catálogo de QC-70 —el que sale
  como error inesperado—, el sistema DEBE escribir **exactamente una** línea de log que
  contenga: el identificador, el código genérico, el origen del identificador (borde o respaldo)
  y el detalle interno del error (nombre, mensaje y traza).
- **R11.** MIENTRAS una petición no produzca un error inesperado, el sistema NO DEBE escribir
  ninguna línea de log **de esta ficha** por ella: ni al entrar, ni al salir, ni al traducir un
  error que **sí** está en el catálogo — **salvo la línea de diagnóstico que R28/R29 de QC-70 ya
  exige**, que se conserva intacta, no resuelve identificador y no lleva `reference`.
  > **Enmendado el 2026-09-10** (revisión F2.2, mayor 1). La redacción anterior —«ni al traducir un
  > error que sí está en el catálogo», sin excepción— **chocaba de frente con R29 de QC-70**
  > (`specs/QC-70-errores-centralizados/requirements.md:167`: «CUANDO el sistema entrega un error
  > al registro del servidor, DEBE escribir el código y el campo de diagnóstico»), exigido por
  > `tests/unit/errores/to-error-state.test.ts`. Los dos no podían ser ciertos a la vez.
  > **Manda QC-70**: cumplir R11 al pie de la letra obligaba a borrar una función de otra ficha y a
  > aflojar su test, que es exactamente lo que el arnés prohíbe. Lo que R11 sí exige, y se cumple:
  > el camino catalogado **no produce ninguna línea de QC-71**, no lee la cabecera y no resuelve
  > ningún identificador; el camino feliz y el catalogado sin diagnóstico no escriben **nada**.
  > **No reabrir.**
  >
  > **Nota de alcance, para que no sorprenda:** `route-guard-middleware.ts` escribe un
  > `console.warn` cuando una cookie de sesión no se puede verificar. Es de **QC-9**, no lleva
  > identificador y esta ficha **no lo toca**. Contra la letra de «ni al entrar» es una línea por
  > una petición sin error inesperado; contra lo que R11 protege —que el identificador no genere
  > ruido— no lo es.
- **R12.** La línea de log NO DEBE incluir la URL con sus parámetros, el cuerpo del formulario ni
  ningún valor introducido por quien usa la aplicación.

### Vuelta al navegador (solo con el error inesperado)

- **R13.** CUANDO una acción devuelve el error inesperado, el estado de error que llega al
  navegador DEBE incluir el identificador —el campo **`reference`**, el nombre que QC-70 dejó
  reservado para esta ficha (`error-state.ts`, «Hueco de QC-71»)— **además** del código genérico y
  el mensaje neutro, y ese identificador DEBE ser **el mismo** que se escribió en la línea de log
  de R10 para esa invocación. *(El símbolo se fija aquí el 2026-09-10, revisión F2.2, menor 2:
  `design.md > 4` marcaba su fragmento como «forma, no nombres definitivos».)*
- **R14.** El estado de error que llega al navegador NO DEBE incluir traza, nombre de tabla, SQL
  ni el mensaje del error original: el mensaje sigue siendo el neutro del catálogo.
- **R15.** CUANDO la acción devuelve un error **del catálogo**, el estado de error NO DEBE
  incluir ningún identificador.
- **R16.** El tipo del estado de error DEBE ser **cerrado** de forma que el identificador —el campo
  **`reference`**— sea **obligatorio** en la variante del error inesperado e **inexpresable** en las
  variantes catalogadas: construir un error inesperado sin `reference`, o uno catalogado con él,
  DEBE romper el typecheck. **Nada de `reference?: string`**: el opcional deja pasar los dos
  olvidos que esta ficha existe para cerrar.
- **R17.** CUANDO **una superficie que pinta la región de error de la pantalla** recibe el error
  inesperado, DEBE mostrar el identificador junto al mensaje neutro, como texto seleccionable, y
  con una etiqueta que diga para qué sirve.
  > **Acotado el 2026-09-10** (revisión F2.2, mayor 2, **Opción B**, decidida por el humano). La
  > redacción anterior decía «una pantalla» sin distinguir superficie, y hay **cinco** sitios donde
  > un `ErrorState` con el código genérico llega y su `reference` se **aplana a `string`** antes de
  > pintarse: el canal `error` de `AsyncAutocomplete` (los tres *pickers* y
  > `presentation-select`) y la tabla de ingredientes de `order-form`. **Ampliar el contrato
  > `error` de `AsyncAutocomplete` era la Opción A y quedó DESCARTADA**: no está en la lista de
  > archivos de la ficha.
  >
  > **El acotamiento no viene solo, y esa es la mitad que importa:**
  > `tests/guards/guard-identificador-de-request.test.ts` lista esas cinco superficies de forma
  > **CERRADA**, de modo que la número seis pone el gate en rojo. Sin esa guardia el agujero
  > quedaría abierto y **mudo**, y `progress/history.md > QC-70` ya dejó escrito que «la defensa
  > contra un renombrado no es la disciplina, es el tipo cerrado». Llevar `ErrorState` entero a las
  > cinco es candidato a ficha propia.
- **R18.** MIENTRAS una pantalla muestra un error del catálogo, NO DEBE mostrar ningún
  identificador.

### Lo que la ficha no mueve

- **R19.** El sistema NO DEBE persistir el identificador: esta ficha no añade migración, no toca
  `db/schema.prisma` y no escribe en ninguna tabla.
- **R20.** `package.json` DEBE quedar sin ninguna dependencia nueva respecto de `origin/dev`, y
  `docs/dependencias.md` sin ninguna fila nueva.
- **R21.** DONDE la decisión cerrada difiere el E2E, la ficha NO DEBE añadir ningún archivo en
  `e2e/`; a cambio, el cruce borde → acción DEBE quedar cubierto por un test que afirme, sobre la
  respuesta que devuelve el middleware, que el identificador viaja en las cabeceras de **petición**
  reescritas, y por la comprobación manual sobre `next build && next start` registrada en
  `progress/impl_QC-71-identificador-de-request.md` (`design.md > 3`).

## Trazabilidad — cada `R<n>` a su test

Los nombres de archivo son los que crea esta ficha (ver `tasks.md`); el implementer confirma el
mapa final en `progress/impl_QC-71-identificador-de-request.md`.

| R | Test que lo cubre |
|---|---|
| R1 | `tests/unit/observabilidad/request-id.test.ts` — dos llamadas seguidas devuelven valores distintos |
| R2 | `tests/unit/observabilidad/request-id.test.ts` — formato UUID canónico + el módulo no declara ningún `import` |
| R3 | `tests/guards/guard-middleware-edge.test.ts` (existente, sin relajar) — cierre de imports desde `middleware.ts` |
| R4 | `tests/unit/identity/route-guard-request-id.test.ts` — la respuesta de `next()` reescribe la cabecera de petición |
| R5 | `tests/unit/identity/route-guard-request-id.test.ts` — con `x-request-id` entrante, sale otro valor |
| R6 | `tests/unit/identity/route-guard-request-id.test.ts` — `response.headers.get('x-request-id')` es `null` |
| R7 | `tests/unit/observabilidad/error-state.test.ts` — con cabecera presente, el estado y el log llevan ese valor |
| R8 | `tests/unit/observabilidad/error-state.test.ts` — sin cabecera: hay id y la línea dice `origen=respaldo` |
| R9 | `tests/guards/guard-arquitectura-modulos.test.ts` (existente) + `tests/guards/guard-identificador-de-request.test.ts` — ningún `domain/`/`ports/` de los **seis módulos de negocio** menciona el identificador, y ninguno de **los ocho** declara un puerto para él |
| R10 | `tests/unit/observabilidad/error-state.test.ts` — un `console.error` con id, código, origen y detalle |
| R11 | `tests/unit/observabilidad/error-state.test.ts` — camino feliz y error catalogado sin diagnóstico: cero llamadas a `console.*`; y el catalogado ni siquiera lee la cabecera. La línea de diagnóstico de QC-70 sigue exigida por `tests/unit/errores/to-error-state.test.ts` |
| R12 | `tests/unit/observabilidad/error-state.test.ts` — la línea no contiene la URL ni el valor del formulario |
| R13 | `tests/unit/observabilidad/error-state.test.ts` — el id del estado y el de la línea son el mismo |
| R14 | `tests/unit/observabilidad/error-state.test.ts` — el estado no contiene traza, tabla ni el mensaje original |
| R15 | `tests/unit/observabilidad/error-state.test.ts` — error del catálogo: el estado no trae identificador |
| R16 | `tests/unit/observabilidad/error-state-types.test-d.ts` (`expectTypeOf`) — las dos formas prohibidas no compilan |
| R17 | `tests/unit/shared-ui/unexpected-error-notice.test.tsx` — el id se pinta y es texto, más un caso por pantalla; y `tests/guards/guard-identificador-de-request.test.ts` — la lista **cerrada** de las cinco superficies que aplanan el estado a `string`, para que la sexta salga roja |
| R18 | `tests/unit/shared-ui/unexpected-error-notice.test.tsx` + un test por pantalla tocada — error catalogado sin id |
| R19 | `tests/guards/guard-identificador-de-request.test.ts` — `db/` sin cambios: ni migración nueva ni columna |
| R20 | `tests/guards/guard-dependencias-aprobadas.test.ts` (existente) + `guard-identificador-de-request.test.ts` |
| R21 | `tests/guards/guard-identificador-de-request.test.ts` — no hay archivo nuevo en `e2e/` y existe el test de R4 |

## Preguntas abiertas

**Ninguna abierta para el humano.** Las dos que traía el sembrado las resuelve el `design.md`,
cada una con su alternativa descartada:

1. **Dónde se engancha la generación del id** → `design.md > 1`. Se engancha **dentro del
   adaptador driving que ya ocupa el middleware** (`route-guard-middleware.ts`), llamando a una
   función publicada por un módulo nuevo y cableada por `lib/composition/edge.ts`. Descartada:
   componer dos middlewares en `middleware.ts`.
2. **Cómo cruza el id del middleware a la Server Action** → `design.md > 2` y `> 3`. Cabecera de
   **petición** reescrita con `NextResponse.next({ request: { headers } })`, leída con `headers()`
   en el runtime Node; y con el respaldo de R8 como señal observable si el cruce se rompe en
   producción. Descartada: cabecera de **respuesta** + reenvío desde el cliente.

**Supuesto que se comprueba, no se pregunta (T1 de `tasks.md`).** En el árbol donde se escribió
este spec **todavía no está el merge de QC-70** (`192842a`): siguen vivas las siete copias de
`toErrorState` y no existe el catálogo cerrado. Los nombres exactos que QC-70 dejó —módulo del
catálogo, tipo `ErrorCode`, código del error genérico, nombre del traductor único— **no se
inventan aquí**: T1 los lee de `origin/dev` y los anota en la bitácora antes de escribir código.
Si al leerlos apareciera un choque real con este diseño, se para y decide el leader.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-09-07 | ¿Quien provoca el error ve el identificador? | **Sí, junto al error inesperado.** Es el motivo por el que existe la ficha: sin devolverlo, quien reporta el fallo no puede decir cuál buscar. **Reabre y sustituye la fila de QC-70** que había cerrado «ningún detalle interno»: lo que no sale sigue sin salir (traza, nombres de tablas, SQL); lo que sale es el identificador y nada más. La `description` de QC-70 y su tabla de decisiones se actualizaron el mismo día. |
| 2026-09-07 | ¿Viaja en TODAS las respuestas, o solo en el error? | **Solo en el error.** Devolverlo siempre expone un dato interno en cada petición, incluidas las públicas, a cambio de una comodidad de depuración que nadie ha pedido. |
| 2026-09-07 | ¿Hasta dónde llega el identificador dentro del servidor? | **Hasta la capa que ya atrapa los errores** — el traductor único que deja QC-70. **No llega al `domain/`**, y por tanto **no se declara ningún puerto nuevo**. Se descartó llegar al dominio a la vista de lo que costó el precedente: el puerto `ListQueryLog` de QC-57 acabó declarado **cinco veces** para una sola implementación. |
| 2026-09-07 | ¿Una línea de log por petición, o solo cuando falla? | **Solo cuando falla.** El id se genera siempre; la línea se escribe cuando hay error. **Heredado de QC-57**, cuyo log de listados dejó escrito el criterio: «un aviso por cada consulta limpia es ruido, y el ruido acaba en un filtro de logs que también se traga el aviso que importa». |
| 2026-09-07 | ¿Librería de identificadores? | **Ninguna.** `crypto.randomUUID()` es global en el runtime del borde y en Node, así que no hace falta importar nada — lo cual además es condición para pasar `guard-middleware-edge`, que prohíbe importar `node:crypto` y `crypto`. Cero dependencias nuevas, cero paradas de la regla 7. |
| 2026-09-07 | ¿Hace falta E2E? | **No, y se difiere aquí con motivo.** El comportamiento visible no cambia: nadie entra ni deja de entrar a ninguna pantalla por esto. Que el id sea el mismo en el middleware y en la acción, y que aparezca en la línea del fallo, se prueba sin navegador. **Heredado de QC-54 y QC-70.** |
| 2026-09-07 | ¿El identificador se guarda en alguna tabla? | **No.** Vive en la petición y en el log. Una tabla de errores es otra ficha y nadie la ha pedido. |

### Cobertura de la tabla: cada decisión, en al menos un requisito

| Decisión | Requisitos que la hacen exigible |
|---|---|
| Ve el identificador junto al error inesperado | R13, R17 |
| Solo en el error, no en toda respuesta | R6, R15, R16, R18 |
| Llega hasta el traductor, no al `domain/`, sin puerto nuevo | R7, R9 |
| Una línea solo cuando falla | R10, R11 |
| Ninguna librería | R2, R3, R20 |
| Sin E2E, diferido con motivo | R21 |
| No se guarda en ninguna tabla | R19 |
