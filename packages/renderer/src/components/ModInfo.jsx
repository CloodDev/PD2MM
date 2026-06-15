function ModInfo({
  modList,
  selected,
  selectedModData,
  isDownloading,
  isCheckingModUpdate,
  onToggle,
  onOpenFolder,
  onCheckUpdate,
  onRemove,
}) {
  if (selected === -1) {
    return (
      <div className="noMods">
        <div className="noMods-icon">📦</div>
        <p>Select a mod to view details</p>
      </div>
    );
  }

  const mod = modList[selected];
  const author = selectedModData.author || 'No author found';
  const version = selectedModData.version || 'No version found';
  const name = selectedModData.name || mod?.name || 'Unknown';
  const image = selectedModData.image;
  const type = mod?.type || 'mod';
  const enabled = mod?.enabled !== false;

  const typeLabel =
    type === 'override'
      ? '📦 Mod Override'
      : type === 'map'
        ? '🗺️ Map Mod'
        : '🔧 BLT/BeardLib Mod';

  return (
    <div className="modInfo">
      <div className="mod-info-header">
        {image && <img className="modImage" src={image} alt={name} />}
        <div className="mod-info-details">
          <h2 className="title">{name}</h2>
          <div className="mod-type-badge">
            {typeLabel}
            {!enabled && ' • Disabled'}
          </div>
          <div>
            <div className="info-label">Author</div>
            <div className="info-value">{author}</div>
          </div>
          <div>
            <div className="info-label">Version</div>
            <div className="info-value">{version}</div>
          </div>
        </div>
      </div>

      <div className="mod-info-body">
        <div className="mod-info-actions">
          <button
            className={`action-button ${enabled ? 'secondary' : 'success'}`}
            onClick={onToggle}
          >
            {enabled ? '⏸️ Disable Mod' : '▶️ Enable Mod'}
          </button>
          <button className="action-button success" onClick={onOpenFolder}>
            📁 Open Mod Folder
          </button>
          <button
            className="action-button secondary"
            onClick={onCheckUpdate}
            disabled={isDownloading || isCheckingModUpdate}
          >
            {isCheckingModUpdate ? '⏳ Checking...' : '🔄 Check for Updates'}
          </button>
          <button className="action-button danger" onClick={onRemove}>
            🗑️ Remove Mod
          </button>
        </div>
      </div>
    </div>
  );
}

export default ModInfo;
