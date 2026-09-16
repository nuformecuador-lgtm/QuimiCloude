# QC-104 — sesion-una-sola-vez-por-peticion · revision (F2.2)

> Escrita por `reviewer` el 2026-09-16, en el worktree
> `.worktrees/QC-104-sesion-una-sola-vez-por-peticion`, rama
> `feature/QC-104-sesion-una-sola-vez-por-peticion`, HEAD `1bfeed3`.
> Verificacion propia: se corrieron los cuatro archivos de test de la ficha y se **repitio a mano
> la mutacion A** de T7 (con copia y restauracion). No se edito codigo de produccion; el arbol
> quedo limpio (`git status --porcelain` vacio).

## Veredicto

**RECHAZADO** — 1 hallazgo **mayor**, 5 **menores**.

Todo lo sustantivo del mecanismo esta bien hecho y bien probado. Lo que lo tumba es un **noveno
`currentActor`** que entro con la sincronizacion con `origin/dev` y que quedo **fuera** del cambio
y **fuera** del conteo del gate: R3 y R15 no se cumplen para esa Server Action.

---

## Checklist

### Especificacion
- [x] `specs/QC-104-.../requirements.md` con EARS numerados: **19 requisitos** (R1-R16, R20-R22);
      R17-R19 retirados en F1.4 y sus huecos **no** se reutilizan. Correcto.
- [x] `design.md` con alternativas descartadas y su porque (ocho, `> 7`).
- [x] `tasks.md` con **11 tasks todas marcadas** (T9 retirada, su numero no se reutiliza).
- [x] La tabla de decisiones se respeta: se leyo la ultima fila de cada par SUSTITUIDA. Sin
      tiempos, sin Supabase real, sin umbral y sin script de medicion en el repo (comprobado:
      el diff contra `origin/dev` no toca `scripts/`).

### Trazabilidad (regla 4)
- [x] El mapa de requisitos a tests existe en `progress/impl_QC-104-...md` seccion 6, con 19 filas.
- [ ] **18 de 19 requisitos con test que de verdad los verifica.** Se abrieron los tests uno a
      uno, sin fiarse del mapa:
  - **R1, R2** — `tests/unit/identity/session-once-per-request-render.test.tsx:321-326`: tres
    casos, `findActiveById` exactamente 1 por pantalla, con layout + pagina + secciones + las
    acciones del pintado. Muerde (verificado por mi con la mutacion A: 7, 7 y 12 lecturas).
  - **R3** — `tests/unit/identity/session-once-per-request-actions.test.ts:228-241`:
    `describe.each` de 8 acciones, 1 lectura por invocacion. **Cubre 8 de las 9 acciones que hoy
    resuelven las dos caras.** Ver el hallazgo mayor.
  - **R4** — `tests/unit/shared/request-scope.test.ts:212-232`: ambito explicito cerrado mas
    pintado posterior da 2 evaluaciones. Fija la opcion (a) de la Pregunta abierta 2 con claridad.
  - **R5** — `request-scope.test.ts:76-85` + RENDER `:330-335` + ACCIONES `:235-240`.
  - **R6** — `request-scope.test.ts:87-111`: dos ambitos simultaneos; el valor se fija **antes**
    del `await`, asi que el caso distingue de verdad (si compartieran, los valores coincidirian).
  - **R7** — `request-scope.test.ts:151-173` + ACCIONES `:260-267`.
  - **R8** — `e2e/session.spec.ts:351` (existente), caso de la ficha dada de baja que sale al
    login en una sola redireccion. Verificado que existe. Lo corre el leader.
  - **R9** — RENDER `:355-392` (1 consulta con la lectura rechazada) + SCOPE `:176-209` (la
    promesa rechazada se comparte, y el **ambito siguiente si reintenta**).
  - **R10** — RENDER `:385-391`: exactamente **una** linea `[session-check]`, filtrada por
    prefijo, con `waitFor` y reafirmacion posterior. No es silencio ni reintento.
  - **R11** — ACCIONES `:287-293` (`length === 0` en las dos) + `identity-facade.test.ts`
    (existente, paridad de `null`). Firma y casos de `null` intactos: el diff de
    `lib/composition/index.ts` solo sustituye el callee dentro de las mismas dos lambdas.
  - **R12** — RENDER `:338-352`: el id del usuario y el del contexto coinciden con **una** lectura.
  - **R13** — ACCIONES `:244-258` (la cookie nueva gana) + prueba de fuente `:270-285`
    (`login-action.ts` no contiene `runInRequestScope` ni `request-scope`).
  - **R14** — RENDER `:395-418`: espias sobre los cinco canales de `console`, en las tres
    pantallas, con un turno de gracia para el log tardio. Ninguna linea por peticion.
  - **R15** — los dos tests de conteo + T7. **Incompleto**: ver el hallazgo mayor.
  - **R16** — `tests/unit/identity/session-count-artifact.test.ts` sobre
    `progress/medicion_QC-104-...md`. Ver el juicio de credibilidad mas abajo.
  - **R20** — prueba de fuente `request-scope.test.ts:236-244` (solo `react` y
    `node:async_hooks`) + `guard-dependencias-aprobadas.test.ts`. `package.json` **sin cambios**.
  - **R21, R22** — tests existentes; los cuatro archivos citados existen en disco.

