# QC-32 — modelo-unidades · informe de revision

> Rol: `reviewer`. Worktree `.worktrees/QC-32-modelo-unidades`, rama
> `feature/QC-32-modelo-unidades`, HEAD `57dc031`. Diff revisado: `origin/dev...HEAD`
> (39 archivos, +5390/-128). PR #22, base `dev`.
>
> El reviewer no edita codigo. Todo lo que se muta aqui para comprobar que un test muerde se
> revierte en el acto: el arbol de trabajo quedo **limpio** (`git status --porcelain` vacio).

## Veredicto

**RECHAZADO.** 1 hallazgo mayor (bloqueante), 5 menores.

El modelo, la migracion, el `down.sql`, las dos guardias de datos y el reapuntado de
`inventario`/`recetas` estan bien hechos y **muerden**. Lo que falla es el camino de
produccion del seed: **R25 y R26 no tienen ningun test que vigile el codigo que de verdad
corre**. Se puede vaciar entero el unico adaptador que toca la tabla de unidades y quitar la
llamada de `scripts/seed.ts`, y los 1025 tests siguen verdes.

---

## Checklist

### Especificacion
- [x] `specs/QC-32-modelo-unidades/requirements.md` con R1-R28 en EARS, 19 decisiones cerradas
      y 5 preguntas abiertas.
- [x] `design.md` con seis alternativas descartadas y su porque (8.1 a 8.6).
- [x] `tasks.md` con **16 tareas, las 16 marcadas `[x]`**, cero pendientes.

### Trazabilidad
- [x] `progress/impl_QC-32-modelo-unidades.md` contiene el mapa de los 28 requisitos a test.
- [~] **Los 28 tienen test escrito y ejecutado. R25 y R26 NO tienen test que vigile el codigo
      de produccion** (ver MAYOR-1). El resto muerde: verificado por mutacion, no por lectura.

### Verificacion ejecutable
- [x] `./init.sh` corrido por el reviewer dentro del worktree: **96 archivos, 1025 tests, todo
      verde**, con el `== init OK ==` final. Reproduce lo que reporta el implementer.
- [x] El flake conocido de `dev` **no aparecio** en mi corrida.
- [x] El worktree ya venia con `.env`, `node_modules` y los tipos de Next generados; no me
      tope con el arranque que anota el implementer (nota 4 de su parte).

### Calidad, seguridad y fronteras
- [x] RLS **activada y forzada** sobre la tabla nueva (`migration.sql:134-135`), y el test cae
      si se quita cualquiera de los dos ALTER (verificado por mutacion).
- [x] Sin marca de borrado logico en el catalogo (R8), y el test cae si se anade.
- [x] Unicidad por **columna persistida `name_normalized` mas indice unico**, no comparacion
      al vuelo (`migration.sql:84` y el `@@unique` del esquema). Degradar el indice a no unico,
      o quitar el `@@unique`, pone rojo.
- [x] Borrado restringido en las **dos** claves foraneas, y el test cae si una sola se afloja
      a CASCADE. El test de integracion lo confirma contra la base real leyendo
      `pg_constraint`: `confdeltype = 'r'` y `confupdtype = 'c'` en las dos.
- [x] Identificadores de DB en ingles, con predicado de vocabulario cerrado y su test de
      sensibilidad (acepta `units`, rechaza `unidad`, `simbolo`, `nombre_normalizado`).
- [x] El acceso a la tabla de unidades aparece en **un solo archivo de produccion** de todo el
      repo (`lib/modules/unidades/adapters/driven/persistence/unit-seed-repository-prisma.ts`),
      y el criterio distingue codigo de comentario y de modelos con nombre parecido.
- [x] `inventario` y `recetas` solo conocen `unidades` por el barrel `@/lib/modules/unidades`.
      Ni una ruta profunda, ni una consulta a la tabla, ni un `include`: las dos referencias
      son escalares sin `@relation`, con la FK real escrita a mano en el SQL.
- [x] **Ningun resto de la unidad como texto libre** en produccion: el barrido sobre
      `lib/modules/inventario`, `lib/modules/recetas`, `app/`, `components/` y `hooks/` no
      devuelve nada.
- [x] Ningun secreto en el modulo ni en la migracion.
- [x] Migracion versionada y reversible, con su `down.sql`. La guardia del gate lo confirma.

### Multiplataforma
- [x] **No aplica.** El diff no toca `app/`, `components/` ni `hooks/`. Feature de zona
      `backend`: esquema, migracion, seed y armazon de modulo.

