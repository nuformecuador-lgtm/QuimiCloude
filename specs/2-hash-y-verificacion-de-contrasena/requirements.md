# requirements.md — Feature 2: hash-y-verificacion-de-contrasena

> Zona: `backend` · Complexity: `low` · SDD: si · Branch: `feature/2-hash-y-verificacion-de-contrasena` · `depends_on: 1`

## Alcance

Dos operaciones puras sobre una contrasena:

1. **Transformar** una contrasena en un valor almacenable del que no se pueda recuperar la
   contrasena original.
2. **Verificar** si una contrasena escrita corresponde a un valor almacenado.

Y una garantia: **dos usuarios con la misma contrasena no comparten valor almacenado.**

**Fuera de alcance** (tienen ficha propia, no se especifican aqui): el seed de roles y usuario
inicial (feature 3), el login (feature 4), la sesion y la cookie (features 4-5), cualquier UI,
y el alta de usuarios. Esta feature **no** expone rutas, ni Server Actions, ni repositorios, ni
servicios de negocio, ni toca la base de datos.

**Precondicion heredada de la feature 1** (ya en `dev`, no se rehace): la tabla `users` existe
con la columna `password_hash text NOT NULL`, sin longitud declarada, sin columna de sal y sin
columna de algoritmo (`specs/1-modelo-usuarios-y-roles/design.md > 6`).

Notacion: EARS (`docs/specs.md`). "El sistema" = el modulo de contrasena de QuimiCloude (las
dos funciones y el formato del valor que producen).

---

## Requisitos

### Transformacion

**R1.** El sistema DEBE transformar una contrasena en un unico valor de texto almacenable, y
ese valor NO DEBE contener la contrasena ni ninguna codificacion reversible de ella.

**R2.** CUANDO se transforma dos veces la misma contrasena, el sistema DEBE producir dos
valores distintos, y DEBEN diferir tanto la parte de sal como la parte derivada de ambos
valores.

**R3.** El sistema DEBE generar, para cada transformacion, una sal nueva de al menos 16 bytes
obtenida de una fuente aleatoria criptografica.

**R4.** El sistema DEBE tener en cuenta la contrasena completa sin truncarla: SI dos
contrasenas coinciden en sus primeros 72 bytes y difieren a partir de ahi, ENTONCES la
verificacion cruzada de una contra el valor almacenado de la otra DEBE responder que no
coincide.

**R5.** El sistema DEBE normalizar la contrasena a la forma Unicode NFC antes de transformarla
y antes de verificarla, de modo que dos representaciones Unicode canonicamente equivalentes de
la misma contrasena se traten como la misma contrasena.

### Verificacion

**R6.** CUANDO se verifica una contrasena que corresponde al valor almacenado, el sistema DEBE
responder que coincide.

**R7.** CUANDO se verifica una contrasena que no corresponde al valor almacenado, el sistema
DEBE responder que no coincide, cualquiera sea la posicion en la que las contrasenas difieran
y cualquiera sea la diferencia de longitud entre ellas.

**R8.** El sistema DEBE comparar el valor derivado en tiempo constante respecto de su
contenido, sin terminar la comparacion antes por haber encontrado la primera diferencia.

**R9.** El sistema DEBE poder verificar un valor almacenado sin recibir ningun parametro,
configuracion externa, variable de entorno ni dato adicional mas alla de la contrasena y del
propio valor almacenado.

### Fallo cerrado

**R10.** SI el valor almacenado esta vacio, no tiene el formato esperado, declara un algoritmo
desconocido, contiene segmentos no decodificables o declara parametros de coste fuera del rango
admitido, ENTONCES el sistema DEBE responder que no coincide y NUNCA que coincide.

**R11.** SI el valor almacenado declara parametros de coste cuyo consumo de memoria supera el
limite admitido, ENTONCES el sistema DEBE responder que no coincide **sin llegar a reservar esa
memoria**.

### Formato y rotacion

**R12.** El valor almacenado DEBE incluir el identificador del algoritmo y sus parametros de
coste, de modo que el sistema pueda verificar valores generados con parametros distintos de los
vigentes.

**R13.** CUANDO los parametros de coste vigentes cambian, el sistema DEBE seguir respondiendo
que coincide para los valores generados con los parametros anteriores.

**R14.** El sistema DEBE usar por defecto parametros de coste cuyo consumo de memoria por
transformacion sea de al menos 64 MiB, y una transformacion con esos parametros por defecto
DEBE consumir al menos 50 ms.

**R15.** El sistema DEBE producir un valor almacenado de a lo sumo 256 caracteres ASCII
imprimibles, que quepa en la columna `password_hash` existente sin ningun cambio de esquema.

### Operacion y filtraciones

**R16.** MIENTRAS se ejecuta una transformacion o una verificacion, el sistema DEBE dejar el
hilo principal libre para atender otro trabajo.

**R17.** El sistema NO DEBE registrar por ningun canal de salida, ni incluir en mensajes de
error, la contrasena recibida ni el valor almacenado.

**R18.** El sistema NO DEBE ser alcanzable desde codigo que se ejecute en el runtime Edge.

---

## Decisiones cerradas por el humano (2026-08-06)

- **Pepper (secreto de aplicacion): NO se anade.** scrypt con sal por usuario y 64 MiB por
  intento se queda como esta. El razonamiento completo esta en `design.md > 8.1`. Era la
  pregunta abierta 5 de la primera version de esta spec; se deja anotada aqui para que el
  reviewer sepa que no es un supuesto del agente y para que no se reabra a ciegas.

## Preguntas abiertas

Ninguna bloquea la implementacion. Se listan en vez de rellenarse con supuestos (regla 6 de
`CLAUDE.md`).

1. **Politica de contrasena.** Longitud minima, complejidad, contrasena vacia, longitud maxima
   aceptada en el borde: no hay ningun dato en `docs/`, en la description ni en la spec de la
   feature 1. Esta feature **no impone politica**: trata la contrasena como una cadena opaca y
   transforma lo que reciba, incluida la cadena vacia. Si la politica existe, es validacion de
   borde (zod) en la feature que dé de alta usuarios o en el login, no aqui. **No bloquea.**

2. **Entorno de referencia para medir el coste (R14).** El repo no tiene CI ni ninguna maquina
   de referencia documentada, y el limite inferior de 50 ms se mide donde corra la suite. Si
   mas adelante hay CI en hardware distinto, hay que revisar que el limite siga siendo un piso
   y no un techo. **No bloquea.**

3. **Memoria y concurrencia de las funciones en Vercel.** No hay dato en `docs/` sobre el plan
   ni sobre la memoria configurada de las funciones. Con los parametros por defecto cada
   verificacion reserva ~64 MiB, asi que el numero de logins concurrentes por instancia esta
   acotado por esa cifra. Si la memoria configurada resultara ser baja, la salida es bajar al
   conjunto equivalente inmediato (ver `design.md > 3.3`), no cambiar de algoritmo.
   **No bloquea esta feature; hay que confirmarlo antes de la feature 4.**

4. **Rehash en el login (rotacion efectiva).** El formato de esta feature permite detectar que
   un valor almacenado usa parametros viejos, pero **regenerarlo al iniciar sesion es una
   escritura**, y escribir en `users` esta fuera del alcance de esta feature. ¿Quiere el humano
   que la feature 4 rehashee al vuelo, o que la rotacion sea un script puntual? **No bloquea:**
   el formato soporta las dos.

5. ~~**Pepper (secreto de aplicacion).**~~ **CERRADA el 2026-08-06: no se anade.** Ver
   `design.md > 8.1`.
