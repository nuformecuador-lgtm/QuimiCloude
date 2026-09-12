# QC-79 — alta-sin-contrasena-y-enlace · review

> Revisado sobre el worktree `.worktrees/QC-79-alta-sin-contrasena-y-enlace`, rama
> `feature/QC-79-alta-sin-contrasena-y-enlace`, diff `origin/dev...HEAD` (11 commits, 73 archivos).
> Contra `specs/QC-79-alta-sin-contrasena-y-enlace/{requirements,design,tasks}.md`,
> `docs/{architecture,conventions,verification,dependencias}.md`, `CHECKPOINTS.md` y `CLAUDE.md`.
>
> **Veredicto: OK (APROBADO).** Cero hallazgos mayores. Ocho menores, ninguno bloqueante.

## Lo que el reviewer ejecuto EL MISMO (no se creyo la bitacora)

| Que | Resultado |
| --- | --- |
| `vitest run tests/unit/identity/credencial` + migracion + UI + guardia de correo + fachada | **14 archivos, 313 tests, verde** |
| `vitest run tests/guards tests/unit/identity tests/unit/errores` | **88 archivos, 1448 tests, verde** (12 skipped) |
| `vitest run tests/integration/identity` (con `.env`, base `QuimiCloude_QC79`) | **8 archivos, 180 tests, verde** |
| **R36 — ciclo real de migracion**: `db:rollback` -> `db:migrate` | **verde**: el `down.sql` revierte y borra su fila de `_prisma_migrations`; el deploy la reaplica («24 migrations found», «All migrations have been successfully applied»). Integracion re-corrida despues: **180/180 otra vez** |
| **R41 — E2E**: `playwright test e2e/establecer-contrasena.spec.ts` | **2 passed (55.6 s)**, chromium **y** webkit: alta sin contrasena -> buzon -> pagina publica -> contrasena establecida -> **entra al dashboard** -> cuenta en `active` -> el enlace ya no sirve |

El gate completo (`init OK`, 4708 tests, 9 rojos todos en baseline) lo corrio el leader. Lo que esta
revision anade es que **el ciclo de migracion y el E2E —los dos que `init.sh` NO cubre— se han
ejecutado y pasan**. La bitacora no reportaba ninguno de los dos como ejecutado.

## Checklist de `CHECKPOINTS.md`

### Especificacion
- [x] `requirements.md` con R1-R41 en EARS numerados.
- [x] `design.md` con **ocho** alternativas descartadas y su porque (secciones 11.1-11.8).
- [~] `tasks.md`: 23 de 24 en `[x]`. **T24 esta en `[~]`** — ver menor n.º 1.

### Trazabilidad
- [x] Cada `R<n>` mapea a al menos un test concreto. **41 de 41, sin huecos.**
- [x] `progress/impl_...md` contiene el mapa `R<n> -> test`, verificado uno a uno contra disco.

### Calidad de codigo
- [x] `typecheck` y `lint` verdes.
- [x] `pnpm test`: sin rojos nuevos respecto del baseline.
- [x] Flujo critico (autenticacion + activacion de cuenta) con E2E Playwright, **ejecutado por el
      reviewer**, verde en los dos motores.
- [x] UI multiplataforma (R25): `min-h-dvh` y ningun `100vh`; `text-base md:text-base` = 16 px
      SIEMPRE en los dos campos (sobrescribe el `md:text-sm` del primitivo, que es el que dispara el
      zoom de iOS); `h-11` en el campo, `size-11` (44x44) en el mostrar/ocultar, `min-h-11 w-full`
      en el submit; el mostrar/ocultar es un `<button type="button">` con `aria-pressed` y nombre
      accesible, **nunca** `:hover`. Ninguna libreria de UI nueva.
- [x] Dependencias: **una sola** (`resend@^6.27.0`), con su fila en `docs/dependencias.md` (cuatro
      checks fechados + aprobacion humana en F1.4 citada) y su justificacion en el `design.md`.
      `package.json` no gana ninguna otra entrada respecto de `origin/dev`.

