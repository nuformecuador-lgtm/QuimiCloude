# QC-9 — proteccion-de-rutas-privadas · bitacora de implementacion

> Zona `backend` · rama `feature/QC-9-proteccion-de-rutas-privadas`, en su worktree.
> **T1–T19 cerradas.** T20 es esta bitacora. **T21 (gate completo y PR) NO se ha ejecutado**: lo
> corre el leader. No se ha abierto PR ni se ha mergeado nada.
> Alcance **R1–R30**, los 30 con test nombrado (tabla al final).

## Estado de verificacion (salida real, al cierre)

```
$ pnpm run typecheck
> tsc --noEmit
(sin salida)

$ pnpm run lint
> eslint
(sin salida)

$ pnpm exec vitest run tests/unit/identity tests/guards tests/unit/middleware-root-contract.test.ts
 Test Files  37 passed (37)
      Tests  438 passed (438)
   Duration  9.64s

$ pnpm exec vitest run tests/integration/identity
 Test Files  4 passed (4)
      Tests  51 passed (51)
   Duration  10.88s
```

Las suites de `identity` (unit **e** integracion) se corrieron **enteras**, no por seleccion:
`vitest related` no engancha los tests que leen fuentes del disco, y en esta feature habia al menos
dos (ver «Trampas» abajo).

E2E (T19), en navegador real, los dos motores:

```
$ pnpm exec playwright test e2e/session.spec.ts --project=chromium
  1 [chromium] > ciclo de sesion sobre una ruta privada > pide una pantalla privada sin sesion,
    entra, aterriza en ella, ve su nombre, cierra sesion y atras no muestra la zona privada (8.0s)
  1 passed (22.9s)

$ pnpm exec playwright test e2e/session.spec.ts --project=webkit
  1 [webkit] > ... (10.8s)
  1 passed (23.7s)
```

Y **despues** del E2E, integracion otra vez verde entera, incluido `identity-constraints.int.test.ts`
(user.count() === 0): el recorrido no dejo huerfanos.

## Archivos creados

| Archivo | Que es | Task |
| --- | --- | --- |
| `lib/modules/identity/adapters/driven/session/session-token.ts` | codec WebCrypto: **unico dueño del HMAC** | T4, T5-bis |
| `lib/modules/identity/domain/return-path.ts` | destino de vuelta interno | T7 |
| `lib/modules/identity/domain/route-role-rules.ts` | tipo de regla, conjunto vacio y `findRouteRule` | T8 |
| `lib/modules/identity/domain/route-access.ts` | `decideRouteAccess`: allow o redirect, puro | T9 |
| `lib/modules/identity/ports/session-token-verifier.ts` | puerto: valor crudo a claims o null | T10 |
| `lib/composition/edge.ts` | cableado edge-safe | T12 |
| `lib/modules/identity/adapters/driving/route-guard-middleware.ts` | el portero | T13, T13-bis |
| `middleware.ts` | cascaron de Next: reexport y matcher literal | T14 |
| `tests/unit/identity/session-token.test.ts` | paridad byte a byte, rechazo de v1, tiempo constante | T5, T5-bis |
| `tests/unit/identity/return-path.test.ts` | redirector abierto | T7 |
| `tests/unit/identity/route-role-rules.test.ts` | gancho de reglas | T8 |
| `tests/unit/identity/route-access.test.ts` | la decision de acceso | T9 |
| `tests/unit/identity/route-guard-middleware.test.ts` | el portero, NextRequest reales | T13, T13-bis |
| `tests/unit/middleware-root-contract.test.ts` | la raiz no decide nada; el matcher | T14 |
| `tests/guards/guard-rutas-privadas-cubiertas.test.ts` | el arbol privado vs los prefijos declarados | T11 |
| `tests/guards/guard-middleware-edge.test.ts` | cierre de imports desde middleware.ts | T15 |
| `tests/guards/guard-doc-permisos.test.ts` | el documento dice la verdad | T18 |
| `e2e/session.spec.ts` | el recorrido completo en navegador | T19 |

## Archivos modificados

