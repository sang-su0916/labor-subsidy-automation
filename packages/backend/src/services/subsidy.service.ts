import { v4 as uuidv4 } from 'uuid';
import {
  SubsidyProgram,
  SubsidyCalculation,
  SubsidyRequirement,
  EligibilityStatus,
  SubsidyReport,
  ChecklistItem,
  RegionType,
  NonCapitalRegionType,
  YouthType,
  SeniorProgramType,
  ParentalLeaveType,
  DuplicateExclusionRule,
  ExcludedSubsidy,
  SubsidyReportWithExclusions,
  ApplicationChecklistItem,
  SeniorSubsidyTimingRecommendation,
  EmployeeTurning60Info,
  MonthlyEligibilityInfo,
} from '../types/subsidy.types';
import {
  BusinessRegistrationData,
  WageLedgerData,
  EmploymentContractData,
  InsuranceListData,
  EmployeeData,
} from '../types/document.types';
import { 
  detectRegionType, 
  getBirthInfoFromResidentNumber, 
  calculateAge60Date,
  calculateEmploymentDurationMonths,
  calculateApplicationEligibleDate,
  formatDateKorean,
} from '../utils/korean.utils';

interface ExtractedData {
  businessRegistration?: BusinessRegistrationData;
  wageLedger?: WageLedgerData;
  employmentContract?: EmploymentContractData;
  insuranceList?: InsuranceListData;
}

export class SubsidyService {
  private readonly DUPLICATE_EXCLUSION_RULES: DuplicateExclusionRule[] = [
    {
      program1: SubsidyProgram.YOUTH_JOB_LEAP,
      program2: SubsidyProgram.EMPLOYMENT_PROMOTION,
      reason: '동일 근로자에 대해 청년일자리도약장려금과 고용촉진장려금 중복 수급 불가',
      priority: SubsidyProgram.YOUTH_JOB_LEAP,
    },
    {
      program1: SubsidyProgram.SENIOR_CONTINUED_EMPLOYMENT,
      program2: SubsidyProgram.SENIOR_EMPLOYMENT_SUPPORT,
      reason: '동일 근로자에 대해 고령자계속고용장려금과 고령자고용지원금 중복 수급 불가',
      priority: SubsidyProgram.SENIOR_CONTINUED_EMPLOYMENT,
    },
  ];

  private readonly PROGRAM_NAMES: Record<SubsidyProgram, string> = {
    [SubsidyProgram.YOUTH_JOB_LEAP]: '청년일자리도약장려금',
    [SubsidyProgram.EMPLOYMENT_PROMOTION]: '고용촉진장려금',
    [SubsidyProgram.REGULAR_CONVERSION]: '정규직전환지원금',
    [SubsidyProgram.SENIOR_CONTINUED_EMPLOYMENT]: '고령자계속고용장려금',
    [SubsidyProgram.SENIOR_EMPLOYMENT_SUPPORT]: '고령자고용지원금',
    [SubsidyProgram.PARENTAL_EMPLOYMENT_STABILITY]: '출산육아기 고용안정장려금',
  };

