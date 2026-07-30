import { Module } from '@nestjs/common';
import { ProductivityController } from './productivity.controller';
import { ProductivityService } from './productivity.service';
import { ProductivityClassificationService } from './productivity-classification.service';

@Module({
  controllers: [ProductivityController],
  providers: [ProductivityService, ProductivityClassificationService],
  exports: [ProductivityClassificationService],
})
export class ProductivityModule {}
