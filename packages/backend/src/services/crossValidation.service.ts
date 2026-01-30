/**
 * 문서 간 교차 검증 서비스
 * 여러 문서에서 추출된 데이터의 일관성을 검증합니다.
 */

import {
  WageLedgerData,
  InsuranceListData,
  EmploymentContractData,
  EmployeeData,
} from '../types/document.types';
import { DataQualityWarning } from '../types/subsidy.types';
import { normalizeName, rrnMatch } from './document-matcher.service';

export interface CrossValidationResult {
  isValid: boolean;
  warnings: DataQualityWarning[];
  matchedEmployees: string[];
  unmatchedFromWageLedger: string[];
  unmatchedFromInsurance: string[];
  inconsistencies: DataInconsistency[];
}

export interface DataInconsistency {
  employeeName: string;
  field: string;
  wageLedgerValue: string | number | undefined;
  insuranceValue: string | number | undefined;
  contractValue: string | number | undefined;
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  message: string;
}

// 2026년 최저임금 (주 40시간 기준)
const MINIMUM_MONTHLY_WAGE_2026 = 2096270;

class CrossValidationService {
  /**
   * 직원 이름 정규화 (공백, 특수문자 제거)
   */
  private normalizeEmployeeName(name: string): string {
    return normalizeName(name);
  }

  /**
   * 이름으로 후보 배열에서 최적 직원 찾기 (주민번호 → 입사일 → 첫번째)
   */
  private findBestWageEmployee(
    candidates: EmployeeData[],
    rrn?: string,
    date?: string
  ): EmployeeData | undefined {
    if (candidates.length === 0) return undefined;
    if (candidates.length === 1) return candidates[0];

    if (rrn) {
      const hit = candidates.find(c => rrnMatch(rrn, c.residentRegistrationNumber));
      if (hit) return hit;
    }

    if (date) {
      const target = new Date(date).getTime();
      if (!isNaN(target)) {
        let bestIdx = 0;
        let bestDiff = Infinity;
        for (let i = 0; i < candidates.length; i++) {
          if (!candidates[i].hireDate) continue;
          const d = new Date(candidates[i].hireDate).getTime();
          if (isNaN(d)) continue;
          const diff = Math.abs(target - d);
          if (diff < bestDiff) {
            bestDiff = diff;
            bestIdx = i;
          }
        }
        return candidates[bestIdx];
      }
    }

    return candidates[0];
  }

  /**
   * 임금대장 직원을 이름 → 배열 맵으로 구성 (동명이인 보존)
   */
  private buildWageMap(wageLedger: WageLedgerData): Map<string, EmployeeData[]> {
    const wageMap = new Map<string, EmployeeData[]>();
    for (const emp of wageLedger.employees) {
      const key = this.normalizeEmployeeName(emp.name);
      const arr = wageMap.get(key) || [];
      arr.push(emp);
      wageMap.set(key, arr);
    }
    return wageMap;
  }

  /**
   * 임금대장과 보험명부의 급여 일치성 검증
   */
  validateWageConsistency(
    wageLedger: WageLedgerData | undefined,
    contracts: EmploymentContractData[] | undefined
  ): DataInconsistency[] {
    const inconsistencies: DataInconsistency[] = [];

    if (!wageLedger || !contracts || contracts.length === 0) {
      return inconsistencies;
    }

    const wageMap = this.buildWageMap(wageLedger);

    // 근로계약서와 비교
    for (const contract of contracts) {
      const key = this.normalizeEmployeeName(contract.employeeName);
      const candidates = wageMap.get(key);
      if (!candidates) continue;

      const wageEmployee = this.findBestWageEmployee(
        candidates,
        contract.residentRegistrationNumber,
        contract.contractStartDate
      );
      if (!wageEmployee) continue;

      // 급여 비교 (10% 이상 차이 시 경고)
      const wageDiff = Math.abs(wageEmployee.monthlyWage - contract.monthlySalary);
      const wageRatio = wageDiff / Math.max(wageEmployee.monthlyWage, contract.monthlySalary);

      if (wageRatio > 0.1) {
        inconsistencies.push({
          employeeName: contract.employeeName,
          field: '월급여',
          wageLedgerValue: wageEmployee.monthlyWage,
          insuranceValue: undefined,
          contractValue: contract.monthlySalary,
          severity: wageRatio > 0.3 ? 'HIGH' : 'MEDIUM',
          message: `임금대장(${wageEmployee.monthlyWage.toLocaleString()}원)과 근로계약서(${contract.monthlySalary.toLocaleString()}원)의 급여가 ${Math.round(wageRatio * 100)}% 차이납니다.`,
        });
      }

      // 근로시간 비교
      if (wageEmployee.weeklyWorkHours && contract.weeklyWorkHours) {
        if (Math.abs(wageEmployee.weeklyWorkHours - contract.weeklyWorkHours) > 5) {
          inconsistencies.push({
            employeeName: contract.employeeName,
            field: '주당근로시간',
            wageLedgerValue: wageEmployee.weeklyWorkHours,
            insuranceValue: undefined,
            contractValue: contract.weeklyWorkHours,
            severity: 'MEDIUM',
            message: `임금대장(${wageEmployee.weeklyWorkHours}시간)과 근로계약서(${contract.weeklyWorkHours}시간)의 근로시간이 다릅니다.`,
          });
        }
      }
    }

    return inconsistencies;
  }

