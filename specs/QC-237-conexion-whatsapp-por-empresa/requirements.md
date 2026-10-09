# QC-237 — conexion-whatsapp-por-empresa · requirements.md

> Zona: fullstack · Complejidad: medium · Épica: QC-220 «Integraciones» · depends_on: QC-234 (done,
> PR #191) · Bloquea a: QC-238, QC-242, QC-250 · Rama: feature/QC-237-conexion-whatsapp-por-empresa
>
> **Alcance.** El Administrador de la empresa conecta el número de WhatsApp de su empresa, pegando
> las credenciales de su propia app de Meta (modo «cliente directo», fase 1). La conexión queda
> guardada con los secretos cifrados y lista para que Meta envíe los webhooks.
>
> - **Modelo** `WhatsappConnection` (`whatsapp_connections`), con `company_id` y las convenciones del
>   repo: `origin` (`manual`; `embedded_signup` reservado para la fase 2), `displayName`; IDs de
>   Meta `metaAppId`, `wabaId`, `phoneNumberId` (**único global**), `displayPhoneNumber`,
>   `verifiedName`; secretos `accessTokenEnc` y `appSecretEnc` cifrados con QC-234 (la ficha pedía
>   además `keyVersion`: **retirada**, D9) y `verifyTokenHash`; estado `status` (`pending|active|error|disabled`), `lastError`,
>   `lastCheckedAt`, `lastWebhookAt` (lo llenará la recepción); auditoría `createdById`, timestamps,
>   `deletedAt`. **Una conexión por empresa** con índice único parcial
>   `(company_id) WHERE deleted_at IS NULL`; el modelo admite varias.
> - **Pantalla** `/integraciones/whatsapp` (reemplaza el placeholder de QC-222), con
>   `integraciones.modificar`. Pestañas «Conexión» | «Plantillas»; «Plantillas» deshabilitada con
>   «Disponible próximamente». «Conexión» sin conexión: formulario (nombre visible, App ID, WABA ID,
>   Phone Number ID, Access Token, App Secret) y guía corta. Con conexión: tarjeta de estado, URL del
>   webhook con botón copiar, y acciones.
> - **Probar conexión** al guardar y con un botón: `GET /{phone_number_id}?fields=display_phone_number,verified_name`.
>   Bien: guarda número y nombre verificado. Mal: `status=error` con el mensaje de Meta. Al crear, si
>   la prueba falla no se guarda nada.
> - **Verify token** aleatorio al crear, mostrado **una sola vez** con la URL del webhook; se guarda
>   solo su hash. Acción «Regenerar verify token» que invalida el anterior.
> - **URL del webhook** `/api/integraciones/whatsapp/webhook/{conexionId}` sobre la URL pública de la app.
> - **Secretos de solo escritura**: nunca se vuelven a mostrar; al editar, vacío conserva y escrito
>   reemplaza y vuelve a probar.
> - **Deshabilitar / habilitar**: deshabilitar deja `disabled`; habilitar vuelve a probar.
> - Cliente de Graph mínimo (`fetch` nativo, versión en `WHATSAPP_GRAPH_API_VERSION`), solo la
>   llamada de prueba.
> - Estado tras crear y probar bien: `pending`. Pasa a `active` cuando Meta verifica el webhook
>   (QC-238).
>
> **Lo que NO entra.** Recibir webhooks y el handshake GET de Meta (QC-238). Enviar mensajes
> (QC-240/241). Plantillas (QC-242/243). Embedded Signup. Borrar la conexión con su historial. Un
> permiso de solo consulta. Re-cifrado masivo y rotación (QC-250).
>
> Este archivo **no venía sembrado** por `/afinar-feature`. El Alcance y la tabla de decisiones son
> la ficha de Jira QC-237, copiadas con dos correcciones del leader (`progress/features/QC-237.md >
> Decisiones`): el contexto de cifrado es el `SecretContext` de QC-234 (`companyId`, `recordId` =
> id de la conexión, `field`, serializado en JSON) y no `empresa:conexión:campo`; y `keyVersion` lo
> decidía este spec (cerrado como D9: no hay columna).

## Decisiones cerradas (no reabrir)

| # | Decisión | Por qué |
| --- | --- | --- |
| D1 | Solo el Administrador, con `integraciones.modificar` (decisión del humano) | Permiso que ya existe (QC-221). Es configuración sensible; no hace falta un permiso de consulta. |
| D2 | Una conexión por empresa, el modelo admite varias | Decisión del humano. El índice se retira sin migrar datos. |
| D3 | `phoneNumberId` único global | Un webhook debe resolverse a una sola empresa. |
| D4 | Secretos cifrados (QC-234) y nunca devueltos a la UI | Ni el navegador ni los logs ven el token. |
| D5 | Verify token como hash, mostrado una sola vez | Solo se compara; si se pierde, se regenera. |
| D6 | Probar contra Graph antes de guardar como válida | Un token malo se detecta al configurar, no al primer mensaje. |
| D7 | URL de webhook por conexión | Cada empresa tiene su `app_secret`; la firma se valida antes de leer el body. |
| D8 | El contexto de cifrado es `SecretContext {companyId, recordId, field}` de QC-234, con `recordId` = id de la conexión, que existe antes de cifrar | Nota del leader; corrige el `empresa:conexión:campo` de la ficha (ambiguo, QC-234 `design.md > 11.3`). |
| D9 | Sin columna `keyVersion` (ni una ni dos). QC-250 lee la versión de clave del prefijo `v<n>:` de cada valor cifrado (humano, 2026-10-09; era P1) | Con dos secretos por fila editables por separado, una columna puede mentir sobre uno; el prefijo ya dice la verdad de cada valor. |
| D10 | Editar con prueba fallida no guarda nada: la conexión conserva sus credenciales y datos anteriores y la pantalla muestra el mensaje de Meta (humano, 2026-10-09; era P2) | La conexión guardada sigue funcionando con lo que tenía. |
| D11 | Habilitar con prueba fallida deja la conexión `disabled` y la pantalla muestra el mensaje de Meta (humano, 2026-10-09; era P3) | QC-238 no recibe webhooks de una conexión que no pasa la prueba. |
| D12 | Tras una prueba buena (editar, probar, habilitar): `active` si `lastWebhookAt` no es nulo, `pending` si lo es (humano, 2026-10-09; era P4) | Meta solo hace el handshake al suscribir; un `pending` fijo dejaría así para siempre una conexión que ya recibía. |
| D13 | Textos de `design.md > 7` y `> 8.3` aprobados como están, con dos cambios: etiqueta de `PENDING` «Pendiente» y de `ERROR` «Error», con el último error (`lastError`) visible junto al estado en la tarjeta (humano, 2026-10-09; era P5) | Etiquetas cortas; el motivo del error se ve donde se ve el estado. |
| D14 | App ID, WABA ID y Phone Number ID son texto libre no vacío tras recortar, **sin** exigir solo dígitos ni longitud máxima; un ID malo lo detecta la prueba contra Graph (humano, 2026-10-09; era P6) | Que los IDs de Meta sean siempre numéricos no está verificado; la prueba ya valida el que importa. |
| D15 | La base de la URL del webhook es `APP_BASE_URL`, leída por un lector propio de `integraciones`; si falta, la pantalla avisa (humano, 2026-10-09; era P7) | Variable que ya existe. En Vercel se fija por entorno para que una preview no apunte a producción. |
| D16 | La unicidad de `phoneNumberId` es un índice único **parcial** `WHERE deleted_at IS NULL` (humano, 2026-10-09; era P8) | Igual que el de empresa; una conexión borrada en el futuro no quema el número. |

## Requisitos (EARS)

> Entre corchetes, la decisión (**D1**–**D16**) o **[A]** si sale del Alcance.
>
> Vocabulario:
>
> - «la conexión» = la fila viva (`deleted_at` nulo) de `whatsapp_connections` de la empresa del actor.
> - «el actor» = el usuario de la sesión, con su empresa y su conjunto de permisos.
> - «los secretos» = el Access Token y el App Secret que escribe el Administrador.
> - «la prueba» = la consulta a Graph `GET /{phone_number_id}?fields=display_phone_number,verified_name`
>   con el Access Token de la conexión.
> - «prueba buena» = Graph responde 2xx con un cuerpo válido; «prueba fallida» = cualquier otro caso
>   (rechazo de Meta, cuerpo inesperado, red, tiempo agotado).
> - «el mensaje de Meta» = el texto de error que devuelve Graph, saneado según R20; si no hay texto
>   (red o tiempo agotado), un texto fijo.

### Autorización y ámbito

**R1.** CUANDO un actor sin `integraciones.modificar` (o sin sesión, o sin empresa) invoca
cualquier operación de la conexión (consultar, crear, editar, probar, deshabilitar, habilitar,
regenerar verify token), el sistema DEBE rechazarla con el error `unauthorized` antes de validar la
entrada y sin leer ni escribir `whatsapp_connections` ni llamar a Graph. [D1]

**R2.** El sistema DEBE resolver la empresa de toda operación de la conexión desde la sesión del
actor, nunca desde la entrada, y toda lectura o escritura de `whatsapp_connections` DEBE filtrar
por esa empresa. [A, D1]

**R3.** SI el identificador de conexión que llega a una operación pertenece a otra empresa, no
existe o está borrado, ENTONCES el sistema DEBE responder con el error
`whatsapp_connection_not_found`, idéntico en los tres casos, y no modificar ninguna fila. [A]

**R4.** CUANDO un usuario sin `integraciones.modificar` pide `/integraciones/whatsapp`, el sistema
DEBE responder 404 sin entrada en el menú, como hoy (QC-222). [D1]

### Modelo de datos

**R5.** El sistema DEBE guardar cada conexión en `whatsapp_connections` con `company_id`
obligatorio, RLS activada y forzada, y una migración con su `down.sql` que la revierte. [A]

**R6.** MIENTRAS una empresa tiene una conexión viva, el sistema DEBE rechazar crear otra en esa
empresa con el error `whatsapp_connection_exists`, también cuando dos altas concurren (lo garantiza
un índice único parcial `(company_id) WHERE deleted_at IS NULL`). [D2]

**R7.** MIENTRAS un `phoneNumberId` está en una conexión viva de cualquier empresa, el sistema DEBE
rechazar crear o editar otra conexión con ese mismo `phoneNumberId` con el error
`whatsapp_phone_number_taken`, sin revelar a qué empresa pertenece (lo garantiza un índice único
parcial `(phone_number_id) WHERE deleted_at IS NULL`). [D3, D16]

**R8.** El sistema DEBE crear toda conexión de esta ficha con `origin = manual`. [A]

### Secretos

**R9.** CUANDO se guarda un secreto, el sistema DEBE persistir solo su valor cifrado con el cifrador
de QC-234, con el contexto `{ companyId: <empresa>, recordId: <id de la conexión>, field }`, donde
`field` es `access_token` o `app_secret`; ningún secreto en claro DEBE llegar a la base. [D4, D8]

**R10.** El sistema NO DEBE incluir el Access Token, el App Secret ni sus valores cifrados en
ninguna respuesta de Server Action, ninguna prop de componente, ningún HTML renderizado ni ninguna
línea de log. [D4]

**R11.** CUANDO se edita una conexión con el campo de un secreto vacío, el sistema DEBE conservar el
valor guardado de ese secreto sin descifrarlo ni volver a cifrarlo. [A, D4]

**R12.** CUANDO se edita una conexión escribiendo un secreto nuevo, el sistema DEBE reemplazar el
valor guardado de ese secreto y ejecutar la prueba con las credenciales resultantes. [A, D6]

**R13.** SI un secreto guardado no se puede descifrar al probar o habilitar, ENTONCES el sistema
DEBE responder con el error `integration_secret_unreadable`, dejar la conexión en `error` con un
último error que pida volver a escribir las credenciales, y no llamar a Graph. [D4]

### Verify token

**R14.** CUANDO se crea una conexión, el sistema DEBE generar un verify token aleatorio de al menos
256 bits, guardar solo su resumen (SHA-256, con el resumidor de QC-234) y devolver el token en
claro únicamente en la respuesta de esa creación, junto a la URL del webhook. [D5]

**R15.** CUANDO el Administrador ejecuta «Regenerar verify token», el sistema DEBE generar un token
nuevo, reemplazar el resumen guardado (el anterior deja de coincidir) y devolver el nuevo en claro
solo en esa respuesta; el estado de la conexión no cambia. [D5]

**R16.** Ninguna lectura posterior de la pantalla (recarga, navegación, otra sesión) DEBE mostrar
el verify token: ni la página ni sus props lo contienen. [D5]

### La prueba contra Graph

**R17.** CUANDO se ejecuta la prueba, el sistema DEBE llamar a
`GET https://graph.facebook.com/<WHATSAPP_GRAPH_API_VERSION>/<phoneNumberId>?fields=display_phone_number,verified_name`
con el Access Token en la cabecera `Authorization: Bearer`, nunca en la URL, y con un tiempo
máximo de espera. [A, D6]

**R18.** SI `WHATSAPP_GRAPH_API_VERSION` falta o no tiene la forma `v<mayor>.<menor>`, ENTONCES la
prueba DEBE fallar con un error que nombra la variable y no su valor, y la operación DEBE terminar
como error inesperado con referencia, sin llamar a Graph. [A]

**R19.** CUANDO la prueba es buena, el sistema DEBE guardar `displayPhoneNumber` y `verifiedName`
devueltos por Graph, poner `lastCheckedAt` al instante de la prueba y vaciar `lastError`. [D6]

**R20.** CUANDO la prueba falla, el sistema DEBE componer el mensaje de Meta con el texto de error
de Graph recortado a 500 caracteres y con cualquier aparición literal del Access Token o del App
Secret sustituida; si Graph no devolvió texto, DEBE usar «No se pudo contactar con Meta.». [D4, D6]

### Crear

**R21.** CUANDO el Administrador envía el formulario sin conexión viva y con los seis campos
válidos, el sistema DEBE ejecutar la prueba antes de persistir nada. [D6]

**R22.** SI la prueba es buena al crear, ENTONCES el sistema DEBE crear la conexión con
`status = pending`, el número y el nombre verificado de Graph, los secretos cifrados, el resumen del
verify token y `createdById` = el actor, y devolver el verify token y la URL del webhook. [A, D5, D6]

**R23.** SI la prueba falla al crear, ENTONCES el sistema NO DEBE crear ninguna fila y DEBE devolver
el mensaje de Meta para mostrarlo en el formulario, que conserva los campos no secretos. [D6]

**R24.** SI algún campo del formulario es inválido (vacío tras recortar; `displayName` de más de 80
caracteres; un secreto de más de 1024 caracteres), ENTONCES el sistema DEBE rechazar con
`invalid_input` sin llamar a Graph. App ID, WABA ID y Phone Number ID DEBEN aceptarse como texto
libre no vacío tras recortar, contengan o no caracteres que no son dígitos; un ID que Meta no
reconoce DEBE terminar como prueba fallida (R23, R26). [A, D14]

### Editar

**R25.** CUANDO el Administrador edita la conexión, el sistema DEBE permitir cambiar
`displayName`, App ID, WABA ID, Phone Number ID y los secretos, con las reglas de R24 (salvo que
cada secreto puede ir vacío, R11). [A]

**R26.** SI la edición escribe algún secreto o cambia el Phone Number ID, ENTONCES el sistema DEBE
ejecutar la prueba con las credenciales resultantes antes de guardar; SI la prueba falla, ENTONCES
NO DEBE guardar ningún cambio (la conexión conserva sus credenciales, su estado y sus datos
anteriores) y DEBE devolver el mensaje de Meta para mostrarlo en la pantalla. [A, D6, D10]

**R27.** SI la edición solo cambia `displayName`, App ID o WABA ID, ENTONCES el sistema DEBE
guardar sin llamar a Graph y sin cambiar el estado. [A]

### Probar, deshabilitar, habilitar

**R28.** CUANDO el Administrador pulsa «Probar conexión» sobre una conexión que no está `disabled`,
el sistema DEBE ejecutar la prueba; SI es buena, ENTONCES DEBE aplicar R19 y dejar el estado según
R31; SI falla, ENTONCES DEBE dejar `status = error`, `lastError` = el mensaje de Meta y
`lastCheckedAt` = el instante de la prueba. [A, D6]

**R29.** CUANDO el Administrador deshabilita la conexión, el sistema DEBE dejar `status = disabled`
sin llamar a Graph; deshabilitar una ya deshabilitada no DEBE cambiar nada. [A]

**R30.** CUANDO el Administrador habilita una conexión `disabled`, el sistema DEBE ejecutar la
prueba; SI es buena, ENTONCES DEBE aplicar R19 y dejar el estado según R31; SI falla, ENTONCES la
conexión DEBE seguir `disabled` y el sistema DEBE devolver el mensaje de Meta para mostrarlo en la
pantalla. [A, D11]

**R31.** CUANDO una prueba es buena (al editar, probar o habilitar), el sistema DEBE dejar
`status = active` si `lastWebhookAt` no es nulo y `status = pending` si lo es. [A, D12]

**R32.** SI se pide «Probar conexión» sobre una conexión `disabled`, ENTONCES el sistema DEBE
rechazar con `action_not_allowed` sin llamar a Graph. [A]

### URL del webhook

**R33.** El sistema DEBE construir la URL del webhook como `<APP_BASE_URL>/api/integraciones/whatsapp/webhook/<id de la conexión>`,
con la ruta escrita en un solo sitio del código. [D7, D15]

**R34.** SI `APP_BASE_URL` no está configurada, ENTONCES la pantalla DEBE mostrar la ruta relativa
del webhook junto a un aviso de que falta la URL pública, sin fallar la página. [D7, D15]

### Pantalla

**R35.** CUANDO el Administrador abre `/integraciones/whatsapp`, la pantalla DEBE mostrar dos
pestañas, «Conexión» (activa) y «Plantillas», y «Plantillas» DEBE estar deshabilitada con el texto
«Disponible próximamente». [A]

**R36.** MIENTRAS la empresa no tiene conexión viva, la pestaña «Conexión» DEBE mostrar el
formulario de alta con los seis campos (los dos secretos como campos de contraseña sin valor
inicial) y una guía corta de dónde sacar cada dato en Meta. [A, D13]

**R37.** MIENTRAS la empresa tiene conexión viva, la pestaña «Conexión» DEBE mostrar una tarjeta
con el número, el nombre verificado, el estado con su etiqueta («Pendiente», «Activa», «Error» o
«Deshabilitada») y la última verificación; la URL del webhook con un botón que la copia; y las
acciones «Editar», «Probar conexión», «Deshabilitar» o «Habilitar» según el estado, y «Regenerar
verify token». MIENTRAS la conexión está en `error`, la tarjeta DEBE mostrar el último error
(`lastError`) junto a la etiqueta «Error», dentro del mismo bloque de estado. [A, D13]

**R38.** CUANDO una creación o una regeneración termina bien, la pantalla DEBE mostrar el verify
token y la URL del webhook en un aviso que dice que el token no se volverá a mostrar. [D5]

**R39.** CUANDO una operación termina con error o con prueba fallida, la pantalla DEBE mostrar el
mensaje del catálogo o el mensaje de Meta, sin borrar los campos no secretos del formulario. [D6]

**R40.** El formulario y las acciones de la pantalla DEBEN cumplir la regla multiplataforma
(`font-size` ≥ 16 px en inputs, objetivos táctiles ≥ 44×44 px, nada que dependa solo de `:hover`). [A]

### Dobles para E2E y configuración

**R41.** DONDE la variable `INTEGRATIONS_E2E_DOUBLES` está puesta con algo dentro, la composición
DEBE cablear un doble de Graph que responde sin red (prueba buena con número y nombre fijos, y
prueba fallida con un mensaje fijo para un Access Token marcado); en su ausencia DEBE cablear el
cliente real. Solo `playwright.config.ts` DEBE activarla. [A]

**R42.** El sistema DEBE leer `WHATSAPP_GRAPH_API_VERSION`, `APP_BASE_URL` e
`INTEGRATIONS_E2E_DOUBLES` dentro de la función que las usa, nunca al importar, y las tres DEBEN
estar documentadas vacías en `.env.example`. [A]

**R43.** Esta ficha NO DEBE añadir dependencias a `package.json`, permisos nuevos ni entradas de
menú. [A, D1]

## Preguntas abiertas

Ninguna. P1–P8 las cerró el humano el 2026-10-09: son D9–D16.
