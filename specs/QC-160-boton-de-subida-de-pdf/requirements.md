# QC-160 — boton-de-subida-de-pdf · requirements.md

> **Zona** frontend · **Complejidad** — · **depends_on** QC-142 · **Rama** feature/QC-160-boton-de-subida-de-pdf
>
> **Alcance.** La subida de PDFs de QC-107 deja de estar siempre a la vista: un **botón** la abre en una
> **ventana emergente**. Se monta en `/proveedores/[id]` (estrategia `catalogo`, hoy montada a la vista) y
> en el **listado** de fórmulas `/produccion/formulas` (estrategia `formula`, montaje nuevo traído de
> QC-142). Solo PDF, hasta 10 por tanda, con estado por archivo, tal como ya lo hace el componente.
>
> **Lo que NO entra.** El permiso propio de documentos (**QC-142**). Convertir el PDF de fórmula en receta
> (**QC-159**). El catálogo desde PDF y su revisión (**QC-158**). La lógica del componente de subida
> (**QC-107**, se reutiliza tal cual).
>
> Sembrado por `/afinar-feature` el 2026-09-24. El bloque de Alcance y la tabla de «Decisiones cerradas»
> los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los reescribe: su
> trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

> Cada requisito cita entre corchetes la fila de «Decisiones cerradas» que cubre: `[D1]` es la primera
> fila de la tabla (¿Cómo aparece?) y `[D11]` la última (caso E2E de QC-142). «La subida» es el
> componente de QC-107 entero: selector de archivos, subir, quitar la selección, lista de archivos con
> su estado y mensajes de error. «El botón» es el control que abre la ventana. «El permiso de subida» es
> `documentos.modificar`, el que exigen los casos de uso de subida desde QC-142.
>
> **[D9] no tiene requisito propio**: es una regla de proceso (revisar el choque con QC-158 al
> sincronizar, antes de implementar), no un comportamiento del sistema, y no se puede probar con un
> test. La cubre la T0 de `tasks.md`.

### El botón y la ventana

- **R1** [D1, D2] — MIENTRAS la ventana está cerrada, la pantalla de detalle de un proveedor y el
  listado de fórmulas NO DEBEN mostrar ningún control de la subida; de la subida solo DEBE verse el
  botón.
- **R2** [D1] — CUANDO el usuario pulsa el botón, el sistema DEBE abrir una ventana emergente modal,
  con título accesible, que contiene la subida completa.
- **R3** [D1] — CUANDO el usuario cierra la ventana con su control de cerrar o con la tecla Escape, el
  sistema DEBE ocultarla y dejar la pantalla sin ningún control de la subida a la vista, igual que
  antes de abrirla.
- **R4** [D1] — CUANDO la ventana se cierra, el foco DEBE volver al botón que la abrió.

### Dónde

- **R5** [D2] — CUANDO se sube una tanda desde la ventana de la pantalla de detalle de un proveedor, el
  sistema DEBE encolarla con la estrategia `catalogo`.
- **R6** [D2, D3] — CUANDO se sube una tanda desde la ventana del listado de fórmulas, el sistema DEBE
  encolarla con la estrategia `formula`.
- **R7** [D2, D3] — El botón y la subida NO DEBEN aparecer en ninguna otra pantalla: ni en el alta ni en
  la edición de una fórmula, ni en el listado de proveedores, ni en el detalle de un proveedor que no
  existe o cuya carga falló.

### Qué sube (heredado de QC-107)

- **R8** [D4] — Dentro de la ventana, la subida DEBE admitir solo archivos PDF, hasta el máximo por
  tanda que publica el módulo `documentos`, rechazar una selección que lo supere y mostrar el estado de
  cada archivo, igual que el componente de QC-107 montado a la vista.
- **R9** [D4] — Esta feature NO DEBE cambiar el comportamiento del componente de subida ni el de las
  acciones del módulo `documentos`: las pruebas del componente de QC-107 DEBEN seguir pasando sin
  modificar sus casos.

### Quién ve el botón

- **R10** [D5] — SI el usuario de la sesión tiene el permiso de subida y el permiso de consulta de la
  pantalla, ENTONCES la pantalla DEBE mostrar el botón.
- **R11** [D5] — SI el usuario de la sesión no tiene el permiso de subida, aunque tenga
  `proveedores.modificar`, `recetas.modificar` o `documentos.consultar`, ENTONCES ni el botón ni la
  subida DEBEN existir en el HTML servido.
- **R12** [D5] — La decisión de mostrar el botón DEBE tomarse en el servidor, por código de permiso y
  nunca por nombre de rol, con el mismo código que exigen los casos de uso de subida y sin escribir ese
  código fuera del módulo `documentos`; ningún componente de cliente DEBE recibir la lista de permisos
  del usuario.
- **R13** [D5] — SI una acción de subida responde «no autorizado» con la ventana abierta (por ejemplo,
  porque el permiso se retiró después de pintar la pantalla), ENTONCES la ventana DEBE mostrar el error
  de autorización del componente y NO DEBE dar la tanda por encolada.
