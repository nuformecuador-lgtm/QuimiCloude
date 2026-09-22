# QC-144 — rol-empacador · requirements.md

> **Enmendado el 2026-09-22** por decisión del humano tras la implementación (fila D10 de «Decisiones
> cerradas»): R6 se reescribe para que mande `docs/conventions.md > Comentarios` (el código no cita
> fichas) y nace **R27**, la guardia de que ninguna vía de producción salvo el seed escribe en
> `roles`. El resto de requisitos no cambia.

> **Zona:** `backend` · **Complejidad:** `medium` · **depends_on:** — ·
> **Rama:** `feature/QC-144-rol-empacador`
>
> **Alcance.** Un tercer rol de semilla, **Empacador**, con la misma lógica y la misma pantalla
> `/asignacion` que el Operador: ve lo que le asignaron y lo prepara. **No ve inventario.** Además,
> nace un **permiso nuevo para ver todos los pedidos terminados de la empresa**, que tienen el
> Empacador y el Administrador y el Operador no. La lista que ese permiso abre la construye
> **QC-145**.
>
> **Lo que NO entra.** La lista de pedidos terminados, la fecha de terminado y lo que el
> Administrador ve en Asignación → **QC-145** (`pedidos-terminados-en-asignacion`), bloqueada por
> ésta. Ninguna pantalla nueva ni cambios en el selector de roles (QC-94/QC-67 ya leen la tabla).
> Ninguna tabla nueva.
>
> Sembrado por `/afinar-feature` el 2026-09-22. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

> Notación EARS (`docs/specs.md`). Cada requisito cita entre corchetes la fila de «Decisiones
> cerradas» que lo origina, numeradas en el orden de la tabla: **[D1]** qué rol nace · **[D2]** qué
> hace · **[D3]** qué lo distingue · **[D4]** cómo se hace la diferencia · **[D5]** permisos de cada
> rol · **[D6]** quién usa el permiso · **[D7]** cómo llega a los usuarios · **[D8]** E2E ·
> **[D9]** dependencia o tabla nueva · **[D10]** enmienda del 2026-09-22 (comentarios sin citas y
> guardia de escritura sobre `roles`).
>
> «Permisos del Empacador» significa siempre el conjunto que el seed le declara (R8), nunca una
> copia escrita a mano en un test. «Catálogo previo» significa el catálogo de permisos que haya en
> `dev` en el momento de implementar, **antes** de esta feature: el recuento absoluto no se fija
> aquí porque QC-142 también amplía el catálogo y el orden de merge no se conoce [D4].
> El código del permiso nuevo es **`terminados.consultar`** (`design.md > 2`).

### El rol

**R1.** El sistema DEBE declarar el rol `Empacador`, con descripción no vacía, entre los roles de
semilla, junto a `Administrador` y `Operador`, cuyos nombres y descripciones NO cambian. [D1]

**R2.** El literal `Empacador` DEBE aparecer escrito entre comillas en un único archivo del código de
producción (`lib/`, `app/`, `middleware.ts`): el catálogo de roles de `identity`. Cualquier otro
archivo de producción que necesite nombrar el rol DEBE hacerlo a través de la constante de ese
catálogo. [D1]

**R3.** El rol `Empacador` DEBE ser global: DEBE existir una sola fila con ese nombre en toda la
instalación, sin empresa, y DEBE poder asignarse a usuarios de empresas distintas. [D1]

### El permiso nuevo

**R4.** El catálogo de permisos DEBE contener el permiso `terminados.consultar`, con módulo
`terminados`, acción `consultar` y la descripción «Consultar todos los pedidos terminados de la
empresa.». [D3, D4]

**R5.** El catálogo de permisos DEBE contener exactamente los códigos del catálogo previo más
`terminados.consultar`: esta feature NO DEBE añadir, quitar ni renombrar ningún otro permiso. [D4]

**R6.** *(Enmendado el 2026-09-22, D10.)* El comentario de documentación del catálogo de permisos
DEBE contener un bloque de como mucho cinco líneas que diga que la entrada `terminados.consultar` es
una enmienda más al catálogo cerrado, porque cambia su recuento y porque su módulo `terminados` no es
una carpeta de `lib/modules/` (como ya ocurre con `usuarios`). Ni ese bloque ni la frase del
recuento del catálogo DEBEN citar una ficha (`QC-<n>`), un requisito (`R<n>`), `design.md` ni una
«decisión cerrada» (`docs/conventions.md > Comentarios`, que no admite excepciones). [D4, D10]

**R7.** El sistema NO DEBE ofrecer ninguna vía de aplicación —Server Action, route handler ni caso de
uso— que cree, edite o borre el rol `Empacador`, el permiso `terminados.consultar` o cualquiera de
sus asignaciones permiso-rol; esas filas DEBEN llegar a la base únicamente por la migración de esta
feature y por el seed. [D4, D9] *(La mitad de `roles` la vigila además R27.)*

### Los permisos de cada rol

