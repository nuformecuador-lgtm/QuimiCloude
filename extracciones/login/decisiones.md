# Decisiones — flujo de autenticacion (`login`)

Fuente: `extracciones/login/inventario.md`, cerrado sobre `dev` en
`667b04ec97eff9100546565714af60be3ede1db8` (2026-09-13). Cada fila lleva su evidencia; sin la
**alternativa concreta y su consecuencia**, una fila no vale.

---

## Decisiones que este modulo tomo

**Cuatro.** El codigo eligio, existe otra alternativa razonable, y **nadie escribio por que**.
No heredes la eleccion por inercia: son tuyas.

| # | Eje | Pregunta (en lenguaje de negocio) | Lo que eligio este modulo | Alternativa concreta | Que cambia si eliges la otra | Evidencia |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 7 — politica de fallo | ¿Cuantos intentos fallidos hacen falta para dejar a alguien fuera, y cuanto rato? ¿Es un numero que se puede ajustar sin tocar el programa? | **Numeros fijos en el codigo**: 5 fallos, y esperas de 1, 5, 15 y 60 minutos. No hay forma de cambiarlos sin desplegar | Politica **configurable**: por entorno, o por organizacion cliente | Con la actual, endurecer o aflojar la severidad es un despliegue, y todos los clientes comparten la misma regla. Con la alternativa, ganas ajuste fino pero **aparece una fuente de verdad mas** que puede diverger entre entornos —y una regla de seguridad que difiere entre produccion y desarrollo es una que nadie prueba de verdad—. Nota: para la **duracion de la sesion** si esta escrito por que no va por entorno («no cambia entre entornos, es una decision de producto»); para el bloqueo, nadie lo escribio | `account-lock.ts:7`, `:16`; contraste con `session.ts:8-11` |
| 2 | 9 — contrato | ¿Hay un maximo de longitud para lo que la persona escribe en cada campo? | **Asimetrico**: la contrasena tiene tope (64 caracteres) y **el nombre de usuario no tiene ninguno** — solo «no vacio» | Poner tope tambien al identificador. El propio producto ya tiene una constante de longitud maxima de nombre de usuario, usada en el alta administrada, que el login **no** usa | Con la actual, un envio con megabytes en ese campo recorre toda la validacion y llega hasta la consulta a la base antes de no encontrar nada: trabajo regalado en la ruta mas caliente del sistema, y una asimetria que no protege de nada. Con la alternativa, el corte es en el borde y barato — pero **cuidado**: el tope del login y el tope del alta tienen que ser el mismo numero, o crearas cuentas que despues no pueden entrar | `credentials.ts:21` frente a `:23`; `index.ts:104` (la constante existe y el login no la importa) |
| 3 | 11 — invariantes | Cuando muchos intentos caen a la vez sobre la misma cuenta, el sistema reintenta anotar el fallo hasta 10 veces. ¿Que hace si esas 10 no bastan? | **Se rinde en silencio**: no anota nada, no avisa a nadie y el intento se rechaza igual, con el mismo mensaje de siempre | Propagar un error, o reintentar sin tope | Con la actual, bajo contencion extrema **un fallo puede no contarse** y el bloqueo llega mas tarde de lo que la politica promete; nadie se entera porque no queda rastro. Con la alternativa de propagar el error, la persona veria un fallo **distinto del generico** — y eso **reabre el oraculo** que toda la §6 del prompt viene a cerrar: un mensaje distinto solo aparece en cuentas que existen. Con reintento sin tope, cambias una anotacion perdida por una peticion que no termina. **Recomendacion honesta: si te rindes, al menos deja rastro** (y ahi engancha con el requisito nuevo E24) | `verify-credentials.ts:54-61` (justifica el **numero** 10, no el desenlace), `:118`, `:151-152` |
| 4 | 15 — librerias | ¿Cuanto esfuerzo de calculo se gasta en comprobar una contrasena? | **bcrypt con coste 10** (~110 ms por verificacion). Ese numero no es un detalle: es el que sostiene la uniformidad de tiempos y el que define la ventana de carrera entre leer y escribir el contador | Coste mayor (12), o un algoritmo con parametros de memoria (argon2id, scrypt) | Con la actual, cada intento cuesta ~110 ms y la ventana de carrera es esa. Subir el coste **endurece el hash frente a quien robe la base**, pero alarga la ventana del compare-and-set, multiplica el tiempo de respuesta de la pantalla de acceso y **encarece a quien te ataca y a tus usuarios por igual**. Cambiar de algoritmo obliga ademas a una estrategia de rehash progresivo para las credenciales ya guardadas. **`No verificado`: la justificacion del 10 puede estar en `specs/QC-5…/design.md > 3`, que quedo fuera de la frontera de esta extraccion y no se leyo.** Trata esta fila como «decide tu», no como «aqui nadie penso» | `password-hash.ts:8` |

---

## Decisiones que estaban abiertas y el humano ya cerro

**Dos.** Eran huecos del inventario; se preguntaron el 2026-09-13 y **tienen respuesta**. Van
aqui con su porque, no como preguntas.

