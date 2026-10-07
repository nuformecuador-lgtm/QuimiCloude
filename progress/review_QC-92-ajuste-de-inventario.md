# QC-92 — ajuste-de-inventario · review

> Rama `feature/QC-92-ajuste-de-inventario`, HEAD `1fe321e`. Árbol limpio.
> Revisado contra `specs/QC-92-ajuste-de-inventario/{requirements,design,tasks}.md`,
> `progress/impl_QC-92-ajuste-de-inventario.md`, `docs/architecture.md`,
> `docs/conventions.md`, `docs/verification.md` y `CHECKPOINTS.md`.
> **Todo lo de abajo está medido en este worktree, no leído de la bitácora.**

## VEREDICTO: **RECHAZADO** — 3 bloqueantes, ninguno en el bloque de las siete guardias.

---

## 1. El bloque de las SIETE guardias heredadas — las siete siguen cazando. OK.

Juzgadas como bloque y por mi cuenta: diff contra `origin/dev`, lectura de cada detector y
**tres mutaciones propias** sobre el árbol real.

**Los detectores están intactos.** Medido sobre el diff de `tests/`: cero líneas tocadas en la
definición de `operacionesDeLoteProhibidas`, `OPERACIONES_PROHIBIDAS`, `PALABRAS_DE_LOTE`,
`metodosDePuerto`, `ningunArchivoContiene`, `FUENTES_DE_LA_RUTA`, `FUENTES_VIGILADAS`,
`fuenteSinComentarios`, `hallazgosDeAjusteOSuma` y `PALABRAS_DE_AJUSTE_O_CONSUMO`.

| # | Guardia | Qué se le hizo | Veredicto |
|---|---|---|---|
| 1 | **R21 de QC-91** (`qc91-alcance.test.ts`) | `update` sale de `escrituraDestructivaDeLotes` y pasa a `llamaAUpdateFueraDe`, que aísla el cuerpo de `adjustBatchStock` | **Muerde.** Mutación propia: una función `colada()` con `productBatch.update` en `product-prisma.ts` ⇒ **roja**. `delete`, `deleteMany`, `upsert`, `updateMany` y los dos SQL crudos siguen en el detector viejo, que se sigue afirmando sobre el archivo real. Si `cuerpoDeFuncion` devuelve `null` se barre el archivo entero: **falla cerrado** |
| 2 | **R31 de QC-81** | acotada con `archivosOSalto(ctx)`, igual que sus tres vecinas ya acotadas en `dev` | **Muerde donde debe.** Dentro de su rama, barrido idéntico. El caso de detectores con fuentes fabricadas corre **siempre y sin acotar** |
| 3 | **R32 de QC-81, caso del puerto** | misma acotación por rama | Igual que la anterior |
| 4 y 5 | **R32 barrel (QC-81)** y **R30 (QC-90)** | **derogada** la parte de LISTAR, con un conjunto cerrado de 10 verbos —todos de lectura— filtrando **la salida** del detector, no su entrada | **Muerden.** Mutación propia: un export `createDeleteBatch` en el barrel ⇒ **los dos rojos**, con el infractor nombrado. Editar y borrar siguen prohibidos. La derogación es permanente y no por rama: correcto, porque tras el merge el barrel expone el listado para siempre |
| 6 | **Censo de esquema** (`inventario-schema.test.ts`, 4 casos) | listas actualizadas | **Sigue siendo igualdad exacta** (`toEqual`) en los cuatro. `movements` se excluye **por tipo**, igual que ya se excluían `Product` y `Presentation`: una columna de más lo pone rojo. La segunda mitad del caso de factorías no se tocó |
| 7 | **Ruta (QC-22)** (`product-route-contract.test.ts`) | `getSessionUser` pasa de prohibido duro a condicional + **dos casos positivos nuevos** | **Retensado real, no aflojado.** `requireAdmin`, `ADMIN_ROLE_NAME`, `decideRouteAccess`, `redirect(` y `next/headers` siguen en la lista dura. Mutación propia: borré la línea de `requirePermission` de `adjust-batch-stock.ts` ⇒ `1 failed \| 22 passed`. **Antes de esta ficha, borrar esa línea no ponía roja ninguna guardia** |

**Ninguna quedó como decorado.** No hay ancla relajada, ni detector debilitado, ni lista de
excepciones que crezca sola, ni símbolo renombrado para esquivar.

