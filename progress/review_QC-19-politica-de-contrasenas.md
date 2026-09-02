# Review — QC-19 politica-de-contrasenas

> REVIEWER, 2026-09-02, en el worktree `.worktrees/QC-19-politica-de-contrasenas`
> (rama `feature/QC-19-politica-de-contrasenas`, HEAD `89c9cda`).
> Diff revisado: `7d18e72..HEAD` (merge-base real con `dev`), 21 archivos, +2253/-15.
> `dev..HEAD` NO es el diff de la feature: `dev` lleva un commit mas (`c379222`, contabilidad
> F2.0 del leader) que la rama aun no tiene, y por eso aparecen como "reversiones" de
> `feature_list.json` y `progress/current.md` que la feature no hizo (ver menor 1).

## Veredicto: **OK** (APROBADO)

**0 bloqueantes · 7 menores.**

---

## Verificacion ejecutable que corri YO

| Comando | Resultado |
| --- | --- |
| `./init.sh` completo, sobre el estado final de la rama | **exit 0**. 41 archivos, 432 tests en verde, 23,51 s. typecheck, lint, max-2-por-zona, specs, down.sql y `.env` en verde |
| `guard-politica-de-contrasenas.test.ts` | 9 tests en verde dentro de la corrida completa |
| **Mordida de la guardia, comprobada por mi** | Alimente `findHashWithoutPolicy` con el CONTENIDO REAL de `lib/modules/identity/domain/seed-initial-access.ts` y con ese mismo contenido sin la referencia a la politica. Real da `[]`; roto da `["passwordHasher.hash("]`; y `findHashProductions` sobre el real da `["passwordHasher.hash("]`, o sea el detector SI ve el productor. La guardia muerde de verdad, no pasa por vacio |

No me apoye en la bitacora para ninguna de estas casillas.

## CHECKPOINTS.md, punto por punto

**Especificacion**
- [x] `requirements.md` con 24 requisitos EARS numerados R1-R24.
- [x] `design.md` con alternativas descartadas y su porque (5.4 a-e, y 11 riesgos asumidos).
- [x] `tasks.md` con T0-T9 **todas** marcadas. Comprobado ademas que el commit de implementacion
      **solo** cambio lineas de casilla en `tasks.md`: ni una linea de alcance, de requisito ni
      del bloque "Lo que NO se toca" se reescribio para encajar con el codigo.

**Trazabilidad**
- [x] Los 24 requisitos mapean a tests que existen y afirman lo que dice el requisito. Los
      verifique uno a uno contra el fuente de los tests, no contra la tabla. Ninguno es un test
      vacio:
      - R1-R13 y R24 en `credential-policy.test.ts` (19 tests, doble del puerto, sin red).
      - R7 tambien contra la lista REAL en `breached-credential-list.test.ts`.
      - R11, R16, R20-R23 en `credential-policy-contract.test.ts` (centinelas de texto y de valor).
      - R17 en `verify-credentials.test.ts`: entra el usuario con credencial que NO cumple, y se
        afirma ANTES que de verdad no cumple. Sin ese paso previo el test no probaria nada.
      - R18 y R19 en la guardia **y** en el test de comportamiento del seed (orden de las
        llamadas y respeto del resultado), que el `design.md` daba por no automatizable.
- [x] `progress/impl_*.md` contiene el mapa `R<n> -> test`.

**Calidad de codigo**
- [x] typecheck, lint y tests: verde en mi propia corrida.
- [~] E2E: no hay, y esta diferido a QC-21 **con motivo escrito y decision humana** del
      2026-09-01 (`requirements.md > Decisiones cerradas`, ultima fila). La feature no expone
      pantalla ni ruta (R22, verificado), asi que un Playwright no ejercitaria nada. Excepcion
      declarada, no olvido.
- [n/a] Multiplataforma: la feature no toca UI. Cero archivos en `app/**` o `components/**`.
- [x] Dependencias: **una sola**, `@zxcvbn-ts/language-common@4.1.3`, con su fila en
      `docs/dependencias.md` y los cuatro checks anotados. Comprobado en `package.json` y en
      `pnpm-lock.yaml`: **no entro `@zxcvbn-ts/core`**. La unica transitiva es
      `@zxcvbn-ts/dictionary-compression@3.0.1`, que arrastra el propio paquete aprobado.
      `guard-dependencias-aprobadas` (bidireccional) en verde. Ver menor 2 sobre donde esta
      citada la aprobacion.

