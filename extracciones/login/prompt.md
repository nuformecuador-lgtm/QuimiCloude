# Reimplementar: flujo de autenticacion por usuario y contrasena (sin la pantalla)

Vas a construir el flujo que convierte «un nombre de usuario y una contrasena» en «una sesion
emitida y un aterrizaje», en **tu** stack. No es la pantalla de login: es todo lo que pasa
detras de ella. Esta escrito para una IA que reimplementa desde cero, no para quien mantiene
el original.

**Como usar esto.** Reimplementa en tu lenguaje, tu framework y tu base. No copies rutas, ni
copys, ni nombres de columna: la §10 dice que sustituir. Las decisiones de `decisiones.md`
son **tuyas**, no mias: el original eligio una cosa, y ahi tienes la alternativa y lo que
cambia si eliges la otra. Todo lo que aqui se afirma del original sale de un inventario con
evidencia citada; lo que no se pudo verificar va marcado como tal y no deberias tratarlo como
hecho.

Una advertencia de honestidad, por delante: **el original no registra los accesos**. La §8 te
pide que tu si lo hagas. Es el unico punto donde este prompt te pide mas de lo que el original
tiene, y va senalado en su sitio.

---

## 1. Proposito y actor

**Quien.** Una persona que ya tiene cuenta en un ERP interno. No hay autoregistro: las cuentas
las crea un administrador y nacen **pendientes**, sin credencial utilizable, hasta que su
dueño la estrena por un enlace de establecimiento. Ese alta es **otro** flujo.

**Que entrega.** Dos campos: nombre de usuario y contrasena. Nada mas — ni empresa, ni rol, ni
segundo factor.

**Que se lleva.** Si todo encaja: una sesion de **8 horas** emitida como cookie firmada e
inaccesible a scripts, y una redireccion a la pantalla que habia pedido (o, si no pidio
ninguna valida, a la primera que sus permisos le permiten ver).

**Camino feliz, en una frase.** Se normaliza el usuario, se lee su ficha de una sola consulta,
se verifica la contrasena contra el hash guardado, se comprueba que la cuenta esta
efectivamente activa y que su organizacion sigue viva, se limpian sus contadores de intentos y
se emite la sesion.

**Caminos alternos, todos con la misma cara hacia fuera** (§6): usuario que no existe,
contrasena incorrecta, cuenta bloqueada por intentos, cuenta pendiente o desactivada,
organizacion dada de baja, y entrada que no cumple el esquema.

---

## 2. Alcance y fronteras

### Lo que este flujo SI hace

Verificar credenciales · normalizar el identificador · contar fallos y bloquear temporalmente
la cuenta con escalada · traducir el estado almacenado de la cuenta a su estado efectivo ·
emitir la sesion · calcular el destino de aterrizaje · devolver un estado de formulario o
redirigir.

### Lo que NO hace, y de que tipo es cada ausencia

**Deliberado** — va en otra pieza, y esta escrito por que:

- **No lee la sesion en cada peticion, ni la cierra.** Emitir y leer son dos responsabilidades
  y aqui solo vive la primera. El cierre de sesion y la revocacion son otro modulo.
- **No protege rutas.** Quien intercepta la navegacion y decide si hay sesion valida es un
  interceptor del borde, aparte.
- **No autoriza.** Lo que viaja firmado (rol, organizacion) es una **foto del instante**, no
  una credencial de autorizacion. Quien decide si se puede *hacer* algo es el servicio de
  negocio, que relee de la base.
- **No recupera contrasenas.** Ni «he olvidado mi contrasena», ni desbloqueo manual por un
  administrador: el bloqueo **caduca solo** y nunca es permanente, precisamente porque no
  existia pantalla de administracion que lo levantara.
- **No limita por direccion IP.** Se ofrecio y se descarto (§6).
- **No registra los accesos.** Ver la §8: tu si tienes que hacerlo.

**Stub** — **ninguno**. No queda ni una costura enchufada a nada: los cinco puertos de la §4
tienen implementacion real. (El original si tuvo un stub que devolvia siempre «rechazado»;
esta feature fue la que lo sustituyo.)

**Deuda** — existe en el original y **no la heredes**:

1. El esquema de base declara una columna «debe cambiar su credencial» y afirma por escrito
   que **este** flujo la lee y bloquea el acceso. **Ningun archivo del flujo la lee**, ni el
   puerto la trae. Resultado: se puede marcar a alguien y esa persona entra igual, sin ser
   llevada a ninguna parte. *(`db/schema.prisma:185-188` frente a `user-credentials-reader.ts:37-50`.)*
2. Una cuenta sin credencial guarda un **centinela** (`'!'`) en la columna del hash. El
   verificador lo rechaza **por forma, antes de llamar al algoritmo de hashing**: responde en
   microsegundos. Es un agujero en la uniformidad de tiempos que la §6 promete, y **nadie lo
   anoto como riesgo aceptado** — a diferencia de la otra diferencia residual, que si esta
   documentada. Si adoptas el patron del centinela, hazlo pasar por el mismo coste que un hash
   real. *(`credential-setup-link.ts:43`, `password-hash.ts:14,35`.)*

