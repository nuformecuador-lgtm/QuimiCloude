// QC-66 T3 — La jerarquia de errores del dominio `identity` (`design.md > 6.4`).
//
// Lo que se vigila (R41): las NUEVE clases exponen el `code` ESTABLE que la tabla de
// `design.md > 6.4` fija, cada una el suyo y por clase; todas derivan de `IdentityError`, que
// es como el adaptador driving las reconoce (`error instanceof IdentityError`) antes de
// serializarlas a `{ status: 'error', code, message }`.
//
// Se afirma SIEMPRE sobre `code` y NUNCA sobre el texto del mensaje: el mensaje es para una
// persona y puede cambiar de redaccion o de idioma; el `code` es el contrato con QC-67. Mismo
// estilo que `tests/unit/unidades/errors.test.ts`.
//
// Se importa por la ruta profunda de `domain/` y no por el contrato del modulo a proposito:
// quien reexporta desde `lib/modules/identity/index.ts` es T15, y este test no debe adelantarlo.
//
// Cubre R41.

import {
  DuplicateDocumentError,
  DuplicateEmailError,
  DuplicateUsernameError,
  IdentityError,
  LastAdministratorError,
  NotFoundError,
  RoleNotFoundError,
  SelfOperationError,
  UnauthorizedError,
  ValidationError,
} from '@/lib/modules/identity/domain/errors';

// La tabla de `design.md > 6.4`, clase por clase y con su `code` literal. Cambiar un `code`
// aqui sin cambiarlo alla (o al reves) rompe este archivo, que es la idea.
const CASOS: readonly { readonly clase: string; readonly error: IdentityError; readonly code: string }[] = [
  { clase: 'UnauthorizedError', error: new UnauthorizedError(), code: 'unauthorized' },
  { clase: 'NotFoundError', error: new NotFoundError(), code: 'not_found' },
  { clase: 'DuplicateEmailError', error: new DuplicateEmailError(), code: 'duplicate_email' },
  { clase: 'DuplicateUsernameError', error: new DuplicateUsernameError(), code: 'duplicate_username' },
  { clase: 'DuplicateDocumentError', error: new DuplicateDocumentError(), code: 'duplicate_document' },
  { clase: 'RoleNotFoundError', error: new RoleNotFoundError(), code: 'role_not_found' },
  { clase: 'SelfOperationError', error: new SelfOperationError(), code: 'self_operation' },
  { clase: 'LastAdministratorError', error: new LastAdministratorError(), code: 'last_administrator' },
  { clase: 'ValidationError', error: new ValidationError(), code: 'invalid_input' },
];

describe('lib/modules/identity — errores de dominio', () => {
  // R41 — el `code` exacto, afirmado POR CLASE y no por el texto del mensaje.
  for (const { clase, error, code } of CASOS) {
    it(`${clase} expone el code estable «${code}»`, () => {
      expect(error.code).toBe(code);
    });
  }

  // R41 — la base comun: es asi como el adaptador driving decide que un error es traducible.
  for (const { clase, error } of CASOS) {
    it(`${clase} deriva de IdentityError y de Error`, () => {
      expect(error).toBeInstanceOf(IdentityError);
      expect(error).toBeInstanceOf(Error);
    });
  }

  // R41 — nueve clases, nueve codigos distintos: dos casos con el mismo `code` serian
  // indistinguibles para la pantalla de QC-67, que decide por el codigo.
  it('los nueve codigos del modulo son distintos entre si', () => {
    const codigos = CASOS.map(({ code }) => code);

    expect(codigos).toHaveLength(9);
    expect(new Set(codigos).size).toBe(9);
  });

  // `design.md > 6.4`: «de otra empresa» y «soy yo» responden `not_found` y NO `unauthorized`,
  // para no dar un oraculo de existencia sobre datos ajenos. `unauthorized` es SOLO el permiso.
  it('not_found y unauthorized son codigos distintos: el ambito de los datos no se confunde con el permiso', () => {
    expect(new NotFoundError().code).not.toBe(new UnauthorizedError().code);
  });

  // `design.md > 6.4`: `self_operation` SI se distingue de `not_found` a proposito, para que
  // QC-67 pueda decir «no puedes cambiar tu propio rol» sin mentir.
  it('self_operation no comparte code con not_found', () => {
    expect(new SelfOperationError().code).toBe('self_operation');
    expect(new SelfOperationError().code).not.toBe(new NotFoundError().code);
  });

  // `name` sale de la clase concreta (`new.target.name`), igual que en `unidades`: una traza
  // dice «SelfOperationError», no «Error».
  it('el name de cada error es el de su clase concreta', () => {
    expect(new SelfOperationError().name).toBe('SelfOperationError');
    expect(new LastAdministratorError().name).toBe('LastAdministratorError');
  });
});
