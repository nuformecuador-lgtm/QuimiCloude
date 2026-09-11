// lib/modules/asignaciones/index.ts — CONTRATO PUBLICO del modulo `asignaciones`.
// Solo reexporta simbolos de ./domain. Debe poder importarse desde un componente de cliente sin
// arrastrar servidor: nada de 'use server', @prisma/client ni ningun import de `next` en su
// cierre de imports.
//
// QC-86 publica DOS tipos y nada mas (R31, R36): esta ficha no trae caso de uso, ni puerto, ni
// repositorio, ni Server Action, ni errores, ni esquemas `zod` -un error sin nadie que lo lance
// es codigo muerto-. El modulo tiene `index.ts` y solo `domain/`; quien estrene la primera
// operacion (QC-87) añadira `ports/` y `adapters/` entonces.
export type { AssignmentOrigin, OrderAssignment } from './domain/order-assignment';
