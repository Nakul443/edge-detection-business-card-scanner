import {
  Body,
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ExtractionsService } from './extractions.service';

@Controller('extractions')
export class ExtractionsController {
  constructor(private readonly extractionsService: ExtractionsService) {}

  @Post('business-card')
  @UseInterceptors(FileInterceptor('file'))
  extractBusinessCard(
    @UploadedFile() file?: Express.Multer.File,
    @Body('rawText') rawText?: string,
  ) {
    return this.extractionsService.extractBusinessCard(file, rawText);
  }

  @Post('voice')
  @UseInterceptors(FileInterceptor('file'))
  extractVoice(
    @UploadedFile() file?: Express.Multer.File,
    @Body('transcript') transcript?: string,
  ) {
    return this.extractionsService.extractVoice(file, transcript);
  }
}