---

## 3. Contrato publico

**Unica seccion con codigo literal.** Lo transcrito viene del original en TypeScript + Zod. Lo
**estructural** (que hay que conservar) va marcado; el resto es sintaxis del lenguaje.

```ts
// ESTRUCTURAL: el tope existe porque el algoritmo de hashing elegido (bcrypt) solo tiene en
// cuenta los primeros 72 BYTES. 64 caracteres dejan margen para acentos y emojis sin que
// ninguna entrada razonable se trunque en silencio.
export const CREDENTIAL_MAX_LENGTH = 64;

// ESTRUCTURAL: el usuario se recorta; la contrasena NO se toca ni se recorta, porque un
// espacio inicial o final es parte de la credencial.
export const loginInputSchema = z.object({
  username: z.string().trim().min(1),
  password: z.string().min(1).max(CREDENTIAL_MAX_LENGTH),
});
export type LoginInput = z.infer<typeof loginInputSchema>;
```

```ts
// ESTRUCTURAL, las cuatro propiedades:
//  1. union discriminada por estado;
//  2. NINGUN miembro tiene un campo de contrasena — el tipo es la garantia, no una promesa;
//  3. NO existe estado de exito: el exito sale por redireccion;
//  4. el identificador de intento esta en los dos estados de fallo y NO en el inicial: es lo
//     que permite al cliente distinguir «resultado nuevo» de «re-render del mismo resultado».
export type LoginFormState =
  | { status: 'idle' }
  | { status: 'invalid'; attemptId: string; username: string;
      fieldErrors: { username?: string; password?: string } }
  | { status: 'error'; attemptId: string; username: string; message: string };

export const LOGIN_INITIAL_STATE: LoginFormState = { status: 'idle' };
```

```ts
// ESTRUCTURAL: entrada = estado previo + datos del formulario; salida = estado nuevo O
// redireccion. La forma `(prevState, formData)` es del framework (§9); lo estructural es que
// el exito no devuelve estado.
export async function loginAction(
  prevState: LoginFormState,
  formData: FormData,
): Promise<LoginFormState>;
```

```ts
// ESTRUCTURAL, y es la pieza mas importante de todo el contrato: el caso de uso devuelve un
// BOOLEANO Y NADA MAS. Ni motivo, ni codigo, ni campo de diagnostico. Y devuelve SIEMPRE LA
// MISMA INSTANCIA CONGELADA en todos los rechazos.
(input: LoginInput) => Promise<{ ok: boolean }>
```

> **Por que la instancia es unica y congelada:** si cada camino construyera su propio objeto,
> cualquier dia uno de ellos se llevaria un campo de mas y el login pasaria a ser un oraculo.
> Congelado para que ningun consumidor pueda mutarlo.

---

## 4. Las cinco costuras

Todo lo que el caso de uso necesita del mundo entra por una interfaz. El caso de uso **no
conoce la base, ni el framework, ni el reloj del sistema, ni ninguna fuente de azar**. Un solo
lugar de la aplicacion ata cada interfaz a su implementacion; ningun otro archivo elige.

| Costura | Firma que debe respetar cualquier reemplazo | Por que existe |
| --- | --- | --- |
| **Lector de credenciales** | `findActiveByUsername(username) -> AuthenticatableUser \| null` | Trae **lo minimo**: identificador, hash guardado, estado de bloqueo (contador, nivel, plazo), nombre del rol, identificador de organizacion, marca de baja de la organizacion y estado **crudo** de la cuenta. Ni correo, ni documento, ni nombre, ni telefono: **lo que no sale de la base no se puede filtrar por error en un registro**. El filtro de «no borrado» es del puerto |
| **Hasher** | `hash(texto) -> string` · `verify(texto, hashGuardado) -> boolean` | Falla cerrado: un hash vacio, mal formado o corrupto devuelve `false` **sin lanzar** |
| **Registrador de intentos** | `compareAndSet(id, esperado, siguiente, ahora, estadoEsperado, estadoNuevo) -> boolean` · `set(id, estado, estadoNuevo) -> void` | **Dos** primitivas y no una: la del fallo es condicional (§7, invariante 5) y la del exito incondicional. `null` en el estado nuevo significa **«no toques esa columna ni su rastro»**, no «escribe null» |
| **Escritor de sesion** | `startSession(ticket) -> void` | El dominio decide **que** sesion se abre; el adaptador sabe **como** se transporta. **Puede lanzar** si el transporte no esta configurado |
| **Fabrica de identificador de sesion** | `newSessionId() -> string` | **No recibe nada, y eso es el requisito escrito en la firma**: sin parametros no hay nada de donde derivarlo, asi que dos sesiones de la misma persona en el mismo instante no pueden colisionar |

**Regla de oro de los puertos:** devuelven el valor **crudo**, nunca un booleano ya cocinado
del tipo «estaActiva». «Activa» es una regla de dominio que combina el estado almacenado con
el plazo de bloqueo; cocinarla del otro lado la saca del unico sitio donde se prueba con
objetos planos, y la deja escrita dos veces.