### Dependencias (regla 7)
- [x] **Ninguna dependencia nueva.** El diff de `package.json`, `pnpm-lock.yaml` y `docs/`
      contra `origin/dev` sale **vacio**. R28 cumplido y `docs/dependencias.md` intacto.
      Ninguna utilidad escrita a mano que ya resuelva una libreria del stack: la unica pieza
      candidata (`normalizeUnitName`, doce lineas puras) esta justificada en `design.md > 8.4`.

### Permisos y E2E
- [x] La feature no anade ningun permiso (decision cerrada 17): no hay service, ni Server
      Action, ni ruta. El test de contrato de modulo lo vigila en positivo.
- [x] E2E **diferido con motivo** (decision 18, R27). `CHECKPOINTS.md` pide E2E para
      «movimientos de inventario»; esta ficha no mueve existencias.

---

## Como se verifico que los tests muerden

No basta con que un test exista y pase. Se rompio la produccion a proposito, **en disco**, se
corrio la suite relevante y se revirtio. Resultado de las veinte mutaciones:

| Mutacion | Requisito | Resultado |
| --- | --- | --- |
| Borrado restringido a CASCADE en la FK del producto | R13 | ROJO |
| Quitar el bloque de guardia del `migration.sql` | R22 | ROJO |
| Quitar el bloque de guardia del `down.sql` | R24 | ROJO |
| Quitar el NOT NULL del ADD COLUMN de la linea en el DOWN | R23 | ROJO |
| Quitar el FORCE ROW LEVEL SECURITY | R21 | ROJO |
| Quitar el `@@unique` de nombre normalizado | R5 | ROJO |
| Simbolo de opcional a obligatorio | R3 | ROJO |
| Anadir una marca de borrado logico al catalogo | R8 | ROJO |
| La unidad del producto de opcional a obligatoria | R10 | ROJO |
| Reaparece la columna de unidad de texto en el producto | R10 | ROJO |
| La unidad de la linea de obligatoria a opcional | R11 | ROJO |
| Quitar el indice de la FK en la linea de receta | R20 | ROJO |
| Quitar la descomposicion NFD de la normalizacion | R4 | ROJO |
| Quitar el paso a minusculas de la normalizacion | R4 | ROJO |
| Quitar una unidad del conjunto arrancador | R25 | ROJO |
| Dar simbolo a «unidad» en el conjunto arrancador | R25 | ROJO |
| Quitar el corto-circuito de idempotencia del caso de uso | R26 | ROJO |
| El barrel deja de exportar la normalizacion | R4 y R16 | ROJO |
| El esquema zod vuelve a aceptar texto libre como unidad | R19 | ROJO |
| El mapeo pierde la unidad / la accion deja de leerla | R19 | ROJO (las dos) |

Tres mutaciones quedaron **verdes y son mutantes equivalentes**, no huecos: quitar el borrado
de diacriticos, quitar el recorte de espacios y aflojar el filtro final para que admita
mayusculas no cambian la salida de `normalizeUnitName`, porque el filtro a minusculas y
digitos ya elimina marcas combinantes, espacios y mayusculas. No se cuentan como hallazgo.

Las otras tres verdes **si son un hueco**, y son el mayor de abajo.

No se muto la base de datos compartida (cambiar una FK real a CASCADE para ver caer el test de
integracion): es un recurso compartido y el entorno lo bloquea. Se comprobo por construccion:
el ayudante `expectRejectedByDatabase` **falla si la operacion se acepta**, y el mismo caso lee
`pg_constraint` y afirma el borrado restringido sobre las dos FK, asi que un CASCADE en la base
pondria rojo ese test por las dos vias.

---

## Hallazgos

### MAYOR-1 (BLOQUEANTE) · R25 y R26: el camino de produccion del seed no lo vigila ningun test

**Archivos.** `lib/modules/unidades/adapters/driven/persistence/unit-seed-repository-prisma.ts`
lineas 19-35 · `scripts/seed.ts` linea 51 ·
`tests/integration/unidades/unidades-seed.int.test.ts` lineas 74-89 y 233.

**Que pasa.** Tres mutaciones sobre codigo de produccion dejan **la suite entera** (96
archivos, 1025 tests) en verde:

1. `findExistingNormalizedNames` devuelve siempre la lista vacia: el seed deja de ser
   idempotente y la segunda corrida reventaria contra el indice unico. **VERDE.**
2. `createUnit` escribe el nombre normalizado como nombre y descarta el simbolo: el catalogo
   nace con nombres normalizados y sin ningun simbolo. **VERDE.**
3. `scripts/seed.ts` deja de invocar el seed de unidades: `pnpm run db:seed` no siembra
   ninguna unidad. **VERDE.**