### Verificacion ejecutable
- [x] Corri yo los cuatro archivos: 4 archivos y **49 tests en verde**, 9,9 s.
- [x] **Repeti la mutacion A de T7 por mi cuenta** (las dos proyecciones vuelven a
      `resolveSession()` directo): 2 archivos rojos, **22 fallos y 6 verdes de 28**, exactamente
      lo que reporta la bitacora. Restaurado desde copia; `git diff` y `git status --porcelain`
      vacios. **El conteo muerde de verdad.**
- [x] El `--rapido` verde lo corrio el leader; el gate completo es suyo.

### Calidad, seguridad y arquitectura
- [x] **Sin modelo de datos**: el diff no toca `db/schema.prisma` ni `db/migrations/`. No aplica
      RLS, ni columna de empresa, ni rechazo cruzado, ni `down.sql`.
- [x] **Aislamiento por empresa**: no se anade ninguna consulta de operacion. `currentActor` sigue
      sacando `companyId` de `getSessionContext()` y el cambio no altera ese valor (R12 lo fija).
- [x] **Sin secretos, sin hardcode de contexto**, sin URLs ni credenciales nuevas.
- [x] **Sin dependencias**: `package.json` intacto; `react` es heredada y `node:async_hooks` es
      modulo de Node. No hay utilidad a mano que duplique una libreria del stack: el ambito por
      peticion no lo resuelve ninguna dependencia aprobada, y `design.md > 7.7` lo razona.
- [x] **Capas**: `lib/shared/request-scope.ts` no importa modulos ni `composition` (sigue siendo
      hoja); los adaptadores driving pueden importar `lib/shared/**`. Ningun `'use server'` nuevo
      reexportado. Sin logica de negocio en el helper.
- [x] **Multiplataforma**: no aplica. El diff no toca `app/` ni `components/`.
- [x] **Webhooks / idempotencia**: no aplica.
- [x] Convenciones: `kebab-case`, `camelCase`, sin `any`, sin `catch` vacio, nombres de test que
      describen comportamiento.

### Riesgo central: se puede filtrar el ambito entre peticiones?
Revisado camino por camino `lib/shared/request-scope.ts`, y no encontre ninguno:
- El unico estado de modulo es la instancia de `AsyncLocalStorage` y el `key: object` de cada
  funcion envuelta. **El `key` nunca guarda valor**: solo indexa dentro de un `Map` que ya es de
  la peticion. No hay ningun `Map` a nivel de modulo.
- `runInRequestScope` abre `explicitStorage.run(new Map(), fn)`: un `Map` **nuevo por
  invocacion**, que muere con `fn`. Dos invocaciones simultaneas no se ven (probado en
  `request-scope.test.ts:87-111`, con valores distintos por evaluacion).
