# QC-168 — estado-por-empacar · requirements.md

> **Zona:** `fullstack` · **Complejidad:** `high` · **depends_on:** QC-150 ·
> **Rama:** `feature/QC-168-estado-por-empacar`
>
> **Alcance.** El pedido gana dos estados entre EN_CURSO y ENTREGADO: **POR_EMPACAR** y
> **EN_EMPAQUE**. El Finalizar del Operario deja el pedido Por empacar; el Empacador lo **comienza**
> (En empaque, a su nombre) y lo **termina** (Entregado), desde una pestaña **«Por empacar»** de
> `/asignacion`.
>
> **Lo que NO entra.** Registrar el empaque en el log de ejecución → **QC-82**, que va después de
> esta ficha y la tiene como bloqueante. Que el Administrador empaque. Asignar empacadores.
>
> Sembrado por `/afinar-feature` el 2026-09-24. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

_Pendiente: los escribe spec_author (F1.2)._

## Preguntas abiertas

Ninguna.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-09-24 | ¿Cuál es el flujo? | PENDIENTE → EN_CURSO → **POR_EMPACAR** (el Operario finaliza la producción) → **EN_EMPAQUE** (el Empacador comienza) → ENTREGADO (el Empacador termina). Hoy el Finalizar deja ENTREGADO (QC-63): eso cambia |
| 2026-09-24 | ¿Qué pedidos toma el Empacador? | **Cualquier pedido Por empacar de su empresa, sin asignación.** El primero que lo comienza se lo queda y **solo él** puede terminarlo |
| 2026-09-24 | ¿Cuándo se mueve el inventario? | **Al terminar la producción** (paso a Por empacar): en esa misma operación se consume el material (QC-141) y entra el lote de producto terminado (QC-150) |
| 2026-09-24 | ¿Cuándo se escribe `finished_at`? | **Al entregar** (fin del empaque). «Terminados» de QC-145 sigue siendo la lista de entregados |
| 2026-09-24 | ¿Se puede cancelar? | **No**, ni Por empacar ni En empaque: el material ya se consumió. Un problema se corrige con un ajuste de inventario (QC-92). Hasta EN_CURSO se sigue cancelando por el camino único (QC-34/QC-141) |
| 2026-09-24 | ¿Qué permiso lo habilita? | **Un permiso nuevo de empaque, solo para el Empacador.** Se autoriza por permiso, nunca por nombre de rol (QC-86/87). El catálogo pasa de **16 a 17**, por migración y seed (QC-74). El código lo fija `spec_author` con la forma `<modulo>.<accion>`. El Administrador **no** lo recibe: supervisa desde «Todos» (QC-145) |
| 2026-09-24 | ¿Dónde trabaja el Empacador? | Pestaña **«Por empacar»** en `/asignacion`: los pedidos Por empacar y En empaque de su empresa, con número, receta, presentación, envases, estado y quién empaca. Cada fila abre una pantalla sencilla con el pedido y los botones **Comenzar** y **Terminar** |
| 2026-09-24 | ¿Se registra el empaque? | **Sí, pero lo añade QC-82**, con las acciones «comenzar empaque» y «terminar empaque». Esta ficha no toca el registro |
| 2026-09-24 | ¿En qué orden van? | **QC-150 → QC-168 → QC-82.** Las tres tocan el Finalizar; QC-82 ajusta su spec a estos estados antes de implementar |
| 2026-09-24 | ¿Nombres y datos existentes? | Estados en castellano y mayúsculas, como los existentes (`POR_EMPACAR`, `EN_EMPAQUE`). **Sin migración de datos:** los EN_CURSO pasan a Por empacar al finalizarse; los ENTREGADO no cambian |
| 2026-09-24 | ¿Qué ve el Administrador? | «Todos» (QC-145) muestra los estados nuevos y los incluye en su filtro |
| 2026-09-24 | ¿E2E? | **Sí**: el Operario finaliza → Por empacar; el Empacador comienza y termina; el Operario no ve «Por empacar»; un pedido Por empacar no se puede cancelar |
| 2026-09-24 | ¿Dependencia o tabla nueva? | **Ninguna librería.** Cambian el enum de estados y el catálogo de permisos, por migración |
