# QC-103 -- lote-y-fecha-de-compra-en-el-alta . review

> Revisado sobre HEAD `fa609e7`, diff `origin/dev..HEAD` (12 commits, 22 archivos).
> Contra `specs/QC-103-.../{requirements,design,tasks}.md`, `progress/impl_QC-103-....md`,
> `docs/architecture.md`, `docs/conventions.md`, `docs/verification.md`, `CHECKPOINTS.md`.

## Veredicto: RECHAZADO

2 hallazgos bloqueantes, 2 menores. Lo funcional esta bien construido y bien probado (tests
concretos, E2E verde, lote-no-batchId correcto, autorizacion por permiso, sin dependencias ni
migracion nuevas), pero hay una desviacion real de R3 que nadie autorizo explicitamente y
comentarios nuevos que citan la ficha en codigo de produccion y en E2E, el mismo motivo por el
que se rechazo QC-60 hoy.

## Lo que corri yo

- `pnpm exec vitest run` sobre los 8 archivos de test relacionados con el diff (product-page,
  product-batch-date-field, create-product, product-actions, product-batch-lot-retry,
  product-service, authorization, company-isolation-service) -> 8 archivos, 207 tests, 0 fallos.
- `pnpm exec vitest related --run` sobre los archivos de produccion del diff -> verde (mismo
  resultado).
- `pnpm exec vitest run guard` -> 43 archivos, 480 passed, 9 skipped.
- No repeti el E2E: el enunciado dice que ya esta verificado en verde por quien encargo la
  revision (el alta de producto muestra el lote asignado en el aviso de exito, R14/R17, 1 passed)
  y no encontre motivo para dudarlo -- el commit ebdb21a que arregla la captura del regex es
  coherente con lo que pide el texto del toast.
- No corri ./init.sh: es del leader (T12, sin marcar a proposito).
- Lei el diff completo (git diff origin/dev..HEAD) archivo por archivo, no solo la bitacora.

## Checklist

### Especificacion y tasks
- [x] requirements.md en EARS, R1-R17, con mapa de decisiones y "preguntas abiertas: ninguna".
- [x] design.md con medicion en disco, alternativas descartadas y su porque.
- [x] tasks.md: T1-T11 marcadas. T12 (gate completo) sigue sin marcar, es del leader, no bloquea
      la review.

### Trazabilidad R-n a test (comprobada contra el diff, no solo contra la bitacora)
- [x] R1, R4 -- ProductBatchDateField existe como componente propio, separado de expiryDate (no
      tocado); cubierto indirectamente por R2/R5 y por el envio en product-page.test.tsx.
- [x] R2 -- test real, fija el reloj del sistema y comprueba el valor oculto y el dia marcado.
- [ ] R3 -- ver B2. El test existe y prueba una garantia distinta a la que pide el requisito.
- [x] R5 -- test real, comprueba disabled y que el clic no cambia el valor oculto.
- [x] R6, R7 -- tests de product-page.test.tsx, confirmados en el diff (helper nuevo, input sigue
      siendo texto opcional).
- [x] R8 -- heredado, mecanismo verificado (mismo safeParse para cliente y servidor); razonable,
      no es un test vacio.
- [x] R9 -- tres tests concretos (fecha, campos del lote, aviso) que la edicion no pinta ni envia
      ni nombra el lote.
- [x] R10 -- test que rechaza sin el permiso inventario.modificar: permiso real (un actor con
      inventario.consultar pero sin inventario.modificar se rechaza), sin comparar nombre de rol.
      Correcto.
- [x] R11 -- heredado de QC-81, con tests que prueban el string civil intacto hasta el puerto.
- [x] R12, R13 -- el valor que viaja es el TEXTO del lote, no el batchId, confirmado en los
      cuatro escalones (product-prisma.ts a create-product.ts a product-actions.ts a
      product-form.tsx/product-sheet.tsx) y en tests que fijan el string exacto del lote,
      distinto del batchId mockeado. El error que ya se habia colado una vez en el spec no
      volvio.
- [x] R14, R15 -- tests reales que comprueban el texto del toast, incluido el caso "lote tecleado
      a mano" que verifica explicitamente que el mensaje NO dice asigno/asignado. El texto
      elegido es neutro y no miente en ningun camino.
- [x] R16 -- verificado por lectura de diff (tal como tasks.md > T9 lo permite): el unico cambio
      de product-sheet.tsx es el string del toast ya existente, sin JSX nuevo.
- [x] R17 -- E2E verde, confirmado por el enunciado del encargo.

### Calidad y seguridad
- [x] Sin migracion, sin tabla nueva (db/schema.prisma no esta en el diff).
- [x] Sin dependencias nuevas (package.json, lockfile no estan en el diff; react-day-picker y
      calendar.tsx se reutilizan sin tocar).
- [x] No se toco la edicion del producto (updateProductAction, updateProductSchema, expiryDate):
      confirmado, ningun archivo de edicion aparece en el diff.
- [x] Autorizacion en el service (inventario.modificar), con test, sin comparar nombre de rol.
- [x] No aplica aislamiento por empresa (no hay tabla ni consulta nueva): el lote sale del mismo
      camino que QC-81/QC-90 ya acotaba por empresa.

### Multiplataforma (docs/architecture.md > Componentes)
- [x] El disparador del calendario es un boton de min-h-11 min-w-11 (44x44 px), no un input: no
      hay campo de texto libre para la fecha, asi que la regla de font-size mayor o igual a 16px
      no aplica y no hay riesgo de zoom en iOS. Coherente con design.md, parrafo 2.
