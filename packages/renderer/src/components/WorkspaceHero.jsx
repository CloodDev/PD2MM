import "../styles/workspace.css"

function WorkspaceHero({ configuredPath, totalMods, enabledMods }) {
  return (
    <div className="workspace-hero">
      <div className="workspace-hero-config">
        <span className="workspace-hero-eyebrow">Selected Path</span>
        <div className="workspace-hero-title">{configuredPath}</div>
      </div>
      <div className="workspace-hero-stats">
        <span className="workspace-hero-eyebrow">Mods Enabled</span>
        <div className="hero-stat-container">
          <div className="hero-stat">
            <strong>{enabledMods}</strong>
          </div>
          /
          <div className="hero-stat">
            <strong>{totalMods}</strong>
          </div>
        </div>
      </div>
    </div>
  );
}

export default WorkspaceHero;
