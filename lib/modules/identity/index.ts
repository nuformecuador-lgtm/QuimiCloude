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
// QC-74 T1 — el catalogo cerrado de permisos (R1, R2) y lo que el seed asigna a cada rol (R8, R9).
// `PermissionCode` es union de literales: exigir un codigo inexistente no compila.
export { PERMISSIONS, SEED_ROLE_PERMISSIONS, type PermissionCode } from './domain/permissions';
// QC-74 T2 — la UNICA implementacion de «el actor tiene este permiso» (R12-R14); cada modulo
// delega aqui desde su propio `requirePermission` y pone su propio error (R15).
export { assertPermission, type PermissionBearer } from './domain/require-permission';
// QC-47 T3 — La empresa: la UNICA definicion de «mismo nombre de empresa» (R3) y el UNICO
// literal del nombre de la empresa inicial (R20). Dominio puro: no arrastran servidor ni Prisma.
export { normalizeCompanyName } from './domain/company-name';
export { INITIAL_COMPANY_NAME } from './domain/companies';
// QC-83 T1 — El grupo de trabajo: la UNICA definicion de «mismo nombre de grupo» (R3), la que
// calcula la columna `work_groups.name_normalized` y la que usara QC-84 para no inventarse una
// segunda. Dominio puro. `normalizeKey` —el cuerpo que comparte con `normalizeCompanyName`— es
// INTERNO al modulo y NO se exporta a proposito (`design.md > 4`).
export { normalizeWorkGroupName } from './domain/work-group-name';
// QC-65 T1 — la UNICA definicion del conjunto cerrado de estados de cuenta (R3) y los dos
// estados con nombre: el de una cuenta nueva (R5) y el del administrador del seed (R7). Dominio
// puro: no arrastra servidor ni Prisma. NADIE lee todavia el estado para decidir nada (R19).
export {
  INITIAL_USER_ACCOUNT_STATUS,
  SEED_ADMIN_ACCOUNT_STATUS,
  USER_ACCOUNT_STATUSES,
  type UserAccountStatus,
} from './domain/account-status';
export { seedInitialAccess, type SeedOutcome } from './domain/seed-initial-access';
export { createResolveSessionUser } from './domain/resolve-session-user';
// QC-48 T8 — La cadena unica de cortes y lo que expone al servidor. Dominio puro: no arrastra
// Prisma ni `next/*`, asi que el contrato sigue importable desde un componente de cliente.
export { createResolveSession, type ResolveSessionDeps, type ResolvedSession } from './domain/resolve-session';
export type { SessionContext } from './domain/session-context';
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