### Las dos altas de censo — confirmado: puramente aditivas, y nada más se coló
Diff de los dos archivos: **21 inserciones, 0 borrados**, todo comentario más un literal por lista.
`E2E_ESPERADOS` y la lista de `scope.test.ts` conservan su forma (`toEqual` sobre lista cerrada). El
bloque de «Defensa extra» de `scope.test.ts`, intacto. El encuadre de la bitácora —alta de censo, no
enmienda— es **correcto**: la guardia sigue afirmando exactamente lo mismo.

### Corrección al contador: son **ocho** archivos de guardia tocados, no siete
`tests/guards/guard-ambito-empresa-inventario.test.ts` es el octavo (declarado como desviación 2 de
la tanda 3, fuera de la lista de las siete). Revisado: `adaptador: string` a `adaptadores: string[]`
es una **generalización mecánica**; las dos comprobaciones —declara `scope`, lo consume hasta
`./company-scope`— y el ancla anti-vacuidad quedan idénticas. **No afloja nada**, pero el contador de
la ficha debería decir 8 + 2 altas, no 7 + 2.

---

## 2. Checklist

### Especificación
- [x] `requirements.md` con R1..R34 en EARS.
- [x] `design.md` con `## 6. Alternativas descartadas` y su porqué.
- [x] `tasks.md`: **20/20 marcadas `[x]`**, ninguna sin marcar (contado sobre el archivo).

### Trazabilidad
- [x] Mapa `R1..R34 -> test` en la bitácora. **34 declarados / 34 mapeados**, verificado requisito a
      requisito contra el disco. **R26 está en el mapa** (a diferencia de QC-81).
- [x] Los cinco que T17 encontró desnudos (**R11, R14, R15, R16, R31**) tienen cierre **real**:
      `tests/unit/inventario/schema/inventory-movements-migration.test.ts`, 9 casos, cada uno con su
      detector y **autoprueba de vacuidad**. R15(b) y R11 son censos en positivo con `toEqual`; R31
      deriva las dos listas del texto y las cruza por correspondencia en vez de escribirlas a mano.
      **No es relleno.**
- [ ] **R18 se mapea a tests que lo rozan en su parte más cara.** Ver BLOQUEANTE 1.

### Calidad de código (`./init.sh` completo corrido por mí en este worktree)
- [x] `typecheck` verde · `lint` verde.
- [ ] `pnpm test`: **`1 failed | 7946 passed | 97 skipped (8044)`**, 269s. El único rojo es
      `tests/unit/pedidos-ui/order-form.test.tsx`. **Verificado por mí que es de `dev`**: los cuatro
      archivos implicados son byte a byte idénticos a `origin/dev` y el diff de rama sobre
      `app/(private)/pedidos/`, `lib/modules/pedidos/` y `tests/unit/pedidos-ui/` está **vacío**.
      **No se cuenta como hallazgo de esta ficha.**
- [x] E2E de flujo crítico: `e2e/ajuste-de-inventario.spec.ts`, 3 casos por chromium y webkit, con
      salida en `progress/e2e_QC-92_{chromium,webkit}.log`. WebKit corrido, que es lo que pide la
      regla multiplataforma.
- [x] **Multiplataforma**: revisado el diff de los tres componentes. Cero `100vh`/`h-screen`, cero
      `hover:`, `min-h-11 min-w-11` (44 px) en disparadores y campos, `text-base` (16 px) en el
      `Input` de cantidad y en el `SelectTrigger`. Los `text-sm` que hay están en rótulos y mensajes,
      **no en campos de entrada**. Cumple.
- [x] **Dependencias**: `package.json`, `pnpm-lock.yaml` y `docs/dependencias.md` **no aparecen en el
      diff de la rama**. R33 cumplido, medido.

### Datos y seguridad
- [x] `inventory_movements` nace con `company_id UUID NOT NULL`, su FK a `companies`, su índice, y
      **RLS `ENABLE` + `FORCE` sin policies**. R17 cumplido.
- [x] Disparador `inventory_movements_check_company` calcado del de `product_batches`, con
      `USING ERRCODE = '23514'` y su identificador propio. R19 con test de integración real.
- [x] Permiso **en el service y en la primera línea**: `requirePermission(actor,
      'inventario.modificar')` es la primera sentencia de `adjustBatchStock`, antes de zod y antes del
      puerto. Y ahora **hay guardia que lo exige por orden, no por presencia**.
