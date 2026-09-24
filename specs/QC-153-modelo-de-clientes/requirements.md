# QC-153 — modelo-de-clientes · requirements.md

> **Zona** backend · **Complejidad** — (la asigna el leader en F1.0) · **depends_on** — · **Rama** feature/QC-153-modelo-de-clientes
>
> **Alcance.** La tabla de clientes (`customers`) con sus campos, migración escrita y revisada con su
> `down.sql`, RLS como el resto de tablas del dominio, y la **enmienda al catálogo de permisos**:
> `clientes.consultar` y `clientes.modificar`, asignados **solo al Administrador** en el seed.
>
> **Lo que NO entra.** Casos de uso y Server Actions (**QC-154**). La pantalla (**QC-155**). El enlace
> pedido ↔ cliente (**QC-156**).
>
> Sembrado por `/afinar-feature` el 2026-09-23. El bloque de Alcance y la tabla de «Decisiones cerradas»
> los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los reescribe: su
> trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

Notación EARS (`docs/specs.md`). **«El sistema»** aquí es la **capa de persistencia** de QuimiCloude
—el esquema Prisma (`db/schema.prisma`) más la base Postgres con la migración de esta ficha
aplicada—, **el armazón del módulo `clientes`**, y el **catálogo cerrado de permisos con su seed**
(`lib/modules/identity/domain/permissions.ts` y la migración que lo lleva a una instalación ya
sembrada). No hay caso de uso, ni service, ni Server Action, ni pantalla en esta ficha (decisiones
«¿Cómo se reparte el módulo?» y «¿Quién puede?»: el service que valida los permisos es **QC-154**).
Mismo encuadre que **QC-42** (modelo de proveedores) y, para la enmienda del catálogo, que **QC-144**.

### Datos del cliente

**R1.** El sistema DEBE persistir, para cada cliente, un identificador propio, estable y no derivado
de sus datos de negocio, más sus **nombres** y sus **apellidos** en dos datos separados, su
**ciudad**, su **teléfono**, su **correo** y su **dirección**.

**R2.** SI se intenta persistir o modificar un cliente sin nombres, sin apellidos o sin ciudad,
ENTONCES el sistema DEBE rechazar la operación **en la propia base de datos** y no crear ni modificar
ninguna fila.

**R3.** El sistema DEBE aceptar un cliente al que le falte cualquier combinación de teléfono, correo y
dirección —incluidos los tres a la vez—, conservando cada dato ausente como **ausencia de valor**, y
NO DEBE exigir que exista al menos uno de ellos.

**R4.** El sistema NO DEBE almacenar para el cliente ningún dato de negocio distinto de los seis de R1:
ni NIT, ni documento de identidad, ni persona de contacto.

**R5.** El sistema NO DEBE limitar en la columna la longitud de ninguno de los seis datos de R1, y NO
DEBE rechazar un cliente por la longitud de ninguno: los largos máximos son validación de aplicación
y pertenecen a **QC-154**.

**R6.** El sistema NO DEBE exigir en la base ningún formato del teléfono ni del correo: DEBE aceptar
como correo cualquier texto, incluido uno sin forma de correo, y como teléfono cualquier texto.

### Duplicados

**R7.** El sistema DEBE aceptar dos clientes vivos de la misma empresa con exactamente los mismos seis
datos de R1, y NO DEBE declarar ningún índice único ni restricción de unicidad sobre los datos de
negocio del cliente.

### Empresa

**R8.** SI se intenta persistir un cliente sin empresa, o con una empresa que no existe, ENTONCES el
sistema DEBE rechazar la operación **en la propia base de datos** y no crear ninguna fila.

**R9.** SI se intenta eliminar físicamente una empresa que tiene al menos un cliente, vivo o dado de
baja, ENTONCES el sistema DEBE rechazar el borrado.

**R10.** El sistema DEBE ofrecer la pareja (empresa, identificador) del cliente como **clave única
referenciable**, de modo que una fila de otra tabla que apunte a un cliente declarando una empresa
distinta de la de ese cliente sea **rechazada por la propia base de datos**.

**R11.** El sistema DEBE declarar la referencia del cliente a su empresa y las dos referencias de
auditoría al usuario como **campos escalares sin relación de Prisma**, de modo que **ninguna consulta
del cliente Prisma pueda atravesar** desde un cliente hasta una empresa o un usuario —ni por
`include`, ni por `select`, ni por filtro anidado—; y DEBE mantener aun así las tres restricciones de
clave foránea **reales en la base de datos**.

### Auditoría, borrado y marcas de tiempo

**R12.** El sistema DEBE registrar, para cada cliente, qué usuario lo creó y qué usuario lo modificó
por última vez **cuando ese usuario exista**; DEBE aceptar un cliente sin ninguno de los dos,
conservándolos como ausencia de valor; y SI se intenta registrar como autor un usuario inexistente,
ENTONCES DEBE rechazar la operación.

