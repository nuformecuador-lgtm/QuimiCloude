# QC-15 — arquitectura-hexagonal-y-modulos · revision

Reviewer. Verificado sobre el worktree
`.worktrees/QC-15-arquitectura-hexagonal-y-modulos/`, rama
`feature/QC-15-arquitectura-hexagonal-y-modulos`, 13 commits sobre la base
(`origin/dev` mas el merge de `dev` local).

**Veredicto: RECHAZADO.** 2 mayores, 6 menores.

Los dos mayores son del mismo tipo y no obligan a tocar produccion: la guardia nueva no
puede ponerse roja en varios de los casos que la feature dice impedir, y
`docs/architecture.md` afirma que si. Todo lo demas —los movimientos, la no regresion, los
stubs, la trazabilidad— esta bien y verificado.

---

## Checklist

### Especificacion
- [x] `requirements.md` con R1..R21 en EARS, numerados.
- [x] `design.md` con alternativas descartadas y su porque (D1 `src/`, D2 esquema
      multiarchivo, D3 `eslint-plugin-boundaries`, D4 mover `components/`).
- [x] `tasks.md` existe y todas las tasks T0..T11 estan marcadas `[x]` (comprobado una a una).

### Trazabilidad
- [x] El mapa `R<n> -> test` existe en `tasks.md > Trazabilidad` y en `progress/impl_*.md`.
- [x] R1..R21: cada fila apunta a un test que existe. Recorridos los 12 bloques de
      `tests/guards/guard-arquitectura-modulos.test.ts` contra la fila que dicen cerrar.
- [~] Con reserva en R9, R11, R12, R13, R14, R15 y R17: el test existe y comprueba algo,
      pero no la propiedad completa que el requisito enuncia (mayor 1).

### Calidad de codigo
- [x] `./init.sh` completo, corrido por mi: verde. `22 archivos | 210 tests`, cero rojos,
      baseline vacio, `down.sql` presente, `.env` presente.
- [x] `pnpm test`: 22/22 archivos, 210/210 tests.
- [x] typecheck y lint cubiertos por `./init.sh`.
- [x] Feature sin UI nueva: solo cambian rutas de import en `app/` y `components/`.
      Comprobado el diff de `app/**` y `components/**`: ni una linea de JSX, clase o
      estilo. La regla multiplataforma no aplica y `docs/architecture.md > Componentes`
      quedo intacta (D4): `git diff 443dba9..HEAD -- docs/architecture.md` no tiene ningun
      hunk en esa seccion.
- [x] Dependencias: la feature no instala nada (`design.md > D3`). El unico cambio en
      `package.json` del rango (`test:json`) viene del merge de `dev`, no del implementer
      (`git log --oneline origin/dev..HEAD -- package.json` -> `443dba9`/`7914cd1`). La
      fila `heredada` de `bcryptjs` en `docs/dependencias.md:32` (commit `f642e6f` del
      leader) es correcta: `bcryptjs` entro con QC-5 en `origin/dev` despues de escribirse
      el registro, y `heredada` es el estado que ese registro define para ese caso exacto.
      Sin objecion.

### Datos y seguridad
- [x] Sin tabla nueva, sin columna, sin migracion, sin policy: el unico cambio en `db/`
      son tres lineas `/// @module identity`. RLS y `guard-rls-force` intactos.
- [x] Sin secretos nuevos. `lib/shared/db/prisma.ts` es un `git mv` sin cambio de contenido.
- [x] Sin webhooks.
- [x] Sin hardcode de contexto: `DASHBOARD_ROUTE` y `FORGOT_PASSWORD_ROUTE` se copiaron
      literalmente, con su comentario, de `lib/types/auth.ts` a `lib/shared/routes.ts`
      (comparado contra `git show origin/dev:lib/types/auth.ts`).

### Sin cambio de comportamiento (la restriccion principal) — VERIFICADO POR MI
- [x] Mismos 20 archivos verdes de T0, con el mismo numero de tests cada uno. No me fie
      del resumen: corri `vitest run --reporter=json` y conte por archivo. Coincide
      exactamente con la tabla de T0, incluidos los renombrados (23/9/2/4/8/12/14/13 en
      los de `identity`). Total: 171 de la base (170 verdes mas
      `guard-dependencias-aprobadas`) mas 39 de la guardia nueva = 210. La cuenta
      "170 -> 209" del implementer cuadra descontando el guard de dependencias.
