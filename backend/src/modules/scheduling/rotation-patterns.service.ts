import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, RosterDayType } from '@prisma/client';
import { paginatedResult, paginationArgs } from '../../common/utils/pagination.util';
import { requireTenantId } from '../../common/utils/tenant.util';
import { PrismaService } from '../../database/prisma.service';
import { dateOnly } from '../attendance/attendance-time.util';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import {
  CreateRotationPatternDto,
  PreviewRotationPatternDto,
  RotationPatternDayInputDto,
  RotationPatternQueryDto,
  UpdateRotationPatternDto,
} from './dto/scheduling.dto';

const EXPORT_LIMIT = 10000;
const VALID_DAY_TYPES = new Set<RosterDayType>([RosterDayType.WORKING, RosterDayType.WEEKLY_OFF, RosterDayType.NO_SHIFT]);
const MS_PER_DAY = 86400000;

const rotationPatternInclude = {
  branch: { select: { id: true, name: true, code: true } },
  department: { select: { id: true, name: true, code: true, branchId: true } },
  days: {
    where: { deletedAt: null },
    include: { shift: { select: { id: true, name: true, code: true, startTime: true, endTime: true, timezone: true } } },
    orderBy: [{ sequence: 'asc' as const }],
  },
};

type RotationPatternWithRelations = Prisma.RotationPatternGetPayload<{ include: typeof rotationPatternInclude }>;
type RotationPatternDayWithShift = RotationPatternWithRelations['days'][number];
type ScopeRow = Pick<RotationPatternWithRelations, 'branchId' | 'departmentId' | 'enabled'>;

