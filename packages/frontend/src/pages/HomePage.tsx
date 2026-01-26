import { useState, useRef } from 'react';
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

const requiredDocuments = [
  {
    id: 'youth',
    title: '청년일자리도약장려금',
    colorClass: 'bg-blue-100 text-blue-600 border-blue-200',
    documents: [
      { name: '사업자등록증 사본', required: true },
      { name: '근로계약서 사본', required: true },
      { name: '월별 임금대장 (6개월분)', required: true },
      { name: '4대보험 가입내역 확인서', required: true },
      { name: '청년 본인 신분증 사본', required: true },
      { name: '고용보험 피보험자격 이력내역서', required: true },
      { name: '취업지원프로그램 이수확인서 (유형I)', required: false },
    ],
    applicationSite: '고용보험 기업서비스 (www.ei.go.kr)',
  },
  {
    id: 'promotion',
    title: '고용촉진장려금',
    colorClass: 'bg-green-100 text-green-600 border-green-200',
    documents: [
      { name: '사업자등록증 사본', required: true },
      { name: '근로계약서 사본', required: true },
      { name: '월별 임금대장', required: true },
      { name: '취업지원프로그램 이수확인서', required: true },
      { name: '취약계층 증빙서류', required: true },
      { name: '4대보험 가입내역 확인서', required: true },
    ],
    applicationSite: '고용보험 기업서비스 (www.ei.go.kr)',
  },
  {
    id: 'retention',
    title: '고용유지지원금',
    colorClass: 'bg-amber-100 text-amber-600 border-amber-200',
    documents: [
      { name: '사업자등록증 사본', required: true },
      { name: '매출액 감소 증빙자료', required: true },
      { name: '휴업·휴직 계획서', required: true },
      { name: '근로자대표 동의서', required: true },
      { name: '휴업·휴직 실시 대상자 명단', required: true },
      { name: '휴업수당 지급대장', required: true },
      { name: '통장 사본', required: true },
    ],
    applicationSite: '고용보험 기업서비스 (www.ei.go.kr)',
  },
  {
    id: 'senior-continued',
    title: '고령자계속고용장려금',
    colorClass: 'bg-purple-100 text-purple-600 border-purple-200',
    documents: [
      { name: '사업자등록증 사본', required: true },
      { name: '취업규칙 또는 단체협약 (정년제도 변경 내용)', required: true },
      { name: '계속고용 근로자 명부', required: true },
      { name: '근로계약서 사본', required: true },
      { name: '임금대장', required: true },
      { name: '4대보험 가입내역 확인서', required: true },
    ],
    applicationSite: '고용보험 기업서비스 (www.ei.go.kr)',
  },
  {
    id: 'senior-support',
    title: '고령자고용지원금',
    colorClass: 'bg-indigo-100 text-indigo-600 border-indigo-200',
    documents: [
      { name: '사업자등록증 사본', required: true },
      { name: '60세 이상 근로자 명부', required: true },
      { name: '근로계약서 사본', required: true },
      { name: '월별 임금대장', required: true },
      { name: '고용보험 피보험자격 이력내역서', required: true },
    ],
    applicationSite: '고용보험 기업서비스 (www.ei.go.kr)',
  },
  {
    id: 'parental',
    title: '출산육아기 고용안정장려금',
    colorClass: 'bg-pink-100 text-pink-600 border-pink-200',
    documents: [
      { name: '사업자등록증 사본', required: true },
      { name: '육아휴직 신청서 및 확인서', required: true },
      { name: '육아휴직 대상 근로자의 가족관계증명서', required: true },
      { name: '근로계약서 사본', required: true },
      { name: '임금대장', required: true },
      { name: '대체인력 근로계약서 (대체인력 지원 시)', required: false },
      { name: '업무분담 계획서 (업무분담 지원 시)', required: false },
    ],
    applicationSite: '고용보험 기업서비스 (www.ei.go.kr)',
  },
];

