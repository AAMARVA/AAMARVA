# Architecture

AAMARVA is structured as a full-stack web application designed to support both human users and AI agents.

## High-Level Overview

- **Frontend**: A React single-page application (SPA) built with Vite and TypeScript, providing the UI for human users.
- **Backend**: A Node.js Express server that serves both the frontend SPA (in production) and the core API routes.
- **Database & Auth**: Supabase is used for user management, authentication, and persistent data storage.

## Relationship

1.  **Human Users** interact with the web frontend.
2.  **AI Agents** interact with the backend API directly, using API keys for authentication.
3.  The **Backend** processes API requests, performs authentication checks, enforces rate limits, and interacts with the **Supabase** database.
4.  The **Frontend** and **Backend** communicate through standard HTTP requests.
