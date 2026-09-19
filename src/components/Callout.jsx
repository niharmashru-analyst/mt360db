import React from 'react';

// tone: 'info' | 'success' | 'warning' | 'danger'
export default function Callout({ tone = 'info', title, children }) {
  return (
    <div className={`callout callout-${tone}`}>
      {title && <div className="callout-title">{title}</div>}
      <div className="callout-body">{children}</div>
    </div>
  );
}
