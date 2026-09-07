// lib/modules/identity/index.ts — CONTRATO PUBLICO del modulo identity.
// Regla: solo reexporta de ./domain. Nada de 'use server', nada de Prisma, nada de next/*.
// Debe poder importarse desde un componente de cliente sin arrastrar servidor (R10).
export type { SessionUser } from './domain/session-user';
export { DOCUMENT_TYPE_CC, DOCUMENT_TYPE_CODES, type DocumentTypeCode } from './domain/document-type';
export { CREDENTIAL_MAX_LENGTH, loginInputSchema, type LoginInput } from './domain/credentials';
export { type SessionTicket } from './domain/session';
export { createVerifyCredentials, type VerifyCredentialsDeps } from './domain/verify-credentials';
export {
  CREDENTIAL_MIN_LENGTH,
  CREDENTIAL_RULES,
  createCredentialPolicy,
  evaluateCredentialRules,
  type CredentialPolicyResult,
  type CredentialRule,
} from './domain/credential-policy';
export { ROLE_ADMINISTRADOR, ROLE_OPERADOR, SEED_ROLES } from './domain/roles';
// QC-47 T3 — La empresa: la UNICA definicion de «mismo nombre de empresa» (R3) y el UNICO
// literal del nombre de la empresa inicial (R20). Dominio puro: no arrastran servidor ni Prisma.
export { normalizeCompanyName } from './domain/company-name';
export { INITIAL_COMPANY_NAME } from './domain/companies';
export { seedInitialAccess, type SeedOutcome } from './domain/seed-initial-access';
export { createResolveSessionUser } from './domain/resolve-session-user';
export { buildDisplayName } from './domain/display-name';
export { isSessionExpired, type SessionClaims } from './domain/session-claims';

// QC-9 T10 — La decision de acceso de ruta y el destino de vuelta. Solo dominio: el middleware
// las consume desde aqui sin arrastrar `next/*` ni Prisma al bundle del borde.
export {
  decideRouteAccess,
  type RedirectReason,
  type RouteAccessDecision,
  type RouteAccessInput,
  type RouteAccessSession,
} from './domain/route-access';
export {
  RETURN_PARAM,
  buildLoginRedirect,
  isInternalPath,
  resolveReturnPath,
} from './domain/return-path';
// La LISTA de reglas ya no sale de aqui: es CABLEADO y vive en `lib/composition/route-role-rules.ts`
// (el dominio no puede importar `lib/shared`, y nombrar el rol exige el barrel de `inventario` como
// valor, cosa reservada a `lib/composition`). El contrato sigue exponiendo el tipo y la busqueda,
// que si son dominio.
export { findRouteRule, type RouteRoleRule } from './domain/route-role-rules';
