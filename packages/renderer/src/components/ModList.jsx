import '../styles/mods.css';

function ModList({ modList, selected, onSelect, searchTerm, onSearchChange, getSidebarItemStyle }) {
  const regularMods = modList.filter(
    (mod) => mod.type === 'mod' && mod.name.toLowerCase().includes(searchTerm.toLowerCase())
  );
  const mapMods = modList.filter(
    (mod) => mod.type === 'map' && mod.name.toLowerCase().includes(searchTerm.toLowerCase())
  );
  const modOverrides = modList.filter(
    (mod) => mod.type === 'override' && mod.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const renderModItem = (mod, index) => (
    <div
      key={index}
      className={`mod ${index === selected ? 'selected' : ''} ${mod.enabled === false ? 'disabled' : ''}`}
      style={getSidebarItemStyle(mod, index === selected)}
      onClick={() => onSelect(index)}
    >
      <div className={`modName ${mod.enabled === false ? 'disabled' : ''}`}>
        {mod.type !== 'mod' && (
          <span className="mod-badge">{mod.type === 'map' ? '🗺️' : '📦'}</span>
        )}
        {mod.name}
      </div>
    </div>
  );

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-header-copy">
          <span className="sidebar-eyebrow">Library</span>
          <span className="sidebar-title">Installed Mods</span>
        </div>
        <div className="sidebar-chip">{modList.length} loaded</div>
      </div>

      <div className="sidebar-section">
        <div className="searchContainer">
          <input
            type="text"
            className="searchInput"
            placeholder="Search mods..."
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>

        {modList.length > 0 ? (
          <>
            {regularMods.length > 0 && (
              <>
                <div className="sidebar-section-title">
                  🔧 BLT/BeardLib Mods • {regularMods.length}
                </div>
                <div className="modList">
                  {regularMods.map((mod) => renderModItem(mod, modList.indexOf(mod)))}
                </div>
              </>
            )}

            {mapMods.length > 0 && (
              <>
                <div className="sidebar-section-title">🗺️ Map Mods • {mapMods.length}</div>
                <div className="modList">
                  {mapMods.map((mod) => renderModItem(mod, modList.indexOf(mod)))}
                </div>
              </>
            )}

            {modOverrides.length > 0 && (
              <>
                <div className="sidebar-section-title">
                  📦 Mod Overrides • {modOverrides.length}
                </div>
                <div className="modList">
                  {modOverrides.map((mod) => renderModItem(mod, modList.indexOf(mod)))}
                </div>
              </>
            )}
          </>
        ) : (
          <div className="noMods">
            <div className="noMods-icon">📦</div>
            <p>No mods found</p>
            <p style={{ fontSize: '12px' }}>
              Select your Payday 2 folder via "Select Game Folder" in the header
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default ModList;