- La deteccion del pintado (`request-scope.ts:48-58`) compara **dos llamadas a `renderStore()`
  por identidad**. Si React dejara de memoizar, los dos `Map` difieren y el helper **vuelve a
  leer**: falla hacia lo seguro, nunca hacia compartir. Ninguna rama devuelve un almacen que
  sobreviva a la peticion.
- No hay herencia de contexto ajena: `AsyncLocalStorage` solo propaga hacia dentro de su `run`, y
  `runInRequestScope` reutiliza un ambito activo **solo** si ya esta en su propio flujo.

Conclusion: R5, R6 y R7 estan bien resueltos y bien probados.

### El artefacto de medicion (R16) y su test (T10)
- El test **no es ceremonia pura, pero tampoco prueba las cifras**, y lo dice: exige las dos
  secciones, una fila por cada uno de los cuatro casos con antes y despues que casen con
  `^\d+$` (un guion, un vacio o un «pendiente» muerden), la ausencia de encabezados de tiempos y
  la presencia de la via y del marcador. Es lo que `design.md > 5.6` prometio, ni mas ni menos.
- **La tabla me resulta creible**, por razones concretas y no por confianza:
  - 7 / 6 / 7 en la columna «antes» encaja con H3 —3 lecturas directas mas las Server Actions del
    pintado— y no con la semilla («3»): el numero **contradice** la cifra comoda en vez de
    confirmarla.
  - 9 a 2 en el guardado es el patron de H2 (accion mas repintado), coherente con R4 provisional.
  - El control en reposo a **0** a los dos lados es lo que hace que el resto valga.
  - Las cifras crudas estan escritas (140/20, 120/20, 140/20, 27/3, 6/3) y dan enteros exactos.
- **Las cinco trampas del apartado 7 quedan evitadas por la metodologia final**, una a una:
  (1) piso de 12 s mas estabilidad por dos lecturas iguales, con el porque de que 3 s diera
  0,75-0,80 por peticion; (2) navegacion con navegador real, no `APIRequestContext`; (3) fixture
  con `sessionsValidFrom` en el pasado; (4) URL distinta por carga y **conteo de las peticiones de
  documento que llegan al servidor**; (5) nada de `networkidle`. Ademas la medicion aborta si una
  carga sirve el login, que es la comprobacion que impide medir la pantalla equivocada.
- **`log_statement` sigue en `none`**: la via denegada por el entorno no se rodeo, y la via (c) no
  modifica nada.
- La **Pregunta abierta 2 queda abierta**, como debe: el artefacto y la bitacora aportan el dato
  (guardado = 2) y dicen explicitamente que la decision es del humano. El codigo la fija con
  claridad suficiente para decidir: `request-scope.test.ts:212-232` es el caso que cambiaria de
  forma si el humano eligiera la opcion (b).

---

## Hallazgos

### MAYOR 1 — Hay un **noveno** `currentActor` con las dos caras de la sesion, sin ambito y sin conteo

**Archivo:** `lib/modules/identity/adapters/driving/session-actions.ts:78-89`
(`endAllSessionsAction`, QC-101).

```ts
async function currentActor(): Promise<Actor | null> {
  const [sessionUser, sessionContext] = await Promise.all([
    identity.getSessionUser(),
    identity.getSessionContext(),
  ]);
```

- Es un `Promise.all` de **las dos proyecciones**, igual que los 8 de T4, y **no esta envuelto** en
  `runInRequestScope`. Sin ambito de pintado —que es el caso de una accion invocada desde el
  navegador— eso son **dos** lecturas de la ficha por invocacion.
- **Se invoca desde el navegador**, que es exactamente el supuesto de R3:
  `app/(private)/configuracion/usuarios/components/end-user-sessions-dialog.tsx:83`
  (`useActionState(endAllSessionsAction, INITIAL_STATE)`).
