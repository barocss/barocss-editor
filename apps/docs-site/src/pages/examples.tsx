import React, { useEffect, useState } from 'react';
import Layout from '@theme/Layout';
import Link from '@docusaurus/Link';
import CodeBlock from '@theme/CodeBlock';
import useBrokenLinks from '@docusaurus/useBrokenLinks';
import useBaseUrl from '@docusaurus/useBaseUrl';
import definitions from '../../.generated/examples.json';

export default function Examples() {
  const brokenLinks = useBrokenLinks();
  definitions.forEach(item => brokenLinks.collectAnchor(item.id));
  const [selected, setSelected] = useState(definitions[0].id);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const followHash = () => {
      const id = window.location.hash.slice(1);
      setSelected(definitions.some(item => item.id === id) ? id : definitions[0].id);
    };
    followHash();
    window.addEventListener('hashchange', followHash);
    return () => window.removeEventListener('hashchange', followHash);
  }, []);
  const sample = definitions.find(item => item.id === selected) ?? definitions[0];
  const runtime = useBaseUrl('/live-examples/');
  return <Layout title="Live examples" description="Try Wonffice library examples and read the exact source that runs them.">
    <main className="examples-gallery">
      <header className="examples-heading">
        <p className="developer-eyebrow">EXAMPLES</p>
        <h1>Try it. Read the code.</h1>
        <p>Working examples from the package guides. Changes here are temporary. Reset or switch examples to start again.</p>
      </header>
      <nav className="examples-nav" aria-label="Choose an example">
        {definitions.map(item => <a key={item.id} id={item.id} href={`#${item.id}`} aria-current={selected === item.id ? 'page' : undefined}>
          {item.title}
        </a>)}
      </nav>
      <section aria-labelledby="sample-title">
        <div className="example-header">
          <div><h2 id="sample-title">{sample.title}</h2><p>{sample.description}</p></div>
          <div className="example-actions">
            <Link to={sample.guide}>Integration guide</Link>
            <button type="button" className="button button--secondary" onClick={() => setRevision(value => value + 1)}>Reset example</button>
          </div>
        </div>
        <p className="example-instruction">{sample.try}</p>
        <div className="example-preview">
          <div className="example-panel-label">LIVE PREVIEW</div>
          <iframe key={`${sample.id}-${revision}`} title={`${sample.title} live preview`} src={`${runtime}#${sample.id}`} />
        </div>
        <section className="example-source" aria-labelledby="source-title">
          <div className="example-header">
            <div><h2 id="source-title">Source code</h2><p>This is the code that runs in the preview.</p></div>
            <a href={`https://github.com/barocss/barocss-editor/blob/main/${sample.source}`}>View source on GitHub</a>
          </div>
          <CodeBlock language={sample.language} showLineNumbers>{sample.code}</CodeBlock>
          <p>See the integration guide for installation and lifecycle details. Office examples also require the <Link to="/docs/guides/office-styling">host styling setup</Link>.</p>
        </section>
      </section>
      <aside className="example-scope">
        <h2>Looking for Word, Slides, or Site?</h2>
        <p>These examples demonstrate embeddable libraries. Complete product hosts also connect storage, navigation, and document layout. Start with the <Link to="/docs/guides/office-products">Office integration guide</Link>.</p>
      </aside>
    </main>
  </Layout>;
}
