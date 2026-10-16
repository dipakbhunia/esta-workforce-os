import { Injectable } from '@nestjs/common';
import { SmtpSecurityMode } from '@prisma/client';
import * as net from 'node:net';
import * as tls from 'node:tls';
import * as nodemailer from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';
import { ApprovedSmtpDestination, SmtpDestinationPolicyService } from './smtp-destination-policy.service';

export type SmtpConnectionTestCategory = 'SUCCESS' | 'AUTH_FAILED' | 'CONNECTION_FAILED' | 'DNS_REJECTED' | 'TLS_FAILED' | 'TIMEOUT' | 'CREDENTIAL_UNAVAILABLE' | 'UNKNOWN';
export interface SmtpConnectionSnapshot { host: string; port: number; securityMode: SmtpSecurityMode; username: string }
export interface SmtpConnectionTestResult { success: boolean; category: SmtpConnectionTestCategory }
export type SmtpTestEmailCategory = 'ACCEPTED' | Exclude<SmtpConnectionTestCategory, 'SUCCESS'>;
export interface SmtpTestEmailMessage {
  recipient: string;
  senderEmail: string;
  senderDisplayName: string;
  subject: string;
  text: string;
}
export interface SmtpTestEmailResult { accepted: boolean; category: SmtpTestEmailCategory }
export interface SmtpDeliveryMessage extends SmtpTestEmailMessage { html: string }

export class SmtpDeliveryAttemptError extends Error {
  constructor(public readonly definitivelyNotAccepted: boolean, public readonly transportError: unknown) {
    super('Email delivery failed');
    this.name = 'SmtpDeliveryAttemptError';
  }
}

@Injectable()
export class SmtpConnectionTestAdapter {
  constructor(private readonly destinations: SmtpDestinationPolicyService) {}

