# QC-71 — identificador-de-request · revision (F2.2)

> Revisado sobre el worktree `.worktrees/QC-71-identificador-de-request`, rama
> `feature/QC-71-identificador-de-request`, `afe9daf` (4 commits sobre `origin/dev` + `1feb02b`).
> Arbol limpio al empezar y al terminar. El reviewer no edito codigo: las dos mutaciones que se
> describen abajo se revirtieron y `git status --porcelain` quedo vacio.

## VEREDICTO: **RECHAZADO**

**2 hallazgos mayores, 4 menores.** Los dos mayores **no son fallos del implementer**: son dos
requisitos del `requirements.md` que el estado entregado **no cumple tal como estan escritos**, y
los dos necesitan que el humano decida (enmendar el requisito o ampliar el alcance). El codigo
entregado es de calidad alta: el gate esta verde, las mutaciones muerden de verdad y ninguna
guardia ajena se relajo.

---

## Checklist

### Especificacion
- [x] `requirements.md` con R1-R21 EARS numerados.
- [x] `design.md` con alternativas descartadas y su porque (1.a, 1.b, 2.a, 2.b).
- [x] `tasks.md` con las 11 tasks marcadas `[x]`.

### Trazabilidad
- [x] `progress/impl_QC-71-identificador-de-request.md` contiene el mapa `R<n> -> test`.
- [~] Cada `R<n>` mapea a un test concreto: **19 de 21 verificados abriendo el archivo y leyendo
      las aserciones**. R11 y R17 tienen test, pero el test **no cubre el requisito entero** (ver
      mayores 1 y 2).

### Calidad de codigo (corrido por el reviewer, no leido de la bitacora)
- [x] `./init.sh` completo: **exit 0**. `Test Files 302 passed (302)`, `Tests 3883 passed |
      18 skipped (3901)`, `0 rojos, todos en el baseline de 5`. **Los numeros que reporta la
      bitacora son exactos**, incluido el aviso de los 5 del baseline que ya pasan.
- [x] typecheck y lint verdes (dentro del gate).
- [x] UI: `docs/architecture.md > Regla: multiplataforma` - texto estatico, sin `100vh`, sin
      `:hover` como unica via, sin libreria nueva, sin target tactil nuevo. El `text-xs` del
      identificador **no** es un input, asi que la regla de `font-size >= 16px` no aplica.
- [x] Dependencias: `package.json` y `docs/dependencias.md` **sin un solo cambio** en el rango
      `1feb02b..HEAD` (verificado con `git diff --stat`). R20 ademas con guardia propia.

### Datos y seguridad
- [x] `db/`, `e2e/` y `middleware.ts` **sin un solo cambio** en el rango (verificado). Ningun
      modelo nuevo, ninguna migracion, ninguna columna: nada que exija columna de empresa ni RLS.
- [x] Ningun secreto hardcodeado. Ningun webhook nuevo.
- [x] Aislamiento por empresa: la ficha no toca consultas de datos de operacion.

### Modulos hexagonales
- [x] `observabilidad/domain/request-id.ts` no importa nada (verificado a ojo y por su test).
- [x] El traductor vive en `errores/domain/` y **no** importa `next/*`: la lectura de la cabecera
      entra como parametro y su implementacion vive en un driven, cableado en `lib/composition`.
      Ningun puerto nuevo. `guard-arquitectura-modulos` verde en el gate.
- [x] `middleware.ts` intacto; el contrato de raiz de QC-9 no se reabrio.

### Verificacion final
- [x] `./init.sh` termina en verde.
- [ ] Veredicto OK (es RECHAZADO).
- [ ] Entrada en `progress/history.md` (pendiente de cierre).
- [ ] Worktree desmontado (pendiente de cierre).

---

## Mapa `R<n> -> test` VERIFICADO ABRIENDO EL ARCHIVO

