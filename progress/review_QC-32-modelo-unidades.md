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
