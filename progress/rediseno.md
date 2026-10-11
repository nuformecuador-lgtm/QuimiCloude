# Rediseño de la interfaz (pasada `/design`, 2026-10-10)

Fuente del diseño:
- Canvas de Claude Design (privado del humano; pedir acceso para verlo):
  https://claude.ai/artifact/Voiri77bod5p5EuzCUkPaq — 8 páginas por módulo, 87 tableros, cada
  pantalla en escritorio (1440), tablet (820) y teléfono (390) más un tablero de modales por módulo.
- Copia versionada de la fuente de diseño en `docs/diseno/` (qué hay y flujo `/design`:
  `docs/diseno/README.md`):
  - `docs/diseno/canvas/`: el código fuente de todos los tableros del canvas.
  - `docs/diseno/sistema.css` (idéntico a `docs/diseno/canvas/qc.css`) es el sistema visual
    completo del canvas (tokens de `app/globals.css` + piezas). Es la referencia para portar a
    componentes; no se copia tal cual a la app.
  - `docs/diseno/guia-de-marca.html`: la guía de marca.
  - `<Pantalla>.dc.html` = pantalla; `<Pantalla>Movil.dc.html` lleva su ficha
    (Reutiliza / Librerías / Escritorio / Tablet / Teléfono / Animación / Por confirmar).
  - `Modales<Modulo>.dc.html` = todos los modales del módulo abiertos.
- Brief (sin versionar): `_trabajo/rediseno/brief/inventario.md` (textos literales de la app),
  `convenciones.md` (reglas), `correcciones.md` (revisión).

## Decisiones del humano (2026-10-10)

| # | Decisión |
|---|---|
| D1 | Prioridad con **PriorityMark** (barras neutras; solo «Crítica» en color e icono), no con Badge de color. |
| D2 | Acciones de fila **siempre en el menú ⋯**; única excepción «Entrar» del operario en Asignación. En teléfono la tabla pasa a tarjetas y «Acciones» abre el menú **centrado en la pantalla visible**. «Ver recorrido», «Ver ficha», «Volver…» nunca son enlaces de texto: van al menú ⋯ o son botones (`b-back` con flecha). |
| D3 | Tonos por significado: neutral (Pendiente, Sin apartar), progress con punto que late (En curso, En empaque, En acondicionamiento, Subiendo), waiting/ámbar (Por empacar, Por acondicionar, Sin cobertura completa, Cambiado, Por revisar, Duplicado), success (Terminado, Entregado, Apartado, Activo, Listo, Añadido, Nuevo), danger (Bloqueado, Error, Quitado, Incompleta), info (Procesando, En revisión), muted (Cancelado, Inactivo, Dado de baja). Un único StatusBadge y un único mapa de etiquetas por dominio. |
| D4 | Asignación: la segunda pestaña «Terminados» pasa a **«Acondicionados»**; **contador** en cada pestaña. |
| D5 | Empaque y Acondicionamiento usan el **mismo diseño del operario** que Ejecución (sin barra lateral, cabecera y pie fijos, objetivos ≥44 px). |
| D6 | Importar inventario con **barra de pasos** (Elegir archivo · Vista previa · Importación terminada). |
| D7 | Tallas de botón: sm 32 · default 36 · touch 44 · xl 52 (operario). Hoy son 28/32. |
| D8 | **Construir «Recuperar contraseña»** (`/recuperar-contrasena` hoy no existe y el login la enlaza). |
| D9 | Corregir textos sin tildes y el voseo («Elegi un motivo.» → «Elige un motivo.»). |
| D10 | Agregar los toasts que faltan (p. ej. «Receta actualizada.», «Proveedor creado.», «Usuario actualizado.»). |
| D11 | Raíz `/`: de momento una **pantalla de aviso** (la landing está en conversación). `lang="es"`. El Sheet móvil del menú en español. **Reconsiderar cada icono del menú** (hoy se repiten Asignación=Pedidos y Unidades=Fórmulas) **y el del control que lo abre/pliega** (el humano prefiere una flecha). |
| D12 | Fusionar `credential-field` en un único **PasswordField** con ojo (mostrar/ocultar), usado en todo lugar donde se pueda ver una contraseña o key (login incluido). |
| D13 | La tarjeta de conexión de WhatsApp del canvas (Integraciones) es solo referencia para QC-237 (de Christian); no se convierte en ficha propia. |
| D14 | Lo demás del canvas queda aprobado («me gusta lo que veo»). Cada pantalla se adapta a escritorio, tablet y teléfono (PWA). |

## Orden de trabajo
1. QC-251 Catálogo de componentes (regla reutilizar → extender → componer → crear; guardia).
2. Piezas compartidas del rediseño (D1, D2, D3, D7, D12 + DataTable en tarjetas, Notice, PageShell/PageHeader, UrlTabs, PasswordField).
3. Shell (D11): cabecera, menú e iconos; raíz y textos generales (D9, D10).
4. Pantallas por módulo, cada una en su ficha, bloqueadas por 2 y 3. QC-252 antes de Operario.
5. Recuperar contraseña (D8), en paralelo cuando haya cupo.