export default function HomePage() {
  const [showDocuments, setShowDocuments] = useState(false);
  const documentsRef = useRef<HTMLDivElement>(null);

  const handlePrintDocuments = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const today = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
    
    const programColors: Record<string, string> = {
      'youth': '#3b82f6',
      'promotion': '#22c55e',
      'retention': '#f59e0b',
      'senior-continued': '#a855f7',
      'senior-support': '#6366f1',
      'parental': '#ec4899',
    };

    printWindow.document.write(`
      <!DOCTYPE html>
      <html lang="ko">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>고용지원금 필요서류 체크리스트</title>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700&display=swap');
            
            @page {
              size: A4;
              margin: 20mm 15mm 25mm 15mm;
            }
            
            * { box-sizing: border-box; margin: 0; padding: 0; }
            
            body { 
              font-family: 'Noto Sans KR', 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif;
              font-size: 10pt;
              line-height: 1.5;
              color: #1f2937;
            }
            
            .header {
              text-align: center;
              padding-bottom: 15px;
              border-bottom: 3px solid #003366;
              margin-bottom: 20px;
            }
            
            .header h1 {
              font-size: 18pt;
              font-weight: 700;
              color: #003366;
              margin-bottom: 5px;
            }
            
            .header .subtitle {
              font-size: 11pt;
              color: #666;
            }
            
            .header .date {
              font-size: 9pt;
              color: #999;
              margin-top: 8px;
            }
            
            .programs-grid {
              display: grid;
              grid-template-columns: repeat(2, 1fr);
              gap: 15px;
            }
            
            .program {
              border: 1px solid #e5e7eb;
              border-radius: 8px;
              padding: 12px;
              page-break-inside: avoid;
              background: #fff;
            }
            
            .program-header {
              display: flex;
              align-items: center;
              gap: 8px;
              margin-bottom: 10px;
              padding-bottom: 8px;
              border-bottom: 2px solid;
            }
            
            .program-icon {
              width: 24px;
              height: 24px;
              border-radius: 6px;
              display: flex;
              align-items: center;
              justify-content: center;
              color: white;
              font-weight: bold;
              font-size: 12px;
            }
            
            .program-title {
              font-size: 11pt;
              font-weight: 700;
              color: #1f2937;
            }
            
            .doc-list {
              list-style: none;
              margin-bottom: 10px;
            }
            
            .doc-item {
              display: flex;
              align-items: flex-start;
              gap: 6px;
              padding: 3px 0;
              font-size: 9pt;
            }
            
            .checkbox {
              width: 12px;
              height: 12px;
              border: 1.5px solid #9ca3af;
              border-radius: 2px;
              flex-shrink: 0;
              margin-top: 2px;
            }
            
            .required-tag {
              font-size: 8pt;
              font-weight: 600;
              padding: 1px 4px;
              border-radius: 3px;
              flex-shrink: 0;
            }
            
            .required-tag.required {
              background: #fee2e2;
              color: #dc2626;
            }
            
            .required-tag.optional {
              background: #f3f4f6;
              color: #6b7280;
            }
            
            .doc-name {
              color: #374151;
            }
            
            .program-footer {
              font-size: 8pt;
              color: #6b7280;
              padding-top: 8px;
              border-top: 1px dashed #e5e7eb;
            }
            
            .program-footer div {
              margin-bottom: 2px;
            }
            
            .footer {
              margin-top: 20px;
              padding-top: 15px;
              border-top: 2px solid #003366;
              text-align: center;
            }
            
            .footer-info {
              font-size: 9pt;
              color: #666;
              margin-bottom: 5px;
            }
            
            .footer-contact {
              font-size: 11pt;
              font-weight: 600;
              color: #003366;
            }
            
            @media print {
              body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
              .program { break-inside: avoid; }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>2026년 고용지원금 신청 필요서류 체크리스트</h1>
            <div class="subtitle">고용노동부 지원금 프로그램별 제출 서류 안내</div>
            <div class="date">출력일: ${today}</div>
          </div>
          
          <div class="programs-grid">
            ${requiredDocuments.map(program => `
              <div class="program">
                <div class="program-header" style="border-color: ${programColors[program.id] || '#666'}">
                  <div class="program-icon" style="background: ${programColors[program.id] || '#666'}">
                    ${program.title.charAt(0)}
                  </div>
                  <div class="program-title">${program.title}</div>
                </div>
                <ul class="doc-list">
                  ${program.documents.map(doc => `
                    <li class="doc-item">
                      <div class="checkbox"></div>
                      <span class="required-tag ${doc.required ? 'required' : 'optional'}">${doc.required ? '필수' : '선택'}</span>
                      <span class="doc-name">${doc.name}</span>
                    </li>
                  `).join('')}
                </ul>
                <div class="program-footer">
                  <div><strong>신청:</strong> ${program.applicationSite}</div>
                </div>
              </div>
            `).join('')}
          </div>
          
          <div class="footer">
            <div class="footer-info">※ 지원금 신청 전 고용24 (www.work24.go.kr)에서 최신 요건을 반드시 확인하세요.</div>
            <div class="footer-contact">고용노동부 고객상담센터 ☎ 1350 (평일 09:00~18:00)</div>
          </div>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.print();
  };

  return (
    <div className="space-y-12">
      {/* 협력사 로고 섹션 */}
      <section className="flex flex-col md:flex-row justify-center md:justify-between items-center gap-8 px-4 md:px-16 pt-8">
        {/* 좌측: 노무법인 같이 */}
        <div className="flex flex-col items-center">
          <img
            src="/gachi-logo.jpeg"
            alt="노무법인 같이"
            className="h-32 md:h-48 w-auto object-contain"
          />
          <a
            href="tel:02-6949-4974"
            className="flex items-center gap-2 px-4 md:px-6 py-2 md:py-3 mt-3 md:mt-4 bg-[#8B5A3C] text-white rounded-lg hover:bg-[#6D4830] transition-colors text-base md:text-lg font-medium"
          >
            <svg className="w-4 h-4 md:w-5 md:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
            </svg>
            02-6949-4974
          </a>
        </div>

        {/* 우측: L-BIZ PARTNERS */}
        <div className="flex flex-col items-center">
          <img
            src="/gold-logo.png"
            alt="L-BIZ PARTNERS"
            className="h-32 md:h-48 w-auto object-contain"
          />
        </div>
      </section>

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
        <div className="flex flex-col items-center gap-4">
          <div className="flex items-center justify-center gap-4">
            <Link to="/upload">
              <Button size="lg" rightIcon={
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
              }>
                서류 업로드
              </Button>
            </Link>
            <Link to="/manual">
              <Button variant="outline" size="lg" rightIcon={
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
              }>
                직접 입력
              </Button>
            </Link>
          </div>
          <p className="text-sm text-slate-500">
            서류가 없으시면 직접 입력으로 간단히 확인해보세요
          </p>
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
          <h2 className="text-2xl font-bold text-slate-900 mb-2">지원금별 필요 서류</h2>
          <p className="text-slate-600 mb-4">
            각 지원금 신청에 필요한 서류를 미리 확인하세요
          </p>
          <div className="flex justify-center gap-4">
            <Button
              variant={showDocuments ? 'primary' : 'outline'}
              onClick={() => setShowDocuments(!showDocuments)}
            >
              {showDocuments ? '서류 목록 접기' : '서류 목록 펼치기'}
            </Button>
            {showDocuments && (
              <Button
                variant="outline"
                onClick={handlePrintDocuments}
                leftIcon={
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                  </svg>
                }
              >
                서류 목록 인쇄
              </Button>
            )}
          </div>
        </div>

        {showDocuments && (
          <div ref={documentsRef} className="grid md:grid-cols-2 gap-6">
            {requiredDocuments.map((program) => (
              <Card key={program.id} variant="default" padding="lg" className={`border-2 ${program.colorClass.split(' ')[2]}`}>
                <CardHeader>
                  <div className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium mb-2 ${program.colorClass}`}>
                    {program.title}
                  </div>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {program.documents.map((doc, idx) => (
                      <li key={idx} className="flex items-start gap-2 text-sm">
                        <span className={`flex-shrink-0 mt-0.5 ${doc.required ? 'text-red-500 font-semibold' : 'text-slate-400'}`}>
                          {doc.required ? '[필수]' : '[선택]'}
                        </span>
                        <span className="text-slate-700">{doc.name}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-4 pt-4 border-t border-slate-200">
                    <p className="text-xs text-slate-500">
                      <span className="font-medium">신청처:</span> {program.applicationSite}
                    </p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
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