### Datos y seguridad
- [x] `credential_setup_tokens` **sin columna de empresa, y es correcto**: no es dato de operacion
      sino identidad (`docs/architecture.md > Dominio` n.º 1, «la identidad NO se parte»), cuelga
      1-a-N de `users` y su empresa se deriva. Lo declara **R37**, requisito aprobado. El acotado por
      empresa existe donde hay actor: `issueForPendingUser` mete `company_id` en el `where` cuando
      llega (reenvio, R15) y devuelve `'not_found'` indistinguible entre «no existe», «borrado» y
      «otra empresa»; el test afirma **la forma del `where`**, no solo el resultado
      (`tests/unit/identity/credencial/credential-setup-link-prisma.test.ts:100` y `:111`).
- [x] **Autorizacion en el SERVICE, primera linea, actor por parametro, fallando cerrado**:
      `lib/modules/identity/domain/create-user.ts:165` y
      `lib/modules/identity/domain/issue-credential-setup-link.ts:102` llaman `requirePermission`
      **antes** de `zod` y antes de tocar ningun puerto. Los tests usan dobles que **fallan si los
      llaman**. RLS no se usa como sustituto en ningun sitio.
- [x] RLS: la migracion trae `ENABLE` **y** `FORCE ROW LEVEL SECURITY`, sin ninguna policy
      (deny-by-default), con test estatico y sus mutaciones de sensibilidad.
- [x] Acceso a datos solo por Prisma; ningun cliente de Supabase.
- [x] Migracion con su `down.sql`, **ciclo verificado de verdad**.
- [x] Ningun secreto hardcodeado: remitente, clave, base de URL y transporte salen de
      `mail-config-env.ts`, leidas **en la invocacion**; `.env.example` documenta las cinco.
- [x] Webhooks: no aplica. La feature no anade ninguno — R31 lo prohibe y hay test que lo censa.

### Modulos hexagonales
- [x] `domain/` y `ports/` sin Prisma, sin `resend`, sin `next/*`, sin `lib/shared/**`.
- [x] `resend` importada en **un solo archivo**
      (`lib/modules/identity/adapters/driven/mail/credential-setup-mailer-resend.ts:22`), vigilado
      por `tests/guards/guard-envio-de-correo.test.ts` con caso de sensibilidad.
- [x] `lib/modules/identity/index.ts` **no reexporta ningun adaptador `driving`**, ni `driven`, ni
      `ports/`; la pagina publica importa la action por su ruta exacta (R32).
- [x] Composicion solo en `lib/composition/index.ts`; ningun `driving` instancia su `driven`.

## Los puntos que el encargo pedia morder

1. **Trazabilidad R1-R41: completa y muerde.** Recorridos los 41. Ninguno cae en un test vacio. Los
   que mas facil habrian sido de fingir estan ejercidos contra Postgres real:
   `tests/integration/identity/credential-setup.int.test.ts` tiene casos nominales para R9, R37, R11
   (dos), R12/R20 concurrente, R12/R22 en serie, R19/R21, R19/R22 (usuario borrado), R19/R22
   (usuario ya activo), R22 (secreto inexistente) y R4 (el centinela). **No encontre ningun
   requisito cuyo test pasaria con el codigo borrado.**
