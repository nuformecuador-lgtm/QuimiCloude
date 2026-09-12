# QC-84 — crud-de-grupos-de-trabajo · revisión

> Rama `feature/QC-84-crud-de-grupos-de-trabajo` · worktree `.worktrees/QC-84-crud-de-grupos-de-trabajo/`
> · base de fusión `origin/dev` · 19 commits. Revisado el 2026-09-11.
> El reviewer **no editó ni una línea de código**: todas las mutaciones se aplicaron, se midieron y se
> revirtieron; `git status --porcelain` quedó **vacío** al terminar, con `typecheck` y `lint` verdes.

**VEREDICTO: OK (APROBADO).** 0 bloqueantes · 0 mayores · 5 menores · **6 mutaciones probadas**.

---

## 1. Checklist

### Especificación
- [x] `requirements.md` con **54** requisitos EARS numerados y la tabla de **18 decisiones cerradas**.
- [x] `design.md` con alternativas descartadas y su porqué (§ 9.1, 9.1.b, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7).
- [x] `tasks.md`: **20 tasks (T0–T19), todas `[x]`**. Ningún `[ ]` pendiente.

### Trazabilidad
- [x] Los **54** `R<n>` mapean a un test. Verificado **abriendo los archivos**, no leyendo la tabla (§ 3).
- [x] `progress/impl_QC-84-...md` contiene el mapa `R<n> -> test` completo.

### Calidad de código (ejecutado por el reviewer, no leído de la bitácora)
- [x] `pnpm run typecheck` verde, sin salida.
- [x] `pnpm run lint` verde, sin salida.
- [x] `vitest run tests/unit/identity/grupos` + `account-status-scope` + `catalogo` + `identity-facade`
      → **12 archivos, 219 pasados, 3 saltados**.
- [x] `vitest run` los tres `work-group-*.int.test.ts` → **3 archivos, 36 pasados** contra Postgres real.
- [x] `vitest run guard` → **29 archivos, 313 pasados, 4 saltados**.
- [x] E2E: **no aplica, y está declarado por adelantado**. Decisión 16 y R48 difieren el E2E a QC-85,
      donde existe la pantalla; `design.md > 10` lo dice al principio, no al final. El checkpoint de
      «flujo crítico → E2E» queda cubierto por **decisión humana**, no por omisión.
- [x] UI multiplataforma: **no aplica**. El diff no toca `app/` ni `components/`.
- [x] Dependencias: **ninguna añadida**. `package.json` y `pnpm-lock.yaml` fuera del diff.

### Datos y seguridad
- [x] **Ningún modelo nuevo**: el diff de `db/**` está **vacío** (R46). El modelo es de QC-83, mergeado.
- [x] Aislamiento por empresa: `companyId` es el **primer parámetro obligatorio de los siete métodos**
      del puerto; una llamada que lo olvide no compila. Hay test de **rechazo cruzado** real —
      `work-group-crud.int.test.ts` («un grupo de otra empresa responde `work_group_not_found`», «el
      listado de la empresa A no enseña ningún grupo de la B») y `work-group-service.test.ts` («los
      siete métodos reciben la empresa del ACTOR como PRIMER argumento»).
- [x] Permiso validado **en el service, primera línea**, con dobles que **explotan si los llaman**;
      hay caso explícito de que se comprueba **antes de zod**.
- [x] RLS: no hay tablas nuevas; `guard-rls-force.test.ts` verde. Ninguna policy creada ni modificada,
      y ninguna se usa como frontera (R7).
- [x] Acceso a datos solo por Prisma y en **un único** archivo driven.
- [x] Sin secretos; el `.env` del worktree queda fuera del diff.
- [x] Webhooks: no aplica.

### Módulos hexagonales
- [x] `domain/` y `ports/` no importan framework, Prisma, `lib/shared/**` ni `lib/composition`. El
      10/25 entra **inyectado** (`PaginationPolicy`), no importado.
- [x] El barril `lib/modules/identity/index.ts` **no reexporta** las Server Actions (verificado por
      grep). Ningún `'use server'` sale del barril.
