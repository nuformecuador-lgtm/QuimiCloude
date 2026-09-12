// QC-79 T19 — Todo el copy de la pantalla publica, en UNA sola fuente.
//
// Ningun componente de esta ruta escribe un literal de cara al usuario: lo recibe de aqui, o por
// el prop `labels` de `SetCredentialForm`, que lo sustituye entero o en parte. Es el mismo patron
// de `components/shared/credential-rule-labels.ts` (QC-21) y por el mismo motivo: el dia que
// llegue QC-72 (`internacionalizacion-de-textos`, hoy `pending`) migrar esta pantalla sera mover
// un objeto a un archivo de idioma, no peinar el JSX buscando cadenas.
//
// El texto de cada REGLA incumplida no se escribe aqui: lo compone la UI a partir del codigo
// estable que devuelve el dominio (QC-19 R23), con `CREDENTIAL_RULE_LABELS`, que ya existe.
//
// **Ningun texto nombra a nadie** (R24): no hay ni un hueco donde quepa el nombre, el correo, el
// nombre de usuario, el rol o la empresa de la persona.

export type SetCredentialLabels = {
  readonly title: string;
  readonly intro: string;
  readonly credentialLabel: string;
  readonly confirmationLabel: string;
  readonly showCredential: string;
  readonly hideCredential: string;
  readonly submit: string;
  readonly submitPending: string;
  readonly mismatch: string;
  readonly unmetIntro: string;
  readonly successTitle: string;
  readonly successBody: string;
  readonly goToLogin: string;
  readonly errorReference: string;
};

export const SET_CREDENTIAL_LABELS: SetCredentialLabels = {
  title: 'Establece tu contrasena',
  intro: 'Escribe la contrasena con la que vas a entrar y repitela para confirmarla.',
  credentialLabel: 'Contrasena nueva',
  confirmationLabel: 'Repite la contrasena',
  showCredential: 'Mostrar la contrasena',
  hideCredential: 'Ocultar la contrasena',
  submit: 'Guardar contrasena',
  submitPending: 'Guardando…',
  mismatch: 'Las dos contrasenas no coinciden.',
  unmetIntro: 'La contrasena todavia no cumple estos requisitos:',
  successTitle: 'Contrasena establecida',
  successBody: 'Ya puedes entrar con ella.',
  goToLogin: 'Ir a iniciar sesion',
  errorReference: 'Referencia del fallo:',
};
