/**
 * 데이터 값 범위 검증 유틸리티
 * 추출된 데이터의 유효성을 검증하고 경고를 생성합니다.
 */

export interface ValidationResult {
  isValid: boolean;
  value: number | string | Date | null;
  warning?: string;
  severity?: 'LOW' | 'MEDIUM' | 'HIGH';
}

/**
 * 2026년 최저임금 기준 (시급)
 */
const MINIMUM_HOURLY_WAGE_2026 = 10030;

/**
 * 주 40시간 기준 최저 월급 (주휴수당 포함)
 * 10,030원 × 209시간 = 2,096,270원
 */
const MINIMUM_MONTHLY_WAGE_2026 = 2096270;

/**
 * 월급여 범위 검증
 * 범위: 100만원 ~ 1억원
 * 최저임금 미달 경고 포함
 */
export function validateMonthlyWage(
  wage: number | null | undefined,
  weeklyHours: number = 40
): ValidationResult {
  if (wage === null || wage === undefined) {
    return {
      isValid: false,
      value: null,
      warning: '월급여 정보가 없습니다',
      severity: 'HIGH',
    };
  }

  // 범위 검증 (100만원 ~ 1억원)
  if (wage < 1000000) {
    return {
      isValid: false,
      value: wage,
      warning: `월급여(${wage.toLocaleString()}원)가 비정상적으로 낮습니다. OCR 오류일 수 있습니다.`,
      severity: 'HIGH',
    };
  }

  if (wage > 100000000) {
    return {
      isValid: false,
      value: wage,
      warning: `월급여(${wage.toLocaleString()}원)가 비정상적으로 높습니다. OCR 오류일 수 있습니다.`,
      severity: 'HIGH',
    };
  }

  // 최저임금 검증 (주 40시간 기준)
  if (weeklyHours >= 35) {
    // 풀타임 근로자
    if (wage < MINIMUM_MONTHLY_WAGE_2026) {
      return {
        isValid: true,
        value: wage,
        warning: `월급여(${wage.toLocaleString()}원)가 2026년 최저임금(${MINIMUM_MONTHLY_WAGE_2026.toLocaleString()}원) 미만입니다.`,
        severity: 'MEDIUM',
      };
    }
  } else if (weeklyHours > 0) {
    // 시간제 근로자 최저임금 검증
    const monthlyHours = weeklyHours * 4.345; // 월 평균 주 수
    const minimumWage = Math.floor(MINIMUM_HOURLY_WAGE_2026 * monthlyHours);
    if (wage < minimumWage * 0.9) { // 10% 여유 허용
      return {
        isValid: true,
        value: wage,
        warning: `월급여가 시간제 근로 최저임금 기준에 미달할 수 있습니다.`,
        severity: 'LOW',
      };
    }
  }

  return {
    isValid: true,
    value: wage,
  };
}

/**
 * 주당 근로시간 범위 검증
 * 범위: 1 ~ 52시간 (법정 최대 근로시간: 52시간)
 */
export function validateWeeklyWorkHours(hours: number | null | undefined): ValidationResult {
  if (hours === null || hours === undefined) {
    return {
      isValid: false,
      value: null,
      warning: '주당 근로시간 정보가 없습니다',
      severity: 'LOW', // 기본값 40시간 적용 가능
    };
  }

  if (hours < 1) {
    return {
      isValid: false,
      value: hours,
      warning: `주당 근로시간(${hours})이 비정상적으로 낮습니다.`,
      severity: 'HIGH',
    };
  }

  if (hours > 52) {
    return {
      isValid: true, // 값은 유효하나 경고
      value: hours,
      warning: `주당 근로시간(${hours})이 법정 최대(52시간)를 초과합니다.`,
      severity: 'MEDIUM',
    };
  }

  // 초단시간 근로자 (주 15시간 미만) 감지
  if (hours < 15) {
    return {
      isValid: true,
      value: hours,
      warning: `초단시간 근로자(주 ${hours}시간)입니다. 일부 지원금 대상에서 제외될 수 있습니다.`,
      severity: 'LOW',
    };
  }

  // 단시간 근로자 (주 35시간 미만) 감지
  if (hours < 35) {
    return {
      isValid: true,
      value: hours,
      warning: `단시간 근로자(주 ${hours}시간)입니다. 시간제 근로자로 분류됩니다.`,
      severity: 'LOW',
    };
  }

  return {
    isValid: true,
    value: hours,
  };
}

