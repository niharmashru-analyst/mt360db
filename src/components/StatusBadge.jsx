import React from 'react';

const TONE_MAP = {
  OOS: 'danger',
  Excess: 'warning',
  Low: 'warning',
  Healthy: 'success',
  Active: 'success',
  Inactive: 'neutral',
  Delisted: 'danger',
};

export default function StatusBadge({ status }) {
  const tone = TONE_MAP[status] || 'neutral';
  return <span className={`badge badge-${tone}`}>{status}</span>;
}
