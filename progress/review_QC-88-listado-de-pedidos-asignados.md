# QC-88 — listado-de-pedidos-asignados · review

> Revisado en HEAD `6a96733` (arbol limpio, `0 behind` de `origin/dev`), worktree
> `.worktrees/QC-88-listado-de-pedidos-asignados`. Verificacion por lectura de codigo y de
> tests reales (no solo de la bitacora); ejecucion propia de tests limitada por memoria de la
> maquina (ver nota al final).

## Checklist

### Especificacion
- [x] `requirements.md` con R1-R40 EARS, decisiones cerradas trazadas.
- [x] `design.md` con alternativas descartadas (opcion A de `> 2.2`, candidatas de ruta de `> 2.1`,
      (C)-(H) de `> 10`) y su porque.
- [x] `tasks.md`: las 18 tasks estan `[x]`.

### Trazabilidad (R1-R40)
Verificada caso a caso, no solo leida de la tabla de `impl_QC-88`. Detalle de lo que se
contrasto directamente contra el fuente:

- R5/R6/R40 (autorizacion, el punto mas caliente). `tests/unit/asignaciones/authorization.test.ts`
  y `tests/unit/asignaciones/list-assigned-orders.test.ts` invocan el caso de uso real
  (`createListAssignedOrders(deps)(actor, input)`), no `requirePermission` en aislado ni un corte
  de ruta, y afirman `expect(doble).not.toHaveBeenCalled()` sobre los cinco dobles del puerto
  para los cuatro actores denegados y para un actor con `pedidos.consultar` (que R3 prohibe que
  sustituya). Esto es exactamente lo que R40 exige y lo que CHECKPOINTS.md pide como frontera real
  (no policy, no corte de ruta). Confirmado en el codigo real (`list-assigned-orders.ts:108-109`):
  `requirePermission` es la primera linea del cuerpo, antes de `zod` y antes de tocar ningun `deps`.

- R7/R8 (aislamiento por empresa). `tests/integration/asignaciones/assigned-orders.int.test.ts`
  siembra una asignacion ajena de verdad (pedido y persona reales de otra empresa, dados de alta
  por el caso de uso real de asignacion), la lee al margen del adaptador para probar que existe,
  y luego demuestra que `listOrderIdsByUserInCompany` no la devuelve y que el resultado es
  indistinguible de una persona inexistente. Es un test de rechazo cruzado real, no un mock. Ademas
  hay un caso que demuestra por que un mismo user_id en dos empresas es imposible de sembrar (FK
  compuesta) en vez de darlo por sabido.

- R9/R10/R37 y QC-33 R53 (sin JOIN). Leido el adaptador real:
  `order-assignment-prisma.ts:186-191` es un `findMany` con `select: { orderId: true }` y sin
  `include`; `order-catalog-prisma.ts:108-140` (la lectura nueva de `pedidos`, T4/T5) tambien es
  `select` puro, sin `include` y sin navegar ninguna relacion Prisma. Confirmado: no hay JOIN.

- R14 (numero de consultas constante). Leido `list-assigned-orders.ts` completo: son
  exactamente 5 llamadas a puerto (`listOrderIdsByUserInCompany`, `listAliveSummariesByIds`,
  `findRefsIncludingDeleted`, `listByOrdersInCompany`, `findRefsIncludingDeletedInCompany`), cada
  una una sola vez por pagina, con los ids de receta y de responsables deduplicados antes de
  llamar. El test "R14 numero de consultas CONSTANTE" prueba las 4 primeras con 1 fila y con 25 y
  confirma `toHaveBeenCalledTimes(1)` en los dos casos; la quinta (`findRefsIncludingDeletedInCompany`)
  es una sola llamada por construccion del codigo (una lista de ids deduplicados, sin bucle), asi
  que tambien es constante aunque el test no la cuente linea por linea. Ninguna lectura crece con
  filas, con responsables ni con `pageSize`. La correccion del parrafo de `design.md:187` (4 a 5)
  es exacta: R14 exige constante, no un numero fijo, y se cumple.

- H1 (el hueco que mas peligro tenia). Confirmado en el codigo: `list-assigned-orders.ts` usa
  `deps.assignments.listByOrdersInCompany` (el metodo del puerto de QC-102) y
  `deps.people.findRefsIncludingDeletedInCompany`, y no importa ni invoca
  `listResponsiblesForOrders`/`listResponsiblesForOrdersAction` en ningun punto. La columna de
  responsables no se queda vacia en silencio para el Operador: el caso de uso nuevo compone los
  responsables el mismo con `toOrigin`/`compareResponsibles` reutilizados. Correcto.

