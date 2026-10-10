# QC-255 — sanear-suite-e2e · requirements.md

> **Zona:** `fullstack` · **Complejidad:** `medium` · **depends_on:** — ·
> **Rama:** `feature/QC-255-sanear-suite-e2e`
>
> **Alcance.** La suite E2E (Playwright) lleva en rojo desde ~2026-09-08 y el PR #199 (dev → prod)
> no pudo pasar: el job agotó sus 60 min con chromium completo y webkit en 36 de 171 tests. El
> diagnóstico (`progress/e2e-diagnostico_QC-255.md`) encontró seis causas y ninguna regresión de la
> app: una carrera del sello de sesión en los fixtures (A), un fixture con la cuenta `pending` (B),
> nueve casos escritos contra una UI o un modelo que cambiaron a propósito (C–F) y un presupuesto
> de tiempo que se agota con selectores muertos (G).
>
> **Salida (ficha):** un run E2E completo en verde, por `workflow_dispatch` o en el PR a prod,
> dentro del timeout del job.
>
> **Lo que NO entra.**
> - Arreglar la carrera del sello en la app: es QC-116, en curso en paralelo. Esta ficha no depende
>   de ese arreglo ni lo adelanta.
> - Cambiar código de producción (`app/`, `lib/`, `components/`, `hooks/`, `middleware.ts`, `db/`).
> - Servir el E2E con `next build && next start` en CI (P4).
> - El helper de espera al refresco de WebKit de QC-208 (P3).
>
> Esta ficha no tiene semilla de `/afinar-feature`: `spec_author` transcribe la tabla de abajo de la
> ficha de Jira QC-255 tal como la pasó el leader el 2026-10-10, sin reinterpretarla.

## Decisiones cerradas (no reabrir)

| # | Fuente | Decisión |
|---|---|---|
| D1 | Ficha QC-255 | Entra un helper E2E de usuarios de fixture que fija `sessionsValidFrom` en el pasado y `accountStatus: 'active'`, y se migran a él los ~52 specs que crean usuarios. |
| D2 | Ficha QC-255 | Se adaptan los specs desactualizados: errores, presentaciones, aislamiento-recetas, pedidos-cotizacion, permisos, grupos-de-trabajo, datos-de-lote-en-acondicionamiento, proveedores y usuarios. |
| D3 | Ficha QC-255 | `actionTimeout` en `playwright.config.ts`. |
| D4 | Ficha QC-255 | Se evalúa partir el job E2E de `gate.yml` por navegador. |
| D5 | Ficha QC-255 | Criterio de hecho: un run E2E completo en verde (`workflow_dispatch` o PR a prod) dentro del timeout. |
| D6 | Ficha QC-255 | No entra arreglar la carrera del sello en la app (QC-116, en paralelo). El helper no debe depender de ese arreglo. |
| D7 | Leader, 2026-10-10 | Cada ajuste adapta el test al comportamiento ACTUAL intencional, citando la ficha o el commit que lo cambió. Nunca se relaja lo que el test vigila. Si un caso ya no tiene sentido, se marca para decisión humana. |

## Requisitos (EARS)

> Cada requisito cita entre corchetes la decisión que cubre. «El helper» es el helper E2E único de
> usuarios de fixture que introduce esta ficha. «Spec» sin más es un archivo `e2e/*.spec.ts`.

### El usuario de fixture (A, B)

- **R1** [D1, D6] — CUANDO el helper crea un usuario, el sistema DEBE fijarle un sello de sesiones
  (`sessionsValidFrom`) estrictamente anterior al inicio del segundo de reloj en que se crea, con al
  menos un segundo de margen. Así, una sesión emitida en ese segundo o después no queda revocada ni
  con la regla de hoy (`iat <= sello`) ni con el arreglo que haga QC-116.
- **R2** [D1] — CUANDO el llamante no indica estado de cuenta, el helper DEBE crear el usuario con
  `accountStatus` igual a `active`.
