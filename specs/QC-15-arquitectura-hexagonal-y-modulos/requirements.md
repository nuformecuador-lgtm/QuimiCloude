# QC-15 — arquitectura-hexagonal-y-modulos · requirements.md

Notacion EARS (`docs/specs.md`). Cada `R<n>` es verificable con un test concreto; el mapa
`R<n> -> test` vive en `tasks.md > Trazabilidad`.

**Naturaleza de la feature.** Es una reestructuracion: **no anade ni cambia comportamiento
observable**. Por eso hay dos familias de requisitos:

- **Estructurales (R1-R17, R19-R21):** propiedades del arbol de archivos y del grafo de
  imports. Se verifican con una guardia ejecutable que recorre archivos, no con tests de
  comportamiento (`docs/gate.md > Las guardias van SIEMPRE`).
- **De no-regresion (R18):** el comportamiento actual queda intacto.

Vocabulario usado en todos los requisitos:

- **Modulo:** carpeta bajo `lib/modules/<modulo>/`.
- **Dominio:** archivos bajo `lib/modules/<modulo>/domain/`.
- **Puerto:** archivo bajo `lib/modules/<modulo>/ports/`.
- **Adaptador driven** (conducido): archivo bajo `lib/modules/<modulo>/adapters/driven/`.
- **Adaptador driving** (conductor): archivo bajo `lib/modules/<modulo>/adapters/driving/`.
- **Contrato:** el archivo `lib/modules/<modulo>/index.ts`.
- **Punto de composicion:** el archivo `lib/composition/index.ts`.
- **Nucleo compartido:** archivos bajo `lib/shared/`.

---

## Estructura

**R1.** El sistema DEBE alojar todo el codigo de negocio en modulos bajo
`lib/modules/<modulo>/`, y cada modulo DEBE contener exactamente las carpetas `domain/`,
`ports/` y `adapters/` (con `adapters/driven/` y/o `adapters/driving/`) mas un unico
archivo de contrato `index.ts`.

**R2.** SI existe una carpeta bajo `lib/modules/<modulo>/` cuyo nombre no sea `domain`,
`ports` ni `adapters`, ENTONCES el sistema DEBE señalarlo como incumplimiento.

**R3.** El sistema DEBE contener el modulo `identity` con el codigo hoy repartido en
`lib/actions/`, `lib/services/`, `lib/types/auth.ts`, `lib/types/identity.ts`,
`lib/types/session.ts` y `lib/utils/password-hash.ts`.

**R4.** El sistema DEBE contener el modulo `inventario` con la misma forma que exige R1,
aun sin implementacion, como destino de la feature QC-14.

**R5.** El sistema NO DEBE contener las carpetas horizontales `lib/actions/`,
`lib/services/`, `lib/repositories/`, `lib/interfaces/`, `lib/types/`, `lib/navigation/`
ni el directorio `lib/utils/`.

**R6.** El sistema DEBE mantener `lib/utils.ts` en su ruta actual y exportando `cn`, porque
`components.json` fija el alias `"utils": "@/lib/utils"` y todo componente generado por
shadcn/ui importa de ahi.

## Direccion de las dependencias

**R7.** MIENTRAS un archivo pertenezca al dominio o a los puertos de un modulo, el sistema
DEBE impedir que importe: cualquier ruta de `next/*` o `react*`, `@prisma/client`, el
cliente Prisma compartido, cualquier archivo bajo `adapters/`, el punto de composicion,
`lib/shared/`, `app/`, `components/` o `hooks/`.

**R8.** MIENTRAS un archivo pertenezca al dominio o a los puertos de un modulo, el sistema
DEBE permitirle importar unicamente: otros archivos del `domain/` o `ports/` de su propio
modulo, el contrato (`index.ts`) de otro modulo, y los paquetes npm de la lista de paquetes
puros declarada en `design.md > 5.2` (hoy: `zod`).

**R9.** SI un archivo de cualquier modulo importa de otro modulo por una ruta distinta de
`@/lib/modules/<otro-modulo>` (es decir, apuntando a su `domain/`, `ports/` o `adapters/`),
ENTONCES el sistema DEBE señalarlo como incumplimiento.

**R10.** El contrato de un modulo DEBE reexportar unicamente simbolos de su propio
`domain/`, y NO DEBE reexportar ningun archivo que declare `'use server'`, importar
`@prisma/client`, el cliente Prisma compartido ni ninguna ruta de `next/*` — ni directa ni
transitivamente —, de forma que sea importable desde un componente de cliente.

**R11.** El punto de composicion DEBE ser el unico archivo del repositorio, fuera de
`tests/` y `scripts/`, que importe un adaptador driven de cualquier modulo.

