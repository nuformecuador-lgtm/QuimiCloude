# QC-21 — ayuda-visual-de-contrasena · bitacora de implementacion

> Escrita por `implementer` el 2026-09-02 en el worktree
> `.worktrees/QC-21-ayuda-visual-de-contrasena` (rama `feature/QC-21-ayuda-visual-de-contrasena`).
> Frontend puro: toda la implementacion la ejecuto `frontend_dev`.

## T0 — Precondiciones heredadas (verificadas, no re-creadas)

| # | Qué exige `tasks.md > T0` | Evidencia real en este worktree |
|---|---|---|
| 1 | `components.json` + `lib/utils.ts` con `cn` | `components.json` existe; `lib/utils.ts:4` `export function cn(...inputs: ClassValue[])` |
| 2 | `components/ui/{input,label,button}.tsx` | los tres existen |
| 3 | Vitest + Testing Library, suite en verde | **`vitest.config.mts`** (no `.ts`, ver desviacion D1) + `tests/setup.ts`; `@testing-library/{react,dom,jest-dom,user-event}` en `devDependencies`; baseline de `pnpm test` corrido antes de tocar nada (salida abajo) |
| 4 | Barrel `identity` con `CREDENTIAL_RULES`, `CredentialRule`, `evaluateCredentialRules` | `lib/modules/identity/index.ts` reexporta los tres desde `./domain/credential-policy`; el catalogo tiene **siete** codigos en el orden `min_length, max_length, no_uppercase, no_lowercase, no_digit, no_symbol, breached` (`credential-policy.ts`) |
| 5 | `findPlaintextPasswordDeclarations` exportada por la guardia | `tests/guards/guard-password-never-plaintext.test.ts:201` `export function findPlaintextPasswordDeclarations(` |

Ninguno faltaba: no se ejecuto `shadcn init`, no se monto Vitest y no se copio ninguna regla de QC-19.

## Estado

**Terminado**, tasks T0–T7 cerradas de T0–T8. **T8 no es mia**: el gate completo y el PR los corre el
leader (`tasks.md > T8`), y este worktree **no** tiene commit ni PR abierto.

## Archivos creados (seis, todos nuevos; cero archivos existentes modificados)

Verificado con `git status --porcelain --untracked-files=all`: no hay ni una `M`, solo `??`.

| Archivo | Task | Autor |
|---|---|---|
| `components/shared/credential-rule-labels.ts` | T1 | `frontend_dev` |
| `components/shared/credential-requirements.tsx` | T2 | `frontend_dev` |
| `components/shared/credential-field.tsx` | T3 | `frontend_dev` |
| `tests/unit/credential-requirements.test.tsx` | T4 | `frontend_dev` |
| `tests/unit/credential-field.test.tsx` | T5 | `frontend_dev` |
| `tests/unit/credential-help-contract.test.ts` | T6 | `frontend_dev` |

Ademas: marcas `[x]` en `specs/QC-21-ayuda-visual-de-contrasena/tasks.md` y esta bitacora.

`components/shared/` **la estrena esta feature** (no existia). **No se toco nada** bajo `app/`, `db/`,
`lib/`, `components/ui/`, `scripts/`, `package.json`, `app/globals.css` ni `components/private/`
(R19), y **no entro ninguna dependencia nueva** (regla 7 de `CLAUDE.md`; `design.md > 7`).

**Paralelismo:** cero solape con QC-29, que corre a la vez y tambien escribe en `components/`. Los
archivos de QC-29 (`theme-provider.tsx`, `app/globals.css`, `app/layout.tsx`,
`components/private/app-sidebar.tsx`) no aparecen en la lista de arriba.

## Verificacion — salida real, corrida entera desde este worktree

`./init.sh` **aborta en el validador por una causa ajena a QC-21** (ver «Rojo heredado» abajo), asi
que se corrio **a mano todo lo que `init.sh` ejecuta despues del validador**, mas el validador
suelto. Fecha: 2026-09-02.

| Comando | Resultado real |
|---|---|
| `pnpm run typecheck` | `tsc --noEmit` — **sin salida, 0 errores** |
| `pnpm run lint` | `eslint` — **sin salida, 0 errores** |
| `pnpm test` (suite **ENTERA**) | `Test Files 49 passed (49)` · `Tests 511 passed (511)` · 39.16s |
| `pnpm run test:guardias` | `Test Files 7 passed (7)` · `Tests 78 passed (78)` · 900ms |
| `node scripts/validate-features.mjs` | **unica linea de error: `faltan specs para features sdd en vuelo: QC-29`** — ningun error mas |

