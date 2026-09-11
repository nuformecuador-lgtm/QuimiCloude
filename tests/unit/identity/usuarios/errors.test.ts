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
// QC-70, aplicado a `identity` el 2026-09-10: los nueve `code` son ahora `ErrorCode` del CATALOGO
// UNICO y `UserNotFoundError` declara `user_not_found` en vez del generico `not_found` (enmienda a
// QC-70 R25, aprobada por el humano). Con el patron nuevo hay dos cosas mas que SI son afirmables
// sin mirar el texto: que NINGUN constructor acepta un mensaje —la unica cosa que admiten es el
// `diagnostic`, que no se muestra— y que el mensaje sale del catalogo por su codigo.
//
// Se importa por la ruta profunda de `domain/` y no por el contrato del modulo a proposito:
// quien reexporta desde `lib/modules/identity/index.ts` es T15, y este test no debe adelantarlo.
//
// Cubre R41.

import { errorMessage, ERROR_CODES, type ErrorCode } from '@/lib/modules/errores';
import {
  DuplicateDocumentError,
  DuplicateEmailError,
  DuplicateUsernameError,
  IdentityError,
  LastAdministratorError,
  UserNotFoundError,
  RoleNotFoundError,
  SelfOperationError,
  UnauthorizedError,
  ValidationError,
} from '@/lib/modules/identity/domain/errors';

// La tabla de `design.md > 6.4`, clase por clase y con su `code` literal. Cambiar un `code`
// aqui sin cambiarlo alla (o al reves) rompe este archivo, que es la idea.
const CASOS: readonly { readonly clase: string; readonly error: IdentityError; readonly code: ErrorCode }[] = [
  { clase: 'UnauthorizedError', error: new UnauthorizedError(), code: 'unauthorized' },
  { clase: 'UserNotFoundError', error: new UserNotFoundError(), code: 'user_not_found' },
  { clase: 'DuplicateEmailError', error: new DuplicateEmailError(), code: 'duplicate_email' },
  { clase: 'DuplicateUsernameError', error: new DuplicateUsernameError(), code: 'duplicate_username' },
  { clase: 'DuplicateDocumentError', error: new DuplicateDocumentError(), code: 'duplicate_document' },
  { clase: 'RoleNotFoundError', error: new RoleNotFoundError(), code: 'role_not_found' },
  { clase: 'SelfOperationError', error: new SelfOperationError(), code: 'self_operation' },
  { clase: 'LastAdministratorError', error: new LastAdministratorError(), code: 'last_administrator' },
  { clase: 'ValidationError', error: new ValidationError(), code: 'invalid_input' },
];

/**
 * Las mismas nueve clases, por su CONSTRUCTOR: hace falta para construirlas una segunda vez con un
 * `diagnostic` y demostrar que el mensaje no se puede sobreescribir. Se escribe a mano y no se
 * deduce de `CASOS` para que anadir una clase obligue a tocar los dos sitios.
 */
const CLASES: Readonly<Record<string, new (diagnostic?: string) => IdentityError>> = {
  UnauthorizedError,
  UserNotFoundError,
  DuplicateEmailError,
  DuplicateUsernameError,
  DuplicateDocumentError,
  RoleNotFoundError,
  SelfOperationError,
  LastAdministratorError,
  ValidationError,
};

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

  // `design.md > 6.4`: «de otra empresa» y «soy yo» responden no-encontrado y NO `unauthorized`,
  // para no dar un oraculo de existencia sobre datos ajenos. `unauthorized` es SOLO el permiso.
  it('user_not_found y unauthorized son codigos distintos: el ambito de los datos no se confunde con el permiso', () => {
    expect(new UserNotFoundError().code).not.toBe(new UnauthorizedError().code);
  });

  // `design.md > 6.4`: `self_operation` SI se distingue de `user_not_found` a proposito, para que
  // QC-67 pueda decir «no puedes cambiar tu propio rol» sin mentir.
  it('self_operation no comparte code con user_not_found', () => {
    expect(new SelfOperationError().code).toBe('self_operation');
    expect(new SelfOperationError().code).not.toBe(new UserNotFoundError().code);
  });

  // `name` sale de la clase concreta (`new.target.name`), igual que en `unidades`: una traza
  // dice «SelfOperationError», no «Error».
  it('el name de cada error es el de su clase concreta', () => {
    expect(new SelfOperationError().name).toBe('SelfOperationError');
    expect(new LastAdministratorError().name).toBe('LastAdministratorError');
  });

  // QC-70 (R22): los nueve codigos estan en el catalogo unico. Un codigo inventado por el modulo
  // —el caso que la guardia del catalogo persigue— pondria esta linea en rojo.
  it('los nueve codigos pertenecen al catalogo unico de la aplicacion', () => {
    for (const { clase, code } of CASOS) {
      expect(ERROR_CODES, `${clase} declara un code fuera del catalogo`).toContain(code);
    }
  });

  // QC-70 (R7, R24): el mensaje NO se pasa desde donde se lanza, sale del CATALOGO por el codigo.
  // Se compara contra `errorMessage(code)` —la indireccion— y no contra una frase escrita aqui:
  // este archivo sigue sin fijar ningun texto, y el dia que QC-72 cambie la redaccion no se cae.
  it('el mensaje de cada error sale del catalogo a partir de su code', () => {
    for (const { clase, error, code } of CASOS) {
      expect(error.message, `${clase} no toma su mensaje del catalogo`).toBe(errorMessage(code));
    }
  });

  // QC-70 (R24): NINGUN constructor acepta un mensaje. El unico argumento es el `diagnostic`, que
  // va al registro del servidor y NO al mensaje: se pasa uno reconocible y se comprueba que el
  // mensaje sigue siendo el del catalogo, o sea que no hay forma de sobreescribir el texto.
  it('ningun constructor acepta un mensaje: el argumento es el diagnostico y no se muestra', () => {
    const DIAGNOSTICO = 'user-id=42 indice=users_email_unique';

    for (const { clase, code } of CASOS) {
      const Clase = CLASES[clase] as new (diagnostic?: string) => IdentityError;
      const conDiagnostico = new Clase(DIAGNOSTICO);

      expect(conDiagnostico.message, `${clase} deja sobreescribir su mensaje`).toBe(errorMessage(code));
      expect(conDiagnostico.message).not.toContain(DIAGNOSTICO);
      expect(conDiagnostico.diagnostic, `${clase} pierde el diagnostico`).toBe(DIAGNOSTICO);
    }
  });

  // Y sin diagnostico, el campo no existe: el traductor unico solo registra cuando hay algo que
  // registrar (R28).
  it('sin diagnostico, el campo queda sin definir', () => {
    expect(new UserNotFoundError().diagnostic).toBeUndefined();
  });
});
