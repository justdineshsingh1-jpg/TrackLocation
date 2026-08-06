import { HashRouter, Routes, Route, Link } from 'react-router-dom';
import DriverView from './pages/DriverView';
import AdminDashboard from './pages/AdminDashboard';
import { MapPin, LayoutDashboard } from 'lucide-react';

function Landing() {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
      <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full text-center space-y-8">
        <div>
          <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-4">
            <MapPin size={32} />
          </div>
          <h1 className="text-3xl font-bold text-slate-800">Delivery Tracker</h1>
          <p className="text-slate-500 mt-2">Select your role to continue</p>
        </div>
        
        <div className="space-y-4">
          <Link 
            to="/driver" 
            className="flex items-center justify-center gap-3 w-full py-4 px-6 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold transition-all transform hover:scale-[1.02] shadow-md"
          >
            <MapPin size={20} />
            Enter App User View
          </Link>
          
          <Link 
            to="/admin" 
            className="flex items-center justify-center gap-3 w-full py-4 px-6 bg-slate-800 hover:bg-slate-900 text-white rounded-xl font-semibold transition-all transform hover:scale-[1.02] shadow-md"
          >
            <LayoutDashboard size={20} />
            Management Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}

function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/driver" element={<DriverView />} />
        <Route path="/admin" element={<AdminDashboard />} />
      </Routes>
    </HashRouter>
  );
}

export default App;
