# design.md — Feature 5: hash-y-verificacion-de-contrasena

> **Reescrito el 2026-08-06.** Sustituye entera a la version anterior (scrypt, formato PHC,
> parametros configurables, techo de memoria, medicion de coste, rotacion y pepper). Nada de
> eso sigue en la feature.

## 1. Estado de partida (verificado en el repo)

- `users.password_hash` existe como `text NOT NULL`, sin longitud declarada
  (`db/schema.prisma`). **Sirve tal cual: esta feature no cambia el esquema.**
- **En la rama ya hay una implementacion de scrypt que hay que borrar**, no dejar conviviendo:
  `lib/utils/password-hash.ts`, `tests/support/password-test-params.ts`,
  `tests/unit/password/{password-hash,password-cost,password-verify-fail-closed}.test.ts` y
  `tests/guards/guard-password-hash-module.test.ts` (T1).
- **Ningun archivo de produccion importa hoy `password-hash`** (comprobado): el borrado no
  rompe nada. `lib/services/login-stub.ts` de la feature 7 no lo usa.
- `package.json` **no tiene ninguna dependencia de hashing**: scrypt venia de `node:crypto`, asi
  que del modulo viejo no sobra ningun paquete que desinstalar. `bcryptjs` hay que anadirlo.
- `lib/types/auth.ts:11` tiene hoy `password: z.string().min(1)`, **sin maximo** (feature 7, ya
  en `dev`).
- Guardia heredada activa: `tests/guards/guard-password-never-plaintext.test.ts` barre `lib/`.

## 2. Que se construye

```
lib/utils/password-hash.ts    ← reescrito: dos funciones sobre bcryptjs
```

`docs/architecture.md > Estructura de carpetas` reserva `lib/utils/` para helpers puros. No se
crea service ni interfaz: no hay nada que inyectar ni que mockear (sobre-ingenieria).

```ts
/** Coste de bcrypt (design.md > 3). */
export const BCRYPT_ROUNDS = 10

/** Maximo de bytes UTF-8 que bcrypt tiene en cuenta. Mas alla, truncaria (design.md > 5). */
export const BCRYPT_MAX_INPUT_BYTES = 72

/**
 * Transforma una contrasena en su valor almacenable. Sal interna nueva en cada
 * llamada: dos llamadas con la misma contrasena devuelven valores distintos (R2).
 * Lanza si `plaintext` supera los 72 bytes en UTF-8 (R9).
 */
export function createPasswordHash(plaintext: string): Promise<string>

/**
 * Responde si `plaintext` corresponde a `storedHash`. Falla cerrado: un `storedHash`
 * vacio, mal formado o corrupto devuelve `false` sin lanzar (R5).
 */
export function verifyPasswordHash(plaintext: string, storedHash: string): Promise<boolean>
```

**Los nombres no son libres.** `hashPassword`, `verifyPassword` o un parametro llamado
`password` ponen en rojo `guard-password-never-plaintext` de la feature 1, que marca todo
identificador declarado —incluidos parametros de funcion— cuyos segmentos incluyan `password` y
que no termine en `hash`. La guardia **no se relaja**: se adaptan los nombres, que ademas son
mas precisos (`createPasswordHash` crea el hash de una contrasena; `verifyPasswordHash` la
verifica contra un hash).

Ambas funciones son **asincronas** y usan la API asincrona de `bcryptjs`, no la sincrona: con
JavaScript puro, un hash sincrono bloquearia el event loop de la funcion serverless entera
durante cada login.

## 3. Decision: bcrypt via `bcryptjs`, 10 rondas

**Coste: 10 rondas.** Es el valor por defecto del propio `bcryptjs` y deja cada transformacion
en el orden de 10^2 ms con JavaScript puro — caro para un atacante, imperceptible en un login y
suficientemente barato para que la suite de tests siga siendo usable; 12 rondas cuadruplicarian
ese coste y pondrian cada hash cerca del segundo. El coste queda escrito dentro del propio hash
(`$2b$10$...`), asi que subirlo manana no invalida lo ya guardado (**R6**).

### Alternativa descartada: el paquete `bcrypt` (binding nativo)

Es mas rapido, y aun asi se descarta: `bcrypt` es un addon nativo que **se compila por
plataforma**. Aqui se desarrolla en Windows y se despliega en Vercel sobre Linux, asi que el
binario que funciona en local no es el que corre en produccion; si el empaquetado de la funcion
serverless no lo incluye bien, **el fallo aparece en el deploy**, no en local ni en `./init.sh`.
Es exactamente el motivo por el que la version anterior de este mismo spec descarto argon2id, y
vale igual aqui. `bcryptjs` es JavaScript puro: mismo algoritmo, mismo formato de hash, cero
binarios, y el unico precio es velocidad — que en una funcion de hashing es mas bien lo
contrario a un problema.

