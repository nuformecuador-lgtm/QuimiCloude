# QC-78 — estado-de-cuenta-en-el-acceso · review

> Fase **F2.2**. Worktree `.worktrees/QC-78-estado-de-cuenta-en-el-acceso`,
> rama `feature/QC-78-estado-de-cuenta-en-el-acceso` en `a1a4a2b`, base de fusion
> `origin/dev` = `c870825`. Base propia `QuimiCloude_QC78`.
> No se abrio PR, no se sincronizo con `dev`, no se decidio el paso a F2.3.
> **Todo lo que se afirma aqui se midio ejecutando**; las mutaciones aplicadas estan
> listadas al final y **todas quedaron revertidas** (`git status --porcelain` vacio).

## Veredicto

**OK** — 0 hallazgos mayores, 7 menores.

Con una condicion de cierre que **no es de la ficha** y que decide el leader: `./init.sh`
termina en **rojo** por 3 errores de typecheck heredados de `dev` (`tests/unit/recetas/*`,
`ProductRef.stock`). Ninguno esta en el diff de QC-78. Hasta que el leader los arregle o los
meta en `tests/baseline-rojos.json`, la casilla «`./init.sh` termina en verde» de
`CHECKPOINTS.md` no se puede marcar. Ver menor 5.

---

## Checklist

### Especificacion
- [x] `requirements.md` con R1..R30 en EARS, mas el bloque `## Ampliacion del 2026-09-10` que
      explica el bucle, el mecanismo medido en tres piezas y **las tres salidas descartadas** con
      aquello contra lo que choca cada una.
- [x] `design.md` con alternativas descartadas y su porque (siete: el archivo aparte, el SQL, el
      `UPDATE` al leer, el puerto nuevo, exportar por el barrel, el corte por estado almacenado,
      la cookie/cabecera en vez de la URL).
- [~] `tasks.md`: T1–T15 y T19–T26 en `[x]`. **T16, T17 y T18 siguen en `[ ]`** y las tres dicen
      en su propio enunciado «*las corre el leader*». Ver menor 6.

### Trazabilidad — R1..R30, abriendo cada test
- [x] Los 30 requisitos tienen al menos un test **que verifica lo que dice verificar**. Se
      abrieron los casos, no se leyo la tabla. Matices en R5 (menor 1) y en la segunda mitad de
      R30 a (menor 3).
- [x] `progress/impl_...md` contiene el mapa `R<n> -> test` completo (28 + 2).

### Alcance declarado (la correccion del 2026-09-10)
- [x] El diff toca **exactamente** los 40 archivos declarados, mas `specs/QC-78-.../` y la
      bitacora. **Ni uno fuera de la lista, ni uno de la lista sin tocar.** Comprobado con
      `git diff --name-status c870825..HEAD` archivo por archivo contra la numeracion 1–40 de
      `tasks.md`.
- [x] La lista de «archivos que esta ficha NO toca» es coherente con el diff:
      `db/schema.prisma`, `db/migrations/**`, `package.json`, `pnpm-lock.yaml`,
      `lib/composition/index.ts`, `lib/modules/identity/index.ts`, `account-lock.ts`,
      `account-status.ts`, `middleware.ts`, `components/**`, `logout-action.ts`,
      `login-action.ts`, `app/(public)/login/page.tsx` y
      `tests/unit/identity/schema/identity-schema.test.ts` **no aparecen**.
- [x] La derogacion parcial de la exclusion `app/**` + `adapters/driving/**` esta tachada,
      fechada y acotada a tres archivos, y **solo esos tres** entraron.

### Calidad de codigo
- [ ] `pnpm run typecheck`: **rojo, 3 errores, los tres ajenos** (menor 5).
- [x] `pnpm run lint`: exit 0, sin salida.
- [x] Suite completa (`pnpm run test:json`): 295 archivos, 5 fallidos, 3813 pasados,
      14 saltados. De los 5 rojos, 3 estan en `tests/baseline-rojos.json` y **2 son los de
      `recetas` heredados**. **Cero rojos de `identity`. Cero rojos nuevos de QC-78.**