  /**
   * 임금대장과 보험명부의 날짜 일치성 검증 (입사일/취득일)
   */
  validateDateConsistency(
    wageLedger: WageLedgerData | undefined,
    insuranceList: InsuranceListData | undefined,
    contracts: EmploymentContractData[] | undefined
  ): DataInconsistency[] {
    const inconsistencies: DataInconsistency[] = [];

    if (!wageLedger) return inconsistencies;

    const wageMap = this.buildWageMap(wageLedger);

    // 보험명부와 비교
    if (insuranceList?.employees) {
      for (const ins of insuranceList.employees) {
        const key = this.normalizeEmployeeName(ins.name);
        const candidates = wageMap.get(key);
        if (!candidates) continue;

        const wageEmployee = this.findBestWageEmployee(
          candidates, undefined, ins.enrollmentDate
        );
        if (!wageEmployee || !wageEmployee.hireDate || !ins.enrollmentDate) continue;

        const hireDate = new Date(wageEmployee.hireDate);
        const enrollDate = new Date(ins.enrollmentDate);

        const daysDiff = Math.abs((hireDate.getTime() - enrollDate.getTime()) / (1000 * 60 * 60 * 24));
        if (daysDiff > 30) {
          inconsistencies.push({
            employeeName: ins.name,
            field: '입사일/취득일',
            wageLedgerValue: wageEmployee.hireDate,
            insuranceValue: ins.enrollmentDate,
            contractValue: undefined,
            severity: daysDiff > 90 ? 'HIGH' : 'MEDIUM',
            message: `임금대장 입사일(${wageEmployee.hireDate})과 보험 취득일(${ins.enrollmentDate})이 ${Math.round(daysDiff)}일 차이납니다.`,
          });
        }
      }
    }

    // 근로계약서와 비교
    if (contracts) {
      for (const contract of contracts) {
        const key = this.normalizeEmployeeName(contract.employeeName);
        const candidates = wageMap.get(key);
        if (!candidates) continue;

        const wageEmployee = this.findBestWageEmployee(
          candidates,
          contract.residentRegistrationNumber,
          contract.contractStartDate
        );
        if (!wageEmployee || !wageEmployee.hireDate || !contract.contractStartDate) continue;

        const hireDate = new Date(wageEmployee.hireDate);
        const contractDate = new Date(contract.contractStartDate);

        const daysDiff = Math.abs((hireDate.getTime() - contractDate.getTime()) / (1000 * 60 * 60 * 24));
        if (daysDiff > 30) {
          inconsistencies.push({
            employeeName: contract.employeeName,
            field: '입사일/계약시작일',
            wageLedgerValue: wageEmployee.hireDate,
            insuranceValue: undefined,
            contractValue: contract.contractStartDate,
            severity: daysDiff > 90 ? 'HIGH' : 'MEDIUM',
            message: `임금대장 입사일(${wageEmployee.hireDate})과 계약시작일(${contract.contractStartDate})이 ${Math.round(daysDiff)}일 차이납니다.`,
          });
        }
      }
    }

    return inconsistencies;
  }