**R13.** SI se intenta eliminar físicamente un usuario que figura como creador o como último
modificador de algún cliente, ENTONCES el sistema DEBE rechazar el borrado, y NO DEBE convertir esa
autoría en ausencia de valor.

**R14.** CUANDO se da de baja un cliente, el sistema DEBE conservar su fila completa y registrar el
instante de la baja, sin eliminar ninguno de sus datos; y NO DEBE mantener ningún otro indicador de
estado activo o inactivo del cliente.

**R15.** El sistema DEBE registrar, para cada cliente, el instante de creación y el instante de la
última modificación, y DEBE actualizar el segundo cada vez que la fila cambia.

### Esquema, seguridad y migración

**R16.** El sistema DEBE nombrar en **inglés** y en `snake_case` la tabla, las columnas, los índices y
las restricciones que crea esta ficha, y la tabla DEBE llamarse `customers`.

**R17.** El sistema DEBE tener `ROW LEVEL SECURITY` activado **y forzado** (`FORCE ROW LEVEL
SECURITY`) en la tabla de clientes, sin ninguna policy.

**R18.** CUANDO se revierte la migración de esta ficha, el sistema DEBE quedar exactamente en el
estado previo a aplicarla: sin la tabla de clientes ni ninguno de sus índices y restricciones, sin
los dos permisos nuevos ni ninguna de sus asignaciones —las haya puesto la migración o no—, y con el
resto de permisos, roles y asignaciones intactos.

### Módulo

**R19.** El sistema DEBE declarar `clientes` como módulo propietario del modelo de cliente, y ningún
módulo distinto de `clientes` DEBE consultarlo con el cliente Prisma.

**R20.** El módulo `clientes` DEBE nacer con la forma hexagonal del repositorio: un contrato público
(`index.ts`) que solo reexporta símbolos de su propio `domain/`, las carpetas `domain/`, `ports/` y
`adapters/` como únicas carpetas del módulo, y ningún `'use server'` alcanzable desde ese contrato.

### Permisos (enmienda al catálogo cerrado)

**R21.** El catálogo de permisos DEBE contener `clientes.consultar` (módulo `clientes`, acción
`consultar`) y `clientes.modificar` (módulo `clientes`, acción `modificar`), cada uno con descripción
no vacía; y DEBE ser **exactamente el catálogo previo a esta ficha más esos dos**, sin añadir, quitar
ni renombrar ningún otro código.

**R22.** El seed DEBE asignar `clientes.consultar` y `clientes.modificar` al **Administrador**, escritos
uno a uno, y NO DEBE asignarlos a ningún otro rol: el Operador y el Empacador DEBEN conservar
exactamente los permisos que tenían antes de esta ficha.

**R23.** CUANDO se aplica la migración de esta ficha sobre una instalación ya sembrada, el sistema
DEBE crear los dos permisos y asignarlos al Administrador, sin asignarlos a ningún otro rol y sin
modificar ningún otro permiso ni ninguna otra asignación.

**R24.** SI al aplicar la migración los dos permisos o sus asignaciones al Administrador ya existen
—porque el seed los creó antes—, ENTONCES el sistema NO DEBE fallar, NO DEBE duplicar ninguna fila y
NO DEBE reescribir las que ya había.

**R25.** El fuente del catálogo de permisos DEBE documentar la enmienda en un párrafo de como mucho
cinco líneas que contenga la palabra «enmienda» y nombre los dos códigos nuevos, y ni ese párrafo ni
la primera frase del catálogo (la del recuento) DEBEN citar una ficha, un requisito, `design.md` ni
una «decisión cerrada».

### Límite de alcance

**R26.** El sistema NO DEBE incluir en esta ficha ninguna operación de alta, consulta, edición o baja
de clientes, ni ningún caso de uso, puerto con métodos, adaptador, Server Action, ruta, pantalla o
entrada de menú que las exponga; y ningún archivo de producción distinto del catálogo de permisos
DEBE nombrar `clientes.consultar` ni `clientes.modificar`.

**R27.** El sistema NO DEBE modificar en esta ficha la tabla de pedidos ni ninguna otra tabla
existente: la migración NO DEBE añadir, quitar ni cambiar ninguna columna, índice ni restricción de
otra tabla, y lo único que escribe fuera de `customers` son filas del catálogo de permisos y de sus
asignaciones.

**R28.** El sistema NO DEBE añadir en esta ficha ningún test E2E: no hay flujo navegable que visitar,
y cada requisito se verifica con tests unitarios, estáticos o de integración.

**R29.** El sistema NO DEBE incorporar ninguna dependencia de terceros nueva para cumplir los
requisitos anteriores.

### Cobertura de las decisiones cerradas

Cada fila de `## Decisiones cerradas (no reabrir)`, en el orden en que está escrita, con el requisito
que la hace testeable en **esta** ficha. Ninguna queda sin `R<n>` (regla 4 de `CLAUDE.md`).

