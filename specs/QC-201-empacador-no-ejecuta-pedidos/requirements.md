# QC-201-empacador-no-ejecuta-pedidos — requirements

> Origen: petición del humano por chat (2026-10-04), ampliada el mismo día con la regla de
> visibilidad del Empacador. Sin ficha de Jira todavía: la entrada en `feature_list.json` la crea
> el leader, no este spec.

## Alcance

**Problema.** Un usuario con rol Empacador ve en `/asignacion` («Mis asignados») los pedidos
`PENDIENTE`, `EN_CURSO` y `BLOQUEADO` de los que es responsable, ve el botón «Entrar», puede abrir
`/asignacion/[id]` y comenzar/terminar la ejecución. Causa: la lista, la pantalla de ejecución y los
tres casos de uso (leer, comenzar, terminar) solo exigen `asignaciones.consultar`, y el Empacador
tiene ese permiso en el seed para poder entrar a `/asignacion`.

**Dentro.**
- Permiso nuevo `asignaciones.ejecutar` en el catálogo, asignado a Administrador y Operador.
- La ejecución (leer la pantalla, comenzar, terminar) exige `asignaciones.ejecutar`.
- La UI no emite «Entrar» sin ese permiso; la decisión baja por props desde el servidor.
- Sin `asignaciones.ejecutar`, ningún pedido en estado previo al empaque aparece en `/asignacion`.
- Migración de datos reversible y actualización de los tests/guardias de catálogo y de roles.

- Sin `asignaciones.ejecutar` la pestaña «Mis asignados» no se ofrece (decidido por permisos en
  `resolveAssignmentViews`).
- Sin `asignaciones.ejecutar`, «Terminados» solo muestra los pedidos que empacó el propio usuario.

**Fuera.**
- Cambiar quién puede ser responsable de un pedido (`canBeResponsible`): queda igual (D12).
- Cambiar la vista «Por empacar», la pantalla `/asignacion/empaque/[id]` o sus casos de uso
  (`empaque.modificar`).
- Cambiar `/asignacion` como pantalla: sigue exigiendo `asignaciones.consultar`.
- Invalidación inmediata de sesiones al cambiar permisos (es QC-23): riesgo aceptado (D11).

## Decisiones cerradas (no reabrir)

| # | Decisión | Fuente | Cubierta por |
|---|----------|--------|--------------|
| D1 | Se crea el permiso `asignaciones.ejecutar`, descripción «Entrar, comenzar y terminar la ejecución de los pedidos asignados». | Humano, chat 2026-10-04 | R1, R2 |
| D2 | Lo reciben Administrador y Operador; el Empacador NO. | Humano, chat 2026-10-04 | R3, R4 |
| D3 | Sin `asignaciones.ejecutar` la columna/botón «Entrar» no se emite. Se decide en servidor y baja por props (patrón `canModifyAssignments`), nunca por nombre de rol. | Humano, chat 2026-10-04 | R9, R10, R11 |
| D4 | `/asignacion/[id]` exige `asignaciones.ejecutar` con `requirePagePermission` (404 sin él). | Humano, chat 2026-10-04 | R8 |
| D5 | Los casos de uso de leer, comenzar y terminar la ejecución exigen `asignaciones.ejecutar` en su primera línea. | Humano, chat 2026-10-04 | R5, R6, R7 |
| D6 | Migración Prisma de datos, reversible, que añade el permiso y lo asigna a los roles existentes Administrador y Operador, con el patrón de la migración de `empaque.modificar`. | Humano, chat 2026-10-04 | R12, R13 |
| D7 | Los tests/guardias que fijan permisos por rol y el catálogo se actualizan. | Humano, chat 2026-10-04 | R14, R15 |
| D8 | El Empacador solo ve un pedido a partir de `POR_EMPACAR`; antes (`PENDIENTE`, `EN_CURSO`, `BLOQUEADO`) no le aparece en ninguna vista de `/asignacion`. El filtrado lo hace el servidor según el permiso, nunca por nombre de rol. | Humano, chat 2026-10-04 (aclaración) | R16, R17, R18 |
| D9 | (era P1) Se oculta la pestaña «Mis asignados» al Empacador, que solo ve «Terminados» y «Por empacar». Se decide por permisos en `resolveAssignmentViews`, nunca por nombre de rol. | Humano, chat 2026-10-04 | R19, R19a |
| D10 | (era P2) En «Terminados» el Empacador solo ve los pedidos que empacó él (`packedBy` = actor), filtrado en servidor. | Humano, chat 2026-10-04 | R20, R20a |
| D11 | (era P3) Se acepta que los Operadores con sesión abierta al desplegar reciban el permiso al volver a iniciar sesión (hasta 8 h). Riesgo aceptado. | Humano, chat 2026-10-04 | R21 |
| D12 | (era P4) El Empacador sigue pudiendo asignarse como responsable, sin cambios. | Humano, chat 2026-10-04 | R22 |

