# Frontend Documentation

## Overview

This is a **React-based Single Page Application (SPA)** for analyzing and visualizing text documents. The application provides a comprehensive suite of tools for topic extraction, semantic analysis, document comparison, and LLM-powered content processing.

### Application Type
- **Framework**: React 19.2.4 with Vite build system
- **Visualization**: D3.js 7.9.0 for data visualization
- **Architecture**: Component-based SPA with client-side routing
- **Backend Integration**: FastAPI backend with REST API endpoints

---

## Core Functionality

### 1. Content Submission & Management
- **File Upload**: Drag-and-drop file upload supporting HTML, PDF, TXT, MD, FB2, EPUB
- **URL Fetching**: Fetch and analyze content directly from URLs
- **Browser Extension**: Companion browser extension for submitting webpage content
- **Submission List**: Browse, filter, and manage all submitted texts with status tracking

### 2. Text Analysis & Visualization
- **Topic Extraction**: Automatic hierarchical topic detection with multi-level navigation
- **Sentence-Level Analysis**: Granular analysis with read/unread tracking
- **Semantic Markup**: LLM-generated semantic markup (quotes, definitions, comparisons, etc.)
- **Data Extraction**: Automatic extraction of statistics, timelines, and structured data

### 3. Document Comparison
- **Semantic Diff**: Compare two documents with topic-aware matching
- **Similarity Scoring**: Sentence-level similarity percentages
- **Cross-Document Topics**: Identify shared topics across documents

### 4. Task Management
- **Task Queue**: Monitor background processing tasks (topic generation, summarization, mindmaps)
- **LLM Task Control**: Dedicated queue for LLM-powered operations
- **Cache Management**: Inspect and manage cached LLM responses

---

## Charts & Visualizations

### Topic Distribution Charts

| Chart | Purpose | Key Features |
|-------|---------|--------------|
| **CircularPackingChart** | Topics as nested circles | Zoom/pan, drill-down, breadcrumb navigation, read status overlay |
| **TreemapChart** | Hierarchical rectangles | D3 squarify layout, level switching, click-to-drill |
| **MarimekkoChart** | Mosaic chart for 2D relationships | Proportional widths, rotated labels, subtopic navigation |
| **RadarChart** | Spider chart comparison | Multi-axis comparison, zoom controls, hover tooltips |
| **TopicsBarChart** | Horizontal bar chart | Infographic-style bars, value labels, legend |
| **TopicsRiverChart** | Streamgraph flow | Topic density across article, in-stream labels, hover highlighting |
| **SubtopicsRiverChart** | Chapter-based streamgraph | X-axis: sentences, Y-axis: chapters, chapter tick labels |
| **TopicsVennChart** | Force-directed Venn | Overlapping circles show shared words, intersection labels |
| **ArticleStructureChart** | Topic bands + density | Horizontal stacked blocks, rolling average line, character density |

### Hierarchical & Network Visualizations

| Chart | Purpose | Key Features |
|-------|---------|--------------|
| **MindmapResults** | Topic mindmap tree | Expand/collapse, draggable panels, fullscreen mode |
| **PrefixTreeResults** | Word prefix hierarchy | Hierarchical tree, fold/unfold controls |
| **WordTree** | Context tree around pivot | Left/right branching, Bezier curves, sentence highlighting |
| **TopicsTagCloud** | Interactive word cloud | Spiral placement, two-panel layout, keyword exploration |

### Data Visualization Charts

| Chart | Purpose | Key Features |
|-------|---------|--------------|
| **DataBarChart** | Numeric extractions | Horizontal bars, value labels, unit display |
| **DataLineChart** | Time-series data | Monotone curves, dot markers, grid lines |
| **DataTimelineChart** | Event/range timeline | Timeline markers or Gantt bars, date parsing |
| **DataChartOverview** | Multiple extractions | Renders all charts of a specific type |

### Utility Visualization Components

| Component | Purpose |
|-----------|---------|
| **FullScreenGraph** | Modal wrapper for fullscreen chart display |
| **GlobalVisualizationPanels** | Router for global (cross-article) visualizations |
| **VisualizationPanels** | Router for single-article visualizations |
| **GridView** | Tile-based topic exploration with minimap |

---

## Page Components

### Main Pages

| Page | Purpose | Key Features |
|------|---------|--------------|
| **MainPage** | Dashboard & upload | File upload, URL fetch, extension install, navigation cards |
| **TextPage** | Article analysis | Multiple visualization tabs, topic sidebar, markup views |
| **TextListPage** | Submission browser | Table view, filters, read progress indicators |
| **GlobalTopicsPage** | Cross-article topics | Three view modes (Classic/Timeline/Compare), multi-selection |
| **DiffPage** | Document comparison | Side-by-side diff, similarity scores, navigation chips |
| **CachePage** | LLM cache management | Entry table, namespace filtering, bulk delete |
| **TaskControlPage** | Task queue | Task table, add/retry/delete tasks |
| **LlmTaskControlPage** | LLM task queue | Simplified LLM request tracking |
| **WordPage** | Word exploration | Sentences, tree, circles, treemap, summaries for a word |

