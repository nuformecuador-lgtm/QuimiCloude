# QC-127 - decimales-caso-r14-sin-actualizar - review

> Rama `feature/QC-127-decimales-caso-r14-sin-actualizar` - worktree
> `.worktrees/QC-127-decimales-caso-r14-sin-actualizar` - diff `git diff origin/dev...HEAD`.
> Revisado el 2026-09-18. El reviewer **no edita codigo**: este archivo es la unica escritura.

## Diff revisado

8 archivos, 771 adiciones / 5 supresiones. De produccion: **ninguno**.

- `tests/unit/pedidos-ui/order-form.test.tsx` (+7/-2)
- `tests/unit/proveedores-ui/supplier-detail-page.test.tsx` (+9/-0)
- `specs/`, `progress/`, `feature_list.json` (spec, bitacora y estado de la ficha)

## Veredicto sobre R17 (lo que el leader lleva al humano)

**R17 esta BIEN PLANTEADO y NO debia salir a ficha aparte.** Razones, verificadas una a una:

1. **Es del mismo tipo.** `[D5]` define tres formas del defecto y la **(c)** es literalmente un
   valor **redondeado** que se pinta sin afirmar su `title` exacto. El caso de
   `supplier-detail-page.test.tsx:629-650` pinta `minPurchase: '0.1005'` como `'0.1'` -el redondeo
   **cambia** lo que se ve- y hasta esta rama **nada** afirmaba que la celda conserva `0.1005`.
   R10 ordena corregir en esta ficha exactamente eso.
2. **No arrastra pantalla.** Comprobado en el codigo:
   `app/(private)/proveedores/[id]/components/catalog-columns.tsx:197-198` y `207-213` ya
   renderizan el span con `title={exactDecimalTitle(...)}`. La correccion es **solo del test**,
   asi que R5 y R13 quedan intactos y `complexity: low` sigue siendo cierto.
3. **El vecino no lo cubria.** Verificado: el caso de `652-671` usa `minPurchase: '25.0000'` y lo
   que afirma es `.not.toHaveAttribute('title')`. La afirmacion nueva no duplica esa.
4. **El mecanismo estaba pre-autorizado por el propio spec aprobado.** `tasks.md > T12` contempla
   corregir hallazgos del mismo tipo y `T17` habla de R1-R16 **mas los `R<n>` que haya anadido
   T12**. La nota es **aditiva** (18 adiciones, 0 supresiones; confirmado en el diff): no
   reescribe ni reordena nada aprobado.

**Matiz (menor, no invalida R17):** la mitad **del costo** de R17 -`title '1234.5678'`- ya estaba
cubierta por el caso vecino de la linea **664**. El texto de R17 (hoy ningun test del repositorio
afirma que esa celda conserva `0.1005`) es exacto para el minimo de compra, pero la afirmacion
del costo es **cobertura duplicada**. Inofensiva; conviene que el humano lo sepa al aprobar.

## Checklist

### Especificacion
- [x] `requirements.md` con EARS numerados R1-R16 mas la nota fechada con **R17**.
- [x] `design.md` con alternativas descartadas y su porque (seccion 8, cinco alternativas).
- [ ] `tasks.md` con **todas** las tasks `[x]`: **T15 y T16 siguen sin marcar** por diseno, son
      el gate rapido y el gate completo, que `AGENTS.md > Regla del gate` deja al leader. No es
      falta del implementer, pero el checkpoint **no esta cumplido todavia**.

### Trazabilidad
- [x] Mapa `R<n> -> evidencia` **completo**: R1-R17, sin huecos, en
      `progress/impl_QC-127-decimales-caso-r14-sin-actualizar.md`.
- [x] Cada requisito afirmativo mapea a una afirmacion concreta o a una mutacion; los negativos
      (R5, R12-R16) a una comprobacion de diff que he reproducido yo.

### Verificacion ejecutable (corrida por mi, no heredada de la bitacora)
- [x] `pnpm exec vitest run tests/unit/pedidos-ui/order-form.test.tsx tests/unit/proveedores-ui/supplier-detail-page.test.tsx`
      -> **2 archivos, 62 passed (62)**.
- [x] `./init.sh` completo: **no lo corro**, es del leader por instruccion explicita.
- [x] Ningun rojo de baseline en juego: ninguno de los dos archivos esta en
      `tests/baseline-rojos.json`, y el diff no toca ese archivo.

### Los siete puntos del encargo
1. [x] **R5 y R13, `app/` y `lib/` intactos.** `git diff --numstat origin/dev...HEAD -- app lib`
   **sin salida**; idem `e2e`, `package.json`, `tests/guards`, `tests/baseline-rojos.json`.
   Tras mis propias mutaciones, `git status --short` vuelve **vacio**.
