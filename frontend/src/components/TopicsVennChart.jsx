import React, { useMemo } from 'react';
import * as d3 from 'd3';
import TopicLevelSwitcher from './shared/TopicLevelSwitcher';
import { useTopicLevel } from '../hooks/useTopicLevel';
import { getTopicParts } from '../utils/topicHierarchy';
import './TopicsVennChart.css';

const PALETTE = [
  '#7ba3cc', '#e8a87c', '#85bb65', '#c9a0dc',
  '#d4a5a5', '#a0c4a9', '#cfb997', '#9db4c0',
  '#c2b280', '#b5c7d3', '#d4a76a', '#a5b8d0',
  '#c4d4a0', '#d0b4c8', '#b3cfa0', '#c8b8a0',
];

const STOP_WORDS = new Set([
  'the', 'and', 'or', 'of', 'in', 'to', 'a', 'an', 'is', 'for', 'with', 'on', 'as', 'by', 'at', 'it', 'from', 'that', 'this', 'are', 'be', 'not', 'have', 'has', 'was', 'were', 'but', 'which', 'all', 'can', 'so', 'we', 'will'
]);

function extractWords(text) {
  return (text || '').toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(w => w.length > 2 && !STOP_WORDS.has(w));
}

/** Lighten a hex color by mixing with white at the given ratio (0=original, 1=white). */
function lightenHex(hex, ratio) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const lr = Math.round(r + (255 - r) * ratio);
  const lg = Math.round(g + (255 - g) * ratio);
  const lb = Math.round(b + (255 - b) * ratio);
  return `rgb(${lr},${lg},${lb})`;
}

/** Blend two hex colors at equal weight. */
function blendHex(hexA, hexB) {
  const ra = parseInt(hexA.slice(1, 3), 16), ga = parseInt(hexA.slice(3, 5), 16), ba = parseInt(hexA.slice(5, 7), 16);
  const rb = parseInt(hexB.slice(1, 3), 16), gb = parseInt(hexB.slice(3, 5), 16), bb = parseInt(hexB.slice(5, 7), 16);
  return `rgb(${Math.round((ra + rb) / 2)},${Math.round((ga + gb) / 2)},${Math.round((ba + bb) / 2)})`;
}

