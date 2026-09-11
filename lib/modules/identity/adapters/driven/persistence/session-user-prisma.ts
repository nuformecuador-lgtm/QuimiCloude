import { prisma } from '@/lib/shared/db/prisma';

import type { SessionUserRecord } from '../../../ports/session-user-reader';

/**
 * Implementa `SessionUserReader.findActiveById` (`design.md > 4.2`). Busca por clave primaria,
 * asi que va con la API tipada de Prisma y no con `$queryRaw`: aqui no hay ningun indice
 * funcional que esquivar, a diferencia de `findActiveByUsername` en
 * `user-credentials-prisma.ts`, que si lo tiene.
 *
 * `deletedAt: null` va en el `where`, no en un `if` posterior (R11): un usuario dado de baja
 * no debe salir de la base para la sesion.
 *
 * El `select` es explicito y minimo (R14): ni correo, ni telefono, ni documento, ni
 * `password_hash`, ni los contadores de bloqueo. `role.name` viaja en la misma consulta, por la
 * FK ya indexada `users_role_id_idx`, y no como una segunda consulta aparte: es lo que hace
 * barata la decision «el rol es siempre el actual» (R12).
 *
 * `id` es `@db.Uuid`: un `sub` sin forma de UUID haria que Prisma lanzara en vez de devolver
 * `null`. Por eso el esquema del dominio exige forma de UUID y corta antes de llegar aqui (R6).
 *
 * QC-48 (T6, R13, `design.md > 4.1`): el `select` gana `companyId` y `company.deletedAt`, en
 * ESTA MISMA llamada a `findFirst`. `companyId` es una columna de `users` y ya venia en la fila;
 * `company.deletedAt` vive en `companies` y Prisma lo resuelve por la relacion ya declarada y por
 * la clave primaria de `companies`, igual que ya hace con `role.name`. **Ni una segunda consulta
 * por peticion**, que era la condicion.
 *
 * El coste, aceptado por escrito en `design.md > 4.1` y anotado aqui para que nadie lo descubra
 * de sorpresa: (a) el plan de esta consulta gana un `JOIN` mas —una busqueda por CLAVE PRIMARIA,
 * en la ruta mas caliente de la aplicacion, que ya hacia otro `JOIN` por `users_role_id_idx`—;
 * (b) el `select` deja de ser tan estrecho: sale de la base una marca de tiempo mas, que **no es
 * PII** y no se registra en ningun log.
 *
 * QC-74 (T8, R7, R11, `design.md > 4`): el `select` gana `role.permissions`, otra vez en ESTA
 * MISMA llamada a `findFirst`. Prisma lo resuelve por la relacion `Role.permissions`, o sea por
 * la clave primaria compuesta `(role_id, permission_code)` de `role_permissions`, que hoy
 * devuelve como maximo diez filas. **Ni una consulta adicional por peticion** (R11), que era la
 * condicion; el test `trae los permisos del rol sin una segunda consulta` la vigila con un
 * contador de invocaciones.
 *
 * El mapeo es un `map` a los codigos y nada mas: sin normalizar, sin ordenar y sin deduplicar.
 * La comparacion de `assertPermission` es por pertenencia exacta (R13), asi que cualquier
 * cocina aqui solo podria cambiar el resultado, nunca mejorarlo.
 *
 * QC-78 (T10, R20, R21, `design.md > 4`): el `select` gana `accountStatus` y `lockedUntil`, otra
 * vez en ESTA MISMA llamada a `findFirst`. Las dos son columnas de `users`, o sea que ya venian
 * en la fila leida: **ni un `JOIN` mas, ni una consulta mas por peticion** (R21), que era la
 * condicion. No se anade nada al `where`: el corte por estado es del dominio
 * —`effectiveAccountStatus` en `resolve-session.ts`—, igual que el de la empresa.
 *
 * El coste, declarado: el `select` deja de ser tan estrecho como lo dejo QC-8 R14 —salen un enum
 * mas y una marca de tiempo mas—. **Ninguno de los dos es PII** y ninguno se registra en ningun
 * log, mismo argumento que ya se acepto para `companyDeletedAt`. Y sin `lockedUntil` habria que
 * duplicar aqui la traduccion del plazo, que es justo lo que R7 prohibe.
 */
export async function findActiveSessionUserById(id: string): Promise<SessionUserRecord | null> {
  const usuario = await prisma.user.findFirst({
    where: { id, deletedAt: null },
    select: {
      id: true,
      username: true,
      firstNames: true,
      lastNames: true,
      role: { select: { name: true, permissions: { select: { permissionCode: true } } } },
      companyId: true,
      company: { select: { deletedAt: true } },
      // QC-78 R20, R21: columnas de `users`, en el MISMO `findFirst`.
      accountStatus: true,
      lockedUntil: true,
    },
  });

  if (usuario === null) return null;

  return {
    id: usuario.id,
    username: usuario.username,
    firstNames: usuario.firstNames,
    lastNames: usuario.lastNames,
    roleName: usuario.role.name,
    companyId: usuario.companyId,
    // QC-48 R15: la marca cruda. Quien decide si «esta viva» es el dominio, no este adaptador.
    companyDeletedAt: usuario.company.deletedAt,
    // QC-74 R7: los permisos salen de la ASIGNACION rol-permiso, nunca del nombre del rol.
    permissions: usuario.role.permissions.map((asignacion) => asignacion.permissionCode),
    // QC-78 R7, R20: los dos crudos. Quien traduce «lo que la columna dice» a «lo que significa
    // AHORA» es `effectiveAccountStatus`, no este adaptador.
    accountStatus: usuario.accountStatus,
    lockedUntil: usuario.lockedUntil,
  };
}
