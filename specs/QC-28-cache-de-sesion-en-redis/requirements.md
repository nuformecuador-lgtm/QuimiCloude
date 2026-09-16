# QC-28 — cache-de-sesion-en-redis · requirements.md

> **Zona** `backend` · **Complejidad** `high` · **depends_on** QC-8 (hecha), QC-23 (hecha),
> **QC-104 (pendiente)** · **Rama** `feature/QC-28-cache-de-sesion-en-redis`
>
> ## ⚠ CONDICIONADA A UNA MEDICION — NO ARRANCA TODAVIA
>
> **Decision humana del 2026-09-13, tomada DESPUES de cerrar la tabla de abajo.** Esta ficha no
> pasa a `spec_author` hasta que **QC-104** cierre y **haya un numero** que diga que la ruta
> caliente sigue doliendo. Lo de abajo sigue siendo valido y **no se reabre**: es lo que entra
> **si** la medicion lo pide. El porque, en las decisiones 10 a 12.
>
> **Alcance (condicionado).** Guardar en memoria rápida (Redis, servido por **Upstash**) el resultado de
> **resolver la sesión**, que hoy consulta la base en **cada** petición privada. El dato caduca al
> **minuto** y se borra **en el acto** ante cualquier cambio de quién eres o qué puedes. Si Redis no
> responde, se consulta la base: más lento, correcto, y **nunca** deja a nadie fuera ni deja entrar
> a nadie por un fallo de la caché. Se apaga con **una variable de entorno**.
>
> **Lo que NO entra.** Cachear datos de negocio —pedidos, inventario, recetas—. **Ninguna
> credencial** se guarda en la caché.
>
> *Sembrado por `/afinar-feature` el 2026-09-13. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`.*

## Requisitos (EARS)

_Pendiente: los escribe `spec_author` (F1.2)._

## Preguntas abiertas

Ninguna.

**Nota para `design.md`, que NO es decisión de acotación:** la **forma de la clave** decide si «dar
de baja borra en el acto» es barato o caro. Si la entrada se indexa por **sesión**, borrar todas las
de un usuario exige además un índice por **usuario**. Lo resuelve el diseño, no esta acotación.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
| --- | --- | --- |
| 2026-09-13 | ¿Qué tiene que borrar la caché? | **Todo lo que cambia quién eres o qué puedes**: dar de baja, cambiar el rol, cambiar el **estado de la cuenta**, cambiar la **contraseña**, **revocar una sesión** y **cerrar todas las sesiones**. **Las dos últimas se añadieron al acotar**: la ficha se escribió **antes de QC-23**, que es quien trajo la revocación, y sin ellas **QC-28 debilitaría una garantía que QC-23 acaba de construir** —echar a alguien tardaría hasta un minuto—. El TTL de un minuto es **la red de seguridad, no el mecanismo** |
| 2026-09-13 | ¿Qué se guarda exactamente? | **La resolución entera de la sesión**, de la que ya salen las **dos** proyecciones —quién eres y de qué empresa eres—. Cachear solo una dejaría la otra yendo a la base en cada petición y el ahorro se perdería: **las dos nacen de la misma consulta** |
| 2026-09-13 | El gate corre **sin red**. ¿Cómo se prueba y cómo se trabaja en local? | **La caché entra por un PUERTO**, con **adaptador en memoria** en tests y en local, y el de Upstash cableado **solo donde hay credenciales**. Así se prueban de verdad la **caducidad**, el **borrado** y el **camino de respaldo**, sin red y sin cuenta. Sin esto, el único sitio donde ese código correría es producción |
| 2026-09-13 | ¿Dependencia nueva? | **`@upstash/redis`, APROBADA por el humano el 2026-09-13** (regla 7 de `CLAUDE.md`). **Los cuatro checks PASAN**, verificados ese día contra el registro de npm: **sin `deprecated`**; última release **`1.38.4` del 2026-09-04**; **3.811.925** descargas semanales; licencia **MIT**. Es el cliente **REST**, que **no mantiene conexiones TCP abiertas** —lo que rompe a los clientes Redis clásicos en funciones serverless—. **Aislada en un solo adaptador.** Su fila en `docs/dependencias.md` la escribe el leader **al aprobar el spec (F1.4)**, como se hizo con QC-25 y QC-55 |
| 2026-09-13 | ¿Hace falta E2E? | **Sí, y uno solo**: dar de baja a alguien **con la sesión abierta** y comprobar que en su **SIGUIENTE clic** ya está fuera, **con la caché activa**. `CHECKPOINTS.md` pide E2E para autenticación y permisos, y esta ficha se mete justo entre los dos. Lo demás —caducidad, invalidación y respaldo— se cubre con **integración** contra el adaptador en memoria |
| 2026-09-13 | ¿Cómo se apaga si se porta mal en producción? | **Con una variable de entorno**, que devuelve al **mismo camino de respaldo que ya existe** para cuando Redis no responde. Apagar una capa metida en la autenticación **no debe exigir un despliegue de código**, y el camino de vuelta ya está construido y probado |
| 2026-09-13 | ¿La premisa sigue viva? | **Sí, verificado en disco**: `resolveSession()` lee los claims de la cookie **y consulta la base** (`findActiveSessionUserById`, vía `lib/composition/index.ts:296`) en **cada** petición. **A diferencia de QC-23, QC-81 y QC-102, esta ficha NO estaba derogada**, y por eso se especifica en vez de reescribirse |
| 2026-09-13 | ¿Por qué sigue siendo `backend` si trae un E2E? | Porque **el E2E es un test, no una pantalla**: esta ficha no toca `app/` ni `components/`. `zone` se queda en **`backend`** y `complexity` en **`high`** —se mete en la autenticación, estrena servicio externo y su invalidación cruza seis caminos de cambio distintos— |
| 2026-09-13 | Lo que se hereda y no se decide otra vez | **Puerto + adaptador driven** cableado en `lib/composition`, el patrón de todo lo externo del repo; identificadores en **inglés**; y de la propia ficha, ya fijado por el humano el 2026-09-02: **TTL de un minuto**, **respaldo a la base** si Redis no responde, **nunca** dejar fuera ni dejar entrar por un fallo de la caché, y **ninguna credencial** guardada |
| 2026-09-13 | **¿Esta justificado Redis?** (preguntado por el humano DESPUES de cerrar las nueve de arriba) | **Sin medicion, no.** La ficha **daba por hecha la conclusion** sin un solo dato: no hay ni un numero en la tarjeta ni en el repo, y la app **no tiene carga real**. Ademas el cliente REST de Upstash **es tambien una llamada de red** desde la funcion: no se cambia red por memoria, se cambia **Postgres-por-red por Redis-por-HTTP**, y que eso gane depende de las regiones y de que Postgres sea de verdad el cuello de botella. **Ninguna de las dos cosas esta medida.** Lo que Redis **si** trae seguro: servicio externo, dependencia, **un modo de fallo nuevo dentro de la autenticacion**, seis caminos de invalidacion y un E2E |
| 2026-09-13 | El diagnostico de la ficha, **medido en disco** | **Se quedaba corto, y el hallazgo justifica otra ficha.** La sesion no se resuelve una vez por peticion: se resuelve **DOS O TRES VECES POR PAGINA** —`app/(private)/layout.tsx:59` para pintar el pie, el `requirePagePermission` de cada `page.tsx` **otra vez**, y una **tercera** en `/configuracion/usuarios`— y **no existe ninguna memoizacion** (se busco `cache()` y no hay). Cada resolucion trae `users` + `role` + **su lista de permisos** + `company` + `revoked_sessions` |
| 2026-09-13 | Entonces, ¿que va primero? | **QC-104** (`sesion-una-sola-vez-por-peticion`), creada ese dia y enlazada «blocks» hacia esta: colapsar esas repeticiones **dentro de la misma peticion**. No necesita servicio, ni dependencia, ni anade riesgo en la autenticacion, y **no puede quedarse obsoleto por construccion** —vive solo mientras dura la peticion—, asi que la garantia de «dar de baja surte efecto en el siguiente clic» **ni se toca**. Y **deja la medicion que esta ficha no tiene**. La aprobacion de `@upstash/redis` **queda EN SUSPENSO** mientras tanto: **no se instala nada**, y sus cuatro checks **se vuelven a verificar en F1.4**, porque para entonces estaran caducados |
