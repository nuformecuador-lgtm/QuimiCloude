# QC-93 — aterrizaje-sin-permiso-de-modulo · requirements.md

> **Zona** `fullstack` · **Complejidad** `medium` · **depends_on** ninguna ·
> **Rama** `feature/QC-93-aterrizaje-sin-permiso-de-modulo`
>
> **Alcance.** Devolver la premisa a los E2E de permisos, que hoy **no afirman nada**. Desde que
> QC-75 retiro la regla ruta -> rol, quien no es Administrador aterriza en **el primer item visible
> de su menu** —un Operador acaba en `/inventario`—, asi que todo caso que esperaba el dashboard
> quedo mintiendo. Se arreglan **los 23 fallos** que la suite completa da sobre base limpia, no solo
> los cuatro casos de «acaba fuera»: es una unica causa raiz. El destino se afirma **derivandolo del
> menu filtrado por los permisos de ese usuario**, nunca con una ruta fija, y el patron se
> centraliza en **un helper unico** que usan las trece suites. Entra ademas **un caso nuevo** en
> `login.spec.ts` para quien no tiene ningun permiso de modulo: entra, ve el 404 dentro del layout
> privado y puede cerrar sesion.
>
> **Lo que NO entra.**
> - **Cambiar los permisos del rol Operador.** Que no tenga `dashboard.consultar` es deliberado
>   (`lib/modules/identity/domain/permissions.ts:165`: solo `inventario.consultar` y
>   `asignaciones.consultar`). Darselo para que 23 tests pasen seria **cambiar el producto para
>   acomodar la prueba**, y traeria el dashboard a una pantalla de operario que nadie ha disenado.
> - **Tapar un agujero REAL de permisos.** Si al devolver la premisa se descubre que la proteccion
>   no esta en pie —que alguien **si** ve datos que no deberia—, eso es un hallazgo de seguridad con
>   ficha y prioridad propias: **se para y se reporta**. No se cuela en un arreglo de tests, que es
>   como se justifico esta ficha.
> - **Redisenar el aterrizaje o el 404.** Los dos ya existen: el primer item visible del menu con
>   `DASHBOARD_ROUTE` de respaldo (`login-action.ts:113-126`) y el 404 dentro del layout privado.
>   Se heredan de QC-75 y QC-90 y aqui **solo se comprueban**.
> - **La regla del correlativo, el plazo de los tests y el residuo entre corridas**: son QC-33,
>   QC-58 y QC-77, las tres cerradas o ajenas.
>
> *Sembrado por `/afinar-feature` el 2026-09-13. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijo el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aqui es `## Requisitos (EARS)`.*
## Requisitos (EARS)

### El helper unico y su contrato

**R1.** El sistema DEBE ofrecer **un unico** helper compartido bajo `e2e/helpers/`, con nombre de
archivo y de exportaciones **en ingles** (QC-4), que Playwright **no** recoja como archivo de test
(`playwright.config.ts:27` fija `testDir: 'e2e'`, y el `testMatch` por defecto solo casa
`*.spec.ts` / `*.test.ts`).

**R2.** El helper DEBE derivar el destino de aterrizaje **aplicando las mismas funciones de
produccion que usa el login** —`filterNavItemsByPermissions` y `firstVisibleNavHref` sobre
`PRIVATE_NAV_ITEMS` (`lib/shared/navigation/private-nav.ts:418` y `:452`, compuestas en
`lib/modules/identity/adapters/driving/login-action.ts:122-126`)— y NO DEBE reimplementar la regla,
ni copiar el orden del menu, ni mantener una segunda lista de prioridad.

**R3.** SI el menu filtrado de ese usuario no deja ningun enlace visible, ENTONCES el helper DEBE
devolver `DASHBOARD_ROUTE`, que es el mismo respaldo que aplica `login-action.ts:122-126`.

**R4.** El helper DEBE obtener los permisos **de la base de datos, a partir del `username`** con el
que se va a entrar (usuario vivo → rol → `role_permissions`), y NO DEBE aceptar una lista de
permisos, un nombre de rol ni un conjunto de codigos escrito en el archivo de test.

**R5.** SI no existe un usuario vivo con ese `username`, ENTONCES el helper DEBE fallar con un error
que **nombre el `username`**, y NO DEBE devolver un destino por defecto: un fixture mal sembrado
tiene que romper ruidosamente y no convertirse en un aterrizaje verde que no afirma nada.

