# MTG Utils - Fullstack Magic: The Gathering Deck & Collection Manager

Aplicación fullstack moderna construida con **Next.js 15 (App Router)**, **Server Components & Server Actions (`"use server"`)**, **Prisma ORM**, **shadcn/ui**, **Tailwind CSS** y **Zod**, conectada a **Supabase** y a la **API pública de Scryfall**.

---

## 🎯 Funcionalidades del MVP

1. **Gestión de Mazos (CRUD)**:
   - Crear nuevos mazos especificando nombre, formato (*Commander/EDH, Modern, Standard, Pioneer, etc.*) y notas de estrategia.
   - Búsqueda en vivo de cartas oficiales consumiendo la API de Scryfall con autocompletado y previsualización de arte en alta definición al pasar el ratón.
   - Distribución entre **Mainboard** y **Sideboard**.
   - Ajuste de copias y eliminación de cartas.

2. **Mi Colección (Inventario Físico)**:
   - Registro de las cartas físicas que posee el usuario con contador de copias.
   - Búsqueda directa en la base de datos de Scryfall para añadir cartas al inventario.

3. **Cálculo de Completitud en Tiempo Real**:
   - En la lista de mazos se muestra una **barra de progreso con el % de completitud** calculado contra el inventario del usuario.
   - Desglose exacto: *Cartas en posesión vs Cartas faltantes*.
   - Dentro del detalle del mazo, un filtro permite visualizar exclusivamente las cartas faltantes y un botón de un clic (*"Tengo las faltantes"*) permite transferirlas directamente al inventario físico.

---

## 🔒 Seguridad de Claves (Server-Only)

Para cumplir estrictamente con las directrices de seguridad:
- Las credenciales privadas (`DATABASE_URL`, `DIRECT_URL`, `SUPABASE_SERVICE_ROLE_KEY`) residen en el servidor y **nunca llevan prefijo `NEXT_PUBLIC_`**.
- Al navegador únicamente se le exponen las variables públicas con prefijo `NEXT_PUBLIC_` protegidas por Row Level Security (RLS) en Supabase.

---

## 🚀 Puesta en Marcha

### Opción 1: Con Docker Compose (Recomendado para entorno aislado)

El archivo `docker-compose.yml` levanta tanto la aplicación Next.js como una base de datos PostgreSQL local para pruebas inmediatas sin necesidad de configurar Supabase de antemano:

```bash
# 1. Copia las variables de entorno
cp .env.example .env

# 2. Levanta los contenedores
docker compose up --build
```

La aplicación estará disponible en: [http://localhost:3000](http://localhost:3000).

---

### Opción 2: Ejecución Local

```bash
# 1. Instalar dependencias
npm install

# 2. Configurar variables de entorno
cp .env.example .env

# 3. Generar cliente de Prisma y ejecutar migraciones
npx prisma generate
npx prisma db push   # o npx prisma migrate dev --name init

# 4. Iniciar el servidor de desarrollo
npm run dev
```

---

## 🗄️ Prisma & Base de Datos (Supabase / Postgres)

Para sincronizar o migrar los modelos hacia Supabase:
1. En tu proyecto de Supabase, copia la cadena de conexión de **Transaction Pooler** (puerto 6543) en `DATABASE_URL` y la de **Session/Direct** (puerto 5432) en `DIRECT_URL`.
2. Ejecuta:
   ```bash
   npx prisma migrate dev --name init
   # o para prototipado rápido:
   npx prisma db push
   ```
3. Para abrir la interfaz visual de Prisma Studio:
   ```bash
   npx prisma studio
   ```

---

## 🐞 Depuración en VS Code (`.vscode/launch.json`)

El proyecto incluye configuraciones listas para depurar presionando `F5`:
- **Next.js: Debug Server-side**: Depura Server Components y Server Actions (`"use server"`).
- **Next.js: Debug Client-side (Chrome)**: Depura la interfaz de usuario en el navegador con breakpoints en TypeScript.
- **Next.js: Fullstack (Server + Client)**: Lanza ambas sesiones de depuración en simultáneo.

---

## 📦 Estructura del Proyecto

```
MTG_utils/
├── .vscode/
│   └── launch.json            # Configuraciones de depuración
├── prisma/
│   └── schema.prisma          # Modelos PostgreSQL (Decks, Cards, Collection)
├── src/
│   ├── actions/               # Backend Server Actions ("use server")
│   │   ├── auth.ts            # Sesión y contexto de usuario
│   │   ├── collection.ts      # CRUD de inventario de cartas
│   │   ├── decks.ts           # CRUD de mazos y cálculo de completitud %
│   │   └── scryfall.ts        # Cliente nativo fetch para API Scryfall
│   ├── app/                   # Next.js App Router
│   │   ├── decks/             # Dashboard de mazos
│   │   │   └── [id]/          # Detalle de mazo y desglose de faltantes
│   │   ├── collection/        # Gestor de colección de cartas
│   │   ├── globals.css        # Estilos MTG oscuros con tokens de maná
│   │   └── layout.tsx         # Layout principal con Navbar y tema
│   ├── components/            # Componentes shadcn y Magic
│   │   ├── ui/                # Botones, diálogos, insignias, progresos
│   │   ├── card-preview-hover.tsx  # Hover tooltip con arte Scryfall
│   │   ├── card-search-dialog.tsx  # Buscador reactivo de Scryfall
│   │   ├── deck-card-item.tsx      # Tarjeta interactiva de mazo
│   │   ├── deck-detail-view.tsx    # Vista completa de mazo y filtros
│   │   ├── collection-view.tsx     # Vista de colección física
│   │   ├── mana-cost.tsx           # Renderizador de símbolos de maná
│   │   └── navbar.tsx              # Barra de navegación principal
│   └── lib/
│       ├── prisma.ts          # Singleton de Prisma Client
│       ├── schemas.ts         # Esquemas de validación Zod y tipos
│       ├── supabase.ts        # Cliente Supabase seguro (público vs admin)
│       └── utils.ts           # Helpers (cn, clsx, tailwind-merge)
├── Dockerfile                 # Multi-stage build para Next.js y Prisma
├── docker-compose.yml         # Orquestación de app + base de datos
└── package.json
```
