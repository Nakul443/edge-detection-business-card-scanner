import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, extname, join } from 'node:path';
import { promisify } from 'node:util';
import { recognize } from 'tesseract.js';
import {
  parseBusinessCardText,
  parseVoiceContactText,
  type ParsedContactDraft,
} from './contact-text-parser';
import { createBusinessCardOcrVariants } from './business-card-image-processor';

type ExtractionSource = 'business_card' | 'voice';
const execFileAsync = promisify(execFile);

@Injectable()
export class ExtractionsService {
  private readonly logger = new Logger(ExtractionsService.name);

  async extractBusinessCard(file?: Express.Multer.File, rawText?: string) {
    const text =
      rawText?.trim() || (file ? await this.recognizeBusinessCard(file) : '');
    return this.toExtractionResult(
      'business_card',
      text,
      parseBusinessCardText(text),
      Boolean(file),
    );
  }

  async extractVoice(file?: Express.Multer.File, transcript?: string) {
    const text =
      transcript?.trim() || (file ? await this.transcribeVoice(file) : '');
    return this.toExtractionResult(
      'voice',
      text,
      parseVoiceContactText(text),
      Boolean(file),
    );
  }

  private async transcribeVoice(file: Express.Multer.File) {
    const extension =
      extname(file.originalname || '') || this.extensionForMime(file.mimetype);
    const audioPath = join(
      tmpdir(),
      `bhumio-voice-${Date.now()}-${Math.round(Math.random() * 1_000_000)}${extension}`,
    );

    await fs.writeFile(audioPath, file.buffer);

    try {
      const scriptPath = await this.resolveLocalSttScriptPath();
      const python = process.env.LOCAL_STT_PYTHON ?? 'python';
      const args = [scriptPath, audioPath];

      if (process.env.LOCAL_STT_MODEL) {
        args.push('--model', process.env.LOCAL_STT_MODEL);
      }

      if (process.env.LOCAL_STT_MODEL_DIR) {
        args.push('--model-dir', process.env.LOCAL_STT_MODEL_DIR);
      }

      const { stdout } = await execFileAsync(python, args, {
        timeout: Number(process.env.LOCAL_STT_TIMEOUT_MS ?? '120000'),
        maxBuffer: 1024 * 1024,
      });
      const result = JSON.parse(stdout) as {
        ok: boolean;
        text?: string;
        error?: string;
      };

      if (!result.ok) {
        throw new ServiceUnavailableException(
          result.error ?? 'Local STT failed',
        );
      }

      return result.text?.trim() ?? '';
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      throw new ServiceUnavailableException(
        error instanceof Error ? error.message : 'Local STT unavailable',
      );
    } finally {
      await fs.rm(audioPath, { force: true });
    }
  }

  private extensionForMime(mimetype?: string) {
    if (mimetype?.includes('jpeg')) return '.jpg';
    if (mimetype?.includes('jpg')) return '.jpg';
    if (mimetype?.includes('png')) return '.png';
    if (mimetype?.includes('webp')) return '.webp';
    if (mimetype?.includes('webm')) return '.webm';
    if (mimetype?.includes('ogg')) return '.ogg';
    if (mimetype?.includes('mpeg')) return '.mp3';
    if (mimetype?.includes('wav')) return '.wav';
    return '.webm';
  }

  private async resolveLocalSttScriptPath() {
    const candidates = [
      join(process.cwd(), 'scripts', 'local_stt_faster_whisper.py'),
      join(process.cwd(), '..', '..', 'scripts', 'local_stt_faster_whisper.py'),
      join(
        __dirname,
        '..',
        '..',
        '..',
        '..',
        'scripts',
        'local_stt_faster_whisper.py',
      ),
    ];

    for (const candidate of candidates) {
      try {
        await fs.access(candidate);
        return candidate;
      } catch {
        // Try the next likely project root.
      }
    }

    return candidates[0];
  }