- [x] Flujo critico (autenticacion) con E2E. **Ejecutado por el reviewer**:
      `e2e/session.spec.ts` en chromium, `3 passed (34.3s)`, exit 0.
- [x] UI: la ficha no toca UI. El unico archivo bajo `app/` cambia una linea de `redirect`.
      La regla multiplataforma no aplica y `design.md > 7` lo declara.
- [x] Dependencias: `package.json` y `pnpm-lock.yaml` sin cambios (R27), con guardia propia.

### Datos y seguridad
- [x] Ninguna tabla, columna, enum ni migracion nueva (R26). Nada que declarar de RLS.
- [x] Aislamiento por empresa: ningun modelo nuevo en `db/schema.prisma`. El corte de empresa
      de QC-48 queda intacto y con su test.
- [x] El borde sigue **sin tocar la base** (`tests/guards/guard-middleware-edge.test.ts` verde).
- [x] Acceso a datos solo por Prisma. Ni un cliente de Supabase.
- [x] Ningun secreto hardcodeado. Ningun webhook nuevo.

### Modulos hexagonales
- [x] `effective-account-status.ts` es dominio puro: importa solo `account-lock` y
      `account-status` del propio dominio. Sin `next/*`, sin Prisma, sin `lib/shared`.
- [x] `route-access.ts` sigue sin importar `lib/shared`: el nombre de la marca **entra por
      parametro**, igual que `privatePrefixes` y `routes`.
- [x] `lib/composition/index.ts` y `lib/modules/identity/index.ts` sin tocar; la interseccion
      con QC-66 y QC-83 sigue vacia.
- [x] Las 25 guardias de `tests/guards/` en verde.

---

## Los ocho puntos, uno por uno

### 1. Trazabilidad R1..R30 abriendo cada test
Se abrieron los casos citados. **Ninguno esta vacio y ninguno mide otra cosa que lo que dice**,
con el matiz de los menores 1 y 3.

Lo que se comprobo con especial cuidado, porque son las filas donde un mapa se cae:
- **R3** no se afirma con `toEqual` sino con `toBe` (identidad referencial) entre los tres
  rechazos, **mas** un `Object.keys(...)` igual a la lista con solo «ok», que es lo que impide
  que alguien le cuelgue un `reason` manana.
- **R2** no se afirma solo con un contador: hay un caso que **congela la promesa del hasher** y
  comprueba que el caso de uso todavia no ha respondido. Un contador solo no distingue orden.
- **R30 b** no se afirma con literales: compara con `toEqual` la decision **con marca** contra
  la **misma peticion sin marca**. Un literal pasaria igual si las dos ramas cambiaran a la vez.
- **R18** se afirma tambien **contra Postgres real**, midiendo el `where` del `updateMany`.

### 2. R2 y R3 — el oraculo
- El estado se evalua en la linea 201 de `verify-credentials.ts`; `hasher.verify` en la 170.
  **Siempre exactamente una verificacion**, tambien en los tres caminos no-`active` y en el de
  usuario inexistente (senuelo). Medido con contador **y** con la promesa congelada.
- El rechazo es **la misma instancia congelada** `REJECTED` en los cinco caminos. Sin campo,
  sin codigo, sin mensaje: las claves del objeto son exactamente una, «ok».
- **No encontre grieta.** El `SELECT` no gana `WHERE` por estado, el adaptador devuelve el valor
  **crudo** y el contrato de salida sigue siendo el mismo par de siempre.
- Residuo de tiempo, medido y **no atribuible a esta ficha**: con contrasena mala, el camino
  `pending` / `inactive` no escribe y por tanto responde antes que el de una cuenta `active` con
  contrasena mala, que si escribe. Esa diferencia **no confirma existencia**: coloca a la cuenta
  no activa en el mismo grupo que el usuario inexistente, que es la direccion segura. La
  diferencia «existe y esta activa» frente a «no existe» ya existia desde QC-7 y QC-19; QC-78 no
  la ensancha, la estrecha.