- [x] Ninguna asercion cambio de valor esperado. Leido entero
      `git diff origin/dev...HEAD -M -- tests/unit tests/ui tests/integration tests/helpers`:
      solo cambian rutas de archivo, rutas de import y el objetivo de los `vi.mock`. Los
      dos unicos arrays de datos que cambian (`modulos` en `login-action.test.ts`,
      `MODULOS_INSPECCIONADOS` en `logout-action.test.ts`) son rutas de los fuentes que el
      test inspecciona, no valores afirmados; la propiedad afirmada sobre ellos (sin
      `next/headers`, sin `@prisma/client`, sin cookies) es identica.
- [x] El cuerpo de produccion no se toco. `diff` literal de
      `origin/dev:lib/actions/login.ts` contra
      `lib/modules/identity/adapters/driving/login-action.ts`: solo el bloque de imports y
      `verifyCredentials(...)` -> `identity.verifyCredentials(...)`. El `redirect()` sigue
      fuera de todo `try/catch`.
- [x] Los stubs siguen siendo stubs. `lib/modules/identity/domain/verify-credentials.ts`
      devuelve `{ ok: false }` incondicionalmente (`void input; return { ok: false }`).
      `lib/modules/identity/adapters/driven/session/session-stub.ts` devuelve el
      `PLACEHOLDER_SESSION_USER` fijo y `endSession` sigue siendo un no-op. Ni QC-7 ni QC-8
      se colaron.

### Checkpoints de `CHECKPOINTS.md`
- [x] Todo lo aplicable, salvo la seccion "Patron de capas", que ha quedado obsoleta por
      esta misma feature (menor 3), y "Verificacion final", que cierra el leader.

---

## Hallazgos

### MAYOR 1 — BLOQUEANTE. La guardia no puede ponerse roja si la violacion se escribe con ruta relativa

`tests/guards/guard-arquitectura-modulos.test.ts`, bloques 5 (R9, lineas 307-315),
7 (R11/R12, 407-422), 8 (R13/R14, 431-449), 9 (R15, 456-463) y 11 (R17, 533-542).

