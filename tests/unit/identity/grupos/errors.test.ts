// QC-84 T2 — Las SIETE clases de error de los grupos de trabajo (`design.md > 7.1` y `> 7.2`).
//
// Cubre R31 y la mitad de dominio de R43.
//
// Se afirma SIEMPRE sobre `code`, POR CLASE, y NUNCA sobre el texto del mensaje: el texto es para
// una persona y puede cambiar de redaccion o de idioma; el `code` es el contrato con la pantalla
// de QC-85. Mismo estilo que `tests/unit/identity/usuarios/errors.test.ts`, que es el precedente
// literal de este archivo.
//
// Lo que este archivo tambien vigila, y es la razon de que exista ademas del de usuarios: que las
// DIEZ clases de QC-66 sigan con su `code` INTACTO. Ampliar `errors.ts` por el final no puede
// mover ninguno de los que ya hay, y aqui se dice con nombres y codigos literales en vez de
// confiar en que nadie lo haga.
//
// Se importa por la ruta profunda de `domain/` y no por el contrato del modulo: quien reexporta
// desde `lib/modules/identity/index.ts` es T10, y este test no debe adelantarlo.

import { ERROR_CODES, errorMessage, type ErrorCode } from '@/lib/modules/errores';
import {
  DuplicateDocumentError,
  DuplicateEmailError,
  DuplicateUsernameError,
  IdentityError,
  LastAdministratorError,
  RoleNotFoundError,
  SelfOperationError,
  UnauthorizedError,
  UserNotFoundError,
  ValidationError,
  WorkGroupDuplicateNameError,
  WorkGroupMemberExistsBlockedError,
  WorkGroupMemberExistsError,
  WorkGroupMemberExistsInactiveError,
  WorkGroupMemberExistsPendingError,
  WorkGroupMemberNotFoundError,
  WorkGroupNotFoundError,
} from '@/lib/modules/identity/domain/errors';

/** La tabla de `design.md > 7.1`, clase por clase y con su `code` LITERAL escrito a mano. */
const CASOS: readonly { readonly clase: string; readonly error: IdentityError; readonly code: ErrorCode }[] = [
  {
    clase: 'WorkGroupNotFoundError',
    error: new WorkGroupNotFoundError(),
    code: 'work_group_not_found',
  },
  {
    clase: 'WorkGroupDuplicateNameError',
    error: new WorkGroupDuplicateNameError(),
    code: 'work_group_duplicate_name',
  },
  {
    clase: 'WorkGroupMemberExistsError',
    error: new WorkGroupMemberExistsError(),
    code: 'work_group_member_exists',
  },
  {
    clase: 'WorkGroupMemberExistsPendingError',
    error: new WorkGroupMemberExistsPendingError(),
    code: 'work_group_member_exists_pending',
  },
  {
    clase: 'WorkGroupMemberExistsInactiveError',
    error: new WorkGroupMemberExistsInactiveError(),
    code: 'work_group_member_exists_inactive',
  },
  {
    clase: 'WorkGroupMemberExistsBlockedError',
    error: new WorkGroupMemberExistsBlockedError(),
    code: 'work_group_member_exists_blocked',
  },
  {
    clase: 'WorkGroupMemberNotFoundError',
    error: new WorkGroupMemberNotFoundError(),
    code: 'work_group_member_not_found',
  },
];

/**
 * Las mismas siete clases por su CONSTRUCTOR: hace falta para construirlas una segunda vez con un
 * `diagnostic` y demostrar que el mensaje no se puede sobreescribir (QC-70 R7, R24). Se escribe a
 * mano y no se deduce de `CASOS` para que anadir una clase obligue a tocar los dos sitios.
 */
const CLASES: Readonly<Record<string, new (diagnostic?: string) => IdentityError>> = {
  WorkGroupNotFoundError,
  WorkGroupDuplicateNameError,
  WorkGroupMemberExistsError,
  WorkGroupMemberExistsPendingError,
  WorkGroupMemberExistsInactiveError,
  WorkGroupMemberExistsBlockedError,
  WorkGroupMemberNotFoundError,
};

/**
 * Los errores que QC-66 ya tenia, con su `code` tal como estaba antes de esta ficha. Esta lista no
 * se genera: se copia, para que tocar cualquiera de ellos ponga este archivo en rojo.
 */
const HEREDADOS: readonly { readonly clase: string; readonly error: IdentityError; readonly code: ErrorCode }[] = [
  { clase: 'UnauthorizedError', error: new UnauthorizedError(), code: 'unauthorized' },
  { clase: 'UserNotFoundError', error: new UserNotFoundError(), code: 'user_not_found' },
  { clase: 'DuplicateEmailError', error: new DuplicateEmailError(), code: 'duplicate_email' },
  {
    clase: 'DuplicateUsernameError',
    error: new DuplicateUsernameError(),
    code: 'duplicate_username',
  },
  {
    clase: 'DuplicateDocumentError',
    error: new DuplicateDocumentError(),
    code: 'duplicate_document',
  },
  { clase: 'RoleNotFoundError', error: new RoleNotFoundError(), code: 'role_not_found' },
  { clase: 'SelfOperationError', error: new SelfOperationError(), code: 'self_operation' },
  {
    clase: 'LastAdministratorError',
    error: new LastAdministratorError(),
    code: 'last_administrator',
  },
  { clase: 'ValidationError', error: new ValidationError(), code: 'invalid_input' },
];

