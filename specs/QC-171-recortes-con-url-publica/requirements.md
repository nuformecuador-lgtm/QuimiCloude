# QC-171 — recortes-con-url-publica · requirements.md

> **Zona:** `fullstack` · **Complejidad:** _la asigna el leader en F1.0_ · **depends_on:** — ·
> **Rama:** `feature/QC-171-recortes-con-url-publica`
>
> **Alcance.** Los recortes de imagen de un catálogo en PDF pasan a un bucket **público y propio**
> y se muestran con **URL pública** en vez de enlace firmado. Se guarda la **ruta** y la URL se
> compone en el servidor al leer. Aplica a las tres pantallas que muestran un recorte: la revisión
> de la importación (fila y selector de recorte), la vitrina de `/proveedores` y la tabla del
> catálogo del proveedor. En las dos últimas la imagen importada hoy no se ve, porque la pantalla
> recibe la ruta y la usa como dirección.
>
> **Lo que NO entra.** Mover los recortes que ya están en el bucket privado (se dan por perdidos).
> Borrar recortes al descartar una importación o dar de baja un proveedor (no se abre ficha hasta
> que se pida). La imagen de `products` y la de recetas, que no vienen de un recorte. Los PDF, que
> siguen en su bucket privado con enlace firmado.
>
> Sembrado por `/afinar-feature` el 2026-09-25. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

> Las decisiones cerradas se citan como `[D1]`…`[D9]` por **orden de fila** en la tabla de abajo:
> `[D1]` pueden ser públicas · `[D2]` bucket público y propio · `[D3]` se guarda la ruta, la URL se
> compone en el servidor al leer · `[D4]` los recortes del bucket privado se dan por perdidos ·
> `[D5]` QC-110 se mantiene, se deroga la fila 2026-09-24 de QC-158 · `[D6]` permisos sin cambios ·
> `[D7]` ninguna librería nueva · `[D8]` frontera con QC-176 · `[D9]` sin E2E nuevo.
> «Recorte» es el PNG que el recorte de imágenes del PDF deja en almacenamiento; «ruta» es su clave
> dentro del bucket (`<empresa>/<archivo>/<página>-<n>.png`); «las tres pantallas» son la revisión de
> la importación (fila y selector de recorte), la vitrina de `/proveedores` y la tabla del catálogo
> del proveedor.

### Dónde viven los recortes

**R1.** El sistema DEBE guardar los recortes en un bucket de **acceso público** que sea **propio de
los recortes**, configurado por su propia variable de nombre de bucket y distinto del bucket de
imágenes de receta y del bucket privado de los PDF; la dirección del proyecto y la credencial DEBEN
seguir siendo las compartidas. `[D1]` `[D2]` `[D5]`

**R2.** El sistema DEBE seguir guardando como imagen de la línea del catálogo, y devolviendo como
imagen de cada fila de la revisión, la **ruta** del recorte y nunca una URL. `[D3]`

**R3.** CUANDO se edita una línea del catálogo que tiene imagen, el sistema DEBE conservar la misma
ruta que tenía, sin sustituirla por la URL que la pantalla recibió para pintarla. `[D3]`

### Cómo se compone la URL

**R4.** El sistema DEBE componer la URL de un recorte **en el servidor, al leer**, a partir de su ruta
y de la configuración del bucket de recortes, usando la operación de URL pública de la librería de
almacenamiento ya aprobada: sin firma, sin caducidad y **sin ninguna solicitud de red**. `[D3]` `[D7]`

**R5.** La operación que compone la URL NO DEBE recibir la empresa como dato aparte: la URL DEBE
derivarse solo de la ruta, que ya lleva la empresa y el archivo. `[D1]`

**R6.** La URL compuesta NO DEBE llevar ningún token, firma ni parámetro de caducidad; servir la
imagen a partir de ella NO DEBE exigir sesión ni permiso. `[D1]` `[D6]`

**R7.** SI falta alguna de las variables de configuración del bucket de recortes en el momento de
componer una URL, ENTONCES el sistema DEBE fallar con un error que nombre las variables ausentes sin
incluir ningún valor.