- [x] hover:bg-muted en el trigger es decorativo, no la unica via de activacion (el clic/tap
      funciona igual sin el).
- [x] El calendario entra en un Popover (mismas primitivas que data-table-filter-date.tsx, ya
      usada y ya tactil).

## Hallazgos

### B1 -- BLOQUEANTE: comentarios nuevos citan la ficha (QC-nn) en codigo de produccion y en E2E
El mismo motivo por el que se rechazo QC-60 hoy (su B1: los comentarios de produccion citan
fichas y los archivos tocados no se limpiaron). Localizado con git diff origin/dev..HEAD, solo
lineas nuevas de esta rama (no comentarios preexistentes movidos de sitio):

- lib/modules/inventario/ports/product-repository.ts, dos docblocks nuevos que citan
  QC-103 (R12) y QC-103 (R13), en un archivo de produccion (ports/, sin framework, el mas
  limpio del modulo por convencion).
- e2e/inventario.spec.ts, dos lineas: El alta rapida exige unidad desde QC-80 (R11, R17), sin
  elegirla el envio se rechaza -- repetida dos veces (mas una tercera en e2e/proveedores.spec.ts).
- e2e/inventario.spec.ts, una linea adicional que cita QC-81 al explicar que el correlativo lo
  genera el servidor dentro de la misma transaccion que inserta la fila.

Ninguna de estas cinco lineas es el nombre de un test o describe (donde R-n si vale, como fija el
precedente de QC-60): son comentarios de bloque. Hay una linea con QC-71 en el diff de
product-form.tsx que es un comentario preexistente que solo se movio de sitio (mismo texto antes
y despues, confirmado linea por linea), no una cita nueva -- no se cuenta aqui, pero tampoco se
limpio al tocar el archivo (ver m1).

Que falta para cumplirlo: quitar las citas a la ficha de las cinco lineas nuevas (dejar el porque
sin la ficha, o mover la cita a la bitacora/PR). No hace falta tocar el comentario QC-71
preexistente si el precedente de QC-60 se toma con el mismo alcance (solo lineas nuevas), pero
conviene decirlo explicitamente en el PR si se deja asi.

### B2 -- BLOQUEANTE: R3 no lo cumple el sistema, solo la UI -- y nadie lo decidio asi
R3 dice que el sistema debe ofrecer la fecha de compra como campo obligatorio y que, cuando se
envia el alta sin fecha de compra escrita, el sistema debe rechazar el envio y senalar el campo.
La propia implementacion documenta, en el comentario del test de R3 en product-page.test.tsx, que
purchaseDateSchema admite ausencia (nullish) y que resolverFechaDeCompra sustituye una fecha
ausente por "hoy" en vez de rechazarla -- heredado de QC-81. Es decir: el sistema, en su frontera
real (la Server Action, que es una superficie de red), no rechaza nada si purchaseDate llega
ausente; solo el widget de la UI lo hace imposible desde el panel. Cualquier llamada que no pase
por ese panel concreto (una peticion directa a createProductAction, un cliente futuro, un test de
integracion que llame al caso de uso sin el widget) no ve ningun rechazo: obtiene un alta
silenciosamente exitosa con "hoy" puesto.

Esto no es un matiz cosmetico: es la diferencia entre obligatorio (falla si falta) y con valor
por defecto (nunca falla). Y no esta cubierto por ninguna decision cerrada: la tabla de
requirements.md mapea R10/R11/R17 a "heredado, no se reabre" (decision D9), pero R3 no aparece en
ninguna fila de decisiones -- nadie decidio explicitamente que R3 se resolviera por construccion
del widget en vez de por rechazo del esquema. El propio design.md, redactado antes de implementar,
no lo anticipa: su seccion 0 dice que purchaseDate ya viaja y ya se persiste, sin mencionar que es
nullish ni que eso deja a R3 sin cumplir a nivel de sistema. La interpretacion "por construccion"
aparece recien en la bitacora, como una decision unilateral del implementer durante la
implementacion, documentada pero no aprobada por el humano.

Que falta para cumplirlo: esto es una decision que le toca al humano, no al implementer ni al
reviewer: (a) reabrir el esquema de QC-81 para que rechace purchaseDate ausente de verdad -- lo
que design.md marca "no se reabre", asi que requeriria autorizacion explicita nueva --, o (b)
enmendar R3 con fecha, dejando escrito que "obligatorio" se cumple unicamente en la superficie
del panel de alta (el widget nunca permite un envio vacio) y que la Server Action, por
compatibilidad con QC-81, sigue aceptando ausencia y sustituyendola. Cualquiera de las dos cierra
el hallazgo; lo que no vale es dejar la desviacion resuelta solo en un comentario de test.

### Menores
- m1 -- El comentario QC-71 en product-form.tsx se movio de sitio sin limpiarse, y el archivo si
  se toco de fondo en esta rama (T6-T8). Si B1 se resuelve con alcance "archivo tocado se limpia
  entero" (como pedia el precedente de QC-60), esta linea entra tambien. Si se resuelve con
  alcance "solo lineas nuevas", queda como deuda menor sin resolver aqui.
- m2 -- docs/conventions.md sigue sin una seccion de Comentarios en este worktree (igual que
  constato la review de QC-60, su m5): B1/m1 se aplican por instruccion del encargo y por el
  precedente del mismo dia, no porque un documento de la rama lo respalde todavia. Vale la pena
  que el leader cierre esa deuda del arnes antes de que se repita una tercera vez.

## Verificacion

- pnpm exec vitest run sobre los 8 archivos de test relacionados con el diff: 207 passed, 0
  failed.