  private readonly APPLICATION_INFO: Record<SubsidyProgram, Omit<ApplicationChecklistItem, 'program' | 'programName'>> = {
    [SubsidyProgram.YOUTH_JOB_LEAP]: {
      requiredDocuments: [
        '사업 참여 신청서',
        '사업주 확인서',
        '매출액 증빙자료 (업력 1년 이상 시)',
        '5인 미만 특례 입증서류 (해당 시)',
        '개인정보 수집·이용 동의서 (청년용)',
        '근로계약서 사본',
        '최종학력 자기확인서 (수도권 취업애로청년)',
      ],
      applicationSite: '고용24 (www.work24.go.kr) 온라인 신청',
      applicationPeriod: '채용 후 6개월 고용유지 후 신청, 지급 요건 충족 후 2개월 이내',
      contactInfo: '고용노동부 고객상담센터 1350, 운영기관 문의',
      notes: [
        '【기업 지원금】 청년 1인당 월 60만원 × 12개월 = 720만원',
        '【기업 한도】 기준 피보험자 수의 50% (최대 30명, 확대 시 2배)',
        '【수도권】 취업애로청년만 지원 (실업 4개월+, 고졸 이하, 국취제 수료자 등)',
        '【비수도권】 모든 청년 지원 가능, 중견기업(산업단지 입주) 참여 허용',
        '【청년 인센티브】 비수도권 장기근속 인센티브 (청년 본인 수령, 2년간 분할):',
        '  - 일반 비수도권: 총 480만원',
        '  - 우대지역: 총 600만원',
        '  - 특별지역: 총 720만원',
        '【사후 요건】 채용 전 3개월~후 1년간 고용조정 이직 금지 (위반 시 환수)',
      ],
    },
    [SubsidyProgram.EMPLOYMENT_PROMOTION]: {
      requiredDocuments: [
        '고용창출장려금(고용촉진장려금) 지급신청서 (서식 12)',
        '사업주확인서 (서식 23)',
        '취업취약계층 근로계약서 사본',
        '월별 임금대장 사본',
        '임금 지급 증명 서류 (계좌이체 내역 등)',
        '취업지원프로그램 이수증명서',
        '중증장애인 증명서류 (해당 시)',
        '여성가장 가족관계증명서 (해당 시)',
      ],
      applicationSite: '고용24 (www.work24.go.kr) 또는 사업장 관할 고용센터',
      applicationPeriod: '6개월 단위 신청 (1차: 채용 후 6개월, 2차: 추가 6개월 고용유지 시)',
      contactInfo: '고용노동부 고객상담센터 1350, 관할 고용센터 기업지원과',
      notes: [
        '【지급시기】 6개월 고용유지 후 신청, 심사 후 14일 이내 지급',
        '【취업취약계층】 장애인, 고령자(60세+), 경력단절여성, 장기실업자, 저소득층 등',
        '【프로그램 이수】 국민취업지원제도, 여성새로일하기센터, 취업성공패키지 이수자 지원',
        '【주의사항】 월평균 보수 121만원 미만 근로자 제외 (2026년 기준)',
        '【주의사항】 고용일 이전 2년 이내 구직등록 이력 필요',
        '【주의사항】 기간제 근로자, 일용직, 초단시간 근로자 제외',
      ],
    },
    [SubsidyProgram.REGULAR_CONVERSION]: {
      requiredDocuments: [
        '정규직 전환 지원 사업 참여 신청서',
        '사업주확인서',
        '전환 대상 근로자 명부',
        '전환 전 근로계약서 사본 (기간제/파견/사내하도급)',
        '전환 후 정규직 근로계약서 사본',
        '월별 임금대장 사본',
        '임금 지급 증빙 서류 (계좌이체 내역 등)',
        '고용보험 피보험자격 확인서',
      ],
      applicationSite: '고용24 (www.work24.go.kr) 또는 사업장 관할 고용센터',
      applicationPeriod: '사업 참여 승인 후 6개월 이내 정규직 전환 이행, 이행한 날이 속한 달의 다음달부터 12개월 이내 신청 (3개월 단위)',
      contactInfo: '고용노동부 고객상담센터 1350, 고용차별개선과 044-202-7578',
      notes: [
        '【지원대상】 피보험자 수 30인 미만 기업',
        '【전환대상】 6개월 이상 근무한 기간제·파견·사내하도급 근로자, 노무제공자',
        '【지원금액】 기본 월 40만원, 전환 후 임금 20만원 이상 인상 시 월 60만원',
        '【지원기간】 최대 1년 (3개월 단위 신청)',
        '【지원한도】 직전년도 말일 기준 피보험자 수의 30% (5인~10인 미만 사업장은 최대 3명)',
        '【필수요건】 전환 후 최저임금 이상 지급, 고용보험 가입',
        '【필수요건】 기존 정규직과 비교하여 임금 등에 불합리한 차별 없어야 함',
        '【주의사항】 이행기간 내 전환 미실시 시 참여 취소',
      ],
    },
    [SubsidyProgram.SENIOR_CONTINUED_EMPLOYMENT]: {
      requiredDocuments: [
        '고령자 계속고용장려금 지급신청서 (별지 제1호 서식)',
        '취업규칙 또는 단체협약 (정년제도 변경 전·후 비교)',
        '채용 시 근로계약서 사본',
        '재고용 시 근로계약서 사본 (재고용의 경우, 1년 이상 계약)',
        '고용보험 피보험자격 확인서',
        '60세 이상 근로자 명부',
        '정년제도 변경 증빙 (이사회 의사록, 노사협의서 등)',
      ],
      applicationSite: '고용24 (www.work24.go.kr) 또는 관할 지방고용노동청',
      applicationPeriod: '분기 단위 신청, 계속고용일이 속한 분기 마지막날 다음날부터 1년 이내',
      contactInfo: '고용노동부 고객상담센터 1350, 고령사회인력정책과 044-202-7463',
      notes: [
        '【지급시기】 분기별 지급, 심사 후 14일 이내 계좌 입금',
        '【지원금액】 수도권 월 30만원(분기 90만원), 비수도권 월 40만원(분기 120만원) × 최대 3년',
        '【총 지원액】 수도권 최대 1,080만원, 비수도권 최대 1,440만원',
        '【지원한도】 피보험자 수 평균의 30%와 30명 중 작은 수 (10인 미만 사업장 최대 3명)',
        '【제도요건】 정년연장(1년 이상), 정년폐지, 재고용(6개월 이내 1년 이상 계약) 중 택1',
        '【필수요건】 60세 이상 피보험자 비율 30% 이하',
        '【필수요건】 정년제도 운영 1년 이상 (취업규칙 등에 명시)',
        '【필수요건】 월평균 보수 124만원 이상인 근로자만 지원 대상 (2026년~)',
        '【필수요건】 정년 도달일까지 해당 사업장에서 피보험자격 취득기간 2년 이상 (2026년~)',
        '【주의사항】 재고용 시 모든 희망 근로자를 일률적으로 재고용해야 함',
      ],
    },
    [SubsidyProgram.SENIOR_EMPLOYMENT_SUPPORT]: {
      requiredDocuments: [
        '고령자 고용지원금 신청서 (별지 제2호 서식)',
        '60세 이상 근로자 명부 (피보험기간 1년 초과)',
        '월별 임금대장',
        '근로계약서 사본',
        '고용보험 피보험자격 확인서',
      ],
      applicationSite: '고용24 (www.work24.go.kr) 또는 사업장 관할 고용센터',
      applicationPeriod: '분기 단위 신청 (분기 마지막달 15일 전후 공고 확인 필수, 공고일부터 1년 이내)',
      contactInfo: '고용노동부 고객상담센터 1350, 고령사회인력정책과 044-202-7463',
      notes: [
        '【지급시기】 심사 결과 통보 후 14일 이내 계좌 입금',
        '【지원금액】 분기 30만원 × 최대 2년 (8분기, 최대 240만원)',
        '【지원한도】 피보험자 수 평균의 30%와 30명 중 작은 수 (10인 미만 사업장 최대 3명)',
        '【필수요건】 고용보험 성립일로부터 1년 이상 사업 운영',
        '【필수요건】 피보험기간 1년 초과 60세 이상 근로자 수가 기준기간 대비 증가',
        '【주의사항】 신청 기간을 놓치면 해당 분기 지원금 수령 불가',
        '【주의사항】 단순 신규채용이 아닌 고령자 고용 "증가"가 핵심 요건',
      ],
    },
    [SubsidyProgram.PARENTAL_EMPLOYMENT_STABILITY]: {
      requiredDocuments: [
        '출산육아기 고용안정장려금 지급신청서 (별지 제25호 서식)',
        '육아휴직/근로시간 단축 실시 증빙 (인사발령문)',
        '근로계약서 사본',
        '임금대장',
        '가족관계증명서 또는 주민등록등본 (자녀 확인용)',
        '대체인력 근로계약서 또는 파견 계약서 (대체인력지원금 신청 시)',
        '업무분담자 지정 및 수당 지급 증빙 (업무분담지원금 신청 시)',
      ],
      applicationSite: '고용24 (www.work24.go.kr) 또는 사업장 관할 고용센터',
      applicationPeriod: '시작 후 3개월 단위로 50% 신청, 종료 후 6개월 계속고용 시 잔여 50% 신청 (종료 후 12개월 이내)',
      contactInfo: '고용노동부 고객상담센터 1350',
      notes: [
        '【지급시기】 처리기간 14일, 심사 완료 후 지급',
        '【기본지원】 육아휴직지원금: 월 30만원 (만12개월 이내 자녀, 3개월 이상 연속 시 첫3개월 월 100만원)',
        '【기본지원】 육아기근로시간단축지원금: 월 30만원',
        '【추가지원】 대체인력지원금: 30인 미만 월 최대 140만원, 30인 이상 월 최대 130만원 (파견 포함)',
        '【추가지원】 육아기 단축 대체인력: 월 120만원',
        '【추가지원】 업무분담지원금: 30인 미만 월 최대 60만원, 30인 이상 월 최대 40만원',
        '【추가지원】 육아기 단축 업무분담: 월 최대 20만원',
        '【추가지원】 남성육아휴직인센티브: 월 10만원 (사업장별 1~3번째, 2026년 신규)',
        '【필수요건】 30일 이상 육아휴직/단축 허용, 우선지원대상기업(중소기업)',
        '【주의사항】 종료 후 6개월 이상 계속고용해야 잔여 50% 수령 가능',
      ],
    },
  };