- [x] Cableado **solo** en `lib/composition/index.ts`, con bloque aditivo (+74/-0).

### Verificación final
- [x] `./init.sh --rapido` verde (lo corrió el leader: 313 tests, `== init OK ==`). El gate largo es
      del leader antes del PR.

---

## 2. Alcance, medido contra la base de fusión

`git diff origin/dev...HEAD --stat`: **37 archivos, 9841 inserciones, 5 supresiones.**

- `db/schema.prisma`, `db/migrations/`, `app/`, `components/`, `e2e/`, `middleware.ts`,
  `package.json`, `pnpm-lock.yaml`: **diff vacío**, verificado con `git diff --stat` acotado a esas
  rutas. Cumple R46, R48 y R49.
- `lib/modules/identity/domain/permissions.ts` **intacto**; `grep -c "code:"` da **15**. Cumple R47.
- **Las 5 supresiones de toda la rama están en UN solo archivo**: `tests/unit/errores/catalogo.test.ts`
  (7 añadidas / 5 suprimidas), y son la línea `toHaveLength(32)` a `(39)`, sus dos títulos y el
  comentario. **Todo lo demás del diff es puramente aditivo.** Se midió con `git diff --numstat`
  filtrando las filas con supresiones, y es la comprobación que cierra el punto del CRLF (§ 5.2).

---

## 3. Trazabilidad `R<n> -> test`: los 54, abiertos uno a uno

No se aceptó ningún test «nombrado en una tabla». Se abrieron los 12 archivos nuevos y los 3 ajenos y
se leyeron títulos y aserciones. Resultado: **los 54 tienen al menos un test que existe y que afirma
lo que el requisito exige**. Ninguno vacío, ninguno tautológico.

Los que merecen decirse por su nombre, porque son los que más fácilmente se falsean:

| R | Por qué se miró de cerca | Cómo quedó |
| --- | --- | --- |
| R1, R2 | «primera línea» no se prueba leyendo el código | `authorization.test.ts` usa dobles que **lanzan si los llaman**, y el caso «con entrada inválida el rechazo sigue siendo `unauthorized`» prueba que el permiso va **antes de zod**. Un `if` decorativo puesto después no pasaría |
| R3 | la implicación entre permisos | dos casos separados: solo `modificar` no abre las dos consultas; solo `consultar` no abre las cinco escrituras |
| R4 | «no depende del rol» | caso de comportamiento (Actor sin campo de rol) **y** caso estático (ningún archivo nuevo escribe un nombre de rol), más M7 del test de alcance |
| R12 | «la garantía es el índice, no un SELECT» | el test de integración baja un escalón y afirma el `SQLSTATE 23505` **y** el nombre del índice parcial, leídos con `GET STACKED DIAGNOSTICS`, nunca el texto. Y hay un caso estático: **el puerto no expone ninguna búsqueda por nombre**, así que el SELECT previo no es expresable |
| R19–R23 | el corazón (a) | § 4.1 |
| R22 | el orden lo pone el SQL, y un doble no lo prueba | el adaptador ordena por apellidos, nombres e **id** (L354) y el recorrido de tres páginas con **dos homónimas exactas** corre **contra Postgres real** |
| R30, R31 | el corazón (b) | § 4.2 |
| R32 | una carrera fingida no es una carrera | **dos conexiones distintas del pool** con `Promise.allSettled`: una crea, la otra da el duplicado, la tabla queda con **una** fila |
| R39 | el cruce con QC-86 | § 4.3 |
| R46–R50 | requisitos de alcance | `scope.test.ts` mide contra la base de fusión **más el árbol de trabajo** y ancla la no-vacuidad **en las dos direcciones**: si el rango no resuelve, **rojo**; si el diff está vacío o la rama es ajena, **`ctx.skip` ruidoso**, nunca verde. La señal de rama es **conjuntiva**, así que no se confunde con QC-85 ni QC-86 |
| R51–R54 | § 4.4 | |

