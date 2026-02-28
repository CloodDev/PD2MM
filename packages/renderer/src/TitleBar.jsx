import { useState } from 'react';
import './TitleBar.css';

function TitleBar() {
  const [isMaximized, setIsMaximized] = useState(false);

  const handleMinimize = () => {
    window.electron.ipcRenderer.invoke('window-minimize');
  };

  const handleMaximize = async () => {
    const maximized = await window.electron.ipcRenderer.invoke('window-maximize');
    setIsMaximized(maximized);
  };

  const handleClose = () => {
    window.electron.ipcRenderer.invoke('window-close');
  };

  return (
    <div className="title-bar">
      <div className="title-bar-drag-region">
        <div className="title-bar-title">
          <span className="app-icon">🎮</span>
          <span>Payday 2 Mod Manager</span>
        </div>
      </div>
      <div className="title-bar-controls">
        <button className="title-bar-button minimize" onClick={handleMinimize} title="Minimize">
          <svg width="10" height="10" viewBox="0 0 12 12">
            <rect width="10" height="1" x="1" y="6" />
          </svg>
        </button>
        <button className="title-bar-button maximize" onClick={handleMaximize} title={isMaximized ? "Restore" : "Maximize"}>
          <svg width="10" height="10" viewBox="0 0 12 12">
            <rect width="9" height="9" x="1.5" y="1.5" fill="none" stroke="currentColor" />
          </svg>
        </button>
        <button className="title-bar-button close" onClick={handleClose} title="Close">
          <svg width="10" height="10" viewBox="0 0 12 12">
            <line x1="2" y1="2" x2="10" y2="10" stroke="currentColor" strokeWidth="1.5" />
            <line x1="10" y1="2" x2="2" y2="10" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        </button>
      </div>
    </div>
  );
}

export default TitleBar;