  calculateYouthJobLeap(
    data: ExtractedData,
    regionType: RegionType = 'CAPITAL',
    nonCapitalRegionType: NonCapitalRegionType = 'GENERAL'
  ): SubsidyCalculation {
    const requirementsMet: SubsidyRequirement[] = [];
    const requirementsNotMet: SubsidyRequirement[] = [];
    const notes: string[] = [];

    const hasBusinessReg = !!data.businessRegistration;
    if (hasBusinessReg) {
      requirementsMet.push({
        id: 'business_reg',
        description: '사업자등록증 제출',
        isMet: true,
      });
    } else {
      requirementsNotMet.push({
        id: 'business_reg',
        description: '사업자등록증 제출 필요',
        isMet: false,
      });
    }

    const hasInsurance = data.insuranceList && data.insuranceList.employees.length > 0;
    if (hasInsurance) {
      const insuredEmployees = data.insuranceList!.employees.filter(e => e.employmentInsurance);
      if (insuredEmployees.length > 0) {
        requirementsMet.push({
          id: 'insurance',
          description: '4대보험 가입 확인',
          isMet: true,
          details: `${insuredEmployees.length}명 고용보험 가입`,
        });
      } else {
        requirementsNotMet.push({
          id: 'insurance',
          description: '고용보험 가입 필요',
          isMet: false,
        });
      }
    }

    // 청년(15~34세) 대상자 카운트
    const youthEmployees = data.wageLedger?.employees.filter(emp =>
      emp.calculatedAge !== undefined && emp.calculatedAge >= 15 && emp.calculatedAge <= 34
    ) || [];
    const youthCount = youthEmployees.length;

    // 나이 정보가 없는 직원 수 확인
    const unknownAgeCount = data.wageLedger?.employees.filter(emp =>
      emp.calculatedAge === undefined || emp.calculatedAge === null
    ).length || 0;

    const hasWageLedger = data.wageLedger && data.wageLedger.employees.length > 0;
    if (hasWageLedger) {
      requirementsMet.push({
        id: 'wage',
        description: '임금대장 확인',
        isMet: true,
        details: `${data.wageLedger!.employees.length}명 급여 기록`,
      });

      // 청년 대상자 정보 표시
      if (youthCount > 0) {
        notes.push(`※ 청년(15~34세) 대상자: ${youthCount}명`);
        for (const emp of youthEmployees) {
          notes.push(`  - ${emp.name} (${emp.calculatedAge}세)`);
        }
      } else if (unknownAgeCount > 0) {
        notes.push(`※ 청년 대상자: 확인 필요 (나이 미확인 ${unknownAgeCount}명)`);
        notes.push('※ 근로계약서의 주민번호로 나이 확인 필요');
      } else {
        notes.push('※ 청년(15~34세) 대상자: 0명');
      }

      const employeesWithHireDate = data.wageLedger!.employees.filter(e => e.hireDate);
      for (const emp of employeesWithHireDate) {
        const durationMonths = calculateEmploymentDurationMonths(emp.hireDate);
        if (durationMonths < 6) {
          const eligibleDate = calculateApplicationEligibleDate(emp.hireDate, 6);
          if (eligibleDate) {
            notes.push(`[${emp.name}] 신청 가능 시점: ${formatDateKorean(eligibleDate)} (입사 후 6개월)`);
          }
        }
      }
    }

    if (regionType === 'CAPITAL') {
      requirementsNotMet.push({
        id: 'youth_type',
        description: '수도권은 취업애로청년만 지원 가능',
        isMet: false,
        details: '6개월 이상 구직, 고졸 이하, 국민취업지원제도 수료자 등 취업애로 요건 충족 필수',
      });
      notes.push('【수도권】 취업애로청년만 지원 가능 (실업 4개월+, 고졸 이하, 국취제 수료자 등)');
    }

    // 청년 대상자가 있으면 해당 수로, 없고 나이 미확인 시 전체 수로, 그 외 0으로 계산
    const effectiveYouthCount = youthCount > 0 ? youthCount : (unknownAgeCount > 0 ? data.wageLedger?.employees.length || 1 : 0);

    const eligibility: EligibilityStatus =
      youthCount > 0 && requirementsNotMet.length === 0 ? 'ELIGIBLE' :
      (youthCount > 0 || unknownAgeCount > 0) && requirementsNotMet.length <= 1 ? 'NEEDS_REVIEW' : 'NOT_ELIGIBLE';

    // 기업 지원금: 월 60만원 × 12개월 = 720만원/인
    const monthlyAmount = 600000;
    const totalMonths = 12;
    const companySubsidy = monthlyAmount * effectiveYouthCount * totalMonths;

    // 청년 장기근속 인센티브 (비수도권 전용, 청년 본인에게 직접 지급)
    // 일반: 480만원, 우대지역: 600만원, 특별지역: 720만원
    let youthIncentive = 0;
    if (regionType === 'NON_CAPITAL') {
      switch (nonCapitalRegionType) {
        case 'SPECIAL':
          youthIncentive = 7200000; // 720만원
          break;
        case 'PREFERRED':
          youthIncentive = 6000000; // 600만원
          break;
        case 'GENERAL':
        default:
          youthIncentive = 4800000; // 480만원
          break;
      }

      const regionLabel = nonCapitalRegionType === 'SPECIAL' ? '특별지역' :
                          nonCapitalRegionType === 'PREFERRED' ? '우대지역' : '일반';
      notes.push('');
      notes.push('【비수도권 장기근속 인센티브 (청년 본인 수령)】');
      notes.push(`지역 유형: ${regionLabel}`);
      notes.push(`인센티브 금액: ${(youthIncentive / 10000).toLocaleString()}만원/인 (2년간 6개월 주기 분할 지급)`);
      notes.push('※ 기업 지원금 1회차 수령 후 청년이 직접 고용24에서 신청');
      notes.push('※ 6, 12, 18, 24개월 근속 시점마다 분할 지급');
    }

    // totalAmount는 기업 지원금만 표시 (인센티브는 청년에게 직접 지급되므로 별도 표기)
    return {
      program: SubsidyProgram.YOUTH_JOB_LEAP,
      monthlyAmount: monthlyAmount * effectiveYouthCount,
      totalMonths,
      totalAmount: companySubsidy, // 기업 지원금만
      requirementsMet,
      requirementsNotMet,
      eligibility,
      notes,
      regionType,
      incentiveAmount: youthIncentive * effectiveYouthCount, // 청년 인센티브 (참고용, 별도 지급)
    };
  }

