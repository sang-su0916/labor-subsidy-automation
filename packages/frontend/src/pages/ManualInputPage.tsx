import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, Button, Badge } from '../components/common';

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

export default function ManualInputPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<'company' | 'employees' | 'result'>('company');
  const [companyInfo, setCompanyInfo] = useState<CompanyInfo>(initialCompanyInfo);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [eligibilityResults, setEligibilityResults] = useState<any[]>([]);

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
    const results: any[] = [];

    // 청년일자리도약장려금
    const youthEmployees = employees.filter(emp => {
      const age = calculateAge(emp.birthDate);
      return age >= 15 && age <= 34 && emp.workType === 'FULL_TIME' && emp.hasEmploymentInsurance;
    });

    if (youthEmployees.length > 0) {
      const baseAmount = 720 * 10000; // 720만원
      const incentive = companyInfo.region === 'NON_CAPITAL' ? 720 * 10000 : 0;
      results.push({
        program: '청년일자리도약장려금',
        eligible: true,
        employees: youthEmployees.length,
        amountPerPerson: baseAmount + incentive,
        totalAmount: (baseAmount + incentive) * youthEmployees.length,
        details: `청년 ${youthEmployees.length}명 해당 (월 60만원 × 12개월${companyInfo.region === 'NON_CAPITAL' ? ' + 비수도권 인센티브' : ''})`,
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

    // 고령자계속고용장려금
    const seniorEmployees = employees.filter(emp => {
      const age = calculateAge(emp.birthDate);
      const months = getEmploymentMonths(emp.hireDate);
      return age >= 60 && months >= 12 && emp.hasEmploymentInsurance;
    });

    if (seniorEmployees.length > 0) {
      const amountPerPerson = 90 * 10000 * 12; // 분기 90만원 × 12분기(3년)
      results.push({
        program: '고령자계속고용장려금',
        eligible: true,
        employees: seniorEmployees.length,
        amountPerPerson,
        totalAmount: amountPerPerson * seniorEmployees.length,
        details: `60세 이상 ${seniorEmployees.length}명 해당 (분기 90만원 × 최대 3년)`,
        colorClass: 'bg-purple-100 text-purple-600',
      });
    } else {
      results.push({
        program: '고령자계속고용장려금',
        eligible: false,
        employees: 0,
        totalAmount: 0,
        reason: '60세 이상 1년 이상 재직 근로자 없음',
        colorClass: 'bg-purple-100 text-purple-600',
      });
    }

    // 고령자고용지원금
    const seniorSupport = employees.filter(emp => {
      const age = calculateAge(emp.birthDate);
      const months = getEmploymentMonths(emp.hireDate);
      return age >= 60 && months >= 12 && emp.hasEmploymentInsurance;
    });

    if (seniorSupport.length > 0) {
      const amountPerPerson = 30 * 10000 * 8; // 분기 30만원 × 8분기(2년)
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

    // 고용촉진장려금
    results.push({
      program: '고용촉진장려금',
      eligible: false,
      employees: 0,
      totalAmount: 0,
      reason: '취업취약계층 여부 확인 필요 (별도 증빙 필요)',
      colorClass: 'bg-green-100 text-green-600',
    });

    // 출산육아기 고용안정장려금
    if (companyInfo.isSmallBusiness) {
      results.push({
        program: '출산육아기 고용안정장려금',
        eligible: null,
        employees: 0,
        totalAmount: 0,
        reason: '육아휴직 허용 시 지원 가능 (월 30만원 + 대체인력 120만원)',
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

  const eligibleCount = eligibilityResults.filter(r => r.eligible === true).length;

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
        {['company', 'employees', 'result'].map((s, idx) => (
          <div key={s} className="flex items-center">
            <div
              className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold ${
                step === s
                  ? 'bg-blue-600 text-white'
                  : idx < ['company', 'employees', 'result'].indexOf(step)
                  ? 'bg-green-500 text-white'
                  : 'bg-slate-200 text-slate-500'
              }`}
            >
              {idx + 1}
            </div>
            {idx < 2 && (
              <div className={`w-20 h-1 ${idx < ['company', 'employees', 'result'].indexOf(step) ? 'bg-green-500' : 'bg-slate-200'}`} />
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
                  onChange={(e) => setCompanyInfo({ ...companyInfo, businessNumber: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="123-45-67890"
                />
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
                onClick={calculateEligibility}
                disabled={employees.length === 0 || employees.some(e => !e.name || !e.birthDate || !e.hireDate)}
              >
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
                  {new Intl.NumberFormat('ko-KR').format(totalEligibleAmount)}원
                </p>
                <p className="text-sm text-slate-500 mt-2">
                  {eligibleCount}개 프로그램 지원 가능
                </p>
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

          <div className="flex justify-between pt-4">
            <Button variant="outline" onClick={() => setStep('employees')}>
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
