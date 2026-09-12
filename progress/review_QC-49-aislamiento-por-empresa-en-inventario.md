# QC-49 — aislamiento-por-empresa-en-inventario · review (F2.2)

> Revisado en el worktree `.worktrees/QC-49-aislamiento-por-empresa-en-inventario`, rama
> `feature/QC-49-aislamiento-por-empresa-en-inventario` (sin commits, trabajo en el arbol), contra
> `origin/dev` en `f783e06`. Base `QuimiCloude_QC49`. No se toco el `.env`, ni la base compartida,
> ni se corrio `db:rollback`. No se edito ni una linea de codigo.

## Veredicto: **RECHAZADO**

Tres bloqueantes. Ninguno invalida el diseno —el aislamiento construido es real y muerde—, pero uno
deja el gate en rojo con un rojo propio, otro es una garantia de seguridad sobrevendida y el tercero
es una contradiccion interna de la propia migracion sobre su reversibilidad.

## Checklist

### Especificacion
- [x] `requirements.md` con 32 requisitos EARS numerados.
- [x] `design.md` con seis alternativas descartadas y su porque (seccion 9, A–F).
- [ ] `tasks.md` con **todas** las tasks `[x]` -> **T17 sigue `[ ]`**, y correctamente: el gate no
      esta verde. Checkpoint incumplido de hecho, no por descuido.

### Trazabilidad
- [x] `progress/impl_...md` contiene el mapa `R<n> -> test`.
- [~] Cada `R<n>` mapea a un test que existe y se ejecuta: **31 de 32 si**; **R13 solo a medias**
      (ver bloqueante 2). Se abrieron y leyeron los tests, no se dio por bueno el mapa.

### Calidad de codigo
- [x] `pnpm run typecheck` — verde, sin salida.
- [x] `pnpm run lint` — verde, sin salida.
- [ ] `pnpm test` — **3 archivos en rojo**, uno de ellos NUEVO y propio de esta ficha.
- [~] E2E de flujo critico: `e2e/aislamiento-inventario.spec.ts` existe y es bueno, pero **el gate
      aborto antes de la fase de Playwright**, asi que en esta revision R27 no se ejecuto.
- [x] UI: no hay pantalla nueva ni cambio visual (`design.md > 12`). La regla multiplataforma no
      aplica mas alla de lo ya cumplido; nada del diff toca `app/**` ni `components/**`.
- [x] Dependencias: `package.json` y `pnpm-lock.yaml` **no se tocaron** (R32). Nada que anadir a
      `docs/dependencias.md`.

### Datos y seguridad
- [x] Las tres tablas de operacion llevan `company_id` NOT NULL con FK a `companies`
      (`ON DELETE RESTRICT ON UPDATE CASCADE`). El lote lleva **columna propia** (R2).
- [x] Toda consulta y toda escritura del modulo filtra por la empresa de quien pide, con test del
      rechazo cruzado. **Comprobado consulta a consulta**, no por el mapa.
- [x] El permiso se valida **en el service** y sigue siendo la primera linea de los nueve casos de
      uso, antes de zod y antes del puerto.
- [x] RLS `ENABLE` + `FORCE` en las tres, sin policies, y R26 probado: quitar `FORCE` no cambia
      ningun resultado (`company-scope-queries.int.test.ts:782`).
- [x] Todo el acceso a datos pasa por el repositorio Prisma. Ninguna lectura con cliente Supabase.
- [x] La migracion es nueva, no modifica ninguna aplicada, y trae `down.sql`.
- [ ] ...pero el `down.sql` tiene un agujero de entorno (bloqueante 3).
- [x] Ningun secreto hardcodeado. No hay webhooks en esta ficha.

### Modulos hexagonales
- [x] `domain/` y `ports/` no importan framework, base, `shared` ni adaptadores.
      `inventory-scope.ts` es un tipo puro.
- [x] Ningun import nuevo hacia otro modulo. `actor.ts` sigue usando el barrel de `identity`.
- [x] Los tres modelos tocados conservan su `/// @module` y ninguno gana `@relation` hacia
      `Company` — decision correcta y bien argumentada en el esquema.
- [x] `lib/composition` sigue atando puerto -> implementacion sin resolver actor.

### Verificacion final
- [ ] `./init.sh` termina en verde -> **no**.

## Lo que si esta bien, y conviene decirlo

El aislamiento **no es decorativo**. Se busco activamente el camino que se escapa y no aparecio:

