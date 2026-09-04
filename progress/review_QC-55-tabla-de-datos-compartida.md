# QC-55 - tabla-de-datos-compartida . review

Revisado el 2026-09-04 sobre `feature/QC-55-tabla-de-datos-compartida` (`git diff dev`), HEAD
`cc2f068`. Leidos: requirements.md (R1..R36, 21 decisiones cerradas, 6 preguntas abiertas),
design.md, tasks.md, progress/impl_QC-55-*.md, docs/architecture.md, docs/conventions.md,
docs/verification.md y CHECKPOINTS.md.

## Checklist

### Especificacion
- [x] requirements.md con R1..R36 en EARS.
- [x] design.md con seis alternativas descartadas (A..F) y su porque.
- [ ] tasks.md con todas las tasks [x]: T13 sigue sin marcar (ver B1).

### Trazabilidad
- [x] progress/impl_*.md contiene el mapa R<n> -> test, los 36 con test nombrado.
- [ ] Cada R<n> mapea a un test que de verdad lo verifica: 35 de 36 si. R18 NO, en su parte de
      calculo de los atajos: el test es autorreferencial (ver B2).

### Verificacion ejecutable (corrida por el reviewer, no leida de la bitacora)
- [x] ./init.sh completo: 152 archivos / 1694 tests passed, 0 rojos nuevos, migraciones con
      down.sql, .env presente, "== init OK ==", salida 0. Reproducido.
- [x] typecheck y lint limpios dentro del gate.
- [x] Sin E2E: correcto y diferido con motivo (decision 11); no es hallazgo.

### Calidad y seguridad
- [x] Sin tablas nuevas, sin migraciones, sin RLS aplicable, sin webhooks, sin secretos.
- [x] Capas separadas: no importa lib/modules, lib/composition, cliente de BD ni next/navigation.
- [x] No lee la sesion ni decide permisos (R30); toolbarActions entra por props.
- [x] Sin contexto hardcodeado: textos por props, tamanos de pagina desde lib/shared/pagination,
      con guardia contra los literales 10/25.
- [x] components/shared/ sin consumidor: excepcion declarada (decision 10, design.md > 11).

### Multiplataforma
- [x] Sin 100vh (guardia por test).
- [x] :hover nunca es via unica: el menu de columna se abre por boton visible y por teclado.
- [x] min-h-11 min-w-11 en menu de cabecera, paginacion, filtros y disparador del calendario.
- [x] text-base (16 px) en inputs de texto, numero y busqueda.
- [x] Librerias con soporte iOS verificado (headless / DOM estandar).
- [ ] Scroll anidado comprobado en iOS antes de darlo por bueno: NO hecho (T13, ver B1).

### Dependencias
- [x] package.json anade exactamente dos entradas directas: @tanstack/react-table ^9.2.4 y
      react-day-picker ^10.0.1. Verificado sobre el diff.
- [x] Las dos con fila en docs/dependencias.md, cuatro checks y aprobacion citada en design.md > 9.
- [x] cn y date-fns, coladas por el CLI, quedaron fuera; date-fns, @date-fns/tz y
      @tanstack/react-store solo existen bajo node_modules/.pnpm.
- [~] Utilidad de fechas escrita a mano: hay justificacion, pero vive en la bitacora y no en
      design.md, que sigue mandando date-fns (M1).

## Dictamen sobre los cuatro puntos declarados