/**
 * 입사일 범위 검증
 * 범위: 1950년 ~ 현재 + 1년 (미래 채용 예정)
 */
export function validateHireDate(dateStr: string | null | undefined): ValidationResult {
  if (!dateStr) {
    return {
      isValid: false,
      value: null,
      warning: '입사일 정보가 없습니다',
      severity: 'MEDIUM',
    };
  }

  const date = new Date(dateStr);
  if (isNaN(date.getTime())) {
    return {
      isValid: false,
      value: null,
      warning: `입사일(${dateStr})을 날짜로 파싱할 수 없습니다.`,
      severity: 'HIGH',
    };
  }

  const now = new Date();
  const minDate = new Date('1950-01-01');
  const maxDate = new Date(now.getFullYear() + 1, now.getMonth(), now.getDate());

  if (date < minDate) {
    return {
      isValid: false,
      value: date,
      warning: `입사일(${dateStr})이 1950년 이전입니다. OCR 오류일 수 있습니다.`,
      severity: 'HIGH',
    };
  }

  if (date > maxDate) {
    return {
      isValid: false,
      value: date,
      warning: `입사일(${dateStr})이 미래 날짜입니다.`,
      severity: 'HIGH',
    };
  }

  // 6개월 이내 미래 입사일 (예정)
  if (date > now) {
    return {
      isValid: true,
      value: date,
      warning: `입사일(${dateStr})이 미래 날짜입니다. 채용 예정자일 수 있습니다.`,
      severity: 'MEDIUM',
    };
  }

  return {
    isValid: true,
    value: date,
  };
}

/**
 * 나이 범위 검증
 * 범위: 15 ~ 100세 (근로 가능 연령)
 */
export function validateAge(age: number | null | undefined): ValidationResult {
  if (age === null || age === undefined) {
    return {
      isValid: false,
      value: null,
      warning: '나이 정보가 없습니다',
      severity: 'MEDIUM',
    };
  }

  if (age < 0 || age > 120) {
    return {
      isValid: false,
      value: age,
      warning: `나이(${age}세)가 비정상적입니다. OCR 오류일 수 있습니다.`,
      severity: 'HIGH',
    };
  }

  if (age < 15) {
    return {
      isValid: false,
      value: age,
      warning: `나이(${age}세)가 근로 가능 연령(15세) 미만입니다.`,
      severity: 'HIGH',
    };
  }

  if (age > 100) {
    return {
      isValid: false,
      value: age,
      warning: `나이(${age}세)가 비정상적으로 높습니다. OCR 오류일 수 있습니다.`,
      severity: 'HIGH',
    };
  }

  // 청년 (15-34세) 감지
  if (age >= 15 && age <= 34) {
    return {
      isValid: true,
      value: age,
      warning: undefined, // 청년은 경고 없음
    };
  }

  // 고령자 (60세 이상) 감지
  if (age >= 60) {
    return {
      isValid: true,
      value: age,
      warning: undefined, // 고령자도 경고 없음
    };
  }

  return {
    isValid: true,
    value: age,
  };
}

/**
 * 주민등록번호 형식 검증 (체크섬 제외, 형식만)
 */
export function validateResidentNumberFormat(rrn: string | null | undefined): ValidationResult {
  if (!rrn) {
    return {
      isValid: false,
      value: null,
      warning: '주민등록번호 정보가 없습니다',
      severity: 'MEDIUM',
    };
  }

  const cleaned = rrn.replace(/[-\s]/g, '');

  // 마스킹된 경우 처리
  if (cleaned.includes('*')) {
    const nonMasked = cleaned.replace(/\*/g, '');
    if (nonMasked.length >= 6) {
      return {
        isValid: true,
        value: rrn,
        warning: '주민등록번호가 마스킹되어 있어 나이 계산이 제한적입니다.',
        severity: 'LOW',
      };
    }
    return {
      isValid: false,
      value: rrn,
      warning: '주민등록번호가 너무 많이 마스킹되어 있습니다.',
      severity: 'MEDIUM',
    };
  }

  if (cleaned.length !== 13) {
    return {
      isValid: false,
      value: rrn,
      warning: `주민등록번호 길이(${cleaned.length}자리)가 잘못되었습니다.`,
      severity: 'HIGH',
    };
  }

  if (!/^\d{13}$/.test(cleaned)) {
    return {
      isValid: false,
      value: rrn,
      warning: '주민등록번호에 숫자가 아닌 문자가 포함되어 있습니다.',
      severity: 'HIGH',
    };
  }

  return {
    isValid: true,
    value: rrn,
  };
}

