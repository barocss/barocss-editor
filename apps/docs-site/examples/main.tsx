import React, { Component, Suspense, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { samples } from '../.generated/examples/registry';
import './styles.css';

class SampleBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    return this.state.failed ? <p role="alert">This example could not start. Use Reset example to try again.</p> : this.props.children;
  }
}

const id = window.location.hash.slice(1) || 'dom';
const Sample = Object.hasOwn(samples, id) ? samples[id] : undefined;
createRoot(document.getElementById('root')!).render(
  <SampleBoundary><Suspense fallback={<p role="status">Loading example…</p>}>
    <main className={`sample-host sample-${id}`}>
      {Sample ? <Sample /> : <p role="alert">Example not found. Choose an example from the gallery.</p>}
    </main>
  </Suspense></SampleBoundary>,
);
