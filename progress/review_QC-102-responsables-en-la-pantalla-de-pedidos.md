# QC-102 — responsables-en-la-pantalla-de-pedidos · revisión

> Rama `feature/QC-102-responsables-en-la-pantalla-de-pedidos`, HEAD `455fd89`.
> Diff revisado: `origin/dev...HEAD` (59 archivos).
> **Nada de lo que sigue se acepta de la bitácora: todo se comprobó en disco o se ejecutó.**
> Revisión hecha el 2026-09-13.

## Veredicto

**APROBADO.** **0 hallazgos mayores · 6 menores.**

Ningún menor bloquea el merge. Dos de ellos (M5 y M6) son trabajo que pertenece a otra ficha, no
a ésta, y quedan escritos para el leader.

---

## 1. Checklist de `CHECKPOINTS.md`

### Especificación
- [x] `specs/QC-102-.../requirements.md` — 41 requisitos EARS numerados `R1`–`R41`, con tabla de
      cobertura de las 13 decisiones cerradas y nota de origen para los que no salen de la tabla.
- [x] `design.md` — **cuatro** alternativas descartadas con su porqué (A1 componer en `listOrders`,
      A2 módulo orquestador, A3 denormalizar, A4 pedir en cliente). Supera el mínimo de una.
- [x] `tasks.md` — **18/18 marcadas `[x]`**. Verificado: la búsqueda de casillas sin marcar no
      devuelve ninguna.

### Trazabilidad
- [x] Cada `R<n>` mapea a al menos un test concreto **que muerde**. Detalle en la sección 2.
- [x] `progress/impl_QC-102-....md` contiene el mapa `R<n> -> test` completo (41 filas más H4).

### Calidad de código
- [x] `pnpm run typecheck` — verde (corrido dentro de `./init.sh`).
- [x] `pnpm run lint` — verde.
- [x] `pnpm test` — **456 archivos, 6482 pasados, 66 skipped, 0 rojos nuevos**. Reproducido por mí,
      no leído de la bitácora (sección 3).
- [x] Flujo crítico (permisos) con E2E: `e2e/pedidos-responsables.spec.ts`, verde en chromium y
      webkit. Corrido por mí (sección 4).
- [x] Multiplataforma: cumple sin excepción declarada (sección 5).
- [x] Dependencias: **cero añadidas**. El diff de `package.json` y `pnpm-lock.yaml` es de cero
      líneas. No hay fila que exigir en `docs/dependencias.md`.

### Datos y seguridad
- [x] **Ningún modelo nuevo**: el diff de `db/` es de **cero líneas**. No hay tabla, columna,
      índice ni migración. La exención de la columna de empresa no se invoca porque no hay tabla.
- [x] **Aislamiento por empresa**: la única consulta nueva (`listByOrdersInCompany`) recibe
      `companyId` como **primer parámetro** y lo mete en el `where`. El caso de uso lo toma de
      `actor.companyId`, nunca de la entrada.
- [x] **Test de rechazo cruzado, contra Postgres real**:
      `tests/integration/asignaciones/batch-company-scope.int.test.ts` — dos casos independientes:
      el pedido de la empresa B con responsable de verdad vuelve **vacío**, y el actor de la empresa
      B pidiendo el pedido de la A recibe una entrada vacía. No es un doble: corre el SQL.
- [x] Permiso validado **en el service**: `requirePermission(actor, 'pedidos.consultar')` es la
      **línea 98**, la primera ejecutable del caso de uso, antes de zod y antes de tocar puertos.
      Test propio en `list-responsibles-for-orders.test.ts`.
- [x] Acceso a datos solo por repositorio Prisma. Ninguna lectura por el cliente de Supabase.
- [x] Migraciones: ninguna nueva; el gate confirma que todas las existentes tienen `down.sql`.
- [x] Sin secretos hardcodeados. Sin webhooks.

### Módulos hexagonales
- [x] `list-responsibles-for-orders.ts` importa solo `zod`, el dominio propio y el contrato público
      de `identity`. Sin `next/*`, sin `@prisma/client`, sin `@/lib/shared/**`.