### 3. R5 y R6 — pending e inactive no escriben nada
- El corte esta **antes** del `!correcta`, o sea antes de `registrarFallo`. La asimetria con
  QC-48 esta escrita en el comentario del archivo con su motivo y su contrapartida.
- **Nadie lo uniformo.** Verificado leyendo y verificado con test: `compareAndSet` y `set` con
  `toHaveBeenCalledTimes(0)` para los dos estados, con contrasena correcta e incorrecta, y la
  fila releida entera contra Postgres en el test de integracion del login.
- **Pero el orden no esta atado por ningun test** (mutacion M3, menor 1).

### 4. R15 — bloqueada con el plazo vacio
Busque activamente el camino y **no existe**:
- Los dos unicos escritores son `compareAndSetLoginAttempt` y `setLoginAttempt`, y los dos
  escriben `lockedUntil` y `accountStatus` **en el mismo `data`**.
- `accountStatusAfterAttempt` solo manda escribir «blocked» cuando el plazo nuevo **no** es
  nulo, y ese mismo plazo es el que se persiste. La combinacion es **inconstruible**.
- Camino de exito: el estado limpio siempre trae plazo nulo, y con plazo nulo la funcion nunca
  manda «blocked» (manda «active» si venia de bloqueada, y nada si no).
- Una fila que ya esta bloqueada **sin** plazo da efectivo bloqueada y **corta en el paso 6**:
  no llega a ninguna escritura.
- Mutacion M4 pone **6 casos en rojo** en dos archivos.

### 5. R18 y R19 — la escritura condicional, contra Postgres
- El `where` del CAS lleva id, `failedLoginAttempts`, `lockLevel`, el estado de cuenta esperado
  y el `OR` de rango sobre `lockedUntil`. El predicado de **rango** que evita el ABA quedo
  intacto: no aparece como linea modificada en el diff.
- **Probado contra Postgres real**, no solo leido: el test de integracion fabrica la carrera
  exacta —leer, cambiar el estado por fuera, escribir tarde— y afirma que la escritura **no
  aplica** y que la fila no se movio. **Mutacion M8**, quitar el estado del `where`, pone ese
  caso en rojo.
- R19: al releer, si el fresco ya no es efectivamente activo, se abandona sin escribir. Cubierto
  en unit con `it.each` sobre inactiva y bloqueada con plazo futuro.

### 6. R30 b — la propiedad de un solo sentido
**Verificado con mutaciones propias, no leido.**
- La marca se lee **dentro** del `if` del paso 3, que solo se evalua cuando el camino pedido es
  el login. Los pasos 1, 2 y 4 no la ven.
- **Mutacion M2**: filtrar tambien el paso 2 por la marca —que es como se convertiria en un
  agujero: un anonimo con la marca entrando a una ruta privada— pone **5 casos en rojo**, entre
  ellos «la marca no deja entrar a un anonimo en una ruta privada» del adaptador. La propiedad
  **esta defendida de verdad**.
- **El residuo de `buildLoginRedirect`: CONFIRMADO, y su inocuidad tambien.** El destino de
  vuelta codifica camino **mas** cadena de consulta entera, asi que un anonimo que pida
  `/dashboard?sesion=fin` acaba en `/login?next=%2Fdashboard%3Fsesion%3Dfin`: la marca viaja
  **dentro** del destino de vuelta. **No vuelve a disparar R29 en el salto siguiente**, y lo
  comprobe: `traeMarcaDeSesionCortada` construye un `URLSearchParams` con la query **del login**,
  donde el unico parametro es `next`, asi que el `has` devuelve falso. Hay un test que cierra el
  circulo y **mete el login resultante otra vez por la decision**, comprobando que sigue
  redirigiendo por `already-authenticated`. **Lo confirmo.** Lo que **no** confirmo es que eso
  cumpla la letra de R30 b — ver menor 2.
- Consecuencia verificable de R30 b: para alguien con sesion legitima que escriba la URL a mano,
  el unico efecto es ver el formulario publico de login en esa peticion. Confirmado.

