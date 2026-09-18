# QC-114 — tabla-compartida-en-iphone-real · design.md

> Esta feature **no tiene código de producción**. Lo que aquí se diseña es un **protocolo de prueba
> ejecutable por una persona** y el **documento de evidencia** donde queda su resultado. No hay
> modelo de datos nuevo, ni migraciones, ni RLS, ni endpoints, ni contratos de entrada/salida, ni
> integraciones externas: las secciones que el proceso reserva para eso se responden abajo con
> «ninguno», y ese «ninguno» es una decisión, no un olvido (R18).

## 1. Qué se construye y qué no

| Pieza | ¿Se construye? | Dónde |
|---|---|---|
| Plantilla del registro de evidencia | **Sí**, la crea un agente | `docs/verificacion-ios/QC-114.md` |
| Datos sembrados para que las tablas desborden | **Sí**, preparación previa | base del preview (ver `## 8`) |
| Pasada en el iPhone | **Sí, y sólo una persona** | el dispositivo |
| Componentes, rutas, hooks, estilos | **No** | — |
| Tests automatizados nuevos | **No** | — |
| Dependencias nuevas | **No** | `package.json` no se toca |
| Migraciones / RLS / endpoints | **Ninguno** | — |

**Dependencias de terceros.** Esta feature **no añade ninguna** (R18), así que los cuatro checks de
`docs/architecture.md > Dependencias de terceros` no aplican y `docs/dependencias.md` no cambia. El
único artefacto ejecutable que se usa ya existe en el repo: `pnpm db:seed` (`scripts/seed.ts`).

## 2. Las nueve vistas, y de dónde salen

La lista **se deriva** de la guardia viva `tests/unit/shared/data-table-alcance.test.ts`
(`carpetasAutorizadas`, líneas ~194-205), que a su vez deriva de las constantes de
`lib/shared/routes.ts`. No se copia de la `description` de la ficha, que es anterior a que existiera
`/asignacion` (D3).

| # | Vista | Ruta | Constante |
|---|---|---|---|
| 1 | Pedidos | `/pedidos` | `ORDERS_ROUTE` |
| 2 | Inventario | `/inventario` | `INVENTORY_ROUTE` |
| 3 | Proveedores | `/proveedores` | `SUPPLIERS_ROUTE` |
| 4 | Presentaciones | `/configuracion/presentaciones` | `PRESENTATIONS_ROUTE` |
| 5 | Unidades | `/configuracion/unidades` | `UNITS_ROUTE` |
| 6 | Usuarios · personas | `/configuracion/usuarios` | `USERS_ROUTE` |
| 7 | Usuarios · grupos | `/configuracion/usuarios?tab=grupos` | `USERS_ROUTE` + `?tab=grupos` |
| 8 | Recetas | `/produccion/formulas` | `FORMULAS_ROUTE` |
| 9 | Asignación | `/asignacion` | `ASSIGNED_ORDERS_ROUTE` |

Las dos pestañas de usuarios son **dos vistas en una ruta**: el conmutador es server-side
(`usuarios-tabs-switch.tsx`, `?tab=grupos` llega pintado en el HTML servido), así que cada pestaña
monta su propia tabla y hay que observarlas por separado (R1, R11).

## 3. El protocolo, paso a paso

Para **cada** vista de la tabla anterior, en ese orden, el verificador:

1. **Abre** la URL del preview de Vercel del PR sobre HTTPS, en Safari de iOS (R4, R5).
2. **Comprueba el desbordamiento**: la tabla debe salirse de la pantalla **en horizontal y en
   vertical**. Si cabe entera, la vista no ejerce ni el `sticky` ni el scroll anidado: se siembra
   más y se vuelve; si aun así cabe, los tres puntos van como **no concluyentes** (R6).
3. **Fija una columna** desde el menú de su cabecera si no viene ya fijada. El fijado se guarda en
   `localStorage` por `tableId` (`use-pinned-columns.ts`), así que queda puesto mientras dure la
   sesión del dispositivo; borrar datos de Safari lo deshace (R7).
4. **Punto A — la columna fijada no se mueve** (R8): arrastrar horizontalmente con el dedo sobre las
   celdas y **soltar en movimiento** para provocar la inercia. Se mira la columna fijada durante el
   arrastre y durante el frenado. Rojo si se desplaza, se despega del borde, parpadea o deja ver
   celdas por debajo.
