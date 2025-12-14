import React from 'react';
import Layout from '@theme/Layout';
import Link from '@docusaurus/Link';
import CodeBlock from '@theme/CodeBlock';
import EditorDemo from '@site/src/components/EditorDemo';
import ArchitectureDiagram from '@site/src/components/ArchitectureDiagram';
import RenderingPipelineDiagram from '@site/src/components/RenderingPipelineDiagram';

export default function Home(): JSX.Element {
  return (
    <Layout
      title="Barocss Editor"
      description="A powerful document editor with DSL-based rendering">
      <main style={{ padding: '3rem 0', backgroundColor: 'var(--ifm-background-color)' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 2rem' }}>
          {/* Hero Section */}
          <div style={{ textAlign: 'center', marginBottom: '4rem' }}>
            <h1 style={{ fontSize: '3.5rem', marginBottom: '1rem', fontWeight: 700, letterSpacing: '-0.02em' }}>
              Barocss Editor
            </h1>
            <p style={{ fontSize: '1.25rem', marginBottom: '2rem', maxWidth: '700px', margin: '0 auto 2rem', lineHeight: '1.6' }} className="homepage-text-secondary">
              A powerful document editor with DSL-based rendering, built for extensibility and performance.
            </p>
            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
              <Link
                className="button button--primary button--lg"
                to="/docs/getting-started">
                Get Started
              </Link>
              <Link
                className="button button--secondary button--lg"
                to="/docs/installation">
                Installation
              </Link>
              <Link
                className="button button--secondary button--lg"
                href="https://github.com/barocss/barocss-editor">
                View on GitHub
              </Link>
            </div>
          </div>

          {/* Features Grid */}
          <div style={{ marginBottom: '4rem' }}>
            <h2 style={{ textAlign: 'center', marginBottom: '2rem', fontSize: '2.25rem', fontWeight: 700, letterSpacing: '-0.01em' }}>Features</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem' }}>
              <div className="homepage-card">
                <h3 style={{ marginTop: 0 }}>🎨 Declarative DSL</h3>
                <p>Define templates using functional DSL (element, data, when, component). Pure functions that make rendering predictable and testable.</p>
              </div>
              <div className="homepage-card">
                <h3 style={{ marginTop: 0 }}>📦 Model-First Architecture</h3>
                <p>All editing operations work on the model, not the DOM. This ensures consistency and makes undo/redo, collaboration, and testing easier.</p>
              </div>
              <div className="homepage-card">
                <h3 style={{ marginTop: 0 }}>🔧 Extensible</h3>
                <p>Create custom extensions and decorators easily. Plugin-based architecture allows you to add new commands and features without modifying core code.</p>
              </div>
              <div className="homepage-card">
                <h3 style={{ marginTop: 0 }}>🛡️ Type-Safe</h3>
                <p>Full TypeScript support with schema validation. Catch errors at compile time and get excellent IDE autocomplete.</p>
              </div>
              <div className="homepage-card">
                <h3 style={{ marginTop: 0 }}>⚡ Fast Rendering</h3>
                <p>Efficient reconciliation with minimal DOM updates. Only changed parts are updated, similar to React's diffing algorithm.</p>
              </div>
              <div className="homepage-card">
                <h3 style={{ marginTop: 0 }}>🌐 Framework Agnostic</h3>
                <p>Core logic independent of UI frameworks. Use with React, Vue, or vanilla JavaScript. Render to any target you need.</p>
              </div>
            </div>
          </div>

          {/* Try It Out */}
          <div style={{ marginBottom: '4rem' }}>
            <h2 style={{ textAlign: 'center', marginBottom: '2rem', fontSize: '2.25rem', fontWeight: 700, letterSpacing: '-0.01em' }}>Try It Out</h2>
            <p style={{ textAlign: 'center', color: '#666', marginBottom: '2rem' }}>
              Edit the text below to see Barocss Editor in action. Try formatting with <strong>bold</strong> and <em>italic</em> text!
            </p>
            <EditorDemo />
          </div>

          {/* Quick Start */}
          <div style={{ marginBottom: '4rem' }} className="homepage-section">
            <h2 style={{ marginTop: 0, fontSize: '2.25rem', fontWeight: 700, letterSpacing: '-0.01em' }}>Quick Start</h2>
            <p style={{ fontSize: '1.1rem', marginBottom: '1.5rem' }}>
              Get started with Barocss Editor in minutes. Install the core packages and create your first editor instance.
            </p>
            <div style={{ marginBottom: '1.5rem' }}>
              <CodeBlock language="bash">
                {`pnpm add @barocss/editor-core @barocss/editor-view-dom @barocss/schema`}
              </CodeBlock>
            </div>
            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
              <Link
                className="button button--primary button--lg"
                to="/docs/getting-started">
                Read Getting Started Guide
              </Link>
              <Link
                className="button button--secondary button--lg"
                to="/docs/examples/basic-editor">
                View Examples
              </Link>
            </div>
          </div>

          {/* Code Example */}
          <div style={{ marginBottom: '4rem' }}>
            <h2 style={{ textAlign: 'center', marginBottom: '1rem', fontSize: '2.25rem', fontWeight: 700, letterSpacing: '-0.01em' }}>Simple Example</h2>
            <p style={{ textAlign: 'center', marginBottom: '2rem', maxWidth: '800px', margin: '0 auto 2rem' }} className="homepage-text-secondary">
              Here's a simple example showing how to create a basic editor with a paragraph node.
            </p>
            <div style={{ maxWidth: '900px', margin: '0 auto' }}>
              <div style={{ marginBottom: '1.5rem' }}>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '0.75rem', color: 'var(--homepage-heading-color)' }}>1. Define Schema</h3>
                <CodeBlock language="typescript">
                  {`import { createSchema } from '@barocss/schema';

const schema = createSchema('my-doc', {
  topNode: 'document',
  nodes: {
    document: { 
      name: 'document', 
      group: 'document', 
      content: 'block+' 
    },
    paragraph: { 
      name: 'paragraph', 
      group: 'block', 
      content: 'inline*' 
    },
    'inline-text': { 
      name: 'inline-text', 
      group: 'inline' 
    }
  }
});`}
                </CodeBlock>
              </div>
              
              <div style={{ marginBottom: '1.5rem' }}>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '0.75rem', color: 'var(--homepage-heading-color)' }}>2. Define Templates</h3>
                <CodeBlock language="typescript">
                  {`import { define, element, data, slot } from '@barocss/dsl';

define('paragraph', element('p', {
  className: 'paragraph'
}, [slot('content')]));

define('inline-text', element('span', {
  className: 'text'
}, [data('text', '')]));`}
                </CodeBlock>
              </div>
              
              <div style={{ marginBottom: '1.5rem' }}>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '0.75rem', color: 'var(--homepage-heading-color)' }}>3. Create DataStore</h3>
                <CodeBlock language="typescript">
                  {`import { DataStore } from '@barocss/datastore';

const dataStore = new DataStore(undefined, schema);`}
                </CodeBlock>
              </div>
              
              <div style={{ marginBottom: '1.5rem' }}>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '0.75rem', color: 'var(--homepage-heading-color)' }}>4. Create Editor</h3>
                <CodeBlock language="typescript">
                  {`import { Editor } from '@barocss/editor-core';
import { EditorViewDOM } from '@barocss/editor-view-dom';
import { createCoreExtensions } from '@barocss/extensions';

const editor = new Editor({
  dataStore,
  schema,
  extensions: createCoreExtensions()
});

const view = new EditorViewDOM(editor, container);
view.mount();`}
                </CodeBlock>
              </div>
            </div>
            <div style={{ textAlign: 'center', marginTop: '2rem' }}>
              <Link
                className="button button--secondary button--lg"
                to="/docs/examples/basic-editor">
                View More Examples
              </Link>
            </div>
          </div>

          {/* Architecture Overview */}
          <div style={{ marginBottom: '4rem' }}>
            <h2 style={{ textAlign: 'center', marginBottom: '1rem', fontSize: '2.25rem', fontWeight: 700, letterSpacing: '-0.01em' }}>Architecture</h2>
            <p style={{ textAlign: 'center', marginBottom: '2rem', maxWidth: '800px', margin: '0 auto 2rem' }} className="homepage-text-secondary">
              Model-first architecture with declarative DSL. All operations work on the model, ensuring consistency and testability.
            </p>
            <ArchitectureDiagram />
            
            <div style={{ marginTop: '4rem' }}>
              <h3 style={{ textAlign: 'center', marginBottom: '1.5rem', fontSize: '1.75rem', fontWeight: 600 }}>Rendering Pipeline</h3>
              <p style={{ textAlign: 'center', marginBottom: '2rem', maxWidth: '800px', margin: '0 auto 2rem' }} className="homepage-text-secondary">
                How data flows from Model to DOM through DSL templates and efficient reconciliation.
              </p>
              <RenderingPipelineDiagram />
            </div>
            
            <div style={{ textAlign: 'center', marginTop: '2rem' }}>
              <Link
                className="button button--secondary button--lg"
                to="/docs/architecture/overview">
                Learn More About Architecture
              </Link>
            </div>
          </div>

          {/* Documentation Links */}
          <div style={{ marginTop: '4rem', paddingTop: '3rem', borderTop: '2px solid var(--homepage-border-color)' }}>
            <h2 style={{ textAlign: 'center', marginBottom: '2rem', fontSize: '2.25rem', fontWeight: 700, letterSpacing: '-0.01em' }}>Documentation</h2>
            <div className="doc-links">
              <Link to="/docs/getting-started" className="doc-link">
                <span className="doc-link-title">🚀 Getting Started</span>
                <span className="doc-link-desc">Learn the basics of Barocss Editor and create your first editor instance</span>
              </Link>
              <Link to="/docs/guides/extension-design" className="doc-link">
                <span className="doc-link-title">🔌 Extension Design</span>
                <span className="doc-link-desc">Create custom extensions to add new commands and functionality</span>
              </Link>
              <Link to="/docs/guides/decorator-guide" className="doc-link">
                <span className="doc-link-title">🎨 Decorator Guide</span>
                <span className="doc-link-desc">Add temporary UI elements like highlights, comments, and selection indicators</span>
              </Link>
              <Link to="/docs/architecture/overview" className="doc-link">
                <span className="doc-link-title">🏗️ Architecture</span>
                <span className="doc-link-desc">Understand how packages are structured and how they connect together</span>
              </Link>
              <Link to="/docs/architecture/packages" className="doc-link">
                <span className="doc-link-title">📦 Package Structure</span>
                <span className="doc-link-desc">Learn about each package's role and how to extend the editor</span>
              </Link>
              <Link to="/docs/api/reference" className="doc-link">
                <span className="doc-link-title">📚 API Reference</span>
                <span className="doc-link-desc">Complete API documentation for all packages and their exports</span>
              </Link>
            </div>
          </div>
        </div>
      </main>
    </Layout>
  );
}
