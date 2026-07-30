import { PartialType } from '@nestjs/swagger';
import { CreateShiftAssignmentDto } from './create-shift-assignment.dto';

export class UpdateShiftAssignmentDto extends PartialType(CreateShiftAssignmentDto) {}