- Las **12 firmas** de los dos puertos llevan `scope: InventoryScope`, y los **9 casos de uso**
  construyen `{ companyId: actor.companyId }` tras `requirePermission`. Verificado uno a uno.
- Ninguna consulta del modulo queda fuera del punto unico: el unico `prisma.` del modulo que no
  compone ambito es `findProductRefs` (`product-catalog-prisma.ts:56`), que es la **excepcion
  explicita de R29** con destino QC-50, escrita en tres sitios.
- **Ninguna escritura confia en el identificador del formulario**: `updateMany`/`deleteMany` y el
  `findFirst` de `addBatchToAlive` llevan el ambito **en el `where`**, no en un `if` posterior.
  `NewProduct`, `NewProductBatch` y `PresentationData` no llevan empresa: no hay tipo por el que
  colarla.
- El ambito va en un `AND` de **primer nivel**, nunca fundido al objeto de la busqueda: un `OR` de
  busqueda no puede ensanchar lo visible. `count` y `findMany` usan **el mismo objeto `where`**, asi
  que el `total` tampoco delata filas ajenas.
- **Cero unauthorized**: «de otra empresa» sale por `null` / `false` / `not_found`, el mismo camino
  que «no existe». Ninguna union discriminada del puerto crecio y `ERROR_CODES` no crece.
- Los tests de integracion llevan **controles positivos** en cada caso cruzado (la misma operacion
  desde la empresa duena **si** escribe), asi que un aislamiento roto *por exceso* tampoco daria
  verde. El E2E tambien los lleva.
- La migracion: `down.sql` presente y simetrico objeto a objeto, `UNIQUE (company_id,
  name_normalized)` en `presentations` con el global caido antes, backfill por `name_normalized` y
  nunca por identificador, con fallback unico y `RAISE EXCEPTION` en todo lo demas, `ROW_COUNT`
  comprobado por tabla, **cero INSERT y cero DELETE**, y el parentesis `NO FORCE`/`FORCE` bien
  cerrado en el UP (con `companies` dentro, y la justificacion es correcta).

## Hallazgos

### BLOQUEANTE 1 — El gate esta rojo, con un rojo nuevo y propio de la ficha

`./init.sh` completo, corrido desde el worktree: **falla**.

    Test Files  3 failed | 335 passed (338)
         Tests  3 failed | 4602 passed | 31 skipped (4636)
    hay 1 archivo(s) de test en rojo que NO estan en el baseline:
      tests/unit/shared/data-table-alcance.test.ts
    x hay rojos NUEVOS respecto del baseline

- `tests/unit/shared/data-table-alcance.test.ts:340` — «Alcance QC-55: los E2E que lo referencian
  son una lista CERRADA (R36)». Recibido: seis entradas donde la lista cerrada declara cinco; la que
  sobra es `e2e/aislamiento-inventario.spec.ts`. **Es una CUARTA lista cerrada de guardias**, y la
  bitacora (decisiones fuera de la letra del spec, n.o 4) solo nombra tres. No se atribuye a `dev`
  ni a flake: lo dispara un archivo que **anade esta ficha**, no hace falta comparar contra nada.
- Los otros dos rojos (`tests/unit/recetas/module-contract.test.ts:325`,
  `tests/unit/recetas-ui/recipe-route-contract.test.ts:793`) **si** son las dos entradas de
  `tests/baseline-rojos.json` que dependen de `git diff origin/dev...HEAD`, vacio porque la rama no
  tiene commits. No son de QC-49 y el comparador los ignora, correctamente.
- **El gate aborto en la fase de vitest y nunca llego a Playwright.** En esta revision R27 **no se
  ejecuto**. Lo corrio el implementer (Chromium y WebKit) y el spec es solido, pero eso es bitacora,
  no gate.
- Como se colo, que es la parte que importa: la corrida que la bitacora presenta como verificacion
  (`npx vitest run tests/unit/inventario/ tests/integration/ tests/guards/` -> «92 archivos / 1284
  tests») **excluye `tests/unit/shared/`**. Es un subconjunto de los 338 archivos de la suite y la
  bitacora no lo dice. Regla 5 de `CLAUDE.md`: correr solo una parte antes de cerrar es el agujero.

**Que falta:** anadir el renglon a la lista cerrada de `data-table-alcance.test.ts` con su motivo
—igual de bien que se hizo con `E2E_ESPERADOS` y con `scope.test.ts`— y volver a correr `./init.sh`
**entero**, hasta el final, incluido Playwright.

### BLOQUEANTE 2 — R13 vende una garantia que TypeScript no da, y nada cierra el hueco

