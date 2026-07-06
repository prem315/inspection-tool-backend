import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { OrgRole } from '@prisma/client';

@Injectable()
export class MailerService {
  private readonly logger = new Logger(MailerService.name);
  private readonly transporter: Transporter;
  private readonly fromEmail: string;

  constructor(private readonly configService: ConfigService) {
    this.fromEmail = this.configService.get<string>('GMAIL_USER') || 'no-reply@gmail.com';
    
    this.transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: this.configService.get<string>('GMAIL_USER'),
        pass: this.configService.get<string>('GMAIL_APP_PASSWORD'),
      },
    });
  }

  async sendEmailVerification(
    to: string,
    name: string,
    token: string,
  ): Promise<void> {
    try {
      const frontendUrl = this.configService.get<string>('FRONTEND_URL') || 'http://localhost:3000';
      await this.transporter.sendMail({
        from: `Inspection Tool <${this.fromEmail}>`,
        to,
        subject: 'Verify Your Email Address',
        text: [
          `Hi ${name},`,
          '',
          'Thank you for registering! Please verify your email address by clicking the link below:',
          '',
          `${frontendUrl}/verify-email?token=${token}`,
          '',
          'If you did not create an account, you can safely ignore this email.',
        ].join('\n'),
      });
      this.logger.log(`Email verification sent to ${to}`);
    } catch (error: any) {
      this.logger.error(
        `Failed to send email verification to ${to}: ${error.message}`,
      );
    }
  }

  async sendPasswordReset(
    to: string,
    name: string,
    token: string,
    expiryMinutes: number,
  ): Promise<void> {
    try {
      const frontendUrl = this.configService.get<string>('FRONTEND_URL') || 'http://localhost:3000';
      await this.transporter.sendMail({
        from: `Inspection Tool <${this.fromEmail}>`,
        to,
        subject: 'Reset Your Password',
        text: [
          `Hi ${name},`,
          '',
          'We received a request to reset your password. Click the link below to set a new password:',
          '',
          `${frontendUrl}/reset-password?token=${token}`,
          '',
          `This link will expire in ${expiryMinutes} minutes.`,
          '',
          'If you did not request a password reset, you can safely ignore this email.',
        ].join('\n'),
      });
      this.logger.log(`Password reset email sent to ${to}`);
    } catch (error: any) {
      this.logger.error(
        `Failed to send password reset email to ${to}: ${error.message}`,
      );
    }
  }

  async sendWelcome(to: string, name: string): Promise<void> {
    try {
      await this.transporter.sendMail({
        from: `Inspection Tool <${this.fromEmail}>`,
        to,
        subject: 'Welcome!',
        text: [
          `Hi ${name},`,
          '',
          'Welcome aboard! Your account has been successfully set up.',
          '',
          'If you have any questions, feel free to reach out to our support team.',
          '',
          'Best regards,',
          'The Team',
        ].join('\n'),
      });
      this.logger.log(`Welcome email sent to ${to}`);
    } catch (error: any) {
      this.logger.error(
        `Failed to send welcome email to ${to}: ${error.message}`,
      );
    }
  }
  async sendOrgInvitation(
    to: string,
    inviterName: string,
    orgName: string,
    token: string,
    role: OrgRole,
  ): Promise<void> {
    try {
      const frontendUrl = this.configService.get<string>('FRONTEND_URL') || 'http://localhost:3000';
      await this.transporter.sendMail({
        from: `Inspection Tool <${this.fromEmail}>`,
        to,
        subject: `You've been invited to join ${orgName} on WindFlow Inspect`,
        text: [
          `${inviterName} has invited you to join ${orgName} as a ${role}.`,
          '',
          'Accept your invitation here:',
          `${frontendUrl}/invitations/org/${token}`,
          '',
          'This link expires in 7 days.',
          '',
          'If you weren\'t expecting this invitation, you can safely ignore this email.',
        ].join('\n'),
      });
      this.logger.log(`Org invitation sent to ${to} for ${orgName}`);
    } catch (error: any) {
      this.logger.error(
        `Failed to send org invitation to ${to}: ${error.message}`,
      );
    }
  }

  async sendProjectInvitation(
    to: string,
    projectName: string,
    inviterName: string,
    token: string,
  ): Promise<void> {
    this.logger.log(`[STUB] sendProjectInvitation to ${to} for project ${projectName} by ${inviterName} with token ${token}`);
  }

  async sendInspectionRequest(
    to: string,
    epcName: string,
    projectName: string,
    stageName: string,
    token: string,
  ): Promise<void> {
    try {
      const frontendUrl = this.configService.get<string>('FRONTEND_URL') || 'http://localhost:3000';
      await this.transporter.sendMail({
        from: `Inspection Tool <${this.fromEmail}>`,
        to,
        subject: `Inspection Request for ${stageName} at ${projectName}`,
        text: [
          `Hi,`,
          '',
          `${epcName} has assigned you to inspect ${stageName} for the project ${projectName}.`,
          '',
          'View your inspection request here:',
          `${frontendUrl}/inspection-requests/verify?token=${token}`,
          '',
          'If you do not have an account, you will be prompted to create one.',
        ].join('\n'),
      });
      this.logger.log(`Inspection request email sent to ${to}`);
    } catch (error: any) {
      this.logger.error(
        `Failed to send inspection request email to ${to}: ${error.message}`,
      );
    }
  }
}
