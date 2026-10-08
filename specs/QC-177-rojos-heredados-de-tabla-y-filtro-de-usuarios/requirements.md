# QC-177 — rojos-heredados-de-tabla-y-filtro-de-usuarios: requisitos

> **Alcance.** Cinco archivos de test están en rojo en `dev` desde el 2026-09-28. Los rompieron
> tres commits que no pasaron por el flujo del arnés (`3018853a` table adjustments, `0dbcd68f` user
> filter y `a543c84d` PR #131). Viven en `tests/baseline-rojos.json`, y esta ficha los saca de ahí.
> El humano decidió caso por caso si el código se corrige o si el comportamiento nuevo se acepta.
> En el segundo caso se actualiza el test y se enmienda el spec dueño.
>
> | Archivo | Caso | Spec dueño | Commit | Decisión |
> |---|---|---|---|---|
> | `tests/unit/configuracion-ui/usuarios-viewport.test.tsx` | R21 (375 y 1280 px) | QC-67 R21 | `3018853a` | Se acepta; se adapta el test (D4) |
> | `tests/unit/configuracion-ui/unidades-viewport.test.tsx` | R27 (375 y 1280 px) | QC-39 R27 | `3018853a` | Se acepta; se adapta el test (D4) |
> | `tests/unit/inventario/product-page.test.tsx` | R18 | QC-121 R18 | `a543c84d` | Se corrige el código (D5) |
> | `tests/unit/recetas-ui/recipe-page.test.tsx` | R21 | QC-56 R21 | `a543c84d` | Se corrige el código (D6) |
> | `tests/unit/identity/account-status-scope.test.ts` | R19 | QC-65 R19 | `0dbcd68f` | Se corrige el código (D7) |
>
> **Lo que NO entra.**
> - Los demás rojos del baseline: `recetas/scope`, `recetas/module-contract` y
>   `pantallas-exigen-permiso` son de QC-180, `catalog-line.int` es D33 y
>   `recipe-form-packing-steps` es intermitente.
> - Capacidades nuevas en la tabla compartida.
> - Volver a decidir el fijado por defecto (`defaultPinned`) en columnas donde no rompe ningún
>   requisito, como la columna de acciones de productos.
> - Modelo de datos, migraciones y endpoints.
> - Cambios en `tests/unit/shared/data-table-scroll.test.tsx` y en la lista `SITIOS_PERMITIDOS`.

## Decisiones cerradas (no reabrir)

| Decisión | Origen | Requisitos |
|---|---|---|
| D1. Salida: los cinco archivos en verde y sus cinco entradas borradas de `tests/baseline-rojos.json` | Board QC-177 | R14 |
| D2. Ninguno de los dos caminos (corregir el código o actualizar el test) se da por supuesto: se decide caso por caso con el autor de los commits | Board QC-177 | R15 |
| D3. Si el comportamiento nuevo es intencionado, se enmienda el spec dueño de ese requisito | Board QC-177 | R16 |
| D4. (P1, 2026-10-08) **Se acepta el truncado por defecto.** Una columna sin `hideText` sigue llevando `overflow-hidden text-ellipsis`. Se adaptan `usuarios-viewport` (R21) y `unidades-viewport` (R27) al comportamiento nuevo y se enmiendan con fecha QC-67 y QC-39. `data-table-scroll.test.tsx` no cambia | Humano, 2026-10-08 | R1, R2, R3, R4, R5, R16 |
| D5. (P2, 2026-10-08) **Se restaura «nombre · unidad»** con `productDisplayName` (QC-121 R18) y se ajustan los E2E de inventario que QC-199 adaptó como «deuda QC-177» | Humano, 2026-10-08 | R6, R7, R8 |
| D6. (P3, 2026-10-08) **Se quita `defaultPinned` de la columna de acciones de recetas.** QC-56 R21 se mantiene | Humano, 2026-10-08 | R9, R10 |
| D7. (P4, 2026-10-08) **Verificado:** el paso con `accountStatus` de QC-145 `design.md > 3.6` lo añadió el propio `0dbcd68f` (2026-09-28, user filter); el spec aprobado no lo traía. `identity` exporta un filtro con nombre (solo cuentas activas) y `asignaciones` lo usa sin nombrar el estado. La guardia y `SITIOS_PERMITIDOS` no cambian. La nota de QC-145 se enmienda con fecha | Humano, 2026-10-08 | R11, R12, R13, R16 |

## Requisitos (EARS)

### Tabla compartida: el texto de las celdas (D4)

**R1.** DONDE una columna de la tabla compartida no declare cómo se comporta su texto, el sistema
DEBE mantener su texto en una sola línea y recortarlo con puntos suspensivos dentro del ancho de la
columna, en celdas y cabecera.

**R2.** DONDE una columna de la tabla compartida declare truncado explícito, el sistema DEBE
recortar su texto con puntos suspensivos dentro del ancho de la columna, en celdas y cabecera.

**R3.** DONDE una columna de la tabla compartida declare salto de línea, el sistema DEBE partir su
texto dentro del ancho permitido, en celdas y cabecera, sin recortarlo.

**R4.** MIENTRAS el ancho disponible no alcance para las seis columnas de la pantalla de usuarios, a
375 px y a 1280 px, la celda de correo de cada fila DEBE quedar dentro del contenedor desplazable
de la tabla, NO DEBE ocultarse y DEBE contener el correo completo. El desbordamiento NO DEBE
provocar scroll horizontal del documento. *[QC-67 R21, enmendado 2026-10-08]*

**R5.** MIENTRAS el ancho disponible no alcance para las cuatro columnas de la pantalla de
unidades, a 375 px y a 1280 px, la celda de equivalencia de cada unidad derivada DEBE quedar dentro
del contenedor desplazable de la tabla, NO DEBE ocultarse y DEBE contener la equivalencia completa.
El desbordamiento NO DEBE provocar scroll horizontal del documento. *[QC-39 R27, enmendado
2026-10-08]*

### Inventario: el nombre junto a la unidad (D5)

**R6.** DONDE el listado de inventario muestre un producto con unidad guardada y el catálogo de
unidades se haya leído, el sistema DEBE pintar en la celda de nombre «nombre · unidad», con el
símbolo de la unidad o, si no tiene símbolo, su nombre. *[QC-121 R18]*

**R7.** SI el producto no tiene unidad guardada o el catálogo de unidades no se pudo leer, ENTONCES
la celda de nombre del listado de inventario DEBE pintar solo el nombre. *[QC-121 R18]*

**R8.** CUANDO existan dos productos vivos de la empresa con el mismo nombre en unidades distintas,
el listado de inventario DEBE mostrar dos filas, y la celda de nombre de cada una DEBE llevar su
propia unidad. *[QC-121 R18, QC-199 R26]*

### Recetas: la columna de acciones no se fija (D6)

**R9.** La columna de acciones de la lista de recetas NO DEBE ofrecer al usuario fijarla ni
soltarla: no DEBE tener menú de cabecera ni control de fijado. *[QC-56 R21]*

**R10.** Cada fila de la lista de recetas DEBE mostrar editar y borrar en la columna de acciones,
visibles desde el primer render sin pasar el puntero y con un área táctil de al menos 44×44 px.
*[QC-56 R21]*

### Estado de cuenta: el selector de responsables (D7)

**R11.** CUANDO se pidan los candidatos a responsable, el sistema DEBE devolver solo personas vivas
de la empresa del actor que puedan ser responsables y cuya cuenta esté efectivamente activa.
*[QC-145 R32]*

**R12.** El conjunto de archivos de producción que nombran el estado de cuenta DEBE ser exactamente
la lista cerrada de la guardia de alcance, sin añadirle ninguna entrada. El módulo `asignaciones`
NO DEBE nombrar el estado de cuenta: el filtro de cuentas activas DEBE llegarle con nombre desde el
contrato público de `identity`. *[QC-65 R19]*

**R13.** SI un archivo de producción que no está en la lista cerrada nombra el estado de cuenta,
ENTONCES la guardia de alcance DEBE ponerse en rojo. *[QC-65 R19]*

### Baseline y forma del arreglo

**R14.** CUANDO la feature se cierre, los cinco archivos de la tabla de Alcance DEBEN pasar en verde
en el gate completo, y sus cinco entradas DEBEN estar borradas de `tests/baseline-rojos.json`, sin
añadir ninguna entrada nueva. *[D1]*

**R15.** El arreglo NO DEBE borrar, saltar ni relajar ningún caso de los cinco archivos. Solo DEBEN
cambiar los casos R21 de `usuarios-viewport` y R27 de `unidades-viewport`, y solo en lo que D4
acepta: que la celda lleve las clases de truncado. *[D2, D4]*

**R16.** El spec dueño de cada comportamiento aceptado o de cada nota corregida DEBE quedar
enmendado con fecha en esta rama: QC-67 y QC-39 (D4) y QC-145 `design.md > 3.6` (D7). *[D3]*

**R17.** El arreglo NO DEBE añadir dependencias de terceros.

## Preguntas abiertas

Ninguna. P1-P4 se cerraron el 2026-10-08 (D4-D7).