- **Por que se colo, y por que no es un despiste del spec:** `design.md > 0` H4 hizo el grep el
  2026-09-15 y entonces habia 8. `session-actions.ts` **no existe en el merge-base `f777c56`** y
  **si existe en `origin/dev`**: entro con la sincronizacion `0d0e164`, *antes* de T4. La auditoria
  previa que pedia T4 se hizo contra la lista de 8 del design y no se volvio a grepear sobre el
  arbol ya mergeado. Hoy `identity.getSessionContext()` dentro de un `Promise.all` aparece en
  **9** archivos de `lib/modules/**/adapters/driving/`, no en 8.
- **Requisitos que incumple:**
  - **R3** (una Server Action que resuelve quien la pide DEBE leer como maximo UNA vez, aunque
    necesite a la vez el usuario y la empresa): `endAllSessionsAction` lee **dos**.
  - **R15** (el gate DEBE contener una comprobacion en **cada** Server Action que resuelve a la vez
    el usuario y la empresa): no la cubre.
- **Y el gate lo bendice en silencio**, que es lo que lo hace mayor y no menor:
  `tests/unit/identity/session-once-per-request-actions.test.ts:222-226` congela el numero con
  `expect(new Set(ACCIONES.map(...)).size).toBe(8)`. Ese caso se escribio justo para que un noveno
  `currentActor` no se colara sin cobertura, pero **cuenta las filas de su propia lista**, no los
  `currentActor` del arbol: con nueve en disco sigue verde. Como esta escrito, no detecta lo que
  promete detectar.
- **Efecto colateral en la documentacion:** el parrafo que T11 anadio a
  `docs/architecture.md:416-422` afirma que una guardia del gate falla si una pantalla o **una
  accion** supera **una** lectura de sesion por peticion. Con este archivo fuera, esa frase **hoy
  no es cierta**.

**Que falta para cumplirlo** (vuelve al implementer; no lo arreglo yo):

1. Envolver el `Promise.all` de `session-actions.ts:79-82` en `runInRequestScope`, identico a los
   otros 8 (un import y dos lineas).
2. Anadir su fila a `ACCIONES` en `session-once-per-request-actions.test.ts` (con
   `endAllSessionsAction` y un `FormData` con `id`), y subir el `toBe(8)` a `9`.
3. Mejor aun, y es lo que cierra el agujero de verdad: convertir ese caso en una **comprobacion
   sobre el arbol** —contar los archivos de `lib/modules/**/adapters/driving/` que hacen
   `Promise.all` de las dos proyecciones y exigir que todos esten en la lista—, para que el proximo
   `currentActor` que llegue por un merge no vuelva a entrar sin cobertura. Si se decide no
   hacerlo, que quede escrito el porque.
4. Rehacer el conteo en ejecucion de R16 **no hace falta**: el guardado medido (alta de unidad) no
   pasa por esta accion y sus cifras siguen valiendo.

### menor 1 — `docs/architecture.md:421` llama «guardia del gate» a lo que son tests de `tests/unit/`

Los dos tests de conteo viven en `tests/unit/identity/`, no en `tests/guards/`, y **no** los
selecciona `vitest run guard`: entran por el grafo de imports. Llamarlos guardia invita a creer
que estan cubiertos por el barrido que `docs/verification.md` describe para las guardias, que es
precisamente el que no depende de imports. Sugerencia: «un test del gate».

### menor 2 — El parrafo de T11 queda desfasado si alguien retira los tests de conteo

Lo que afirma la nota es una promesa sobre la **existencia de un test**, y nada en el gate la
sostiene: borrados los dos archivos de conteo, el documento seguiria afirmandolo y ninguna guardia
se pondria roja. El bloque 12 de `guard-arquitectura-modulos` lee el documento, pero no comprueba
esta frase. No es bloqueante —la frase es cierta hoy salvo por el MAYOR 1— pero es el tipo de nota
que envejece en silencio.

### menor 3 — Texto obsoleto dentro de la propia bitacora

`progress/impl_QC-104-...md:286` afirma **«Via de conteo: la (b) de `design.md > 6.1`»** bajo «Lo
que si quedo resuelto», cuando la via finalmente usada —y la unica que aparece en el artefacto— es
la **(c)**, `pg_stat_user_tables`. Es historial de un intento anterior que quedo sin marcar como
superado, en un archivo que se lee como estado final. Se contradice con
`progress/medicion_QC-104-...md:56-61`.