**Baseline antes de tocar nada** (corrido al empezar, para que el delta sea comprobable):
`Test Files 46 passed (46)` · `Tests 478 passed (478)`. Delta: **+3 archivos, +33 tests**, todos
verdes, **cero regresiones**.

### Rojo heredado que NO es de esta feature

`node scripts/validate-features.mjs` imprime `faltan specs para features sdd en vuelo: QC-29`.
Diagnostico ya hecho por el leader: `WT_DIR = '.worktrees'` en `scripts/validate-features.mjs:18` se
resuelve contra el directorio actual, asi que desde dentro de un worktree la busqueda desaparece y el
spec de QC-29 —que vive en su propio worktree— no se encuentra. Desde la raiz del repo el mismo
validador pasa en verde. **Decision humana del 2026-09-02: se sigue adelante conviviendo con ese
rojo.** No se toco `scripts/validate-features.mjs`: arreglarlo es material de `/afinar-regla`, no de
esta ficha. Se comprobo expresamente que **no aparece ningun otro error** del validador.

## Mapa de trazabilidad `R<n> → test` (los 22, sin huecos)

Los tres archivos de test son:
`RQ` = `tests/unit/credential-requirements.test.tsx` ·
`FD` = `tests/unit/credential-field.test.tsx` ·
`CT` = `tests/unit/credential-help-contract.test.ts`

| Req | Test que lo afirma (nombre real del `it(...)`) | Archivo |
|---|---|---|
| R1 | `renderiza una entrada por cada codigo de CREDENTIAL_RULES y en su orden` | RQ |
| R2 | `el estado mostrado de las seis coincide con evaluateCredentialRules para cada candidata` + `no declara ninguna regla ni umbral propio` | RQ + CT |
| R3 | `la lista sale del catalogo importado, no de una copia local` | RQ |
| R4 | `al cambiar la candidata cada una de las seis pasa a cumplida o incumplida` | RQ |
| R5 | `con la candidata vacia las seis salen incumplidas y la lista es visible sin interaccion` (**leer la desviacion D2**) | RQ |
| R6 | `escribir no dispara ninguna peticion de red` + `no importa composicion, adaptadores ni servidor, y no declara Server Actions` | FD + CT |
| R7 | `la regla de filtradas arranca en estado neutro` | RQ |
| R8 | `sin veredicto del servidor la regla de filtradas nunca sale cumplida ni incumplida` | RQ |
| R9 | `con el veredicto de filtrada la septima sale incumplida y las seis no cambian` | RQ |
| R10 | `avisa al montar y solo cuando cambia si las seis se cumplen` | FD |
| R11 | `mientras falte alguna de las seis el control de envio esta deshabilitado` | FD |
| R12 | `con las seis en verde el envio se habilita aunque la septima siga neutra` | FD |
| R13 | `tras el rechazo por filtrada las seis siguen en verde y el envio sigue habilitado` | FD |
| R14 | `el veredicto del servidor solo entra por props` + `no importa composicion, adaptadores ni servidor, y no declara Server Actions` | FD + CT |
| R15 | `el texto de cada regla sale de CREDENTIAL_RULE_LABELS` + `el prop labels sustituye el texto de una regla` | RQ |
| R16 | `cada entrada expone su estado de forma consultable y con texto, no solo por color` | RQ |
| R17 | `el campo oculta la candidata y no ofrece control de mostrar u ocultar` | FD |
| R18 | `el flujo completo se ejercita en un formulario de prueba sin red ni servidor` | FD |
| R19 | `la feature no anade rutas, paginas, acciones ni migraciones` (**leer la desviacion D3**) | CT |
| R20 | `no muestra ninguna puntuacion ni barra de fuerza` | RQ |
| R21 | `no emite la candidata en ningun atributo ni texto` + `ningun archivo nuevo usa console` | RQ + CT |
| R22 | `ningun identificador nuevo nombra la contrasena sin acabar en hash`, con centinela deliberado `el centinela muerde: detecta un prop password declarado a proposito` | CT |