5. **Punto B — el scroll es de la tabla, no del `body`** (R9): arrastrar dentro de la tabla, en
   horizontal y en vertical, mirando la cabecera de la página y la navegación. Rojo si el documento
   se desplaza en horizontal, si la página entera acompaña al gesto o si aparece el rebote elástico
   de iOS por un arrastre nacido dentro de la tabla.
6. **Punto C — el menú de cabecera responde al toque** (R10): tocar el disparador
   (`data-table-header-menu-content-<columna>` en `data-table-header-menu.tsx`), activar una opción
   por toque y cerrar tocando fuera. Rojo si hace falta doble toque, pulsación larga o si el menú se
   abre y se cierra solo (patología típica de `:hover` emulado en WebKit táctil).
7. **Anota** los tres veredictos en la fila de la vista. Verde sin captura; rojo con captura o vídeo
   (R13).

Al terminar las nueve, el verificador rellena la cabecera del registro (modelo de iPhone, versión de
iOS, fecha, URL del preview) y abre una ficha nueva por cada rojo (R16).

## 4. El documento de evidencia

`docs/verificacion-ios/QC-114.md`, creado por un agente **vacío de veredictos** antes de la pasada.
Es doc de producto, no `progress/`: sobrevive al cierre de la ficha y es lo que leerá quien arregle
el componente. Hereda el formato de la T13 de QC-55 —«dispositivo/navegador, versión y qué se
vio»— y lo tabula.

Estructura:

```
# QC-114 — Verificación en iPhone real de la tabla compartida

Dispositivo: <modelo de iPhone>   ·  iOS: <versión, >= 16>  ·  Safari de iOS
Preview: <URL del preview de Vercel del PR>   ·  Fecha: <AAAA-MM-DD>
Verificador: <persona>

Android y Chrome Android quedan SIN COMPROBAR: esta pasada cierra sólo iOS (R14).

| # | Vista | Ruta | A· columna fijada | B· scroll contenido | C· menú por toque | Evidencia / ficha |
|---|---|---|---|---|---|---|
| 1 | Pedidos | /pedidos |  |  |  |  |
... nueve filas ...

## Mapa R<n> -> evidencia
## Hallazgos
```

Cada casilla de A/B/C admite exactamente uno de: `verde`, `rojo`, `no concluyente` (+ motivo). La
columna «Evidencia / ficha» lleva el enlace a la captura y la clave de la ficha nueva cuando hay un
rojo.

## 5. Alternativa descartada: ampliar el E2E de Playwright en WebKit de escritorio

Es la alternativa obvia, ya está montada y **no sirve**. `playwright.config.ts` declara dos
proyectos: `chromium` (`Desktop Chrome`) y `webkit` (`Desktop Safari`). QC-56 ya corre sus
recorridos en ambos (su R26). Añadir ahí un caso de `sticky` + scroll daría un verde que no
significa lo que parece, por tres motivos concretos:

1. **Inercia táctil.** El punto A sólo falla de verdad cuando el dedo suelta en movimiento y WebKit
   sigue desplazando por momento. Playwright de escritorio desplaza con `mouse.wheel` o
   `scrollIntoView`: no hay `-webkit-overflow-scrolling` en juego, no hay recomposición asíncrona
   del scroller y el repintado del `sticky` ocurre en el hilo principal, que es justo el caso que
   **no** rompe.
2. **`position: fixed`/`sticky` dentro de scroll anidado.** `docs/architecture.md > Regla:
   multiplataforma` lo dice sin rodeos: «`position: fixed` y scroll anidado **se comprueban en iOS**
   antes de darlos por buenos». El motor de composición de WebKit **de escritorio** promueve las
   capas de otra manera que el de iOS, donde el scroller desplazado fuera del hilo principal es
   precisamente lo que hace despegarse a la columna fijada. `data-table.tsx` calcula el offset del
   `sticky` con `getStart()`/`getAfter()` (`getStickyStyle`, ~línea 217): un verde en escritorio no
   dice nada del repintado durante la inercia en iOS.
3. **jsdom no tiene layout.** El nivel donde sería barato probarlo —Vitest— no puede: sin layout no
   hay desbordamiento, ni `scrollLeft` real, ni `position: sticky` resuelto. Un test de jsdom sobre
   esto **da por bueno en falso** cualquiera de los tres puntos. Es la razón por la que
   `product-table.tsx` evitó el `sticky` horizontal en su día (QC-55, decisión 17 — D1).