- [ ] **Rechazo cruzado con test: incompleto.** Ver BLOQUEANTE 1.
- [x] Migración con `down.sql` que revierte en orden inverso, objeto por objeto.
- [x] Sin secretos. Sin webhooks.

### Módulos hexagonales
- [x] Ningún driven de `inventario` lee `users`: `batch-movement-prisma.ts` solo toca
      `inventoryMovement` y `productBatch`. El autor se resuelve en `list-batch-movements.ts` vía
      `PeopleDirectory`, importado **solo como tipo y por el contrato público** de `identity`.
- [x] `batch-actions.ts` (`'use server'`) **no** sale por el barrel del módulo.
- [x] La pantalla no decide autorización: `product-list-section.tsx` pregunta a
      `canAdjustBatchStock`, que delega en `assertPermission` y **no lanza**.
- [x] `/// @module inventario` en `InventoryMovement`.

---

## 3. Hallazgos

### BLOQUEANTE 1 — los tres métodos nuevos del puerto no tienen rechazo cruzado contra Postgres real

`tests/integration/inventario/company-scope-queries.int.test.ts` es **el archivo que este repo usa
para esto**: dos empresas reales A y B, y cada escritura cruzada con su caso y su **control
positivo**. Su propia cabecera dice por qué existe: «un doble diría que llegó el ámbito aunque el
adaptador lo compusiera al nivel del `OR`». Hoy cubre `updateAlive`, `softDeleteAlive`,
`addBatchToAlive`, `replace`, `deleteById` y `findAliveIdByName`.

**Esta rama tocó ese archivo y solo le añadió una línea de limpieza de FK.** Los tres métodos que
introduce —`adjustBatchStock`, `findBatchesOfAliveProduct` y `findBatchMovements`— **no tienen ni un
caso ahí**. Medido: la única aparición de `adjustBatchStock` en integración es
`ledger-cuadre.int.test.ts`, que usa **una sola empresa**.

Lo que queda sin probar contra la base es el camino de **escritura**:
`tx.productBatch.update({ where: { id: batchId, companyId } })`. Un campo no único dentro de un
`where` de `update` depende de la semántica de Prisma, no de un `AND` que se lea en el SQL. Si no
filtrara, un ajuste escribiría en el lote de **otra empresa**. Los tests de T6 usan Prisma mockeado,
y un mock demuestra que el código pasa `companyId`, no que Postgres lo honre ni que Prisma lance
`P2025` sin fila.

**Y esto no es un descubrimiento mío: la propia bitácora lo declaró y la mitigación no se entregó.**
Tanda 3, «Riesgo declarado»: «`where: { id: batchId, companyId }` en `update()` no está probado
contra Postgres real … quien lo demuestra de verdad es el test de integración de T15. Si ahí falla,
se cae el `null` de R18.» **T15 no lo demuestra**, y nadie volvió sobre ello: ni el cierre de la
tanda 6 («desviaciones: ninguna») ni el mapa de T17 lo anotan. El riesgo se declaró, se le asignó un
dueño y el dueño no lo cubrió.

Incumple `docs/checkpoints-proyecto.md > Datos y seguridad` («toda consulta suya filtra por la empresa de quien
pide, **con test del rechazo cruzado**») y `docs/architecture.md > Dominio` n.º 1. R18 queda mapeado
a tests que lo **rozan** en su mitad más cara.

**Qué falta:** tres casos en `company-scope-queries.int.test.ts`, con el patrón que el archivo ya
usa: (a) `adjustBatchStock` sobre un lote de B desde A ⇒ `null` **y la fila de B releída sin cambiar,
y sin asiento nuevo**, con su control positivo desde B; (b) `findBatchesOfAliveProduct` de un
producto de B desde A ⇒ vacío; (c) `findBatchMovements` de un lote de B desde A ⇒ `null`.

### BLOQUEANTE 2 — comentario de producción que cita un requisito, en líneas que la rama modifica

`app/(private)/inventario/components/product-list-section.tsx`. La rama **reescribió** ese bloque de
JSDoc (T13bis, desviación 1) y mantuvo la cita:

```
- * **R5**: aqui no se decide nada sobre permisos. No se lee la sesion, [...]
+ * **R5**: aqui no se decide autorizacion. La sesion se lee solo para preguntar a
+ * `canAdjustBatchStock` si se pinta el control de ajuste -presentacion, no permiso-; [...]
```

`docs/conventions.md > Comentarios`: «Nunca se cita una ficha ni un requisito en un comentario de
producción: ni `QC-<n>`, ni `R<n>` … Sin excepciones» y «Al tocar un archivo se limpian los
comentarios de las líneas que toca la rama». La línea se tocó y salió con la cita puesta. Las otras
citas de ese docblock (R14, R15, R16) son **preexistentes y no se arrastran**: no son hallazgo.

Es la **tercera vez en esta ficha** (`934fe7c` limpió seis, la tanda 5 limpió una en
`adjust-batch-dialog.tsx`) y la bitácora afirma en `934fe7c` que «la única cita que queda en
producción es la cabecera de `error-codes.ts`» — **y dejó de ser cierto en T13bis**.

**Qué falta:** reescribir ese párrafo sin citar `R5`, diciendo el porqué en prosa, en commit de solo
comentarios. Barrido del resto del diff de producción: no hay ninguna otra cita nueva.

### BLOQUEANTE 3 — la rama no está sobre el `origin/dev` actual, y al mergear revierte el board en disco

El encargo dice que está sincronizada. Medido: `origin/dev` está en **`cbf0569`** y
`git merge-base HEAD origin/dev` da **`b625ca9`**. El merge `9f2c362` trajo un `dev` anterior.

Consecuencia concreta, no teórica — `git diff origin/dev HEAD -- feature_list.json`:

- **QC-59**: `done` a `in_progress`
- **QC-92**: `in_progress` a `pending`, **y con la descripción anterior a `/afinar-feature`**, la de
  las cinco preguntas abiertas

Mergear así **deshace en disco** lo que el leader ya asentó, y `feature_list.json` es justamente el
archivo que `scripts/validate-features.mjs` valida en el gate (mi corrida dijo `in_progress=2` sobre
la lista **vieja**). Contradice `CLAUDE.md` regla 3.

Lo que `dev` ganó desde la base son **solo** `feature_list.json`, `progress/current.md` y
`progress/history.md`: **cero código**, así que mi corrida del gate sigue siendo válida para el
código y el re-merge es barato.

**Qué falta:** `git merge origin/dev` resolviendo `feature_list.json` **a favor de `dev`** en esas
dos fichas, y `./init.sh` completo de nuevo antes del PR (`CLAUDE.md` regla 5, sin excepción).

---

### menor 1 — R26 pide que la nota diga **qué ficha** la cambió, y no lo dice
`tests/unit/inventario/qc91-alcance.test.ts:409`: «Nota (2026-09-17): esta guardia dejó de exigir
CERO llamadas…». Está fechada y dice qué sigue prohibido, pero **no nombra la ficha**, que es
literalmente la mitad de lo que R26 exige. Es deliberado y declarado («sin citar ninguna ficha», por
`docs/conventions.md`). Lo acepto como cumplimiento sustantivo de R26 —lo que R26 protege está
entero— pero deja una **contradicción del arnés sin resolver**: R26 manda citar, `conventions` §31
prohíbe citar en comentarios también en tests. Y se aplicó **de forma inconsistente**: las otras seis
guardias sí escriben «(QC-92, …)» en sus comentarios. Que lo cierre `/afinar-regla` en frío, no esta
ficha.

### menor 2 — el mapa de trazabilidad fecha mal la nota de R26
Dice «con su nota fechada 2026-09-18»; la nota es del **2026-09-17**. Inexactitud de la bitácora.

### menor 3 — dos aserciones siempre ciertas en los casos «cara B» nuevos
`qc81-alcance.test.ts`: `expect(hallazgosPorArchivo.every((h) => Array.isArray(h))).toBe(true)` y
`expect(Array.isArray(infractores)).toBe(true)`. Un array siempre es un array. No bloquean porque en
esos dos casos lo que sostiene la afirmación son las **anclas** de al lado (más de 10 archivos,
contenido leído de verdad, el adaptador presente), y esas sí distinguen. Pero
`docs/verification.md > Qué NO cuenta` las señala, y el propio implementer quitó una de esta especie
en T13bis: sobran.

