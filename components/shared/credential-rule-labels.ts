// components/shared/credential-rule-labels.ts
//
// Copy en una sola fuente (R15), indexado por el codigo de regla que exporta el dominio
// `identity` (QC-19). El texto se sustituye entero o en parte con el prop `labels` de
// `CredentialRequirements`.
//
// REDACCION PROVISIONAL: es la pregunta abierta 1 de
// `specs/QC-21-ayuda-visual-de-contrasena/requirements.md` ("Quien decide el texto en espanol
// de cada codigo"). Cambiar la redaccion es un cambio de una linea en este archivo, sin tocar
// componentes ni tests de comportamiento.
//
// Ningun umbral ni regla se declara aqui (R2): los numeros que aparecen son los mismos
// `CREDENTIAL_MIN_LENGTH` / `CREDENTIAL_MAX_LENGTH` que exporta el dominio, interpolados en el
// texto y no copiados a mano.
import {
  CREDENTIAL_MAX_LENGTH,
  CREDENTIAL_MIN_LENGTH,
  type CredentialRule,
} from '@/lib/modules/identity';

export const CREDENTIAL_RULE_LABELS: Readonly<Record<CredentialRule, string>> = {
  min_length: `Al menos ${CREDENTIAL_MIN_LENGTH} caracteres`,
  max_length: `Como maximo ${CREDENTIAL_MAX_LENGTH} caracteres`,
  no_uppercase: 'Al menos una letra mayuscula',
  no_lowercase: 'Al menos una letra minuscula',
  no_digit: 'Al menos un numero',
  no_symbol: 'Al menos un simbolo que no sea letra ni numero',
  breached: 'No debe figurar en una lista de credenciales filtradas',
};
