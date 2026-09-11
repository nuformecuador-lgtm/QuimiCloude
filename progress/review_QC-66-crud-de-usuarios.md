# QC-66 — crud-de-usuarios · review

> Rama `feature/QC-66-crud-de-usuarios`, HEAD `60c32b7`, ya mergeada con `origin/dev` (`192842a`).
> Diff revisado: `git diff 192842a HEAD` (la aportacion NETA de la ficha, 53 archivos) y
> `git diff c870825...HEAD` para el contexto de lo que trajo el merge.
> Todo corrido dentro del worktree. **No se edito ni una linea de produccion**: las sondas de
> sensibilidad se aplicaron, se corrieron y se revirtieron con `git checkout --` en el mismo paso;
> `git status --porcelain` quedo **vacio** al terminar.

---

## 1. Veredicto

**RECHAZADO.** Un (1) hallazgo mayor, nueve (9) menores.

El hallazgo mayor **no esta en la feature**: esta en su propio test de alcance, y consiste en que
cuatro de sus ocho casos se pondran **rojos de forma determinista en `dev`** en cuanto este PR
entre. Lo demas de la ficha es de las implementaciones mas solidas que he revisado: la autorizacion
es real, la carrera del ultimo administrador esta probada de verdad con dos conexiones, y las cinco
divergencias declaradas estan todas donde dicen estar.

---

## 2. Checklist de `CHECKPOINTS.md`

### Especificacion
- [x] `requirements.md` con R1-R49 en EARS, 18 decisiones cerradas y P1/P2/P3 abiertas.
- [x] `design.md` con **ocho** alternativas descartadas (12.1-12.8) y su porque.
- [x] `tasks.md` con **21 de 21** tasks marcadas `[x]` (T0-T20). Cero `[ ]`.

### Trazabilidad
- [x] Los **49** requisitos tienen test nombrado y el test **existe**. Detalle en la seccion 4.
- [x] `progress/impl_QC-66-crud-de-usuarios.md` contiene el mapa `R<n> -> test`.

### Calidad de codigo
- [x] `pnpm run typecheck` -> **sin un solo error**. (El `app/layout.tsx(43,56) LayoutProps` que la
      bitacora declaraba ya no aparece: el build del leader lo apago. No se cuenta como hallazgo.)
- [x] `pnpm exec eslint .` -> sin salida, exit 0.
- [x] `vitest run tests/unit/identity tests/unit/composition tests/unit/errores tests/guards`
      -> **71 archivos, 990 pasados, 3 saltados, 0 rojos**.
- [x] `vitest run tests/integration/identity` -> **7 archivos, 161 pasados, 0 rojos** (contra
      `QuimiCloude_QC66`, base real).
- [~] E2E de flujo critico: **no hay**, y la feature toca permisos. Diferida a **QC-67** por la
      decision cerrada 17 y por **R46**, declarada en `design.md > 14` y **no al final**. Excepcion
      legitima (precedente QC-43 -> QC-44), pero el checkpoint queda formalmente sin marcar. Ver
      menor 6.
- [x] UI multiplataforma: **no aplica**. El diff neto no toca `app/`, `components/` ni `e2e/`.
- [x] Dependencias: **cero nuevas**. `package.json` y `pnpm-lock.yaml` **no estan en el diff neto**
      (verificado directamente, no por el test). R47 cumplido.

### Datos y seguridad
- [x] Aislamiento por empresa: **ningun modelo nuevo** (`db/schema.prisma` fuera del diff), asi que
      no hay columna de empresa que exigir. Las **cinco** operaciones del puerto llevan `companyId`
      como **argumento propio y obligatorio** y los nombres `...AliveInCompany` lo hacen
      estructural; hay test de acceso cruzado rechazado en integracion (cinco casos, comparando la
      fila cruda antes y despues de cada intento).
- [x] Permisos **en el service y como primera linea**, en los seis casos de uso, con su test.
      Ninguna policy de RLS se usa como sustituto.
- [x] RLS: no se crea ninguna tabla; `guard-rls-force.test.ts` sigue verde y la migracion no toca
      ningun objeto de esquema.
- [x] Acceso a datos solo por Prisma; cero cliente de Supabase.
- [~] Migracion con su `down.sql`: **existe y es correcta por lectura** (orden inverso, acotado por
      codigo, `ON CONFLICT DO NOTHING` en las dos sentencias del UP, cero `ALTER`/`CREATE`/`DROP`).
      El ciclo real migrate -> rollback -> migrate **no lo pude re-ejecutar** (los comandos de base
      me quedaron bloqueados en este entorno). Ver menor 9.
- [x] Cero secretos y cero hardcode de entorno en los archivos nuevos.
- [x] Webhooks: no aplica.

### Modulos hexagonales
- [x] `domain/` y `ports/` no importan framework, Prisma, `lib/shared/**` ni `lib/composition`. El
      unico import externo del dominio es el **barrel** de `@/lib/modules/errores`, que es lo que la
      regla de dependencias permite.
- [x] Cableado **solo** en `lib/composition/index.ts`, y **aditivo**: `--numstat` da **+77 / -0**.
- [x] El barrel `lib/modules/identity/index.ts` reexporta solo de `./domain`; las seis Server
      Actions **no** salen por ahi. `guard-arquitectura-modulos.test.ts` verde.
- [x] Logica de negocio en `domain/`: las seis actions solo resuelven actor, extraen `FormData` y
      traducen. Verificado leyendo el archivo entero, no por guardia.

### Permisos / Configuracion / Verificacion final
- [x] Mutaciones por Server Actions, cero route handlers, cero `fetch` a ruta propia.
- [x] Nada que cambie entre entornos quedo hardcodeado.
- [ ] `./init.sh` completo: **lo corre el leader** (F2.4).
- [x] `progress/review_QC-66-crud-de-usuarios.md`: este archivo.
- [ ] Entrada en `progress/history.md`: **no existe** para QC-66. Es del leader al cerrar.

---

## 3. Hallazgos

### 3.1 MAYORES (bloqueantes)

**MAYOR-1 — `tests/unit/identity/usuarios/scope.test.ts` se pondra ROJO en `dev` el dia que este PR
entre, y se lleva con el las guardias de R43, R46 y R47.**

- **Donde:** `tests/unit/identity/usuarios/scope.test.ts`, helper `diffDeLaRama()` (L78-100) y el
  ancla `ANCLA_DEL_RANGO` (L116-118), aplicada en **L279, L295, L423 y L454** — es decir los casos
  `R43 — el diff de la rama no toca db/schema.prisma` (L270),
  `R43 — la unica migracion de la rama es la del catalogo...` (L288),
  `R46 — la rama no anade nada bajo app/, components/ ni e2e/...` (L416) y
  `R47 — la rama no toca package.json ni pnpm-lock.yaml` (L445).
