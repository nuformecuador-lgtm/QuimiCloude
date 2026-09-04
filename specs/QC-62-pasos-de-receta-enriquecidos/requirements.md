# QC-62 — pasos-de-receta-enriquecidos · requirements.md

> **Zona** `backend` · **Complejidad** `medium` · **depends_on** — ·
> **Rama** `feature/QC-62-pasos-de-receta-enriquecidos`
>
> **Alcance.** El contenido de un paso de receta deja de ser una cadena y pasa a ser un
> **documento de estructura cerrada** —párrafo, marca de negrilla, marca de cursiva y lista de
> verificación, y nada más—, de modo que un mismo paso pueda mezclar texto y elementos marcables y
> conservar los saltos de línea. Esta ficha es **solo el contrato y el dominio**: el esquema que
> valida el documento en el borde, la desaparición del campo `type`, el tope por número de
> elementos, y el borrado de los pasos ya guardados. Los pasos se siguen guardando como **un único
> documento JSON en una sola columna** (QC-24 R4).
>
> **Lo que NO entra.** El editor enriquecido, el componente de lectura por pasos y el modal de
> vista previa: **QC-64 — editor-y-lectura-de-pasos**, que esta ficha bloquea. El acceso del
> Operador: **QC-63 — ejecutar-receta-operador**. Registrar quién marcó qué y cuándo: **no tiene
> ficha y esta acotación no la crea**. Y nada de esquema de base de datos: **no se abre
> `db/schema.prisma`** ni se crea tabla de paso.
>
> Sembrado por `/afinar-feature` el 2026-09-04 y **partido en dos el 2026-09-04** por la regla de
> partición de `fullstack` de `AGENTS.md > F1.0`. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

> Vocabulario que usan todos los requisitos de abajo, para que no haya dos lecturas:
> **documento** es el contenido completo de UN paso; **elemento** es cada párrafo y cada ítem de
> lista de verificación que hay dentro de ese documento; **fragmento** es cada trozo de texto de
> un párrafo o de un ítem, con sus marcas. «Rechazar la operación» significa rechazar el alta o
> la edición **entera**, sin guardar nada.

### Forma del documento de un paso

**R1.** El sistema DEBE representar el contenido de un paso como un **documento** formado por una
lista ordenada de elementos, DEBE admitir que un mismo documento mezcle párrafos y listas de
verificación **en cualquier orden**, y DEBE conservar ese orden tal como se recibió, tanto al
guardarlo como al devolverlo.

**R2.** El sistema DEBE admitir exactamente dos clases de elemento estructural: **párrafo** y
**lista de verificación**, y la lista de verificación DEBE estar compuesta por una lista ordenada
de **ítems**. Un párrafo PUEDE no tener ningún fragmento —es una línea en blanco— y, cuando así
llega, el sistema DEBE conservarlo: los saltos de línea del paso son estos elementos y no
caracteres dentro de un texto.

**R3.** El sistema DEBE admitir, dentro de un párrafo y dentro de un ítem, fragmentos de texto con
las marcas **negrilla** y **cursiva**, aplicables de forma independiente y combinables sobre el
mismo fragmento; y SI un fragmento no tiene ningún carácter, ENTONCES DEBE rechazar la operación.

**R4.** SI el documento de un paso contiene una clase de elemento o una marca que no sea párrafo,
lista de verificación, negrilla o cursiva —encabezado, enlace, imagen, tabla, cita, cualquier
otra—, o contiene un campo que la forma admitida no declara, ENTONCES el sistema DEBE rechazar la
operación.

**R5.** El sistema DEBE conservar el texto de cada fragmento **tal como se recibió**, y NO DEBE
recortarlo, normalizarlo ni reordenar el documento: lo que se guarda es lo que llegó, o no se
guarda nada.

### Validación en el borde

**R6.** CUANDO se recibe un alta o una edición de receta, el sistema DEBE validar el documento de
cada paso **en el borde del módulo `recetas`**, antes de que llegue al caso de uso, comprobando
únicamente su **forma**; y NO DEBE juzgar el contenido del texto de ningún fragmento.

**R7.** SI el documento de un paso no contiene ningún carácter distinto de espacio, ENTONCES el
sistema DEBE rechazar la operación; y SI un ítem de una lista de verificación no contiene ningún
carácter distinto de espacio, ENTONCES DEBE rechazar la operación igualmente.

**R8.** CUANDO el sistema rechaza una operación porque un paso incumple R1–R7 o R9, DEBE
identificar en el error la **posición** del paso que falla dentro de la lista de pasos.

### Desaparición del tipo de paso

**R9.** El contrato público del módulo `recetas` NO DEBE exponer ningún tipo de paso: ni la lista
de tipos admitidos, ni su tipo TypeScript, ni un campo `type` en la entrada de alta o edición, ni
en el paso que devuelve el detalle de una receta.

**R10.** CUANDO se devuelve el detalle de una receta, el sistema DEBE devolver cada paso como su
documento y NO DEBE devolver ningún dato derivado de él —en particular, ninguna marca de «este
paso lleva lista de verificación»—: quien lo necesite lo deduce del propio documento.

### Topes

**R11.** SI el documento de un paso tiene más elementos que el tope máximo de elementos por paso,
ENTONCES el sistema DEBE rechazar la operación en la validación de aplicación; y ese tope DEBE
estar publicado por el contrato del módulo como **una sola constante**, de modo que nadie lo
reescriba a mano en otra capa. *(El número lo cerró el humano en F1.4 el 2026-09-04: **30**. Ver la
última fila de «Decisiones cerradas».)*

