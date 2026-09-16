# QC-106 — endpoint-de-carga-de-pdf · requirements.md

> **Zona** `backend` · **Complejidad** `high` · **depends_on** ninguna · **Rama**
> `feature/QC-106-endpoint-de-carga-de-pdf`
>
> **Alcance.** Subida de **hasta 10 PDFs por tanda** a un bucket **privado y nuevo** de Supabase
> Storage, cada uno con su **enlace de subida firmado** que emite el servidor, y las **dos
> conversiones** —el PDF a imagen de sus páginas y el PDF a texto— publicadas **detrás de un
> puerto** como capacidad del módulo **nuevo `documentos`**. La conversión **no** viaja en la
> respuesta de la subida: la ejecuta el trabajo de la cola (**QC-111**), que usa esta capacidad por
> dentro.
>
> **Lo que NO entra.** Encolar y procesar, el estado por archivo y **el borrado del PDF temporal**
> → **QC-111**. La pantalla y el componente de subida → **QC-107**. La lectura con Gemini →
> **QC-108**. La estrategia catálogo/fórmula → **QC-109**. El recorte de imágenes → **QC-110**.
>
> Sembrado por `/afinar-feature` el 2026-09-16. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

_Pendiente: los escribe spec_author (F1.2)._

## Preguntas abiertas

No se rellenan con supuestos (regla 6 de `CLAUDE.md`). **Ninguna de las tres bloquea el alcance.**

1. **¿Quién crea el bucket privado y sus límites, y dónde queda escrito?** Se verificó en disco que
   **no existe ni un script ni una migración que cree buckets** —`db/migrations/**` y `scripts/` no
   mencionan ninguno—: el bucket de recetas de QC-25 **se creó a mano en la consola de Supabase**.
   Los límites de la decisión 10 (`fileSizeLimit`, `allowedMimeTypes`) viven ahí, o sea **fuera del
   repositorio y fuera del alcance del gate**, así que nada del arnés puede comprobar que estén
   puestos. Es trabajo de entorno, no de código.
2. **Las tres variables `SUPABASE_STORAGE_*` no están en el `.env` de la máquina de desarrollo**
   —solo `DATABASE_URL`, `DIRECT_URL`, `SESSION_SECRET`, `SEED_ADMIN_*` y las de MCP—. En ese árbol
   el Storage **no está configurado ni siquiera para recetas**, así que nada de esta ficha se puede
   probar contra Supabase real ahí. Con la decisión 12 la suite no lo necesita; lo que queda sin
   decidir es si alguien va a querer probarlo a mano alguna vez.
3. **¿`@napi-rs/canvas` corre en el runtime de Vercel?** Es un **binario nativo**, no JavaScript
   puro, y de él depende **solo** la conversión a imagen (es par **opcional** de `unpdf`; la
   conversión a texto no lo necesita). Lo verifica el `design.md` antes de comprometer la decisión
   7; si no corriera, la conversión a texto sigue en pie y la de imagen necesitaría otra vía.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
