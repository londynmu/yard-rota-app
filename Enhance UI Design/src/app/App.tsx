import { BrowserRouter } from 'react-router';
import ModernDemoPage from './components/ModernDemoPage';

export default function App() {
  return (
    <BrowserRouter>
      <div className="size-full">
        <ModernDemoPage />
      </div>
    </BrowserRouter>
  );
}