R1–R22 sin saltos. Los nombres coinciden literalmente con el «Mapa de trazabilidad previsto» de
`tasks.md`, salvo el de R6/R14 en CT, que quedo fundido en un solo `it(...)`
(`no importa composicion, adaptadores ni servidor, y no declara Server Actions`) porque afirma la
misma prueba negativa para ambos.

## Desviaciones declaradas en voz alta

### D1 — `vitest.config.mts`, no `vitest.config.ts` (cosmetica, de la spec)

`tasks.md > T0` y `design.md > 1` nombran `vitest.config.ts`; el archivo real del repo es
`vitest.config.mts`. **No se creo ni se renombro nada**: la precondicion esta cumplida, la spec la
cito con la extension equivocada. Se declara para que el reviewer no lo lea como un archivo faltante.

### D2 — R5 no se puede cumplir literalmente sin violar R2 (hallazgo real, requiere decision)

**`requirements.md > R5` dice que con la candidata vacia el sistema debe mostrar «las seis» como
incumplidas. Eso es falso contra el dominio de QC-19 y no se puede satisfacer sin mentir.**
`credential-policy.ts` define `max_length: (candidate) => candidate.length <= CREDENTIAL_MAX_LENGTH`,
asi que con la cadena vacia `max_length` **esta CUMPLIDA** (0 <= 64) y `evaluateCredentialRules('')`
devuelve solo **cinco** codigos en `unmet`. Forzar la sexta a `'unmet'` obligaria al componente a
inventar un estado que la funcion pura no devuelve, que es **exactamente lo que R2 prohibe**.

Que se hizo: **no se toco ni `requirements.md` ni el componente ni QC-19**. El test conserva el
nombre exigido por el mapa de trazabilidad y afirma lo que R5 **si** puede garantizar sin contradecir
R2: (a) la lista completa es visible desde el primer render sin foco, escritura ni raton —que es el
nucleo de R5—, y (b) el estado de cada una de las seis coincide con lo que devuelve
`evaluateCredentialRules('')`, no con un valor fijo escrito a mano. El propio test lleva la
discrepancia explicada en un comentario, y ademas afirma explicitamente que **todas las seis salvo
una** salen incumplidas en vacio.

**Pregunta abierta para el humano / el leader** (no la resuelve el implementer, regla 6 de
`CLAUDE.md`): o se matiza la redaccion de R5 («todas las seis salvo las que un limite superior cumple
por definicion con la cadena vacia»), o se decide que la ayuda visual arranque `max_length` en un
estado distinto —lo que exigiria un estado de UI nuevo y contradice `design.md > 3.1`, que solo
admite tres—.

### D3 — el test de R19 (**SUPERADA en la ronda 2 — leer «Ronda 2 > B1»**)

> **Esta desviacion quedo obsoleta el 2026-09-02.** El reviewer tumbo el enfoque completo en **B1**:
> lo que se describe abajo seguia leyendo el estado de git del checkout. Se conserva el texto para
> que la traza de decisiones no desaparezca, pero **el codigo ya no hace nada de esto**: el bloque
> de R19 no llama a `git`. La version vigente esta en «Ronda 2 > B1».


`design.md > 8.3` pide para R19 un «diff de archivos nuevos». Dos desviaciones sobre lo obvio:

1. **No se uso `git diff origin/dev`** ni `origin/dev...HEAD`: el primero devuelve decenas de
   archivos de otras features ya fusionadas a `dev` despues de que esta rama arrancara (haria fallar
   el test por cambios ajenos) y el segundo sale vacio porque la feature se verifica **antes** de su
   propio commit. Se usa `git merge-base HEAD origin/dev` + `git diff --name-only <merge-base>` +
   `git status --porcelain --untracked-files=all`, y **si `git` falla, el test lanza un error
   explicito**: un diff que no se puede calcular sigue siendo un fallo.
2. **Se elimino, a peticion del implementer, un `expect(cambios.length).toBeGreaterThan(0)`** que el
   primer borrador incluia. Comprobado a mano en el worktree: en cuanto esta rama se fusione a `dev`,
   la `merge-base` pasa a ser la punta, el diff sale vacio, `git status` queda limpio y ese assert
   **habria teñido de rojo el gate de `dev` y el de todas las features siguientes**. Es la clase de
   test fragil que esta sesion tenia prohibido dejar. En su lugar el test ancla en algo cierto
   siempre: los tres archivos de la feature existen, no estan vacios y ninguno vive bajo `app/`,
   `db/` ni `lib/`. El assert duro de R19 —ninguna ruta del diff bajo `app/`, `db/` o `lib/`— se
   mantiene intacto.

