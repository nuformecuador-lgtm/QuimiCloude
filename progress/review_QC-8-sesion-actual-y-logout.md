# QC-8 — sesion-actual-y-logout · revision

> Revisor: subagente `reviewer`. Fecha 2026-09-02. Diff revisado: `git diff origin/dev...HEAD`
> (29 archivos). Alcance **R1-R23**; **R24 fuera** por decision del humano del 2026-09-02
> (`requirements.md > Preguntas abiertas 3`, fila revisada de la tabla de decisiones): no se
> trata como hueco y el bloque 4 de `tasks.md` no se ejecuta a proposito.
>
> **El gate completo lo corrio el leader** (421/421 en 40 archivos). Aqui no se repite: se
> corrio solo lo necesario para comprobar los hallazgos propios, y **cada mutacion de prueba se
> revirtio y se verifico con `git status --porcelain` vacio**. No se uso `git stash`; el
> `stash@{0}` ajeno sigue intacto.

## Checklist

### Especificacion
- [x] `requirements.md` con EARS numerados R1-R24 (R24 marcado como diferido).
- [x] `design.md` con alternativas descartadas y su porque (6.1-6.5).
- [~] `tasks.md`: T1-T11 y T15 en `[x]`; T12-T14 tachadas por el diferimiento de R24; **T16
  (gate completo + PR) sin marcar**, y es correcto: es la task del leader y esta en curso.

### Trazabilidad
- [x] `progress/impl_QC-8-...md` contiene el mapa `R1-R23 -> test`.
- [x] **Los nombres de test citados existen literalmente.** Verificado extrayendo todos los
  `it(...)` de los siete archivos citados y cruzandolos uno a uno con el mapa. Ninguna cita es
  inventada y ningun requisito queda sin fila.
- [x] Se abrieron y leyeron los tests uno por uno. La mayoria afirma de verdad lo que promete;
  las excepciones estan abajo como **menores 1, 2, 3 y 8**.
- [x] Los dos huecos declarados (**R15** y **R20**) se juzgan **honestos**, no excusas.

### Verificacion ejecutable
- [x] `vitest run --project node tests/unit/identity` -> 18 archivos / 179 tests verde.
- [x] `vitest run --project ui private-layout + sidebar-desktop + sidebar-mobile` -> 22 verde.
- [x] `vitest run tests/guards/guard-firma-sesion-unica.test.ts` -> verde, y **se puso roja a
  proposito dos veces** (ver «Intento de romper la guardia»).
- [x] `./init.sh` completo: verde segun el leader (421/421, 40 archivos). No se repite.

### Calidad y seguridad
- [x] Sin tabla ni columna nueva, sin migracion: nada que exija RLS nueva. `users`/`roles` ya
  tienen `FORCE ROW LEVEL SECURITY` desde QC-4.
- [x] Sin secretos en el repo: `SESSION_SECRET` se lee por entorno **en la llamada**, y el
  mensaje de error no incluye el valor (test explicito).
- [x] La autorizacion real («solo hay sesion si el usuario esta activo, firmado y sin caducar»)
  vive en `domain/` con test, no en una policy.
- [x] Sin webhooks. Sin hardcode de contexto: `LOGIN_ROUTE` sale a `lib/shared/routes.ts`.
- [x] Capas: dominio puro (no importa Next, Prisma ni `lib/shared`), puertos, adaptadores
  driven, cableado **solo** en `lib/composition/index.ts`. El caso de uso **no es un delegador
  vacio**: `resolveSessionUser` encadena cuatro cortes y decide **cuando NO se consulta la
  base**, y hay tres tests que lo afirman con puertos falsos.
- [x] `session-stub.ts` borrado sin referencias vivas (las que quedan en
  `guard-arquitectura-modulos.test.ts` son rutas **sinteticas** que no leen disco).

### Multiplataforma
- [x] No aplica a codigo nuevo de UI: el unico cambio en `app/` es un `redirect` de servidor
  (`design.md > 8`). No hay `100vh`, ni `:hover` como unica via, ni targets tactiles, ni
  `font-size` en inputs, ni libreria de UI nueva. Los cambios en `sidebar-*.test.tsx` son
  andamiaje de test, no UI.

### Dependencias
- [x] `package.json` **no aparece en el diff**. Ninguna dependencia nueva; `design.md > 6.6`
  documenta ademas por que no se adopta `jose`. Nada que anotar en `docs/dependencias.md`.