Esos cinco bloques deciden mirando el texto del especificador y exigiendo el prefijo `@/`:

    if (/^@\/lib\/modules\/[^/]+\/adapters\/driven\//.test(specifier)) { ... }   // R11
    if (specifier.startsWith('@/lib/modules/')) return `...`                     // R15

Un import relativo es el mismo import y no dispara nada. Comprobado ejecutandolo, tres
veces, revirtiendo despues (`git status` limpio):

| Violacion introducida | Requisito | Resultado de la guardia |
| --- | --- | --- |
| `logout-action.ts` (driving) con `import { endSession } from '../driven/session/session-stub'` | R11 | 39/39 VERDE |
| `lib/shared/ui/initials.ts` con `import { verifyCredentials } from '../../modules/identity'` | R15 | 39/39 VERDE |
| `lib/composition/index.ts` con `import { prisma } from '../shared/db/prisma'` | R17 | 39/39 VERDE |

El primero es el caso realista, no uno rebuscado: R11 existe precisamente para que una
Server Action no meta la mano en el adaptador saltandose la composicion, y dentro de un
modulo el estilo natural es el import relativo — el propio codigo de la feature ya lo usa
(`ports/session-provider.ts` importa `../domain/session-user`; `identity/index.ts`
reexporta `./domain/...`). El dia que QC-7 escriba
`import { verifyPasswordHash } from '../driven/security/password-hash'` en el adaptador
driving, la guardia dira que todo esta bien.

R11 dice "el unico archivo del repositorio... que importe un adaptador driven"; no dice
"que lo importe con alias". Igual R15 y R17. Una guardia que solo ve una de las dos formas
de escribir el mismo import no verifica el requisito: verifica una convencion de escritura
que ademas no esta escrita en ningun sitio (`docs/conventions.md` no obliga al alias `@/`;
lo comprobe).

Lo llamativo es que la solucion ya esta en el archivo: `classifyImportTarget` (lineas
221-237) resuelve `./x` y `@/...` a una ruta real del repo, y el bloque 4 la usa — por eso
el bloque 4 si es solido. Los otros cinco bloques no la usan.

**Que falta:** resolver el especificador (con `classifyImportTarget`, que ya existe y ya
esta probada) antes de aplicar la regla en los bloques 5, 7, 8, 9 y 11, y anadir a cada uno
un caso sintetico con ruta relativa que demuestre que dispara — que es literalmente lo que
exige R21.

### MAYOR 2 — BLOQUEANTE. `docs/architecture.md` afirma que la guardia hace cumplir toda la tabla de dependencias, y no es cierto

`docs/architecture.md:188-189`: "`M` y `N` son modulos distintos. La hace cumplir
`tests/guards/guard-arquitectura-modulos.test.ts`.", seguido de la tabla de 8 filas copiada
de `design.md > 5.1`.

Cobertura real, fila por fila:

| Fila de 5.1 | Cubierta por la guardia |
| --- | --- |
| `domain/**` | SI, completa (bloque 4, con resolucion de rutas) |
| `ports/**` | SI, completa (misma funcion) |
| `adapters/driven/**` | PARCIAL: solo la ruta profunda a otro modulo (bloque 5) y la propiedad de modelos (bloque 10). Sin cubrir: `lib/composition`, `../driving/**`, `app/**`, `components/**` |
| `adapters/driving/**` | PARCIAL: `../driven/**` con alias (bloque 7) y el cliente Prisma compartido con alias (bloque 11). Sin cubrir: `@prisma/client` directo, y `../../domain`/`../../ports` por ruta profunda |
| `lib/composition/**` | PARCIAL: solo `*/adapters/driving/**` (R12). Sin cubrir: `app/**`, `components/**` |
| `lib/shared/**` | SI (con la reserva del mayor 1) |
| `app/**` | SI (con la reserva del mayor 1) |
| `components/**`, `hooks/**`, `'use client'` | SI (con la reserva del mayor 1) |

Verificado ejecutando, no leyendo. Introducidos a la vez y revertidos: `session-stub.ts`
(driven) con `import { identity } from '@/lib/composition'` —inversion de la flecha, justo
el ciclo que la seccion 6.1 dice prohibir—, y `login-action.ts` (driving) con
`import { PrismaClient } from '@prisma/client'` y con
`import { loginInputSchema } from '@/lib/modules/identity/domain/credentials'` (ruta
profunda a su propio dominio, prohibida por la fila 4). Resultado: 39/39 VERDE.

Ninguna de esas celdas es literalmente un `R<n>`, asi que no es un incumplimiento de
`requirements.md`; el problema es la frase del documento. Es el mismo argumento con el que
`design.md > D1` descarto `src/`: "una guardia que sigue verde porque ya no mira donde hay
que mirar es peor que no tenerla". Un doc que dice "esto lo hace cumplir la guardia" sobre
reglas que la guardia no mira produce esa misma falsa confianza, y las features que
dependen de QC-15 (QC-6, QC-7, QC-9, QC-14) van a leer esa tabla como si estuviera
vigilada.

**Que falta:** o cubrir esas celdas en la guardia, o —si se decide dejarlas fuera— marcarlo
explicitamente en la tabla del doc (una columna "verificada por la guardia / convencion no
verificada") y anotarlo en `design.md > 11`. Cualquiera de las dos vale; lo que no vale es
la frase actual.

### menor 1 — Seis bloques pueden salir verdes sin haber mirado ningun archivo

`guard-arquitectura-modulos.test.ts:582-591`. `allSourceFiles` se calcula sobre
`SCAN_ROOTS = ['app','components','hooks','lib']` y ningun test afirma que no este vacio.
Los bloques 4, 5, 7, 8, 9 y 11 son todos `expect(hallazgos).toEqual([])` sobre esa lista:
si `SCAN_ROOTS` quedara desalineada (un `src/` futuro, un renombre), los seis saldrian
verdes sin barrer nada. La propia guardia ya usa el patron correcto en el bloque 1
(`expect(modulesData.length).toBeGreaterThan(0)`) y en el 10
(`expect(modelOwners.size).toBeGreaterThan(0)`), y `guard-password-never-plaintext` lo hace
con `scannedFiles.length`. Falta `expect(allSourceFiles.length).toBeGreaterThan(0)`. Hoy no
esta vacio; la deuda es de blindaje.

### menor 2 — `.claude/agents/backend_dev.md` sigue mandando la arquitectura que esta feature abolio

`.claude/agents/backend_dev.md:35-38` y `:46` instruyen crear
`lib/services/<Feature>Service.ts`, `lib/repositories/<Feature>Repo.ts` y
`lib/interfaces/{services,repositories}/...`, y "toda interfaz se define en
`lib/interfaces/`". El bloque 2 de la guardia nueva prohibe esas tres carpetas (R5). El
proximo `backend_dev` que implemente QC-6 o QC-9 seguira su propio prompt y pondra el gate
en rojo. Fuera del alcance literal de la feature (R19 solo nombra `docs/architecture.md` y
`tasks.md > T10` no lo lista): no es un fallo del implementer, es trabajo del leader antes
de arrancar la siguiente feature de backend.

### menor 3 — `CHECKPOINTS.md` conserva la seccion "Patron de capas" obsoleta

`CHECKPOINTS.md:42-46`: "Controller no contiene queries", "Service no conoce HTTP",
"Repository solo ejecuta queries Prisma" y "Las interfaces estan en `lib/interfaces/`".
Ese ultimo checkpoint es hoy imposible de cumplir: la guardia rechaza `lib/interfaces/`.
Mismo caso que el menor 2 —fuera del alcance de la spec, tarea del leader—, pero es el
documento contra el que revisa el reviewer, asi que conviene cerrarlo antes que el resto.

### menor 4 — Un adaptador driven consume el barrel de su propio modulo

`lib/modules/identity/adapters/driven/session/session-stub.ts:1`:
`import type { SessionUser } from '@/lib/modules/identity'`. La fila 3 de `design.md > 5.1`
dice que un driven importa `../../domain/**`. No hay ciclo (el contrato solo reexporta
`./domain`) ni viola ningun `R<n>`, y ninguna regla de la guardia lo mira, pero es la ruta
larga y deja al adaptador colgando de su propio contrato publico.

### menor 5 — El bloque 12 (R19) prohibe la cadena, no la vigencia

`guard-arquitectura-modulos.test.ts:551-562`: `docSource.includes('lib/actions/')` es
hallazgo. Es decir, `docs/architecture.md` no puede nombrar `lib/actions/` ni siquiera para
prohibirla en la seccion de anti-patrones. Funciona y es simple; solo conviene saber que la
regla real es "no aparece la cadena", no "no se presenta como vigente" como dice el mensaje.

### menor 6 — La ampliacion de `NON_COLUMN_SUFFIXES` con `hasher`: legitima, la doy por buena

`tests/guards/guard-password-never-plaintext.test.ts:74` y `:96`. El criterio que esa lista
documenta es que el ULTIMO segmento denote por si solo una categoria que no es un dato
persistido, de forma que `<algo>_<sufijo>` no pueda leerse como "columna que guarda
`<algo>`". `hasher` lo cumple: nombra al agente que calcula el hash. Comprobado que la
ampliacion es estrecha y no abre agujero:

- solo suprime cuando `hasher` es el ultimo segmento (`isPlaintextPasswordIdentifier`
  decide con `segments[segments.length - 1]`);
- `password`, `pass`, `password_value`, `passwordText`, `plain_password` y
  `hasher_password` (orden invertido, anadido en este diff) siguen dando hallazgo;
- una columna real llamada `password_hasher` guardaria el nombre del algoritmo, no la
  contrasena: no hay identificador plausible que sea columna de contrasena en claro y
  termine en `hasher`.

El unico borde que abre es `plain_password_hasher`, que sigue nombrando un objeto y cae
dentro del criterio ya documentado; hay precedente directo (`route`, `id`, `error`,
`field`, `input`). No es un hallazgo contra el implementer: paro y pidio decision, que es
lo correcto. Se anota porque el encargo pedia juzgarlo explicitamente.

---

## Lo que si esta bien y conviene que conste

- Los 12 bloques de la guardia tienen, cada uno, su caso sintetico que viola la regla y su
  caso simetrico que no la dispara (R21). Recorridos uno a uno: ninguno es un `expect` sobre
  un array que salga vacio por un filtro mal puesto, ninguna lista queda vacia y ningun
  barrido de arbol queda sin casar. El punto debil no es la ausencia de casos, es la forma
  del especificador (mayor 1).
- El bloque 6 (contrato limpio) resuelve el cierre transitivo de verdad, con `Set` de
  visitados contra ciclos y `tryRead` inyectado, y su caso sintetico corre en memoria. Es la
  pieza mejor hecha de la guardia. `pnpm run build` en T11 la respalda por otra via.
- El bloque 5 excluye a proposito `app/`, `components/` y `lib/composition/` de R9, con la
  justificacion escrita en el propio codigo (lineas 298-306). Es correcto: sin eso, la
  composicion real saldria en rojo por hacer justo lo que R11 le manda.
- Los `vi.mock` estan verificados contra el riesgo del mock muerto: la evidencia de T5
  (romper el mock a proposito y ver el rojo en `logout-action.test.ts`) es el tipo de prueba
  que hacia falta, y el conteo por archivo que hice yo confirma que ninguno quedo huerfano
  en silencio.
- Las desviaciones estan declaradas, con su causa y su alternativa, incluida la que el
  implementer sabia que iba a mirarse con lupa.

## Que tiene que volver del implementer

1. Bloques 5, 7, 8, 9 y 11 de `guard-arquitectura-modulos.test.ts`: resolver el
   especificador antes de aplicar la regla, y un caso sintetico con ruta relativa por
   bloque.
2. La tabla de `docs/architecture.md > La regla de dependencias`: o la guardia cubre las
   celdas de las filas `driven`, `driving` y `composition`, o la tabla dice cuales no estan
   verificadas.
3. Recomendado y barato: `expect(allSourceFiles.length).toBeGreaterThan(0)`.

Los menores 2 y 3 no son suyos: son del leader.

**Veredicto final: RECHAZADO** (2 bloqueantes).