- pnpm exec vitest run guard: 480 passed, 9 skipped, 0 failed.
- pnpm exec vitest related --run sobre archivos de produccion mas test: verde, mismo resultado.
- E2E de la ficha: verde, segun lo reportado por quien encargo la revision (no repetido).
- No corri ./init.sh (typecheck/lint completos, gate final): es del leader (T12).

## Que NO son hallazgos (confirmado)

- Las 9 decisiones cerradas de requirements.md: no reabiertas.
- El arreglo del helper de E2E (commit 566d122) sobre e2e/inventario.spec.ts y
  e2e/proveedores.spec.ts: autorizado por el humano, deuda preexistente y ajena -- pero si genero
  una de las lineas contadas en B1 (la cita a QC-80), que es un motivo distinto (comentarios) al
  autorizado (arreglar el bug).
- react-day-picker y components/ui/calendar.tsx: reutilizados sin tocar, ya aprobados desde
  QC-55.
- app/layout.tsx con el error Cannot find name LayoutProps y el rojo de
  e2e/proveedores.spec.ts (R51): confirmados preexistentes y ajenos, no se cuentan.

## Para volver al implementer

1. Quitar las citas a la ficha de los comentarios nuevos en
   lib/modules/inventario/ports/product-repository.ts y en e2e/inventario.spec.ts y
   e2e/proveedores.spec.ts (B1).
2. Llevar R3 a una decision humana explicita: o se reabre el esquema de QC-81 para rechazar de
   verdad una fecha de compra ausente en la Server Action, o se enmienda R3, con fecha, en
   requirements.md, para decir que la obligatoriedad se cumple solo en la superficie del panel de
   alta (B2). No se puede resolver en silencio dentro de un test.

---

# SEGUNDA VUELTA — 2026-09-17

> Revisada sobre HEAD `6f536b1`, diff `origin/dev...HEAD` (22 commits, 25 archivos).
> Encargo: verificar el cierre real de los 4 hallazgos de la primera vuelta, juzgar la enmienda
> D10 por su contenido, rehacer la trazabilidad R1-R17 con `archivo:linea`, y mirar con lupa
> `cab1fa8` (la consolidacion de `formatDateLocalISO`/`parseDateLocalISO`).
> **No repeti `./init.sh`**: el leader lo dejo verde (495 archivos, 7191 passed, 95 skipped).

## Veredicto: RECHAZADO

Los cuatro hallazgos de la primera vuelta estan **cerrados de verdad** (comprobados uno a uno,
no dados por buenos). Pero al verificar B1 con la regla escrita —que el leader cerro en `dev`
mientras esta rama corria— aparece un bloqueante nuevo que la primera vuelta no podia ver, y
con el un comentario de produccion que afirma algo **falso** justo sobre el punto que D10
acaba de enmendar.

## Lo que corri yo

- `git diff origin/dev...HEAD` completo, archivo por archivo, separando lineas anadidas de contexto.
- Busqueda propia de citas de ficha **solo en lineas anadidas** del diff, excluyendo `progress/` y
  `specs/`: exactamente 2 aciertos, los dos en archivos de test (ver B1).
- Lectura de `lib/modules/inventario/domain/product-batch-input.ts:99-110` para comprobar en
  disco si `purchaseDateSchema` rechaza o no la ausencia (es lo que D10 afirma, y lo que un
  comentario de `product-form.tsx` niega).
- `git show cab1fa8` completo y busqueda de todos los consumidores de
  `formatDateLocalISO`/`parseDateLocalISO`/`date-civil` en el repo.
- `git show 4285b23` y lectura de `tests/unit/shared/data-table-alcance.test.ts:313-335` (el
  guard de alcance de QC-55) para saber si su exclusion de `tests/` es deliberada.
- Lectura de los cuerpos de los tests de R2, R3, R4, R5, R12, R13, R14, R15, R16, R17.
- `docs/conventions.md > Comentarios` **en `dev`** (no en el worktree: ver B3).

## 1. Los cuatro hallazgos de la primera vuelta

### B1 (citas de ficha en comentarios) — CERRADO
Buscado por mi, no confiado. En todas las lineas que la rama **anade** fuera de `progress/` y
`specs/` quedan exactamente dos menciones a una ficha, y **ninguna esta en codigo de produccion**:

- `tests/unit/inventario/create-product.test.ts:180` — el `describe` se llama «QC-103 — el lote
  asignado viaja de vuelta con el resultado del alta». Es un **nombre de test**, no un comentario.
- `tests/unit/inventario/product-page.test.tsx:1444` — el comentario «(heredado de QC-81), lo cual
  no es un rechazo.». Es un comentario, pero en `tests/`.

Las cinco lineas que B1 senalaba (`ports/product-repository.ts` x2, `e2e/inventario.spec.ts` x3,
`e2e/proveedores.spec.ts` x1) ya no citan ficha: verificado leyendo el diff final, no el commit
de limpieza. Ninguna de las dos que quedan esta exceptuada con motivo escrito; las dos van como
menores (m3, m4) porque la regla las trata como tests, no como produccion.

### B2 (R3 resuelto en silencio) — CERRADO, y la enmienda aguanta el examen
Juzgada por contenido, no por existencia:

- **Esta fechada y firmada**: nota bajo R3 («Enmendado el 2026-09-17») y fila nueva en la tabla
  de decisiones cerradas con fecha 2026-09-17, mas la fila D10 en el mapa decision->requisito.
  Tres sitios coherentes entre si.
