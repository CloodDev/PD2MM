import { useState } from 'react'
import reactLogo from './assets/react.svg'
import viteLogo from '/vite.svg'
import './App.css'

function App() {
  const [path , setPath] = useState('');
  async function SelectDir() {
    const exportPath = await window.electron.ipcRenderer.invoke('select-directory', 'export');
    setPath(exportPath);
  }
  async function ListMods() {
    const modList = await window.electron.ipcRenderer.invoke('select-directory', 'export');
    console.log(modList);
  }
  return (
    <>
      <div className="modList">
        
      </div>
      <div className="rightList">
        <div className="pathSelector">
          <label htmlFor="pathInput">Select Path:</label>
          <input
            type="text"
            id="pathInput"
            placeholder="Enter path..."
            readOnly
            onClick={() => SelectDir()}
            value={path}
          />
        </div>
      </div>
    </>
  )
}

export default App
