import React, { useMemo } from 'react';
import MarimekkoChart from './MarimekkoChart';

// Build a tree from topics whose names are ">" separated paths.
// Returns array of root nodes sorted alphabetically.
const buildTopicTree = (topics) => {
    if (!topics || topics.length === 0) return [];

    const nodeMap = new Map(); // fullPath -> node

    topics.forEach(topic => {
        const parts = topic.name.split('>').map(p => p.trim());
        let path = '';

        for (let i = 0; i < parts.length; i++) {
            const prevPath = path;
            path = path ? `${path} > ${parts[i]}` : parts[i];

            if (!nodeMap.has(path)) {
                nodeMap.set(path, {
                    name: parts[i],
                    fullPath: path,
                    depth: i,
                    sentences: [],
                    children: new Map(),
                });
            }

            // Leaf node: assign sentences from the original topic
            if (i === parts.length - 1) {
                nodeMap.get(path).sentences = topic.sentences || [];
            }

            if (prevPath) {
                nodeMap.get(prevPath).children.set(parts[i], nodeMap.get(path));
            }
        }
    });

    const roots = [];
    nodeMap.forEach(node => {
        if (node.depth === 0) roots.push(node);
    });
    return roots.sort((a, b) => a.name.localeCompare(b.name));
};

// Build chart column data for a root node.
// Columns = children of root, rows inside each column = grandchildren (or the child itself).
const buildRootChartData = (root) => {
    const childNodes = Array.from(root.children.values());

    if (childNodes.length === 0) {
        return [{
            name: root.name,
            value: root.sentences.length || 1,
            children: [{
                name: root.name,
                value: root.sentences.length || 1,
                _topicPath: root.fullPath,
                _topicPosts: root.sentences,
            }],
        }];
    }

    return childNodes.map(child => {
        const grandchildren = Array.from(child.children.values());
        const rows = grandchildren.length > 0
            ? grandchildren.map(gc => ({
                name: gc.name,
                value: gc.sentences.length || 1,
                _topicPath: gc.fullPath,
                _topicPosts: gc.sentences,
            }))
            : [{
                name: child.name,
                value: child.sentences.length || 1,
                _topicPath: child.fullPath,
                _topicPosts: child.sentences,
            }];

        return {
            name: child.name,
            value: rows.reduce((s, r) => s + r.value, 0),
            children: rows,
        };
    });
};

const MarimekkoChartTab = ({ topics, subtopics }) => {
    const topicTree = useMemo(() => buildTopicTree(topics), [topics]);

    const subtopicsChartNode = useMemo(() => {
        if (!subtopics || subtopics.length === 0) return null;

        const subByParent = {};
        subtopics.forEach(st => {
            if (!subByParent[st.parent_topic]) subByParent[st.parent_topic] = [];
            subByParent[st.parent_topic].push(st);
        });

        const children = Object.entries(subByParent)
            .map(([parentName, subs]) => {
                const rows = subs.map(st => ({
                    name: st.name,
                    value: st.sentences ? st.sentences.length : 1,
                    _topicPath: `${parentName} > ${st.name}`,
                    _topicPosts: st.sentences || [],
                }));
                const minSentence = Math.min(
                    ...subs.flatMap(st => st.sentences && st.sentences.length ? st.sentences : [Infinity])
                );
                return { name: parentName, value: rows.length, children: rows, _minSentence: minSentence };
            })
            .sort((a, b) => a._minSentence - b._minSentence);

        return { children };
    }, [subtopics]);

    return (
        <div style={{ backgroundColor: '#fafafa', borderRadius: '8px', padding: '20px', boxSizing: 'border-box' }}>

            {/* Per-root-category overview charts */}
            {topicTree.map(root => (
                <div key={root.fullPath} style={{ marginBottom: '60px' }}>
                    <h2 style={{ marginBottom: '10px' }}>{root.name}</h2>
                    <p style={{ marginBottom: '20px', color: '#666' }}>
                        Columns are subtopics of <strong>{root.name}</strong>. Column width is proportional to the number of sub-subtopics; bar segments are the individual sub-subtopics sized by sentence count.
                    </p>
                    <div style={{ minHeight: '400px', width: '100%', overflowX: 'auto' }}>
                        <MarimekkoChart topicNode={{ children: buildRootChartData(root) }} />
                    </div>
                </div>
            ))}

            {topicTree.length === 0 && (
                <div style={{ color: '#888', marginBottom: '40px' }}>No topics yet.</div>
            )}

            {/* Subtopics Marimekko */}
            <div style={{ marginBottom: '20px' }}>
                <h2 style={{ marginBottom: '10px' }}>Subtopics Marimekko</h2>
                <p style={{ marginBottom: '20px', color: '#666' }}>
                    Subtopics grouped by their parent topics. Columns are parent topics, rows are the subtopics. Column width represents subtopic count.
                </p>
                <div style={{ minHeight: '600px', width: '100%', overflowX: 'auto' }}>
                    {subtopicsChartNode
                        ? <MarimekkoChart topicNode={subtopicsChartNode} />
                        : <div style={{ color: '#888' }}>No subtopics data.</div>
                    }
                </div>
            </div>
        </div>
    );
};

export default MarimekkoChartTab;