- **Dice lo que el sistema hace de verdad.** Verificado en disco por mi:
  `lib/modules/inventario/domain/product-batch-input.ts:108` declara `purchaseDate` con
  `purchaseDateSchema.nullish()`, y `create-product.ts > resolverFechaDeCompra` sustituye la
  ausencia por hoy. La enmienda no maquilla: dice explicitamente que **se acepta** que una llamada
  directa a la Server Action, sin pasar por este panel, omita la fecha de compra sin ser
  rechazada. Eso es exactamente lo que el codigo hace.
- **El test afirma sobre lo enmendado**, no sobre lo viejo: «el panel de alta nunca permite
  enviar sin fecha de compra escrita (R3)» —`tests/unit/inventario/product-page.test.tsx:1441`—
  comprueba (a) que el espejo oculto ya trae fecha civil completa nada mas abrir, (b) que abrir y
  cerrar el popover sin elegir no la vacia, y (c) que lo enviado nunca fue cadena vacia. Es la
  garantia del panel, que es justo lo que R3 pide ahora. No es un test vacio ni tautologico.

Con una salvedad grave, que va como bloqueante aparte: **el codigo de produccion sigue diciendo
lo contrario de la enmienda** (ver B4).

### m1 (comentario QC-71 preexistente en `product-form.tsx`) — CERRADO
Las cuatro apariciones de QC-71 en `product-form.tsx` salen del archivo en este diff (lineas
borradas en las cuatro, con el texto reescrito sin la cita). No queda ninguna.

### m2 (deuda del arnes: `docs/conventions.md` sin seccion de Comentarios) — fuera de esta ficha
Cerrada por el leader en `dev`. No la cuento como hallazgo de QC-103. **Pero su contenido si
aplica al codigo que esta rama va a fusionar contra `dev`**: de ahi B3.

## 2. Trazabilidad R1-R17 -> test concreto, con archivo:linea

**17 requisitos declarados, 17 mapeados. Ninguno huerfano.**

| R | Test (archivo:linea) | Veredicto |
| --- | --- | --- |
| R1 | `tests/unit/inventario/product-batch-date-field.test.tsx:44` (componente propio, separado de `expiryDate`, que no se toca) + `product-page.test.tsx:1496` (la edicion no lo pinta) | OK, indirecto pero real |
| R2 | `product-batch-date-field.test.tsx:45` — fija el reloj (`vi.setSystemTime`, 2026-06-15), afirma el valor del espejo oculto **y** el atributo de dia seleccionado en la celda | OK |
| R3 (enmendado D10) | `product-page.test.tsx:1441` | OK, ver B2 |
| R4 | `product-page.test.tsx:1475` — compara lo enviado en el `FormData` con el texto del disparador, en formato civil | OK |
| R5 | `product-batch-date-field.test.tsx:58` — el dia siguiente esta deshabilitado **y** el clic no cambia el valor que viaja | OK |
| R6 | `product-page.test.tsx:1537` | OK |
| R7 | `product-page.test.tsx:1551` | OK |
| R8 | Heredado + mecanismo: mismo `createProductWithFirstBatchSchema` en cliente (`product-form.tsx:336`) y servidor (`create-product.ts:86`); la regla de forma del lote la rechaza el servicio (`create-product.test.ts`, caso del lote de 60 digitos) y no esta duplicada en el formulario (confirmado leyendo el diff entero) | OK |
| R9 | `product-page.test.tsx:1496` (no pinta), `:1389` (no envia), `:1164` (el aviso de edicion no nombra lote), `:1252` | OK, tres angulos |
| R10 | `tests/unit/inventario/create-product.test.ts:210` — actor con `inventario.consultar` y sin `inventario.modificar`, sin comparar nombre de rol | OK |
| R11 | Heredado de QC-81: `create-product.test.ts:348` y `:359` (string civil intacto hasta el puerto); la conversion a `Date` vive en `product-prisma.ts > toBatchPurchaseDate` | OK |
| R12 | `product-batch-lot-retry.test.ts:131` (dos casos: correlativo y tecleado a mano), `create-product.test.ts:180`, `product-actions.test.ts:162`, `product-page.test.tsx:1091` | OK, los cuatro escalones |
| R13 | `product-batch-lot-retry.test.ts:257` (dos casos), `create-product.test.ts:195` | OK |
| R14 | `product-page.test.tsx:1114`; E2E `e2e/inventario.spec.ts:624` | OK |
| R15 | `product-page.test.tsx:1137` | OK |
| R16 | Lectura de diff, como `tasks.md > T9` autoriza: el unico cambio de `product-sheet.tsx` es el string del aviso ya existente mas una funcion pura de texto; **cero JSX nuevo** | OK |
| R17 | `e2e/inventario.spec.ts:624` | OK, ver abajo |

**El E2E que QC-81 difirio, mirado por dentro** (no solo «esta verde»): abre el panel, no toca ni
la fecha de compra ni el lote, guarda, lee el TEXTO del aviso, extrae el lote y —lo que lo hace
valer— **comprueba contra Postgres** (consulta cruda sobre `product_batches`) que existe
exactamente un lote y que su valor es el mismo que el aviso nombro. No es un E2E de fachada: ata
pantalla y base.

## 3. `cab1fa8` (la consolidacion), con lupa

**Lo que esta bien y lo confirmo:**
- `lib/shared/ui/date-civil.ts` **no importa nada**: es hoja del grafo, como `lib/shared/**`
  exige (`docs/checkpoints-proyecto.md > Modulos hexagonales`).
- Es el sitio **correcto** segun `docs/architecture.md > La regla de dependencias` (tabla, fila
  de `components/**`, `hooks/**` y archivos cliente): esos archivos pueden importar
  `lib/shared/ui/**` pero no `lib/shared/**` en general. El mensaje del commit lo razona bien.
