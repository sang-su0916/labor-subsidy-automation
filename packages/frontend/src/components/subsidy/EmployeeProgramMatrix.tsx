import { Card, CardContent, CardHeader, CardTitle, Badge } from '../common';

interface Employee {
  id: string;
  name: string;
  age: number;
  workType: string;
  hasEmploymentInsurance: boolean;
}

interface ProgramEligibility {
  program: string;
  programName: string;
  eligible: boolean;
  amount: number;
  reason?: string;
}

interface EmployeeEligibility {
  employee: Employee;
  programs: ProgramEligibility[];
  totalAmount: number;
}

interface EmployeeProgramMatrixProps {
  employees: Employee[];
  programResults: Array<{
    program: string;
    eligible: boolean | null;
    employees?: number;
    amountPerPerson?: number;
    reason?: string;
  }>;
  calculateEmployeeEligibility: (employee: Employee) => ProgramEligibility[];
}

const PROGRAM_COLORS: Record<string, string> = {
  '청년일자리도약장려금': 'bg-blue-100 text-blue-700',
  '고령자계속고용장려금': 'bg-purple-100 text-purple-700',
  '고령자고용지원금': 'bg-indigo-100 text-indigo-700',
  '고용촉진장려금': 'bg-green-100 text-green-700',
  '출산육아기 고용안정장려금': 'bg-pink-100 text-pink-700',
};

export default function EmployeeProgramMatrix({
  employees,
  programResults,
  calculateEmployeeEligibility,
}: EmployeeProgramMatrixProps) {
  const employeeEligibilities: EmployeeEligibility[] = employees.map((emp) => {
    const programs = calculateEmployeeEligibility(emp);
    const totalAmount = programs
      .filter((p) => p.eligible)
      .reduce((sum, p) => sum + p.amount, 0);
    return { employee: emp, programs, totalAmount };
  });

  const eligiblePrograms = programResults.filter((p) => p.eligible);

  if (employees.length === 0) {
    return null;
  }

  return (
    <Card padding="lg">
      <CardHeader>
        <CardTitle>직원별 지원금 자격 현황</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="text-left py-3 px-2 font-semibold text-slate-700">
                  직원명
                </th>
                <th className="text-center py-3 px-2 font-semibold text-slate-700">
                  나이
                </th>
                {eligiblePrograms.map((program) => (
                  <th
                    key={program.program}
                    className="text-center py-3 px-2 font-semibold text-slate-700 min-w-[100px]"
                  >
                    <span className="text-xs">{program.program}</span>
                  </th>
                ))}
                <th className="text-right py-3 px-2 font-semibold text-slate-700">
                  예상 총액
                </th>
              </tr>
            </thead>
            <tbody>
              {employeeEligibilities.map(({ employee, programs, totalAmount }) => (
                <tr
                  key={employee.id}
                  className="border-b border-slate-100 hover:bg-slate-50"
                >
                  <td className="py-3 px-2">
                    <div className="font-medium text-slate-900">{employee.name}</div>
                    <div className="text-xs text-slate-500">
                      {employee.workType === 'FULL_TIME'
                        ? '정규직'
                        : employee.workType === 'CONTRACT'
                        ? '계약직'
                        : '파트타임'}
                    </div>
                  </td>
                  <td className="text-center py-3 px-2">
                    <span className="text-slate-700">{employee.age}세</span>
                  </td>
                  {eligiblePrograms.map((program) => {
                    const eligibility = programs.find(
                      (p) => p.program === program.program
                    );
                    return (
                      <td key={program.program} className="text-center py-3 px-2">
                        {eligibility?.eligible ? (
                          <div className="flex flex-col items-center gap-1">
                            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-green-100 text-green-600">
                              <svg
                                className="w-4 h-4"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M5 13l4 4L19 7"
                                />
                              </svg>
                            </span>
                            <span className="text-xs text-green-700 font-medium">
                              {(eligibility.amount / 10000).toLocaleString()}만원
                            </span>
                          </div>
                        ) : (
                          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-slate-100 text-slate-400">
                            <svg
                              className="w-4 h-4"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M6 18L18 6M6 6l12 12"
                              />
                            </svg>
                          </span>
                        )}
                      </td>
                    );
                  })}
                  <td className="text-right py-3 px-2">
                    {totalAmount > 0 ? (
                      <span className="font-bold text-blue-600">
                        {(totalAmount / 10000).toLocaleString()}만원
                      </span>
                    ) : (
                      <span className="text-slate-400">-</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-slate-50">
                <td colSpan={2} className="py-3 px-2 font-semibold text-slate-700">
                  합계
                </td>
                {eligiblePrograms.map((program) => {
                  const programTotal = employeeEligibilities.reduce((sum, ee) => {
                    const eligibility = ee.programs.find(
                      (p) => p.program === program.program
                    );
                    return sum + (eligibility?.eligible ? eligibility.amount : 0);
                  }, 0);
                  return (
                    <td
                      key={program.program}
                      className="text-center py-3 px-2 font-semibold text-slate-700"
                    >
                      {programTotal > 0
                        ? `${(programTotal / 10000).toLocaleString()}만원`
                        : '-'}
                    </td>
                  );
                })}
                <td className="text-right py-3 px-2 font-bold text-blue-600">
                  {(
                    employeeEligibilities.reduce((sum, ee) => sum + ee.totalAmount, 0) /
                    10000
                  ).toLocaleString()}
                  만원
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <span className="text-xs text-slate-500">범례:</span>
          {Object.entries(PROGRAM_COLORS).map(([program, colorClass]) => (
            <Badge key={program} className={colorClass}>
              {program}
            </Badge>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
