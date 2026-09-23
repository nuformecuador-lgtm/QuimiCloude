// lib/modules/identity/adapters/driven/persistence/company-directory-prisma.ts
/**
 * La lista de empresas activas, sin ningun dato de sus usuarios: nadie mas necesita mas que el
 * identificador para recorrerlas una por una. `identity` es el dueno de `companies`, y esta es
 * la unica consulta del repositorio que cruza deliberadamente TODAS las empresas -no hay ningun
 * `companyId` que filtre "la lista de empresas por empresa"-.
 */
import { prisma } from '@/lib/shared/db/prisma';

export async function listActiveCompanyIds(): Promise<readonly string[]> {
  const rows = await prisma.company.findMany({
    where: { deletedAt: null },
    select: { id: true },
    orderBy: { id: 'asc' },
  });
  return rows.map((row) => row.id);
}
