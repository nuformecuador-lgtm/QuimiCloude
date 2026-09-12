# QC-90 — alta-del-primer-lote · review

> Lo escribe el `reviewer`. Verifica, no edita. Worktree `.worktrees/QC-90-alta-del-primer-lote`,
> rama `feature/QC-90-alta-del-primer-lote`. Fecha: 2026-09-10.
> Base de comparacion: `git merge-base origin/dev HEAD` = `192842a`.
>
> El diff se leyo sobre el ARBOL DE TRABAJO, no solo sobre los commits: al recibir la rama, 24 de
> los 30 archivos de la implementacion estaban sin commitear (hallazgo menor m1).

## Veredicto

**RECHAZADO** — por **un** hallazgo mayor, y solo uno: el disparador de ayuda que T0 anadio a
`components/shared/presentation-select.tsx` mide 24x24 px, por debajo del minimo de 44x44 que
`docs/architecture.md > Componentes > Regla: multiplataforma` exige, y el `design.md` de la ficha
no declara la excepcion — al contrario, afirma que «no entra ningun control nuevo».

Todo lo demas esta bien, y no es poco: los 32 requisitos tienen test que de verdad los mide, el
gate completo se reprodujo en verde de forma independiente, y los cinco puntos donde el spec se
podia haber roto en silencio —coma flotante, cero del cliente, autorizacion en el service,
atomicidad y producto existente— se comprobaron uno a uno y **aguantan**. El arreglo del hallazgo
mayor es una linea de CSS o una linea de `design.md`; no toca nada de la logica.

## Checklist de `CHECKPOINTS.md`

### Especificacion
- [x] `requirements.md` con R1-R32 en EARS, 14 decisiones cerradas y 5 preguntas abiertas.
- [x] `design.md` con cuatro alternativas descartadas y su porque (seccion 10, A-D).
- [x] `tasks.md`: 15 tasks (T0-T14), **todas** `[x]`. T0 se anadio sobre la marcha y esta declarada
      como deuda de rama, no como requisito.

### Trazabilidad
- [x] Cada `R<n>` mapea a al menos un test concreto. **Verificado abriendo los archivos**, no
      leyendo la tabla del implementer. Ningun requisito cae en un test vacuo.
- [x] `progress/impl_QC-90-alta-del-primer-lote.md` trae el mapa `R1..R32 -> test` completo.

### Calidad de codigo
- [x] `pnpm run typecheck` verde (dentro de `./init.sh`).
- [x] `pnpm run lint` verde.
- [x] `pnpm test` verde: **302 archivos, 3866 tests, 18 skipped, 0 rojos**. Cifras identicas a las
      de la bitacora, obtenidas en una corrida propia.
- [x] Flujo critico con E2E: es movimiento de inventario **y** importe, y lleva dos casos nuevos en
      `e2e/inventario.spec.ts`, en Chromium y WebKit.
- [ ] **Multiplataforma: NO.** Ver hallazgo mayor M1.
- [x] Dependencias: `package.json` y `pnpm-lock.yaml` **no cambian** (diff contra el merge-base
      vacio para los dos). La guardia del gate lo confirma. `design.md > 5` justifica por escrito no
      meter una libreria de decimales.

### Datos y seguridad
- [x] Ninguna tabla nueva: `db/` intacto contra el merge-base, cero migraciones (R29).
- [x] Aislamiento por empresa: no se dispara. No hay modelo nuevo en `db/schema.prisma`, y que
      `products` y `product_batches` no tengan `company_id` es **deuda registrada** de la epica
      QC-46 (QC-49), declarada en `docs/architecture.md > Dominio` n.º 1 y citada en
      `design.md > 9`. No es incumplimiento de esta ficha.
- [x] Permiso en el SERVICE con su test: `requirePermission(actor, 'inventario.modificar')` es la
      primera linea de `create-product.ts`, antes de zod y antes del puerto; el test recorre
      **cuatro actores x ocho metodos del puerto** comprobando que no se llama ni uno.