| Archivo | Cambio | Task |
| --- | --- | --- |
| `.../driven/session/session-cookie.ts` | adelgaza a I/O de cookie y delega en el codec. **Sus tres firmas publicas no cambian** | T4 |
| `lib/modules/identity/domain/session.ts` | `SessionTicket` gana `roleName`; `createSessionTicket` recibe el rol | T5-bis |
| `lib/modules/identity/domain/session-claims.ts` | el esquema gana `role` (texto no vacio); `SessionClaims` gana `roleName` | T5-bis |
| `lib/modules/identity/domain/verify-credentials.ts` | pasa el rol leido de la base al ticket | T5-bis |
| `lib/modules/identity/ports/user-credentials-reader.ts` | `AuthenticatableUser` gana `roleName` | T5-bis |
| `.../driven/persistence/user-credentials-prisma.ts` | JOIN a roles en la consulta que ya existia | T5-bis |
| `lib/modules/identity/index.ts` | reexporta la decision de acceso y el destino de vuelta, solo desde ./domain | T10 |
| `lib/shared/routes.ts` | anade `PRIVATE_ROUTE_PREFIXES` | T10 |
| `.../driving/login-action.ts` | lee y **revalida** el campo de vuelta, y redirige ahi. Firma congelada intacta | T16 |
| `app/(public)/login/page.tsx` | lee el parametro de vuelta y lo pasa por `resolveReturnPath` | T17 |
| `app/(public)/login/components/login-form.tsx` | un input oculto. Sin cambio visual | T17 |
| `docs/architecture.md` | seccion de permisos y autenticacion reescrita | T18 |
| `tests/guards/guard-firma-sesion-unica.test.ts` | raiz, huella WebCrypto, dueño nuevo, tiempo constante y **anti-cegado** | T1, T6, fix |
| `tests/guards/guard-arquitectura-modulos.test.ts` | raiz, excepcion driven a driven del mismo modulo y **anti-cegado** | T2, T4, fix |
| `tests/unit/identity/session-cookie.test.ts` | **oraculo**: solo version, claves del payload y firma del ticket | T5-bis |
| `session-claims`, `session-ticket`, `verify-credentials`, `resolve-session-user`, `login.int` | solo lo que obliga el cambio de firma, mas los casos nuevos de R26 y R28 | T5-bis |
| `tests/unit/theme/theme-state.test.ts` | apunta al codec (leia el adaptador como texto) | T4 |
| `tests/unit/login-form.test.tsx` | input oculto y «sin cambio visual» | T17 |
| `e2e/login.spec.ts` | importa el nombre de la cookie desde el codec | T4 |

**Ninguna dependencia nueva** (R25). **Ninguna migracion**: esta feature no toca la base.

## El oraculo de la firma sigue siendo un oraculo

`tests/unit/identity/session-cookie.test.ts` recomputa la firma esperada **por su cuenta con
createHmac** sobre la parte firmada que acaba de escribir `startSession`, y la compara. Eso es lo
que hace seguro migrar el algoritmo. Cambios admitidos, **y ninguno mas**:

1. nombre del test: «solo lleva sub/iat/exp» pasa a «sub/iat/exp/role»;
2. la version esperada pasa de v1 a v2 (dos sitios);
3. la lista de claves del payload gana `role`;
4. el payload literal del test «sub que no es UUID» gana `role`;
5. 12 llamadas a `createSessionTicket` reciben el rol como argumento nuevo.

**Las tres lineas que recomputan la firma no se tocaron.** Verificado con `diff` sobre el archivo
normalizado: la llamada a createHmac sobre la parte firmada, con digest base64url, sigue ahi, y el
test **no** usa `signSessionValue()`. Si lo usara, compararia la implementacion consigo misma y el
oraculo se perderia.

Ademas, T4 se cerro **sin tocar ni una linea** de ese archivo (formato aun en v1): la separacion
T4 / T5-bis que pedia el spec se respeto, asi que un rojo ahi habria señalado la criptografia o el
formato, nunca los dos a la vez.

## Trampas que mordieron, y como se cerraron

