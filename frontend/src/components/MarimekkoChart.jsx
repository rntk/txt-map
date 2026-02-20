import React, { useState, useRef, useEffect, useMemo } from 'react';

const PALETTE = [
    '#7ba3cc', '#e8a87c', '#85bb65', '#c9a0dc',
    '#d4a5a5', '#a0c4a9', '#cfb997', '#9db4c0',
    '#c2b280', '#b5c7d3', '#d4a76a', '#a5b8d0',
    '#c4d4a0', '#d0b4c8', '#b3cfa0', '#c8b8a0',
];

const MAX_COLUMNS_PER_PAGE = 10;
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
    const values = rows.map(row => Math.max(0, Number(row.value) || 0));
    const valueSum = values.reduce((s, v) => s + v, 0);
    const extraHeight = colHeight - minTotal;
    if (valueSum <= 0) return new Array(rowCount).fill(colHeight / rowCount);
    return values.map(value => MIN_ROW_HEIGHT + (value / valueSum) * extraHeight);
}

function buildColumns(topicNode) {
    const children = (topicNode && topicNode.children) || [];
    return children.map((sub, i) => {
        const subChildren = Array.isArray(sub.children) ? sub.children : [];
        const width = subChildren.length > 0 ? subChildren.length : 1;
        const getValue = c => {
            if (c.text_length != null) return c.text_length;
            if (c.value != null) return c.value;
            if (c.count != null) return c.count;
            return 1;
        };
        const rows = subChildren.length > 0
            ? subChildren.map(c => ({
                name: c.name || '',
                value: getValue(c),
                topicPath: c._topicPath || '',
                topicPosts: Array.isArray(c._topicPosts) ? c._topicPosts : [],
            }))
            : [{
                name: sub.name || '',
                value: getValue(sub),
                topicPath: sub._topicPath || '',
                topicPosts: Array.isArray(sub._topicPosts) ? sub._topicPosts : [],
            }];
        return { name: sub.name || '', width, rows, originalIndex: i };
    });
}

function renderSvg(container, pageColumns, maxColValue) {
    const svgNs = 'http://www.w3.org/2000/svg';

    const chartWidth = Math.max(container.clientWidth, window.innerWidth * 0.9, 1000);
    const baseChartHeight = Math.round(window.innerHeight * 0.85);
    const baseBarAreaHeight = baseChartHeight - BOTTOM_LABEL_HEIGHT - TOP_PADDING;

    const totalWidthUnits = pageColumns.reduce((s, c) => s + c.width, 0);
    const totalGap = COL_GAP * (pageColumns.length - 1);
    const availableWidth = chartWidth - totalGap;

    const requiredBarAreaHeight = pageColumns.reduce((maxH, col) => {
        const colTotalValue = col.rows.reduce((s, r) => s + r.value, 0);
        const proportionalHeight = (colTotalValue / maxColValue) * baseBarAreaHeight;
        const minReadableHeight = Math.max(MIN_COL_HEIGHT, col.rows.length * MIN_ROW_HEIGHT);
        return Math.max(maxH, proportionalHeight, minReadableHeight);
    }, baseBarAreaHeight);

    const barAreaHeight = Math.max(baseBarAreaHeight, requiredBarAreaHeight);
    const chartHeight = TOP_PADDING + barAreaHeight + BOTTOM_LABEL_HEIGHT;

    const svg = document.createElementNS(svgNs, 'svg');
    svg.setAttribute('width', chartWidth);
    svg.setAttribute('height', chartHeight);
    svg.style.display = 'block';

    let x = 0;
    pageColumns.forEach(col => {
        const colWidth = Math.max((col.width / totalWidthUnits) * availableWidth, MIN_COL_WIDTH);
        const colTotalValue = col.rows.reduce((s, r) => s + r.value, 0);
        const proportionalColHeight = (colTotalValue / maxColValue) * barAreaHeight;
        const minReadableColHeight = Math.max(MIN_COL_HEIGHT, col.rows.length * MIN_ROW_HEIGHT);
        const colHeight = Math.max(proportionalColHeight, minReadableColHeight);
        const rowHeights = computeRowHeights(col.rows, colHeight);

        let y = TOP_PADDING + (barAreaHeight - colHeight);

        col.rows.forEach((row, rowIdx) => {
            const rowHeight = rowHeights[rowIdx];

            const rect = document.createElementNS(svgNs, 'rect');
            rect.setAttribute('x', x);
            rect.setAttribute('y', y);
            rect.setAttribute('width', colWidth);
            rect.setAttribute('height', Math.max(rowHeight, 1));
            rect.setAttribute('fill', colorForBar(col.originalIndex, rowIdx, col.rows.length));
            rect.setAttribute('stroke', '#fff');
            rect.setAttribute('stroke-width', '1');

            const title = document.createElementNS(svgNs, 'title');
            title.textContent = `${row.name}\ntext length: ${row.value}`;
            rect.appendChild(title);
            svg.appendChild(rect);

            if (rowHeight >= MIN_ROW_HEIGHT && colWidth >= 50) {
                const fontSize = Math.min(FONT_SIZE_LABEL, colWidth / 4.5);
                const charWidth = fontSize * 0.55;
                const maxChars = Math.max(Math.floor((colWidth - 10) / charWidth), 3);
                const labelText = row.name.length > maxChars
                    ? row.name.slice(0, maxChars - 1) + '\u2026'
                    : row.name;

                const topicPath = typeof row.topicPath === 'string' ? row.topicPath : '';
                const topicPosts = Array.isArray(row.topicPosts) ? row.topicPosts.filter(Boolean) : [];
                const snippetsUrl = topicPath && topicPosts.length > 0
                    ? `/post-grouped-snippets/${encodeURIComponent(topicPosts.join('_'))}?topic=${encodeURIComponent(topicPath)}`
                    : null;

                const text = document.createElementNS(svgNs, 'text');
                text.setAttribute('x', x + 4);
                text.setAttribute('y', y + rowHeight / 2 + fontSize * 0.35);
                text.setAttribute('font-size', fontSize);
                text.setAttribute('fill', '#222');
                text.setAttribute('text-decoration', 'underline');
                text.textContent = labelText;

                if (snippetsUrl) {
                    const link = document.createElementNS(svgNs, 'a');
                    link.setAttribute('href', snippetsUrl);
                    link.setAttribute('target', '_self');
                    link.setAttribute('aria-label', `Open snippets for ${row.name || topicPath}`);
                    link.appendChild(text);
                    svg.appendChild(link);
                } else {
                    text.setAttribute('pointer-events', 'none');
                    svg.appendChild(text);
                }
            }

            y += rowHeight;
        });

        // Bottom label (rotated)
        const labelX = x + colWidth / 2;
        const labelY = TOP_PADDING + barAreaHeight + 14;
        const label = document.createElementNS(svgNs, 'text');
        label.setAttribute('x', labelX);
        label.setAttribute('y', labelY);
        label.setAttribute('font-size', FONT_SIZE_BOTTOM);
        label.setAttribute('fill', '#333');
        label.setAttribute('text-anchor', 'start');
        label.setAttribute('transform', `rotate(40, ${labelX}, ${labelY})`);

        const maxLabelLen = 35;
        const colLabel = col.name.length > maxLabelLen
            ? col.name.slice(0, maxLabelLen - 1) + '\u2026'
            : col.name;
        label.textContent = `${colLabel} (${col.width})`;
        svg.appendChild(label);

        x += colWidth + COL_GAP;
    });

    container.innerHTML = '';
    container.appendChild(svg);
}

