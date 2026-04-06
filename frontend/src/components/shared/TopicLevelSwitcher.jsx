import React from "react";
import { getLevelLabel } from "../../utils/topicHierarchy";
import "./TopicLevelSwitcher.css";

function TopicLevelSwitcher({
  selectedLevel,
  maxLevel,
  onChange,
  label = "Level:",
  className = "",
  getOptionLabel = (level) => `L${level}`,
}) {
  const rootClassName = ["topic-level-switcher", className]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={rootClassName}>
      <span className="topic-level-switcher__label">{label}</span>
      <div className="topic-level-switcher__buttons">
        {Array.from({ length: maxLevel + 1 }, (_, level) => (
          <button
            key={level}
            type="button"
            className={`topic-level-switcher__button${selectedLevel === level ? " active" : ""}`}
            onClick={() => onChange(level)}
          >
            {getOptionLabel(level)}
          </button>
        ))}
      </div>
    </div>
  );
}

export default TopicLevelSwitcher;