### menor 4 — El ambito envuelve solo el `Promise.all`, no la invocacion

`design.md > 2.6` y `> 8` lo declaran como riesgo aceptado: una segunda lectura de sesion dentro de
la misma accion, fuera de `currentActor`, no se memoizaria. Lo acepto tal cual —la alternativa 6
esta razonada y descartada— pero queda anotado porque el MAYOR 1 demuestra que la red que cubre ese
riesgo (la lista de `design.md > 5.3`) **no se mantiene sola**.

### menor 5 — El metodo de medicion es repetible como prosa, no como herramienta

El medidor vivio en el scratchpad y no queda en el repo (correcto: lo decidio F1.4). La
consecuencia es que repetir R16 exige volver a escribirlo siguiendo los apartados 5-8. Esta bien
documentado —las trampas son el verdadero valor del artefacto— y no pido cambiarlo; queda dicho
para quien lo retome.

---

## Lo que verifique y **no** es hallazgo

- **El merge con QC-81 esta intacto.** El diff contra `origin/dev` de
  `lib/modules/inventario/adapters/driving/product-actions.ts` contiene **solo** el import y el
  bloque de `currentActor`; `buildCreateProductCandidate` y todo lo demas de QC-81 no aparecen en
  el diff, o sea que estan tal cual llegaron de `dev`.
- **Los 8 archivos de T4 estan envueltos**, uno por uno y con el mismo cambio exacto (un import y
  el `Promise.all`, y solo el). Verificado en el diff completo.
- **El cableado de T3 son 8 lineas en dos bloques** y no reordena nada; `endSession` y
  `endOtherSessions` no pasan por la proyeccion memoizada.
- **Fallo cerrado**: no se convirtio en reintento (la promesa rechazada se comparte dentro del
  ambito y el ambito siguiente si reintenta) ni en silencio (una y solo una linea
  `[session-check]`, afirmada por prefijo).
- **El arbol quedo limpio** tras mi mutacion de verificacion.

---

## Checkpoints de `CHECKPOINTS.md`

| Bloque | Estado |
|---|---|
| Especificacion (3 archivos, tasks marcadas, alternativa descartada) | OK |
| Trazabilidad (requisito a test, mapa en `impl_`) | **FALLA**: R3 y R15 cubren 8 de 9 acciones |
| `typecheck` / `lint` / `pnpm test` | OK hasta donde corri; el gate completo es del leader |
| E2E en flujo critico (autenticacion) | OK: sin E2E nuevo por decision 11; `e2e/session.spec.ts` es la red y R8 tiene su caso |
| UI multiplataforma | No aplica (no toca `app/` ni `components/`) |
| Dependencias | OK: `package.json` sin cambios |
| Datos y seguridad (empresa, RLS, migraciones, secretos) | No aplica / OK |
| Modulos hexagonales (`lib/shared` hoja, sin ruta profunda, sin `'use server'` reexportado) | OK |
| Permisos (validacion en el service) | OK: el cambio no mueve ninguna frontera de autorizacion |
| Configuracion | OK |
| `./init.sh` verde, `review_` con veredicto OK, `history.md`, worktree | pendiente del leader; **este informe NO es OK** |

---

# Segunda vuelta — 2026-09-16, HEAD `7fb0abe`

> La primera vuelta queda arriba **sin tocar**. Esto se anade debajo.
> Verificacion propia de esta vuelta: corri los 4 archivos de la ficha y **monte yo mismo tres
> mutaciones** contra el caso nuevo (un decimo sintetico en un modulo cubierto, otro en un modulo
> nuevo y otro en una subcarpeta). El arbol quedo limpio: `git status --porcelain` vacio.

## Veredicto de la segunda vuelta

**APROBADO** — **0 mayores nuevos**, **2 menores nuevos** (6 y 7). El **MAYOR 1 queda CERRADO**.

## 1. El mayor: cerrado

