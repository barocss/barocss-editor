import React from 'react';
import Layout from '@theme/Layout';
import Link from '@docusaurus/Link';
import CodeBlock from '@theme/CodeBlock';
import EditorDemo from '@site/src/components/EditorDemo';
import ArchitectureDiagram from '@site/src/components/ArchitectureDiagram';
import RenderingPipelineDiagram from '@site/src/components/RenderingPipelineDiagram';

function HeroSection() {
  return (
    <section className="hero-section">
      <div className="hero-badge">Open Source Document Editor</div>
      <h1 className="hero-title">
        Build powerful editors with{' '}
        <span className="hero-highlight">model-first architecture</span>
      </h1>
      <p className="hero-subtitle">
        Barocss Editor provides a declarative DSL, efficient reconciliation, and extensible
        plugin system — supporting both DOM and React rendering targets.
      </p>
      <div className="hero-actions">
        <Link className="button button--primary button--lg" to="/docs/introduction">
          Get Started
        </Link>
        <Link className="button button--outline button--lg" to="/docs/installation">
          Installation
        </Link>
        <Link
          className="button button--outline button--lg hero-github-btn"
          href="https://github.com/barocss/barocss-editor">
          GitHub
        </Link>
      </div>
      <div className="hero-install">
        <code>pnpm add @barocss/editor-core @barocss/editor-view-dom @barocss/schema @barocss/dsl @barocss/extensions</code>
      </div>
    </section>
  );
}

const FEATURES = [
  {
    title: 'Declarative DSL',
    desc: 'Define templates with pure functions — element, data, slot, when. Predictable, testable, and composable across templates, marks, and decorators.',
  },
  {
    title: 'Model-First',
    desc: 'All editing operations work on the model, not the DOM. Enables reliable undo/redo, real-time collaboration, and deterministic testing.',
  },
  {
    title: 'Dual Renderer',
    desc: 'Same DSL templates render to both DOM (VNode reconciliation) and React (direct ReactNode). Choose the rendering target that fits your stack.',
  },
  {
    title: 'Extensible',
    desc: '30+ built-in extensions for formatting, tables, code blocks, math, and more. Create custom commands, keybindings, and decorators with a clean API.',
  },
  {
    title: 'Type-Safe',
    desc: 'Full TypeScript support with schema validation. Catch structural errors at compile time with strongly typed props for blocks and marks.',
  },
  {
    title: 'Collaboration Ready',
    desc: 'Built-in adapters for Yjs and Liveblocks. AwarenessManager for cursors, ConflictResolver for concurrent edits, BaseAdapter for custom backends.',
  },
] as const;