- **No toca el barrel de `data-table`** (`components/shared/data-table/index.ts` esta identico en
  el diff): `formatDateLocalISO` sigue fuera de la superficie publica del modulo, que es lo que
  QC-55 R1 protege. El guard `tests/unit/shared/data-table-alcance.test.ts:313` sigue verde y no
  se le aflojo ningun filtro.
- No entra ninguna dependencia: `package.json` y el lockfile no estan en el diff.

**Lo que deja detras** (menores, m5 y m6): dos reexportes-puente que ya no hacen falta, y un
comentario que se quedo viejo en el mismo commit.

## 4. Checklist

### Especificacion y tasks
- [x] `requirements.md` EARS R1-R17, mapa de decisiones, «preguntas abiertas: ninguna», enmienda
      D10 fechada.
- [x] `design.md` con medicion en disco y cuatro alternativas descartadas con su porque.
- [ ] `tasks.md`: T1-T11 en `[x]`, **T12 sigue sin marcar** aunque el gate completo ya corrio
      verde (m7).

### Trazabilidad
- [x] 17/17 requisitos con test concreto (tabla de arriba).
- [x] `progress/impl_....md` contiene el mapa de requisito a test y coincide con lo que verifique.

### Calidad de codigo
- [x] Gate completo verde (lo corrio el leader; no lo repeti).
- [x] E2E para flujo critico de inventario: existe y ata pantalla con base.
- [x] Multiplataforma: disparador de tipo boton con `min-h-11 min-w-11` (44x44), el `hover` es
      decorativo y no la unica via de activacion, **ningun campo de texto** para la fecha —asi que
      la regla de tamano de fuente en inputs no aplica—, `Popover` y `Calendar` ya en uso tactil
      en `data-table-filter-date.tsx`, `react-day-picker` aprobado desde QC-55. Sin `100vh`.
- [x] Dependencias: ninguna nueva. `package.json` fuera del diff.

### Datos y seguridad
- [x] Sin modelo ni migracion nuevos (`db/schema.prisma` fuera del diff), asi que el aislamiento
      por empresa no aplica por tabla nueva; el camino que se amplia ya iba acotado por
      `InventoryScope`/`companyScopeColumns` (QC-49/QC-81) y sus tests siguen verdes.
- [x] Permiso `inventario.modificar` validado en el SERVICE, con test (R10).
- [x] Sin secretos, sin hardcode de contexto: la empresa sale del actor, nunca de la entrada.
- [x] Sin webhooks.

### Modulos hexagonales
- [x] `domain/` y `ports/` sin framework ni `shared`.
- [x] Ningun adaptador de servidor sale reexportado por el barrel.
- [x] `lib/shared/ui/date-civil.ts` es hoja del grafo.
- [x] Sin rutas profundas nuevas en produccion (4285b23 y cab1fa8 las eliminaron; queda una en un
      test, m6).

### Comentarios (`docs/conventions.md > Comentarios`)
- [x] Sin citas de ficha en lineas nuevas de produccion.
- [ ] **~30 lineas nuevas de comentario en produccion citan un requisito o el `design.md`** -> B3.
- [ ] **Un comentario nuevo de produccion da una razon FALSA** -> B4.

## 5. Hallazgos

### B3 — BLOQUEANTE: los comentarios nuevos de produccion citan requisitos y el design.md
`docs/conventions.md > Comentarios` (2026-09-15, acotada el 2026-09-17) dice, literal:
«**Nunca se cita una ficha ni un requisito** en un comentario de produccion: ni QC-n, ni R-n, ni
design.md, ni decision cerrada. **Sin excepciones**» — y remata: «**Quien lo verifica.** El
reviewer, como bloqueante». Produccion es `app/`, `lib/`, `components/`, `hooks/`,
`middleware.ts` y `db/`. El alcance es «las lineas que toca la rama», no el archivo entero, asi
que **los comentarios preexistentes no entran**.

La primera vuelta solo conto las citas de ficha porque en este worktree `docs/conventions.md`
**todavia no tiene esa seccion** (la cerro el leader en `dev`, era m2), y la limpieza de B1 se
hizo conservando las citas de requisito. Esa decision era razonable con lo que habia escrito en
la rama; con la regla que hoy vive en `dev` —la rama de destino de este merge— no se sostiene.

Lineas **anadidas o modificadas por la rama** que la incumplen (30, contadas sobre el diff):

- `app/(private)/inventario/components/product-batch-date-field.tsx` — 6: el docblock de
  cabecera (cita R1-R5 y `design.md > 2`, ademas de R20 y R2), la linea 43 (R2, R5), la 53 (R2)
  y la 55 (R3).
- `app/(private)/inventario/components/product-form.tsx` — 19, entre ellas el docblock de
  `BATCH_FIELDS` (R26, R1-R5, R2, R8), el de `onSaved` (R12, R14, R9), el bloque de
  `purchaseDate` dentro del `safeParse` (R3, R8), los de la rama de alta (R12, R20, R17, R9) y el
  comentario JSX del campo nuevo (R1-R5, R2, R3, R20). Ojo: **cuatro de estas lineas son
  comentarios viejos que la rama reescribio** para quitarles el QC-71 —y les dejo el (R17) y el
  (R16, R18)—, asi que son lineas tocadas, no preexistentes intactas.
- `app/(private)/inventario/components/product-sheet.tsx` — 3: el docblock de
  `createSuccessMessage` (R14, R15 y `design.md > 1`) y el comentario dentro de `handleSaved`
  (R14-R16, R9).