### menor 4 — `authorName` transporta el identificador entre puerto y caso de uso
**Juicio pedido: deuda tolerable, con condición.** Lo es hoy por dos razones medidas: el único
consumidor de `findBatchMovements` en todo `lib/` y `app/` es `list-batch-movements.ts` (verificado),
y la sustitución está escrita en el docblock de las dos puntas. Lo que no me gusta es que el tipo
**miente en la frontera del puerto**: el segundo consumidor que aparezca se llevará un UUID rotulado
`authorName` y no habrá nada rojo que lo avise. No bloquea —cerrarlo obligaba a tocar archivos de T6
y la decisión del leader de respetar la lista de la task es defendible—, pero **pídase ficha de
seguimiento** para partirlo en `authorId` + `authorName` en `InventoryMovementView`. No lo dejes solo
en la bitácora.

### menor 5 — desviación 6 (sin comprobación previa de stock): de acuerdo, no es deuda
El argumento de la bitácora se sostiene y lo verifiqué: el `CHECK` dentro de la transacción da el
mismo mensaje (`BatchStockNegativeError`, traducido **por el nombre de la restricción**, no por el
texto de Postgres), y una comprobación previa reintroduce el leer-y-escribir no atómico que la ficha
existe para quitar. R4 y R5 están cubiertos por otra vía —SQL crudo en integración para R5,
traducción del `23514` en unidad para R4, y el E2E extremo a extremo—. **Cambio de diseño bien
declarado, no deuda.**

### menor 6 — archivos de test fuera de la lista de su task (3)
`product-page.test.tsx` (T13), `product-batches-sheet.test.tsx` (T13) e
`inventory-movements-migration.test.ts` (T17). Los tres declarados, los tres necesarios, y **ningún
caso existente se debilitó** (comprobado en el diff). Sin objeción; queda anotado porque la lista de
archivos de la task es lo que el leader cruza para el paralelismo.

### menor 7 — `./init.sh` no termina en verde y `tests/baseline-rojos.json` no se toca
El checkpoint «`./init.sh` termina en verde» **no se cumple**, aunque la causa no sea de esta ficha.
Decidir es del leader, pero hay que decidirlo antes del PR: o se arregla la deuda en `dev` (PR #85
cruzado con R14 de QC-91), o alguien añade la fila al baseline con su motivo y su fecha. Dejar el PR
rojo «porque ya sabemos por qué» es cómo un rojo deja de mirarse.

### menor 8 — la séptima enmienda de `error-codes.ts` cita QC-92 en producción
Única cita nueva de producción además de la del bloqueante 2. **No la cuento como hallazgo**: R32 la
exige con esas palabras, hay seis precedentes idénticos y es un registro histórico, no una
explicación de código. Pero `docs/conventions.md` dice «sin excepciones» y aquí hay una, viva y
creciendo: merece su carve-out escrito en `conventions`, por `/afinar-regla`.

---

## 4. Lo que sí hay que reconocer

- La **guardia de T14** (`guard-libro-de-inventario.test.ts`) está bien hecha y en la carpeta
  correcta: censo **en positivo** con `toEqual`, cada camino comprobado contra `writeMovement(` en
  **su propio cuerpo**, autoprueba de vacuidad, y su cabecera escribe **lo que no puede ver**.
  Mutación propia: un cuarto camino de escritura la pone roja.
- El **cuadre de T15** corta por **fecha** y no por «cero asientos», y el último caso fabrica el
  mismo lote a los dos lados del corte para demostrar que la regla barata tenía un agujero. La
  excepción de R29/R30 está escrita **en el test**, con su razón y con la frase de que a los lotes
  viejos los cubre T14.
- El **retensado de QC-22** deja el repo mejor protegido que `dev`, y lo comprobé borrando la línea.

---

## 5. Para levantar el rechazo

1. Tres casos de rechazo cruzado en `tests/integration/inventario/company-scope-queries.int.test.ts`
   para `adjustBatchStock` (con control positivo y relectura de la fila de B),
   `findBatchesOfAliveProduct` y `findBatchMovements`. Mapear R18 a ellos en el mapa de trazabilidad.
2. Quitar la cita `**R5**` del JSDoc de `product-list-section.tsx`, en commit de solo comentarios.
3. `git merge origin/dev` (`cbf0569`) resolviendo `feature_list.json` a favor de `dev` en QC-59 y
   QC-92, y `./init.sh` completo otra vez.