**R6.** CUANDO una suite invoque el helper de entrada con la pagina y las credenciales, el sistema
DEBE rellenar el formulario real de login (`login-username`, `login-password`, `login-submit`),
esperar a que la URL sea el destino derivado por R2/R3 y **devolver ese destino** a quien lo llamo.

**R7.** El helper de entrada NO DEBE exponer ningun parametro con el que fijar el aterrizaje desde
el archivo de test. Congelar la premisa en la llamada es exactamente lo que dejo mudos estos casos
cuando QC-75 cambio la regla.

### La migracion de las trece suites

**R8.** Las **trece** suites que hoy llevan una copia del patron —`aislamiento-inventario`,
`errores`, `establecer-contrasena`, `grupos-de-trabajo`, `inventario`, `login`, `pedidos`,
`presentaciones`, `proveedores`, `recetas`, `recetas-pasos`, `unidades` y `usuarios`— DEBEN obtener
el destino del helper de R1, y ninguna DEBE conservar su propia funcion `login` con la ruta escrita
dentro ni una ruta literal como parametro de aterrizaje en la llamada.

**R9.** El gate DEBE fallar SI un archivo `e2e/**/*.spec.ts` vuelve a esperar una ruta fija como
aterrizaje despues de pulsar `login-submit`. La comprobacion tiene que vivir donde el gate la corra
(`pnpm run test:guardias`), porque `init.sh` **no** ejecuta Playwright y sin ella la copia numero
catorce nace sin que nadie se entere.

**R10.** Un flujo que llega a una pantalla privada por **destino de vuelta** (`returnTo`) NO DEBE
usar el helper de aterrizaje: ahi el destino lo fija la ruta pedida, no el menu, y `e2e/session.spec.ts`
y `e2e/permisos.spec.ts` DEBEN quedar tal como estan salvo que la corrida completa demuestre lo
contrario.

### Los cuatro casos de «acaba fuera»

**R11.** *(Enmendado el 2026-09-15.)* CUANDO el usuario de cada uno de los cuatro casos entre
—el fixture **Operador** en `e2e/pedidos.spec.ts` (R49), `e2e/proveedores.spec.ts` (R52) y
`e2e/recetas.spec.ts` (R6), y el usuario **sin `inventario.consultar`** de R25 en
`e2e/inventario.spec.ts` (R4)—, cada caso DEBE afirmar el aterrizaje **derivado de sus permisos**
mediante el helper de R1, y DEBE afirmar que ese destino **no es la ruta del modulo** que comprueba.
*Antes decia: «CUANDO el fixture Operador entre en los cuatro casos [...] cada uno DEBE afirmar el
aterrizaje derivado de sus permisos (hoy `/inventario`, por `permissions.ts:165`) y NO
`DASHBOARD_ROUTE`». Para los tres casos del Operador el destino derivado sigue siendo `/inventario`;
para el de inventario, `DASHBOARD_ROUTE` por el respaldo de R3. Ninguno se escribe a mano.*

**R12.** CUANDO ese usuario pida por URL la ruta del modulo que no puede consultar, los cuatro casos
DEBEN afirmar que la respuesta tiene **estado 404**, que **no hay redireccion** —la URL sigue siendo
la pedida— y que el 404 se pinta **dentro del layout privado**, con `private-not-found` visible. Es
el comportamiento heredado de QC-75/QC-90: aqui **solo se comprueba**.

**R13.** Los cuatro casos DEBEN seguir afirmando que **ningun dato del modulo llega al navegador**
(cuenta cero de los `data-testid` de titulo, tabla, lista y estado vacio) y DEBEN seguir nombrando en
su titulo el requisito de origen (`R4`, `R49`, `R52`, `R6`), para que la trazabilidad de esas fichas
no se pierda al reescribir el caso.

*(Nota de la enmienda del 2026-09-15.) Con el fixture Operador el caso de inventario (R4) **no
podia** cumplir R11-R13: el Operador tiene `inventario.consultar` (`permissions.ts:165`, QC-74 R9),
su destino derivado es `/inventario` y la pantalla le responde 200 con el catalogo
(`progress/impl_QC-93-... > 0.1.4`). Con el usuario de R25, R11-R13 se exigen **a los cuatro casos
sin salvedad**, y «ese usuario» de R12 y R13 es, en el caso de inventario, el de R25.*

### El usuario sin `inventario.consultar` del caso de inventario (enmienda del 2026-09-15)

