import { ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { GstRoundingMode, GstTaxPolicyStatus, GstTaxTreatment, Prisma } from '@prisma/client';
import { paginationArgs, paginatedResult } from '../../common/utils/pagination.util';
import { PrismaService } from '../../database/prisma.service';
import { CreatePlatformGstPolicyDto, PlatformGstPolicyQueryDto, PlatformGstTransactionQueryDto } from './dto/platform-gst.dto';

const componentSelect = { type: true, rateBasisPoints: true, taxableAmountMinor: true, taxAmountMinor: true, currency: true } satisfies Prisma.PaymentTaxComponentSelect;
const evidenceSelect = { id: true, paymentId: true, companyId: true, sourceSubscriptionId: true, policyVersionId: true, treatment: true, calculationVersion: true, decisionAt: true, currency: true, taxableSubtotalMinor: true, totalTaxMinor: true, grossTotalMinor: true, jurisdictionClassification: true, serviceClassification: true, roundingMode: true, sellerGstin: true, sellerLegalName: true, sellerRegisteredState: true, sellerRegisteredStateCode: true, buyerRegistrationStatus: true, buyerGstin: true, buyerBillingState: true, buyerBillingStateCode: true, placeOfSupplyState: true, placeOfSupplyStateCode: true, createdAt: true, company: { select: { id: true, name: true } }, policyVersion: { select: { policyCode: true, version: true } }, components: { select: componentSelect, orderBy: { type: 'asc' as const } }, invoiceEvidence: { select: { invoiceId: true, policyCode: true, policyVersion: true, taxableSubtotalMinor: true, totalTaxMinor: true, grossTotalMinor: true, createdAt: true } } } satisfies Prisma.PaymentTaxSnapshotSelect;

@Injectable()
export class PlatformGstService {
  constructor(private readonly prisma: PrismaService) {}

  async listPolicies(query: PlatformGstPolicyQueryDto) {
    const at = query.effectiveAt ? new Date(query.effectiveAt) : undefined;
    const where: Prisma.GstTaxPolicyVersionWhereInput = { ...(query.status && { status: query.status }), ...(query.currency && { currency: query.currency }), ...(at && { effectiveFrom: { lte: at }, OR: [{ effectiveUntil: null }, { effectiveUntil: { gt: at } }] }) };
    const [rows, total] = await this.prisma.$transaction(async tx => Promise.all([tx.gstTaxPolicyVersion.findMany({ where, ...paginationArgs(query), orderBy: [{ effectiveFrom: 'desc' }, { version: 'desc' }, { id: 'desc' }], select: policySelect }), tx.gstTaxPolicyVersion.count({ where })]), { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
    return paginatedResult(rows, total, query);
  }

  async getPolicy(id: string) { const row = await this.prisma.gstTaxPolicyVersion.findUnique({ where: { id }, select: policySelect }); if (!row) throw new NotFoundException('GST policy version not found'); return row; }

  async createPolicy(dto: CreatePlatformGstPolicyDto, actorId: string) {
    this.validatePolicy(dto);
    try {
      return await this.prisma.$transaction(async tx => {
        await tx.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${dto.policyCode}))::text AS "lockResult"`);
        const latest = await tx.gstTaxPolicyVersion.findFirst({ where: { policyCode: dto.policyCode }, orderBy: { version: 'desc' }, select: { version: true } });
        return tx.gstTaxPolicyVersion.create({ data: { policyCode: dto.policyCode, version: (latest?.version ?? 0) + 1, status: dto.status, effectiveFrom: new Date(dto.effectiveFrom), effectiveUntil: dto.effectiveUntil ? new Date(dto.effectiveUntil) : null, currency: dto.currency, treatment: dto.treatment, totalRateBasisPoints: dto.totalRateBasisPoints, cgstRateBasisPoints: dto.cgstRateBasisPoints, sgstRateBasisPoints: dto.sgstRateBasisPoints, igstRateBasisPoints: dto.igstRateBasisPoints, serviceClassification: dto.serviceClassification ?? null, roundingMode: GstRoundingMode.HALF_UP_MINOR_UNIT_PER_COMPONENT, calculationVersion: 1, createdByUserId: actorId }, select: policySelect });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
    } catch (error) { if (this.isPolicyConflict(error)) throw new ConflictException('GST policy version conflicts with existing policy authority'); throw error; }
  }

  async listTransactions(query: PlatformGstTransactionQueryDto) {
    const where: Prisma.PaymentTaxSnapshotWhereInput = { ...(query.companyId && { companyId: query.companyId }), ...(query.treatment && { treatment: query.treatment }), ...(query.jurisdiction && { jurisdictionClassification: query.jurisdiction }), ...(query.currency && { currency: query.currency }), ...(query.policyVersionId && { policyVersionId: query.policyVersionId }), ...(query.from && query.to && { decisionAt: { gte: new Date(query.from), lt: new Date(query.to) } }) };
    const [rows, total] = await this.prisma.$transaction(async tx => Promise.all([tx.paymentTaxSnapshot.findMany({ where, ...paginationArgs(query), orderBy: [{ decisionAt: 'desc' }, { id: 'desc' }], select: evidenceSelect }), tx.paymentTaxSnapshot.count({ where })]), { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
    return paginatedResult(rows.map(mapEvidence), total, query);
  }

  async getTransaction(id: string) { const row = await this.prisma.paymentTaxSnapshot.findUnique({ where: { id }, select: evidenceSelect }); if (!row) throw new NotFoundException('GST transaction evidence not found'); return mapEvidence(row); }

  private validatePolicy(dto: CreatePlatformGstPolicyDto) {
    if (dto.currency !== 'INR') throw new UnprocessableEntityException('GST policy currency is unsupported');
    if (Date.parse(dto.effectiveFrom) >= Date.parse(dto.effectiveUntil ?? '9999-12-31T23:59:59Z')) throw new UnprocessableEntityException('GST policy effective interval is invalid');
    const taxable = dto.treatment === GstTaxTreatment.TAXABLE;
    if ((!taxable && [dto.totalRateBasisPoints, dto.cgstRateBasisPoints, dto.sgstRateBasisPoints, dto.igstRateBasisPoints].some(rate => rate !== 0)) || (taxable && (dto.totalRateBasisPoints !== dto.cgstRateBasisPoints + dto.sgstRateBasisPoints || dto.totalRateBasisPoints !== dto.igstRateBasisPoints || !dto.serviceClassification?.trim()))) throw new UnprocessableEntityException('GST policy rates or classification do not reconcile');
    if (dto.status === GstTaxPolicyStatus.RETIRED) throw new UnprocessableEntityException('New GST policy versions must be DRAFT or ACTIVE');
  }

  private isPolicyConflict(error: unknown): boolean {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (['P2002', 'P2034'].includes(error.code)) return true;
      if (!['P2004', 'P2010'].includes(error.code)) return false;
      const databaseCode = typeof error.meta?.code === 'string' ? error.meta.code : '';
      return databaseCode === '23P01' && error.message.includes('GstTaxPolicyVersion_active_window_excl');
    }
    return error instanceof Prisma.PrismaClientUnknownRequestError && error.message.includes('GstTaxPolicyVersion_active_window_excl') && error.message.includes('23P01');
  }
}

const policySelect = { id: true, policyCode: true, version: true, status: true, effectiveFrom: true, effectiveUntil: true, currency: true, treatment: true, totalRateBasisPoints: true, cgstRateBasisPoints: true, sgstRateBasisPoints: true, igstRateBasisPoints: true, serviceClassification: true, roundingMode: true, calculationVersion: true, createdByUserId: true, createdAt: true, updatedAt: true } satisfies Prisma.GstTaxPolicyVersionSelect;
function mapEvidence<T extends { taxableSubtotalMinor: bigint; totalTaxMinor: bigint; grossTotalMinor: bigint; components: Array<{ taxableAmountMinor: bigint; taxAmountMinor: bigint }>; invoiceEvidence: null | { taxableSubtotalMinor: bigint; totalTaxMinor: bigint; grossTotalMinor: bigint } }>(row: T) { return { ...row, taxableSubtotalMinor: row.taxableSubtotalMinor.toString(), totalTaxMinor: row.totalTaxMinor.toString(), grossTotalMinor: row.grossTotalMinor.toString(), components: row.components.map(component => ({ ...component, taxableAmountMinor: component.taxableAmountMinor.toString(), taxAmountMinor: component.taxAmountMinor.toString() })), invoiceEvidence: row.invoiceEvidence ? { ...row.invoiceEvidence, taxableSubtotalMinor: row.invoiceEvidence.taxableSubtotalMinor.toString(), totalTaxMinor: row.invoiceEvidence.totalTaxMinor.toString(), grossTotalMinor: row.invoiceEvidence.grossTotalMinor.toString() } : null }; }
