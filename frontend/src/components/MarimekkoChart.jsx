import React, { useMemo } from 'react';

const PALETTE = [
    '#7ba3cc', '#e8a87c', '#85bb65', '#c9a0dc',
    '#d4a5a5', '#a0c4a9', '#cfb997', '#9db4c0',
    '#c2b280', '#b5c7d3', '#d4a76a', '#a5b8d0',
    '#c4d4a0', '#d0b4c8', '#b3cfa0', '#c8b8a0',
];

const BOTTOM_LABEL_HEIGHT = 140;
const TOP_PADDING = 20;
const COL_GAP = 6;
const MIN_COL_WIDTH = 80;
const FONT_SIZE_LABEL = 16;
const FONT_SIZE_BOTTOM = 15;
const MIN_ROW_HEIGHT = FONT_SIZE_LABEL + 8;
const MIN_COL_HEIGHT = FONT_SIZE_LABEL + 10;

function colorForBar(colIndex, rowIndex, rowCount) {
    const base = PALETTE[colIndex % PALETTE.length];
    const r = parseInt(base.slice(1, 3), 16);
    const g = parseInt(base.slice(3, 5), 16);
    const b = parseInt(base.slice(5, 7), 16);
    const factor = rowCount > 1 ? 0.7 + 0.6 * (rowIndex / (rowCount - 1)) : 1.0;
    const clamp = v => Math.min(255, Math.max(0, Math.round(v)));
    return `rgb(${clamp(r * factor)}, ${clamp(g * factor)}, ${clamp(b * factor)})`;
}

function computeRowHeights(rows, colHeight) {
    const rowCount = rows.length;
    if (rowCount === 0) return [];
    const minTotal = rowCount * MIN_ROW_HEIGHT;
    if (colHeight <= minTotal) return new Array(rowCount).fill(colHeight / rowCount);
    const values = rows.map(row => Math.sqrt(Math.max(0, Number(row.totalChars || row.value) || 0)));
    const valueSum = values.reduce((s, v) => s + v, 0);
    const extraHeight = colHeight - minTotal;
    if (valueSum <= 0) return new Array(rowCount).fill(colHeight / rowCount);
    return values.map(value => MIN_ROW_HEIGHT + (value / valueSum) * extraHeight);
}

function getColWeight(col) {
    const raw = Math.max(col.totalChars > 0 ? col.totalChars : (col.sentenceCount || 1), 1);
    return Math.sqrt(raw);
}

/**
 * @typedef {Object} MarimekkoChartColumnRow
 * @property {string} displayName
 * @property {number} sentenceCount
 * @property {number[]} [sentenceIndices]
 * @property {boolean} [isDrillable]
 */

/**
 * @typedef {Object} MarimekkoChartColumn
 * @property {string} displayName
 * @property {number} sentenceCount
 * @property {number} [totalChars]
 * @property {MarimekkoChartColumnRow[]} rows
 */

/**
 * @typedef {Object} MarimekkoChartProps
 * @property {MarimekkoChartColumn[]} columns
 * @property {number} containerWidth
 * @property {(row: MarimekkoChartColumnRow) => void} [onBarClick]
 */

/**
 * @param {MarimekkoChartProps} props
 */
