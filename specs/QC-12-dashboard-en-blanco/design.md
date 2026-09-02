# QC-12 — dashboard-en-blanco · design.md

Feature deliberadamente pequeña: una ruta, un título, un contenedor vacío. Este documento
existe sobre todo para fijar **lo que NO se toca** y **por qué la pantalla no declara su propio
`<main>`**, que son los dos sitios donde esta feature puede romper algo ajeno.

## 0. Estado real del repo (verificado, no supuesto)

Comprobado en el worktree `.worktrees/QC-12-dashboard-en-blanco/` el 2026-09-02, antes de
escribir este diseño:

| Hecho | Evidencia |
| --- | --- |
| El route group privado **existe y está mergeado**: `app/(private)/layout.tsx` | lectura del archivo |
| `SidebarInset` **renderiza el elemento `<main>`** | `components/ui/sidebar.tsx:305-316` |
| El layout privado ya monta `SidebarProvider` → `AppSidebar` + `SidebarInset` con `<header>` y `{children}` | `app/(private)/layout.tsx:37-55` |
| El layout **no crea ninguna `page.tsx`**: hoy la zona privada **no expone ninguna URL** | `app/(private)/` sólo tiene `layout.tsx` y `components/` |
| Barrel de componentes de ruta ya en uso en la zona privada | `app/(private)/components/index.ts` |
| `DASHBOARD_ROUTE = '/dashboard'` | `lib/shared/routes.ts:1` |
| El ítem «Dashboard» del sidebar **ya apunta a `DASHBOARD_ROUTE`** | `lib/shared/navigation/private-nav.ts:54-59` |
| Marca larga exportada como `BRAND_LABEL = 'QuimiCloude'` | `lib/shared/navigation/private-nav.ts:31` |
| Precedente de pantalla: Server Component + `export const metadata` + barrel `./components` | `app/(public)/login/page.tsx` |
| Helper de viewport para tests (angosto/ancho) y limpieza de la cookie de UI | `tests/helpers/viewport.ts` |
| Patrón de test del layout privado con mocks de `next/headers`, `next/navigation` y `@/lib/composition` | `tests/unit/private-layout.test.tsx` |
| Deuda registrada: los 5 ítems del sidebar son placeholder con rutas 404 | `progress/current.md` (Feature 8 — ítems de navegación de ejemplo) |

**Conclusión operativa.** No falta nada por construir salvo la propia página. Esta feature
**no** re-crea layout, sidebar, navegación, primitivas ni utilidades de test: las hereda. Por
eso `tasks.md` abre con **T0**, una verificación de precondiciones que falla ruidosamente si la
base no está — el mismo mecanismo que QC-11 puso tras el choque entre las features 4 y 10.

## 1. Decisiones

Las cierra la tabla `requirements.md > Decisiones cerradas (no reabrir)`, fechadas el
2026-09-02. Aquí sólo el detalle técnico de cada una.

## 2. Ruta y archivos

```
app/(private)/dashboard/
  page.tsx                     # NUEVO. Server Component: metadata + <h1> + <DashboardContent />
  components/
    index.ts                   # NUEVO. Barrel de la ruta
    dashboard-content.tsx      # NUEVO. Area de contenido vacia (la costura)
```

**Nada más se crea y nada existente se edita.** La feature es puramente aditiva.

**URL resultante: `/dashboard`.** Un route group entre paréntesis **no aporta segmento de
URL**, así que `app/(private)/dashboard/page.tsx` sirve `/dashboard`, que es exactamente el
valor de `DASHBOARD_ROUTE`. El nombre de la carpeta es el único punto del repo donde esa ruta
aparece como texto por obligación del framework; **R10 se cumple con un test que deriva la ruta
esperada de la constante y comprueba que el archivo está donde toca**, en vez de fingir que un
nombre de carpeta puede ser una constante.

**Consecuencia deseada, sin trabajo extra:** el `href` del ítem «Dashboard» del sidebar y la
redirección post-login de QC-10 dejan de apuntar a un 404. Eso ocurre **porque ambos ya usan
`DASHBOARD_ROUTE`**, no porque esta feature toque nada de eso (**R11**).

## 3. Contratos de entrada/salida