Ver **menor-05** (§ 6) sobre R24, R25 y R27.

---

## 4. Los cuatro puntos que había que juzgar, no dar por buenos

### 4.1 Corazón (a) — los miembros son solo cuentas `active`, con el precio de la `pending`

Verificado **mutando**, no leyendo.

- **M1** — sustituir el filtro por la comparación obvia: `blockReasonOf(effectiveAccountStatus(...)) === null`
  pasa a `candidate.accountStatus === 'active'` en `domain/list-work-group-members.ts` L74.
  **ROJO: 5 de 8** en `members-filter.test.ts`. Y caen **los dos precios**: Bruno (columna `blocked`,
  plazo **vencido**) desaparecía y Carla (columna `active`, plazo **vigente**) aparecía. Es
  literalmente la alternativa que `design.md > 9.1` descarta por escrito, ahora con un test que la
  impide.
- **M6** — que `pending` deje de ocultar (`case 'pending': return null;` en `blockReasonOf`).
  **ROJO: 9 de 14** entre `add-member-errors.test.ts` y `members-filter.test.ts`.

El precio está escrito **y probado en los dos sitios**: el usuario recién creado, que nace `pending`,
no aparece en sus grupos, y vuelve **solo moviendo el estado de su fila de `users`**, sin ninguna
escritura sobre la pertenencia — el test recorre **dos** grupos para demostrarlo. R23 se prueba con
los cinco métodos de escritura del puerto como dobles que **explotan**: no sonó ninguno. Confirmado
además contra Postgres real (R20 y R21, este último con el reloj como única variable, y con el caso
simétrico de que el bloqueo **administrativo** no vuelve por mucho que avance el reloj).

**La declaración del implementer es cierta.**

### 4.2 Corazón (b) — el duplicado oculto, distinguible del duplicado normal

- **M3** — unificar dos de los cuatro `code` (`inactive` pasa a `WorkGroupMemberExistsPendingError`).
  **ROJO: 2 de 6** en `add-member-errors.test.ts`.
- **M6** tumba también el camino `pending`.

Lo que hace bueno a este test y no solo verde: el «por qué no se ve» sale de **la misma expresión**
que decide quién sale en la lista — `list-work-group-members.ts` importa `blockReasonOf` de
`add-work-group-member.ts` —, y hay un caso que lo demuestra sin leer el código: **el mismo doble**
pasa de `work_group_member_exists_blocked` a `work_group_member_exists` con solo **adelantar el
reloj**. Con dos definiciones ese par de casos no podría existir. Los cuatro `code` se afirman como
cuatro valores distintos y ninguno de los tres ocultos es el del visible.

El hallazgo de `design.md > 7.2` —el mensaje **no puede** llevar el nombre del grupo con QC-70 tal y
como está mergeado— se entregó como dice el diseño: **tres códigos, uno por motivo**, textos
distintos, y el nombre lo pondrá QC-85. No se abrió la interpolación del catálogo por la puerta de
atrás. **Correcto.**

**La declaración del implementer es cierta.**

### 4.3 El cruce con QC-86 — dar de baja no deja un pedido sin responsables

- **M5** — mutar `softDeleteAliveInCompany` en el adaptador Prisma para que, tras el `UPDATE` de
  `deleted_at`, anule el nombre congelado en `order_assignments`.
  **ROJO: 3 de 5** en `work-group-assignments.int.test.ts`, incluidos los dos casos de R39 y el de
  R38+R39.
- Un intento previo cayó por error en `renameAliveInCompany` y puso **2 de 5** en rojo: la vigilancia
  de **R18** (renombrar no toca el nombre congelado) también muerde. Bien.

El test afirma sobre **todas** las columnas de `order_assignments`, `updated_at` incluida —que es por
donde se colaría un toque que reescribiera el mismo valor—, y cada caso comprueba además que la
operación **sí ocurrió** sobre el grupo, así que el verde no puede venir de que no pasó nada.

**Es la prueba, desde el otro lado, de que la congelación de QC-86 aguanta. Vale.**