| R | Test y caso leido | Estado |
|---|---|---|
| R1 | `tests/unit/observabilidad/request-id.test.ts:52` "dos llamadas seguidas devuelven valores distintos" + `:59` "cien llamadas no repiten" + `tests/unit/identity/route-guard-request-id.test.ts:106` "dos invocaciones dan ids distintos" | OK |
| R2 | `request-id.test.ts:67` UUID v4 de 36 caracteres + `:82` el fuente no declara ningun `import`/`require`/`from` + `:93` **caso rojo** del detector | OK |
| R3 | `tests/guards/guard-middleware-edge.test.ts` - diff leido: **solo se anadio** `expect(files).toContain('lib/modules/observabilidad/domain/request-id.ts')`. `FORBIDDEN_PACKAGES` y `FORBIDDEN_INTERNAL_FILES` intactos | OK, endurecida |
| R4 | `route-guard-request-id.test.ts:85` la peticion reescrita lleva `x-request-id` (via `x-middleware-override-headers` + `x-middleware-request-x-request-id`) + `:96` no vacia las cabeceras (la cookie sigue) | OK |
| R5 | `:123` sustituye el `x-request-id` entrante + `:133` es `set` y no `append` (el nombre aparece una sola vez en la lista) | OK |
| R6 | `:149` `response.headers.get('x-request-id')` es `null`, sin `set-cookie` y sin cookies + `:159`/`:171` los dos redirects tampoco lo llevan ni reescriben la peticion | OK |
| R7 | `tests/unit/observabilidad/error-state.test.ts:99` el id resuelto es el de la cabecera y la linea dice `origen=borde` | OK |
| R8 | `:112` sin cabecera hay id y `origen=respaldo` + `:127` cabecera **vacia** cuenta como ausente + `:136` dos invocaciones sin cabecera no comparten id | OK |
| R9 | `tests/guards/guard-identificador-de-request.test.ts:362` barrido de `domain/`+`ports/` de los 6 modulos de negocio (con `expect(archivos.length).toBeGreaterThan(20)` para que el verde no sea vacio) + `:380` ningun puerto en los **8** + casos rojos `:467` y `:497` | OK, con lectura acotada (menor 1) |
| R10 | `error-state.test.ts:147` **un** `console.error`, formato completo de `design.md > 5`, con traza + `:168` un valor no-`Error` deja linea sin imprimir el valor | OK |
| R11 | `:181` camino feliz sin ninguna llamada a `console.*` + `:190` error del catalogo **sin diagnostico** sin ninguna llamada + `:206` el catalogado ni siquiera lee la cabecera | **PARCIAL - mayor 1** |
| R12 | `:217` la linea no contiene URL con parametros, ni `buscar=`, ni valor de formulario, y la primera linea encaja **entera** con el regex de formato | OK |
| R13 | `:237` el id de la linea y el `reference` del estado coinciden, con cabecera y sin ella. Mas la evidencia manual de T10 | OK |
| R14 | `:251` el estado inesperado son exactamente 4 campos; el serializado no contiene `orders`/`relation`/`line 42`/`stack`; y lo que si sale, sale por el log | OK |
| R15 | `:273` `Object.keys(state)` es `['status','code','message']` y el serializado no contiene `reference` ni el uuid del borde | OK |
| R16 | `tests/unit/observabilidad/error-state-types.test-d.ts` (lo compila `tsc`, no vitest) + `error-state-types.test.ts` (vigila por texto que el `.test-d.ts` no se borre) + **mutacion reproducida por el reviewer** (ver abajo) | OK |
| R17 | `tests/unit/shared-ui/unexpected-error-notice.test.tsx:55` el uuid esta en el DOM **como texto** (`getByText`) + `:65` con etiqueta + `:73` `select-all`/`break-all`. Mas un caso en 17 archivos de UI de pantalla | **PARCIAL - mayor 2** |
| R18 | `unexpected-error-notice.test.tsx:84` con el catalogado no hay testid de referencia, ni etiqueta, ni **ningun** uuid (regex en negativo sobre `container.textContent`) | OK |
| R19 | `guard-identificador-de-request.test.ts:341` lista cerrada de 22 migraciones + `db/schema.prisma` sin mencion, con sus rojos `:417`/`:428`. Confirmado ademas con `git diff --stat -- db/` vacio | OK |
| R20 | `:351` conteo 30/20 y ningun nombre con `uuid`/`nanoid`/`cuid`/`crypto`, con rojos `:436`/`:450` + `guard-dependencias-aprobadas.test.ts`. Confirmado con `git diff --stat -- package.json docs/dependencias.md` vacio | OK |
| R21 | `:334` lista cerrada de 13 `.spec.ts` en `e2e/` y existe el test del cruce, con rojos `:402`/`:412` + centinela de version de `next` `:327` con su rojo `:393`. Mas T10 | OK |