Los menores 1, 3, 4, 7 y 8 no bloquean, pero el 4 y el 7 necesitan una decisión escrita —ficha de
seguimiento y baseline— antes de que la ficha pase a `done`.

---
---

# Segunda vuelta (2026-09-18) — VEREDICTO: **OK**

> HEAD `db88347`. La primera vuelta queda **entera y sin tocar** arriba: el rechazo y su cierre son
> historial, no borrador.
> Los tres bloqueantes están cerrados. **Ningún menor sube de categoría.** Un menor nuevo, de baja.

## B1 — rechazo cruzado contra Postgres real · CERRADO, y probado más fuerte de lo que se pedía

`88432f2` añade **86 líneas, solo test**, seis casos en
`tests/integration/inventario/company-scope-queries.int.test.ts`. Los tres métodos pasan de **0 a 15
apariciones** en ese archivo.

**Lo que se me pidió juzgar era si prueban de verdad o pasan por vacuidad. Probé algo más exigente
que la mutación que declaró el implementer.** Él mutó *el test* —cambiar el ámbito cruzado por el
propio—, que solo demuestra que el caso no es vacuo. Yo muté **la producción**, que es lo que
responde la pregunta de verdad: ¿caza el test la regresión que teme?

| Mutación mía sobre producción | Resultado |
|---|---|
| Quitar `companyId` del `where` de `tx.productBatch.update` en `adjustBatchStock` | **`1 failed \| 33 passed`** — cae exactamente «adjustBatchStock sobre el lote de B desde A devuelve null y NO toca la fila ni escribe asiento» |
| Quitar `batchCompanyScope(scope)` de `findBatchesOfAliveProduct` **y** de `findBatchMovements` | **`2 failed \| 32 passed`** — caen los dos casos cruzados de lectura |
| Árbol limpio | **`34 passed (34)`** contra base real, copia de `qct_tpl_5316b8e32d17` |

Las tres mutaciones revertidas, `git status` limpio tras cada una.

**Esto cierra la duda de fondo de la primera vuelta, no solo el trámite del test.** Que el caso
cruzado devuelva `null` con el código bueno **y** se ponga rojo al quitar el filtro demuestra que
**Postgres y Prisma sí honran `companyId` dentro del `where` de un `update`**, que era precisamente
lo que un mock no podía decir y lo que la bitácora había declarado sin probar en la tanda 3.

**Los controles positivos están bien puestos y no son adorno.** Revisados uno a uno:
- El de `adjustBatchStock` afirma el total esperado, que la fila **sí cambió**, y **exactamente un**
  asiento nuevo con su `kind`, su `quantity` con signo, su `reason` y su `company_id`. Un adaptador
  que nunca escribiera dejaría verde el cruzado y **rojo este**.
- El de `findBatchesOfAliveProduct` exige que el lote de B **aparezca**: un `findMany` que devolviera
  siempre lista vacía no cuela.
- El de `findBatchMovements` exige no nulo y un asiento de tipo ajuste.

**Y el cruzado de escritura afirma más de lo que pedí**: `fotoLote()` serializa **la fila entera**
(`findUniqueOrThrow` más `JSON.stringify`), no solo la existencia. Un `updated_by`/`updated_at`
movido sin tocar el stock —fuga que ningún campo del contrato delataría— también lo pone rojo. Es
mejor que lo que dejé escrito en la primera vuelta.

## B2 — cita de requisito en producción · CERRADO (`451b8c9`)

Commit de **solo comentarios**, una línea. Medido por mí sobre `git diff origin/dev...HEAD -- app lib
db`: de las líneas **añadidas**, las únicas que citan ficha o requisito son **las dos** de la
cabecera de enmiendas de `error-codes.ts`, que es el menor 8 y está escalado. Las citas preexistentes
del mismo docblock (R14, R15, R16) siguen ahí y **no son de esta rama**.

## B3 — re-merge y board en disco · CERRADO (`a92f40d`)

Verificado leyendo el archivo, no el reporte: `git diff cbf0569 HEAD -- feature_list.json` sale
**vacío**, y el JSON dice **QC-59 `done`** y **QC-92 `in_progress`**. La trampa no se cobró nada.

