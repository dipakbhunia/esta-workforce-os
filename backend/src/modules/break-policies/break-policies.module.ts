import { Module } from '@nestjs/common';
import { BreakPoliciesController } from './break-policies.controller';
import { BreakPoliciesService } from './break-policies.service';

@Module({
  controllers: [BreakPoliciesController],
  providers: [BreakPoliciesService],
})
export class BreakPoliciesModule {}
