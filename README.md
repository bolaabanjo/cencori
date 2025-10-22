![Cencori by FohnAI](public/Bonus.png)

# Cencori by FohnAI

Cencori is a multi-tenant AI infrastructure platform designed to help teams build, deploy, and scale AI-driven applications with consistency and reliability. It provides the foundational backend and system architecture required to manage AI products in production environments.

---

## Overview

Cencori is developed by **FohnAI** as part of a broader initiative to modernize AI infrastructure. The goal is to unify how developers create, protect, and scale AI systems across different use cases, ranging from experimental prototypes to enterprise-grade solutions.

This project represents the **MVP** phase of the Cencori platform, focusing on the foundational backend layer and multi-tenant system design.

---

## Core Objectives

1. Establish a secure and extensible multi-tenant architecture.  
2. Implement a robust authentication and organization management system.  
3. Enable developers to deploy and manage AI-powered applications seamlessly.  
4. Lay the groundwork for FohnAI’s broader runtime and deployment ecosystem.

---

## Technology Stack

| Layer | Technology | Purpose |
|-------|-------------|----------|
| **Framework** | Next.js (App Router) | Core web framework and API routing |
| **Auth & Database** | Supabase | Authentication, data storage, and organization logic |
| **Language** | TypeScript | Type-safe backend and frontend development |
| **Deployment** | Vercel | Initial hosting and continuous deployment |
| **ORM (Future)** | Drizzle ORM or Prisma | Database schema management and migration control |
| **Backend Core (Future)** | NestJS | Dedicated service backend for scaling and modularity |

## Project Status

Cencori is currently in its **MVP (Minimum Viable Product)** phase. We are actively developing core features for multi-tenancy, authentication, and foundational API services. Future phases will expand on deployment infrastructure, developer dashboard, and billing systems.

---

## Architecture Overview

The MVP backend is composed of:

- **Organizations & Projects:**  
  Supports multi-tenancy by grouping users and their assets under organizations and projects.  
- **Supabase Integration:**  
  Handles authentication, authorization, and secure database operations.  
- **Server Client Layer:**  
  A secure abstraction layer for Supabase (`/lib/supabaseServer.ts`) to manage service-role operations safely.  
- **API Routes:**  
  Provides REST endpoints for creating, reading, and managing organizational data.  

Future phases will transition this architecture into a service-oriented system powered by NestJS, with dedicated modules for runtime orchestration, metrics, and billing.

---

## Contributing

We welcome contributions to Cencori! To ensure a smooth collaboration process, please follow these guidelines:

1.  **Fork the repository:** Start by forking the [Cencori repository](https://github.com/bolaabanjo/cencori).
2.  **Create a new branch:** For each new feature or bug fix, create a dedicated branch:
    ```bash
    git checkout -b feature/your-feature-name
    # or
    git checkout -b bugfix/issue-description
    ```
3.  **Code Standards:**
    *   Write clean, readable, and well-commented TypeScript code.
    *   Follow the existing code style and conventions.
    *   Ensure your code passes linting checks.
4.  **Testing:**
    *   Add unit and integration tests for new features or bug fixes.
    *   Ensure all existing tests pass before submitting a pull request.
5.  **Commit Messages:** Use clear and descriptive commit messages following the Conventional Commits specification (e.g., `feat: add new feature`, `fix: resolve bug in auth flow`).
6.  **Pull Requests:**
    *   Open a pull request to the `main` branch of the original repository.
    *   Provide a clear and concise description of your changes.
    *   Reference any relevant issues.

---

## Development Setup

### Prerequisites
- Node.js 18+  
- A Supabase project (free tier acceptable)  
- Basic knowledge of TypeScript and Next.js  

### Installation

1.  Clone this repository:
    ```bash
    git clone https://github.com/bolaabanjo/cencori.git
    cd cencori
    ```
2.  Install dependencies:
    ```bash
    npm install
    # or yarn install
    ```
3.  Set up environment variables:
    Create a `.env.local` file in the root of your project and add your Supabase credentials:
    ```
    NEXT_PUBLIC_SUPABASE_URL=YOUR_SUPABASE_URL
    NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
    SUPABASE_URL=YOUR_SUPABASE_URL
    SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
    NEXTAUTH_SECRET=YOUR_NEXTAUTH_SECRET # If using NextAuth (optional, but good practice)
    ```
    You can find your Supabase URL and Anon Key in your Supabase project settings.
    For `NEXTAUTH_SECRET`, you can generate a strong secret using `openssl rand -base64 32` or a similar method.

### Running the Development Server

To run the project locally:

```bash
npm run dev
# or yarn dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

---
Roadmap
Phase	Focus	Description
Phase 1	Foundation	Multi-tenant backend, authentication, and API endpoints
Phase 2	Infrastructure	Deployment layer, runtime system, and metrics
Phase 3	Platform	Developer dashboard, usage analytics, and billing systems
## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.