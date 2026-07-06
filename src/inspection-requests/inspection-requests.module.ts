import { Module } from '@nestjs/common';
import { MailerModule } from '../mailer/mailer.module';
import { InspectionRequestsController } from './inspection-requests.controller';
import { InspectionRequestsService } from './inspection-requests.service';

@Module({
  imports: [MailerModule],
  controllers: [InspectionRequestsController],
  providers: [InspectionRequestsService]
})
export class InspectionRequestsModule {}