### Checkpoint no cumplido, con excepcion aprobada
- [ ] *«Si la feature toca un flujo critico (autenticacion...), hay al menos un test E2E»*.
  **No se cumple, y esta autorizado**: el humano difirio el recorrido en navegador a QC-9 el
  2026-09-02 porque `app/(private)/` no tiene `page.tsx` y no hay URL que visitar. Queda
  registrado para que QC-9 lo herede junto con R24. **No cuenta como bloqueante.**

## Juicio sobre los dos huecos declarados

**R15 — razonable, se acepta.** La mitad util («se lee de columnas que ya existen») esta
cubierta de verdad: `identity-schema.test.ts` de QC-4 fija la lista **completa** de columnas
escalares de `User` y el mapeo `firstNames -> first_names` / `lastNames -> last_names`, mas
`deletedAt` y `Role.name`; renombrar o quitar cualquiera de esas pone rojo. La otra mitad («no
hace falta migracion») es una afirmacion **sobre el diff**, no sobre el sistema: un test que la
fijara tendria que congelar la lista de migraciones y se pondria rojo cada vez que otra feature
anadiera la suya. La comprobacion por diff es la correcta, y se re-verifico: `git diff
origin/dev...HEAD -- db/ package.json` esta vacio.

**R20 — el diferimiento de la mitad de navegador es correcto; la mitad de servidor esta
cubierta, pero por otros tests, no por el que se cita.** Que «volver atras en el historial no
muestre contenido privado» depende de la cache de pagina del navegador y **ningun test de
servidor puede afirmarlo**: diferirlo a QC-9 es honesto. Lo que si falla es el test elegido para
la mitad de servidor — ver **menor 1**. La conducta subyacente sigue cubierta por la suma de
`clearSession borra con el mismo nombre y path: /` (R18) y `sin cookie devuelve null` (R2), asi
que **no hay hueco real de conducta**, sino un test que no puede fallar.

## Las seis revocaciones de QC-11: verificadas una por una

Diff contra `origin/dev` de los dos archivos. Lo retirado es **exactamente**:
`session-stub.ts` de `MODULOS_INSPECCIONADOS`, y los patrones `next/navigation`, `redirect`,
`next/headers` y `cookies` de `prohibidos` en `logout-action.test.ts`; y la cadena `'redirect'`
de la lista de R35 en `private-layout.test.tsx` (unica linea de prohibicion eliminada ahi). Las
cuatro primeras las autoriza R18 («retirar la cookie **desde el servidor**» + volver al login) y
la sexta la decision del 2026-09-02 sobre la zona privada. La primera es forzosa: el archivo ya
no existe y `readFileSync` reventaria.

**No se levanto ninguna prohibicion de mas.** Confirmado que sobreviven, ademas de lo que ya
comprobo el leader (`document.cookie`, `prisma`, `PrismaClient`, `supabase`, `fetch`,
`session-stub`, `next/headers`, `cookies(`): en `private-layout.test.tsx` siguen intactos
`Set-Cookie`, `cookiestore.set`, `cookiestore.delete`, la exigencia de `SIDEBAR_STATE_COOKIE`,
el bucle que obliga a que **toda** operacion `cookieStore.<metodo>(...)` sea un `get` de esa
constante, el assert de runtime de que la unica cookie consultada al renderizar es esa, y el
test de R36 (ninguna region de notificaciones). El unico efecto colateral es la particion del
test de firma congelada en dos, que la bitacora declara y que deja R19 cubierto.

## Alcance no previsto: `sidebar-desktop.test.tsx` y `sidebar-mobile.test.tsx`

Verificado **que las aserciones que quedan siguen midiendo lo mismo**, que es lo que un conteo
no dice. El diff es puramente aditivo: mocks de `redirect` y de `@/lib/composition`, el
centinela de redireccion, `getSessionUserMock.mockResolvedValue(USUARIO_DEL_TEST)` en el
`beforeEach`, y **un test nuevo por archivo** (R16). **Ninguna linea de assert preexistente se
toca**: las unicas lineas eliminadas son la reescritura del bloque `vi.hoisted`. Y el punto que
importa: se comprobo con `grep` que **ninguno de los dos archivos afirma jamas sobre el nombre,
el rol ni las iniciales del usuario** (no hay `userName`/`userRole`/`Initials` en ellos), asi
que sustituir el usuario de relleno del stub (`Usuario de Prueba`) por `USUARIO_DEL_TEST` no
cambia lo que ninguna asercion mide. Es andamiaje legitimo.