**19/21 verificados abriendo el test y leyendo las aserciones.** R11 y R17 tienen test, pero el
test cubre una version acotada del requisito, no el requisito escrito.

---

## Lo que el reviewer reprodujo por su cuenta

### 1. `./init.sh` completo - CONFIRMADO
Corrido por el reviewer sobre el arbol final. `Test Files 302 passed (302)`,
`Tests 3883 passed | 18 skipped (3901)`, `Duration 135.21s`, `0 rojos`, `== init OK ==`, exit 0.
**Los numeros de la bitacora son exactos**, incluida la lista de 5 del baseline que ya pasan.

### 2. R16 por mutacion, en los dos sentidos - CONFIRMADO
**(a) Quitando los dos `@ts-expect-error` del `.test-d.ts`** (afirmar que las formas prohibidas
compilan), `pnpm exec tsc --noEmit`:

    error-state-types.test-d.ts(29,14): error TS2322: Property 'reference' is missing ... but required
    error-state-types.test-d.ts(48,3):  error TS2353: Object literal may only specify known properties, and 'reference' does not exist

**(b) Reabriendo el tipo** a `{ status:'error'; code: ErrorCode; message: string; reference?: string }`:

    error-state-types.test-d.ts(28,1): error TS2578: Unused '@ts-expect-error' directive.
    error-state-types.test-d.ts(47,3): error TS2578: Unused '@ts-expect-error' directive.
    error-state-types.test-d.ts(77,41): error TS2344 ...
    error-state-types.test-d.ts(78,59): error TS2344 ...
    error-state.test.ts(94,3): error TS2322: Type 'string | undefined' is not assignable to type 'string'.

Coincide con lo que la bitacora pego (salvo un desplazamiento de 1 linea por como se hizo la
mutacion). **R16 esta cerrado de verdad: las dos formas prohibidas rompen el typecheck y reabrir
el tipo tambien lo rompe.** Arbol restaurado tras cada mutacion.

### 3. La guardia del catalogo de QC-70 se ENDURECIO - CONFIRMADO
Leido el diff de `tests/guards/guard-catalogo-de-errores.test.ts` (caso 8). `ERROR_STATE_FIELDS`
sigue siendo `['status','code','message','reference']`, el parser pasa de un cuerpo plano a leer
ramas de la union, y **gana dos exigencias nuevas**, cada una con su caso rojo: `reference` solo
en la rama del codigo generico (R15) y `reference` **no opcional** (R16). Los fixtures cambiaron
a la forma nueva y la de QC-70 quedo **como caso rojo**. No se relajo nada.

### 4. La sonda de T10 no quedo en el arbol - CONFIRMADO
Busqueda de `qc71`, `data-qc71` y `QC-71 T10` sobre `app/`, `components/` y `lib/`: cero
resultados. `git status --porcelain` vacio. La evidencia de la bitacora es coherente: el uuid de
las dos cadenas es el mismo (`75919411-5818-4a1b-9886-7c8b7ebdd491`), la linea dice
`origen=borde`, la version `16.3.0` cuadra con `VERSION_DE_NEXT_VERIFICADA` de la guardia, y el
`curl -D -` sin `x-request-id` es coherente con lo que afirma el test de R6. No se re-ejecuto el
build; se verifico que la sonda no quedo y que la evidencia no se contradice.

### 5. `d9fe0ed` mezcla tanda A y B - NO ES UN PROBLEMA
Lo que importa es el estado final, y el reviewer lo verifico el mismo: gate completo verde y las
mutaciones de R16 reproducidas sobre el arbol de `afe9daf`. El orden de los commits es materia de
bitacora, no de correccion. Queda anotado porque esta bien que este escrito.

---

## Hallazgos MAYORES

### MAYOR 1 - R11 no se cumple como esta escrito, y **choca de verdad con R28/R29 de QC-70**
**El choque es real. Verificado leyendo las dos fuentes, no dado por bueno.**

- **R11 (QC-71):** "MIENTRAS una peticion no produzca un error inesperado, el sistema NO DEBE
  escribir ninguna linea de log por ella: ni al entrar, ni al salir, **ni al traducir un error que
  si esta en el catalogo**."
