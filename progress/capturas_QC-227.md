# QC-227 — índice de pares de capturas antes/después

Las imágenes no se versionan: viven en `_trabajo/marca/` del checkout principal. Índice del «antes» abajo, tras el del «después».


- Base: worktree `feature/QC-227-componentes-con-la-nueva-marca` en 6c0f0594, `next dev -p 3102`.
- Datos: base aislada `quimicloude_capturas` (quimicloude-pg17:5433), `migrate deploy` + `db:seed` + `db:seed:demo` desde el worktree. Borrada al terminar (`DROP ... WITH (FORCE)`, verificado 0 filas). Servidor detenido.
- Mismo script y emulación que el «antes»: `shots-qc227.mjs 3102 .../capturas-componentes-despues`.
- Resultado: **40 capturas, 0 fallos** (`shots-despues.log`). Mismas dimensiones que el «antes» en los 40 pares.
- Diferencia de píxeles por par (umbral 24/255): `diff227.mjs` en este scratchpad. Las horas y duraciones difieren siempre por la hora del seed; no es un cambio.

Rutas: A = `R:\job\singularis\projects\QuimiCloude\_trabajo\marca\capturas-componentes-antes\`, D = `R:\job\singularis\projects\QuimiCloude\_trabajo\marca\capturas-componentes-despues\`. Cada fila es `A\<archivo>` frente a `D\<archivo>`.

## Pantallas

| Archivo | Δ px | Qué cambió a la vista |
| --- | --- | --- |
| pedidos-tabla-claro.png | 1.35% | Cabecera de tabla con banda de fondo y rótulos atenuados; insignias de estado y prioridad pasan a tono suave (antes «En curso», «En empaque» y «Alta» eran rellenos oscuros); hojas inactivas del sidebar atenuadas; icono de la pastilla nuevo. |
| pedidos-tabla-oscuro.png | 5.14% | Igual que claro; banda de cabecera gris oscura; insignias suaves sobre fondo oscuro; botón «Nuevo pedido» turquesa. |
| pedidos-tabla-movil.png | 2.30% | Banda de cabecera e insignias suaves. |
| usuarios-tabla-claro.png | 0.84% | «Activo» pasa de relleno verde oscuro a verde suave; banda de cabecera. |
| usuarios-tabla-oscuro.png | 4.52% | Igual; banda de cabecera. |
| usuarios-tabla-movil.png | 0.20% | Banda de cabecera. |
| inventario-lotes-claro.png | 0.46% | Cifras del lote (cantidad, fecha, apartado, disponible) en monoespaciada tabular. |
| inventario-lotes-oscuro.png | 0.90% | Igual. |
| inventario-lotes-movil.png | 0.50% | Igual. |
| dashboard-inicio-claro.png | 1.54% | Fechas «Primera/Última anotación» en monoespaciada; banda de cabecera; sidebar con hojas atenuadas. |
| dashboard-inicio-oscuro.png | 5.30% | Igual. |
| dashboard-inicio-movil.png | 0.18% | Mínimo (cabecera). |
| clientes-tabla-claro.png | 0.63% | Banda de cabecera; fechas de alta/modificación. |
| clientes-tabla-oscuro.png | 4.26% | Igual. |
| clientes-tabla-movil.png | 0.24% | Mínimo. |
| asignacion-inicio-claro.png | 0.47% | Banda de cabecera. |
| asignacion-inicio-oscuro.png | 4.12% | Banda de cabecera gris; rótulos atenuados. |
| asignacion-inicio-movil.png | 0.17% | Mínimo. |
| formulario-campo-enfocado-claro.png | 0.39% | Prácticamente igual; anillo de foco del campo apenas distinto. |
| formulario-campo-enfocado-oscuro.png | 1.04% | Prácticamente igual (anillo de foco). |
| formulario-campo-enfocado-movil.png | 0.73% | Anillo de foco. |
| dialogo-borrar-claro.png | 0.45% | Sin cambio notable en el diálogo (fondo desenfocado cambia por la cabecera). |
| dialogo-borrar-oscuro.png | 1.35% | Igual que antes salvo fondo. |
| dialogo-borrar-movil.png | 3.65% | «Eliminar» pasa de rosa suave con texto rojo a **relleno rojo sólido con texto blanco** (mismo estilo que escritorio). |

## Barra lateral

| Archivo | Δ px | Qué cambió a la vista |
| --- | --- | --- |
| sidebar-expandido-claro.png | 1.25% | Hojas inactivas atenuadas; activo igual; icono de la pastilla nuevo. |
| sidebar-expandido-oscuro.png | 4.95% | Igual. |
| sidebar-colapsado-claro.png | 1.16% | **Iconos centrados en el eje del carril** (antes corridos a la izquierda); indicador del activo centrado y más ancho; **isotipo más grande y centrado**. |
| sidebar-colapsado-oscuro.png | 5.42% | Igual. |
| sidebar-colapsado-hover-claro.png | 1.17% | Fondo de hover sobre «Pedidos» centrado en el carril (sutil, pero visible). |
| sidebar-colapsado-hover-oscuro.png | 5.43% | Igual. |
| sidebar-abierto-movil.png | 0.92% | Hojas inactivas atenuadas; resto igual. |

## Control de colapso

| Archivo | Δ px | Qué cambió a la vista |
| --- | --- | --- |
| pastilla-expandido-reposo-claro.png | 1.77% | Pastilla pasa de clara con icono oscuro a **oscura (verde marca) con icono claro** `PanelLeftClose` (flecha «<»). |
| pastilla-expandido-reposo-oscuro.png | 1.58% | Icono `PanelLeftClose` claro sobre fondo oscuro; buen contraste. |
| pastilla-expandido-hover-claro.png | 2.04% | Hover con aro azul claro alrededor. |
| pastilla-expandido-hover-oscuro.png | 2.04% | Igual. |
| pastilla-colapsado-reposo-claro.png | 1.45% | Icono `PanelLeftOpen` («>»), isotipo grande y centrado al lado. |
| pastilla-colapsado-reposo-oscuro.png | 1.46% | Igual. |
| pastilla-colapsado-hover-claro.png | 1.96% | Aro azul de hover. |
| pastilla-colapsado-hover-oscuro.png | 1.95% | Igual. |
| control-encabezado-cerrado-movil.png | 0.18% | Mínimo (icono del encabezado). |

## Observaciones (rotas o dudosas)

Nada roto. Puntos a revisar:

1. **Sidebar: jerarquía inconsistente.** Las hojas inactivas (Asignación, Inventario, Proveedores…) ahora salen atenuadas, pero los padres plegables «Producción» e «Integraciones» siguen en blanco pleno. Se leen como si estuvieran activos o resaltados. Ocurre en escritorio y en móvil.
2. **Cifras monoespaciadas a medias.** En el dashboard, las fechas salen en monoespaciada, pero la columna «Duración» sigue en sans. En asignación, «Cantidad» también sigue en sans. Si R pide cifras tabulares en toda cifra, falta cubrir esas columnas.
3. **Rótulos de cabecera en oscuro.** Los rótulos atenuados sobre la banda gris tienen poco contraste («Receta», «Cliente», «Presentación»). Conviene medirlo.
4. **Insignias suaves.** Se pierde algo de jerarquía: antes «En curso» y «Alta» destacaban con relleno. Los pares Bloqueado/Cancelado, Por empacar/Por acondicionar y En curso/En empaque comparten color, igual que antes.
5. **Ya estaba antes, no es regresión:**
   - Los botones flotantes de scroll horizontal tapan texto de la fila 2: el número de pedido y el cliente en pedidos y asignación.
   - En el Sheet, «Cancelar» sale con borde discontinuo.

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
