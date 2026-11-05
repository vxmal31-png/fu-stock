import { useState } from 'react';
import AppLayout, { type PageId } from '@/components/AppLayout';
import DashboardPage from '@/pages/DashboardPage';
import ProductsPage from '@/pages/ProductsPage';
import ScannerPage from '@/pages/ScannerPage';
import HistoryPage from '@/pages/HistoryPage';
import QrPrintPage from '@/pages/QrPrintPage';

export default function App() {
  const [currentPage, setCurrentPage] = useState<PageId>('dashboard');
  // Key forces a remount when navigating to a page, so it reloads fresh data
  const [navKey, setNavKey] = useState(0);

  const handleNavigate = (page: PageId) => {
    setCurrentPage(page);
    setNavKey((k) => k + 1);
  };

  const renderPage = () => {
    switch (currentPage) {
      case 'dashboard':
        return <DashboardPage key={navKey} />;
      case 'products':
        return <ProductsPage key={navKey} />;
      case 'scanner':
        return <ScannerPage key={navKey} />;
      case 'history':
        return <HistoryPage key={navKey} />;
      case 'qr-print':
        return <QrPrintPage key={navKey} />;
      default:
        return <DashboardPage key={navKey} />;
    }
  };

  return (
    <AppLayout currentPage={currentPage} onNavigate={handleNavigate}>
      {renderPage()}
    </AppLayout>
  );
}
