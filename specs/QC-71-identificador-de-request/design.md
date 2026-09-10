# QC-71 — identificador-de-request · design.md

> Cubre `requirements.md` R1–R21. Las dos preguntas del sembrado se cierran en **§1** y **§2–§3**,
> cada una con la alternativa descartada. **No hay dependencia nueva** (§7).

## 0. Lo que hay hoy, leído del código (no supuesto)

- `middleware.ts` (raíz) es un **cascarón**: una línea de reexport y el `matcher`.
  `tests/unit/middleware-root-contract.test.ts` afirma sobre el **texto** del archivo que contiene
  exactamente `export { middleware } from '@/lib/modules/identity/adapters/driving/route-guard-middleware'`,
  que no hay `redirect(`, ni `/login`, ni `/dashboard`, ni `subtle`, ni `adapters/driven`.
- `lib/modules/identity/adapters/driving/route-guard-middleware.ts` es el único middleware real:
  lee la cookie de la `NextRequest`, verifica con `identityEdge` y devuelve `NextResponse.next()` o
  `NextResponse.redirect()`.
- `lib/composition/edge.ts` es la mitad edge-safe del punto de composición; existe justo para que
  el borde no arrastre Prisma. `guard-arquitectura-modulos` autoriza el import de driven por
  **prefijo** `lib/composition/**`, así que ampliar ese archivo no ensancha ninguna frontera.
- `tests/guards/guard-middleware-edge.test.ts` recorre el **cierre de imports** desde
  `middleware.ts` y prohíbe `node:crypto`, `crypto`, `@prisma/client`, `next/headers` y
  `lib/shared/db/prisma`. Además ancla que el recorrido llega hasta `session-token.ts` y **no**
  hasta `lib/composition/index.ts`.
- **Aviso de estado del árbol:** en el checkout donde se escribió este spec **no está el merge de
  QC-70** (`192842a`): siguen las siete copias de `toErrorState` (que hoy **relanzan** el error no
  catalogado en vez de traducirlo a un genérico) y no existe el catálogo cerrado. Este diseño se
  apoya en lo que QC-70 dejó **por rol** —«el traductor único», «el código genérico», «el tipo
  `ErrorCode` cerrado»—; los **nombres exactos** los fija T1 leyendo `origin/dev`, no este
  documento (regla 6 de `CLAUDE.md`).

## 1. Pregunta abierta 1 — dónde se engancha la generación del id

**Decisión: la generación vive en un módulo propio, y el único que la llama en el borde es el
adaptador driving que ya ocupa el middleware (`route-guard-middleware.ts`), a través de
`lib/composition/edge.ts`.** `middleware.ts` **no se toca**.

Reparto concreto:

| Pieza | Archivo | Qué hace |
|---|---|---|
| Regla | `lib/modules/observabilidad/domain/request-id.ts` | `newRequestId(): string` → `crypto.randomUUID()` (global, **cero imports**) y `REQUEST_ID_HEADER = 'x-request-id'` |
| Contrato | `lib/modules/observabilidad/index.ts` | reexporta solo de `./domain` |
| Cableado borde | `lib/composition/edge.ts` | añade la fachada `observabilidadEdge = { newRequestId, requestIdHeader }` |
| Enganche | `lib/modules/identity/adapters/driving/route-guard-middleware.ts` | 4 líneas: genera, reescribe la cabecera de petición, sigue igual en todo lo demás |

Por qué esta y no otra:

- **No hay ningún sitio legal donde componer dos middlewares.** `lib/composition/**` tiene
  **prohibido** importar `adapters/driving/**` (`docs/architecture.md > La regla de dependencias`),
  y `lib/shared/**` no puede importar módulos. El único archivo que puede encadenar dos adaptadores
  driving es `middleware.ts`, y ahí el encadenado sería una decisión escrita en la raíz — lo que el
  contrato de QC-9 prohíbe por texto.
- **El coste real de meterlo en el portero es pequeño y está acotado:** el adaptador no gana ninguna
  *regla*, gana un *cableado*. La lógica (cómo se genera, cómo se llama la cabecera) vive fuera de
  `identity`, en un módulo cuyo nombre dice de qué va. Si mañana el id lo necesita otro punto de
  entrada (un route handler), ya está publicado y no hay que sacarlo de `identity`.
