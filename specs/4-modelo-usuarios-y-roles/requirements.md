# requirements.md — Feature 1: modelo-usuarios-y-roles

> Zona: `backend` · Complexity: `medium` · SDD: si · Branch: `feature/1-modelo-usuarios-y-roles`

## Alcance

Persistencia de **usuarios** y **roles**: estructura de datos, restricciones de unicidad e
integridad, y el conjunto cerrado de tipos de documento de identidad.

**Fuera de alcance** (tienen ficha propia, no se especifican aqui):
algoritmo de hash y verificacion de contrasena (feature 2), seed de roles y usuario inicial
(feature 3), login (feature 4), cualquier UI.

Notacion: EARS (`docs/specs.md`). "El sistema" = la capa de persistencia de QuimiCloude
(esquema Prisma + base Postgres).

---

## Requisitos

### Estructura del usuario

**R1.** El sistema DEBE persistir, para cada usuario, los siguientes datos: nombres,
apellidos, fecha de nacimiento, correo electronico, telefono de contacto, tipo de documento
de identidad, numero de documento de identidad, nombre de usuario de inicio de sesion y
valor derivado de la contrasena.

**R2.** SI se intenta persistir un usuario al que le falte alguno de los datos enumerados en
R1, ENTONCES el sistema DEBE rechazar la operacion y no crear ninguna fila.

**R3.** El sistema DEBE identificar a cada usuario y a cada rol con un identificador propio,
estable y no derivado de sus datos de negocio, de modo que cambiar cualquier dato de negocio
no cambie el identificador.

### Unicidad

**R4.** SI se intenta persistir un usuario cuyo correo electronico ya pertenece a otro usuario
no borrado, ignorando diferencias de mayusculas y minusculas, ENTONCES el sistema DEBE
rechazar la operacion y conservar el usuario existente sin modificar.

**R5.** SI se intenta persistir un usuario cuyo nombre de usuario de inicio de sesion ya
pertenece a otro usuario no borrado, ignorando diferencias de mayusculas y minusculas,
ENTONCES el sistema DEBE rechazar la operacion y conservar el usuario existente sin
modificar.

**R6.** SI se intenta persistir un usuario cuya combinacion de tipo de documento y numero de
documento ya pertenece a otro usuario no borrado, ENTONCES el sistema DEBE rechazar la
operacion y conservar el usuario existente sin modificar.

**R7.** El sistema DEBE aceptar dos usuarios con el mismo numero de documento cuando sus
tipos de documento son distintos.

### Tipo de documento (conjunto cerrado)

**R8.** SI se intenta persistir un usuario con un tipo de documento que no pertenece al
conjunto admitido, ENTONCES el sistema DEBE rechazar la operacion y no crear ninguna fila.

**R9.** El sistema DEBE admitir `CC` (cedula de ciudadania) como unico tipo de documento del
conjunto en el estado inicial de la feature.

**R10.** CUANDO se anade un tipo de documento nuevo al conjunto admitido, el sistema DEBE
seguir devolviendo intactos todos los usuarios ya persistidos, sin requerir ninguna
modificacion de sus filas ni de las columnas que los guardan.

### Contrasena

**R11.** El sistema DEBE almacenar la contrasena de un usuario unicamente como un unico valor
derivado no reversible, y NO DEBE existir en el esquema ninguna columna destinada a guardar
la contrasena en claro.

**R12.** El sistema DEBE aceptar como valor derivado de contrasena cualquier cadena de texto
de longitud arbitraria, sin imponer longitud maxima, formato ni estructura, de modo que la
eleccion de algoritmo quede abierta a la feature 2.

### Roles

**R13.** El sistema DEBE persistir, para cada rol, un nombre y una descripcion, ambos
obligatorios.

**R14.** SI se intenta persistir un rol cuyo nombre ya pertenece a otro rol, ENTONCES el
sistema DEBE rechazar la operacion y conservar el rol existente sin modificar.

