import { Module } from '@nestjs/common';
import { UsersService } from './users.service.js';
import { UsersController, AdminUsersController } from './users.controller.js';
import { MailerModule } from '../mailer/mailer.module.js';

@Module({
  imports: [MailerModule],
  controllers: [UsersController, AdminUsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
