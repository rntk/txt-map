import React from 'react';

export default function ReadProgress({ percentage = 0, label = '', size = 150 }) {
  const linesCount = 40;
  const radius = 45;
  const innerRadius = 35;
  const center = 50;
  const safePercentage = Math.min(100, Math.max(0, percentage));

  const lines = Array.from({ length: linesCount }).map((_, i) => {
    const fraction = i / (linesCount - 1);
    const angle = Math.PI + fraction * Math.PI; 
    
    const x1 = center + radius * Math.cos(angle);
    const y1 = center + radius * Math.sin(angle);
    const x2 = center + innerRadius * Math.cos(angle);
    const y2 = center + innerRadius * Math.sin(angle);

    const isFilled = fraction * 100 <= safePercentage;
    const stroke = isFilled ? '#333' : '#ddd';
    const strokeWidth = 1.5;

    return (
      <line
        key={i}
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
    );
  });

  return (
    <div style={{ width: size, display: 'flex', flexDirection: 'column', alignItems: 'center', fontFamily: 'sans-serif' }}>
      <svg viewBox="0 0 100 55" style={{ width: '100%', display: 'block' }}>
        {lines}
        <text
          x="50"
          y="45"
          textAnchor="middle"
          fontSize="18"
          fontWeight="600"
          fill="#000"
        >
          {Math.round(safePercentage)}%
        </text>
      </svg>
      {label && (
        <div style={{ fontSize: size * 0.09, color: '#666', marginTop: 4, textAlign: 'center' }}>
          {label}
        </div>
      )}
    </div>
  );
}
