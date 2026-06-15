function WorkspaceHero({ configuredPath, totalMods, enabledMods }) {
  return (
    <div className="workspace-hero">
      <div className="workspace-hero-copy">
        <span className="workspace-hero-kicker">Current setup</span>
        <div className="workspace-hero-title">{configuredPath}</div>
        <div className="workspace-hero-subtitle">
          Use the downloader, then manage installs from the list below.
        </div>
      </div>
      <div className="workspace-hero-stats">
        <div className="hero-stat">
          <span>Mods</span>
          <strong>{totalMods}</strong>
        </div>
        <div className="hero-stat">
          <span>Active</span>
          <strong>{enabledMods}</strong>
        </div>
      </div>
    </div>
  );
}

export default WorkspaceHero;
