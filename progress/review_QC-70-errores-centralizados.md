# QC-70 — errores-centralizados · review

> Revisado el 2026-09-08 sobre `feature/QC-70-errores-centralizados`
> (worktree `.worktrees/QC-70-errores-centralizados`, HEAD `b03773a`, arbol limpio),
> rango `origin/dev...HEAD`. El gate completo lo corrio el leader (`exit 0`, `== init OK ==`,
> 3448 casos) y no se repite; aqui se corre lo necesario para verificar, **abriendo los tests
> y mutando el codigo**, no leyendo la bitacora.

## Veredicto

**OK.** Cero hallazgos mayores. Seis menores, ninguno bloqueante.

---

## Checklist de `CHECKPOINTS.md`

### Especificacion
- [x] `requirements.md` con 33 requisitos EARS numerados `R1..R33`, tres preguntas abiertas
      cerradas, tabla de decisiones intacta.
- [x] `design.md` con alternativas descartadas y su porque (seccion 2.3: cinco alternativas,
      entre ellas `lib/shared/errors/` y las librerias de i18n).
- [x] `tasks.md`: **16 de 16** marcadas `[x]`, cero `[ ]`.

### Trazabilidad
- [x] Cada `R1..R33` mapea a al menos un test concreto. Mapa en
      `progress/impl_QC-70-errores-centralizados.md`. **Verificado abriendo los tests**, no la
      tabla: ver seccion "Trazabilidad verificada".

### Calidad de codigo
- [x] `pnpm run typecheck` verde (corrido por mi).
- [x] `pnpm run lint` verde (corrido por mi).
- [x] Suites de los cinco modulos + UI + guardias, corridas por mi:
      162 archivos, 2067 casos verdes, 10 skipped.
- [x] E2E: **corrido por mi de verdad**, 2 passed (50.1s) en Chromium y WebKit.
- [x] UI multiplataforma: el diff de `app/**` y `components/**` no introduce `100vh`,
      `h-screen`, `:hover` como unica via, `font-size` bajo 16px ni target tactil pequeno
      (grep sobre las lineas anadidas: cero coincidencias). El cambio es de codigos y textos.
- [x] Dependencias: `package.json` y `pnpm-lock.yaml` con **diff vacio**. Ninguna fila nueva
      en `docs/dependencias.md` porque no hay dependencia nueva. La forma "preparada para
      traducir" es codigo -> clave -> texto, decision cerrada del humano del 2026-09-07 citada
      en `design.md > 6` y en la alternativa 5 de la seccion 2.3.

### Datos y seguridad
- [x] `db/` con diff **vacio**: sin modelo nuevo, sin migracion, sin seed. No aplica columna
      de empresa, ni RLS, ni `down.sql`.
- [x] Aislamiento por empresa intacto: los filtros de operacion no se tocan; los cortes que la
      ficha roza solo cambian de clase de error (`unidades/domain/update-unit.ts` y
      `delete-unit.ts`: `if (ownership.companyId !== actor.companyId) throw new UnitNotFoundError()`).
- [x] Permisos en el service sin cambio; R26 (contrato de QC-54) verificado con
      `guard-autorizacion-por-permiso.test.ts` verde y las suites de `actor.ts`.
- [x] Sin secretos, sin cliente de Supabase, sin webhooks.

### Modulos hexagonales
- [x] `lib/modules/errores/` tiene solo `index.ts` + `domain/`, y su `domain/` **no importa
      ningun paquete**: fijado ejecutablemente por `catalogo.test.ts > R5` (todos los
      especificadores empiezan por `./`).
- [x] Los cinco `domain/errors.ts` importan el **barrel** `@/lib/modules/errores`, nunca ruta
      profunda. `guard-arquitectura-modulos.test.ts` verde.
- [x] Ningun `'use server'` reexportado; `lib/composition` sin tocar.

### Verificacion final
- [x] `./init.sh` completo verde (leader). Lo verificado aqui encaja con ese resultado.
- [ ] `progress/history.md` y desmontaje del worktree: **pendientes del leader**, fuera del
      alcance del implementer y de esta review.