**R12.** El sistema NO DEBE imponer ningún tope de **caracteres**: ni al documento del paso, ni a
un párrafo, ni a un ítem, ni a un fragmento.

**R13.** SI la lista de pasos de una receta tiene más de **50** elementos, ENTONCES el sistema
DEBE seguir rechazando la operación, y SI no se indican pasos, ENTONCES DEBE persistir una **lista
vacía** (se mantiene lo vigente de QC-24/QC-25).

### Borrado de los pasos ya guardados

**R14.** CUANDO se aplica esta feature sobre una base con datos, el sistema DEBE dejar **sin
pasos** —lista vacía— a **todas** las recetas existentes, incluidas las borradas lógicamente, y NO
DEBE convertir ningún paso guardado a la nueva forma.

**R15.** El sistema NO DEBE ofrecer ninguna vía de recuperación de lo borrado por R14: revertir la
migración DEBE dejar las recetas igualmente sin pasos, y la reversión DEBE declarar por escrito
esa irreversibilidad en vez de aparentar que restaura.

### Persistencia y permisos, sin cambios

**R16.** El sistema DEBE seguir guardando los pasos como **un único documento JSON en la columna
ya existente** de la receta, y NO DEBE crear tabla ni entidad de paso, NO DEBE añadir columna
alguna, NO DEBE derivar columna de orden y NO DEBE cambiar el tipo de la columna (QC-24 R4).

**R17.** SI la columna de pasos de una receta contiene un elemento que no tiene la forma admitida
—dato heredado, o escrito fuera de la aplicación—, ENTONCES al leer el sistema DEBE descartar
**ese** elemento y devolver los demás, y NO DEBE fallar la lectura ni dejar la pantalla sin
respuesta.

**R18.** El sistema DEBE mantener las cinco operaciones de receta como operaciones de
**Administrador**, con el actor por parámetro y la autorización en el service (QC-25 R1–R3); esta
feature NO DEBE cambiar quién puede leer ni escribir pasos.

### Puente hasta QC-64

**R19.** MIENTRAS QC-64 no esté implementada, el sistema DEBE seguir permitiendo dar de alta y
editar una receta con pasos desde la pantalla de fórmulas, escribiendo cada paso como texto plano
que viaja al contrato como un documento de un solo párrafo; y esa pantalla NO DEBE ofrecer ni
marcas ni listas de verificación mientras tanto.

## Preguntas abiertas

No se rellenan con supuestos (regla 6 de `CLAUDE.md`).

Ninguna: la única que había —cuántos elementos admite un paso— la cerró el humano al aprobar
el spec el 2026-09-04. Ver la última fila de la tabla de abajo.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
| --- | --- | --- |
| 2026-09-04 | ¿Qué forma tiene el contenido de un paso? | Un **documento de estructura cerrada**: párrafo, marca de negrilla, marca de cursiva y lista de verificación. **Nada más** —ni encabezados, ni enlaces, ni imágenes, ni tablas—. Un paso puede mezclar párrafos y elementos marcables en cualquier orden. |
| 2026-09-04 | ¿Qué pasa con el campo `type` (`'texto'` \| `'checklist'`)? | **Desaparece** del contrato. El documento del paso es la única fuente: si lleva lista de verificación, es un paso con checks. Un dato derivado que puede contradecir a su origen no se guarda —mismo criterio que el total del pedido en QC-33—. |
| 2026-09-04 | ¿Cómo se acota el tamaño de un paso? | **Sin tope de caracteres.** Se limita el **número de elementos** (párrafos e ítems) por paso; el número exacto lo fija la última fila de esta tabla. El tope de **50 pasos por receta se mantiene** (QC-24, QC-25). |
| 2026-09-04 | ¿Un paso puede quedar vacío? | **No**, heredado del contrato actual: un paso sin contenido se rechaza en el borde, igual que hoy se rechaza el paso de texto vacío. |
| 2026-09-04 | ¿Se convierten los pasos ya guardados? | **No: se BORRAN.** El humano confirma que no hay nada que preservar. Las recetas existentes quedan **sin pasos**, y **es irreversible**. No se escribe conversión de texto plano a documento. |
| 2026-09-04 | ¿Dónde se guardan los pasos? | **Sin cambios**: un único documento JSON en una sola columna, sin entidad ni tabla de paso, sin columna de orden derivada (**QC-24 R4**). Esta ficha **no toca `db/schema.prisma`**. |
| 2026-09-04 | ¿Cambian los permisos? | **No.** Las cinco operaciones de receta siguen siendo de **Administrador**, con el actor por parámetro y la autorización en el service (**QC-25 R1–R3**). Esta ficha no abre lectura a nadie. |
| 2026-09-04 | ¿Quién valida el documento? | El **borde**, con el esquema del módulo `recetas`: nada sin tipar ni sin validar cruza hacia el dominio (R38 de QC-25). El documento se valida por su **forma**, no por su contenido. |
| 2026-09-04 | ¿Cuántos elementos admite un paso? | **30** (`MAX_STEP_ELEMENTS`). Cerrada por el humano al aprobar el spec en F1.4, sobre la propuesta razonada de `design.md > 3`: con los 50 pasos vigentes el techo por receta queda en 1.500 elementos, y la asimetría manda —subir el tope después solo relaja validación, bajarlo deja recetas ya guardadas que su propio esquema rechaza al reeditarlas—. **Riesgo aceptado a la vez**: sin tope de caracteres, 30 elementos pueden ser un JSON grande, y el único freno hoy es el límite de cuerpo por defecto de las Server Actions, que da un error genérico y no de validación. |