## Intento de romper la guardia nueva (R5)

`tests/guards/guard-firma-sesion-unica.test.ts` **resiste los dos ataques**:

1. **Intruso real.** Se anadio un `createHmac` propio en `lib/shared/routes.ts`. La guardia se
   puso **roja** nombrando el archivo infractor. Revertido; `git status --porcelain` vacio.
2. **Barrido roto.** Se dejo `PRODUCTION_DIRS = ['no-existe']` (lista de hallazgos vacia). **No
   pasa en verde**: lo caza el segundo assert, `expect(encontrados).toContain(UNICO_DUENO)`. Es
   la contramedida correcta contra la guardia vacia. Revertido y verificado.

Tiene un limite, documentado como **menor 4**.

## Hallazgos

### MAYORES (bloqueantes)

**Ninguno.**

### Menores

1. **El test de la mitad de servidor de R20 es verde por construccion.** `cookie > tras
   clearSession, una peticion sin la cookie ... resuelve sin sesion` hace `await clearSession()`
   y acto seguido `getMock.mockReturnValue(undefined)`: es el **propio test** quien decide que ya
   no hay cookie, no `clearSession`. Nada enlaza el `delete` con el `get`. **Demostrado
   empiricamente**: mutando `clearSession` a un no-op fallan solo `clearSession borra con el
   mismo nombre y path: /` y `sin SESSION_SECRET ... y clearSession sigue funcionando` — **este
   test sigue pasando** (2 failed | 16 passed). Mutacion revertida. *Que falta:* anadirle
   `expect(deleteMock).toHaveBeenCalledWith({ name: SESSION_COOKIE_NAME, path: '/' })`, o mejor,
   dar estado al doble del almacen de cookies para que `delete` vacie lo que devuelve `get`. Se
   deja como menor porque la conducta esta cubierta por la suma de los tests de R18 y R2.
2. **`prefijo v0. devuelve null sin interpretar el resto` afirma menos de lo que su nombre
   promete.** Solo comprueba `resolves.toBeNull()`; pasaria igual si el codigo leyera el secreto
   y recomputara la firma antes de mirar la version. El codigo **si** corta antes (correcto), y
   hay una forma barata de anclarlo: borrar `SESSION_SECRET` en ese test y afirmar que **no
   lanza** y devuelve `null`. Lo mismo vale para la clausula «sin consultar la base de datos» de
   R2/R3, que se apoya en el test del resolver y no en el del adaptador.
3. **La clausula «compararla en tiempo constante» de R5 no tiene ningun test ni guardia.** El
   codigo usa `timingSafeEqual` y lo comenta, pero nada se pondria rojo si manana alguien lo
   cambiara por `===`. La otra clausula de R5 («sin segunda implementacion») si tiene guardia. Se
   cierra con dos lineas en la guardia ya existente (exigir `timingSafeEqual` en el unico dueno),
   que es el mismo patron de source-check que este repo ya usa.
4. **La guardia de R5 no barre la raiz del repo.** `PRODUCTION_DIRS = ['lib','app','components',
   'hooks']`. **Verificado**: un `middleware.ts` en la raiz con su propio `createHmac` deja la
   guardia **en verde** (2 passed). R5 dice «en el repositorio», y `middleware.ts` es
   precisamente el archivo que **QC-9 va a crear para verificar la firma en Edge**: el candidato
   numero uno a segunda implementacion. No se bloquea porque **es la misma limitacion de
   `guard-arquitectura-modulos.test.ts` de QC-15** (`SCAN_ROOTS = ['app','components','hooks',
   'lib']`), ya aceptada en su revision: es deuda del arnes, no una regresion de QC-8. **QC-9
   debe ampliar los dos barridos a los `.ts` de primer nivel antes de escribir su
   `middleware.ts`.** Archivo temporal borrado; arbol limpio.
5. **Titulo de test que ahora miente:** `private-layout.test.tsx > el layout no valida sesion, no
   accede a base de datos y no emite cookie de sesion`. El layout **si** valida sesion desde T10;
   el cuerpo ya no lo comprueba (`redirect` se retiro de la lista) y el comentario lo explica,
   pero el nombre quedo de QC-11 y contradice la conducta. Renombrar.