  private async recognizeBusinessCard(file: Express.Multer.File) {
    const engine = (process.env.BUSINESS_CARD_OCR_ENGINE ?? 'paddle')
      .trim()
      .toLowerCase();

    if (engine === 'paddle') {
      try {
        return await this.recognizeBusinessCardWithPaddle(file);
      } catch (error) {
        this.logger.warn(
          `PaddleOCR failed; falling back to Tesseract: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    return this.recognizeBusinessCardWithTesseract(file);
  }

  private async recognizeBusinessCardWithPaddle(file: Express.Multer.File) {
    const extension =
      extname(file.originalname || '') || this.extensionForMime(file.mimetype);
    const imagePath = join(
      tmpdir(),
      `bhumio-card-${Date.now()}-${Math.round(Math.random() * 1_000_000)}${extension}`,
    );
    const outputPath = join(
      tmpdir(),
      `bhumio-card-ocr-${Date.now()}-${Math.round(Math.random() * 1_000_000)}.json`,
    );

    await fs.writeFile(imagePath, file.buffer);

    try {
      const scriptPath = await this.resolvePaddleOcrScriptPath();
      const python =
        process.env.BUSINESS_CARD_OCR_PYTHON ??
        process.env.LOCAL_STT_PYTHON ??
        'python';
      const sideLen = process.env.BUSINESS_CARD_PADDLE_SIDE_LEN ?? '960';
      const { stdout, stderr } = await execFileAsync(
        python,
        [scriptPath, '--output', outputPath, '--side-len', sideLen, imagePath],
        {
          cwd: process.cwd(),
          timeout: Number(process.env.BUSINESS_CARD_OCR_TIMEOUT_MS ?? '180000'),
          maxBuffer: 1024 * 1024 * 20,
          env: {
            ...process.env,
            PADDLE_PDX_ENABLE_MKLDNN_BYDEFAULT: '0',
            PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK: 'True',
          },
        },
      );

      if (stdout.trim()) {
        this.logger.debug(stdout.trim());
      }

      if (stderr.trim()) {
        this.logger.debug(stderr.trim());
      }

      const payload = JSON.parse(await fs.readFile(outputPath, 'utf8')) as Record<
        string,
        { rawText?: string; lines?: Array<{ text?: string }> }
      >;
      const result = payload[basename(imagePath)];
      const lineText =
        result?.lines
          ?.map((line) => line.text?.trim())
          .filter(Boolean)
          .join('\n') ?? '';
      const rawText = result?.rawText?.trim() || lineText;

      if (!rawText) {
        throw new Error('PaddleOCR returned no text');
      }

      return `--- paddle ---\n${rawText}`;
    } finally {
      await Promise.all([
        fs.rm(imagePath, { force: true }),
        fs.rm(outputPath, { force: true }),
      ]);
    }
  }

  private async recognizeBusinessCardWithTesseract(file: Express.Multer.File) {
    const variants = await createBusinessCardOcrVariants(file.buffer);
    const results = await Promise.all(
      variants.map(async (variant) => {
        const options = variant.pageSegmentationMode
          ? ({
              tessedit_pageseg_mode: variant.pageSegmentationMode,
            } as unknown as Parameters<typeof recognize>[2])
          : undefined;
        const result = await recognize(variant.buffer, 'eng', options);
        return `--- ${variant.name} ---\n${result.data.text}`;
      }),
    );

    return results.join('\n\n');
  }

  private async resolvePaddleOcrScriptPath() {
    const candidates = [
      join(process.cwd(), 'scripts', 'paddle_ocr_bridge.py'),
      join(process.cwd(), '..', '..', 'scripts', 'paddle_ocr_bridge.py'),
      join(
        __dirname,
        '..',
        '..',
        '..',
        '..',
        'scripts',
        'paddle_ocr_bridge.py',
      ),
    ];

    for (const candidate of candidates) {
      try {
        await fs.access(candidate);
        return candidate;
      } catch {
        // Try the next likely project root.
      }
    }

    return candidates[0];
  }

  private toExtractionResult(
    sourceType: ExtractionSource,
    rawText: string,
    draft: ParsedContactDraft,
    fileReceived: boolean,
  ) {
    return {
      sourceType,
      rawText,
      draft,
      fileReceived,
    };
  }
}
