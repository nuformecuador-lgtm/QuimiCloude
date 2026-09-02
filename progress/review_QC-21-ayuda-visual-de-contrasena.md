# QC-21 — ayuda-visual-de-contrasena · review

> Escrita por `reviewer` el 2026-09-02 en el worktree
> `.worktrees/QC-21-ayuda-visual-de-contrasena` (rama `feature/QC-21-ayuda-visual-de-contrasena`,
> 3 commits sobre `merge-base 2f33fe9`). El reviewer no edita codigo: todo lo de aqui es veredicto.

## VEREDICTO: **RECHAZADO** — 2 bloqueantes, 5 menores

El componente esta bien construido y el gate ejecutable sale verde. Se rechaza por dos cosas que
no son de codigo de produccion sino de la red que lo verifica y de la spec: un centinela que va a
teñir de rojo el gate de features ajenas (B1) y un requisito que el sistema entregado no cumple y
que nadie ha corregido en `requirements.md` (B2). Ninguno se arregla tocando `components/shared/`.

---

## 1. Verificacion ejecutable — corrida por el reviewer, no leida de la bitacora

`./init.sh` aborta en el validador por el defecto conocido y ajeno de
`scripts/validate-features.mjs` (`WT_DIR = '.worktrees'` relativo al cwd). Hay decision humana de
convivir con el, asi que no se cuenta como hallazgo y se corrio a mano todo lo que `init.sh`
ejecuta despues del validador.

| Comando | Resultado real obtenido por el reviewer |
|---|---|
| `pnpm run typecheck` | `tsc --noEmit`, exit 0, sin salida |
| `pnpm run lint` | `eslint`, exit 0, sin salida |
| `pnpm test` (suite ENTERA) | `Test Files 49 passed (49)` · `Tests 511 passed (511)` · 78.26s · exit 0 |
| `pnpm run test:guardias` | `Test Files 7 passed (7)` · `Tests 78 passed (78)` · 807ms |
| `node scripts/validate-features.mjs` | unica linea: `faltan specs para features sdd en vuelo: QC-29`. Ningun otro error. |

Coincide exactamente con lo que declara `progress/impl_QC-21-…md`. El delta declarado
(+3 archivos, +33 tests sobre 46/478) es coherente: 49-46=3, 511-478=33.

### Diff realmente revisado

`git diff dev..HEAD` es engañoso en este worktree: `dev` avanzo con QC-24 despues de que la rama
saliera, asi que muestra 41 archivos, la mayoria como borrados ajenos. El diff real es contra el
punto de divergencia:

```
git merge-base dev HEAD = 2f33fe9cd22665e76537200399eac9fdebc88f60
git diff --stat 2f33fe9..HEAD  ->  10 archivos, 1751 insertions(+), 0 deletions(-)
```

Seis de codigo/tests + tres de spec + la bitacora. Cero archivos existentes modificados,
confirmado: el diff no tiene ni una linea de borrado. `package.json` no aparece en el diff.

### QC-29 (sesion en paralelo): intacto

Ninguno de `app/globals.css`, `app/layout.tsx`, `components/private/app-sidebar.tsx` ni
`components/shared/theme-provider.tsx` aparece en el diff. Sin solape.

### Pruebas de mordida (rotas a proposito por el reviewer y revertidas)

El worktree quedo limpio (`git status --porcelain` vacio) y los tres archivos de test vuelven a
salir verdes (3 passed / 33 tests) tras revertir.

| Prueba | Resultado |
|---|---|
| `readonly password: string;` inyectado en `credential-requirements.tsx` | ROJO, nombrando el archivo: `components/shared/credential-requirements.tsx: password: expected [ 'password' ] to deeply equal []` |
| `readonly password?: string;` (opcional) en el mismo archivo | VERDE — el centinela NO muerde. Ver m-1 |
| `lib/modules/zz_probe/probe.ts` creado sin commitear | ROJO: `esta rama toco app/, db/ o lib/: expected [ 'lib/modules/zz_probe/probe.ts' ]`. Ver B1 |