### 1. Edicion a mano de components/ui/calendar.tsx y popover.tsx - ACEPTABLE, con reserva
Verificado: components.json declara "utils": "@/lib/utils", y los otros 16 archivos de
components/ui/ importan exactamente `import { cn } from "@/lib/utils"`; los dos nuevos quedan
alineados, no divergentes. Ni cn ni date-fns aparecen en dependencies.
NO verificable byte a byte: los dos archivos entraron ya normalizados en un unico commit (9ea0d3c),
git no guarda la version cruda del CLI y el registro de shadcn no es alcanzable desde este entorno.
Si se comprueba que el resto es salida idiomatica del CLI (data-slot, getDefaultClassNames,
buttonVariants, Base UI) y que no hay logica de la feature dentro.
Choque R33 / decision 16 contra regla 7 y R31: dejar el import tal cual exigia mantener cn@0.2.5
como entrada directa, que falla el check 3 (3.225 desc./sem.) y ademas rompe R31. Normalizar un
especificador que el propio components.json ya declara es el mal menor y deja el arbol coherente.
NO lo marco como bloqueante; queda como menor pendiente de ratificacion escrita del humano (m3).

### 2. Atajos de fecha con Date nativo - PREMISA VALIDA, EJECUCION DEFECTUOSA
Premisa verificada: no existe node_modules/date-fns (solo bajo .pnpm), asi que importarla exigiria
promoverla a directa y eso rompe R31. "R31 es requisito, 6.1 es un como" es correcto.
computeDateShortcutRange es pura, exportada y con test. Pero el calculo NO es correcto en los
bordes que el diseno queria evitar. Ejecutado:
- lastMonth el 2026-03-31 -> from = 2026-03-03 (setMonth desborda: 31 de febrero). subMonths daria
  2026-02-28. Mismo fallo el 29/30/31 de marzo y el 31 de mayo, julio, octubre y diciembre.
- lastYear el 2028-02-29 -> from = 2027-03-01. subYears daria 2027-02-28.
- lastWeek si es correcto, incluido cruce de mes y de ano.
El test no puede detectarlo porque reimplementa la misma aritmetica: compara
computeDateShortcutRange contra un from construido con d.setMonth(d.getMonth() - 1) /
d.setFullYear(...), es decir contra si mismo, y con una unica fecha de sistema (2026-06-15), mitad
de mes y ano no bisiesto. El test del control montado tambien se compara contra la funcion:
verifica el cableado, no el resultado. Es el anti-patron "utilidad escrita a mano que ya resuelve
una libreria del stack (fechas)". BLOQUEANTE (B2).

### 3. DATA_TABLE_FEATURES con tres capacidades - CORRECTO, el diseno estaba incompleto
Verificado contra el paquete instalado, no de memoria: en
node_modules/.pnpm/@tanstack+table-core@9.2.4/.../dist/features/column-sizing/columnSizingFeature.js
se registran column_getStart y column_getAfter; columnPinningFeature.js NO los aporta (solo
getIsPinned, getCanPin, getPinnedIndex y los agrupadores start/center/end). Como es design.md > 5
quien manda calcular el offset con getStart(), registrar columnSizingFeature es lo que cumple R24
por el mecanismo pedido, no una capacidad de mas: la interactiva (columnResizingFeature) sigue
fuera junto a las otras trece, y el test lo afirma nombrandolas. No es hallazgo contra la
implementacion; si contra la documentacion, que quedo desactualizada (M2).

### 4. T13 (sticky anidado en iOS) - NO CERRABLE EN SILENCIO
docs/architecture.md es literal: "position: fixed y scroll anidado se comprueban en iOS antes de
darlos por buenos". La decision 17, cerrada por el humano, dice "y comprobado en iOS" y se declara
el punto caliente de la ficha. Los tests demuestran la estructura (overflow-x-auto en
div[data-slot=table-container], sin ancestro con scroll, offsets de getStart/getAfter, sin 100vh),
no el comportamiento de WebKit, que es lo que la regla exige.
Dictamen: exigir la comprobacion aqui no es viable -ninguna pantalla monta el componente, no hay
URL que abrir y fabricar una pantalla de prueba es justo lo que la decision 11 rechazo para el
E2E-; el sitio natural es QC-56. Pero el reviewer no traslada una decision cerrada del humano. Es
bloqueante para cerrar la ficha como esta, y se desbloquea SIN tocar codigo en cuanto el humano
deje por escrito el traslado: fila nueva en "Decisiones cerradas", T13 marcada como trasladada a
QC-56 con la referencia, y requisito/task explicito en QC-56 que lo recoja. Lo que no vale es
dejar T13 sin marcar y la ficha en done.

