# QC-104 — conteo de consultas de sesion por peticion (R16)

> Medido por `implementer` el 2026-09-16, en el worktree
> `.worktrees/QC-104-sesion-una-sola-vez-por-peticion`.
>
> **Sin medir duracion.** La revision de F1.4 lo quito por decision humana: aqui solo se cuentan
> **consultas**. Playwright se usa **solo como navegador** —produce las peticiones—, nunca como
> medidor.

## Metodo

Repetible: lo que sigue basta para rehacerlo, y **no queda ningun script en el repo** (la decision
de F1.4 se respeta; el medidor vivio en el scratchpad y se copiaba a la raiz solo durante cada
corrida).

### 1. Base propia, y por que no vale la compartida

```sql
CREATE DATABASE "QuimiCloude_QC104" TEMPLATE "qct_tpl_7d0d301d89fb";
```

La plantilla la da `pnpm run db:test template` (29 migraciones, ya sembrada: trae el rol
`Administrador` con sus 15 permisos). El `.env` **del worktree** se apunta a esa base durante la
medicion y se devuelve a `QuimiCloude` al terminar.

**Es condicion, no comodidad.** Sobre la base compartida el contador tiene un **suelo de ruido del
tamano de la señal**: con el navegador cerrado y sin hacer nada, una ventana sumaba **1-2**. Con la
base propia, el control en reposo da **0** siempre.

### 2. Aplicacion real

`pnpm build && pnpm exec next start -p 3217`. **No `next dev`**: el objetivo es confirmar en
produccion lo que `design.md > 2.2` solo leyo en las compilaciones de desarrollo. Puerto 3217 para
no chocar con un `next dev` de otro worktree.

### 3. Que se cuenta: el marcador `revoked_sessions`

La resolucion de sesion se reparte en varias sentencias, pero la consulta al registro de sesiones
cerradas sale **una por lectura de la ficha**:

```sql
SELECT revoked_at FROM revoked_sessions WHERE user_id = ? AND session_id = ? LIMIT 1
```

**Marcador validado:** la relacion `revokedSessions` se lee en **un solo sitio** del codigo de
produccion — `lib/modules/identity/adapters/driven/persistence/session-user-prisma.ts:96`, anidada
en el mismo `findFirst` de `findActiveSessionUserById`, que Prisma resuelve como sentencia aparte.
El unico otro uso de la tabla esta en el camino de **escritura** (`session-revocation-prisma.ts`),
que no corre al pintar. Ninguna de las pantallas medidas la consulta por otra via.

### 4. Donde se cuenta: en la base, sin tocar la aplicacion

**Sin anadir ni una linea de log** (decision 9, R14). `design.md > 6.1` ofrecia dos vias; se uso
una tercera porque ninguna de las dos estaba disponible:

| Via | Estado |
|---|---|
| (a) `pg_stat_statements` | **descartada**: disponible pero no instalada, y `shared_preload_libraries` vacio -> exigiria **reiniciar** Postgres |
| (b) `log_statement = 'all'` | **NO EJECUTADA**: exige `ALTER SYSTEM` y el sistema de permisos del entorno lo deniega. **No se rodeo.** `log_statement` nunca cambio: sigue en `none` |
| (c) `pg_stat_user_tables` | **la usada**: no modifica nada |

```sql
SELECT COALESCE(idx_scan,0) + COALESCE(seq_scan,0) AS n
FROM pg_stat_user_tables WHERE relname = 'revoked_sessions';
```

Como el marcador tiene un solo emisor, el incremento de ese contador **es** el numero de lecturas
de la ficha de sesion.

### 5. Como se lee el contador (esto es lo que hace que la cifra valga)

Postgres publica las estadisticas con **retraso**. Medido con una serie cada 500 ms inyectando una
sola consulta:

```
t0..t1500 = 1724   [CONSULTA]   t2000=1724  t2500=1724  t3000=1724  t3500=1725  ... 1725
```

El incremento es exacto (+1) pero aparece **~1,5-2,0 s despues**. De ahi la regla de lectura:

1. **Piso de 12 s** tras la accion. Un piso de 3 s basta para una consulta suelta, pero **no para
   una rafaga**: con 20 recargas seguidas la cola de publicacion se perdia y salia
   **0,75-0,80 lecturas por peticion**, un 20-25 % de menos. Con 12 s las cifras caen en enteros
   exactos.
2. **Despues, estabilidad**: releer cada 1 s hasta que dos lecturas consecutivas coincidan.

**Validacion de la regla antes de medir:** 1 consulta -> 1; 3 consultas -> 3; en reposo -> 0.

### 6. Los casos

Sesion real por el formulario de login, con un usuario de fixture con el rol `Administrador`.