## Requisitos (EARS)

### Catálogo y seed

- **R1.** El catálogo de permisos DEBE contener exactamente una entrada nueva con código
  `asignaciones.ejecutar`, módulo `asignaciones`, acción `ejecutar` y descripción
  `Entrar, comenzar y terminar la ejecución de los pedidos asignados.`, conservando idénticas todas
  las entradas previas.
- **R2.** El sistema DEBE admitir `ejecutar` como acción del catálogo **solo** para el módulo
  `asignaciones`; cualquier otro módulo DEBE seguir declarando únicamente `consultar` y/o
  `modificar`. (Enmienda explícita de la regla «toda acción es `consultar` o `modificar`».)
- **R3.** El seed DEBE asignar `asignaciones.ejecutar` al rol Administrador y al rol Operador, y
  DEBE dejar el resto de permisos de esos dos roles exactamente como estaban.
- **R4.** El seed NO DEBE asignar `asignaciones.ejecutar` al rol Empacador ni al rol Maestro, y el
  conjunto de permisos del Empacador DEBE seguir siendo exactamente `asignaciones.consultar`,
  `terminados.consultar` y `empaque.modificar`.

### Autorización en los casos de uso (frontera real)

- **R5.** CUANDO se invoque la lectura de la ejecución de un pedido asignado, SI el actor no tiene
  `asignaciones.ejecutar`, ENTONCES el sistema DEBE rechazar con el error de autorización del
  módulo `asignaciones` sin invocar ningún puerto (repositorio de asignaciones, catálogo de pedidos,
  recetas, unidades, productos ni presentaciones) y sin validar la entrada.
- **R6.** CUANDO se invoque comenzar la ejecución de un pedido asignado, SI el actor no tiene
  `asignaciones.ejecutar`, ENTONCES el sistema DEBE rechazar con el error de autorización sin
  invocar ningún puerto y sin transicionar el pedido.
- **R7.** CUANDO se invoque terminar la ejecución de un pedido asignado, SI el actor no tiene
  `asignaciones.ejecutar`, ENTONCES el sistema DEBE rechazar con el error de autorización sin
  invocar ningún puerto, sin crear asignaciones de empacador y sin transicionar el pedido.
  - R7a. `asignaciones.consultar` y `empaque.modificar` NO DEBEN sustituir a
    `asignaciones.ejecutar` en R5–R7 (pertenencia exacta, sin implicación entre permisos).
  - R7b. SI el actor tiene `asignaciones.ejecutar`, ENTONCES R5–R7 DEBEN comportarse exactamente
    como hoy (mismas validaciones, mismos errores, mismas transiciones), aunque el actor no tenga
    `asignaciones.consultar`.

### Pantalla de ejecución

- **R8.** CUANDO un usuario sin `asignaciones.ejecutar` pida `/asignacion/[id]`, el sistema DEBE
  responder 404, con el mismo contenido que cualquier 404 de la zona privada, antes de leer
  parámetros o datos y sin transicionar el pedido.

### Presentación en «Mis asignados»

- **R9.** El sistema DEBE exponer, desde el módulo `asignaciones`, una pregunta booleana que no
  lanza («¿este portador de permisos puede ejecutar pedidos asignados?») cuyo veredicto coincida
  exactamente con el de la autorización de R5–R7 para cualquier conjunto de permisos (incluidos
  portador ausente, sin conjunto o conjunto vacío → `false`).
- **R10.** MIENTRAS el usuario de la sesión no tenga `asignaciones.ejecutar`, la tabla de
  «Mis asignados» NO DEBE emitir en el HTML ni la columna «Entrar» ni ningún enlace a
  `/asignacion/[id]`.
- **R11.** MIENTRAS el usuario de la sesión tenga `asignaciones.ejecutar`, la tabla de
  «Mis asignados» DEBE emitir la columna «Entrar» con el mismo comportamiento que hoy.
  - R11a. Ningún archivo bajo `app/` DEBE calcular esa decisión leyendo el nombre del rol ni
    escribiendo el código `asignaciones.ejecutar` fuera de la llamada a `requirePagePermission`.

### Migración de datos

- **R12.** CUANDO se aplique la migración UP sobre una base que ya tiene los roles Administrador,
  Operador y Empacador, el sistema DEBE crear el permiso `asignaciones.ejecutar` (R1) y asignarlo a
  Administrador y Operador, SIN tocar ninguna otra fila de `permissions`, `role_permissions` ni
  `roles`, y de forma idempotente (aplicarla dos veces deja el mismo estado).
- **R13.** CUANDO se aplique la migración DOWN, el sistema DEBE retirar todas las asignaciones de
  `asignaciones.ejecutar` y el propio permiso, sin tocar ninguna otra fila.