---

## Las tres capas del diagnostico (R28-R30): mutadas, las tres muerden

Es la propiedad de seguridad de la ficha. No basta con leerla: se rompio a proposito.

### Baseline

    $ pnpm exec vitest run tests/guards/guard-catalogo-de-errores.test.ts tests/unit/errores
       Test Files  3 passed (3)
            Tests  55 passed (55)

### Mutacion 1: anadir el campo a la forma serializada

`lib/modules/errores/domain/error-state.ts`: `type ErrorState` gana `diagnostic?: string`.

    FAIL  guard-catalogo-de-errores.test.ts > caso 8 - forma cerrada de ErrorState (R30)
          > el repositorio real: ErrorState declara exactamente status, code, message y reference
           Tests  1 failed | 30 passed (31)

La guardia lee la **declaracion del tipo** del fuente, asi que muerde el dia que alguien lo
declare, sin necesidad de que llegue a ejecutarse. Confirmado.

### Mutacion 2: meter un spread en el traductor

`return { ...error, status: 'error' as const, code: ..., message: ... }`.

    FAIL  guard-catalogo-de-errores.test.ts > caso 9 ... el traductor no usa spread
          + "lib/modules/errores/domain/error-state.ts: construye el estado con spread u
             Object.assign en vez de campo a campo (R29)"
    FAIL  to-error-state.test.ts > R11 - devuelve el estado con el codigo de la clase y el
          texto del catalogo
    FAIL  to-error-state.test.ts > R28, R29 - el espia recibe el diagnostico y el estado
          serializado no lo contiene
    FAIL  to-error-state.test.ts > R28, R29 - las claves del estado estan contenidas en los
          cuatro campos declarados
           Tests  4 failed | 36 passed (40)

Muerden **las dos capas**: la de forma (guardia) y la de comportamiento (`JSON.stringify` y
`Object.keys`). Confirmado.

### Mutacion 3: que un componente lea el diagnostico

Dos lineas anadidas al principio de `app/(private)/pedidos/components/order-form.tsx`.

    FAIL  guard-catalogo-de-errores.test.ts > caso 9 ...
          + "app/(private)/pedidos/components/order-form.tsx: lee el campo de diagnostico, que
             nunca cruza al navegador (R30)"
           Tests  1 failed | 30 passed (31)

Confirmado.

### Mutacion 4 (extra): abrir el catalogo cerrado (R2)

`export type ErrorCode = string;` en `error-codes.ts`:

    error TS2537: ... has no matching index signature for type 'string'   (error-catalog.ts)
    error TS7053  x2                                                      (error-message.ts)
    error TS2578: Unused '@ts-expect-error' directive  x3  (tests/unit/errores/catalogo.test.ts)

R2 no es decorativo: los tres `@ts-expect-error` del test son lo que lo prueba, y se ponen
rojos si el tipo deja de ser cerrado.

**Las cuatro mutaciones fueron revertidas; `git status` limpio.**

---

## El E2E (R33) y su condicion previa: verificado ejecutando

La condicion previa que `design.md > 6 ter` y T15 imponian (confirmar que el camino del fallo
es alcanzable **antes** de escribir el caso, y no inventar un `throw` en produccion) se
verifico de dos formas:

1. **Por codigo.** `EditarRecetaPage` -> `getRecipeAction(id)` (sin validar la forma del `id`)
   -> `recetas.getRecipe` -> `findAliveRecipeById` -> `prisma.recipe.findFirst({ where: { id } })`,
   y `Recipe.id` es `@db.Uuid`. `getRecipeAction` tiene `catch { return toErrorState(error) }`,
   asi que el `P2023` cae en el camino ajeno del traductor.
2. **Corriendolo.** `pnpm exec playwright test e2e/errores.spec.ts` da 2 passed (50.1s). En el
   log del webServer se ve el error **en el servidor** y solo ahi:
   `P2023 Inconsistent column data: Error creating UUID ... found 'q' at 1`, con su traza.
   La pagina se sirvio con 200, con el armazon privado en pie y el mensaje neutro del catalogo.