---

## 5. Estado y duracion de la sesion

- **Token firmado y sin estado**, no identificador opaco contra una tabla de sesiones. Se
  descarto la tabla por tres motivos escritos: coste por peticion (el interceptor valida en
  **cada** navegacion), alcance, y que lo que se pierde es acotado y reversible.
- **8 horas, caducidad absoluta desde la emision.** Sin renovacion deslizante y sin
  «recordarme»: es una jornada de trabajo de un ERP interno, y la caducidad absoluta es la
  unica que se puede razonar y testear sin ambiguedad. **No va por variable de entorno**: no
  cambia entre entornos, es una decision de producto.
- **El instante de caducidad viaja dentro y firmado**, no solo en el atributo de la cookie: ese
  atributo lo controla el navegador y un cliente hostil puede conservar la cookie mas alla de
  su caducidad. La caducidad que vale es la que verifica el servidor.
- **Contenido firmado: solo identificadores.** Sujeto, emision, caducidad, nombre del rol,
  identificador de organizacion e identificador de **esta** sesion. Ni nombre, ni correo, ni el
  nombre de la organizacion — este valor viaja en **cada peticion**, y ademas un nombre puede
  cambiar y una foto vieja mentiria durante las 8 h.
- **Cookie inaccesible a scripts**, con envio restringido entre sitios, alcance a toda la
  aplicacion, y transporte seguro obligatorio **solo en produccion** (en desarrollo sobre
  conexion sin cifrar el navegador no guardaria la cookie y el login local no funcionaria). Sin
  declarar dominio: declararlo ampliaria la sesion a todos los subdominios.
- **Version en el valor, y sin compatibilidad hacia atras.** Un valor de version anterior se
  rechaza **sin verificar su firma y sin interpretarlo**. Consecuencia aceptada por escrito, y
  aceptada tres veces: al desplegar un cambio de contenido, **todas las sesiones vivas caen** y
  quien estuviera dentro aparece en el login en su siguiente navegacion. La alternativa —campos
  opcionales en el contenido— obliga a decidir que hacer con una sesion incompleta en cada
  punto de uso, que es justo la puerta trasera que se venia a cerrar.
- **Firma en criptografia estandar del runtime**, con el algoritmo de autenticacion de mensajes
  de uso comun (HMAC-SHA-256) y **una sola implementacion en todo el repositorio**. Importa
  cual eliges: la API criptografica **del servidor** puede no existir en el runtime del borde
  donde corre el interceptor. Elige la que exista en los dos. La comparacion de firmas va en
  **tiempo constante**, sin cortar en la primera diferencia.
- **El secreto se lee en la llamada, no al cargar el modulo** (en el import romperia la
  compilacion en un entorno de despliegue sin variables, y haria intestable el fallo cerrado),
  con longitud minima exigida. Sin secreto valido no se emite cookie y **nadie queda
  autenticado**.

### Un solo secreto, y las sesiones caen al cambiarlo — decidido, con su porque

Hay **un** secreto de firma. Cambiarlo —por rotacion o porque se filtro— **invalida todas las
sesiones vivas en el acto** y cada quien vuelve a entrar. Se evaluo la ventana de convivencia
entre secreto nuevo y anterior, y **se descarto**, con este argumento: **si el motivo del
cambio es una filtracion, echar a todos es la funcion y no el daño** — y la convivencia de dos
secretos es precisamente lo que no sirve para ese caso.

No la reabras sin tener un motivo distinto de «es incomodo».

---

## 6. Politica de fallo hacia el usuario

Es la seccion mas larga a proposito: es donde un reimplementador causa mas daño sin enterarse.

### Un unico mensaje, indistinguible

**Los seis desenlaces de fallo devuelven exactamente lo mismo**: usuario inexistente,
contrasena incorrecta, cuenta bloqueada por intentos, cuenta pendiente, cuenta desactivada y
organizacion dada de baja. Mismo objeto, mismo mensaje, sin campo que diga por que.

- El error **no revela cual de los dos campos fallo**. Distinguirlos convierte el login en un
  enumerador de usuarios.
- **El bloqueo no tiene mensaje propio**, y este es el argumento que hay que entender antes de
  «mejorar la experiencia»: solo un usuario **que existe** puede estar bloqueado, asi que un
  «cuenta bloqueada» delataria que el nombre de usuario es real **y ademas** le confirmaria al
  atacante que su fuerza bruta esta surtiendo efecto.
- **El precio se asume por escrito**: una persona legitima que se bloquea a si misma ve
  «usuario o contrasena incorrectos» hasta 60 minutos sin saber por que. El canal correcto para
  avisarle es el correo **al dueño de la cuenta**, que no filtra nada a terceros — y eso es
  otra pieza.