La bitacora lo senala; **se verifico y es cierto**. Prueba directa con el `tsc` del propio worktree
(`--strict --noEmit`, exit 0):

    interface Repo { findAliveById(id: string, scope: Scope): Promise<string | null>; }
    async function findAliveById(id: string): Promise<string | null> { return id; }  // sin scope
    const repo: Repo = { findAliveById };   // COMPILA

Una funcion con **menos parametros** satisface la firma del puerto. Y asi es exactamente como se
cablea: `lib/composition/index.ts:330` y `:344` asignan las funciones sueltas del adaptador al tipo
del puerto. O sea:

- Una **llamada** que olvide el ambito no compila. Cierto, y es la mitad valiosa.
- Una **implementacion de lectura** que lo ignore **si compila**. Hoy las escrituras se salvan de
  rebote porque Prisma exige `companyId: string` en los `...UncheckedCreateInput`; las lecturas no
  tienen ese seguro.

Y las dos guardias estaticas de `tests/unit/inventario/company-scope.test.ts:108` y `:124` son **a
nivel de archivo**: que `product-prisma.ts`/`presentation-prisma.ts` no escriban
`companyId: scope.companyId` a mano y que importen `./company-scope`. Un **metodo de lectura nuevo**
que omita el ambito pasa las dos, compila, y ningun test de hoy lo mira —los de integracion prueban
los doce metodos que existen, no el que se escriba en QC-50 o QC-81.

Donde esta sobrevendido, textualmente:

- `requirements.md` R13: «una implementacion **o** una llamada que la omita NO DEBE compilar».
- `design.md > 4.2`: «Que este en la firma y no dentro del adaptador **es lo que hace** que una
  llamada **o una implementacion** que se olvide del ambito NO COMPILE».
- `design.md > 9 C` usa esa misma afirmacion para **descartar** la alternativa `$extends`: «no da la
  garantia de compilacion ... que es lo unico que R13 pide de verdad». El argumento de descarte se
  apoya en una propiedad que la solucion elegida tampoco tiene del todo.

En una ficha de aislamiento esto no es un matiz de redaccion: es la diferencia entre «el compilador
me protege de la consulta numero trece» y «el compilador me protege de la mitad de los casos». La
bitacora lo dice bien; el spec y el `design.md`, no — y son los que va a leer quien cierre QC-50.

**Que falta, una de las dos:** (a) una guardia estatica **por funcion** —que cada export de los dos
adaptadores que toque `prisma.` declare `scope: InventoryScope` y lo consuma—, que cerraria R13 tal
y como esta escrito; o (b) corregir R13, `design.md > 4.2` y `> 9 C` para que digan lo que el
lenguaje da y nombren al test de integracion como lo que cierra la otra mitad. No vale dejarlo como
esta: hoy el spec afirma algo falso sobre la frontera de seguridad.

### BLOQUEANTE 3 — El down.sql lee bajo FORCE RLS sin el parentesis que el propio UP declara imprescindible

`migration.sql:60-92` dedica treinta lineas a explicar «la mina»: con `FORCE ROW LEVEL SECURITY` y
sin policies se deniega **tambien el SELECT** al dueno, y por eso suelta cuatro tablas —las tres de
inventario porque escribe, y `companies` **porque la lee**— y las vuelve a forzar.

`down.sql:34-95` hace **exactamente esos mismos SELECT** —`companies` (dos veces), `products`,
`presentations`, `product_batches`— y **no abre ningun parentesis**. Si el razonamiento del UP es
cierto, el DOWN lee cero filas, `named_company_rows = 0`, `all_company_rows = 0`, y aborta
**siempre** con el mensaje equivocado («hay 0 empresa(s)»): R6 —revertir y dejar el esquema como
estaba— pasa a ser imposible en ese entorno. Falla cerrado, no hay perdida de dato; pero la
reversion deja de existir.

Por que no lo cazo nadie: el `.env` del worktree conecta como **postgres**, superusuario en local,
que bypasa RLS siempre. Con ese rol el parentesis del UP **tampoco hace nada**, y el test de R7
(`company-scope.int.test.ts:742`, con su anti-placebo incluido) se ejecuta en el unico escenario
donde la pregunta no se plantea. La propia bitacora lo dice a media voz —«devolveria cero filas
**fuera de superusuario**»—, pero eso no esta ni en el SQL ni en el spec.