  /**
   * 최저임금 충족 여부 검증
   */
  validateMinimumWageCompliance(
    wageLedger: WageLedgerData | undefined
  ): DataQualityWarning[] {
    const warnings: DataQualityWarning[] = [];

    if (!wageLedger?.employees) return warnings;

    const belowMinimum: string[] = [];

    for (const emp of wageLedger.employees) {
      const weeklyHours = emp.weeklyWorkHours || 40;

      // 풀타임 근로자 (주 35시간 이상)
      if (weeklyHours >= 35) {
        if (emp.monthlyWage < MINIMUM_MONTHLY_WAGE_2026) {
          belowMinimum.push(`${emp.name}(${emp.monthlyWage.toLocaleString()}원)`);
        }
      } else if (weeklyHours >= 15) {
        // 단시간 근로자
        const monthlyHours = weeklyHours * 4.345;
        const minimumWage = Math.floor(10030 * monthlyHours);
        if (emp.monthlyWage < minimumWage * 0.9) { // 10% 여유
          belowMinimum.push(`${emp.name}(${emp.monthlyWage.toLocaleString()}원)`);
        }
      }
    }

    if (belowMinimum.length > 0) {
      warnings.push({
        field: '최저임금',
        documentType: 'WAGE_LEDGER',
        severity: 'HIGH',
        message: `${belowMinimum.length}명의 급여가 2026년 최저임금 기준에 미달합니다: ${belowMinimum.slice(0, 3).join(', ')}${belowMinimum.length > 3 ? ' 외 ' + (belowMinimum.length - 3) + '명' : ''}`,
        suggestedAction: '최저임금 미달자는 지원금 심사 시 불이익이 있을 수 있습니다. 급여 데이터를 확인하세요.',
      });
    }

    return warnings;
  }

  /**
   * 직원 명부 교차 확인
   */
  validateEmployeeListConsistency(
    wageLedger: WageLedgerData | undefined,
    insuranceList: InsuranceListData | undefined
  ): CrossValidationResult {
    const result: CrossValidationResult = {
      isValid: true,
      warnings: [],
      matchedEmployees: [],
      unmatchedFromWageLedger: [],
      unmatchedFromInsurance: [],
      inconsistencies: [],
    };

    if (!wageLedger?.employees) {
      result.warnings.push({
        field: '임금대장',
        documentType: 'WAGE_LEDGER',
        severity: 'HIGH',
        message: '임금대장이 없어 직원 명부를 확인할 수 없습니다.',
        suggestedAction: '임금대장을 업로드하세요.',
      });
      result.isValid = false;
      return result;
    }

    // 동명이인 보존: 이름 → 인원수 카운트
    const wageNameCounts = new Map<string, number>();
    for (const e of wageLedger.employees) {
      const key = this.normalizeEmployeeName(e.name);
      wageNameCounts.set(key, (wageNameCounts.get(key) || 0) + 1);
    }

    if (insuranceList?.employees) {
      const insNameCounts = new Map<string, number>();
      for (const e of insuranceList.employees) {
        const key = this.normalizeEmployeeName(e.name);
        insNameCounts.set(key, (insNameCounts.get(key) || 0) + 1);
      }

      // 매칭된 직원 (양쪽 모두 존재)
      for (const [name, wageCount] of wageNameCounts) {
        const insCount = insNameCounts.get(name) || 0;
        const matchedCount = Math.min(wageCount, insCount);

        for (let i = 0; i < matchedCount; i++) {
          result.matchedEmployees.push(name);
        }
        for (let i = 0; i < wageCount - matchedCount; i++) {
          result.unmatchedFromWageLedger.push(name);
        }
      }

      // 보험명부에만 있는 직원
      for (const [name, insCount] of insNameCounts) {
        const wageCount = wageNameCounts.get(name) || 0;
        const extra = insCount - wageCount;
        for (let i = 0; i < extra; i++) {
          result.unmatchedFromInsurance.push(name);
        }
      }

      if (result.unmatchedFromWageLedger.length > 0) {
        result.warnings.push({
          field: '직원명부',
          documentType: 'WAGE_LEDGER',
          severity: 'MEDIUM',
          message: `임금대장에는 있지만 보험명부에 없는 직원이 ${result.unmatchedFromWageLedger.length}명 있습니다.`,
          suggestedAction: '4대보험 미가입자일 수 있습니다. 확인이 필요합니다.',
        });
      }

      if (result.unmatchedFromInsurance.length > 0) {
        result.warnings.push({
          field: '직원명부',
          documentType: 'INSURANCE_LIST',
          severity: 'LOW',
          message: `보험명부에는 있지만 임금대장에 없는 직원이 ${result.unmatchedFromInsurance.length}명 있습니다.`,
          suggestedAction: '퇴사자이거나 임금대장 기간이 다를 수 있습니다.',
        });
      }
    }

    return result;
  }

