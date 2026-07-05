import { OrgRole, PlanTier, InvitationStatus } from '@prisma/client';

export interface SafeUser {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  isActive: boolean;
  lastLoginAt: Date | null;
}

export interface OrgSummary {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  plan: PlanTier;
  isActive: boolean;
  createdAt: Date;
  callerRole: OrgRole | null;
  memberCount: number;
}

export interface OrgDetail extends OrgSummary {
  projectCount: number;
  updatedAt: Date;
}

export interface MemberDetail {
  id: string;
  role: OrgRole;
  joinedAt: Date;
  user: SafeUser;
}

export interface InvitationDetail {
  id: string;
  email: string;
  role: OrgRole;
  status: InvitationStatus;
  expiresAt: Date;
  createdAt: Date;
  invitedBy: { id: string; name: string; email: string };
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}