### 7. R29 cubre TRES cortes
- Los tres —baja logica de QC-8 R11, empresa no viva de QC-48 R15 y estado de QC-78 R20— salen
  por el mismo `return null` de `resolve-session.ts` y por **los mismos dos** `redirect`.
- La marca es **identica** para los tres **por construccion**: ni el layout ni
  `requirePagePermission` saben por que fallo la resolucion —los dos reciben nulo— y los dos
  usan la **misma constante** `LOGIN_ROUTE_SESSION_ENDED`. No hay rama por corte. R30 a se
  cumple sin esfuerzo, y el E2E de baja logica lo afirma comparando la query final contra la
  constante en vez de contra un literal copiado.
- **`require-page-permission.ts` quedo cubierto.** No basta el layout, y aqui se hizo bien:
  layout y pagina se renderizan en la misma peticion y cualquiera puede ganar el `redirect`.
  **Mutacion M5**, devolverlo a la ruta pelada, pone en rojo `require-page-permission.test.ts`
  **y los ocho casos** de `tests/unit/navegacion/pantallas-exigen-permiso.test.tsx`.
- Barrido propio: buscar `LOGIN_ROUTE` sobre `app/`, `lib/`, `components/` y `middleware.ts`
  deja **un solo** consumidor con la ruta pelada, `logout-action.ts`, que **borra la cookie** y
  por tanto no puede entrar en bucle. Correctamente excluido. Los demas consumidores de
  `getSessionUser()` del repo son Server Actions que devuelven error, no redirigen.
- E2E: dos de los tres cortes ejercitados de punta a punta (menor 4).

### 8. R26 y R27 — el alcance
- `db/schema.prisma`, `db/migrations/`, `package.json` y `pnpm-lock.yaml` **sin cambios**,
  comprobado en el diff y por la guardia `qc78-alcance.test.ts`, que mide sobre el rango **mas
  el arbol de trabajo** con `--untracked-files=all`.
- Esa guardia **no es una bomba de relojeria**: precondicion **conjuntiva**
  (`effective-account-status.ts` **y** algo bajo `specs/QC-78-.../`), tres situaciones con dos
  severidades —«no puedo mirar» es rojo que lanza; «no es lo mio» y «no hay nada que mirar» son
  saltos ruidosos que dicen que NO han comprobado nada— y cuatro anclas independientes del
  rango. En `dev`, tras el merge, el rango queda vacio y salta en vez de morder a fichas ajenas.

---

## El contador de redirecciones del E2E: **mide lo que dice medir**

Es el punto que mas me preocupaba, porque un test de bucle mal medido es peor que no tenerlo. El
implementer declara que su primera version sumaba toda respuesta 3xx y que `next dev` sirve
chunks con **304**, asi que el test dependia de la cache. **Lo comprobe por mutacion, no por
lectura.**

Mutacion **M10**: se devolvio el layout al login pelado **y** se hizo que la regla 3 redirigiera
al login **con** la marca en vez de al destino de vuelta. Eso fabrica una navegacion que **acaba
en el login igualmente** pero con **dos** redirecciones de documento en vez de una, que es justo
lo que un contador roto no distinguiria. Resultado:

    Error: la salida al login debe costar UNA redireccion y costo 2:
      http://localhost:3117/inventario -> http://localhost:3117/login
    Expected length: 1 / Received length: 2

El contador distinguio 1 de 2, listo los dos saltos por su URL y **no se colo ni un 304** pese a
correr contra `next dev` con la cache fria. El filtro por `resourceType` de documento mas la
exclusion explicita del 304 hacen lo que prometen. **Este test si mide el bucle.**

---

## Hallazgos

### menor 1 — R5 esta bien implementado, pero su ORDEN no lo ata ningun test
R5 exige evaluar el corte **antes** de registrar el intento fallido. El codigo lo hace. Pero la
**mutacion M3** —mover el corte por estado **debajo** del bloque que llama a `registrarFallo`,
que es literalmente la «uniformizacion» contra la que R5 avisa— deja
`tests/unit/identity/verify-credentials.test.ts` en **56 passed (56)** y el test de integracion
del login en verde.