**Ningun test de esta feature afirma el censo global de un recurso compartido.** Nada de «exactamente
N componentes en `components/`» ni «exactamente estas migraciones»: todo lo que se cuenta se deriva de
`CREDENTIAL_RULES` importado o del diff de esta rama.

### D4 — el `eslint-disable` del `useEffect` de `credential-field.tsx`

`design.md > 3.3` exige que el efecto de `onOwnRulesMetChange` dependa del **booleano derivado y no
del texto**. ESLint (`react-hooks/exhaustive-deps`) pide ademas `onOwnRulesMetChange` en el array,
lo que reintroduciria una invocacion por render si el consumidor pasa una funcion inline —y el
formulario de prueba de T5 pasa exactamente eso—. Se silencia la regla **en la linea del array de
dependencias**, con comentario que cita el diseño. Es la unica supresion de lint de la feature.

### D5 — importar de la guardia duplica su ejecucion (efecto lateral aceptado, no silenciado)

`design.md > 8.3` obliga a **importar** `findPlaintextPasswordDeclarations` de
`tests/guards/guard-password-never-plaintext.test.ts` en vez de copiar el criterio, para que R22
siga a la guardia si esta cambia. Efecto lateral verificado: como ese archivo tiene `describe` de
nivel superior, sus **6 `it(...)` se registran tambien** bajo `credential-help-contract.test.ts` y se
ejecutan dos veces. **No rompe nada** (las aserciones siguen siendo correctas y cuestan 252 ms en
total) pero infla el conteo. Se acepta el efecto antes que copiar el criterio, que es lo que el
diseño descarta. La solucion limpia —extraer el detector a un modulo no-test que la guardia
reexporte— **toca un archivo de guardia compartido y es material de `/afinar-regla`**, no de esta
ficha: queda anotada, no hecha.

### Lo que NO se desvio (se declara para que la ausencia no se lea como olvido)

- La regla `breached` tiene **tres** estados y arranca en `'unknown'`, no en `'unmet'` (R7, R8).
- El **bloqueo del envio es parcial a proposito** (`design.md > 4`, fila 2): con las seis en verde el
  boton se activa aunque la candidata este filtrada. **No se «arreglo».**
- **Ninguna regla se redeclara**: los componentes consumen `CREDENTIAL_RULES`,
  `evaluateCredentialRules`, `CREDENTIAL_MIN_LENGTH` y `CREDENTIAL_MAX_LENGTH` del **barrel**
  `@/lib/modules/identity`, nunca por ruta profunda. Los numeros del copy se **interpolan** desde esas
  constantes, no se escriben a mano.
- **Sin E2E** (fila 4 de la tabla de decisiones cerradas). No se reabrio.
- **Sin dependencias nuevas.** `lucide-react` (iconos de estado) ya estaba aprobada y en uso en
  `components/private/app-sidebar.tsx`.
- **Sin `aria-live`** (`design.md > 6`), posicion provisional y declarada.
- **La guardia `guard-password-never-plaintext` no se toco ni se relajo.** Los nombres dicen
  `credential` y `candidate`. El unico literal `password` de los componentes es el **valor** de
  `type="password"` y de `autoComplete?: 'new-password'`, que no son identificadores declarados; el
  `name="password"` del formulario de prueba de T5 sigue el precedente vigente
  (`app/(public)/login/components/login-form.tsx:92`).

## Preguntas abiertas al cerrar

Las **cuatro** de `requirements.md` siguen abiertas y esta implementacion no cierra ninguna: (1)
redaccion del copy y multi-idioma —el mecanismo esta, la redaccion es provisional y vive en un solo
archivo—, (2) mostrar/ocultar la candidata —no se ofrece control—, (3) anuncio a lector de pantalla
—sin `aria-live`, posicion provisional—, (4) medidas del campo —se hereda `components/ui/input.tsx`
sin editar, es alcance de QC-29/QC-30—.

**Y una quinta, nueva, que abre esta implementacion:** la de **D2** (R5 frente a `max_length` con la
candidata vacia). Es la unica que pide una decision antes de que QC-36 consuma el componente.

