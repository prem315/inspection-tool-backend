import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth, DecodedIdToken } from 'firebase-admin/auth';

@Injectable()
export class FirebaseService implements OnModuleInit {
  private readonly logger = new Logger(FirebaseService.name);

  constructor(private readonly configService: ConfigService) {}

  onModuleInit(): void {
    if (!getApps().length) {
      try {
        const privateKey = this.configService.get<string>('FIREBASE_PRIVATE_KEY') || '';
        if (privateKey && !privateKey.includes('dummy')) {
          initializeApp({
            credential: cert({
              projectId: this.configService.get<string>('FIREBASE_PROJECT_ID'),
              privateKey: privateKey.replace(/\\n/g, '\n'),
              clientEmail: this.configService.get<string>('FIREBASE_CLIENT_EMAIL'),
            }),
          });
          this.logger.log('Firebase Admin initialized successfully');
        } else {
          this.logger.warn('Skipping Firebase Admin initialization (dummy credentials detected)');
        }
      } catch (error: any) {
        this.logger.error(`Failed to initialize Firebase: ${error.message}`);
      }
    }
  }

  async verifyIdToken(idToken: string): Promise<DecodedIdToken> {
    return getAuth().verifyIdToken(idToken);
  }
}
