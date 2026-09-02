// lib/modules/inventario/index.ts — CONTRATO PUBLICO del modulo `inventario`.
// Regla: solo reexporta simbolos de `./domain`. Nada de 'use server', nada de Prisma, nada
// de next/*: tiene que poder importarse desde un componente de cliente sin arrastrar
// servidor (`docs/architecture.md > Modulos y arquitectura hexagonal`).
//
// Hoy publica SOLO TIPOS: la costura por la que otro modulo (`recetas`, QC-24) puede
// apuntar a un producto sin tocar la tabla `products` ni el cliente Prisma. La
// implementacion de `ProductCatalog` es un adaptador driven de ESTE modulo y su cableado
// vive en `lib/composition`; las trae QC-25.
export type { ProductCatalog, ProductId, ProductRef } from './domain/product-catalog';
