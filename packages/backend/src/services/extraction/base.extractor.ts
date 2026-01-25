import {
  ExtractionMethod,
  FieldExtraction,
  ExtractionError,
  EnhancedExtractionResult,
} from '../../types/extraction.types';
import { normalizeKoreanText } from '../../utils/korean.utils';

export interface ExtractPattern {
  pattern: RegExp;
  confidence: number;
  method: ExtractionMethod;
}

export interface FieldDefinition {
  name: string;
  patterns: ExtractPattern[];
  required: boolean;
  weight: number;
  transform?: (value: string) => unknown;
}

export abstract class BaseExtractor<TData> {
  protected abstract getFieldDefinitions(): FieldDefinition[];
  protected abstract buildData(fields: Record<string, FieldExtraction<unknown>>): TData | null;

  abstract extract(text: string): EnhancedExtractionResult<TData>;

  protected normalizeText(text: string): string {
    return normalizeKoreanText(text);
  }

  protected extractWithPatterns<T>(
    text: string,
    patterns: ExtractPattern[],
    transform?: (value: string) => T
  ): FieldExtraction<T | null> {
    for (const { pattern, confidence, method } of patterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        const rawValue = match[1].trim();
        const value = transform ? transform(rawValue) : (rawValue as unknown as T);
        const sourceStart = Math.max(0, (match.index || 0) - 20);
        const sourceEnd = Math.min(text.length, (match.index || 0) + match[0].length + 20);
        
        return {
          value,
          confidence,
          source: text.substring(sourceStart, sourceEnd).replace(/\n/g, ' ').trim(),
          method,
        };
      }
    }

    return {
      value: null,
      confidence: 0,
      source: '',
      method: 'regex',
    };
  }

  protected calculateOverallConfidence(
    fields: Record<string, FieldExtraction<unknown>>,
    definitions: FieldDefinition[]
  ): number {
    let totalWeight = 0;
    let weightedConfidence = 0;

    for (const def of definitions) {
      const field = fields[def.name];
      if (field) {
        totalWeight += def.weight;
        weightedConfidence += field.confidence * def.weight;
      }
    }

    if (totalWeight === 0) return 0;
    return Math.round(weightedConfidence / totalWeight);
  }

  protected validateFields(
    fields: Record<string, FieldExtraction<unknown>>,
    definitions: FieldDefinition[]
  ): ExtractionError[] {
    const errors: ExtractionError[] = [];

    for (const def of definitions) {
      const field = fields[def.name];
      
      if (def.required && (!field || field.value === null || field.value === '')) {
        errors.push({
          field: def.name,
          message: `${def.name}을(를) 찾을 수 없습니다`,
          severity: 'error',
          suggestion: `문서에서 ${def.name} 항목을 확인해주세요`,
        });
      } else if (field && field.confidence < 50) {
        errors.push({
          field: def.name,
          message: `${def.name}의 추출 신뢰도가 낮습니다 (${field.confidence}%)`,
          severity: 'warning',
          suggestion: '수동 검토를 권장합니다',
        });
      }
    }

    return errors;
  }

  protected getWarnings(
    fields: Record<string, FieldExtraction<unknown>>,
    definitions: FieldDefinition[]
  ): string[] {
    const warnings: string[] = [];

    for (const def of definitions) {
      const field = fields[def.name];
      if (field && field.confidence >= 50 && field.confidence < 80) {
        warnings.push(`${def.name}: 신뢰도 ${field.confidence}% - 검토 권장`);
      }
    }

    return warnings;
  }
}