**R8.** Ningún componente de cliente de las tres pantallas DEBE construir una dirección a partir de
una ruta: DEBEN recibir la URL ya compuesta por el servidor y pintarla tal cual. `[D3]`

### Revisión de la importación

**R9.** CUANDO se abre la vista previa de una importación de catálogo, el sistema DEBE devolver cada
recorte del archivo con su ruta y su URL pública, y cada fila con imagen con la URL pública de su
recorte, sin pedir ningún enlace firmado. `[D3]` `[D5]`

**R10.** CUANDO se abre la vista previa de una importación de catálogo, el sistema DEBE hacer **una
sola** solicitud al almacenamiento de recortes —el listado de los recortes del archivo—, sea cual sea
el número de recortes. `[D3]`

**R11.** CUANDO el revisor elige otro recorte en el selector, la fila DEBE pintar la URL pública de
ese recorte tal como llegó del servidor en la vista previa. `[D3]`

**R12.** Para una misma extracción y una misma lista de recortes, la ruta que la vista previa propone
para cada fila DEBE ser exactamente la que proponía antes de esta ficha: el emparejamiento de filas
con recortes no cambia, solo la URL con la que se pinta. `[D8]`

### Vitrina de `/proveedores` y tabla del catálogo

**R13.** CUANDO un usuario con `proveedores.consultar` carga una tanda de la vitrina —la primera
tanda de proveedores o «cargar más» de una fila—, el sistema DEBE devolver cada línea con la URL
pública de su recorte. `[D3]` `[D5]`

**R14.** CUANDO un usuario con `proveedores.consultar` lista el catálogo de un proveedor, el sistema
DEBE devolver cada línea con la URL pública de su imagen **además** de la ruta guardada. `[D3]` `[D5]`

**R15.** CUANDO una línea de la vitrina o de la tabla del catálogo tiene URL, la pantalla DEBE pintar
su miniatura con esa URL como origen de la imagen. `[D5]`

**R16.** SI una línea no tiene ruta de imagen, ENTONCES el sistema NO DEBE componer ninguna URL para
ella, DEBE devolverla sin URL y la pantalla DEBE mostrar el marcador de «sin imagen». `[D3]`

### Recortes anteriores

**R17.** SI la imagen de una URL compuesta no se puede cargar —como la de una línea cuya ruta apunta a
un recorte que se subió al bucket privado anterior—, ENTONCES la pantalla DEBE mostrar el marcador de
`EntityImage` en lugar de la imagen rota. `[D4]`

**R18.** El sistema NO DEBE leer, copiar ni mover ningún objeto del bucket privado anterior de
recortes: el código DEBE conocer un único bucket de recortes. `[D4]`

### Permisos y alcance

**R19.** Cada una de las tres pantallas DEBE conservar el permiso que exige hoy —`proveedores.consultar`
la vitrina y la tabla del catálogo; el de la importación de catálogo la revisión—, y SI el actor no
lo tiene, ENTONCES el sistema DEBE rechazar la lectura **sin componer ninguna URL**. `[D6]`

**R20.** El sistema DEBE seguir sirviendo los PDF desde su bucket privado con enlace firmado, y NO
DEBE cambiar cómo se guarda ni cómo se muestra la imagen de `products` ni la de recetas.

**R21.** El sistema NO DEBE añadir ninguna dependencia: la composición de la URL DEBE usar la librería
de almacenamiento ya aprobada, y el número de archivos de producción que la importan NO DEBE crecer.
`[D7]`

**R22.** Mientras el almacenamiento corre simulado para el E2E, el sistema DEBE componer la URL del
recorte en el mismo origen simulado que usa hoy la revisión, de modo que `e2e/catalogo-desde-pdf.spec.ts`
siga pasando **sin modificarse**; esta ficha NO DEBE añadir E2E, y su cobertura DEBE ser unitaria y de
integración. `[D9]`

