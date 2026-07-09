# agent-job

Plataforma de automatizacion de busqueda de empleo: sube tu CV/Excel de postulaciones,
un agente de IA optimiza tu perfil por portal, sincroniza el estado de tus postulaciones
en LinkedIn y Bumeran, y seguis todo desde un dashboard.

## Stack Tecnologico

- **Framework:** Next.js 16.2.10 (App Router)
- **Lenguaje:** TypeScript 5
- **Estilos:** Tailwind CSS 4
- **Base de Datos:** Prisma 6 + PostgreSQL (Neon)
- **IA:** Claude 3.5 Sonnet (`@anthropic-ai/sdk`)
- **Validacion:** Zod 4
- **Runtime:** Node.js 20.9+

## Instalacion

### 1. Clonar el repositorio

```bash
git clone https://github.com/jmgon00/agent-job.git
cd agent-job
```

### 2. Instalar dependencias

```bash
npm install
```

### 3. Configurar variables de entorno

```bash
cp .env.example .env.local
```

Edita `.env.local` con tu `DATABASE_URL` de Neon y tu `ANTHROPIC_API_KEY`.

### 4. Generar el cliente Prisma

```bash
npx prisma generate
```

### 5. Aplicar el schema a tu base de datos Neon

```bash
npx prisma db push
```

### 6. Iniciar el servidor de desarrollo

```bash
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000).

## Autenticacion (MVP)

Toda la app esta detras de un gate de email: al entrar sin un usuario guardado en
localStorage, solo se ve un modal pidiendo tu email (no se puede cerrar sin
completarlo). Al enviarlo, se crea o recupera tu usuario en la base (`POST
/api/auth`) y queda cacheado en localStorage para las proximas visitas. No hay
contrasena, sesion ni verificacion de email — es un mecanismo de identidad minimo
para el MVP. Hay un boton "Cerrar sesion" para limpiar el localStorage y volver a
ver el modal.

## Upload de Excel

En `/upload` (requiere estar autenticado) se puede subir un archivo `.xlsx` con
postulaciones/empleos guardados. La primera fila debe tener estos encabezados
(en cualquier orden): `Titulo`, `Empresa`, `Portal`, `Salario` (opcional), `Link`,
`Estado` (opcional, por defecto `"saved"`). Cada fila valida se guarda como un
`SavedJob`; las filas con `Titulo`/`Empresa`/`Portal`/`Link` faltante se reportan
como error sin frenar el resto del archivo. Limite de tamano: 5MB por archivo.
No hay deduplicacion (cada subida crea filas nuevas) ni soporte para `.xls`/`.csv`.

## Tests

```bash
npm run test
```

Corre con [Vitest](https://vitest.dev/). Los tests de `src/app/api/auth/route.test.ts`
y `src/app/api/jobs/upload/route.test.ts` son de integracion contra tu base de datos
real de Neon (no hay mock): necesitas un `DATABASE_URL` valido en `.env.local` para
correrlos, y cada test limpia las filas que crea (emails unicos bajo
`@agentjob-test.local`).

## Estructura del Proyecto

```
src/
  app/
    api/
      auth/
      jobs/
        upload/
      profiles/
      applications/
    dashboard/
    upload/
    page.tsx
  components/
    sections/
      AuthGate.tsx
      EmailGateModal.tsx
    ui/
  lib/
    agents/
    auth-storage.ts
    db.ts
    excel-parser.ts
    validators.ts
  content/
  types/
prisma/
  schema.prisma
  seed.ts
```

## Roadmap MVP

- [x] Autenticacion minima (email + localStorage)
- [x] Upload de Excel con postulaciones/perfiles
- [ ] Agente de IA: optimizacion de CV/perfil por portal
- [ ] Conexion a APIs de LinkedIn / Bumeran
- [ ] Dashboard: estado de perfiles + proximas acciones
- [ ] Job scraper

Cada item de este roadmap se disena e implementa como su propio spec.