- **Por que:** el helper calcula `git merge-base origin/dev HEAD` y diffea contra esa base, mas
  `git status --porcelain`. Hoy la base es `192842a` y el diff trae 53 archivos, asi que los cuatro
  casos pasan. **Cuando `origin/dev` contenga este commit, la base pasa a ser HEAD.** Lo medi, no lo
  deduje:

      merge-base ahora: 192842a...      HEAD: 60c32b7...
      git diff --name-only HEAD   -> 0 lineas
      git status --porcelain      -> 0 lineas

  Con eso `diffDeLaRama()` devuelve la lista vacia y
  `expect(diff.length, ANCLA_DEL_RANGO).toBeGreaterThan(0)` **falla** en los cuatro. No es un flake
  ni un riesgo teorico: es determinista e inmediato.
- **Por que es bloqueante y no deuda declarada:** la regla 5 de `CLAUDE.md` obliga a `./init.sh`
  **completo antes de cada PR, sin excepcion**, asi que esto no rompe un test viejo: **rompe el gate
  de todas las features siguientes**, en `dev`, el mismo dia. Y no es un problema sin solucion
  conocida: **`dev` ya arreglo exactamente este antipatron dos veces**, y una de las dos entro en el
  merge que esta rama absorbio:
  - `tests/unit/unidades/modulo-intacto.test.ts` -> `esLaRamaDeQC39()` mas `ctx.skip(...)` ruidoso
    cuando la rama no es la suya, mas **casos sinteticos** para que el detector siga mordiendo
    (L120-155, L250-273).
  - `tests/unit/identity/account-status-scope.test.ts` -> `esLaRamaDeQC65()` mas `tocadosOMudo()`,
    mismo criterio (L216-336, L447-462). **Este archivo lo toca esta misma ficha**, asi que el
    patron estaba literalmente delante.

  La bitacora lo ve y lo nombra, pero la justificacion que da —es el mismo riesgo que los cinco
  retensados de `recipe-route-contract.test.ts`— **no se sostiene**: esos casos afirman que el diff
  **NO contiene** cosas prohibidas, asi que con diff vacio **pasan**. Los cuatro de aqui afirman que
  el diff **SI contiene** algo. No es el mismo patron; es el contrario.
- **Que falta para cumplirlo:** aplicar a `scope.test.ts` el patron que ya esta en el repo: un
  `esLaRamaDeQC66(tocados)` puro y exportado, `ctx.skip(...)` explicito cuando la rama no es la
  suya, y los casos sinteticos en los dos sentidos para que el detector no quede sin probar. No hay
  que relajar ningun `expect`; hay que distinguir «no estoy en mi rama» de «no pude mirar».
  Mientras eso no este, R43, R46 y R47 quedan **sin guardia efectiva** en `dev`.

### 3.2 MENORES

**menor-1 — `tests/unit/errores/catalogo.test.ts` pierde `username` del vocabulario prohibido.**
L210: el regex pasa de `credential|password|session|login|account|username` a
`credential|password|session|login|account`. Era inevitable para admitir `duplicate_username`, y el
caso gana siete aserciones nuevas y conserva el conteo literal (32) y los cinco codigos de
autenticacion prohibidos. Pero el efecto neto es que un codigo de **autenticacion** que nombre
`username` (p. ej. `username_taken`) ya no lo caza el vocabulario. La proxima ficha que toque el
catalogo deberia reponerlo como prohibicion por familia en vez de por palabra.

**menor-2 — `updateAliveInCompany` bloquea a TODOS los administradores activos de la empresa en CADA
edicion.** `lib/modules/identity/adapters/driven/persistence/user-admin-prisma.ts` L596: el
`SELECT ... FOR UPDATE` se toma siempre, incluso cuando el objetivo no es administrador o cuando el
rol pedido **no cambia**. Correcto (nunca de menos), pero serializa todas las ediciones de usuario de
una misma empresa detras del mismo conjunto de filas. Ningun requisito lo prohibe y con los volumenes
de hoy no se nota; no esta declarado en ningun sitio y conviene que lo este.

**menor-3 — `P2003` funde «rol inexistente» y «tipo de documento inexistente» en `role_not_found`.**
Declarado en la bitacora. **R18 se cumple** (rechaza sin escribir ninguna fila), pero el `code` miente
sobre el campo cuando lo que no existe es el tipo de documento, y QC-67 lo va a consumir. Si QC-67
quiere senalar el campo correcto hay que reabrir el puerto.

**menor-4 — P3 queda cerrada de hecho en un sentido, aunque el texto diga que sigue abierta.**
`lib/modules/identity/domain/update-user.ts` L68: `if (id === actor.id) throw new SelfOperationError()`.
El archivo lo explica de frente (L54-67) y la lectura es la que **el texto de R21 sostiene** (la
edicion es reemplazo completo y el rol es uno de los nueve campos), asi que **no lo cuento como
apartarse de una decision**. Pero el efecto practico es que el actor no puede editarse **nada**, y eso
es una de las dos respuestas posibles a P3. El humano deberia cerrarla formalmente antes de QC-67, que
es quien tiene que decidir si ofrece el camino.

**menor-5 — la cabecera de las SEIS copias de `list-query.ts` sigue diciendo «los cinco modulos».**
Declarado en la bitacora y fuera del alcance (la guardia compara texto: o las seis o ninguna). La
guardia **si** quedo en seis, que es donde vive el ancla, asi que el ancla no se afloja.

**menor-6 — el checkpoint de E2E para flujo critico queda sin marcar.** La feature toca permisos y no
trae E2E. La excepcion es legitima (decision cerrada 17, R46, declarada en `design.md > 14` y no al
final, precedente QC-43 -> QC-44, y literalmente no hay pantalla que visitar), pero `CHECKPOINTS.md`
no contempla excepcion escrita para esa linea (solo para la de UI multiplataforma). Queda anotado para
que QC-67 lo herede **explicitamente** y no se pierda.

**menor-7 — `toBirthDate` vive exportada desde `create-user.ts`.** Su sitio natural es un
`domain/birth-date.ts`. Declarado en la bitacora; `update-user.ts` la importa de ahi, asi que la
conversion sigue siendo **una**, que es lo que importaba.

**menor-8 — el alta gasta un bcrypt por entrada valida antes de conocer el resultado del indice.**
`create-user.ts` L110: el hash se pide despues de `zod` pero **antes** del `INSERT`, asi que un alta
que choque con un duplicado paga el coste completo de bcrypt. Es la consecuencia inevitable de la
forma del puerto (seccion 4.1 del diseno, que es lo que hace R16 una propiedad del tipo) y **se
acepta**; se anota para que nadie lo lea manana como un descuido.

**menor-9 — el ciclo real de migracion no lo re-ejecute.** Los comandos de base de datos me quedaron
bloqueados en este entorno. R44 lo doy por bueno con **dos** apoyos: el test estatico
`user-permissions-migration.test.ts` (11 casos, corrido verde, con sensibilidad en disco documentada
para el `ON CONFLICT` y para el orden del `down.sql`) y la salida de T19 pegada en la bitacora
(13 -> 11 entradas, 14 -> 12 asignaciones, `_prisma_migrations` 23 -> 22 -> 23, cero fallidas). **El
leader deberia volver a correr el ciclo** si quiere R44 verificado de primera mano.