- **R3** [D1] — SI el llamante indica un estado de cuenta, un sello u otro dato del usuario (rol,
  empresa, credenciales, nombre), ENTONCES el helper DEBE respetarlo tal cual, sin sustituirlo por
  sus valores por defecto.
- **R4** [D1] — El helper DEBE devolver el usuario creado con, al menos, los campos que hoy leen los
  specs de su `prisma.user.create` (id y los que el spec pida seleccionar).
- **R5** [D1] — Todo spec que crea usuarios con Prisma DEBE hacerlo a través del helper.
- **R6** [D1] — SI un spec crea un usuario con `prisma.user.create`, `createMany` o `upsert` fuera
  del helper, ENTONCES la guardia de fixtures de usuario DEBE fallar nombrando archivo y línea
  (sujeto a P1).
- **R7** [D1, D7] — CUANDO un spec provoca a propósito la revocación de sesiones, la revocación DEBE
  seguir observándose: el caso de `e2e/session.spec.ts` que afirma `LOGIN_ROUTE_SESSION_ENDED` y los
  de `e2e/cierre-de-sesiones.spec.ts` siguen pasando con sus afirmaciones intactas.
- **R8** [D1, D7] — CUANDO un spec ejercita estados de cuenta distintos de `active` (`login.spec.ts`,
  `establecer-contrasena.spec.ts`), DEBE seguir creando y afirmando esos estados.
- **R9** [D2] — CUANDO el caso de `errores.spec.ts` (hoy `:197`) entra con su usuario de fixture,
  DEBE aterrizar, porque su usuario nace `active` (QC-65/QC-78).

### Los casos adaptados a la UI y al modelo actuales (C–F)

- **R10** [D2, D7] — CUANDO `presentaciones.spec.ts` (R36, hoy `:280`) da de alta una presentación,
  DEBE elegir también la unidad, obligatoria desde QC-80. El panel se cierra y se mantienen todas
  las afirmaciones del caso sobre la presentación creada.
- **R11** [D2, D7] — CUANDO `aislamiento-recetas.spec.ts` (paso 4, hoy `:203`) guarda una receta,
  DEBE completar antes lo que el formulario exige para habilitar el envío desde `afa5a867`
  (2026-09-23): nombre e ingredientes con producto. Se mantienen intactas las afirmaciones de
  aislamiento entre empresas.
- **R12** [D2, D7] — CUANDO los casos de `pedidos-cotizacion.spec.ts` (hoy `:416` y `:503`, R59)
  esperan una cotización, DEBEN haber elegido antes la unidad del pedido, que `quoteOrderCostSchema`
  exige (`unitId` obligatorio, `lib/modules/pedidos/domain/order-input.ts`). Los importes esperados
  no cambian: 12.750,00, 12.752,55, el guion por encima de la existencia, el importe con envase y
  370,00.
- **R13** [D7] — SI tras elegir la unidad el importe que pinta la app difiere del esperado en R12,
  ENTONCES el importe esperado NO DEBE cambiarse: el caso queda registrado para decisión humana
  (R21).
- **R14** [D2, D7] — CUANDO `permisos.spec.ts` (hoy `:201`) comprueba en la pantalla de 404 que la
  salida existe, DEBE afirmar que el control de cerrar sesión (`private-logout`) es visible y
  alcanzable por teclado. Ese control es un botón del encabezado desde la enmienda del 2026-09-07
  (`components/private/nav-user.tsx`) y ya no hay menú de usuario que abrir. El resto del caso
  (aterrizaje, menú corto, 404 sin pista) no cambia.
- **R15** [D2, D7] — CUANDO `grupos-de-trabajo.spec.ts` (R42, hoy `:358`) mete a una persona en el
  grupo, DEBE hacerlo con el buscador de personas actual (`WorkGroupMemberPicker`, desde
  `897a4f91`). Se mantienen las afirmaciones: tras buscar su nombre la persona es el único candidato,
  se agrega sin error y aparece como única fila en la lista de miembros. El resto del recorrido
  (crear, renombrar, sacarla, borrar el grupo) no cambia.