  async verify(snapshot: Readonly<SmtpConnectionSnapshot>, password: string): Promise<SmtpConnectionTestResult> {
    let transport: ReturnType<typeof nodemailer.createTransport> | undefined;
    try {
      const target = await this.destinations.approve(snapshot.host);
      const options = this.transportOptions(snapshot, password, target);
      transport = this.createTransport(options);
      let timer: NodeJS.Timeout | undefined;
      try {
        await Promise.race([transport.verify(), new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' })), 20_000);
        })]);
      } finally { if (timer) clearTimeout(timer); }
      return { success: true, category: 'SUCCESS' };
    } catch (error) { return this.safeResult(error); }
    finally { transport?.close(); }
  }

  async sendTestEmail(snapshot: Readonly<SmtpConnectionSnapshot>, password: string,
    message: Readonly<SmtpTestEmailMessage>): Promise<SmtpTestEmailResult> {
    let transport: ReturnType<typeof nodemailer.createTransport> | undefined;
    try {
      const target = await this.destinations.approve(snapshot.host);
      transport = this.createTransport(this.transportOptions(snapshot, password, target));
      let timer: NodeJS.Timeout | undefined;
      try {
        const info = await Promise.race([transport.sendMail({
          from: { name: message.senderDisplayName, address: message.senderEmail },
          to: message.recipient,
          subject: message.subject,
          text: message.text,
        }), new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' })), 20_000);
        })]);
        const accepted = (info.accepted ?? []).map(String).some((value) => value.trim().toLowerCase() === message.recipient);
        return accepted ? { accepted: true, category: 'ACCEPTED' } : { accepted: false, category: 'UNKNOWN' };
      } finally { if (timer) clearTimeout(timer); }
    } catch (error) {
      const result = this.safeResult(error);
      return { accepted: false, category: result.category === 'SUCCESS' ? 'UNKNOWN' : result.category };
    } finally { transport?.close(); }
  }

  async sendEmail(snapshot: Readonly<SmtpConnectionSnapshot>, password: string, message: Readonly<SmtpDeliveryMessage>) {
    let transport: ReturnType<typeof nodemailer.createTransport> | undefined;
    try {
      const target = await this.destinations.approve(snapshot.host);
      transport = this.createTransport(this.transportOptions(snapshot, password, target));
      const info = await transport.sendMail({ from: { name: message.senderDisplayName, address: message.senderEmail }, to: message.recipient, subject: message.subject, text: message.text, html: message.html });
      return { messageId: info.messageId ?? null };
    } catch (error) {
      throw new SmtpDeliveryAttemptError(this.isDefinitiveNonAcceptance(error), error);
    } finally { transport?.close(); }
  }

  private isDefinitiveNonAcceptance(error: unknown): boolean {
    const value = error as { code?: string; responseCode?: number };
    const code = String(value?.code ?? '').toUpperCase();
    const responseCode = Number(value?.responseCode);
    if (responseCode >= 400 && responseCode <= 599) return true;
    if (['EAUTH', 'ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED', 'EHOSTUNREACH', 'EENVELOPE'].includes(code)) return true;
    return code.includes('TLS') || code.includes('CERT');
  }

  private transportOptions(snapshot: Readonly<SmtpConnectionSnapshot>, password: string,
    target: ApprovedSmtpDestination): SMTPTransport.Options {
    const implicit = snapshot.securityMode === SmtpSecurityMode.IMPLICIT_TLS;
    return {
      host: target.hostname, port: snapshot.port, secure: implicit, requireTLS: !implicit,
      ignoreTLS: false, opportunisticTLS: false, auth: { user: snapshot.username, pass: password },
      connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 15_000,
      tls: { servername: target.hostname, rejectUnauthorized: true, minVersion: 'TLSv1.2' },
      getSocket: (_options, callback) => this.openSocket(target, snapshot.port, implicit, callback),
    };
  }

  protected createTransport(options: SMTPTransport.Options) { return nodemailer.createTransport(options); }

  protected openSocket(target: ApprovedSmtpDestination, port: number, implicit: boolean,
    callback: (error: Error | null, socket?: { connection: net.Socket; secured?: boolean }) => void) {
    let settled = false;
    const finish = (error: Error | null, connection?: net.Socket, secured?: boolean) => {
      if (settled) return;
      settled = true;
      if (error) callback(error);
      else if (connection) callback(null, { connection, secured });
    };
    if (implicit) {
      const socket = tls.connect({ host: target.address, port, servername: target.hostname, rejectUnauthorized: true, minVersion: 'TLSv1.2' });
      socket.setTimeout(10_000, () => {
        finish(Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' }));
        socket.destroy();
      });
      socket.once('secureConnect', () => { socket.setTimeout(0); finish(null, socket, true); });
      socket.once('error', (error) => finish(error));
      return;
    }
    const socket = net.connect({ host: target.address, port });
    socket.setTimeout(10_000, () => {
      finish(Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' }));
      socket.destroy();
    });
    socket.once('connect', () => { socket.setTimeout(0); finish(null, socket, false); });
    socket.once('error', (error) => finish(error));
  }

  private safeResult(error: unknown): SmtpConnectionTestResult {
    const value = error as { code?: string; responseCode?: number };
    const code = String(value?.code ?? '').toUpperCase(); const response = Number(value?.responseCode);
    if (code === 'EAUTH' || response === 535) return { success: false, category: 'AUTH_FAILED' };
    if (['ETIMEDOUT', 'ESOCKETTIMEDOUT'].includes(code)) return { success: false, category: 'TIMEOUT' };
    if (code.includes('TLS') || code.includes('CERT')) return { success: false, category: 'TLS_FAILED' };
    if (['ECONNECTION', 'ECONNREFUSED', 'ECONNRESET', 'EHOSTUNREACH'].includes(code)) return { success: false, category: 'CONNECTION_FAILED' };
    if (error instanceof Error && error.message.startsWith('SMTP destination')) return { success: false, category: 'DNS_REJECTED' };
    return { success: false, category: 'UNKNOWN' };
  }
}