**R8.** El seed DEBE asignar al rol `Empacador` exactamente dos permisos, escritos uno a uno:
`asignaciones.consultar` y `terminados.consultar`. En particular NO DEBE asignarle
`inventario.consultar` ni `asignaciones.modificar`. [D2, D5]

**R9.** El seed DEBE asignar al rol `Administrador` todos los permisos del catálogo, incluido
`terminados.consultar`, escritos uno a uno y sin comodín. [D5]

**R10.** El seed DEBE seguir asignando al rol `Operador` exactamente `inventario.consultar` y
`asignaciones.consultar`: NO DEBE asignarle `terminados.consultar`. [D3, D5]

### La autorización es por permiso

**R11.** SI un archivo de producción de los módulos de negocio contiene el literal del rol
`Empacador` o la constante que lo declara, ENTONCES la guardia ejecutable de autorización por
permiso DEBE fallar nombrando ese archivo, y DEBE demostrarlo sobre un fuente sintético junto con el
caso simétrico que no dispara. [D4]

**R12.** CUANDO un actor cuyo conjunto de permisos es exactamente el del Empacador invoca los casos
de uso de la lista y la ejecución de pedidos asignados (listar los asignados, abrir la ejecución,
iniciar y terminar), el sistema DEBE concederlos por las mismas reglas que al Operador, sin exigir
ningún permiso además de `asignaciones.consultar`. [D2]

**R13.** SI un actor cuyo conjunto de permisos es exactamente el del Empacador invoca un caso de uso
que exige `inventario.consultar`, `inventario.modificar` o `asignaciones.modificar`, ENTONCES el
sistema DEBE rechazarlo con el error de autorización del módulo correspondiente, sin invocar ningún
puerto. [D2, D5]

**R14.** MIENTRAS un usuario tiene el rol `Empacador`, la lista de pedidos asignados DEBE devolverle
únicamente los pedidos de su empresa en los que él es responsable, igual que a un Operador. [D2]

**R15.** CUANDO el menú privado se filtra con los permisos del Empacador, el sistema DEBE dejar
visible únicamente el enlace de Asignación, y el aterrizaje tras el login DEBE ser su ruta
(`/asignacion`). [D2]

### Sin consumidor en esta ficha

**R16.** Ningún archivo de producción distinto del catálogo de permisos DEBE contener el código
`terminados.consultar`: en esta feature ningún caso de uso, página ni enlace de menú lo exige. [D6]

### Bases ya sembradas

**R17.** CUANDO se aplica la migración de esta feature sobre una base sembrada antes de ella, el
sistema DEBE dejar creados el rol `Empacador`, el permiso `terminados.consultar` y exactamente estas
asignaciones nuevas: `Administrador -> terminados.consultar`, `Empacador -> asignaciones.consultar`
y `Empacador -> terminados.consultar`; las asignaciones del `Operador` NO DEBEN cambiar. [D4, D5, D9]

**R18.** SI la migración se aplica sobre una base en la que el rol, el permiso o alguna de esas
asignaciones ya existen, ENTONCES NO DEBE fallar, NO DEBE duplicar ninguna fila y NO DEBE reescribir
ninguna fila existente. [D9]

**R19.** CUANDO corre el seed, el sistema DEBE crear solo el rol, los permisos y las asignaciones
permiso-rol que falten y DEBE dejar intactas las que ya existan; correr el seed dos veces seguidas
DEBE producir el mismo estado que correrlo una vez. [D9]

**R20.** La migración de esta feature NO DEBE crear, alterar ni borrar ninguna tabla, columna,
índice, restricción, tipo ni política de RLS: solo DEBE escribir filas en `roles`, `permissions` y
`role_permissions`. [D9]

**R21.** CUANDO se revierte la migración de esta feature con `pnpm run db:rollback`, el sistema DEBE
retirar el permiso `terminados.consultar` con todas sus asignaciones, las asignaciones del rol
`Empacador` y el propio rol, sin tocar ninguna otra fila; SI algún usuario tiene el rol `Empacador`,
ENTONCES la reversión DEBE fallar entera sin dejar ningún cambio a medias. [D9]

### Llegada a los usuarios

**R22.** CUANDO un actor con `usuarios.consultar` o `usuarios.modificar` pide la consulta de roles que
alimenta el selector de alta y edición de usuarios, el sistema DEBE incluir el rol `Empacador` en la
respuesta, y DEBE seguir excluyendo al `Administrador`, sin ningún cambio en esa pantalla. [D7]

**R23.** CUANDO un actor con `usuarios.modificar` crea o edita un usuario de su empresa con el rol
`Empacador`, el sistema DEBE aceptarlo y persistir ese rol; SI el actor no tiene
`usuarios.modificar`, ENTONCES el sistema DEBE rechazarlo como hoy. [D7]

### Verificación y alcance

**R24.** El sistema DEBE probar R1–R23 con tests unitarios, de integración y guardias; esta feature
NO DEBE añadir ni modificar ningún spec de `e2e/`: el recorrido como Empacador y como Operador es
de QC-145. [D8]

**R25.** CUANDO el seed corre sobre una base vacía, un test de integración DEBE comprobar, leyendo
`role_permissions`, que cada rol de semilla tiene en la base exactamente el conjunto de permisos que
el seed le declara, ni uno más ni uno menos. [D5, D8]

