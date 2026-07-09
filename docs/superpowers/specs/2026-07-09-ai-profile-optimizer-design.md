# Agente de IA: optimización de CV/perfil por portal — Design Spec

**Fecha:** 2026-07-09
**Estado:** Aprobado

## Resumen

El usuario escribe un único texto libre describiendo su experiencia, skills y
objetivo laboral (su "perfil base"). Desde una nueva página `/profile`, elige
un portal (LinkedIn o Bumeran) y dispara un agente de IA (Claude) que genera
un `headline` y un `summary` optimizados para ese portal específico. El
resultado se guarda automáticamente como el `UserProfile` de ese
`(usuario, portal)`, sobrescribiendo cualquier versión anterior. No hay paso
de revisión ni edición manual del resultado — para cambiarlo, el usuario
vuelve a apretar "Optimizar".

## Modelo de datos

- **`User`**: se agrega `rawProfile String?` — el perfil base único del
  usuario, reutilizado como input para generar el perfil de cualquier portal.
- **`UserProfile`**: sin cambios de estructura. Sigue siendo una fila por
  `(userId, portal)`, actualizada vía upsert cada vez que el usuario optimiza
  para ese portal. `resumeData Json` queda sin usar (no hay caso de uso para
  esta feature).

## Endpoints (`src/app/api/profiles/`)

### `GET /api/profiles?userId=`
Devuelve `{ rawProfile, profiles: UserProfile[] }` para hidratar `/profile`.
404 si `userId` no existe.

### `PUT /api/profiles/base`
Body: `{ userId, rawProfile }`. Guarda/actualiza `User.rawProfile`. 404 si
`userId` no existe. No crea usuarios (eso es responsabilidad de `/api/auth`).

### `POST /api/profiles/optimize`
Body: `{ userId, portal }`, `portal` validado con Zod como
`"linkedin" | "bumeran"`.

1. Busca el `User` (404 si no existe) y su `rawProfile` (400 si está vacío o
   ausente — "Guardá tu perfil base primero").
2. Arma un system prompt específico del portal (ver abajo) y llama a
   `executeStructuredAgent` con el `rawProfile` como `userQuery`.
3. Valida la respuesta contra el schema Zod `{ headline: string, summary:
   string }`.
4. Hace upsert de `UserProfile(userId, portal)` con el resultado.
5. Devuelve el `UserProfile` guardado (200).

Errores del agente (Anthropic caída, JSON inválido, key faltante) → 500,
logueado server-side, mensaje genérico al cliente.

Mismo modelo de seguridad MVP que el resto de la app: `userId` viaje directo
del cliente, sin verificación de sesión, solo scoping + ownership checks.

### Prompts por portal

- **LinkedIn**: tono profesional/networking. Headline corto con keywords de
  rol + seniority. Summary en primera persona, orientado a reclutadores y
  conexiones.
- **Bumeran**: tono directo, estilo CV latinoamericano. Headline = título de
  puesto buscado. Summary orientado a logros y experiencia concreta.

Los prompts viven en el endpoint (`route.ts`), no en `claude.ts`, para
mantener la lib del agente genérica y reutilizable.

## Capa del agente (`src/lib/agents/claude.ts`)

Se agrega `executeStructuredAgent`, sin modificar `executeAgent` existente:

```ts
async function executeStructuredAgent<T>({
  agentInstructions,
  userQuery,
  schema,
  maxTokens,
  temperature,
}: {
  agentInstructions: string
  userQuery: string
  schema: z.ZodType<T>
  maxTokens?: number
  temperature?: number
}): Promise<T>
```

- El `agentInstructions` debe pedir explícitamente una respuesta en JSON puro
  (Anthropic no tiene `response_format` nativo, así que se refuerza por
  prompt).
- Se parsea el texto de respuesta con `JSON.parse`; si falla, se relanza un
  error descriptivo.
- Se valida el resultado con `schema.parse(...)`; si falla la validación
  Zod, se propaga el error (el caller lo convierte en 500).

## UI — página `/profile`

- Gateada por `AuthGate` (mismo patrón que `/upload` y `/dashboard`).
- **Textarea de perfil base**, precargada con `rawProfile` si existe. Botón
  "Guardar perfil" → `PUT /api/profiles/base`.
- **Selector de portal** (LinkedIn / Bumeran) + botón "Optimizar" →
  `POST /api/profiles/optimize`. Deshabilitado si no hay `rawProfile`
  guardado, con mensaje indicando guardar el perfil base primero.
- **Resultado por portal**: una tarjeta de solo lectura por cada
  `UserProfile` ya generado, mostrando `headline` y `summary`. Sin edición
  manual — se regenera con "Optimizar".
- Estado de carga ("Optimizando...") mientras se espera al agente.
- Link a `/profile` agregado a la navegación de `/dashboard`.

## Testing

- Tests de integración contra Neon real (como el resto del proyecto) para
  `GET /api/profiles` y `PUT /api/profiles/base`.
- Test de integración de `POST /api/profiles/optimize` que mockea la llamada
  al agente (única mock permitida — evita gastar tokens reales/depender de
  red en CI) pero hace upsert real contra la DB, verificando persistencia.
- Test unitario de `executeStructuredAgent` con la respuesta de Anthropic
  mockeada: JSON válido, JSON inválido (debe tirar error), JSON que no
  matchea el schema Zod (debe tirar error).

## Infra

`ANTHROPIC_API_KEY` no está seteada todavía en Vercel (Preview ni
Production) — hay que agregarla antes de deployar esta feature.

## Fuera de alcance

- Extracción de CV desde archivo (PDF/DOCX) — el input es texto libre
  tipeado por el usuario.
- Optimización atada a una oferta (`SavedJob`) específica — la optimización
  es genérica por portal, no por vacante.
- Edición manual del resultado generado — solo regenerar.
- Historial de versiones por portal — cada optimización sobrescribe la
  anterior.
- Portales más allá de LinkedIn/Bumeran (lista fija, no extensible por el
  usuario).
