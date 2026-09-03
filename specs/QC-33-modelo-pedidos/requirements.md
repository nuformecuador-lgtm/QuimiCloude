# QC-33 — modelo-pedidos · requirements.md

> **Zona:** `backend` · **Complejidad:** `medium` · **depends_on:** `QC-32`, `QC-24` ·
> **Rama:** `feature/QC-33-modelo-pedidos`
>
> **Alcance.** Persistir el pedido como **módulo hexagonal propio `pedidos`**: la tabla `Order`
> con su número correlativo por año, su receta, su cantidad, su precio **unitario**, su unidad
> del catálogo, su prioridad, su estado, su autoría y su borrado lógico. Migración con su
> `down.sql` y los tests. El módulo conoce la receta por el contrato público de `recetas`
> (`@/lib/modules/recetas`) y la unidad por el de `unidades` (`@/lib/modules/unidades`), nunca
> por sus tablas ni sus repositorios. Es la primera feature de la épica **QC-31 — Pedidos**.
>
> **Lo que NO entra.** El alta, la consulta, la edición y el borrado de pedidos: **QC-34**. Su
> pantalla: **QC-35**. Qué transiciones entre estados son válidas: **QC-34**. El cliente o
> destinatario del pedido: **no entra y no genera ficha**, por decisión explícita del humano
> (ver decisión 8). Facturación e impuestos: no existen en este ERP (ver decisión 23).
>
> Sembrado por `/afinar-feature` el 2026-09-03. El bloque de Alcance y la tabla de
> «Decisiones cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los
> reabre y no los reescribe: su trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

_Pendiente: los escribe spec_author (F1.2)._

## Preguntas abiertas

No se rellenan con supuestos (regla 6 de `CLAUDE.md`).

1. **¿El sistema exporta alguna vez a un contable externo?** La decisión 23 cerró que el ERP no
   factura ni liquida impuestos y que los totales se calculan internamente sin guardarse, pero
   no se evaluó si algún día hay que entregar esos datos a una contabilidad de fuera. No afecta
   al esquema de esta ficha: se anota porque es el fleco que queda de la pregunta abierta n.º 4
   del dominio.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