`lib/modules/identity/adapters/driving/session-actions.ts:79-92` envuelve ahora el `Promise.all`
en `runInRequestScope`, **identico** a los otros ocho (un import y dos lineas; el comentario dice
ademas por que se colo). Sin efectos raros en esa accion:

- el ambito cubre **exactamente** el `Promise.all`, no el cuerpo de `endAllSessionsAction`, asi que
  la mutacion (`identity.endAllSessions`) queda **fuera** del ambito;
- este archivo **no emite ni borra la cookie de sesion** (no llama a `startSession` ni a
  `clearSession`), que es la unica condicion que `design.md > 2.7` pone para no abrir ambito;
- su fila esta en `ACCIONES` (`session-once-per-request-actions.test.ts:220-233`) con un `FormData`
  con `id`, y sus dos casos —1 lectura por invocacion, 2 con dos invocaciones— pasan.

**9 archivos con las dos caras / 9 con ambito**, contados por mi sobre el arbol: los unicos
`adapters/driving/` que usan las dos proyecciones son los 8 de T4 mas este.

## 2. El caso del arbol: **mira el disco de verdad**

`session-once-per-request-actions.test.ts:243-290`. `archivosConLasDosCaras()` hace
`readdirSync` mas `readFileSync` sobre `lib/modules/<modulo>/adapters/driving/` y recoge los
archivos cuya fuente contiene **las dos** proyecciones; los dos casos comparan ese resultado contra
`ACCIONES` (R15) y contra la presencia de `runInRequestScope` (R3). **No queda ningun numero
congelado**: no hay `toBe(9)` ni equivalente, asi que anadir una accion no obliga a tocar ningun
contador, y omitirla no pasa desapercibido.

**Lo verifique por mutacion, no por lectura.** Cree un **decimo sintetico** en un modulo cubierto,
`lib/modules/unidades/adapters/driving/qc104-rev-sintetico.ts`, con las dos caras y sin ambito:

```
AssertionError: hay 1 archivo(s) con las dos caras de la sesion fuera del conteo de R15:
  lib/modules/unidades/adapters/driving/qc104-rev-sintetico.ts. Anade su fila a ACCIONES.
AssertionError: hay 1 archivo(s) que resuelven las dos caras SIN ambito de peticion:
  lib/modules/unidades/adapters/driving/qc104-rev-sintetico.ts. Envuelve su Promise.all en runInRequestScope.
      Tests  2 failed | 22 skipped (24)
```

Los **dos** casos rojos, **nombrando el archivo** y diciendo que hacer. Borrado el sintetico,
`Tests 24 passed (24)`. Confirmado lo que dice la bitacora, y confirmado que la version anterior
(`toBe(8)`) habria seguido verde con ese archivo en disco.

## 3. Trazabilidad: 19/19

R3 y R15 vuelven a estar cubiertos, y ahora con mas red que antes de mi hallazgo: R3 suma el caso
del arbol (todo archivo con las dos caras abre ambito) y R15 el de la lista. El mapa de
`progress/impl_QC-104-...md` seccion 6 esta actualizado a las **9** acciones y remite a la seccion
10. Los 4 archivos de la ficha: **52 tests en verde**, corridos por mi.

## 4. Los menores de la primera vuelta

- **menor 1 — CERRADO.** `docs/architecture.md:420-425` ya no dice guardia: dice **tests del
  gate**, precisa que viven en `tests/unit/` y que **los selecciona el grafo de imports, no el
  barrido de guardias**, y corrige la frase sobre una accion que el mayor hacia falsa. Ademas ahora
  dice que la lista **no se escribe a mano**, que es lo que de verdad cambio.
- **menor 3 — CERRADO.** `progress/impl_QC-104-...md:286` marca ese bloque como historial del
  intento bloqueado y remite a la via **(c)**, la del artefacto.
- **menor 2 — me vale como ANOTADO sin cerrar.** Exigir esa frase pediria una guardia que lea
  `docs/architecture.md` y compruebe que los tests que promete existen; eso es una guardia nueva y
  es alcance de otra ficha, no de QC-104. Queda escrito en la bitacora (seccion 10), que es lo que
  pedia: que no desaparezca en silencio.
