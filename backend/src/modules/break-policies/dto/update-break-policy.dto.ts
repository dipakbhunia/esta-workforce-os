import { PartialType } from '@nestjs/swagger';
import { CreateBreakPolicyDto } from './create-break-policy.dto';

export class UpdateBreakPolicyDto extends PartialType(CreateBreakPolicyDto) {}