- Las seis guardias tensadas del commit `8c014f7`. Revisadas tres en profundidad directamente
  sobre el fuente (no solo la prosa de la bitacora):
  - `tests/unit/asignaciones/module-contract.test.ts` (regla e, QC-86/87): la excepcion nueva es
    por igualdad exacta de archivo (`CASO_DE_USO_QC88`, `PAGINA_QC88`, `NAV_PRIVADO`), nunca por
    prefijo de carpeta ni por modulo entero; el caso de los tres portazos sigue en el mismo
    archivo, intacto, y hay un caso de mutacion que exige que el codigo siga dando
    hallazgo en cualquier otro archivo real de `asignaciones/domain/`. Si se quita la excepcion
    de `CONSUMO_LEGITIMO`, el propio caso de uso de la feature vuelve a caer en rojo, la excepcion
    muerde en los dos sentidos.
  - `tests/unit/pedidos-ui/order-route-contract.test.ts` (QC-35): la excepcion es un `Set` con
    un solo nombre exacto, `assignedOrderRoute`, sobre un patron que sigue cazando cualquier
    otra funcion nueva que hable de un pedido.
  - `tests/unit/recetas-ui/recipe-route-contract.test.ts` (QC-64): lista exacta de exports de
    `lib/shared/routes.ts`, con `ASSIGNED_ORDERS_ROUTE` anadida por nombre, no por patron.
  - Las otras tres (`tests/unit/shared/data-table-alcance.test.ts` QC-55, y las dos anclas de
    `guard-nav-permisos-declarados`/`private-layout-menu` QC-86) se revisaron por lectura del texto
    del test (ancla numerica y nombre citado explicitamente) sin repetir la mutacion a mano; el
    patron es identico al de las tres verificadas arriba y consistente con lo que exige R35.

- La exclusion de `app/(private)/asignacion/` en `tests/unit/pedidos/scope.test.ts`. Es por
  prefijo de carpeta (`CARPETA_ASIGNACION`), aplicada solo a dos predicados
  (`pantallasDePedidosFueraDeSuCarpeta` y `consumidoresDeUiFueraDeSuCarpeta`, los que preguntan
  si algo fuera de la pantalla de pedidos toca el modulo). El predicado que vigila el interior
  del modulo (`consumosPorDentroDelModulo`, que impide un import profundo a `domain/`/`ports/`
  desde cualquier UI) corre sobre todas las entradas de UI sin filtrar por carpeta, incluida
  `asignacion/`: la exclusion no abre una via para que la pantalla nueva importe `pedidos` por
  dentro. Lo unico que la exclusion permite es que `asignacion/` consuma el contrato publico de
  `pedidos` (`OrderPriority`), que es legitimo. `assigned-orders-route-contract.test.ts` no repite
  esta vigilancia especifica de import profundo a pedidos (no hace falta, sigue cubierta
  globalmente por `scope.test.ts`) pero si cubre lo que le corresponde a esta ficha (R1-R3, R21,
  R22, R26, R27, R33). La exclusion es segura.

Cobertura declarada: 40/40. R23-R26, R38-R39 se sostienen por ausencia estructural (tipo,
`git diff`) en vez de por un test que falla al mutar, y esta anotado con precision en
`impl_QC-88...md`, no camuflado como test positivo. R38 tiene la salvedad declarada correctamente:
el E2E existe, pasa `typecheck`/`lint`, sigue el patron de fixtures y limpieza de los E2E ya verdes
del repo, pero no se ha ejecutado nunca contra Playwright real por el drift de la Postgres
local compartida (migracion recipes_company_scope aplicada por otra sesion, ajena a esta rama).
Se declara como limite conocido y aprobado por decision humana, no como verde falso.

### Checkpoints
- [x] `pnpm typecheck` / `pnpm lint`: verdes (confirmado en la bitacora con salida real, y
      revisado el codigo resultante, sin tipos anchos en `AssignedOrderView`).
- [x] Trazabilidad R1-R40 completa (ver arriba).
- [x] `pnpm test` (acotado): corri yo mismo, con `--maxWorkers=2` por la advertencia de memoria
      de la maquina, los modulos donde estan todos los puntos calientes de esta revision
      (asignaciones, asignaciones-ui, pedidos, pedidos-ui, shared, recetas-ui, composition,
      navegacion): 99 archivos, 1558 tests pasados, 4 saltados, verde de punta a punta (tardo
      cerca de 25 minutos por la misma presion de memoria ya referida). No corri la suite
      completa ni Playwright, tal como se me indico; el gate completo lo cierra el leader.
- [x] E2E: cubierto por R38, con la salvedad de entorno declarada arriba (no de codigo).
- [x] Multiplataforma: `a11y-tactil.test.tsx` (asignaciones-ui) es un test real sobre el DOM:
      `min-h-11`/`min-w-11` en los cuatro controles que la feature monta, motivo del disparador
      deshabilitado como texto y `aria-describedby` (nunca `title`), y no encontre `100vh` ni
      `:hover` como unica via en los componentes nuevos.