| --- | --- | --- |
| 2026-09-16 | ¿El bucket es público o privado? | **Privado, y NUEVO**, solo para estos PDFs. **NO deroga QC-25 D5**: el bucket de la imagen de receta sigue siendo **público** y esta ficha no lo toca. Se preguntó expresamente porque QC-25 descartó el bucket privado **a conciencia** («era la recomendación técnica y el humano la descartó», `specs/QC-25-crud-de-recetas/design.md:597,599`), y aquí el contenido es otro: el catálogo de precios o la fórmula de un proveedor, no una foto. Mismo criterio que **QC-110**, que ya tiene decidido un bucket propio para sus recortes |
| 2026-09-16 | ¿Por dónde entran los bytes? | **El navegador sube DIRECTO a Supabase** con un enlace firmado por archivo; **los bytes no atraviesan la aplicación**. Motivo medido, no estético: `next.config.ts` está **vacío** y el límite por defecto de Server Actions es **1 MB**, así que 10 PDFs no caben por el único camino que el repo usa hoy (riesgo ya anotado en `specs/QC-62-pasos-de-receta-enriquecidos/design.md:106-107`). **Es la primera vez que el navegador habla con Supabase**, así que se declara por escrito: esto es **almacenamiento, no datos de negocio**, y el único camino de DATOS sigue siendo Prisma (`docs/architecture.md > Acceso a datos y autorizacion`, que no se relaja) |
| 2026-09-16 | ¿Cuánto vive el enlace de subida? | **15 minutos.** Tiempo de sobra para subir 20 MB por una conexión mala, y corto para que un enlace filtrado sirva de poco |
| 2026-09-16 | ¿Quién puede subir? | **Solo el Administrador**, validado en el **service** con su test — una policy de RLS o un corte de ruta no cuentan como implementado (`CHECKPOINTS.md > Datos y seguridad`). **El catálogo cerrado de 15 permisos NO se amplía**: no nace ningún `documentos.*`, así que no hay migración ni seed de permisos ni guardias que tocar. Heredado de **QC-20 D2** y **QC-25 D1** |
| 2026-09-16 | ¿Deja alguna fila en la base de datos? | **No.** La subida devuelve **la ruta** del archivo. El estado por archivo —en cola, procesando, listo, error— y la tabla donde viva son alcance de **QC-111**, que además tiene declarado abierto «dónde se guarda el estado». Así no hay dos fichas decidiendo la misma tabla. **Consecuencia**: esta ficha no crea ninguna tabla de operación, y por tanto no le aplica la obligación de columna de empresa de `docs/architecture.md > Dominio` — el aislamiento lo da la decisión siguiente |
| 2026-09-16 | ¿Se aísla por empresa? | **Sí: la ruta dentro del bucket empieza por la empresa**, y el servidor **solo firma enlaces dentro del prefijo de la empresa de quien pide**. Sin esto, y al no haber fila en base, conocer un identificador ajeno daría acceso al archivo — justo lo que el dominio prohíbe. Hereda además el criterio de **QC-25 D6**: en la ruta va **la ruta**, nunca la URL completa |
| 2026-09-16 | ¿Qué librería convierte el PDF? | **`unpdf`** más **`@napi-rs/canvas`** como par **opcional**. Una sola librería cubre **las dos** conversiones: se verificó **en el paquete publicado**, no de memoria, que exporta `extractText` **y** `renderPageAsImage`. **Los cuatro checks, verificados el 2026-09-16 contra npm**: `unpdf` sin `deprecated`, `1.8.1` del **2026-08-13**, **2.568.072** descargas/semana, **MIT**, y **cero dependencias propias**; `@napi-rs/canvas` sin `deprecated`, `1.0.9` del **2026-09-09**, **17.616.629** descargas/semana, **MIT**. **Descartada a sabiendas `mupdf`**, que técnicamente es la mejor —hace render y texto de una pieza—: su licencia es **AGPL-3.0-or-later** y **falla el check 4**. Descartadas también `pdf-lib` (última publicación **2022-05-12**, falla el check 2) y `pdf2pic` (falla el check 2 y además exige binarios de ImageMagick). **La aprobación humana y sus filas en `docs/dependencias.md` van en F1.4**, como QC-25 y QC-28: nada se instala antes |
| 2026-09-16 | ¿`@supabase/storage-js` es dependencia nueva? | **No: ya está aprobada** (`docs/dependencias.md:32`, 2026-09-03). Se verificó que la versión **instalada 2.115.0** expone `createSignedUploadUrl`, `uploadToSignedUrl` y `createSignedUrl`, así que la decisión 2 es implementable sin nada nuevo. **Pero su fila dice que «la consume un solo archivo»**, y esta ficha añade un segundo consumidor: **esa fila hay que actualizarla en F1.4**, no dejarla mintiendo |
| 2026-09-16 | ¿En qué formato y resolución salen las páginas? | **PNG a 150 DPI.** Sin pérdida, porque lo que va a leer Gemini (**QC-108**) son tablas de precios y texto pequeño, y la compresión con pérdida cuesta dígitos mal leídos. 150 DPI es donde el texto de 8 pt sigue siendo legible sin disparar el peso ni los tokens de imagen |
| 2026-09-16 | ¿Qué límites tiene cada archivo? | **20 MB y 50 páginas por PDF.** El número de páginas importa tanto como el peso: un PDF de 2 MB con 400 páginas cuesta 400 renders y 400 llamadas de IA, así que un límite solo de tamaño no protegería de nada |
| 2026-09-16 | ¿Cómo se hacen cumplir esos límites, si el servidor no ve los bytes? | **El tamaño y el tipo los impone EL PROPIO BUCKET**: `fileSizeLimit` y `allowedMimeTypes: ['application/pdf']`, verificados como opciones reales de `@supabase/storage-js` 2.115.0. Lo hace cumplir el servicio de Storage, no nuestro código, así que un archivo de 25 MB se rechaza **aunque el enlace esté firmado**. **Las páginas solo se saben abriendo el PDF**, así que ese límite lo aplica **la conversión**. Es la resolución explícita de la tensión entre las decisiones 2 y 9, y se escribe en vez de darse por supuesta |
| 2026-09-16 | ¿Qué pasa con un PDF que no se puede convertir? | En la subida se rechaza **lo comprobable** —la firma del contenido y lo que imponga el bucket—, heredando de **QC-25 D7** que se valida **por contenido y no por extensión**. Lo que solo se descubre al convertir —cifrado, corrupto— **falla como error de ESE archivo** y **no tumba los otros nueve** de la tanda |
| 2026-09-16 | ¿Dónde vive este código? | **Módulo NUEVO `documentos`**, con su `index.ts`, su `domain/`, sus `ports/` y sus `adapters/`. Es legal: la guardia solo exige que existan `identity` e `inventario` (`tests/guards/guard-arquitectura-modulos.test.ts:202-207`). **No se cuelga de `recetas`**, cuyo puerto de storage es específico —ruta cableada a `recetas/<uuid>` y extensión limitada a `jpg\|png\|webp`—, ni de `proveedores`: toda la épica QC-105 va a colgar de aquí |
| 2026-09-16 | ¿Dónde vive la subida? | **Detrás de un puerto del módulo `documentos`**, con su adaptador driven. El caso de uso no conoce Supabase, y **un doble en los tests hace que la suite no necesite red ni bucket** — que es condición para que `./init.sh` siga corriendo sin red. Heredado de **QC-25 D10** |
| 2026-09-16 | Configuración del Storage | Las variables que necesite quedan **declaradas y vacías** en `.env.example` y documentadas. Ningún secreto en el repositorio (`CHECKPOINTS.md > Configuracion`). Heredado de **QC-25 D11** |
| 2026-09-16 | ¿Códigos de error nuevos? | **Ninguno.** Se reutilizan `unauthorized` e `invalid_input`; **el catálogo cerrado de QC-70 no se enmienda**, y por tanto no hay sexta/octava familia ni enmienda que aprobar |
| 2026-09-16 | ¿Hace falta E2E? | **Diferido a QC-107, con motivo**: esta ficha no añade ninguna pantalla ni ruta navegable, así que no hay recorrido que visitar. Es **deuda con destinatario, no exención** de `CHECKPOINTS.md > Calidad de codigo`. Mismo criterio que **QC-25 D23** y **QC-20 D4** |
| 2026-09-16 | Capas, borde e identificadores | Validación de entrada con **zod** en el borde (`docs/conventions.md`). Identificadores de la base en **inglés** (**QC-4**). El dominio no conoce Supabase ni `next/*`; el cableado puerto → adaptador vive **solo** en `lib/composition` |