- **Excepcion, y no contradice lo anterior:** los errores de **forma del formulario** (campo
  vacio, contrasena demasiado larga) **si** son especificos y por campo. No revelan nada sobre
  la existencia de nadie, y son datos que la persona necesita para corregir. Distinguir
  «demasiado larga» de «obligatorio» es deliberado: sin eso, una contrasena de 80 caracteres se
  anunciaria como «campo obligatorio».

### Tiempo: exactamente una verificacion de hash en los cuatro caminos

El contenido uniforme no sirve de nada si el reloj habla. Tres reglas:

1. **Usuario inexistente verifica igualmente contra un señuelo.** Un texto cualquiera hasheado
   **con el hasher del sistema** (no un literal copiado a mano: asi hereda su coste
   automaticamente y no se desfasa si el coste cambia), calculado **una sola vez por proceso**,
   cacheando la **promesa** y no el valor —dos intentos concurrentes reutilizan el mismo
   calculo— y **calentado al construir** para que ningun intento pague el hash del señuelo
   ademas de su verificacion.
2. **Los cortes por estado de cuenta y por organizacion van DESPUES de la verificacion de
   hash**, aunque ese camino no mire el resultado. Cortar antes responderia en microsegundos y
   el tiempo de respuesta delataria que la cuenta existe.
3. **El camino bloqueado tambien verifica el hash y tira el resultado**, por lo mismo.

**Diferencia residual declarada, no escondida:** los caminos que escriben (fallo con usuario
existente) pagan una escritura de mas. Es del orden del milisegundo frente a los ~110 ms del
hashing, o sea que no es un oraculo utilizable. Se anota como limite conocido en vez de fingir
que la uniformidad es perfecta. Haz tu lo mismo: mide y declara, no prometas.

### Bloqueo por cuenta, no por direccion IP

- **5 fallos consecutivos** bloquean la cuenta y reinician el contador.
- **Escalada 1, 5, 15 y 60 minutos** para los niveles 1 a 4; a partir del cuarto se repite 60
  min para siempre. **Nunca permanente**: sin pantalla de administracion, un bloqueo eterno
  deja a la persona fuera hasta tocar la base a mano.
- **El nivel no decae con el tiempo.** Alternativa considerada y descartada: una ventana de
  «buen comportamiento» exigiria una columna mas y una regla mas que testear, para acotar algo
  que ya esta acotado en 60 minutos.
- **Un exito reinicia contador Y nivel**: el dueño demostro su identidad, y mantenerle el nivel
  alto lo castigaria por un ataque que no es suyo.
- **Un fallo durante el bloqueo no lo alarga ni sube el nivel**: si no, cualquiera mantendria
  una cuenta bloqueada indefinidamente martilleandola.
- **Riesgo aceptado por escrito:** bloquear por cuenta permite dejar fuera a un usuario conocido
  durante hasta 60 minutos con 5 intentos. Se asume por ser un ERP de un solo inquilino, con
  usuarios conocidos y sin registro publico. **El limite por IP se ofrecio y se descarto**:
  detras de un proxy la IP del cliente llega por cabecera —falsificable si el borde no esta bien
  configurado—, con lo que daria una sensacion de proteccion que no es real. No se sustituyo por
  nada. **Si tu sistema es publico o multiinquilino, esta premisa no te sirve: reevaluala.**

### Caminos que NO escriben nada

Cuenta no activa y organizacion dada de baja **no registran el fallo**: ni contador, ni nivel,
ni plazo, ni rastro. Castigar a alguien bloqueandole la cuenta por una decision administrativa
que no puede arreglar seria injusto, y la cuenta no entra igual.

**La asimetria es deliberada, no un descuido**: el corte por estado va **antes** del «contrasena
incorrecta» y el de organizacion **despues**. Motivo del segundo: una contrasena mala sobre una
organizacion muerta tiene que seguir contando para el bloqueo, o dar de baja una organizacion
seria un modo de desactivar el contador de intentos. Contrapartida asumida a conciencia: quien
pruebe contrasenas contra una cuenta que no esta activa no se topa con ningun bloqueo — cuesta
poco, porque esa cuenta no entra con ninguna contrasena.

**Usuario inexistente tampoco escribe nada**: crear o actualizar una fila delataria por efecto
lateral que el usuario existe o no.

---

## 7. Invariantes que un reimplementador rompe sin darse cuenta