  calculateEmploymentPromotion(data: ExtractedData): SubsidyCalculation {
    const requirementsMet: SubsidyRequirement[] = [];
    const requirementsNotMet: SubsidyRequirement[] = [];
    const notes: string[] = [];

    const MINIMUM_WAGE_121_PERCENT_2026 = 1210000;

    if (data.businessRegistration) {
      requirementsMet.push({
        id: 'business_reg',
        description: '사업자등록증 제출',
        isMet: true,
      });
    } else {
      requirementsNotMet.push({
        id: 'business_reg',
        description: '사업자등록증 제출 필요',
        isMet: false,
      });
    }

    if (data.employmentContract) {
      requirementsMet.push({
        id: 'contract',
        description: '근로계약서 확인',
        isMet: true,
      });
    }

    if (data.insuranceList) {
      requirementsMet.push({
        id: 'insurance',
        description: '고용보험 가입자 명부 확인',
        isMet: true,
      });
    }

    let eligibleEmployeeCount = 0;
    let ineligibleDueToWageCount = 0;
    
    if (data.wageLedger?.employees) {
      for (const emp of data.wageLedger.employees) {
        const monthlySalary = emp.monthlyWage || 0;
        if (monthlySalary >= MINIMUM_WAGE_121_PERCENT_2026) {
          eligibleEmployeeCount++;
        } else if (monthlySalary > 0) {
          ineligibleDueToWageCount++;
        }
      }
      
      if (ineligibleDueToWageCount > 0) {
        requirementsNotMet.push({
          id: 'minimum_wage_check',
          description: `월 보수 121만원 미만 근로자 ${ineligibleDueToWageCount}명 제외`,
          isMet: false,
          details: `2026년 기준 최저임금의 121% (월 121만원) 이상 지급 필요`,
        });
      }
      
      if (eligibleEmployeeCount > 0) {
        requirementsMet.push({
          id: 'wage_eligible',
          description: `월 보수 121만원 이상 근로자 ${eligibleEmployeeCount}명 확인`,
          isMet: true,
        });
      }
      
      const employeesWithHireDate = data.wageLedger.employees.filter(e => e.hireDate);
      for (const emp of employeesWithHireDate) {
        const durationMonths = calculateEmploymentDurationMonths(emp.hireDate);
        if (durationMonths < 6) {
          const eligibleDate = calculateApplicationEligibleDate(emp.hireDate, 6);
          if (eligibleDate) {
            notes.push(`[${emp.name}] 신청 가능 시점: ${formatDateKorean(eligibleDate)} (입사 후 6개월)`);
          }
        }
      }
    }

    notes.push('취업취약계층 해당 여부 별도 확인 필요');
    notes.push('장애인, 고령자(60세+), 경력단절여성, 장기실업자 등');
    notes.push(`2026년 기준: 월평균 보수 ${(MINIMUM_WAGE_121_PERCENT_2026 / 10000).toFixed(0)}만원 이상 근로자만 지원 대상`);

    const hasEligibleEmployees = eligibleEmployeeCount > 0 || !data.wageLedger?.employees;
    const eligibility: EligibilityStatus =
      requirementsNotMet.filter(r => r.id !== 'minimum_wage_check').length === 0 && hasEligibleEmployees
        ? 'NEEDS_REVIEW' 
        : 'NOT_ELIGIBLE';

    const effectiveEmployeeCount = eligibleEmployeeCount > 0 ? eligibleEmployeeCount : 1;

    return {
      program: SubsidyProgram.EMPLOYMENT_PROMOTION,
      monthlyAmount: 600000 * effectiveEmployeeCount,
      totalMonths: 12,
      totalAmount: 600000 * 12 * effectiveEmployeeCount,
      requirementsMet,
      requirementsNotMet,
      eligibility,
      notes,
    };
  }