- **La restricción dura se cumple por construcción:** `newRequestId()` no importa nada —usa el
  global `crypto.randomUUID()`—, así que el cierre de imports desde `middleware.ts` no crece con
  ningún paquete prohibido (R3). La guardia existente **no se toca ni se relaja**; T5 le añade la
  aserción de que el nuevo archivo entra en el cierre, para que el recorrido siga demostrando que
  mira de verdad.

### Alternativa descartada 1.a — encadenar dos middlewares en `middleware.ts`

`middleware.ts` pasaría a algo como `export async function middleware(req) { const res = await
withRequestId(req); return routeGuard(req, res) }`. Se descarta por tres motivos, y el primero solo
ya basta:

1. **Rompe `tests/unit/middleware-root-contract.test.ts`**, que exige la línea de reexport literal y
   que no haya decisiones en la raíz. Cambiar ese test es reabrir el contrato de QC-9 desde una
   ficha de plataforma.
2. **Inventa un punto de composición que hoy no existe** y que la tabla de dependencias no permite
   colocar en `lib/composition`. Un patrón de composición de middlewares es una decisión de
   arquitectura, no un efecto colateral de esta ficha.
3. **Duplica el trabajo del borde**: el orden entre portero y generador pasaría a importar (un
   `redirect` del portero cortaría al generador o al revés), y ese es exactamente el tipo de bug
   que no se ve hasta producción.

### Alternativa descartada 1.b — generar el id en la propia Server Action

Sin middleware: el traductor genera su id cuando falla. Es más simple y elimina el cruce entero
(§2). Se descarta porque **el Alcance sembrado fija que el id se genera en el middleware**, y
porque un id creado en el momento del fallo solo identifica esa invocación, no la petición: si
mañana entra QC-73 (`limite-de-peticiones-por-origen`, que depende de esta) o un segundo punto que
quiera correlacionar, el id ya no correlaciona nada. Lo que sí se conserva de esta idea es el
**respaldo** de R8, que es esta misma alternativa degradada a red de seguridad.

## 2. Pregunta abierta 2 — cómo cruza el id a la Server Action

**Decisión: cabecera de PETICIÓN reescrita en el borde y leída con `headers()` en Node.**

```
navegador ── POST (Server Action) ──▶ middleware (edge)
                                       genera id, NextResponse.next({ request: { headers } })
                                       ──▶ runtime Node: la acción ve `x-request-id` en headers()
```

- **Escritura (borde).** Se clona `request.headers`, se hace `set('x-request-id', id)` —`set`, no
  `append`: sobrescribe lo que venga del cliente (R5)— y se devuelve
  `NextResponse.next({ request: { headers } })`. Esa forma es la única que reescribe la petición que
  llega **al servidor**; poner la cabecera sobre `response.headers` la mandaría al **navegador** y
  la acción no la vería nunca (además de violar R6). **Este es el error clásico y es el que el test
  de T5 ancla.**
- **Lectura (Node).** El traductor único de QC-70 llama `await headers()` de `next/headers` y lee
  `x-request-id`. `next/headers` está prohibido **en el cierre del borde**, no en el servidor: el
  traductor no está en ese cierre y la guardia lo seguirá demostrando (R3).
- **El redirect no lleva id.** Cuando el portero redirige no hay nada corriendo después en el
  servidor; el id de esa petición no se usa. No se propaga a propósito, para no inventar un canal
  que nadie lee.
- **Rutas fuera del `matcher`** (estáticos) no reciben id y no lo necesitan: no ejecutan acciones.

### Alternativa descartada 2.a — cabecera de RESPUESTA + reenvío desde el cliente

El middleware pone `x-request-id` en la respuesta, el navegador lo lee y lo reenvía en la siguiente
petición. Se descarta: (i) expone el identificador en **todas** las respuestas, que es exactamente
lo que la decisión cerrada «solo en el error» prohíbe; (ii) el valor pasaría a ser **entrada del
cliente**, o sea manipulable, y acabaría en el log sin validar; (iii) obliga a tocar el cliente para
algo que el servidor puede resolver solo.

### Alternativa descartada 2.b — `AsyncLocalStorage` en un wrapper de acciones

Contexto por invocación sin cabeceras. Se descarta: no existe en el runtime del borde, así que el
id tendría que nacer en Node de todas formas (vuelve a 1.b), y obligaría a envolver las ~20 Server
Actions con un `withRequestContext` — una capa nueva para toda la aplicación en una ficha
`medium`.

## 3. Cómo se prueba el cruce, que es la parte que puede fallar en producción sin que nadie lo note