- [x] RLS: `product_batches` ya viene con `ENABLE` + `FORCE` sin policies desde el 2026-09-09, y una
      guardia comprueba que la migracion conserva sus dos `CHECK` y ese RLS.
- [x] Acceso a datos solo por el repositorio Prisma. Ningun cliente de Supabase.
- [x] Migraciones con `down.sql`: sin cambios que revisar.
- [x] Sin secretos hardcodeados. Sin webhooks.

### Modulos hexagonales
- [x] `domain/` y `ports/` no importan framework ni Prisma. `unit-cost.ts` y
      `product-batch-input.ts` son puros; el puerto habla en cadena decimal y fecha civil.
- [x] `product-prisma.ts` sigue siendo el unico archivo del modulo que importa `@prisma/client`, y
      sigue sin tocar `users`: la autoria se escribe como escalar, sin `connect` ni `include`.
- [x] Cableado solo en `lib/composition/index.ts`.
- [x] Nada de `use server` reexportado desde el barrel; el barrel sigue client-safe.
- [x] Ninguna ruta de API propia; la mutacion sigue siendo Server Action.
- [x] La logica vive en `domain/`: la action solo traduce FormData a candidato y error a estado, y
      hay un test que comprueba que no repite el permiso.

### Verificacion final
- [x] `./init.sh` completo, corrido por el reviewer: `== init OK ==`, exit 0.
- [ ] Entrada en `progress/history.md` (la escribe el leader al cerrar).
- [ ] Worktree por desmontar (al cerrar).

## Los cinco puntos donde el spec se podia haber roto en silencio

Se comprobaron a proposito, uno por uno. **Ninguno esta roto.**

1. **El importe nunca pasa por coma flotante.** Barrido de `parseFloat`, `toFixed` y `Number(`
   sobre los cinco archivos del camino: solo aparece `Number(trimmed)` **dos** veces, y las dos
   sobre `stock`/`qtyAlert` en `readOptionalFormInt` y `parseInteger` — enteros, no importes. La
   derivacion es `BigInt` puro con escalado a 4 decimales. Y hay **tres** barridos de fuente que lo
   sostienen (`unit-cost.test.ts`, `create-product.test.ts`, `product-actions.test.ts`). El
   redondeo es **mitad arriba**, no truncado: `divideRoundingHalfUp` compara `resto * 2 >= divisor`,
   con caso propio, y el E2E elige `8000.05 / 7`, cuyo quinto decimal es `8` — el numero que
   distingue `1142.8643` de `1142.8642`. Bien elegido.
2. **El cliente rechaza el 0.** `FIELD_MESSAGES` pasa a «mayor que 0» y, mas importante, el panel
   valida con **el mismo objeto** que el servidor. El test recorre `0`, `0.0` y `0.0000`, comprueba
   que se pinta en `unitCost` y en ningun otro campo, y que la action **no se llama**.
3. **Autorizacion en el service, antes de zod y del puerto.** Confirmado en `create-product.ts`
   linea 77 y con el caso «rechaza por permiso ANTES que por entrada invalida», que es la unica
   forma de observar el orden.
4. **Atomicidad.** El puerto ofrece **una** operacion para las dos filas, no dos: el dominio no
   puede dejar la mitad escrita ni queriendo. El `catch` esta **fuera** de `$transaction` — si
   estuviera dentro la consumiria y el producto quedaria comiteado. Test de integracion contra
   Postgres real: «un fallo del lote no deja ningun producto escrito».
5. **Producto existente.** `addBatchToAlive` recibe id + lote + instante y **nada mas**; el test
   afirma sobre `Object.keys` del lote, asi que un campo del producto colandose lo pondria rojo. El
   de integracion comprueba que `name`, `stock`, `qty_alert` y hasta `updated_at` quedan intactos, y
   el E2E lo confirma por UI comparando la fila entera antes/despues.