1. **`tests/unit/theme/theme-state.test.ts` (QC-29) lee el adaptador como texto** y saca el nombre
   de la cookie con una regex. Mover la constante al codec lo habria roto **sin que `vitest
   related` lo enganchara**. Se reapunto al codec.
2. **`e2e/login.spec.ts`** importaba el nombre de la cookie del adaptador. Se reapunto al codec, y
   ademas `session-cookie.ts` **reexporta** la constante, porque el oraculo la importa de ahi y el
   oraculo no se puede tocar.
3. **Las guardias se cegaban con un comentario.** `guard-firma-sesion-unica` y
   `guard-arquitectura-modulos` quitaban los comentarios **de bloque antes que los de linea**. Un
   comentario de linea que contenga una ruta con comodin abre un bloque falso que se cierra en el
   siguiente JSDoc y **se traga los imports**. Sobre el `middleware.ts` real, el archivo quedaba
   reducido a su `export const config`: **la guardia pasaba en verde sin haber mirado**. Es
   **preexistente**, no lo introduce QC-9, y afecta a la evidencia de R14, R19 y R21. Cerrado:
   orden invertido en las dos, **test de regresion en cada una** y un ancla sobre el `middleware.ts`
   real. Demostrado antes y despues: con el orden viejo la huella no se detecta, con el nuevo si.
4. **`user-credentials-prisma.ts` no usa un select de Prisma**, como suponia el diseño, sino
   `$queryRaw` (por el indice funcional parcial del nombre de usuario). El rol entra por un JOIN a
   roles **en la misma consulta**: cero consultas nuevas en el login (R26).

## Desviaciones del spec (para el reviewer)

1. **`guard-arquitectura-modulos` gana una excepcion acotada: driven a driven del MISMO modulo.**
   El diseño coloca el codec en `adapters/driven/session/session-token.ts` y ordena que
   `session-cookie.ts` (tambien driven) delegue en el; su R11 prohibia ese import y bloqueaba la
   extraccion entera. La fila de `adapters/driven` en la regla de dependencias de
   `docs/architecture.md` **no lista al driven hermano** entre lo prohibido, asi que el cambio
   acerca la guardia al documento. Exige mismo modulo y ambas capas driven, de modo que **R21 no se
   relaja**: `middleware.ts` esta en la raiz (capa nula) y sigue sin poder importar un driven.
2. **`hasCurrentVersion(raw)`**, export del codec que el diseño no lista. Necesario: el oraculo
   exige que un prefijo de version desconocida resuelva null **sin** secreto en el entorno, y
   `verifySessionValue(raw, secret)` lee el secreto antes de entrar. La alternativa era duplicar el
   troceado en el adaptador. Las firmas que el diseño si lista quedaron exactas.
3. **La pagina de login pasa a async** y declara sus searchParams como promesa. Next 16.3 lo genera
   en `.next/types/`, pero eso es un artefacto de build ignorado por git y `typecheck` no ejecuta
   build: depender de el seria fragil. Se declara el tipo con la forma exacta que Next exige.
4. **Prefijos por segmento, no por texto.** `/dashboard` cubre `/dashboard/x` pero **no**
   `/dashboards-publicos`. El spec decia «prefijo» a secas; un prefijo textual protegeria rutas
   ajenas por accidente y, peor, una regla de rol morderia rutas que no son suyas.
5. **El anti-bucle de R13 es mas general** que «la ruta es el dashboard»: si el destino del redirect
   tampoco estaria autorizado bajo las mismas reglas, se devuelve allow. Cubre el caso literal del
   spec y el equivalente (una subruta del dashboard con una regla que deniega el dashboard).

## Higiene de commits — defecto conocido

Dos commits llevan dentro trabajo que no les corresponde, por un `git add` amplio de un subagente
mientras otro trabajaba en paralelo. **No se perdio nada**; solo las fronteras no reflejan las
tasks:

- `a5bfbf1` (arreglo del typecheck heredado) incluye las marcas de tasks.md de T1 a T11.
- `cc83f8f` (T12, `lib/composition/edge.ts`) incluye **todo T18**: `docs/architecture.md` y
  `tests/guards/guard-doc-permisos.test.ts`. **No existe un commit docs(QC-9) propio de T18.**

