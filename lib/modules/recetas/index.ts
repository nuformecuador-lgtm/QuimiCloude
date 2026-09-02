// lib/modules/recetas/index.ts — CONTRATO PUBLICO del modulo `recetas`.
// Solo reexporta simbolos de ./domain. Debe poder importarse desde un componente de cliente
// sin arrastrar servidor: nada de 'use server', @prisma/client ni next/* en su cierre de
// imports. Los adaptadores driving que traiga QC-25 NO pasan por aqui.
export { normalizeRecipeName } from './domain/recipe-name';