Ademas: **`PresentationSelect.helper` es opcional y aditiva** — `helper?: ReactNode`, y sin ella no
se pinta nada. Los dos consumidores (inventario y proveedores) siguen verdes.

## Hallazgos

### Mayor (BLOQUEANTE)

**M1 — Objetivo tactil de 24x24 px en un componente compartido, sin excepcion declarada.**
`components/shared/presentation-select.tsx:330` — el boton disparador de la ayuda lleva
`className="flex size-6 ..."`, o sea **24x24 px**, cuando
`docs/architecture.md > Componentes > Regla: multiplataforma` (linea 530) exige **44x44**, y
`CHECKPOINTS.md` lo lista como bloqueante salvo excepcion escrita en el `design.md` de la feature.

Por que es hallazgo y no ruido:

- **El propio archivo define la constante correcta**, `TOUCH_TARGET = 'min-h-11 min-w-11'`
  (`presentation-select.tsx:32`), y el boton nuevo no la usa. El criterio del repo esta escrito
  trescientas lineas mas arriba, en el mismo archivo.
- Es **codigo nuevo** en `components/shared/`, que es donde la regla dice que rige: «Rige para
  codigo nuevo… cuando una feature toque un componente existente, se aplica a lo que toque». Los
  otros disparadores compartidos si lo cumplen y **tienen test propio de ello**
  (`tests/unit/shared/data-table-header-menu.test.tsx:145` y
  `tests/unit/shared/data-table-filter-date.test.tsx:303`, «el disparador cumple el objetivo tactil
  minimo»). El test nuevo, `tests/unit/shared/presentation-select-helper.test.tsx`, comprueba
  `type="button"`, el `aria-label` y la apertura, pero **no** el tamano.
- El `design.md` **no** declara la excepcion, y su seccion 8 afirma lo contrario: «no entra ningun
  control nuevo… los objetivos tactiles siguen en `min-h-11`. **No hay excepcion de escritorio que
  declarar**». Esa frase era cierta cuando se escribio y dejo de serlo cuando T0 entro sobre la
  marcha. Nadie volvio a mirar el parrafo de multiplataforma despues de anadir T0.

Atenuante que hay que decir, porque cambia el arreglo: el bloque replica **literalmente** el de
`ProductField` (`app/(private)/inventario/components/product-field.tsx:80-89`), que ya esta en `dev`
desde `b4822de` (decision humana del 2026-09-03) y que la regla de alcance exime por ser anterior.
Subir solo este a 44 px deja los dos iconos de ayuda **del mismo panel** con tamanos distintos.

**Que falta para cumplirlo** — cualquiera de las dos, y es decision del humano:

- (a) `size-6` pasa a `size-6 min-h-11 min-w-11` (o a la constante `TOUCH_TARGET`) en el
  disparador, con un caso en `presentation-select-helper.test.tsx` que lo afirme, como hacen los
  otros dos compartidos — y entonces conviene la misma pasada en `ProductField`, que es otra ficha;
  o
- (b) declarar la excepcion en `specs/QC-90-alta-del-primer-lote/design.md > 8`, corrigiendo la
  frase «no entra ningun control nuevo» y explicando por que el icono de ayuda se queda en 24 px
  (consistencia con el patron ya mergeado). La regla admite esta salida de forma explicita: «la
  excepcion se documenta donde se decide».

### Menores

**m1 — La implementacion llega sin commitear.** `git log origin/dev..HEAD` trae dos commits
(`ec0daa3` mas un merge) y solo contienen el formulario, el picker, dos tests y los specs. Los otros
**24 archivos** —los tres del dominio nuevo, el puerto, el adaptador, la composicion, la action, los
seis archivos de test nuevos y el E2E— estan como `M` o `??` en el arbol de trabajo. El gate mide el
arbol, asi que lo verificado es lo correcto; pero en un worktree cuya pila de stash es compartida,
todo esto esta a un `git checkout` ajeno de desaparecer. Se commitea antes del PR, y `./init.sh`
completo se vuelve a correr entonces (regla 5 de `CLAUDE.md`).