  calculateRegularConversion(data: ExtractedData): SubsidyCalculation {
    const requirementsMet: SubsidyRequirement[] = [];
    const requirementsNotMet: SubsidyRequirement[] = [];
    const notes: string[] = [];

    // 사업자등록증 확인
    if (data.businessRegistration) {
      requirementsMet.push({
        id: 'business_reg',
        description: '사업자등록증 제출',
        isMet: true,
      });
    } else {
      requirementsNotMet.push({
        id: 'business_reg',
        description: '사업자등록증 제출 필요',
        isMet: false,
      });
    }

    // 피보험자 수 30인 미만 확인
    const employeeCount = data.insuranceList?.employees.length || data.wageLedger?.employees.length || 0;
    if (employeeCount > 0 && employeeCount < 30) {
      requirementsMet.push({
        id: 'employee_count',
        description: `피보험자 수 30인 미만 확인 (현재 ${employeeCount}명)`,
        isMet: true,
      });
    } else if (employeeCount >= 30) {
      requirementsNotMet.push({
        id: 'employee_count',
        description: `피보험자 수 30인 이상 (현재 ${employeeCount}명) - 지원 대상 아님`,
        isMet: false,
      });
    } else {
      requirementsNotMet.push({
        id: 'employee_count',
        description: '피보험자 수 확인 필요 (30인 미만 기업만 지원)',
        isMet: false,
      });
    }

    // 근로계약서 확인
    if (data.employmentContract) {
      requirementsMet.push({
        id: 'contract',
        description: '근로계약서 확인',
        isMet: true,
      });
    }

    // 전환 대상자 확인 필요
    requirementsNotMet.push({
      id: 'conversion_target',
      description: '정규직 전환 대상자 확인 필요',
      isMet: false,
      details: '6개월 이상 근무한 기간제·파견·사내하도급 근로자 또는 노무제공자',
    });

    // 지원 한도 계산
    const supportLimit = employeeCount > 0
      ? (employeeCount >= 5 && employeeCount < 10 ? 3 : Math.floor(employeeCount * 0.3))
      : 1;

    notes.push('【2026년 정규직 전환 지원 사업】');
    notes.push('');
    notes.push('□ 지원 대상: 피보험자 수 30인 미만 기업');
    notes.push('□ 전환 대상: 6개월 이상 근무한 기간제·파견·사내하도급 근로자');
    notes.push('');
    notes.push('□ 지원 금액:');
    notes.push('  - 기본: 월 40만원 (전환 근로자 1인당)');
    notes.push('  - 임금 인상 시: 월 60만원 (전환 후 월평균 임금 20만원 이상 인상)');
    notes.push('');
    notes.push('□ 지원 기간: 최대 1년 (3개월 단위 신청)');
    notes.push(`□ 지원 한도: 피보험자 수의 30% (현재 기준 최대 ${supportLimit}명)`);
    notes.push('');
    notes.push('※ 사업 참여 승인 후 6개월 이내 전환 이행 필요');
    notes.push('※ 전환 후 최저임금 이상 지급 및 고용보험 가입 필수');

    // 30인 이상이면 지원 불가
    const eligibility: EligibilityStatus =
      employeeCount >= 30 ? 'NOT_ELIGIBLE' :
      requirementsNotMet.length <= 2 ? 'NEEDS_REVIEW' : 'NOT_ELIGIBLE';

    // 기본 월 40만원으로 계산 (임금 인상 여부 미확인)
    const monthlyAmount = 400000;
    const totalMonths = 12;

    return {
      program: SubsidyProgram.REGULAR_CONVERSION,
      monthlyAmount: monthlyAmount * supportLimit,
      totalMonths,
      totalAmount: monthlyAmount * totalMonths * supportLimit,
      requirementsMet,
      requirementsNotMet,
      eligibility,
      notes,
    };
  }

  calculateSeniorContinuedEmployment(
    data: ExtractedData,
    regionType: RegionType = 'CAPITAL',
    programType: SeniorProgramType = 'RETIREMENT_EXTENSION'
  ): SubsidyCalculation {
    const requirementsMet: SubsidyRequirement[] = [];
    const requirementsNotMet: SubsidyRequirement[] = [];
    const notes: string[] = [];

    if (data.businessRegistration) {
      requirementsMet.push({
        id: 'business_reg',
        description: '사업자등록증 제출',
        isMet: true,
      });
    } else {
      requirementsNotMet.push({
        id: 'business_reg',
        description: '사업자등록증 제출 필요',
        isMet: false,
      });
    }

    requirementsNotMet.push({
      id: 'retirement_policy',
      description: '정년제도 도입 증빙 필요',
      isMet: false,
      details: '취업규칙, 단체협약 등 정년 연장/폐지/재고용 제도 도입 확인',
    });

    const programTypeLabels: Record<SeniorProgramType, string> = {
      RETIREMENT_EXTENSION: '정년 연장',
      RETIREMENT_ABOLITION: '정년 폐지',
      REEMPLOYMENT: '재고용',
    };
    notes.push(`제도 유형: ${programTypeLabels[programType]}`);
    
    // 2026년 기준: 수도권 월 30만원(분기 90만원), 비수도권 월 40만원(분기 120만원)
    const quarterlyAmount = regionType === 'NON_CAPITAL' ? 1200000 : 900000;
    const totalQuarters = 12; // 3년 = 12분기
    const maxTotalAmount = regionType === 'NON_CAPITAL' ? 14400000 : 10800000;
    
    if (regionType === 'NON_CAPITAL') {
      notes.push('2026년 비수도권: 분기 120만원 (월 40만원)');
      notes.push(`60세 이상 근로자 대상, 최대 3년간 지원 (총 ${(maxTotalAmount / 10000).toLocaleString()}만원)`);
    } else {
      notes.push('2026년 수도권: 분기 90만원 (월 30만원)');
      notes.push(`60세 이상 근로자 대상, 최대 3년간 지원 (총 ${(maxTotalAmount / 10000).toLocaleString()}만원)`);
    }
    notes.push('지원 한도: 피보험자 수 평균의 30%와 30명 중 작은 수');
    notes.push('');
    notes.push('【2026년 대상자 요건】');
    notes.push('- 월평균 보수 124만원 이상인 근로자만 지원 대상');
    notes.push('- 정년 도달일까지 해당 사업장에서 피보험자격 취득기간 2년 이상');

    // 60세 이상 직원만 카운트 (나이 정보가 있는 경우)
    // 2026년 기준: 월평균 보수 124만원 이상인 근로자만
    const MINIMUM_MONTHLY_WAGE_2026 = 1240000;
    const seniorEmployees = data.wageLedger?.employees.filter(emp =>
      emp.calculatedAge !== undefined && emp.calculatedAge >= 60 &&
      (emp.monthlyWage === undefined || emp.monthlyWage >= MINIMUM_MONTHLY_WAGE_2026)
    ) || [];
    const seniorCount = seniorEmployees.length;

    // 나이 정보가 없는 직원 수 확인
    const unknownAgeCount = data.wageLedger?.employees.filter(emp =>
      emp.calculatedAge === undefined || emp.calculatedAge === null
    ).length || 0;

    if (seniorCount === 0 && unknownAgeCount > 0) {
      notes.push(`※ 현재 60세 이상 대상자: 0명 (나이 미확인 ${unknownAgeCount}명)`);
      notes.push('※ 근로계약서의 주민번호로 나이 확인 필요');
    } else if (seniorCount === 0) {
      notes.push('※ 현재 60세 이상 대상자: 0명');
    } else {
      notes.push(`※ 60세 이상 대상자: ${seniorCount}명`);
      for (const emp of seniorEmployees) {
        notes.push(`  - ${emp.name} (${emp.calculatedAge}세)`);
      }
    }

    // 대상자가 0명이면 지원금도 0원
    const effectiveCount = seniorCount > 0 ? seniorCount : 0;

    return {
      program: SubsidyProgram.SENIOR_CONTINUED_EMPLOYMENT,
      monthlyAmount: 0, // 분기 단위 지급이므로 0
      totalMonths: 36,
      totalAmount: quarterlyAmount * totalQuarters * effectiveCount,
      requirementsMet,
      requirementsNotMet,
      eligibility: seniorCount > 0 ? 'NEEDS_REVIEW' : 'NOT_ELIGIBLE',
      notes,
      regionType,
      quarterlyAmount: quarterlyAmount * effectiveCount,
    };
  }