- [x] De otro módulo, solo el contrato (`@/lib/modules/identity`).
- [x] El driving no instancia su driven: lo pide a `lib/composition` (quinta factory, mismo
      repositorio y mismo `peopleDirectory` que las otras cuatro).
- [x] El barrel de `asignaciones` **no** reexporta la Server Action del lote. Verificado.
- [x] `OrderAssignment` sigue con dueño `asignaciones`; ningún otro módulo lo consulta.

### Permisos y configuración
- [x] La pantalla valida en servidor; el componente de cliente recibe `canWrite` por props y no lee
      cookies ni permisos.
- [x] Mutaciones por Server Action, ningún `fetch` a rutas propias.
- [x] Nada de entorno hardcodeado.

---

## 2. Trazabilidad R<n> -> test, uno a uno

La razón por la que existe esta revisión. **Los 41 mapean, y los 41 muerden.** Verificado archivo a
archivo, no por la tabla de la bitácora.

### R1-R15 · la consulta en lote

| R | Test | Muerde |
| --- | --- | --- |
| R1 | `U/asignaciones/list-responsibles-for-orders.test.ts`, «devuelve tantas entradas como ids, en el orden en que se pidieron», más `I/.../batch-company-scope` | Sí — afirma la lista entera, no su longitud |
| R2 | idem, «quien puede consultar pedidos y NADA de asignaciones.* recibe su resultado» y «el permiso se comprueba ANTES que zod: una entrada basura sin permiso sale unauthorized». El segundo ata el ORDEN, y es el difícil | Sí |
| R3 | `I/.../batch-company-scope`, dos casos contra Postgres real; firma con `companyId` primero | Sí — el pedido ajeno TIENE responsable y aun así vuelve vacío |
| R4 | unit, «con 20 pedidos y 20 responsables: exactamente 2 invocaciones de puerto», más «las personas repetidas se preguntan UNA sola vez» | Sí — **cuenta invocaciones**, que es lo que R4 exige literalmente |
| R5 | `G/guard-lote-sin-join.test.ts` — (a) el esquema no ata los dos modelos, con dos mutaciones del esquema REAL, una por cada lado; (b) ningún `include` en `asignaciones/**`, con mutación del adaptador REAL; y dos casos que comprueban que la prosa no dispara falso positivo | Sí, y es de los buenos |
| R6 | unit, «el lote y el SINGULAR devuelven exactamente la misma secuencia», más el caso de integración que compara las dos operaciones con datos reales | Sí |
| R7 | unit más `I/...`, «inexistente, de baja y sin nadie devuelven los TRES entrada vacía» | Sí — afirma indistinguibilidad, que es lo que R7 pide |
| R8 | unit, «devuelve vacío con los puertos a CERO invocaciones» | Sí |
| R9 | unit: uuid inválido y tope excedido sin tocar puertos, repetidos una vez, **y el caso de borde «justo en el tope SE ACEPTA»** | Sí — el caso del límite exacto es el que caza un menor-que por menor-o-igual |
| R10 | `I/asignaciones/batch-states.int.test.ts` — los cuatro estados y una página mezclada | Sí |
| R11 | unit: «tres claves exactas», persona de baja, y persona que no vuelve del directorio | Sí |
| R12 | unit más `I/...` con el grupo **renombrado después** de asignar, más `U/pedidos-ui/order-responsibles.test.tsx` | Sí — el renombrado posterior es exactamente la prueba del congelado |
| R13 | `U/asignaciones/order-assignment-actions.test.ts` | Sí |
| R14 | `G/guard-arquitectura-modulos.test.ts`, **bloque 15** | Sí, y con creces — ver la sección 6 |
| R15 | `G/guard-qc102-limites-de-la-ficha.test.ts` (diff de `db/**` vacío, con mutación del detector) más el test de los quince permisos que ya existía | Sí |

### R16-R36 · listado y panel

Verificado nombre a nombre contra los archivos. Los que más importan:

