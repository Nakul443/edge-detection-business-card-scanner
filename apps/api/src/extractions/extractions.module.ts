import { Module } from '@nestjs/common';
import { ExtractionsController } from './extractions.controller';
import { ExtractionsService } from './extractions.service';

@Module({
  controllers: [ExtractionsController],
  providers: [ExtractionsService],
})
export class ExtractionsModule {}
