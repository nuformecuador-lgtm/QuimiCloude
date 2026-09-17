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
