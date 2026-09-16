# QC-104 — conteo de consultas de sesion por peticion (R16)

> Medido por `implementer` el 2026-09-16, en el worktree
> `.worktrees/QC-104-sesion-una-sola-vez-por-peticion`.
>
> **Sin tiempos.** La revision de F1.4 los quito por decision humana: aqui solo se cuentan
> **consultas**. Playwright se usa **solo como navegador** —produce las peticiones—, no como medidor.

## Metodo

Repetible: cualquiera puede rehacerlo con lo que sigue, sin script en el repo.

### 1. Aplicacion real

`pnpm build && pnpm exec next start -p 3217`, contra la base local del `.env` (`localhost`). **No
`next dev`**: el objetivo es confirmar en produccion lo que `design.md > 2.2` solo leyo en las
compilaciones de desarrollo.

Puerto **3217** y no el 3000, para no chocar con un `next dev` de otro worktree.

### 2. Que se cuenta: el marcador `revoked_sessions`

La resolucion de sesion se reparte en varias sentencias, pero la consulta al registro de sesiones
cerradas sale **una por lectura de la ficha de sesion**:

```sql
SELECT revoked_at FROM revoked_sessions WHERE user_id = ? AND session_id = ? LIMIT 1
```

**Marcador validado** (lo que exige `design.md > 6.1` punto 2): la relacion `revokedSessions` se lee
en **un solo sitio** de todo el codigo de produccion —
`lib/modules/identity/adapters/driven/persistence/session-user-prisma.ts:96`, anidada en el mismo
`findFirst` de `findActiveSessionUserById`, que Prisma resuelve como sentencia aparte—. El unico
otro uso de la tabla esta en el camino de **escritura** (`session-revocation-prisma.ts`), que no
corre al pintar una pantalla. Ninguna de las tres pantallas medidas la consulta por otra via.

### 3. Donde se cuenta: en la base, no en la aplicacion

**Sin anadir ni una linea de log a la aplicacion** (decision 9, R14).

`design.md > 6.1` punto 3 ofrecia dos vias. **Ninguna de las dos se pudo usar, y se dejo escrito
por que:**

- **(a) `pg_stat_statements`: descartada.** Esta **disponible** (`pg_available_extensions`) pero
  **no instalada** (`pg_extension` no la trae) y `shared_preload_libraries` esta **vacio**. Esa
  lista solo se lee al arrancar, asi que instalarla exigiria **reiniciar** el servidor de Postgres.
- **(b) `log_statement = 'all'`: NO EJECUTADA.** Exige `ALTER SYSTEM`, que cambia la configuracion
  de un servidor compartido, y **el sistema de permisos del entorno lo denego**
  («Modify Shared Resources»). **No se rodeo.** `log_statement` **nunca se cambio** y sigue en
  `none`: no habia nada que revertir.

**Via usada: `pg_stat_user_tables`, que no modifica nada.** Postgres ya lleva la cuenta de escaneos
por tabla, y como el marcador tiene un solo emisor, su incremento **es** el numero de lecturas de la
ficha de sesion:

```sql
SELECT COALESCE(idx_scan,0) + COALESCE(seq_scan,0) AS n
FROM pg_stat_user_tables WHERE relname = 'revoked_sessions';
```

### 4. Como se lee el contador: hay que esperar a que asiente

**Esto es lo que hace que la medicion valga**, y costo descubrirlo. Postgres acumula las
estadisticas en memoria local del backend y las publica con retraso (`stats_fetch_consistency` =
`cache`). Medido con una serie cada 500 ms, inyectando **una** consulta:

```
t0..t1500 = 1724   [CONSULTA]   t2000=1724  t2500=1724  t3000=1724  t3500=1725  ... 1725
```

El incremento es **exacto (+1)** pero aparece **~1,5-2,0 s despues**. Una lectura unica tras una
espera fija corta devuelve el valor de ANTES y **todos los casos saldrian 0**, «probando» algo
falso. De hecho el primer intento dio 0 en todo.

**Regla de lectura, con las dos partes:**

1. **Piso de 3 s** tras la accion. Sin piso, «el contador esta quieto» y «aun no ha publicado» son
   indistinguibles.
2. **Despues, estabilidad**: releer cada 1 s hasta que dos lecturas consecutivas coincidan.

**Validacion de la regla antes de medir nada** (misma sesion, misma base):

| Consultas inyectadas | Delta medido | Esperado | |
|---|---|---|---|
| 1 | 1 | 1 | OK |
| 3 | 3 | 3 | OK |
| 1 | 1 | 1 | OK |
| ninguna (reposo) | 0 | 0 | OK |

### 5. Los casos

Una sesion con los permisos de las tres pantallas (rol `Administrador` sembrado, 15 permisos). Para
cada caso: contador asentado, accion, contador asentado; la diferencia es la cifra.

- `/configuracion/usuarios`, `/pedidos` y `/configuracion/unidades`, cada una con **carga completa**
  (`page.goto`, recarga real), no navegacion de cliente.