6. **Superficie muerta que nadie ejercita.** (a) `SessionReader.clear()` no lo llama nadie:
   `grep '\.clear(' lib/` no devuelve nada, porque la composicion cablea `endSession:
   clearSession` directo al adaptador. El miembro esta en el puerto por `design.md > 3` pero es
   inalcanzable. (b) En `private-layout.test.tsx > el sidebar no importa el proveedor de sesion`,
   la cadena prohibida `'session-stub'` ya no puede aparecer nunca (el archivo no existe): esa
   asercion concreta es infalsificable. **La conducta real de R17 sigue cubierta** —los tres
   componentes son `'use client'` y el bloque 8 de la guardia hexagonal (R14) prohibe que un
   archivo de cliente importe la composicion o un adaptador driven—, pero conviene sustituir la
   cadena muerta por `@/lib/composition` / `getSessionUser`, que es el riesgo vivo.
7. **`design.md` quedo desalineado en dos puntos** (la correccion se escribio solo en la
   bitacora): 4.5 sigue afirmando *«solo `app/(private)/layout.tsx`, que es el unico llamador ...
   no hay llamadores silenciosos»*, que la propia bitacora declara **falso** (los tests veian
   tres); y la tabla de 3 sigue listando `e2e/session.spec.ts` como **nuevo** sin la marca de
   diferido que si recibio la fila de la seccion 0. Es el patron que costo una ronda en QC-7
   (`5.7`). **Se busco activamente una tercera y no aparecio**: se cotejaron 4.1 (orden de
   cortes, `split` en 3, version antes del secreto, longitudes antes de `timingSafeEqual`), 4.2
   (`findFirst`, `deletedAt` en el `where`, `select` minimo con `role.name`), 4.3 (zod con `sub`
   UUID e `iat`/`exp` enteros, `>=`, epoch en segundos), 4.4 (cableado literal) y 2.1 (los cuatro
   cortes) contra el codigo, y todos coinciden. Tambien coincide el contrato heredado de QC-7
   (5.1 formato `v1.`, 5.2 atributos y `path`, 5.4 caducidad absoluta sobre el `exp` firmado).
8. **`la firma sigue congelada: sin parametros y sin valor de retorno` solo afirma la mitad**:
   `toHaveLength(0)` cubre los parametros; «sin valor de retorno» lo garantiza el tipo
   `Promise<void>` y el typecheck, no el test. Aceptable, pero el nombre promete mas de lo que el
   assert puede.

### No son hallazgos (verificados y descartados a proposito)
- **R24 / bloque 4 / ausencia de E2E**: decision del humano, documentada en tres sitios.
- **R21**: test de **caracterizacion** deliberado. Su comentario es ejemplar — dice que no es una
  garantia deseable, por que se asumio el riesgo (robo previo, `httpOnly`, 8 h, salida de
  emergencia via `deleted_at`/rol), quien lo arregla (QC-23) y **que hacer cuando se ponga
  rojo**: reescribirlo para afirmar que la copia ya no vale, no «arreglarlo» para que vuelva a
  verde. No se reporta como vulnerabilidad.
- **Agrupacion T7+T8** en un commit: justificada (por separado dejan el typecheck rojo y rompen
  la bisectabilidad) y aprobada por el leader.
- **El defecto de unidades `iat`/`exp`** del bloque 1: el test ancla hoy la unidad contra un
  `Date` ISO explicito, y el caso feliz cruza emisor y lector llamando a `startSession`. Bien
  cerrado.

## Veredicto

**APROBADO** — 0 mayores, 8 menores.

Ninguno de los ocho menores invalida una conducta exigida por R1-R23: en los cuatro casos donde
un test afirma menos de lo que su nombre promete (1, 2, 3, 8), la conducta o esta cubierta por
otro test del mismo archivo o la garantiza el typecheck. Se recomienda al leader recogerlos como
deuda **con dos destinatarios claros**: el **menor 4** (barrido de guardias sin la raiz del repo)
va a **QC-9, antes** de escribir `middleware.ts`; los menores 1, 5 y 6 se pueden cerrar en el
propio QC-8 si el leader prefiere una ronda corta, porque son cambios solo de test y de nombre.