### 4.4 La paginación de miembros: total coherente y desempate estable

- **M2** — contar **antes** de filtrar (`visible.length` pasa a `candidates.length`).
  **ROJO: 2 de 6** en `members-pagination.test.ts`.

Leído el código (L144-160), el orden de los pasos es el correcto: candidatos ordenados por SQL,
filtro del estado efectivo, `total = visible.length`, corte, `buildPage`. **El `pageSize` de la
página es siempre el efectivo**, el mismo que calculó `toOffsetLimit`, así que «pedir 100 devuelve
25» y la página lo dice. Coherencia comprobada en los dos niveles:

- unitario: 12 con 4 ocultos da `total: 8`, `totalPages: 1`, y la segunda página **vacía** con
  `total: 8`; bordes 25/26/3; recorrido de 3 páginas sobre 23 visibles con dos homónimas a caballo
  del corte, **cada una exactamente una vez**;
- integración, contra Postgres: 23 visibles y 5 ocultas dan `total` 23 en las tres páginas, tamaños
  `[10,10,3]`, y las 28 filas de pertenencia siguen ahí (el filtro es de lectura).

El **desempate estable** es real y vive en el SQL: el adaptador ordena por apellidos, nombres e
**id**. Y hay una **contraprueba ejecutable permanente** —un doble que simula el orden **sin** `id` y
afirma que entonces una homónima sale dos veces y la otra ninguna—, que es lo que convierte «este
test está verde» en «este test se puede romper».

**La declaración del implementer es cierta.**

---

## 5. Las tres cosas declaradas que había que juzgar

### 5.1 Las dos desviaciones del literal de `design.md > 5`

**Las dos son CORRECTAS. Ninguna es el diseño incumplido.** Lo digo con esas palabras porque el
encargo lo pide así.

**(1) El puerto recibe `ListQuery` y no `SanitizedListQuery`.** Comprobado en el árbol:
`domain/list-query.ts` L127-134 define `SanitizedListQuery` como el par `{ query, ignored }` — es lo
que **devuelve** `sanitizeListQuery`, no la consulta saneada. El literal del diseño **no podía
compilar**: habría obligado al puerto a recibir el par entero, incluida la lista de campos podados,
que no es asunto suyo. Lo que el diseño quería decir —«el puerto recibe la consulta **ya saneada**»—
**se cumple**: `list-work-groups.ts` L68-71 sanea con `WORK_GROUP_QUERYABLE`, anota lo podado por el
log de QC-57 y pasa **`query`**, el `.query` del par. Mismo reparto que
`UserAdminRepository.listAliveInCompany`, que ya estaba así en el repo. **No cambia quién sanea ni
cuándo: desviación de forma, no de fondo.**

**(2) `already_member` lleva el estado crudo y no un `hiddenBy` cocinado.** Esto no es apartarse del
diseño: es **cumplir su propio § 5.1**, que dice literalmente que «**`hiddenBy` lo calcula el
DOMINIO**, no el adaptador: el puerto devuelve el estado crudo más el plazo, y el caso de uso llama a
`effectiveAccountStatus(view, now)`». El bloque de código de § 5 y la prosa de § 5.1 se contradecían
entre sí; el implementer siguió **la prosa**, que es la que lleva el razonamiento. Con el `hiddenBy`
del snippet, el adaptador tendría que traducir estado, plazo y reloj a un motivo: esa es **la segunda
copia** de `effectiveAccountStatus` que QC-78 R7 prohíbe y que `design.md > 9.1.b` descarta por
escrito. `MemberBlockReason` sigue exportado por el puerto y sigue siendo lo que **produce** el
dominio. **Correcta, y además la única de las dos formas que no rompe un requisito.**

### 5.2 El test ajeno retensado (`tests/unit/identity/account-status-scope.test.ts`)

Revisado **aserción por aserción**, como se pidió.

