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

### D3 — el test de R19 se escribio contra el diff de la rama, y se corrigio una bomba de relojeria

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

## Deudas que esta feature deja anotadas (para `progress/current.md`)

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
