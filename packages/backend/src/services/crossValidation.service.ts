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
    return name.replace(/\s+/g, '').replace(/[^가-힣a-zA-Z]/g, '').toLowerCase();
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

    // 임금대장 직원 맵 생성
    const wageMap = new Map<string, EmployeeData>();
    for (const emp of wageLedger.employees) {
      const key = this.normalizeEmployeeName(emp.name);
      wageMap.set(key, emp);
    }

    // 근로계약서와 비교
    for (const contract of contracts) {
      const key = this.normalizeEmployeeName(contract.employeeName);
      const wageEmployee = wageMap.get(key);

      if (wageEmployee) {
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

    // 임금대장 직원 맵 생성
    const wageMap = new Map<string, EmployeeData>();
    for (const emp of wageLedger.employees) {
      const key = this.normalizeEmployeeName(emp.name);
      wageMap.set(key, emp);
    }

    // 보험명부와 비교
    if (insuranceList?.employees) {
      for (const ins of insuranceList.employees) {
        const key = this.normalizeEmployeeName(ins.name);
        const wageEmployee = wageMap.get(key);

        if (wageEmployee && wageEmployee.hireDate && ins.enrollmentDate) {
          const hireDate = new Date(wageEmployee.hireDate);
          const enrollDate = new Date(ins.enrollmentDate);

          // 30일 이상 차이 시 경고
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
    }

    // 근로계약서와 비교
    if (contracts) {
      for (const contract of contracts) {
        const key = this.normalizeEmployeeName(contract.employeeName);
        const wageEmployee = wageMap.get(key);

        if (wageEmployee && wageEmployee.hireDate && contract.contractStartDate) {
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

    // 임금대장 직원 이름 정규화
    const wageNames = new Set(
      wageLedger.employees.map(e => this.normalizeEmployeeName(e.name))
    );

    if (insuranceList?.employees) {
      const insuranceNames = new Set(
        insuranceList.employees.map(e => this.normalizeEmployeeName(e.name))
      );

      // 매칭된 직원
      for (const name of wageNames) {
        if (insuranceNames.has(name)) {
          result.matchedEmployees.push(name);
        } else {
          result.unmatchedFromWageLedger.push(name);
        }
      }

      // 보험명부에만 있는 직원
      for (const name of insuranceNames) {
        if (!wageNames.has(name)) {
          result.unmatchedFromInsurance.push(name);
        }
      }

      // 불일치 경고
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
