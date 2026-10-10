# QC-227 — índice de pares de capturas antes/después

Las imágenes no se versionan: viven en `_trabajo/marca/` del checkout principal. Índice del «antes» abajo, tras el del «después».


- Base: worktree `feature/QC-227-componentes-con-la-nueva-marca` en **0a9ea0d0**, `next dev -p 3102`. Las 40 capturas son de este HEAD; la tanda previa, de 6c0f0594, quedó sobrescrita.
- Datos: base aislada `quimicloude_capturas` (quimicloude-pg17:5433), `migrate deploy` + `db:seed` + `db:seed:demo` desde el worktree. Al terminar se borró con `DROP ... WITH (FORCE)` y se verificó que no queda. El servidor se detuvo.
- Mismo script y emulación que el «antes»: `shots-qc227.mjs 3102 .../capturas-componentes-despues`.
- Resultado: **40 capturas, 0 fallos** (`shots-despues2.log`). Mismas dimensiones que el «antes» en los 40 pares.
- Diferencia de píxeles por par (umbral 24/255): `diff227.mjs`, salida en `diff2.txt`. Las horas y las duraciones siempre difieren por la hora del seed; eso no cuenta como cambio.

Rutas: A = `R:\job\singularis\projects\QuimiCloude\_trabajo\marca\capturas-componentes-antes\`, D = `R:\job\singularis\projects\QuimiCloude\_trabajo\marca\capturas-componentes-despues\`. Cada fila es `A\<archivo>` frente a `D\<archivo>`.

## Pantallas

| Archivo | Δ px | Qué cambió a la vista |
| --- | --- | --- |
| pedidos-tabla-claro.png | 1.87% | Cabecera de tabla con banda de fondo y rótulos atenuados. Insignias de estado y prioridad en tono suave; antes «En curso», «En empaque» y «Alta» eran rellenos oscuros. Ítems inactivos del sidebar atenuados. Icono nuevo en la pastilla. |
| pedidos-tabla-oscuro.png | 5.53% | Lo mismo que en claro. Banda de cabecera gris oscura, insignias suaves y botón «Nuevo pedido» turquesa. |
| pedidos-tabla-movil.png | 2.30% | Banda de cabecera e insignias suaves. |
| usuarios-tabla-claro.png | 1.24% | «Activo» pasa de relleno verde oscuro a verde suave. Banda de cabecera. |
| usuarios-tabla-oscuro.png | 4.90% | Lo mismo, con banda de cabecera. |
| usuarios-tabla-movil.png | 0.20% | Banda de cabecera. |
| inventario-lotes-claro.png | 1.24% | Cifras del lote (cantidad, fecha, apartado, disponible) en monoespaciada tabular. |
| inventario-lotes-oscuro.png | 1.56% | Lo mismo. |
| inventario-lotes-movil.png | 0.50% | Lo mismo. |
| dashboard-inicio-claro.png | 1.95% | Fechas «Primera/Última anotación» en monoespaciada. Banda de cabecera. Sidebar con ítems inactivos atenuados. |
| dashboard-inicio-oscuro.png | 5.70% | Lo mismo. |
| dashboard-inicio-movil.png | 0.18% | Cambio mínimo (cabecera). |
| clientes-tabla-claro.png | 1.40% | Banda de cabecera. Cambian las fechas de alta y modificación. |
| clientes-tabla-oscuro.png | 5.04% | Lo mismo. |
| clientes-tabla-movil.png | 0.24% | Cambio mínimo. |
| asignacion-inicio-claro.png | 0.87% | Banda de cabecera. |
| asignacion-inicio-oscuro.png | 4.51% | Banda de cabecera gris con rótulos atenuados. |
| asignacion-inicio-movil.png | 0.17% | Cambio mínimo. |
| formulario-campo-enfocado-claro.png | 1.40% | Casi igual; el anillo de foco del campo cambia apenas. El resto viene del fondo desenfocado. |
| formulario-campo-enfocado-oscuro.png | 1.99% | Casi igual (anillo de foco y fondo). |
| formulario-campo-enfocado-movil.png | 0.73% | Anillo de foco. |
| dialogo-borrar-claro.png | 1.46% | El diálogo no cambia de forma notable; la diferencia viene del fondo desenfocado. |
| dialogo-borrar-oscuro.png | 2.29% | Igual que antes, salvo el fondo. |
| dialogo-borrar-movil.png | 3.65% | «Eliminar» pasa de rosa suave con texto rojo a **relleno rojo sólido con texto blanco**, como en escritorio. |

## Barra lateral

| Archivo | Δ px | Qué cambió a la vista |
| --- | --- | --- |
| sidebar-expandido-claro.png | 1.66% | Todos los ítems inactivos salen atenuados, **también «Producción» e «Integraciones»**, con la misma altura (44 px) que los demás. El activo no cambia. Icono nuevo en la pastilla. |
| sidebar-expandido-oscuro.png | 5.35% | Lo mismo. |
| sidebar-colapsado-claro.png | 1.19% | **Iconos centrados en el eje del carril**; antes iban corridos a la izquierda. Esto incluye «Producción» e «Integraciones». El indicador del activo sale centrado y más ancho. **El isotipo sale más grande y centrado.** |
| sidebar-colapsado-oscuro.png | 5.45% | Lo mismo. |
| sidebar-colapsado-hover-claro.png | 1.16% | El fondo de hover sobre «Pedidos» sale centrado en el carril; es sutil, pero se ve. |
| sidebar-colapsado-hover-oscuro.png | 5.46% | Lo mismo. |
| sidebar-abierto-movil.png | 2.14% | Ítems inactivos atenuados, también los plegables. El ritmo vertical es uniforme: antes los plegables medían 76 px de alto en DPR 2 y ahora miden 88 px, como el resto. |

## Control de colapso

| Archivo | Δ px | Qué cambió a la vista |
| --- | --- | --- |
| pastilla-expandido-reposo-claro.png | 1.77% | La pastilla pasa de clara con icono oscuro a **oscura (verde de la marca) con icono claro** `PanelLeftClose` (flecha «<»). |
| pastilla-expandido-reposo-oscuro.png | 1.58% | Icono claro `PanelLeftClose` sobre fondo oscuro; buen contraste. |
| pastilla-expandido-hover-claro.png | 2.04% | El hover muestra un aro azul claro alrededor. |
| pastilla-expandido-hover-oscuro.png | 2.04% | Lo mismo. |
| pastilla-colapsado-reposo-claro.png | 1.45% | Icono `PanelLeftOpen` (flecha «>»), con el isotipo grande y centrado al lado. |
| pastilla-colapsado-reposo-oscuro.png | 1.46% | Lo mismo. |
| pastilla-colapsado-hover-claro.png | 1.96% | Aro azul de hover. |
| pastilla-colapsado-hover-oscuro.png | 1.95% | Lo mismo. |
| control-encabezado-cerrado-movil.png | 0.18% | Cambio mínimo (icono del encabezado). |

## Observaciones (rotas o dudosas)

Nada roto. La inconsistencia de los plegables («Producción» e «Integraciones» en blanco pleno y con otra altura) que tenía 6c0f0594 **quedó resuelta en 0a9ea0d0**. Queda por revisar:

1. **Monoespaciada a medias.** En el dashboard, las fechas salen en monoespaciada y «Duración» sigue en sans. En asignación, «Cantidad» también sigue en sans.
2. **Rótulos de cabecera en oscuro.** Atenuados sobre la banda gris, se leen poco; conviene medir su contraste.
3. **Insignias suaves.** Se pierde algo de jerarquía respecto a los rellenos de antes.
4. **Ya estaba antes; no es regresión:**
   - Los botones flotantes de scroll horizontal tapan texto de la fila 2.
   - En el Sheet, «Cancelar» lleva borde discontinuo.

---

## QC-227 — capturas «antes» (T0)

- Base: `dev` en 8e5cb527 (incluye QC-228), checkout raíz, `next dev -p 3101`.
- Datos: base aislada `quimicloude_capturas` (quimicloude-pg17:5433) con `migrate deploy`, seed base y seed demo. Borrada al terminar.
- Usuario: admin del seed. Emulación: `reducedMotion: 'reduce'`, `es-CO`, `America/Bogota`.
- Variantes: claro y oscuro a 1440×900 (DPR 1), móvil a 390×844 (DPR 2, touch).
- Las capturas de la pastilla son un recorte de 240×140 px CSS alrededor del control, a DPR 3.
- Carpeta: `R:\job\singularis\projects\QuimiCloude\_trabajo\marca\capturas-componentes-antes\`
- Script: `shots-qc227.mjs <puerto> <carpetaSalida> [filtro]` (en este scratchpad). Para el después: `node shots-qc227.mjs <puerto> R:/job/singularis/projects/QuimiCloude/_trabajo/marca/capturas-componentes-despues`, con el `.env` raíz cargado.

Total: 40 capturas, 0 fallos.

## Pantallas de design.md > 9

| Pantalla | Estado | Claro | Oscuro | Móvil |
| --- | --- | --- | --- | --- |
| `/pedidos` | tabla | pedidos-tabla-claro.png | pedidos-tabla-oscuro.png | pedidos-tabla-movil.png |
| `/configuracion/usuarios` | tabla | usuarios-tabla-claro.png | usuarios-tabla-oscuro.png | usuarios-tabla-movil.png |
| `/inventario` | panel de lotes abierto (primera fila, DEMO Acido citrico) | inventario-lotes-claro.png | inventario-lotes-oscuro.png | inventario-lotes-movil.png |
| `/dashboard` | inicio | dashboard-inicio-claro.png | dashboard-inicio-oscuro.png | dashboard-inicio-movil.png |
| `/clientes` | tabla | clientes-tabla-claro.png | clientes-tabla-oscuro.png | clientes-tabla-movil.png |
| `/asignacion` | inicio (vista admin) | asignacion-inicio-claro.png | asignacion-inicio-oscuro.png | asignacion-inicio-movil.png |
| Formulario en `Sheet` | «Nuevo cliente», campo enfocado con Tab | formulario-campo-enfocado-claro.png | formulario-campo-enfocado-oscuro.png | formulario-campo-enfocado-movil.png |
| Diálogo de borrado | borrar cliente (primera fila) | dialogo-borrar-claro.png | dialogo-borrar-oscuro.png | dialogo-borrar-movil.png |

## Barra lateral (design.md > 9 y R31–R37)

| Estado | Claro | Oscuro | Móvil |
| --- | --- | --- | --- |
| expandida (`/dashboard`) | sidebar-expandido-claro.png | sidebar-expandido-oscuro.png | — |
| modo icono (cookie `sidebar_state=false`) | sidebar-colapsado-claro.png | sidebar-colapsado-oscuro.png | — |
| modo icono, puntero sobre «Pedidos» (R34) | sidebar-colapsado-hover-claro.png | sidebar-colapsado-hover-oscuro.png | — |
| panel móvil abierto | — | — | sidebar-abierto-movil.png |

## Control de colapso (R38–R39)

| Estado | Claro | Oscuro | Móvil |
| --- | --- | --- | --- |
| pastilla, expandida, reposo | pastilla-expandido-reposo-claro.png | pastilla-expandido-reposo-oscuro.png | — |
| pastilla, expandida, hover | pastilla-expandido-hover-claro.png | pastilla-expandido-hover-oscuro.png | — |
| pastilla, colapsada, reposo | pastilla-colapsado-reposo-claro.png | pastilla-colapsado-reposo-oscuro.png | — |
| pastilla, colapsada, hover | pastilla-colapsado-hover-claro.png | pastilla-colapsado-hover-oscuro.png | — |
| control del encabezado, panel cerrado | — | — | control-encabezado-cerrado-movil.png |

## Lo que no se sacó y por qué

- **Pastilla en móvil:** no existe en viewport angosto (`hidden md:inline-flex`; P14). En su lugar va `control-encabezado-cerrado-movil.png`.
- **Hover en móvil:** con pantalla táctil no hay estado de hover.
- **Modo icono en móvil:** en viewport angosto el panel es un `Sheet` que se abre o se cierra; no tiene carril.
- **Control del encabezado en escritorio:** va `md:hidden` (decisión del 2026-09-02, P14).

## Lo que se ve en el «antes» (sin medir)

- Modo icono: los botones miden 32 px de ancho y quedan desplazados a la izquierda del eje del carril. El indicador del activo y el fondo de hover salen igual de desplazados. El isotipo sale pequeño (§16.1).
- Pastilla: en claro, el icono `PanelLeftIcon` casi no se distingue del fondo, en reposo y con el puntero encima. Es el defecto de R38.
