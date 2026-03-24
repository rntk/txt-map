import React from 'react';

export default function TableMarkup({ segment }) {
  const { headers = [], rows = [] } = segment.data || {};

  return (
    <div className="markup-segment markup-table-wrap">
      <table className="markup-table">
        {headers.length > 0 && (
          <thead>
            <tr>
              {headers.map((h, i) => <th key={i}>{h}</th>)}
            </tr>
          </thead>
        )}
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {(row.cells || []).map((cell, j) => <td key={j}>{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
