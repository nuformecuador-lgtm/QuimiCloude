# QC-77 — unit de nombres, huella, URL y clasificacion

Lo que hasta ahora estaba medido a mano una sola vez (nombres, huella y clasificacion) pasa a
tener tests que vuelven a correr solos. Todo son funciones puras: el archivo cae en el proyecto
`node` de Vitest y **no abre ninguna conexion**.

## Archivos

- **Creado:** `tests/unit/test-database/nombres-y-huella.test.ts` (18 casos).
- **`tests/helpers/test-database.ts`: sin cambios.** Se muto temporalmente para las pruebas de
  mutacion y se restauro por copia; `md5sum` antes y despues: `718ad4e921f606a803200c7321083a7f`.

## Mapa `R<n>` -> caso

| Caso | R |
| --- | --- |
| el nombre de la base de cada corrida > lleva el prefijo reservado, la clave de la ficha, la identidad del worktree y la corrida | R4 |
| el nombre de la base de cada corrida > cae en una clave legible cuando el directorio del worktree no deja ninguna letra ni digito | R4 |
| el nombre de la base de cada corrida > es un identificador de Postgres valido en todos los casos | R4 |
| el nombre de la base de cada corrida > da identidades distintas a worktrees distintos | R10 |
| el nombre de la base de cada corrida > da la misma identidad al mismo worktree escrito de dos formas distintas | R10 |
| el nombre de la base de cada corrida > es estable: la misma ruta da siempre la misma identidad | R10 |
| el nombre de la base de cada corrida > no colisiona entre dos corridas del mismo worktree, ni por reloj ni por proceso | R10 |
| el nombre de la plantilla > es el prefijo reservado mas la huella de las migraciones | R4, R5 |
| la huella de las migraciones > son 12 hex y no cambia si no cambia nada del arbol | R6 |
| la huella de las migraciones > cambia cuando se anade una migracion | R5 |
| la huella de las migraciones > cambia cuando se borra una migracion | R5 |
| la huella de las migraciones > cambia cuando cambia el contenido de una migracion | R5 |
| la huella de las migraciones > cambia cuando cambia el sembrado | R5 |
| la URL de la base efimera > sustituye solo el nombre de la base y conserva credenciales, host, puerto y query | R1 |
| la clasificacion ... > reconoce las bases de corrida y las plantillas del prefijo reservado | R28 |
| la clasificacion ... > reconoce la forma heredada QuimiCloude_QC<n> | R28 |
| la clasificacion ... > deja como desconocido todo lo demas, incluida la base de desarrollo | R28, R30 |
| el contrato del modulo > exporta solo identificadores escritos en ingles | R31 |

Los cuatro casos de la huella **no tocan `db/migrations/`**: copian a `os.tmpdir()` solo lo que
entra en la huella (las migraciones, `scripts/seed.ts` y `seed-initial-access.ts`), modifican la
copia y borran el temporal en el `afterAll`.

## Verificacion

```
$ pnpm run typecheck
> tsc --noEmit
(sin salida: verde)

$ pnpm run lint
> eslint
(sin salida: verde)

$ pnpm exec vitest run tests/unit/test-database/nombres-y-huella.test.ts
 Test Files  1 passed (1)
      Tests  18 passed (18)
   Duration  22.64s
```

No se corrio la suite completa, ni `./init.sh`, ni nada de `tests/integration/**`.

## Que los tests muerden: cuatro mutaciones, cuatro rojos

Cada mutacion se aplico sobre `tests/helpers/test-database.ts` y se restauro con `cp` desde una
copia (`/tmp/test-database.ts.bak`), nunca con `git checkout`.

**1. `normalizePath` sin `.toLowerCase()`** (la normalizacion de mayusculas de la ruta):

```
× el nombre de la base ... > lleva el prefijo reservado, la clave de la ficha, ...
  → expected 'qct_77aislamient_bb381b50_mty7rr40_39u' to match /^qct_qc77_[0-9a-f]{8}_...
× el nombre de la base ... > da la misma identidad al mismo worktree escrito de dos formas distintas
  → expected 'bb3f72b1' to be '64340d3d' // Object.is equality
      Tests  2 failed | 16 passed (18)
```

**2. `classifyDatabaseName`: `/^QuimiCloude_QC\d+$/` -> `/^QuimiCloude_(QC)?\w+$/`**:

```
× la clasificacion ... > deja como desconocido todo lo demas, incluida la base de desarrollo
  → expected 'legacy' to be 'unknown' // Object.is equality
      Tests  1 failed | 17 passed (18)
```

**3. `withDatabaseName` tirando la query (`parsed.search = ''`)**:

```
× la URL de la base efimera > sustituye solo el nombre de la base y conserva credenciales, ...
  → expected '' to be '?schema=public&connection_limit=1' // Object.is equality
      Tests  1 failed | 17 passed (18)
```

**4. `migrationsFingerprint` dejando el sembrado fuera de la huella**:

```
× la huella de las migraciones > cambia cuando cambia el sembrado
  → expected '9617a1bc8e5e' not to be '9617a1bc8e5e' // Object.is equality
      Tests  1 failed | 17 passed (18)
```

Una quinta mutacion que se probo **no** puso nada en rojo, y esta bien que no lo hiciera:
cambiar `\d+` por `\w+` dentro de `QuimiCloude_QC\w+$` no toca `QuimiCloude_FIXGATE`, que ni
siquiera empieza por `QuimiCloude_QC`. De ahi salio la mutacion 2, que si es la que corresponde
a lo que ese caso protege.

## Hallazgos

1. **`main` no es la marca del worktree principal, sino el ultimo recurso.** `design.md > 2` dice
   «`main` si se corre desde el worktree principal», pero `worktreeKey` saca la clave del nombre
   del directorio y solo devuelve `main` cuando la sanitizacion deja la cadena vacia. Desde el
   worktree principal de esta maquina (directorio `labs`) el nombre sale `qct_labs_...`, no
   `qct_main_...`. **No es un fallo funcional** —la identidad real es el `<wt8>` y el `<key>` es
   solo legibilidad— pero el texto del design no describe lo que hace el codigo. El test esta
   escrito contra el **comportamiento real** y deja constancia de las dos ramas.
2. **`tests/helpers/test-database.ts` no tiene efectos al importarse**: el archivo se importa
   entero (`import * as`) en un proyecto sin base y los 18 casos corren sin abrir ninguna
   conexion ni leer el `.env`. Lo que declara su cabecera se cumple.
3. **Ninguna dependencia nueva** (R23): solo `node:fs`, `node:os`, `node:path` y Vitest.