  calculateSeniorEmploymentSupport(data: ExtractedData): SubsidyCalculation {
    const requirementsMet: SubsidyRequirement[] = [];
    const requirementsNotMet: SubsidyRequirement[] = [];
    const notes: string[] = [];

    if (data.businessRegistration) {
      requirementsMet.push({
        id: 'business_reg',
        description: '사업자등록증 제출',
        isMet: true,
      });
    } else {
      requirementsNotMet.push({
        id: 'business_reg',
        description: '사업자등록증 제출 필요',
        isMet: false,
      });
    }

    if (data.insuranceList) {
      requirementsMet.push({
        id: 'insurance',
        description: '고용보험 가입자 명부 확인',
        isMet: true,
      });
    }

    notes.push('60세 이상 고령자 신규 채용 시 지원');
    notes.push('분기별 30만원, 최대 2년간 지원 (총 240만원)');

    // 60세 이상 직원만 카운트 (나이 정보가 있는 경우)
    const seniorEmployees = data.wageLedger?.employees.filter(emp =>
      emp.calculatedAge !== undefined && emp.calculatedAge >= 60
    ) || [];
    const seniorCount = seniorEmployees.length;

    // 나이 정보가 없는 직원 수 확인
    const unknownAgeCount = data.wageLedger?.employees.filter(emp =>
      emp.calculatedAge === undefined || emp.calculatedAge === null
    ).length || 0;

    if (seniorCount === 0 && unknownAgeCount > 0) {
      notes.push(`※ 현재 60세 이상 대상자: 0명 (나이 미확인 ${unknownAgeCount}명)`);
      notes.push('※ 근로계약서의 주민번호로 나이 확인 필요');
    } else if (seniorCount === 0) {
      notes.push('※ 현재 60세 이상 대상자: 0명');
    } else {
      notes.push(`※ 60세 이상 대상자: ${seniorCount}명`);
      for (const emp of seniorEmployees) {
        notes.push(`  - ${emp.name} (${emp.calculatedAge}세)`);
      }
    }

    // 대상자가 0명이면 지원금도 0원
    const effectiveCount = seniorCount > 0 ? seniorCount : 0;

    const eligibility: EligibilityStatus =
      requirementsNotMet.length === 0 && seniorCount > 0 ? 'NEEDS_REVIEW' : 'NOT_ELIGIBLE';

    const quarterlyAmount = 300000;
    const totalQuarters = 8;

    return {
      program: SubsidyProgram.SENIOR_EMPLOYMENT_SUPPORT,
      monthlyAmount: 0,
      totalMonths: 24,
      totalAmount: quarterlyAmount * totalQuarters * effectiveCount,
      requirementsMet,
      requirementsNotMet,
      eligibility,
      notes,
      quarterlyAmount: quarterlyAmount * effectiveCount,
    };
  }