---

## 2. Checklist de `CHECKPOINTS.md`

### Especificacion
- [x] `requirements.md` con EARS numerados R1–R22, sin saltos.
- [x] `design.md` con siete alternativas descartadas y su porque (`> 9`, apartados a–g).
- [x] `tasks.md` con T0–T7 marcadas `[x]`. T8 (gate completo + PR) es del leader y esta declarada
      como tal en la propia task; no es un hueco del implementer.

### Trazabilidad
- [x] Los 22 `R<n>` tienen al menos un test nombrado, y los nombres del mapa coinciden
      literalmente con los `it(...)` reales (verificado uno a uno contra los tres archivos).
- [ ] R5 mapea a un test que no verifica su clausula principal. Ver B2.
- [x] `progress/impl_<feature>.md` contiene el mapa `R<n> -> test`.

### Calidad de codigo
- [x] `typecheck`, `lint`, `pnpm test` en verde (arriba).
- [x] E2E: NO APLICA, diferido con motivo escrito en la fila 4 de las decisiones cerradas. Es
      ayuda visual, no decide si se entra ni si se guarda. No se reabre.
- [~] Multiplataforma: cumple salvo la altura del input, excepcion declarada en `design.md > 6` +
      pregunta abierta 4. Ver m-2.
- [x] Dependencias: ninguna añadida. `package.json` fuera del diff. `lucide-react`, el unico
      import de terceros nuevo en los componentes, ya tiene su fila en `docs/dependencias.md:36` y
      ya se usaba en `components/private/app-sidebar.tsx`. Sin utilidad a mano que duplique una
      libreria del stack.

### Datos y seguridad (Supabase)
- [x] NO APLICA en bloque, y se declara en vez de omitirse (`tasks.md > Checklist`): la feature no
      crea ni consulta ninguna tabla, no añade migracion, no añade variable de entorno, no toca
      `db/` ni `lib/`. Sin tablas nuevas -> sin RLS/`FORCE` que exigir. Sin webhooks -> sin firma
      ni idempotencia que exigir. Sin secretos hardcodeados: no hay ni una cadena de credencial en
      los tres archivos; lo unico sensible es el texto que la persona escribe, que vive en un
      `useState` interno y no sale del componente.

### Modulos hexagonales
- [x] Los componentes importan el barrel `@/lib/modules/identity`, nunca ruta profunda (verificado
      en los tres archivos).
- [x] Sin `@/lib/composition`, sin `adapters/driven`, sin `next/headers`, sin `use server` — y hay
      centinela de texto que lo vigila.
- [x] `guard-arquitectura-modulos` en verde dentro de las 7 guardias.

### Permisos / Configuracion
- [x] Componente presentacional puro: recibe todo por props y no fetchea nada (R14). Aplica por
      analogia la regla de `private/` aunque viva en `shared/`.
- [x] Sin mutaciones, sin Server Actions, sin nada que cambie entre entornos.

### Verificacion final
- [ ] `./init.sh` completo: no verde, pero por causa ajena y con decision humana de convivir. No
      cuenta contra QC-21.
- [x] Este archivo existe. Veredicto: RECHAZADO.
- [ ] Entrada en `progress/history.md`: pendiente (es del leader, tras el OK).
- [ ] Desmontaje del worktree: pendiente (es del leader).

---

## 3. Los tres puntos de lupa

### 3.1 D2 — R5 es literalmente insatisfactible. ¿Fue correcta la respuesta?

La conducta del implementer fue la correcta; el estado en el que deja la spec, no.

Confirmado ejecutando: `evaluateCredentialRules('')` devuelve cinco codigos en `unmet`.
`max_length` esta cumplida con la cadena vacia porque la politica de QC-19 es
`candidate.length <= CREDENTIAL_MAX_LENGTH` y 0 <= 64.

