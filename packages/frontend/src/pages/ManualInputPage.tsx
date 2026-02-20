import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, Button, Badge } from '../components/common';
import { downloadMcKinseyReport, McReportData, SubsidyCalculationData } from '../services/mcKinseyReportService';
import { downloadLaborAttorneyReport } from '../services/laborAttorneyReportService';
import { 
  LaborAttorneyReportData,
  ExtendedEmployeeInfo,
  BankAccountInfo,
  PROGRAM_DOCUMENT_CHECKLISTS,
  KOREAN_BANKS,
} from '../types/laborAttorney.types';
import { SubsidyProgram } from '../types/subsidy.types';
import EmployeeProgramMatrix from '../components/subsidy/EmployeeProgramMatrix';
import { 
  validateBusinessNumber, 
  formatBusinessNumber, 
  validateResidentNumber, 
  formatResidentNumber,
  extractBirthDateFromResidentNumber,
} from '../utils/validation';

interface Employee {
  id: string;
  name: string;
  birthDate: string;
  hireDate: string;
  monthlySalary: number;
  workType: 'FULL_TIME' | 'PART_TIME' | 'CONTRACT';
  hasEmploymentInsurance: boolean;
  hasNationalPension: boolean;
  hasHealthInsurance: boolean;
  residentRegistrationNumber?: string;
  position?: string;
  department?: string;
  employmentInsuranceEnrollmentDate?: string;
}

interface CompanyInfo {
  businessName: string;
  businessNumber: string;
  representativeName: string;
  businessAddress: string;
  openingDate: string;
  businessType: string;
  isSmallBusiness: boolean;
  region: 'CAPITAL' | 'NON_CAPITAL';
  employmentInsuranceNumber?: string;
  industryCode?: string;
}

const initialEmployee: Omit<Employee, 'id'> = {
  name: '',
  birthDate: '',
  hireDate: '',
  monthlySalary: 0,
  workType: 'FULL_TIME',
  hasEmploymentInsurance: true,
  hasNationalPension: true,
  hasHealthInsurance: true,
  residentRegistrationNumber: '',
  position: '',
  department: '',
  employmentInsuranceEnrollmentDate: '',
};

const initialCompanyInfo: CompanyInfo = {
  businessName: '',
  businessNumber: '',
  representativeName: '',
  businessAddress: '',
  openingDate: '',
  businessType: '',
  isSmallBusiness: true,
  region: 'CAPITAL',
  employmentInsuranceNumber: '',
  industryCode: '',
};

const initialBankAccount: BankAccountInfo = {
  bankName: '',
  accountNumber: '',
  accountHolderName: '',
  accountHolderType: 'BUSINESS',
};

function calculateAge(birthDate: string): number {
  const birth = new Date(birthDate);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  return age;
}

function getEmploymentMonths(hireDate: string): number {
  const hire = new Date(hireDate);
  const today = new Date();
  return (today.getFullYear() - hire.getFullYear()) * 12 + (today.getMonth() - hire.getMonth());
}

interface EligibilityResult {
  program: string;
  eligible: boolean | null;
  employees: number;
  totalAmount: number;
  amountPerPerson?: number;
  details?: string;
  reason?: string;
  colorClass: string;
}