Una cuarta, escribir cadena vacia en vez de nulo cuando la unidad no declara simbolo, tambien
queda verde: es exactamente lo que R3 prohibe —conservar la ausencia como ausencia de valor y
no como cadena vacia— en el unico camino que de verdad escribe unidades.

**Por que ocurre.** El adaptador se exporta **ya construido** sobre el cliente compartido
(`design.md > 5.4`), asi que el test de integracion no puede usarlo dentro de una transaccion.
En vez de eso, `unidades-seed.int.test.ts:74-89` **escribe una copia** del adaptador
(`createUnitSeedRepositoryOn`) y prueba la copia. Lo unico que se afirma del cableado real es
que `unidades.seedStarterUnits` es una funcion (linea 233), que no ejecuta nada, y de
`scripts/seed.ts` no se afirma nada en absoluto.

Resultado: los dos requisitos de comportamiento del seed —«CUANDO se ejecuta el seed, el
sistema DEBE dejar creadas las cinco unidades» (R25) y «ejecutarlo dos veces DEBE dejar el
mismo estado» (R26)— estan mapeados a tests que vigilan el **dominio** y una **replica** del
adaptador, no el codigo que corre. Eso incumple la regla 4 de `CLAUDE.md` tal y como el
reviewer tiene que leerla: un test verde que no verifica el requisito.

**El propio repo tiene el precedente resuelto.** `identity` (QC-6), que el `design.md > 6.2`
cita como modelo a copiar, exporta una **fabrica** `createInitialAccessRepository(tx)`, y por
eso `tests/integration/identity/identity-seed.int.test.ts:154` ejercita el **adaptador de
produccion** atado al `tx`. Y ademas `tests/unit/identity/seed/deploy-hook.test.ts:220` lee
`scripts/seed.ts` como texto para comprobar que el script sigue invocando el seed. QC-32 no
tiene ninguna de las dos cosas.

**El implementer lo vio y lo dejo abierto** (nota 5 de su parte): «La alternativa limpia seria
exportar tambien una fabrica que reciba el cliente; no se hizo porque el design no la pide». La
regla 6 no cubre esto: no es inventar comportamiento, es cubrir un requisito que la regla 4
exige cubrir. Y la evidencia de T10 —dos corridas reales de `pnpm run db:seed` pegadas en el
parte— es una comprobacion manual e irrepetible, no un test del gate; ademas no comprobo que
«unidad» quedara con el simbolo nulo.

**Que falta para cumplirlo.** Cualquiera de estas dos, o las dos:

1. Que el adaptador driven exponga tambien una fabrica sobre un cliente o transaccion —el
   patron de `createInitialAccessRepository`—, y que `unidades-seed.int.test.ts` deje de
   escribir su propia copia y use **el adaptador de produccion**. Asi las tres mutaciones de
   arriba caen.
2. Un caso que vigile que `scripts/seed.ts` sigue invocando el seed de unidades, al estilo de
   `tests/unit/identity/seed/deploy-hook.test.ts`.

Esto vuelve al implementer. No es un retoque de test: toca la forma del adaptador, que es
codigo de produccion.

---

### menor-1 · R23: el DOWN devuelve la columna, pero no su posicion en la tabla

`db/migrations/20260903121404_units_catalog/down.sql:45-46`. La columna de unidad del producto
era la **novena** de la tabla (`20260902005510_products_and_presentations/migration.sql:35`,
entre `qty_alert` y `created_at`) y el DOWN la vuelve a anadir **al final**, detras de
`deleted_at`; lo mismo con la de la linea de receta. R23 pide «exactamente el estado de esquema
previo», y la posicion ordinal es parte del catalogo. Ni el test estatico ni la evidencia de
T10 —que comprobo tipo, obligatoriedad y ausencia de DEFAULT, y esta bien comprobado— miran la
posicion. En la practica no se puede arreglar sin reescribir la tabla y no afecta a ninguna
consulta del repo, pero conviene que quede anotado en el `down.sql` como limite conocido en vez
de leerse como «exacto» sin matiz.

### menor-2 · La normalizacion se escribe a mano en los helpers de test

`tests/integration/recetas/recetas-constraints.int.test.ts`,
`tests/integration/inventario/inventario-constraints.int.test.ts`, `product-crud.int.test.ts` y
`tests/integration/unidades/unidades-constraints.int.test.ts` construyen el nombre normalizado
a mano. Es **deliberado y esta razonado** en la cabecera del test de unidades —si importaran
`normalizeUnitName`, un fallo del algoritmo podria dejar el test verde—, asi que no es un
defecto. Se anota solo por su consecuencia: **ningun test de integracion comprueba que la
columna `name_normalized` se llene con la salida de `normalizeUnitName`**. Hoy el unico
escritor de esa columna es el seed, y eso cae dentro de MAYOR-1; cuando QC-38 traiga el alta,
ese hueco pasa a ser suyo.