---

## 4. Trazabilidad: que comprobe y como

**49 de 49 requisitos tienen un test nombrado en la bitacora, y el test NOMBRADO EXISTE.** No lo tome
por bueno: extraje los titulos reales de `it(...)` de los nueve archivos de test de la feature y los
coteje uno a uno contra el mapa. **Cero titulos inventados.** Dos matices de forma, ninguno un hueco:
los tres casos de R21 de `admin-guards.test.ts` viven en un bucle con titulo de plantilla (L191), y los
dos de sesion incompleta de R6 viven en dos `describe` con `it` parametrizado (L385, L407).

### 4.1 Los nueve que verifique con SONDA (altere produccion, corri, y la asercion cayo; revertido)

Una asercion que pasa con y sin el codigo no cubre nada. Estas caen:

| Requisito | Sonda aplicada | Resultado |
| --- | --- | --- |
| R1, R2 | `requirePermission` fuera de `list-users.ts` | `authorization.test.ts`: **6 de 10 casos rojos** |
| R49 | `accountStatusChangedBy` escrito en el `create` del adaptador | `user-crud.int.test.ts`: **24 rojos** |
| R35 | quitada la exclusion del propio actor en `get-user.ts` | `user-service.test.ts`: **1 rojo**, el de R35 |
| **R23** | **`FOR UPDATE` borrado del bloqueo** | `last-administrator.int.test.ts`: **las TRES corridas rojas** |
| R22 (edicion) | `leavesTheSet = false` en `updateAliveInCompany` | **1 rojo**: «cambiarle el rol a otro distinto del administrador...» |
| R16 | la fabrica devuelve la candidata en claro en vez del hash | `credential-factory.test.ts`: **2 rojos** |
| R16 | un `console.log` en la Server Action del alta | `scope.test.ts`: **1 rojo**, el de R16 |

**La sonda de R23 es la que me importaba y es la que cierra el riesgo real de la ficha.** Con el
`FOR UPDATE` fuera, las tres corridas fallan. Ademas lei el montaje: **dos `PrismaClient` distintos**
(L300-301), cada uno con **su propia instancia del adaptador de produccion** via `vi.doMock` de
`@/lib/shared/db/prisma` **con comprobacion de que el doble quedo en vigor** (L77-88), una **barrera**
que fuerza el solape (L105-116) y dos `pg_backend_pid()` comparados (L320-333). **No son mocks del
repositorio y no es una sola conexion: es la carrera de verdad contra Postgres.**

### 4.2 Los que verifique leyendo el cuerpo del test y/o el codigo de produccion

R3, R4, R5 (la tabla `NO_AUTORIZADOS` de `authorization.test.ts` cubre actor `null`/`undefined`,
conjunto vacio, campo ausente, **conjunto que es una cadena** y **conjunto que es un objeto** — seis
actores por seis casos de uso, y `esperarRechazoSinTocarNada` afirma `not.toHaveBeenCalled()`), R6 (las
dos caras de la sesion y los dos casos de sesion incompleta), R8, R9, R12 (diff de `permissions.ts`:
trece entradas, los dos codigos en `SEED_ROLE_PERMISSIONS[ROLE_ADMINISTRADOR]` uno a uno,
`ROLE_OPERADOR` intacto, y la **enmienda a QC-74 R1 escrita con esas palabras**), R13, R14, R15, R17,
R18, R19, R20, R21, R24, R25, R26, R31, R32, R33, R34, R37, R39, R40, R41, R43, R45, R46, R47, R48,
R49.

### 4.3 Los SEIS que tome por buenos sin abrir el cuerpo del test

Los declaro para que quede dicho: **R7** (lo cierra `guard-rls-force.test.ts`, que corri verde pero no
lei; el diseno explica bien por que un test de RLS con Prisma mentiria), **R10** y **R11**
(idempotencia del seed y de la migracion: corri verdes `seed-initial-access.test.ts`,
`identity-seed.int.test.ts` y `user-permissions-migration.test.ts`, sin leer sus cuerpos), **R36**
(`guard-contrato-listados.test.ts` con seis modulos, verde, 20 casos), **R42**
(`guard-arquitectura-modulos.test.ts`, verde) y **R44** (ver menor 9). De R27-R30 lei los titulos y el
codigo de produccion correspondiente (`defaultOrderBy`, `userOrderBy`, `TIE_BREAKER`, el `select`
enumerado) pero no el cuerpo de los casos de integracion.

---

## 5. Las cinco cosas que el implementer declaro, auditadas de frente

**1. `identity` como sexto modulo del catalogo de QC-70, enmendando su R25 — CORRECTO.**
La enmienda esta **escrita y no disimulada** en la cabecera de
`lib/modules/errores/domain/error-codes.ts`: dice literalmente «**Esto enmienda QC-70 R25**», explica
que **la premisa caduco** y acota el alcance con la frase que importa: «el rechazo generico del login
de QC-7 **NO cambia** [...] lo que entra aqui es la ADMINISTRACION de usuarios, no la autenticacion».
Los **nueve** codigos finales de `domain/errors.ts` son **exactamente** los pedidos: `unauthorized`,
`user_not_found`, `duplicate_email`, `duplicate_username`, `duplicate_document`, `role_not_found`,
`self_operation`, `last_administrator`, `invalid_input`. Los siete nuevos entraron en los **tres**
sitios (`ERROR_CODES`, `ERROR_MESSAGE_KEY`, `ERROR_MESSAGES_ES`). **El login de QC-7 esta intacto**:
`verify-credentials.ts` y los `resolve-session*.ts` **no aparecen en el diff neto**, ningun codigo de
autenticacion entro al catalogo, y el caso que lo vigila sigue prohibiendo los cinco.

**2. El renombrado `not_found` -> `user_not_found` y `NotFoundError` -> `UserNotFoundError` —
CORRECTO.** `grep -rn "RoleUserNotFoundError"` en todo el arbol: **vacio**. `RoleNotFoundError` sigue
con su nombre y su `code` `role_not_found`. Los `not_found` de los otros cinco modulos: **intactos**
(inventario, pedidos, proveedores, recetas y unidades siguen devolviendolo como resultado
discriminado). Y las ocurrencias conservadas dentro de `identity` son **todas** contrato interno o
comentario: `GuardedOutcome` (puerto L121), la union de `updateAliveInCompany` (puerto L200, adaptador
L593), los `return count === 1 ? 'ok' : 'not_found'` (adaptador L630, L697), los tres
`if (outcome === 'not_found')` de los casos de uso guardados y los `expect(outcome)` del test de
integracion. **Ni un `code` de error sin migrar.**

