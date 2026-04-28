import { useCallback, useMemo, useState } from "react";
import { getTemperatureColor } from "../../utils/temperatureColor";

/**
 * Manages topic temperature state: visibility toggle, colour maps.
 * @param {Object} topicTemperatures - Raw temperature data from the API
 * @returns {{
 *   showTemperature: boolean,
 *   toggleTemperature: () => void,
 *   topicTemperatureMap: Map<string, {rate: number}>,
 *   temperatureAvailable: boolean,
 *   temperatureTopicColorMap: Map<string, string>,
 * }}
 */
export function useTopicTemperature(topicTemperatures) {
  const [showTemperature, setShowTemperature] = useState(false);

  const topicTemperatureMap = useMemo(() => {
    if (!topicTemperatures || typeof topicTemperatures !== "object") {
      return new Map();
    }
    const map = new Map();
    Object.entries(topicTemperatures).forEach(([topicName, value]) => {
      const rawRate =
        value && typeof value === "object" ? value.rate : Number(value);
      const rate = Math.max(0, Math.min(100, Math.round(Number(rawRate))));
      if (!Number.isFinite(rate)) return;
      map.set(topicName, { rate });
    });
    return map;
  }, [topicTemperatures]);

  const temperatureAvailable = topicTemperatureMap.size > 0;

  const temperatureTopicColorMap = useMemo(() => {
    const map = new Map();
    topicTemperatureMap.forEach((entry, topicName) => {
      map.set(topicName, getTemperatureColor(entry.rate));
    });
    return map;
  }, [topicTemperatureMap]);

  const toggleTemperature = useCallback(() => {
    setShowTemperature((prev) => !prev);
  }, []);

  return {
    showTemperature,
    toggleTemperature,
    topicTemperatureMap,
    temperatureAvailable,
    temperatureTopicColorMap,
  };
}
