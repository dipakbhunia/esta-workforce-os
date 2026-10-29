import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import {
  QA_BROWSER_ACCEPTANCE_RUNTIME,
  QA_BROWSER_ACCEPTANCE_SCHEDULERS_DISABLED,
} from '../../config/qa-browser-acceptance-scheduler.runtime';
import { PrismaService } from '../../database/prisma.service';

interface RuntimeDatabaseIdentity {
  databaseName: string;
  databaseUser: string;
  serverPort: number;
  systemIdentifier: string;
}

@Injectable()
export class SchedulerExecutionGuard implements OnApplicationBootstrap {
  private readonly suppressionRequested: boolean;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.suppressionRequested = this.config.get<boolean>(
      QA_BROWSER_ACCEPTANCE_SCHEDULERS_DISABLED,
    ) === true;
  }

  async onApplicationBootstrap(): Promise<void> {
    if (!this.suppressionRequested) return;
    const rows = await this.prisma.$queryRaw<RuntimeDatabaseIdentity[]>(Prisma.sql`
      SELECT current_database()::text AS "databaseName",
             current_user::text AS "databaseUser",
             inet_server_port()::integer AS "serverPort",
             system_identifier::text AS "systemIdentifier"
      FROM pg_control_system()
    `);
    const identity = rows[0];
    if (!identity
      || identity.databaseName !== QA_BROWSER_ACCEPTANCE_RUNTIME.databaseName
      || identity.databaseUser !== QA_BROWSER_ACCEPTANCE_RUNTIME.databaseUser
      || identity.serverPort !== Number(QA_BROWSER_ACCEPTANCE_RUNTIME.databasePort)
      || identity.systemIdentifier !== QA_BROWSER_ACCEPTANCE_RUNTIME.databaseSystemIdentifier) {
      throw new Error('QA browser acceptance scheduler authorization failed');
    }
  }

  shouldExecute(): boolean {
    return !this.suppressionRequested;
  }
}