**3. El ripple de DIEZ archivos ajenos — CORRECTO, ninguno quedo mas debil.**
Filtre el diff de los diez por lineas **borradas** que contuvieran `expect(`, `it(`, `describe(`,
`toEqual`, `toContain` o `skip`. **Todas** las borradas son conteos reemitidos con el numero nuevo
(11->13, 12->14, 25->32), titulos reescritos que ya mentian, o el parrafo de premisa caduca. Ni un
`toEqual` degradado a `toContain`, ni un caso saltado, ni un `expect` perdido. Dos archivos **ganan**
casos (`permissions.test.ts` +2, `catalogo.test.ts` +1 con siete aserciones).
`tests/unit/errores/catalogo.test.ts` en particular: el conteo **sigue siendo literal** (32), el caso
de R25 pasa a vigilar lo que R25 protegia de verdad, y solo salieron los tres `duplicate_*` de la
lista de prohibidos y `username` del regex; lo unico que se puede llamar aflojamiento esta en el
**menor-1**, y es una palabra del vocabulario, no una expectativa.
`tests/unit/identity/account-status-scope.test.ts` es un **retensado ejemplar**: la lista sigue
comparandose con **igualdad exacta**, los diez sitios nuevos van **nombrados uno a uno y agrupados por
motivo**, y el tercer caso forzado nombra su excepcion en vez de filtrar una carpeta entera.

**4. El error ajeno al dominio ya no se relanza — CORRECTO, y R41 no se viola.**
`user-actions.test.ts` L533-556: el test afirma el **estado completo**
(`status: 'error'`, `code: 'unexpected'`, `message: errorMessage('unexpected')`), que la serializacion
**no contiene** el texto original, **y la entrada del log**
(`expect(log).toHaveBeenCalledWith({ code: 'unexpected', cause: ajeno })`). El error **no se
descarta**: se propaga al registro del servidor con su causa. Sin aserciones perdidas.

**5. Los dos tests compartidos con QC-78 — CORRECTO, aditivos y rotulados.**
`git diff --numstat 192842a HEAD`: `tests/unit/composition/identity-facade.test.ts` **+37 / -0** (cero
deleciones, como declara) y `tests/unit/identity/account-status-scope.test.ts` **+64 / -7**, con las
siete borradas siendo el parrafo caduco y dos titulos. El bloque de QC-66 va **rotulado**
(`RETENSADO 2026-09-10 (QC-66)`) y **separado** al final de `SITIOS_PERMITIDOS`, sin reordenar ni
reformatear nada de lo que trajo `dev`, precisamente para que QC-78 entre al lado.
`lib/composition/index.ts` tambien es **+77 / -0**. El merge de QC-78 entrara sin conflicto de linea.

---

## 6. Las cinco divergencias declaradas en `design.md > 16`: estan en el codigo?

| # | Lo que declara | Verificado |
| --- | --- | --- |
| 1 | `not_found` -> `user_not_found` por el catalogo de QC-70, enmendando su R25 | **SI.** Seccion 5, puntos 1 y 2 |
| 2 | `meta.target` de los dos indices funcionales trae la EXPRESION, asi que se compara por subcadena | **SI.** `writeFailureOutcome` compara por marcas disjuntas (`email`, `username`, `document_number`) y **relanza** lo que no encaje; los siete casos de integracion de R17 lo ejercitan, incluido el contraste de otra empresa y los insensibles a mayusculas |
| 3 | `identity-seed.int.test.ts` SI tenia un literal (`toBe(12)`) | **SI.** Esta en el diff, pasa a 14 |
| 4 | El ripple fueron NUEVE (diez con `catalogo.test.ts`), no seis | **SI.** Los diez estan en el diff y los corri verdes |
| 5 | Falta el puerto del `ListQueryLog`; se creo como sexta copia | **SI.** `ports/list-query-log.ts` existe y se cablea a la **misma** implementacion compartida |

**Ninguna de las cinco contradice un requisito ni una de las 18 decisiones cerradas.** La 1 cambia un
literal del contrato y la cerro el humano; la 2, 3, 4 y 5 son correcciones de hechos que el diseno
tenia mal medidos. Tambien revise los **dos desvios** de `> 7` y `> 9.3`: `updateAliveInCompany` gana
`last_administrator`, y **esta bien** — sin eso R22 se quedaba **sin implementar en la edicion, en
silencio**; el bloqueo sigue en **un solo sitio** (`lockActiveAdministratorIds`, reutilizado por los
dos metodos) y lo probe con sonda.

---

## 7. Lo que tenia que pasar si o si

1. **Trazabilidad completa** — **SI.** 49/49, comprobado titulo a titulo, nueve con sonda.
2. **R38-R48 con guardias que muerdan** — **SI en la rama, NO en `dev`.** Las ocho aserciones de
   `scope.test.ts` tienen sensibilidad y dos de ellas las verifique yo mismo; pero cuatro dejan de
   comprobar cualquier cosa en cuanto esto entre a `dev`, y se ponen rojas al hacerlo. **Ese es
   MAYOR-1.** Lo que SI esta cerrado de verdad, por lectura del codigo y no por comentario: cero
   menciones a `failed_login_attempts`/`lock_level`/`locked_until` en produccion, cero cambios en
   `db/schema.prisma`, cero migraciones de indices, cero archivos bajo `app/`/`components/`/`e2e/`, y
   la contrasena sin via de salida.
3. **Autorizacion en el service, primera linea, fallando cerrado, en los seis** — **SI.**
   `requirePermission(actor, ...)` es la **primera sentencia** de los seis casos de uso (leido archivo
   por archivo: `create-user.ts` L104, `get-user.ts`, `list-users.ts`, `update-user.ts` L49,
   `delete-user.ts`, `set-user-account-status.ts` L49), **antes de zod y antes de cualquier puerto**.
   Ninguna policy de RLS se usa como sustituto. `usuarios.consultar` en las dos consultas,
   `usuarios.modificar` en las cuatro escrituras, sin implicacion entre ambos.
4. **La contrasena generada no sale por ninguna via** — **SI, y lo busque activamente.** El puerto
   devuelve **solo el hash**, la candidata no sale del cuerpo de `createRandomCredentialHash`, el
   error de agotamiento nombra **las reglas** y no lleva `cause`, el resultado del alta es el
   identificador y nada mas, los mensajes salen del catalogo fijo, y `grep -rn "console\."` sobre
   `lib/modules/identity/` no devuelve **ninguna** escritura real en archivos de esta feature (las
   coincidencias son comentarios que dicen que no hay ninguna; el unico `console.warn` real es de
   `route-guard-middleware.ts`, ajeno y preexistente). Las dos sondas de R16 caen.
5. **R49 / decision 18** — **SI.** El `create` del puerto tiene **cinco** parametros y **ninguno** es
   autor (`ports/user-admin-repository.ts` L143 y alrededores); el adaptador no escribe
   `accountStatusChangedBy` en el alta (`user-admin-prisma.ts` L271-291) y **si** lo escribe al mover
   el estado (L693). La sonda que lo rellena pone 24 casos rojos.