Lo que acierta: no tocar `requirements.md` desde un test, no tocar QC-19 (esta `done`), y sobre
todo no forzar `max_length` a `unmet` en el componente. Forzarlo habria sido inventar un estado
que la funcion pura no devuelve, que es exactamente lo que R2 prohibe, y habria producido el
desfase clasico: verde/rojo en pantalla que no coincide con el veredicto del servidor. El
componente no esta tapando nada: `deriveState` deriva las seis de `unmet` sin excepciones ni casos
especiales, y eso es auditable en tres lineas (`credential-requirements.tsx:50-57`).

El test que quedo: ¿es discriminante o pasa por construccion? Es mixto, y hay que decirlo sin
adornos:

1. `expect(screen.getAllByRole('listitem')).toHaveLength(CREDENTIAL_RULES.length)` tras un render
   sin foco, sin escritura y sin raton — discriminante de verdad. Es la clausula de R5 que importa
   para la accesibilidad (la lista no es un tooltip) y muerde si alguien la esconde detras de un
   `:focus` o un `:hover`.
2. El bucle que compara `data-state` contra `unmet.includes(rule)` es un test espejo: el test
   recalcula la derivacion con la misma funcion que usa el componente. No puede detectar un error
   en el criterio, pero si detecta entradas que faltan, `data-rule` mal puesto, estados escritos a
   mano y que el componente ignore la candidata. No es vacio, es debil.
3. `expect(unmet.filter(...).length).toBe(LIVE_RULES.length - 1)` no afirma nada sobre el
   componente: es una asercion sobre el dominio de QC-19. Documenta el "5 de 6", no lo verifica en
   pantalla.

Conclusion: el test no pasa por construccion, pero no verifica la clausula principal de R5 tal
como esta escrita, porque esa clausula es falsa. El problema no es el test: es que
`requirements.md` sigue afirmando algo que el sistema entregado no hace, y el nombre del `it(...)`
—`con la candidata vacia las seis salen incumplidas y la lista es visible sin interaccion`—
repite esa afirmacion falsa en el mapa de trazabilidad. Eso es B2, y se cierra con una linea de
`requirements.md`, no con codigo.

### 3.2 D3 — ¿el arreglo del centinela de R19 mantiene el assert duro?

Mantiene el assert duro, si. Pero no ha desactivado la bomba: la ha aplazado y la ha apuntado a
otras features. Es B1.

Lo que se quito (`expect(cambios.length).toBeGreaterThan(0)`) estaba bien quitado: habria fallado
para siempre en cuanto la rama se fusionara. El diagnostico del implementer es correcto.

Lo que queda es el problema:

```ts
const cambios = changedFilesSinceDevDiverged();   // diff de LA RAMA QUE ESTE CORRIENDO
const bajoRutaProhibida = cambios.filter(
  (file) => file.startsWith('app/') || file.startsWith('db/') || file.startsWith('lib/'),
);
expect(bajoRutaProhibida, 'esta rama toco app/, db/ o lib/').toEqual([]);
```

`changedFilesSinceDevDiverged()` no lee nada de QC-21: lee el estado ambiental de git del checkout
en el que se ejecute, via `git merge-base HEAD origin/dev` mas `git status --porcelain`. Hoy, en
esta rama, eso equivale a los archivos de QC-21 y el assert muerde (verificado: el probe
`lib/modules/zz_probe/probe.ts` lo puso rojo). Pero este archivo de test se fusiona a `dev` con la
feature. A partir de ahi, cualquier rama futura que salga de `dev` y toque `app/`, `db/` o `lib/`
va a ejecutar este test en su propio worktree, calcular SU diff y fallar por archivos que no son
suyos ni de QC-21. Es decir: QC-32, QC-36 y practicamente toda feature de backend.

Es el mismo patron que costo un bloqueante en QC-6 y que otra sesion acaba de encontrar cinco
veces mas en QC-14 y QC-19, solo que con el recurso compartido disfrazado: aqui el censo global no
es "cuantas migraciones hay" sino "que archivos ha tocado la rama que ejecuta el test".

El ancla que se añadio para compensar no compensa nada:

```ts
for (const { path, source } of NEW_FILES) {
  expect(path.startsWith('app/') || path.startsWith('db/') || path.startsWith('lib/'), …).toBe(false);
}
```

