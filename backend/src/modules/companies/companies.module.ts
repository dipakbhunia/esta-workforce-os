import { Module } from '@nestjs/common';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CompaniesController } from './companies.controller';
import { CompaniesService } from './companies.service';
import { IdentityActionsModule } from '../identity-actions/identity-actions.module';
import { UsageSeatsModule } from '../usage-seats/usage-seats.module';
import { CompanyOnboardingReadinessService } from './company-onboarding-readiness.service';

@Module({
  imports: [IdentityActionsModule, UsageSeatsModule],
  controllers: [CompaniesController],
  providers: [CompaniesService, CompanyOnboardingReadinessService, RolesGuard],
})
export class CompaniesModule {}
