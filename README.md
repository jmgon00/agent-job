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

## Estructura del Proyecto

```
src/
  app/
    api/
      jobs/
      profiles/
      applications/
    dashboard/
    page.tsx
  components/
    sections/
    ui/
  lib/
    agents/
    db.ts
    validators.ts
  content/
  types/
prisma/
  schema.prisma
  seed.ts
```

## Roadmap MVP

- [ ] Upload de Excel con postulaciones/perfiles
- [ ] Agente de IA: optimizacion de CV/perfil por portal
- [ ] Conexion a APIs de LinkedIn / Bumeran
- [ ] Dashboard: estado de perfiles + proximas acciones
- [ ] Job scraper

Cada item de este roadmap se disena e implementa como su propio spec.