**R12.** El punto de composicion NO DEBE importar ningun adaptador driving, para que la
dependencia entre adaptador conductor y composicion tenga un solo sentido y no exista ciclo.

**R13.** MIENTRAS un archivo viva en `app/`, `components/` o `hooks/`, el sistema DEBE
permitirle importar de un modulo solo su contrato (`@/lib/modules/<m>`) o un adaptador
driving (`@/lib/modules/<m>/adapters/driving/...`), y DEBE impedirle importar `domain/`,
`ports/` o `adapters/driven/`.

**R14.** SI un archivo declara `'use client'`, ENTONCES el sistema DEBE impedirle importar
el punto de composicion o cualquier adaptador driven.

**R15.** Los archivos de `lib/shared/` NO DEBEN importar de `lib/modules/` ni del punto de
composicion: el nucleo compartido es una hoja del grafo.

## Persistencia

**R16.** Cada modelo declarado en `db/schema.prisma` DEBE llevar escrito su modulo
propietario, y el sistema DEBE impedir que el cliente Prisma acceda a un modelo desde los
adaptadores driven de un modulo que no sea su propietario.

**R17.** El cliente Prisma compartido solo DEBE ser importable desde adaptadores driven,
`scripts/` y `tests/`.

## No regresion

**R18.** CUANDO se ejecute el gate completo (`./init.sh`) despues de la reestructuracion, el
sistema DEBE dejar en verde exactamente el mismo conjunto de archivos de test que estaba en
verde antes de ella, sin que ninguna asercion cambie de valor esperado; los unicos cambios
admitidos en los tests son la ruta del archivo, sus rutas de import y el modulo objetivo de
un `vi.mock`.

## Documentacion y guardia

**R19.** `docs/architecture.md` DEBE describir la estructura por modulos con arquitectura
hexagonal y NO DEBE presentar como vigentes las rutas `lib/services/`, `lib/repositories/`,
`lib/interfaces/` ni `lib/actions/`.

**R20.** El sistema DEBE incluir una guardia ejecutable que verifique R1, R2, R4, R5, R6,
R7, R9, R10, R11, R12, R13, R14, R15, R16, R17 y R19 recorriendo el arbol de archivos, y que
sea seleccionada por `pnpm run test:guardias` (patron `guard`).

**R21.** CUANDO la guardia evalue cada una de sus reglas, DEBE demostrar que la regla
detecta la violacion, ejecutandola sobre un fuente sintetico que la incumple; una asercion
de "no hay hallazgos" sobre el repo actual no cuenta como prueba de la regla (mismo patron
que `tests/guards/guard-password-never-plaintext.test.ts`).

---

## Preguntas abiertas

1. **Idioma de los nombres de modulo.** El board escribe `identity` (ingles) e `inventario`
   (español). Esta spec usa esos dos nombres literalmente para no inventar, pero no fija la
   regla para los modulos que vengan (`compras`/`purchasing`, `produccion`/`production`).
   ¿Se normaliza a un idioma? Si la respuesta llega despues de QC-14, renombrar cuesta un
   `git mv` y reescribir imports; con datos y rutas publicas ya en juego, no.

2. **Claves foraneas entre modulos.** R17 exige que solo el modulo propietario consulte sus
   modelos. En un ERP, `inventario` casi con seguridad necesitara referenciar `users` para
   auditoria (quien movio existencias). La FK en el esquema es inevitable; lo que esta sin
   decidir es si el modulo consumidor puede **leer** el modelo ajeno en un `include` de
   Prisma o debe pedir el dato al contrato del propietario. Esta spec elige lo segundo (mas
   estricto) porque es lo que hace cumplible la frontera, pero el coste real solo se vera en
   QC-14: si obliga a N+1 consultas en una pantalla de movimientos, hay que revisarlo.

3. **Componentes propios de un modulo.** Se decide (D4 de `design.md`) que `components/` y
   `hooks/` quedan fuera de la modularizacion. Queda sin decidir que se hace el dia que un
   modulo tenga 20 componentes propios que no son de una sola ruta: ¿siguen en
   `components/private/` o aparece `lib/modules/<m>/adapters/driving/components/`? No se
   resuelve ahora porque hoy no existe ni un solo caso, y decidirlo sin caso es inventar.

4. **Alcance de la reestructuracion sobre el comportamiento.** Se detectaron dos cosas que
   *parecen* mejorables pero cambiarian comportamiento y por tanto **quedan fuera** (ver
   restriccion 1 del encargo): (a) `verifyCredentials` devuelve siempre `{ ok: false }` —
   se mueve tal cual, la verificacion real es QC-7; (b) `getSessionUser` devuelve un usuario
   de relleno fijo — se mueve tal cual, la sesion real es QC-8. Se anotan aqui para que
   nadie los lea como olvidos de esta feature.