**Datos y seguridad**
- [x] Sin tablas, columnas, indices ni migraciones nuevas (R21, verificado por el centinela que
      compara los 4 directorios de `db/migrations/` y el modelo `User` campo a campo). Nada que
      exigiera RLS: `guard-rls-force` intacto.
- [x] Sin secretos hardcodeados. Sin `process.env` en el dominio ni en el adaptador.
- [x] **Ninguna credencial en claro** en codigo, tests, mensajes de error ni logs:
      el error del seed dice `unmet.join(', ')` (nombres de regla, nunca la credencial); el
      error de R15 en el dominio no incluye la candidata y el test lo afirma; el test de R24
      comprueba que el resultado serializado no contiene **ningun fragmento de 3 caracteres**
      de la candidata; el caso 9 de QC-6 (salida de consola acumulada) sigue en verde e incluye
      ahora el error nuevo del caso 8b; y `password` / `123456` aparecen solo como ENTRADAS de
      la lista de filtradas que el adaptador rechaza.
- [n/a] Webhooks: no hay.

**Modulos hexagonales**
- [x] `domain/credential-policy.ts` no importa framework, Prisma ni la libreria. Su unico import
      de valor es `CREDENTIAL_MAX_LENGTH` del propio dominio; el del puerto es `import type`.
- [x] El diccionario entra por el puerto `ports/breached-credential-list.ts` y su unico
      implementador es `adapters/driven/security/breached-credential-list.ts`.
- [x] `lib/composition/index.ts` es el unico que conoce el adaptador, y crea **una sola**
      instancia de la politica que sirve a la fachada y al seed.
- [x] El contrato `lib/modules/identity/index.ts` reexporta **solo** de `./domain/` (el test lo
      verifica recorriendo todos los especificadores). `guard-arquitectura-modulos` en verde,
      bloques 4 y 6 incluidos.

**Verificacion final**
- [x] `./init.sh` en verde, corrido por mi.
- [x] Este archivo existe y su veredicto es OK.
- [ ] `progress/history.md` y el desmontaje del worktree: pasos del leader, posteriores.

## Las siete desviaciones: verificadas una a una

1. **Costura de QC-6 en `domain/seed-initial-access.ts` — REAL y bien resuelta.** El
   `design.md > 7` se escribio con QC-6 fuera de la rama; QC-6 esta en `dev` y su seed hasheaba
   sin evaluar la politica, lo que dejaba R18 y R19 en falso. La alternativa (exentar el seed de
   la guardia) habria vaciado R18 en el unico punto del repo que hoy fija una contrasena.
   Verificado en el fuente: el orden es **leer estado -> politica -> hash -> escrituras**, la
   dependencia es **obligatoria** en el tipo (no opcional, sin valor por defecto: un seed
   construido sin ella no compila) y el `throw` ocurre antes del hash. La transaccion y la
   idempotencia que dejo QC-6 quedan intactas: no se movio ningun paso ni ninguna condicion.
   **Comprobado linea a linea que ninguna asercion existente de QC-6 se modifico**: el diff de
   `seed-initial-access.test.ts` y de `identity-seed.int.test.ts` solo ANADE la clave
   `checkCredentialPolicy` a los sitios de llamada, mas un caso nuevo. Ningun `expect` viejo
   cambio de valor, de forma ni de posicion.
2. **Politica REAL en los tests de integracion — correcta.** Un doble ahi habria dejado el
   cableado sin ejercitar. El marcador ficticio gano una mayuscula para cumplir la politica y
   sigue siendo evidentemente ficticio.
3. **La guardia detecta USO, no declaracion — justificada.** Tomado literal, el diseno marcaba
   `ports/password-hasher.ts`, que declara el contrato y no produce ningun hash. Las **tres
   exenciones por ruta exacta** del diseno se mantienen tal cual, y un caso prueba que son por
   ruta y no por nombre de archivo. Ver menor 3 por el hueco que deja.
4. **`toLowerCase()` en el dominio — correcta.** Deja R7 demostrado con un doble del puerto en
   vez de depender de cada implementacion futura. El adaptador normaliza ademas por su cuenta.
5. **`import type` del puerto en el dominio — correcta.** Se borra al compilar y el bloque 4 de
   `guard-arquitectura-modulos` permite `domain -> ports` del propio modulo.