---

# Ronda 2 — respuesta a la review (2026-09-02)

Veredicto de `progress/review_QC-21-ayuda-visual-de-contrasena.md`: **RECHAZADO**, 2 bloqueantes y
5 menores. El leader asigno **B1 y los menores m-1, m-3 y m-4**. **B2 y m-5 NO se tocan**: dependen
de una decision humana sobre la redaccion de R5 en `requirements.md`, que el leader esta esperando.
**m-2 no se toca**: la excepcion de los 32 px esta correctamente declarada en `design.md > 6` con su
pregunta abierta.

**Cero cambios en `components/shared/`.** El codigo de produccion no tenia hallazgos y sigue
byte a byte como lo aprobo el reviewer (`git status` limpio para esa carpeta).

## B1 — CERRADO. El bloque de R19 ya no lee git, y el ancla tautologica se borro

**El diagnostico del reviewer era correcto y la primera correccion era insuficiente.**
`changedFilesSinceDevDiverged()` no leia nada de QC-21: leia que archivos habia tocado **la rama que
ejecutase el test** (`git merge-base HEAD origin/dev` + `git diff` + `git status --porcelain`). El
reviewer lo demostro creando `lib/modules/zz_probe/probe.ts` sin commitear y viendo el test rojo. Una
vez fusionado a `dev`, QC-32, QC-36 y toda ficha de backend habrian fallado este test por archivos
ajenos.

Que se hizo, en `tests/unit/credential-help-contract.test.ts`:

1. **Borrada por completo** la funcion `changedFilesSinceDevDiverged()` y el import de
   `execFileSync` / `node:child_process`. **El archivo ya no invoca ningun proceso externo ni lee
   ningun estado compartido del checkout**: cero `git`, cero `merge-base`, cero `status`.
2. **Borrados los dos asserts tautologicos** sobre `NEW_FILES`
   (`path.startsWith('app/')` sobre literales `'components/shared/…'`, que no podian fallar jamas)
   **y el comentario que les atribuia una garantia que no daban**. No se maquillaron: se fueron.
3. **Reescrito el `it(...)`** —conservando su nombre exacto, que es el del mapa de trazabilidad—
   para verificar R19 sobre el **contenido** de los tres artefactos: ninguno declara `'use server'`,
   ni un route handler (`export [async] function GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS`), ni una
   pagina o layout (`export default`, `export const metadata`, `generateMetadata`,
   `generateStaticParams`, `export const dynamic|revalidate|runtime|fetchCache`), ni persistencia
   (`@prisma/client`, `PrismaClient`, `from '@/db'`, `CREATE TABLE`, `ALTER TABLE`, `model X {`).
   Y el assert que mas muerde: **se extraen todos los especificadores `from '…'` y se exige que
   ninguno empiece por `@/app/`, `@/db`, `@/scripts` ni `@/lib/` salvo el barrel exacto
   `@/lib/modules/identity`** — eso si detecta a alguien alcanzando dentro de `lib/` por ruta
   profunda, que es lo que R19 y la regla de dependencias quieren impedir.

### Por que NO se hizo lo que sugeria el reviewer, y esto es una desviacion consciente

El apartado B1 de la review propone, entre otras, «sustituyendo el bloque por asserts sobre el arbol
real (`components/shared/` contiene exactamente estos tres archivos)». **No se hizo, a proposito:
eso seria exactamente el censo global de un recurso compartido que esta prohibido.**
`components/shared/` **no es de QC-21**: QC-29 esta anadiendo `theme-provider.tsx` ahi mismo, en
paralelo, ahora. Ese assert se pondria rojo en el gate de QC-29 por un archivo que no es de esta
feature — el mismo dano que B1 denuncia, solo que apuntando a otra carpeta. La sugerencia se declina
y el motivo queda escrito en el comentario del propio test.

### El limite del enfoque nuevo, dicho en voz alta

`NEW_FILES` esta **enumerada a mano**. Si alguien anadiera un septimo archivo a la feature sin
sumarlo a esa lista, el bloque no lo veria. **Es el precio de no depender de estado compartido**, y
esta escrito como limite en el comentario del test, no disfrazado de garantia. Es la frase que el
reviewer pedia corregir de la version anterior.

## m-1 — CERRADO. El punto ciego de las propiedades opcionales, tapado solo para esta feature

