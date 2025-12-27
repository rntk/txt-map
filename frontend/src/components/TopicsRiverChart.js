import React, { useEffect, useRef, useMemo, useState } from 'react';
import * as d3 from 'd3';

const TopicsRiverChart = ({ topics, articleLength }) => {
    const svgRef = useRef(null);
    const containerRef = useRef(null);
    const [activeTopic, setActiveTopic] = useState(null);

    // Helper function to calculate bins based on width
    const calculateBins = (containerWidth, topics, effectiveLength) => {
        // ... (keeping existing logic unchanged)
        // Scale binCount to container width - wider containers get more bins
        // Use ~1 bin per 40px for good visual density
        const binCount = Math.max(15, Math.min(60, Math.floor(containerWidth / 40)));
        const binSize = Math.max(1, effectiveLength / binCount);

        // Initialize bins
        const bins = Array.from({ length: binCount }, (_, i) => {
            const start = i * binSize;
            const end = (i + 1) * binSize;
            const binData = { x: i }; // x coordinate

            topics.forEach(topic => {
                // Count sentences of this topic in this bin
                const count = topic.sentences.filter(s => s >= start && s < end).length;
                binData[topic.name] = count;
            });
            return binData;
        });

        // Selective smoothing that preserves zeros - only smooth where there's actual data nearby
        // This prevents topics from appearing as constant bars when sentences are scattered
        const smoothedBins = bins.map((bin, i) => {
            const smoothedBin = { x: bin.x };

            topics.forEach(topic => {
                const currentVal = bin[topic.name] || 0;

                // If current bin has no data, check if neighbors have data
                // Only apply minimal smoothing to create gentle transitions, not fill gaps
                if (currentVal === 0) {
                    // Look at immediate neighbors only
                    const prevVal = i > 0 ? (bins[i - 1][topic.name] || 0) : 0;
                    const nextVal = i < bins.length - 1 ? (bins[i + 1][topic.name] || 0) : 0;

                    // Only create a small transition value if BOTH neighbors have data
                    // This creates smooth edges but doesn't fill large gaps
                    if (prevVal > 0 && nextVal > 0) {
                        // Small transition value for smooth edges
                        smoothedBin[topic.name] = Math.min(prevVal, nextVal) * 0.3;
                    } else if (prevVal > 0 || nextVal > 0) {
                        // Very small tail for single-sided transitions
                        smoothedBin[topic.name] = Math.max(prevVal, nextVal) * 0.1;
                    } else {
                        // No neighbors with data - keep at zero
                        smoothedBin[topic.name] = 0;
                    }
                } else {
                    // Current bin has data - apply gentle smoothing with weighted average
                    const prevVal = i > 0 ? (bins[i - 1][topic.name] || 0) : currentVal;
                    const nextVal = i < bins.length - 1 ? (bins[i + 1][topic.name] || 0) : currentVal;

                    // Weighted average favoring the current value (60% current, 20% each neighbor)
                    smoothedBin[topic.name] = currentVal * 0.6 + prevVal * 0.2 + nextVal * 0.2;
                }
            });
            return smoothedBin;
        });

        // Calculate character counts per bin for each topic
        // We estimate character count based on sentence count and average sentence length
        // If topics have charCount data, use it; otherwise estimate ~100 chars per sentence
        const characterBins = smoothedBins.map(bin => {
            const charBin = { x: bin.x };
            
            topics.forEach(topic => {
                const sentenceCount = bin[topic.name] || 0;
                // Use topic's average character per sentence if available, otherwise estimate
                const avgCharsPerSentence = topic.avgCharsPerSentence || 
                    (topic.totalChars && topic.sentences?.length ? topic.totalChars / topic.sentences.length : 100);
                charBin[topic.name] = sentenceCount * avgCharsPerSentence;
            });
            
            return charBin;
        });

        return characterBins;
    };

    // Memoize keys and color scale so they are stable and usable in both Legend and Chart
    const keys = useMemo(() => topics ? topics.map(t => t.name) : [], [topics]);

    const colorScale = useMemo(() => {
        return d3.scaleOrdinal()
            .domain(keys)
            .range(d3.schemePastel1.concat(d3.schemeSet2));
    }, [keys]);

    // Process data for the streamgraph - compute effective length
    const effectiveLength = useMemo(() => {
        if (!topics || topics.length === 0 || !articleLength) return 0;

        // Find the last sentence index actually used in topics to avoid empty space at the end
        let maxSentenceIndex = 0;
        topics.forEach(topic => {
            if (topic.sentences && topic.sentences.length > 0) {
                const max = Math.max(...topic.sentences);
                if (max > maxSentenceIndex) maxSentenceIndex = max;
            }
        });

        // Use the max sentence or articleLength, whichever is smaller
        // Adding a small buffer (+1 or +5) so the last point isn't cut off
        return Math.min(maxSentenceIndex + 5, articleLength);
    }, [topics, articleLength]);

    // Handle styles update when activeTopic changes
    useEffect(() => {
        if (!svgRef.current) return;

        const svg = d3.select(svgRef.current);
        const paths = svg.selectAll(".stream-layer");
        const tooltips = d3.select("body").selectAll(".river-tooltip");

        if (activeTopic) {
            // Highlight active, dim others
            paths.transition().duration(200)
                .style("opacity", d => d.key === activeTopic ? 1 : 0.2)
                .style("stroke", d => d.key === activeTopic ? "#333" : "none")
                .style("stroke-width", d => d.key === activeTopic ? "1px" : "0px");
        } else {
            // Reset to default
            paths.transition().duration(200)
                .style("opacity", 0.85)
                .style("stroke", "none");

            // Hide tooltip when not active
            tooltips.style("opacity", 0);
        }

    }, [activeTopic]);

    // Draw Chart
    useEffect(() => {
        if (!effectiveLength || !topics || topics.length === 0 || !svgRef.current) return;

        // Get the actual container width
        const container = containerRef.current || svgRef.current.parentElement;
        const containerWidth = container.clientWidth || 800; // Fallback width

        // Calculate bins based on container width
        const data = calculateBins(containerWidth, topics, effectiveLength);
        if (!data.length) return;

        // Clear previous chart
        d3.select(svgRef.current).selectAll("*").remove();

        // Use container width directly - scale to fit
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

        // Calculate total sentences per topic for proper scaling
        const totalSentencesPerTopic = {};
        topics.forEach(topic => {
            totalSentencesPerTopic[topic.name] = topic.sentences ? topic.sentences.length : 0;
        });

        // Stack the data
        const stackedData = d3.stack()
            .offset(d3.stackOffsetWiggle) // Creates the river/streamgraph effect
            .order(d3.stackOrderInsideOut) // Places larger streams in the middle
            .keys(keys)
            (data);

        // Find the range of the stacked data to set Y domain
        const maxVal = d3.max(stackedData, layer => d3.max(layer, d => d[1]));
        const minVal = d3.min(stackedData, layer => d3.min(layer, d => d[0]));

        // Add X axis
        const x = d3.scaleLinear()
            .domain([0, data.length - 1])
            .range([0, innerWidth]);

        // Y axis
        const y = d3.scaleLinear()
            .domain([minVal, maxVal])
            .range([innerHeight, 0]);

        // Area generator
        const area = d3.area()
            .curve(d3.curveBasis) // Smooth curves for river effect
            .x(d => x(d.data.x))
            .y0(d => y(d[0]))
            .y1(d => y(d[1]));

        // Show the areas
        g.selectAll(".stream-layer")
            .data(stackedData)
            .enter()
            .append("path")
            .attr("class", "stream-layer")
            .style("fill", d => colorScale(d.key))
            .attr("d", area)
            .style("opacity", 0.85)
            .on("mouseover", function (event, d) {
                setActiveTopic(d.key);

                // Show tooltip - we can keep this d3 based for mouse tracking
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
            .on("mouseout", function (event, d) {
                setActiveTopic(null);
                tooltip.style("opacity", 0);
            });

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
            .style("z-index", "1000"); // Ensure tooltip is on top

        // Add X axis at the bottom
        const xAxisScale = d3.scaleLinear()
            .domain([0, effectiveLength])
            .range([0, innerWidth]);

        g.append("g")
            .attr("class", "x-axis")
            .attr("transform", `translate(0,${innerHeight})`)
            .call(d3.axisBottom(xAxisScale)
                .ticks(Math.min(10, Math.floor(innerWidth / 80)))
                .tickFormat(d => `${Math.round(d)}`))
            .selectAll("text")
            .style("font-size", "11px");

        // X axis label
        g.append("text")
            .attr("class", "x-axis-label")
            .attr("x", innerWidth / 2)
            .attr("y", innerHeight + 40)
            .style("text-anchor", "middle")
            .style("font-size", "12px")
            .style("fill", "#666")
            .text("Number of Sentences");

        // Add Y axis showing number of characters
        // Use the full range of the stacked data for proper scaling
        const yAxisScale = d3.scaleLinear()
            .domain([minVal, maxVal])
            .range([innerHeight, 0]);

        g.append("g")
            .attr("class", "y-axis")
            .call(d3.axisLeft(yAxisScale)
                .ticks(5)
                .tickFormat(d => {
                    const absVal = Math.abs(d);
                    if (absVal >= 1000) {
                        return d3.format(".1s")(absVal); // e.g., 1.2k
                    }
                    return d3.format(".0f")(absVal);
                }))
            .selectAll("text")
            .style("font-size", "11px");

        // Y axis label
        g.append("text")
            .attr("class", "y-axis-label")
            .attr("transform", "rotate(-90)")
            .attr("x", -innerHeight / 2)
            .attr("y", -45)
            .style("text-anchor", "middle")
            .style("font-size", "12px")
            .style("fill", "#666")
            .text("Number of Characters");

        // Add labels for topics at the widest point of each stream
        const labelData = stackedData.map(series => {
            let maxThickness = 0;
            let maxIndex = 0;
            series.forEach((point, i) => {
                const thickness = point[1] - point[0];
                if (thickness > maxThickness) {
                    maxThickness = thickness;
                    maxIndex = i;
                }
            });
            // Only show label if stream is thick enough (at least 10% of height)
            if (series.length === 0 || maxThickness < 0.1) return null;

            const point = series[maxIndex];
            return {
                key: series.key,
                x: x(data[maxIndex].x),
                y: y((point[0] + point[1]) / 2),
                thickness: maxThickness
            };
        }).filter(d => d !== null);

        // Sort labels by thickness and only show top labels to avoid clutter
        labelData.sort((a, b) => b.thickness - a.thickness);
        const topLabels = labelData.slice(0, Math.min(8, labelData.length));

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
            .style("text-shadow", "1px 1px 0px white, -1px -1px 0px white, 1px -1px 0px white, -1px 1px 0px white, 0px 1px 0px white, 0px -1px 0px white");

        // Chart title removed as requested implicitly (or we can keep it, but usually "Agenda" implies a separate section below)
        // Keeping it for now as "Header"
        svg.append("text")
            .attr("x", width / 2)
            .attr("y", 18)
            .style("text-anchor", "middle")
            .style("font-size", "14px")
            .style("font-weight", "bold")
            .style("fill", "#333")
            .text("Topic Distribution Across Article");

    }, [effectiveLength, topics, keys, colorScale]); // Added keys and colorScale to deps

    return (
        <div ref={containerRef} className="topics-river-chart" style={{
            width: '100%',
            // height is handled by content now
            minWidth: '300px',
            backgroundColor: '#fafafa',
            borderRadius: '8px',
            padding: '10px',
            boxSizing: 'border-box',
            display: 'flex',
            flexDirection: 'column'
        }}>
            <div style={{ height: '520px', width: '100%' }}>
                <svg ref={svgRef} style={{ display: 'block', width: '100%', height: '100%' }}></svg>
            </div>

            {/* Legend / Agenda Section */}
            <div className="chart-legend" style={{
                marginTop: '15px',
                borderTop: '1px solid #eee',
                paddingTop: '15px',
                display: 'flex',
                flexWrap: 'wrap',
                gap: '8px',
                justifyContent: 'center'
            }}>
                {topics && topics.map(topic => (
                    <div
                        key={topic.name}
                        onMouseEnter={() => setActiveTopic(topic.name)}
                        onMouseLeave={() => setActiveTopic(null)}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            padding: '4px 8px',
                            backgroundColor: activeTopic === topic.name ? '#f0f0f0' : 'transparent',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            transition: 'background-color 0.2s',
                            opacity: activeTopic && activeTopic !== topic.name ? 0.4 : 1
                        }}
                    >
                        <div style={{
                            width: '12px',
                            height: '12px',
                            backgroundColor: colorScale(topic.name),
                            borderRadius: '2px',
                            marginRight: '6px'
                        }}></div>
                        <span style={{ fontSize: '12px', color: '#333' }}>
                            {topic.name}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default TopicsRiverChart;
