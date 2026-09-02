# QC-29 — Insumo de diseño (no es el spec)

> Lo escribe el **leader** antes de F1.2. No es `requirements.md` ni `design.md`: es el
> material de entrada para que `spec_author` no tenga que inventar colores ni decisiones
> que el humano ya cerró. Si algo de aquí contradice `docs/`, manda `docs/`.
>
> Origen: canvas de diseño aprobado por el humano el 2026-09-02
> (https://claude.ai/code/artifact/f9ed755a-5330-4ee6-a9f1-e89968d51152), artboards
> «Sidebar · modo oscuro», «Sidebar · modo claro» y «Sistema de color y medidas».

## 1. Decisiones ya cerradas por el humano

No las re-abras; si el spec necesita cambiarlas, dilo explícitamente y para.

| Decisión | Valor | Quién y cuándo |
| --- | --- | --- |
| Alcance | Una sola feature: esquema de color **y** conmutador de modo | humano, 2026-09-02 |
| Mecanismo | **`next-themes`** (no implementación propia con cookie) | humano, 2026-09-02 |
| Opciones de modo | `light`, `dark`, `system` | humano, 2026-09-02 |
| Valor por defecto | `system` la primera vez | humano, 2026-09-02 |
| Ubicación del control | Encabezado de la zona privada, junto a `SidebarToggle` | humano, 2026-09-02 |
| Paleta base | Agua: `#ffffff · #cceae8 · #a8dcd9 · #68c3b7 · #539091` | humano, 2026-09-02 |
| Acento | Naranja, profundizado en modo claro | humano, 2026-09-02 |

## 2. La dependencia (regla 7 de CLAUDE.md)

`next-themes` es dependencia nueva. **No se instala hasta que el humano apruebe el spec**
(F1.4). Los cuatro checks de salud los corrió el leader el 2026-09-02, con red:

| Check | Resultado |
| --- | --- |
| `deprecated` | sin marca de deprecación |
| `time.modified` | **2025-03-11 (v0.4.6) — hace ~18 meses** |
| `license` | MIT |
| descargas semanales | 26 547 324 |

Tres de cuatro son limpios. **El de la fecha no**: 18 meses sin publicar. El `design.md`
tiene que decir si eso se acepta (fila `aprobada`) o se acepta con reserva (fila
`excepcion`, y entonces **con el porqué escrito**, que sin él la fila no vale). La fila en
`docs/dependencias.md` la añade el leader al aprobarse el spec, no el implementer.

## 3. Tokens — los dos modos

Valores en **oklch** (formato del archivo), con el hex del diseño como referencia. Los
convirtió el leader con la transformación estándar sRGB→OKLab, no son estimaciones.

### 3.1 Barra lateral — `:root` (claro) y `.dark` (oscuro)

| Token | Claro | Oscuro | Rol |
| --- | --- | --- | --- |
| `--sidebar` | `oklch(1 0 0)` · `#ffffff` | `oklch(0.241 0.025 204.3)` · `#102325` | fondo del panel |
| `--sidebar-foreground` | `oklch(0.482 0.044 197.9)` · `#3f6667` | `oklch(0.817 0.036 194.3)` · `#a9cbca` | etiqueta en reposo |
| `--sidebar-accent` | `oklch(0.757 0.089 184.4 / 16%)` | `oklch(0.757 0.089 184.4 / 9%)` | velo de hover |
| `--sidebar-accent-foreground` | `oklch(0.262 0.031 202.3)` · `#10292b` | `oklch(1 0 0)` · `#ffffff` | item activo / hover |
| `--sidebar-primary` | `oklch(0.623 0.137 50.5)` · `#c76b2f` | `oklch(0.750 0.167 50.5)` · `#ff8a3d` | barra activa, marca, contador |
| `--sidebar-primary-foreground` | `oklch(1 0 0)` | `oklch(0.222 0.022 205.9)` · `#0e1e20` | texto sobre el acento |
| `--sidebar-border` | `oklch(0.613 0.063 197 / 16%)` | `oklch(0.858 0.054 191.8 / 10%)` | 1px del panel flotante |
| `--sidebar-ring` | `oklch(0.613 0.063 197)` · `#539091` | `oklch(0.757 0.089 184.4)` · `#68c3b7` | foco de teclado |

**El acento no es el mismo hue distinto: es el mismo hue (50.5°) a distinta luminosidad.**
`#ff8a3d` = `oklch(0.750 0.167 50.5)` y `#c76b2f` = `oklch(0.623 0.137 50.5)`. En claro se
profundiza porque el naranja claro sobre blanco no alcanza contraste; en oscuro se usa tal
cual. Esa es la única diferencia entre los dos acentos.

### 3.2 Superficies generales

| Token | Claro | Oscuro |
| --- | --- | --- |
| `--background` | `oklch(0.967 0.009 188.1)` · `#eef6f5` | `oklch(0.194 0.018 209.1)` · `#0b1719` |
| `--foreground` | `oklch(0.262 0.031 202.3)` · `#10292b` | `oklch(0.963 0.018 188.4)` · `#e6f7f5` |
| `--card` / `--popover` | `oklch(1 0 0)` | `oklch(0.288 0.032 192.3)` · `#16302f` |
| `--card-foreground` / `--popover-foreground` | `oklch(0.262 0.031 202.3)` | `oklch(0.981 0.010 189.1)` · `#f2fbfa` |
| `--muted` | `oklch(0.940 0.017 187.9)` · `#dfefed` | `oklch(0.244 0.027 203.6)` · `#0f2426` |
| `--muted-foreground` | `oklch(0.679 0.041 198.3)` · `#7ba0a1` | `oklch(0.644 0.045 199.9)` · `#6d9698` |
| `--accent` | `oklch(0.757 0.089 184.4 / 16%)` | `oklch(0.757 0.089 184.4 / 12%)` |
| `--accent-foreground` | `oklch(0.262 0.031 202.3)` | `oklch(0.981 0.010 189.1)` |
| `--primary` | `oklch(0.623 0.137 50.5)` · `#c76b2f` | `oklch(0.750 0.167 50.5)` · `#ff8a3d` |
| `--primary-foreground` | `oklch(1 0 0)` | `oklch(0.222 0.022 205.9)` |
| `--secondary` | `oklch(0.967 0.012 184.1)` · `#ecf7f5` | `oklch(0.288 0.035 201.4)` · `#133032` |
| `--secondary-foreground` | `oklch(0.286 0.036 192.4)` | `oklch(0.963 0.018 188.4)` |
| `--border` / `--input` | `oklch(0.613 0.063 197 / 16%)` | `oklch(0.858 0.054 191.8 / 10%)` |
| `--ring` | `oklch(0.613 0.063 197)` | `oklch(0.757 0.089 184.4)` |
| `--destructive` | `oklch(0.560 0.165 33.8)` · `#c2452a` | `oklch(0.831 0.095 32.0)` · `#ffb1a1` |

`--radius` no cambia: sigue en `0.625rem`.

**Los `--chart-*` quedan fuera del alcance de esta ficha.** Hoy son cinco grises y no hay
ninguna gráfica en el repo; re-colorearlos sin un consumidor es inventar. Anótalo como
pregunta abierta, no lo resuelvas.

## 4. Barra lateral flotante — medidas del diseño

Estas medidas **son un cambio respecto de lo que hay hoy** en `components/ui/sidebar.tsx`,
que es shadcn sin editar. El spec tiene que decidir explícitamente si entran en esta ficha
o si se anotan como pregunta abierta; **no las metas de tapadillo**.

| Qué | Diseño | Hoy |
| --- | --- | --- |
| Ancho expandido | 272 px | `SIDEBAR_WIDTH = 16rem` (256 px) |
| Ancho modo icono | 78 px | `SIDEBAR_WIDTH_ICON = 3rem` (48 px) |
| Alto del item | 44 px | `h-8` (32 px) |
| Radio del panel | 22 px | `variant="floating"` usa `rounded-lg` |
| Margen flotante | 18 px | — |
| Degradado del panel | 166°, 4 paradas | fondo plano |

Degradado del panel (tenue pero visible, es un pedido explícito del humano):

- oscuro: `#1b3b39 0% → #133032 34% → #0f2426 68% → #091a1c 100%`
- claro: `#ffffff 0% → #f6fcfb 34% → #ecf7f5 68% → #dfefed 100%`

Tipografía: sin cambios (Geist / Geist Mono, ya cargadas en `app/layout.tsx`).

## 5. Lo que NO entra

- Rediseñar pantallas o tocar `DashboardContent` — sigue vacía a propósito (QC-12 R3).
- Añadir acentos nuevos más allá del naranja del diseño.
- Cambiar la estructura o la navegación de la barra lateral: solo se re-colorea.
- Los `--chart-*` (ver §3.2).

## 6. Trampas conocidas en este repo

- `globals.css` ya declara `@custom-variant dark (&:is(.dark *))`. Es Tailwind v4: **el
  tema se define en `@theme inline` + variables CSS, no en `tailwind.config`** — no existe
  ese archivo en el repo, así que «actualizar el schema de Tailwind» significa tocar
  `app/globals.css`.
- El `<html>` de `app/layout.tsx` no tiene `suppressHydrationWarning`. `next-themes`
  escribe la clase antes de la hidratación: sin ese atributo, React avisa de mismatch.
- El encabezado privado vive en `app/(private)/layout.tsx` y hoy solo contiene
  `<SidebarToggle />`. `SIDEBAR_TOGGLE_LABEL` es el precedente de cómo se nombra un control
  accesible en este repo: constante exportada, no literal en el JSX.
- El layout privado es Server Component y es **el único** que llama al proveedor de sesión
  (QC-11 R16). No conviertas ese archivo en cliente para colgar el provider.
