import React, { useEffect, useRef, useMemo } from 'react';
import * as d3 from 'd3';

const TopicsRiverChart = ({ topics, articleLength }) => {
    const svgRef = useRef(null);

    // Process data for the streamgraph
    const data = useMemo(() => {
        if (!topics || topics.length === 0 || !articleLength) return [];

        // Find the last sentence index actually used in topics to avoid empty space at the end
        let maxSentenceIndex = 0;
        topics.forEach(topic => {
            if (topic.sentences && topic.sentences.length > 0) {
                const max = Math.max(...topic.sentences);
                if (max > maxSentenceIndex) maxSentenceIndex = max;
            }
        });

        // Use the max sentence or articleLength, whichever is smaller (though usually maxSentence <= articleLength)
        // Adding a small buffer (+1 or +5) so the last point isn't cut off
        const effectiveLength = Math.min(maxSentenceIndex + 5, articleLength);

        const binCount = 50; // Number of points on the x-axis
        const binSize = Math.max(1, effectiveLength / binCount);

        // Initialize bins
        const bins = Array.from({ length: binCount }, (_, i) => {
            const start = i * binSize;
            const end = (i + 1) * binSize;
            const binData = { x: i }; // x coordinate

            topics.forEach(topic => {
                // Count sentences of this topic in this bin
                const count = topic.sentences.filter(s => s >= start && s < end).length;
                // Apply some smoothing/kernel would be better, but simple binning for now
                binData[topic.name] = count;
            });
            return binData;
        });

        // Simple smoothing (moving average) to make it "river-like"
        const smoothedBins = bins.map((bin, i) => {
            const windowSize = 3;
            const start = Math.max(0, i - 1);
            const end = Math.min(bins.length, i + 2);
            const window = bins.slice(start, end);

            const smoothedBin = { x: bin.x };
            topics.forEach(topic => {
                const sum = window.reduce((acc, curr) => acc + (curr[topic.name] || 0), 0);
                smoothedBin[topic.name] = sum / window.length;
            });
            return smoothedBin;
        });

        return smoothedBins;
    }, [topics, articleLength]);

    useEffect(() => {
        if (!data.length || !svgRef.current) return;

        // Clear previous chart
        d3.select(svgRef.current).selectAll("*").remove();

        const width = 1600;
        const height = 600;
        const margin = { top: 20, right: 30, bottom: 30, left: 40 };

        const svg = d3.select(svgRef.current)
            .attr("width", "100%")
            .attr("height", height)
            .attr("viewBox", `0 0 ${width} ${height}`)
            .attr("preserveAspectRatio", "xMinYMid meet")
            .append("g")
            .attr("transform", `translate(${margin.left},${margin.top})`);

        // List of groups = value of the first column called name -> I show them on the X axis
        const keys = topics.map(t => t.name);

        // Add X axis
        const x = d3.scaleLinear()
            .domain([0, data.length - 1])
            .range([0, width - margin.left - margin.right]);

        // Add Y axis
        // Find max value for domain
        // Since it's a streamgraph (centered), the domain is a bit tricky. 
        // Usually d3.stack automatically calculates it, but with offsetSilhouette it centers around 0.

        // Stack the data
        const stackedData = d3.stack()
            .offset(d3.stackOffsetSilhouette)
            .keys(keys)
            (data);

        // Find the range of the stacked data to set Y domain
        const maxVal = d3.max(stackedData, layer => d3.max(layer, d => d[1]));
        const minVal = d3.min(stackedData, layer => d3.min(layer, d => d[0]));

        const y = d3.scaleLinear()
            .domain([minVal, maxVal])
            .range([height - margin.top - margin.bottom, 0]);

        // Color palette
        const color = d3.scaleOrdinal()
            .domain(keys)
            .range(d3.schemeTableau10);
        // Or custom: ['#e41a1c','#377eb8','#4daf4a','#984ea3','#ff7f00','#ffff33','#a65628','#f781bf']

        // Area generator
        const area = d3.area()
            .curve(d3.curveBasis) // Makes it smooth
            .x(d => x(d.data.x))
            .y0(d => y(d[0]))
            .y1(d => y(d[1]));

        // Show the areas
        svg.selectAll("mylayers")
            .data(stackedData)
            .enter()
            .append("path")
            .style("fill", d => color(d.key))
            .attr("d", area)
            .style("opacity", 0.8)
            .on("mouseover", function (event, d) {
                d3.select(this).style("opacity", 1).style("stroke", "black").style("stroke-width", "1px");
                // Could add tooltop here
            })
            .on("mouseout", function (event, d) {
                d3.select(this).style("opacity", 0.8).style("stroke", "none");
            })
            .append("title") // Simple tooltip
            .text(d => d.key);

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
            // Protect against empty data
            if (series.length === 0) return null;

            const point = series[maxIndex];
            return {
                key: series.key,
                x: x(data[maxIndex].x),
                y: y((point[0] + point[1]) / 2)
            };
        }).filter(d => d !== null);

        svg.selectAll("mylabels")
            .data(labelData)
            .enter()
            .append("text")
            .attr("x", d => d.x)
            .attr("y", d => d.y)
            .text(d => d.key)
            .style("text-anchor", "middle")
            .style("alignment-baseline", "middle")
            .style("font-size", "12px")
            .style("font-weight", "bold")
            .style("fill", "#000")
            .style("pointer-events", "none")
            .style("text-shadow", "1px 1px 0px white, -1px -1px 0px white, 1px -1px 0px white, -1px 1px 0px white"); // Halo for readability

    }, [data, topics]);

    return (
        <div className="topics-river-chart" style={{ width: '100%', height: '600px', minWidth: '100%' }}>
            <svg ref={svgRef} style={{ display: 'block', width: '100%', height: '100%' }}></svg>
        </div>
    );
};

export default TopicsRiverChart;