**R23.** Esta ficha NO DEBE cambiar cómo se generan ni cómo se emparejan los recortes: la subida de
recortes, la llamada de coordenadas y el emparejamiento DEBEN conservar su comportamiento y sus tests
sin modificación. `[D8]`

## Preguntas abiertas

> Nuevas de F1.2. Ninguna reabre la tabla de decisiones: son datos operativos que no están en
> `docs/`, `specs/` ni en el código. Cada una lleva su propuesta.

- **P1. ¿Quién crea el bucket público y con qué límites, en cada entorno?** El repo no crea buckets
  (no hay SQL de `storage.buckets` en `db/`): hoy se configuran a mano. Falta el nombre del bucket y
  su tamaño máximo por archivo. **Propuesta:** el humano crea en Supabase (desarrollo y producción) un
  bucket nuevo **público**, con tipo permitido `image/png` y el mismo tamaño máximo que tenga el
  privado actual, y re-apunta `SUPABASE_CROPS_BUCKET` a él en el `.env` local y en Vercel (ver
  `design.md > 1`). Sin eso, los recortes nuevos se siguen subiendo al privado y la URL no resuelve.
- **P2. ¿Qué se hace con el bucket privado anterior?** La ficha deja fuera *mover* sus recortes, pero
  no dice si se conserva o se borra. **Propuesta:** se deja intacto; borrarlo es una operación manual
  del humano fuera de esta ficha, y ninguna línea de código lo referencia después de ella (R18).

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-09-25 | ¿Las imágenes del catálogo pueden ser públicas? | **Sí.** Las rutas llevan empresa y archivo (dos UUID) y nadie puede listar el bucket sin credencial. |
| 2026-09-25 | ¿Bucket compartido con recetas o propio? | **Público pero propio**, separado del de recetas: ciclo de vida y límites de tamaño y tipo independientes. Los buckets no tienen coste propio en Supabase. |
| 2026-09-25 | ¿Se guarda la URL o la ruta? | **La ruta.** La URL pública se compone en el servidor al leer, nunca en la pantalla. Heredado de QC-25 R25 y QC-26. |
| 2026-09-25 | ¿Qué pasa con los recortes ya subidos al bucket privado? | **Se dan por perdidos.** No se mueven; las líneas que los tienen muestran el marcador de `EntityImage` (heredado de QC-140 D5) y se re-importa el PDF si se quiere la imagen. |
| 2026-09-25 | ¿Deroga decisiones anteriores? | **QC-110 no**: su bucket «nuevo y propio» (`[D17]`) se mantiene. **Se deroga la fila 2026-09-24 de QC-158** («pintarla con URL firmada es de QC-140»): se pinta con URL pública, y lo hace esta ficha porque QC-140 cerró sin pintarla. |
| 2026-09-25 | ¿Permisos? | **Sin cambios**: cada pantalla conserva el suyo (`proveedores.consultar`, heredado de QC-140 D10; los de documentos, de QC-142 y QC-169). La URL pública no pasa por ningún permiso. |
| 2026-09-25 | ¿Librería? | **Ninguna nueva**: `getPublicUrl` de `@supabase/storage-js`, ya aprobada y en uso en recetas. |
| 2026-09-25 | ¿Frontera con QC-176? | **Esta ficha solo cambia dónde viven los recortes y cómo se muestran.** Cómo se generan y cómo se emparejan con las filas (llamada de coordenadas, recorte y subida, `crop-pairing.ts`, emparejamiento por orden en la revisión) es de **QC-176** y aquí no se toca: la revisión conserva el emparejamiento actual y solo cambia la URL con la que pinta. QC-171 va **antes** que QC-176 (link *Blocks* en el board). |
| 2026-09-25 | ¿Hace falta E2E? | **No, se difiere con motivo.** No es flujo crítico según `CHECKPOINTS.md`, y en el E2E el almacenamiento es simulado, así que no puede demostrar que la imagen se ve. Cobertura unitaria y de integración de que la URL se compone y llega a cada pantalla; el E2E de QC-158 sigue en verde. |