### menor-3 · El parte nombra mal el flake conocido de `dev`

`progress/impl_QC-32-modelo-unidades.md:295` dice que el flake conocido es
`tests/unit/login-form.test.tsx`. El flake documentado en `dev` es
`tests/ui/login-form-uncontrolled-warning.test.tsx`. El veredicto no cambia —en mi corrida no
aparecio ninguno de los dos— pero la bitacora afirma haber vigilado un archivo distinto del que
hay que vigilar.

### menor-4 · La tabla de archivos de `design.md > 1` quedo desfasada

`specs/QC-32-modelo-unidades/design.md:34` anuncia sendos `.gitkeep` en `ports/` y en
`adapters/driven/`; la seccion 5.1 lo corrige —no los llevan, porque nacen con archivo real— y
la implementacion siguio la 5.1, que es la correcta. Es la tabla la que quedo mal, no el
codigo.

### menor-5 · El conjunto arrancador sigue siendo una posicion por defecto, y ya vive en tres sitios

`lib/modules/unidades/domain/starter-units.ts:8-13`,
`tests/unit/unidades/domain/seed-units.test.ts` y
`tests/integration/unidades/unidades-seed.int.test.ts:92-98`. La pregunta abierta 4
—capitalizacion de los nombres, y si «unidad» lleva simbolo— **sigue abierta**, como debe: el
codigo conserva el comentario de «pendiente de confirmacion». Se anota que el coste de
cambiarla ya no es «cinco literales y el test que los espera» como dice el parte, sino **cinco
literales y dos archivos de test**, los dos con la lista escrita literal a proposito. Es
correcto que esten duplicados; solo conviene que el humano sepa el coste real antes de decidir.

---

## Lo que quedo explicitamente bien, y merece constar

- **Los diez tests ajenos se acotaron, no se aflojaron.** Comparado uno a uno contra
  `origin/dev`: **ni un `toEqual` degradado a `toContain`**. Las cuatro listas cerradas
  (indices de `products`, indices de `recipes` y `recipe_lines`, escalares de la linea de
  receta, y las FK reales de la linea) siguen cerradas con el elemento nuevo sumado, y las tres
  mutaciones que probe sobre ellas —indice quitado, unidad de linea opcional, columna de texto
  que reaparece— las ponen rojas. Dos archivos **ganaron** cobertura, `product-input.test.ts` y
  `product-actions.test.ts`, donde el campo se habria quedado sin nadie que lo mirara; y el
  caso de R15 de QC-24 en `recetas-constraints.int.test.ts` **muerde mas que antes**: ahora
  apunta cada producto a una unidad distinta de la de su linea, con lo que R14 queda mejor
  vigilada despues de QC-32 que antes.
- **`recetas-migration.test.ts` conserva su asercion sobre la columna de texto tal cual.** Es
  la decision correcta: ese archivo lee el SQL **historico y ya aplicado** de QC-24, que no se
  reescribe nunca. Cambiarlo habria desactivado la guardia que existe justo para impedir ese
  drift.
- **Las dos guardias de datos hacen lo que dicen.** La del UP y la del DOWN caen las dos si se
  les quita el bloque de guardia, si se cambia la excepcion por un aviso o si dejan de contar
  una de las dos tablas; y los dos predicados son distintos entre si: el del DOWN no valida el
  UP ni al reves. La del DOWN, que no sale de ninguna decision cerrada sino que la derivo
  `spec_author` (`design.md > 4.6`), es la que evita que revertir pierda en silencio la unidad
  de cada fila, y la evidencia de T10 paso 3 muestra que aborta de verdad y no toca nada.
- **La migracion no arrastro el drift de Prisma.** Los cinco DROP CONSTRAINT que
  `prisma migrate dev` genero contra las FK escritas a mano por QC-20 y QC-24 se borraron, y el
  test lo vigila en positivo: la lista de DROP CONSTRAINT del UP tiene que estar vacia y las
  sentencias con FOREIGN KEY tienen que ser exactamente dos.

---

## Que tiene que volver del implementer

Solo MAYOR-1. Los cinco menores no bloquean el merge; el 1, el 3 y el 4 son de una linea cada
uno y conviene arreglarlos en la misma vuelta.