function MarimekkoChart({ topicNode }) {
    const [currentPage, setCurrentPage] = useState(0);
    const svgContainerRef = useRef(null);

    const allColumns = useMemo(() => buildColumns(topicNode), [topicNode]);

    const maxColValue = useMemo(
        () => Math.max(...allColumns.map(c => c.rows.reduce((s, r) => s + r.value, 0)), 1),
        [allColumns]
    );

    const totalPages = Math.ceil(allColumns.length / MAX_COLUMNS_PER_PAGE);

    const pageColumns = useMemo(() => {
        const start = currentPage * MAX_COLUMNS_PER_PAGE;
        return allColumns.slice(start, start + MAX_COLUMNS_PER_PAGE);
    }, [allColumns, currentPage]);

    useEffect(() => {
        if (svgContainerRef.current && pageColumns.length > 0) {
            renderSvg(svgContainerRef.current, pageColumns, maxColValue);
        }
    }, [pageColumns, maxColValue]);

    if (allColumns.length === 0) {
        return <div>No subtopics.</div>;
    }

    const start = currentPage * MAX_COLUMNS_PER_PAGE + 1;
    const end = Math.min(start + MAX_COLUMNS_PER_PAGE - 1, allColumns.length);

    return (
        <div>
            {totalPages > 1 && (
                <div className="marimekko-nav">
                    <button
                        className="marimekko-nav-btn"
                        disabled={currentPage === 0}
                        onClick={() => setCurrentPage(p => p - 1)}
                    >
                        ← Previous
                    </button>
                    <span className="marimekko-nav-info">
                        Page {currentPage + 1} / {totalPages}&nbsp; (subtopics {start}–{end} of {allColumns.length})
                    </span>
                    <button
                        className="marimekko-nav-btn"
                        disabled={currentPage >= totalPages - 1}
                        onClick={() => setCurrentPage(p => p + 1)}
                    >
                        Next →
                    </button>
                </div>
            )}
            <div ref={svgContainerRef} />
        </div>
    );
}

export default MarimekkoChart;
