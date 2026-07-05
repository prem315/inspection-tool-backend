# Inspection Tool — Full Architecture Guide
### Multi-Tenant, GitHub/Trello/Slack-Style Design
> A code-free blueprint for building from scratch

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Technology Stack](#2-technology-stack)
3. [Multi-Tenancy Model](#3-multi-tenancy-model)
4. [Role & Permission System](#4-role--permission-system)
5. [Database Design](#5-database-design)
6. [Entity Relationship Overview](#6-entity-relationship-overview)
7. [Authentication & Sessions](#7-authentication--sessions)
8. [API Structure & Modules](#8-api-structure--modules)
9. [Invitation & Onboarding Flow](#9-invitation--onboarding-flow)
10. [Inspection Workflow (State Machine)](#10-inspection-workflow-state-machine)
11. [Notification System](#11-notification-system)
12. [Activity & Audit Log](#12-activity--audit-log)
13. [Threaded Comments](#13-threaded-comments)
14. [File & Evidence Storage](#14-file--evidence-storage)
15. [Template System](#15-template-system)
16. [API Token / PAT System](#16-api-token--pat-system)
17. [Project Directory Structure](#17-project-directory-structure)
18. [Key Design Decisions & Rationale](#18-key-design-decisions--rationale)
19. [Production Non-Negotiables (Build on Day 1)](#19-production-non-negotiables-build-on-day-1)

---

## 1. System Overview

The Inspection Tool is a **B2B SaaS platform** for managing infrastructure inspections in industries like wind energy, solar, EPC contracting, and power transmission. It is designed around the following hierarchy:

```
Platform (SaaS)
└── Organizations  (companies / clients)
      ├── Members  (users belonging to the org)
      └── Projects (inspection campaigns)
            ├── Members  (users assigned to this project)
            ├── Stages   (phases of the inspection, e.g. "Foundation", "Nacelle")
            │     └── Checkpoints  (individual checklist items per stage)
            │           ├── Evidence / Attachments
            │           └── Measurements
            └── Inspection Requests  (formal EPC → Inspector assignment)
```

**Three user portals exist:**

| Portal | Who uses it | Purpose |
|---|---|---|
| **Super Admin Dashboard** | Platform admins | Manage all organizations, templates, billing |
| **Web App** | Org Owners, EPC Engineers | Create projects, assign inspectors, review results |
| **Mobile App** | Inspectors | Perform on-site inspections, fill checkpoints, capture evidence |

---

## 2. Technology Stack

| Layer | Technology | Reason |
|---|---|---|
| **Runtime** | Node.js | Async-first, great ecosystem |
| **Framework** | NestJS | Structured, modular, DI-based, ideal for large APIs |
| **Language** | TypeScript | Type safety, better tooling |
| **Database** | PostgreSQL | ACID transactions, JSON support, excellent for relational data |
| **ORM** | Prisma | Type-safe queries, great migrations, schema-as-code |
| **Auth** | JWT (access + refresh tokens) + Firebase Phone Auth | Stateless, mobile-friendly |
| **File Storage** | AWS S3 (or compatible: Supabase Storage, Cloudflare R2) | Scalable object storage |
| **Email** | Nodemailer / Resend / SendGrid | Transactional emails |
| **Logging** | Pino (JSON structured logging) | requestId tracing, production-ready |
| **Caching** | Redis (optional, Phase 2) | Rate limiting, session cache, job queues |
| **Background Jobs** | BullMQ + Redis (optional, Phase 2) | Deadline tracking cron, email delivery queue |
| **Testing** | Jest | Unit + integration tests |

---

## 3. Multi-Tenancy Model

### The Problem With a Flat User Model

Before: Every user had a single global role (`OWNER`, `EPC_ENGINEER`, `INSPECTOR`). This means:
- One company's Owner can potentially see another company's projects
- You can't have the same person be an OWNER in Company A but just an INSPECTOR in Company B
- There's no logical grouping of projects by company

### The Solution: Organization Layer

Inspired by **GitHub Organizations**, **Slack Workspaces**, and **Trello Workspaces**:

```
User (platform identity)
  │
  ├── OrganizationMember in Org A (role: OWNER)
  │       └── ProjectMember in Project 1 (role: OWNER)
  │       └── ProjectMember in Project 2 (role: EPC_ENGINEER)
  │
  └── OrganizationMember in Org B (role: MEMBER)
          └── ProjectMember in Project 3 (role: INSPECTOR)
```

**Key rules:**
- A `User` is a platform identity (email, password, avatar). No domain role on the user itself.
- A `User` joins an `Organization` → becomes an `OrganizationMember` with an org-level role.
- A `User` is assigned to a `Project` within an org → becomes a `ProjectMember` with a project-level role.
- The same user can have different roles in different organizations and different projects.
- A `Project` belongs to an `Organization`, not to an individual user.

### Tenancy Isolation

Every database query that returns project data MUST be scoped by:
1. The calling user's `OrganizationMember` records, OR
2. The calling user's `ProjectMember` records

`SUPER_ADMIN` users bypass this check and can see all organizations and projects (for platform management only).

---

## 4. Role & Permission System

### Two-Layer Role System

#### Layer 1 — System Role (on `User`)

| Role | Description |
|---|---|
| `USER` | Default for all regular users. No special platform privileges. |
| `SUPER_ADMIN` | Platform administrators. Can manage all orgs, templates, billing. |

This is the **only** role stored on the `User` table. It controls platform-level access only.

#### Layer 2a — Organization Role (on `OrganizationMember`)

| Role | Permissions |
|---|---|
| `OWNER` | Full control: manage members, billing, all projects, can delete org |
| `ADMIN` | Manage members and projects, cannot manage billing |
| `MEMBER` | Can be assigned to projects; cannot manage org settings |

#### Layer 2b — Project Role (on `ProjectMember`)

| Role | Permissions |
|---|---|
| `OWNER` | Approve/reject stages, manage project members, edit project settings |
| `EPC_ENGINEER` | Create inspection requests, manage stages and checkpoints |
| `INSPECTOR` | Perform on-site inspections, fill checkpoints, upload evidence |
| `VIEWER` | Read-only access (for external clients, auditors) |

### How Access Checks Work

```
Request arrives → JWT validated → SystemRole checked
    │
    ├── if SUPER_ADMIN → full access
    │
    └── if USER
          ├── Check OrganizationMember for the org in context
          │     └── OrgRole determines org-level actions
          └── Check ProjectMember for the project in context
                └── ProjectRole determines project-level actions
```

### Permission Matrix

| Action | SUPER_ADMIN | Org OWNER | Org ADMIN | ProjectRole OWNER | EPC_ENGINEER | INSPECTOR | VIEWER |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| Create Organization | ✅ | ✅ | — | — | — | — | — |
| Invite to Organization | ✅ | ✅ | ✅ | — | — | — | — |
| Create Project | ✅ | ✅ | ✅ | — | — | — | — |
| Edit Project Settings | ✅ | ✅ | ✅ | ✅ | — | — | — |
| Add Project Members | ✅ | ✅ | ✅ | ✅ | — | — | — |
| Create/Edit Stages | ✅ | ✅ | ✅ | ✅ | ✅ | — | — |
| Create Inspection Request | — | — | — | — | ✅ | — | — |
| Perform Inspection | — | — | — | — | — | ✅ | — |
| Approve/Reject Stage | ✅ | — | — | ✅ | — | — | — |
| View Project Data | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Manage Templates | ✅ | — | — | — | — | — | — |
| Upgrade Plan / Suspend Org | ✅ | — | — | — | — | — | — |

> **Note on Create Organization:** Any verified USER can create an org (self-serve). They automatically become OWNER. Plan defaults to FREE. SUPER_ADMIN retains control over plan upgrades, suspensions, and deletions. See Decision 11.

---

## 5. Database Design

### All Models & Their Purpose

> **Soft Delete Rule:** All entity tables include `deletedAt DateTime?`. Queries must always filter `WHERE deletedAt IS NULL`. Enforced globally via Prisma middleware. See Section 19.1.

---

#### `users`
The platform identity. One row per person, regardless of how many organizations they're in.

| Field | Type | Notes |
|---|---|---|
| `id` | UUID | Primary key |
| `name` | String | Display name |
| `email` | String (unique) | Login identifier |
| `phone` | String? | For Firebase Phone Auth (mobile) |
| `passwordHash` | String | bcrypt hashed password |
| `systemRole` | Enum `SystemRole` | `USER` or `SUPER_ADMIN` |
| `isActive` | Boolean | Platform can deactivate users |
| `deletedAt` | DateTime? | **Soft-delete timestamp — never hard delete** |
| `avatarUrl` | String? | Profile picture URL |
| `isEmailVerified` | Boolean | Required before login |
| `emailVerificationToken` | String? | Token sent in verification email |
| `refreshToken` | String? | Hashed refresh JWT |
| `passwordResetToken` | String? | Token for password reset flow |
| `passwordResetExpiry` | DateTime? | Expiry for reset token |
| `lastLoginAt` | DateTime? | Audit tracking |
| `createdAt` | DateTime | Auto |
| `updatedAt` | DateTime | Auto |

**Indexes:** `email`, `systemRole`

---

#### `organizations`
A company, team, or workspace. Equivalent to a GitHub Organization or Slack Workspace.

| Field | Type | Notes |
|---|---|---|
| `id` | UUID | Primary key |
| `name` | String | Display name (e.g., "Acme Wind Energy") |
| `slug` | String (unique) | URL-safe identifier (e.g., "acme-wind-energy") |
| `logoUrl` | String? | Organization logo |
| `plan` | Enum `PlanTier` | `FREE`, `PRO`, `ENTERPRISE` |
| `isActive` | Boolean | Platform can deactivate orgs |
| `deletedAt` | DateTime? | **Soft-delete timestamp — SUPER_ADMIN only** |
| `createdAt` | DateTime | Auto |
| `updatedAt` | DateTime | Auto |

**Indexes:** `slug`, `plan`

---

#### `organization_members`
Junction table linking users to organizations with a role.

| Field | Type | Notes |
|---|---|---|
| `id` | UUID | Primary key |
| `organizationId` | UUID → Organization | FK |
| `userId` | UUID → User | FK |
| `role` | Enum `OrgRole` | `OWNER`, `ADMIN`, `MEMBER` |
| `joinedAt` | DateTime | When user joined the org |

**Unique constraint:** `[organizationId, userId]` — one membership per user per org
**Indexes:** `organizationId`, `userId`

---

#### `organization_invitations`
Invitations to join an organization (before joining any project).

| Field | Type | Notes |
|---|---|---|
| `id` | UUID | Primary key |
| `organizationId` | UUID → Organization | Which org |
| `email` | String | Recipient email |
| `role` | Enum `OrgRole` | Role they'll get when they accept |
| `token` | String (unique) | Secure random token for the link |
| `status` | Enum `InvitationStatus` | `PENDING`, `ACCEPTED`, `DECLINED`, `EXPIRED` |
| `invitedById` | UUID → User | Who sent the invite |
| `expiresAt` | DateTime | 7 days from creation |
| `createdAt` | DateTime | Auto |
| `updatedAt` | DateTime | Auto |

**Unique constraint:** `[organizationId, email]` — one active invite per email per org

> **Expiry enforcement:** A cron job (BullMQ Phase 2, or a simple scheduled task) flips PENDING invitations past `expiresAt` to EXPIRED. Until then, always check `expiresAt` on accept.

---

#### `projects`
An inspection campaign belonging to an organization.

| Field | Type | Notes |
|---|---|---|
| `id` | UUID | Primary key |
| `organizationId` | UUID → Organization | Org-owned, not user-owned |
| `name` | String | Project name |
| `description` | String? | Optional description |
| `location` | String? | Physical location |
| `industryType` | Enum `IndustryType` | `WIND`, `SOLAR`, `HYDRO`, etc. |
| `status` | Enum `ProjectStatus` | `ACTIVE`, `ON_HOLD`, `COMPLETED`, `ARCHIVED` |
| `startDate` | DateTime? | Project start |
| `endDate` | DateTime? | Project end |
| `templateId` | UUID? → ProjectTemplate | Which template was used |
| `createdById` | UUID → User | Who created it (audit) |
| `deletedAt` | DateTime? | **Soft-delete — recoverable** |
| `createdAt` | DateTime | Auto |
| `updatedAt` | DateTime | Auto |

**Indexes:** `organizationId`, `status`, `industryType`

---

#### `project_members`
Junction table linking users to projects with a project-specific role.

| Field | Type | Notes |
|---|---|---|
| `id` | UUID | Primary key |
| `projectId` | UUID → Project | FK |
| `userId` | UUID → User | FK |
| `role` | Enum `ProjectRole` | `OWNER`, `EPC_ENGINEER`, `INSPECTOR`, `VIEWER` |
| `addedById` | UUID? → User | Who added this member |
| `addedAt` | DateTime | When added |

**Unique constraint:** `[projectId, userId]`
**Indexes:** `projectId`, `userId`, `role`

---

#### `project_invitations`
Invitations to join a specific project with a specific role.

| Field | Type | Notes |
|---|---|---|
| `id` | UUID | Primary key |
| `projectId` | UUID → Project | FK |
| `email` | String | Recipient email |
| `projectRole` | Enum `ProjectRole` | Role on the project |
| `token` | String (unique) | Secure token |
| `status` | Enum `InvitationStatus` | PENDING / ACCEPTED / DECLINED / EXPIRED |
| `invitedById` | UUID → User | Sender |
| `expiresAt` | DateTime | 7 days |
| `createdAt` | DateTime | Auto |
| `updatedAt` | DateTime | Auto |

**Unique constraint:** `[projectId, email]`

---

#### `project_templates`
Admin-managed blueprints for projects, grouped by industry type.

| Field | Type | Notes |
|---|---|---|
| `id` | UUID | Primary key |
| `name` | String | Template name |
| `description` | String? | Description |
| `industryType` | Enum `IndustryType` | Which industry |
| `isActive` | Boolean | Soft-delete |
| `createdById` | UUID → User | SUPER_ADMIN who created it |
| `createdAt` | DateTime | Auto |
| `updatedAt` | DateTime | Auto |

---

#### `default_stages`
Stages within a template. Cloned into real stages when a project is created.

| Field | Type | Notes |
|---|---|---|
| `id` | UUID | Primary key |
| `templateId` | UUID → ProjectTemplate | Parent template |
| `name` | String | Stage name |
| `description` | String? | Description |
| `displayOrder` | Int | Ordering |
| `isActive` | Boolean | Soft-delete |
| `createdAt` | DateTime | Auto |
| `updatedAt` | DateTime | Auto |

---

#### `default_checkpoints`
Checklist items within a default stage.

| Field | Type | Notes |
|---|---|---|
| `id` | UUID | Primary key |
| `defaultStageId` | UUID → DefaultStage | Parent |
| `title` | String | Checkpoint title |
| `description` | String? | Details |
| `standardReference` | String? | e.g., "IEC 61400-22 §6.3" |
| `displayOrder` | Int | Ordering |
| `createdAt` | DateTime | Auto |
| `updatedAt` | DateTime | Auto |

---

#### `stages`
Actual inspection stages within a project. Either cloned from a template or custom.

| Field | Type | Notes |
|---|---|---|
| `id` | UUID | Primary key |
| `projectId` | UUID → Project | Parent project |
| `name` | String | Stage name |
| `description` | String? | Description |
| `displayOrder` | Int | Ordering |
| `status` | Enum `StageStatus` | `PENDING`, `IN_PROGRESS`, `SUBMITTED`, `APPROVED`, `REJECTED` |
| `source` | Enum `StageSource` | `DEFAULT` (cloned) or `CUSTOM` |
| `defaultStageId` | UUID? → DefaultStage | Set if cloned |
| `deletedAt` | DateTime? | **Soft-delete** |
| `createdAt` | DateTime | Auto |
| `updatedAt` | DateTime | Auto |

---

#### `checkpoints`
Individual checklist items within a stage.

| Field | Type | Notes |
|---|---|---|
| `id` | UUID | Primary key |
| `stageId` | UUID → Stage | Parent stage |
| `title` | String | What to check |
| `description` | String? | Details |
| `standardReference` | String? | Compliance standard reference |
| `displayOrder` | Int | Ordering |
| `result` | Enum `CheckpointResult` | `PENDING`, `PASS`, `FAIL`, `NOT_APPLICABLE` |
| `recorderRole` | Enum? `RecorderRole` | Who filled it out |
| `recordedById` | UUID? → User | Who recorded it |
| `notes` | String? | Free-text notes |
| `recordedAt` | DateTime? | When recorded |
| `deletedAt` | DateTime? | **Soft-delete** |
| `createdAt` | DateTime | Auto |
| `updatedAt` | DateTime | Auto |

---

#### `inspection_requests`
The core workflow entity. An EPC engineer generates a request and sends it to an inspector.

| Field | Type | Notes |
|---|---|---|
| `id` | UUID | Primary key |
| `stageId` | UUID → Stage | Which stage to inspect |
| `epcId` | UUID → User | EPC engineer who created it |
| `inspectorId` | UUID? → User | Inspector assigned |
| `inspectorEmail` | String? | For linking before registration |
| `status` | Enum `InspectionRequestStatus` | 9-state machine (see Section 10) |
| `token` | String (unique) | Shareable link token |
| `tokenExpiresAt` | DateTime? | Optional link expiry |
| `deadlineStart` | DateTime? | Inspection window start |
| `deadlineEnd` | DateTime? | Inspection window end |
| `gracePeriodEnd` | DateTime? | Extended deadline |
| `attemptNumber` | Int | Retry counter |
| `rejectionReason` | String? | Inspector's reason if declined |
| `respondedAt` | DateTime? | When inspector responded |
| `visitedAt` | DateTime? | When site visit was marked done |
| `submittedAt` | DateTime? | When submitted for owner approval |
| `createdAt` | DateTime | Auto |
| `updatedAt` | DateTime | Auto |

**Indexes:** `stageId`, `epcId`, `inspectorId`, `status`, `token`, `deadlineEnd`

---

#### `stage_approvals`
Owner's approval/rejection decision after an inspection is submitted.

| Field | Type | Notes |
|---|---|---|
| `id` | UUID | Primary key |
| `stageId` | UUID (unique) → Stage | One active approval per stage |
| `inspectionRequestId` | UUID (unique) → InspectionRequest | Which inspection triggered it |
| `approvedById` | UUID → User | Owner who decided |
| `decision` | Enum `ApprovalDecision` | `APPROVED` or `REJECTED` |
| `comments` | String? | Owner's feedback |
| `decidedAt` | DateTime | When the decision was made |

---

#### `attachments`
Polymorphic file storage — for photos and documents.

| Field | Type | Notes |
|---|---|---|
| `id` | UUID | Primary key |
| `uploadedById` | UUID → User | Uploader |
| `entityType` | String | `"checkpoint"`, `"inspection_request"`, `"stage"` |
| `entityId` | String | ID of the related entity |
| `bucket` | String | S3 bucket name |
| `key` | String | S3 object key |
| `fileName` | String | Original file name |
| `mimeType` | String | `image/jpeg`, `application/pdf`, etc. |
| `sizeBytes` | Int | File size |
| `url` | String | Public/CDN URL |
| `standardReference` | String? | Compliance tag |
| `notes` | String? | Free-text note |
| `createdAt` | DateTime | Auto |

**Indexes:** `[entityType, entityId]`, `uploadedById`

> **S3 bucket versioning must be enabled in production.** Versioning protects against file overwrites and supports tamper-proof audit trails for lenders and insurers. See Section 19.4.

---

#### `measurements`
Structured numeric measurement data per checkpoint.

| Field | Type | Notes |
|---|---|---|
| `id` | UUID | Primary key |
| `checkpointId` | UUID → Checkpoint | Parent checkpoint |
| `recordedById` | UUID → User | Who recorded it |
| `value` | Float | Numeric reading |
| `unit` | String | `"m"`, `"kN"`, `"kV"`, `"rpm"` |
| `standardReference` | String? | Compliance standard |
| `notes` | String? | Context notes |
| `recordedAt` | DateTime | Auto |

---

#### `comments`
Threaded comments on any entity.

| Field | Type | Notes |
|---|---|---|
| `id` | UUID | Primary key |
| `authorId` | UUID → User | Who wrote it |
| `entityType` | String | `"checkpoint"`, `"stage"`, `"inspection_request"` |
| `entityId` | String | ID of the related entity |
| `parentId` | UUID? → Comment (self) | For thread replies |
| `body` | String | Comment text |
| `isResolved` | Boolean | Thread resolved flag |
| `editedAt` | DateTime? | If edited |
| `createdAt` | DateTime | Auto |
| `updatedAt` | DateTime | Auto |

**Indexes:** `[entityType, entityId]`, `authorId`, `parentId`

---

#### `activity_logs`
Immutable audit trail. Every significant action writes a row here.

| Field | Type | Notes |
|---|---|---|
| `id` | UUID | Primary key |
| `actorId` | UUID? → User | Who did it (null = system/cron) |
| `organizationId` | UUID? → Organization | For org-scoped audit queries |
| `projectId` | UUID? → Project | For project-scoped activity feed |
| `entityType` | String | `"stage"`, `"checkpoint"`, `"inspection_request"`, etc. |
| `entityId` | String | The affected row's ID |
| `action` | String | `"created"`, `"status_changed"`, `"approved"`, `"rejected"` |
| `meta` | JSON? | Before/after values, extra context |
| `createdAt` | DateTime | Auto |

**Indexes:** `[entityType, entityId]`, `projectId`, `actorId`, `createdAt`

> **Never delete or update activity logs.** This is enforced in code via Prisma middleware — not just convention. Any UPDATE or DELETE call against this table throws an error. See Section 19.6.

---

#### `labels`
Color-coded tags for categorizing checkpoints. Scoped per project.

| Field | Type | Notes |
|---|---|---|
| `id` | UUID | Primary key |
| `projectId` | UUID → Project | Scoped to a project |
| `name` | String | Label name |
| `color` | String | Hex color `"#FF5733"` |
| `description` | String? | Optional description |

**Unique constraint:** `[projectId, name]`

---

#### `checkpoint_labels`
Many-to-many pivot between checkpoints and labels.

| Field | Type | Notes |
|---|---|---|
| `checkpointId` | UUID → Checkpoint | FK |
| `labelId` | UUID → Label | FK |

**Composite PK:** `[checkpointId, labelId]`

---

#### `notifications`
In-app and outbound notification records.

| Field | Type | Notes |
|---|---|---|
| `id` | UUID | Primary key |
| `userId` | UUID → User | Recipient |
| `organizationId` | UUID? → Organization | Context org |
| `projectId` | UUID? → Project | Context project |
| `inspectionRequestId` | UUID? → InspectionRequest | Context request |
| `type` | Enum `NotificationType` | 11 types (see Section 11) |
| `channel` | Enum `NotificationChannel` | `IN_APP`, `EMAIL`, `SMS`, `PUSH`, `WEBHOOK` |
| `title` | String | Short title |
| `message` | String | Full message body |
| `isRead` | Boolean | For in-app bell |
| `sentAt` | DateTime | Auto |
| `readAt` | DateTime? | When marked read |
| `deliveredAt` | DateTime? | When email/SMS was sent |
| `failedAt` | DateTime? | For retry logic |
| `retryCount` | Int | Retry counter |

---

#### `notification_preferences`
Per-user, per-notification-type preferences for which channels are enabled.

| Field | Type | Notes |
|---|---|---|
| `id` | UUID | Primary key |
| `userId` | UUID → User | Owner |
| `type` | Enum `NotificationType` | Which event type |
| `inApp` | Boolean | Default `true` |
| `email` | Boolean | Default `true` |
| `sms` | Boolean | Default `false` |
| `push` | Boolean | Default `true` |

**Unique constraint:** `[userId, type]`

---

#### `api_tokens`
Personal Access Tokens for API integrations (IoT sensors, CI pipelines, etc.).

| Field | Type | Notes |
|---|---|---|
| `id` | UUID | Primary key |
| `userId` | UUID → User | Token owner |
| `name` | String | Human label, e.g., "Wind Sensor Gateway" |
| `tokenHash` | String (unique) | SHA-256 hash of the raw token |
| `prefix` | String | First 8 chars shown in UI, e.g., `"insp_ab1"` |
| `scopes` | String[] | Permissions, e.g., `["read:checkpoints", "write:evidence"]` |
| `lastUsedAt` | DateTime? | Audit |
| `expiresAt` | DateTime? | Optional expiry |
| `revokedAt` | DateTime? | Soft revocation |
| `createdAt` | DateTime | Auto |

> **Security:** The raw token is shown only once at creation. Only the hash is stored.

---

### Complete Enum Definitions

| Enum | Values |
|---|---|
| `SystemRole` | `USER`, `SUPER_ADMIN` |
| `OrgRole` | `OWNER`, `ADMIN`, `MEMBER` |
| `ProjectRole` | `OWNER`, `EPC_ENGINEER`, `INSPECTOR`, `VIEWER` |
| `PlanTier` | `FREE`, `PRO`, `ENTERPRISE` |
| `IndustryType` | `WIND`, `SOLAR`, `HYDRO`, `OIL_GAS`, `POWER_TRANSMISSION`, `INDUSTRIAL_PLANT`, `OTHER` |
| `ProjectStatus` | `ACTIVE`, `ON_HOLD`, `COMPLETED`, `ARCHIVED` |
| `InvitationStatus` | `PENDING`, `ACCEPTED`, `DECLINED`, `EXPIRED` |
| `StageStatus` | `PENDING`, `IN_PROGRESS`, `SUBMITTED`, `APPROVED`, `REJECTED` |
| `StageSource` | `DEFAULT`, `CUSTOM` |
| `CheckpointResult` | `PENDING`, `PASS`, `FAIL`, `NOT_APPLICABLE` |
| `RecorderRole` | `EPC_ENGINEER`, `INSPECTOR` |
| `InspectionRequestStatus` | `DRAFT`, `SENT`, `ACCEPTED`, `SCHEDULED`, `OVERDUE`, `IN_PROGRESS`, `COMPLETED`, `FAILED`, `CANCELLED` |
| `ApprovalDecision` | `APPROVED`, `REJECTED` |
| `NotificationType` | `REQUEST_SENT`, `REQUEST_ACCEPTED`, `REQUEST_REJECTED`, `DEADLINE_REMINDER`, `DEADLINE_MISSED`, `GRACE_PERIOD_GIVEN`, `STAGE_SUBMITTED`, `STAGE_APPROVED`, `STAGE_REJECTED`, `PROJECT_ASSIGNED`, `INSPECTION_FAILED` |
| `NotificationChannel` | `IN_APP`, `EMAIL`, `SMS`, `PUSH`, `WEBHOOK` |

---

## 6. Entity Relationship Overview

```
Organization ──────────────────────────────────────────────────────┐
    │                                                               │
    ├── OrganizationMember (userId, role: OrgRole)                  │
    ├── OrganizationInvitation                                      │
    └── Project ─────────────────────────────────────────────────┐ │
          │                                                       │ │
          ├── ProjectMember (userId, role: ProjectRole)           │ │
          ├── ProjectInvitation                                   │ │
          ├── Label                                               │ │
          └── Stage                                              │ │
                ├── Checkpoint                                   │ │
                │     ├── CheckpointLabel ──► Label              │ │
                │     ├── Attachment (entityType: checkpoint)     │ │
                │     ├── Measurement                            │ │
                │     └── Comment (entityType: checkpoint)       │ │
                ├── Comment (entityType: stage)                  │ │
                ├── InspectionRequest                            │ │
                │     ├── Attachment (entityType: insp_req)      │ │
                │     ├── Comment (entityType: insp_req)         │ │
                │     └── StageApproval                          │ │
                └── StageApproval                               │ │
                                                                │ │
User ───────────────────────────────────────────────────────────┘ │
    ├── OrganizationMember[] ──────────────────────────────────────┘
    ├── ProjectMember[]
    ├── Notification[]
    ├── NotificationPreference[]
    ├── ActivityLog[]  (as actor)
    ├── Comment[]      (as author)
    ├── Attachment[]   (as uploader)
    └── ApiToken[]
```

---

## 7. Authentication & Sessions

### Login Flow

```
User submits email + password + portal
    │
    ├── Find user by email WHERE deletedAt IS NULL
    ├── Check isActive = true
    ├── Check isEmailVerified = true
    ├── bcrypt.compare(password, passwordHash)
    ├── validatePortalAccess(systemRole, portal)
    │       ├── SUPER_ADMIN portal → requires systemRole = SUPER_ADMIN
    │       ├── WEB_APP portal → requires systemRole = USER
    │       └── MOBILE_APP portal → requires systemRole = USER
    │
    └── Generate JWT pair
          ├── Access Token  (15 min): { sub, email, systemRole }
          └── Refresh Token (7 days): { sub, email, systemRole }
                └── Hash refresh token, store in users.refreshToken
```

### JWT Token Payload

```json
{
  "sub": "user-uuid",
  "email": "user@example.com",
  "systemRole": "USER",
  "iat": 1234567890,
  "exp": 1234568790
}
```

> **Note:** Domain roles (Org Owner, EPC Engineer, etc.) are **NOT** in the JWT. They are fetched from the database on each request where they matter. This keeps the token small and roles always current.

### Guards Architecture

| Guard | Purpose |
|---|---|
| `JwtAuthGuard` | Validates access token, populates `req.user` |
| `RolesGuard` | Checks `req.user.systemRole` against `@Roles()` decorator (only for SUPER_ADMIN gates) |
| `OrgMemberGuard` | Checks `OrganizationMember` for org-scoped routes |
| `ProjectMemberGuard` | Checks `ProjectMember` for project-scoped routes |

### Token Refresh Flow

```
Client sends refresh token
    ├── Verify JWT signature
    ├── Find user by sub
    ├── bcrypt.compare(sentToken, storedHash)
    ├── If valid → issue new access + refresh token pair
    └── Rotate refresh token (store new hash)
```

---

## 8. API Structure & Modules

### NestJS Module Overview

```
src/
├── auth/             Login, logout, refresh, verify email, password reset
├── organizations/    CRUD + member management + org invitations
├── projects/         CRUD + stage/checkpoint management + approvals
├── invitations/      Project invitations (accept, register, verify)
├── inspection-requests/  Full workflow state machine
├── stages/           Stage-level operations
├── checkpoints/      Checkpoint recording, label assignment
├── attachments/      File upload/download (S3 presigned URLs)
├── measurements/     Numeric measurement CRUD
├── comments/         Threaded comments on any entity
├── labels/           Label CRUD + checkpoint tagging
├── activity/         Activity feed per project / org
├── notifications/    In-app bell, mark read, preferences
├── api-tokens/       Personal Access Token management
├── templates/        SUPER_ADMIN: manage project templates
├── users/            SUPER_ADMIN: user management
├── mailer/           Email sending service (shared module)
└── prisma/           Database service (shared module) — includes all middleware
```

### Full API Endpoint Map

#### Auth (`/auth`)
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/auth/register` | Public | Self-serve registration |
| POST | `/auth/login` | Public | Email/password login |
| POST | `/auth/firebase-phone` | Public | Firebase phone login (mobile) |
| POST | `/auth/refresh` | Public | Refresh access token |
| POST | `/auth/logout` | JWT | Revoke refresh token |
| POST | `/auth/verify-email` | Public | Email verification |
| POST | `/auth/forgot-password` | Public | Request password reset |
| POST | `/auth/reset-password` | Public | Reset with token |

#### Organizations (`/organizations`)
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/organizations` | JWT (any verified user) | Create org — caller becomes OWNER, plan = FREE |
| GET | `/organizations` | JWT | List caller's organizations |
| GET | `/organizations/:orgId` | Org Member | Get org details |
| PATCH | `/organizations/:orgId` | Org OWNER/ADMIN | Update org settings |
| GET | `/organizations/:orgId/members` | Org Member | List members |
| PATCH | `/organizations/:orgId/members/:userId` | Org OWNER | Change member role |
| DELETE | `/organizations/:orgId/members/:userId` | Org OWNER | Remove member |
| POST | `/organizations/:orgId/invitations` | Org OWNER/ADMIN | Send org invitation |
| GET | `/organizations/:orgId/invitations` | Org OWNER/ADMIN | List org invitations |
| DELETE | `/organizations/:orgId/invitations/:id` | Org OWNER/ADMIN | Cancel invitation |

#### Projects (`/organizations/:orgId/projects`)
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/organizations/:orgId/projects` | Org OWNER/ADMIN | Create project |
| GET | `/organizations/:orgId/projects` | Org Member | List projects |
| GET | `/organizations/:orgId/projects/:id` | Project Member | Get project detail |
| PATCH | `/organizations/:orgId/projects/:id` | Project OWNER | Update project |
| POST | `/organizations/:orgId/projects/:id/archive` | Project OWNER | Archive project |
| GET | `/organizations/:orgId/projects/:id/dashboard` | Project Member | Stats dashboard |
| GET | `/organizations/:orgId/projects/:id/members` | Project Member | List members |
| POST | `/organizations/:orgId/projects/:id/members` | Project OWNER | Add member |
| PATCH | `/organizations/:orgId/projects/:id/members/:userId` | Project OWNER | Change role |
| DELETE | `/organizations/:orgId/projects/:id/members/:userId` | Project OWNER | Remove member |
| GET | `/organizations/:orgId/projects/:id/activity` | Project Member | Activity feed |
| GET | `/organizations/:orgId/projects/:id/approvals` | Project OWNER | Approval history |

#### Stages (`/projects/:projectId/stages`)
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `.../stages` | Project Member | List stages |
| POST | `.../stages` | Project OWNER/EPC | Create custom stage |
| PATCH | `.../stages/:id` | Project OWNER/EPC | Update stage |
| DELETE | `.../stages/:id` | Project OWNER | Soft-delete stage (sets deletedAt) |
| POST | `.../stages/reorder` | Project OWNER | Reorder stages |
| POST | `.../stages/seed` | Project OWNER | Seed from template |
| GET | `.../stages/:id/approval` | Project Member | Get stage approval |
| POST | `.../stages/:id/approval/approve` | Project OWNER | Approve stage |
| POST | `.../stages/:id/approval/reject` | Project OWNER | Reject stage |

#### Checkpoints (`/stages/:stageId/checkpoints`)
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `.../checkpoints` | Project Member | List checkpoints |
| POST | `.../checkpoints` | Project OWNER/EPC | Create checkpoint |
| PATCH | `.../checkpoints/:id` | Project Member (recorder) | Update/record result |
| DELETE | `.../checkpoints/:id` | Project OWNER/EPC | Soft-delete checkpoint |
| POST | `.../checkpoints/:id/labels/:labelId` | Project OWNER/EPC | Attach label |
| DELETE | `.../checkpoints/:id/labels/:labelId` | Project OWNER/EPC | Remove label |

#### Inspection Requests (`/inspection-requests`)
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/inspection-requests` | EPC_ENGINEER | Create request (DRAFT) |
| GET | `/inspection-requests` | Project Member | List requests |
| GET | `/inspection-requests/:id` | Project Member | Get request detail |
| POST | `/inspection-requests/:id/send` | EPC_ENGINEER | Send to inspector (DRAFT → SENT) |
| GET | `/inspection-requests/token/:token` | Public | Preview via link |
| POST | `/inspection-requests/token/:token/accept` | Inspector | Accept request |
| POST | `/inspection-requests/token/:token/reject` | Inspector | Reject with reason |
| POST | `/inspection-requests/:id/start` | Inspector | Mark visit started |
| POST | `/inspection-requests/:id/submit` | Inspector | Submit for approval |
| POST | `/inspection-requests/:id/cancel` | EPC_ENGINEER | Cancel request |

#### Attachments (`/attachments`)
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/attachments/presign` | JWT | Get S3 presigned upload URL |
| POST | `/attachments` | JWT | Register after upload |
| GET | `/attachments?entityType=&entityId=` | Project Member | List attachments |
| DELETE | `/attachments/:id` | Uploader / OWNER | Delete attachment |

#### Measurements, Comments, Labels, Notifications, API Tokens, Templates, Users
_(Unchanged from original — see full endpoint map in original guide)_

#### Health Check
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/health` | Public | Load balancer + uptime probe |

---

## 9. Invitation & Onboarding Flow

### Flow A — Self-Serve Registration (New)

```
New user visits landing page
    │
    ▼
POST /auth/register { name, email, password }
    ├── Creates User (systemRole: USER, isEmailVerified: false)
    └── Sends email verification
            │
            ▼
POST /auth/verify-email { token }  →  isEmailVerified = true
            │
            ▼
POST /organizations { name: "Acme Wind Energy" }
    ├── INSERT organizations (plan: FREE)
    └── INSERT organization_members (userId: caller, role: OWNER)
```

### Flow B — Invite to Organization (then project)

```
Org OWNER/ADMIN
    │
    ▼
POST /organizations/:orgId/invitations
    { email, role: "MEMBER" }
    │
    ▼
System creates OrganizationInvitation + sends email with token
    │
    ▼
Recipient clicks link → GET /invitations/token/:token
    │
    ├── User already exists → login → POST /invitations/org/accept { token }
    │               └── Creates OrganizationMember row
    │
    └── New user → POST /invitations/org/complete { token, name, password }
                    ├── Creates User (systemRole: USER)
                    ├── Creates OrganizationMember
                    └── Returns JWT session
```

### Flow C — Direct Project Invitation

```
Project OWNER/EPC
    │
    ▼
POST /organizations/:orgId/projects/:id/invitations
    { email, projectRole: "INSPECTOR" }
    │
    ▼
Recipient accepts
    ├── Creates User if new (systemRole: USER)
    ├── Creates OrganizationMember (role: MEMBER) if not already in org
    └── Creates ProjectMember (role: INSPECTOR)
```

### Flow D — SUPER_ADMIN Creates User Directly

```
SUPER_ADMIN → POST /users { email, name }
    ├── Creates user with temp password
    └── Sends email verification
            └── User sets own password → joins orgs via invitation flows
```

---

## 10. Inspection Workflow (State Machine)

### InspectionRequest Status States

```
  EPC creates ──► DRAFT
                    │
        EPC sends ──► SENT ──────────────────────────────────► CANCELLED
                    │
          Inspector ├──► ACCEPTED ──► SCHEDULED
           responds │                    │
                    │               Deadline ──► OVERDUE
                    │                    │          │
                    └──► (REJECTED)      │      Grace ──► (EPC re-requests)
                                         ▼      period
                                    IN_PROGRESS
                                        │
                                   Inspector ──► COMPLETED ──► APPROVED / REJECTED
                                   submits                       (StageApproval)
                                                  │
                                               FAILED
```

### State Transition Rules

| From | To | Trigger | Actor |
|---|---|---|---|
| `DRAFT` | `SENT` | EPC sends link | EPC_ENGINEER |
| `SENT` | `ACCEPTED` | Inspector accepts | INSPECTOR |
| `SENT` | `REJECTED` | Inspector declines (with reason) | INSPECTOR |
| `ACCEPTED` | `SCHEDULED` | Deadline window set | SYSTEM |
| `SCHEDULED` | `OVERDUE` | Cron: deadline passed | SYSTEM (cron) |
| `OVERDUE` | `OVERDUE` | Grace period granted | EPC_ENGINEER |
| `SCHEDULED` | `IN_PROGRESS` | Inspector marks visit started | INSPECTOR |
| `IN_PROGRESS` | `COMPLETED` | Inspector submits | INSPECTOR |
| `COMPLETED` | `FAILED` | Owner rejects stage | OWNER |
| Any | `CANCELLED` | EPC or Owner cancels | EPC_ENGINEER / OWNER |

---

## 11. Notification System

### How It Works

Every time a significant event occurs, a `Notification` row is created for each relevant user. Before creating a notification, check the user's `NotificationPreference` to determine which channels to send on.

```
Event occurs (e.g., Inspector accepts request)
    │
    ▼
NotificationService.dispatch({
    type: REQUEST_ACCEPTED,
    recipientId: epcId,
    projectId, inspectionRequestId,
    title: "Inspector accepted your request",
    message: "..."
})
    │
    ├── Check NotificationPreference for this user + type
    ├── Create Notification row (channel: IN_APP) → always
    ├── If email enabled → Queue email job
    └── If SMS enabled → Queue SMS job
```

### Notification Types & Recipients

| Type | Recipient | Trigger |
|---|---|---|
| `REQUEST_SENT` | Inspector | EPC sends inspection request |
| `REQUEST_ACCEPTED` | EPC + Owner | Inspector accepts |
| `REQUEST_REJECTED` | EPC + Owner | Inspector declines |
| `DEADLINE_REMINDER` | Inspector | 24h before deadline |
| `DEADLINE_MISSED` | EPC + Owner | Deadline passed |
| `GRACE_PERIOD_GIVEN` | Inspector | Owner grants grace period |
| `STAGE_SUBMITTED` | Owner | Inspector submits for review |
| `STAGE_APPROVED` | EPC + Inspector | Owner approves |
| `STAGE_REJECTED` | EPC + Inspector | Owner rejects |
| `PROJECT_ASSIGNED` | New member | Added to project |
| `INSPECTION_FAILED` | EPC + Inspector | Stage marked FAILED |

---

## 12. Activity & Audit Log

### Purpose

The `activity_logs` table is an **immutable, append-only** record of every significant action in the system.

- **Notifications** → user-facing, can be read/dismissed
- **Activity Log** → compliance audit trail, never deleted, middleware-enforced

### What Gets Logged

| Action | entityType | entityId | meta |
|---|---|---|---|
| Project created | `project` | projectId | `{ name, organizationId }` |
| Stage created | `stage` | stageId | `{ name, source }` |
| Stage status changed | `stage` | stageId | `{ from: "PENDING", to: "IN_PROGRESS" }` |
| Checkpoint recorded | `checkpoint` | checkpointId | `{ result, recordedByRole }` |
| Inspection request sent | `inspection_request` | requestId | `{ inspectorEmail }` |
| Inspection request accepted | `inspection_request` | requestId | `{ inspectorId }` |
| Stage approved/rejected | `stage_approval` | approvalId | `{ decision, comments }` |
| Member added to project | `project_member` | memberId | `{ userId, role }` |
| Member removed | `project_member` | memberId | `{ userId }` |

---

## 13. Threaded Comments

Comments use a **self-referential** relationship for threading:

```
Comment A (parentId: null)   ← root comment
    └── Comment B (parentId: A)  ← reply
    └── Comment C (parentId: A)  ← reply
          └── Comment D (parentId: C)  ← nested reply
```

- **Creating:** Any project member can comment on any entity they can see
- **Editing:** Author only (tracked by `editedAt`)
- **Deleting:** Author OR Project OWNER
- **Resolving:** Project OWNER or EPC

---

## 14. File & Evidence Storage

### Upload Flow (S3 Presigned URLs)

```
POST /attachments/presign → { presignedUrl, key, bucket }
    │
Client uploads directly to S3
    │
POST /attachments { key, bucket, fileName, mimeType, sizeBytes, entityType, entityId }
    │
Server creates Attachment record with CDN URL
```

Files never route through the API server. S3 handles all transfer.

### Supported File Types

| Category | MIME Types |
|---|---|
| Photos | `image/jpeg`, `image/png`, `image/heic` |
| Documents | `application/pdf`, `application/msword`, `.docx` variants |
| Spreadsheets | `application/vnd.ms-excel`, `.xlsx` variants |

---

## 15. Template System

```
SUPER_ADMIN creates ProjectTemplate
    └── adds DefaultStage[] (ordered)
          └── adds DefaultCheckpoint[] per stage

Project Owner creates Project (selects template)
    └── System clones → Stage[] + Checkpoint[] on the project
          Stage.source = DEFAULT, Stage.defaultStageId = original
```

Custom stages added alongside template ones have `source = CUSTOM`, `defaultStageId = null`.

---

## 16. API Token / PAT System

```
POST /api-tokens { name, scopes }
    └── raw = "insp_" + randomHex(32)
    └── stores SHA256(raw) — never the raw token
    └── returns raw ONCE in response

Client → Authorization: Bearer insp_abc12345...
    └── JwtAuthGuard detects "insp_" prefix
    └── looks up by SHA256(sentToken)
    └── validates not revoked, not expired
    └── updates lastUsedAt
```

**Scopes:** `read:checkpoints`, `write:checkpoints`, `write:measurements`, `write:attachments`, `read:projects`, `admin`

---

## 17. Project Directory Structure

```
inspection-backend/
├── prisma/
│   ├── schema.prisma          ← Full database schema (includes deletedAt on all entities)
│   ├── seed.ts                ← Dev seed: creates SUPER_ADMIN + sample org
│   └── migrations/            ← Versioned migration history (never use drizzle push in prod)
│
├── src/
│   ├── main.ts                ← Bootstrap: Helmet, ThrottlerGuard, global pipes, Swagger
│   ├── app.module.ts          ← Root module
│   ├── app.controller.ts      ← GET /health
│   │
│   ├── prisma/
│   │   ├── prisma.module.ts
│   │   └── prisma.service.ts  ← Middleware: soft-delete filter + ActivityLog append-only guard
│   │
│   ├── common/
│   │   ├── filters/
│   │   │   └── http-exception.filter.ts
│   │   ├── interceptors/
│   │   │   ├── transform.interceptor.ts   ← Standardizes API response shape
│   │   │   └── logging.interceptor.ts     ← Attaches requestId to every log line (Pino)
│   │   └── pipes/
│   │       └── validation.pipe.ts
│   │
│   ├── auth/
│   │   ├── guards/
│   │   │   ├── jwt-auth.guard.ts
│   │   │   ├── roles.guard.ts
│   │   │   └── project-member.guard.ts
│   │   └── decorators/
│   │       ├── current-user.decorator.ts
│   │       ├── roles.decorator.ts
│   │       └── public.decorator.ts
│   │
│   ├── organizations/
│   ├── users/
│   ├── projects/
│   ├── invitations/
│   ├── stages/
│   ├── checkpoints/
│   ├── inspection-requests/
│   ├── attachments/
│   ├── measurements/
│   ├── comments/
│   ├── labels/
│   ├── activity/
│   ├── notifications/
│   └── api-tokens/
│
├── .env                       ← Local only — NEVER commit
├── .env.example               ← Commit this (no real secrets)
├── .gitignore                 ← Must include: .env, .env.*
└── README.md
```

---

## 18. Key Design Decisions & Rationale

### Decision 1: Organizations as the Top-Level Tenant
Without an org layer, multiple companies share one flat namespace causing data leakage and billing is impossible. Trade-off: one more layer in every query, negligible with proper indexing.

### Decision 2: Context-Scoped Roles Only
Global `role` on user table forces one person to be one thing forever. Context roles require a DB lookup per request instead of reading from JWT — mitigated by efficient index lookups.

### Decision 3: Polymorphic Comments and Attachments
Central `comments`/`attachments` tables with `entityType + entityId` enable threads, edit history, @ mentions. Trade-off: can't use Prisma's native `include` for polymorphic relations — manual queries needed.

### Decision 4: Activity Log is Append-Only
Regulated industries require tamper-proof records. Enforced in code via Prisma middleware, not just convention. Never UPDATE or DELETE rows from `activity_logs`.

### Decision 5: Evidence → Attachment + Measurement Split
Mixing file URLs and numeric values in one table creates validation/display confusion. Separate tables, separate concerns.

### Decision 6: S3 Presigned URLs for File Upload
Files through the API server = memory/bandwidth bottleneck. Presigned URLs let clients upload directly to S3; server handles only metadata.

### Decision 7: Dual Invitation System (Org + Project)
Project invite implicitly requires org membership. The project invitation flow handles both atomically: creates `OrganizationMember` if needed, then `ProjectMember`.

### Decision 8: JWT Does Not Carry Domain Roles
Baking org/project roles into JWT means they go stale on every role change, requiring force-expiry. JWT carries only stable `systemRole`. Per-context roles fetched fresh per request.

### Decision 9: Notification Preferences per Type
Fine-grained channel control per event type (Slack pattern). One preference row per user per notification type.

### Decision 10: API Tokens for IoT / Integrations
On-site sensors need programmatic access. Human login + JWT is impractical for machines. Scoped PATs — machine-friendly, revocable, auditable (GitHub/Stripe pattern).

### Decision 11: Self-Serve Organization Creation
Restricting org creation to SUPER_ADMIN creates a manual provisioning bottleneck incompatible with the FREE plan tier and growth. Any verified user creates an org; they become OWNER, plan = FREE. SUPER_ADMIN controls plan upgrades, suspensions, deletions.

### Decision 12: Soft Deletes Everywhere
Hard deletes are irreversible. `deletedAt` timestamps cost nothing at schema design time but are impossible to retrofit after data is gone. Enforced globally via Prisma middleware.

---

## 19. Production Non-Negotiables (Build on Day 1)

These items are painful or impossible to add later without refactoring. Everything else can wait — these cannot.

---

### 19.1 Soft Deletes (`deletedAt`) on Every Entity Table

Add `deletedAt DateTime?` to `users`, `organizations`, `projects`, `stages`, `checkpoints`.

**Why it can't wait:** Hard deletes are permanent. One accidental deletion with no recovery path is a support nightmare. `deletedAt` is one column per table — free at schema time, costly to retrofit.

```typescript
// prisma.service.ts — global soft-delete middleware
this.$use(async (params, next) => {
  if (params.action === 'delete') {
    params.action = 'update';
    params.args['data'] = { deletedAt: new Date() };
  }
  if (['findMany', 'findFirst', 'findUnique'].includes(params.action)) {
    params.args.where = { ...params.args.where, deletedAt: null };
  }
  return next(params);
});
```

---

### 19.2 Structured Logging with Request IDs

Every log line must carry a `requestId` correlating the full request lifecycle.

**Why it can't wait:** Without this, debugging a production error means guessing which log lines belong together. Retrofitting request IDs requires touching every service.

```typescript
// logging.interceptor.ts
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler) {
    const requestId = uuidv4();
    const req = context.switchToHttp().getRequest();
    req.requestId = requestId;
    return next.handle().pipe(
      tap(() => logger.info({ requestId, path: req.path, method: req.method, status: 'completed' }))
    );
  }
}
```

Use Pino or Winston with JSON output. Never use `console.log` in production.

---

### 19.3 Separate Dev and Production Environments

Completely separate from day one:

| Resource | Dev | Production |
|---|---|---|
| Database | Local PostgreSQL | AWS RDS (separate instance) |
| S3 bucket | `inspectflow-dev` | `inspectflow-prod` |
| `.env` | `.env.development` | Server environment variables |

**Why it can't wait:** One accidental `migrate reset` or `drizzle push` on production can wipe data. Separate environments cost nothing to configure now.

**Rule:** Never commit `.env`. Add `.env*` (except `.env.example`) to `.gitignore` on day one.

---

### 19.4 S3 Bucket Versioning Enabled in Production

Enable versioning on the production S3 bucket at creation time.

**Why it can't wait:** In your sector, lenders and insurers need proof that inspection evidence was not replaced or tampered with. S3 versioning provides that — it's a single AWS checkbox that cannot retroactively protect files deleted before it was enabled.

**AWS Console:** S3 → your bucket → Properties → Bucket Versioning → Enable.

---

### 19.5 API Rate Limiting on All Endpoints

Basic throttling from day one using `@nestjs/throttler`.

**Why it can't wait:** An unprotected API is immediately exploitable. This is 10 lines of setup.

```typescript
// app.module.ts
ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }])

// Stricter limit on auth endpoints
@Throttle({ default: { ttl: 60000, limit: 10 } })
@Post('login')
login() {}
```

---

### 19.6 ActivityLog Append-Only Enforcement via Middleware

The append-only constraint must be code-enforced, not a convention.

**Why it can't wait:** A convention in a README will be violated. One accidental `update` on the audit table defeats its entire compliance purpose.

```typescript
// prisma.service.ts
this.$use(async (params, next) => {
  if (
    params.model === 'ActivityLog' &&
    ['update', 'updateMany', 'delete', 'deleteMany'].includes(params.action)
  ) {
    throw new Error('ActivityLog is append-only. Mutations are forbidden.');
  }
  return next(params);
});
```

---

### 19.7 Health Check Endpoint

A public `/health` endpoint for load balancers and uptime monitors.

**Why it can't wait:** Without it, you have no automated way to know the server is down except when users complain.

```typescript
// app.controller.ts
@Get('health')
health() {
  return { status: 'ok', timestamp: new Date().toISOString() };
}
```

---

### Summary Table

| Non-Negotiable | Effort | Risk if Skipped |
|---|---|---|
| Soft deletes (`deletedAt`) | Schema + 1 middleware block | Permanent unrecoverable data loss |
| Structured logging + requestId | 1 interceptor + Pino setup | Blind debugging in production |
| Separate dev/prod environments | Config only | Accidental prod data corruption |
| S3 bucket versioning | 1 AWS checkbox | No tamper-proof audit trail for evidence |
| API rate limiting | 10 lines of code | API abuse from day one |
| ActivityLog append-only enforcement | 1 middleware block | Compliance audit trail corrupted |
| Health check endpoint | 3 lines of code | No uptime visibility |

---

## Quick Reference — Data Flow Summary

```
Authentication
  User → JWT(systemRole only) → All requests

Organization Access
  JWT → OrganizationMember.role → Org-level actions

Project Access
  JWT → ProjectMember.role → Project-level actions

File Uploads
  Client → Presign API → S3 direct → Confirm API → Attachment record

Notifications
  Any Event → NotificationService.dispatch() → Check preferences
           → Create Notification row → Queue email/SMS if enabled

Audit Trail
  Any Mutation → ActivityService.log() → ActivityLog row
  → Append-only enforced by Prisma middleware (throws on UPDATE/DELETE)

Soft Deletes
  Any DELETE call → sets deletedAt = now() → filtered from all queries automatically

Inspection Flow
  EPC creates InspectionRequest (DRAFT)
  → sends link (SENT)
  → Inspector accepts (ACCEPTED/SCHEDULED)
  → Inspector fills checkpoints + uploads attachments + records measurements
  → Inspector submits (COMPLETED)
  → Owner approves/rejects (StageApproval → Stage.status updated)
```