### View Components

| Component | Purpose |
|-----------|---------|
| **RawTextView** | Character-position highlighted raw text |
| **ArticleSummaryView** | Bullet-point summary with source links |
| **ArticleMarkupView** | Semantic markup with interactive tooltips |
| **GroupedByTopicsView** | Article organized by topic sections |
| **GlobalTopicsClassicView** | Card-based topic sentence display |
| **GlobalTopicsCompareView** | Side-by-side topic comparison |
| **GlobalTopicsTimelineView** | Timeline-style topic display |

---

## Markup Components

### Core Markup System

| Component | Purpose |
|-----------|---------|
| **MarkupRenderer** | Main dispatcher routing segment types to components |
| **HtmlMarkup** | Sanitized HTML rendering |
| **PlainMarkup** | Default fallback for unstructured content |

### Content Markup Types

| Component | Purpose |
|-----------|---------|
| **ParagraphMarkup** | Grouped sentences as paragraphs |
| **TitleMarkup** | Headings (h2-h4) with optional body |
| **QuoteMarkup** | Blockquotes with attribution |
| **ListMarkup** | Ordered/unordered lists |
| **EmphasisMarkup** | Bold, italic, underline, highlight |
| **TableMarkup** | HTML tables |
| **KeyValueMarkup** | Key-value pair displays |
| **DefinitionMarkup** | Term definitions with `<dfn>`/`<dd>` |
| **ComparisonMarkup** | Side-by-side comparison columns |
| **ProConMarkup** | Pros/cons two-column layout |
| **DialogMarkup** | Conversation with speaker avatars |
| **QuestionAnswerMarkup** | Q&A pairs |
| **StepsMarkup** | Numbered procedural steps |
| **TimelineMarkup** | Chronological events |
| **CodeMarkup** | Code snippets with copy button |
| **CalloutMarkup** | Warning/tip/note/important boxes |
| **SummaryMarkup** | Key takeaways |
| **AsideMarkup** | Parenthetical background context |
| **RatingMarkup** | Scored evaluations with stars |
| **AttributionBlockMarkup** | Source attribution statements |
| **DataTrendMarkup** | Data trend visualization wrapper |

---

## Annotation Components

| Component | Purpose |
|-----------|---------|
| **ArticleTreeNav** | Sticky left-panel topic navigation tree |
| **DataExtractionTable** | Inline data extractions with charts |
| **ExtractionBadgeBar** | Compact type badges for extractions |
| **KeyInsightsCard** | Key insights with topic navigation |
| **ReadingGuideLayout** | Two-column overview with chart cycling |
| **ReadingOrderBar** | Horizontal topic pills for reading order |
| **TopicCard** | Annotated topic card with fold/unfold |
| **componentRegistry** | Chart component registry and assembly |

---

## Shared Components

| Component | Purpose |
|-----------|---------|
| **Breadcrumbs** | Hierarchical navigation path |
| **DropdownMenu** | Reusable dropdown with accessibility |
| **HighlightedText** | Text with keyword highlighting |
| **RawTextDisplay** | Raw text with character-range highlighting |
| **RefreshButton** | Submission refresh with loading state |
| **RiverLegend** | Interactive legend for river charts |
| **StatusIndicator** | Task status with expandable details |
| **TopicLevelSwitcher** | Hierarchy level selector |
| **TopicSentencesModal** | Modal for viewing topic sentences |
| **HierarchicalTree** | D3-based interactive tree visualization |

---

## Grid Components

| Component | Purpose |
|-----------|---------|
| **TileGrid** | 2-column grid layout for topic tiles |
| **SentenceList** | Simple sentence list by index |
| **ArticleMinimap** | Visual article structure minimap |
| **SummaryBackground** | Background tile grid for summaries |

---

## Key Features Summary

### Navigation & UX
- **Topic Hierarchy**: Multi-level topic navigation with breadcrumbs
- **Read Tracking**: Sentence-level read/unread status with visual indicators
- **Tooltips**: Contextual actions on text selection
- **Fullscreen Mode**: Most charts support fullscreen viewing
- **Responsive Design**: Container-responsive chart sizing

### Interactivity
- **Drill-Down**: Click to explore subtopics in hierarchical charts
- **Hover Effects**: Highlighting, tooltips, opacity transitions
- **Selection**: Multi-topic selection for comparison
- **Navigation**: Prev/Next topic jumping, scroll-to-sentence

### Data Integration
- **Live Polling**: Real-time status updates for processing tasks
- **API Integration**: RESTful backend communication
- **LLM Integration**: Dynamic LLM provider/model switching
- **Caching**: Client-side caching for performance

### Accessibility
- **ARIA Labels**: Proper accessibility attributes
- **Keyboard Navigation**: Enter/Space/Escape key support
- **Semantic HTML**: Proper use of `<article>`, `<section>`, `<aside>`, etc.
- **Screen Reader Support**: Status announcements and live regions
