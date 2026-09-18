# QC-73 — limite-de-peticiones-por-origen · requirements.md

> **Zona:** fullstack · **Complejidad:** high · **depends_on:** QC-71 (done) · **Rama:** `feature/QC-73-limite-de-peticiones-por-origen`
>
> **Alcance.** Un límite de peticiones **por origen (IP)**, aplicado en el adaptador del middleware
> sobre **todas** las peticiones que entran por el `matcher`: navegación, login y Server Actions.
> El contador vive en **Upstash Redis**, detrás de un puerto. Al frenar, la persona ve en pantalla el
> mensaje neutro «Demasiados intentos. Prueba de nuevo más tarde», sin decir cuánto falta. Si
> Upstash no responde, se deja pasar y queda un aviso en el log.
>
> **Lo que NO entra.** Tocar el bloqueo de cuenta de `identity` (`account-lock.ts`): son capas
> complementarias. Ningún cambio en `db/`. Ninguna pantalla para ver, ajustar o levantar límites.
> Migrar `middleware.ts` a `proxy.ts` (Next 16 lo declara obsoleto): sin ficha, y no se hace de
> paso. La caché de sesión en Redis, que es QC-28.
>
> Sembrado por `/afinar-feature` el 2026-09-18. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

_Pendiente: los escribe spec_author (F1.2)._

## Preguntas abiertas

1. **La cuenta de Upstash: quién la da de alta y cuándo.** Hoy no existe, ni tampoco
   `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`. Queda sin decidir qué hace
   **producción sin credenciales**: ¿se trata como «Upstash no responde» (dejar pasar y avisar) o
   el despliegue debe fallar? El contador en memoria **no** sirve en producción: cada instancia de
   Vercel llevaría su propia cuenta.
2. **El techo real del plan gratuito.** 500.000 comandos/mes y 256 MB no se pudieron confirmar en
   la fuente. Se verifica al dar de alta la cuenta; si el consumo medido se acerca al techo, se
   decide entre pasar a pago o dejar de contar la navegación.
3. **De qué cabecera sale el origen y cuándo se confía en ella.** Next 16 ya no expone
   `request.ip`. En Vercel, `x-forwarded-for` la pone la plataforma; en local y en otros
   despliegues la puede falsear el cliente. Lo cierra el `design.md`.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-09-18 | ¿Qué peticiones cuentan? | **Todas** las que entran por el `matcher`: navegación, login y Server Actions. El humano lo eligió frente a «solo login y guardados», sabiendo que suma un viaje a Upstash por navegación y acerca el techo del plan gratuito. |
| 2026-09-18 | ¿Qué pasa si Upstash no responde? | **Se deja pasar y se registra un aviso en el log.** Un fallo de un tercero no para el ERP, y el login sigue protegido por el bloqueo de cuenta de 5 fallos. La espera a Upstash tiene tiempo máximo, para que un Upstash lento no bloquee como si estuviera caído. |
| 2026-09-18 | ¿Qué cuotas? | **Holgadas, pensando en una oficina entera detrás de una sola IP**, y **ajustables por variable de entorno sin desplegar código**. Los valores por defecto los propone el `design.md`; como orden de magnitud, unos 30 intentos de login cada 10 minutos y cientos de peticiones por minuto. El login lleva una cuota más dura que el resto. |
| 2026-09-18 | ¿Cómo se ve el freno? | **Mensaje neutro en pantalla**: «Demasiados intentos. Prueba de nuevo más tarde», **sin cronómetro** (criterio de QC-7). En una Server Action se muestra en el formulario donde estaba la persona; en una navegación, en una pantalla. Por eso la zona se queda en **fullstack**. |
| 2026-09-18 | ¿Plan de Upstash? | **Gratuito**, con la **caché en memoria de la librería para los orígenes ya bloqueados**, que ahorra comandos. La cifra del techo sigue abierta (pregunta 2). |
| 2026-09-18 | ¿La latencia añadida bloquea? | **Se mide y se anota en el PR, sin umbral que bloquee.** Hoy no hay ninguna referencia contra la que comparar. |
| 2026-09-18 | ¿Dependencia nueva? | **`@upstash/ratelimit` y `@upstash/redis`, APROBADAS por el humano, sujetas a repetir los cuatro checks de salud en F1.4** (los del 2026-09-07 están caducados). El leader escribe las dos filas de `docs/dependencias.md` al aprobar el spec. **Esto saca de suspenso `@upstash/redis`** solo para esta ficha: QC-28 sigue con su propia condición. |
| 2026-09-18 | ¿Hace falta E2E? | **Sí, uno sobre el login**: superar la cuota de login desde el mismo origen y comprobar el mensaje neutro, **contra el contador en memoria**. `CHECKPOINTS.md` lo exige para autenticación. El resto se cubre con tests unitarios y de integración. |
| 2026-09-18 | Lo que se hereda y no se decide otra vez | **El contador entra por un puerto**, con **adaptador en memoria** para tests y desarrollo local, y el de Upstash cableado solo donde hay credenciales (**QC-28**). Se cablea por **`lib/composition/edge.ts`** y se engancha en **`route-guard-middleware.ts`**, no en `middleware.ts`, que sigue siendo un cascarón (**QC-71 / QC-9 R20**). `guard-middleware-edge` **no se relaja**. Identificadores en inglés (**feature 4**). |