- **R17 y R18** — `responsible-avatars.test.tsx`: cinco dan tres círculos y un más-dos; el más-N
  nombra **a los que faltan y solo a esos**; y el ancho se afirma **en positivo** (clases idénticas
  con 1 y con 9), **en negativo** (no es `w-fit`) **y con la celda vacía**. Tres ángulos del mismo
  ancho.
- **R20** — `order-list-section.test.tsx`, bloque «si el lote falla, la lista NO se cae»: prueba los
  tres códigos (`unauthorized`, `invalid_input`, `unexpected`), no uno.
- **R26** — `order-sheet-responsibles.test.tsx`: abrir el panel deja **el contador de la acción a
  cero**, por las dos puertas (entrada «Responsables» y más-N). Afirmar el contador es lo correcto;
  afirmar que se pinta algo no habría probado nada.
- **R28** — `read-only.test.tsx`: cuatro casos, incluido «el defecto es SOLO LECTURA: sin la prop,
  tampoco hay controles», que es el que caza un `canWrite` con valor por defecto verdadero. Y la
  otra mitad —que el caso de uso rechaza igual— **se invoca, no se reescribe**.
- **R29** — contrastado contra `PENDIENTE` y `EN_CURSO`, y afirma también la **ausencia de frase**,
  que es la mitad que se olvida.
- **R30** — `remove-work-group.test.tsx`: en negativo, «NINGUNA desasignación individual (el doble
  revienta si se la llama)». El doble que revienta es la forma fuerte.
- **R31** — «NO viaja ninguna otra persona, ni una lista».
- **R33** — el toast lleva el `added` **que devolvió la acción**, no la cuenta de lo marcado; más el
  caso en negativo de `revalidatePath`.
- **R34** — error dentro del panel, por `code`, **con lo marcado conservado** y **desapareciendo
  tras un éxito posterior**.
- **R36** — `order-route-contract.test.ts`, siete casos nuevos sobre disco real.

### R37-R41

- **R37** — E2E corrido por mí, verde en las dos proyecciones (sección 4).
- **R38** — el diff de `e2e/pedidos.spec.ts` es de **cero líneas**. Comprobado directamente. `e2e/`
  gana **exactamente un** archivo.
- **R39** — `package.json` y `pnpm-lock.yaml` fuera del diff, con guardia que lo afirma **entrada
  por entrada** contra el merge-base, no solo «el archivo no cambió».
- **R40** — ver la sección 7.2.
- **R41** — `guard-pantalla-pedidos-se-amplia.test.ts`: los archivos de QC-55 y QC-57 no aparecen en
  el diff, y los seis de QC-35 **solo ganan** exportaciones, con mutaciones del archivo real.

**Ningún requisito se apoya en un test vacío, tautológico o que solo compruebe que algo se
renderiza.**

---

## 3. Gate ejecutable — corrido por mí

`./init.sh` **completo, sin flags**, en el worktree:

```
Test Files  456 passed (456)
     Tests  6482 passed | 66 skipped (6548)
  Duration  251.52s
typecheck paso   lint paso
los tres proyectos corrieron (ui, node, integration)
tests: sin rojos nuevos (0 rojos, todos en el baseline de 8); 8 por limpiar
todas las migraciones tienen down.sql
== init OK ==
```

Coincide **exactamente** con lo que declara la bitácora (456 / 6482 / 66). Los 8 del baseline que
ya pasan son material de QC-99 y ninguno está en el diff de esta ficha.

---

## 4. El E2E — corrido por mí, y la afirmación de «heredado» verificada

```
pnpm exec playwright test e2e/pedidos-responsables.spec.ts e2e/pedidos.spec.ts
  4 passed (1.2m)
  2 failed
    [chromium] e2e/pedidos.spec.ts:447 (R49)
    [webkit]   e2e/pedidos.spec.ts:447 (R49)
```

Idéntico a lo declarado. **La afirmación de que los dos rojos son heredados queda verificada por
tres vías independientes, y no por la corrida en 48f5af7 que la bitácora cita:**