function VennComponentGroup({ sets, overlaps }) {
  const svgRef = React.useRef(null);
  const [zoomTransform, setZoomTransform] = React.useState(d3.zoomIdentity);

  const { nodes, links, width, height } = useMemo(() => {
    const simNodes = sets.map((s, i) => ({
      ...s,
      index: i,
      x: 0,
      y: 0,
      r: Math.max(60, Math.min(140, 50 + s.words.size * 4)),
    }));

    const simLinks = overlaps.map(o => ({
      source: simNodes.find(n => n.name === o.sets[0].name).index,
      target: simNodes.find(n => n.name === o.sets[1].name).index,
      sharedWords: o.sharedWords,
    }));

    const simulation = d3.forceSimulation(simNodes)
      .force('link', d3.forceLink(simLinks).id(d => d.index).distance(d => {
        const overlapFraction = Math.min(0.65, Math.max(0.2, d.sharedWords.length / 15));
        return (d.source.r + d.target.r) * (1 - overlapFraction);
      }).strength(1))
      .force('charge', d3.forceManyBody().strength(-200))
      .force('center', d3.forceCenter(0, 0));

    simulation.stop();
    for (let i = 0; i < 400; i++) simulation.tick();

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    simNodes.forEach(n => {
      minX = Math.min(minX, n.x - n.r);
      maxX = Math.max(maxX, n.x + n.r);
      minY = Math.min(minY, n.y - n.r);
      maxY = Math.max(maxY, n.y + n.r);
    });

    const padding = 50;
    minX -= padding; minY -= padding; maxX += padding; maxY += padding;

    simNodes.forEach(n => {
      n.x -= minX;
      n.y -= minY;
    });

    return {
      nodes: simNodes,
      links: simLinks,
      width: Math.max(500, maxX - minX),
      height: Math.max(400, maxY - minY),
    };
  }, [sets, overlaps]);

  React.useEffect(() => {
    if (!svgRef.current) return;
    const svg = d3.select(svgRef.current);
    const zoom = d3.zoom()
      .scaleExtent([0.3, 5])
      .on('zoom', (event) => {
        setZoomTransform(event.transform);
      });
    svg.call(zoom);
  }, []);

  const colorScale = d3.scaleOrdinal(PALETTE);

  return (
    <svg 
      ref={svgRef}
      viewBox={`0 0 ${width} ${height}`} 
      style={{ width: '100%', maxWidth: width, height: 'auto', maxHeight: height, cursor: 'move' }}
      className="venn-chart__svg"
    >
      <defs>
        <pattern id="read-pattern-venn" patternUnits="userSpaceOnUse" width="8" height="8" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="8" stroke="rgba(0,0,0,0.18)" strokeWidth="2" />
        </pattern>
        {links.map((link, i) => {
          const a = nodes[typeof link.source === 'object' ? link.source.index : link.source];
          return (
            <clipPath key={`clip-${i}`} id={`venn-clip-${i}`}>
              <circle cx={a.x} cy={a.y} r={a.r} />
            </clipPath>
          );
        })}
      </defs>

      <g transform={zoomTransform.toString()}>
        {/* Base circles */}
        <g>
          {nodes.map(n => (
            <circle
              key={n.name}
              cx={n.x}
              cy={n.y}
              r={n.r}
              fill={lightenHex(colorScale(n.name), 0.25)}
              stroke={colorScale(n.name)}
              strokeWidth={2}
              opacity={0.72}
            />
          ))}
        </g>

        {/* Intersection regions */}
        <g>
          {links.map((link, i) => {
            const a = nodes[typeof link.source === 'object' ? link.source.index : link.source];
            const b = nodes[typeof link.target === 'object' ? link.target.index : link.target];
            const blend = blendHex(colorScale(a.name), colorScale(b.name));
            return (
              <circle
                key={`intersection-${i}`}
                cx={b.x}
                cy={b.y}
                r={b.r}
                fill={blend}
                opacity={0.55}
                clipPath={`url(#venn-clip-${i})`}
                pointerEvents="none"
              />
            );
          })}
        </g>

        {/* Read-status hatch overlay */}
        <g>
          {nodes.map(n => {
            if (!n.isRead) return null;
            return (
              <circle
                key={`${n.name}-read`}
                cx={n.x}
                cy={n.y}
                r={n.r}
                fill="url(#read-pattern-venn)"
                pointerEvents="none"
              />
            );
          })}
        </g>

        {/* Circle labels */}
        <g>
          {nodes.map(n => {
            const lines = n.displayName.split(/\s+/);
            return (
              <text
                key={`${n.name}-label`}
                x={n.x}
                y={n.y}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize="14"
                fontWeight="bold"
                fill="#2c2c2c"
                pointerEvents="none"
              >
                {lines.map((line, i) => (
                  <tspan
                    x={n.x}
                    dy={i === 0 ? -(lines.length - 1) * 8 : 16}
                    key={i}
                  >
                    {line}
                  </tspan>
                ))}
              </text>
            );
          })}
        </g>

        {/* Shared-word labels */}
        <g>
          {links.map((link, i) => {
            const a = nodes[typeof link.source === 'object' ? link.source.index : link.source];
            const b = nodes[typeof link.target === 'object' ? link.target.index : link.target];
            const midX = (a.x + b.x) / 2;
            const midY = (a.y + b.y) / 2;
            const displayWords = link.sharedWords.slice(0, 3).join(', ') + (link.sharedWords.length > 3 ? '…' : '');
            return (
              <text
                key={`overlap-label-${i}`}
                x={midX}
                y={midY}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize="11"
                fontStyle="italic"
                fill="#3a2a1a"
                stroke="#f9f6f0"
                strokeWidth="3"
                strokeLinejoin="round"
                paintOrder="stroke"
                pointerEvents="none"
              >
                {displayWords}
              </text>
            );
          })}
        </g>
      </g>
    </svg>
  );
}