Las dos mitades de la misma migracion se contradicen. **Que falta:** cerrarlo en un sentido o en
otro, y dejarlo escrito. O el DOWN abre su propio parentesis `NO FORCE`/`FORCE` sobre las cuatro
tablas antes de la guardia (una linea por tabla, el mismo patron que el UP), o el UP documenta que
su parentesis es defensa para un rol que este repo no usa y el DOWN explica por que no lo necesita.

### Menores

- **`docs/architecture.md` se reescribio entero con finales de linea LF.** El diff sale 586/586
  cuando el cambio real es **una linea** (T16, y el contenido es correcto: `inventario (QC-49)` sale
  de la lista de deuda y el resto queda intacto — verificado con `--ignore-cr-at-eol`). Hay que
  volver a guardarlo conservando CRLF antes del PR: asi es un conflicto garantizado y un diff
  ilegible para el humano que aprueba. Es el unico archivo del diff con esta churn.
- **`batchCompanyScope` (`company-scope.ts:59`) es una exportacion muerta.** Ningun archivo de
  produccion la usa; su unico consumidor es su propio test. El `design.md > 5` la publica, asi que
  no contradice nada, pero hoy no filtra ninguna consulta.
- **Dos docblocks de `presentation-prisma.ts` quedaron obsoletos y se contradicen con el parrafo de
  QC-49 que esta veinte lineas mas arriba**: `:68-69` sigue diciendo que
  «`presentations_name_normalized_key` es el unico indice unico de `presentations`» (cayo en esta
  migracion) y `:266-268` que «el NOMBRE de una presentacion si es unico» (lo es por empresa).
- **Frase truncada en `presentation-prisma.ts:47-48`**: el parrafo de QC-49 se inserto **en mitad de
  una frase** del anterior, que queda cortada en «...no hace falta leerlo para distinguir estos».
- **`tasks.md` T17 sin marcar.** Es lo correcto y es honesto —el implementer no se autoaprueba el
  gate—, pero el checkpoint «todas las tasks [x]» no se cumple mientras el gate no este verde.
- **Los recuentos de T1** (23 productos / 114 presentaciones / 1 lote / 37 empresas) son de la base
  compartida, no de `QuimiCloude_QC49`. La bitacora lo dice y el criterio de «hecho» se verifico por
  siembra manual; el `tasks.md` sigue afirmando numeros de otra base.

## Cobertura requisito a requisito

Todos los tests del mapa se abrieron y se comprobo **que afirman**, no solo que existan.

| R | Estado | Nota |
| --- | --- | --- |
| R1, R2 | cubierto | `company-scope.int.test.ts:287` — 23502 sin empresa y 23503 con empresa inexistente, en las tres tablas; lote sin empresa aunque su producto la tenga |
| R3 | cubierto | `:632` ejecuta el bloque real del backfill sobre filas sembradas (vivas, borradas, presentaciones y lotes) y comprueba que no pierde ninguna |
| R4 | cubierto | test de texto de la migracion: cero INSERT, cero DELETE |
| R5 | cubierto | `guard-rls-force` + test de esquema. Verde en el gate |
| R6 | cubierto | test de texto: cada objeto del UP tiene su reverso en el DOWN. Ver bloqueante 3 para el limite de entorno |
| R7 | cubierto | `:742`, **con anti-placebo explicito** (`:772`): sin la comprobacion de filas ajenas la guardia deja pasar |
| R8, R9, R10 | cubierto | identificadores en ingles, regimen de borrado intacto, los tres indices |
| R11 | cubierto | `company-isolation-service.test.ts` — el permiso se exige antes del ambito y del puerto |
| R12 | cubierto | `product-actions` / `presentation-actions`: sin contexto de sesion no se toca el caso de uso; verificado tambien en el codigo (`currentActor` pide las dos caras en paralelo y falla cerrado) |
| **R13** | **a medias** | La parte «el filtro se escribe una vez y todos lo consumen» esta probada. La parte «una implementacion que lo omita no compila» **es falsa**. Bloqueante 2 |
| R14 | cubierto | `company-scope-queries.int.test.ts:330` y `:418` — listado, total, busqueda, filtros, orden inverso |
| R15, R16 | cubierto | `:502` — ficha, updateAlive, softDeleteAlive, addBatchToAlive, replace, deleteById con id ajeno, **cada uno con su control positivo** y verificando que la fila ajena queda intacta |
| R17 | cubierto | `:651` (las cuatro creaciones escriben la empresa del ambito) + `presentation-input.ts` en `strictObject` para el rechazo por campo desconocido |
| R18 | cubierto | `:489` findAliveIdByName no resuelve el homonimo ajeno |
| R19 | cubierto | `:392` + `company-scope.test.ts:133` — ni el select pide la columna, ni los mapeadores la publican aunque la fila la traiga |
| R20, R21 | cubierto | `:550` y `:604` — mismo nombre en dos empresas se acepta, en la misma se rechaza con 23505; productos homonimos siguen permitidos |
| R22, R23 | cubierto | `:393` y `:499` — los disparadores, afirmados **por su etiqueta propia** y no por «lanza algo». Incluye el UPDATE que separa las empresas y la unidad de sistema |
| R24 | cubierto | `authorization.test.ts` ampliado + service |
| R25 | cubierto | `:833` — el inventario sobrevive al borrado logico de su empresa |
| R26 | cubierto | `:782` — el retrato de A y el de B son identicos con FORCE y sin FORCE |
| **R27** | cubierto, **no ejecutado aqui** | `e2e/aislamiento-inventario.spec.ts` cubre los tres puntos que R27 pide y anade control positivo. El gate aborto antes de Playwright |
| R28 | cubierto | `scope.test.ts` mide el alcance en el SQL **y** en el esquema: las cinco tablas de otras fichas |
| R29 | cubierto | `product-catalog.test.ts` — findRefs sin ambito, con el motivo citado |
| R30 | cubierto | test de texto de la migracion |
| R31 | cubierto | firmas publicas y forma de salida intactas; verificado tambien en el diff |
| R32 | cubierto | `package.json` y `pnpm-lock.yaml` sin tocar |

