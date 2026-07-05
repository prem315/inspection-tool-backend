import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PrismaModule } from '../prisma/prisma.module';
import { MailerModule } from '../mailer/mailer.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { InvitationsService } from './invitations.service';
import { InvitationsController } from './invitations.controller';

@Module({
  imports: [PrismaModule, MailerModule, OrganizationsModule, JwtModule.register({})],
  controllers: [InvitationsController],
  providers: [InvitationsService],
})
export class InvitationsModule {}
