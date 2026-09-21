# QC-107 — componente-de-carga-de-archivos · requirements.md

> **Zona** `frontend` · **Complejidad** `medium` · **`depends_on`** `QC-106`, `QC-111` (las dos
> `done`) · **Rama** `feature/QC-107-componente-de-carga-de-archivos`
>
> **Alcance.** El componente de subida de hasta 10 PDFs por tanda, con una prop que elige la
> estrategia para **toda** la tanda, montado en **dos** sitios: la pantalla de proveedores (modo
> catálogo) y la de fórmulas (modo fórmula). Muestra el estado de cada archivo —en cola,
> procesando, listo, error con su motivo— y lo refresca por **sondeo propio** hasta que la tanda
> termina. Trae además el **primer recorrido E2E navegable** de toda la cadena de Documentos e IA.
>
> **Lo que NO entra.** La subida y la conversión → **QC-106**. La cola, los reintentos y la
> consulta de estado → **QC-111**. El tiempo real y los avisos → **QC-137**. Los prompts
> definitivos y su revisión firmada → **QC-131**. **Guardar lo que la IA devuelve → sin dueño
> hoy** (pregunta abierta 2).
>
> Sembrado por `/afinar-feature` el 2026-09-21. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

_Pendiente: los escribe spec_author (F1.2)._

## Preguntas abiertas

1. **El permiso, y bloquea uno de los dos montajes.** Subir exige `proveedores.modificar`, que es
   lo que el módulo ya declara en `lib/modules/documentos/domain/actor.ts:42`
   (`DOCUMENT_UPLOAD_PERMISSION`). Montado en **proveedores** encaja solo; montado en
   **fórmulas**, quien trabaja recetas necesitaría un permiso del módulo de proveedores para
   poder subir. O se acepta ese préstamo, o `documentos` necesita permiso propio — y eso sería
   una **enmienda al catálogo de permisos de QC-74**, que no la decide esta ficha. **Bloquea el
   montaje en fórmulas; el de proveedores puede avanzar sin esperar.**
2. **El texto extraído no va a ninguna parte, y hay que decirlo antes de construir.** La pantalla
   dirá «listo», pero lo que la IA devolvió **no se persiste**: QC-109 lo devuelve y lo registra
   por consola, y ninguna ficha lo guarda todavía. ¿Se acepta como estado transitorio hasta que
   exista la ficha que lo persista —el catálogo leído hacia productos del proveedor, la fórmula
   leída hacia una receta—, o esa ficha hace falta ya? Mientras siga abierta, **QC-131 firma su
   revisión leyendo el log del servidor**, que es lo decidido en `[D3]`.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