1. **El fallo ocurre en el helper `login()`, línea 173, antes de navegar a `/pedidos`.** El log de
   Playwright dice `navigated to "http://localhost:3117/inventario"`: el caso nunca llega a
   renderizar la pantalla de pedidos. Una columna nueva en la tabla **no puede** ser la causa de un
   fallo que ocurre antes de abrir la tabla. Esto solo es visible corriéndolo.
2. **Ningún archivo de la cadena está en el diff.** La lista completa de 59 archivos no contiene
   `login-action.ts`, `private-nav.ts` ni `routes.ts`, y `e2e/pedidos.spec.ts` tiene diff cero.
3. **Ya tiene ficha dueña, y la nombra por línea.** `feature_list.json` en `dev` —escrito el
   2026-09-10, tres días antes de que naciera esta rama— describe **QC-93**
   (`aterrizaje-sin-permiso-de-modulo`) y enumera el patrón en tres suites, incluida literalmente
   `e2e/pedidos.spec.ts:443 (R49)`. La ficha existe justo para esto y su alcance cerrado cubre los
   23 fallos de la misma causa raíz.

**Conclusión: no es rojo de esta ficha, y arreglarlo aquí violaría R38.** El implementer hizo lo
correcto al no tocarlo. Queda como M6.

---

## 5. Multiplataforma

Revisado el diff de UI contra los cuatro bloqueantes de
`docs/architecture.md > Componentes > Regla: multiplataforma`:

- **`100vh`, `h-screen`, `min-h-screen`** — cero apariciones en
  `app/(private)/pedidos/components/`.
- **`:hover` como única vía** — cero clases `hover:` en los dos componentes nuevos. El punto
  delicado (el tooltip del más-N) está declarado como hallazgo **H5** del `design.md` y **mitigado,
  no excusado**: el más-N es un `button` con `aria-label` que **abre el panel al pulsarlo**, y el
  test afirma que los nombres que faltan están **siempre en el árbol, sin pasar el puntero**. La
  lista completa es además alcanzable por la entrada «Responsables» de la fila (R24). Dos caminos
  que no dependen del puntero.
- **Objetivo táctil 44x44** — `TOUCH_TARGET = 'min-h-11 min-w-11'` aplicado a los siete controles:
  más-N, buscador, casilla de persona, casilla de grupo, quitar persona, quitar grupo y confirmar.
  Comprobado en el fuente, no solo en el test.
- **font-size de 16px o más en los campos** — el único campo de entrada es el buscador, con
  `FIELD_TEXT = 'text-base md:text-base'`; el test afirma que declara `text-base` **en todos los
  anchos, no solo en móvil**, que es la trampa habitual. Los `text-sm` del archivo son etiquetas y
  texto, no campos.
- **Librería de UI** — ninguna nueva. Se reutilizan `avatar.tsx`, `tooltip.tsx`, `input.tsx`,
  `checkbox.tsx` y `getInitials`, todos ya en disco.

**Sin excepciones declaradas y sin ninguna que haga falta.**

---

## 6. La decisión de arquitectura central — verificada en el código

Lo que el spec decidió y lo que el código hace **coinciden**:

- La composición vive en **`OrderListSection`**, el Server Component
  (`app/(private)/pedidos/components/order-list-section.tsx`, líneas 232-235), con
  `listOrdersAction` primero y `listResponsiblesForOrdersAction` con los ids de la página después.
  La segunda llamada va **después** del estado vacío, así que con cero pedidos no se pregunta nada,
  y va en paralelo con el catálogo del panel, que sí es independiente.
- **`listOrders` no gana ni una línea.** Buscar `asignaciones` u `orderAssignment` en
  `lib/modules/pedidos/` devuelve **una sola línea, y es un comentario** en
  `order-catalog-prisma.ts`. El ciclo `pedidos -> asignaciones` no existe.