**No hay ningun `throw` artificial.** Revisado el diff de `app/**`, `components/**` y `lib/**`:
los throws anadidos son **renombres** de clases ya existentes (`NotFoundError` ->
`ProductNotFoundError`, etc.) mas los de `convert-quantity.ts`, que pasan el dato como
diagnostico. Ninguno es comportamiento nuevo.

El caso afirma de verdad: `response.status() === 200`, `private-content` visible,
`private-nav` presente, `recipe-list-error-message` igual a `errorMessage(UNEXPECTED_ERROR_CODE)`
(tomado del catalogo, nunca copiado a mano) y `page.content()` en minusculas sin `prisma`,
`inconsistent column data`, `error creating uuid`, `findfirst`, `uuid`, `recipe_lines` ni
`invalid character`. Se mira el documento entero, no el texto visible. Sobre `relation` y
`recipes`, ver menor-1.

---

## Los cinco tests del relanzado: nada se relajo

Leidos los diffs de las seis suites afectadas. Patron, identico en todas:

- Antes: `await expect(accion()).rejects.toThrow('fallo de infraestructura')`.
- Ahora: el estado devuelto es exactamente
  `{ status: 'error', code: 'unexpected', message: errorMessage('unexpected') }`, **mas**
  `JSON.stringify(resultado)` sin el texto interno, **mas** cada valor del estado sin el texto
  interno, **mas** `expect(log).toHaveBeenCalledWith({ code: 'unexpected', cause: ajeno })`.

Lo que el caso viejo fijaba (que el error no se traga en silencio) sigue fijado, ahora por el
espia del registro, que es mas preciso que un `rejects`; y se anade lo que la ficha estrena
(que el texto no cruza por **ningun** campo). Es **mas** fuerte, no menos.

Ademas, los siete adaptadores driving usan la fabrica (7 usos de
`createErrorStateTranslator` en `lib/`, uno por adaptador) y `order-actions.test.ts` lo fija a
nivel de fuente: `expect(source).toMatch(/const toErrorState = createErrorStateTranslator\(PedidosError\)/)`
y `not.toMatch(/function toErrorState\s*\(/)`. Los siete tienen su caso de error ajeno
(`supplier-actions.test.ts` cubre tambien `supplier-catalog-actions.ts`).

---

## Las cuatro decisiones que el implementer tomo sin el spec