No se reescribio la historia: `git rebase -i` no esta disponible en este entorno y, cuando se
detecto, habia agentes trabajando sobre la rama.

## Limites asumidos, con test que los caracteriza

- **R30 — el rol firmado envejece.** Es una foto del login y vale hasta 8 h. El middleware puede
  dejar pasar a una pantalla que el service deniega (molesto, pero **seguro**: la frontera real
  corta) o cortar una a la que ya se tendria derecho. Test de **caracterizacion**, no de virtud, en
  `route-guard-middleware.test.ts`. **QC-23 lo pondra rojo a proposito.**
- **R29 — el rol firmado NO autoriza.** `decideRouteAccess` devuelve allow o redirect y nada mas.
  La autorizacion sigue validandose en el service.
- **Todas las sesiones vivas se invalidan** al subir a v2 (D16). Aceptado por el humano.
- **Pregunta abierta 2 del spec sigue abierta**: que hace la raiz del sitio. No se inventa aqui.

## Hallazgo para el leader (fuera de alcance, no tocado)

**Next 16.3.0 deprecó el fichero `middleware.ts`.** El E2E imprime que la convencion de fichero
middleware esta deprecada y que hay que usar proxy. Confirmado en
`node_modules/next/dist/lib/constants.js`, que ya define la constante de nombre de fichero proxy.
**Funciona hoy** —el recorrido pasa en los dos motores—, pero el spec, congelado y aprobado, ordena
`middleware.ts`, y cambiarlo seria inventar por encima del spec. Merece ficha propia.

## Trazabilidad `R<n>` -> test (los 30)