6. **La carrera del ultimo administrador (T17)** — **SI, es real.** Dos `PrismaClient`, dos instancias
   del adaptador, comprobacion de que el doble quedo en vigor, barrera de solape, dos
   `pg_backend_pid()`, tres corridas, y el caso simetrico con tres administradores que impide el verde
   por rechazar siempre. **Sin `FOR UPDATE` cae.** Ni mocks ni una sola conexion.

---

## 8. Lo que NO conte como hallazgo

- `app/layout.tsx(43,56) LayoutProps`: lo resuelve el leader con un build. **Ademas ya no aparece**:
  el typecheck salio **limpio**.
- **P1, P2 y P3 siguen abiertas a proposito** y el codigo no las resuelve, que es lo correcto. Lo que
  si juzgue es si el codigo **presupone** una respuesta sin decirlo: **no lo hace en P1 ni en P2**
  (nada de lo implementado las toca), y en **P3 si elige una lectura, pero lo dice con todas las
  letras** en `update-user.ts` L54-67, con el coste del cambio escrito. Queda como **menor-4**, no
  como hallazgo de ocultacion.
- **Rojos ajenos:** no encontre ninguno. Los cuatro que la bitacora declaraba estan apagados (dos los
  apago el merge con `dev`, dos los arreglo `dev` con el patron de rama) y el de `app/layout.tsx`
  tambien.

---

## 9. Veredicto final

**RECHAZADO** — un hallazgo mayor (**MAYOR-1**: `scope.test.ts` rompe el gate de `dev` en cuanto este
PR entre, y deja R43, R46 y R47 sin guardia efectiva alli). Vuelve al implementer: el arreglo es
aplicar a `scope.test.ts` el patron `esLaRamaDeQC66()` mas `ctx.skip` mas casos sinteticos que **ya
esta escrito dos veces en `dev`**, sin relajar ningun `expect`. Los nueve menores **no** bloquean; el
menor-1, el menor-2 y el menor-4 convendria atenderlos o anotarlos antes de QC-67, que es quien
consume este contrato.

Con MAYOR-1 resuelto, y a falta del ciclo real de migracion (menor-9) y del `./init.sh` completo del
leader, **esta ficha pasa**: la autorizacion, el aislamiento por empresa, la no-fuga de la credencial,
R49 y la carrera del ultimo administrador estan implementados y **probados de verdad**.

---
---

# SEGUNDA RONDA — 2026-09-10

> El informe de arriba **no se borra**: que MAYOR-1 existio es parte del historial de la ficha.
>
> Estado revisado: HEAD **`214127b`**, base de fusion con `origin/dev` en **`752dc58`** (entro
> **QC-78** completo). Arbol **limpio** en todas las mediciones (`git status --porcelain` vacio), que
> es la unica forma de medir una guardia de alcance sin falsos rojos. Sigo sin editar codigo: las
> ocho sondas de esta ronda se aplicaron, se corrieron y se revirtieron en el mismo paso.
>
> No se re-revisa la feature entera. Se revisan los siete puntos del encargo.

## S1. MAYOR-1: **CERRADO**. Verificado con sonda, no por lectura

`tests/unit/identity/usuarios/scope.test.ts` pasa de 8 casos a **16**, y el reparto que el
implementer declara es **real y no una reclasificacion**:

| Familia | Casos | Depende de git? | En `dev` limpio |
| --- | --- | --- | --- |
| el rango resuelve | 1 | si, y **falla** si no resuelve | **muerde** |
| CONTENIDO (R43, R38, R45, R47, R16, R24) | 6 | **no** | **muerde** |
| CAMBIO (R43 x2, R46, R47, R45) | 5 | si | **`skipped` con motivo** |
| sinteticos (detectores y desenlaces) | 4 | **no** | **muerde** |

**Once de los dieciseis muerden para siempre; cinco quedan bajo el salto.** La cuenta del
implementer («siete afirman sobre contenido») es conservadora: son 6 de contenido mas el del rango, y
ademas los 4 sinteticos.

**Los tres desenlaces, comprobados uno a uno** (no me fie del comentario):

1. **Rango sin resolver -> ROJO.** Sonda: cambie `origin/dev` por `origin/NO-EXISTE` en los dos
   helpers. Resultado: **6 rojos** —el caso dedicado del rango mas los cinco de la familia B, que
   fallan porque `archivosTocados()` **lanza**—. **Cero saltados en silencio.** Es lo contrario de lo
   que hacia el codigo viejo, que devolvia la lista vacia y dejaba que el ancla confundiera «no puedo
   mirar» con «no hay nada que mirar».
2. **Rama ajena o diff vacio -> `skipped` CON MOTIVO IMPRESO.** Sonda: apunte
   `ARCHIVO_CENTRAL_DE_QC66` a un archivo inexistente, que es simular `dev` limpio. Resultado:
   **10 pasados, 5 `skipped`, 0 rojos**, y el reporter imprime el motivo completo en cada uno
   («...esta NO es la rama de QC-66, asi que este caso NO ha comprobado nada. R43, R46 y R47 son el
   alcance de ESA ficha...»). **No es un salto silencioso**, que era mi condicion explicita. El
   desenlace «diff vacio» tiene ademas su propio caso sintetico, que inyecta la lista vacia en el
   mismo helper y afirma que **salta** en vez de fallar, y que la nota contiene `VACIO` y
   `NO ha comprobado nada`.
3. **Rama propia -> vigila.** Los 16 pasan hoy sobre esta rama.

**La respuesta a la pregunta que importa: ¿siguen R43, R46 y R47 con guardia efectiva sobre `dev`
limpio?**

- **R43 — SI.** Su mitad de contenido es **mas fuerte** que la que sustituye: ya no dice «ninguna otra
  migracion esta en el diff» sino «**esta** migracion, nombrada por su ruta literal, **existe**, es de
  DATOS, no lleva ni un `ALTER`, `CREATE` ni `DROP` **ni en el UP ni en el DOWN**, y sus dos `INSERT`
  son idempotentes». Sonda: pegue un `ALTER TABLE` al **`down.sql`** —el camino que antes nadie
  miraba— y el caso **cayo**.
- **R47 — SI, y tambien mas fuerte.** Ver S2.
- **R46 — NO, y es correcto que no la tenga.** Queda solo bajo el salto, asi que en `dev` no vigila
  nada. **Estoy de acuerdo con el motivo y lo firmo**: «esta ficha no anade pantalla» es un hecho
  **historico de la rama**, no una propiedad del arbol, y **QC-67 va a crear `app/(private)/usuarios/`
  con pleno derecho**. Una guardia de contenido del tipo «esa carpeta no existe» bloquearia a QC-67 —
  que es, literalmente, el error que `tests/unit/unidades/modulo-intacto.test.ts` cometio y tuvo que
  deshacer—. R46 es de la familia del cambio **por naturaleza**. Lo dejo dicho para que nadie lo
  «complete» dentro de tres meses; el propio archivo lo advierte en su cabecera (L62-67).