2. **Seguridad del token.**
   - R9: la base guarda `token_digest` = SHA-256 hex; el secreto no cruza el puerto de persistencia
     por ningun camino. El test de integracion barre **todas las columnas de todas las filas**
     buscando el secreto.
   - R10: `randomBytes(32)` de `node:crypto` = **256 bits exactos**, base64url de 43 caracteres; la
     firma `create()` **no recibe nada**, asi que no hay de donde derivarlo. Tests de longitud,
     alfabeto, mil secretos distintos y «la fabrica no recibe ningun dato».
   - R11: la garantia es el **indice unico PARCIAL**
     `credential_setup_tokens_one_live_per_user ON (user_id) WHERE consumed_at IS NULL AND
     superseded_at IS NULL`, escrito a mano en la migracion. **No hay ningun `SELECT` previo de
     enlaces**: el puerto ni siquiera ofrece lectura. La integracion provoca el choque real y ademas
     **discrimina**: un caso hermano choca contra el OTRO indice unico y comprueba que `meta.target`
     sale `['token_digest']` y no `['user_id']`.
   - R19/R20: las cuatro escrituras van en **un solo `$transaction`** interactivo; el consumo es un
     `UPDATE ... WHERE token_digest = $1 AND consumed_at IS NULL AND superseded_at IS NULL AND
     expires_at > $now RETURNING user_id` (compare-and-set, nunca lectura seguida de escritura), y si
     el segundo `UPDATE` no encaja se lanza `RollbackToInvalid` para **revertir la transaccion
     entera** en vez de devolver desde dentro del callback — devolver dentro confirmaria el
     `consumed_at` y quemaria el enlace sin activar la cuenta. Test de dos usos **concurrentes** en
     dos conexiones reales (con `pg_backend_pid()` distintos comprobados): uno `ok`, otro `invalid`.
   - R13: el secreto no aparece en ningun `console.*`, ningun error, ningun retorno. Los tipos de
     retorno **no tienen hueco** donde colarlo (`void` en el caso publico, `{ mail }` en el reenvio).
     El log del mailer solo recibe `error.name`, nunca `message`, ni URL, ni destinatario, y
     `logMailFailure` no tiene parametro por el que colarlos. `credencial/scope.test.ts` lo censa
     leyendo los fuentes, con casos que demuestran que la regla dispara con un fuente fabricado.
   - R22: los **seis** casos salen por `CredentialLinkInvalidError`, un solo `code` y un solo
     mensaje; el puerto devuelve `'invalid'` para los seis y no tiene otra cosa que devolver. Hay
     test que construye el conjunto de respuestas de los seis y comprueba que **tiene un elemento**,
     y el texto del catalogo se comprueba contra ocho fragmentos que revelarian el caso (`caduc`,
     `consumid`, `sustitu`, `borrad`, `activ`, `existe`...). **No es oraculo.**
3. **La pagina publica no filtra nada y no exige sesion.** No consulta la base al pintar (descartado
   por escrito en `design.md > 11.4`), no recibe ningun dato del usuario por props, y
   `SetCredentialFormState` **no tiene ninguna variante que transporte datos de persona**: no hay
   hueco. `<meta name="referrer" content="no-referrer">` en el arbol y cero recursos de terceros. La
   action publica no llama a `getSessionUser`/`getSessionContext` —`currentActor()` existe pero
   **solo la usa el reenvio**— y el esquema `strictObject` **rechaza** cualquier `userId`/`companyId`.
4. **Arquitectura**: `domain/` limpio, `resend` en un solo archivo, composicion unica, contrato sin
   `driving`. Verificado leyendo los archivos, no solo las guardias.
5. **Autorizacion en el service**: primera linea, actor por parametro, falla cerrado, con dobles
   explosivos que prueban la NO llamada a los puertos.
6. **Migracion**: `down.sql` presente y **ciclo ejecutado**; RLS `ENABLE`+`FORCE` sin policies;
   identificadores en ingles `snake_case`; el UP no toca `users` ni los tres indices de QC-47.
7. **Dependencias**: una, aprobada, con fila y cita. Nada escrito a mano que ya resuelva el stack.

## Las tres preguntas abiertas: el codigo las respeta

- **P1 (remitente / dominio):** `MAIL_FROM_ADDRESS` sale de configuracion, leida en la invocacion.
  **No hay ningun remitente incrustado** en el codigo: los unicos literales del archivo del proveedor
  son el asunto y el cuerpo. `.env.example` lo deja vacio y dice que el valor lo decide el humano,
  citando la pregunta abierta.