El sembrado avisa de que este es el mismo modo de fallo que motivó `guard-middleware-edge`. Se
ataca en **tres** niveles, porque ninguno solo basta:

1. **Test de unidad sobre la respuesta del middleware** (`tests/unit/identity/route-guard-request-id.test.ts`).
   Se invoca el handler con una `NextRequest` real y se afirma sobre el objeto devuelto que la
   cabecera viaja en las **cabeceras de petición reescritas** —el mecanismo que Next usa para
   `next({ request })`, `x-middleware-override-headers` y su `x-middleware-request-x-request-id`— y
   que `response.headers.get('x-request-id')` es `null` (R4, R6). Esto caza el error de poner la
   cabecera en la respuesta, que es el fallo probable.
2. **Centinela de versión de Next** (`tests/guards/guard-identificador-de-request.test.ts`). El
   mecanismo del punto 1 es interno de Next y puede cambiar de forma en una actualización. La
   guardia compara la versión de `next` en `package.json` con la versión contra la que se verificó
   a mano (constante en el propio test, con la fecha) y **falla con un mensaje que pide repetir la
   comprobación manual** si no coinciden. No comprueba que funcione: comprueba que nadie cambie el
   suelo sin volver a mirar.
3. **Señal en producción, sin test** (R8). Si el cruce se rompe, el traductor no encuentra la
   cabecera, usa el respaldo y **cada línea de log dice `origen=respaldo`**. Es la propiedad más
   valiosa del diseño: el fallo silencioso deja de ser silencioso, y no cuesta nada porque el
   respaldo hacía falta igual para que nunca haya error sin id.
4. **Comprobación manual, registrada** (T10). `pnpm build && pnpm start`, provocar un error
   inesperado (por ejemplo apuntando `DATABASE_URL` a un puerto muerto), y comprobar que el id que
   pinta la pantalla es el mismo que el de la línea del log y que dice `origen=borde`. La evidencia
   —las dos cadenas— se pega en `progress/impl_QC-71-identificador-de-request.md`. Es lo que
   sustituye al E2E que la decisión cerrada difiere; sin ella la ficha no se cierra.

## 4. Forma del error: el hueco de QC-70, rellenado con un tipo cerrado

La lección escrita en `progress/history.md > QC-70` es literal: **«la defensa contra un renombrado
no es la disciplina, es el tipo cerrado»**. Así que el identificador no entra como campo opcional
—`requestId?: string` dejaría pasar los dos errores que importan: olvidarlo en el genérico y
colarlo en un catalogado—, sino como **rama propia de la unión**, discriminada por el código
genérico:

```ts
// forma, no nombres definitivos: los símbolos de QC-70 los fija T1
export type ErrorState =
  | { status: 'error'; code: Exclude<ErrorCode, typeof UNEXPECTED_CODE>; message: string }
  | { status: 'error'; code: typeof UNEXPECTED_CODE; message: string; requestId: string };
```

Consecuencias, que son justo los requisitos:

- Construir el inesperado sin `requestId` → error de tipos (R16).
- Poner `requestId` en uno catalogado → error de tipos (R16).
- En la pantalla, `state.requestId` **solo existe** tras estrechar por `code === UNEXPECTED_CODE`,
  así que R17/R18 los vigila el compilador además del test.

El traductor único queda, en pseudocódigo:

```
si el error pertenece al catálogo  -> { status:'error', code, message }            (sin log, sin id)
si no                              -> id = cabecera ?? respaldo
                                      console.error(linea(id, origen, error))       (R10, R12)
                                      { status:'error', code: UNEXPECTED, message: neutro, requestId: id }
```

## 5. Formato de la línea de log

Una sola línea, `console.error`, campos `clave=valor` para poder buscar por `requestId=` en los
registros de Vercel:

```
[error] requestId=<uuid> origen=borde|respaldo code=<codigo generico> error=<name>: <message>
<stack>
```

- **Sí lleva** nombre, mensaje y traza del error original: es la mitad que QC-70 decidió mandar al
  log y no al navegador.
- **No lleva** URL con parámetros, `formData`, ni ningún valor introducido por el usuario (R12) —
  `docs/architecture.md > Anti-patrones` prohíbe registrar PII, y las rutas del ERP llevan
  identificadores de pedido y proveedor. Es la misma razón por la que el Alcance descartó la línea
  por petición.
- **No hay línea de éxito** (R11). El criterio heredado de QC-57 manda: el ruido acaba en un filtro
  que también se traga el aviso que importa.