- **Ni un join.** `listByOrdersInCompany` es un `findMany` con
  `where: { companyId, orderId: { in: [...orderIds] } }`, `select` plano y `orderBy` sobre la PK.
  Sin `include`. Y no hay relación declarada entre `orders` y `order_assignments` en
  `db/schema.prisma` que se pudiera navegar aunque alguien quisiera: QC-33 las dejó como escalares
  y esta ficha no lo cambia (diff de `db/` vacío).
- **Ni una consulta por fila.** El caso de uso emite **dos** invocaciones de puerto como máximo, sea
  cual sea el tamaño de la página, y **cero** si no hay ids o si no hay filas. El test lo demuestra
  contando invocaciones con 20 pedidos.

**El grafo se vigila entero, no el par concreto.** El bloque 15 de
`guard-arquitectura-modulos.test.ts` no escribe «pedidos no importa asignaciones»: construye el
grafo de módulos del repo real y busca **cualquier** ciclo, con cuatro casos que mutan archivos
reales (`list-orders.ts` importando el contrato, importando por ruta profunda, y el driven de
`pedidos` consultando `prisma.orderAssignment`). Es más fuerte que el requisito y protege de ciclos
que todavía nadie sabe nombrar. Esto es lo que justifica que la ficha creciera a `fullstack`, y
está sostenido.

---

## 7. Las dos decisiones que se me pidió juzgar

### 7.1 `canModifyAssignments` — solución correcta. No le quita filo a nada.

El conflicto era real: la regla (e) de `tests/unit/asignaciones/module-contract.test.ts` prohíbe
escribir el código del permiso de escritura fuera de `asignaciones/domain`, y R28 obliga a que la
pantalla baje `canWrite` por props. Las dos opciones eran enmendar la guardia (como hizo QC-87) o
publicar un predicado. **Eligió la segunda, y es la correcta.** Razones, verificadas:

1. **La guardia sigue intacta.** `tests/unit/asignaciones/module-contract.test.ts` **no aparece en
   el diff**. Cero enmiendas. Una segunda excepción, y para una pantalla, habría dejado la regla
   (e) sin filo — exactamente lo que el implementer argumenta, y coincido.
2. **El literal no sale del módulo.** `ASIGNACIONES_MODIFICAR` es una constante **privada al
   archivo**, no exportada ni publicada en el barrel. Lo que cruza la frontera es la **respuesta**,
   no la cadena. Es precisamente el bien que la regla (e) protege.
3. **No hay segunda definición de la pertenencia.** El predicado delega en `assertPermission` de
   `identity`, la misma y única implementación que usa `requirePermission`. No se reescribió con un
   `includes` laxo, que es como divergen estas cosas.
4. **No sustituye ni relaja la autorización.** Los tres casos de uso de escritura siguen con
   `requirePermission` en su primera línea, y `tests/unit/asignaciones/authorization.test.ts` lo
   afirma; el único cambio en ese archivo es **una línea de import** (comprobado: ignorando espacios
   el diff es de un borrado). Si alguien borrara `canModifyAssignments`, las tres operaciones
   seguirían rechazando igual y lo único que se perdería es el solo-lectura de R28. Eso es la
   definición de «anticipar no es autorizar».
5. **Dirección segura por defecto.** Con la sesión caída devuelve falso, y el test de solo lectura
   afirma que **sin la prop tampoco hay controles**.

Único pero, y es de estilo: el predicado usa `try`/`catch` sobre un error centinela como control de
flujo. Es el precio de no duplicar `assertPermission`, está documentado en el propio archivo, y la
alternativa sería peor. Queda como M4, no como defecto.

### 7.2 La guardia de R40 acotada — sigue teniendo filo, y más que antes

La versión original medía «del contrato solo se toman tipos», que es **más estricto que R40** y
mordía sobre `canModifyAssignments`, un valor de dominio puro que el barrel publica a propósito.
Acotarla a lo que R40 dice —**Server Actions**, y nada más— es corregir la guardia, no aflojarla
para que pase el código. Comprobado que **gana** filo:

- **Antes solo miraba el barrel**; ahora el criterio es que el especificador no sea la ruta exacta,
  así que caza la acción venga **de donde venga**, incluido el rodeo por re-export local. Hay caso
  sintético que lo afirma con el mensaje exacto, importando la acción de asignar desde
  `./order-responsibles`. **La afirmación del implementer es cierta.**
