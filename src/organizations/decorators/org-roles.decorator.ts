import { SetMetadata } from '@nestjs/common';
import { OrgRole } from '@prisma/client';

export const OrgRoles = (...roles: OrgRole[]) => SetMetadata('orgRoles', roles);
