import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { PrismaModule } from './prisma/prisma.module.js';
import { AuthModule } from './auth/auth.module.js';
import { UsersModule } from './users/users.module.js';
import { FirebaseModule } from './auth/firebase/firebase.module.js';
import { OrganizationsModule } from './organizations/organizations.module.js';
import { InvitationsModule } from './invitations/invitations.module.js';
import { ActivityModule } from './activity/activity.module.js';
import { ProjectsModule } from './projects/projects.module.js';
import { StagesModule } from './stages/stages.module.js';
import { CheckpointsModule } from './checkpoints/checkpoints.module.js';
import { LabelsModule } from './labels/labels.module.js';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard.js';
import { RolesGuard } from './auth/guards/roles.guard.js';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { InspectionRequestsModule } from './inspection-requests/inspection-requests.module';

@Module({
  imports: [
    // Global config from .env
    ConfigModule.forRoot({ isGlobal: true }),

    // Rate limiting: 100 requests per 60 seconds globally
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),

    // Structured JSON logging via Pino
    LoggerModule.forRoot({
      pinoHttp: {
        transport:
          process.env.NODE_ENV !== 'production'
            ? { target: 'pino-pretty', options: { colorize: true } }
            : undefined,
        level: process.env.NODE_ENV !== 'production' ? 'debug' : 'info',
      },
    }),

    // Database
    PrismaModule,

    // Feature modules
    AuthModule,
    UsersModule,
    FirebaseModule,
    OrganizationsModule,
    InvitationsModule,
    ActivityModule,
    ProjectsModule,
    StagesModule,
    CheckpointsModule,
    LabelsModule,
    InspectionRequestsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // ThrottlerGuard applied globally
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    // JwtAuthGuard applied globally — @Public() opts out
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    // RolesGuard applied globally — @Roles() activates
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
  ],
})
export class AppModule {}