| # | Invariante | Si la rompes |
| --- | --- | --- |
| 1 | **Una sola instancia congelada de rechazo**, compartida por los seis caminos | Un dia un camino se lleva un campo de mas y el login es un oraculo |
| 2 | **Exactamente una verificacion de hash por intento**, en los cuatro caminos | El tiempo de respuesta distingue «no existe» de «existe pero no entra» |
| 3 | **Un solo reloj por invocacion**, pasado como parametro a todas las capas | Comparar el bloqueo con un instante y escribir el siguiente con otro deja ventanas de milisegundos imposibles de razonar |
| 4 | **El dominio no tiene fuentes de azar propias**: el identificador de sesion entra por puerto | No puedes afirmar en un test que dos logins seguidos producen identificadores distintos sin espiar globales |
| 5 | **El registro del fallo es un compare-and-set con relectura y recalculo**, no una escritura incondicional | Entre la lectura y la escritura hay ~110 ms de hashing: N intentos en paralelo leen el mismo contador y escriben el mismo valor. **El bloqueo no se dispara jamas justo frente al unico atacante que importa**, el que lanza los intentos en paralelo |
| 6 | **El predicado del compare-and-set compara el plazo por RANGO** (nulo o ya vencido), no por igualdad con el plazo leido, **y exige tambien el estado de cuenta leido** | Es un ABA de manual: el par (contador, nivel) no identifica la fila —el mismo par existe con un bloqueo vivo y con uno caducado—, asi que un intento que llega tarde con estado obsoleto **borraria un bloqueo vigente**. Y por igualdad de fechas: la precision de la base (microsegundos) y la del lenguaje (milisegundos) no casan, asi que un dia el compare-and-set deja de aplicar en silencio y **nunca vuelve a contar nada** |
| 7 | **La escalada la decide siempre el dominio**, tambien tras perder la carrera: se relee y se **recalcula la politica** sobre el estado fresco | La politica acaba repartida entre dominio y adaptador, y deja de poderse probar con objetos planos |
| 8 | **El bucle de reintento no vuelve a llamar al hasher** | Se rompe la invariante 2 por la puerta de atras |
| 9 | **Verificar y LUEGO emitir.** Si la emision lanza, la excepcion se propaga | Alguien queda «autenticado» sin sesion, y redirigido a una zona privada que lo va a echar |
| 10 | **El rol y la organizacion salen de la BASE, en la misma consulta que autentica, y jamas de la entrada** | Un rol por defecto es un rol inventado, y una entrada del cliente que elige rol es una escalada de privilegios servida |
| 11 | **El identificador de sesion es nuevo en cada emision y no se deriva de nada** | Dos sesiones de la misma persona no se pueden cerrar por separado |
| 12 | **«No hay cambio de estado» significa no incluir la columna en la escritura**, no escribir el mismo valor | La marca de «ultimo cambio real» pasa a significar «ultimo intento de login» y pierde su unico proposito |
| 13 | **La traduccion de «lo que dice la columna» a «lo que significa ahora» vive en UNA funcion**, y el orden de sus ramas esta fijado | Cada lector compara por su cuenta y dos de ellos discrepan sobre si una cuenta entra |
| 14 | **Los cortes de acceso viven en el dominio, no en la clausula de filtrado de la consulta** | Ese camino deja de pagar su verificacion de hash (invariante 2) y la regla solo se puede afirmar contra una base real, nunca con objetos planos |
| 15 | **El estado del formulario no tiene ningun campo de contrasena**, y eso lo garantiza el tipo | Un dia alguien «conserva lo que el usuario escribio» y la contrasena viaja al navegador en el estado |

---

## 8. El nucleo invariante, en EARS

Renumerados `E1..E24`, despegados del stack. Entre parentesis, el requisito original que los
origina, para trazar.

**Verificacion**

- **E1** *(R1)*. CUANDO se solicita autenticar unas credenciales, el sistema DEBE aceptarlas si
  y solo si existe una cuenta **no borrada** cuyo identificador coincide con el recibido y cuya
  contrasena corresponde al hash almacenado.
- **E2** *(R2, R3, R5, R28)*. SI la autenticacion no procede por cualquier motivo —identificador
  inexistente, contrasena incorrecta, cuenta borrada, cuenta bloqueada, cuenta no activa u
  organizacion dada de baja—, ENTONCES el sistema DEBE rechazarla devolviendo **el mismo
  resultado y el mismo mensaje**, indistinguible para quien lo consume.
- **E3** *(R4)*. El sistema DEBE comparar el identificador **sin distinguir mayusculas** y sin
  espacios al inicio o al final, y la contrasena de forma **exacta**.
- **E4** *(R6, R29)*. CUANDO un intento se rechaza por identificador inexistente o por estado de
  la cuenta, el sistema DEBE ejecutar igualmente **una** verificacion de contrasena, de modo que
  el numero de verificaciones sea el mismo que en un intento correcto.
- **E5** *(R7)*. El hash señuelo DEBE producirse con el **mismo mecanismo y coste** que los de
  produccion, de forma que su verificacion no sea sistematicamente mas rapida ni mas lenta.
- **E6** *(R8)*. SI la entrada no cumple el esquema de credenciales, ENTONCES el sistema DEBE
  rechazarla **sin** consultar la base, sin verificar ningun hash y sin emitir sesion.
- **E7** *(R31)*. SI el identificador recibido no corresponde a ninguna cuenta, ENTONCES el
  sistema NO DEBE crear ni actualizar ningun registro, de modo que la existencia de una cuenta
  no pueda deducirse por sus efectos en la base.

**Sesion**

- **E8** *(R9, R10)*. CUANDO la autenticacion es correcta, el sistema DEBE emitir la sesion en un
  transporte **inaccesible al codigo del navegador**, con alcance a toda la aplicacion y envio
  restringido entre sitios.