describe('QC-84 — errores de dominio de los grupos de trabajo', () => {
  // R43 — el `code` exacto, afirmado POR CLASE y no por el texto del mensaje.
  for (const { clase, error, code } of CASOS) {
    it(`${clase} expone el code estable «${code}»`, () => {
      expect(error.code).toBe(code);
    });
  }

  // R43 — la base comun: es asi como el adaptador driving decide que un error es traducible.
  for (const { clase, error } of CASOS) {
    it(`${clase} deriva de IdentityError y de Error`, () => {
      expect(error).toBeInstanceOf(IdentityError);
      expect(error).toBeInstanceOf(Error);
    });
  }

  // R43 — siete clases, siete codigos distintos.
  it('los siete codigos nuevos son distintos entre si', () => {
    const codigos = CASOS.map(({ code }) => code);

    expect(codigos).toHaveLength(7);
    expect(new Set(codigos).size).toBe(7);
  });

  // QC-70 (R22): los siete estan en el catalogo unico. Un codigo inventado por el modulo —el caso
  // que persigue `guard-catalogo-de-errores.test.ts`— pondria esta linea en rojo.
  it('los siete codigos pertenecen al catalogo unico de la aplicacion', () => {
    for (const { clase, code } of CASOS) {
      expect(ERROR_CODES, `${clase} declara un code fuera del catalogo`).toContain(code);
    }
  });

  // R31 — el corazon de la decision 5: los CUATRO caminos de «ya pertenece» tienen cuatro codigos
  // distintos, y ninguno de los tres ocultos es el de R30. Se afirma sobre los codigos, que es lo
  // que la pantalla lee.
  it('los cuatro caminos de «ya pertenece» son cuatro codigos distintos, y ninguno oculto es el visible', () => {
    const visible = new WorkGroupMemberExistsError().code;
    const ocultos = [
      new WorkGroupMemberExistsPendingError().code,
      new WorkGroupMemberExistsInactiveError().code,
      new WorkGroupMemberExistsBlockedError().code,
    ];

    expect(new Set([visible, ...ocultos]).size).toBe(4);
    for (const oculto of ocultos) {
      expect(oculto).not.toBe(visible);
    }
  });

  // R31 — y tres codigos significan TRES FRASES distintas: si compartieran texto serian el mismo
  // caso, y QC-70 R4 lo prohibiria. Aqui SI se mira el texto, porque el requisito ES el texto:
  // decir que ya pertenece Y por que no se ve.
  it('los cuatro mensajes son distintos entre si y dicen que la persona ya pertenece', () => {
    const mensajes = [
      errorMessage('work_group_member_exists'),
      errorMessage('work_group_member_exists_pending'),
      errorMessage('work_group_member_exists_inactive'),
      errorMessage('work_group_member_exists_blocked'),
    ];

    expect(new Set(mensajes).size).toBe(4);
    for (const mensaje of mensajes) {
      expect(mensaje).toContain('ya pertenece');
    }
  });

  // `design.md > 7.1`: el grupo de otra empresa responde no-encontrado y NO `unauthorized`, para
  // no dar un oraculo de existencia sobre datos ajenos. `unauthorized` es SOLO el permiso.
  it('work_group_not_found y unauthorized son codigos distintos: el ambito no se confunde con el permiso', () => {
    expect(new WorkGroupNotFoundError().code).not.toBe(new UnauthorizedError().code);
  });

  // `design.md > 7.1`: la persona inexistente, borrada o de otra empresa REUTILIZA
  // `UserNotFoundError`; la que existe pero no pertenece al grupo tiene el suyo. No son el mismo.
  it('la persona que no pertenece al grupo no comparte code con la persona que no existe', () => {
    expect(new WorkGroupMemberNotFoundError().code).not.toBe(new UserNotFoundError().code);
  });

  // QC-70 (R7, R24): ningun constructor admite un texto; lo unico que aceptan es el `diagnostic`,
  // que va al registro del servidor y no se muestra. El mensaje sale del catalogo por su codigo.
  for (const { clase, code } of CASOS) {
    it(`${clase} toma su mensaje del catalogo y no lo deja sobreescribir`, () => {
      const Clase = CLASES[clase] as new (diagnostic?: string) => IdentityError;
      const conDiagnostico = new Clase('grupo=11111111-1111-4111-8111-111111111111');

      expect(conDiagnostico.message).toBe(errorMessage(code));
      expect(conDiagnostico.diagnostic).toBe('grupo=11111111-1111-4111-8111-111111111111');
      expect(conDiagnostico.message).not.toContain('11111111');
    });
  }

  // `name` sale de la clase concreta (`new.target.name`): una traza dice
  // «WorkGroupDuplicateNameError», no «Error».
  it('el name de cada error es el de su clase concreta', () => {
    expect(new WorkGroupDuplicateNameError().name).toBe('WorkGroupDuplicateNameError');
    expect(new WorkGroupMemberExistsBlockedError().name).toBe('WorkGroupMemberExistsBlockedError');
  });
});

describe('QC-84 — las clases de QC-66 siguen intactas', () => {
  // Ampliar `errors.ts` por el final no puede mover ningun `code` de los que ya habia: la pantalla
  // de QC-67 decide por ellos.
  for (const { clase, error, code } of HEREDADOS) {
    it(`${clase} conserva su code «${code}»`, () => {
      expect(error.code).toBe(code);
      expect(error).toBeInstanceOf(IdentityError);
    });
  }

  it('los codigos heredados siguen siendo distintos de los siete nuevos', () => {
    const heredados = HEREDADOS.map(({ code }) => code);
    const nuevos = CASOS.map(({ code }) => code);

    // Nueve codigos para las diez clases de QC-66: la decima es la base abstracta `IdentityError`,
    // que no declara code propio. El conteo se escribe aqui para que borrar una clase no pase
    // desapercibido.
    expect(heredados).toHaveLength(9);
    expect(new Set(heredados).size).toBe(9);
    for (const nuevo of nuevos) {
      expect(heredados).not.toContain(nuevo);
    }
  });
});
