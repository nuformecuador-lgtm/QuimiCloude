# QC-169 — permiso-de-la-confirmacion-del-catalogo · requirements.md

> **Zona:** `backend` · **Complejidad:** `low` · **depends_on:** — ·
> **Rama:** `feature/QC-169-permiso-de-la-confirmacion-del-catalogo`
>
> **Alcance.** `dev` está en ROJO desde el 2026-09-24 en
> `tests/integration/documentos/catalog-import-isolation.int.test.ts` (R21, R22 y R34 de QC-158).
> QC-158 (#119) hizo que la confirmación de la importación de catálogo exigiera
> `DOCUMENT_UPLOAD_PERMISSION`, que entonces valía `proveedores.modificar`. QC-142 (#120) cambió esa
> constante a `documentos.modificar` y la confirmación cambió de permiso sin que nadie lo decidiera.
> Esta ficha devuelve la importación a `proveedores.modificar` en el service, con sus tests, y borra
> del baseline de rojos la entrada que añadió QC-150. Solo backend: sin migración y sin UI.
>
> **Lo que NO entra.** El permiso de subir y procesar el PDF (QC-142). La pantalla de revisión, que
> ya exige `proveedores.consultar` y `proveedores.modificar` (R32 de QC-158).
>
> Decisiones cerradas por el humano el 2026-09-24 (descripción de QC-169 en `feature_list.json`).
> Esta ficha no tiene semilla de `/afinar-feature`: la tabla de abajo la transcribe `spec_author`
> sin reinterpretarla.

## Decisiones cerradas (no reabrir)

| # | Fecha | Decisión |
|---|---|---|
| D1 | 2026-09-24 | CONFIRMAR la importación del catálogo desde PDF (`confirmCatalogImport`, QC-158) exige `proveedores.modificar`, igual que editar líneas a mano. Si la confirmación crea una presentación, además exige `inventario.modificar` (F6 de QC-158, no se toca). |
| D2 | 2026-09-24 | Subir y procesar el PDF sigue exigiendo `documentos.modificar` (QC-142). No se toca. |
| D3 | 2026-09-24 | Se corrige el CÓDIGO, no los tests: `tests/integration/documentos/catalog-import-isolation.int.test.ts` vuelve a verde sin modificarlo. |
| D4 | 2026-09-24 | Se quita de `tests/baseline-rojos.json` la entrada de ese archivo que añadió QC-150. |

## Requisitos (EARS)

> Cada requisito cita entre corchetes la decisión que cubre. `[P1]` remite a P1 (la vista previa),
> cerrada por el humano el 2026-09-25 (ver la nota al final).
> "Rechazo por autorización" es el mismo `unauthorized` que usa hoy el módulo `documentos`.

### Confirmar la importación

- **R1** [D1] — CUANDO se invoca la confirmación de una importación de catálogo, el sistema DEBE
  comprobar que el actor tiene `proveedores.modificar` como **primera** operación: antes de validar
  la entrada y antes de leer el archivo, los recortes, las presentaciones, las unidades o el
  catálogo.
- **R2** [D1] — SI el actor de la confirmación es nulo, está ausente, trae el conjunto de permisos
  vacío o no tiene `proveedores.modificar`, ENTONCES el sistema DEBE rechazarla por autorización sin
  tocar ningún puerto: nada leído, nada creado, nada escrito.
- **R3** [D1, D2] — SI el actor de la confirmación tiene `documentos.modificar` pero no
  `proveedores.modificar`, ENTONCES el sistema DEBE rechazarla por autorización sin tocar ningún
  puerto. `documentos.modificar` no sustituye a `proveedores.modificar`.
- **R4** [D1] — SI el actor de la confirmación tiene `proveedores.modificar` y no tiene
  `documentos.modificar`, ENTONCES el sistema NO DEBE rechazarla por autorización, y una confirmación
  válida que no crea presentaciones DEBE escribir las líneas y devolver su resumen.
- **R5** [D1] — SI la confirmación necesita crear alguna presentación y el actor tiene
  `proveedores.modificar` pero no `inventario.modificar`, ENTONCES el sistema DEBE rechazar la
  confirmación entera por autorización sin crear ninguna presentación ni escribir ninguna línea.
- **R6** [D1] — CUANDO la confirmación no necesita crear ninguna presentación, el sistema NO DEBE
  exigir `inventario.modificar`.

### Vista previa de la importación

- **R7** [P1] — CUANDO se invoca la vista previa de una importación de catálogo, el sistema DEBE
  comprobar que el actor tiene `proveedores.modificar` como **primera** operación, antes de validar
  la entrada y antes de tocar ningún puerto.
- **R8** [P1] — SI el actor de la vista previa es nulo, está ausente, trae el conjunto vacío o no
  tiene `proveedores.modificar` (aunque tenga `documentos.modificar`), ENTONCES el sistema DEBE
  rechazarla por autorización sin tocar ningún puerto.
- **R9** [P1] — SI el actor de la vista previa tiene `proveedores.modificar` y no tiene
  `documentos.modificar`, ENTONCES el sistema DEBE devolver la vista previa del archivo.

### La subida no cambia

- **R10** [D2] — SI un actor tiene `proveedores.modificar` y no tiene `documentos.modificar`,
  ENTONCES la emisión de enlaces de subida, el encolado de una tanda y la consulta del estado de una
  tanda DEBEN rechazarlo por autorización, y el predicado que decide si se muestra el botón de
  subida DEBE devolver `false`.
- **R11** [D1, D2] — El código `proveedores.modificar` DEBE aparecer escrito como literal en un solo
  archivo fuente del módulo `documentos`, y `documentos.modificar` también en uno solo: la vista
  previa y la confirmación DEBEN compartir la misma declaración del permiso, distinta de la
  declaración del permiso de subida.

### El rojo de `dev`

- **R12** [D3] — `tests/integration/documentos/catalog-import-isolation.int.test.ts` DEBE pasar
  entero (R21, R22 y R34 de QC-158) con contenido idéntico al de `dev` en el punto de partida de
  esta rama.
- **R13** [D4] — `tests/baseline-rojos.json` NO DEBE contener ninguna entrada para
  `tests/integration/documentos/catalog-import-isolation.int.test.ts`, y el comparador del gate
  completo DEBE seguir aceptando el archivo resultante.

## Preguntas abiertas

- **P1 — ¿Qué permiso exige la VISTA PREVIA?** *Cerrada: el humano la ratificó el 2026-09-25
  (ver la nota al final).* Hoy exige `documentos.modificar` (`preview-catalog-import.ts:246`, la misma
  `DOCUMENT_UPLOAD_PERMISSION` que la confirmación). Propuesta: `proveedores.modificar`, igual que
  confirmar (R7 a R9). Hay tres motivos medidos en el código:
  1. R31 de QC-158 ya decía que «ver la vista previa y confirmar DEBEN exigir
     `proveedores.modificar`». El desvío de la vista previa tiene el mismo origen que el de la
     confirmación: el cambio de la constante en QC-142.
  2. La pantalla `/proveedores/[id]/importar/[documentoId]` corta con `proveedores.consultar` y
     `proveedores.modificar`, y justo después pide la vista previa. Un actor con
     `proveedores.modificar` y sin `documentos.modificar` entra en la pantalla y hoy recibe un
     `unauthorized` en lugar de las filas.
  3. La vista previa ya llama a `findAliveByIdentity` de `proveedores`, que exige
     `proveedores.modificar` (`find-catalog-lines-by-identity.ts:48`). Así que hoy la vista previa
     pide de hecho los dos permisos. Exigir solo `documentos.modificar` en la primera línea nunca
     pudo bastar.

  Si el humano quiere que la vista previa exija además `documentos.modificar`, R7 a R9 cambian y R9
  desaparece.
- **P2 — Tests unitarios que construyen el actor con el permiso viejo.** *Resuelta; se deja
  escrita para que el humano la vea.* D3 protege solo el archivo de integración. Hay unitarios que
  construyen el actor «con permiso» usando `DOCUMENT_UPLOAD_PERMISSION` y codifican la regla que
  esta ficha corrige. Con el código corregido pasarían a rojo:
  - `tests/unit/documentos/catalog-import-authorization.test.ts`
  - `tests/unit/documentos/confirm-catalog-import.test.ts`
  - `tests/unit/documentos/preview-catalog-import.test.ts`

  `tests/unit/documentos/catalog-import-actions.test.ts` también usa esa constante, pero solo de
  forma cosmética, porque ahí la composición es un doble. La descripción de la ficha dice «ENTRA:
  permiso en el service **con sus tests**», así que esos unitarios se actualizan al permiso nuevo.
  Lo que no se toca es el archivo de integración.
- **Nota de medición (no es pregunta).** En `progress/impl_QC-160-boton-de-subida-de-pdf.md`
  (vuelta 2) consta el commit `11f5a43f`, que añadía `documentos.modificar` a los actores del test
  de integración. En `dev`, ese archivo **no** contiene `documentos.modificar`: sus actores llevan
  solo `proveedores.modificar` e `inventario.modificar`, como los escribió QC-158. Lo he comprobado
  con grep en el worktree. D3 se cumple sobre el archivo tal como está hoy en `dev`.

## Nota: decisión cerrada tras la aprobación (no reabrir)

| Fecha | Decisión |
|---|---|
| 2026-09-25 | El humano aprobó el spec y ratificó P1: la VISTA PREVIA de la importación exige `proveedores.modificar`, igual que confirmar (D1). La cubren R7, R8 y R9. Se añade aquí y no en la tabla de arriba para no renumerar las decisiones D1 a D4. |
