import { useState, useEffect } from 'react';
import LoginView from './pages/LoginView';
import DashboardView from './pages/DashboardView';
import WorkspaceView from './pages/WorkspaceView';
import './App.css';

function App() {
  const [token, setToken] = useState(localStorage.getItem('token') || null);
  const [username, setUsername] = useState(localStorage.getItem('username') || '');
  const [currentFile, setCurrentFile] = useState(localStorage.getItem('lastFile') || 'img1.jpg');
  const [imagesList, setImagesList] = useState([]);
  
  // Custom State Router: 'login' | 'dashboard' | 'workspace'
  const [currentPage, setCurrentPage] = useState('login');

  // Sync route on mount & when token changes
  useEffect(() => {
    if (token) {
      setCurrentPage('dashboard');
    } else {
      setCurrentPage('login');
    }
  }, [token]);

  // Fetch dynamic images list from backend once authenticated
  useEffect(() => {
    if (!token) {
      setImagesList([]);
      return;
    }
    fetch('http://localhost:3000/api/images', {
      headers: { 'Authorization': `Bearer ${token}` }
    })
    .then(res => res.json())
    .then(data => {
      if (Array.isArray(data)) {
        setImagesList(data);
      }
    })
    .catch(err => console.error("App: Failed to fetch images", err));
  }, [token]);

  // Keep track of the active file in local storage
  useEffect(() => {
    if (currentFile) {
      localStorage.setItem('lastFile', currentFile);
    }
  }, [currentFile]);

  // Login Success Callback
  const handleLoginSuccess = (newToken, user) => {
    setToken(newToken);
    setUsername(user);
    localStorage.setItem('token', newToken);
    localStorage.setItem('username', user);
    setCurrentPage('dashboard');
  };

  // Logout Callback
  const handleLogout = () => {
    setToken(null);
    setUsername('');
    localStorage.removeItem('token');
    localStorage.removeItem('username');
    setCurrentPage('login');
  };

  // File Select Callback (Redirect to editor workspace)
  const handleSelectFile = (filename) => {
    setCurrentFile(filename);
    setCurrentPage('workspace');
  };

  // Render Page Views based on routing state
  const renderPage = () => {
    switch (currentPage) {
      case 'login':
        return <LoginView onLogin={handleLoginSuccess} />;
      case 'dashboard':
        return (
          <DashboardView
            username={username}
            token={token}
            onLogout={handleLogout}
            onSelectFile={handleSelectFile}
            imagesList={imagesList}
          />
        );
      case 'workspace':
        return (
          <WorkspaceView
            currentFile={currentFile}
            token={token}
            imagesList={imagesList}
            onSelectFile={handleSelectFile}
            onBackToDashboard={() => setCurrentPage('dashboard')}
            onLogout={handleLogout}
          />
        );
      default:
        return <LoginView onLogin={handleLoginSuccess} />;
    }
  };

  return (
    <div className="App">
      {renderPage()}
    </div>
  );
}

export default App;
