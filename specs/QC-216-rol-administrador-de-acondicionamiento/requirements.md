# QC-216 — rol-administrador-de-acondicionamiento · requirements.md

> Zona: backend · Complejidad: — (la asigna el leader en F1.0) · depends_on: — · Rama: feature/QC-216-rol-administrador-de-acondicionamiento
>
> **Alcance.** Nace un rol de semilla, **Administrador de acondicionamiento**, con un permiso
> nuevo de acondicionamiento. Enmienda el catálogo cerrado de QC-74, por migración y seed. El
> rol sale en el selector de usuarios sin tocar la UI.
>
> **Lo que NO entra.** Los estados (QC-215). La pestaña y el detalle (QC-217). Ninguna pantalla
> nueva.
>
> Sembrado por `/afinar-feature` el 2026-10-06. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

> Notación EARS (`docs/specs.md`). Cada requisito cita entre corchetes la fila de «Decisiones
> cerradas» que lo origina, numeradas en el orden de la tabla: **[D1]** qué ve el rol · **[D2]** qué
> permisos recibe · **[D3]** el Administrador no lo recibe · **[D4]** por permiso, nunca por rol ·
> **[D5]** cómo se asigna · **[D6]** E2E · **[D7]** dependencia nueva. **[A]** es el bloque de
> Alcance (migración y seed, sin tocar la UI).
>
> Vocabulario fijo de este documento (lo justifica `design.md > 2`):
>
> - «el rol» = el rol de semilla de nombre exacto **`Administrador de acondicionamiento`**.
> - «el permiso» = el código **`acondicionamiento.modificar`** (módulo `acondicionamiento`, acción
>   `modificar`).
> - «los permisos del rol» = el conjunto que el seed le declara (R8), nunca una copia escrita a mano
>   en un test.
> - «catálogo previo» = el catálogo de permisos que haya en `dev` en el momento de implementar,
>   **antes** de esta feature. Medido en este worktree (base `1a1db86e`): **24** códigos y **4**
>   roles de semilla; con esta feature, **25** y **5**. El recuento se vuelve a medir contra `dev`
>   al implementar [D2].

### El rol

**R1.** El sistema DEBE declarar el rol, con descripción no vacía, como último de los roles de
semilla; `Administrador`, `Operador`, `Empacador` y `Maestro` NO DEBEN cambiar de nombre, de
descripción ni de orden relativo. [D5, A]

**R2.** El literal del nombre del rol DEBE aparecer escrito entre comillas en un único archivo del
código de producción (`lib/`, `app/`, `components/`, `hooks/` y los `.ts`/`.tsx` de la raíz): el
catálogo de roles de `identity`. Cualquier otro archivo de producción que necesite nombrar el rol
DEBE hacerlo a través de la constante de ese catálogo. [D4, D5]

**R3.** El rol DEBE ser global: DEBE existir una sola fila con ese nombre en toda la instalación,
sin empresa, y DEBE poder asignarse a usuarios de empresas distintas. [D5]

### El permiso nuevo

**R4.** El catálogo de permisos DEBE contener el permiso con módulo `acondicionamiento`, acción
`modificar` y descripción no vacía, y NO DEBE contener ningún otro código cuyo módulo sea
`acondicionamiento`. [D2]

**R5.** El catálogo de permisos DEBE ser exactamente el catálogo previo, en el mismo orden y con el
mismo módulo, acción y descripción en cada entrada, seguido del permiso como última entrada: esta
feature NO DEBE añadir, quitar, renombrar ni reordenar ningún otro permiso. [D2]

**R6.** El comentario de documentación del catálogo de permisos DEBE contener un párrafo de como
mucho cinco líneas que nombre el permiso, diga que es una enmienda más al catálogo cerrado y diga
que su módulo no es una carpeta de `lib/modules/`. Ni ese párrafo ni la frase de cabecera del
comentario DEBEN citar una ficha (`QC-<n>`), un requisito (`R<n>`), `design.md` ni una «decisión
cerrada». [D2]

**R7.** El sistema NO DEBE ofrecer ninguna vía de aplicación —Server Action, route handler ni caso
de uso— que cree, edite o borre el rol, el permiso o cualquiera de sus asignaciones permiso-rol;
esas filas DEBEN llegar a la base únicamente por la migración de esta feature y por el seed. [A, D7]

### Los permisos de cada rol

**R8.** El seed DEBE asignar al rol exactamente dos permisos, escritos uno a uno:
`asignaciones.consultar` y el permiso. En particular NO DEBE asignarle `inventario.consultar`,
`inventario.modificar`, `asignaciones.ejecutar`, `asignaciones.modificar`, `empaque.modificar`,
`terminados.consultar` ni `pedidos.consultar`. [D1, D2]

