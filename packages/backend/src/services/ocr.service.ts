import Tesseract from 'tesseract.js';
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
import * as XLSX from 'xlsx';
import fs from 'fs/promises';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import os from 'os';
import { FileFormat } from '../config/constants';

const execAsync = promisify(exec);

export interface OCRResult {
  text: string;
  confidence: number;
  pages?: PageResult[];
}

export interface PageResult {
  pageNumber: number;
  text: string;
  confidence: number;
}

export class OCRService {
  private worker: Tesseract.Worker | null = null;

  async initialize(): Promise<void> {
    if (!this.worker) {
      this.worker = await Tesseract.createWorker('kor+eng');
    }
  }

  async terminate(): Promise<void> {
    if (this.worker) {
      await this.worker.terminate();
      this.worker = null;
    }
  }

  /**
   * PDF에서 한글 텍스트가 포함되어 있는지 확인
   */
  private hasKoreanText(text: string): boolean {
    return /[\uac00-\ud7af]/.test(text);
  }

  /**
   * macOS에서 PDF를 이미지로 변환
   */
  private async convertPdfToImageMacOS(pdfPath: string): Promise<string> {
    const tempDir = os.tmpdir();
    const outputPath = path.join(tempDir, `pdf_ocr_${Date.now()}.png`);

    try {
      // sips 명령어로 PDF를 PNG로 변환 (macOS 내장)
      await execAsync(`sips -s format png "${pdfPath}" --out "${outputPath}" 2>/dev/null`);
      return outputPath;
    } catch {
      // sips 실패시 qlmanage 시도 (Quick Look)
      const qlOutputDir = path.join(tempDir, `pdf_ql_${Date.now()}`);
      await fs.mkdir(qlOutputDir, { recursive: true });
      await execAsync(`qlmanage -t -s 1500 -o "${qlOutputDir}" "${pdfPath}" 2>/dev/null`);

      // 생성된 이미지 찾기
      const files = await fs.readdir(qlOutputDir);
      const imageFile = files.find((f) => f.endsWith('.png'));
      if (imageFile) {
        const imagePath = path.join(qlOutputDir, imageFile);
        await fs.copyFile(imagePath, outputPath);
        await fs.rm(qlOutputDir, { recursive: true, force: true });
        return outputPath;
      }

      throw new Error('PDF to image conversion failed');
    }
  }

  /**
   * 스캔된 PDF에서 OCR로 텍스트 추출
   */
  private async extractTextFromScannedPDF(filePath: string): Promise<OCRResult> {
    console.log('Attempting OCR on scanned PDF:', filePath);

    let imagePath: string | null = null;

    try {
      // PDF를 이미지로 변환
      imagePath = await this.convertPdfToImageMacOS(filePath);
      console.log('PDF converted to image:', imagePath);

      // Tesseract로 OCR 수행
      await this.initialize();
      if (!this.worker) {
        throw new Error('OCR 워커 초기화 실패');
      }

      const result = await this.worker.recognize(imagePath);
      console.log('OCR completed, confidence:', result.data.confidence);

      return {
        text: result.data.text,
        confidence: result.data.confidence,
        pages: [
          {
            pageNumber: 1,
            text: result.data.text,
            confidence: result.data.confidence,
          },
        ],
      };
    } finally {
      // 임시 이미지 파일 삭제
      if (imagePath) {
        try {
          await fs.unlink(imagePath);
        } catch {
          // 삭제 실패해도 무시
        }
      }
    }
  }

  async extractTextFromPDF(filePath: string): Promise<OCRResult> {
    try {
      const dataBuffer = await fs.readFile(filePath);
      const pdfData = await pdfParse(dataBuffer);
      const extractedText = pdfData.text.trim();

      console.log('PDF text extraction result length:', extractedText.length);
      console.log('Has Korean:', this.hasKoreanText(extractedText));

      // 텍스트가 충분히 추출되었는지 확인
      // 1. 텍스트가 50자 미만이거나
      // 2. 한글 텍스트가 없으면 OCR 시도 (Linux에서는 스킵)
      const needsOCR =
        extractedText.length < 50 ||
        !this.hasKoreanText(extractedText);

      // Linux 환경에서는 OCR 스킵 (macOS 명령어 사용 불가)
      const isLinux = process.platform === 'linux';

      if (needsOCR && !isLinux) {
        console.log('PDF text extraction insufficient, trying OCR...');
        try {
          return await this.extractTextFromScannedPDF(filePath);
        } catch (ocrError) {
          console.error('OCR failed:', ocrError);
        }
      }

      // 텍스트가 있으면 반환 (OCR 실패 또는 Linux 환경)
      if (extractedText.length > 0) {
        const confidence = extractedText.length > 100 && this.hasKoreanText(extractedText) ? 80 : 50;
        console.log(`[OCR] Returning PDF text with confidence: ${confidence}%`);
        return {
          text: extractedText,
          confidence,
          pages: [
            {
              pageNumber: 1,
              text: extractedText,
              confidence,
            },
          ],
        };
      }

      throw new Error('PDF 텍스트 추출 실패');
    } catch (error) {
      console.error('PDF parsing error:', error);

      // Linux가 아니면 OCR 시도
      if (process.platform !== 'linux') {
        try {
          return await this.extractTextFromScannedPDF(filePath);
        } catch {
          // OCR도 실패
        }
      }

      throw new Error('PDF 파일을 읽을 수 없습니다');
    }
  }

  async extractTextFromImage(imagePath: string): Promise<OCRResult> {
    await this.initialize();

    if (!this.worker) {
      throw new Error('OCR 워커 초기화 실패');
    }

    const result = await this.worker.recognize(imagePath);

    return {
      text: result.data.text,
      confidence: result.data.confidence,
    };
  }

  async extractTextFromWord(filePath: string): Promise<OCRResult> {
    try {
      const buffer = await fs.readFile(filePath);
      const result = await mammoth.extractRawText({ buffer });

      return {
        text: result.value,
        confidence: 100,
      };
    } catch (error) {
      console.error('Word parsing error:', error);
      throw new Error('Word 파일을 읽을 수 없습니다');
    }
  }

  async extractTextFromExcel(filePath: string): Promise<OCRResult> {
    try {
      const workbook = XLSX.readFile(filePath);
      const texts: string[] = [];

      for (const sheetName of workbook.SheetNames) {
        const sheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];

        for (const row of jsonData) {
          const rowText = row
            .filter((cell) => cell !== null && cell !== undefined)
            .map((cell) => String(cell))
            .join('\t');
          if (rowText.trim()) {
            texts.push(rowText);
          }
        }
      }

      return {
        text: texts.join('\n'),
        confidence: 100,
      };
    } catch (error) {
      console.error('Excel parsing error:', error);
      throw new Error('Excel 파일을 읽을 수 없습니다');
    }
  }

  async extractText(filePath: string, fileFormat: FileFormat): Promise<OCRResult> {
    switch (fileFormat) {
      case FileFormat.PDF:
        return this.extractTextFromPDF(filePath);
      case FileFormat.WORD:
        return this.extractTextFromWord(filePath);
      case FileFormat.EXCEL:
        return this.extractTextFromExcel(filePath);
      case FileFormat.IMAGE:
        return this.extractTextFromImage(filePath);
      default:
        throw new Error(`지원하지 않는 파일 형식: ${fileFormat}`);
    }
  }
}

export const ocrService = new OCRService();
