# docs/verification.md — Cómo demostrar que funciona

"Compila" y "el agente dice que está listo" NO son verificación. Una feature está
verificada cuando hay evidencia ejecutable.

## El gate tiene DOS niveles — usa el que toca

```bash
./init.sh --rapido   # CERRAR UNA TANDA: typecheck + lint + tests relacionados + guardias (~1 min)
./init.sh            # CERRAR LA FEATURE y ANTES DE CADA PR: la suite entera
```

Comandos sueltos, por si necesitas uno concreto:

```bash
pnpm run typecheck        # TypeScript strict, cero errores
pnpm run lint             # ESLint, cero errores
pnpm test                 # la suite entera
pnpm run test:rapido      # lo que el grafo relaciona con tu diff vs origin/dev + las guardias
pnpm run test:guardias    # solo las guardias (van SIEMPRE, ver abajo)
pnpm exec vitest related --run <archivos>   # que tests cubren ESTOS archivos
```

### Por que dos niveles

Una suite madura son miles de tests y varios minutos. Correrla al cerrar **cada** tanda convierte
el arnes en una sala de espera: una feature de 9 tandas se lleva media hora de reloj **solo
esperando**, y el arnes existe para mejorar el trabajo, no para alargarlo. Cerrar la feature y
abrir el PR son otra cosa: ahi si se paga la suite entera.

Referencia medida el 2026-08-03 sobre un proyecto anterior que corria este mismo arnes
(QuimiCloude todavia no tiene suite propia; estas cifras son de donde salio la regla, no
una medicion de este repo):

| Que corres | Archivos | Tests | Tiempo |
| --- | --- | --- | --- |
| suite entera | 804 | 10.187 | ~235 s |
| relacionados con un servicio | 16 | 437 | 21 s |
| relacionados con un cambio en un util muy importado | 155 | 2.577 | 103 s |
| **`./init.sh --rapido` entero** (typecheck + lint + tests) | — | — | **~58 s** |

### Las guardias van SIEMPRE, y esta es la razon

`--rapido` selecciona por el **grafo de imports**. Las guardias **no importan lo que vigilan**:
recorren el arbol de archivos (censo de tablas, columnas sensibles, modulos puros, emisores de una
categoria). **Ningun grafo de imports las selecciona**, asi que serian justo lo que se pierde. Por
eso `test:rapido` las corre enteras siempre; cuestan ~8 s.

Se seleccionan por patron (`vitest run guard`), no por lista: una guardia nueva entra sola.

### Lo que `--rapido` NO cubre — no te engañes

- Acoplamientos que **no son imports**: SQL, nombres de archivo, lectura de `feature_list.json`.
- Un cambio en un archivo **sin tests que lo importen** selecciona cero tests y sale verde.
- Regresiones lejanas que solo aparecen con la suite entera.

Por eso **antes de abrir un PR se corre `./init.sh` completo, sin excepcion**. La leccion viene de
dos PRs de un proyecto anterior con este arnes y va justo en esa direccion: se mergeo mirando el
estado del PR —que es un build y **no corre tests**— y entro un guard rojo en `dev`.

**Detalle que importa al seleccionar en modo rapido:** el diff se calcula contra el **merge-base**
con `dev`, no contra el ultimo commit, o una tanda de tres commits solo mira el tercero:

```bash
pnpm exec vitest related --run $(git diff --name-only origin/dev...HEAD)   # tres puntos
```

> **Estado en QuimiCloude:** todavia no hay suite ni configuracion de Vitest, asi que los dos
> modos hacen hoy lo mismo (typecheck + lint) y el gate avisa con un `warn` de que el script de
> tests no existe. Es una deuda abierta, no un nivel que ya te cubre.

## Qué cuenta como evidencia
- Salida real de los tests pasando, pegada en `progress/impl_<feature>.md`.
- El mapa `R<n> → test`: para cada requisito, el test que lo cubre.
- Para features con UI o flujo crítico: un test E2E que ejercita el camino
  completo, no solo un unit test del helper.

## Qué NO cuenta
- "Debería funcionar."
- Un test que no asegura nada (sin asserts reales).
- Tests que el implementer escribió para pasar, sin cubrir el requisito.

## Datos (Supabase)
- **Verifica la autorizacion en el service**: un test que llame al metodo con un usuario
  sin permiso y confirme que lanza, sin llegar al repositorio. Ese es el test que cierra
  el requisito.
- Un test de RLS es **adicional**, y hay que saber leerlo: si lo escribes con Prisma
  saldra verde pase lo que pase, porque Prisma se conecta como dueño de la tabla y la
  policy no se le aplica (`docs/architecture.md > Acceso a datos y autorizacion`). Para
  que un test de RLS signifique algo tiene que ejercitar la via que RLS protege.
- Verifica migraciones aplicando y revirtiendo en un entorno de prueba: `down.sql` es
  convencion propia, nadie lo prueba por ti.

## Regla del reviewer
Si un requisito no tiene test, o un test no verifica el requisito que dice cubrir,
es hallazgo bloqueante. La feature no pasa a `done`.