| --- | --- | --- |
| 2026-09-02 | ¿Un pedido es una línea o una cabecera con ítems? | **Una sola línea**: receta, cantidad, precio y unidad. No hay tabla de líneas ni cabecera |
| 2026-09-02 | ¿La receta gana columna de precio? | **No.** El precio de venta se escribe a mano en el pedido, así que **QC-24 no se toca** por esto |
| 2026-09-03 | ¿Pedidos es un módulo propio? | **Módulo propio `pedidos`**, hexagonal como `identity`, `inventario`, `recetas` y `unidades` (**QC-15**). Conoce la receta por `@/lib/modules/recetas` y la unidad por `@/lib/modules/unidades`, **nunca** por sus tablas, sus modelos de Prisma ni sus repositorios |
| 2026-09-03 | Forma técnica de los dos conjuntos cerrados (prioridad y estado) | **Enum de Prisma**: `OrderStatus` (PENDIENTE, EN_CURSO, ENTREGADO) y `OrderPriority` (BAJA, MEDIA, ALTA, CRITICA). **Se aparta a propósito de `DocumentType` (QC-4)**, que resolvió el mismo problema con tabla porque el conjunto debía crecer sin migrar. Aquí el humano asume a conciencia que **añadir un valor será una migración del tipo en Postgres**. El orden de la prioridad es el de declaración del enum |
| 2026-09-03 | ¿El precio es unitario o total? | **Unitario**: lo que cuesta **una** unidad. El total del pedido se obtiene multiplicando por la cantidad y **no se guarda**, para que no pueda contradecir a sus factores |
| 2026-09-03 | Tipo y precisión del precio | **`decimal(14,4)`, obligatorio y nunca negativo**, garantizado por `CHECK` en la base. Nunca `float` (`docs/architecture.md > Dominio` n.º 4). Heredado de **QC-14**, que lo fijó igual para el costo del producto |
| 2026-09-03 | Tipo y precisión de la cantidad | **`decimal(14,4)`, obligatoria y siempre `> 0`** (ni negativa ni cero), garantizado por `CHECK`. Heredado de **QC-24** |
| 2026-09-03 | ¿El pedido registra a quién se le vende? | **No, y es deliberado.** No hay cliente ni destinatario. No existe catálogo de clientes ni ficha que lo cree, y **no se crea ninguna**. Coste asumido y anotado: añadirlo después obliga a decidir qué cliente llevaban los pedidos ya cargados |
| 2026-09-03 | ¿El pedido lleva un número visible? | **Sí: correlativo automático que asigna el sistema**, único y creciente. **Se reinicia cada año** (`2026-0001`, `2027-0001`), así que el año forma parte de su identidad. Dentro de un mismo año **no se reutiliza** aunque el pedido se borre — el borrado es lógico y la fila sigue existiendo |
| 2026-09-03 | ¿Hay columna de fecha de solicitud? | **No se crea.** La pone el sistema y no se edita, o sea que es exactamente `created_at`. Una segunda columna con el mismo dato solo puede divergir. **Cambia lo que decía la ficha del board**, corregido antes de sembrar |
| 2026-09-03 | ¿La unidad del pedido es obligatoria? | **Sí.** FK al catálogo de **QC-32** con `ON DELETE RESTRICT`. Sin unidad, una cantidad y un precio unitario no se pueden interpretar ni sumar. Se aparta de **QC-14** (unidad opcional en el producto) y sigue a **QC-24** (obligatoria en la línea de receta) |
| 2026-09-03 | Estado inicial del pedido | **`PENDIENTE` por defecto.** El estado es obligatorio |
| 2026-09-03 | Prioridad por defecto | **`BAJA`.** La prioridad es opcional: no indicarla significa baja |
| 2026-09-03 | ¿Se puede borrar un pedido entregado? | **No.** Se garantiza con **`CHECK` en la base** —`deleted_at IS NULL OR status <> 'ENTREGADO'`— y no solo con una validación de aplicación en QC-34. Misma filosofía que **QC-20 D16**: sin garantía en la base no es una garantía real |
| 2026-09-03 | ¿Qué transiciones de estado son válidas? | **No entran aquí.** Van a **QC-34**, junto con el resto de reglas de aplicación |
| 2026-09-03 | ¿Qué pasa si se da de baja la receta de un pedido? | **El pedido conserva su referencia** y sigue apuntando a la misma receta. El borrado de receta es lógico (**QC-24**), así que la fila sigue existiendo. Mismo criterio que **QC-20 D5** para el producto |
| 2026-09-03 | Auditoría: quién creó y quién modificó | **`created_by` y `updated_by`, FK real a `users` pero declaradas como escalares SIN `@relation` de Prisma**, con la FK escrita a mano en el `migration.sql`. Heredado de **QC-24**, que a su vez lo hereda de **QC-20 D8**: es lo que impide que el ORM atraviese de `pedidos` a `users` con un `include`, y la guardia de módulos no lo detectaría porque no es un import |
| 2026-09-03 | ¿Puede existir un pedido sin autor? | **Sí: `created_by` y `updated_by` son anulables.** Algo que no es una persona —una importación masiva, un seed— tiene que poder crear pedidos. Un autor vacío significa «no lo creó una persona», no «se perdió el dato». Heredado de **QC-24** |
| 2026-09-03 | Borrado y marcas de tiempo | **Borrado lógico**, con `created_at` / `updated_at` / `deleted_at`. Heredado de **QC-4** y reforzado por `docs/architecture.md > Dominio` n.º 3 |
| 2026-09-03 | Idioma de los identificadores de la DB | **Inglés** (tablas, columnas, índices, restricciones). Heredado de **QC-4** |
| 2026-09-03 | RLS | **Activada y forzada** (`FORCE ROW LEVEL SECURITY`). Heredado de **QC-4 R19**. No sustituye a la autorización en el service (`docs/architecture.md > Acceso a datos y autorizacion`) |
| 2026-09-03 | Migración | `migration.sql` (UP) más `down.sql` (DOWN) obligatorio, y revertirla deja el esquema exactamente como estaba. Heredado de **QC-4 R20** |
| 2026-09-03 | Facturación e impuestos (pregunta abierta n.º 4 del dominio) | **El ERP no factura ni liquida impuestos.** El dinero **sí** entra al modelo, con `decimal(14,4)` y nunca `float`, y los cálculos —el total del pedido— son **internos y derivados**, no columnas. **Cierra la pregunta abierta n.º 4**, que llevaba abierta desde el inicio del proyecto; queda el fleco de si algún día se exporta a un contable externo (pregunta abierta 1) |
| 2026-09-03 | Permisos | **Aquí no se deciden**: no hay service en esta ficha. Los fija **QC-34**, con su test (`CHECKPOINTS.md > Permisos`) |
| 2026-09-03 | E2E | **Diferido con motivo**: no hay pantalla ni flujo navegable, es esquema y migración. Lo decide **QC-35**. Mismo criterio que QC-14, QC-24 y QC-32 |
| 2026-09-03 | Librería nueva | **Ninguna.** Es esquema Prisma, migración y el armazón del módulo. Regla 7 de `CLAUDE.md` sin propuesta que abrir |