## 4. Formato y almacenamiento

`bcryptjs` produce la cadena estandar de bcrypt: **60 caracteres ASCII**, `$2b$10$` + 22 de sal
+ 31 de hash. La sal la genera bcrypt internamente y viaja dentro de la cadena: eso es lo que
hace que dos usuarios con la misma contrasena **no** compartan valor guardado (**R2**) sin
necesidad de ninguna columna extra.

**Sin cambios de esquema (R7):** 60 caracteres entran de sobra en `password_hash text NOT NULL`.
No hace falta columna de sal (va embebida), ni de algoritmo o coste (van en el prefijo). No hay
migracion en esta feature.

## 5. Decision: el limite de longitud, en dos sitios

bcrypt **solo tiene en cuenta los primeros 72 bytes** de la entrada; el resto lo ignora en
silencio, de modo que dos contrasenas que compartan esos 72 bytes verifican como la misma. No se
tapa, se acota:

**a) En el formulario de login: maximo 64 caracteres** (`lib/types/auth.ts`, **R10**). El limite
de bcrypt son 72 **bytes**, no caracteres, y un caracter acentuado ocupa 2 bytes en UTF-8 y un
emoji hasta 4. 64 caracteres dejan margen suficiente para que ninguna entrada razonable llegue a
los 72 bytes y sea truncada en silencio.

**b) En el util: rechaza (lanza) toda entrada de mas de 72 bytes UTF-8** (**R9**). El util no
puede depender de que quien lo llame haya validado antes: la feature 3 (seed) lo va a usar sin
pasar por el formulario. Se miden **bytes** (`Buffer.byteLength(plaintext, 'utf8')`), no
`plaintext.length`, que contaria caracteres y dejaria pasar entradas truncables. Aqui se lanza
en vez de devolver un valor: es un error del que llama, no un dato de usuario que haya que
tolerar — y el mensaje del error **no incluye la contrasena** (R8).

### Archivos que esta feature toca fuera de su modulo

Son dos, y el segundo es consecuencia del primero:

1. **`lib/types/auth.ts`** — anade `CREDENTIAL_MAX_LENGTH = 64`, el `.max(CREDENTIAL_MAX_LENGTH)` al
   campo `password` del `loginInputSchema`, y la constante de copy
   `PASSWORD_TOO_LONG_ERROR`. El schema de la feature 7 esta declarado "congelado", pero
   congelado significa que la feature 10 no cambia su **forma**; anadir una restriccion de
   validacion no cambia ni `LoginInput` ni `LoginFormState`.
2. **`lib/actions/login.ts`** — su `toFieldErrors` colapsa hoy **cualquier** problema del campo
   en `REQUIRED_FIELD_ERROR`, asi que sin tocarlo una contrasena demasiado larga se anunciaria
   como "Este campo es obligatorio", que es mentira. Cambio minimo: distinguir el issue de
   `too_big` para devolver `PASSWORD_TOO_LONG_ERROR`. Sin esto, R10 no se cumple ("con su
   mensaje de error de campo").

La ruta de validacion existente ya garantiza la otra mitad de R10: si `safeParse` falla, la
action devuelve `status: 'invalid'` y **no llama** a `verifyCredentials`.

## 6. Fallo cerrado en la verificacion (R5)

`verifyPasswordHash` devuelve `false` ante cualquier `storedHash` que no sea un hash bcrypt
utilizable —cadena vacia, texto suelto, prefijo desconocido, longitud incorrecta, caracteres
fuera del alfabeto de bcrypt, `null`/`undefined` colados desde JavaScript sin tipos— y **no
lanza**. Dos piezas: una comprobacion previa del formato (`/^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/`)
y un `try/catch` alrededor de la comparacion, porque `bcryptjs` lanza ante argumentos ilegales.

Devolver `false` en vez de propagar no incumple `docs/conventions.md` ("nada de catch vacios"):
el error **se maneja**, y la forma de manejarlo es la respuesta negativa. Si se propagara, el
login tendria dos salidas distinguibles desde fuera —error para el usuario con hash corrupto,
credenciales invalidas para el resto— y eso es un oraculo para enumerar usuarios. Un hash
corrupto en `users` es un problema de datos, no del que intenta entrar.

## 7. Lo que esta feature no tiene

Ni rutas, ni Server Actions propias, ni repositorios, ni servicios, ni migraciones, ni tablas,
ni RLS (no hay tabla nueva), ni permisos que validar. Consumidores previstos: el seed (feature
3) y el login (feature 4), que importan el util directamente.