Cuando MAYOR-1 este cerrado hay que **volver a correr `./init.sh` completo** —no el rapido—
porque el cambio toca un adaptador con base real, y volver a comprobar que las tres mutaciones
del mayor caen.

---

# Ronda 2 del reviewer — sobre `62f321d` (cambio de alcance del humano)

> No reescribe nada de arriba. La ronda 1 y su RECHAZADO se quedan en el historial.
> Objeto de esta ronda: el estado actual del worktree `.worktrees/QC-32-modelo-unidades`,
> rama `feature/QC-32-modelo-unidades`, HEAD **`62f321d`**, PR #22. Auditada la seccion
> `## Ronda 3 — el arrancador pasa a la migracion` de `progress/impl_QC-32-modelo-unidades.md`
> y el diff `536ce49..62f321d` (20 archivos, +933/-1046).

## Veredicto

**APROBADO.** 0 mayores, 4 menores. Ninguno bloquea el merge.

**MAYOR-1 de la ronda 1 queda DISUELTO, no perdonado.** El hallazgo era que R25/R26 estaban
mapeados a tests que ejercitaban una **copia** del adaptador driven del seed. Ese adaptador, su
puerto, su caso de uso, su cableado y su llamada ya no existen en el arbol: bajo
`lib/modules/unidades` solo quedan `index.ts`, `domain/unit-name.ts`, `domain/unit-catalog.ts` y
tres `.gitkeep`. El barrido de
`seedStarterUnits|STARTER_UNITS|unit-seed-repository|seed-units|starter-units|unitSeedRepository`
sobre todo el codigo no devuelve **ni una** referencia: solo prosa en `specs/`, en el barrel y en
comentarios de test que explican que se retiro. El objeto del hallazgo desaparecio.

## Checklist

### Especificacion
- [x] `requirements.md` con R1-R28 EARS. R25 y R26 **reescritos**, con el enunciado viejo citado
      encima; decision cerrada 9 marcada como sustituida (2026-09-03); pregunta abierta 4 cerrada
      por el humano (cuatro filas, minuscula, las cuatro con simbolo).
- [x] `design.md` con la seccion 6 reescrita entera, la 5.4 **anulada** con su texto anterior
      citado, y la 6.2 explicando por que ya no hay caso de uso. Las alternativas descartadas
      siguen.
- [x] `tasks.md` — **todas** las tasks `[x]`, incluidas T15 y T16 del bloque G nuevo. La busqueda
      de tareas sin marcar no devuelve nada. T5 queda como `[x] ~~T5.~~ ANULADA`, con la anulacion
      explicada en su sitio.

### Trazabilidad
- [x] Los 28 requisitos mapeados. La tabla de `tasks.md > Trazabilidad` esta actualizada para
      R25/R26 y conserva citado el mapeo anterior.
- [x] R25 y R26 **muerden**. Verificado por mi, mutando en disco y revirtiendo (el arbol queda
      limpio al final): ver la tabla de mutaciones de abajo.
- [!] El mapa `R<n> -> test` de `progress/impl_...md > T14` (ronda 1) sigue citando los tests
      borrados para R25/R26 y el nombre viejo del caso de R16. Ver **menor-8**.

### Verificacion ejecutable
- [x] Gate completo sobre `62f321d`, corrido por el leader: 94 archivos, 1020 tests,
      `== init OK ==`, sin el flake conocido. No lo repito, asi lo acota el encargo.
- [x] Corrido por mi: `tests/unit/unidades` da **4 archivos, 47 tests, verde**;
      `tests/integration/unidades` contra base real da **13 tests, verde**; `tests/guards` da
      **11 archivos, 111 tests, verde**.

### Calidad, seguridad y fronteras
- [x] RLS `ENABLE` mas `FORCE` sobre `units`, intacto, y el `INSERT` va **antes** del `FORCE`
      (`migration.sql:116-120` frente a `:170-171`), que es lo que evita que el catalogo nazca
      vacio **sin que nada falle**. Hay caso dedicado y su mutacion de sensibilidad.
- [x] Migracion reversible: `down.sql` no se toco y sigue siendo correcto. Su `DROP TABLE "units"`
      (ultima sentencia) se lleva las cuatro filas, y su guardia mira lo que **apunta** al
      catalogo, no el catalogo. Los dos predicados del DOWN caen con sus mutaciones.