| # | Eje | La pregunta que se hizo | Lo decidido | Alternativa que se descarto | Por que, y que significa para tu port |
| --- | --- | --- | --- | --- | --- |
| 5 | 13 (roza el 7) — rastro de los accesos | Hoy no queda ninguna historia de quien entro ni de quien fallo al entrar: solo tres contadores sobre la ficha de la persona, que se sobrescriben, y ningun mensaje de salida en todo el camino. ¿Debe quedar rastro consultable? | **SI: aciertos Y fallos.** Quien entro, cuando y desde donde; y lo mismo cuando el intento falla | Seguir solo con los contadores que se sobrescriben | **Es lo que permite responder «¿alguien entro a mi cuenta?» y detectar a alguien probando contrasenas; los contadores que se sobrescriben no sirven para ninguna de las dos.** Ojo al matiz, que importa: **el modulo original NO lo hace**. Entra a `prompt.md` como requisito **E24** del nucleo invariante, marcado como capacidad que el port debe tener y el original no. En el repo de origen seria ficha aparte y no se implementa desde esta extraccion. En tu port, hazlo desde el principio —anadir historico despues es una migracion— y respetando E13: el rastro guarda identificadores y contexto, **jamas** la contrasena, el hash ni el valor de sesion | `inventario.md > Respuestas del humano`, eje 13; hueco original en `specs/QC-7…/requirements.md:168-172` |
| 6 | 5 — estado de la sesion | Las sesiones se firman con un unico secreto. Si hay que cambiarlo —por rotacion o porque se filtro—, eso echa fuera a todo el mundo en el acto. ¿Es aceptable? | **SI: que caigan todas.** Un solo secreto; cambiarlo invalida todas las sesiones vivas y cada quien vuelve a entrar | Ventana de convivencia entre secreto nuevo y anterior, verificando contra los dos durante una temporada | **Si el motivo del cambio es una filtracion, echar a todos es la funcion y no el daño** — y la convivencia de dos secretos es precisamente lo que no sirve para ese caso. La alternativa solo compra comodidad en la rotacion programada, y a cambio deja dos caminos de verificacion vivos. Encaja ademas con una decision que el modulo ya tenia tomada y justificada: al subir la version del formato del valor, **todas las sesiones vivas caen**, y eso se acepto por escrito tres veces. En tu port: **un secreto, fallo cerrado si falta o es corto, y asume el corte** | `inventario.md > Respuestas del humano`, eje 5; hueco original en `specs/QC-7…/requirements.md:178-181` |

---

## Decisiones cerradas y justificadas — **no las reabras**

Estas **si** tienen el porque escrito en el repositorio de origen. Van resumidas para que sepas
que no son candidatas a cuestionario: el detalle completo, con las 43 filas y su cita exacta,
esta en `inventario.md > Decisiones resueltas y su porque`, y el argumento en prosa esta en las
secciones 5, 6 y 7 de `prompt.md`.

| Bloque | Lo cerrado, y donde esta su argumento |
| --- | --- |
| **Entrada** | Se entra con nombre de usuario, no con correo (decision de producto, D1). El usuario se normaliza; la contrasena no se toca ni se recorta, porque un espacio inicial o final **es parte de la credencial** |
| **Respuesta al fallo** | Una sola instancia congelada de rechazo para los seis caminos; el bloqueo **sin mensaje propio** (solo una cuenta que existe puede estar bloqueada); los errores de **forma del formulario** si son especificos por campo; «demasiado larga» se distingue de «obligatorio» |
| **Tiempo** | Señuelo producido con el hasher del sistema, cacheado y calentado; cortes por estado y por organizacion **despues** de la verificacion de hash; el camino bloqueado verifica igual; diferencia residual de la escritura **declarada** en vez de fingida |
| **Bloqueo** | 5 fallos con escalada 1/5/15/60 y tope, nunca permanente (no hay pantalla de administracion); el nivel **no decae** (alternativa evaluada y descartada); un exito reinicia contador **y** nivel; un fallo durante el bloqueo no lo alarga; **por cuenta y no por IP**, con el riesgo de denegacion de servicio a un usuario conocido **asumido por escrito** |
| **Sesion** | Token firmado sin estado (la tabla de sesiones se descarto con tres motivos); 8 h absolutas sin renovacion ni «recordarme», y **no** por variable de entorno; caducidad **dentro y firmada**; solo identificadores en el contenido; atributos de la cookie con un porque por atributo; **sin compatibilidad hacia atras** entre versiones del formato; **una sola implementacion de la firma** en todo el repositorio; libreria de JWT descartada con argumento (el manejo del campo de algoritmo es «precisamente la parte con historial de vulnerabilidades»); criptografia elegida por compatibilidad con el runtime del borde; secreto leido **en la llamada**, fallo cerrado |
| **Estructura** | La sesion se emite **dentro** del caso de uso y no desde el adaptador de entrada; verificar y **luego** emitir; un solo reloj por invocacion; sin fuentes de azar en el dominio; compare-and-set con relectura y recalculo, **por rango** y con el estado de cuenta en el predicado; los cortes de acceso en el dominio y no en la consulta; los puertos devuelven valores crudos; una sola funcion traduce el estado efectivo; `null` = «no toques la columna ni su rastro» |
| **Datos** | Estado **actual**, no historico (y por eso el requisito E24 es nuevo); consulta cruda parametrizada para no perder el **indice funcional parcial**; borrado logico |
| **Verificacion** | Copys provisionales en constantes, tests que afirman sobre la constante y nunca sobre el literal; camino feliz demostrable **sin datos sembrados**; E2E con navegador real en dos motores |

---

## Preguntas abiertas

**Ninguna.** Los dos huecos del inventario los cerro el humano el 2026-09-13 y estan arriba con
su respuesta. La unica incertidumbre que queda declarada es la marca `No verificado` de la fila
**4** (el porque del coste de hashing podria vivir en un spec que quedo fuera de la frontera).

Dos hallazgos del inventario que **no son decisiones** y por eso no tienen fila aqui: son
**deuda del modulo original**, anotadas por el leader en `progress/current.md` y mencionadas en
`prompt.md > 2` como ausencias de tipo *deuda* — la columna «debe cambiar su credencial» que el
esquema dice que el login lee y **nadie lee**, y el centinela de una cuenta sin credencial que se
rechaza **antes** de llegar al hashing, en microsegundos.