/**
 * 사업자등록번호 형식 검증
 */
export function validateBusinessNumberFormat(brn: string | null | undefined): ValidationResult {
  if (!brn) {
    return {
      isValid: false,
      value: null,
      warning: '사업자등록번호 정보가 없습니다',
      severity: 'HIGH',
    };
  }

  const cleaned = brn.replace(/[-\s]/g, '');

  if (cleaned.length !== 10) {
    return {
      isValid: false,
      value: brn,
      warning: `사업자등록번호 길이(${cleaned.length}자리)가 잘못되었습니다.`,
      severity: 'HIGH',
    };
  }

  if (!/^\d{10}$/.test(cleaned)) {
    return {
      isValid: false,
      value: brn,
      warning: '사업자등록번호에 숫자가 아닌 문자가 포함되어 있습니다.',
      severity: 'HIGH',
    };
  }

  return {
    isValid: true,
    value: brn,
  };
}

/**
 * 고용유지기간 검증 (지원금 신청 요건)
 */
export function validateEmploymentDuration(
  hireDate: string | null | undefined,
  requiredMonths: number = 6
): ValidationResult {
  if (!hireDate) {
    return {
      isValid: false,
      value: null,
      warning: '입사일 정보가 없어 고용유지기간을 계산할 수 없습니다',
      severity: 'MEDIUM',
    };
  }

  const hire = new Date(hireDate);
  if (isNaN(hire.getTime())) {
    return {
      isValid: false,
      value: null,
      warning: '입사일을 파싱할 수 없습니다',
      severity: 'HIGH',
    };
  }

  const now = new Date();
  const monthsDiff = (now.getFullYear() - hire.getFullYear()) * 12 + (now.getMonth() - hire.getMonth());

  if (monthsDiff < requiredMonths) {
    return {
      isValid: false,
      value: monthsDiff,
      warning: `고용유지기간(${monthsDiff}개월)이 요구조건(${requiredMonths}개월)에 미달합니다.`,
      severity: 'MEDIUM',
    };
  }

  return {
    isValid: true,
    value: monthsDiff,
  };
}

/**
 * 베이지안 신뢰도 계산
 * 사전 확률(추출 방법)과 증거(검증 결과)를 결합
 */
export function calculateBayesianConfidence(
  priorConfidence: number,  // 추출 방법 기반 초기 신뢰도 (0-100)
  evidenceStrength: number  // 검증 결과 기반 증거 강도 (0-1)
): number {
  // 베이지안 업데이트 간소화 버전
  // P(H|E) = P(E|H) * P(H) / P(E)
  // 여기서 P(H) = priorConfidence/100, P(E|H) = evidenceStrength

  const prior = priorConfidence / 100;
  const likelihood = evidenceStrength;

  // P(E) 추정 (증거의 전반적 확률)
  const evidenceProbability = 0.5; // 중립적 가정

  const posterior = (likelihood * prior) / evidenceProbability;

  // 0-100 범위로 변환 및 제한
  return Math.min(100, Math.max(0, Math.round(posterior * 100)));
}

/**
 * 복합 신뢰도 계산
 * 여러 검증 결과를 종합하여 전체 신뢰도 계산
 */
export function calculateCompositeConfidence(
  validationResults: ValidationResult[]
): { confidence: number; warnings: string[] } {
  if (validationResults.length === 0) {
    return { confidence: 100, warnings: [] };
  }

  let totalPenalty = 0;
  const warnings: string[] = [];

  for (const result of validationResults) {
    if (!result.isValid) {
      switch (result.severity) {
        case 'HIGH':
          totalPenalty += 25;
          break;
        case 'MEDIUM':
          totalPenalty += 15;
          break;
        case 'LOW':
          totalPenalty += 5;
          break;
        default:
          totalPenalty += 10;
      }
    } else if (result.warning) {
      // 유효하지만 경고가 있는 경우
      switch (result.severity) {
        case 'HIGH':
          totalPenalty += 10;
          break;
        case 'MEDIUM':
          totalPenalty += 5;
          break;
        case 'LOW':
          totalPenalty += 2;
          break;
      }
    }

    if (result.warning) {
      warnings.push(result.warning);
    }
  }

  const confidence = Math.max(0, 100 - totalPenalty);
  return { confidence, warnings };
}