La razon es que `registrarFallo` tiene **su propio** corte por estado efectivo al principio del
bucle, asi que el efecto observable —R6: no se escribe nada— se conserva aunque el orden se
invierta. O sea: la ficha esta bien y R6 esta atado; lo que no esta atado es R5.

Y **`design.md > 11` riesgo 1 afirma «hay test para cada uno de los dos ordenes»**. Para el
corte de empresa si; **para el de estado, no**. Esa frase es hoy falsa.

*Que falta:* un caso que afirme el orden —por ejemplo con puertos falsos que registren la
secuencia de invocaciones, o comprobando que con una cuenta pendiente y contrasena incorrecta el
lector se invoca **una sola vez** y `registrarFallo` no llega a entrar—; o, si se prefiere,
corregir esa frase de `design.md > 11`.

### menor 2 — R30 b dice «ni en el destino de vuelta» y la marca si acaba ahi
R30 (b) es explicito: la marca «NO DEBE persistirse (ni en cookie, ni en la sesion, **ni en el
destino de vuelta**) ni propagarse a la navegacion siguiente». `buildLoginRedirect` codifica
camino mas cadena de consulta entera, asi que un anonimo que pida `/dashboard?sesion=fin` acaba
en `/login?next=%2Fdashboard%3Fsesion%3Dfin` y, tras autenticarse, **aterriza en
`/dashboard?sesion=fin`**: la marca persistio en el destino de vuelta y se propago a la
navegacion siguiente.

Es **inocuo** y lo verifique: no re-dispara R29, no cambia ninguna decision fuera del login, y
el propio test lo cierra metiendo el login resultante otra vez por `decideRouteAccess`. Ademas
solo ocurre si **el propio usuario** escribe la marca a mano; la redireccion del corte lleva
**solo** la marca, sin destino de vuelta.

Pero **`design.md > 10.2` afirma «la marca no viaja en el `next`»** sin matizar, y eso es
inexacto: cierto para la redireccion del corte, falso para el paso 2. La bitacora del
implementer si lo declara como residuo; el diseno no.

*Que falta:* o acotar la redaccion de R30 b y de `design.md > 10.2` al caso que de verdad
importa —«la redireccion del corte no lleva destino de vuelta»—, o hacer que
`buildLoginRedirect` elimine el parametro de la marca de la cadena que empaqueta. Es decision de
spec, no de codigo, y la elige el humano.

### menor 3 — la segunda mitad de R30 (a) no tiene test propio
«la pantalla de login DEBE renderizarse **igual** con la marca y sin ella: ni mensaje, ni aviso,
ni cambio visible alguno». No hay ningun test que compare los dos renders. Lo que hay es (a) el
argumento estructural —`app/(public)/login/page.tsx` solo lee el parametro de destino de vuelta
e ignora el resto, y no esta en el diff— y (b) el paso 5 del E2E, que afirma que el formulario
se ve y que no hay ningun toast. Es cobertura parcial, no la igualdad que pide el requisito.

*Que falta:* un caso que renderice la pantalla con y sin la marca y compare el marcado, o dejar
dicho en el mapa que esa mitad se cubre por argumento estructural mas ausencia de aviso.

### menor 4 — de los tres cortes de R29, solo dos se ejercitan de punta a punta
`e2e/session.spec.ts` cubre el corte por estado (R20) y el de baja logica (QC-8 R11). El de
**empresa no viva (QC-48 R15)** queda cubierto solo por construccion: mismo `return null`, misma
constante en los dos `redirect`. El argumento es solido —no hay rama por corte— y T25 pedia «al
menos uno» de los dos preexistentes, asi que la tarea esta cumplida. Queda dicho para que nadie
lea el mapa y crea que los tres estan medidos en navegador.

