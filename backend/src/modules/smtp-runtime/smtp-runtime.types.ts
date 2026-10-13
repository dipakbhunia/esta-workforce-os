import { SmtpSecurityMode } from '@prisma/client';
export type SmtpAuthorityMode = 'ENVIRONMENT' | 'DATABASE';
export interface ResolvedSmtpSnapshot { readonly authority: SmtpAuthorityMode; readonly configurationVersionId: string | null; readonly host: string; readonly port: number; readonly securityMode: SmtpSecurityMode; readonly username: string; readonly password: string; readonly senderEmail: string; readonly senderDisplayName: string }
export type SmtpRuntimeResolution = { readonly state: 'USABLE'; readonly snapshot: Readonly<ResolvedSmtpSnapshot> } | { readonly state: 'PAUSED' | 'UNAVAILABLE'; readonly authority: SmtpAuthorityMode; readonly code: string };