export default function ManualInputPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<'company' | 'employees' | 'bank' | 'result'>('company');
  const [companyInfo, setCompanyInfo] = useState<CompanyInfo>(initialCompanyInfo);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [bankAccount, setBankAccount] = useState<BankAccountInfo>(initialBankAccount);
  const [eligibilityResults, setEligibilityResults] = useState<EligibilityResult[]>([]);
  const [isDownloading, setIsDownloading] = useState<'mckinsey' | 'laborAttorney' | null>(null);
  const [validationErrors, setValidationErrors] = useState<{
    businessNumber?: string;
    residentNumbers: Record<string, string>;
  }>({ residentNumbers: {} });

  const addEmployee = () => {
    setEmployees([
      ...employees,
      { ...initialEmployee, id: `emp-${Date.now()}` },
    ]);
  };

  const updateEmployee = (id: string, field: keyof Employee, value: any) => {
    setEmployees(employees.map(emp =>
      emp.id === id ? { ...emp, [field]: value } : emp
    ));
  };

  const removeEmployee = (id: string) => {
    setEmployees(employees.filter(emp => emp.id !== id));
  };

  const calculateEligibility = () => {
    const results: EligibilityResult[] = [];

    // 2026년 최저보수 기준
    const MINIMUM_WAGE_2026 = 1240000; // 124만원 (2026.1.1 이후 채용)
    const MINIMUM_WAGE_2025 = 1210000; // 121만원 (2025.12.31 이전 채용)

    // 급여 기준 충족 여부 판단 헬퍼
    const meetsWageRequirement = (emp: Employee, threshold: number): boolean => {
      // 급여 미입력(0)이면 판단 불가 → 일단 통과 (검토 필요로 안내)
      if (!emp.monthlySalary || emp.monthlySalary === 0) return true;
      return emp.monthlySalary >= threshold;
    };

    // 채용시점별 최저보수 기준 판단
    const getWageThreshold = (hireDate: string): number => {
      const hire = new Date(hireDate);
      return hire >= new Date('2026-01-01') ? MINIMUM_WAGE_2026 : MINIMUM_WAGE_2025;
    };

    // ── 청년일자리도약장려금 ──
    const youthEmployees = employees.filter(emp => {
      const age = calculateAge(emp.birthDate);
      return age >= 15 && age <= 34 && emp.workType === 'FULL_TIME' && emp.hasEmploymentInsurance;
    });

    if (youthEmployees.length > 0) {
      const businessSubsidy = 720 * 10000;
      const youthIncentive = companyInfo.region === 'NON_CAPITAL' ? 480 * 10000 : 0;
      const capitalNote = companyInfo.region === 'CAPITAL'
        ? ' (수도권: 취업애로청년 요건 충족 필수)'
        : ' + 청년본인 장기근속인센티브 최대 480만원 별도';
      results.push({
        program: '청년일자리도약장려금',
        eligible: companyInfo.region === 'CAPITAL' ? null : true,
        employees: youthEmployees.length,
        amountPerPerson: businessSubsidy + youthIncentive,
        totalAmount: (businessSubsidy + youthIncentive) * youthEmployees.length,
        details: `청년 ${youthEmployees.length}명 해당 (기업지원금 월 60만원 × 12개월 = 720만원${capitalNote})`,
        reason: companyInfo.region === 'CAPITAL'
          ? '수도권은 취업애로청년(10가지 유형 중 1가지) 요건 충족 필수 - 6개월+실업, 고졸이하, 국취제수료, 청년도전수료, 취약계층, 수급자, 북한이탈, 결혼이민, 보호대상/가정위탁 청소년'
          : undefined,
        colorClass: 'bg-blue-100 text-blue-600',
      });
    } else {
      results.push({
        program: '청년일자리도약장려금',
        eligible: false,
        employees: 0,
        totalAmount: 0,
        reason: '15~34세 정규직 청년 근로자 없음',
        colorClass: 'bg-blue-100 text-blue-600',
      });
    }

    // ── 고령자계속고용장려금 (124만원 기준 적용) ──
    const seniorEmployees = employees.filter(emp => {
      const age = calculateAge(emp.birthDate);
      const months = getEmploymentMonths(emp.hireDate);
      return age >= 60 && months >= 12 && emp.hasEmploymentInsurance
        && meetsWageRequirement(emp, MINIMUM_WAGE_2026);
    });

    // 급여 미달로 제외된 고령자 수
    const seniorExcludedByWage = employees.filter(emp => {
      const age = calculateAge(emp.birthDate);
      const months = getEmploymentMonths(emp.hireDate);
      return age >= 60 && months >= 12 && emp.hasEmploymentInsurance
        && emp.monthlySalary > 0 && emp.monthlySalary < MINIMUM_WAGE_2026;
    }).length;

    if (seniorEmployees.length > 0) {
      const quarterlyAmount = companyInfo.region === 'NON_CAPITAL' ? 120 * 10000 : 90 * 10000;
      const amountPerPerson = quarterlyAmount * 12;
      const regionLabel = companyInfo.region === 'NON_CAPITAL' ? '120만원' : '90만원';
      const wageNote = seniorExcludedByWage > 0
        ? ` (월보수 124만원 미만 ${seniorExcludedByWage}명 제외)`
        : '';
      results.push({
        program: '고령자계속고용장려금',
        eligible: true,
        employees: seniorEmployees.length,
        amountPerPerson,
        totalAmount: amountPerPerson * seniorEmployees.length,
        details: `60세 이상 ${seniorEmployees.length}명 해당 (분기 ${regionLabel} × 최대 3년)${wageNote}`,
        colorClass: 'bg-purple-100 text-purple-600',
      });
    } else {
      const reason = seniorExcludedByWage > 0
        ? `60세 이상 근로자 ${seniorExcludedByWage}명이 월보수 124만원 미만으로 제외`
        : '60세 이상 1년 이상 재직 근로자 없음';
      results.push({
        program: '고령자계속고용장려금',
        eligible: false,
        employees: 0,
        totalAmount: 0,
        reason,
        colorClass: 'bg-purple-100 text-purple-600',
      });
    }

    // ── 고령자고용지원금 (124만원 기준 적용) ──
    const seniorSupport = employees.filter(emp => {
      const age = calculateAge(emp.birthDate);
      const months = getEmploymentMonths(emp.hireDate);
      return age >= 60 && months >= 12 && emp.hasEmploymentInsurance
        && meetsWageRequirement(emp, MINIMUM_WAGE_2026);
    });

    if (seniorSupport.length > 0) {
      const amountPerPerson = 30 * 10000 * 8;
      results.push({
        program: '고령자고용지원금',
        eligible: true,
        employees: seniorSupport.length,
        amountPerPerson,
        totalAmount: amountPerPerson * seniorSupport.length,
        details: `60세 이상 ${seniorSupport.length}명 해당 (분기 30만원 × 2년)`,
        colorClass: 'bg-indigo-100 text-indigo-600',
      });
    } else {
      results.push({
        program: '고령자고용지원금',
        eligible: false,
        employees: 0,
        totalAmount: 0,
        reason: '60세 이상 피보험기간 1년 초과 근로자 없음',
        colorClass: 'bg-indigo-100 text-indigo-600',
      });
    }

    // ── 고용촉진장려금 (급여기준 적용) ──
    const promotionEligible = employees.filter(emp => {
      const threshold = getWageThreshold(emp.hireDate);
      return emp.hasEmploymentInsurance && meetsWageRequirement(emp, threshold);
    });
    const promotionIneligibleByWage = employees.filter(emp => {
      const threshold = getWageThreshold(emp.hireDate);
      return emp.hasEmploymentInsurance && emp.monthlySalary > 0 && emp.monthlySalary < threshold;
    }).length;

    if (promotionEligible.length > 0) {
      const amountPerPerson = 30 * 10000 * 12; // 월 30만원 × 12개월 (일반 취업취약계층 기준, 중증장애인은 월 60만원)
      const wageNote = promotionIneligibleByWage > 0
        ? ` (월보수 기준 미달 ${promotionIneligibleByWage}명 제외)`
        : '';
      results.push({
        program: '고용촉진장려금',
        eligible: null, // 검토 필요 (취업취약계층 별도 확인)
        employees: promotionEligible.length,
        amountPerPerson,
        totalAmount: amountPerPerson * promotionEligible.length,
        details: `급여기준 충족 ${promotionEligible.length}명${wageNote}`,
        reason: '취업취약계층 여부 별도 확인 필요 (장애인, 고령자60세+, 경력단절여성, 장기실업자 등)',
        colorClass: 'bg-green-100 text-green-600',
      });
    } else {
      results.push({
        program: '고용촉진장려금',
        eligible: false,
        employees: 0,
        totalAmount: 0,
        reason: promotionIneligibleByWage > 0
          ? `전 직원 월보수 기준 미달 (2026년: 124만원, 2025년 이전 채용: 121만원)`
          : '취업취약계층 여부 확인 필요 (별도 증빙 필요)',
        colorClass: 'bg-green-100 text-green-600',
      });
    }

    // ── 정규직전환지원금 (5~30인 조건) ──
    const totalEmployeeCount = employees.length;
    const conversionEligibleByWage = employees.filter(emp =>
      emp.monthlySalary === 0 || emp.monthlySalary >= MINIMUM_WAGE_2026
    ).length;

    if (totalEmployeeCount >= 5 && totalEmployeeCount < 30) {
      const supportLimit = totalEmployeeCount < 10 ? 3 : Math.floor(totalEmployeeCount * 0.3);
      const amountPerPerson = 40 * 10000 * 12; // 월 40만원 × 12개월
      results.push({
        program: '정규직전환지원금',
        eligible: null, // 검토 필요 (전환 대상자 별도 확인)
        employees: Math.min(conversionEligibleByWage, supportLimit),
        amountPerPerson,
        totalAmount: amountPerPerson * Math.min(conversionEligibleByWage, supportLimit),
        details: `5~30인 미만 사업장 해당 (현재 ${totalEmployeeCount}명, 지원한도 ${supportLimit}명)`,
        reason: '6개월 이상 근무한 기간제·파견·사내하도급 근로자의 정규직 전환 필요 (전환 대상 별도 확인)',
        colorClass: 'bg-teal-100 text-teal-600',
      });
    } else {
      const reason = totalEmployeeCount < 5
        ? `피보험자 수 5인 미만 (현재 ${totalEmployeeCount}명) - 지원 대상 아님`
        : totalEmployeeCount >= 30
        ? `피보험자 수 30인 이상 (현재 ${totalEmployeeCount}명) - 지원 대상 아님`
        : '직원 정보 없음';
      results.push({
        program: '정규직전환지원금',
        eligible: false,
        employees: 0,
        totalAmount: 0,
        reason,
        colorClass: 'bg-teal-100 text-teal-600',
      });
    }

    // ── 출산육아기 고용안정장려금 ──
    if (companyInfo.isSmallBusiness) {
      results.push({
        program: '출산육아기 고용안정장려금',
        eligible: null,
        employees: 0,
        totalAmount: 0,
        reason: '육아휴직 허용 시 지원 가능 (월 30만원, 만12개월 이내 자녀 특례: 첫 3개월 월 100만원 + 대체인력 월 130~140만원)',
        colorClass: 'bg-pink-100 text-pink-600',
      });
    } else {
      results.push({
        program: '출산육아기 고용안정장려금',
        eligible: false,
        employees: 0,
        totalAmount: 0,
        reason: '우선지원대상기업(중소기업)만 해당',
        colorClass: 'bg-pink-100 text-pink-600',
      });
    }

    setEligibilityResults(results);
    setStep('result');
  };

  const totalEligibleAmount = eligibilityResults
    .filter(r => r.eligible === true)
    .reduce((sum, r) => sum + r.totalAmount, 0);

  const totalPotentialAmount = eligibilityResults
    .filter(r => r.eligible === null)
    .reduce((sum, r) => sum + r.totalAmount, 0);

  const eligibleCount = eligibilityResults.filter(r => r.eligible === true).length;
  const potentialCount = eligibilityResults.filter(r => r.eligible === null).length;

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-2">
          <Badge variant="info">직접 입력</Badge>
        </div>
        <h1 className="text-2xl font-bold text-slate-900 mb-2">고용지원금 자격 확인</h1>
        <p className="text-slate-600">
          회사 정보와 직원 정보를 직접 입력하여 지원 가능한 고용지원금을 확인하세요.
        </p>
      </div>

      {/* Progress Steps */}
      <div className="flex items-center justify-center mb-8">
        {['company', 'employees', 'bank', 'result'].map((s, idx) => (
          <div key={s} className="flex items-center">
            <div
              className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold ${
                step === s
                  ? 'bg-blue-600 text-white'
                  : idx < ['company', 'employees', 'bank', 'result'].indexOf(step)
                  ? 'bg-green-500 text-white'
                  : 'bg-slate-200 text-slate-500'
              }`}
            >
              {idx + 1}
            </div>
            {idx < 3 && (
              <div className={`w-16 h-1 ${idx < ['company', 'employees', 'bank', 'result'].indexOf(step) ? 'bg-green-500' : 'bg-slate-200'}`} />
            )}
          </div>
        ))}
      </div>

      {/* Step 1: Company Info */}
      {step === 'company' && (
        <Card padding="lg">
          <CardHeader>
            <CardTitle>사업장 정보 입력</CardTitle>
            <CardDescription>사업자등록증 정보를 입력해주세요.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">상호명 *</label>
                <input
                  type="text"
                  value={companyInfo.businessName}
                  onChange={(e) => setCompanyInfo({ ...companyInfo, businessName: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="주식회사 OOO"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">사업자등록번호</label>
                <input
                  type="text"
                  value={companyInfo.businessNumber}
                  onChange={(e) => {
                    const formatted = formatBusinessNumber(e.target.value);
                    setCompanyInfo({ ...companyInfo, businessNumber: formatted });
                    if (formatted.replace(/[^0-9]/g, '').length === 10) {
                      const result = validateBusinessNumber(formatted);
                      setValidationErrors(prev => ({ ...prev, businessNumber: result.error }));
                    } else {
                      setValidationErrors(prev => ({ ...prev, businessNumber: undefined }));
                    }
                  }}
                  className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                    validationErrors.businessNumber ? 'border-red-500' : 'border-slate-300'
                  }`}
                  placeholder="123-45-67890"
                  maxLength={12}
                />
                {validationErrors.businessNumber && (
                  <p className="text-red-500 text-xs mt-1">{validationErrors.businessNumber}</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">대표자명</label>
                <input
                  type="text"
                  value={companyInfo.representativeName}
                  onChange={(e) => setCompanyInfo({ ...companyInfo, representativeName: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="홍길동"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">개업일</label>
                <input
                  type="date"
                  value={companyInfo.openingDate}
                  onChange={(e) => setCompanyInfo({ ...companyInfo, openingDate: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-1">사업장 소재지</label>
                <input
                  type="text"
                  value={companyInfo.businessAddress}
                  onChange={(e) => setCompanyInfo({ ...companyInfo, businessAddress: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="서울특별시 강남구..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">지역 구분 *</label>
                <select
                  value={companyInfo.region}
                  onChange={(e) => setCompanyInfo({ ...companyInfo, region: e.target.value as 'CAPITAL' | 'NON_CAPITAL' })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="CAPITAL">수도권 (서울/경기/인천)</option>
                  <option value="NON_CAPITAL">비수도권</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">기업 규모 *</label>
                <select
                  value={companyInfo.isSmallBusiness ? 'small' : 'large'}
                  onChange={(e) => setCompanyInfo({ ...companyInfo, isSmallBusiness: e.target.value === 'small' })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="small">중소기업 (우선지원대상기업)</option>
                  <option value="large">대기업</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">고용보험 관리번호</label>
                <input
                  type="text"
                  value={companyInfo.employmentInsuranceNumber || ''}
                  onChange={(e) => setCompanyInfo({ ...companyInfo, employmentInsuranceNumber: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="12345678-01"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">업종코드</label>
                <input
                  type="text"
                  value={companyInfo.industryCode || ''}
                  onChange={(e) => setCompanyInfo({ ...companyInfo, industryCode: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="J62"
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end">
              <Button onClick={() => setStep('employees')} disabled={!companyInfo.businessName}>
                다음: 직원 정보 입력 →
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 2: Employees */}
      {step === 'employees' && (
        <Card padding="lg">
          <CardHeader>
            <CardTitle>직원 정보 입력</CardTitle>
            <CardDescription>지원금 대상이 될 수 있는 직원 정보를 입력해주세요.</CardDescription>
          </CardHeader>
          <CardContent>
            {employees.length === 0 ? (
              <div className="text-center py-8 text-slate-500">
                <p className="mb-4">등록된 직원이 없습니다.</p>
                <Button onClick={addEmployee}>+ 직원 추가</Button>
              </div>
            ) : (
              <div className="space-y-6">
                {employees.map((emp, idx) => (
                  <div key={emp.id} className="p-4 border border-slate-200 rounded-lg">
                    <div className="flex justify-between items-center mb-4">
                      <h3 className="font-semibold text-slate-900">직원 #{idx + 1}</h3>
                      <button
                        onClick={() => removeEmployee(emp.id)}
                        className="text-red-500 hover:text-red-700 text-sm"
                      >
                        삭제
                      </button>
                    </div>
                    <div className="grid md:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">이름 *</label>
                        <input
                          type="text"
                          value={emp.name}
                          onChange={(e) => updateEmployee(emp.id, 'name', e.target.value)}
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          placeholder="홍길동"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">주민등록번호</label>
                        <input
                          type="text"
                          value={emp.residentRegistrationNumber || ''}
                          onChange={(e) => {
                            const formatted = formatResidentNumber(e.target.value);
                            updateEmployee(emp.id, 'residentRegistrationNumber', formatted);
                            
                            const cleaned = formatted.replace(/[^0-9]/g, '');
                            if (cleaned.length === 13) {
                              const result = validateResidentNumber(formatted);
                              setValidationErrors(prev => ({
                                ...prev,
                                residentNumbers: { ...prev.residentNumbers, [emp.id]: result.error || '' }
                              }));
                              if (result.valid && !emp.birthDate) {
                                const birthDate = extractBirthDateFromResidentNumber(formatted);
                                if (birthDate) {
                                  updateEmployee(emp.id, 'birthDate', birthDate);
                                }
                              }
                            } else {
                              setValidationErrors(prev => ({
                                ...prev,
                                residentNumbers: { ...prev.residentNumbers, [emp.id]: '' }
                              }));
                            }
                          }}
                          className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                            validationErrors.residentNumbers[emp.id] ? 'border-red-500' : 'border-slate-300'
                          }`}
                          placeholder="950101-1234567"
                          maxLength={14}
                        />
                        {validationErrors.residentNumbers[emp.id] && (
                          <p className="text-red-500 text-xs mt-1">{validationErrors.residentNumbers[emp.id]}</p>
                        )}
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">생년월일 *</label>
                        <input
                          type="date"
                          value={emp.birthDate}
                          onChange={(e) => updateEmployee(emp.id, 'birthDate', e.target.value)}
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        />
                        {emp.birthDate && (
                          <span className="text-xs text-slate-500 mt-1">
                            만 {calculateAge(emp.birthDate)}세
                          </span>
                        )}
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">입사일 *</label>
                        <input
                          type="date"
                          value={emp.hireDate}
                          onChange={(e) => updateEmployee(emp.id, 'hireDate', e.target.value)}
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">고용보험 가입일</label>
                        <input
                          type="date"
                          value={emp.employmentInsuranceEnrollmentDate || ''}
                          onChange={(e) => updateEmployee(emp.id, 'employmentInsuranceEnrollmentDate', e.target.value)}
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">직위/직책</label>
                        <input
                          type="text"
                          value={emp.position || ''}
                          onChange={(e) => updateEmployee(emp.id, 'position', e.target.value)}
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          placeholder="개발자"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">부서</label>
                        <input
                          type="text"
                          value={emp.department || ''}
                          onChange={(e) => updateEmployee(emp.id, 'department', e.target.value)}
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          placeholder="개발팀"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">월급여</label>
                        <input
                          type="number"
                          value={emp.monthlySalary || ''}
                          onChange={(e) => updateEmployee(emp.id, 'monthlySalary', parseInt(e.target.value) || 0)}
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          placeholder="3000000"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">고용형태 *</label>
                        <select
                          value={emp.workType}
                          onChange={(e) => updateEmployee(emp.id, 'workType', e.target.value)}
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        >
                          <option value="FULL_TIME">정규직</option>
                          <option value="CONTRACT">계약직</option>
                          <option value="PART_TIME">파트타임</option>
                        </select>
                      </div>
                      <div className="flex items-center gap-4 pt-6">
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={emp.hasEmploymentInsurance}
                            onChange={(e) => updateEmployee(emp.id, 'hasEmploymentInsurance', e.target.checked)}
                            className="rounded"
                          />
                          <span className="text-sm">고용보험</span>
                        </label>
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={emp.hasNationalPension}
                            onChange={(e) => updateEmployee(emp.id, 'hasNationalPension', e.target.checked)}
                            className="rounded"
                          />
                          <span className="text-sm">국민연금</span>
                        </label>
                      </div>
                    </div>
                  </div>
                ))}

                <Button variant="outline" onClick={addEmployee} className="w-full">
                  + 직원 추가
                </Button>
              </div>
            )}

            <div className="mt-6 flex justify-between">
              <Button variant="outline" onClick={() => setStep('company')}>
                ← 이전
              </Button>
              <Button
                onClick={() => setStep('bank')}
                disabled={employees.length === 0 || employees.some(e => !e.name || !e.birthDate || !e.hireDate)}
              >
                다음: 계좌 정보 →
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 3: Bank Account */}
      {step === 'bank' && (
        <Card padding="lg">
          <CardHeader>
            <CardTitle>지원금 수령 계좌 정보</CardTitle>
            <CardDescription>고용지원금을 수령할 계좌 정보를 입력해주세요. (선택사항)</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">은행명</label>
                <select
                  value={bankAccount.bankName}
                  onChange={(e) => setBankAccount({ ...bankAccount, bankName: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">은행 선택</option>
                  {KOREAN_BANKS.map(bank => (
                    <option key={bank} value={bank}>{bank}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">계좌번호</label>
                <input
                  type="text"
                  value={bankAccount.accountNumber}
                  onChange={(e) => setBankAccount({ ...bankAccount, accountNumber: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="123456-78-901234"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">예금주</label>
                <input
                  type="text"
                  value={bankAccount.accountHolderName}
                  onChange={(e) => setBankAccount({ ...bankAccount, accountHolderName: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="(주)회사명 또는 홍길동"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">계좌 유형</label>
                <select
                  value={bankAccount.accountHolderType}
                  onChange={(e) => setBankAccount({ ...bankAccount, accountHolderType: e.target.value as 'BUSINESS' | 'REPRESENTATIVE' })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="BUSINESS">법인 명의</option>
                  <option value="REPRESENTATIVE">대표자 명의</option>
                </select>
              </div>
            </div>

            <div className="mt-6 flex justify-between">
              <Button variant="outline" onClick={() => setStep('employees')}>
                ← 이전
              </Button>
              <Button onClick={calculateEligibility}>
                지원금 분석하기
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 3: Results */}
      {step === 'result' && (
        <div className="space-y-6">
          <Card padding="lg" className="bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200">
            <CardContent>
              <div className="text-center">
                <p className="text-sm text-slate-600 mb-1">총 예상 지원금</p>
                <p className="text-4xl font-bold text-blue-600">
                  {new Intl.NumberFormat('ko-KR').format(totalEligibleAmount + totalPotentialAmount)}원
                </p>
                <div className="text-sm text-slate-500 mt-2 space-y-1">
                  {eligibleCount > 0 && (
                    <p>✅ {eligibleCount}개 프로그램 지원 가능 ({new Intl.NumberFormat('ko-KR').format(totalEligibleAmount)}원)</p>
                  )}
                  {potentialCount > 0 && (
                    <p>⚠️ {potentialCount}개 프로그램 검토 필요 ({new Intl.NumberFormat('ko-KR').format(totalPotentialAmount)}원)</p>
                  )}
                  {eligibleCount === 0 && potentialCount === 0 && (
                    <p>지원 가능한 프로그램이 없습니다</p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card padding="lg">
            <CardHeader>
              <CardTitle>입력 정보 요약</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-slate-500">사업장:</span>{' '}
                  <span className="font-medium">{companyInfo.businessName}</span>
                </div>
                <div>
                  <span className="text-slate-500">지역:</span>{' '}
                  <span className="font-medium">{companyInfo.region === 'CAPITAL' ? '수도권' : '비수도권'}</span>
                </div>
                <div>
                  <span className="text-slate-500">총 직원 수:</span>{' '}
                  <span className="font-medium">{employees.length}명</span>
                </div>
                <div>
                  <span className="text-slate-500">청년(15-34세):</span>{' '}
                  <span className="font-medium">
                    {employees.filter(e => {
                      const age = calculateAge(e.birthDate);
                      return age >= 15 && age <= 34;
                    }).length}명
                  </span>
                </div>
                <div>
                  <span className="text-slate-500">고령자(60세+):</span>{' '}
                  <span className="font-medium">
                    {employees.filter(e => calculateAge(e.birthDate) >= 60).length}명
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          <EmployeeProgramMatrix
            employees={employees.map((emp) => ({
              id: emp.id,
              name: emp.name,
              age: calculateAge(emp.birthDate),
              workType: emp.workType,
              hasEmploymentInsurance: emp.hasEmploymentInsurance,
              monthlySalary: emp.monthlySalary,
              employmentMonths: getEmploymentMonths(emp.hireDate),
            }))}
            programResults={eligibilityResults}
            calculateEmployeeEligibility={(employee) => {
              const results: Array<{
                program: string;
                programName: string;
                eligible: boolean;
                amount: number;
                reason?: string;
              }> = [];

              const isYouth = employee.age >= 15 && employee.age <= 34;
              const isSenior = employee.age >= 60;
              const isFullTime = employee.workType === 'FULL_TIME';
              const hasInsurance = employee.hasEmploymentInsurance;
              const salary = (employee as any).monthlySalary || 0;
              const months = (employee as any).employmentMonths || 0;
              const meetsWage124 = salary === 0 || salary >= 1240000;

              if (isYouth && isFullTime && hasInsurance) {
                const businessSubsidy = 720 * 10000;
                const youthIncentive = companyInfo.region === 'NON_CAPITAL' ? 480 * 10000 : 0;
                results.push({
                  program: '청년일자리도약장려금',
                  programName: '청년일자리도약장려금',
                  eligible: true,
                  amount: businessSubsidy + youthIncentive,
                });
              }

              // 고령자: 60세 이상 + 근속 12개월 이상 + 고용보험 + 월보수 124만원 이상
              if (isSenior && hasInsurance && months >= 12 && meetsWage124) {
                const seniorQuarterlyAmount = companyInfo.region === 'NON_CAPITAL' ? 120 * 10000 : 90 * 10000;
                results.push({
                  program: '고령자계속고용장려금',
                  programName: '고령자계속고용장려금',
                  eligible: true,
                  amount: seniorQuarterlyAmount * 12,
                });
                results.push({
                  program: '고령자고용지원금',
                  programName: '고령자고용지원금',
                  eligible: true,
                  amount: 30 * 10000 * 8,
                });
              }

              return results;
            }}
          />

          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-slate-900">프로그램별 분석 결과</h2>
            {eligibilityResults.map((result, idx) => (
              <Card key={idx} padding="md">
                <CardContent>
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${result.colorClass}`}>
                        {result.eligible === true ? (
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        ) : result.eligible === false ? (
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        ) : (
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                          </svg>
                        )}
                      </div>
                      <div>
                        <h3 className="font-semibold text-slate-900">{result.program}</h3>
                        <p className="text-sm text-slate-600 mt-1">
                          {result.eligible === true ? result.details : result.reason}
                        </p>
                      </div>
                    </div>
                    {result.eligible === true && (
                      <div className="text-right">
                        <p className="text-lg font-bold text-blue-600">
                          {new Intl.NumberFormat('ko-KR').format(result.totalAmount)}원
                        </p>
                        <p className="text-xs text-slate-500">{result.employees}명 해당</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card padding="lg" className="bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200">
            <CardContent>
              <h2 className="text-lg font-semibold text-slate-900 mb-2">
                분석 결과 보고서 다운로드
              </h2>
              <p className="text-sm text-slate-600 mb-4">
                입력하신 정보를 바탕으로 맥킨지 스타일의 전문 PDF 보고서를 다운로드하세요.
              </p>
              <Button
                size="lg"
                disabled={isDownloading !== null}
                isLoading={isDownloading === 'mckinsey'}
                onClick={async () => {
                  setIsDownloading('mckinsey');
                  try {
                    const reportData: McReportData = {
                      businessInfo: {
                        name: companyInfo.businessName,
                        registrationNumber: companyInfo.businessNumber,
                        address: companyInfo.businessAddress,
                        representativeName: companyInfo.representativeName,
                        region: companyInfo.region,
                      },
                      eligibleCalculations: eligibilityResults.map((result): SubsidyCalculationData => ({
                        program: result.program,
                        programName: result.program,
                        eligible: result.eligible === true,
                        eligibility: result.eligible === true ? 'ELIGIBLE' : result.eligible === null ? 'NEEDS_REVIEW' : 'NOT_ELIGIBLE',
                        monthlyAmount: result.amountPerPerson ? Math.round(result.amountPerPerson / 12) : 0,
                        totalMonths: 12,
                        totalAmount: result.totalAmount || 0,
                        employees: result.employees,
                        notes: result.details ? [result.details] : result.reason ? [result.reason] : [],
                        reason: result.reason,
                      })),
                      totalEligibleAmount: totalEligibleAmount,
                      employeeSummary: {
                        total: employees.length,
                        youth: employees.filter(e => {
                          const age = calculateAge(e.birthDate);
                          return age >= 15 && age <= 34;
                        }).length,
                        senior: employees.filter(e => calculateAge(e.birthDate) >= 60).length,
                      },
                      generatedAt: new Date().toISOString(),
                    };
                    
                    await downloadMcKinseyReport(reportData, `${companyInfo.businessName || '고용지원금'}_분석보고서.pdf`);
                  } catch (error) {
                    console.error('PDF 다운로드 실패:', error);
                    alert('PDF 보고서 다운로드에 실패했습니다. 다시 시도해 주세요.');
                  } finally {
                    setIsDownloading(null);
                  }
                }}
                leftIcon={
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                }
              >
                PDF 보고서 다운로드
              </Button>
            </CardContent>
          </Card>

          <Card padding="lg" className="bg-gradient-to-r from-orange-50 to-amber-50 border-orange-200">
            <CardContent>
              <h2 className="text-lg font-semibold text-slate-900 mb-2">
                노무사용 신청서 양식 (출력용)
              </h2>
              <p className="text-sm text-slate-600 mb-4">
                노무사나 인사담당자가 고용지원금을 직접 신청할 때 사용하는 출력용 양식입니다.
                사업장 정보, 직원 명부, 계좌 정보, 프로그램별 서류 체크리스트가 포함됩니다.
              </p>
              <Button
                size="lg"
                className="bg-orange-600 hover:bg-orange-700"
                disabled={isDownloading !== null}
                isLoading={isDownloading === 'laborAttorney'}
                onClick={async () => {
                  setIsDownloading('laborAttorney');
                  try {
                    const youthEmployees = employees.filter(e => {
                      const age = calculateAge(e.birthDate);
                      return age >= 15 && age <= 34;
                    });
                    const seniorEmployees = employees.filter(e => calculateAge(e.birthDate) >= 60);

                    const extendedEmployees: ExtendedEmployeeInfo[] = employees.map(emp => ({
                      id: emp.id,
                      name: emp.name,
                      birthDate: emp.birthDate,
                      residentRegistrationNumber: emp.residentRegistrationNumber,
                      hireDate: emp.hireDate,
                      position: emp.position,
                      department: emp.department,
                      workType: emp.workType,
                      monthlySalary: emp.monthlySalary,
                      employmentInsuranceEnrollmentDate: emp.employmentInsuranceEnrollmentDate,
                      hasEmploymentInsurance: emp.hasEmploymentInsurance,
                      hasNationalPension: emp.hasNationalPension,
                      hasHealthInsurance: emp.hasHealthInsurance,
                      age: calculateAge(emp.birthDate),
                      employmentDurationMonths: getEmploymentMonths(emp.hireDate),
                      isYouth: calculateAge(emp.birthDate) >= 15 && calculateAge(emp.birthDate) <= 34,
                      isSenior: calculateAge(emp.birthDate) >= 60,
                    }));

                    const eligiblePrograms = eligibilityResults.filter(r => r.eligible === true);
                    
                    const laborData: LaborAttorneyReportData = {
                      reportTitle: '고용지원금 신청서 작성 보조 자료',
                      reportDate: new Date().toLocaleDateString('ko-KR', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                      }),
                      reportId: `RPT-${Date.now()}`,
                      businessInfo: {
                        name: companyInfo.businessName,
                        registrationNumber: companyInfo.businessNumber,
                        representativeName: companyInfo.representativeName,
                        address: companyInfo.businessAddress,
                        employmentInsuranceNumber: companyInfo.employmentInsuranceNumber,
                        industryCode: companyInfo.industryCode,
                        establishmentDate: companyInfo.openingDate,
                        totalEmployeeCount: employees.length,
                        region: companyInfo.region,
                        isSmallBusiness: companyInfo.isSmallBusiness,
                      },
                      bankAccount: bankAccount.bankName ? bankAccount : undefined,
                      employees: extendedEmployees,
                      employeeSummary: {
                        total: employees.length,
                        youth: youthEmployees.length,
                        senior: seniorEmployees.length,
                        fullTime: employees.filter(e => e.workType === 'FULL_TIME').length,
                        partTime: employees.filter(e => e.workType === 'PART_TIME').length,
                        contract: employees.filter(e => e.workType === 'CONTRACT').length,
                      },
                      programDetails: eligiblePrograms.map(result => {
                        const programKey = result.program === '청년일자리도약장려금' ? SubsidyProgram.YOUTH_JOB_LEAP
                          : result.program === '고령자계속고용장려금' ? SubsidyProgram.SENIOR_CONTINUED_EMPLOYMENT
                          : result.program === '고령자고용지원금' ? SubsidyProgram.SENIOR_EMPLOYMENT_SUPPORT
                          : result.program === '고용촉진장려금' ? SubsidyProgram.EMPLOYMENT_PROMOTION
                          : result.program === '출산육아기 고용안정장려금' ? SubsidyProgram.PARENTAL_EMPLOYMENT_STABILITY
                          : result.program === '정규직전환지원금' ? SubsidyProgram.REGULAR_CONVERSION
                          : SubsidyProgram.REGULAR_CONVERSION;
                        
                        return {
                          program: programKey,
                          programName: result.program,
                          applicationSite: '고용24 (www.work24.go.kr)',
                          applicationPeriod: '채용 후 6개월 경과 시점부터 신청 가능',
                          contactInfo: '고용노동부 고객상담센터 1350',
                          eligibleEmployees: extendedEmployees.filter(e => {
                            if (programKey === SubsidyProgram.YOUTH_JOB_LEAP) return e.isYouth;
                            if (programKey === SubsidyProgram.SENIOR_CONTINUED_EMPLOYMENT || 
                                programKey === SubsidyProgram.SENIOR_EMPLOYMENT_SUPPORT) return e.isSenior;
                            return true;
                          }),
                          estimatedTotalAmount: result.totalAmount,
                          monthlyAmount: result.amountPerPerson ? Math.round(result.amountPerPerson / 12) : undefined,
                          supportDurationMonths: 12,
                          requiredDocuments: PROGRAM_DOCUMENT_CHECKLISTS[programKey] || [],
                          notes: result.details ? [result.details] : [],
                        };
                      }),
                      totalEstimatedAmount: totalEligibleAmount,
                      eligibleProgramCount: eligibleCount,
                      masterChecklist: [],
                      disclaimers: [
                        '본 자료는 고용지원금 신청을 돕기 위한 참고 자료입니다.',
                        '실제 지원 가능 여부는 고용노동부 심사를 통해 최종 결정됩니다.',
                        '신청 전 고용24 (www.work24.go.kr)에서 최신 요건을 반드시 확인하세요.',
                        '문의: 고용노동부 고객상담센터 1350',
                      ],
                    };

                    await downloadLaborAttorneyReport(laborData, `${companyInfo.businessName || '고용지원금'}_노무사용양식.pdf`);
                  } catch (error) {
                    console.error('PDF 다운로드 실패:', error);
                    alert('노무사용 양식 다운로드에 실패했습니다. 다시 시도해 주세요.');
                  } finally {
                    setIsDownloading(null);
                  }
                }}
                leftIcon={
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                  </svg>
                }
              >
                노무사용 양식 다운로드 (PDF)
              </Button>
            </CardContent>
          </Card>

          <div className="flex justify-between pt-4">
            <Button variant="outline" onClick={() => setStep('bank')}>
              ← 정보 수정
            </Button>
            <Button onClick={() => navigate('/')}>
              처음으로
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