**R25.** El caso de `e2e/inventario.spec.ts` que conserva la etiqueta `R4` DEBE entrar con un usuario
cuyo rol **no tenga `inventario.consultar`**, y NO DEBE usar el fixture Operador ni ninguno de los
roles que siembra el seed, que tienen ese permiso los dos (`permissions.ts:150` y `:165`).

**R26.** Antes de entrar, ese caso DEBE afirmar con el helper de R1, **leyendolo de la base**, que los
permisos de su usuario no contienen `inventario.consultar`. SI los contuvieran, ENTONCES el caso DEBE
fallar en esa afirmacion, y NO DEBE seguir hasta un verde que ya no comprobaria lo que dice su titulo.

**R27.** El rol de ese usuario DEBE ser **efimero de la propia suite**: nace en su preparacion con el
prefijo y el `RUN_ID` de la suite, sin ninguna asignacion de permisos, y su usuario pertenece a la
misma empresa efimera en la que el Administrador de la suite da de alta el catalogo. Al terminar, la
suite DEBE borrarlo **despues** de sus usuarios. NO DEBE crear, modificar ni borrar ningun rol del
seed ni ninguna fila de `role_permissions`.

**R28.** SI una corrida anterior interrumpida dejo ese rol huerfano, ENTONCES la limpieza defensiva de
la suite DEBE borrarlo junto con sus usuarios, aunque esos usuarios sean recientes, y NO DEBE fallar
por la FK usuario→rol (`onDelete: Restrict`).

### El caso nuevo de `login.spec.ts`

**R14.** El sistema DEBE anadir **un solo** caso nuevo, y DEBE vivir en `e2e/login.spec.ts`, para un
usuario cuyo rol **no tiene ningun permiso de modulo**.

**R15.** CUANDO ese usuario entre con credenciales correctas, el sistema DEBE llevarlo al destino que
el helper derive de sus permisos —que por R3 es `DASHBOARD_ROUTE`—, y el caso DEBE afirmarlo con el
destino derivado, no con la ruta escrita a mano.

**R16.** MIENTRAS ese usuario este en la zona privada, el sistema DEBE mostrarle el 404 **dentro del
layout privado**: `private-not-found` visible, el armazon privado presente (`private-nav`) y el
control de cerrar sesion presente (`private-logout`).

**R17.** CUANDO ese usuario pulse cerrar sesion, el sistema DEBE dejarlo en el login, y volver atras
NO DEBE devolverlo a la zona privada.

**R18.** SI ese usuario llega a ver contenido de algun modulo —cualquier `data-testid` de datos de
inventario, recetas, pedidos, proveedores, unidades, presentaciones o usuarios—, ENTONCES es un
**agujero real de permisos**: el trabajo DEBE detenerse y reportarse con ficha propia, y NO DEBE
arreglarse en esta pasada. El caso nuevo DEBE incluir esa comprobacion explicita (cuenta cero), que
es lo que convierte la decision en algo que alguien nota.

### Limites de alcance (requisitos negativos)

**R19.** El sistema NO DEBE cambiar `lib/modules/identity/domain/permissions.ts`: el rol Operador
DEBE seguir teniendo exactamente `inventario.consultar` y `asignaciones.consultar`
(`permissions.ts:165`).

**R20.** El sistema NO DEBE redisenar el aterrizaje ni el 404: `login-action.ts:113-126`,
`lib/shared/navigation/private-nav.ts` y `app/(private)/not-found.tsx` DEBEN quedar sin cambios.

**R21.** El diff de la feature DEBE ser **vacio** en `app/**`, `lib/**`, `db/**`, `scripts/**`,
`package.json` y `pnpm-lock.yaml`. Lo unico que se toca es `e2e/**` y la guardia de R9 bajo
`tests/guards/**`.

**R22.** El sistema NO DEBE incorporar ninguna dependencia nueva: todo lo que el helper necesita ya
esta en el repo (`@playwright/test`, el cliente Prisma compartido `@/lib/shared/db/prisma` y las
funciones de navegacion de `@/lib/shared/navigation`).

### Verificacion

**R23.** El sistema DEBE ejecutar la **suite E2E completa, en Chromium y WebKit, sobre base limpia**,
antes y despues del cambio, y DEBE escribir los dos resultados en el PR. Un `./init.sh` verde no
dice nada de esta feature: el gate no corre Playwright.

**R24.** Despues del cambio, la corrida completa NO DEBE dejar ningun rojo cuya causa sea el
aterrizaje derivado del menu. Todo rojo que quede DEBE tener en el PR una causa nombrada, distinta de
esta y con destino propio (ficha o baseline).