**R15.** El sistema DEBE asociar cada usuario con exactamente un rol, y SI se intenta
persistir un usuario sin rol o con un rol inexistente, ENTONCES el sistema DEBE rechazar la
operacion.

**R16.** El sistema DEBE permitir que un mismo rol este asociado a un numero ilimitado de
usuarios.

**R17.** SI se intenta borrar un rol que tiene al menos un usuario asociado, **incluidos los
usuarios borrados logicamente**, ENTONCES el sistema DEBE rechazar el borrado y conservar
tanto el rol como sus usuarios sin modificar.

**R18.** MIENTRAS un rol no tenga ningun usuario asociado, el sistema DEBE permitir su
borrado.

### Borrado logico y marcas de tiempo

**R21.** CUANDO se borra un usuario, el sistema DEBE conservar su fila completa y registrar
el instante del borrado, sin eliminar ninguno de sus datos.

**R22.** MIENTRAS un usuario este borrado logicamente, el sistema DEBE permitir persistir un
usuario nuevo con su mismo correo electronico, su mismo nombre de usuario y su misma
combinacion de tipo y numero de documento.

**R23.** El sistema DEBE admitir mas de un usuario borrado logicamente que compartan correo
electronico, nombre de usuario o combinacion de tipo y numero de documento.

**R24.** El sistema DEBE registrar, para cada usuario y cada rol, el instante de creacion y
el instante de la ultima modificacion.

### Datos y seguridad

**R19.** El sistema DEBE tener `ROW LEVEL SECURITY` activado y forzado (`FORCE ROW LEVEL
SECURITY`) en toda tabla creada por esta feature.

**R20.** CUANDO se revierte la migracion de esta feature, el sistema DEBE quedar exactamente
en el estado de esquema previo a aplicarla, sin dejar tablas, restricciones ni tipos
residuales.

---

## Decisiones cerradas por el humano (2026-08-06)

Estas cinco preguntas estaban abiertas en la primera version de la spec y ya tienen
respuesta. Se dejan anotadas para que el reviewer sepa que no son supuestos del agente.

1. **Telefono y fecha de nacimiento son obligatorios** (`NOT NULL`). R1 y R2 quedan como
   estaban: los nueve datos del usuario son obligatorios.
2. **Correo y nombre de usuario son insensibles a mayusculas** para unicidad y busqueda, y la
   garantia vive en la base, no solo en la aplicacion (R4, R5; ver `design.md > 4`).
3. **Marcas de tiempo:** `created_at`, `updated_at` y `deleted_at`. Hay **borrado logico** de
   usuarios (R21-R24; ver `design.md > 5` para su efecto sobre la unicidad y sobre R17).
4. **Identificadores del esquema en ingles** (tablas, columnas, indices, restricciones).
5. **Infraestructura de base disponible:** el repo ya tiene `.env` con `DATABASE_URL`. Nada
   de esta feature queda bloqueado por entorno.

## Preguntas abiertas

Ninguna bloquea la implementacion. Se listan en vez de rellenarse con supuestos (regla 6 de
`CLAUDE.md`).

1. **Formato del numero de documento.** ¿Se valida algun formato (solo digitos, longitud
   minima/maxima) o se guarda tal cual como texto? Esta spec no impone formato: la columna es
   texto libre no vacio. Si mas adelante se impone, es una validacion de borde (zod) en la
   feature que dé de alta usuarios, no un cambio de esquema.
2. **Roles concretos del catalogo.** La description dice "catalogo cerrado y corto" pero no
   nombra ninguno. Esta feature no crea ninguna fila de `roles` a proposito: los roles base
   son la feature 3. No bloquea: el esquema no depende de cuales sean.
3. **Rotacion del algoritmo de contrasena.** Si la feature 2 necesita rehashear al cambiar de
   algoritmo o de coste, podria querer `password_algorithm` / `password_updated_at`. Aqui no
   se anaden por no adivinar (`design.md > 6`). No bloquea: es una migracion aditiva barata.
