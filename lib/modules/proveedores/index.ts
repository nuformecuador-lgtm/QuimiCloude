// lib/modules/proveedores/index.ts — CONTRATO PUBLICO del modulo `proveedores`.
// Solo reexporta simbolos de ./domain. Debe poder importarse desde un componente de cliente
// sin arrastrar servidor: nada de 'use server', @prisma/client ni next/* en su cierre de
// imports. Los adaptadores driving que traiga QC-43 NO pasan por aqui.
export { normalizeSupplierName } from './domain/supplier-name';