function MarimekkoChart({ columns, containerWidth, onBarClick }) {
    const layout = useMemo(() => {
        if (!columns || columns.length === 0) return null;

        const totalWeight = columns.reduce((s, c) => s + getColWeight(c), 0);
        const maxColValue = Math.max(...columns.map(getColWeight), 1);

        const baseBarAreaHeight = Math.max(
            Math.round((typeof window !== 'undefined' ? window.innerHeight : 600) * 0.65),
            400
        );

        const totalGap = COL_GAP * (columns.length - 1);
        const availableWidth = Math.max(containerWidth - totalGap, columns.length * MIN_COL_WIDTH);

        // Natural column widths
        const colWidths = columns.map(col =>
            Math.max((getColWeight(col) / totalWeight) * availableWidth, MIN_COL_WIDTH)
        );
        const svgWidth = Math.max(
            colWidths.reduce((s, w) => s + w, 0) + totalGap,
            containerWidth
        );

        // Column heights proportional to value
        const colHeights = columns.map(col => {
            const val = getColWeight(col);
            const proportional = (val / maxColValue) * baseBarAreaHeight;
            const minReadable = Math.max(MIN_COL_HEIGHT, col.rows.length * MIN_ROW_HEIGHT);
            return Math.max(proportional, minReadable);
        });

        const barAreaHeight = Math.max(...colHeights, baseBarAreaHeight);
        const svgHeight = TOP_PADDING + barAreaHeight + BOTTOM_LABEL_HEIGHT;

        return { colWidths, colHeights, svgWidth, svgHeight, barAreaHeight };
    }, [columns, containerWidth]);

    if (!columns || columns.length === 0) {
        return <div className="chart-empty-state chart-empty-state--panel">No data to display.</div>;
    }

    if (!layout) return null;

    const { colWidths, colHeights, svgWidth, svgHeight, barAreaHeight } = layout;

    const elements = [];
    let x = 0;

    columns.forEach((col, colIdx) => {
        const colWidth = colWidths[colIdx];
        const colHeight = colHeights[colIdx];
        const rowHeights = computeRowHeights(col.rows, colHeight);

        let y = TOP_PADDING + (barAreaHeight - colHeight);

        col.rows.forEach((row, rowIdx) => {
            const rowHeight = rowHeights[rowIdx];
            const fillColor = colorForBar(colIdx, rowIdx, col.rows.length);
            const isClickable = !!(onBarClick && (row.isDrillable || (row.sentenceIndices && row.sentenceIndices.length > 0)));

            elements.push(
                <rect
                    key={`rect-${colIdx}-${rowIdx}`}
                    x={x}
                    y={y}
                    width={colWidth}
                    height={Math.max(rowHeight, 1)}
                    fill={fillColor}
                    stroke="#fff"
                    strokeWidth={1}
                    className={isClickable ? 'marimekko-chart__bar marimekko-chart__bar--interactive' : 'marimekko-chart__bar'}
                    onClick={isClickable ? () => onBarClick(row) : undefined}
                >
                    <title>{`${row.displayName}\nSentences: ${row.sentenceCount}`}</title>
                </rect>
            );

            if (rowHeight >= MIN_ROW_HEIGHT && colWidth >= 50) {
                const fontSize = Math.min(FONT_SIZE_LABEL, colWidth / 4.5);
                const charWidth = fontSize * 0.55;
                const maxChars = Math.max(Math.floor((colWidth - 10) / charWidth), 3);
                const labelText = row.displayName.length > maxChars
                    ? row.displayName.slice(0, maxChars - 1) + '\u2026'
                    : row.displayName;

                elements.push(
                    <text
                        key={`text-${colIdx}-${rowIdx}`}
                        x={x + 4}
                        y={y + rowHeight / 2 + fontSize * 0.35}
                        fontSize={fontSize}
                        fill="#222"
                        className={`marimekko-chart__label${isClickable ? ' marimekko-chart__label--interactive' : ''}`}
                        style={{ pointerEvents: isClickable ? 'auto' : 'none' }}
                        onClick={isClickable ? () => onBarClick(row) : undefined}
                    >
                        {labelText}
                    </text>
                );
            }

            y += rowHeight;
        });

        // Bottom label (rotated)
        const labelX = x + colWidth / 2;
        const labelY = TOP_PADDING + barAreaHeight + 14;
        const maxLabelLen = 35;
        const colLabel = col.displayName.length > maxLabelLen
            ? col.displayName.slice(0, maxLabelLen - 1) + '\u2026'
            : col.displayName;

        elements.push(
            <text
                key={`label-${colIdx}`}
                x={labelX}
                y={labelY}
                fontSize={FONT_SIZE_BOTTOM}
                fill="#333"
                textAnchor="start"
                transform={`rotate(40, ${labelX}, ${labelY})`}
                className="marimekko-chart__bottom-label"
            >
                {`${colLabel} (${col.sentenceCount})`}
            </text>
        );

        x += colWidth + COL_GAP;
    });

    return (
        <svg width={svgWidth} height={svgHeight} className="marimekko-chart__svg chart-svg">
            {elements}
        </svg>
    );
}

export default MarimekkoChart;