- El diff es **+34 / -0**: **solo añade** seis rutas a `SITIOS_PERMITIDOS` y su comentario rotulado.
  **No toca ni una línea existente.** Ningún `expect` borrado, ningún `toEqual` degradado, ningún
  caso saltado.
- La comparación **sigue siendo una igualdad sobre una lista cerrada**: L436,
  `expect(queLoNombran).toEqual([...SITIOS_PERMITIDOS].sort())`. No se relajó a `toContain`, ni a
  `arrayContaining`, ni se ensanchó el patrón `MENCION_DEL_ESTADO`.
- **M4 — verificado mutando**: creé un archivo nuevo bajo `lib/modules/identity/domain/` que nombra
  `accountStatus` y **no lo listé**. **ROJO**: `1 failed | 8 passed | 3 skipped`, y el fallo es
  exactamente esa igualdad. El centinela **sigue mordiendo**. Revertido.
- Las seis excepciones están **justificadas una por una y con el requisito que las autoriza**; las dos
  que solo *nombran* el estado al explicar la frontera se declaran como tales en vez de ensanchar el
  patrón, que es lo honesto.
- **La conversión CRLF a LF: verificada, y no se coló nada.** El archivo sigue siendo
  `with CRLF line terminators` y el diff son 34 líneas, no 1114. Pero eso solo no bastaba, así que se
  midió de otra forma: **en todo el diff de la rama (37 archivos) solo UN archivo tiene supresiones**,
  y es `catalogo.test.ts` con 5, todas visibles y todas del `32` al `39`. Es decir: **no existe ningún
  cambio oculto tras un reformateo en ninguna parte de esta rama**, ni en ese archivo ni en otro.

**El retensado es correcto: nombra la excepción, no relaja la igualdad.**

### 5.3 La pregunta abierta del nombre normalizado vacío, juzgada

Reproducido **ejecutando** la función, no leyéndola: `normalizeWorkGroupName('!!!')` devuelve **cadena
vacía**, y `zod` lo acepta porque `name` sí está lleno. Consecuencia: dos grupos «!!!» y «¿¿¿»
normalizan los dos a vacío y el segundo **choca** contra el índice único parcial.

**Juicio: NO rompe ningún requisito escrito, y NO es bloqueante.** R12 define «mismo nombre» como
«coincide **una vez normalizado**», y las dos formas normalizadas coinciden: rechazar el segundo con
`work_group_duplicate_name` es **exactamente** lo que R12 manda, no una desviación. R13 se cumple
porque no hay segunda normalización; R14 se cumple porque el nombre que llega no está vacío.

Lo que sí es cierto es que el **operador** leerá «ese nombre ya existe» sobre dos nombres que en
pantalla se ven distintos, y eso nadie lo decidió. El implementer hizo lo correcto al **no inventarse**
la regla (`CLAUDE.md` regla 6) y al dejarlo anotado. Queda como **menor y material para el humano**
(menor-04): merece una fila de decisión antes de QC-85, porque es la pantalla la que tendrá que
enseñar ese mensaje.

---

## 6. Hallazgos

### Bloqueantes
**Ninguno.**

### Mayores
**Ninguno.** Ninguna de las 18 decisiones cerradas quedó implementada a medias: se recorrieron las 18
contra sus requisitos y contra el código, y las que el humano marcó como caras —la 3 (los dos
precios), la 5 (el duplicado oculto), la 9 (el cruce con QC-86) y la 18 (la paginación de miembros)—
están cerradas **con test que cae al mutar**.

### Menores

**menor-01 — un comentario promete una garantía que el código no da.**
`domain/add-work-group-member.ts` L41-44 afirma que «si mañana el catálogo de estados de cuenta
creciera, esta función **no compilaría** en vez de clasificar en silencio el estado nuevo como “se
ve”». Es **falso**: el `switch` tiene `default: return null`, así que un quinto estado quedaría
clasificado **exactamente** como «se ve», en silencio, que es justo lo que el comentario dice que no
puede pasar. El código es correcto hoy —los cuatro estados están cubiertos— y el requisito se cumple;
lo que sobra es la promesa. Si se quisiera la garantía de verdad habría que enumerar los cuatro casos
y quitar el `default`, pero eso es una decisión y no la impone ningún requisito. **Basta con corregir
el comentario.**

