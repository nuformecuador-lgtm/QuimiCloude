# QC-23 — registro-de-sesiones · requirements.md

> **Zona:** `backend` · **Complejidad:** `high` · **depends_on:** `QC-8` ·
> **Rama:** `feature/QC-23-registro-de-sesiones`
>
> **Alcance.** Que cerrar sesión invalide **de verdad** el código de sesión, y no solo retire la
> cookie. Se hace con **dos mecanismos distintos**, porque las dos acciones son distintas: un
> **sello por usuario** que mata todo lo emitido antes de una fecha, y un **identificador de
> sesión** dentro del token más el registro de las sesiones cerradas una a una. Con ellos: cerrar
> sesión cierra **solo ese dispositivo**; «cerrar todas» las cierra **todas, incluida la actual**;
> el administrador cerrando las de otro es **siempre total**; y cambiar el rol o dar de baja
> **corta todo al instante**. Migración con su `down.sql` y los tests. Módulo `identity`.
>
> **Lo que NO entra.** Los botones: el del usuario es **QC-53**. La **lista de dispositivos
> abiertos** con cierre uno a uno desde ella: **descartada a propósito y NO genera ficha** (ver
> decisión 7). Guardar en memoria rápida la comprobación: **QC-28**. El botón del administrador:
> no tiene ficha porque no existe pantalla de administración de usuarios (ver pregunta abierta 2).
>
> Sembrado por `/afinar-feature` el 2026-09-03. El bloque de Alcance y la tabla de
> «Decisiones cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los
> reabre y no los reescribe: su trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

_Pendiente: los escribe spec_author (F1.2)._

## Preguntas abiertas

No se rellenan con supuestos (regla 6 de `CLAUDE.md`).

1. **¿Se purgan las filas de sesiones cerradas una vez pasada su caducidad natural?** Una sesión
   cerrada deja de poder autorizar nada en cuanto su token caduca (8 h, **QC-7 D10**), así que la
   fila que la recuerda es basura a partir de ese momento. No se decidió si se borra, ni con qué
   —una tarea programada, un borrado perezoso al leer, o nada—. **Posición por defecto: se pueden
   borrar, y no borrarlas no rompe nada**, solo hace crecer la tabla.
2. **¿Dónde vive el botón del administrador?** La decisión 9 le da al Administrador el poder de
   cerrar las sesiones de otro usuario, pero **este ERP no tiene pantalla de administración de
   usuarios ni ficha que la cree**. No se inventó ninguna: crear la ficha obligaría a inventar
   también dónde cuelga. Hasta que exista, esa capacidad queda **implementada y sin forma de
   invocarse desde la interfaz**.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