- `lib/modules/inventario/ports/product-repository.ts` — 2: los dos parrafos nuevos, que citan
  R12 y R13.

`lib/shared/ui/date-civil.ts`, `product-prisma.ts` y `product-actions.ts` estan **limpios**: se
puede explicar el porque sin citar la ficha, y ahi ya se hizo. Es la prueba de que la regla es
cumplible en esta misma feature.

**Que falta para cumplirlo:** reescribir esas 30 lineas dejando el porque **sin** la cita al
requisito ni al `design.md` —la trazabilidad ya vive en los nombres de los tests, en `specs/` y
en la bitacora—, y si la limpieza abulta, en su propio commit `chore(QC-103): limpia comentarios
de <archivo>`, solo comentarios, como pide la misma seccion. **Alternativa legitima**: que el
humano decida que la cita al requisito si vale en produccion y **enmiende `docs/conventions.md`
con fecha**, igual que hizo con D10. Lo que no vale es que la regla escrita diga «sin
excepciones» y el codigo que se fusiona contra ella diga otra cosa sin nada escrito que lo
respalde.

### B4 — BLOQUEANTE: un comentario nuevo de produccion afirma lo contrario de D10
En `app/(private)/inventario/components/product-form.tsx`, dentro del objeto que valida el alta,
el comentario nuevo dice que `purchaseDate` ES obligatoria, que esa regla no se duplica alli, y
que «es el mismo `safeParse` quien la rechaza si falta: una cadena vacia [...] se convierte en
`undefined`, que es lo que el campo requerido del esquema no admite».

**Es falso, y lo comprobe en disco.** `createProductWithFirstBatchSchema`
(`lib/modules/inventario/domain/product-batch-input.ts:99-110`) declara `purchaseDate` con
`.nullish()`, y lleva al lado su propio comentario: «Opcional aunque la columna sea NOT NULL:
ausente significa hoy». `readOptionalText` devuelve `undefined` para la cadena vacia
(`product-form.tsx:199-201`) y `.nullish()` **acepta** `undefined`: el `safeParse` **no rechaza
nada**. El campo no es requerido en el esquema.

Esto no es un detalle de estilo: es exactamente la afirmacion que la review anterior bloqueo como
B2 y que el humano acaba de enmendar en sentido contrario el **mismo dia** (D10: el sistema, en
su frontera real, nunca rechaza una fecha de compra ausente). `requirements.md` y el test se
actualizaron (`0088fb3`, `9a83151`); **este comentario no**, y es el que va a leer quien toque
`product-form.tsx` dentro de seis meses. `docs/conventions.md > Comentarios`: «**Si el motivo no
esta verificado, no se escribe.** Un comentario con la razon equivocada es peor que ninguno:
invita a romper lo que protege». Aqui esta verificado — como falso.

Arrastra un detalle coherente con lo mismo: el mensaje de `FIELD_MESSAGES.purchaseDate` («Elige
la fecha de compra.») no lo puede disparar nunca la ausencia del campo desde el panel: el esquema
no la rechaza y el widget no permite vaciarlo. No pido quitarlo —`FIELD_MESSAGES` es un registro
total y el mensaje seria correcto si alguna vez llega—, pero el comentario no puede seguir
justificandolo con un rechazo que no existe.

**Que falta para cumplirlo:** reescribir ese comentario para que diga lo que D10 dejo escrito —el
panel nunca envia vacio, y si la fecha no llega el servidor pone hoy— o borrarlo. Al reescribirlo,
hacerlo ya sin la cita al requisito (B3), y comprobar de paso que ningun otro comentario de la
rama repite la version vieja de R3.

### Menores

- **m3** — `tests/unit/inventario/create-product.test.ts:180`: el `describe` nuevo empieza por
  «QC-103». El propio `tasks.md` de esta ficha abre diciendo que los nombres de test citan el
  requisito, nunca la ficha, y `docs/conventions.md > Tests` dice lo mismo. El repo tiene
  precedentes en ambos sentidos, por eso es menor y no bloqueante: pero es una linea nueva de
  esta rama que se podia haber escrito «R12, R13 — el lote asignado viaja de vuelta...» sin
  perder nada.
- **m4** — `tests/unit/inventario/product-page.test.tsx:1444`: el comentario cita QC-81. La
  seccion de Comentarios extiende a `tests/` la misma regla sobre comentarios. El porque es
  correcto y esta verificado —al reves que B4—, solo sobra la cita.
- **m5** — `cab1fa8` deja dos **reexportes-puente sin funcion**:
  `product-batch-date-field.tsx:41` y `data-table-filter-date.tsx:16`, los dos reexportando
  `formatDateLocalISO`. Ahora que `@/lib/shared/ui/date-civil` es importable tanto por `app/**`
  como por `components/**` y por los tests, ningun consumidor necesita el rodeo:
  `product-form.tsx:29` podria importar la funcion de su fuente, y los tests de `data-table`
  tambien. Ademas el docblock que acompana al primero (`product-batch-date-field.tsx:36-40`)
  dice que el componente es «su dueno real en esta feature», y desde `cab1fa8` **ya no lo es**:
  el dueno es `lib/shared/ui/date-civil.ts`. Es un comentario que nacio viejo en el mismo commit.
- **m6** — `tests/unit/inventario/product-page.test.tsx:9` (linea **nueva** de esta rama) importa
  `formatDateLocalISO` de `@/components/shared/data-table/data-table-filter-date`, ruta profunda
  a una pieza que el barrel de `data-table` mantiene fuera a proposito. **No rompe el gate**: el
  guard de alcance (`data-table-alcance.test.ts:321`) excluye `tests/` deliberadamente y lo
  explica. Pero es justo el acoplamiento que `4285b23` saco de produccion, ahora viviendo en un
  test de **otra** feature. Con `date-civil.ts` ya en su sitio, el import correcto es
  `@/lib/shared/ui/date-civil` y cuesta una linea.
