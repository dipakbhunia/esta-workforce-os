import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum CompanyOnboardingReadinessStatus {
  READY = 'READY',
  INCOMPLETE = 'INCOMPLETE',
  BLOCKED = 'BLOCKED',
  NOT_APPLICABLE = 'NOT_APPLICABLE',
  UNAVAILABLE = 'UNAVAILABLE',
}

export enum CompanyOnboardingReadinessItemId {
  COMPANY_PROFILE = 'COMPANY_PROFILE',
  OPERATIONAL_LIFECYCLE = 'OPERATIONAL_LIFECYCLE',
  TENANT_ADMIN_ACCESS = 'TENANT_ADMIN_ACCESS',
  ADMIN_INVITATION = 'ADMIN_INVITATION',
  COMMERCIAL_ACCESS = 'COMMERCIAL_ACCESS',
  BILLING_PROFILE = 'BILLING_PROFILE',
  BILLING_CONTACT = 'BILLING_CONTACT',
  COMPANY_CONTACT_DETAILS = 'COMPANY_CONTACT_DETAILS',
}

export enum CompanyOnboardingReadinessCategory {
  ADMINISTRATIVE = 'ADMINISTRATIVE',
  OPERATIONAL = 'OPERATIONAL',
  COMMERCIAL = 'COMMERCIAL',
  BILLING = 'BILLING',
  PROFILE = 'PROFILE',
}

export class CompanyOnboardingRemediationDto {
  @ApiProperty({ enum: ['NAVIGATE'] })
  kind!: 'NAVIGATE';

  @ApiProperty()
  label!: string;

  @ApiProperty({ example: '/organization/companies/00000000-0000-4000-8000-000000000001' })
  route!: string;
}

export class CompanyOnboardingReadinessItemDto {
  @ApiProperty({ enum: CompanyOnboardingReadinessItemId })
  id!: CompanyOnboardingReadinessItemId;

  @ApiProperty({ enum: CompanyOnboardingReadinessCategory })
  category!: CompanyOnboardingReadinessCategory;

  @ApiProperty()
  label!: string;

  @ApiProperty({ enum: CompanyOnboardingReadinessStatus })
  status!: CompanyOnboardingReadinessStatus;

  @ApiProperty()
  blocking!: boolean;

  @ApiProperty()
  reasonCode!: string;

  @ApiProperty()
  explanation!: string;

  @ApiPropertyOptional({ type: CompanyOnboardingRemediationDto, nullable: true })
  remediation!: CompanyOnboardingRemediationDto | null;
}

export class CompanyOnboardingReadinessResponseDto {
  @ApiProperty({ format: 'uuid' })
  companyId!: string;

  @ApiProperty({ example: '1' })
  contractVersion!: string;

  @ApiProperty({ format: 'date-time' })
  evaluatedAt!: string;

  @ApiProperty({ enum: CompanyOnboardingReadinessStatus })
  overallStatus!: CompanyOnboardingReadinessStatus;

  @ApiProperty()
  blockingCount!: number;

  @ApiProperty({ type: CompanyOnboardingReadinessItemDto, isArray: true })
  items!: CompanyOnboardingReadinessItemDto[];
}