6. **Dos tests donde T8 pedia uno — la propia tabla de trazabilidad listaba los dos.**
7. **El centinela fija por nombre los 4 directorios de migraciones — es lo que R21 pide**, y
   queda dicho que habra que actualizarlo.

**No encontre una octava desviacion sin declarar.** Los unicos archivos tocados fuera de la
lista de `tasks.md` son exactamente los que explican las desviaciones 1 y 2, mas
`docs/dependencias.md` (una linea: la fila pasa de "todavia NO instalada" al estado real) y
`progress/current.md` (las cuatro deudas de T9). El unico matiz sin etiquetar como desviacion
esta en el menor 7.

---

## Hallazgos

### BLOQUEANTES

**Ninguno.**

### Menores

1. **menor — la rama esta un commit por detras de `dev`.** `dev` tiene `c379222` (contabilidad
   F2.0: `feature_list.json` a `in_progress` y la fila de `progress/current.md`) que esta rama no
   incorpora, y por eso `git diff dev..HEAD` muestra reversiones que la feature **no** hizo. No
   es defecto del implementer, pero **antes del PR hay que traer `dev` y volver a correr
   `./init.sh` completo** (regla 5 de `CLAUDE.md`): `progress/current.md` lo tocan los dos lados
   y puede pedir conflicto a mano.
2. **menor — `design.md > 5` sigue diciendo "PROPUESTA, no aprobada" y "sigue faltando la
   aprobacion humana".** La aprobacion existe y esta escrita, pero en `requirements.md >
   Preguntas abiertas 2` y en `docs/dependencias.md`, no en el `design.md`.
   `CHECKPOINTS.md > Calidad de codigo` pide que se cite en el `design.md`. Es un desfase de
   documentacion dentro del mismo spec, no un incumplimiento de la regla 7.
3. **menor — hueco conocido de la guardia de R19: `import { hash } from 'bcryptjs'`.**
   `findHashProductions` casa `<algo>.hash(` y `createPasswordHash(`. Un archivo nuevo que
   importara `hash` de `bcryptjs` y llamara `hash(candidate, 10)` **sin receptor** produciria un
   hash sin que la guardia lo viera, y no hay ninguna otra guardia que restrinja quien importa
   `bcryptjs`. El hueco viene del propio `design.md > 7` (que fijaba esos tokens), no lo abrio el
   implementer. Merece una linea en `progress/current.md > Deudas`, junto a la de "la guardia no
   comprueba el orden".
4. **menor — riesgo operativo no anotado.** A partir de aqui, si la `SEED_ADMIN_*` real de un
   entorno no cumple la politica, el seed de instalacion **falla en el arranque** nombrando las
   reglas incumplidas. Es la consecuencia querida de R18 y esta prevista en `design.md > 7.2`,
   pero no figura entre las cuatro deudas de `progress/current.md`, que es donde el leader la
   leeria antes de desplegar.
5. **menor — estilo inconsistente en dos archivos nuevos.** `credential-policy.test.ts` y
   `credential-policy-contract.test.ts` van **sin punto y coma** e importan
   `{ describe, expect, it }` de `vitest` explicitamente, mientras el resto de la suite usa punto
   y coma y los globals. No hay config de Prettier en el repo y el lint pasa: es cosmetico.
6. **menor — indentacion rota** en `tests/integration/identity/identity-seed.int.test.ts` linea
   418 (`checkCredentialPolicy` desalineado dentro del objeto). Cosmetico; el lint no lo ve.
7. **menor — el `design.md > 2.2` anunciaba "4 exports nuevos" en el contrato y son 6** (dos son
   tipos). Esta en la tabla de archivos de la bitacora, pero no entre las siete desviaciones.
   Trivial.

---

## Lo que quiero dejar dicho a favor

- La desviacion 1 es la clase de hallazgo que en QC-6 costo un rechazo: una premisa del diseno
  que dejo de ser cierta. Aqui se detecto, se declaro y **se resolvio en la direccion que
  protege el requisito**, no en la que salva la casilla. Y de propina R18 gano un test de
  comportamiento que el diseno daba por imposible.
- Los tests no se conforman con "pasa": casi todos afirman **primero** que el escenario es el que
  dicen ser (que el barrido encontro archivos, que el detector ve productores de hash, que la
  credencial de R17 de verdad no cumple, que la politica SI se consulto) antes de afirmar el
  resultado. Eso es lo que impide que pasen en verde por vacio.