| --- | --- | --- |
| 2026-09-21 | ¿Dónde se monta el componente? | **Dos montajes, y ninguna pantalla propia de documentos**: en modo **catálogo** dentro de **proveedores**, en modo **fórmula** dentro de **fórmulas**. Se descartó una pantalla propia bajo el área privada, que habría dado la ruta navegable antes pero deja el componente lejos de donde el dato acaba viviendo. `[D1]` |
| 2026-09-21 | ¿Cómo se entera la pantalla de que un archivo terminó? | **Sondeo propio desde el cliente** sobre `getBatchStatusAction`, que QC-111 ya publica, y **para en cuanto los archivos están todos en `done` o `error`**. La condición de parada es fiable porque `[D11]` de QC-111 garantiza que ningún archivo se queda colgado: caduca a error por tiempo. **Sin dependencia nueva**: no entra SWR. El intervalo lo fija `design.md`. `[D2]` |
| 2026-09-21 | ¿Y el tiempo real, que es lo que esto pide a gritos? | **No entra aquí. Lo decide `QC-137`**, la ficha de notificaciones, que nace de esta acotación. Motivo escrito: Realtime por *Postgres Changes* con la anon key **no puede acotar por empresa** —`docs/architecture.md:372` dice que la RLS no filtra ninguna query de esta aplicación, y la sesión es la cookie de `identity`, no Supabase Auth—, así que la vía real es **Broadcast con canal privado y token firmado por nosotros**, con dependencia nueva (`@supabase/supabase-js`, hoy ausente **a propósito**, `docs/dependencias.md:32`) y enmienda a `docs/architecture.md` por `/afinar-regla`. Eso es arquitectura de todo el repo y no cabe en una ficha de pantalla. **Esta pantalla se engancha a ese canal después, en ficha corta.** `[D5]` |
| 2026-09-21 | Cuando un archivo termina bien, ¿qué se ve? | **Solo el estado. El texto extraído NO se pinta.** Sigue saliendo por consola como lo dejó QC-109, y **QC-131 lo lee de ahí** para firmar su revisión campo por campo. Se descartó mostrarlo desplegable, que habría hecho esa revisión más cómoda, a cambio de una pantalla más simple. Consecuencia anotada, no descubierta a mitad de camino. `[D3]` |
| 2026-09-21 | ¿Hace falta E2E? | **Sí, y aquí se paga la deuda de CUATRO fichas.** QC-106 `[D17]`, QC-108, QC-109 `[D14]` y QC-111 `[D18]` difirieron su E2E a ésta con el mismo motivo escrito: ninguna añadía pantalla que visitar. Ésta sí. **Acotado a lo navegable** —entrar, seleccionar varios PDFs, subirlos, ver las filas cambiar de estado— **con la cola y la IA simuladas**: se descartó el E2E de extremo a extremo con QStash y Gemini reales porque exigiría URL pública y cuentas vivas, y **el gate dejaría de correr sin red**, que es condición del repo. `[D4]` |
| 2026-09-21 | ¿El fin del procesamiento genera un aviso? | **Sí**, y es **encargo de `QC-137`**, no de esta ficha: que una tanda termine —o que un archivo falle— es uno de los eventos que notifican, con QC-107 citada allí como su primer consumidor real. `[D6]` |
| 2026-09-18 | ¿La estrategia se elige por tanda o por archivo? | **Heredado de QC-111 `[D3]`: por tanda.** Quien sube elige una vez y los hasta 10 PDFs van con ella. Es justo lo que la prop de esta ficha asume. No se reabre |
| 2026-09-16 | ¿Cuántos archivos por tanda? | **Heredado de QC-106: diez**, en su única definición, `MAX_FILES_PER_BATCH`. La pantalla lo **importa** del contrato del módulo; no vuelve a escribir el número |
| 2026-09-18 | ¿Qué estados puede tener un archivo? | **Heredado de QC-111**: `queued`, `processing`, `done`, `error`, ya tipados en `domain/batch-status.ts`, con `errorCode` del catálogo y `errorReason` de texto libre. La pantalla **no inventa** un estado más |
| 2026-09-18 | ¿Y si un archivo se queda colgado para siempre? | **Heredado de QC-111 `[D11]`: caduca solo a error por tiempo**, con el plazo en variable de entorno. **La pantalla no implementa ningún plazo propio** y no tiene que decidir cuándo rendirse |
| 2026-09-16 | ¿Los bytes del PDF pasan por el servidor? | **Heredado de QC-106: no.** El navegador sube directo al almacenamiento con un enlace firmado. El componente **no envía el archivo a ninguna Server Action** |
| 2026-09-16 | ¿Dónde se comprueba el permiso? | **Heredado de QC-106 y QC-111: en la primera línea del caso de uso**, nunca en la pantalla ni en la Server Action, que sería una segunda definición de la autorización (`docs/architecture.md > Acceso a datos y autorizacion`). La pantalla **muestra** el resultado, no autoriza |
| 2026-09-12 | ¿Cómo se decide qué mensaje se muestra ante un error? | **Heredado de QC-70: por el `code` del error, jamás por el texto del mensaje.** El mensaje puede cambiar de idioma sin romper a quien lo pinta |
