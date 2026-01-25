import Tesseract from 'tesseract.js';
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
import * as XLSX from 'xlsx';
import fs from 'fs/promises';
import { FileFormat } from '../config/constants';

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

  async extractTextFromPDF(filePath: string): Promise<OCRResult> {
    try {
      const dataBuffer = await fs.readFile(filePath);
      const pdfData = await pdfParse(dataBuffer);

      return {
        text: pdfData.text,
        confidence: 100,
        pages: [
          {
            pageNumber: 1,
            text: pdfData.text,
            confidence: 100,
          },
        ],
      };
    } catch (error) {
      console.error('PDF parsing error:', error);
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
      default:
        throw new Error(`지원하지 않는 파일 형식: ${fileFormat}`);
    }
  }
}

export const ocrService = new OCRService();