- [x] Sin secretos, sin hardcode de contexto, capas separadas: `lib/composition/index.ts` queda
      sin `export const unidades` y con un comentario que dice quien lo llenara (QC-38);
      `scripts/seed.ts` vuelve a ser el de QC-6 (roles y usuario inicial) y **no perdio nada
      suyo** — sigue cargando `.env`, importando la composicion por ruta relativa, resumiendo sin
      secretos y traduciendo a codigo de salida.
- [x] `ports/` y `adapters/driven/` con `.gitkeep`: mismo precedente que `lib/modules/recetas`,
      verificado archivo a archivo. La guardia de arquitectura sigue verde.
- [x] El barrel es un contrato publico coherente: solo reexporta de `./domain`
      (`normalizeUnitName` mas los tres tipos), y el cierre transitivo no alcanza `adapters/` ni
      `ports/`. La regla paso a ser sobre la **capa**, no sobre un nombre de archivo, y sigue
      valiendo el dia que QC-38 llene esas carpetas.

### Multiplataforma
- [x] No aplica: el diff no toca `app/`, `components/` ni ningun `.tsx`.

### Dependencias (regla 7)
- [x] `package.json` no aparece en el diff `e82aa49..62f321d`. R28 cerrado por la guardia G3.

## Como verifique que los tests nuevos muerden (mutaciones mias, en disco, revertidas)

| Mutacion sobre el codigo/SQL de produccion | Resultado | Que demuestra |
| --- | --- | --- |
| Quitar el `INSERT` entero de `migration.sql` | 4 rojos en `unidades-migration.test.ts` | R25 cae sin arrancador; `starterRows` devuelve `null`, no `[]` |
| Desincronizar un normalizado (`'gramo', 'Gramo'`) | 4 rojos | R26 cae por el lado del literal |
| Anadir una quinta fila (`'unidad'`), bien normalizada | 3 rojos | R25 cae por la fila de mas, y no por el normalizado |
| **Mutar `normalizeUnitName`** (un `.concat('X')` al final) | 2 rojos, los dos del bloque del arrancador | **Lo importante: el test NO compara el SQL consigo mismo.** Importa la funcion real y cae tambien cuando la desincronizacion llega por el lado de la funcion |
| Anadir `prisma.unit.findMany({})` a `domain/unit-catalog.ts` | 2 rojos en `module-contract.test.ts` (`expected [ Array(1) ] to deeply equal []`) | El barrido de R15/R16 **lee de verdad** los archivos reales, no solo sinteticos |
| Reintroducir `export const unidades = { seedStarterUnits: ... }` en `lib/composition/index.ts` | 1 rojo | La mitad negativa de R26 muerde |

El arbol quedo limpio despues de las seis.

**El riesgo estructural que planteaba el encargo —la normalizacion duplicada, una vez en
TypeScript y otra escrita a mano en SQL— queda atado por los dos extremos:** la mutacion del
literal y la mutacion de la funcion caen las dos. No es un test que se compare consigo mismo.

## `module-contract.test.ts`: la guardia no se quedo sin sujeto

Comparado contra `536ce49`. El criterio pasa de «`prisma.unit` aparece **exactamente** en el
adaptador driven» a «**ningun** archivo lo consulta», que es estrictamente mas fuerte. El riesgo
real —que un `toEqual([])` salga verde porque el barrido no lee nada— esta cubierto de tres
formas, y las tres se ejercitan en el mismo caso (`module-contract.test.ts:286-325`):
`todoElCodigo.length > 0`, `entradasReales` con la misma longitud que la lista de archivos, y la
**misma** funcion pura `nombresQueConsultanUnidades` aplicada a los archivos reales **mas** una
entrada sintetica (`prisma.unit.findMany`) y otra con el receptor renombrado (`db.unit.create`),
que tienen que salir senaladas. Mi mutacion sobre `unit-catalog.ts` lo confirma ademas sobre un
archivo **real**, no sintetico.

El predicado `consultaTablaDeUnidades` no se toco y conserva su test de sensibilidad entero:
positivos con otro receptor, negativos de comentario, `prisma.units` y `prisma.unitConversion`, y
el campo de dominio `candidate.unit.name`. Ademas, el trozo que leia `starter-units.ts` para R14 se
sustituyo por la lista de columnas del `INSERT`
(`toEqual(['name','name_normalized','symbol','updated_at'])`), que sigue siendo lista cerrada y no
un `toContain`; y el cierre transitivo del barrel se afirma ahora sobre la **capa**, con lo que
sigue valiendo cuando QC-38 llene `ports/` y `adapters/`.

## Las dos preguntas que levanto el implementer