| # | Decisión cerrada | Requisito(s) |
| --- | --- | --- |
| 1 | Nombres y apellidos separados y obligatorios, ciudad obligatoria; teléfono, correo y dirección opcionales; sin NIT ni persona de contacto | R1, R2, R3, R4 |
| 2 | Nada es único: se admiten duplicados | R7 |
| 3 | `clientes.consultar` y `clientes.modificar`, solo Administrador en el seed; enmienda al catálogo (precedente QC-144); autorización en el service | R21, R22, R23, R24, R25; el service es de QC-154 y aquí se prueba su ausencia: R26 |
| 4 | Borrado lógico con auditoría y fechas; identificadores en inglés; empresa desde el primer día con `company_id` y FK compuesta | R8, R9, R10, R11, R12, R13, R14, R15, R16, R17 |
| 5 | Tres fichas como Proveedores: QC-153 modelo, QC-154 CRUD, QC-155 pantalla | R19, R20, R26 |
| 6 | Pedido ↔ cliente no entra (QC-156) | R27 |
| 7 | E2E en la pantalla (QC-155); modelo y CRUD con unitarios e integración | R28 |
| F1.4 (2026-09-24) | Largos y formato: columnas de texto sin longitud ni formato; valores en QC-154 | R5, R6 |
| F1.4 (2026-09-24) | Auditoría `created_by`/`updated_by` con FK simples a `users` | R12, R13 |
| F1.4 (2026-09-24) | Descripciones exactas de los dos permisos | R21 |
| — (regla 7 de `CLAUDE.md`) | Ninguna librería nueva | R29 |
| — (migración reversible, `docs/architecture.md`) | `down.sql` que deja el estado exacto anterior | R18 |

## Preguntas abiertas

Ninguna.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-09-23 | ¿Qué datos tiene un cliente? | **Nombres** y **apellidos** en columnas separadas (obligatorios), **ciudad** (obligatoria); **teléfono**, **correo** y **dirección** opcionales. Sin NIT y sin persona de contacto: el cliente es una persona. |
| 2026-09-23 | ¿Qué no se puede repetir? | **Nada**: se admiten clientes duplicados (sin índice único de negocio). |
| 2026-09-23 | ¿Quién puede? | Permisos nuevos `clientes.consultar` (ver) y `clientes.modificar` (alta, edición, baja), **solo del Administrador** en el seed. Enmienda al catálogo cerrado de permisos (precedente: **QC-144**). La autorización se valida en el service (`docs/architecture.md`). |
| 2026-09-23 | Borrado, identificadores, empresa | **Borrado lógico** con auditoría `created_by`/`updated_by` y fechas; **identificadores en inglés**; **aislamiento por empresa desde el primer día** con `company_id` y FK compuesta (heredados de **QC-4**, **QC-42/QC-43** y **QC-59**). |
| 2026-09-23 | ¿Cómo se reparte el módulo? | Tres fichas como Proveedores (QC-42/43/44): **QC-153** modelo, **QC-154** CRUD, **QC-155** pantalla, en la épica nueva **QC-152 Clientes**. |
| 2026-09-23 | ¿Pedido ↔ cliente? | **No entra** en el módulo base: ficha aparte **QC-156** (bloqueada por QC-154). |
| 2026-09-23 | ¿E2E? | **Sí**, en la pantalla (**QC-155**), por tocar permisos (`CHECKPOINTS.md`). El modelo y el CRUD se verifican con tests unitarios y de integración. |
| 2026-09-24 (F1.4) | ¿Las FK de auditoría también son compuestas con la empresa? | **No.** `created_by` y `updated_by` llevan **FK simples** a `users(id)`, con borrado restringido, como todas las tablas con auditoría del repositorio. La «FK compuesta» de la decisión anterior es la clave candidata `(company_id, id)` de R10. |
| 2026-09-24 (F1.4) | Descripciones de los permisos | `clientes.consultar`: «Consultar los clientes de la empresa.»; `clientes.modificar`: «Crear, editar y borrar clientes de la empresa.» |
| 2026-09-24 (F1.4) | Largos máximos y formato | En la base, las seis columnas son **texto sin longitud y sin comprobación de formato** (precedente de proveedores e `identity`). Los largos los aplica **QC-154** en la validación: nombres 80, apellidos 80, teléfono 40, correo 160, **ciudad 80**, **dirección 200**. Sin validación de formato del correo ni del teléfono. |

## Nota F1.4 (2026-09-24)

El humano **aprobó el spec** y aceptó tal cual las tres propuestas de `spec_author`, que pasan a las
tres últimas filas de «Decisiones cerradas»:

1. **Auditoría con FK simples.**
2. **Las dos descripciones de los permisos.**
3. **Ciudad 80 y dirección 200.**

La pregunta abierta 1 ya estaba resuelta por precedente:
- `lib/modules/proveedores/domain/supplier-input.ts:5-13, 15-16, 46-52`;
- `lib/modules/identity/domain/user-input.ts:31-34, 45-47, 77-78`.

Con esto no queda ninguna pregunta abierta. Los requisitos no se renumeran.
