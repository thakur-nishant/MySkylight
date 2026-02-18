import React from 'react';

export default function RingProgress({ value = 0, size = 84, stroke = 8, label = 'Progress' }) {
  const normalized = Math.max(0, Math.min(100, Number(value) || 0));
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (normalized / 100) * circumference;
  const valueFontSize = Math.max(14, Math.round(size * 0.18));

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="#e2e8f0"
            strokeWidth={stroke}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="#0284c7"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center text-center">
          <p className="font-semibold text-slate-800 leading-none" style={{ fontSize: valueFontSize }}>
            {Math.round(normalized)}%
          </p>
        </div>
      </div>
      <p className="text-xs text-slate-500">{label}</p>
    </div>
  );
}