**1. El barrido no cubre `tests/`. Frontera legitima o agujero en R16?** **Frontera legitima.**
R15 dice «ningun **modulo** distinto de `unidades` DEBE consultarlo con el cliente Prisma» y R16
habla de los modulos `inventario` y `recetas`. Un fixture de test no es un modulo: es el andamio
que construye el estado que el propio requisito necesita para ser comprobable. Extender el barrido
a `tests/` pondria rojos a `tests/integration/inventario/product-crud.int.test.ts:151,460`,
`tests/integration/inventario/inventario-constraints.int.test.ts:164` y
`tests/integration/recetas/recetas-constraints.int.test.ts:246`, que crean su unidad porque
`recipe_lines.unit_id` es `NOT NULL` con FK: o sea, el requisito se volveria incomprobable contra
base real. El limite esta escrito en el propio test (`module-contract.test.ts:180-190`) y en el
parte. **No es hallazgo.**

**2. La base local tiene aplicada `20260903131417_suppliers_and_supplier_catalog_lines` (QC-42),
que no esta en este worktree. Invalida algo de la evidencia contra base real?** **No.** Lei ese
SQL en `.worktrees/QC-42-modelo-proveedores`: crea `suppliers` y `supplier_catalog_lines`, y su
unica mencion a una tabla de esta ficha es la FK
`supplier_catalog_lines.product_id -> products(id)`. No toca `units`, ni `products.unit` /
`products.unit_id`, ni `recipe_lines`. Por tanto no interfiere con ninguna de las cinco evidencias
de T15: la guardia del UP cuenta `products` y `recipe_lines`; la del DOWN cuenta
`products.unit_id` y `recipe_lines`; y el `DROP TABLE "units"` no tiene dependientes en QC-42.
El orden de despliegue tampoco cambia: `121404` < `131417`, asi que en una base limpia QC-32
aplica **antes** que QC-42, que es el orden que la evidencia reproduce. **Salvedad, que anoto sin
bloquear:** la evidencia se obtuvo revirtiendo y reaplicando QC-32 **por debajo** de una migracion
posterior ya aplicada, cosa que `prisma migrate deploy` no hara nunca en produccion. No invalida
nada porque no hay dependencia entre las dos, pero es lo unico que separa esa corrida de un
despliegue real.

## Hallazgos de la ronda 2

Ninguno es BLOQUEANTE. Se numeran a partir del 6 para no chocar con los de la ronda 1.

### menor-6 · Ninguna asercion automatica comprueba que las cuatro filas esten EN LA BASE

`tests/unit/unidades/schema/unidades-migration.test.ts` cierra R25 sobre el **texto** del SQL, y la
unica evidencia contra Postgres real es el log de T15
(`progress/impl_QC-32-modelo-unidades.md > Ronda 3 > paso 2`, «total filas: 4»). Es coherente con
el precedente de la propia ficha —R22, R23 y R24 se cierran igual— y la migracion es atomica, asi
que no bloquea. Se anota porque el coste de cerrarlo es bajo:
`tests/integration/unidades/unidades-constraints.int.test.ts` ya corre contra la base real, y un
caso acotado (leer las filas cuyo `name_normalized` este en las cuatro claves arrancadoras y
esperar cuatro, con su simbolo) detectaria que una migracion futura se las lleve por delante, que
es justo lo que el test estatico **no** puede ver.

### menor-7 · La tabla de trazabilidad de `tasks.md` cita nombres de test que ya no existen

`specs/QC-32-modelo-unidades/tasks.md`, fila **R16**, cita
`C · «prisma.unit solo aparece en el adaptador driven de unidades»`. Ese caso se renombro en T16 y
hoy se llama «ningun archivo del repo consulta la tabla de unidades, y el barrido lo demuestra
sobre una consulta real». La fila **R19** cita «ProductRef, ProductView y el esquema zod...», y el
caso real dice «ProductRef, ProductView, **NewProduct** y el esquema zod...». Las filas R25 y R26
si se actualizaron; estas dos se quedaron atras. Es deriva de documentacion, no de cobertura: los
dos tests existen y pasan.

### menor-8 · El mapa `R<n> -> test` de `progress/impl_...md > T14` quedo obsoleto y sin marcar

`CHECKPOINTS.md > Trazabilidad` pide que `progress/impl_<feature>.md` contenga el mapa. El de T14
(ronda 1) sigue diciendo, para R25, `D · «sobre catalogo vacio crea las cinco unidades
arrancadoras»` y `IS · «db:seed deja las cinco unidades en la base»` —dos archivos **borrados**— y
«unidades creadas: 5». La ronda 3 escribe su propia tabla mas abajo, pero **no** anota sobre T14
que quedo superada, como si se hizo con la decision 5 del parte («SUPERADA por la ronda 2»). Un
lector que aterrice en T14 se lleva un mapa falso. Bastan dos lineas de nota.

