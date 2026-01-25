import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { MainLayout } from './components/layout';
import HomePage from './pages/HomePage';
import UploadPage from './pages/UploadPage';
import ExtractionPage from './pages/ExtractionPage';
import SubsidyPage from './pages/SubsidyPage';
import ReportPage from './pages/ReportPage';
import ManualInputPage from './pages/ManualInputPage';
import NotFoundPage from './pages/NotFoundPage';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<MainLayout />}>
          <Route index element={<HomePage />} />
          <Route path="upload" element={<UploadPage />} />
          <Route path="manual" element={<ManualInputPage />} />
          <Route path="extraction" element={<ExtractionPage />} />
          <Route path="subsidy" element={<SubsidyPage />} />
          <Route path="report" element={<ReportPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