- **R16** [D2, D7] — CUANDO `datos-de-lote-en-acondicionamiento.spec.ts` (R22, hoy `:410`) abre los
  lotes de un producto, DEBE hacerlo desde el menú de acciones de la fila, donde está desde QC-232,
  igual que los otros cuatro specs que ya lo hacen.
- **R17** [D2, D7] — CUANDO `proveedores.spec.ts` (R51, hoy `:360`) comprueba el coste de la línea
  de catálogo, DEBE afirmar dos cosas: la celda muestra el valor redondeado a dos decimales y su
  `title` conserva el valor exacto (desde `682d3e3b`, 2026-09-17).
- **R18** [D2] — CUANDO termina `usuarios.spec.ts`, su limpieza DEBE borrar los usuarios que creó y
  su empresa sin error de clave foránea. Para eso borra antes sus tokens de establecer contraseña
  (QC-79). Además, un error de la limpieza NO DEBE ocultar el error original del caso.

### Nada se relaja (D7)

- **R19** [D7] — Ningún spec DEBE contener `test.skip`, `test.fixme`, `test.fail` ni `.only`. La
  guardia de saltos lo comprueba sobre `e2e/` (sujeto a P1).
- **R20** [D7] — Cada caso adaptado DEBE conservar todo lo que vigilaba. Ninguna afirmación se borra
  sin sustituirla por una equivalente sobre el comportamiento actual. No se añaden `force: true` ni se
  sube el timeout del caso. Cada cambio queda listado en `progress/impl_QC-255.md`, en una tabla
  «caso → afirmación antes / después → ficha o commit que cambió el comportamiento».
- **R21** [D7] — SI un caso vigila un comportamiento que la app retiró a propósito y ya no tiene
  equivalente, ENTONCES NO DEBE borrarse ni saltarse: queda anotado en `## Preguntas abiertas` con la
  ficha que lo retiró y una propuesta, y la feature se detiene para que el humano decida. Hoy no hay
  ningún caso así (ver la tabla de abajo).
- **R22** [D6] — La feature NO DEBE modificar código de producción: `git diff --name-only
  origin/dev...HEAD` no lista nada bajo `app/`, `lib/`, `components/`, `hooks/`, `middleware.ts` ni
  `db/`.

### El presupuesto de tiempo (G)

- **R23** [D3] — La configuración de Playwright DEBE fijar un `actionTimeout` finito de 30 s como
  máximo. Así un click o un fill sobre un selector que no existe falla en ese plazo y no agota el
  timeout del caso.
- **R24** [D4] — DONDE el job E2E corre en CI, cada proyecto de navegador (`chromium`, `webkit`) DEBE
  correr en su propio job en paralelo, con su propia base y su propio servidor (sujeto a P2).
- **R25** [D4, D5] — CUANDO un job de navegador falla o se cancela, el otro DEBE terminar igual, y
  el resultado conjunto del E2E DEBE ser rojo (sujeto a P2).

### El criterio de hecho (D5)

- **R26** [D5] — CUANDO se lanza el E2E completo (`workflow_dispatch` sobre la rama de la feature, o
  el PR a prod), el run DEBE terminar en éxito dentro del timeout del job, con todos los tests de los
  dos proyectos ejecutados: ninguno sin correr, cortado o interrumpido.
- **R27** [D1, D5] — En el run de R26, el log del servidor NO DEBE mostrar navegaciones a
  `/login?sesion=fin` fuera de los casos que provocan la revocación a propósito (R7).

## Cobertura de las decisiones

| Decisión | Requisitos |
|---|---|
| D1 | R1–R9, R27 |
| D2 | R9–R12, R14–R18 |
| D3 | R23 |
| D4 | R24, R25 |
| D5 | R25–R27 |
| D6 | R1, R22 |
| D7 | R7, R8, R10–R17, R19–R21 |

Casos de D2 revisados contra el código el 2026-10-10: los nueve tienen un equivalente actual, y
ninguno cae en R21.