  calculateParentalEmploymentStability(
    data: ExtractedData,
    leaveType: ParentalLeaveType = 'PARENTAL_LEAVE',
    options?: {
      childAgeMonths?: number;
      consecutiveLeaveMonths?: number;
    }
  ): SubsidyCalculation {
    const requirementsMet: SubsidyRequirement[] = [];
    const requirementsNotMet: SubsidyRequirement[] = [];
    const notes: string[] = [];

    if (data.businessRegistration) {
      requirementsMet.push({
        id: 'business_reg',
        description: '사업자등록증 제출',
        isMet: true,
      });
    } else {
      requirementsNotMet.push({
        id: 'business_reg',
        description: '사업자등록증 제출 필요',
        isMet: false,
      });
    }

    if (data.employmentContract) {
      requirementsMet.push({
        id: 'contract',
        description: '근로계약서 확인',
        isMet: true,
      });
    }

    requirementsNotMet.push({
      id: 'parental_leave_proof',
      description: '출산육아기 휴직/단축 증빙 필요',
      isMet: false,
      details: '육아휴직 신청서, 근로시간 단축 계약서 등',
    });

    const childAgeMonths = options?.childAgeMonths;
    const consecutiveLeaveMonths = options?.consecutiveLeaveMonths ?? 0;
    
    const isEligibleForSpecialRate = 
      leaveType === 'PARENTAL_LEAVE' && 
      childAgeMonths !== undefined && 
      childAgeMonths <= 12 && 
      consecutiveLeaveMonths >= 3;

    let totalAmount: number;
    let monthlyAmount: number;
    
    if (leaveType === 'PARENTAL_LEAVE') {
      if (isEligibleForSpecialRate) {
        const first3MonthsAmount = 1000000 * 3;
        const remaining9MonthsAmount = 300000 * 9;
        totalAmount = first3MonthsAmount + remaining9MonthsAmount;
        monthlyAmount = 300000;
        notes.push('제도 유형: 육아휴직');
        notes.push('【특례 적용】 만12개월 이내 자녀, 3개월 이상 연속 휴직');
        notes.push('- 첫 3개월: 월 100만원 (소계 300만원)');
        notes.push('- 이후 9개월: 월 30만원 (소계 270만원)');
        notes.push(`총 지원금: ${(totalAmount / 10000).toLocaleString()}만원`);
      } else {
        monthlyAmount = 300000;
        totalAmount = monthlyAmount * 12;
        notes.push('제도 유형: 육아휴직');
        notes.push('기본 지원: 월 30만원 × 12개월 = 360만원');
        if (childAgeMonths === undefined) {
          notes.push('※ 만12개월 이내 자녀 대상 3개월 이상 연속 휴직 시 특례: 첫 3개월 월 100만원');
        } else if (childAgeMonths > 12) {
          notes.push('※ 자녀 연령이 만12개월 초과하여 특례 미적용');
        } else if (consecutiveLeaveMonths < 3) {
          notes.push('※ 연속 휴직 기간이 3개월 미만으로 특례 미적용');
        }
      }
    } else if (leaveType === 'MATERNITY_LEAVE') {
      monthlyAmount = 800000;
      totalAmount = monthlyAmount * 3;
      notes.push('제도 유형: 출산전후휴가');
      notes.push('기본 지원: 월 80만원 × 3개월 = 240만원');
    } else {
      monthlyAmount = 300000;
      totalAmount = monthlyAmount * 24;
      notes.push('제도 유형: 육아기 근로시간 단축');
      notes.push('기본 지원: 월 30만원 × 24개월 = 720만원');
    }
    
    notes.push('');
    notes.push('추가 지원 (2026년 기준):');
    notes.push('- 대체인력지원금: 30인 미만 월 최대 140만원, 30인 이상 월 최대 130만원');
    notes.push('  (육아기 근로시간 단축 대체인력은 월 120만원 동일)');
    notes.push('- 업무분담지원금: 30인 미만 월 최대 60만원, 30인 이상 월 최대 40만원');
    notes.push('  (육아기 근로시간 단축 업무분담은 월 최대 20만원)');
    notes.push('- 남성육아휴직인센티브: 월 10만원 (사업장별 1~3번째 허용 시)');

    return {
      program: SubsidyProgram.PARENTAL_EMPLOYMENT_STABILITY,
      monthlyAmount,
      totalMonths: leaveType === 'PARENTAL_LEAVE' ? 12 : (leaveType === 'MATERNITY_LEAVE' ? 3 : 24),
      totalAmount,
      requirementsMet,
      requirementsNotMet,
      eligibility: 'NEEDS_REVIEW',
      notes,
    };
  }

  calculateAll(data: ExtractedData, programs: SubsidyProgram[], regionTypeOverride?: RegionType): SubsidyCalculation[] {
    const calculations: SubsidyCalculation[] = [];
    
    const regionType = regionTypeOverride || detectRegionType(data.businessRegistration?.businessAddress);

    for (const program of programs) {
      switch (program) {
        case SubsidyProgram.YOUTH_JOB_LEAP:
          calculations.push(this.calculateYouthJobLeap(data, regionType));
          break;
        case SubsidyProgram.EMPLOYMENT_PROMOTION:
          calculations.push(this.calculateEmploymentPromotion(data));
          break;
        case SubsidyProgram.REGULAR_CONVERSION:
          calculations.push(this.calculateRegularConversion(data));
          break;
        case SubsidyProgram.SENIOR_CONTINUED_EMPLOYMENT:
          calculations.push(this.calculateSeniorContinuedEmployment(data, regionType));
          break;
        case SubsidyProgram.SENIOR_EMPLOYMENT_SUPPORT:
          calculations.push(this.calculateSeniorEmploymentSupport(data));
          break;
        case SubsidyProgram.PARENTAL_EMPLOYMENT_STABILITY:
          calculations.push(this.calculateParentalEmploymentStability(data));
          break;
      }
    }

    return calculations;
  }

  generateReport(
    data: ExtractedData,
    calculations: SubsidyCalculation[]
  ): SubsidyReport {
    const checklist: ChecklistItem[] = [
      {
        id: '1',
        category: '기본 서류',
        item: '사업자등록증',
        status: data.businessRegistration ? 'COMPLETED' : 'MISSING',
      },
      {
        id: '2',
        category: '기본 서류',
        item: '임금대장',
        status: data.wageLedger ? 'COMPLETED' : 'MISSING',
      },
      {
        id: '3',
        category: '기본 서류',
        item: '근로계약서',
        status: data.employmentContract ? 'COMPLETED' : 'MISSING',
      },
      {
        id: '4',
        category: '기본 서류',
        item: '4대보험 가입자명부',
        status: data.insuranceList ? 'COMPLETED' : 'MISSING',
      },
    ];

    const requiredDocuments = checklist
      .filter(item => item.status === 'MISSING')
      .map(item => item.item);

    return {
      id: uuidv4(),
      generatedAt: new Date().toISOString(),
      businessInfo: {
        name: data.businessRegistration?.businessName || '미확인',
        registrationNumber: data.businessRegistration?.businessNumber || '미확인',
      },
      calculations,
      checklist,
      requiredDocuments,
    };
  }

  applyDuplicateExclusion(calculations: SubsidyCalculation[]): {
    eligible: SubsidyCalculation[];
    excluded: ExcludedSubsidy[];
  } {
    const eligiblePrograms = calculations.filter(
      c => c.eligibility === 'ELIGIBLE' || c.eligibility === 'NEEDS_REVIEW'
    );
    const excluded: ExcludedSubsidy[] = [];
    const eligibleSet = new Set(eligiblePrograms.map(c => c.program));

    for (const rule of this.DUPLICATE_EXCLUSION_RULES) {
      const hasProgram1 = eligibleSet.has(rule.program1);
      const hasProgram2 = eligibleSet.has(rule.program2);

      if (hasProgram1 && hasProgram2) {
        const programToExclude = rule.priority === rule.program1 ? rule.program2 : rule.program1;
        eligibleSet.delete(programToExclude);
        excluded.push({
          program: programToExclude,
          reason: rule.reason,
          excludedBy: rule.priority,
        });
      }
    }

    const eligible = eligiblePrograms.filter(c => eligibleSet.has(c.program));
    return { eligible, excluded };
  }