Descartada también, por lo mismo: el **simulador de Xcode**. Comparte el WebKit del sistema pero no
el hardware de entrada; el gesto se sintetiza con el ratón y la inercia no es la del dispositivo. La
decisión D5 exige iPhone físico y R5 lo escribe.

**¿Algún requisito admite test automatizado?** R18 (el diff no toca producción) sí: una guardia de
diff lo afirmaría sin layout. **No se añade**: R18 dice explícitamente que esta feature no añade
tests nuevos, y la revisión del diff es task de agente (T7) verificable con `git diff --name-only`.
El resto —R1 a R17— o son observación humana o son condiciones sobre el registro, y ninguno de ellos
es de los que jsdom puede afirmar sin dar un verde falso.

## 6. Trazabilidad: `R<n> -> fila de evidencia`

La regla 4 de `CLAUDE.md` exige que cada `R<n>` mapee a un test concreto. **Aquí ese «test» es una
casilla del registro**, no un archivo de Vitest, porque no hay código que ejercitar. Este es el mapa
que el reviewer debe usar para juzgar; el implementer lo copia a `progress/impl_QC-114-*.md` y la
plantilla lo lleva en su sección «Mapa `R<n>` -> evidencia».

| Requisito | Se verifica contra |
|---|---|
| R1 | El registro tiene **nueve** filas y sus rutas coinciden una a una con la tabla de `## 2` |
| R2 | Cabecera del registro: una sola fecha y una sola URL de preview para las nueve filas |
| R3 | Las nueve rutas del registro están todas en `carpetasAutorizadas`; la nota de R14 |
| R4 | Campo «Preview» de la cabecera: URL `https://…vercel.app` del PR de esta rama |
| R5 | Campos «Dispositivo» e «iOS» de la cabecera; la versión es >= 16 |
| R6 | Columna «Evidencia / ficha»: toda fila con «no concluyente» lleva el motivo escrito |
| R7 | Columna A de cada fila: `no concluyente` con motivo si no había columna fijable |
| R8 | Columna **A** de las nueve filas |
| R9 | Columna **B** de las nueve filas |
| R10 | Columna **C** de las nueve filas |
| R11 | Las 27 casillas A/B/C están rellenas; ninguna vacía ni «igual que arriba» |
| R12 | El archivo existe, está en el diff del PR y su cabecera está completa |
| R13 | Toda casilla `rojo` tiene enlace a captura o vídeo en su fila |
| R14 | Sección de cabecera del registro que declara Android sin comprobar |
| R15 | Sección «Mapa `R<n>` -> evidencia» del propio registro |
| R16 | Toda casilla `rojo` tiene clave de ficha nueva en su fila; sección «Hallazgos» |
| R17 | El PR se cierra con rojos registrados sin cambios de producción (ver R18) |
| R18 | `git diff --name-only origin/dev...HEAD` sólo lista `docs/verificacion-ios/`, `specs/QC-114-*` y `progress/` |

## 7. Modelo de datos, rutas, contratos, integraciones

- **Tablas, migraciones, RLS**: ninguno. No se altera el esquema. Los datos que se siembran son
  filas de tablas ya existentes, creadas por `scripts/seed.ts` o por la propia UI.
- **Rutas / endpoints**: ninguno nuevo. Las nueve URLs de `## 2` ya existen; se visitan, no se
  modifican.
- **Contratos I/O**: ninguno. El único artefacto con «formato» es el registro de `## 4`, y su
  contrato es el de `## 6`.
- **Integraciones**: el preview de Vercel del PR (ya existente en el flujo del repo) y el board de
  Jira para las fichas de hallazgo, según `docs/jira.md`.

## 8. Dos cosas que el diseño no puede cerrar

Están escritas como preguntas abiertas 3 y 4 en `requirements.md` y **bloquean tasks concretas**; no
se rellenan con supuestos (regla 6):

- **Cuenta(s) del preview.** La navegación filtra por permiso (`private-nav.ts`), y no consta una
  cuenta que vea a la vez `/asignacion` (`asignaciones.consultar`) y `/configuracion/usuarios`
  (`usuarios.consultar`). Si hacen falta dos sesiones, el registro lo anota en la cabecera y R2
  sigue cumpliéndose: es una pasada, no un inicio de sesión.
- **Siembra contra el preview.** D6 manda sembrar y D4 manda probar contra el preview; el repo no
  documenta si `pnpm db:seed` puede correrse contra la base del preview ni quién tiene acceso. Se
  decide al aprobar el spec.