**m2 — `design.md > 8` quedo desactualizado por T0.** Independientemente de como se cierre M1, la
frase «no entra ningun control nuevo» es falsa desde que T0 anadio el disparador de ayuda. El
`design.md` es el sitio donde la excepcion se declara, asi que no puede afirmar lo contrario.

**m3 — El caso R19 del test de dominio es indistinguible del camino por defecto.**
`tests/unit/inventario/create-product.test.ts:423` monta `findAliveIdByName` devolviendo `null`, que
es exactamente lo que el doble ya devuelve por defecto: como test de «el nombre solo coincide con
borrados» no anade informacion sobre «no coincide con nada». No es bloqueante porque **R19 si esta
cubierto de verdad** en `tests/integration/inventario/product-batch-write.int.test.ts:538`, contra
Postgres, con homonimos borrados logicamente sembrados a proposito — que es donde vive la decision.
El comentario del propio caso lo reconoce; queda anotado para que nadie lo lea como la prueba
principal.

**m4 — `tests/unit/inventario/module-contract.test.ts` no usa punto y coma**, a diferencia del resto
de `tests/unit/inventario/`. Lint pasa, asi que es preferencia y no incumplimiento. Se anota para
que la proxima ficha no lo tome como el estilo del directorio.

## Las tres decisiones que el implementer dejo senaladas: mi juicio

**1. El rojo E2E de QC-22 («un usuario que no es Administrador acaba fuera y no ve el catalogo»).
DE ACUERDO: no es hallazgo de QC-90.** Verificado por mi cuenta y no dado por bueno:
`git diff --name-only <merge-base>...HEAD -- lib/modules/identity/` sale **vacio**, y tambien el
diff del arbol de trabajo; y `lib/modules/identity/domain/route-access.ts:8` dice literalmente que
la regla ruta-a-rol «se retiro entera (QC-75 R16)». QC-75 ya esta en `dev`, o sea que la premisa del
caso la derogo otra ficha. Correcta tambien la correccion sobre el gate: `./init.sh` no invoca
Playwright, asi que ese rojo no lo enrojece. **Pero no lo dejaria solo anotado en la bitacora de
QC-90**: es un E2E de permisos —flujo critico segun `CHECKPOINTS.md`— que lleva rojo en `dev` desde
QC-75 y que hoy no afirma nada. Merece **ficha propia**, y decidir que afirma ahora (un 404 a quien
no tenga `inventario.consultar`) es trabajo de spec, no de esta rama. Lo unico que anado a lo que el
implementer propone es que la ficha **se cree**, no que se quede en una lista de pendientes.

**2. Los 5 archivos del baseline que ya pasan. DE ACUERDO en no tocarlos aqui.** Los cinco `motivo`
de `tests/baseline-rojos.json` explican por que pasan en una rama y no en `dev`: cuatro son guardias
colgadas de un rango `git` que en `dev` esta vacio y aqui no, y la quinta
(`product-crud.int.test.ts`) es el flake de saturacion de QC-83. Borrarlos desde una rama de feature
pondria el gate de `dev` en rojo en cuanto se mergeara. Es deuda del arnes, no de la ficha. Anado un
dato de mi corrida: el flake **tampoco se disparo aqui**, lo que alimenta el criterio de su propia
nota («RETIRAR en cuanto la suite completa pase tres veces seguidas con el archivo dentro») — esta
es una de esas veces, no la tercera.