- **Un guardado**: alta de una unidad derivada desde el panel de `/configuracion/unidades`. La
  ventana cubre **solo el envio** y lo que Next haga en esa misma respuesta, incluido el repintado
  si revalida (hallazgo H2).

**El login queda fuera de las ventanas**: sus lecturas no son las de una pantalla.

`waitUntil: 'load'`, **nunca `networkidle`**: con el streaming de RSC la red no llega a quedarse
quieta y la espera expira a los 30 s (medido).

### 6. Fixtures y limpieza

Empresa, usuario y unidad base efimeros, todos con prefijo `qc104_e2e_`. Se borran al terminar en el
orden que imponen las FK restrictivas —unidad derivada, unidad base, usuario, empresa— y se cuenta
lo que queda con ese prefijo para demostrar que no hay huerfanas.

## Conteo en ejecucion

**NO HAY CIFRAS QUE PUBLICAR. La medicion esta BLOQUEADA y se sube al leader sin resolver.**

No es que falte tiempo: es que **ninguna de las tres vias da un numero fiable en esta maquina**, y
publicar el que salio seria publicar ruido. Lo que sigue es lo medido, para que quien lo retome no
recorra otra vez los mismos callejones.

### Las tres vias, y por que ninguna sirve hoy

| Via | Estado | Evidencia |
|---|---|---|
| (a) `pg_stat_statements` | **descartada** | disponible en `pg_available_extensions` pero **no instalada**, y `shared_preload_libraries` esta **vacio**; esa lista solo se lee al arrancar, asi que exige **reiniciar** Postgres |
| (b) `log_statement = 'all'` | **NO EJECUTADA** | exige `ALTER SYSTEM`, y el sistema de permisos del entorno lo **denego** («Modify Shared Resources»). **No se rodeo.** `log_statement` **nunca se cambio**: sigue en `none`, no habia nada que revertir |
| (c) `pg_stat_user_tables` | **inservible aqui** | el contador tiene un **suelo de ruido del mismo tamano que la señal**: ver abajo |

### Por que (c) no sirve: el control en reposo no da cero

El contador es **exacto en aislamiento** —validado antes de medir: 1 consulta -> 1, 3 -> 3, en
reposo -> 0— pero sobre la base compartida `QuimiCloude` **no se puede atribuir una lectura a una
peticion**. Con el **navegador completamente cerrado** y sin hacer nada, una ventana de conteo
sigue sumando:

```
ronda1 CONTROL(reposo) -> 2   (esperado 0)
ronda2 CONTROL(reposo) -> 1   (esperado 0)
ronda3 CONTROL(reposo) -> 1   (esperado 0)
```

Y con ese suelo, las cifras por pantalla se vuelven absurdas: `/configuracion/usuarios` sale **0**
en las tres rondas, lo que es **imposible** si de verdad hace una lectura. O sea que las lecturas
se estan atribuyendo a la ventana vecina —el contador publica con ~1,5-2,0 s de retraso— mezcladas
con trafico ajeno a esta medicion.

**Regla que se respeto:** «si no se puede hacer determinista, esa via falla y se para; no se
reportan numeros que no te creas».

### Lo que si quedo establecido, y vale para la proxima

1. **El marcador es correcto.** `revoked_sessions` se lee en **un solo sitio** del codigo de
   produccion (`session-user-prisma.ts:96`); ninguna pantalla medida la consulta por otra via.
2. **El contador necesita piso, no solo estabilidad.** Postgres publica con retraso: medido con una
   serie cada 500 ms, el incremento aparece ~1,5-2,0 s despues (`t3000=1724`, `t3500=1725`). Leer
   una vez tras una espera corta devuelve **0 en todos los casos** y «prueba» algo falso. Hay que
   esperar un minimo y **luego** exigir estabilidad.
3. **El navegador mide navegaciones, no peticiones.** Una recarga en produccion dispara **14-17**
   peticiones al servidor (Next precarga los enlaces del menu), cada una con derecho a **su** lectura.
   Comparar esa cifra contra el 1 de R2 es un error de lectura: R1 y R2 hablan de **una peticion**.
   Para eso hay que emitir **una sola** peticion HTTP con la cookie, sin cliente vivo.
4. **`waitUntil: 'networkidle'` no vale** con el streaming de RSC: la red nunca queda quieta y la
   espera expira a los 30 s.

### Lo que hace falta para desbloquearlo

Una de estas dos, y las dos son **decision humana**:

- **una base de datos solo para la medicion** (o la certeza de que nadie mas toca `QuimiCloude`
  durante la corrida), que es lo que haria util a la via (c); o
- **la via (b)**, que es exacta por peticion porque cada sentencia queda con su marca de tiempo:
  para eso hace falta que el entorno **permita** `ALTER SYSTEM SET log_statement`, hoy denegado.

**Consecuencia:** **R16 sigue sin test** y T1, T8 y T10 siguen sin ejecutar.