**R9.** El seed NO DEBE asignar el permiso al rol `Administrador`; el permiso DEBE figurar entre los
códigos que el Administrador no recibe, y el conjunto de permisos del Administrador DEBE ser
exactamente el que tenía antes de esta feature. [D3]

**R10.** Los conjuntos de permisos que el seed asigna a `Operador`, `Empacador` y `Maestro` DEBEN
ser exactamente los que tenían antes de esta feature, y ninguno DEBE contener el permiso. [D3]

### La autorización es por permiso

**R11.** SI un archivo de producción de los módulos de negocio contiene el literal del nombre del
rol o la constante que lo declara, ENTONCES la guardia ejecutable de autorización por permiso DEBE
fallar nombrando ese archivo; y DEBE demostrarlo sobre un fuente sintético que compara el literal y
otro que usa la constante (disparan), junto con el caso simétrico del literal dentro de un
comentario (no dispara). [D4]

**R12.** CUANDO el menú privado se filtra con los permisos del rol, el sistema DEBE dejar visible
únicamente el enlace de Asignación, y el aterrizaje tras el login DEBE ser su ruta (`/asignacion`).
[D2]

**R13.** CUANDO un usuario cuyo conjunto de permisos es exactamente el del rol pide `/asignacion`,
el corte por permiso de esa página DEBE dejarlo pasar; y CUANDO pide `/asignacion/<id>`,
`/asignacion/empaque/<id>`, `/pedidos` o `/inventario`, el corte por permiso de cada una DEBE
responder «no encontrado». [D1, D2]

**R14.** MIENTRAS el actor tiene exactamente los permisos del rol, el caso de uso que lista
«Mis asignados» DEBE devolver una página vacía (`total = 0`) sin consultar ningún puerto, aunque
el actor figure como responsable de pedidos de su empresa. [D1]

**R15.** SI un actor cuyo conjunto de permisos es exactamente el del rol invoca un caso de uso que
exige `pedidos.consultar`, `terminados.consultar`, `empaque.modificar`, `asignaciones.ejecutar`,
`asignaciones.modificar`, `inventario.consultar` o `inventario.modificar`, ENTONCES el sistema DEBE
rechazarlo con el error de autorización del módulo correspondiente, sin invocar ningún puerto. [D1,
D2]

**R16.** CUANDO se resuelven las vistas de `/asignacion` con los permisos del rol, el resultado
DEBE ser exactamente `['asignados']` (la vista de reserva, que por R14 sale vacía): en particular NO
DEBE incluir `todos`, `terminados` ni `por_empacar`. *(La vista propia del rol la añade QC-217, que
enmienda este requisito.)* [D1]

### Sin consumidor en esta ficha

**R17.** Ningún archivo de producción distinto del catálogo de permisos DEBE contener el código del
permiso: en esta feature ningún caso de uso, página ni enlace de menú lo exige. *(QC-215 y QC-217
lo consumen y relajan este requisito abriendo sus rutas exactas.)* [D2]

### Llegada a los usuarios

**R18.** CUANDO un actor con `usuarios.consultar` o `usuarios.modificar` pide la consulta de roles
que alimenta el selector de alta y edición de usuarios, el sistema DEBE incluir el rol en la
respuesta y DEBE seguir excluyendo a `Administrador` y a `Maestro`, sin ningún cambio en esa
pantalla. [D5]

**R19.** CUANDO un actor con `usuarios.modificar` crea o edita un usuario de su empresa con el rol,
el sistema DEBE aceptarlo y persistir ese rol con la empresa del actor; SI el actor no tiene
`usuarios.modificar`, ENTONCES el sistema DEBE rechazarlo como hoy. [D5]

**R20.** CUANDO un usuario con el rol inicia sesión, los permisos de su sesión DEBEN ser
exactamente los permisos del rol. [D2]

### Bases ya sembradas

**R21.** CUANDO se aplica la migración de esta feature sobre una base sembrada antes de ella, el
sistema DEBE dejar creados el rol, el permiso y exactamente estas dos asignaciones nuevas:
`<rol> -> asignaciones.consultar` y `<rol> -> acondicionamiento.modificar`; las asignaciones de
`Administrador`, `Operador`, `Empacador` y `Maestro` NO DEBEN cambiar. [A, D2, D3]

**R22.** SI la migración se aplica sobre una base en la que el rol, el permiso o alguna de esas
asignaciones ya existen, ENTONCES NO DEBE fallar, NO DEBE duplicar ninguna fila y NO DEBE
reescribir ninguna fila existente. [A, D7]

**R23.** CUANDO corre el seed, el sistema DEBE crear solo el rol, los permisos y las asignaciones
permiso-rol que falten y DEBE dejar intactas las que ya existan; correr el seed dos veces seguidas
DEBE producir el mismo estado que correrlo una vez. [A, D7]