**3. El flake de `product-page.test.tsx` NO se mete al baseline. DE ACUERDO, y con enfasis.** Es la
decision correcta y por el motivo correcto: el archivo salio del baseline en QC-58 al arreglar la
causa, y volver a meterlo por una expiracion bajo saturacion apagaria **36 casos** —entre ellos los
seis que esta ficha acaba de escribir para R25, R26, R27 y R28— justo cuando mas hacen falta. El
implementer aplico el diagnostico barato que `docs/verification.md` prescribe (correr el archivo
solo: 36/36) y repitio el gate en verde. En mi corrida completa el archivo **paso**, lo que
corrobora que era saturacion y no regresion.

## Mapa `R<n> -> test` verificado

Los 32 mapean, y se comprobo **abriendo el archivo de test**. Los que se inspeccionaron caso por
caso, por ser los que mas facil se quedan en test vacuo:

| R | Donde muerde de verdad |
|---|---|
| R1 | `create-product.test.ts:220` — el alta nunca llama a `create`, el unico metodo capaz de escribir un producto pelado |
| R4 | tres barridos de fuente mas `product-actions.test.ts`, que afirma el tipo cadena y los ceros a la derecha intactos |
| R7 | `unit-cost.test.ts` (division periodica y mitad exacta) + integracion + E2E con un dividendo que distingue redondeo de truncado |
| R8 | los tres niveles: esquema (issue colgado de `stock`), caso de uso y **pantalla**, que ademas afirma que ningun costo se marca y que corregir la existencia desbloquea el alta |
| R18 | `Object.keys` del lote que llega al puerto + integracion sobre `name`, `stock`, `qty_alert` y `updated_at` + E2E comparando la fila entera |
| R21 | integracion real: se fuerza el fallo del lote y se comprueba que **no queda producto** |
| R23 | 4 actores x 8 metodos del puerto, ninguno llamado, mas el caso del orden frente a zod |
| R29 | dos guardias: el rango `merge-base...HEAD` **y** el arbol de trabajo contra `git ls-tree`, con `ctx.skip` ruidoso cuando el rango no existe o esta vacio |
| R30 | sobre `Object.keys` del modulo **cargado**, no sobre texto, con regla estructural y ancla anti-vacuidad |
| R31 | tipo condicional que enrojece el `typecheck` mas la lectura del mapeo del picker |
| R32 | E2E en Chromium y WebKit, leyendo el importe con `unit_cost::text` |

Las siete mutaciones que el implementer documenta (T11 y T12) se leyeron y son mutaciones de
verdad: cada una rompe algo que el caso deberia cazar, y la de «rama inexistente» comprueba que el
caso **se salta** en vez de fallar o de pasar en vacio.

## Salida del gate (corrida del reviewer, no copiada de la bitacora)

```
regla max-2-por-zona respetada (in_progress=2)
specs presentes para features sdd en vuelo
typecheck paso
lint paso

 Test Files  302 passed (302)
      Tests  3866 passed | 18 skipped (3884)
   Duration  246.88s

aviso: 5 archivo(s) del baseline ya pasan; toca limpiarlos: [los cinco de siempre]
tests: sin rojos nuevos (0 rojos, todos en el baseline de 5); 5 por limpiar
todas las migraciones tienen down.sql
== init OK ==
```

`exit 0`.

## Que hace falta para que esto sea OK

Una sola cosa:

1. **Cerrar M1**: subir el disparador de ayuda de `presentation-select.tsx` a 44x44 con su test, o
   declarar la excepcion en `design.md > 8`. En los dos casos hay que corregir la frase «no entra
   ningun control nuevo» de ese mismo parrafo (m2), porque T0 la dejo falsa.

Y antes del PR, con independencia de M1: **commitear los 24 archivos sueltos** (m1) y volver a
correr `./init.sh` completo sobre el arbol ya commiteado.

---

# Segunda ronda — 2026-09-10