`NEW_FILES` son tres literales de cadena escritos en el propio test
(`'components/shared/credential-rule-labels.ts'`, etc.). `'components/shared/…'.startsWith('app/')`
es falso por construccion: ese assert no puede fallar salvo que alguien edite el literal. Lo unico
real que aporta es `source.trim().length > 0`, y eso ya lo garantiza el `readFileSync` de arriba,
que lanza si el archivo no existe. El comentario del test dice que este ancla «garantiza que el
bloque sigue teniendo algo real que verificar»: no es cierto, y conviene que no quede escrito como
si lo fuera.

### 3.3 R22 — ¿el centinela muerde?

Muerde, y nombra el archivo. Roto a proposito con `readonly password: string;` en
`credential-requirements.tsx`, el test sale rojo con
`components/shared/credential-requirements.tsx: password: expected [ 'password' ] to deeply equal []`.
Confianza ganada, no supuesta. El acierto de diseño esta en importar
`findPlaintextPasswordDeclarations` de la guardia en vez de copiar el criterio: si la guardia
endurece su criterio, R22 lo hereda solo.

Pero hay un punto ciego que la prueba de mordida destapo y que conviene no dejar sin escribir
(m-1): con el prop declarado como opcional —`readonly password?: string;`— el centinela NO muerde.
El regex de la guardia
(`/(?:^|[{,;(])\s*(?:readonly\s+)?['"]?([A-Za-z_$][\w$]*)['"]?\s*[:=]/gm`) exige `:` o `=` justo
detras del identificador, y el `?` de la propiedad opcional lo rompe. Es un defecto de la guardia
compartida, no de QC-21 —y R22 esta redactado precisamente «segun el mismo criterio que aplica
`guard-password-never-plaintext`», asi que el requisito se cumple al pie de la letra—. Pero pesa
mas aqui que en el resto del repo: todas las props de estos dos componentes se declaran con la
forma `readonly x?: …`, que es justo la que el detector no ve.

---

## 4. Otras comprobaciones que este repo exige

- Los tres estados de `breached`: correcto. `CredentialRuleState = met | unmet | unknown`, con
  `breachedState = unknown` como valor por defecto del parametro
  (`credential-requirements.tsx:65`), no como fallback. `deriveState` devuelve `breachedState` sin
  mirar `unmet` para esa regla, asi que ninguna candidata puede moverla por si sola — verificado
  por el test que barre cuatro candidatas distintas. Neutro por defecto, no incumplida.
- Bloqueo parcial del envio: correcto y no arreglado por su cuenta. Las tres filas de
  `design.md > 4` estan cubiertas por tests reales con `user-event` sobre un formulario de prueba:
  deshabilitado con candidata incompleta, habilitado con la septima todavia neutra, y sigue
  habilitado tras el veredicto de filtrada. El componente no renderiza el boton: el `disabled`
  sale de `onOwnRulesMetChange` en el formulario, que es el cableado que heredara QC-36.
- Ninguna regla redeclarada: confirmado leyendo los tres archivos. `CREDENTIAL_RULES`,
  `evaluateCredentialRules`, `CREDENTIAL_MIN_LENGTH` y `CREDENTIAL_MAX_LENGTH` vienen del barrel.
  Los numeros del copy se interpolan desde las constantes (`credential-rule-labels.ts:22-23`), no
  se escriben a mano — y hay centinela de texto que prohibe literales numericos sueltos y regex de
  composicion en los tres archivos.
- Censo global de un recurso compartido: encontrado uno, el de R19. Ver B1. Los demas tests iteran
  `CREDENTIAL_RULES` importado, que es lo correcto: si QC-19 añade una regla, los tests lo exigen
  sin editarse (R3).
- Emision de la candidata (R21): verificado por un test con marcador
  (`CANDIDATA-SECRETA-MARCADOR-9x7Q`) contra `container.innerHTML`. Discriminante de verdad: si
  alguien pusiera la candidata en un atributo `data-*` o en un texto, sale rojo.

