# QC-140 — catalogo-visual-de-proveedores · requirements.md

> **Zona** fullstack · **Complejidad** high · **depends_on** QC-44, QC-52, QC-57 ·
> **Rama** `feature/QC-140-catalogo-visual-de-proveedores`
>
> **Alcance.** `/proveedores` pasa de ser una lista de proveedores a una lista donde cada fila es
> un proveedor y lleva dentro sus productos con imagen, en scroll horizontal de 10 en 10 con un
> botón «cargar más». Al bajar, los siguientes proveedores se cargan de forma perezosa de 5 en 5.
> Se filtra por nombre de producto (iLike) y por nombre de proveedor.
>
> **Lo que NO entra.** El alta, la edición y la baja de proveedores: se mudan a
> `/proveedores/<id>`, que QC-44 ya monta y que esta ficha NO toca —salvo el botón de alta, que
> vive en la cabecera de la vista nueva—. Tampoco entra el botón desde un pedido con faltante:
> eso es QC-139.
>
> Sembrado por `/afinar-feature` el 2026-09-21. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

_Pendiente: los escribe spec_author (F1.2)._

## Preguntas abiertas

1. **Qué enseña la fila con el filtro de producto activo.** ¿Solo los productos que coinciden, o
   todos los del proveedor y el filtro solo decide **qué proveedores** salen? Las dos son
   defendibles y dan pantallas distintas.
2. **Proveedor sin ninguna línea de catálogo.** ¿Aparece la fila vacía con un aviso, o no aparece
   en la lista? Afecta al censo de proveedores y por tanto a las tandas de 5.
3. **Fallo de una carga incremental.** Qué se ve si falla la tanda de 5 proveedores o el «cargar
   más» de una fila. El estado de error de la carga INICIAL sí sigue el patrón de QC-44; lo que
   no tiene precedente es el fallo a mitad de scroll.
4. **Orden por defecto** de los proveedores y de los productos dentro del carrusel.
5. **Qué librería concreta** de scroll infinito. Se decide en F1.4 (ver decisiones cerradas).

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
| --- | --- | --- |
| 2026-09-21 | ¿Cada fila es un proveedor o un producto? | **Un proveedor.** Sigue siendo la lista de proveedores; cada fila lleva dentro el carrusel de sus productos. Es la única lectura coherente con «los siguientes proveedores de 5 en 5» |
| 2026-09-21 | ¿Sustituye la lista de QC-44 o convive con ella? | **Sustituye.** La vista nueva ocupa `/proveedores` y la lista paginada de QC-44 desaparece |
| 2026-09-21 | Entonces, ¿dónde viven el alta, la edición y la baja? | **En `/proveedores/<id>`**, que QC-44 ya monta y que se queda intacto. El alta es un botón en la cabecera de la vista nueva. QC-44 **no** queda huérfana: su nivel 2 sigue vivo entero. Anotado en su ficha del board |
| 2026-09-21 | ¿La imagen del producto es obligatoria? | **No, nullable.** `SupplierCatalogLine.imagePath` ya es `String?` y así se queda |
| 2026-09-21 | ¿Qué se pinta si no hay imagen válida o es `null`? | **El marcador que ya usa toda la app**: `MISSING_IMAGE_SRC = '/inv_not_found.png'`, de `components/shared/entity-image.tsx`. `EntityImage` ya cubre los tres casos —`null`, cadena vacía y ruta que no resuelve, vía `onError`—. Se **reutiliza**, no se reimplementa |
| 2026-09-21 | ¿Coincidencia exacta o parcial en el filtro de producto? | **iLike**: parcial e insensible a mayúsculas. Cae sobre `SupplierCatalogLine.name` / `nameNormalized`, que existen desde QC-52. La línea **no** tiene `product_id`, así que filtrar por identificador no se puede hoy |
| 2026-09-21 | Tamaños de tanda | **10** productos por proveedor · **+10** por «cargar más» · **5** proveedores por carga perezosa |
| 2026-09-21 | ¿Carga perezosa a mano o con librería? | **Con librería.** La candidata la propone `spec_author` en el `design.md` y la aprueba el humano en **F1.4**, con los cuatro checks de salud y su fila en `docs/dependencias.md` (regla 7 de `CLAUDE.md`). Nadie instala nada antes |
| 2026-09-21 | ¿Hace falta E2E? | **Se difiere, con motivo, y se difiere AQUÍ y no al final.** `CHECKPOINTS.md` exige E2E para autenticación, permisos, movimientos de inventario, importes y webhooks. Esta pantalla es de solo lectura y no toca ninguno de los cinco |
| 2026-09-21 | ¿Quién puede verla? | **`proveedores.consultar`**, heredado de QC-43 R13: sin implicación entre permisos, toda lectura del catálogo lo exige. Se valida **en el service** (`docs/architecture.md > Acceso a datos y autorizacion`), con su test (`CHECKPOINTS.md`) |
| 2026-09-21 | ¿Se muestra quién creó o modificó? | **No**, heredado de QC-44, que ya cerró ese reenvío: las vistas traen ids, no nombres, y resolverlos exige consumir el contrato público de `identity` |
| 2026-09-21 | La URL | **`SUPPLIERS_ROUTE`**, la constante que ya vive en `lib/shared/routes.ts`. Ningún archivo la incrusta como literal (QC-11 R13) |
| 2026-09-21 | Borrado e identificadores de la DB | **Lógico** y **en inglés**, heredado de QC-4. Esta ficha no crea tablas, así que solo aplica a lo que consulte |