## Hallazgos

- **B1 . BLOQUEANTE - T13 sin hacer y sin traslado escrito.** CHECKPOINTS > Especificacion exige
  todas las tasks [x]; docs/architecture.md exige comprobar el scroll anidado en iOS antes de darlo
  por bueno y la decision 17 lo repite. Falta: la comprobacion real, o el traslado explicito a
  QC-56 firmado por el humano mas T13 marcada como trasladada. No requiere cambiar codigo.
- **B2 . BLOQUEANTE - computeDateShortcutRange da rangos incorrectos a fin de mes y en bisiesto, y
  su test no puede detectarlo (R18, R36).** Falta: corregir el calculo (fijar el dia al ultimo del
  mes destino cuando desborda) y sustituir el test por casos con fechas fijas y resultados escritos
  a mano -31 de mes largo, 29 de febrero, cruce de ano-, sin reimplementar la formula. Hoy R18 no
  tiene un test que lo verifique de verdad, y la regla 4 de CLAUDE.md no lo admite.
- **M1 . mayor - la desviacion de design.md > 6.1 no esta en design.md.** El diseno sigue diciendo
  que los atajos usan date-fns; el porque de no usarla vive solo en la bitacora, y
  docs/architecture.md > Anti-patrones pide que ese porque este en el design.md.
- **M2 . mayor - documentacion desincronizada con DATA_TABLE_FEATURES.** design.md > 4 y la fila de
  @tanstack/react-table en docs/dependencias.md siguen diciendo "se activan SOLO
  columnPinningFeature y rowSortingFeature". El codigo, correctamente, registra tres.
- **m3 . menor - edicion de las dos primitivas pendiente de ratificacion humana** (dictamen 1). Sin
  cambio de codigo: basta la ratificacion escrita, idealmente como fila en la tabla de decisiones
  para que R33 no quede contradicho a futuro.
- **m4 . menor - focusColumnFilter busca por document.querySelector sin acotar por tableId**
  (data-table.tsx:227). Con dos tablas en pantalla y una columna con el mismo id, "abrir el filtro"
  puede llevar el foco al control de la otra tabla. No viola ningun R<n>, pero QC-56 se lo
  encuentra.
- **m5 . menor - DataTableTexts gano la clave columnMenu** respecto a design.md > 3.3. Adicion
  coherente (aria-label del disparador), declarada en la bitacora; falta reflejarla en el diseno.
- **m6 . menor - DataTableColumn no expone size**, asi que los offsets del pineo son multiplos del
  default de 150 px de la libreria. La bitacora lo deja como hallazgo para QC-56; correcto no
  haberlo anadido por cuenta propia (regla 6).

## No son hallazgos (verificado)

- Sin E2E (decision 11).
- components/shared/ sin consumidor (decision 10, design.md > 11): excepcion declarada.
- recipe-form.tsx y file-field.tsx en el diff: entran por el merge 4f8ebd5 de dev (QC-52 y el fix
  de UI). Confirmado con git log dev..HEAD sobre esos archivos.
- Las 6 preguntas abiertas siguen abiertas; las cuatro de F1.2 se implementaron con la salida
  conservadora de design.md > 13, cada una aislada en un archivo. Ninguna se relleno con un
  supuesto no declarado.
- Las 21 decisiones cerradas se respetan, salvo la 16 (interpretada, m3) y la 17 (no cumplida
  todavia, B1).

## Veredicto

**RECHAZADO.** Dos bloqueantes: B1 (T13 sin hacer y sin traslado escrito) y B2 (calculo de los
atajos de fecha incorrecto a fin de mes y en bisiesto, con test autorreferencial que no verifica
R18). Mas dos mayores documentales (M1, M2) y cuatro menores. B1 se resuelve sin tocar codigo; B2
vuelve al implementer.