> El implementer atendio el hallazgo mayor y los cuatro menores. Se revisa **solo el delta**:
> `git diff ac5106f..HEAD`, mas una relectura de lo que ya estaba aprobado por si el agrandado de
> `ProductField` —que usan **todos** los campos del panel— hubiera roto algo.
> Arbol de trabajo **limpio**: `git status --porcelain` sin salida.

## Veredicto de la segunda ronda

**APROBADO.**

El hallazgo mayor esta cerrado de verdad —area tactil real, no un `aria` ni un margen negativo—,
los cuatro menores tambien, y nada de lo que ya estaba dado por bueno se movio. Gate completo
corrido por el reviewer: **303 archivos / 3869 tests / 18 skipped / 0 rojos**, exit 0.

## M1 — cerrado, y bien cerrado

Decision humana: **cumplir la regla, no declarar la excepcion**. Es la salida (a) de mi informe, y
ademas la mas cara de las dos: se arregla tambien `ProductField`, que estaba **exento por alcance**.

| Comprobacion | Resultado |
|---|---|
| `presentation-select.tsx:330` | `className={`flex ${TOUCH_TARGET} shrink-0 …`}`, y `TOUCH_TARGET` es `'min-h-11 min-w-11'` (linea 32 del mismo archivo) |
| `product-field.tsx:82` | lo mismo, con la constante de su propio archivo (linea 10) |
| Area pulsable REAL | Si. Crece el `<button>`, no un pseudo-elemento: `min-h-11 min-w-11` mas `flex items-center justify-center`. **Ni un margen negativo** en ninguno de los dos, y el icono dibujado sigue en `size-4` centrado |
| El flex del padre no lo recorta | `shrink-0` en los dos, dentro del `flex items-center gap-1.5` de la etiqueta. Es el detalle que se habria comido los 44 px de ancho en pantalla estrecha |
| Los tests muerden | Si, y se ve por inspeccion sin necesidad de repetir la mutacion: afirman `toHaveClass('min-h-11')`, `toHaveClass('min-w-11')` **y** `not.toHaveClass('size-6')`. Volver a `size-6` rompe las tres a la vez, en los dos archivos |

Tests nuevos: `tests/unit/inventario/product-field.test.tsx` (archivo nuevo, 2 casos) y el caso «el
disparador cumple el objetivo tactil minimo» en
`tests/unit/shared/presentation-select-helper.test.tsx`. Los dos siguen el patron de los otros
disparadores compartidos del repo, que es lo que pedia el hallazgo. El segundo caso de
`product-field.test.tsx` —«sin `helper` no hay disparador que medir»— evita el verde vacuo si
alguien deja de pintar el boton.

**Nada se rompio al agrandar.** Era el riesgo real de esta ronda, porque `ProductField` lo usan los
seis campos del panel: `product-page.test.tsx` (36 casos que montan la pantalla entera) sigue en
verde, y la suite completa tambien.

## m2, m3, m4 — cerrados

**m2.** `design.md > 8` reescrito. No se limita a corregir la frase: deja por escrito **por que**
era falsa —T0 entro fuera del plan y nadie releyo el parrafo— y la leccion operativa («cuando entra
una task fuera del plan, este parrafo hay que releerlo»). Eso vale mas que la correccion.

**m3 — verifique el razonamiento, que es lo que se me pidio, y es CORRECTO.** El implementer eligio
mi salida (b) y argumenta que (a) no es honestamente posible. Comprobado en el codigo, no aceptado
de palabra:

- el puerto es `findAliveIdByName(name): Promise<string | null>`
  (`lib/modules/inventario/ports/product-repository.ts`);
- el `deleted_at IS NULL` vive **entero** en el `where` del adaptador
  (`product-prisma.ts:findAliveIdByName`);
- luego, desde el caso de uso, «el unico homonimo esta borrado» y «no hay ningun homonimo» son
  **literalmente el mismo valor**, `null`. Un doble que los distinguiera estaria reimplementando la
  semantica del adaptador dentro de un test de dominio: afirmaria la premisa, no el comportamiento.

