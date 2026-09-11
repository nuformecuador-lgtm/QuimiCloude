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