- [x] Dependencias: ningun commit de QC-88 toca `package.json` (verificado con `git log` filtrado
      a `package.json` sobre los commits de esta rama); no hace falta fila en `docs/dependencias.md`.

### Aislamiento por empresa
- [x] No se anadio tabla ni columna (R24, verificado por `git diff` de `db/schema.prisma` y
      `db/migrations/`, ninguno aparece en los commits de la feature).
- [x] La lectura nueva de `asignaciones` filtra por `(user_id, company_id)`, con test de rechazo
      cruzado real (integracion, ver arriba).
- [x] La lectura nueva de `pedidos` (`listAliveSummariesByIds`) si filtra por
      `orderCompanyScope({ companyId })`, sincronizada correctamente tras el merge de QC-60: la
      inquietud que el propio `design.md > 13` habia declarado como riesgo (que el `where` se
      quede atras en silencio) no se materializo, se verifico en el fuente, no solo en la prosa.

### Modulos hexagonales
- [x] `domain/` de `asignaciones` no importa `next/*`, Prisma ni adaptadores; solo el contrato
      publico de `pedidos`/`recetas`/`identity` y `zod`.
- [x] Cableado puerto a implementacion solo en `lib/composition/index.ts` (R13).
- [x] Ningun `use server` reexportado desde el barrel (la Server Action se importa por ruta
      exacta desde la pantalla, confirmado en `assigned-orders-route-contract.test.ts` y en
      `assigned-orders-list-section.tsx`).

## Hallazgos

### Menor 1 — Comentarios que citan R-n, QC-88 o design.md en archivos de produccion (item 9)
Casi todo el codigo de produccion nuevo de esta feature (`list-assigned-orders.ts`,
`assigned-order-view.ts`, la funcion nueva de `order-catalog-prisma.ts`, el `page.tsx` de
`/asignacion`, etc.) documenta en su cabecera que requisito satisface, citando el numero de
requisito, el codigo de la ficha y `design.md` literalmente. Bajo una lectura estricta del
criterio 9 que se me dio, esto seria bloqueante en las lineas que el diff anade.

No lo elevo a bloqueante por dos motivos que declaro en vez de callar:
1. `docs/conventions.md` no tiene ninguna seccion de comentarios en este worktree (confirmado con
   `Grep` sobre el archivo). El commit que la aterriza en el repo principal es visible en el log de
   la rama base pero no esta fusionado en esta rama: no pude leer el texto exacto de la regla para
   juzgar su alcance con precision (exime docstrings que documentan trazabilidad, o solo prohibe
   comentarios sobre codigo o logica).
2. El patron es el mismo, letra por letra, que usan QC-86, QC-87, QC-102, QC-33 y el resto del
   repo ya mergeado en dev: es la convencion establecida con la que este arnes ha trabajado
   hasta hoy, no una desviacion de esta ficha en particular.

Lo dejo anotado para que el leader decida si aplica el criterio 9 retroactivamente a esta feature
o si, como dice la instruccion, se limpia por modulo, en fichas del board, a partir de ahora que
la guardia QC-115 exista.

### Sin hallazgos bloqueantes
No encontre huecos de trazabilidad, guardias aflojadas, JOINs prohibidos, fugas entre empresas,
autorizacion implementada solo como corte de ruta, ni infracciones multiplataforma en el codigo
nuevo.

## Verificacion propia de tests

Corrida real, con `--maxWorkers=2` (limite de memoria de la maquina), sobre los modulos donde
estan todos los puntos calientes de esta revision (asignaciones, asignaciones-ui, pedidos,
pedidos-ui, shared, recetas-ui, composition, navegacion):

```
Test Files  99 passed (99)
     Tests  1558 passed | 4 skipped (1562)
  Duration  1497.42s
```

Verde de punta a punta. No corri la suite completa ni Playwright (instruccion explicita del
encargo); el gate completo lo cierra el leader.

## Veredicto

OK.

Un solo hallazgo, menor y con su motivo declarado (no pude confirmar el texto exacto de la regla
de comentarios en esta rama). La trazabilidad R1-R40 es real y verificable caso a caso, los puntos
calientes senalados (autorizacion R5/R40, H1, R14, QC-33 R53, la exclusion de scope.test.ts, las
seis guardias tensadas) resisten la verificacion por lectura directa del codigo, por mutacion
documentada donde aplica, y por una corrida propia de 1558 tests verdes sobre esos mismos modulos.
Los dos limites conocidos (E2E de T16 no ejecutado por drift de entorno ajeno a esta rama, y la
suite completa que no corri por instruccion explicita de la memoria de la maquina) estan
declarados con precision, no escondidos, y no son atribuibles al codigo de esta feature.