## Las cuatro decisiones fuera del spec, juzgadas una a una

1. **`companyScopeColumns`, la cuarta envoltura.** **Correcta.** El motivo tecnico es real y
   verificable: los `...WhereInput` declaran `companyId` opcional y como union, los
   `...UncheckedCreateInput` lo exigen `string` obligatorio, y esparcir el primero en el `data` de
   un `create` no compila. Delega en la misma `companyScope` privada, asi que sigue habiendo **una**
   definicion. La alternativa era escribir la columna a mano en las cuatro creaciones, que es lo que
   `design.md > 5` prohibe. No contradice el diseno: lo completa.
2. **`presentation-input.ts` a `z.strictObject`.** **Correcta y necesaria.** R17 pide **tres** cosas
   y no dos, y la tercera —rechazar por campo desconocido— con `z.object` no se cumplia: zod podaba
   en silencio. `product-input.ts` y `product-batch-input.ts` ya lo hacian citando QC-52 R1;
   presentaciones era el unico hueco. Verificado que los llamantes construyen el objeto con dos
   campos y nada mas: la estrictez no rompe a nadie.
3. **`companies` dentro del parentesis NO FORCE/FORCE.** **Correcta en el UP**, con precedente
   citado (QC-80 con `units`), sin modificar la tabla y devolviendola a ENABLE+FORCE en el mismo
   bloque. Pero **es justo la decision que deja al descubierto el bloqueante 3**: si hacia falta
   para leer en el UP, hace falta para leer en el DOWN.
4. **El crecimiento de las listas cerradas.** **Ninguna se aflojo** —se comprobo leyendo los
   diffs—, y varias se **reforzaron**:
   - `E2E_ESPERADOS` y `MIGRACIONES_ESPERADAS`: un renglon cada una, con motivo escrito y entrando
     por la puerta que el propio mensaje de la guardia senala.
   - `scope.test.ts:313`: se eligio **enumerar** en vez de afinar el matcher por nombre —lo
     correcto: enumerar es mas estrecho— y ademas se anadio una **defensa extra** (el spec tiene que
     seguir conteniendo `companyId` y `delete-product-id`, o sea seguir siendo lo que dice ser).
     Queda mas estrecha que antes.
   - `inventario-schema.test.ts`, `inventario-constraints`, `list-query-indexes`: ahora **vetan** el
     indice unico global y la unicidad (empresa, lote) de QC-81. Mas estrechos, no menos.
   - **Pero la cuenta esta mal: eran cuatro listas, no tres.** La de
     `tests/unit/shared/data-table-alcance.test.ts` no se toco, y por eso el gate esta rojo.

## Que hay que hacer para que esto pase

1. Anadir `e2e/aislamiento-inventario.spec.ts` a la lista cerrada de
   `tests/unit/shared/data-table-alcance.test.ts:340`, con su motivo escrito, al nivel de las otras
   tres. Y correr `./init.sh` **completo**, hasta la fase de Playwright incluida.
2. Cerrar R13: o la guardia estatica por funcion, o corregir R13, `design.md > 4.2` y
   `design.md > 9 C` para que no afirmen una garantia que el compilador no da.
