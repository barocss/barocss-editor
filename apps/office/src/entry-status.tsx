import { Component, type ReactNode } from 'react';
import { Button, OfficeLocaleProvider, useOfficeLocale } from '@barocss/office-ui';

export function EntryStatus({ error }: { error?: string }) {
  return <OfficeLocaleProvider><Status error={error} /></OfficeLocaleProvider>;
}
function Status({ error }: { error?: string }) {
  const { t } = useOfficeLocale();
  return <main className="office-entry-status" data-entry-state={error ? 'error' : 'loading'}>
    <header>Wonffice</header>
    <section aria-busy={!error}>
      <h1 tabIndex={-1} ref={element => { if (error) element?.focus(); }}>{t(error ? 'workspace.route.failed' : 'workspace.route.loading')}</h1>
      {error && <><p role="alert">{error}</p><Button onClick={() => location.reload()}>{t('workspace.tree.retry')}</Button>
        <Button onClick={() => location.assign('/')}>{t('workspace.tree.library')}</Button></>}
      {!error && <p role="status">{t('workspace.route.preparing')}</p>}
    </section>
  </main>;
}

/** Import or render failures must leave an accessible recovery surface. */
export class EntryBoundary extends Component<{ children: ReactNode }, { error?: string }> {
  state: { error?: string } = {};
  static getDerivedStateFromError(error: unknown) {
    return { error: error instanceof Error ? error.message : 'Unable to open the editor.' };
  }
  render() { return this.state.error ? <EntryStatus error={this.state.error} /> : this.props.children; }
}