- Destino: `console.error`, como todo hoy. Cambiarlo es otra ficha (Alcance).

## 6. Superficie de UI

Un único componente compartido, `components/shared/unexpected-error-notice.tsx`, que pinta el
mensaje neutro y debajo el identificador como texto seleccionable con su etiqueta («Código para
soporte: <uuid>»). Va a `components/shared/` y no junto a una ruta porque lo necesitan **las siete
pantallas** que ya muestran la región de error genérica — el umbral de dos features de
`docs/architecture.md > Regla: sin sobre-ingeniería` se supera con holgura.

Multiplataforma (`docs/architecture.md > Regla: multiplataforma`): es texto estático, sin `:hover`,
sin `100vh` y sin librería nueva. Si se añade un botón de copiar, su target debe ser ≥ 44×44 px;
la ficha no lo exige y **no entra** — copiar el texto seleccionándolo funciona en las tres
plataformas.

## 7. Datos, dependencias y contratos

- **Modelo de datos: ninguno.** Ni tabla, ni columna, ni migración, ni `down.sql`, ni RLS: el
  identificador no se persiste (R19). `db/` no se toca.
- **Rutas/endpoints: ninguno nuevo.** No hay route handler; el `matcher` del middleware no cambia.
- **Dependencias: ninguna nueva** (R20). `crypto.randomUUID()` es un **global** en el runtime del
  borde y en Node ≥ 19, así que no hace falta importar `node:crypto` —que además el borde prohíbe—
  ni ninguna librería de UUID. No hay, por tanto, ningún bloque de los cuatro checks de
  `docs/architecture.md > Dependencias de terceros` que rellenar, y esta ficha no para en la
  regla 7.
- **Contrato I/O que cambia:** solo el tipo del estado de error de las Server Actions (§4), en su
  variante inesperada. Las variantes catalogadas quedan idénticas, así que ninguna pantalla que
  hoy decide por un código del catálogo tiene que cambiar.

## 8. Paralelismo — QC-66 y QC-78 (anotado, NO resuelto aquí)

**Precedente de QC-47, anotado en `progress/current.md`: esto se decide una vez y por escrito.**

Al escribir este spec, `QC-66` (`crud-de-usuarios`) y `QC-78` (`estado-de-cuenta-en-el-acceso`)
están **`in_progress`** en zona `backend`, en otra sesión, y **las dos nombran `middleware.ts` en
su `tasks.md`**. Leídos los dos archivos, **las dos lo nombran en su lista de archivos que NO
tocan**:

- `specs/QC-66-crud-de-usuarios/tasks.md:23` — `app/`, `components/`, `middleware.ts`, `e2e/`,
  `lib/shared/**` → **NO (R46)**.
- `specs/QC-78-estado-de-cuenta-en-el-acceso/tasks.md:50` —
  `lib/modules/identity/adapters/driving/**`, `app/**`, `components/**`, `middleware.ts`: no se
  tocan porque el caso de uso conserva nombre y firma.

O sea: **la intersección declarada con la lista de archivos de esta ficha (`tasks.md > Archivos`)
es vacía**, incluido `route-guard-middleware.ts`, que QC-78 declara explícitamente fuera. Con eso,
QC-71 **puede** implementarse en paralelo según `AGENTS.md > Paralelismo`.

Lo que **no** decide este spec: si arranca. **Lo decide el leader en F2.0**, comprobando que esas
dos declaraciones siguen vigentes en su `tasks.md` en ese momento. Si alguna hubiera cambiado, o si
durante la implementación apareciera la necesidad de tocar un archivo de identity fuera de la lista
de §1, **se para y decide el leader**: no se toca por iniciativa propia. El worktree se monta en
F2.0 —no hay ninguno para esta ficha a propósito, por el precedente de QC-78 y QC-66—.

## 9. Riesgo declarado por adelantado

- **QC-70 no está en este árbol.** Todo lo de §4 depende de nombres que fija T1. Si el traductor
  único que dejó QC-70 no tiene un punto por el que pase **todo** error no catalogado, la ficha
  crece; es el único punto donde este diseño puede tener que revisarse.
- **El mecanismo de `next({ request })` es interno de Next.** Mitigado en §3 con el centinela de
  versión y con `origen=respaldo` como señal de campo, no con fe.
- **Siete pantallas tocan la región de error.** El tipo cerrado de §4 convierte cualquier olvido en
  error de compilación, que es exactamente el efecto que QC-70 midió y dejó escrito.