O sea que mi m3 pedia algo que el diseno hace imposible por construccion, y eso **es la respuesta
correcta al hallazgo**, no una evasion. El `describe` pasa a «R19 — sin id del puerto, el alta crea
producto nuevo», que es lo que de verdad mide, y el comentario remite por ruta y por nombre de caso
al test que si prueba R19 contra Postgres. La trazabilidad de R19 no se debilita: sigue cubierta en
`tests/integration/inventario/product-batch-write.int.test.ts` con homonimos borrados sembrados a
proposito.

**m4.** Punto y coma alineado en `tests/unit/inventario/module-contract.test.ts`.

**m1.** Todo commiteado: seis commits del implementer (`3470635`, `901f0b6`, `fc4293d`, `2b9f062`,
`92c2dd5`, `0e04f1a`) y uno del leader (`36a1ba1`) con la ficha del board. Separar ese ultimo es
correcto: `feature_list.json` es del leader, no del implementer.

## Relectura de lo ya aprobado, sobre HEAD

Se volvio a medir sobre el arbol commiteado, no sobre el que revise la primera vez:

- Coma flotante: siguen siendo **dos** `Number(` en todo el camino, los dos sobre enteros
  (`product-actions.ts:122`, `product-form.tsx:161`). Ningun `parseFloat`, `toFixed` ni `parseInt`.
- `requirePermission(actor, 'inventario.modificar')` sigue siendo la primera linea del caso de uso,
  antes de zod (`create-product.ts:77`).
- Los dos `catch (error)` del adaptador siguen **fuera** de su `$transaction`
  (`product-prisma.ts:490/511` y `542/556`).
- `package.json`, `pnpm-lock.yaml` y `db/` siguen **intactos** contra el merge-base original
  (`192842a`): cero dependencias, cero migraciones (R29).
- `feature_list.json` con QC-90/91/92 no rompe la regla del arnes: el gate imprime
  «regla max-2-por-zona respetada (in_progress=2)».

## Gate de la segunda ronda (corrido por el reviewer)

```
regla max-2-por-zona respetada (in_progress=2)
specs presentes para features sdd en vuelo
ninguna ficha sembrada esperando al board
cada spec sembrado tiene su ficha, con el mismo slug
typecheck paso
lint paso

 Test Files  303 passed (303)
      Tests  3869 passed | 18 skipped (3887)
   Duration  278.59s

aviso: 5 archivo(s) del baseline ya pasan; toca limpiarlos: [los cinco de siempre]
tests: sin rojos nuevos (0 rojos, todos en el baseline de 5); 5 por limpiar
todas las migraciones tienen down.sql
== init OK ==
```

`exit 0`. Coincide con lo que reporta el implementer: 303 archivos y 3869 tests, tres mas que en la
primera ronda — los tres casos de tamano tactil que M1 hizo escribir.

## Lo que sigue abierto, y no lo cierra esta ficha

No son hallazgos: quedan anotados para el leader, tal como se acordo en la primera ronda.

1. **El E2E de QC-22** cuya premisa derogo QC-75: necesita **ficha propia** que decida que afirma
   ahora. No enrojece `./init.sh`, que no corre Playwright.
2. **Los 5 archivos del baseline** que ya pasan en esta rama: limpiarlos es decision del arnes, no
   de la ficha, y hacerlo desde aqui pondria el gate de `dev` en rojo.
3. **Las tres preguntas abiertas** del `requirements.md` —moneda del importe, trazabilidad por lote
   a medias y que pasa con el lote de un producto borrado—, mas el aislamiento por empresa (QC-49)
   y la carrera del alta de un nombre nuevo (QC-81).
4. Del checklist de `CHECKPOINTS.md` quedan los dos pasos que **son del leader**: la entrada en
   `progress/history.md` y desmontar el worktree.
