# QC-47 — modelo-empresa-y-membresias · requirements.md

> Zona: `backend` · Complejidad: `high` · `depends_on`: null · Rama: `feature/QC-47-modelo-empresa-y-membresias`
>
> **El slug dice «membresias» y ya no hay membresías.** El nombre se conserva a propósito: la
> rama, el worktree y esta carpeta existen con él, y el arnés no renombra lo que ya está en disco
> (`docs/jira.md`). En el board la ficha se llama «Modelo de empresa y pertenencia del usuario».
>
> **Alcance.** Una tabla nueva, `companies`, y **una columna nueva en `users`: `company_id`**,
> obligatoria. Un usuario pertenece a **una sola** empresa y tiene **un solo** rol. La empresa se
> identifica por un UUID aleatorio no adivinable y su nombre no se repite, medido sin mayúsculas
> ni acentos; al dar de baja una empresa su nombre queda liberado. El correo, el nombre de
> usuario y el documento pasan a ser únicos **dentro de la empresa**. El seed deja una empresa
> inicial `QuimiCloud` con el usuario semilla dentro.
>
> **Lo que NO entra.** `users.role_id` **no se toca**: se queda exactamente donde está y como
> está. **No hay tabla de membresías** y no se construye nada que permita pertenecer a dos
> empresas. La empresa en la sesión y su validación en el middleware: es **QC-48**. Separar los
> datos ya guardados: inventario **QC-49**, recetas **QC-50**, unidades **QC-51**, proveedores
> **QC-59** y pedidos **QC-60**. La guardia de esquema: **QC-61**. Un CRUD de empresas, una
> pantalla o un selector de empresa **no tienen ficha y no se construyen**
> (`docs/architecture.md > Dominio` n.º 1: eso sigue siendo sobre-ingeniería). **No hay E2E
> nuevo** (decisión 15).
>
> Sembrado por `/afinar-feature` el 2026-09-04 y **reacotado el mismo día**, tras un
> malentendido: la primera versión modelaba una relación de muchos a muchos con tabla de
> pertenencias y movía el rol allí. El humano aclaró que un usuario tiene un solo rol y pertenece
> a una sola empresa. El bloque de Alcance y la tabla de «Decisiones cerradas» los fijó el humano
> ANTES del spec. `spec_author` los respeta, no los reabre y no los reescribe: su trabajo aquí es
> `## Requisitos (EARS)`.

## Requisitos (EARS)

_Pendiente: los escribe spec_author (F1.2)._

## Preguntas abiertas

No se rellenan con supuestos (regla 6 de `CLAUDE.md`).

1. **Cómo sabe el login de qué empresa eres.** Si el nombre de usuario solo es único dentro de la
   empresa, dos empresas pueden tener cada una su `admin` y el login deja de poder identificar a
   nadie solo con usuario y contraseña. **Hoy no rompe nada** —solo hay una empresa y ninguna
   ficha permite crear otra—, así que no bloquea esta ficha. La hereda **QC-48**, donde ya está
   anotada con las salidas conocidas (campo de empresa en el login, subdominio o ruta por
   empresa, o dejar el usuario global). **No se decide aquí.**
2. **Moneda por empresa** (pregunta abierta n.º 5 del dominio). No bloquea: aquí no entra ningún
   importe.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
| --- | --- | --- |
| 2026-09-04 | Cómo se identifica una empresa | Por un **identificador propio no adivinable**: UUID aleatorio como clave, ni correlativo ni derivado del nombre. Heredado del patrón de **QC-4** |
| 2026-09-04 | ¿Puede haber dos empresas con el mismo nombre? | **No.** Único, medido **sin mayúsculas ni acentos**, con el patrón de nombre normalizado de **QC-14**/**QC-20** y **QC-32** |
| 2026-09-04 | ¿Una empresa dada de baja libera su nombre? | **Sí.** Índice único **parcial** (`WHERE deleted_at IS NULL`), el precedente de `recipes`, `suppliers` y `users` |
| 2026-09-04 | ¿A cuántas empresas pertenece un usuario? | **A una sola.** `users.company_id`, **obligatoria**, con FK que impide borrar una empresa que todavía tenga usuarios. **No hay tabla de pertenencias** |
| 2026-09-04 | ¿Cuántos roles tiene un usuario? | **Uno solo, y `users.role_id` se queda intacto.** El rol NO se mueve: el seed, el login y el rol firmado en la cookie siguen leyéndolo del mismo sitio que hoy |
| 2026-09-04 | ¿El correo, el usuario y el documento siguen siendo únicos en todo el sistema? | **No: pasan a ser únicos DENTRO de la empresa.** Dos empresas pueden tener cada una su `admin`. Obliga a rehacer los tres índices únicos de **QC-4**, que son funcionales y parciales y están escritos a mano en su migración |
| 2026-09-04 | ¿Se puede dar de baja una empresa? | **Baja lógica.** La columna `deleted_at` nace con la tabla; **la operación de baja no se construye aquí** |
| 2026-09-04 | ¿Los roles y los tipos de documento se separan por empresa? | **No, son del sistema.** «Administrador» significa lo mismo en todas (`docs/architecture.md > Dominio` n.º 1) |
| 2026-09-04 | Cómo se llama la empresa inicial que crea el seed | **`QuimiCloud`**, en una única constante del dominio, usada por el seed **y** por el backfill de la migración. **No** sale del entorno |
| 2026-09-04 | Qué hace la migración con los usuarios ya cargados | Crea la empresa inicial y **mete a todos dentro**, sin perder ni cambiar el rol de ninguno |
| 2026-09-04 | Idioma de los identificadores de la base | **Inglés**. Heredado de **QC-4** |
| 2026-09-04 | Marcas de tiempo | `created_at` y `updated_at` en la tabla nueva. Heredado de **QC-4** y **QC-14** |
| 2026-09-04 | RLS | **Activada y forzada** en `companies`. La frontera real es el service (`docs/architecture.md > Acceso a datos y autorizacion`) |
| 2026-09-04 | Migración | Con su `down.sql`, que revierte **al esquema exacto anterior**, incluidos los tres índices únicos de QC-4 tal como estaban |
| 2026-09-04 | ¿Hace falta E2E? | **No hay E2E nuevo.** Es ficha de modelo y seed. Los E2E existentes tienen que seguir verdes |
| 2026-09-04 | Módulo declarado en el esquema | `/// @module identity` en `Company`: el usuario es de `identity` y la empresa cuelga de él. Cerrado ya en la primera vuelta del `design.md` |
| 2026-09-04 | ¿Librería nueva? | **Ninguna** |