| --- | --- | --- |
| 2026-09-03 | ¿Cómo se invalida un código de sesión ya emitido? | **Con dos mecanismos, no uno.** (a) Un **sello por usuario** —una fecha de «válido desde»— que invalida todo lo emitido antes: sirve para el cierre total. (b) Un **identificador de sesión** dentro del token más el **registro de las sesiones cerradas** una a una: sirve para el cierre individual. Las dos acciones son distintas y ninguno de los dos mecanismos cubre la otra |
| 2026-09-03 | ¿El sello obliga a cambiar el formato del token? | **No.** El token **ya lleva `iat`** (la fecha de emisión firmada, **QC-7**/**QC-8**), así que el sello se compara contra algo que ya viaja. Verificado en `lib/modules/identity/domain/session-claims.ts` al acotar |
| 2026-09-03 | ¿Y el identificador de sesión? | **Sí, ese cambia el formato del token**, que sube de versión otra vez. Las sesiones vivas se rompen. Se acepta con el mismo criterio con que ya se aceptó en **QC-9**: *«no existen sesiones vivas y si alguna vive la borramos desde el navegador»* |
| 2026-09-03 | ¿Cerrar sesión cierra un dispositivo o todos? | **Solo ese dispositivo.** Quien sale en el móvil sigue dentro en la oficina. Se apartó de la propuesta inicial —que era aceptar el cierre total por ser mucho más barato— porque el humano quiso separar la comodidad del usuario de la acción de seguridad |
| 2026-09-03 | ¿Y «cerrar todas mis sesiones»? | **Las cierra todas, incluida la actual**, así que quien la usa acaba en el login. Está en la ficha del board: poder cerrarlas «desde cualquiera de sus dispositivos» |
| 2026-09-03 | ¿El administrador puede cerrar una sesión suelta de otro? | **No: lo suyo es siempre total.** El administrador no elige dispositivo. Su acción es de seguridad —se fue un empleado, quedó una sesión abierta en un equipo compartido de planta—, no de comodidad |
| 2026-09-03 | ¿El usuario ve la lista de sus dispositivos abiertos? | **No, y no genera ficha.** Descartada a propósito: obliga a una lectura por petición —justo lo que **QC-28** quiere quitar— y no da nada que no dé el cierre total. Si algún día se quiere, se decide entonces |
| 2026-09-03 | ¿Un cambio de rol o una baja cortan las sesiones? | **Sí, al instante y todas.** **Cierra la deuda que QC-9 dejó anotada con nombre y apellido** en su decisión «¿un cambio de rol debe cortar las sesiones?» → *«sí, pero se implementa en QC-23»*, hoy sostenida por un test de caracterización del límite (**QC-9 R30**) |
| 2026-09-03 | Permisos | **El Administrador puede cerrar las sesiones de otro usuario; cualquiera puede cerrar las suyas.** Se valida **en el service**, no en el middleware (`docs/architecture.md > Acceso a datos y autorizacion`), y lleva su test (`CHECKPOINTS.md > Permisos`) |
| 2026-09-03 | ¿Qué pasa si no se puede comprobar si una sesión fue cerrada? | **Se corta: la sesión se trata como inválida y la persona vuelve al login.** Una revocación que se puede saltar provocando un fallo no es una revocación. **Es lo contrario de lo que exige QC-28 para su caché** —que falla abierta y cae a la base—, y por eso el estado de revocación **no puede vivir solo en la memoria rápida** |
| 2026-09-03 | ¿Dónde se aplica la comprobación? | **Donde ya se resuelve el usuario contra la base en cada petición** (**QC-8 D2**: *«el usuario se resuelve contra la base en cada petición»*). El middleware **no** gana una lectura: **QC-9** ya decidió que no es la frontera de seguridad y que el rol firmado solo evita enseñar una pantalla inútil |
| 2026-09-03 | ¿Cambia el «cerrar sesión» que ya existe? | **Sí en el efecto, no en la firma.** `logoutAction()` sigue **sin parámetros y sin valor de retorno**, congelada por **QC-11** y respetada por **QC-8** |
| 2026-09-03 | Caducidad de la sesión | **Sin cambios: 8 h absolutas, sin renovación deslizante y sin «recordarme».** Heredado de **QC-7 D10**. Esta ficha acorta la vida de una sesión por decisión, no por tiempo |
| 2026-09-03 | ¿Cuántas implementaciones del HMAC quedan? | **Una sola en todo el repositorio.** Heredado de **QC-8 R5** y **QC-9**, que ampliaron las guardias para que un `createHmac` propio en la raíz no pasara el gate en verde |
| 2026-09-03 | Módulo propietario y capas | **`identity`.** La lógica de qué sesión es válida vive en `domain/`; el almacén es un **adaptador driven** detrás de un puerto, y el cableado solo en `lib/composition/index.ts`. Heredado de **QC-15** y **QC-8** |
| 2026-09-03 | Borrado y marcas de tiempo | **Borrado lógico** donde aplique, con `created_at` / `updated_at` / `deleted_at`. Heredado de **QC-4** y `docs/architecture.md > Dominio` n.º 3 |
| 2026-09-03 | Idioma de los identificadores de la DB | **Inglés** (tablas, columnas, índices, restricciones). Heredado de **QC-4** |
| 2026-09-03 | RLS | **Activada y forzada** (`FORCE ROW LEVEL SECURITY`). Heredado de **QC-4 R19**. No sustituye a la autorización en el service |
| 2026-09-03 | Migración | `migration.sql` (UP) más `down.sql` (DOWN) obligatorio, y revertirla deja el esquema exactamente como estaba. Heredado de **QC-4 R20** |
| 2026-09-03 | E2E | **Diferido con motivo a QC-53**, que es quien trae el botón y el recorrido navegable. Aquí no hay pantalla que visitar. Mismo criterio con el que **QC-8** difirió su prueba en navegador a QC-9. **Ojo**: `CHECKPOINTS.md` pide E2E para autenticación, así que el diferimiento **es una deuda con destinatario**, no una exención |
| 2026-09-03 | Librería nueva | **Ninguna.** Es esquema, migración y dominio. Regla 7 de `CLAUDE.md` sin propuesta que abrir |