- **menor 4 y menor 5 — sin cambio, y correcto.** El 4 es riesgo ya aceptado en `design.md > 2.6`;
  lo que pedia mi nota era que la red no dependiera de una lista a mano, y eso es justo lo que
  arregla el caso del arbol. El 5 lo di por aceptable ya en la primera vuelta.

## 5. R16 no se rehizo — **confirmado**

Coincido y lo sostengo: el guardado medido es **un alta de unidad**, que pasa por
`unit-actions.ts`, no por `session-actions.ts`. Ninguna de las cuatro cifras del artefacto
(7/6/7 y 9 antes; 1/1/1 y 2 despues) se ve afectada por envolver `endAllSessionsAction`. El
artefacto y su test siguen valiendo tal cual.

## 6. Hallazgos nuevos

### menor 6 — El recorrido del arbol conserva una lista de modulos escrita a mano, y no baja a subcarpetas

**Archivo:** `tests/unit/identity/session-once-per-request-actions.test.ts:244` (la constante
`raices`) y `:251` (`readdirSync` de un solo nivel).

Las dos mutaciones que monte para probar el limite:

- un archivo con las dos caras y sin ambito en un modulo **nuevo**,
  `lib/modules/qc104probe/adapters/driving/probe-actions.ts` da `Tests 2 passed`: **invisible**;
- lo mismo en una **subcarpeta**, `lib/modules/unidades/adapters/driving/sub/deep-actions.ts`, da
  `Tests 2 passed`: **invisible**.

**Por que NO es bloqueante:** hoy no hay ningun requisito incumplido. Los modulos con
`adapters/driving/` son exactamente los **7** de la lista —`errores` y `observabilidad` no tienen
esa carpeta— y no existe ninguna subcarpeta dentro de ningun `driving/`. Ademas el vector que de
verdad mordio en esta ficha era **un archivo nuevo en un modulo existente**, y ese si queda
cubierto: es lo que demuestra la mutacion A.

**Por que lo dejo escrito igualmente:** la leccion del MAYOR 1 fue que una lista escrita a mano no
vigila el arbol, y aqui sobrevive una lista escrita a mano —la de modulos—. El dia que nazca un
modulo nuevo, el conteo lo ignorara sin decir nada. Arreglo barato para quien lo retome: derivar
`raices` de un `readdirSync` sobre `lib/modules` y recorrer `driving/` en profundidad. Tambien
valdria afirmar que `raices` coincide con los modulos que tienen esa carpeta, para que un modulo
nuevo ponga el caso en rojo y obligue a mirarlo.

### menor 7 — La nota de `docs/architecture.md` promete mas recorrido del que hace el test

**Archivo:** `docs/architecture.md:424`.

Dice que el test recorre `lib/modules/**/adapters/driving/**`. Los dos comodines prometen **todos**
los modulos y **subcarpetas incluidas**; el codigo recorre 7 raices fijas y un solo nivel
(menor 6). La diferencia es pequena y hoy no cambia nada, pero es el mismo tipo de frase que el
menor 1 vino a corregir: el documento afirmando un poco mas de lo que el test sostiene. Con el
arreglo del menor 6, la frase pasaria a ser cierta tal cual esta escrita.

## 7. Checkpoints revisados en esta vuelta

| Bloque | Estado |
|---|---|
| Trazabilidad (requisito a test) | **OK, 19/19**: R3 y R15 cubiertos, con el caso del arbol como red |
| Calidad de codigo (los 4 archivos de la ficha) | OK: 52 tests en verde, corridos por mi |
| Modulos hexagonales / capas | OK: el noveno adaptador driving importa `lib/shared/**`, que es lo permitido |
| Datos, seguridad, dependencias, UI | Sin cambios desde la primera vuelta; el diff de esta vuelta solo toca un adaptador, un test y dos documentos |
| `./init.sh` completo, `history.md`, worktree | del leader |

**Veredicto final de la ficha: APROBADO** (con los menores 2, 5, 6 y 7 anotados, ninguno
bloqueante).