- **R45 y R38** ganan con el cambio: R38 ya era de contenido y ahora lleva ancla positiva (la
  migracion de QC-47 **si** nombra los tres indices, asi que el `not.toContain` no mide aire).

**Y el salto no vacio la guardia**, que era el riesgo de adoptar el patron: los 4 casos sinteticos
ejercitan los cuatro detectores **con y sin violacion** y la deteccion de rama **en los dos
sentidos**, incluidos los diffs de QC-67 y de QC-78 como negativos. De hecho mi sonda 2 los puso a
prueba sin querer: al romper el detector, el caso «y ninguno muerde con el alcance legitimo» **se puso
rojo**. Un detector roto no pasa desapercibido.

**MAYOR-1 queda cerrado.** No es cosmetico: lo que antes se apoyaba en un rango git ahora se apoya en
el disco, y lo que sigue dependiendo del rango lo hace distinguiendo los tres desenlaces.

## S2. R47 quedo mas fuerte, y no abrio ningun agujero

Las dos mitades conviven y cubren cosas distintas:

- **Contenido:** las **cinco** candidatas que `design.md > 13` descarto —`generate-password`,
  `nanoid`, `secure-random-password`, `libphonenumber-js`, `validator`— **no estan instaladas**, leido
  del `package.json` y con **ancla positiva** (`bcryptjs` si esta, asi que el manifiesto se leyo de
  verdad y el bucle no pasa por vacuidad). Muerde en cualquier rama y para siempre. Sonda: declare
  `nanoid` en `devDependencies` y el caso **cayo**.
- **Cambio:** esta rama no toco `package.json` ni `pnpm-lock.yaml`. Esta mitad es la que se salta en
  `dev`, y es correcto: esos archivos existen y **las demas fichas los cambian con permiso**.

**¿Y una dependencia nueva que NO sea una de las cinco?** Sigue cayendo, y lo comprobe: declare
`left-pad` —que no esta en la lista de las cinco— y
`tests/guards/guard-dependencias-aprobadas.test.ts > toda dependencia de package.json tiene su fila en
el registro` **se puso rojo**. Esa guardia es **generica** (exige fila en `docs/dependencias.md` para
**cualquier** nombre), es del repositorio, **no se salta nunca** y no depende de ningun rango git. El
reparto es coherente: QC-66 prohibe **por nombre** lo que su propio diseno descarto, y el arnes sigue
prohibiendo **por regla** todo lo demas. **Ningun agujero.**

## S3. El quinto caso y la particion de R45 — juzgado como hallazgo propio

El implementer encontro un quinto caso con el mismo defecto que MAYOR-1 —la mitad de R45 que mide las
lineas anadidas a `lib/composition/index.ts`, que es un archivo **preexistente y compartido**— y
partio R45 en dos. **La particion es correcta y ninguna mitad se quedo sin guardia**, y lo verifique
con una sonda por mitad:

- **Mitad de CONTENIDO** (los archivos que la ficha **crea**, medidos enteros, sin git, para siempre,
  con ancla positiva sobre el dueno del mecanismo): sonda con `lockedUntil` en una linea nueva del
  adaptador Prisma -> **rojo**.
- **Mitad de CAMBIO** (solo las lineas que esta rama **anade** al punto de composicion): sonda con
  `lockedUntil` anadido al final de `lib/composition/index.ts` -> **rojo**.

Que esta segunda mitad sea de rama es **forzoso y no una comodidad**: medir `lib/composition/index.ts`
entero acusaria en falso a QC-78, que es la **dueña** del mecanismo de bloqueo y lo nombra ahi con
pleno derecho. Y el que importa —el de los archivos propios— no depende de git.

**Un detalle de metodo que me toco a mi**, y lo dejo escrito porque es el mismo consejo que el
implementer aprendio a su costa: mi primera sonda de esta mitad salio **verde** y estuve a punto de
anotarla como hueco. No lo era: habia escrito `sondaLockedUntil`, y la busqueda es por **subcadena
exacta y sensible a la caja**, asi que `LockedUntil` no coincide con `lockedUntil`. Con la grafia
exacta cae. Las seis grafias vigiladas cubren las dos formas reales —las tres columnas en
`snake_case` y los tres campos del cliente Prisma en `camelCase`—, que son las unicas que un codigo de
verdad puede escribir. No es un hallazgo; es una nota para el siguiente que sondee esto.

## S4. El merge de QC-78: nada de QC-78 se reescribio, y la guarda fusionada vigila de verdad

`git diff --numstat 752dc58 HEAD` sobre los archivos compartidos:

| Archivo | numstat | Lectura |
| --- | --- | --- |
| `tests/unit/composition/identity-facade.test.ts` | **+37 / -0** | aditivo puro |
| `tests/unit/recetas-ui/recipe-route-contract.test.ts` | **+19 / -1** | su bloque `MIGRACION_QC66` y su filtro |
| `lib/composition/index.ts` | **+77 / -0** | aditivo puro |
| `tests/unit/identity/account-status-scope.test.ts` | +540 / -481 | git lo rinde como reescritura **por los terminadores CRLF**, no porque se reescribiera |

Para el cuarto **no me fie del numstat** y compare **estructuralmente** contra `dev`:

- **Los 18 casos de `dev` siguen siendo los mismos 18**: ni uno eliminado, ni uno anadido. Las dos
  unicas diferencias son los dos titulos que QC-66 ya habia reescrito en la primera ronda, porque los
  anteriores **mentian**.
- **`SITIOS_PERMITIDOS`: las 13 entradas de `dev` estan las 13, en su orden original y al principio**
  —incluidas las ocho de QC-78 (`effective-account-status.ts`, `verify-credentials.ts`,
  `resolve-session.ts`, `session-user-prisma.ts`, `user-credentials-prisma.ts`,
  `login-attempt-recorder.ts`, `session-user-reader.ts`, `user-credentials-reader.ts`)—, y las **10**
  de QC-66 van **detras**, en su bloque rotulado. 13 + 10 = **23**. Union limpia: **nada de QC-78 se
  reordeno, reformateo ni perdio.**

**Y la guarda fusionada vigila algo real. Confirmado con tres sondas, porque la igualdad hay que
verla fallar:**

- La comparacion es `expect(queLoNombran).toEqual([...SITIOS_PERMITIDOS].sort())`, **igualdad en los
  dos sentidos** contra un barrido del arbol (`lib/`, `app/`, `components/`, `hooks/` mas
  `middleware.ts`), con dos anclas de barrido (mas de 100 archivos y `middleware.ts` presente) y un
  ancla positiva (el esquema y la migracion **si** nombran el estado).
