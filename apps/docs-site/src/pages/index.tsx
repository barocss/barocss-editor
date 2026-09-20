import React from 'react';
import Layout from '@theme/Layout';
import Link from '@docusaurus/Link';
import BrowserOnly from '@docusaurus/BrowserOnly';
import EditorDemo from '../components/EditorDemo';
import catalogue from '../../.generated/catalogue.json';

const paths = [
  ['Office product kits', 'Build on Note, Word, Slides, and Site.', '/docs/guides/office-products'],
  ['Shared Office UI', 'Set up tokens, CSS, and reusable controls.', '/docs/guides/office-styling'],
  ['JavaScript / DOM', 'Mount a small editor with explicit cleanup.', '/docs/quick-start'],
  ['React', 'Connect the editor to a React component.', '/docs/guides/react-editor'],
];

export default function Home() {
  const groups = [...new Set(catalogue.map((item) => item.group))];
  return (
    <Layout title="Wonffice Developers" description="Package guides and integration examples for the Wonffice Office libraries.">
      <main className="developer-home">
        <header className="developer-hero">
          <p className="developer-eyebrow">WONFFICE DEVELOPERS</p>
          <h1>Build on one Office foundation.</h1>
          <p>Product kits, shared Office UI, and editor libraries. Choose the layer your application needs.</p>
          <Link className="button button--primary" to="/packages">Browse {catalogue.length} packages</Link>
          <Link className="button button--secondary" style={{ marginLeft: 12 }} to="/examples">Try live examples</Link>
        </header>
        <section className="developer-paths" aria-label="Integration paths">
          {paths.map(([title, description, href]) => <Link key={href} to={href} className="developer-path"><h2>{title}</h2><p>{description}</p><span>Read the guide →</span></Link>)}
        </section>
        <section className="developer-catalogue">
          <h2>Find your package</h2>
          <p>Each guide comes from its package README. Versions and entry points follow the package manifest.</p>
          {groups.map((group) => <div key={group} className="developer-group"><h3>{group}</h3><ul>{catalogue.filter((item) => item.group === group).map((item) => <li key={item.id}><Link to={`/packages/${item.id}`}>{item.name}</Link><span>{item.version}</span></li>)}</ul></div>)}
        </section>
        <section className="developer-demo">
          <h2>Try the DOM quick start</h2>
          <p>This editor runs the same code as the <Link to="/docs/quick-start">quick-start guide</Link>. Click the text to edit it.</p>
          <BrowserOnly fallback={<p>Loading editor…</p>}>{() => <EditorDemo />}</BrowserOnly>
        </section>
      </main>
    </Layout>
  );
}