### Tests y guardias existentes

- **R14.** Los tests de catálogo y de permisos por rol (recuentos, listas exactas por rol,
  `ADMIN_EXCLUDED_PERMISSIONS`) DEBEN reflejar R1–R4 sin relajar ningún aserto ajeno a este cambio.
  `asignaciones.ejecutar` NO DEBE entrar en `ADMIN_EXCLUDED_PERMISSIONS`.
- **R15.** La regla de contrato del módulo `asignaciones` que limita quién puede nombrar sus códigos
  de permiso DEBE vigilar también `asignaciones.ejecutar` y DEBE permitirlo únicamente en: los tres
  casos de uso de ejecución, el archivo de dominio que define la pregunta de R9 (las vistas de R19,
  «Mis asignados» de R16 y «Terminados» de R20 usan esa pregunta, no el código) y
  `app/(private)/asignacion/[id]/page.tsx`. Esos tres casos de uso y esa página DEJAN de estar
  autorizados a nombrar `asignaciones.consultar`.

### Visibilidad previa al empaque (D8)

- **R16.** MIENTRAS el actor no tenga `asignaciones.ejecutar`, el caso de uso que lista
  «Mis asignados» NO DEBE devolver ningún pedido en estado `PENDIENTE`, `EN_CURSO` o `BLOQUEADO`
  (hoy son los únicos estados que esa lista devuelve, así que la página resulta vacía con
  `total = 0`), y NO DEBE consultar el catálogo de pedidos para construirla.
- **R17.** MIENTRAS el actor tenga `asignaciones.ejecutar`, el caso de uso que lista
  «Mis asignados» DEBE devolver exactamente lo que devuelve hoy.
- **R18.** El sistema NO DEBE mostrar a un usuario sin `asignaciones.ejecutar` y sin
  `pedidos.consultar` ningún pedido en estado `PENDIENTE`, `EN_CURSO` o `BLOQUEADO` en ninguna
  vista de `/asignacion` (`asignados`, `terminados`, `por_empacar`) ni en `/asignacion/[id]`.
  Verificable de punta a punta con un Empacador responsable de un pedido `PENDIENTE`.
### Pestañas de `/asignacion` (D9)

- **R19.** El sistema DEBE ofrecer la vista «Mis asignados» (`asignados`) solo a quien tenga
  `asignaciones.ejecutar`. El criterio completo de vistas, decidido únicamente por permisos, DEBE ser:
  1. con `pedidos.consultar` → `todos` (sin cambios respecto a hoy);
  2. si no: `asignados` si tiene `asignaciones.ejecutar`, seguida de `terminados` si tiene
     `terminados.consultar`;
  3. en todos los casos, `por_empacar` al final si tiene `empaque.modificar` (sin cambios);
  4. SI tras 1–3 la lista queda vacía, ENTONCES DEBE devolver `asignados`, que por R16 se
     muestra vacía (la función nunca devuelve una lista vacía).

  Con el seed resultante: Administrador → `todos`; Operador → `asignados`; Empacador →
  `terminados`, `por_empacar`.
  - R19a. CUANDO un usuario sin `asignaciones.ejecutar` pida `/asignacion?vista=asignados`, el
    sistema DEBE pintar la primera vista que tenga permitida (para el Empacador, «Terminados»), sin
    error y sin emitir la pestaña ni el contenido de «Mis asignados».

### «Terminados» del Empacador (D10)

- **R20.** MIENTRAS el actor no tenga `asignaciones.ejecutar`, el caso de uso que lista
  «Terminados» DEBE devolver únicamente los pedidos `ENTREGADO` de su empresa cuyo empacador
  registrado (`packedBy`) sea el propio actor, con el filtro, el total y la paginación resueltos en
  la consulta (no filtrando la página en memoria). Los `ENTREGADO` sin empacador registrado
  (anteriores al empaque) NO DEBEN aparecerle.
  - R20a. MIENTRAS el actor tenga `asignaciones.ejecutar`, ese caso de uso DEBE devolver
    exactamente lo que devuelve hoy (todos los `ENTREGADO` de la empresa).

### Riesgo aceptado y sin cambios

- **R21.** CUANDO un usuario cuya sesión se abrió antes de aplicar la migración inicie sesión de
  nuevo, su sesión DEBE incluir `asignaciones.ejecutar` si su rol lo tiene. Hasta entonces (máximo
  8 h) se le aplica la sesión vieja: riesgo aceptado por el humano (D11), documentado en
  `design.md > 9` y en el PR.
- **R22.** El criterio de quién puede asignarse como responsable de un pedido NO DEBE cambiar: un
  usuario con exactamente los permisos del Empacador DEBE seguir siendo elegible como responsable.

## Preguntas abiertas

Ninguna. P1–P4 se respondieron el 2026-10-04 y están en D9–D12.