- Las tres pantallas, **20 recargas completas cada una**. Cada carga lleva una URL distinta
  (`?_r=<marca>`) para que **el router del cliente no la sirva de su cache**, y se cuentan las
  **peticiones de documento que recibe el servidor**: las 20 tienen que llegar, o la cifra no
  significa nada.
- **El guardado**: 3 altas de unidad por la interfaz. La ventana cubre el envio y lo que Next haga
  en esa misma respuesta, **incluido el repintado** si revalida (hallazgo H2).
- Cada carga comprueba que **no** ha servido el login; si lo sirve, la medicion se aborta.
- El login queda **fuera** de las ventanas: sus lecturas no son las de una pantalla.

### 7. Trampas del instrumento, todas pagadas en esta medicion

Estan aqui porque cada una produjo una tabla creible y falsa:

1. **Leer el contador una vez tras una espera corta da 0 en todo** y «prueba» algo falso. Hace
   falta piso + estabilidad (apartado 5).
2. **`APIRequestContext` de Playwright no manda la cookie de sesion** (`qc_session` es `Secure`):
   devolvia **HTTP 200 sirviendo el login**, o sea que no medía ninguna pantalla. Hay que navegar
   con el navegador.
3. **El fixture necesita `sessionsValidFrom` en el pasado.** `isStampedOut` (corte 7 de
   `resolve-session.ts`) compara con `<=`, asi que con el sello puesto al crear la fila la sesion
   nace ya matada y el servidor responde `login?sesion=fin`.
4. **Un `goto` repetido a la misma URL lo puede servir el router del cliente** sin tocar el
   servidor: hay que forzar URL distinta y contar los documentos que llegan.
5. **`waitUntil: 'networkidle'` no vale** con streaming de RSC: la red nunca se queda quieta y la
   espera expira a los 30 s.

### 8. Fixtures y limpieza

Empresa, usuario y unidad base efimeros con prefijo `qc104_e2e_`, borrados al terminar en el orden
que imponen las FK restrictivas —unidad derivada, unidad base, usuario, empresa—. Al cerrar cada
corrida se cuenta lo que queda con ese prefijo: **cero** en las dos mediciones.

## Conteo en ejecucion

Las dos corridas, **mismo metodo y misma base aislada**, con el control en reposo a **0** a los dos
lados en las dos. «Antes» es el arbol en `0d0e164` (el merge, **sin** T3 ni T4); «despues» es la
rama con el cambio.

| Caso | Antes | Despues | Recorte |
|---|---|---|---|
| `/configuracion/usuarios` | 7 | 1 | -86 % |
| `/pedidos` | 6 | 1 | -83 % |
| `/configuracion/unidades` | 7 | 1 | -86 % |
| guardado (alta de unidad) | 9 | 2 | -78 % |
| CONTROL en reposo | 0 | 0 | — |

Cifras por peticion, de 20 recargas por pantalla (140/20, 120/20, 140/20 antes; 20/20 en las tres
despues) y de 3 altas en el guardado (27/3 antes, 6/3 despues). Las 20 peticiones de documento
llegaron al servidor en todos los casos.

**Lo que dicen estos numeros:**

- **R1 y R2 se cumplen en la aplicacion real**: las tres pantallas sirven una carga completa con
  **exactamente una** lectura de la ficha de sesion, y eso incluye el layout privado, los cortes
  por permiso y las Server Actions que los componentes invocan mientras se pintan.
- **La semilla se quedaba corta, y el hallazgo H3 era correcto.** La ficha decia «tres lecturas por
  pagina»; medido, eran **6-7**, porque los componentes de servidor invocan Server Actions al
  pintarse y cada una resolvia su actor por su cuenta.
- **El guardado pasa de 9 a 2.** Las 2 que quedan son **la accion y el repintado** que Next hace en
  la misma respuesta: dos ambitos, que es exactamente lo que describe el hallazgo H2 y lo que R4
  recoge **como provisional**. **La Pregunta abierta 2 NO se cierra aqui**: esta medicion aporta el
  dato, la decision es del humano.

## Como repetirlo

1. `pnpm run db:test template` y crear la base propia con el `CREATE DATABASE ... TEMPLATE` del
   apartado 1.
2. Apuntar el `.env` **del worktree** a esa base.
3. `pnpm build && pnpm exec next start -p 3217`.
4. Control en reposo: **tiene que dar 0**. Si no, la base no esta aislada y no se sigue.
5. Medir, con las reglas de los apartados 5 y 6 y las trampas del 7 presentes.
6. Para el «antes»: `git checkout 0d0e164 -- lib/`, reconstruir, medir, y restaurar con
   `git checkout HEAD -- lib/` comprobando que `git diff -- lib/` queda vacio.
7. Devolver el `.env` a `QuimiCloude` y comprobar que no quedan fixtures con el prefijo.
