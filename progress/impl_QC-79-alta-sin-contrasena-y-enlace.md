# QC-79 — alta-sin-contrasena-y-enlace · bitacora de implementacion

> Worktree: `.worktrees/QC-79-alta-sin-contrasena-y-enlace` · Rama
> `feature/QC-79-alta-sin-contrasena-y-enlace` desde `origin/dev` (`398dfd6`).
> El **que** en `requirements.md` (R1-R41), el **como** en `design.md`, el orden en `tasks.md`.

## T1 — Anclas del diseno verificadas sobre el arbol de esta rama

Las **seis** que pide T1, con ruta y linea. **Ninguna difiere** de lo que `design.md` supone:

| Ancla | Donde | Estado |
| --- | --- | --- |
| Firma de `UserAdminRepository.create` | `lib/modules/identity/ports/user-admin-repository.ts:140-146` — `create(companyId, data: NewUser, credentialHash: string, accountStatus: 'pending', now: Date): Promise<{ id: string } \| DuplicateKey \| 'role_not_found'>` | **Coincide** con `design.md > 6.1`: el tercer argumento pasa de `string` a la union discriminada |
| Tamano de `ERROR_CODES` | `lib/modules/errores/domain/error-codes.ts:33-67` — **32** entradas | **Coincide** (32 -> 34) |
| Traductor unico de QC-70 | `createErrorStateTranslator`, `lib/modules/errores/domain/error-state.ts:142` | **Coincide** |
| Forma de `CreateUserFormState` | `lib/modules/identity/adapters/driving/user-actions.ts:66-69` — `idle` / `success{id}` / `ErrorState` (**tres** variantes) | **Coincide** con `design.md > 2` fila 5 (pasa a cinco) |
| `evaluateCredentialRules` / `createCredentialPolicy` | `lib/modules/identity/domain/credential-policy.ts:69` y `:86` | **Coincide** |
| `CREDENTIAL_RULES` | `lib/modules/identity/domain/credential-policy.ts:27` (y `CredentialRule` en `:37`) | **Coincide** |

No hay divergencia que obligue a parar.

## Tanda A — T3, T4, T5, T7, T8, T9

Tres `backend_dev` en paralelo sobre archivos disjuntos. Todas cerradas.

### Donde el codigo se aparto del diseno, o el diseno no llegaba

1. **`CredentialSetupSecretFactory` no podia calcular la huella de un secreto que llega de fuera.**
   `design.md > 4.2` define el puerto con `create()` y nada mas, pero `> 4.6` exige el `digest` del
   secreto recibido por la URL, y el `domain/` **no puede importar `node:crypto`**. El adaptador
   exporta `digestOfCredentialSetupSecret(secret)`; el puerto gana un segundo metodo `digestOf`
   en T13 y se cablea en `lib/composition`. **No es un cambio de diseno, es un hueco del diseno.**
2. **La relacion inversa en `User`.** Prisma la exige para el `@relation` de `design.md > 3.1`. Es
   virtual, no emite DDL: **ni columna, ni indice, ni migracion** sobre `users` (R37 intacto).
3. **`credential_link_invalid` choca con un filtro lexico vivo de `tests/unit/errores/catalogo.test.ts`.**
   El caso de R25 (enmendado) prohibe `/credential|password|session|login|account/` en todo codigo.
   Ni `design.md > 5.4` ni `tasks.md > 2` lo previeron. **No se borro ni se relajo el filtro**: se
   declaro `CODIGOS_DE_ACTIVACION = ['credential_link_invalid']` como excepcion **nombrada**, con un
   caso nuevo que la **acota** (es una sola, sigue en el catalogo, y case `/^credential_link_/`). La
   alternativa era renombrar el codigo, que contradice el nombre que fija el spec aprobado.
4. **`updateUserSchema = createUserSchema`** (`domain/user-input.ts`). `design.md > 5.2` dice que el
   campo `credential` entra «dentro del `strictObject` existente», pero eso se lo regalaria tambien a
   la EDICION, que QC-66 R20 prohibe. Se resuelve en T11 sin reabrir nada. **Anotado en la tanda A
   porque es donde se detecto.**

### Rojos AJENOS que esta feature destapa, y que NO se han tocado

Los cuatro son la **misma especie**: tests de **otras fichas** que afirman «esta ficha no anade X»
implementados como un **censo del worktree entero** contra `origin/dev`, no como el diff de su
propia ficha. Por construccion se ponen rojos con **cualquier** feature posterior que anada una
migracion o una dependencia — esta es solo la primera que lo destapa.

| Archivo (ficha duena) | Que afirma | Por que esta rojo |
| --- | --- | --- |
| `tests/guards/guard-identificador-de-request.test.ts` (QC-71, R19) | «db/ no gana ni una migracion» | La migracion `20260911155021_credential_setup_tokens` de T3 |
| `tests/unit/inventario/schema/inventario-schema.test.ts` (QC-90, R29) | «db/migrations/ no gana ninguna carpeta respecto del merge-base, **incluido lo no commiteado**» | Idem |
| `tests/unit/unidades/unidades-convenciones.test.ts` (R35) | «dependencias y devDependencies son EXACTAMENTE las de origin/dev» | `resend`, aprobada por el humano en F1.4 (T2) |
| `tests/unit/identity/account-status-scope.test.ts` (QC-65, R19) | «los archivos de produccion que nombran el estado son EXACTAMENTE los de la lista cerrada» | `ports/credential-setup-link-repository.ts` de T9 |

**No se tocan y la decision es del leader**: son expectativas de fichas ajenas, y el leader dijo
expresamente que `guard-identificador-de-request.test.ts` no se vuelve a tocar. Acotarlas al diff de
su propia ficha seria lo correcto, pero no lo decide esta feature.