**R24.** La migración de esta feature NO DEBE crear, alterar ni borrar ninguna tabla, columna,
índice, restricción, tipo, función, disparador ni política de RLS: solo DEBE escribir filas en
`roles`, `permissions` y `role_permissions`. [A, D7]

**R25.** CUANDO se revierte la migración de esta feature con `pnpm run db:rollback`, el sistema DEBE
retirar el permiso con todas sus asignaciones, las asignaciones del rol y el propio rol, sin tocar
ninguna otra fila; SI algún usuario tiene el rol, ENTONCES la reversión DEBE fallar entera sin dejar
ningún cambio a medias. [A, D7]

### Verificación y alcance

**R26.** CUANDO el seed corre sobre una base vacía, un test de integración DEBE comprobar, leyendo
`role_permissions`, que cada rol de semilla —el nuevo incluido— tiene en la base exactamente el
conjunto de permisos que el seed le declara, ni uno más ni uno menos. [D2, D3]

**R27.** El sistema DEBE probar R1–R26 con tests unitarios, de integración y guardias; esta
feature NO DEBE añadir ni modificar ningún spec de `e2e/`: el recorrido como acondicionador es de
QC-217. [D6]

**R28.** Esta feature NO DEBE añadir ninguna dependencia a `package.json` ni ningún modelo o campo a
`db/schema.prisma`. [D7]

### Cobertura de la tabla de decisiones

| Decisión | Requisitos |
|---|---|
| D1 ¿Qué ve el rol? | R8, R13, R14, R15, R16 (en esta ficha: ningún pedido; lo que sí ve llega con QC-217) |
| D2 ¿Qué permisos recibe? | R4, R5, R6, R8, R12, R13, R15, R17, R20, R21, R26 |
| D3 ¿El Administrador recibe el permiso? | R9, R10, R21, R26 |
| D4 ¿Por rol o por permiso? | R2, R11 |
| D5 ¿Cómo se asigna el rol? | R1, R2, R3, R18, R19 |
| D6 ¿E2E? | R27 |
| D7 ¿Dependencia nueva? | R7, R22, R23, R24, R25, R28 |

## Preguntas abiertas

1. **¿Puede el rol ser responsable de un pedido?** El criterio vigente (`canBeResponsible`, por
   permiso) hace elegible a todo el que no tenga `pedidos.consultar`, así que con R8 el rol
   aparecería en el selector de responsables de la asignación, igual que el Empacador (QC-201 D12).
   Asignárselo sería inocuo —por R14 no ve «Mis asignados»— pero ensucia el selector. Esta ficha
   **no** cambia el criterio (no toca `asignaciones`); si el humano quiere excluirlo, es una ficha
   aparte o una enmienda a QC-217. Propuesta por defecto: dejarlo como está.
2. **Textos propuestos** (no los fija ninguna decisión; `design.md > 2`): descripción del rol
   «Acondiciona los pedidos empacados de la empresa.» y del permiso «Comenzar y terminar el
   acondicionamiento de los pedidos de la empresa y registrar sus datos de lote.». Confirmar o
   cambiar en F1.4.
3. **Orden de merge con QC-215.** QC-215 consume el permiso en el service y figura con
   `depends_on: —`. Como `PermissionCode` es una unión de literales, QC-215 no compila sin esta
   ficha mergeada. Propuesta: que el leader añada `QC-216` a `depends_on` de QC-215 (o que QC-215
   mergee después).

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-10-06 | ¿Qué ve el rol? | **Solo pedidos ya empacados:** los POR_ACONDICIONAR y EN_ACONDICIONAMIENTO de su empresa, más los que acondicionó él ya entregados (para corregir sus datos de lote, QC-219). Ningún otro pedido |
| 2026-10-06 | ¿Qué permisos recibe? | **Un permiso nuevo de acondicionamiento** y lo mínimo para entrar a `/asignacion`. Sin inventario, sin `asignaciones.ejecutar` (QC-201), sin `asignaciones.modificar`, sin el permiso de empaque (QC-168). El código lo fija `spec_author` con la forma `<modulo>.<accion>`. El recuento del catálogo se fija contra `dev` al implementar |
| 2026-10-06 | ¿El Administrador recibe el permiso? | **No.** Supervisa desde «Todos» (QC-145), como con el empaque (QC-168). Operador, Empacador y Maestro no cambian |
| 2026-10-06 | ¿Por rol o por permiso? | **Por permiso, nunca por nombre de rol** (QC-86/87) |
| 2026-10-06 | ¿Cómo se asigna el rol? | Rol global de semilla; aparece en el selector de alta y edición de usuarios sin tocar la UI. Hereda QC-144 (QC-94/QC-67) |
| 2026-10-06 | ¿E2E? | **Diferida a QC-217**, que tiene la pantalla. Hereda el patrón de QC-144 |
| 2026-10-06 | ¿Dependencia nueva? | **Ninguna.** Migración y seed |