---

## 5. Hallazgos

### BLOQUEANTES

**B1 — El centinela de R19 afirma sobre el diff de la rama que lo ejecuta: va a teñir de rojo el
gate de features ajenas.**
`tests/unit/credential-help-contract.test.ts:145-168`. El assert
`expect(bajoRutaProhibida).toEqual([])` se calcula sobre `git merge-base HEAD origin/dev` mas
`git diff` mas `git status` del checkout en el que corre, no sobre nada que pertenezca a QC-21.
Verificado empiricamente: basta con que exista `lib/modules/zz_probe/probe.ts` sin commitear para
que el test falle. Una vez esta rama se fusione a `dev`, toda rama posterior que toque `app/`,
`db/` o `lib/` —QC-32, QC-36, cualquier ficha de backend— fallara este test por archivos que no
son suyos. El `cambios.length > 0` se quito bien, pero la mitad que queda sigue siendo el patron
de QC-6/QC-14/QC-19. Agravante: el ancla sobre `NEW_FILES` que se añadio para compensar es una
tautologia (una ruta literal que empieza por `components/shared/` nunca puede empezar por `app/`),
y el comentario del test afirma que garantiza algo que no garantiza.
Que falta para cumplirlo: que R19 se verifique sobre algo que pertenezca a la feature y no sobre
el estado de git de un checkout cualquiera — p. ej. acotando el diff a los commits de la feature,
o sustituyendo el bloque por asserts sobre el arbol real (`components/shared/` contiene exactamente
estos tres archivos, y no existe ningun archivo bajo `app/`, `db/` o `lib/` que mencione estos
componentes). Y que el comentario deje de afirmar que el ancla garantiza algo. Vuelve al
implementer.

**B2 — `requirements.md > R5` afirma algo que el sistema entregado no cumple, y sigue sin
corregir.**
R5 exige mostrar las seis como incumplidas con la candidata vacia. El sistema muestra cinco
incumplidas y `max_length` cumplida, y eso es lo correcto (forzar la sexta violaria R2). El
implementer hizo lo que debia: no mintio en el componente, no reabrio `requirements.md` desde un
test y escalo la discrepancia en D2. Pero el resultado es que queda en `specs/` un requisito
falso, mapeado a un `it(...)` cuyo nombre repite la afirmacion falsa (`con la candidata vacia las
seis salen incumplidas y la lista es visible sin interaccion`) y que en realidad solo verifica la
segunda mitad. Con eso, la trazabilidad R5 hacia test no se sostiene: el test no verifica lo que
el requisito dice.
Que falta para cumplirlo: una decision del leader o del humano, no codigo. Matizar la redaccion de
R5 —p. ej. «DEBE mostrar como incumplidas todas las de las seis que `evaluateCredentialRules`
devuelva en `unmet` para la cadena vacia, y la lista completa DEBE ser visible desde el primer
render»— y renombrar el `it(...)` y sus filas en los dos mapas de trazabilidad para que digan lo
que de verdad afirman. El codigo de `components/shared/` no se toca.

### Menores

**m-1 — El criterio de R22 no ve las propiedades opcionales.** Verificado rompiendo el codigo:
`readonly password: string;` sale rojo; `readonly password?: string;` sale verde. El regex de
`declaredIdentifiers` en la guardia exige `:` o `=` pegado al identificador, y el signo de
interrogacion de la propiedad opcional lo rompe. Es defecto de la guardia compartida, y R22 esta
redactado «segun el mismo criterio que aplica `guard-password-never-plaintext`», asi que el
requisito se cumple literalmente. Pero el punto ciego cae justo en la forma que usan todas las
props de esta feature. Material de `/afinar-regla` sobre la guardia (que ademas la arreglaria para
`db/`, `lib/`, `app/` y `scripts/`, donde hoy tambien es ciega). Anotar en
`progress/current.md > Deudas`.

