# QC-47 — modelo-empresa-y-membresias · requirements.md

> Zona: `backend` · Complejidad: `high` · `depends_on`: null · Rama: `feature/QC-47-modelo-empresa-y-membresias`
>
> **Alcance.** Dos tablas nuevas —la empresa y la pertenencia de un usuario a una empresa— y el
> movimiento del rol desde la ficha del usuario hasta esa pertenencia. La empresa tiene nombre
> único y se identifica por un identificador propio no adivinable. Un usuario puede pertenecer a
> varias empresas, con un rol distinto en cada una. El seed deja una empresa inicial con el
> usuario semilla dentro, y el seed y el login se adaptan a leer el rol de la pertenencia.
>
> **Lo que NO entra.** La empresa en la sesión y su validación en el middleware: es **QC-48**.
> Separar los datos ya guardados: inventario **QC-49**, recetas **QC-50**, unidades **QC-51**,
> proveedores **QC-59** y pedidos **QC-60**. La guardia de esquema que hará cumplir la columna de
> empresa: es **QC-61**. Un CRUD de empresas, una pantalla o un selector de empresa **no tienen
> ficha y no se construyen** (`docs/architecture.md > Dominio` n.º 1: eso sigue siendo
> sobre-ingeniería). **No hay E2E nuevo** (decisión 14).
>
> Sembrado por `/afinar-feature` el 2026-09-04. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

_Pendiente: los escribe spec_author (F1.2)._

## Preguntas abiertas

No se rellenan con supuestos (regla 6 de `CLAUDE.md`).

1. **Módulo propietario de las dos tablas nuevas.** ¿Un módulo `empresas` propio, como se hizo
   con `unidades` en QC-32, o dentro de `identity`? No es libre: la guardia
   `guard-arquitectura-modulos` prohíbe que un módulo consulte un modelo ajeno con Prisma, y el
   login y el seed —que son de `identity`— pasan a necesitar el rol, que vivirá en la
   pertenencia. Lo decide el `design.md` con ese condicionante encima de la mesa.
2. **Con qué empresa inicia sesión quien tenga más de una pertenencia.** El modelo lo permite
   desde el primer día; quién elige es de **QC-48**, que ya la lleva anotada como su pregunta
   abierta. Aquí solo se hace constar que el modelo no la cierra.
3. **Moneda por empresa** (pregunta abierta n.º 5 del dominio, abierta el 2026-09-04 al
   reescribir el punto 1). No bloquea esta ficha: aquí no entra ningún importe.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
| --- | --- | --- |
| 2026-09-04 | Cómo se identifica una empresa | Por un **identificador propio no adivinable**: UUID aleatorio como clave, ni correlativo ni derivado del nombre. Heredado del patrón de **QC-4** y de todas las tablas del repo |
| 2026-09-04 | ¿Puede haber dos empresas con el mismo nombre? | **No.** El nombre es único, medido **sin distinguir mayúsculas ni acentos**, con el patrón de nombre normalizado que ya usan las presentaciones (**QC-14**/**QC-20**) y las unidades (**QC-32**) |
| 2026-09-04 | ¿Un usuario puede pertenecer a varias empresas? | **Sí**, el modelo lo soporta desde el principio. Hoy todos pertenecen a una sola y no hay forma de cambiar |
| 2026-09-04 | ¿La misma persona puede estar dos veces en la misma empresa? | **No.** La pareja usuario + empresa es única |
| 2026-09-04 | ¿El rol es el mismo en todas las empresas de una persona? | **No: el rol es por empresa.** Sale de la ficha del usuario y vive en la pertenencia |
| 2026-09-04 | Qué pasa con `users.role_id`, del que hoy leen el seed, el login y el rol firmado en la cookie | **Se mueve del todo en esta ficha.** La columna desaparece de `users`. Como cada persona tiene exactamente una pertenencia, el seed y el login resuelven el rol por ella y **siguen firmando el mismo rol de siempre**: nada cambia hacia fuera |
| 2026-09-04 | ¿Los roles y los tipos de documento se separan por empresa? | **No, son del sistema.** «Administrador» significa lo mismo en todas (`docs/architecture.md > Dominio` n.º 1) |
| 2026-09-04 | ¿Se puede dar de baja una empresa? | **Baja lógica.** La columna `deleted_at` nace con la tabla; **la operación de baja no se construye aquí** — no hay CRUD ni pantalla |
| 2026-09-04 | Idioma de los identificadores de la base | **Inglés** (tablas, columnas, índices, restricciones). Heredado de **QC-4** |
| 2026-09-04 | Marcas de tiempo | `created_at` y `updated_at` en las dos tablas nuevas. Heredado de **QC-4** y **QC-14** |
| 2026-09-04 | RLS | **Activada y forzada** en las dos tablas nuevas. Es defensa en profundidad; la frontera real es el service (`docs/architecture.md > Acceso a datos y autorizacion`). Heredado de **QC-14** |
| 2026-09-04 | Migración | Con su `down.sql`, que revierte **al esquema exacto anterior** — incluida la vuelta de `role_id` a `users`. Heredado de **QC-14** |
| 2026-09-04 | Módulo declarado en el esquema | `/// @module` obligatorio en los dos modelos nuevos. Heredado de **QC-14**; qué módulo, pregunta abierta 1 |
| 2026-09-04 | ¿Hace falta E2E? | **No hay E2E nuevo.** Es ficha de modelo y seed, no estrena pantalla. Pero el login **sí** cambia de fuente para el rol, así que el E2E de login que ya existe (**QC-7**) tiene que seguir verde y **esa es la prueba de que nada se rompió hacia fuera** |
| 2026-09-04 | ¿Librería nueva? | **Ninguna** |