2. [x] **R1 y R2.** `expect(restante.textContent).toBe('-0.2')` (igualdad exacta, ya no subcadena)
   y `expect(restante).toHaveAttribute('title', '-0.201')`. El `title` **existe de verdad**: lo
   renderiza `app/(private)/pedidos/components/order-ingredients-table.tsx:189-191`
   (`title={remaining === null ? undefined : exactDecimalTitle(remaining)}` sobre el `TableCell`
   con `data-testid="order-ingredient-remaining"`). El test **no lo inventa**. R3 en pie
   (`text-destructive` sobre `firstElementChild`).
3. [x] **Mordida M1-B reproducida por mi.** Ver la seccion siguiente: **se sostiene**.
4. [~] **Censo (R7-R9).** Seis filas, ninguna vacia, con lineas concretas; los descartes por R8
   son **correctos**, verificados uno a uno. Pero el censo **omite una ocurrencia** en
   `order-form.test.tsx` -> ver **B2**.
5. [x] **R11.** `app/(private)/pedidos/components/order-columns.tsx:201` **no se toco**: la celda
   sigue siendo `cell: (order) => formatDecimalDisplay(order.quantity)`, sin `exactDecimalTitle`.
   Lo anotado es **correcto**: origen `'0.1255'` (`order-columns.test.tsx:279-280`), pintado
   `'0.13'`, `title` **ausente en el DOM**. La propuesta de ficha es utilizable tal cual.
6. [x] **R12, cero guardias nuevas.** `tests/guards` tiene **41** archivos, los mismos que `dev`;
   `git diff --name-only origin/dev...HEAD -- tests/guards` devuelve **0**. El motivo esta escrito
   en `design.md > 6` citando **QC-99** y las tres guardias ajenas rotas al cerrar QC-79.
7. [~] **`docs/conventions.md > Comentarios`.** El comentario de R6 en `order-form.test.tsx` esta
   **bien**: fechado, explica un porque que el codigo no muestra y **no cita ficha ni requisito**.
   El de `supplier-detail-page.test.tsx` **si cita** -> ver **B1**.

### Calidad, seguridad y multiplataforma
- [x] Sin dependencias nuevas (`package.json` y lockfile sin tocar): `docs/dependencias.md` no
      aplica.
- [x] Sin modelos nuevos en `db/schema.prisma`, sin consultas de datos de operacion, sin RLS ni
      webhooks en juego. Aislamiento por empresa: **no aplica**, el diff no lo roza.
- [x] Sin secretos, sin hardcode de contexto, sin mezcla de capas.
- [x] **Multiplataforma.** La UI **no cambia** (R5). La limitacion real -que en telefono e impreso
      no hay `title` y el color es el unico aviso- esta **declarada y aceptada a sabiendas** en
      `design.md:65-71` y en `[D3]`, con la alternativa (`<0.01`) evaluada y descartada. Es
      exactamente lo que `CHECKPOINTS.md` pide cuando se acepta una excepcion.

## Reproduccion de la mordida (M1-B), hecha por mi

**Mutacion aplicada**, temporal, sobre la rama:

1. Produccion, `app/(private)/pedidos/components/order-ingredients-table.tsx`: el span del
   restante pasa de `{formatDecimalDisplay(remaining)}` a `{remaining}`, con lo que la celda
   **pinta `-0.201`** en vez de `-0.2`.
2. Test: el caso R14 vuelve a su forma **antigua**,
   `await waitFor(() => expect(restante).toHaveTextContent('-0.2'))`, sin la afirmacion del
   `title`.

**Resultado:** `Tests 2 failed | 31 passed (33)`. Los dos rojos son
`la cantidad requerida parte de 0 y el restante la descuenta del stock` y
`un restante negativo se resalta en rojo`. **El caso R14 NO aparece entre los fallos**: con el
calculo roto pintando `-0.201`, la afirmacion vieja por subcadena **pasa en verde**.

Coincide **exactamente** con lo reportado por el implementer (31/33, R14 no cae). Con la
afirmacion nueva, la misma mutacion la pone en rojo (`expected '-0.201' to be '-0.2'`), que es el
M1-A de la bitacora.

**Reversion:** `git checkout --` sobre los dos archivos. `git status --short` **sin salida** y
`git diff --numstat origin/dev...HEAD -- app lib` **sin salida**: `app/` quedo **identico a
`dev`**. Los dos archivos de test vuelven a **62 passed (62)**.

**Conclusion: la comparativa se sostiene.** La ficha demuestra lo que dice demostrar: no que los
tests siguen verdes, sino que la afirmacion vieja **no detectaba** el calculo roto y la nueva si.
No reproduje M4-B; M4 queda corroborado indirectamente porque verifique en el codigo que el
`title` de `catalog-columns.tsx` solo aparece cuando el pintado difiere del origen, que es la
palanca de esa mutacion.

## Hallazgos