- **E9** *(R11)*. La sesion DEBE caducar, y el instante de caducidad DEBE viajar **dentro del
  valor firmado**, no solo en el atributo que controla el cliente.
- **E10** *(R12)*. El valor de sesion DEBE ir firmado con un codigo de autenticacion de mensajes
  y DEBE contener **unicamente identificadores**: nunca la contrasena, el hash, el identificador
  legible de la persona ni ningun otro dato personal.
- **E11** *(R13)*. SI el secreto de firma no esta configurado o no alcanza la longitud minima,
  ENTONCES el sistema DEBE fallar la operacion **sin emitir sesion y sin dar por autenticado a
  nadie**.
- **E12** *(R14)*. SI la autenticacion no es correcta por cualquier motivo, ENTONCES el sistema
  NO DEBE emitir ninguna sesion.
- **E13** *(R15)*. El sistema NO DEBE escribir en ningun registro de salida la contrasena
  recibida, el hash almacenado ni el valor de sesion.
- **E14** *(QC-23)*. CUANDO se emite una sesion, el sistema DEBE asignarle un identificador
  **nuevo, aleatorio y no derivado** de la persona ni del instante, de modo que dos sesiones
  simultaneas de la misma persona se puedan distinguir y cerrar por separado.

**Bloqueo**

- **E15** *(R22)*. CUANDO una cuenta acumula **5** verificaciones fallidas consecutivas, el
  sistema DEBE bloquearla temporalmente y reiniciar su contador.
- **E16** *(R23)*. CUANDO se bloquea una cuenta, el sistema DEBE aplicar la duracion del nivel de
  escalada alcanzado —1, 5, 15 y 60 minutos— y DEBE mantener el ultimo valor como tope. El
  bloqueo NUNCA DEBE ser permanente.
- **E17** *(R24)*. MIENTRAS una cuenta este bloqueada, el sistema DEBE rechazar todo intento
  **incluso si la contrasena es correcta**.
- **E18** *(R25)*. MIENTRAS una cuenta este bloqueada, el sistema NO DEBE incrementar su
  contador, NO DEBE subir su nivel y NO DEBE alargar el bloqueo vigente.
- **E19** *(R26)*. CUANDO el instante de fin de bloqueo ha pasado, el sistema DEBE volver a
  aceptar credenciales correctas **sin ninguna intervencion manual**.
- **E20** *(R27)*. CUANDO una autenticacion es correcta, el sistema DEBE dejar contador, nivel y
  bloqueo a cero.
- **E21** *(QC-78)*. MIENTRAS una cuenta no este **efectivamente activa**, el sistema DEBE
  rechazar sus credenciales y NO DEBE escribir nada sobre ella.

**Estructura**

- **E22** *(R17)*. El sistema DEBE implementar la decision de autenticar en el **dominio**,
  obteniendo por interfaces la lectura de la cuenta, el hashing, la emision de la sesion, el
  registro del intento y el identificador de sesion; **ningun archivo fuera del punto unico de
  composicion** DEBE elegir la implementacion concreta.
- **E23** *(R21)*. El sistema DEBE poder demostrarse en su camino feliz **sin depender de datos
  sembrados**: la propia verificacion automatizada crea y limpia lo que necesita.

**Capacidad NUEVA — el original NO la tiene**

- **E24** *(no existe en el original; decidido por el humano el 2026-09-13)*. CUANDO un intento de
  autenticacion se resuelve —**tanto si acierta como si falla**—, el sistema DEBE dejar un rastro
  consultable con **quien, cuando y desde donde**.
  **Leelo como lo que es:** el original **no registra nada** —ni un mensaje de salida en todo el
  camino, a proposito, para no filtrar secretos— y lo unico que guarda son tres contadores que se
  **sobrescriben**. Eso no permite responder «¿alguien entro a mi cuenta?» ni detectar a alguien
  probando contrasenas, que son las dos preguntas que justifican el requisito. En el original
  seria ficha aparte y **no se implementa desde esta extraccion**. En el tuyo, **hazlo desde el
  principio**: anadir historico despues es una migracion, y el requisito E13 sigue mandando —el
  rastro guarda identificadores y contexto, **jamas** la contrasena ni el hash ni el valor de
  sesion.

---

## 9. Que es del stack original y que sobrevive

**Framework (Next.js App Router).** Nada de esto es esencial; el requisito abstracto si.

