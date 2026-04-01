import React, { useEffect, useRef, useMemo, useState } from 'react';
import * as d3 from 'd3';
import { calculateBins, smoothBins, estimateCharacterCounts, getRiverColorScale } from '../utils/chart-utils';
import RiverLegend from './shared/RiverLegend';
import TopicSentencesModal from './shared/TopicSentencesModal';
import TopicLevelSwitcher from './shared/TopicLevelSwitcher';
import { buildScopedChartData } from '../utils/topicHierarchy';
import { useTopicLevel } from '../hooks/useTopicLevel';
import './TopicsBarChart.css';

/**
 * @typedef {Object} TopicsRiverChartProps
 * @property {Array<{ name?: string, fullPath?: string, displayName?: string, sentenceIndices?: number[], ranges?: Array<unknown> }>} topics
 * @property {string[]} [sentences]
 * @property {number} [articleLength]
 * @property {(topic: unknown) => void} [onShowInArticle]
 * @property {Set<string> | string[]} [readTopics]
 * @property {(topic: unknown) => void} [onToggleRead]
 * @property {unknown} [markup]
 */

/**
 * @param {TopicsRiverChartProps} props
 */
const TopicsRiverChart = ({
    topics,
    sentences = [],
    articleLength,
    onShowInArticle,
    readTopics,
    onToggleRead,
    markup,
}) => {
    const svgRef = useRef(null);
    const containerRef = useRef(null);
    const [activeTopic, setActiveTopic] = useState(null);
    const { selectedLevel, setSelectedLevel, maxLevel } = useTopicLevel(topics);
    const [selectedTopicForModal, setSelectedTopicForModal] = useState(null);

    const scopedData = useMemo(() => {
        const data = buildScopedChartData(topics, sentences, [], selectedLevel);
        return data.map(d => ({
            ...d,
            sentences: d.sentenceIndices,
            avgCharsPerSentence: (d.totalChars && d.sentenceIndices.length) ? d.totalChars / d.sentenceIndices.length : 100
        }));
    }, [topics, sentences, selectedLevel]);

    // Memoize keys and color scale based on current scope
    const keys = useMemo(() => scopedData.map(t => t.name), [scopedData]);
    const colorScale = useMemo(() => getRiverColorScale(keys), [keys]);

    // Process data for the streamgraph
    const effectiveLength = useMemo(() => {
        if (!topics || topics.length === 0) return 0;
        let maxSentenceIndex = 0;
        topics.forEach(topic => {
            if (topic.sentences && topic.sentences.length > 0) {
                const max = Math.max(...topic.sentences);
                if (max > maxSentenceIndex) maxSentenceIndex = max;
            }
        });
        const validArticleLength = (typeof articleLength === 'number' && articleLength > 0) ? articleLength : Infinity;
        return Math.min(maxSentenceIndex + 5, validArticleLength);
    }, [topics, articleLength]);

    // Handle styles update when activeTopic changes
    useEffect(() => {
        if (!svgRef.current) return;

        const svg = d3.select(svgRef.current);
        const paths = svg.selectAll(".stream-layer");
        const tooltips = d3.select("body").selectAll(".river-tooltip");

        if (activeTopic) {
            paths.transition().duration(200)
                .style("opacity", d => d.key === activeTopic ? 1 : 0.2)
                .style("stroke", d => d.key === activeTopic ? "#333" : "none")
                .style("stroke-width", d => d.key === activeTopic ? "1px" : "0px");
        } else {
            paths.transition().duration(200)
                .style("opacity", 0.85)
                .style("stroke", "none");
            tooltips.style("opacity", 0);
        }
    }, [activeTopic]);

    // Draw Chart
    useEffect(() => {
        if (!effectiveLength || !scopedData || scopedData.length === 0 || !svgRef.current) return;

        const container = containerRef.current || svgRef.current.parentElement;
        const containerWidth = container.clientWidth || 800;

        // Use shared utils for data processing
        const binCount = Math.max(15, Math.min(60, Math.floor(containerWidth / 40)));
        let data = calculateBins(binCount, scopedData, 0, effectiveLength);
        data = smoothBins(data, scopedData);
        data = estimateCharacterCounts(data, scopedData);

        if (!data.length) return;

        d3.select(svgRef.current).selectAll("*").remove();

        const width = Math.max(containerWidth, 600);
        const height = 500;
        const margin = { top: 30, right: 30, bottom: 50, left: 60 };
        const innerWidth = width - margin.left - margin.right;
        const innerHeight = height - margin.top - margin.bottom;

        const svg = d3.select(svgRef.current)
            .attr("width", width)
            .attr("height", height)
            .attr("viewBox", `0 0 ${width} ${height}`)
            .attr("preserveAspectRatio", "xMidYMid meet");

        const g = svg.append("g")
            .attr("transform", `translate(${margin.left},${margin.top})`);

        const totalSentencesPerTopic = {};
        scopedData.forEach(topic => {
            totalSentencesPerTopic[topic.name] = topic.sentences ? topic.sentences.length : 0;
        });

        // Stack with order matching the topics list (first appearance order)
        const stackedData = d3.stack()
            .offset(d3.stackOffsetWiggle)
            .order(d3.stackOrderNone)  // Preserve order as in topics list
            .keys(keys)
            (data);

        const maxVal = d3.max(stackedData, layer => d3.max(layer, d => d[1]));
        const minVal = d3.min(stackedData, layer => d3.min(layer, d => d[0]));

        const x = d3.scaleLinear().domain([0, effectiveLength]).range([0, innerWidth]);
        const y = d3.scaleLinear().domain([minVal, maxVal]).range([innerHeight, 0]);

        const area = d3.area()
            .curve(d3.curveBasis)
            .x(d => x((d.data.rangeStart + d.data.rangeEnd) / 2))
            .y0(d => y(d[0]))
            .y1(d => y(d[1]));

        const tooltip = d3.select("body").selectAll(".river-tooltip").data([0])
            .join("div")
            .attr("class", "river-tooltip chart-tooltip")
            .style("opacity", 0);

        g.selectAll(".stream-layer")
            .data(stackedData)
            .enter()
            .append("path")
            .attr("class", "stream-layer")
            .style("fill", d => colorScale(d.key))
            .attr("d", area)
            .style("opacity", 0.85)
            .style("cursor", "pointer")
            .on("mouseover", function (event, d) {
                setActiveTopic(d.key);
                const totalSentences = totalSentencesPerTopic[d.key];
                tooltip.style("opacity", 1)
                    .html(`<strong>${d.key}</strong><br/>Total: ${totalSentences} sentences`)
                    .style("left", (event.pageX + 10) + "px")
                    .style("top", (event.pageY - 28) + "px");
            })
            .on("mousemove", function (event) {
                tooltip.style("left", (event.pageX + 10) + "px")
                    .style("top", (event.pageY - 28) + "px");
            })
            .on("mouseout", function () {
                setActiveTopic(null);
                tooltip.style("opacity", 0);
            })
            .on("click", function (event, d) {
                const topicObj = scopedData.find(t => t.name === d.key);
                if (topicObj) {
                    setSelectedTopicForModal({
                        name: topicObj.fullPath || topicObj.name,
                        displayName: topicObj.displayName || topicObj.name,
                        fullPath: topicObj.fullPath || topicObj.name,
                        sentenceIndices: topicObj.sentences
                    });
                }
            });

        const xAxisScale = d3.scaleLinear().domain([0, effectiveLength]).range([0, innerWidth]);
        g.append("g")
            .attr("class", "x-axis")
            .attr("transform", `translate(0,${innerHeight})`)
            .call(d3.axisBottom(xAxisScale)
                .ticks(Math.min(10, Math.floor(innerWidth / 80)))
                .tickFormat(d => `${Math.round(d)}`));

        g.append("text")
            .attr("class", "x-axis-label")
            .attr("x", innerWidth / 2)
            .attr("y", innerHeight + 40)
            .style("text-anchor", "middle")
            .style("font-size", "12px")
            .style("fill", "#666")
            .text("Number of Sentences");

        const yAxisScale = d3.scaleLinear().domain([minVal, maxVal]).range([innerHeight, 0]);
        g.append("g")
            .attr("class", "y-axis")
            .call(d3.axisLeft(yAxisScale)
                .ticks(5)
                .tickFormat(d => {
                    const absVal = Math.abs(d);
                    return absVal >= 1000 ? d3.format(".1s")(absVal) : d3.format(".0f")(absVal);
                }));

        g.append("text")
            .attr("class", "y-axis-label")
            .attr("transform", "rotate(-90)")
            .attr("x", -innerHeight / 2)
            .attr("y", -45)
            .style("text-anchor", "middle")
            .style("font-size", "12px")
            .style("fill", "#666")
            .text("Number of Characters (Estimated)");

        // Stream labels
        const labelData = stackedData.map(series => {
            let maxThickness = 0, maxIndex = 0;
            series.forEach((point, i) => {
                const thickness = point[1] - point[0];
                if (thickness > maxThickness) {
                    maxThickness = thickness;
                    maxIndex = i;
                }
            });
            if (series.length === 0 || maxThickness < 0.1) return null;

            const bin = data[maxIndex];
            return {
                key: series.key,
                x: x((bin.rangeStart + bin.rangeEnd) / 2),
                y: y((series[maxIndex][0] + series[maxIndex][1]) / 2),
                thickness: maxThickness
            };
        }).filter(d => d !== null);

        labelData.sort((a, b) => b.thickness - a.thickness);
        // Increase limit to show more labels, and filter by minimal thickness to avoid clutter
        const topLabels = labelData
            .filter(d => d.thickness > (maxVal - minVal) * 0.01)
            .slice(0, 20);

        g.selectAll(".stream-label")
            .data(topLabels)
            .enter()
            .append("text")
            .attr("class", "stream-label")
            .attr("x", d => d.x)
            .attr("y", d => d.y)
            .text(d => d.key)
            .style("text-anchor", "middle")
            .style("alignment-baseline", "middle")
            .style("font-size", "11px")
            .style("font-weight", "600")
            .style("fill", "#333")
            .style("pointer-events", "none")
            .style("text-shadow", "1px 1px 0px white, -1px -1px 0px white, 1px -1px 0px white, -1px 1px 0px white");

        svg.append("text")
            .attr("x", width / 2)
            .attr("y", 18)
            .style("text-anchor", "middle")
            .style("font-size", "14px")
            .style("font-weight", "bold")
            .style("fill", "#333")
            .text("Topic Distribution Across Article");

        return () => {
            d3.select('body').selectAll('.river-tooltip').remove();
        };
    }, [effectiveLength, scopedData, keys, colorScale]);

    return (
        <div ref={containerRef} className="topics-river-chart chart-surface chart-surface--river">
            <TopicLevelSwitcher
                className="topics-river-chart__level-switcher"
                selectedLevel={selectedLevel}
                maxLevel={maxLevel}
                onChange={setSelectedLevel}
            />

            <div className="topics-river-chart__canvas">
                <svg ref={svgRef} className="topics-river-chart__svg chart-svg chart-svg--full-width"></svg>
            </div>

            <RiverLegend
                items={scopedData}
                activeItem={activeTopic}
                setActiveItem={setActiveTopic}
                colorScale={colorScale}
            />

            {selectedTopicForModal && (
                <TopicSentencesModal
                    topic={selectedTopicForModal}
                    sentences={sentences}
                    onClose={() => setSelectedTopicForModal(null)}
                    onShowInArticle={onShowInArticle}
                    readTopics={readTopics}
                    onToggleRead={onToggleRead}
                    markup={markup}
                />
            )}
        </div>
    );
};

export default TopicsRiverChart;