- **m7** — `tasks.md > T12` sigue sin marcar con el gate completo ya verde.
  `CHECKPOINTS.md > Especificacion` exige todas las tasks marcadas. Es contabilidad del leader,
  no del implementer, y no bloquea por si solo: se marca al cerrar.

## 6. Que NO son hallazgos (comprobado, no supuesto)

- **La enmienda D10**: legitima, fechada, coherente en los tres sitios donde aparece, y fiel al
  codigo. No la reabro.
- **`cab1fa8` contra la regla de dependencias**: **no** la rompe. `lib/shared/ui/**` es
  exactamente lo que la tabla de `docs/architecture.md` permite a `components/**`, `hooks/**` y
  archivos cliente; el archivo nuevo no importa nada; el barrel de `data-table` no se toco.
- **Dependencias**: cero nuevas, `package.json` fuera del diff, `react-day-picker` y
  `components/ui/calendar.tsx` reutilizados sin tocar (aprobados desde QC-55).
- **Aislamiento por empresa**: no aplica (sin modelo ni consulta nueva); el camino ampliado ya
  iba acotado y sus tests de rechazo cruzado siguen en el diff, solo actualizados de firma.
- **El flake de `product-page.test.tsx`**: la biseccion de `4285b23` es convincente (el fallo se
  mueve de archivo entre corridas y aparece en specs que no tocan el componente). Preexistente y
  ajeno.
- **m2 de la primera vuelta**: cerrado en `dev`, fuera de esta ficha. Su *contenido*, en cambio,
  si aplica al codigo de esta rama: es el origen de B3.

## 7. Para volver al implementer

1. **B3** — Quitar las citas de requisito y de `design.md` de las ~30 lineas de comentario que la
   rama anade o modifica en `product-form.tsx`, `product-batch-date-field.tsx`,
   `product-sheet.tsx` y `product-repository.ts`, dejando el porque. En su propio commit
   `chore(...)`, sin tocar codigo. O, si el humano prefiere lo contrario, enmendar
   `docs/conventions.md` con fecha.
2. **B4** — Reescribir el comentario de `purchaseDate` en el `safeParse` de `product-form.tsx`:
   hoy afirma que el esquema rechaza la fecha ausente, y el esquema es `.nullish()`. Debe decir
   lo que D10 dejo escrito, o no decir nada.
3. Menores, si se aprovecha el viaje: m3, m4 (citas de ficha en tests), m5 (dos reexportes-puente
   que sobran y un docblock que envejecio en `cab1fa8`), m6 (ruta profunda a `data-table` en el
   import nuevo del test), m7 (marcar T12).

**No hace falta volver a tocar nada de la logica**: backend, UI, aviso, E2E y trazabilidad estan
bien, y los dos bloqueantes se cierran sin modificar una sola linea de codigo ejecutable.

---

# TERCERA VUELTA — 2026-09-17

> Acotada: solo el cierre de B3 y B4, mas las dos reconsideraciones pedidas (m5, m3).
> HEAD `f2b5306`, seis commits por encima del `6f536b1` que revise en la segunda vuelta.
> **No repeti `./init.sh`**: el leader lo dejo verde sobre `f2b5306` (0 rojos, 252 s).

## Veredicto: APROBADA

Sin condiciones. Los dos bloqueantes estan cerrados, comprobados por mi sobre el diff y sobre el
disco, no sobre la bitacora.

## B3 — CERRADO

Rehice la busqueda yo, con el mismo criterio que la abrio: lineas **anadidas** por la rama
(`origin/dev...HEAD`) en `app/`, `lib/`, `components/`, `hooks/`, `db/` y `middleware.ts`,
filtrando por cita de ficha, de requisito, de `design.md` o de «decision cerrada».

**Resultado: 0 aciertos.** Eran 30. Comprobado archivo por archivo en
`git diff 6f536b1..HEAD`:

- `product-batch-date-field.tsx` — docblock de cabecera, `today()`, las dos props y el comentario
  JSX del campo espejo: reescritos conservando el porque y sin una sola cita. El de `type="hidden"`
  quedo mejor que antes: dice por que no es `sr-only` sin apoyarse en `[D9]`/R8.
- `product-form.tsx` — las 19 lineas limpias, incluidas las cuatro que la rama habia reescrito a
  medias en la primera vuelta (las que perdieron el `QC-71` pero se quedaron el `(R17)` y el
  `(R16, R18)`). Cuatro comentarios desaparecieron enteros por no aportar nada sin la cita, que
  es exactamente lo que la regla pide.
- `product-sheet.tsx` — los dos comentarios reescritos; el de `createSuccessMessage` mantiene el
  porque que importa (el texto es neutro porque el lote puede venir tecleado a mano).
- `ports/product-repository.ts` — los dos parrafos reescritos.

Las citas que **quedan** en esos archivos (`R24`, `R27`, `R31`, `design.md > 6 bis`, `QC-20`,
`QC-90`, `QC-49`) estan todas en lineas de contexto que la rama no toca: preexistentes, se
limpian por modulo en fichas del board, y la propia regla las excluye.

Verificado ademas que la limpieza **no cambio codigo**: el diff `6f536b1..HEAD` sobre `app/`,
`lib/` y `components/` es solo comentario, incluidos los dos bloques JSX. Y fue en commits
`chore(...)` separados del cambio real, como la seccion pide.

