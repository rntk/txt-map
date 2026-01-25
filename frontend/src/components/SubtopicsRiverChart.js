import React, { useEffect, useRef, useMemo, useState } from 'react';
import * as d3 from 'd3';
import { calculateBins, smoothBins, estimateCharacterCounts, getRiverColorScale } from '../utils/chart-utils';
import RiverLegend from './shared/RiverLegend';

const SubtopicsRiverChart = ({ topics, subtopics, articleLength }) => {
    const svgRef = useRef(null);
    const containerRef = useRef(null);
    const [activeSubtopic, setActiveSubtopic] = useState(null);

    // Calculate effective length based on actual sentence coverage
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

    const { orderedSubtopics, allSubtopicNames } = useMemo(() => {
        if (!topics) return { orderedSubtopics: [], allSubtopicNames: [] };

        const sortedTopics = [...topics].sort((a, b) => {
            const aMin = a.sentences && a.sentences.length > 0 ? Math.min(...a.sentences) : 0;
            const bMin = b.sentences && b.sentences.length > 0 ? Math.min(...b.sentences) : 0;
            return aMin - bMin;
        });

        const subByParent = {};
        if (subtopics) {
            subtopics.forEach(st => {
                if (!subByParent[st.parent_topic]) subByParent[st.parent_topic] = [];
                subByParent[st.parent_topic].push(st);
            });
        }

        const flatSubs = [];
        const names = [];
        sortedTopics.forEach(topic => {
            const subs = subByParent[topic.name] || [];
            // Add average chars per sentence from parent topic to subtopics for estimation
            const avgChars = (topic.totalChars && topic.sentences?.length) ? topic.totalChars / topic.sentences.length : 120;
            subs.forEach(s => {
                flatSubs.push({ ...s, avgCharsPerSentence: avgChars });
                names.push(s.name);
            });
        });

        return { orderedSubtopics: flatSubs, allSubtopicNames: names };
    }, [topics, subtopics]);

    const colorScale = useMemo(() => getRiverColorScale(allSubtopicNames), [allSubtopicNames]);

    // Global transitions for highlighted subtopic
    useEffect(() => {
        if (!svgRef.current) return;
        const svg = d3.select(svgRef.current);
        const paths = svg.selectAll(".sub-layer");
        const tooltips = d3.select("body").selectAll(".river-tooltip");

        if (activeSubtopic) {
            paths.transition().duration(200)
                .style("opacity", d => d.key === activeSubtopic ? 1 : 0.15)
                .style("stroke", d => d.key === activeSubtopic ? "#333" : "none")
                .style("stroke-width", d => d.key === activeSubtopic ? "1.5px" : "0px");
        } else {
            paths.transition().duration(200)
                .style("opacity", 0.8)
                .style("stroke", "none");
            tooltips.style("opacity", 0);
        }
    }, [activeSubtopic]);

    useEffect(() => {
        if (!orderedSubtopics || orderedSubtopics.length === 0 || !svgRef.current || !effectiveLength) return;

        const container = containerRef.current || svgRef.current.parentElement;
        const containerWidth = container.clientWidth || 800;
        const width = Math.max(containerWidth, 800);
        const height = 600;
        const margin = { top: 60, right: 40, bottom: 80, left: 80 };
        const innerWidth = width - margin.left - margin.right;
        const innerHeight = height - margin.top - margin.bottom;

        d3.select(svgRef.current).selectAll("*").remove();

        const svg = d3.select(svgRef.current)
            .attr("width", width)
            .attr("height", height)
            .attr("viewBox", `0 0 ${width} ${height}`)
            .style("background", "#fff");

        const g = svg.append("g")
            .attr("transform", `translate(${margin.left},${margin.top})`);

        // Use shared utils for binning across the effective article length
        const binCount = Math.max(20, Math.min(60, Math.floor(innerWidth / 30)));
        let bins = calculateBins(binCount, orderedSubtopics, 0, effectiveLength);
        bins = smoothBins(bins, orderedSubtopics);
        bins = estimateCharacterCounts(bins, orderedSubtopics);

        const keys = orderedSubtopics.map(st => st.name);
        const stackedData = d3.stack()
            .offset(d3.stackOffsetWiggle)
            .order(d3.stackOrderInsideOut)
            .keys(keys)
            (bins);

        const maxVal = d3.max(stackedData, layer => d3.max(layer, d => d[1]));
        const minVal = d3.min(stackedData, layer => d3.min(layer, d => d[0]));

        const x = d3.scaleLinear()
            .domain([0, effectiveLength])
            .range([0, innerWidth]);

        const y = d3.scaleLinear()
            .domain([minVal, maxVal])
            .range([innerHeight, 0]);


        const area = d3.area()
            .curve(d3.curveBasis)
            .x(d => x((d.data.rangeStart + d.data.rangeEnd) / 2))
            .y0(d => y(d[0]))
            .y1(d => y(d[1]));

        // Create tooltip
        const tooltip = d3.select("body").selectAll(".river-tooltip").data([0])
            .join("div")
            .attr("class", "river-tooltip")
            .style("position", "absolute")
            .style("background", "rgba(255, 255, 255, 0.95)")
            .style("border", "1px solid #ccc")
            .style("border-radius", "4px")
            .style("padding", "8px 12px")
            .style("font-size", "12px")
            .style("pointer-events", "none")
            .style("opacity", 0)
            .style("box-shadow", "0 2px 4px rgba(0,0,0,0.1)")
            .style("z-index", "1000");

        g.selectAll(".sub-layer")
            .data(stackedData)
            .enter()
            .append("path")
            .attr("class", "sub-layer")
            .attr("d", area)
            .style("fill", d => colorScale(d.key))
            .style("opacity", 0.8)
            .style("cursor", "pointer")
            .on("mouseover", (event, d) => {
                setActiveSubtopic(d.key);
                const subInfo = orderedSubtopics.find(st => st.name === d.key);
                const totalSentences = subInfo?.sentences.length || 0;
                const parentTopic = subInfo?.parent_topic || "Unknown";

                tooltip.style("opacity", 1)
                    .html(`<strong>${d.key}</strong><br/>Chapter: ${parentTopic}<br/>Total: ${totalSentences} sentences`)
                    .style("left", (event.pageX + 10) + "px")
                    .style("top", (event.pageY - 28) + "px");
            })
            .on("mousemove", (event) => {
                tooltip.style("left", (event.pageX + 10) + "px")
                    .style("top", (event.pageY - 28) + "px");
            })
            .on("mouseout", () => {
                setActiveSubtopic(null);
                tooltip.style("opacity", 0);
            });

        // Add X-Axis (Chapters)
        const xAxisScale = d3.scaleLinear().domain([0, effectiveLength]).range([0, innerWidth]);

        // Calculate chapter centers for ticks
        const chapterTicks = topics.map(t => {
            if (!t.sentences || t.sentences.length === 0) return null;
            const minS = Math.min(...t.sentences);
            const maxS = Math.max(...t.sentences);
            return { name: t.name, pos: (minS + maxS) / 2 };
        }).filter(t => t !== null);

        const xAxis = d3.axisBottom(xAxisScale)
            .tickValues(chapterTicks.map(t => t.pos))
            .tickFormat((d, i) => chapterTicks[i]?.name || "");

        const xAxisG = g.append("g")
            .attr("transform", `translate(0, ${innerHeight})`)
            .call(xAxis);

        xAxisG.selectAll("text")
            .style("text-anchor", "end")
            .attr("dx", "-.8em")
            .attr("dy", ".15em")
            .attr("transform", "rotate(-35)")
            .style("font-size", "11px")
            .style("font-weight", "600");

        g.append("text")
            .attr("x", innerWidth / 2)
            .attr("y", innerHeight + margin.bottom - 5)
            .attr("text-anchor", "middle")
            .style("font-size", "12px")
            .style("fill", "#666")
            .style("font-weight", "bold")
            .text("Main Chapters / Topics");

        // Add Y-Axis (Estimated Character Flow)
        const yAxis = d3.axisLeft(y)
            .ticks(5)
            .tickFormat(d => {
                const absVal = Math.abs(d);
                return absVal >= 1000 ? d3.format(".1s")(absVal) : d3.format(".0f")(absVal);
            });

        g.append("g")
            .call(yAxis)
            .style("font-size", "10px");

        g.append("text")
            .attr("transform", "rotate(-90)")
            .attr("x", -innerHeight / 2)
            .attr("y", -margin.left + 25)
            .attr("text-anchor", "middle")
            .style("font-size", "12px")
            .style("fill", "#666")
            .style("font-weight", "bold")
            .text("Estimated Character Density (per bin)");

        // Labels for major subtopic streams
        const labelData = stackedData.map(series => {
            let maxT = 0, maxIdx = 0;
            series.forEach((p, i) => {
                const thick = p[1] - p[0];
                if (thick > maxT) { maxT = thick; maxIdx = i; }
            });
            if (maxT < 0.2) return null;

            const bin = bins[maxIdx];
            return {
                key: series.key,
                x: x((bin.rangeStart + bin.rangeEnd) / 2),
                y: y((series[maxIdx][0] + series[maxIdx][1]) / 2),
                thickness: maxT
            };
        }).filter(d => d !== null)
            .sort((a, b) => b.thickness - a.thickness);

        // Show more labels, filtered by relative thickness
        const topLabels = labelData
            .filter(d => d.thickness > (maxVal - minVal) * 0.01)
            .slice(0, 25);

        g.selectAll(".sub-label")
            .data(topLabels)
            .enter()
            .append("text")
            .attr("class", "sub-label")
            .attr("x", d => d.x)
            .attr("y", d => d.y)
            .text(d => d.key)
            .style("text-anchor", "middle")
            .style("alignment-baseline", "middle")
            .style("font-size", "10px")
            .style("font-weight", "600")
            .style("fill", "#333")
            .style("pointer-events", "none")
            .style("text-shadow", "1px 1px 0px white, -1px -1px 0px white, 1px -1px 0px white, -1px 1px 0px white");

        // Chart Title
        svg.append("text")
            .attr("x", width / 2)
            .attr("y", 25)
            .attr("text-anchor", "middle")
            .style("font-size", "22px")
            .style("font-weight", "bold")
            .style("fill", "#1a1a1a")
            .text("Detailed Subtopic Streams Across Chapters");

    }, [orderedSubtopics, effectiveLength, colorScale, topics]);

    return (
        <div ref={containerRef} className="subtopics-river-chart" style={{
            width: '100%',
            marginTop: '30px',
            backgroundColor: '#fafafa',
            borderRadius: '8px',
            padding: '20px',
            boxSizing: 'border-box'
        }}>
            <div style={{ overflowX: 'auto', border: '1px solid #eee', borderRadius: '8px', padding: '10px', backgroundColor: '#fff' }}>
                <svg ref={svgRef} style={{ display: 'block', margin: '0 auto' }}></svg>
            </div>

            <RiverLegend
                items={[...new Set(allSubtopicNames)]}
                activeItem={activeSubtopic}
                setActiveItem={setActiveSubtopic}
                colorScale={colorScale}
            />
        </div>
    );
};

export default SubtopicsRiverChart;
