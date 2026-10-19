# LaunchFlow — Next-Gen Team Orchestration Platform

LaunchFlow is a high-velocity project management and sprint orchestration platform engineered with deep midnight violet aesthetics, fluid telemetry visualizations, and real-time Supabase cloud synchronization.

---

## 🌟 Key Features

- **Modern Dark UI Design System:** Deep midnight navy backgrounds, electric violet highlights, and refined micro-interactions.
- **Supabase Cloud Authentication:**
  - Real email/password registration with workspace provisioning.
  - Persistent sessions and automatic token refresh.
  - Password recovery / reset integration.
  - Real-time authenticated state indicators.
- **Interactive Sprint Telemetry & Showcase:**
  - Sprint Overview, Task Kanban Board, Burndown Telemetry, and Team Activity feeds.
  - Real-time task creation and status toggle synced to PostgreSQL.
- **Enterprise-Grade Database Architecture:**
  - Strict Row Level Security (RLS) on all exposed application tables.
  - Normalized schemas for Workspaces, Members, Projects, Tasks, and Activity Logs.
  - Version-controlled SQL migration files in `supabase/migrations/`.

---

## 🚀 Quick Start & Local Setup

### 1. Prerequisites
- Node.js (v18+)
- npm or pnpm

### 2. Installation
```bash
git clone https://github.com/OneMergeConflict/LaunchFlow.git
cd LaunchFlow
npm install
```

### 3. Environment Configuration
Copy the template file to `.env`:
```bash
cp .env.example .env
```
Provide your Supabase URL and Publishable Key in `.env`:
```ini
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_your_key_here
```

### 4. Running the Development Server
```bash
npm run dev
```
Visit `http://localhost:5173/` in your browser.

### 5. Production Build
```bash
npm run build
npm run preview
```

---

## 🗄️ Database Architecture & Migrations

LaunchFlow comes with a version-controlled PostgreSQL migration located in:
`supabase/migrations/20261019000000_launchflow_schema.sql`

### Tables Implemented
1. `profiles`: User account details, synced automatically via an auth trigger.
2. `workspaces`: Team workspaces with unique slug and ownership constraints.
3. `workspace_members`: Role-based membership (`owner`, `admin`, `member`, `viewer`).
4. `projects`: Sprints and milestone projects within a workspace.
5. `tasks`: Deliverables with status (`todo`, `in-progress`, `review`, `completed`), priority (`low`, `medium`, `high`, `urgent`), assignee, and due dates.
6. `activity_logs`: Chronological audit trail for workspace events.

### Running Migrations in Supabase
1. Open your [Supabase Dashboard](https://supabase.com/dashboard).
2. Navigate to **SQL Editor** in the left sidebar.
3. Open `supabase/migrations/20261019000000_launchflow_schema.sql`, copy its content, and paste it into a new query.
4. Click **Run** to provision the tables, triggers, and Row Level Security policies.

---

## 🚢 Vercel Deployment

1. Push your repository to GitHub.
2. Import the repository in [Vercel](https://vercel.com).
3. Set the Framework Preset to **Vite**.
4. Configure Environment Variables in the Vercel Project Settings:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_PUBLISHABLE_KEY`
5. Click **Deploy**.

---

## 📄 License
This project is licensed under the MIT License.