- **R14** [D5] — Cada pantalla DEBE seguir exigiendo su propio permiso de consulta
  (`proveedores.consultar`, `recetas.consultar`) antes de cualquier lectura, incluida la que decide si
  se muestra el botón.

### Plataformas

- **R15** [D1] — El botón y el control de cerrar DEBEN tener un área táctil de al menos 44x44 px, y la
  ventana DEBE caber en el alto visible de un móvil desplazando su contenido por dentro cuando la lista
  de archivos no quepa.

### Recorrido completo

- **R16** [D6] — CUANDO un Administrador sembrado abre la ventana en el detalle de un proveedor y sube
  tres PDFs, el sistema DEBE llevar cada archivo hasta el estado terminado y persistir una tanda con
  estrategia `catalogo`; antes de pulsar el botón, la subida NO DEBE estar visible.
- **R17** [D3, D6] — CUANDO un Administrador sembrado abre la ventana en el listado de fórmulas y sube
  dos PDFs, el sistema DEBE llevar cada archivo hasta el estado terminado y persistir una tanda con
  estrategia `formula`.
- **R18** [D5, D6, D11] — CUANDO un usuario cuyo rol tiene `proveedores.consultar` y `proveedores.modificar`
  pero no `documentos.modificar` abre el detalle de un proveedor de su empresa, el sistema NO DEBE
  mostrarle el botón ni la subida, NO DEBE enviar ningún archivo al almacenamiento y NO DEBE persistir
  ninguna tanda nueva en esa empresa.
- **R19** [D6] — Los recorridos de R16, R17 y R18 DEBEN correr sin red: IA, cola y almacenamiento con
  los dobles existentes del módulo, y el único tráfico que sale del navegador, la subida al enlace
  firmado, interceptado por el propio recorrido.

### Sin dependencias

- **R20** [D7] — Esta feature NO DEBE añadir ninguna dependencia al manifiesto del proyecto, y la
  ventana DEBE construirse con la primitiva de diálogo que ya existe en el repositorio, sin crear otra.

### Cerrar a mitad de tanda y dónde va el botón

- **R21** [D1, D8] — CUANDO el usuario cierra la ventana con archivos elegidos, subiendo, en cola o
  procesando y la vuelve a abrir sin salir de la pantalla, el sistema DEBE mostrar los mismos archivos
  con su estado actualizado, sin pedir confirmación al cerrar; la tanda solo DEBE vaciarse con «Quitar
  la selección» o al salir de la pantalla.
- **R22** [D10] — El botón DEBE tener el texto «Subir PDFs» y DEBE aparecer, en el detalle de un
  proveedor, después de la cabecera del proveedor y antes del catálogo; y en el listado de fórmulas,
  en la misma fila que el enlace «Nueva fórmula».

## Preguntas abiertas

Ninguna.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-09-24 | ¿Cómo aparece la subida? | Un **botón** que la abre en una **ventana emergente** (diálogo); al cerrarla la pantalla queda limpia. |
| 2026-09-24 | ¿Dónde? | `/proveedores/[id]` (estrategia `catalogo`) y el **listado** `/produccion/formulas` (estrategia `formula`). |
| 2026-09-24 | ¿El montaje en fórmulas? | **Sale de QC-142 y entra aquí.** QC-142 queda solo con el permiso (y pasa a `zone: backend`). |
| 2026-09-24 | ¿Tipos de archivo? | **Solo PDF**, hasta 10 por tanda. Heredado de QC-107: el componente ya lo cumple y no se toca. |
| 2026-09-24 | ¿Quién ve el botón? | Solo quien tiene el permiso que exige la subida. Heredado de QC-142 (`documentos.modificar`); la autorización sigue en el service (QC-106/QC-111). |
| 2026-09-24 | ¿E2E? | **Sí.** Se ajusta el recorrido de QC-107 (pulsar el botón primero) y se suma fórmulas. IA y cola simuladas; el gate corre sin red. |
| 2026-09-24 | ¿Librería nueva? | **No.** El diálogo sale de shadcn, ya montado; no se re-crea. |
| 2026-09-24 | ¿Qué pasa si se cierra la ventana a mitad de tanda? | **Sin aviso; al reabrir se ve la misma tanda con su estado** (`keepMounted`). `components/ui/dialog.tsx` recibe la prop opcional que la reenvía al portal. |
| 2026-09-24 | ¿Choque de archivos con QC-158 en `/proveedores/[id]`? | Se revisa **al sincronizar con `dev`, antes de implementar**. |
| 2026-09-24 | ¿Dónde va el botón y qué dice? | En proveedores, **entre la cabecera y el catálogo**; en fórmulas, **junto a «Nueva fórmula»**. Texto: **«Subir PDFs»**. |
| 2026-09-24 | ¿Qué hace el caso E2E de QC-142 del usuario sin `documentos.modificar`? | Pasa a comprobar que **no ve el botón, no sube nada y no se crea ninguna tanda**. El rechazo del service queda cubierto por los unitarios de QC-142. |