3. Resolver la contradiccion del `down.sql`: parentesis NO FORCE/FORCE antes de la guardia, o dejar
   escrito en ambos archivos por que el UP lo necesita y el DOWN no.
4. Menores: rehacer `docs/architecture.md` conservando CRLF; decidir que hacer con
   `batchCompanyScope`; arreglar los dos docblocks obsoletos y la frase truncada de
   `presentation-prisma.ts`.

Los tres bloqueantes son acotados. Nada de esto pide rediseno: el aislamiento esta bien construido y
bien probado, y los controles positivos de los tests de integracion y del E2E son de lo mejor que
hay en este repo. Lo que falla es el cierre.

---

# Segunda pasada — 2026-09-11 (F2.2, tras el cierre de los tres bloqueantes)

> Se revisa **solo lo que cambio**. Mismo worktree, misma base `QuimiCloude_QC49`, rama sin commits.
> No se toco el `.env` ni se corrio `db:rollback`. La unica escritura sobre codigo fue una
> **mutacion temporal** para reproducir la prueba de sensibilidad de la guardia nueva, revertida y
> verificada despues (typecheck verde y la funcion original en su sitio).

## Veredicto: **APROBADO (OK)**

Los tres bloqueantes estan cerrados, y los tres bien: no maquillados, no reetiquetados. Cero
bloqueantes abiertos. Queda una observacion sobre el arnes que no es de esta ficha.

## B1 — la cuarta lista cerrada: **cerrado, y no se afloja**

`tests/unit/shared/data-table-alcance.test.ts:330-362`. Verificado en el diff:

- La asercion sigue siendo un `toEqual` sobre un **array literal exacto** de seis entradas. No es un
  `toContain`, ni un filtro, ni un comodin: **un septimo spec que referencie `data-table` la vuelve
  a poner en rojo**. Es exactamente el mismo mecanismo que tenia con cinco.
- El titulo del `it` se actualizo («estos seis») y el mensaje de la asercion tambien, asi que el
  centinela no queda mintiendo sobre su propio contenido.
- El motivo esta escrito en dos sitios —la cabecera del `it` y la propia fila— y dice lo correcto:
  el spec **no estrena pantalla**, atraviesa las dos que ya consumen la tabla compartida y localiza
  `data-table-cell-name` porque lo que afirma son las **filas servidas**. El E2E de recetas sigue
  fuera.

**Se tensa, no se afloja.** Cerrado.

## B2 — la asimetria de R13: **cerrado por las dos mitades, y las tres cosas verificadas por separado**

### a) La guardia muerde de verdad — mutacion repetida por el reviewer

Se aplico la mutacion a mano sobre `product-prisma.ts`: `findAliveProductById` pierde el parametro
`scope` **y** el `productCompanyScope(scope)` de su `where`, o sea una lectura que se lleva el
inventario de todas las empresas. Resultado medido:

- `pnpm run typecheck` sobre **produccion**: **ningun error en `lib/`, `app/` ni `e2e/`**. El
  cableado de `lib/composition/index.ts` al puerto `ProductRepository` compila con la fuga dentro.
  (Los seis errores que salen son de **archivos de test** que llaman a la funcion concreta con dos
  argumentos: incidental, no la frontera.) La asimetria queda confirmada empiricamente, no citada.
- `tests/guards/guard-ambito-empresa-inventario.test.ts`: **ROJO, 2 casos** —el del puerto (`:285`)
  y el del barrido por archivo (`:352`)—, con mensajes que nombran la funcion y el motivo.
- `tests/unit/inventario/company-scope.test.ts`: **VERDE**, como se anuncio. Es la demostracion de
  que la guardia nueva cubre justo lo que la vieja —por archivo— dejaba pasar.
- Arbol restaurado: typecheck verde y la guardia nueva de vuelta en **20/20**.

La guardia, ademas, esta bien construida y no es un barrido ingenuo:

- Cruza los **metodos declarados en los dos puertos** con el **cableado real de
  `lib/composition/index.ts`** y exige que las dos listas coincidan (`:265`), asi que un metodo
  nuevo no puede quedarse fuera del barrido en silencio.
- Comprueba **las dos mitades**: que se declare `scope: InventoryScope` **y** que el `scope` llegue
  por cierre transitivo hasta una envoltura de `./company-scope`, directamente o por un ayudante del
  mismo archivo. Declararlo y no usarlo tambien cae.