function FeaturesSection() {
  return (
    <section className="features-section">
      <h2 className="section-title">Why Barocss Editor</h2>
      <div className="features-grid">
        {FEATURES.map((f) => (
          <div key={f.title} className="feature-card">
            <h3>{f.title}</h3>
            <p>{f.desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function DemoSection() {
  return (
    <section className="demo-section">
      <h2 className="section-title">Try It Out</h2>
      <p className="section-subtitle">
        Edit the text below to see the editor in action.
      </p>
      <EditorDemo />
    </section>
  );
}

function CodeExampleSection() {
  return (
    <section className="code-section">
      <h2 className="section-title">Simple Setup</h2>
      <p className="section-subtitle">
        Four steps to a working editor — schema, templates, store, and view.
      </p>
      <div className="code-steps">
        <div className="code-step">
          <div className="code-step-label">1 — Schema</div>
          <CodeBlock language="typescript">
            {`import { createSchema } from '@barocss/schema';

const schema = createSchema('doc', {
  topNode: 'document',
  nodes: {
    document: { name: 'document', group: 'document', content: 'block+' },
    paragraph: { name: 'paragraph', group: 'block', content: 'inline*' },
    'inline-text': { name: 'inline-text', group: 'inline' },
  },
});`}
          </CodeBlock>
        </div>
        <div className="code-step">
          <div className="code-step-label">2 — Templates</div>
          <CodeBlock language="typescript">
            {`import { define, element, data, slot } from '@barocss/dsl';

define('paragraph', element('p', { className: 'paragraph' }, [slot('content')]));
define('inline-text', element('span', {}, [data('text', '')]));`}
          </CodeBlock>
        </div>
        <div className="code-step">
          <div className="code-step-label">3 — DataStore</div>
          <CodeBlock language="typescript">
            {`import { DataStore } from '@barocss/datastore';

const dataStore = new DataStore(undefined, schema);`}
          </CodeBlock>
        </div>
        <div className="code-step">
          <div className="code-step-label">4 — Editor</div>
          <CodeBlock language="typescript">
            {`import { Editor } from '@barocss/editor-core';
import { EditorViewDOM } from '@barocss/editor-view-dom';
import { createCoreExtensions } from '@barocss/extensions';

const editor = new Editor({ dataStore, schema, extensions: createCoreExtensions() });
new EditorViewDOM(editor, container).mount();`}
          </CodeBlock>
        </div>
      </div>
      <div style={{ textAlign: 'center', marginTop: '2rem' }}>
        <Link className="button button--secondary button--lg" to="/docs/quick-start">
          Full Quick Start Guide
        </Link>
      </div>
    </section>
  );
}

function ArchitectureSection() {
  return (
    <section className="architecture-section">
      <h2 className="section-title">Architecture</h2>
      <p className="section-subtitle">
        Model-first architecture with dual rendering targets. Same DSL templates power both DOM and React outputs.
      </p>
      <ArchitectureDiagram />
      <div style={{ marginTop: '3rem' }}>
        <h3 className="section-title" style={{ fontSize: '1.5rem' }}>Rendering Pipeline</h3>
        <p className="section-subtitle">
          Shared template layer fans out to DOM reconciliation or direct React element construction.
        </p>
        <RenderingPipelineDiagram />
      </div>
      <div style={{ textAlign: 'center', marginTop: '2rem' }}>
        <Link className="button button--secondary button--lg" to="/docs/architecture/overview">
          Architecture Deep Dive
        </Link>
      </div>
    </section>
  );
}

const PACKAGES = [
  { name: '@barocss/schema', desc: 'Document structure and validation' },
  { name: '@barocss/datastore', desc: 'Transactional node store with overlay/COW' },
  { name: '@barocss/model', desc: 'Operations, transactions, undo/redo' },
  { name: '@barocss/dsl', desc: 'Declarative template builders' },
  { name: '@barocss/renderer-dom', desc: 'VNode reconciliation to DOM' },
  { name: '@barocss/renderer-react', desc: 'Direct React element output' },
  { name: '@barocss/editor-core', desc: 'Commands, selection, extensions, history' },
  { name: '@barocss/editor-view-dom', desc: 'DOM input, selection sync, decorators' },
  { name: '@barocss/editor-view-react', desc: 'React view layer with hooks' },
  { name: '@barocss/extensions', desc: '30+ built-in extensions' },
  { name: '@barocss/collaboration', desc: 'CRDT/OT base adapter' },
  { name: '@barocss/converter', desc: 'HTML/Markdown/LaTeX/PDF conversion' },
] as const;

function PackagesSection() {
  return (
    <section className="packages-section">
      <h2 className="section-title">Packages</h2>
      <p className="section-subtitle">Modular monorepo — use only what you need.</p>
      <div className="package-list">
        {PACKAGES.map((p) => (
          <div key={p.name} className="package-item">
            <span className="package-name">{p.name}</span>
            <span className="package-description">{p.desc}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

const DOC_LINKS = [
  { to: '/docs/introduction', title: 'Introduction', desc: 'Why Barocss Editor and how it differs from other editors' },
  { to: '/docs/installation', title: 'Installation', desc: 'Install core and optional packages with your package manager' },
  { to: '/docs/quick-start', title: 'Quick Start', desc: 'End-to-end example: schema to a working editor in 5 minutes' },
  { to: '/docs/concepts/rendering', title: 'Rendering', desc: 'How DSL templates become DOM and React elements' },
  { to: '/docs/guides/extension-design', title: 'Extension Design', desc: 'Create commands, keybindings, and decorators' },
  { to: '/docs/api/reference', title: 'API Reference', desc: 'Complete API docs for every package' },
] as const;

function DocsLinksSection() {
  return (
    <section className="docs-links-section">
      <h2 className="section-title">Documentation</h2>
      <div className="doc-links">
        {DOC_LINKS.map((d) => (
          <Link key={d.to} to={d.to} className="doc-link">
            <span className="doc-link-title">{d.title}</span>
            <span className="doc-link-desc">{d.desc}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}

export default function Home(): JSX.Element {
  return (
    <Layout title="Barocss Editor" description="A powerful document editor with DSL-based rendering">
      <main className="homepage">
        <div className="homepage-container">
          <HeroSection />
          <FeaturesSection />
          <DemoSection />
          <CodeExampleSection />
          <ArchitectureSection />
          <PackagesSection />
          <DocsLinksSection />
        </div>
      </main>
    </Layout>
  );
}