export default function TopicsVennChart({
  topics,
  readTopics,
}) {
  const scopePath = []; 
  const { selectedLevel, setSelectedLevel, maxLevel } = useTopicLevel(topics, scopePath);

  const { components, overlapsCount } = useMemo(() => {
    if (!topics || topics.length === 0) return { components: [], overlapsCount: 0 };
    
    const levelSets = new Map();
    const safeReadTopics = readTopics instanceof Set ? readTopics : new Set(readTopics || []);

    topics.forEach(t => {
      const parts = getTopicParts(t);
      if (parts.length <= selectedLevel) return;
      const prefix = parts.slice(0, selectedLevel + 1).join(' > ');
      
      if (!levelSets.has(prefix)) {
        levelSets.set(prefix, { 
          name: prefix, 
          displayName: parts[selectedLevel], 
          topics: [], 
          words: new Set() 
        });
      }
      const entry = levelSets.get(prefix);
      entry.topics.push(t);
      
      const relevantParts = parts.slice(selectedLevel + 1);
      relevantParts.forEach(part => {
        extractWords(part).forEach(w => entry.words.add(w));
      });
    });

    const sets = Array.from(levelSets.values()).map(s => {
      s.isRead = s.topics.every(t => safeReadTopics.has(t.name));
      return s;
    });

    const overlaps = [];
    for (let i = 0; i < sets.length; i++) {
      for (let j = i + 1; j < sets.length; j++) {
        const shared = [...sets[i].words].filter(w => sets[j].words.has(w));
        if (shared.length > 0) {
          overlaps.push({ sets: [sets[i], sets[j]], sharedWords: shared });
        }
      }
    }

    const adj = new Map(sets.map(s => [s.name, []]));
    overlaps.forEach(o => {
      adj.get(o.sets[0].name).push(o.sets[1].name);
      adj.get(o.sets[1].name).push(o.sets[0].name);
    });

    const visited = new Set();
    const components = [];

    sets.forEach(s => {
      if (!visited.has(s.name)) {
        const compSets = [];
        const q = [s.name];
        visited.add(s.name);
        while(q.length > 0) {
          const curr = q.shift();
          compSets.push(sets.find(x => x.name === curr));
          adj.get(curr).forEach(neighbor => {
            if (!visited.has(neighbor)) {
              visited.add(neighbor);
              q.push(neighbor);
            }
          });
        }
        components.push({
          sets: compSets,
          overlaps: overlaps.filter(o => compSets.some(cs => cs.name === o.sets[0].name))
        });
      }
    });

    components.sort((a, b) => b.sets.length - a.sets.length);

    return { components, overlapsCount: overlaps.length };
  }, [topics, selectedLevel, readTopics]);

  const overlappingComponents = useMemo(() => 
    components.filter(comp => comp.overlaps.length > 0),
    [components]
  );

  return (
    <div className="venn-chart">
      <TopicLevelSwitcher
        className="venn-chart-level-switcher"
        selectedLevel={selectedLevel}
        maxLevel={maxLevel}
        onChange={setSelectedLevel}
      />

      <p className="venn-chart__description">
        Showing intersections between topics at level {selectedLevel}. Overlapping regions represent shared words from subtopics. Total overlaps: {overlapsCount}.
      </p>

      <div className="venn-chart-body">
        {components.length === 0 ? (
          <p className="venn-chart__empty">No topics available at this level.</p>
        ) : overlappingComponents.length === 0 ? (
          <p className="venn-chart__empty">No overlapping topics found at this level.</p>
        ) : (
          overlappingComponents.map((comp, idx) => (
            <VennComponentGroup key={idx} sets={comp.sets} overlaps={comp.overlaps} />
          ))
        )}
      </div>
    </div>
  );
}
