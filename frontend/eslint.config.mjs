import js from '@eslint/js';
import globals from 'globals';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';

const inlineStyleRule = [
  'error',
  {
    selector: 'JSXAttribute[name.name="style"]',
    message:
      'Use semantic CSS classes instead of inline styles. Runtime-only geometry and coordinate styles must stay in the documented allowlist during the migration.',
  },
];

// Temporary migration allowlist for runtime-only geometry, measured dimensions,
// and data-driven CSS-variable hooks that cannot yet be expressed as static classes.
const inlineStyleAllowlist = [
  'src/components/annotations/ArticleTreeNav.jsx',
  'src/components/ArticleMarkupView.jsx',
  'src/components/ArticleReadProgress.jsx',
  'src/components/ArticleStructureChart.jsx',
  'src/components/CircularPackingChart.jsx',
  'src/components/GlobalReadProgress.jsx',
  'src/components/GlobalTopicsTimelineView.jsx',
  'src/components/grid/ArticleMinimap.jsx',
  'src/components/grid/SummaryBackground.jsx',
  'src/components/grid/TileGrid.jsx',
  'src/components/MarimekkoChart.jsx',
  'src/components/MarimekkoChartTab.jsx',
  'src/components/MindmapResults.jsx',
  'src/components/PrefixTreeResults.jsx',
  'src/components/markup/ComparisonMarkup.jsx',
  'src/components/markup/DialogMarkup.jsx',
  'src/components/RadarChart.jsx',
  'src/components/ReadProgress.jsx',
  'src/components/SummarySourceMenu.jsx',
  'src/components/shared/RawTextDisplay.jsx',
  'src/components/shared/RiverLegend.jsx',
  'src/components/shared/TopicSentencesModal.jsx',
  'src/components/SubtopicsRiverChart.jsx',
  'src/components/TopicTreeNode.jsx',
  'src/components/TopicsTagCloud.jsx',
  'src/components/TextDisplay.jsx',
  'src/components/TopicsBarChart.jsx',
  'src/components/TopicsRiverChart.jsx',
  'src/components/TopicsVennChart.jsx',
  'src/components/WordSelectionPopup.jsx',
];

export default [
  {
    ignores: ['build/**', 'node_modules/**'],
    linterOptions: {
      reportUnusedDisableDirectives: false,
    },
  },
  {
    files: ['src/**/*.{js,jsx}'],
    plugins: {
      react,
      ...reactHooks.configs.flat.recommended.plugins,
    },
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
      globals: {
        ...globals.browser,
        ...globals.node,
        afterEach: 'readonly',
        beforeEach: 'readonly',
        describe: 'readonly',
        expect: 'readonly',
        it: 'readonly',
        test: 'readonly',
        vi: 'readonly',
      },
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-empty': 'off',
      'no-restricted-syntax': inlineStyleRule,
      'no-unexpected-multiline': 'off',
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^(React|_)' }],
      'no-useless-assignment': 'off',
      'react/jsx-uses-vars': 'error',
      'react/react-in-jsx-scope': 'off',
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
  {
    files: inlineStyleAllowlist,
    rules: {
      'no-restricted-syntax': 'off',
    },
  },
];
