import { Link } from 'react-router-dom';
import { Button, Card, CardHeader, CardTitle, CardDescription, CardContent, Badge } from '../components/common';

const subsidyPrograms = [
  {
    id: 'youth',
    title: '청년일자리도약장려금',
    description: '청년(15~34세)을 정규직으로 신규 채용한 기업에 인건비를 지원합니다. [유형I] 취업애로청년 / [유형II] 빈일자리업종.',
    amount: '월 60만원 × 12개월 (720만원) + 비수도권 인센티브 최대 720만원',
    requirements: ['15~34세 청년 정규직 채용', '4대보험 가입', '6개월 이상 고용유지 후 신청'],
    colorClass: 'bg-blue-100 text-blue-600',
  },
  {
    id: 'promotion',
    title: '고용촉진장려금',
    description: '취업취약계층(장애인, 고령자, 경력단절여성, 장기실업자 등)을 고용한 사업주에게 인건비를 지원합니다.',
    amount: '월 30~60만원 × 최대 2년 (최대 1,440만원)',
    requirements: ['취업취약계층 채용', '취업지원프로그램 이수자', '6개월 이상 고용유지'],
    colorClass: 'bg-green-100 text-green-600',
  },
  {
    id: 'retention',
    title: '고용유지지원금',
    description: '경영 악화로 고용조정이 불가피한 사업주가 휴업·휴직 등으로 고용을 유지하는 경우 지원합니다.',
    amount: '휴업수당의 1/2~2/3 (1일 최대 66,000원, 연 180일)',
    requirements: ['경영악화 증빙 (매출 15%+ 감소)', '휴업·휴직 계획서 사전제출', '근로자대표 동의'],
    colorClass: 'bg-amber-100 text-amber-600',
  },
  {
    id: 'senior-continued',
    title: '고령자계속고용장려금',
    description: '정년 연장(1년+)·폐지 또는 재고용 제도를 도입한 기업이 60세 이상 근로자를 계속 고용하는 경우 지원합니다.',
    amount: '분기 90만원 × 최대 3년 (최대 1,080만원)',
    requirements: ['정년제도 변경 (연장/폐지/재고용)', '60세 이상 계속 고용', '60세 이상 피보험자 비율 30% 이하'],
    colorClass: 'bg-purple-100 text-purple-600',
  },
  {
    id: 'senior-support',
    title: '고령자고용지원금',
    description: '피보험기간 1년 초과 60세 이상 근로자 수가 증가한 사업주에게 지원합니다.',
    amount: '분기 30만원 × 2년 (8분기, 최대 240만원)',
    requirements: ['60세 이상 근로자 수 증가', '피보험기간 1년 초과', '고용보험 가입 1년 이상'],
    colorClass: 'bg-indigo-100 text-indigo-600',
  },
  {
    id: 'parental',
    title: '출산육아기 고용안정장려금',
    description: '근로자의 육아휴직, 육아기 근로시간 단축을 허용한 중소기업(우선지원대상기업) 사업주를 지원합니다.',
    amount: '육아휴직 월 30만원 + 대체인력 월 120만원 + 업무분담 월 20~60만원 + 남성인센티브 월 10만원',
    requirements: ['30일 이상 육아휴직/단축 허용', '우선지원대상기업(중소기업)', '종료 후 6개월 이상 계속고용'],
    colorClass: 'bg-pink-100 text-pink-600',
  },
];

export default function HomePage() {
  return (
    <div className="space-y-12">
      <section className="text-center py-12">
        <div className="flex items-center justify-center gap-2 mb-4">
          <Badge variant="primary" size="md">
            서류 업로드만으로 자동 분석
          </Badge>
          <Badge variant="warning" size="md">
            2026년 기준
          </Badge>
        </div>
        <h1 className="text-4xl md:text-5xl font-bold text-slate-900 mb-4">
          고용지원금 신청을
          <br />
          <span className="text-blue-600">더 쉽고 빠르게</span>
        </h1>
        <p className="text-lg text-slate-600 max-w-2xl mx-auto mb-8">
          사업자등록증, 임금대장, 근로계약서를 업로드하면
          <br />
          지원 가능한 고용지원금과 예상 지원액을 자동으로 분석해 드립니다.
        </p>
        <div className="flex items-center justify-center gap-4">
          <Link to="/upload">
            <Button size="lg" rightIcon={
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            }>
              서류 업로드 시작
            </Button>
          </Link>
          <Button variant="outline" size="lg">
            자세히 알아보기
          </Button>
        </div>
      </section>

      <section>
        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold text-slate-900 mb-2">
            지원 가능한 고용지원금 프로그램
          </h2>
          <p className="text-slate-600">
            귀사에 맞는 지원금을 확인해 보세요
            <span className="ml-2 text-sm text-amber-600 font-medium">(2026년 기준)</span>
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {subsidyPrograms.map((program) => (
            <Card key={program.id} variant="hover" padding="lg">
              <CardHeader>
                <div className={`w-12 h-12 rounded-lg flex items-center justify-center mb-4 ${program.colorClass}`}>
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                </div>
                <CardTitle>{program.title}</CardTitle>
                <CardDescription>{program.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="mb-4">
                  <span className="text-sm text-slate-500">지원금액</span>
                  <p className="text-lg font-semibold text-slate-900">{program.amount}</p>
                </div>
                <div>
                  <span className="text-sm text-slate-500">주요 요건</span>
                  <ul className="mt-2 space-y-1">
                    {program.requirements.map((req, idx) => (
                      <li key={idx} className="flex items-center gap-2 text-sm text-slate-600">
                        <svg className="w-4 h-4 text-green-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                        {req}
                      </li>
                    ))}
                  </ul>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="py-12">
        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold text-slate-900 mb-2">이용 방법</h2>
          <p className="text-slate-600">3단계로 간편하게 지원금을 확인하세요</p>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          {[
            { step: '01', title: '서류 업로드', description: '사업자등록증, 임금대장 등 필요한 서류를 업로드합니다.' },
            { step: '02', title: '자동 데이터 추출', description: 'AI가 문서를 분석하여 필요한 정보를 자동으로 추출합니다.' },
            { step: '03', title: '지원금 확인', description: '신청 가능한 지원금과 예상 지원액을 확인합니다.' },
          ].map((item) => (
            <div key={item.step} className="text-center">
              <div className="w-12 h-12 bg-blue-600 text-white rounded-full flex items-center justify-center text-lg font-bold mx-auto mb-4">
                {item.step}
              </div>
              <h3 className="text-lg font-semibold text-slate-900 mb-2">{item.title}</h3>
              <p className="text-slate-600">{item.description}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
