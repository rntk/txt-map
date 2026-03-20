import React from 'react';

const CENTER = 50;
const INNER_RADIUS = 35;
const OUTER_RADIUS = 45;
const STROKE_WIDTH = 1.5;
const VIEWBOX = '0 0 100 55';
const LINE_COUNT = 40;

function buildGaugeLines(percentage) {
  return Array.from({ length: LINE_COUNT }, function createLine(_, index) {
    const fraction = index / (LINE_COUNT - 1);
    const angle = Math.PI + fraction * Math.PI;
    const isFilled = fraction * 100 <= percentage;

    return {
      key: index,
      x1: CENTER + OUTER_RADIUS * Math.cos(angle),
      y1: CENTER + OUTER_RADIUS * Math.sin(angle),
      x2: CENTER + INNER_RADIUS * Math.cos(angle),
      y2: CENTER + INNER_RADIUS * Math.sin(angle),
      stroke: isFilled ? '#333' : '#ddd',
    };
  });
}

export default function ReadProgress({ percentage = 0, label = '', size = 150 }) {
  const safePercentage = Math.min(100, Math.max(0, percentage));
  const gaugeLines = buildGaugeLines(safePercentage);
  const labelFontSize = size * 0.09;

  return (
    <div style={{ width: size, display: 'flex', flexDirection: 'column', alignItems: 'center', fontFamily: 'sans-serif' }}>
      <svg viewBox={VIEWBOX} style={{ width: '100%', display: 'block' }}>
        {gaugeLines.map(function renderLine(line) {
          return (
            <line
              key={line.key}
              x1={line.x1}
              y1={line.y1}
              x2={line.x2}
              y2={line.y2}
              stroke={line.stroke}
              strokeWidth={STROKE_WIDTH}
              strokeLinecap="round"
            />
          );
        })}
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
        <div style={{ fontSize: labelFontSize, color: '#666', marginTop: 4, textAlign: 'center' }}>
          {label}
        </div>
      )}
    </div>
  );
}