### menor 5 — ./init.sh termina en ROJO, y el motivo es heredado de dev
Corrida completa por el reviewer en el worktree, con el `.env` de la ficha cargado:

    -> pnpm run typecheck
    tests/unit/recetas/recipe-lines-catalog.test.ts(33,7)   TS2741 stock missing in ProductRef
    tests/unit/recetas/recipe-lines-catalog.test.ts(155,51) TS2345
    tests/unit/recetas/recipe-service.test.ts(59,7)         TS2741
    x pnpm run typecheck fallo

Y los pasos restantes, corridos a mano porque el gate aborta ahi:

    pnpm run lint            -> exit 0
    pnpm run test:json       -> Test Files 5 failed | 290 passed (295)
                                Tests 5 failed | 3813 passed | 14 skipped
    comparar-baseline-rojos  -> hay 2 archivo(s) en rojo que NO estan en el baseline:
                                  tests/unit/recetas/recipe-lines-catalog.test.ts
                                  tests/unit/recetas/recipe-service.test.ts

**Los dos son el mismo defecto** —`ProductRef` gano `stock` y esos fixtures no lo llevan—, **no
estan en el diff de QC-78**, y el fallo en ejecucion es una comparacion de linea con 5 campos
contra una de 4, o sea la misma columna. Confirmo la medicion del leader. **El cuarto error, el
de `app/layout.tsx`, no se reprodujo**: mi typecheck da exactamente tres.

De los otros 3 archivos rojos de la suite, los 3 estan en `tests/baseline-rojos.json`
(`unidades-convenciones`, `unidades/modulo-intacto`, `recetas-ui/recipe-route-contract`).
`tests/integration/inventario/product-crud.int.test.ts` **paso** en esta corrida.

**Cero rojos de `identity`. Cero rojos atribuibles a QC-78.**

*Que falta:* decision del leader —arreglar los fixtures en `dev` o meterlos en el baseline con
su motivo y su fecha— antes de poder marcar «./init.sh termina en verde».

### menor 6 — T16, T17 y T18 siguen sin marcar
`CHECKPOINTS.md` pide todas las tasks en `[x]`. Las tres pendientes son, por su propio
enunciado, del leader: gate rapido por tanda, gate completo y revision con puerta humana. No es
deuda del implementer; queda anotado porque la casilla no se puede marcar hoy.

### menor 7 — dos afirmaciones caducas conviven sin matizar
El **primer** bloque de ampliacion de `tasks.md` (el de los ocho E2E) dice «los requisitos
aprobados siguen siendo R1..R28 y esta ampliacion **no anade ningun R29**», y la primera mitad
de la bitacora repite «no hay R29». Las dos eran ciertas cuando se escribieron y el **segundo**
bloque las deroga explicitamente, pero conviven en el mismo archivo sin una nota que diga cual
manda. Quien lea de arriba abajo se lo cree hasta la linea 84.

*Que falta:* una linea en el primer bloque que remita al segundo. Cosmetico.

---

## Cosas que se verificaron y NO son hallazgo

- **Los cinco E2E que el implementer atribuye a QC-75.** Confirmo la atribucion por el mismo
  camino que el leader: `login-action.ts` y `lib/shared/navigation/` **no aparecen** en el
  `git diff --name-only` contra la base de fusion. Anado un dato mas: los E2E de `session` que
  si son de esta ficha **pasan**, y el de `unidades` que ejercita `requirePagePermission` con
  sesion viva tambien, lo que descarta que la marca haya roto ese camino. Que el implementer no
  corriera la comparativa sobre la base de fusion es una limitacion **declarada por el**, y para
  estos cinco me basta: la causa esta en un archivo que la rama no toca. Si el leader lo quiere
  cerrar del todo, la corrida comparativa cuesta cuatro minutos.
- **La guardia de alcance de QC-65 se amplio sin relajarse.** Los sitios permitidos pasan de 5 a
  13, **uno por linea y con el requisito que lo autoriza**, y la comparacion sigue siendo
  `toEqual`, no `toContain`. `verify-credentials.ts` cambia de lado —de intocable de QC-19 a
  permitido— con la justificacion escrita: el propio `account-status.ts` de QC-65 dejo dicho que
  la unificacion «es QC-78». `route-access.ts` **sigue** en la lista de caminos sensibles y
  sigue sin nombrar el estado de cuenta. No se relajo ningun criterio.