- **Borre una entrada de QC-78** (`effective-account-status.ts`) -> **ROJO**.
- **Borre una entrada de QC-66** (`user-actions.ts`) -> **ROJO**.
- **Cree un archivo de produccion nuevo que nombra el estado** fuera de la lista -> **ROJO**.

Asi que es **imposible que pase con entradas perdidas**, en las dos direcciones: tu hipotesis se
confirma. (Aviso de metodo: mi primer intento de esta sonda salio verde y **era mio**, no del test — el
archivo tiene terminadores **CRLF** y mi patron buscaba `,` seguido de salto de linea Unix, asi que no
borro nada. Lo anoto porque es exactamente la clase de falso negativo que hace que una re-revision
firme algo que no comprobo.)

## S5. La frontera con QC-78: mi lectura independiente

**Respondiendo con tus palabras: NO existe ningun requisito de QC-66 que obligue a devolver el estado
EFECTIVO.** Lo comprobe requisito a requisito: R29 habla del «filtro por estado de cuenta», R31 de que
la fila traiga «el estado de cuenta», R32 de la ficha, y R25/R26 del conjunto cerrado de QC-65 —
**ninguno dice «efectivo»**, y el concepto no existia cuando se aprobo este spec—. Mas aun: **R45 le
PROHIBE a QC-66 leer `locked_until`**, que es precisamente el dato que hace falta para calcular el
efectivo. Devolver el efectivo habria sido **violar R45**. Asi que el implementer tiene razon y **no
hay hallazgo por esa via**: cada ficha cumplio su alcance y que la pantalla decida que muestra es de
QC-67. **Queda firmado.**

La consecuencia que el implementer declara es real y es la **benigna**: una fila almacenada `blocked`
con `locked_until` **vencido** sale `blocked` en el listado y en la ficha, mientras el login la deja
entrar (QC-78 R8). Eso es un dato **rancio en la pantalla**, visible y corregible por la propia
pantalla de QC-67.

**Pero al verificarlo encontre la mitad peligrosa de la misma frontera, y esa si es hallazgo propio.**
Va abajo como MAYOR-2.

## S6. Los 9 menores: las cinco justificaciones se sostienen

Lei las cinco y **ninguna hay que subir**:

| # | Justificacion | Mi lectura |
| --- | --- | --- |
| menor-1 | prohibir por **familia** y no por palabra es un cambio del diseno de la guardia de **QC-70**, no de esta ficha | **Se sostiene.** Es un argumento de **propiedad**, el correcto. Lo que esta ficha controlaba lo dejo mas tenso (conteo literal 32, los cinco codigos de autenticacion prohibidos, +7 aserciones). El hueco residual queda anotado |
| menor-3 | el motor **no da el dato** (`constraint: null`, medido); distinguirlos exige otro resultado en el puerto | **Se sostiene.** R18 se cumple (rechaza sin escribir), el limite esta escrito en el adaptador, y reabrir el puerto es una decision de alcance que no le toca (regla 6) |
| menor-4 | no hay opcion neutra; la cierra el humano antes de QC-67 | **Se sostiene.** Ya en la primera ronda no lo conte como apartarse de una decision. Sigue pendiente **de decision humana**, no de codigo |
| menor-5 | la guardia compara **texto**: o las seis copias o ninguna, y cinco son ajenas | **Se sostiene.** El ancla vive en la guardia, y la guardia **si** quedo en seis. Cambiar cinco archivos ajenos por una palabra de comentario seria peor |
| menor-8 | es inherente a la forma del puerto, que es lo que hace **R16 una propiedad del tipo**; invertir el orden obligaria a crear la fila **sin credencial** | **Se sostiene, y el argumento es mejor que mi objecion.** Crear la fila sin credencial es peor que pagar un bcrypt en el camino del duplicado |

Y los cuatro atendidos, verificados: **menor-7** (`lib/modules/identity/domain/birth-date.ts` existe y
lo importan `create-user.ts` y `update-user.ts` — la conversion sigue siendo **una**), **menor-2** (el
coste del bloqueo declarado en el docblock del adaptador), **menor-6** (el E2E heredado por QC-67,
escrito en la cabecera de `scope.test.ts` L69-74), **menor-9** (ver S7).

## S7. R44, ahora de primera mano: le doy el peso que merece

El ciclo real esta re-ejecutado y pegado con sus conteos: **13 entradas / 14 asignaciones ->
rollback -> 11 / 12 -> migrate -> 13 / 14**, `_prisma_migrations` **23 -> 22 -> 23** con cero
fallidas, `migrate status` en «up to date», y los 7 archivos de integracion de `identity` en verde
despues. Eso es exactamente lo que R44 pide —«deja el catalogo y sus asignaciones como estaban antes de
aplicarla»— **comprobado sobre una base real y en las dos direcciones**, y ademas vuelve a ejercitar el
camino de «instalacion ya en marcha» (el rol `Administrador` existe, asi que el `INSERT ... SELECT` si
inserta sus dos asignaciones).

**Retiro menor-9.** R44 deja de apoyarse en un informe de segunda mano. Sigo sin poder re-correrlo yo
—los comandos de base me quedan bloqueados en este entorno—, y lo digo para que conste, pero la
evidencia pasa de «declarada» a «ejecutada y transcrita con sus conteos en las dos direcciones», que es
el estandar de `docs/verification.md`. No hay razon para seguir descontandolo.

## S8. Mi propia verificacion ejecutable de esta ronda

Arbol limpio en todas ellas:

```
pnpm run typecheck   -> CERO errores
pnpm exec eslint .   -> sin salida, exit 0

vitest run tests/unit/identity tests/unit/composition tests/unit/errores tests/guards
           tests/integration/identity
  -> Test Files  81 passed (81)   |   Tests  1263 passed | 7 skipped (1270)

vitest run tests/unit/recetas-ui/recipe-route-contract.test.ts tests/unit/unidades
           tests/unit/navegacion
  -> Test Files  28 passed (28)   |   Tests  429 passed | 8 skipped (437)

tests/unit/identity/usuarios/scope.test.ts (verbose) -> 16 passed (16)
```

**Cero rojos y cero rojos ajenos.** Las ocho sondas de esta ronda quedaron revertidas
(`git status --porcelain` vacio).

## S9. Hallazgos NUEVOS de esta ronda

### MAYOR-2 — Al salir de `blocked` a mano, el plazo de bloqueo NO se limpia, y el desbloqueo no surte efecto

**NO BLOQUEA ESTE PR** (la clasificacion y su motivo, abajo). Es para el humano y para QC-67.

- **Donde:** `lib/modules/identity/domain/set-user-account-status.ts` (no toca el plazo, y R45 se lo
  prohibe) frente a `lib/modules/identity/domain/effective-account-status.ts` L66-74 y **QC-78 R11**.
