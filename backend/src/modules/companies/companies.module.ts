import { Module } from '@nestjs/common';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CompaniesController } from './companies.controller';
import { CompaniesService } from './companies.service';
import { IdentityActionsModule } from '../identity-actions/identity-actions.module';

@Module({
  imports: [IdentityActionsModule],
  controllers: [CompaniesController],
  providers: [CompaniesService, RolesGuard],
})
export class CompaniesModule {}