### B1 - BLOQUEANTE: comentario que cita la ficha y el requisito

`tests/unit/proveedores-ui/supplier-detail-page.test.tsx:641`, linea anadida por esta rama:

    // 2026-09-18 (QC-127 R17): el texto redondeado por si solo no cubre el valor exacto ...

`docs/conventions.md > Comentarios` prohibe citar `QC-<n>` o `R<n>` en un comentario, y su vinieta
sobre tests extiende la regla a `tests/` **con una sola excepcion**: `R<n>` **si** va en el
**nombre del caso**, porque es el enlace de trazabilidad. Aqui la cita va en el **comentario**, no
en el nombre. Es el patron que costo **34 commits** en QC-81 y que, hasta que exista **QC-115**,
solo lo ve el reviewer.

Ojo con la distincion que pedia el encargo: el comentario de `order-form.test.tsx:792-795` **no es
hallazgo**. Lo exige R6, va fechado, explica un porque que el codigo no muestra -el resalte se
decide con el exacto, en movil o impreso no hay `title`, la alternativa `<0.01` se descarto- y
**no cita nada**.

**Que falta para cumplirlo:** quitar `(QC-127 R17)` del comentario. La trazabilidad no se pierde:
vive en `requirements.md`, en el mapa de la bitacora y en git. Un token, un archivo.

### B2 - BLOQUEANTE: el censo omite una ocurrencia de la forma (b) en `order-form.test.tsx`

`tests/unit/pedidos-ui/order-form.test.tsx:732`

    expect(restante).toHaveTextContent('0.2');

Es una afirmacion de **presentacion** sobre un **decimal** hecha por **subcadena**, la definicion
literal de la forma **(b)** tal como la escribe el propio implementer en la bitacora
(`toHaveTextContent` con literal numerico donde deberia ir `.textContent).toBe(...)`). Pasaria
igual si la celda pintara `0.25` o `10.2`.

El problema no es solo la linea: es que la **fila del censo la da por inspeccionada y no la
menciona**. Esa fila declara el rango **718-742** como revisado, afirma que los vecinos ya tienen
el patron completo y enumera **otros** `toHaveTextContent` (703-704, 743-760) clasificandolos como
marcadores de ausencia o enteros. La linea 732 cae dentro del rango declarado y **no aparece en
ninguna clasificacion**. Con R9 en la mano -un archivo del censo sin su linea de constancia cuenta
como no censado- la constancia de este archivo es **incompleta**, y esta ficha existe justamente
para no repetir un trabajo dejado a medias.

**Que falta para cumplirlo.** Una de estas dos, a eleccion del implementer, pero **escrita**:

- corregirla con el patron de R1 (`expect(restante.textContent).toBe('0.2')`) por R10, anadiendo
  su fila al censo; **o**
- dejarla como esta y **justificar por escrito en el censo** por que no cuenta -por ejemplo, que
  es una afirmacion de **precondicion** anterior a escribir la cantidad, no la afirmacion de
  resultado del caso-. Lo que no vale es el silencio.

### m1 - menor: R17 duplica cobertura ya existente para el costo

`supplier-detail-page.test.tsx:644-646` afirma `title '1234.5678'` sobre la celda de costo, pero el
caso vecino de la linea **664** ya lo afirmaba. Solo la mitad del minimo de compra (`'0.1005'`)
era cobertura nueva. La justificacion de R17 es exacta para el minimo y se pasa de frenada al
extenderla al costo. No rompe nada; se anota para que el humano apruebe R17 con el dato completo.

### m2 - menor: `tasks.md` con T15 y T16 sin marcar

`CHECKPOINTS.md > Especificacion` pide **todas** las tasks `[x]`. T15 (gate rapido) y T16 (gate
completo) son del leader por `AGENTS.md > Regla del gate`, asi que la ficha **no puede cerrarse**
hasta que el leader las corra y las marque. Se anota como estado, no como culpa.

### m3 - menor: bitacora con un encabezado placeholder

`progress/impl_QC-127-decimales-caso-r14-sin-actualizar.md` conserva arriba un `## Estado de las
tasks` con `(se completa al cierre)` vacio, mientras la tabla real de cierre esta al final del
archivo. Confunde al lector rapido.

## Veredicto

**RECHAZADO** - 2 hallazgos bloqueantes (**B1**, **B2**) y 3 menores.

El fondo de la ficha es **solido**: la mordida se sostiene bajo reproduccion independiente, la
produccion quedo identica a `dev`, R11 esta medido y sin tocar, R12 cumplido con 41 guardias, el
mapa de trazabilidad llega completo hasta R17 y **R17 esta bien planteado**. Lo que falta son dos
correcciones acotadas: un token en un comentario y una linea de censo. Ninguna toca `app/` ni
`lib/`, ninguna reabre una decision cerrada.