## B4 — CERRADO

El comentario falso de `product-form.tsx` esta **borrado**, no reescrito (`25f9e81`), y la linea
`purchaseDate: readOptionalText(values.purchaseDate)` se queda sola. Es la mejor de las dos
salidas que propuse: no hay ningun comentario nuevo que pueda volver a envejecer mal, y el que
manda sobre esa decision es `requirements.md` (R3 + D10), que es donde la enmienda vive.

Comprobe ademas que **ningun otro comentario de la rama repite la version vieja de R3**: el de
`product-page.test.tsx:1441`, reescrito en `4d42d51`, dice justo lo enmendado («si la fecha no
llega a la Server Action, el servidor la sustituye por hoy, lo cual no es un rechazo») y ya sin
la cita a QC-81, con lo que de paso cierra m4.

## m7 — CERRADO

`tasks.md` no tiene ninguna task sin marcar: T12 pasa a `[x]` con el gate verde. Cumple
`CHECKPOINTS.md > Especificacion`.

## Reconsideraciones

### m5 — RETIRADO. Lo tenia mal.

Lo medi otra vez y el coordinador tiene razon: los dos reexportes **no son codigo muerto**.
`product-batch-date-field.tsx:36` lo consume `product-form.tsx:29`, y
`data-table-filter-date.tsx:16` lo consumen `tests/unit/shared/data-table-filter-date.test.tsx:10`,
`tests/unit/shared/data-table-viewport.test.tsx:10` y `tests/unit/inventario/product-page.test.tsx:9`
— cuatro importadores reales, no cero. Borrarlos rompe compilacion.

Lo que yo llamaba «puente sin funcion» era, en realidad, **pedir que se migraran esos cuatro
importadores** a `@/lib/shared/ui/date-civil`. Eso es un refactor con criterio propio, no una
limpieza, y no lo respalda ninguna regla de `docs/`: la de dependencias ya se cumple por las dos
vias. Un reviewer no rechaza —ni deja anotado como deuda— un diseno legitimo solo porque el
habria elegido otro. **Retirado, sin sustituto.**

Lo unico que sobrevive de aquel hallazgo, y como nota sin accion: el docblock de
`product-batch-date-field.tsx:32-35` sigue diciendo que el componente es «su dueño real» de
`formatDateLocalISO`, cuando desde `cab1fa8` el dueno es `lib/shared/ui/date-civil.ts`. Es
impreciso, no falso —es el dueno del reexport que `product-form.tsx` consume— y no justifica otra
vuelta.

### m3 — SE MANTIENE como menor, con su regla, y NO bloquea.

`tests/unit/inventario/create-product.test.ts:180`: el `describe` nuevo se llama «QC-103 — el
lote asignado viaja de vuelta con el resultado del alta». La regla existe y es doble:
`tasks.md` de esta misma ficha abre diciendo «los nombres de test citan `R<n>`, nunca `QC-nn`
(regla del harness)», y `docs/conventions.md > Comentarios` dice que en tests «`R<n>` **si** va en
el nombre del caso, porque es el enlace de trazabilidad» — el enlace es el requisito, no la ficha.

Es el unico bloque de tests nuevo de la rama que no nombra su requisito en el `describe` (sus dos
`it` tampoco: «con el lote generado...», «con el lote tecleado a mano...»). La trazabilidad no se
pierde —la bitacora y mi tabla lo atan a R12/R13 por linea— pero se apoya en un documento externo
en vez de en el propio nombre.

**No bloquea**: el repo tiene precedentes en ambos sentidos (`describe('QC-49 R18 — ...')` convive
con `describe('R24 — ...')`), la guardia no existe todavia (QC-115) y la trazabilidad esta
cubierta. Queda anotado para que quien lo lea sepa que fue visto y decidido, no pasado por alto:
un `describe('R12, R13 — el lote asignado viaja de vuelta...')` lo cerraria en una linea si se
toca ese archivo por otro motivo.

### m6 — se mantiene como menor, no bloquea

Sin cambios respecto a la segunda vuelta: `product-page.test.tsx:9` importa por ruta profunda de
`data-table`. El guard excluye `tests/` a proposito y el gate esta verde.

## Estado final del expediente

| Hallazgo | Vuelta | Estado |
| --- | --- | --- |
| B1 (citas de ficha en produccion y E2E) | 1.a | CERRADO |
| B2 (R3 sin decision humana) | 1.a | CERRADO por la enmienda D10, fechada y fiel al codigo |
| m1 (QC-71 en `product-form.tsx`) | 1.a | CERRADO |
| m2 (`docs/conventions.md` sin seccion de Comentarios) | 1.a | Fuera de esta ficha, cerrado en `dev` |
| B3 (citas de requisito en produccion) | 2.a | CERRADO |
| B4 (comentario falso sobre el esquema) | 2.a | CERRADO |
| m3 (ficha en un `describe`) | 2.a | Se mantiene, menor, no bloquea |
| m4 (cita a QC-81 en un comentario de test) | 2.a | CERRADO |
| m5 (reexportes «sin funcion») | 2.a | **RETIRADO**: estaba mal medido |
| m6 (ruta profunda a `data-table` en un test) | 2.a | Se mantiene, menor, no bloquea |
| m7 (T12 sin marcar) | 2.a | CERRADO |

**Bloqueantes abiertos: 0.** Trazabilidad 17/17 con `archivo:linea`, E2E que ata pantalla y base,
ninguna dependencia nueva, ninguna migracion, permiso validado en el service, UI multiplataforma
verificada, gate completo verde. **APROBADA.**