- Lleva **anti-placebo del troceador** (`:303-321`): si `funcionesDe` dejara de reconocer las
  declaraciones, el barrido encontraria cero funciones y pasaria en verde sin mirar nada; por eso
  exige minimos de 8/4/1 consultas por archivo. Exige minimo y no igualdad, que es lo correcto: una
  consulta nueva entra por el barrido, no rompe el centinela.
- La lista de excepciones es **cerrada y de un solo nombre** (`findProductRefs`), y ademas verifica
  que la excepcion **siga siendo excepcion** —que no declare ambito— y que el archivo siga
  documentando R29 y su destino QC-50. Si QC-50 la cierra, la guardia obliga a sacarla de la lista.

### b) Los textos ya no afirman lo que el lenguaje no da

- `requirements.md` R13: reescrito. Ahora separa las dos mitades: una **llamada** que la omita no
  debe compilar, y una **implementacion** que la omita —que el compilador SI acepta— no debe poder
  llegar a `dev`, por lo que el sistema debe rechazarla de forma **mecanica y automatica**,
  comprobando **metodo a metodo**. Es **mas exigente**, no mas laxo: el requisito pasa de apoyarse
  en una propiedad inexistente a exigir un mecanismo que ahora existe y esta probado. Lleva su nota
  de correccion fechada, diciendo que era una afirmacion falsa y no una relajacion.
- `design.md > 4.2`: corregido, con la prueba del `tsc` escrita y el matiz de por que las escrituras
  se salvan de rebote (Prisma exige `companyId` obligatorio en los `...UncheckedCreateInput`) y las
  lecturas no. Nombra las dos cosas que cierran la mitad restante: la guardia por funcion y el test
  de integracion.
- `design.md > 9 B`: la frase de cierre ya no dice «no compila» a secas, dice «olvidarlo en una
  llamada no compila y olvidarlo en una implementacion lo caza la guardia por funcion».

### c) El descarte de la extension del cliente Prisma se sostiene sin la premisa caida — **si se sostiene**

`design.md > 9 C` retira el tercer motivo en vez de disimularlo, y deja los dos que quedan. Se
juzgaron uno a uno:

- **Implicita**: argumento de legibilidad y depuracion —una consulta filtra por algo que no esta
  escrito en el archivo que la escribe—. No depende del sistema de tipos en absoluto. Vale solo.
- **Global**: argumento de **alcance**, y es el decisivo. El cliente Prisma es uno y compartido; una
  extension que inyecte `companyId` alcanzaria a `identity`, `recetas`, `proveedores` y `pedidos`,
  que **R28 deja explicitamente fuera** y cuyas tablas ni siquiera tienen la columna. La alternativa
  —ensenarle a distinguir tabla por tabla— es la misma enumeracion explicita en peor sitio. Vale
  solo, y por si mismo haria inviable la opcion.

El descarte **se sostiene con cualquiera de los dos**. El motivo nuevo que se anade a favor del
enfoque elegido —que el ambito explicito en la firma es lo que **admite** el chequeo mecanico por
funcion, que sobre una extension global no habria nada escrito que leer— es correcto y no circular.

**Cerrado, las tres cosas.**

## B3 — el down.sql: **cerrado, y las dos mitades dicen ya lo mismo**

- `down.sql:65-68`: el DOWN abre **su propio parentesis** `NO FORCE` sobre **las cuatro** tablas,
  antes de la guardia de R7.
- Se cierra entero y sin ventana: `companies` vuelve a `ENABLE`+`FORCE` en `:144-145`, en cuanto
  termina la guardia que es su unico lector, y las tres de inventario en `:205-210`, en el bloque 6
  que ya existia. Comprobado que los seis ALTER de cierre cubren las cuatro aperturas.
- El razonamiento del camino de excepcion es correcto: no hace falta `EXCEPTION WHEN` porque el DDL
  es transaccional en Postgres y un `RAISE` de la guardia deshace tambien estos cuatro ALTER.
- **La limitacion esta escrita en los dos archivos y donde toca**: `down.sql:56-63` y
  `migration.sql:82-94`, las dos con el mismo fondo —en local conecta `postgres`, superusuario, que
  se salta la RLS siempre; con ese rol **ni el parentesis del UP ni el del DOWN hacen nada**, y el
  test de R7 corre en el unico escenario donde la pregunta no se plantea, asi que **no prueba este
  caso y no puede probarlo**—. Eso es exactamente lo que pedia el hallazgo: decirlo en vez de
  aparentar una verificacion que no existe.
