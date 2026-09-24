# QC-164 — unidad-del-pedido · requirements.md

> **Zona** fullstack · **Complejidad** — · **depends_on** — · **Rama** feature/QC-164-unidad-del-pedido
>
> **Alcance.** El pedido vuelve a tener **unidad** junto a la cantidad («100 L de X receta»), elegida
> del catálogo de unidades. El consumo de cada insumo pasa a ser cantidad × % **convertida** a la unidad
> del insumo. Lo usan el costo del pedido, la tabla de ingredientes, la ejecución y la reserva de
> material.
>
> **Lo que NO entra.** La densidad por producto (descartada por ahora, sin ficha). El contenido de la
> presentación (ya lo trae **QC-150**, R6–R8).
>
> Sembrado por `/afinar-feature` el 2026-09-24. El bloque de Alcance y la tabla de «Decisiones cerradas»
> los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los reescribe: su
> trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

_Pendiente: los escribe spec_author (F1.2)._

## Preguntas abiertas

1. **¿Cómo se muestra un consumo aproximado?** Cuando el insumo es de otra familia (pedido en L,
   soda en kg), el número sale de la aproximación 1 L ≈ 1 kg. No está decidido si la pantalla lo
   marca (por ejemplo «≈ 2 kg») o lo muestra igual que uno exacto.
2. **Redondeo de conversiones no exactas.** oz ↔ ml no es exacto con el factor de 4 decimales de
   QC-76; no está decidido a cuántos decimales se redondea el consumo ni en qué paso.
3. **Orden frente a QC-141** (`in_progress`), que reserva material con la fórmula de consumo actual.
   Si esta ficha entra primero, QC-141 debe adaptarse. Lo mira el leader en F1.0.
4. **Orden frente a QC-150** (`spec_ready`), que calcula los envases enteros como ⌊cantidad del pedido
   / contenido de la presentación⌋ con el pedido sin unidad. Con unidad, ese cálculo debe convertir
   la cantidad a la unidad de la presentación (100 ml en «Botella 1 L» → 0 envases). Falta decidir
   cuál entra primero y cuál adapta a cuál.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-09-24 | ¿El pedido tiene unidad? | **Sí.** **Reabre a sabiendas QC-147**, que dejó el pedido sin unidad (migración `orders_drop_unit_and_unit_price`). |
| 2026-09-24 | ¿Qué unidades se ofrecen? | **Todo el catálogo** de unidades de la empresa (de sistema y propias, ámbito de **QC-76**). Si falta una (oz), se da de alta en `/configuracion/unidades` con su factor: no entra aquí. |
| 2026-09-24 | ¿Cómo se calcula el consumo? | Cantidad × % (**QC-147**). **Misma familia** que el insumo: se **convierte exacto** con la función de **QC-76** (pedido de 500 ml, 10 % de hipoclorito en L → 0,05 L). **Otra familia**: se mantiene la **aproximación sin densidad** que QC-147 aceptó: la cantidad en la base de su familia se toma igual en la base de la otra (1 L ≈ 1 kg). |
| 2026-09-24 | ¿Densidad por producto? | **No**, descartada por ahora. |
| 2026-09-24 | ¿Pedidos existentes? | **Quedan sin unidad**: se ven con guion y se calculan como hoy. La unidad es **obligatoria al crear y al editar** (patrón de **QC-146**). |
| 2026-09-24 | ¿Quién usa el cálculo nuevo? | El **costo del pedido** (**QC-151**), la **tabla de ingredientes** de Pedidos, la **ejecución** (**QC-63/QC-147**), la **reserva de material** (**QC-141**) y los **envases enteros** del producto terminado (**QC-150**). |
| 2026-09-24 | ¿Permisos? | **Sin cambios**: escribir pedidos exige `pedidos.modificar`, validado en el service (**QC-86**). |
| 2026-09-24 | ¿E2E? | **Sí**, toca importes (`CHECKPOINTS.md`): pedido en ml sobre una receta en L, y comprobar consumo y costo. Ampliando el recorrido de pedidos (**QC-35/QC-146**). |
| 2026-09-24 | Identificadores y borrado | **Heredado**: identificadores en inglés (**QC-4**) y el borrado lógico que ya tiene el pedido. |
| 2026-09-24 | ¿Dependencia o tabla nueva? | **Ninguna.** Una columna por migración, con su `down.sql`. |