| Contrato | Valor |
| --- | --- |
| Props de la página | **Ninguna.** No usa `params` ni `searchParams` |
| Props de `DashboardContent` | **Ninguna.** Sin `children` tampoco: hoy no hay nada que inyectar y una prop sin uso es generalidad especulativa |
| Datos de sesión | **Ninguno** (R6). El layout ya obtiene el usuario para el sidebar; la página **no lo recibe ni lo pide** |
| Salidas | Sólo JSX + `export const metadata` |
| Endpoints / Server Actions | **Ninguno** |
| Modelo de datos, tablas, RLS, migraciones | **NO APLICA**: la feature no toca base de datos (R6) |
| Integraciones externas | **Ninguna** |
| Variables de entorno | **Ninguna** |

## 4. Estructura de la pantalla

```tsx
// app/(private)/dashboard/page.tsx  (Server Component: sin 'use client')
export const metadata: Metadata = { title: `Dashboard · ${BRAND_LABEL}` };

export default function DashboardPage() {
  return (
    <div className="flex flex-1 flex-col gap-4 p-4 md:p-6">
      <h1 data-testid="dashboard-title" className="text-2xl font-semibold">Dashboard</h1>
      <DashboardContent />
    </div>
  );
}
```

- **Contenedor exterior `<div>`, no `<main>`** (R4): `SidebarInset` ya es el `<main>` y R5 de
  QC-11 exige que sea único. Anidar otro rompería un requisito de una feature `done`, y su test
  `el contenido de la pantalla se renderiza dentro de un unico main` se pondría en rojo — que
  es justo para lo que ese test existe.
- **`<h1>` en la página, no en la cabecera del layout** (R2): la cabecera de
  `app/(private)/layout.tsx` es de QC-11 y no se toca.
- **`DashboardContent`** es la **costura explícita y vacía**: un contenedor con `data-testid`
  estable y sin hijos, con el espaciado ya resuelto, para que la primera feature que traiga
  contenido lo inserte ahí sin rediscutir el layout de la pantalla. Mismo patrón que el
  disparador de logout vacío de QC-11: la costura se **nombra**, se deja vacía y se testea que
  está vacía (R3).
- **Sin `loading.tsx` ni `error.tsx`**: no hay carga asíncrona ni error posible que mostrar. Un
  esqueleto de carga sería contenido inventado.

## 5. Multiplataforma (`docs/architecture.md > Regla: multiplataforma`)

**No se declara ninguna excepción de escritorio.** Aplica en su totalidad:

- Alto: se usa `flex-1` dentro del `<main>` del layout. **Nada de `100vh`** (R12); si hiciera
  falta un alto de pantalla, sería `min-h-dvh`.
- Espaciado mobile-first: `p-4` de base, `md:p-6` hacia arriba.
- No hay controles interactivos en esta pantalla, así que **no hay targets táctiles, ni
  `:hover`, ni inputs con riesgo de zoom en iOS**. Es la razón por la que la superficie
  multiplataforma de la feature es mínima — pero se verifica igualmente en angosto y ancho
  (R12) con `tests/helpers/viewport.ts`, porque montar dentro del layout privado **sí** depende
  del viewport (el sidebar cambia de mecanismo en 768 px).
- El scroll horizontal se evita no fijando anchos: el contenedor es fluido.

## 6. Dependencias de terceros

**Ninguna nueva.** No se añade ningún paquete a `package.json` y no se ejecuta ningún
`shadcn add`: una pantalla con un encabezado y un contenedor vacío no necesita primitivas. Por
tanto **no hay propuesta pendiente de aprobación humana** en esta feature y
`docs/dependencias.md` no cambia.

Si al implementar apareciera una necesidad real, el `frontend_dev` **para, no instala**, y la
propone con los cuatro checks al leader (regla 7 de `CLAUDE.md`,
`docs/architecture.md > Dependencias de terceros`). La guardia
`tests/guards/guard-dependencias-aprobadas.test.ts` lo hace cumplir de todos modos.

## 7. Alternativas descartadas (y por qué)