  generateApplicationChecklist(calculations: SubsidyCalculation[]): ApplicationChecklistItem[] {
    return calculations
      .filter(c => c.eligibility === 'ELIGIBLE' || c.eligibility === 'NEEDS_REVIEW')
      .map(c => ({
        program: c.program,
        programName: this.PROGRAM_NAMES[c.program],
        ...this.APPLICATION_INFO[c.program],
      }));
  }

  generateReportWithExclusions(
    data: ExtractedData,
    calculations: SubsidyCalculation[]
  ): SubsidyReportWithExclusions {
    const baseReport = this.generateReport(data, calculations);
    const { eligible, excluded } = this.applyDuplicateExclusion(calculations);
    const applicationChecklist = this.generateApplicationChecklist(eligible);
    const totalEligibleAmount = eligible.reduce((sum, c) => sum + c.totalAmount, 0);

    return {
      ...baseReport,
      eligibleCalculations: eligible,
      excludedSubsidies: excluded,
      totalEligibleAmount,
      applicationChecklist,
    };
  }

  getProgramName(program: SubsidyProgram): string {
    return this.PROGRAM_NAMES[program];
  }

  analyzeOptimalSeniorSubsidyTiming(
    data: ExtractedData,
    regionType?: RegionType
  ): SeniorSubsidyTimingRecommendation | null {
    const employees = data.wageLedger?.employees;
    if (!employees || employees.length === 0) return null;

    const detectedRegion = regionType || detectRegionType(data.businessRegistration?.businessAddress);
    const monthlyAmount = detectedRegion === 'NON_CAPITAL' ? 400000 : 300000;
    const quarterlyAmount = monthlyAmount * 3;

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();

    const employeeAgeInfo: {
      employee: EmployeeData;
      turns60Date: Date | null;
      currentAge: number | null;
    }[] = employees.map(emp => {
      const turns60Date = emp.residentRegistrationNumber 
        ? calculateAge60Date(emp.residentRegistrationNumber)
        : null;
      return {
        employee: emp,
        turns60Date,
        currentAge: emp.calculatedAge ?? null,
      };
    });

    const countEligibleAt = (date: Date): number => {
      return employeeAgeInfo.filter(info => {
        if (!info.turns60Date) return info.currentAge !== null && info.currentAge >= 60;
        return info.turns60Date <= date;
      }).length;
    };

    const calculateTotalForWindow = (startDate: Date): number => {
      let total = 0;
      for (let q = 0; q < 12; q++) {
        const quarterStart = new Date(startDate);
        quarterStart.setMonth(quarterStart.getMonth() + q * 3);
        const eligibleCount = countEligibleAt(quarterStart);
        total += eligibleCount * quarterlyAmount;
      }
      return total;
    };

    const currentEligibleCount = countEligibleAt(now);
    const currentTotalAmount = calculateTotalForWindow(now);

    let optimalStartDate = now;
    let optimalTotalAmount = currentTotalAmount;
    let optimalEligibleCount = currentEligibleCount;

    const monthlyTimeline: MonthlyEligibilityInfo[] = [];
    
    for (let monthOffset = 0; monthOffset <= 24; monthOffset++) {
      const checkDate = new Date(currentYear, currentMonth + monthOffset, 1);
      const eligibleCount = countEligibleAt(checkDate);
      const windowTotal = calculateTotalForWindow(checkDate);
      
      const monthStr = `${checkDate.getFullYear()}-${String(checkDate.getMonth() + 1).padStart(2, '0')}`;
      
      let cumulative = 0;
      for (let q = 0; q < Math.min(monthOffset / 3 + 1, 12); q++) {
        cumulative += eligibleCount * quarterlyAmount;
      }
      
      monthlyTimeline.push({
        month: monthStr,
        eligibleCount,
        quarterlyAmount: eligibleCount * quarterlyAmount,
        cumulativeAmount: windowTotal,
      });

      if (windowTotal > optimalTotalAmount) {
        optimalTotalAmount = windowTotal;
        optimalStartDate = checkDate;
        optimalEligibleCount = eligibleCount;
      }
    }

    const employeeTurning60Soon: EmployeeTurning60Info[] = employeeAgeInfo
      .filter(info => {
        if (!info.turns60Date) return false;
        const monthsUntil = (info.turns60Date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24 * 30);
        return monthsUntil > 0 && monthsUntil <= 36;
      })
      .map(info => ({
        name: info.employee.name,
        currentAge: info.currentAge ?? 0,
        turns60Date: info.turns60Date!.toISOString().split('T')[0],
        monthsUntil60: Math.ceil((info.turns60Date!.getTime() - now.getTime()) / (1000 * 60 * 60 * 24 * 30)),
      }))
      .sort((a, b) => a.monthsUntil60 - b.monthsUntil60);

    const additionalAmountIfWait = optimalTotalAmount - currentTotalAmount;
    const optimalEndDate = new Date(optimalStartDate);
    optimalEndDate.setMonth(optimalEndDate.getMonth() + 36);

    let recommendation: string;
    if (additionalAmountIfWait <= 0) {
      recommendation = `지금 신청하는 것이 최적입니다. 현재 60세 이상 ${currentEligibleCount}명 대상, 3년간 총 ${(currentTotalAmount / 10000).toLocaleString()}만원 수령 가능합니다.`;
    } else {
      const waitMonths = Math.ceil((optimalStartDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24 * 30));
      const additionalInManwon = Math.round(additionalAmountIfWait / 10000);
      recommendation = `${waitMonths}개월 후(${optimalStartDate.toISOString().split('T')[0]}) 신청을 권장합니다. ` +
        `${employeeTurning60Soon.length}명이 추가로 60세에 도달하여 총 ${optimalEligibleCount}명 대상이 됩니다. ` +
        `지금 신청 대비 ${additionalInManwon.toLocaleString()}만원 추가 수령 가능합니다.`;
    }

    return {
      optimalStartDate: optimalStartDate.toISOString().split('T')[0],
      optimalEndDate: optimalEndDate.toISOString().split('T')[0],
      currentEligibleCount,
      optimalEligibleCount,
      currentTotalAmount,
      optimalTotalAmount,
      additionalAmountIfWait,
      employeeTurning60Soon,
      recommendation,
      monthlyTimeline: monthlyTimeline.slice(0, 12),
    };
  }
}

export const subsidyService = new SubsidyService();