El reviewer verifico que `findPlaintextPasswordDeclarations` muerde con `readonly password: string;`
pero **NO** con `readonly password?: string;`: el regex de `declaredIdentifiers` exige `:` o `=`
pegado al identificador y el `?` rompe esa adyacencia. **La forma exacta que lo evade es `nombre?:`**
— y es la que usan **todas** las props de esta feature.

- **La guardia compartida NO se toco, ni se relajo, ni se amplio.** Ampliarla es `/afinar-regla`
  (arreglaria de paso `db/`, `lib/`, `app/` y `scripts/`, hoy ciegos igual). **Anotado en
  `progress/current.md > Deudas y cosas abiertas`** con la forma exacta que lo evade, tal como pidio
  el leader.
- **Se anadio un centinela LOCAL** que cubre solo los tres archivos de QC-21:
  `ninguna propiedad opcional nueva nombra la contrasena sin acabar en hash`. Extrae los
  identificadores declarados como propiedad opcional y les aplica **el mismo vocabulario que declara
  la guardia** (`FORBIDDEN_SEGMENTS` en `guard-password-never-plaintext.test.ts:60`, con la `ñ` de
  `contraseña` incluida). Lo que se replica es el vocabulario, no el criterio de deteccion: el
  criterio se sigue heredando por import.
- **No es un test vacio.** Comprobado que el extractor encuentra props reales:
  `credential-requirements.tsx -> [breachedState, labels, id]`,
  `credential-field.tsx -> [id, autoComplete, breachedState, labels, onOwnRulesMetChange]`.
  **Ninguna nombra la credencial de forma prohibida** — verificado leyendo, no de memoria.
- **Se anadio un segundo `it(...)` de mordida**,
  `el centinela de opcionales muerde: detecta un prop password opcional`, que ademas afirma que
  `findPlaintextPasswordDeclarations` **NO** lo detecta: el punto ciego queda documentado de forma
  **ejecutable**, no en prosa. El dia que `/afinar-regla` arregle la guardia, ese assert saltara y
  avisara de que la deuda ya esta pagada.

## m-3 — CORREGIDO el conteo inflado

`tests/unit/credential-help-contract.test.ts` reporta mas tests de los que declara porque importar
`findPlaintextPasswordDeclarations` del archivo de la guardia **registra tambien los 6 `it(...)` de
esa guardia** bajo el importador (`design.md > 8.3` obliga a importar en vez de copiar el criterio).

**Cuenta honesta, ronda 2:** el archivo de contrato reporta **14** tests, de los cuales **8 son
suyos** (R2, R6/R14, R19, R21 y cuatro de R22 contando las dos mordidas) y **6 son la guardia
ejecutandose por segunda vez**. En la ronda 1 reportaba 12 = 6 propios + 6 duplicados.

Por tanto el «+33 tests» declarado en la ronda 1 **estaba inflado**: eran **27 tests nuevos de
verdad** + 6 re-ejecuciones de tests que ya existian. La cifra vigente esta en la tabla de
verificacion de abajo. Efecto anotado tambien en `progress/current.md > Deudas`.

## m-4 — CORREGIDO en la spec

`vitest.config.ts` -> **`vitest.config.mts`** en `specs/QC-21-ayuda-visual-de-contrasena/design.md:22`
y `specs/QC-21-ayuda-visual-de-contrasena/tasks.md:25`. Cosmetico, era error de redaccion de la spec.
**`requirements.md` no se toco** (es lo que aprobo el humano y ademas no menciona el archivo).

## Incidente durante la ronda 2, declarado por si vuelve a pasar

Al correr el archivo de contrato para comprobar el trabajo del subagente, salio **ROJO** nombrando
`components/shared/credential-requirements.tsx: password`, y `git diff` mostraba inyectado un
`export default function Page() { return null }` en ese archivo de **produccion**. Eran los residuos
de las pruebas de mordida que se le habian encargado (`readonly password?: string;` y el
`export default`), observados **en vuelo**: el subagente todavia estaba en esa fase y reporto despues
haberlos revertido uno a uno. El implementer revirtio ademas por su cuenta con
`git checkout -- components/shared/credential-requirements.tsx`.