- **P2 (copy):** dos constantes, marcadas «provisional pendiente de QC-72», en un solo sitio.
- **P3 (`must_change_credential`):** **R21 se cumple de verdad.** El puerto
  `applyCredentialAndActivate` **no tiene ningun parametro** con el que escribir la marca, el `SET`
  del `UPDATE` no la menciona, y hay test unitario de **claves exactas** del argumento mas un caso de
  integracion que lee la columna antes y despues del camino feliz.

## Las ocho desviaciones declaradas, verificadas una a una

1. **`digestOf(secret)` en el puerto — ES un hueco del diseno, no un cambio.** `design.md > 4.2`
   escribe el puerto con `create()` solo, pero 4.3 y 4.6 **exigen** la huella del secreto que llega
   por la URL, y el `domain/` no puede importar `node:crypto` (R26, R32). Sin el metodo, la unica
   salida seria que el dominio importara el adaptador, que es la linea que
   `docs/architecture.md > La regla de dependencias` prohibe. Ademas **reusa la misma funcion** que
   `create()`, no un segundo SHA-256. **Correcto.**
2. **`updateUserSchema = createUserSchema.omit({ credential: true })` — cierra bien el agujero.** Sin
   el `omit`, la edicion habria ganado el campo, que QC-66 R20 prohibe. Sigue siendo el mismo objeto
   (reemplazo completo, no `partial()`) y el test que recorre los dos esquemas sigue en pie. Ademas
   `userCandidateFromFormData` —compartido con la edicion— **no** lleva el campo: se anade solo en
   `createUserAction`. **Correcto.**
3. **La excepcion lexica de `tests/unit/errores/catalogo.test.ts` esta bien acotada.** No se borro ni
   se relajo el filtro `/credential|password|session|login|account/`: se declaro
   `CODIGOS_DE_ACTIVACION = ['credential_link_invalid']` y **un caso nuevo la acota**, exigiendo
   `toEqual(['credential_link_invalid'])` (igualdad, no `toContain`), que siga en el catalogo y que
   case `/^credential_link_/`. Una segunda entrada rompe el caso. `user_not_pending` no necesito
   excepcion. **No abre la puerta.**
4. **Los dos rechazos de formulario fuera del catalogo: la decision es correcta, la CITA no.** Ver
   menor n.º 3.
5. **`initialCredentialFactory` sin consumidor.** Ver menor n.º 4.
6. **12 archivos ajenos: ninguna expectativa borrada ni debilitada.** Leidos los seis diffs de test
   ajeno uno a uno. `tests/unit/proveedores/module-contract.test.ts`,
   `tests/unit/identity/credential-policy-contract.test.ts` y
   `tests/unit/identity/schema/account-status-schema.test.ts` siguen siendo **`toEqual` sobre el
   conjunto entero** y solo suman `CredentialSetupToken` / `credentialSetupTokens` con su comentario
   de por que; los `not.toContain` hermanos se conservan. `tests/unit/recetas-ui/recipe-route-contract.test.ts`
   sigue con lista **cerrada** e igualdad exacta y solo suma las dos constantes de ruta.
   `tests/integration/identity/user-crud.int.test.ts` adapta el marcador a la union discriminada sin
   tocar ninguna asercion. **Ninguna se relajo: solo se retensaron.**
7. **`tests/unit/identity/account-status-scope.test.ts`: la lista sigue siendo una IGUALDAD y los dos
   archivos la nombran legitimamente.** El bloque es aditivo, la comparacion no cambio de `toEqual` a
   `toContain`, y el caso hermano «el unico adaptador `driving` que nombra el estado» se sigue
   derivando de la misma lista y sigue verde porque ninguna de las dos rutas contiene
   `/adapters/driving/`. Los dos archivos nombran el estado por una razon real: el puerto declara
   `'user_not_pending'` como resultado discriminado (R15/R22), y el adaptador exige `pending` para
   emitir y escribe `active` al consumir (R19). **Ningun archivo de `domain/` de QC-79 entro.**
   Baselinear el archivo habria apagado una guardia viva de QC-65 por archivos propios.
   **Decision correcta.**