| Pieza del original | Que hace | Equivalente nombrado |
| --- | --- | --- |
| `'use server'` sobre la accion | Marca una funcion como punto de entrada de mutacion, invocable desde el cliente sin escribir un endpoint | Un controlador POST (Express, Rails, Django, Spring), un *remote function* de SvelteKit, un `action` de Remix |
| `useActionState(accion, estadoInicial)` | Ata formulario y accion, y devuelve el estado nuevo al re-renderizar | Cualquier ciclo «postea el formulario, re-renderiza con errores». El **identificador de intento** existe justo porque este mecanismo re-renderiza con el mismo estado: si tu ciclo es un POST-redirect-GET clasico, puede que no lo necesites |
| `redirect()` que señaliza con una **excepcion de control** | Termina la accion redirigiendo | Un `return redirect(...)` normal. **Ojo:** en el original va **fuera de todo try/catch** porque atraparla romperia la redireccion en silencio. Si tu framework redirige con un valor de retorno, este cuidado desaparece; si lo hace con excepcion, heredalo |
| Almacen de cookies del servidor (`cookies()`) | Escribe la cookie desde dentro de la accion | Cualquier API de respuesta HTTP que permita fijar cabeceras `Set-Cookie` |
| Interceptor del borde (`middleware.ts`) | Valida la sesion en cada navegacion | **No es parte de este modulo**, pero condiciona la §5: es la razon de elegir una API criptografica que exista en runtimes restringidos |

**Librerias — el requisito abstracto que sobrevive:**

| Original | Requisito abstracto |
| --- | --- |
| Zod | **Validacion de esquema declarativa con errores por campo y discriminacion del tipo de fallo** (hace falta distinguir «vacio» de «demasiado largo») |
| bcrypt | **Hashing de contrasenas adaptativo, con sal interna y coste configurable**, y con un limite de longitud de entrada conocido y respetado |
| ORM con consulta cruda parametrizada | **Acceso a datos que permita bajar a SQL parametrizado cuando el indice lo exija** (ver §10: el indice funcional parcial) |
| Criptografia estandar del runtime | **HMAC-SHA-256 y comparacion en tiempo constante, disponibles en todos los runtimes donde se verifica la sesion**. Se descarto una libreria de JWT a proposito: lo unico que ahorraria es el formato de sobre y el manejo del campo de algoritmo, **que es precisamente la parte con historial de vulnerabilidades** y que aqui no existe porque el formato es fijo y de un solo algoritmo |
| Runner E2E con navegador real | **Poder comprobar desde fuera que la cookie es inaccesible a scripts** — es la unica forma honesta de afirmarlo |

---

## 10. Parametros a reemplazar

| Marcador | Valor en el original | Que poner en el tuyo |
| --- | --- | --- |
| Nombre de la cookie | `qc_session` | Prefijo de **tu** producto. Conserva el criterio: **no digas «auth» ni «token»** — no hace falta anunciar que ahi viaja la sesion |
| Variable del secreto | `SESSION_SECRET`, minimo 32 caracteres | La tuya. Conserva el minimo y el fallo cerrado |
| Duracion | 8 h | La jornada de **tu** producto. Conserva «absoluta, sin renovacion» o decidelo a conciencia |
| Tope de credencial | 64 caracteres | Deriva el tuyo **del limite real de tu algoritmo de hashing**, no de este numero |
| Destino por defecto | `/dashboard`, y antes el primer item del menu ya filtrado por permisos | Tu ruta. Conserva el orden: destino pedido valido > primera pantalla permitida > respaldo |
| Nombre del parametro de retorno | `next` (campo oculto del formulario) | El tuyo. **Conserva la revalidacion en servidor**: ese campo es entrada externa y un POST fabricado puede sacar a la persona del sistema justo despues de autenticarse |
| Copys | `Usuario o contraseña incorrectos.` · `Este campo es obligatorio.` · `La contraseña no puede superar los N caracteres.` | Los tuyos, en tu idioma. **Constantes exportadas y marcadas provisionales**; los tests afirman sobre la constante, **jamas** sobre el literal. Es lo que permite retraducir todo sin tocar un test |
| Tablas y columnas | `users`, `roles`, `companies`; `password_hash`, `failed_login_attempts`, `lock_level`, `locked_until`, `account_status`, `account_status_changed_at/_by`, `deleted_at`, `company_id` — **identificadores en ingles y `snake_case`** | Los tuyos. **Fija una sola convencion de idioma para los identificadores de base y no la mezcles con el idioma de los copys** |
| Estados de cuenta | `active`, `pending`, `inactive`, `blocked` — en ingles y minuscula, **una sola grafia en codigo, esquema y base** | Los tuyos. El original se aparto a proposito de otros catalogos suyos que usan otra grafia: «tener una segunda grafia es la clase de traduccion silenciosa que se desincroniza» |
| **Unicidad del identificador** | Indice **funcional y parcial** escrito a mano: `lower(username) WHERE deleted_at IS NULL` | **Esto es lo primero que se pierde al portar.** Ningun ORM lo modela solo: vive en la migracion escrita a mano. Y condiciona la consulta — una busqueda «sin distinguir mayusculas» que use el operador de patron **no usa ese indice** y convierte el login en un recorrido completo de la tabla en la ruta mas caliente de la aplicacion |
| Borrado | **Logico** (`deleted_at`), nunca fisico | Decide, y hazlo consistente con el filtro del puerto |

---

## 11. Criterio de aceptacion

**Transferibles — describen comportamiento y deben existir en tu port:**

