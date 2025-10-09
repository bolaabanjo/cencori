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

## Development Setup

### Prerequisites
- Node.js 18+  
- A Supabase project (free tier acceptable)  
- Basic knowledge of TypeScript and Next.js  

### Installation

1. Clone this repository:
   ```bash
   git clone https://github.com/bolaabanjo/cencori.git
   cd cencori

---
Roadmap
Phase	Focus	Description
Phase 1	Foundation	Multi-tenant backend, authentication, and API endpoints
Phase 2	Infrastructure	Deployment layer, runtime system, and metrics
Phase 3	Platform	Developer dashboard, usage analytics, and billing systems
License

Copyright © 2025 FohnAI

All rights reserved. Unauthorized distribution or reproduction of this codebase, in whole or in part, is strictly prohibited without prior written permission from FohnAI.