8. **El baseline: las seis son de la especie «censo del diff de rama».** Verificadas una a una: tres
   caen por `resend` en `package.json`, una por la carpeta de la migracion, y las dos **ampliadas**
   corrigen motivos que estaban desfasado (`recipe-route-contract`) y **falso**
   (`unidades/unidades-convenciones`, cuyo caso del `.spec.ts` hoy sale `skipped`). Cada entrada trae
   su coste aceptado con los casos que se pierden enumerados y su salida limpia. **Ninguna tapa una
   regresion propia**: los archivos de QC-79 estan todos verdes corridos por separado, y los rojos
   son de fichas ajenas que afirman «MI ficha no anade X» censando el arbol entero.

## Hallazgos

### Mayores (bloqueantes)

**Ninguno.**

### Menores

1. **`menor` — `tasks.md` T24 sigue en `[~]`, no en `[x]`** (`specs/QC-79-alta-sin-contrasena-y-enlace/tasks.md:253`).
   `CHECKPOINTS.md > Especificacion` pide todas en `[x]`. Es contabilidad: la sustancia de T24 —gate
   completo y bitacora con el mapa de los 41— esta hecha. Basta cerrar la casilla al anotar el cierre.

2. **`menor` — la bitacora dice que `DEPENDENCIAS_ESPERADAS` quedo «sin tocar», y no es cierto.**
   `tests/guards/guard-identificador-de-request.test.ts:207` pasa de `30` a `31`. El cambio **en si es
   legitimo y no debilita nada** —sigue siendo un total exacto, y `FRAGMENTOS_PROHIBIDOS` esta
   intacto—, pero el cierre de `progress/impl_...md` afirma que solo se tocaron
   `MIGRACIONES_ESPERADAS` y `E2E_ESPERADOS`. Son **tres** constantes de ese archivo, no dos.
   Corregir la frase.

3. **`menor` — `design.md > 11.3` se apoya en QC-70 R31, y ese requisito no dice lo que se le hace
   decir.** QC-70 R31 habla de «los mensajes que la UI escribe para **sus propias** comprobaciones de
   formulario (campo requerido, formato)», es decir validacion del front. No dice que un rechazo **de
   backend** por politica quede fuera del catalogo. Con lo cual la letra de **QC-79 R34** («cada
   fallo nuevo DEBE senalarse con una clase derivada de `IdentityError` cuyo `code` este en el
   catalogo») **no se cumple** para `CredentialPolicyRejectedError` y
   `CredentialConfirmationMismatchError` (`lib/modules/identity/domain/credential-rejected.ts`), que
   son clases nuevas, no derivan de `IdentityError` y no tienen `code`.
   **Por que NO es bloqueante:** la excepcion esta **declarada por escrito en el `design.md`
   aprobado** (11.3 y 5.3: variantes propias del estado de formulario) y su razon de fondo **si se
   sostiene y es la buena**: QC-70 R29 manda el `diagnostic` al registro del servidor y prohibe
   serializarlo al navegador, con guardia propia; sin las reglas incumplidas el formulario es
   inservible. Lo que falla es la **cita**, no la decision. Material para `/afinar-regla`: o R34 se
   redacta con su excepcion, o QC-70 gana un requisito que de verdad deje fuera las comprobaciones de
   formulario resueltas en el backend.

4. **`menor` — codigo muerto tolerado: `InitialCredentialFactory`.** `lib/composition/index.ts` ya no
   lo cablea (R4 lo deja sin consumidor), pero se conservan el puerto
   (`lib/modules/identity/ports/initial-credential-factory.ts`), el adaptador
   (`.../adapters/driven/security/initial-credential-factory-crypto.ts`) y su test. La justificacion
   —QC-89, restablecer la contrasena de otra persona, previsiblemente los necesita, y volver a
   atarlos son cuatro lineas— esta escrita en el sitio exacto donde vivia el cableado. Es
   **defendible**, pero hoy es produccion sin consumidor y su test lo mantiene artificialmente vivo.
   Si QC-89 se desplaza, o se borra o se anota en `progress/current.md > Deudas y cosas abiertas`.