- **La lista de acciones vigiladas ya no puede quedarse vieja en silencio**: un caso nuevo lee el
  fuente real de acciones y exige que los nombres exportados sean exactamente esa lista. Añadir una
  acción al módulo sin darla de alta pone la guardia en rojo. Éste es el caso que cierra el agujero
  real.
- **Los casos de mutación del archivo REAL siguen muriendo**, y se añadieron dos más (desasignar y
  quitar grupo, una a una, exigiendo **exactamente un** hallazgo con el nombre de la desviada).
- Sigue sin confundir prosa con infracción: un comentario que nombre acción y barrel da cero
  hallazgos.
- El alcance es todo `app/(private)/pedidos/**` recursivo, que es el ámbito de R40.

No se puede esquivar por barrel, por ruta de terceros ni por re-export. La única vía teórica que
queda es un import de espacio de nombres completo, y esa está cerrada aguas arriba: el barrel **no
puede** reexportar un `'use server'` (bloque de `guard-arquitectura-modulos`, R10). No lo cuento
como hallazgo.

---

## 8. Hallazgos

### Mayores (bloqueantes): ninguno

### Menores

**M1 · `menor` — La bitácora describe mal el cambio de `list-order-responsibles.ts`.**
Dice «SOLO el import de T3». El archivo **pierde 44 líneas** (medido ignorando espacios): el
comparador y `toOrigin` se movieron a `domain/responsible-order.ts`. **El código es correcto** — es
literalmente lo que `design.md > 2.3` manda, «se extraen a un archivo del dominio y los dos casos de
uso lo importan», y el test de R6 que compara lote contra singular prueba que la extracción no
cambió el orden. Lo inexacto es la bitácora, que es lo que un revisor lee primero. Sin impacto en
el producto.

**M2 · `menor` — Ruido de formato que encarece el diff.**
En bruto el diff son 12.518 inserciones y 4.116 borrados; ignorando espacios, 8.478 y **76**. Es
decir, unas 4.000 líneas del diff son solo formato, concentradas en cinco archivos de test de la
pantalla anterior (`order-form.test.tsx`, `pedidos-viewport.test.tsx`, `order-sheet.test.tsx`,
`order-columns.test.tsx`, `order-list-section.test.tsx`).
**Comprobé que no esconde nada**: comparé los nombres de todos los `it(...)` y `test(...)` antes y
después, uno a uno. El único que cambia es «los ocho ids», que pasa a nueve, y es la lista cerrada
creciendo con la columna nueva: intencional. Ningún guion ajeno se reescribió ni se perdió. Aun
así, un diff con esta proporción de ruido dificulta cualquier revisión futura por `git blame`.

**M3 · `menor` — `MAX_ORDERS_PER_BATCH` se publica en el barrel, y el `design.md > 2.6` solo nombra
tres símbolos.** Desviación real, señalada por el propio implementer para que se juzgue.
**Se acepta**: la pide el test de H4, que ata el tope del dominio a `MAX_PAGE_SIZE` y es la única
mitigación de una duplicación que la regla de dependencias hace inevitable. Es dominio puro, no
arrastra servidor, y la guardia de R40 tiene un caso que afirma explícitamente que sacarla del
barrel es legítimo. Coste: un símbolo más en la superficie pública del módulo.

**M4 · `menor` — `canModifyAssignments` usa excepciones como control de flujo.**
Un `try`/`catch` alrededor de `assertPermission` sobre un error centinela privado. Es el precio de
no reimplementar la pertenencia, está razonado en el propio archivo y la alternativa —un `includes`
propio— sería peor. Nota de estilo; ninguna acción pedida.