**menor-02 — el comentario del retensado dice «cinco archivos» y lista seis.**
`tests/unit/identity/account-status-scope.test.ts`, bloque de QC-84. Cosmético, pero es el comentario
que el próximo lector usará para entender la excepción.

**menor-03 — la bitácora cita un commit que ya no existe.**
`progress/impl_...md` § T17 dice «Commit `84c6a45`»; tras el `amend` de higiene el commit real es
`36d1970`. El propio archivo explica el amend más abajo, así que no hay ocultación, pero la
referencia no resuelve.

**menor-04 — el nombre normalizado vacío (§ 5.3).** No rompe requisito. **Material para el humano**
antes de QC-85: dos nombres visiblemente distintos pueden rechazarse como duplicados.

**menor-05 — la cobertura propia de R24, R25 y R27 es más fina que la del resto.**
R27 se apoya en `work-group-input.test.ts` (las dos listas blancas) y en la guardia ya existente
`guard-contrato-listados.test.ts`, que esta ficha **acertadamente no toca** porque no crea una séptima
copia del contrato; está razonado en `design.md > 2` y es legítimo. Se anota para que conste que ahí
la afirmación viene de la guardia compartida y no de un test propio de la ficha. Y en el recorrido de
páginas **contra Postgres** se afirma igualdad de **conjunto**, no la secuencia exacta; la secuencia y
el desempate los cierra el unitario con su contraprueba permanente.

---

## 7. Mutaciones probadas por el reviewer (6)

| # | Mutación | Archivo | Resultado |
| --- | --- | --- | --- |
| M1 | el filtro pasa a `candidate.accountStatus === 'active'` | `domain/list-work-group-members.ts` | **ROJO 5/8** (`members-filter`) |
| M2 | el total se cuenta antes de filtrar (`candidates.length`) | `domain/list-work-group-members.ts` | **ROJO 2/6** (`members-pagination`) |
| M3 | unificar dos de los cuatro `code` (`inactive` a `pending`) | `domain/add-work-group-member.ts` | **ROJO 2/6** (`add-member-errors`) |
| M4 | archivo nuevo **no listado** que nombra `accountStatus` | archivo creado y borrado en `domain/` | **ROJO 1** (`account-status-scope`: la igualdad sigue viva) |
| M5 | la baja del grupo anula el nombre congelado del pedido | `adapters/driven/persistence/work-group-prisma.ts` | **ROJO 3/5** (`work-group-assignments.int`) |
| M6 | `pending` deja de ocultar (`case 'pending': return null`) | `domain/add-work-group-member.ts` | **ROJO 9/14** (`add-member-errors` + `members-filter`) |

Todas revertidas. `git status --porcelain` **vacío** al terminar; `typecheck` y `lint` verdes después.

---

## 8. Veredicto

**OK — APROBADO.**

Sin bloqueantes y sin mayores. Los dos requisitos que el humano señaló como el corazón están
implementados **y caen al mutar**, comprobado por el reviewer y no por la bitácora. El cruce con
QC-86 muerde. El alcance es limpio: cero diff en `db/**`, `app/`, `components/`, `e2e/` y
`package.json`; quince permisos; ninguna dependencia. Las dos desviaciones del diseño son correctas,
y una de ellas era la única forma de **no** incumplirlo. El test ajeno se retensó nombrando la
excepción, sin relajar la igualdad, y el diff no esconde nada bajo el arreglo de CRLF.

Los cinco menores **no bloquean**. Recomendación para el leader: menor-01 y menor-02 son dos
comentarios y caben en un commit de higiene; **menor-04 conviene llevarlo al humano antes de QC-85**,
porque es la pantalla la que va a tener que enseñar ese mensaje.

Pendiente del leader, como marca `AGENTS.md`: **`./init.sh` completo antes del PR**.