@Injectable()
export class RotationPatternsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateRotationPatternDto, actor: AuthenticatedUser) {
    const companyId = requireTenantId(actor);
    const data = await this.patternData(companyId, dto, actor.id);
    await this.assertUniqueCode(companyId, data.code as string);
    const pattern = await this.prisma.$transaction(async (tx) => {
      const created = await tx.rotationPattern.create({ data: { ...data, days: undefined } as Prisma.RotationPatternUncheckedCreateInput });
      await tx.rotationPatternDay.createMany({ data: await this.patternDayData(tx, companyId, created.id, dto.days, actor.id) });
      return tx.rotationPattern.findFirstOrThrow({ where: { id: created.id }, include: rotationPatternInclude });
    });
    await this.audit(companyId, actor.id, 'ROTATION_PATTERN_CREATED', pattern.id, this.auditMetadata(pattern));
    return pattern;
  }

  async findAll(query: RotationPatternQueryDto, actor: AuthenticatedUser) {
    const companyId = requireTenantId(actor);
    const where = this.patternWhere(companyId, query);
    const [data, total, summaryRows] = await this.prisma.$transaction([
      this.prisma.rotationPattern.findMany({ where, include: rotationPatternInclude, ...paginationArgs(query), orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }] }),
      this.prisma.rotationPattern.count({ where }),
      this.prisma.rotationPattern.findMany({ where, select: { enabled: true, branchId: true, departmentId: true } }),
    ]);
    return { ...paginatedResult(data, total, query), summary: this.summary(summaryRows) };
  }

  async exportPatterns(query: RotationPatternQueryDto, actor: AuthenticatedUser) {
    const companyId = requireTenantId(actor);
    const where = this.patternWhere(companyId, query);
    const total = await this.prisma.rotationPattern.count({ where });
    this.assertExportLimit(total, 'rotation patterns');
    const rows = await this.prisma.rotationPattern.findMany({ where, include: rotationPatternInclude, orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }], take: EXPORT_LIMIT });
    return this.csvDownload(`rotation-patterns-${this.todayForFilename()}.csv`, [
      ['Pattern Name', 'Pattern Code', 'Scope', 'Branch', 'Department', 'Timezone', 'Cycle Length', 'Anchor Date', 'Status', 'Version', 'Working Days', 'Weekly Off Days', 'No Shift Days', 'Pattern Steps', 'Updated At', 'Notes'],
      ...rows.map((pattern) => this.exportRow(pattern)),
    ]);
  }

  async findOne(id: string, actor: AuthenticatedUser) {
    return this.requirePattern(id, requireTenantId(actor));
  }

  async update(id: string, dto: UpdateRotationPatternDto, actor: AuthenticatedUser) {
    const companyId = requireTenantId(actor);
    const current = await this.requirePattern(id, companyId);
    const mergedDays = dto.days ?? current.days.map((day) => ({ sequence: day.sequence, dayType: day.dayType as 'WORKING' | 'WEEKLY_OFF' | 'NO_SHIFT', shiftId: day.shiftId, label: day.label, notes: day.notes }));
    const data = await this.patternData(companyId, { ...current, ...dto, days: mergedDays, cycleLengthDays: dto.cycleLengthDays ?? current.cycleLengthDays } as CreateRotationPatternDto, actor.id);
    if (data.code && data.code !== current.code) await this.assertUniqueCode(companyId, data.code as string, id);
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.rotationPattern.update({ where: { id }, data: { ...data, version: { increment: 1 }, days: undefined } as Prisma.RotationPatternUncheckedUpdateInput });
      if (dto.days || dto.cycleLengthDays) {
        await tx.rotationPatternDay.updateMany({ where: { patternId: id, deletedAt: null }, data: { deletedAt: new Date(), updatedById: actor.id } });
        await tx.rotationPatternDay.createMany({ data: await this.patternDayData(tx, companyId, id, mergedDays, actor.id) });
      }
      return tx.rotationPattern.findFirstOrThrow({ where: { id }, include: rotationPatternInclude });
    });
    await this.audit(companyId, actor.id, updated.enabled === current.enabled ? 'ROTATION_PATTERN_UPDATED' : updated.enabled ? 'ROTATION_PATTERN_ENABLED' : 'ROTATION_PATTERN_DISABLED', id, { before: this.auditMetadata(current), after: this.auditMetadata(updated) });
    return updated;
  }

  async remove(id: string, actor: AuthenticatedUser) {
    const companyId = requireTenantId(actor);
    const current = await this.requirePattern(id, companyId);
    const archived = await this.prisma.rotationPattern.update({ where: { id }, data: { deletedAt: new Date(), updatedById: actor.id }, include: rotationPatternInclude });
    await this.audit(companyId, actor.id, 'ROTATION_PATTERN_ARCHIVED', id, { before: this.auditMetadata(current) });
    return archived;
  }

  async preview(id: string, dto: PreviewRotationPatternDto, actor: AuthenticatedUser) {
    const companyId = requireTenantId(actor);
    const pattern = await this.requirePattern(id, companyId);
    const dateFrom = dateOnly(dto.dateFrom);
    const dateTo = dto.dateTo ? dateOnly(dto.dateTo) : this.addUtcDays(dateFrom, (dto.numberOfDays ?? 30) - 1);
    if (dateFrom > dateTo) throw new BadRequestException('dateFrom must not be after dateTo');
    if (this.durationDays(dateFrom, dateTo) > 180) throw new BadRequestException('Preview is limited to 180 days');
    const anchorDate = this.toDateOnly(dto.anchorDate ?? pattern.anchorDate ?? dto.dateFrom);
    const dayMap = new Map(pattern.days.map((day) => [day.sequence, day]));
    const items = this.eachDate(dateFrom, dateTo).map((workDate) => {
      const sequence = this.sequenceForDate(anchorDate, workDate, pattern.cycleLengthDays);
      const day = dayMap.get(sequence);
      return {
        workDate: this.formatDate(workDate),
        sequence,
        dayType: day?.dayType ?? RosterDayType.NO_SHIFT,
        label: day?.label ?? null,
        shift: day?.shift ?? null,
        notes: day?.notes ?? null,
      };
    });
    const counts = this.countDays(pattern.days);
    return { patternId: pattern.id, dateFrom: this.formatDate(dateFrom), dateTo: this.formatDate(dateTo), anchorDate: this.formatDate(anchorDate), cycleLengthDays: pattern.cycleLengthDays, counts, data: items };
  }

  private async patternData(companyId: string, dto: CreateRotationPatternDto, actorUserId: string) {
    this.assertDays(dto.days, dto.cycleLengthDays);
    await this.assertScope(companyId, dto.branchId, dto.departmentId);
    return {
      companyId,
      name: dto.name?.trim(),
      code: dto.code?.trim().toUpperCase(),
      description: dto.description?.trim() || null,
      timezone: dto.timezone?.trim() || 'UTC',
      cycleLengthDays: dto.cycleLengthDays,
      anchorDate: dto.anchorDate ? dateOnly(dto.anchorDate) : null,
      enabled: dto.enabled ?? true,
      branchId: dto.branchId || null,
      departmentId: dto.departmentId || null,
      notes: dto.notes?.trim() || null,
      createdById: actorUserId,
      updatedById: actorUserId,
    } satisfies Prisma.RotationPatternUncheckedCreateInput;
  }

  private assertDays(days: RotationPatternDayInputDto[], cycleLengthDays: number) {
    if (!days?.length) throw new BadRequestException('Rotation pattern days are required');
    if (cycleLengthDays < 2 || cycleLengthDays > 90) throw new BadRequestException('Rotation cycle length must be between 2 and 90 days');
    if (days.length !== cycleLengthDays) throw new BadRequestException('Rotation pattern days must match the configured cycle length');
    const sequenceSet = new Set<number>();
    for (const day of days) {
      if (sequenceSet.has(day.sequence)) throw new BadRequestException('Each rotation sequence can appear only once');
      if (day.sequence < 1 || day.sequence > cycleLengthDays) throw new BadRequestException('Rotation sequences must be contiguous and within the cycle length');
      sequenceSet.add(day.sequence);
      if (!VALID_DAY_TYPES.has(day.dayType as RosterDayType)) throw new BadRequestException('Rotation days support WORKING, WEEKLY_OFF, or NO_SHIFT only');
      if (day.dayType === 'WORKING' && !day.shiftId) throw new BadRequestException('Working rotation days require a shift');
      if (day.dayType !== 'WORKING' && day.shiftId) throw new BadRequestException('Non-working rotation days cannot contain a shift');
    }
    for (let sequence = 1; sequence <= cycleLengthDays; sequence += 1) {
      if (!sequenceSet.has(sequence)) throw new BadRequestException('Rotation sequences must be contiguous from 1 to cycle length');
    }
  }

  private async patternDayData(tx: Pick<PrismaService, 'shift'>, companyId: string, patternId: string, days: RotationPatternDayInputDto[], actorUserId: string) {
    const shiftIds = [...new Set(days.map((day) => day.shiftId).filter(Boolean) as string[])];
    const shifts = shiftIds.length ? await tx.shift.findMany({ where: { id: { in: shiftIds }, companyId, deletedAt: null }, select: { id: true, name: true, code: true, startTime: true, endTime: true, timezone: true } }) : [];
    if (shifts.length !== shiftIds.length) throw new BadRequestException('One or more shifts were not found in this company');
    const shiftMap = new Map(shifts.map((shift) => [shift.id, shift]));
    return days.map((day) => {
      const shift = day.shiftId ? shiftMap.get(day.shiftId) : null;
      return {
        patternId,
        companyId,
        sequence: day.sequence,
        dayType: day.dayType as RosterDayType,
        shiftId: shift?.id ?? null,
        shiftName: shift?.name ?? null,
        shiftCode: shift?.code ?? null,
        shiftStartTime: shift?.startTime ?? null,
        shiftEndTime: shift?.endTime ?? null,
        shiftTimezone: shift?.timezone ?? null,
        label: day.label?.trim() || null,
        notes: day.notes?.trim() || null,
        createdById: actorUserId,
        updatedById: actorUserId,
      };
    });
  }

  private patternWhere(companyId: string, query: RotationPatternQueryDto): Prisma.RotationPatternWhereInput {
    return {
      companyId,
      deletedAt: null,
      ...(query.enabled !== undefined ? { enabled: query.enabled } : {}),
      ...(query.branchId ? { branchId: query.branchId } : {}),
      ...(query.departmentId ? { departmentId: query.departmentId } : {}),
      ...(query.timezone ? { timezone: query.timezone } : {}),
      ...(query.scope === 'COMPANY' ? { branchId: null, departmentId: null } : {}),
      ...(query.scope === 'BRANCH' ? { branchId: { not: null }, departmentId: null } : {}),
      ...(query.scope === 'DEPARTMENT' ? { departmentId: { not: null } } : {}),
      ...(query.search ? { OR: [{ name: { contains: query.search, mode: 'insensitive' } }, { code: { contains: query.search, mode: 'insensitive' } }, { description: { contains: query.search, mode: 'insensitive' } }, { notes: { contains: query.search, mode: 'insensitive' } }] } : {}),
    };
  }

  private summary(rows: ScopeRow[]) {
    return rows.reduce((summary, pattern) => {
      summary.total += 1;
      if (pattern.enabled) summary.active += 1;
      else summary.inactive += 1;
      if (pattern.departmentId) summary.departmentScope += 1;
      else if (pattern.branchId) summary.branchScope += 1;
      else summary.companyScope += 1;
      return summary;
    }, { total: 0, active: 0, inactive: 0, companyScope: 0, branchScope: 0, departmentScope: 0 });
  }

  private async requirePattern(id: string, companyId: string) {
    const pattern = await this.prisma.rotationPattern.findFirst({ where: { id, companyId, deletedAt: null }, include: rotationPatternInclude });
    if (!pattern) throw new NotFoundException('Rotation pattern not found');
    return pattern;
  }

  private async assertUniqueCode(companyId: string, code: string, excludeId?: string) {
    const existing = await this.prisma.rotationPattern.findFirst({ where: { companyId, code, deletedAt: null, ...(excludeId ? { id: { not: excludeId } } : {}) }, select: { id: true } });
    if (existing) throw new BadRequestException('A rotation pattern with this code already exists');
  }

  private async assertScope(companyId: string, branchId?: string | null, departmentId?: string | null) {
    if (branchId) {
      const branch = await this.prisma.branch.findFirst({ where: { id: branchId, companyId, deletedAt: null }, select: { id: true } });
      if (!branch) throw new BadRequestException('Branch not found in this company');
    }
    if (departmentId) {
      const department = await this.prisma.department.findFirst({ where: { id: departmentId, companyId, deletedAt: null }, select: { id: true, branchId: true } });
      if (!department) throw new BadRequestException('Department not found in this company');
      if (branchId && department.branchId && department.branchId !== branchId) throw new BadRequestException('Department does not belong to the selected branch');
    }
  }

  private exportRow(pattern: RotationPatternWithRelations) {
    const counts = this.countDays(pattern.days);
    return [pattern.name, pattern.code, this.scopeLabel(pattern), pattern.branch?.name ?? '', pattern.department?.name ?? '', pattern.timezone, pattern.cycleLengthDays, this.formatDate(pattern.anchorDate), pattern.enabled ? 'Active' : 'Inactive', `v${pattern.version}`, counts.working, counts.weeklyOff, counts.noShift, this.stepsLabel(pattern.days), this.formatDateTime(pattern.updatedAt), pattern.notes ?? ''];
  }

  private countDays(days: RotationPatternDayWithShift[]) {
    return days.reduce((counts, day) => {
      if (day.dayType === RosterDayType.WORKING) counts.working += 1;
      if (day.dayType === RosterDayType.WEEKLY_OFF) counts.weeklyOff += 1;
      if (day.dayType === RosterDayType.NO_SHIFT) counts.noShift += 1;
      return counts;
    }, { working: 0, weeklyOff: 0, noShift: 0 });
  }

  private stepsLabel(days: RotationPatternDayWithShift[]) {
    return days.map((day) => `${day.sequence}: ${day.dayType === RosterDayType.WORKING ? day.shiftName ?? day.shiftCode ?? 'Working' : day.dayType.replace('_', ' ')}`).join('; ');
  }

  private scopeLabel(pattern: Pick<RotationPatternWithRelations, 'branch' | 'department'>) {
    if (pattern.department?.name && pattern.branch?.name) return `${pattern.branch.name} / ${pattern.department.name}`;
    if (pattern.department?.name) return pattern.department.name;
    if (pattern.branch?.name) return pattern.branch.name;
    return 'Company-wide';
  }


  private toDateOnly(value: Date | string) {
    return value instanceof Date ? new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate())) : dateOnly(value);
  }
  private sequenceForDate(anchorDate: Date, targetDate: Date, cycleLengthDays: number) {
    const offset = Math.floor((this.toDateOnly(targetDate).getTime() - this.toDateOnly(anchorDate).getTime()) / MS_PER_DAY);
    return ((offset % cycleLengthDays) + cycleLengthDays) % cycleLengthDays + 1;
  }

  private durationDays(from: Date, to: Date) {
    return Math.max(0, Math.round((this.toDateOnly(to).getTime() - this.toDateOnly(from).getTime()) / MS_PER_DAY) + 1);
  }

  private eachDate(from: Date, to: Date) {
    const dates: Date[] = [];
    for (let cursor = new Date(from); cursor <= to; cursor = this.addUtcDays(cursor, 1)) {
      dates.push(new Date(cursor));
      if (dates.length > 370) throw new BadRequestException('Date range is limited to 370 days');
    }
    return dates;
  }

  private addUtcDays(date: Date, days: number) {
    const next = new Date(date);
    next.setUTCDate(next.getUTCDate() + days);
    return next;
  }

  private csvDownload(filename: string, rows: Array<Array<string | number | null | undefined>>) {
    const csv = rows.map((row) => row.map((value) => this.csvCell(value)).join(',')).join('\r\n');
    return { filename, contentType: 'text/csv; charset=utf-8', buffer: Buffer.from(`\uFEFF${csv}\r\n`, 'utf8') };
  }

  private csvCell(value: string | number | null | undefined) {
    const raw = String(value ?? '');
    const protectedValue = /^[=+\-@]/.test(raw.trimStart()) ? `'${raw}` : raw;
    return `"${protectedValue.replace(/"/g, '""')}"`;
  }

  private assertExportLimit(total: number, label: string) {
    if (total > EXPORT_LIMIT) throw new BadRequestException(`Export is limited to ${EXPORT_LIMIT.toLocaleString()} ${label}. Narrow filters and try again.`);
  }

  private formatDate(value?: Date | string | null) {
    if (!value) return '';
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
    return date.toISOString().slice(0, 10);
  }

  private formatDateTime(value?: Date | string | null) {
    if (!value) return '';
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toISOString();
  }

  private todayForFilename() {
    return new Date().toISOString().slice(0, 10);
  }

  private auditMetadata(pattern: Pick<RotationPatternWithRelations, 'branchId' | 'departmentId' | 'enabled' | 'version' | 'timezone' | 'cycleLengthDays' | 'anchorDate'>): Prisma.InputJsonValue {
    return { branchId: pattern.branchId, departmentId: pattern.departmentId, enabled: pattern.enabled, version: pattern.version, timezone: pattern.timezone, cycleLengthDays: pattern.cycleLengthDays, anchorDate: this.formatDate(pattern.anchorDate) };
  }

  private async audit(companyId: string, actorUserId: string, action: string, entityId: string, metadata: Prisma.InputJsonValue) {
    await this.prisma.auditLog.create({ data: { companyId, actorUserId, action, entityType: 'RotationPattern', entityId, metadata } });
  }
}