  /**
   * 감원방지의무 경고 검증
   * 보험명부에서 인위적 감원(권고사직, 해고, 정리해고) 여부를 확인합니다.
   */
  validateReductionPrevention(
    insuranceList: InsuranceListData | undefined,
    wageLedger: WageLedgerData | undefined
  ): DataQualityWarning[] {
    const warnings: DataQualityWarning[] = [];

    if (!insuranceList?.employees) return warnings;

    // 인위적 감원 사유코드: 23(권고사직), 26(해고), 31(정리해고)
    const INVOLUNTARY_CODES = ['23', '26', '31'];
    const REASON_LABELS: Record<string, string> = {
      '23': '권고사직',
      '26': '해고',
      '31': '정리해고',
    };

    const involuntaryTerminations = insuranceList.employees.filter(emp =>
      emp.isCurrentEmployee === false &&
      emp.lossReasonCode &&
      INVOLUNTARY_CODES.includes(emp.lossReasonCode)
    );

    if (involuntaryTerminations.length > 0) {
      const details = involuntaryTerminations.map(emp => {
        const reason = REASON_LABELS[emp.lossReasonCode!] || emp.lossReasonCode;
        return `${emp.name}(${emp.lossDate || '날짜미상'}, ${reason})`;
      });

      warnings.push({
        field: '감원방지의무',
        documentType: 'INSURANCE_LIST',
        severity: 'HIGH',
        message: `인위적 감원(권고사직/해고/정리해고) ${involuntaryTerminations.length}건 발견: ${details.join(', ')}. 감원방지의무 위반 시 지원금 환수 및 참여 제한이 있을 수 있습니다.`,
        suggestedAction: '감원 사유와 시점을 확인하고, 지원금 신청 대상 직원의 채용일 기준 3개월 전~1년 후 기간에 해당하는지 점검하세요.',
      });
    }

    // 다월 급여대장 퇴사자 감지 경고
    if (wageLedger?.employees) {
      const terminatedFromWage = wageLedger.employees.filter(emp =>
        emp.isCurrentEmployee === false
      );
      if (terminatedFromWage.length > 0) {
        const names = terminatedFromWage.map(emp => emp.name).slice(0, 5);
        const suffix = terminatedFromWage.length > 5 ? ` 외 ${terminatedFromWage.length - 5}명` : '';
        warnings.push({
          field: '퇴사자 감지',
          documentType: 'WAGE_LEDGER',
          severity: 'MEDIUM',
          message: `급여대장 비교 결과 퇴사 추정 직원 ${terminatedFromWage.length}명: ${names.join(', ')}${suffix}. 해당 직원은 지원금 계산에서 제외됩니다.`,
          suggestedAction: '퇴사자 정보가 정확한지 확인하세요. 급여대장 기간이 다른 경우 실제 퇴사가 아닐 수 있습니다.',
        });
      }
    }

    return warnings;
  }

  /**
   * 전체 교차 검증 수행
   */
  performFullCrossValidation(
    wageLedger: WageLedgerData | undefined,
    insuranceList: InsuranceListData | undefined,
    contracts: EmploymentContractData[] | undefined
  ): {
    warnings: DataQualityWarning[];
    inconsistencies: DataInconsistency[];
    overallConfidence: number;
  } {
    const allWarnings: DataQualityWarning[] = [];
    const allInconsistencies: DataInconsistency[] = [];

    // 1. 급여 일치성 검증
    const wageInconsistencies = this.validateWageConsistency(wageLedger, contracts);
    allInconsistencies.push(...wageInconsistencies);

    // 2. 날짜 일치성 검증
    const dateInconsistencies = this.validateDateConsistency(wageLedger, insuranceList, contracts);
    allInconsistencies.push(...dateInconsistencies);

    // 3. 최저임금 검증
    const minimumWageWarnings = this.validateMinimumWageCompliance(wageLedger);
    allWarnings.push(...minimumWageWarnings);

    // 4. 직원 명부 일치성 검증
    const listValidation = this.validateEmployeeListConsistency(wageLedger, insuranceList);
    allWarnings.push(...listValidation.warnings);
    allInconsistencies.push(...listValidation.inconsistencies);

    // 5. 감원방지의무 검증
    const reductionWarnings = this.validateReductionPrevention(insuranceList, wageLedger);
    allWarnings.push(...reductionWarnings);

    // 불일치 사항을 경고로 변환
    for (const inconsistency of allInconsistencies) {
      allWarnings.push({
        field: inconsistency.field,
        documentType: 'CROSS_VALIDATION',
        severity: inconsistency.severity,
        message: inconsistency.message,
        suggestedAction: '문서 간 데이터를 확인하고 일치시키세요.',
      });
    }

    // 전체 신뢰도 계산
    let confidencePenalty = 0;
    for (const warning of allWarnings) {
      switch (warning.severity) {
        case 'HIGH':
          confidencePenalty += 15;
          break;
        case 'MEDIUM':
          confidencePenalty += 8;
          break;
        case 'LOW':
          confidencePenalty += 3;
          break;
      }
    }

    const overallConfidence = Math.max(0, 100 - confidencePenalty);

    return {
      warnings: allWarnings,
      inconsistencies: allInconsistencies,
      overallConfidence,
    };
  }
}

export const crossValidationService = new CrossValidationService();
