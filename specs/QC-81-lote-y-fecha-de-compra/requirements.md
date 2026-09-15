# QC-81 — lote-y-fecha-de-compra · requirements.md

> **Zona** `backend` · **Complejidad** `medium` · **depends_on** QC-49 (cerrada) ·
> **Rama** `feature/QC-81-lote-y-fecha-de-compra`
>
> **Alcance.** El lote y la fecha de compra viven en **`product_batches`**, no en el producto: cada
> entrada de mercancia es un lote con su propio correlativo y su propia fecha. El lote pasa a ser
> **obligatorio**; si quien da de alta no lo escribe, **lo genera el backend** con un numero simple
> que **continua desde el mas alto** de esa empresa, y la unicidad es **por empresa**. La fecha de
> compra es obligatoria, con **hoy** por defecto, y **nunca futura**. Las filas que ya existen se
> rellenan al migrar: el lote por orden de creacion con la serie de su empresa, y la fecha con el
> `created_at` que la fila ya tiene.
>
> **La premisa de esta ficha estaba derogada y se corrigio al acotar.** Se escribio el 2026-09-08
> diciendo que el lote es un campo del **producto** y que habia que esperar a que `products` tuviera
> `company_id`. Desde entonces cerro **QC-90**: el lote **ya existe**, en `product_batches.lot`
> —anulable, sin unicidad y sin correlativo—, un producto puede tener **varios** lotes, y
> `product_batches` **ya tiene** `company_id` desde QC-49. La fecha de compra, en cambio, **no existe
> en ninguna parte**: lo que hay es `expiry_date`, que es otra cosa.
>
> **Lo que NO entra.**
> - **La pantalla.** Que el formulario de alta muestre la fecha de compra y el lote generado es
>   **QC-103** (`zone: frontend`, «is blocked by» esta), creada el 2026-09-13 al acotar. Mismo
>   reparto que QC-87 → QC-102.
> - **El E2E**, diferido **con motivo** a QC-103: aqui no hay recorrido nuevo que mirar. Lo que se
>   exige aqui es **integracion contra base real**.
> - **Que la existencia salga de los lotes** (**QC-91**) y **el ajuste de inventario** (**QC-92**).
> - **Consumir el lote**: elegir de que lote sale lo despachado, avisos por vencer, y que cuenta
>   como lote vivo. Sigue siendo la **pregunta 2 del dominio**, abierta.
>
> *Sembrado por `/afinar-feature` el 2026-09-13. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijo el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aqui es `## Requisitos (EARS)`.*

## Requisitos (EARS)

_Pendiente: los escribe spec_author (F1.2)._

## Preguntas abiertas

Ninguna. Las dos que la ficha arrastraba desde el 2026-09-08 —la forma exacta del correlativo y que
valor reciben las filas existentes en el backfill— quedan cerradas en la tabla de abajo.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-09-08 | ¿Quién genera el lote cuando no viene escrito? | **El backend**, nunca el front por su cuenta |
| 2026-09-08 | ¿La unicidad del lote es global o por empresa? | **Por empresa.** Dos empresas distintas sí pueden repetir el mismo valor entre ellas |
| 2026-09-08 | ¿La fecha de compra admite vacío? | **No**, y su valor por defecto es la fecha actual |
| 2026-09-13 | ¿Dónde viven los dos campos, ahora que los lotes existen? | **En `product_batches`, no en `products`.** Cada entrada de mercancía es un lote con su propio correlativo y su propia fecha: comprar el mismo producto en marzo y en junio son dos lotes con dos fechas. Es lo único coherente con **QC-90**, donde el alta siempre crea un lote |
| 2026-09-13 | ¿Qué forma tiene el correlativo? | **Número simple por empresa** (1, 2, 3…). El lote sigue siendo **texto**, así que quien quiera escribir «ACME-2026-07» a mano puede. No se fija ningún formato que envejezca —ni relleno de ceros ni año dentro— |
| 2026-09-13 | Alguien escribe «50» a mano cuando la serie iba por 7. ¿Qué genera el sistema después? | **51: la serie continúa desde el más alto que ya existe en esa empresa.** Así el generador **nunca** propone un valor que ya existe. Coste aceptado: un tecleo de «9000» deja la serie saltada para siempre |
| 2026-09-13 | ¿Qué pasa con los lotes que hoy tienen `lot` vacío? | **Se les asigna al migrar** —por orden de creación, con la serie de su empresa— **y la columna pasa a NOT NULL**. Esto **cambia** lo que decidió QC-90, que lo dejó opcional a propósito: por eso se preguntó en vez de darse por hecho |
| 2026-09-13 | La fecha de compra es obligatoria: ¿qué valor reciben las filas ya existentes? | **Su propio `created_at`**, que el lote ya tiene. Es lo más cerca de la verdad que hay en la base y no exige que nadie revise datos a mano. Se descartó la fecha de la migración, que afirmaría una fecha falsa indistinguible de una real |
| 2026-09-13 | ¿La fecha de compra admite cualquier valor? | **Hoy o antes, nunca futura.** Se puede registrar una compra de la semana pasada que se carga tarde; lo que aún no llegó no es existencia |
| 2026-09-13 | ¿Entra la pantalla? | **No**: va en **QC-103**, `zone: frontend`, bloqueada por esta. Mantiene la zona limpia y el cupo de paralelismo intacto, igual que QC-87 → QC-102 |
| 2026-09-13 | ¿Qué verificación se exige? | **Integración contra base real**, que es donde viven estas reglas: el correlativo, la unicidad por empresa, el backfill y **dos altas compitiendo por el mismo número**. Un unitario con la base simulada no puede demostrar ninguna de las dos últimas. **El E2E se difiere a QC-103**, que es la que tendrá algo que mirar |
| 2026-09-13 | Autorización, idioma, borrado y forma de la fecha | **Heredados, no se reabren.** Autorización **en el service** con `inventario.modificar` (**QC-20**, **QC-90**); identificadores de base **en inglés** y borrado **lógico** (**feature 4**, **QC-14**, **QC-90**); la fecha viaja como **fecha civil `YYYY-MM-DD`** y la convierte el adaptador (**QC-90**, `expiryDate`) |