### menor-9 · La mitad negativa de R26 se apoya en una lista de nombres concretos

`module-contract.test.ts:522-529` prohibe en `lib/composition` los literales
`STARTER_UNITS|seedStarterUnits|unitSeedRepository|unit-seed-repository|seed-units`, mas
`modules/unidades/(adapters|ports|domain)` y `unitCatalog|createUnit|updateUnit|deleteUnit`. Un
seed reintroducido con un nombre distinto de todos esos escaparia **de esa asercion concreta**. Lo
que impide que escape del todo es que, para escribir en la tabla, tendria que consultar `units`, y
ahi lo caza el barrido (verificado con mi mutacion en `unit-catalog.ts`). O sea: la red esta
completa, pero es la segunda malla la que la cierra, no la primera. Se anota para que quien toque
esto en QC-38 no confunda la lista de nombres con la garantia.

## Los dos menores de la ronda 1 que el implementer dice haber cerrado

- **menor-2 — CONFIRMADO cerrado para las filas arrancadoras.** Lo que anote era la consecuencia:
  «ningun test comprueba que `name_normalized` se llene con la salida de `normalizeUnitName`».
  Hoy lo comprueba `normalizedNamesMatchTheOnlyDefinition`, que importa la funcion real, y mi
  mutacion de la **funcion** (no del literal) lo pone rojo. Para el alta a mano sigue siendo de
  QC-38, tal como decia la ronda 1. Los helpers de los tests de integracion siguen normalizando a
  mano, y sigue siendo correcto por la razon que ya estaba razonada alli.
- **menor-5 — se disuelve solo; lo anoto sin reabrir nada.** Decia que el conjunto arrancador
  vivia en tres sitios y que la pregunta abierta 4 seguia abierta. Hoy vive en **dos** —el
  `INSERT` de `migration.sql` y la constante `CONJUNTO_ARRANCADOR` del test, duplicada a
  proposito— y la **pregunta abierta 4 la cerro el humano**. El coste de cambiar el conjunto ya no
  es «cinco literales y dos archivos de test», sino cuatro filas y una constante.

## Lo que la ronda 3 NO rompio (comprobado, no supuesto)

- **Las dos guardias de datos siguen mordiendo con el `INSERT` dentro.** `migration.sql:50-62` y
  el bloque `DO $$` de `down.sql` estan intactos, con sus predicados y sus mutaciones en verde. El
  `INSERT` va **despues** de la guardia del UP, asi que un producto con unidad escrita sigue
  abortando la migracion entera antes de insertar nada; y el DOWN sigue abortando si algo apunta
  al catalogo, mientras que cuatro filas arrancadoras **sin** referencias no bloquean la
  reversion, que es lo correcto.
- **El nucleo de la ficha, intacto:** el reapuntado de `inventario` a `unitId`, la unicidad
  normalizada persistida, RLS activada y forzada, las dos FK `ON DELETE RESTRICT` con sus indices
  hijos, los dos `DROP COLUMN "unit"` al final, y la ausencia de los cinco `DROP CONSTRAINT` de
  drift. Todo lo vigilan los mismos predicados de la ronda 1, todos verdes.
- **Los diez tests ajenos acotados en T12:** el diff `536ce49..62f321d` no toca ninguno de ellos,
  solo los cuatro archivos de `tests/unit/unidades`. Ni un `toEqual` degradado en esta ronda.
- **Cero dependencias nuevas y sin drift de Prisma:** `db/schema.prisma` no cambio en
  `536ce49..62f321d`.
- **Nada importa lo borrado.** `scripts/seed.ts` sigue haciendo lo suyo de QC-6 y nada mas;
  `lib/composition/index.ts` no deja ningun import huerfano; typecheck, lint y el gate completo en
  verde.
- **`tests/integration/unidades/unidades-constraints.int.test.ts` se quedo entero y sigue siendo
  correcto** con las cuatro filas ya en la tabla: todas sus lecturas van acotadas por `where` con
  un marcador propio, asi que ninguna cuenta el total del catalogo.

## Que queda para el leader

Nada bloqueante. Los cuatro menores se pueden cerrar en la misma vuelta —menor-7 y menor-8 son de
dos lineas cada uno— o anotarse en `progress/current.md > Deudas y cosas abiertas`. menor-6 es la
unica que merece decidirse a conciencia: es un test que hoy no existe y que manana seria la unica
red contra una migracion futura que vacie el catalogo.
