import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PrismaModule } from '../prisma/prisma.module';
import { MailerModule } from '../mailer/mailer.module';
import { OrganizationsService } from './organizations.service';
import { OrganizationsController } from './organizations.controller';
import { OrgMemberGuard } from './guards/org-member.guard';
import { OrgRoleGuard } from './guards/org-role.guard';

@Module({
  imports: [PrismaModule, MailerModule, JwtModule.register({})],
  controllers: [OrganizationsController],
  providers: [OrganizationsService, OrgMemberGuard, OrgRoleGuard],
  exports: [OrganizationsService],
})
export class OrganizationsModule {}