- Y lo que **si** es verificable en local se verifica:
  `tests/unit/inventario/schema/inventory-company-scope-migration.test.ts:1005` comprueba que el
  DOWN abre el parentesis sobre las cuatro, **con su propia prueba de sensibilidad** (quitar el
  `NO FORCE` de `companies`, que es la mina, pone el caso en rojo).

**Cerrado.**

## Menores — los cuatro cerrados

- `docs/architecture.md`: **restaurado a CRLF**. `git diff --numstat` da **1/1**; el contenido sigue
  siendo el correcto (T16).
- `batchCompanyScope`: **borrada**. Solo quedan dos menciones, y las dos son prosa que explica por
  que se borro (`company-scope.ts:52`, `company-scope.test.ts:45`). Ninguna referencia viva.
- Docblocks obsoletos de `presentation-prisma.ts`: **corregidos**. `:70-74` ahora dice que el unico
  indice unico es `presentations_company_name_unique` y que el global de QC-20 cayo; `:271` dice que
  el nombre es unico **dentro de su empresa**.
- Frase truncada: **completada** (`:47-48`, «...para distinguir estos **dos casos, que es lo unico
  que exige el puerto**»).

## El gate, corrido por el reviewer

`./init.sh` completo desde el worktree, **exit 0**:

    Test Files  2 failed | 337 passed (339)
         Tests  2 failed | 4624 passed | 31 skipped (4657)
    tests: sin rojos nuevos (2 rojos, todos en el baseline de 5); 3 por limpiar
    todas las migraciones tienen down.sql
    == init OK ==

- Los **dos** rojos son las dos entradas de baseline que dependen de `git diff origin/dev...HEAD`,
  vacio porque la rama no tiene commits. Ninguno es de QC-49.
- El rojo nuevo de la primera pasada (`data-table-alcance.test.ts`) **ya no aparece**.
- **`tests/unit/composition/identity-facade.test.ts` paso en mi corrida**, en 5,7 s el archivo
  entero (9 casos) contra un presupuesto de 15 s por caso. **Coincido con la atribucion de flake**:
  la rama no toca `lib/composition/` —comprobado en `git status`, ese archivo no esta modificado— ni
  `tests/unit/composition/`, asi que no hay camino por el que esta ficha pueda afectarlo. No es
  hallazgo.
- El gate marca ademas **3 archivos del baseline que ya pasan** y hay que limpiar. No es de esta
  ficha; queda anotado para el leader.

## R27, verificado aparte — y por que hizo falta

**`./init.sh` no ejecuta Playwright.** Sus fases son typecheck, lint, vitest, comprobacion de
`down.sql` y `.env`; no hay paso de E2E. O sea que «gate verde» **no** cubre R27, ni en esta ficha ni
en ninguna. Para no dar por buena la bitacora, el E2E se corrio aparte:

    npx playwright test e2e/aislamiento-inventario.spec.ts --project=chromium --project=webkit
    2 passed (41.3s)

R27 verificado por el reviewer en los dos navegadores.

**Observacion para el leader, que no es de QC-49:** el checkpoint «si la feature toca un flujo
critico hay al menos un test E2E» se verifica hoy **a mano**, porque el gate no corre Playwright.
Mientras siga asi, quien apruebe una ficha con E2E tiene que correrlo aparte y decirlo. Material para
una ficha del arnes, no para esta.

## Estado de los checkpoints tras la segunda pasada

- Especificacion: OK. `tasks.md` con T17 aun `[ ]` — es del leader y el gate ya esta verde, asi que
  puede marcarse. Es lo unico pendiente.
- Trazabilidad: **OK, los 32**. R13 pasa de «a medias» a **cubierto**: el requisito ya dice lo que es
  verdad y lo cierra `guard-ambito-empresa-inventario.test.ts` (20 casos), con mutacion reproducida
  por el reviewer. R27 cubierto y ejecutado.
- Calidad de codigo: typecheck, lint y `pnpm test` en verde; E2E verde en Chromium y WebKit; sin UI
  nueva; sin dependencias nuevas.
- Datos y seguridad: OK. Aislamiento en el service, RLS como defensa en profundidad, migracion
  reversible con su `down.sql` y su limitacion de entorno escrita.
- Verificacion final: `./init.sh` en verde. Faltan los pasos del leader —marcar T17, entrada en
  `progress/history.md` y desmontar el worktree—.

**Veredicto final: OK. Cero bloqueantes.** El trabajo de cierre fue honesto: las tres correcciones no
esconden nada, la que tocaba un requisito lo dejo **mas exigente** que antes, y la que no se podia
probar en local se documento como no probable en vez de fingir una verificacion.