## Preguntas abiertas

- **P1 — ¿Entran las dos guardias (R6 y R19)?** Ni la ficha ni el diagnóstico las piden. Sin la de
  R6, el spec número 53 vuelve a nacer con `prisma.user.create` y la carrera vuelve en silencio; así
  pasó con las copias de `login()` antes de QC-93 (`tests/guards/guard-e2e-landing.test.ts`). La de
  R19 hace mecánico el «nunca se relaja». Cuestan un archivo cada una y no tocan la app.
  **Recomendada: sí, las dos.** Si el humano dice que no, R6 y R19 salen y R5 se verifica con un
  `grep` en la revisión.
- **P2 — ¿Matriz por navegador y con qué nombre de check (R24, R25)?** La ficha dice «evaluar».
  - **(a)** Matriz por proyecto (`--project=chromium` / `--project=webkit`), cada job con su
    Postgres y su servidor, más un job final `e2e` que exige los dos. El check se sigue llamando
    `e2e` y una regla de rama que lo nombre no cambia. Tiempo de pared estimado: 15–20 min.
  - **(b)** `--shard=1/2,2/2`: mezcla navegadores en cada shard y no aísla los flakes de WebKit.
  - **(c)** Un solo job, como hoy: con la suite sana cabe (25–32 min estimados) pero sin margen si
    WebKit se degrada.
  **Recomendada: (a).** Si el humano prefiere (c), R24 y R25 salen y R26 se mide con el job único.
- **P3 — QC-208 (helper de espera al refresco en WebKit): ¿se absorbe?** Su causa es otra
  (`router.refresh()` frente a `page.goto` en WebKit, no el sello) y tiene abierta su propia decisión
  de diseño (detectar el refresco RSC o que cada llamante diga qué esperar). Además el diagnóstico
  de #199 no la encontró entre los rojos duros. Absorberla agranda una ficha que ya toca 52 specs.
  **Recomendada: fuera.** QC-255 anota en `progress/impl_QC-255.md` los flaky del run de cierre con
  la firma `interrupted by another navigation`, como entrada para QC-208.
- **P4 — `next build && next start` en CI, `retries` y `maxFailures`.** El diagnóstico los propone
  como opcionales.
  - `next start` cambia el `webServer` y obliga a revisar cómo ve `DOCUMENTS_E2E_DOUBLES` el
    servidor en runtime.
  - Bajar `retries` a 1 o poner `maxFailures` cambia lo que tolera el gate antes de medir la suite
    sana.
  **Recomendada: ninguno en esta ficha** (`retries` sigue en 2 y no hay `maxFailures`). Si el run de
  R26 no cabe en el timeout, se para y se abre ficha para `next start`.
- **P5 — `MAIL_TRANSPORT` en el `webServer` del E2E.** El log avisa `faltan RESEND_API_KEY,
  MAIL_FROM_ADDRESS` al crear usuarios desde la UI. No rompe ningún test, y el valor
  `MAIL_TRANSPORT` lo define QC-249, que está `pending`. **Recomendada: fuera**, se queda para
  QC-249.
- **P6 — ¿Qué es «verde» en R26?** Playwright da el run por bueno si un test falla y pasa en el
  reintento (flaky). **Recomendada:** verde = job en éxito, se admiten flaky, pero R27 exige cero
  `sesion=fin` espurios y el informe lista cada flaky con su primer error. Si el humano quiere cero
  flaky, R26 se endurece y probablemente arrastra a QC-208.
- **P7 — Choque con QC-116.** QC-116 (Carlos, `in_progress`) toca identity y quizá
  `e2e/session.spec.ts` o `e2e/cierre-de-sesiones.spec.ts`; todavía no tiene `tasks.md` que lo diga.
  Esta ficha toca 52 specs. **Recomendada:** que el leader lo mida con `archivos-en-vuelo` en F2.0.
  Si chocan, QC-255 se integra primero: solo cambia cómo se crea el usuario, y QC-116 resuelve
  después.