| Del original | Que fija | Cubre |
| --- | --- | --- |
| Caso de uso con puertos falsos (30+ casos, sin base, sin hashing real, sin framework) | La **decision entera**: acepta activo con contrasena correcta; el rol y la organizacion del ticket salen de lo que devolvio el puerto y no de la entrada; inexistente, contrasena mala y bloqueada devuelven **el mismo objeto**; entrada invalida **no toca ningun puerto**; ningun fallo emite sesion; el señuelo se calcula una sola vez; el camino bloqueado verifica el hash una vez; un registro que pierde la carrera **se reintenta sobre el estado fresco** sin volver a pagar el hasher; un usuario que desaparece entre el intento y el reintento no provoca escritura | R1-R8, R14, R17, R24, R25, R27-R29, R31 |
| Politica de bloqueo aislada, con el reloj inyectado | El quinto fallo bloquea y reinicia; la escalada es 1/5/15/60 y no pasa de 60; con el bloqueo caducado vuelve a aceptar; fallo estando bloqueada devuelve el mismo estado; un exito deja los tres a cero. **Con el reloj inyectado**: probarlo con una espera real seria un test de 60 segundos y ademas intermitente | R22, R23, R25-R27 |
| Borde del formulario | Campos vacios no verifican credenciales; **el mismo mensaje** para inexistente y para contrasena mala; conserva lo escrito en el identificador tras un rechazo; el estado devuelto **nunca** contiene la contrasena; identificador de intento distinto por invocacion; destino de vuelta interno manda, externo se descarta | R9, R10, R15, R16, R19, R21 |
| Contra base real | Concurrencia de verdad: **cinco fallos en paralelo bloquean la cuenta**; fallos en paralelo sobre una cuenta bloqueada **no la desbloquean**; **un intento con estado obsoleto no puede borrar un bloqueo vigente** (el ABA de la invariante 6, comprobado ejecutandolo); el compare-and-set no aplica si el estado de cuenta cambio entre la lectura y la escritura; una cuenta pendiente o inactiva no entra ni con la contrasena correcta | R1, R4, R5, R22, R24, R27 |
| **E2E con navegador real** | Entra con credenciales correctas y **recibe la cookie inaccesible a scripts**; con credenciales incorrectas se queda y **no** la recibe; organizacion dada de baja no entra pese a credenciales correctas; una cuenta no activa ve **el mismo mensaje** que una contrasena mala, no recibe sesion y no deja rastro. **Existe y no es opcional**: el arnes del original lo exige para flujos de autenticacion, y comprobar «inaccesible a scripts» desde fuera es la unica forma honesta de afirmarlo | R9, R14 |

**Especificos del stack original — reimplementa el *proposito*, no el test:**

- **Paridad byte a byte de la firma** contra la implementacion anterior, usada como **oraculo** de
  una migracion de API criptografica. Solo tiene sentido si tu tambien migras; si empiezas de
  cero, lo que necesitas es «la firma es reproducible y una firma alterada o de otro secreto se
  rechaza».
- **Rechazo de la version anterior del formato**, y ademas **sin llegar a verificar la firma**.
- Dos tests que afirman **sobre el texto del fuente** (que el caso de uso se construye con
  puertos). Es una comprobacion de arquitectura, no de comportamiento: en tu stack puede ser un
  linter de capas.

---

## 12. Dependencias asumidas ya montadas

Esto el modulo **no lo crea**. Tenlo antes de empezar, y **no lo reimplementes**:

1. **El esquema de personas, roles y organizaciones**, con la ficha de cada persona apuntando a
   **una** organizacion (obligatoria, con integridad referencial restrictiva) y a **un** rol. Si
   no la tuviera, la persona **no se encuentra** —y no entra— en vez de emitirse una sesion con
   un rol o una organizacion inventados.
2. **El indice de unicidad del identificador**, funcional y parcial (§10).
3. **Un cliente de datos** capaz de consulta parametrizada cruda y de actualizacion condicional
   que informe **cuantas filas afecto** (sin eso no hay compare-and-set).
4. **Un hasher de contrasenas ya elegido y cableado**, compartido con el alta y el cambio de
   credencial. **Uno solo**: dos hashers son dos costes que pueden divergir.
5. **Una fuente de identificadores aleatorios** con forma de UUID.
6. **El catalogo de permisos y el menu privado ya filtrable**, para calcular el aterrizaje. El
   login **consulta la sesion recien emitida una vez, al entrar** — es una consulta por **inicio
   de sesion**, no por peticion, y esa distincion es la que la hace aceptable.
7. **La resolucion y validacion del destino de vuelta** (que una ruta sea interna y valida).
8. **Las constantes de ruta** del producto.
9. **El secreto de firma en el entorno**, nunca un valor real en el repositorio.
10. **El tooling de tests**: unitario, de integracion contra una base real y E2E con navegador.

---

## Preguntas abiertas

Ninguna. Los dos huecos que quedaban —el rastro de accesos y la rotacion del secreto— los
cerro el humano el 2026-09-13 y estan incorporados: el primero como **E24** (§8), el segundo
como decision con su porque (§5). Las **cuatro decisiones** que el original tomo en silencio
estan en `decisiones.md`, y son tuyas.
