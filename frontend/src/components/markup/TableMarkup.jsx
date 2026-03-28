import React from 'react';
import HighlightedText from '../shared/HighlightedText';

export default function TableMarkup({ segment }) {
  const { headers = [], rows = [] } = segment.data || {};

  return (
    <div className="markup-segment markup-table-wrap">
      <table className="markup-table">
        {headers.length > 0 && (
          <thead>
            <tr>
              {headers.map((h, i) => (
                <th key={i}>
                  <HighlightedText text={h} />
                </th>
              ))}
            </tr>
          </thead>
        )}
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {(row.cells || []).map((cell, j) => (
                <td key={j}>
                  <HighlightedText text={cell} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