- **R29 (QC-70)**, `specs/QC-70-errores-centralizados/requirements.md:167`: "CUANDO el sistema
  entrega un error al registro del servidor, DEBE escribir el codigo y el campo de diagnostico".
  Su test lo exige: `tests/unit/errores/to-error-state.test.ts:172` ("R28, R29 - el diagnostico va
  al log y NUNCA al estado").
- El codigo entregado (`lib/modules/errores/domain/error-state.ts:149-153`) **si escribe** una
  linea para el error catalogado que trae `diagnostic`.

**Los dos requisitos no pueden ser ciertos a la vez.** Uno de los dos esta mal escrito.

**La salida elegida por el implementer es la correcta**, y el reviewer la suscribe: el camino
catalogado no produce **ninguna** linea de QC-71 - no resuelve identificador, no lee la cabecera,
no lleva `reference` - y la linea de diagnostico de QC-70 queda intacta. La alternativa era borrar
una funcion de QC-70 y aflojar su test, que es exactamente lo que el arnes prohibe. El comentario
en `error-state.ts:150-152` lo deja escrito en el sitio donde se lee.

**Por que sigue siendo bloqueante:** porque el test de R11 esta escrito como "un error DEL CATALOGO
**(sin diagnostico)** no escribe ninguna linea". El parentesis es el requisito acotandose a si
mismo. Con R11 tal como esta hoy en `requirements.md`, la ficha no lo cumple.

**Lo que falta para cumplirlo: una decision del humano**, no un parche.
- **Opcion A (recomendada):** enmendar R11 en `requirements.md` a "...ni al traducir un error que
  si esta en el catalogo, **salvo la linea de diagnostico que R28/R29 de QC-70 ya exige**", y
  ajustar la fila de trazabilidad. Cero cambios de codigo.
- **Opcion B:** mantener R11 literal, lo que implica borrar la linea de diagnostico de QC-70 y su
  caso de test. Reabre una decision cerrada de otra ficha.

### MAYOR 2 - R17 no se cumple en cinco superficies, y el fallo es **mudo** (la historia de QC-70, otra vez)
Buscado activamente, y **esta**. R17 no distingue superficies: "CUANDO una pantalla recibe el
error inesperado, DEBE mostrar el identificador junto al mensaje neutro". Hay cinco sitios donde
un `ErrorState` con el codigo generico llega y **el `reference` se tira por el camino**, aplanado a
`string`:

| Archivo | Linea | Que pasa |
|---|---|---|
| `app/(private)/pedidos/components/order-form.tsx` | `:354` | `setIngredientsError(result.message)` sobre un `useState<string \| null>` (`:338`). La tabla de ingredientes recibe `error: string \| null` (`order-ingredients-table.tsx:81`) |
| `app/(private)/inventario/components/product-name-picker.tsx` | `:93-94` | `if (result.status === 'error') throw new Error(result.message)` - el `ErrorState` muere ahi; luego `:147` pinta `loadError.cause.message` |
| `recipe-picker`, `product-picker`, `components/shared/presentation-select.tsx` | - | mismo patron, canal `error` de `AsyncAutocomplete` tipado `string` |

**Esto es exactamente el modo de fallo que cerro QC-70**, solo que por el otro lado: alli era un
`Record<string, ...>` abierto; aqui es un canal de error tipado `string`. El tipo cerrado de R16
protege las 22 superficies que consumen `ErrorState` entero - y ahi funciona, el compilador delato
3 `page.tsx` -, **pero no protege el borde donde alguien escribe `.message` y tira el resto**. Nada
da rojo, ningun test lo nota, y no hay guardia que impida que la superficie 23 lo repita.

**El implementer lo reporto** (bitacora, "Abiertas" 4) y lo excluyo con un criterio explicito
("componentes que pintan region de error"). El reviewer **no acepta que sea alcance de otra
ficha**, por dos motivos concretos:

1. `product-name-picker.tsx`, `recipe-picker`, `product-picker` y `order-form.tsx` **estan dentro
   de la lista de archivos declarada** por `tasks.md > Archivos` punto 7
   (`app/(private)/**/components/**`), y `order-form.tsx` ademas **ya se toco** en esta ficha. La
   exclusion es un criterio del implementer, no una exclusion del spec.
2. La ficha se cierra **sin ninguna defensa** contra el aplanado a `string`. Lo unico que hoy
   impide que R17 se pierda en la proxima pantalla es la disciplina - y `progress/history.md >
   QC-70` dejo escrito literalmente que "la defensa contra un renombrado no es la disciplina, es
   el tipo cerrado".

**Lo que falta para cumplirlo** (basta una de las dos, y la decide el humano):
- **Opcion A:** llevar `ErrorState` a esas cinco superficies (cambia el contrato `error` de
  `AsyncAutocomplete`, que **no** esta en la lista de archivos, asi que **necesita el visto bueno
  del humano para ampliar el alcance**), con su caso de test por superficie.
- **Opcion B:** acotar R17 por escrito en `requirements.md` ("las superficies que pintan la region
  de error de la pantalla"), **y** anadir a `tests/guards/guard-identificador-de-request.test.ts`
  una comprobacion que liste de forma **cerrada** las superficies que aplanan un `ErrorState` a
  `string`, para que la numero seis se ponga roja. Sin esa guardia, la Opcion B deja el agujero
  abierto y mudo.

---

## Hallazgos MENORES

1. **La lectura acotada de R9 es defendible, pero deja R9 con menos dientes de los que dice.**
   Literal, R9 prohibe el identificador en `lib/modules/*/domain/**`; el propio `design.md > 1` lo
   coloca en `observabilidad/domain/request-id.ts` y el traductor vive en `errores/domain/`. O sea
   que **R9 literal prohibe el diseno que el propio spec aprobo**: es un defecto de redaccion de
   R9, no del implementer. La guardia barre los 6 modulos de negocio y deja fuera a `errores` y
   `observabilidad`, que son sus dos duenos. **Esa lectura respeta lo que R9 protege y no lo
   vacia de contenido**: el barrido cubre 4 terminos sobre `domain/` **y** `ports/` de los seis,
   tiene su caso rojo con las cuatro formas, incluye un `expect(archivos.length)
   .toBeGreaterThan(20)` para que el verde no pueda ser vacio, y la mitad literal de R9 - "ningun
   puerto nuevo" - se comprueba sobre **los ocho** modulos. Recomendacion: reescribir R9 nombrando
   los dos modulos duenos, para que la guardia y el requisito digan lo mismo.
2. **El campo se llama `reference`, no `requestId`.** Correcto: es el hueco que QC-70 dejo
   nombrado y que su guardia fija por texto. `design.md > 4` autorizaba fijar los nombres en T1.
   Solo conviene que `requirements.md` deje de decir "identificador" a secas en R13/R16 cuando el
   simbolo real es `reference`.
3. **`route-guard-middleware.ts` sigue escribiendo un `console.warn` por peticion con cookie
   ilegible** (funcion `readSession`). Es de QC-9, no de QC-71, y no lleva identificador - pero
   contra la letra de R11 ("ni al entrar") es una linea de log por una peticion que no produjo
   error inesperado. Anotado para que no sorprenda; no se pide tocarlo aqui.
4. **El caso de R11 "el camino feliz no escribe ninguna linea" es casi vacuo**: solo construye el
   traductor y nunca lo invoca (`error-state.test.ts:181`). Lo que de verdad prueba R11 son los
   otros dos casos del mismo `describe`. No resta, pero tampoco suma.

---

## Lo que necesita al humano, en una linea cada uno

1. **MAYOR 1 - R11 vs R28/R29 de QC-70.** Decidir Opcion A (enmendar R11, cero codigo) u Opcion B
   (borrar la linea de diagnostico de QC-70). El reviewer recomienda **A**.
2. **MAYOR 2 - R17 en las cinco superficies de canal `string`.** Decidir Opcion A (ampliar el
   alcance a `AsyncAutocomplete`) u Opcion B (acotar R17 **y** anadir la guardia de superficies
   aplanadas). El reviewer recomienda **B con la guardia**, porque sin ella el agujero queda mudo.
3. **MENOR 1 - R9.** Reescribirlo nombrando a `errores` y `observabilidad` como duenos, para que
   requisito y guardia digan lo mismo.

Ninguno de los tres es un defecto de implementacion. Lo implementado es solido: el id nace sin
importar nada, viaja en la cabecera de **peticion**, no vuelve al navegador, se resuelve en el
unico punto que traduce errores, deja **una** linea sin PII, y el tipo cerrado convierte en error
de compilacion los dos olvidos que importan. Lo que falla es el contrato escrito, en dos sitios.
