// lib/modules/observabilidad/index.ts — CONTRATO PUBLICO del modulo `observabilidad` (QC-71).
//
// Solo reexporta simbolos de ./domain. El modulo no tiene puertos y no aporta ningun modelo a
// `db/schema.prisma`: el identificador de peticion no se persiste en ninguna tabla (R19).
//
// Por que un MODULO y no `lib/shared/`: lo consume el borde a traves de
// `lib/composition/edge.ts`, y `lib/composition/**` no puede importar `lib/shared/**` como si
// fuera un modulo; ademas el `domain/` del modulo `errores` necesita el respaldo de R8, y
// `domain/**` tiene prohibido importar `lib/shared/**` mientras que el barrel de otro modulo si
// esta permitido (`docs/architecture.md > La regla de dependencias`). Mismo patron con el que
// QC-70 publica el catalogo de errores.
//
// Y por que un modulo PROPIO y no dentro de `identity`: la regla no es del portero. El dia que
// el identificador lo necesite otro punto de entrada —un route handler, un webhook— ya esta
// publicado y no hay que sacarlo de un modulo cuyo nombre no dice nada de observabilidad.
export { REQUEST_ID_HEADER, newRequestId } from './domain/request-id';