**M5 · `menor`, y es ficha aparte — El catálogo del panel se corta en 25 personas.**
`loadResponsiblesCatalog` pide `listUsersAction` y `listWorkGroupsAction` con
`pageSize: MAX_PAGE_SIZE` (25), y el buscador del panel filtra **sobre lo ya traído**. Con más de 25
personas en la empresa, **no todas son asignables desde esta pantalla**, y el panel no lo dice: el
texto de lista vacía solo aparece cuando no hay ningún candidato, no cuando hay más de los que
llegaron.

**Juicio: es ficha aparte, no un mayor de ésta.** Cuatro razones:

1. **Ningún requisito lo exige.** R27 pide que los catálogos bajen **por props**, y eso se cumple.
   Ninguno de los 41 requisitos ni ninguna de las 13 decisiones cerradas dice que el catálogo tenga
   que ser completo ni que el buscador busque en el servidor.
2. **El tope no lo elige esta ficha**: 25 es el máximo que `listUsers` y `listWorkGroups`
   **imponen**. Superarlo exige paginar o buscar en servidor, es decir, funcionalidad nueva.
3. **El spec fue aprobado por el humano con el `design.md` a la vista**, y ahí el catálogo es «el
   que se ofrece para asignar», sin más. Exigir ahora búsqueda en servidor sería que el reviewer
   meta alcance que nadie pidió, que es justo lo que `docs/architecture.md > Dominio` prohíbe.
4. El implementer **lo señaló y no lo decidió**, que es la conducta correcta bajo la regla 6 de
   `CLAUDE.md`.

**Recomendación para el leader**: ficha propia. Hay precedente en esta misma pantalla — el
`recipe-picker` de QC-35 trae la primera página y **busca las demás en el servidor** (su R31). La
ficha nueva tendría un patrón que copiar, y el criterio a cerrar es si el panel debe avisar de que
la lista está recortada mientras tanto.

**M6 · `menor`, y es deuda con dueño — Los dos E2E rojos de `e2e/pedidos.spec.ts:447` (R49).**
Verificados como heredados por tres vías independientes (sección 4). **No son de esta ficha y no
deben arreglarse aquí**: tocar ese guion lo prohíbe R38, y cambiar los permisos del rol Operador es
decisión de producto. **Ya tienen ficha: QC-93**, que los nombra por archivo y línea y cuyo alcance
cerrado del 2026-09-13 cubre los 23 fallos de la misma causa raíz. No queda nada que hacer aquí
salvo que el leader no pierda de vista que QC-93 sigue abierta.

### Hallazgos del spec que NO son míos

- **H1** —el tercer permiso, `usuarios.consultar`, que la decisión 2 no nombra— fue **aprobado por
  el humano con el spec a la vista**. Comprobé que el código hace **exactamente lo que el spec
  dice**: `loadResponsiblesCatalog` degrada a catálogos vacíos con su texto de lista vacía, igual
  que `loadFormCatalogs`, sin inventar ningún permiso y sin tumbar la lista. Hay test en
  `order-responsibles.test.tsx`, «catálogo vacío: se degrada con su texto y no tumba nada». **No es
  hallazgo mío.**
- **H2, H3, H4 y H5** están implementados como el `design.md` los resolvió, con su test cada uno.

---

## 9. Veredicto final

**APROBADO** — 0 mayores, 6 menores.

Los 41 requisitos mapean a tests que muerden; las 18 tareas están cerradas; el gate completo lo
corrí yo y da lo mismo que declara la bitácora; el E2E lo corrí yo y los dos rojos son deuda
heredada con ficha dueña. La decisión de arquitectura central —componer el lote en la pantalla, no
en `listOrders`— está en el código tal como se diseñó, sin un solo join y sin una consulta por fila,
y sostenida por una guardia de aciclicidad más fuerte que el requisito que la pidió.

Las dos decisiones que el implementer tomó por su cuenta —publicar `canModifyAssignments` en vez de
enmendar la regla (e), y acotar su propia guardia de R40— **son las correctas, y ninguna de las dos
resta filo a nada**. La segunda, de hecho, deja la guardia mordiendo más de lo que mordía.

Nada de lo anotado bloquea el merge. M5 y M6 son trabajo de otras fichas y quedan para el leader.