5. **`menor` — aviso de Base UI en la pagina publica (solo en desarrollo).**
   `app/(public)/establecer-contrasena/[token]/components/set-credential-form.tsx:74` usa
   `<Button className="min-h-11 w-full" render={<Link ... />}>`. Durante el E2E el servidor escupe, en
   los dos motores: «Base UI: A component that acts as a button expected a native `<button>` because
   the `nativeButton` prop is true». Es un aviso de desarrollo, no rompe nada y el objetivo tactil de
   44 px es correcto, pero senala que el `<a>` conserva semantica de boton nativo cuando no la tiene.
   Se cierra con `nativeButton={false}`. **No bloquea**: el E2E pasa y el enlace funciona.

6. **`menor` — el transporte de buzon puede LANZAR, y el puerto promete que nunca se lanza.**
   `lib/modules/identity/adapters/driven/mail/credential-setup-mailer-outbox.ts` lanza si
   `NODE_ENV=production` o si falta `MAIL_OUTBOX_DIR`, mientras `ports/credential-setup-mailer.ts` y
   R30 dicen que un fallo de correo es un **valor** y nunca tumba el alta. En la practica no muerde
   —el transporte real es el de por defecto y el buzon solo se enciende a mano en el E2E— y fallar
   ruidosamente ahi es lo que `design.md > 9.2` pide a proposito. Queda anotado porque es la unica
   ruta por la que hoy un fallo de correo podria propagarse como excepcion del alta.

7. **`menor` — evidencia que faltaba en la bitacora, no en el codigo.** Ni el E2E de R41 ni el ciclo
   real del `down.sql` de R36 aparecen ejecutados en `progress/impl_...md`: el cierre solo reporta la
   integracion (180/180). El precedente del repo es reportarlo («4 passed en Chromium y WebKit»,
   QC-39, QC-88). **Los he corrido yo y los dos pasan**, asi que el requisito esta cubierto de verdad;
   lo que falta es la linea en la bitacora.

8. **`menor` — observacion de diseno ya aceptada, se deja escrita.** El secreto viaja en el **camino**
   de la URL, y `design.md > 4.4` lo justifica diciendo que asi «no lo escriben como un parametro mas
   los registros de acceso de la mayoria de los intermediarios». Un registro de acceso normal escribe
   la **ruta entera**, asi que la mitigacion real no es esa sino el `no-referrer`, la ausencia de
   recursos de terceros, el uso unico, los 7 dias y que la base solo guarde la huella — todo lo cual
   si esta. No hay alternativa razonable para un enlace de correo. **No se pide cambio**; se anota
   para que la frase no se reuse como si fuera una garantia.

## Veredicto

**OK — APROBADO.** Cero mayores. Los 41 requisitos tienen test que existe y que muerde, y los que
dependian de base real estan verificados contra Postgres. Los dos agujeros de evidencia que quedaban
—el E2E de R41 y el ciclo de R36— los cerro esta revision ejecutandolos.

Lo del spec que **no se sostuvo**, todo anotado por el implementer y resuelto hacia el lado correcto:
(a) `design.md > 4.2` definia `CredentialSetupSecretFactory` sin `digestOf` y el diseno no llegaba;
(b) `design.md > 5.2` decia que `credential` entraba «dentro del `strictObject` existente», que se lo
habria regalado a la edicion contra QC-66 R20; (c) la cita de QC-70 R31 en `design.md > 11.3` no dice
lo que se le atribuye (menor n.º 3); (d) `design.md > 2` midio 8 archivos ajenos y fueron 12.