**A — Todo en `page.tsx`, sin carpeta `components/`.** Es la opción más corta y tiene un
argumento legítimo a favor: `> Regla: sin sobre-ingenieria` desaconseja envolver por envolver,
y un `<div>` vacío como componente propio parece ceremonia. **Descartada** porque
`docs/architecture.md > Regla: componentes de ruta en components/ con barrel index.ts` lo dice
expresamente para este caso —«si la ruta necesita **un solo** componente, también va en
`components/` con su `index.ts`; la consistencia vale más que ahorrar una carpeta»— y porque
aquí el componente **gana su sitio**: es la costura nombrada donde entrará el contenido futuro,
y tener barrel desde el día uno significa que la feature que llene el dashboard añade archivos
en vez de reorganizar los ajenos. La tensión se anota aquí a propósito, para que el reviewer
vea que se consideró y no se coló por inercia.

**B — Rellenar el dashboard con tarjetas o métricas placeholder.** «Ya que hacemos la pantalla,
dejamos 4 tarjetas de ejemplo.» **Descartada**: la ficha del board dice literalmente
«deliberadamente vacía… lista para llenarse más adelante», y datos inventados en un ERP son
peores que un hueco (`> Regla: sin sobre-ingenieria`, regla 6 de `CLAUDE.md`). Además crearía
exactamente la clase de deuda que QC-11 ya dejó anotada con sus 5 ítems placeholder. R3 tiene
un test **en negativo** para que añadirlas ponga algo en rojo.

**C — Poner la página en `app/(private)/page.tsx`.** Aprovecharía que el route group ya existe.
**Descartada**: `(private)` no aporta segmento, así que esa página serviría **`/`**, chocando
con `app/page.tsx` (dos páginas para la misma ruta es un error de build) y contradiciendo
`DASHBOARD_ROUTE = '/dashboard'`, que es a donde ya redirige el login.

**D — Envolver el contenido en su propio `<main>`** (como hace `app/(public)/login/page.tsx`).
Parecía coherente con el precedente. **Descartada**: en la zona pública la página **es** el
armazón, pero en la privada `SidebarInset` ya renderiza el `<main>` y R5 de QC-11 exige uno
solo. El precedente correcto aquí es el layout, no el login.

**E — Mover el título a la cabecera del layout privado** (patrón «page header» compartido, con
un slot que cada pantalla rellena). Es un patrón bueno… **para cuando haya varias pantallas
privadas**. **Descartada hoy**: obligaría a editar `app/(private)/layout.tsx`, archivo de una
feature `done`, para servir a una sola pantalla, y a inventar una API de slot sin un segundo
caso que la valide. Cuando exista la segunda pantalla privada, se extrae con dos ejemplos
delante.

**F — Reconectar aquí el ítem «Dashboard» del sidebar.** **Descartada por decisión humana del
2026-09-02**: lo hace QC-13 (`requirements.md > Decisiones cerradas`, fila 1). No es olvido.

## 8. E2E: diferido, con motivo

**No hay E2E en esta feature.** No existe sesión real (R8) ni flujo navegable que ejercitar: un
Playwright que abra `/dashboard` comprobaría lo mismo que el test de componente, más despacio y
con más superficie de fallo. **El E2E de login → dashboard lo aporta QC-13**, que trae la
guardia de sesión y con ella el primer camino privado de verdad. Queda como **T8** de
`tasks.md` (task cerrada como diferida, no opción abierta) y como deuda para
`progress/current.md`.

## 9. Riesgos y cómo se mitigan

1. **Duplicar el layout o el sidebar** (el choque features 4↔10 ya pasó en este repo). Mitiga
   **T0**: verificación explícita de la base heredada, con parada y aviso al leader si falta.
2. **Romper el `main` único de QC-11** anidando otro. Mitiga R4 con test propio, y el test
   existente `el contenido de la pantalla se renderiza dentro de un unico main` seguiría siendo
   la segunda red.
3. **Romper el test negativo de notificaciones de QC-11** (`queryAllByRole('region')` debe ser
   0 en el layout). Por eso el área de contenido **no** es un `role="region"` con nombre
   accesible, sino un contenedor plano con `data-testid` (R4).
4. **Que el implementer "aproveche" para llenar la pantalla.** Mitiga R3 con test en negativo.
5. **Conflicto de archivos con QC-13**, que también vive en `app/(private)/`. QC-12 sólo añade
   archivos nuevos bajo `app/(private)/dashboard/`; el leader vigila el paralelismo.
6. **jsdom y `matchMedia`**: cualquier test que renderice dentro del layout privado revienta
   sin el stub. Ya existe (`tests/helpers/viewport.ts`); se **reutiliza**, no se re-crea.
