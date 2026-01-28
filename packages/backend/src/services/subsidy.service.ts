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
  detectNonCapitalRegionType,
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
        '════════════════════════════════════════════════════════════════',
        '📌 최대 지원금액 (모든 요건 충족 시)',
        '════════════════════════════════════════════════════════════════',
        '【기업 지원금】 청년 1인당 최대 720만원 (월 60만원 × 12개월)',
        '【청년 인센티브】 비수도권 한정, 청년 본인에게 직접 지급:',
        '  - 일반 비수도권: 최대 480만원 (6/12/18/24개월 시점 각 120만원)',
        '  - 우대지역 (44개): 최대 600만원 (각 150만원)',
        '  - 특별지역 (40개): 최대 720만원 (각 180만원)',
        '',
        '⚠️ 위 금액은 모든 자격요건과 사후관리 요건을 충족하는 경우에만',
        '   지급되며, 요건 미충족 시 지급 거절 또는 환수될 수 있습니다.',
        '',
        '════════════════════════════════════════════════════════════════',
        '✅ 자격요건 (사전 요건)',
        '════════════════════════════════════════════════════════════════',
        '【기업 요건】',
        '  • 고용보험 성립 사업장',
        '  • 기준 피보험자 수 5인 이상 (특례: 지식서비스·정보통신업 등은 5인 미만 가능)',
        '  • 업력 1년 이상 시: 직전 과세연도 매출액 ≥ 기준 피보험자 수 × 1,900만원',
        '  • 수도권 중견기업 참여 불가 (단, 비수도권 산업단지 입주 중견기업은 가능)',
        '',
        '【청년 요건】',
        '  • 만 15세 이상 ~ 만 34세 이하 (군필자는 복무기간만큼 연장, 최대 만 39세)',
        '  • 정규직 채용 (주 30시간 이상 근로)',
        '  • 4대보험 가입',
        '',
        '【수도권 지역 추가 요건】 취업애로청년 10가지 유형 중 하나 충족 필수:',
        '  1. 6개월 이상 실업 상태',
        '  2. 고졸 이하 학력 (대학 중퇴 포함)',
        '  3. 국민취업지원제도 수료자',
        '  4. 청년도전지원사업 수료자',
        '  5. 고용촉진장려금 대상 취업취약계층',
        '  6. 국민기초생활보장법상 수급자',
        '  7. 북한이탈주민',
        '  8. 결혼이민자',
        '  9. 보호대상 청소년',
        '  10. 가정위탁 청소년',
        '',
        '【비수도권 지역】 모든 청년 지원 가능 (취업애로 요건 불필요)',
        '  ※ 수도권 예외: 인천 강화군·옹진군, 경기 가평군·연천군은 비수도권 적용',
        '',
        '════════════════════════════════════════════════════════════════',
        '🚫 제한요건 (지원 제외 사유)',
        '════════════════════════════════════════════════════════════════',
        '【기업 제한】',
        '  • 채용일 직전 1개월간 고용조정(권고사직, 해고 등)을 한 경우',
        '  • 채용일 직전 1년간 임금체불 명단 공개 기업',
        '  • 산재사망사고 발생 기업 (24개월간 발생건수 2배 이상)',
        '  • 고용보험료 체납 기업',
        '  • 지원 한도: 기준 피보험자 수의 50% (최대 30명, 고용증가율 우수 시 2배)',
        '',
        '【청년 제한】',
        '  • 채용일 전날 기준 최종 이직 후 고용보험 미가입 기간 3개월 미만',
        '  • 사업주의 배우자, 직계 존비속',
        '  • 동일 사업주(계열사 포함)에서 이직 후 재입사한 경우',
        '  • 외국인 (단, 영주권자·결혼이민자 제외)',
        '',
        '════════════════════════════════════════════════════════════════',
        '📋 사후관리 요건 (지급 후 필수 준수사항)',
        '════════════════════════════════════════════════════════════════',
        '【고용유지 의무】',
        '  • 최소 6개월 이상 계속 고용 (신청 시점 기준)',
        '  • 12개월 고용유지 시 전액 지급',
        '',
        '【고용조정 금지 기간】 ⚠️ 매우 중요',
        '  • 기간: 채용일 3개월 전 ~ 정규직 채용 후 1년',
        '  • 금지 행위: 권고사직, 해고, 계약 해지, 정리해고 등',
        '  • 위반 시: 기지급 장려금 전액 환수 + 향후 3년간 참여 제한',
        '',
        '【기타 사후 요건】',
        '  • 임금 체불 발생 시 지급 중단',
        '  • 허위 서류 제출 시 전액 환수 + 5년간 참여 제한',
        '  • 부정수급 적발 시 지급액의 최대 5배 제재부가금',
        '',
        '════════════════════════════════════════════════════════════════',
        '💡 실수하기 쉬운 포인트 & 팁',
        '════════════════════════════════════════════════════════════════',
        '【흔한 실수】',
        '  ❌ 채용 전 직원 권고사직 후 신규 채용 → 고용조정으로 지원 불가',
        '  ❌ 6개월 미만에 퇴사 → 지원금 전액 지급 불가',
        '  ❌ 수도권인데 취업애로청년 증빙 미제출 → 지원 거절',
        '  ❌ 청년 인센티브를 기업이 신청 → 청년 본인이 직접 신청해야 함',
        '',
        '【성공 팁】',
        '  ✅ 채용 전 3개월간 고용조정 이력 확인 필수',
        '  ✅ 매출액 증빙 미리 준비 (업력 1년 이상 시)',
        '  ✅ 청년에게 인센티브 신청 안내 (기업 지원금 1차 수령 후 가능)',
        '  ✅ 비수도권이라면 인구감소지역 여부 확인 (인센티브 차이 큼)',
        '  ✅ 신청 기한 준수: 지급 요건 충족 후 2개월 이내',
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
        '════════════════════════════════════════════════════════════════',
        '📌 최대 지원금액 (모든 요건 충족 시)',
        '════════════════════════════════════════════════════════════════',
        '【수도권】 분기 90만원 (월 30만원) × 12분기 = 최대 1,080만원/인',
        '【비수도권】 분기 120만원 (월 40만원) × 12분기 = 최대 1,440만원/인',
        '',
        '⚠️ 위 금액은 모든 자격요건과 사후관리 요건을 충족하는 경우에만',
        '   지급되며, 요건 미충족 시 지급 거절 또는 환수될 수 있습니다.',
        '',
        '════════════════════════════════════════════════════════════════',
        '✅ 자격요건 (사전 요건)',
        '════════════════════════════════════════════════════════════════',
        '【기업 요건】',
        '  • 정년제도 1년 이상 운영 (취업규칙/단체협약에 명시)',
        '  • 60세 이상 피보험자 비율 30% 이하',
        '  • 지원 한도: 피보험자 수 평균의 30%와 30명 중 작은 수',
        '',
        '【제도 요건】 아래 중 택1:',
        '  • 정년 연장: 기존 정년보다 1년 이상 연장',
        '  • 정년 폐지: 정년 제도 완전 폐지',
        '  • 재고용: 정년 퇴직 후 6개월 이내, 1년 이상 재고용 계약',
        '',
        '【근로자 요건 (2026년 강화)】',
        '  • 월평균 보수 124만원 이상',
        '  • 정년 도달일까지 해당 사업장 피보험자격 취득기간 2년 이상',
        '',
        '════════════════════════════════════════════════════════════════',
        '📋 사후관리 요건 (위반 시 환수)',
        '════════════════════════════════════════════════════════════════',
        '【계속고용 유지 의무】',
        '  • 3년간 계속 고용 유지 (정년 폐지/연장의 경우)',
        '  • 재고용: 계약 기간 동안 고용 유지',
        '',
        '【고용조정 제한】',
        '  • 지원 기간 중 대상 근로자 권고사직/해고 금지',
        '  • 위반 시: 기지급 장려금 환수',
        '',
        '════════════════════════════════════════════════════════════════',
        '💡 실수하기 쉬운 포인트',
        '════════════════════════════════════════════════════════════════',
        '❌ 정년제도 미운영 사업장 → 1년 이상 정년제도 운영 필수',
        '❌ 재고용 시 일부 근로자만 선별 → 희망자 전원 일률 재고용 필요',
        '❌ 60세 이상 비율 30% 초과 → 지원 불가',
        '❌ 분기 마감 후 1년 초과 신청 → 해당 분기 지급 불가',
        '',
        '✅ 성공 팁:',
        '  • 정년제도 변경 전 노사협의 및 취업규칙 변경 먼저 완료',
        '  • 비수도권 사업장은 분기당 30만원 더 수령 가능',
        '  • 분기별 신청 기한 엄수 (분기 종료 후 1년 이내)',
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
        details: '10가지 유형 중 하나 충족 필수: 6개월+ 실업, 고졸 이하, 국취제/청년도전 수료, 취약계층, 수급자, 북한이탈, 결혼이민, 보호대상/가정위탁 청소년',
      });
      notes.push('');
      notes.push('【수도권 추가 요건】 취업애로청년 10가지 유형 중 하나 충족 필수');
      notes.push('  1) 6개월 이상 실업  2) 고졸 이하  3) 국취제 수료  4) 청년도전 수료');
      notes.push('  5) 취업취약계층  6) 기초생활수급자  7) 북한이탈주민  8) 결혼이민자');
      notes.push('  9) 보호대상 청소년  10) 가정위탁 청소년');
    }

    const effectiveYouthCount = youthCount > 0 ? youthCount : (unknownAgeCount > 0 ? data.wageLedger?.employees.length || 1 : 0);

    const eligibility: EligibilityStatus =
      youthCount > 0 && requirementsNotMet.length === 0 ? 'ELIGIBLE' :
      (youthCount > 0 || unknownAgeCount > 0) && requirementsNotMet.length <= 1 ? 'NEEDS_REVIEW' : 'NOT_ELIGIBLE';

    const monthlyAmount = 600000;
    const totalMonths = 12;
    const companySubsidy = monthlyAmount * effectiveYouthCount * totalMonths;

    let youthIncentive = 0;
    const detectedNonCapitalType = detectNonCapitalRegionType(data.businessRegistration?.businessAddress);
    const effectiveNonCapitalType = nonCapitalRegionType !== 'GENERAL' ? nonCapitalRegionType : detectedNonCapitalType;

    if (regionType === 'NON_CAPITAL') {
      switch (effectiveNonCapitalType) {
        case 'SPECIAL':
          youthIncentive = 7200000;
          break;
        case 'PREFERRED':
          youthIncentive = 6000000;
          break;
        case 'GENERAL':
        default:
          youthIncentive = 4800000;
          break;
      }

      const regionLabel = effectiveNonCapitalType === 'SPECIAL' ? '특별지역 (40개 인구감소지역)' :
                          effectiveNonCapitalType === 'PREFERRED' ? '우대지역 (44개 인구감소지역)' : '일반 비수도권';
      const incentivePerPeriod = effectiveNonCapitalType === 'SPECIAL' ? 180 :
                                  effectiveNonCapitalType === 'PREFERRED' ? 150 : 120;
      
      notes.push('');
      notes.push('════════════════════════════════════════════════════════════════');
      notes.push('【비수도권 청년 장기근속 인센티브】 ※ 청년 본인에게 직접 지급');
      notes.push('════════════════════════════════════════════════════════════════');
      notes.push(`지역 유형: ${regionLabel}`);
      notes.push(`인센티브 총액: 최대 ${(youthIncentive / 10000).toLocaleString()}만원/인`);
      notes.push('');
      notes.push('📅 지급 일정 (2년간 4회 분할):');
      notes.push(`  • 6개월 근속 시: ${incentivePerPeriod}만원`);
      notes.push(`  • 12개월 근속 시: ${incentivePerPeriod}만원`);
      notes.push(`  • 18개월 근속 시: ${incentivePerPeriod}만원`);
      notes.push(`  • 24개월 근속 시: ${incentivePerPeriod}만원`);
      notes.push('');
      notes.push('⚠️ 인센티브 신청 조건:');
      notes.push('  • 기업 지원금 1회차 수령 완료 후 청년 본인이 직접 신청');
      notes.push('  • 신청 사이트: 고용24 (www.work24.go.kr)');
      notes.push('  • 각 시점 도달 후 2개월 이내 신청 필수');
    }

    notes.push('');
    notes.push('════════════════════════════════════════════════════════════════');
    notes.push('⚠️ 최대 지원금 조건 안내');
    notes.push('════════════════════════════════════════════════════════════════');
    const maxCompanyAmount = (companySubsidy / 10000).toLocaleString();
    const maxIncentiveAmount = regionType === 'NON_CAPITAL' ? (youthIncentive * effectiveYouthCount / 10000).toLocaleString() : '0';
    notes.push(`【기업 지원금】 최대 ${maxCompanyAmount}만원 (${effectiveYouthCount}명 × 720만원)`);
    if (regionType === 'NON_CAPITAL') {
      notes.push(`【청년 인센티브】 최대 ${maxIncentiveAmount}만원 (${effectiveYouthCount}명 × ${(youthIncentive / 10000).toLocaleString()}만원)`);
    }
    notes.push('');
    notes.push('🚨 위 금액은 아래 모든 요건을 충족하는 경우에만 지급됩니다:');
    notes.push('  ✓ 12개월 계속 고용 유지');
    notes.push('  ✓ 채용일 3개월 전 ~ 후 1년간 고용조정 없음');
    notes.push('  ✓ 임금 체불 없음');
    notes.push('  ✓ 지급 요건 충족 후 2개월 이내 신청');

    notes.push('');
    notes.push('════════════════════════════════════════════════════════════════');
    notes.push('📋 사후관리 요건 (위반 시 환수)');
    notes.push('════════════════════════════════════════════════════════════════');
    notes.push('【고용조정 금지 기간】');
    notes.push('  • 채용일 3개월 전 ~ 정규직 채용 후 1년');
    notes.push('  • 위반 행위: 권고사직, 해고, 계약해지, 정리해고 등');
    notes.push('  • 위반 시 제재: 기지급 장려금 전액 환수 + 3년간 참여 제한');
    notes.push('');
    notes.push('【부정수급 제재】');
    notes.push('  • 허위 서류 제출: 전액 환수 + 5년간 참여 제한');
    notes.push('  • 고의 부정수급: 지급액의 최대 5배 제재부가금');

    notes.push('');
    notes.push('════════════════════════════════════════════════════════════════');
    notes.push('💡 실수하기 쉬운 포인트');
    notes.push('════════════════════════════════════════════════════════════════');
    notes.push('❌ 채용 전 기존 직원 권고사직 → 고용조정으로 지원 불가');
    notes.push('❌ 6개월 미만 퇴사 → 장려금 지급 불가');
    notes.push('❌ 신청 기한 초과 (요건 충족 후 2개월) → 지급 불가');
    if (regionType === 'CAPITAL') {
      notes.push('❌ 취업애로청년 증빙 미제출 → 수도권 지원 불가');
    }
    if (regionType === 'NON_CAPITAL') {
      notes.push('❌ 청년 인센티브를 기업이 신청 → 청년 본인이 직접 신청해야 함');
    }

    return {
      program: SubsidyProgram.YOUTH_JOB_LEAP,
      monthlyAmount: monthlyAmount * effectiveYouthCount,
      totalMonths,
      totalAmount: companySubsidy,
      requirementsMet,
      requirementsNotMet,
      eligibility,
      notes,
      regionType,
      incentiveAmount: youthIncentive * effectiveYouthCount,
    };
  }

  calculateEmploymentPromotion(data: ExtractedData): SubsidyCalculation {
    const requirementsMet: SubsidyRequirement[] = [];
    const requirementsNotMet: SubsidyRequirement[] = [];
    const notes: string[] = [];

    // 2026년 기준: 채용 시점에 따라 최저보수 기준 다름
    const MINIMUM_WAGE_124_PERCENT_2026 = 1240000; // 2026.1.1 이후 채용자
    const MINIMUM_WAGE_121_PERCENT_2025 = 1210000; // 2025.12.31 이전 채용자

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

        // 채용 시점에 따라 최저보수 기준 다르게 적용
        const hireDate = emp.hireDate ? new Date(emp.hireDate) : null;
        const is2026OrLaterHire = hireDate && hireDate >= new Date('2026-01-01');
        const minimumWageThreshold = is2026OrLaterHire
          ? MINIMUM_WAGE_124_PERCENT_2026
          : MINIMUM_WAGE_121_PERCENT_2025;

        // 정년까지 2년 미만인 근로자 제외 여부는 별도 확인 필요 (생년월일 정보 필요)

        if (monthlySalary >= minimumWageThreshold) {
          eligibleEmployeeCount++;
        } else if (monthlySalary > 0 && monthlySalary < minimumWageThreshold) {
          ineligibleDueToWageCount++;
        }
      }

      if (ineligibleDueToWageCount > 0) {
        requirementsNotMet.push({
          id: 'minimum_wage_check',
          description: `월 보수 기준 미달 근로자 ${ineligibleDueToWageCount}명 제외`,
          isMet: false,
          details: `2026.1.1 이후 채용: 124만원 이상 / 2025.12.31 이전 채용: 121만원 이상`,
        });
      }

      if (eligibleEmployeeCount > 0) {
        requirementsMet.push({
          id: 'wage_eligible',
          description: `최저보수 기준 충족 근로자 ${eligibleEmployeeCount}명 확인`,
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

    notes.push('');
    notes.push('【고용촉진장려금 안내 (2026년 기준)】');
    notes.push('');
    notes.push('□ 지원금액: 월 30~60만원 (취약계층 유형별 차등)');
    notes.push('  - 중증장애인: 월 60만원');
    notes.push('  - 일반 취업취약계층: 월 30만원');
    notes.push('');
    notes.push('□ 지원기간: 1년 (6개월 단위 신청)');
    notes.push('  ※ 기초생활수급자, 중증장애인, 여성가장은 최대 2년');
    notes.push('');
    notes.push('□ 월평균 보수 기준:');
    notes.push('  - 2026.1.1 이후 채용자: 124만원 이상');
    notes.push('  - 2025.12.31 이전 채용자: 121만원 이상');
    notes.push('');
    notes.push('□ 제외 대상:');
    notes.push('  - 정년까지 2년 미만인 근로자');
    notes.push('  - 근로계약 기간을 정한 근로자');
    notes.push('');
    notes.push('□ 취업취약계층 해당 여부 별도 확인 필요');
    notes.push('  (장애인, 고령자60세+, 경력단절여성, 장기실업자 등)');

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

    // 피보험자 수 5인 이상 ~ 30인 미만 확인
    const employeeCount = data.insuranceList?.employees.length || data.wageLedger?.employees.length || 0;
    if (employeeCount >= 5 && employeeCount < 30) {
      requirementsMet.push({
        id: 'employee_count',
        description: `피보험자 수 5인 이상 30인 미만 확인 (현재 ${employeeCount}명)`,
        isMet: true,
      });
    } else if (employeeCount < 5 && employeeCount > 0) {
      requirementsNotMet.push({
        id: 'employee_count',
        description: `피보험자 수 5인 미만 (현재 ${employeeCount}명) - 지원 대상 아님`,
        isMet: false,
        details: '5인 미만 사업장은 정규직 전환 지원 대상에서 제외됩니다',
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
        description: '피보험자 수 확인 필요 (5인 이상 30인 미만 기업만 지원)',
        isMet: false,
      });
    }

    // 월평균 보수 124만원 이상 확인
    const MINIMUM_WAGE_124_PERCENT = 1240000;
    let eligibleForWageCount = 0;
    let ineligibleForWageCount = 0;

    if (data.wageLedger?.employees) {
      for (const emp of data.wageLedger.employees) {
        const monthlySalary = emp.monthlyWage || 0;
        if (monthlySalary >= MINIMUM_WAGE_124_PERCENT) {
          eligibleForWageCount++;
        } else if (monthlySalary > 0) {
          ineligibleForWageCount++;
        }
      }

      if (ineligibleForWageCount > 0) {
        requirementsNotMet.push({
          id: 'minimum_wage_check',
          description: `월평균 보수 124만원 미만 근로자 ${ineligibleForWageCount}명 제외`,
          isMet: false,
          details: '월평균 보수 124만원 미만 근로자는 지원 대상에서 제외',
        });
      }
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
    notes.push('□ 지원 대상: 피보험자 수 5인 이상 ~ 30인 미만 기업');
    notes.push('  ※ 5인 미만 사업장은 지원 대상에서 제외');
    notes.push('□ 전환 대상: 6개월 이상 근무한 기간제·파견·사내하도급 근로자');
    notes.push('');
    notes.push('□ 지원 금액:');
    notes.push('  - 기본: 월 40만원 (전환 근로자 1인당)');
    notes.push('  - 임금 인상 시: 월 60만원 (전환 후 월평균 임금 20만원 이상 인상)');
    notes.push('');
    notes.push('□ 지원 기간: 최대 1년 (3개월 단위 신청)');
    notes.push(`□ 지원 한도: 피보험자 수의 30% (현재 기준 최대 ${supportLimit}명)`);
    notes.push('  ※ 5인 이상~10인 미만: 3명까지 지원');
    notes.push('');
    notes.push('□ 제외 대상:');
    notes.push('  - 월평균 보수 124만원 미만 근로자');
    notes.push('  - 사업주의 배우자, 직계 존·비속');
    notes.push('  - 외국인 (F2, F5, F6 제외)');
    notes.push('');
    notes.push('※ 사업 참여 승인 후 6개월 이내 전환 이행 필요');
    notes.push('※ 전환 후 최저임금 이상 지급 및 고용보험 가입 필수');

    // 5인 미만 또는 30인 이상이면 지원 불가
    const eligibility: EligibilityStatus =
      (employeeCount > 0 && employeeCount < 5) || employeeCount >= 30 ? 'NOT_ELIGIBLE' :
      requirementsNotMet.filter(r => r.id !== 'minimum_wage_check').length <= 2 ? 'NEEDS_REVIEW' : 'NOT_ELIGIBLE';

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
      isPregnant?: boolean; // 임신 중 여부 추가
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
    const isPregnant = options?.isPregnant ?? false;

    // 특례 조건: 만12개월 이내 자녀 또는 임신 중, 3개월 이상 연속 휴직
    const isEligibleForSpecialRate =
      leaveType === 'PARENTAL_LEAVE' &&
      ((childAgeMonths !== undefined && childAgeMonths <= 12) || isPregnant) &&
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
        notes.push('【특례 적용】 만12개월 이내(임신중포함) 자녀, 3개월 이상 연속 휴직');
        notes.push('- 첫 3개월: 월 100만원 (소계 300만원)');
        notes.push('- 이후 9개월: 월 30만원 (소계 270만원)');
        notes.push(`총 지원금: ${(totalAmount / 10000).toLocaleString()}만원`);
      } else {
        monthlyAmount = 300000;
        totalAmount = monthlyAmount * 12;
        notes.push('제도 유형: 육아휴직');
        notes.push('기본 지원: 월 30만원 × 12개월 = 360만원');
        if (childAgeMonths === undefined && !isPregnant) {
          notes.push('※ 만12개월 이내(임신중포함) 자녀 대상 3개월 이상 연속 휴직 시 특례: 첫 3개월 월 100만원');
        } else if (childAgeMonths !== undefined && childAgeMonths > 12 && !isPregnant) {
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
    notes.push('- 육아기근로시간단축인센티브: 월 10만원 (사업장별 1~3번째 허용 시)');

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