- **El predicado de rango que evita el ABA** no aparece como linea modificada en el diff.
- **`lib/composition/index.ts` sigue intacto** pese a que cambiaron dos firmas de puerto: los
  parametros nuevos van **al final** y el cableado por nombre casa estructuralmente. La
  interseccion con QC-66 y QC-83 sigue vacia.
- **El punto ciego latente de `account-status-scope.test.ts`** (usa `git status --porcelain` sin
  `--untracked-files=all`) sigue ahi. Es de QC-65, ningun `R<n>` de QC-78 lo pide, y el
  implementer lo dejo anotado. Correcto no tocarlo; queda para el leader.

---

## Mutaciones aplicadas por el reviewer

Todas revertidas con `git checkout --`; `git status --porcelain --untracked-files=all` quedo
**vacio** al terminar (tambien se borro el `test-results/` que dejo Playwright).

| # | Archivo | Mutacion | Resultado | Revertida |
|---|---|---|---|---|
| M1 | `domain/route-access.ts` | quitar la excepcion de la marca en la regla 3 | **7 rojos** entre `route-access.test.ts` y `route-guard-middleware.test.ts` | si |
| M2 | `domain/route-access.ts` | filtrar tambien el **paso 2** por la marca (convertirla en agujero para el anonimo) | **5 rojos**, incluido «la marca no deja entrar a un anonimo en una ruta privada» | si |
| M3 | `domain/verify-credentials.ts` | mover el corte por estado **debajo** del `if (!correcta)`: la uniformizacion que R5 prohibe | **VERDE, 56/56** -> menor 1 | si |
| M4 | `domain/effective-account-status.ts` | mandar escribir «blocked» con el plazo vacio | **6 rojos** en dos archivos | si |
| M5 | `adapters/driving/require-page-permission.ts` | devolverlo al login pelado, sin marca | **9 rojos** (`require-page-permission` mas los 8 de `pantallas-exigen-permiso`) | si |
| M6 | `domain/resolve-session.ts` | borrar el sexto corte | **6 rojos** en `resolve-session.test.ts` | si |
| M8 | `adapters/driven/persistence/user-credentials-prisma.ts` | quitar el estado esperado del `where` del CAS | **1 rojo contra Postgres real**: «el CAS no aplica si el estado de cuenta cambio entre la lectura y la escritura» | si |
| M9 | `domain/effective-account-status.ts` | borrar la rama de bloqueo sin plazo (R9) | **2 rojos** | si |
| M10 | `app/(private)/layout.tsx` mas `domain/route-access.ts` | fabricar una navegacion que acaba en el login pero con **dos** redirecciones de documento | **rojo con el conteo exacto**: «costo 2», con los dos saltos listados -> el contador mide lo que dice | si |

M7 se fusiono con M4; no hay hueco en el codigo, solo en la lista de trabajo.

---

## Verificacion ejecutada

| Comando | Resultado |
|---|---|
| `./init.sh` (completo) | **ROJO en typecheck**, 3 errores heredados de `dev` (menor 5) |
| `pnpm run lint` | exit 0 |
| `pnpm run test:json` (suite completa) | 295 archivos, 5 rojos (3 en baseline mas 2 heredados), 3813 tests verdes |
| `node scripts/comparar-baseline-rojos.mjs` | 2 rojos fuera del baseline, **ambos ajenos** |
| `pnpm exec playwright test --project=chromium e2e/session.spec.ts` | **3 passed (34.3s)**, exit 0 |
| `pnpm exec vitest run tests/integration/identity/login.int.test.ts` | 20/20 contra `QuimiCloude_QC78` |
| 9 mutaciones | ver tabla |

**No se abrio PR, no se sincronizo con `dev` y no se decidio el paso a F2.3: eso lo decide el
leader con este veredicto delante.**
