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