**1. El censo de R32 del design contaba dos sitios y eran cuatro; corrigio los cuatro.**
**Correcto, no es salirse de alcance.** R32 es normativo y universal ("ninguna pantalla ... NO
DEBE sustituirlo"); `design.md > 6 bis` daba una lista *ilustrativa* de donde ocurria hoy.
Corregir solo dos habria dejado R32 incumplido con el spec en la mano. Los cuatro tienen test:
`supplier-page` (afirma `toHaveTextContent('MENSAJE-DEL-SERVIDOR-QUE-NADIE-INTERPRETA')`),
`catalog-line-sheet`, `inventario/product-page` (caso nuevo) y `recetas-ui/recipe-form`.

**2. `presentation-select.tsx` pierde la comparacion en vez de migrarla.**
**Correcto, sin perdida de cobertura observable.** El `if` de antes era
`setCreateError(code === 'duplicate_name' ? TEXTO_PROPIO : result.message)`: **las dos ramas
llamaban al mismo hueco**, asi que el codigo decidia el *texto*, no el sitio. Con R32 el texto
es siempre el del back y el `if` queda como rama muerta. El efecto observable (el error del
nombre repetido junto al campo, con `aria-invalid` y `aria-describedby`) lo fija el caso nuevo
de `tests/unit/inventario/product-page.test.tsx`. Ver menor-2 sobre el comentario.

**3. Retensado de `recipe-route-contract.test.ts`.**
**Correcto y verificado.** El archivo prescribe nombrar uno a uno cada cambio legitimo
posterior, y hay precedentes en el propio archivo (`AMPLIACION_RECETAS_QC34`,
`AUTORIZACION_POR_PERMISO_QC74`, `MIGRACION_QC34`); se siguio la misma forma con
`RENOMBRADO_DE_COMENTARIOS_QC70`. Se nombra **un solo** archivo, `recipe-prisma.ts`, y comprobe
su diff: **cero lineas de codigo**, dos comentarios que citaban `DuplicateNameError`, clase que
ya no existe. La alternativa (dejar el nombre de una clase muerta) es peor.

**4. Deuda sin ficha: `product-prisma.ts` traduce la violacion de FK del autor a
`ProductNotFoundError`.**
**Aceptable como deuda, no hallazgo bloqueante**, pero ver menor-4. Sigue literalmente la tabla
de `design.md > 4.1`; abrir un codigo para un caso que ninguna pantalla distingue habria sido
inventar (regla 6 de `CLAUDE.md`), y el detalle real va al log. Lo que falta no es codigo, es
que la deuda viva en un sitio mas duradero que la bitacora de la feature.

---

## El commit `d88c60b` (chore de arnes): ajeno a la ficha, y verificado aparte

Diagnostico correcto: dos centinelas de alcance de otras fichas miden `git diff origin/dev...HEAD`
sin comprobar que corren en su rama, asi que declaraban intocable para **todo el repo** lo que
solo lo es para su ficha. Precedente aplicado: `7cd478b`. Toca **solo dos archivos de test**;
ninguna linea de produccion.

**Lo critico, que sigan mordiendo, esta probado y no afirmado.** Las decisiones pasan a funciones
puras exportadas (`esLaRamaDeQC65`, `infraccionesDeAlcance`, `esRamaDeQC38`, `nuevosSpecsE2e`)
y cada una se ejercita con listas sinteticas **en los dos sentidos**:

- `esLaRamaDeQC65(RAMA_DE_QC65)` da `true`; con el diff real de QC-70 da `false`.
- Dentro de su rama, `infraccionesDeAlcance` muerde con `app/`, `components/`, `hooks/`,
  `middleware.ts` y un `adapters/driving/`; y **no** muerde con el alcance legitimo de QC-65
  (`ports/`, `domain/`, `db/schema.prisma`).
- `esRamaDeQC38` exige **los dos** archivos centrales; con la lista de QC-70 da `false`, y con
  `null` da `false`.
- `nuevosSpecsE2e` muerde con uno y con dos specs, y no muerde con `e2e/helpers/datos.ts`.

**El retensado de QC-38 era necesario, y comprobe por que**: QC-70 sustituye la copia de
`toErrorState` en **los siete** adaptadores driving, `unit-actions.ts` incluido, asi que el
centinela de un solo archivo se creia en la rama de QC-38. El segundo archivo,
`lib/modules/unidades/ports/unit-write-repository.ts`, es creacion propia de QC-38 y ninguna
ficha transversal tiene motivo para tocarlo. El retensado **estrecha** la deteccion de rama
(exige `every`, no `some`): no abre ningun agujero, lo cierra.

Los seis casos que enmudecen, con su motivo escrito (`--reporter=verbose`, corrido por mi):

| Archivo | Caso | Motivo impreso en el skip |
|---|---|---|
| `identity/account-status-scope` | R18, el diff no toca los dos archivos de QC-19 | "el rango trae archivos pero ninguno es `lib/modules/identity/domain/account-status.ts`: esta NO es la rama de QC-65 ... este caso NO ha comprobado nada." |
| `identity/account-status-scope` | R20, el diff no toca `app/`, `components/` ni `hooks/` | idem |
| `identity/account-status-scope` | R21, el diff no toca `package.json` ni el lock | idem |
| `unidades/unidades-convenciones` | R32, `db/schema.prisma` no cambia | "... pero ninguno es `unit-actions.ts` y `unit-write-repository.ts`: esta NO es la rama de QC-38 ... NO ha comprobado nada." |
| `unidades/unidades-convenciones` | R32, ninguna carpeta nueva bajo `db/migrations/` | idem |
| `unidades/unidades-convenciones` | R34, `e2e/` no gana ningun `.spec.ts` | idem, con el texto de R34 |

Ninguno queda **verde en falso**: los seis salen `skipped` con la frase "este caso NO ha
comprobado nada", que es lo que `docs/verification.md` exige frente a la validacion opcional.
Y no se toco `tests/baseline-rojos.json`, con el motivo escrito: apagar un archivo ahi lo apaga
entero y en todas las ramas.

---

## Alcance (punto 6): comprobado con el diff, no de palabra

    $ git diff origin/dev...HEAD -- db/ lib/modules/identity/ package.json pnpm-lock.yaml docs/dependencias.md
    (vacio)

Cero bytes. R25 cumplido en el diff, y ademas fijado por test (`catalogo.test.ts > R25`: ningun
codigo de `identity` en el catalogo, ni por lista cerrada ni por vocabulario, y el modulo
`errores` no nombra `lib/modules/identity`).

Ninguna dependencia nueva. El catalogo es una tupla `as const` y dos mapas con `satisfies`; la
preparacion para traducir es la indireccion codigo -> clave -> texto. No hay utilidad escrita a
mano que duplique una libreria del stack: la alternativa (i18next / next-intl) esta descartada
**por decision cerrada del humano**, no por criterio del agente, y con QC-72 abierta para ello.

---

## Trazabilidad verificada (R1-R33), abriendo los tests

| Req | Test | Verificado |
|---|---|---|
| R1 | catalogo.test.ts > R1 | 25 entradas, biyeccion codigo/clave/texto, errorMessage sobre los 25. |
| R2 | catalogo.test.ts > R2 | Tres @ts-expect-error; la MUTACION 4 confirma que se ponen rojos si el tipo se abre. |
| R3 | catalogo.test.ts > R3 | Forma en minusculas con guion bajo y no numerico, sobre los 25. |
| R4 | catalogo.test.ts > R4 + guard caso 6 | Sin textos repetidos; la funcion pura muerde con dos claves iguales. |
| R5 | catalogo.test.ts > R5 | Clave errors.<code> para los 25 Y ningun import que no empiece por punto-barra. |
| R6 | guard caso 4 (+ repo real) | Muerde con dos bases y con una clase que no deriva; el repo real limpio. |
| R7 | guard caso 3 (+ repo real) | Muerde con un constructor que admite message; limpio con constructor(diagnostic?). |
| R8 | guard caso 1 (+ repo real) | Muerde con un codigo declarado que no esta en el catalogo. |
| R9 | guard caso 5 (+ repo real) | Muerde con un codigo sin emisor; unexpected exento. |
| R10 | guard caso 2 + los 7 usos + aserto de fuente en order-actions.test.ts | Ver menor-6. |
| R11 | to-error-state.test.ts > R11 | Incluye el caso fuerte: un message manipulado NO cambia el estado. |
| R12 | to-error-state > R12,R13 + los 15 casos reescritos | Error, string suelto y undefined dan unexpected. |
| R13 | to-error-state > R12,R13 + E2E | orders, relation y line 42 fuera del serializado. |
| R14 | to-error-state > R14 | El espia recibe code unexpected y la causa una vez; sin diagnostico no se registra nada. |
| R15 | to-error-state > R15 | reference undefined en los dos caminos y ausente de Object.keys. |
| R16 | catalogo.test.ts > R16 + guard caso 7 | Ni codigos ni claves genericas. |
| R17 | catalogo.test.ts > R17 | Los siete casos de no existe. |
| R18 | catalogo.test.ts > R18 | Los cuatro casos de nombre repetido. |
| R19 | catalogo.test.ts > R19 | Los trece congelados. |
| R20 | guard caso 7 (barrido real de app y components) + 7 suites de UI | Grep propio de los dos genericos en app y components: cero. |
| R21 | cancel-order-dialog, order-form, delete-presentation-dialog | Los codigos fabricados salen del catalogo, con satisfies ErrorCode en catalog-line-form. |
| R22-R24 | guard casos 1, 2, 3 | Cada uno con caso que muerde y caso limpio, mas el repo real. |
| R25 | catalogo.test.ts > R25 + diff vacio | Verificado arriba. |
| R26 | guard-autorizacion-por-permiso + suites de actor.ts | Verdes sin tocar; la fabrica sigue recibiendo el UnauthorizedError del modulo. |
| R27 | 162 archivos / 2067 casos verdes (corridos por mi) + gate del leader | - |
| R28 | to-error-state > R28,R29; order-transitions.test.ts; convert-quantity.test.ts | El dato viaja como diagnostico, no como mensaje. |
| R29 | to-error-state > R28,R29 + guard caso 9 | MUTACIONES 2 y 3. |
| R30 | guard casos 8 y 9 | MUTACIONES 1, 2 y 3. |
| R31 | supplier-page, recipe-form, product-page | FORM_ERROR_MESSAGE y REASON_REQUIRED intactos. |
| R32 | Los cuatro sitios, con test | Ver decision 1. |
| R33 | e2e/errores.spec.ts | CORRIDO POR MI: 2 passed. |

Ningun requisito queda sin test, y ninguno de los tests que la tabla reclama resulto vacio.

---

## Hallazgos

### Mayores (bloqueantes): ninguno

### Menores

**menor-1. El E2E no comprueba `relation` ni el nombre de tabla `recipes`.**
`design.md > 6 ter` describe el paso (c) como "ni Prisma, ni Inconsistent column data, ni
findFirst, ni UUID, ni nombres de tabla, ni traza", y R13 nombra "nombres de tabla, SQL".
`FORBIDDEN_IN_HTML` incluye `recipe_lines` pero **no** `recipes`, y no incluye `relation`. El
implementer documento el motivo de `recipes` (decision 10 de la bitacora: aparece
legitimamente en rutas y en `data-testid`, y el criterio estricto obligaria a renombrar
testids); `relation` no esta justificado y es gratis, porque no aparece en la pagina ni en el
error real. No bloquea: el error que se provoca (P2023) no contiene ninguna de las dos
palabras, y el unitario de R13 si comprueba `relation` y `orders`.

**menor-2. Comentario desfasado en `components/shared/presentation-select.tsx`.**
El comentario nuevo termina con "Lo que sigue decidiendo el codigo es DONDE se pinta", pero
tras el cambio ya **no queda ninguna comparacion por codigo** en ese punto: el componente tiene
un solo hueco de error. La decision de perder la comparacion es correcta y no pierde cobertura;
lo que sobra es la frase, que describe algo que el archivo ya no hace. Un comentario que miente
envejece igual que el codigo, argumento que el propio implementer usa en el retensado de
`recipe-route-contract`.

**menor-3. El aviso del choque con QC-39 vive solo en archivos de QC-70.**
Esta bien redactado y es **correcto**: verifique contra `origin/dev` que
`app/(private)/configuracion/unidades/**` no existe, asi que el merge saldra limpio y el fallo
aparecera en pantalla y no en el gate. Pero QC-39 se esta implementando **ahora** en otro
worktree, y la unica salvaguarda es que el leader lea `design.md > 8` o la bitacora de QC-70 en
el momento del merge. **Recomendacion para el leader**, no para el implementer: anotarlo en
`progress/current.md > Deudas y cosas abiertas` y/o en el `tasks.md` de QC-39. Detalle menor: el
aviso habla de **dos** literales, pero las tasks de QC-39 nombran `duplicate_name` y no
`not_found`, asi que probablemente solo haya **uno** que actualizar. Avisar de mas es el lado
correcto en el que equivocarse.

**menor-4. La deuda de `product-prisma.ts` vive solo en la bitacora de la feature.**
La decision (traducir la violacion de FK del AUTOR a `ProductNotFoundError`, con un mensaje
inexacto para ese caso) es **aceptable**: sigue la tabla de `design.md > 4.1`, ninguna pantalla
distingue hoy los dos casos, y el detalle real va al log. Lo que falla es la durabilidad del
apunte: `progress/impl_*.md` se archiva con la feature. **Recomendacion:** una linea en
`progress/current.md > Deudas y cosas abiertas`, o ficha si el leader la quiere.

**menor-5. La deteccion de rama por archivo central es fragil por construccion.**
`esLaRamaDeQC65` y `esRamaDeQC38` identifican la rama por la presencia de sus archivos
centrales en el rango. El dia que una ficha transversal toque
`lib/modules/identity/domain/account-status.ts`, o los dos centinelas de QC-38 a la vez, el
centinela volvera a morder por trabajo ajeno. Es exactamente el coste que el precedente
`7cd478b` acepta, y QC-70 lo dejo por escrito junto con la salida limpia que el propio
`tests/baseline-rojos.json` ya nombra (que el caso del diff distinga "no hay rango" de "el rango
trae cosas de otra ficha"). **No es deuda de QC-70**; queda anotado para que el leader decida si
abre ficha para las dos que siguen sin arreglar (`recipe-route-contract` y
`recetas/module-contract`, las dos de QC-26 y apagadas enteras en el baseline).

**menor-6. R10 no tiene una comprobacion central de "los siete la usan".**
La guardia cubre la mitad negativa (nadie mas define un traductor) y las siete suites de
acciones cubren la positiva por comportamiento; solo `order-actions.ts` tiene ademas un aserto
de fuente. Si manana un adaptador dejara de usar la fabrica **sin** declarar una funcion propia,
la guardia no morderia y el rojo dependeria de la suite de su modulo. Hoy las siete la tienen,
asi que la cobertura es real; es simplemente el eslabon mas fino de la ficha. Un caso en la
guardia que exigiera a los siete adaptadores driving contener la llamada a la fabrica lo
cerraria en cinco lineas.

---

## Lo que corri, con su salida

    $ pnpm run typecheck                        -> verde, sin salida
    $ pnpm run lint                             -> verde, sin salida

    $ pnpm exec vitest run tests/guards/guard-catalogo-de-errores.test.ts tests/unit/errores
       Test Files  3 passed (3)          Tests  55 passed (55)

    $ pnpm exec vitest run tests/unit/inventario tests/unit/pedidos tests/unit/proveedores \
        tests/unit/recetas tests/unit/unidades tests/unit/errores tests/unit/pedidos-ui \
        tests/unit/proveedores-ui tests/unit/recetas-ui tests/unit/configuracion-ui tests/guards
       Test Files  162 passed (162)      Tests  2067 passed | 10 skipped (2077)

    $ pnpm exec vitest run tests/unit/unidades/unidades-convenciones.test.ts \
        tests/unit/identity/account-status-scope.test.ts --reporter=verbose
       Test Files  2 passed (2)          Tests  23 passed | 6 skipped (29)
       (los 6 skipped, con su motivo impreso, tabulados arriba)

    $ pnpm exec playwright test e2e/errores.spec.ts
       OK [chromium] ... (6.4s)
       OK [webkit]   ... (8.2s)
       2 passed (50.1s)
       [WebServer] P2023 Inconsistent column data: Error creating UUID ... (el detalle, SOLO en el log)

    $ git diff origin/dev...HEAD -- db/ lib/modules/identity/ package.json pnpm-lock.yaml docs/dependencias.md
       (vacio)

    Mutaciones 1-4: ver seccion de arriba. Las cuatro revertidas; git status limpio.

`tests/unit/navegacion/private-layout-menu.test.tsx` no se incluyo: es rojo AJENO y baselined
por `dev`, y su grafo de imports no contiene ningun archivo de QC-70.

---

## Veredicto final

**OK.** Cero mayores, seis menores. La ficha cumple los 33 requisitos, las 16 tasks estan
cerradas, la propiedad de seguridad central (el diagnostico no cruza al navegador) resiste las
tres mutaciones que el spec pedia probar, el E2E prueba lo que dice y su camino es real, el
alcance esta respetado byte a byte, y el chore de arnes de la rama es un arreglo correcto que
ESTRECHA las guardias ajenas en vez de apagarlas.
