import { Link } from 'react-router-dom';
import { Button } from '../components/common';

export default function NotFoundPage() {
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center text-center">
      <h1 className="text-6xl font-bold text-slate-300 mb-4">404</h1>
      <h2 className="text-2xl font-semibold text-slate-900 mb-2">페이지를 찾을 수 없습니다</h2>
      <p className="text-slate-600 mb-8">요청하신 페이지가 존재하지 않거나 이동되었습니다.</p>
      <Link to="/">
        <Button>홈으로 돌아가기</Button>
      </Link>
    </div>
  );
}
