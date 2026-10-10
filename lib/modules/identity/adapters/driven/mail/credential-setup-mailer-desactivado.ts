// Transporte de correo que no envia nada. Es para entornos donde ningun correo real debe salir
// (las previews): no contacta a ningun proveedor ni escribe archivos, porque el disco de una
// funcion de Vercel es efimero y `outbox` se niega con `NODE_ENV=production`.
//
// Devuelve `'failed'` porque es la verdad: el enlace no llego a nadie, y asi la pantalla ofrece el
// reenvio igual que si el proveedor fallara.

const LINEA_DE_REGISTRO =
  '[identity] correo desactivado (MAIL_TRANSPORT=desactivado): no se envia el enlace';

// Misma firma que los otros transportes; la entrada no se lee: la linea no lleva destinatario,
// URL ni secreto.
export const sendCredentialSetupLink: (input: {
  readonly to: string;
  readonly secret: string;
}) => Promise<'sent' | 'failed'> = async () => {
  console.warn(LINEA_DE_REGISTRO);
  return 'failed';
};