| R | Test (archivo · nombre real) |
| --- | --- |
| R1 | `guard-rutas-privadas-cubiertas.test.ts` · «cada pantalla privada esta cubierta por un prefijo de PRIVATE_ROUTE_PREFIXES» + «detecta una pantalla nueva sin prefijo que la cubra, y no confunde un prefijo parecido» |
| R2 | `route-guard-middleware.test.ts` · ruta privada sin cookie devuelve redireccion al login y no deja pasar |
| R3 | idem · cookie caducada, firma manipulada y version desconocida se tratan como «sin sesion» |
| R4 | `guard-middleware-edge.test.ts` · el cierre de imports no alcanza @prisma/client ni el cliente Prisma compartido + `route-guard-middleware.test.ts` · decide con el contenido firmado y no consulta ningun puerto de base |
| R5 | `route-guard-middleware.test.ts` · «no emite, reemite ni borra la cookie de sesion en ningun caso» |
| R6 | `tests/unit/private-layout.test.tsx` (existente, sin cambios) · «sin usuario de sesion, el layout redirige al login y no pinta la zona privada» |
| R7 | `route-access.test.ts` · «redirige al login llevando la ruta pedida como destino de vuelta» + «lleva tambien la cadena de consulta de la ruta pedida» |
| R8 | `login-action.test.ts` · con destino valido redirige ahi; sin destino, al dashboard + `e2e/session.spec.ts` · aterriza en la pantalla que habia pedido |
| R9 | `return-path.test.ts` · «un %2F%2F que decodifica a doble barra no es interno aunque su forma cruda lo parezca» + descarte de externos, de doble barra con host, de esquemas y de la ausencia |
| R10 | `route-access.test.ts` · «sin destino de vuelta redirige al dashboard» + «con destino de vuelta valido redirige ahi, no al dashboard» |
| R11 | idem · «deja pasar una ruta publica con sesion valida» + «deja pasar el login cuando no hay sesion» |
| R12 | `route-role-rules.test.ts` · «esta vacio a proposito: QC-9 construye el gancho, no declara reglas» + «estando vacio, ninguna ruta privada tiene regla aplicable» + `route-guard-middleware.test.ts` · una regla sintetica se evalua contra el rol **firmado**, sin consultar la base |
| R13 | `route-access.test.ts` · «redirige al DASHBOARD, nunca al login: no autorizado no es no autenticado» + «si la ruta no autorizada ES el dashboard, deja pasar en vez de redirigir (sin bucle)» + «si el propio dashboard tampoco esta autorizado, una subruta suya tampoco redirige ahi» |
| R14 | `guard-firma-sesion-unica.test.ts` · «el algoritmo de firma solo aparece en el codec que emite y verifica la cookie» |
| R15 | `guard-middleware-edge.test.ts` · el cierre desde middleware.ts no alcanza node:crypto ni next/headers + `guard-firma-sesion-unica.test.ts` · «el unico dueño no importa node:crypto (R15): tiene que cargar en el borde» |
| R16 | `session-cookie.test.ts` · «el valor va firmado con HMAC y solo lleva sub/iat/exp/role» (**recomputo con createHmac intacto**) + `session-token.test.ts` · «el valor emitido lleva la firma que produciria node:crypto (R16, de extremo a extremo)» y «la firma es base64url SIN relleno y de 43 caracteres» |
| R17 | `session-token.test.ts` · «devuelve false si difiere el PRIMER byte», «devuelve false si difiere el ULTIMO byte», «devuelve false si la longitud difiere» + `guard-firma-sesion-unica.test.ts` · «la comparacion de firmas es en tiempo constante (R5, R17): el unico dueño usa equalsInConstantTime» |
| R18 | `route-guard-middleware.test.ts` · sin secreto redirige al login en vez de lanzar, y no filtra el secreto |
| R19 | `guard-firma-sesion-unica.test.ts` · «un createHmac en un archivo de primer nivel se detecta: el barrido incluye la raiz del repositorio (R19)» + `guard-arquitectura-modulos.test.ts` bloque 8-bis · «un archivo de la raiz que importa un driven fuera de composicion genera hallazgo». **Ambas, ademas, con test anti-cegado por comentario** |
| R20 | `middleware-root-contract.test.ts` · middleware.ts solo delega: sin rutas, sin redirect y sin firma + `route-access.test.ts` · «los prefijos privados y las rutas entran como parametros, no se importan» |
| R21 | `guard-arquitectura-modulos.test.ts` · «solo lib/composition importa adaptadores driven (R11)», ahora tambien sobre la raiz |
| R22 | `middleware-root-contract.test.ts` · el matcher excluye _next/static, _next/image, favicon.ico y los assets (ejercitado **como expresion regular** contra rutas reales, no por subcadenas) |
| R23 | `guard-doc-permisos.test.ts` · «docs/architecture.md > Permisos y autenticacion no habla de existencia de cookie y si de firma, caducidad y frontera en el service» + «detecta el documento ANTERIOR a QC-9» |
| R24 | `e2e/session.spec.ts` · «pide una pantalla privada sin sesion, entra, aterriza en ella, ve su nombre, cierra sesion y atras no muestra la zona privada» — verde en chromium y webkit |
| R25 | `guard-dependencias-aprobadas.test.ts` (existente) · «toda dependencia de package.json tiene su fila en el registro» |
| R26 | `tests/integration/identity/login.int.test.ts` · contra Postgres, el rol firmado es el que la base tiene en ese instante + `verify-credentials.test.ts` · «el ticket emitido lleva el rol leido de la base, no uno recibido del cliente» y «si la base devuelve otro rol, el ticket lleva ese otro rol» |
| R27 | `session-token.test.ts` · «un v1 con firma correcta y exp futuro resuelve null» + «y lo rechaza SIN verificar la firma: no se llama a crypto.subtle.sign» + «el formato vigente si llega a verificar la firma (el contraste que da valor al test anterior)» + `route-guard-middleware.test.ts` · una cookie de la version anterior termina en el login |
| R28 | `session-claims.test.ts` · «un role ausente, vacio o que no es texto devuelve null» |
| R29 | `route-access.test.ts` · «solo devuelve allow o redirect, y nunca capacidades, permisos ni roles» + `guard-doc-permisos.test.ts` · «detecta el caso a medias: cuenta la firma pero calla que el rol no autoriza (R29)» |
| R30 | `route-guard-middleware.test.ts` · **test de CARACTERIZACION** de un limite asumido: con el rol ya cambiado en la base, el borde sigue viendo el anterior hasta que la sesion caduca. **QC-23 lo pondra rojo a proposito** |
