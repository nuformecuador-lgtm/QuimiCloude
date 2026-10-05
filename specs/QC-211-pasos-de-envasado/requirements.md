# QC-211 — pasos-de-envasado · requirements.md

> Zona: fullstack · Complejidad: high · depends_on: — · Rama: feature/QC-211-pasos-de-envasado
>
> **Alcance.** La fórmula guarda una segunda lista de pasos, los de envasado: es opcional,
> va separada de los pasos del operador y la ve solo el empacador. El Administrador la edita en
> alta, edición e importación desde PDF. El empacador la recorre con el mismo paso a paso
> del operador después de pulsar Comenzar empaque, y Terminar empaque es el botón del último paso.
>
> **Lo que NO entra.** Fases en los pasos (QC-173). El estado al que pasa el pedido al terminar el
> empaque (QC-202). Guardar el avance o registrar la ejecución (QC-82). Validar en servidor
> los checks o la espera. Duración de espera configurable.
>
> Sembrado por `/afinar-feature` el 2026-10-05. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`.

## Decisiones cerradas

| # | Decisión | Fuente |
|---|---|---|
| D1 | Los pasos de envasado son opcionales: una fórmula sin ellos es válida. | Humano, 2026-10-05 |
| D2 | Cada paso de envasado tiene el mismo formato y los mismos topes que un paso del operador: documento QC-62, máximo 50 pasos y 30 elementos por paso, sin pasos vacíos. Se guardan aparte de `steps`. | Heredado QC-62 |
| D3 | Se editan en el formulario de alta y edición, en una sección propia separada de los pasos del operador, con el mismo editor. Solo los edita el Administrador. | Humano 2026-10-05; heredado QC-64 |
| D4 | Una versión no tiene pasos de envasado propios: hereda los de su original, los muestra solo para leer, y editar la original afecta a todas sus versiones. | Humano 2026-10-05; patrón de versiones actual |
| D5 | La importación desde PDF separa los pasos de envasado de los del operador. El Administrador los revisa antes de guardar. | Humano, 2026-10-05 |
| D6 | El empacador ve los pasos de envasado solo después de pulsar Comenzar empaque. El último paso termina con Terminar empaque. Antes de Comenzar no se muestran. | Humano, 2026-10-05 |
| D7 | La regla de avance es la del operador: no se avanza con checks sin marcar, y hay espera de 5 s por paso, también para Terminar. Se controla solo en el cliente, como hoy. | Humano 2026-10-05; heredado QC-64, QC-125 |
| D8 | Sin pasos de envasado, la pantalla de empaque se ve como hoy. | Humano, 2026-10-05 |
| D9 | El operador no ve los pasos de envasado en su ejecución. El empacador no ve los pasos del operador. | Humano, 2026-10-05 |
| D10 | El empacador lee los pasos con `empaque.modificar`, sin recibir `recetas.consultar` ni `asignaciones.ejecutar`. La autorización va en el caso de uso de empaque. | Heredado QC-168, QC-201 |
| D11 | Lectura en vivo, sin copia en el pedido: editar los pasos de envasado afecta a los pedidos que ya están en empaque. El avance no se guarda. | Heredado QC-64; ejecución actual |
| D12 | Una prueba E2E: el Administrador crea la fórmula con pasos de envasado; el empacador comienza, recorre y termina; el operador no los ve. | Humano, 2026-10-05 |
| D13 | Las fórmulas existentes no se migran: quedan sin pasos de envasado. | Heredado, patrón QC-173 y D1 |

## Preguntas abiertas

- Cómo separa la IA los pasos de envasado en la importación cuando el PDF no los distingue
  (heurística o prompt). Esto es diseño, lo resuelve `spec_author` en design.md.

## Requisitos (EARS)

_Pendiente: lo escribe `spec_author` en F1.2._
