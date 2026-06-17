import '../styles/notifications.css';

function NotificationStack({ notifications }) {
  if (notifications.length === 0) return null;

  return (
    <div className="notification-stack" aria-live="polite" aria-atomic="true">
      {notifications.map((notification) => (
        <div
          key={notification.key}
          className={`notification-toast notification-toast-${notification.tone}`}
        >
          <div className="notification-toast-header">
            <div className="notification-toast-title">{notification.title}</div>
            {notification.tone === 'info' && (
              <div className="notification-toast-pill">Live</div>
            )}
          </div>
          <div className="notification-toast-body">{notification.body}</div>
          {typeof notification.progress === 'number' && (
            <div className="notification-toast-progress">
              <div
                className="notification-toast-progress-fill"
                style={{ width: `${Math.max(0, Math.min(100, notification.progress))}%` }}
              />
            </div>
          )}
          {Array.isArray(notification.actions) && notification.actions.length > 0 && (
            <div className="notification-toast-actions">
              {notification.actions.map((action) => (
                <button
                  key={action.label}
                  className="notification-toast-button"
                  onClick={action.onClick}
                >
                  {action.label}
                </button>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export default NotificationStack;