- **Que pasa, paso a paso:**
  1. La politica de intentos bloquea una cuenta: escribe `account_status = blocked` **y**
     `locked_until = ahora + plazo` (QC-78 R13).
  2. Un administrador usa la operacion de QC-66 para moverla a `active`. Se escribe el estado, el
     instante y el autor — y **no se toca `locked_until`** (R45, decision cerrada 13).
  3. **QC-78 R11 es literal**: «SI `locked_until` es un instante todavia futuro, ENTONCES el estado
     efectivo DEBE ser `blocked` **aunque el estado almacenado sea `active`**». El codigo lo implementa
     tal cual (`isLocked(...)` antes de mirar el estado almacenado), y `verify-credentials.ts` L201
     rechaza el login con el efectivo.
  4. Resultado: **el desbloqueo manual no surte efecto hasta que el plazo caduque solo**, y el listado
     y la ficha muestran `active`, que ahora es **el dato equivocado en la direccion peligrosa**. El
     administrador hizo la operacion, el sistema le dijo que fue bien, y la persona sigue sin entrar.
- **Esto NO es un descuido del implementer, y por eso no lo bloqueo.** QC-66 **no puede** arreglarlo sin
  violar su propia **R45** y la **decision cerrada 13** («limpiar el contador de intentos fallidos al
  salir de `blocked` **es de QC-78**»). Y QC-78 hizo su parte: **su R24 publica el mecanismo** —
  `clearedLockState()`, contador a cero, nivel a cero, plazo vacio— y su propio texto dice, entre
  parentesis, «**la operacion que mueve el estado a mano es de QC-66**; esta ficha entrega el mecanismo
  que esa operacion tiene que aplicar». Los dos specs, los dos aprobados, se reparten el trabajo de
  forma que **nadie lo hace**.
- **Comprobado, no deducido:** `grep -rn "clearedLockState"` en todo el arbol devuelve **la
  declaracion y tests, y NINGUN llamador de produccion**. La funcion existe, esta probada, y no la
  llama nadie.
- **Que falta, y de quien es:** una **decision humana**, no un parche. Dos salidas limpias: (a) enmendar
  **R45 / decision 13** para que `setUserAccountStatus` aplique `clearedLockState()` cuando el objetivo
  **sale de** `blocked` —coste medido: un campo mas en `GuardedChange`, tres columnas en el `UPDATE` que
  ya existe, y su caso de test; el dominio y el resto del puerto no se mueven—; o (b) una ficha propia
  que cablee el mecanismo de QC-78 R24 a la operacion de QC-66. **Hasta que se decida, QC-67 no debe
  ofrecer un boton de «desbloquear»**, porque parecera funcionar y no funcionara.
- **Por que MAYOR y por que NO bloqueante:** es mayor porque es una perdida de funcionalidad silenciosa
  en un camino de seguridad, y porque lo descubri verificando, no leyendo una declaracion. No es
  bloqueante **de este PR** porque no lo introduce este codigo ni puede repararlo: bloquear aqui
  obligaria al implementer a violar R45 o a quedarse quieto esperando al humano, y un bloqueante no es
  para eso. **Pido que quede anotado en `progress/current.md > Deudas y cosas abiertas` antes del
  merge**, con la consecuencia escrita, para que no lo descubra una persona que no puede entrar.

### menor-10 — `birth-date.ts` se quedo fuera de las tres listas de contenido de `scope.test.ts`

- **Donde:** `tests/unit/identity/usuarios/scope.test.ts`, `DOMAIN_NUEVO` (L210-224) y el ancla
  `expect(ARCHIVOS_NUEVOS_DE_LA_FEATURE.length).toBe(20)` (L606).
- **Que pasa:** el disco tiene **21** archivos de produccion nuevos
  (`git diff --name-status --diff-filter=A 752dc58 HEAD -- lib/`), y la lista nombra **20**. El que
  falta es `lib/modules/identity/domain/birth-date.ts`, **creado en esta misma ronda por el arreglo de
  menor-7**. Consecuencia: las mitades de contenido de **R45** y **R24**, y el barrido de **R16**, **no
  lo leen**; y el ancla `toBe(20)` **congela el numero equivocado**, asi que no se queja.
- **Por que es menor y no mayor:** el archivo omitido es un convertidor de fecha civil de ~40 lineas
  que no puede nombrar ni un contador de bloqueo ni el literal del rol, y sigue cubierto por
  `guard-arquitectura-modulos` (R42) y por los tests de dominio. Pero es **exactamente** el modo de
  fallo contra el que advierte el comentario de ese mismo bloque («un archivo olvidado saldria verde
  por no estar en la lista»), y el siguiente archivo que se anada lo hara peor.
- **Arreglo:** una linea en `DOMAIN_NUEVO` y `20` -> `21`. Por si solo **no justifica otra vuelta**.

## S10. Veredicto de la segunda ronda

**APROBADO.**

- **MAYOR-1: CERRADO**, y no de forma cosmetica. Verificado con tres sondas que reproducen los tres
  desenlaces: rango sin resolver -> **6 rojos**; rama ajena o diff vacio -> **5 `skipped` con el motivo
  impreso, 0 rojos**; rama propia -> **16 en verde**. Once de los dieciseis casos muerden para siempre,
  incluidas las mitades de contenido de R43 y R47, que quedaron **mas fuertes** que lo que sustituyen.
  R46 se queda sin guardia en `dev` y **firmo que es correcto**: una guardia de contenido ahi
  bloquearia a QC-67.
- **Nuevos: 1 mayor y 1 menor.** **MAYOR-2** (el desbloqueo manual no limpia el plazo, asi que no surte
  efecto) **no bloquea este PR**: no lo introduce este codigo, QC-66 no puede repararlo sin violar su
  R45, y QC-78 ya publico el mecanismo que nadie llama. Necesita **decision humana** y quedar anotado en
  `progress/current.md > Deudas`. **menor-10** (`birth-date.ts` fuera de las listas de contenido) es de
  una linea y no justifica otra vuelta.
- **Las cinco justificaciones de los menores se sostienen**; ninguna se sube. **menor-9 retirado**: R44
  esta verificado de primera mano en las dos direcciones.
- **El merge de QC-78 esta limpio**: 13 de 13 entradas suyas intactas y en su orden, los 18 casos del
  archivo compartido intactos, y la guarda fusionada **imposible de pasar con entradas perdidas**
  (comprobado borrando una de QC-78, una de QC-66 y anadiendo un archivo fuera de la lista: rojo las
  tres veces).
- **Mi verificacion:** typecheck en cero, lint limpio, **109 archivos de test y 1692 casos en verde**
  entre los dos lotes, cero rojos ajenos, arbol limpio.

Puedes correr `./init.sh` completo y abrir el PR. Las dos unicas cosas que pido que **no** se pierdan
en el camino: **MAYOR-2 anotado como deuda con su consecuencia escrita** —y que QC-67 no ofrezca
«desbloquear» hasta que se decida—, y **menor-10** recogido por quien toque ese archivo la proxima vez.
