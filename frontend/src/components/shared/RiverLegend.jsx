import React from "react";

/**
 * @typedef {Object} RiverLegendItem
 * @property {string} [name]
 */

/**
 * @typedef {Object} RiverLegendProps
 * @property {RiverLegendItem[] | string[]} items
 * @property {string | null} [activeItem]
 * @property {(itemName: string | null) => void} [setActiveItem]
 * @property {(name: string) => string} colorScale
 * @property {string} [nameKey]
 * @property {'default' | 'pill'} [variant]
 */

/**
 * Shared legend for river charts.
 * @param {RiverLegendProps} props
 * @returns {React.ReactElement | null}
 */
function RiverLegend({
  items,
  activeItem,
  setActiveItem,
  colorScale,
  nameKey = "name",
  variant = "default",
}) {
  if (!items || items.length === 0) return null;

  return (
    <div className={`chart-legend river-legend river-legend--${variant}`}>
      {items.map((item) => {
        const name = typeof item === "string" ? item : item[nameKey] || "";
        const isActive = activeItem === name;
        const isDimmed = Boolean(activeItem) && activeItem !== name;
        const itemClassName = [
          "chart-legend-item",
          "chart-legend-item--interactive",
          "river-legend__item",
          variant === "pill"
            ? "river-legend__item--pill"
            : "river-legend__item--default",
          isActive ? "chart-legend-item--active" : "",
          isDimmed ? "chart-legend-item--dimmed" : "",
        ]
          .filter(Boolean)
          .join(" ");

        return (
          <button
            key={name}
            type="button"
            className={itemClassName}
            onMouseEnter={() => setActiveItem?.(name)}
            onMouseLeave={() => setActiveItem?.(null)}
          >
            <span
              className={`chart-legend-swatch${variant === "pill" ? " chart-legend-swatch--square" : ""}`}
              style={{ "--chart-legend-swatch": colorScale(name) }}
              aria-hidden="true"
            />
            <span
              className={`chart-legend-label${variant === "pill" ? " river-legend__label--pill" : ""}`}
            >
              {name}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export default RiverLegend;
