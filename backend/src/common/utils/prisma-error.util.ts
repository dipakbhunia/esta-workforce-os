import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

export function throwIfPrismaConflict(error: unknown): never {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  ) {
    throw new ConflictException('A record with the same unique value exists');
  }

  throw error;
}