**Estado final comprobado tras terminar el subagente**: `git diff --stat -- components/shared/`
**vacio** — los tres componentes estan byte a byte como los aprobo el reviewer—, `lib/modules/`
contiene solo `identity` e `inventario` (el probe `zz_probe` no quedo), y el archivo de contrato no
contiene `execFileSync`, `child_process`, `merge-base` ni `status --porcelain`.

Se deja escrito, aunque acabara bien, porque el modo de fallo es el que QC-6 documento: una prueba de
mordida que no se revierte se convierte en un defecto que nadie va a buscar. **Verificar el arbol
despues de una prueba de mordida no es desconfianza, es parte del procedimiento.**

## Verificacion de la ronda 2 — los cinco comandos, salida real

Corridos a mano desde el worktree el 2026-09-02 (`./init.sh` sigue abortando en el validador por la
causa ajena de siempre, con decision humana de convivir).

| Comando | Resultado real |
|---|---|
| `pnpm run typecheck` | `tsc --noEmit` — **sin salida, 0 errores** |
| `pnpm run lint` | `eslint` — **sin salida, 0 errores** |
| `pnpm test` (suite **ENTERA**) | `Test Files 49 passed (49)` · `Tests 513 passed (513)` · 22.89s |
| `pnpm run test:guardias` | `Test Files 7 passed (7)` · `Tests 78 passed (78)` · 931ms |
| `node scripts/validate-features.mjs` | **unica linea: `faltan specs para features sdd en vuelo: QC-29`** — ningun otro error |

### Contabilidad honesta de los tests (m-3 aplicado)

| | Archivos | Tests |
|---|---|---|
| Baseline, antes de tocar nada | 46 | 478 |
| Ronda 1 | 49 | 511 |
| Ronda 2 (vigente) | 49 | **513** |

Los **+35** sobre el baseline **no son 35 tests nuevos**: **6 de ellos son los `it(...)` de
`guard-password-never-plaintext.test.ts` ejecutandose por segunda vez** al importarlo (m-3). Tests
nuevos de verdad: **29** —21 en los dos archivos de componente y 8 propios en el de contrato—. Los
+2 de la ronda 2 sobre la ronda 1 son los dos centinelas de propiedades opcionales de m-1.

Las 7 guardias siguen en 78 tests: **la guardia compartida no se toco ni se relajo**.

## Que sigue abierto tras la ronda 2

- **B2** — la redaccion de R5 en `requirements.md`. **Bloqueante, y no es codigo**: espera decision
  del humano o del leader. Cuando llegue, hay que renombrar tambien el `it(...)`
  `con la candidata vacia las seis salen incumplidas y la lista es visible sin interaccion` y sus
  filas en los dos mapas de trazabilidad (este archivo y `tasks.md`).
- **m-5** — queda a la espera de B2: el nucleo derivativo del test de R5 es un test espejo. El
  reviewer lo acepta como legitimo (R2 obliga a que la unica fuente sea `evaluateCredentialRules`,
  asi que no hay un segundo oraculo posible); solo pide no leerlo como mas fuerte de lo que es.
- **m-2** — altura del campo por debajo de 44x44 px, excepcion declarada. Es alcance de QC-29/QC-30.
- Las cinco preguntas abiertas siguen abiertas, incluida la que abrio D2.

---

## Deudas que esta feature deja anotadas (para `progress/current.md`)

> **Ya volcadas** a `progress/current.md > Deudas y cosas abiertas`, bajo el epigrafe
> «Anotadas por QC-21 — ayuda-visual-de-contrasena (2026-09-02)», en la ronda 2.


- **Nadie ve el componente hasta QC-36** (fila 1 de la tabla de decisiones cerradas).
- **Sin E2E** (fila 4), diferido con motivo.
- **`components/shared/` se estrena con un componente que hoy usa cero features**
  (`design.md > 2.1`).
- **`guard-password-never-plaintext` no barre `components/`**: R22 lo cubre **solo** para los tres
  archivos de esta feature. Cualquier otro componente del repo sigue fuera del barrido. Ampliar la
  guardia es `/afinar-regla`.
- **Importar la guardia duplica sus 6 tests** (D5). Se arregla extrayendo el detector a un modulo
  no-test; es `/afinar-regla`.
- **`scripts/validate-features.mjs` no resuelve `.worktrees` desde dentro de un worktree** (rojo
  heredado, ajeno a QC-21). Es `/afinar-regla`.