**m-2 — Altura del input por debajo de 44x44 px, con excepcion declarada.** `credential-field.tsx`
es codigo nuevo que renderiza un target tactil de 32 px (`components/ui/input.tsx`, `h-8`).
`docs/architecture.md > Interaccion` pide 44x44. No se bloquea porque `design.md > 6` declara la
excepcion y da la razon (es shadcn sin editar; subirlo es alcance de QC-29/QC-30; esta ficha no
toca `components/ui/`), y la pregunta abierta 4 lo deja por escrito — que es exactamente lo que la
clausula de excepcion exige. El `font-size` si cumple: `text-base md:text-sm` es 16px en movil,
sin zoom de iOS. Sin `100vh`, sin `:hover` como unica via de activacion, sin libreria de UI sin
soporte verificado. Debe cerrarse antes de que QC-36 ponga esto delante de un usuario.

**m-3 — D5 confirmado: importar de la guardia duplica sus 6 tests.**
`tests/unit/credential-help-contract.test.ts` reporta 12 tests siendo 6 suyos; los otros 6 son los
`it(...)` de `guard-password-never-plaintext.test.ts`, que se registran al importarlo. No rompe
nada y las aserciones siguen siendo correctas, pero infla el conteo de la suite: parte del +33
declarado son tests que ya existian. La alternativa —copiar el criterio— es peor y el diseño la
descarta con razon. La solucion limpia (extraer el detector a un modulo no-test que la guardia
reexporte) toca un archivo de guardia compartido: es `/afinar-regla`. Bien declarado, no
silenciado.

**m-4 — D1 confirmado, cosmetico.** `tasks.md > T0` y `design.md > 1` citan `vitest.config.ts`; el
archivo real es `vitest.config.mts`. Error de la spec, no del implementer, que no creo ni renombro
nada. Sin impacto.

**m-5 — El test de R5 es un test espejo en su nucleo derivativo.** Recalcula el estado esperado con
la misma `evaluateCredentialRules` que usa el componente, asi que no puede detectar un error en el
criterio de derivacion: solo entradas que falten, `data-rule` mal puesto o estados escritos a
mano. Es aceptable —R2 obliga precisamente a que la unica fuente sea esa funcion, asi que no hay
un segundo oraculo legitimo— y no es vacio, pero conviene no leerlo como mas fuerte de lo que es.
Lo que si es fuerte de ese test es la asercion de visibilidad sin interaccion.

---

## 6. Lo que esta bien y merece quedar escrito

- No se relajo la guardia para pasar. Los nombres dicen `credential` y `candidate`; el unico
  literal `password` de los componentes es el valor de `type="password"` y de
  `autoComplete?: new-password`, que no son identificadores declarados.
- La candidata tiene un solo dueño. `useState` interno en `credential-field.tsx`; el consumidor
  recibe un booleano, nunca el texto. `design.md > 9(e)` argumenta bien por que se rompe aqui el
  patron de campo controlado.
- Cero archivos existentes modificados en una feature de UI. Cero solape con QC-29, que corre a la
  vez sobre `components/`.
- Las cuatro preguntas abiertas siguen abiertas y ninguna se relleno con supuestos (regla 6). La
  quinta que abre D2 esta bien escalada.
- Las decisiones incomodas no se maquillaron: el bloqueo parcial del envio y la ausencia de
  `aria-live` son decisiones cerradas y declaradas, no defectos, y el implementer las respeto.

## 7. Que tiene que pasar para el OK

1. B1 vuelve al implementer: reescribir el bloque de R19 para que no afirme sobre el diff de la
   rama que lo ejecute, y corregir el comentario que atribuye al ancla una garantia que no da.
2. B2 vuelve al leader o al humano: matizar la redaccion de R5 en `requirements.md` y renombrar el
   `it(...)` y sus dos filas de trazabilidad. Sin tocar `components/shared/`.
3. Re-review, y `./init.sh` completo desde la raiz del repo antes del PR.

Los cinco menores no bloquean; m-1, m-2 y m-3 deben quedar anotados en
`progress/current.md > Deudas y cosas abiertas` en vez de desaparecer con la rama.