**R26.** Esta feature NO DEBE añadir ninguna dependencia a `package.json` ni ningún modelo o campo a
`db/schema.prisma`. [D9]

### Los roles no se administran desde la aplicación

**R27.** *(Añadido el 2026-09-22, D10.)* SI un archivo de producción (`lib/`, `app/`,
`components/`, `hooks/` o un `.ts`/`.tsx` de la raíz del repositorio) distinto del adaptador del
seed contiene, fuera de comentarios, una escritura sobre la tabla `roles` —un verbo de escritura del
cliente de Prisma sobre el modelo `Role` o una sentencia SQL `INSERT INTO`, `UPDATE` o `DELETE FROM`
sobre `roles`—, ENTONCES la guardia ejecutable de permisos no administrables DEBE fallar nombrando
ese archivo; y DEBE demostrarlo sobre un fuente sintético que crea o borra un rol (dispara) junto con
el caso simétrico que solo lee `roles` o lo menciona en un comentario (no dispara). Refuerza R7 en
su mitad de roles. [D4, D10]

## Preguntas abiertas

Ninguna.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-09-22 | ¿Qué rol nace? | **«Empacador»**, añadido a `SEED_ROLES` con su descripción. El literal se escribe **solo** en `lib/modules/identity/domain/roles.ts`, como los otros dos (heredado de **QC-54**). Rol **global**, sin empresa (heredado de **QC-94**) |
| 2026-09-22 | ¿Qué hace el Empacador? | **Lo mismo que el Operador, con la misma lógica y la misma pantalla `/asignacion`**: ve lo que le asignaron y lo prepara. La ejecución exige solo `asignaciones.consultar` (heredado de **QC-63 D13**). Su lista de trabajo sigue mostrando solo lo asignado (heredado de **QC-88**). **Sin inventario** |
| 2026-09-22 | ¿Qué lo distingue del Operador? | **Ver todos los pedidos terminados de la empresa**, sin filtro por usuario (la lista es **QC-145**). El Operador **no** los ve. Se descartó que el Operador también los viera |
| 2026-09-22 | ¿Cómo se hace la diferencia? | **Con un permiso nuevo, nunca por nombre de rol**: en este repo se autoriza por permiso (guardia `guard-autorizacion-por-permiso`, **QC-86/QC-87**). El catálogo **gana exactamente una entrada** (hoy 15 → 16) y es una **enmienda más** al catálogo de QC-74, dicha así en el código como las anteriores (QC-38, QC-66, QC-86). **QC-142** (`permiso-propio-de-documentos`, `pending`) también suma un permiso: el recuento y el ordinal de la enmienda se fijan contra el catálogo que haya en `dev` al implementar, no contra el de hoy. El código lo fija `spec_author` con la forma `<modulo>.<accion>` de QC-74 R1. Cambia **solo por migración y seed** (QC-74 R5) |
| 2026-09-22 | ¿Qué permisos lleva cada rol? | **Empacador:** `asignaciones.consultar` + el permiso nuevo, y nada más: **sin** `inventario.consultar` y **sin** `asignaciones.modificar` (no asigna ni desasigna responsables). **Administrador:** gana el permiso nuevo. **Operador:** **sin cambios** (`inventario.consultar` + `asignaciones.consultar`, QC-86 R26/R27). Escritos uno a uno en `SEED_ROLE_PERMISSIONS` (heredado de **QC-74**) |
| 2026-09-22 | ¿Quién usa el permiso nuevo? | **Nadie en esta ficha**: la lista que lo exige es QC-145. Aquí solo nace en el catálogo y se asigna a los dos roles |
| 2026-09-22 | ¿Cómo llega a los usuarios? | Aparece en el selector de **alta y edición** sin tocar la pantalla (heredado de **QC-94/QC-67**). Los usuarios los sigue creando quien tenga `usuarios.modificar` (**QC-66**) |
| 2026-09-22 | ¿E2E? | **No en esta ficha: se difiere a QC-145**, que tiene la pantalla; su E2E entra como Empacador y como Operador. Precedente **QC-94 → QC-67**. Unitarios e integración **sí**, incluido el que fija que el seed da a cada rol exactamente sus permisos |
| 2026-09-22 | ¿Dependencia o tabla nueva? | **Ninguna dependencia y ninguna tabla nueva.** El rol y el permiso entran por migración y seed, que crea solo lo que falta (heredado de **QC-6**) |
| 2026-09-22 | Enmienda tras la implementación: ¿se cita la ficha en el código? ¿quién vigila las escrituras sobre `roles`? | **Manda `docs/conventions.md > Comentarios` sobre el spec:** el bloque de enmienda del catálogo explica QUÉ cambia sin citar fichas ni requisitos, y ningún test tocado tiene que citar la ficha en comentarios. **Guardia nueva en esta ficha:** ninguna ruta de producción distinta del adaptador del seed escribe en `roles` (hoy solo se vigilaban `permissions`/`role_permissions`) |