### Cobertura de las decisiones cerradas

| Decision (fila de la tabla de abajo) | Requisitos que la cubren |
|---|---|
| 1 · los 23 fallos, no solo los cuatro | R8, R23, R24 |
| 2 · destino derivado del menu filtrado | R2, R3, R4, R7, R11, R15 |
| 3 · un helper unico para las trece suites | R1, R6, R8, R9 |
| 4 · caso nuevo en `login.spec.ts` | R14, R15, R16, R17 |
| 5 · se arregla el test, no el permiso | R19 |
| 6 · agujero real de permisos: parar y reportar | R18 |
| 7 · aterrizaje y 404 heredados, no se redisenan | R12, R16, R20 |
| 8 · verificacion: E2E completa, dos motores, base limpia | R23, R24 |
| 9 · cuatro casos «acaba fuera» y el dano medido | R11, R12, R13, R23 |
| 10 · identificadores en ingles | R1 |
| 11 · (2026-09-15) caso de inventario con un rol sin el permiso; el del Operador no se toca | R11, R12, R13, R19, R25, R26, R27, R28 |

## Preguntas abiertas

Ninguna.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-09-13 | ¿Se arreglan los cuatro casos de la ficha o los 23 fallos de la suite? | **Los 23.** Es una unica causa raiz —quien no es Administrador no aterriza donde el test cree— y partirla dejaria media suite rota, con dos fichas tocando los mismos archivos |
| 2026-09-13 | ¿Como se afirma a donde aterriza quien no tiene permiso de ese modulo? | **Derivandolo del menu filtrado por SUS permisos**, igual que lo hace el codigo. Nunca una ruta fija: congelar la premisa es exactamente lo que mato estos casos cuando QC-75 cambio la regla |
| 2026-09-13 | El mismo patron roto esta en trece suites. ¿Como se arregla? | **Un helper unico** que todas usan. Trece copias de la misma linea es como llegamos aqui: cuando QC-75 cambio la regla habia trece sitios que actualizar y no se actualizo ninguno |
| 2026-09-13 | ¿Entra un caso para quien no tiene NINGUN permiso de modulo? | **Si, uno solo, en `login.spec.ts`**: entra, ve el 404 dentro del layout privado con su cabecera y su cerrar sesion, y puede cerrar sesion. El comportamiento ya esta decidido; lo que faltaba era que alguien lo ejercitara |
| 2026-09-13 | Los 23 tambien pasarian dandole al Operador el permiso de dashboard. ¿Test o permiso? | **El test.** El permiso se queda como esta: no tenerlo es deliberado |
| 2026-09-13 | ¿Y si aparece un agujero real de permisos al arreglar? | **Se para y se reporta.** Ficha propia y prioridad propia; no se arregla en esta pasada |
| 2026-09-13 | El aterrizaje y el 404 sin permisos | **Heredados de QC-75 y QC-90**, no se redisenan |
| 2026-09-13 | ¿Que verificacion se exige, si `init.sh` no corre Playwright? | **La suite E2E COMPLETA, en Chromium y WebKit, sobre base limpia**, con el resultado escrito en el PR. Precedente: QC-79 y QC-49. Aqui es especialmente exigible porque **la ficha ES la suite E2E**: un gate verde no dice nada de ella |
| 2026-09-13 | Cuantos casos de «acaba fuera» hay, y cuanto dano | **Cuatro, no tres**: inventario R4, pedidos R49, proveedores R52 y **recetas R6**, que la ficha no listaba. Y **23 fallos** en trece suites sobre base limpia, medido por la sesion de QC-85 el 2026-09-13. El board se corrigio antes de sembrar |
| 2026-09-13 | Idioma de los identificadores | **Ingles**, heredado de QC-4. No se reabre |
| 2026-09-15 | El Operador tiene `inventario.consultar` (QC-74 R9, `permissions.ts:165`), asi que el caso de inventario (R4) no puede afirmar con el «sin permiso no ve el catalogo». ¿Que se hace? | **El caso de inventario no usa al Operador, porque si tiene el permiso: usa un rol sin el. El permiso del Operador no se toca.** Se considero retirarle `inventario.consultar` dentro de esta ficha, y el humano lo rechazo el mismo dia («deja el permiso de consulta»). Los otros tres casos (pedidos R49, proveedores R52 y recetas R6) siguen con el Operador, que de verdad no tiene esos permisos. La fila del 2026-09-13 «¿Test o permiso?» queda **intacta** |