### Sobre no re-sincronizar con el `origin/dev` de ahora: de acuerdo
Lo medí yo: `origin/dev` está en `530fedf`, nuestra base en `cbf0569`, y la intersección de archivos
tocados entre lo que `dev` ganó (14 archivos, QC-125) y lo que toca esta rama es **exactamente
`progress/current.md`**. QC-125 vive en `asignacion/`, `recetas-ui` y `components/shared/`
(`countdown-timer.tsx`, `step-reader.tsx`); esta rama no toca ninguno. `feature_list.json` lo cambia
`dev` y **ya no lo cambia la rama**, así que el merge es unilateral y sin conflicto. **Mi corrida del
gate sigue valiendo.** Mismo criterio que QC-81.

## Gate completo, re-corrido por mí sobre `db88347`

```
Test Files  1 failed | 544 passed (545)
     Tests  1 failed | 7952 passed | 97 skipped (8050)
typecheck paso · lint paso
hay 1 archivo(s) de test en rojo que NO estan en el baseline:
  tests/unit/pedidos-ui/order-form.test.tsx
```

**8050 = 8044 + 6 exactos** respecto de mi corrida de la primera vuelta: los seis casos nuevos y nada
más. Ninguna guardia nueva en rojo. El único rojo sigue siendo el **heredado de `dev`**, ya medido en
la primera vuelta (cuatro archivos byte a byte idénticos a `origin/dev`, diff de rama sobre pedidos
vacío).

## R18, remapeado: la distinción está bien escrita y **no diluye** el mapa

El mapa pone **primero** los seis casos de integración y dice de ellos que son «los que prueban R18
DE VERDAD»; conserva los de unidad pero **rotulados por lo que son**: «(unidad, con Prisma mockeado:
demuestran que el código PASA la empresa, no que Postgres la honre)».

Eso es lo contrario de diluir: antes el mapa presentaba cinco casos de unidad como si zanjaran R18, y
**por eso el agujero sobrevivió a T17**. Ahora hace explícita la **jerarquía de la evidencia** —qué
prueba el contrato y qué prueba la base—, que es la información que faltaba. Se conservan bien: un
mock sigue siendo la única forma barata de probar «cambiar de actor cambia la empresa que llega al
puerto». **Aprobado tal como está.**

## Menores

- **menor 2 (dato falso): corregido.** La nota de `qc91-alcance.test.ts:409` figura ya como
  **2026-09-17** en el mapa. Verificado contra el archivo.
- **Los otros siete, intactos y sin cambiar de categoría. Ninguno sube.** Los menores **1**
  (contradicción R26 con `conventions` §31), **4** (ficha de seguimiento para `authorId`) y **8**
  (carve-out para la cabecera de enmiendas) están escalados al humano, que es donde deben estar: los
  tres son decisiones de arnés, no de esta ficha.
- **menor 7 sigue vivo y no lo cierra esta ficha**: `./init.sh` no termina en verde y
  `tests/baseline-rojos.json` no se toca. **No bloquea a QC-92** —la causa es de `dev`, medida dos
  veces— pero el PR saldrá rojo y hay que decidirlo antes de abrirlo: o se arregla la deuda en `dev`
  (PR #85 cruzado con R14 de QC-91), o alguien añade la fila al baseline con su motivo y su fecha.

### menor 9 (NUEVO, baja) — acoplamiento de orden y número mágico en los casos nuevos
El control positivo de `findBatchMovements` depende de que el de `adjustBatchStock` **ya haya
corrido** en el mismo `describe`, y el de `adjustBatchStock` afirma el total con el stock del fixture
escrito a mano. Hoy los dos son correctos: vitest corre los casos de un archivo en orden, la
dependencia **está declarada en el propio test**, y el número falla **ruidosamente** si el fixture
cambia. Se anota porque un `.concurrent` futuro en ese archivo rompería el segundo en silencio.
**No afecta al veredicto.**

## Veredicto de la segunda vuelta: **OK**

Los tres bloqueantes están cerrados y verificados en disco por mí, no por reporte. El bloque de las
ocho guardias heredadas y las dos altas de censo sigue como lo dejé en la primera vuelta: **intacto y
mordiendo**, y nada de esta vuelta lo tocó — `88432f2`, `451b8c9` y `db88347` no rozan ningún archivo
de guardia.

**Condición para el PR, no para el veredicto:** decidir el menor 7 (baseline o arreglo en `dev`) y
re-mergear `origin/dev` antes de abrirlo, con `./init.sh` completo detrás (`CLAUDE.md` regla 5).
