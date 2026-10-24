import { Component, useState, type ReactNode } from 'react';
import { rawBackup, saveBackupFile } from '../storage';

// Last resort if the sheet fails to render: the saved characters can still be exported, then the app reloaded.
export class CrashScreen extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() {
    return this.state.error ? <CrashMessage error={this.state.error} /> : this.props.children;
  }
}

function CrashMessage({ error }: { error: Error }) {
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <main className="card gap-12" style={{ maxWidth: 560, margin: '40px auto' }}>
      <h1 className="caps" style={{ color: 'var(--orange)' }}>The sheet couldn’t open</h1>
      <span className="muted">{error.message}</span>
      <span>Your characters are still saved on this device. Export a backup to keep them safe, then try again.</span>
      <div className="row gap-8">
        <button type="button" className="btn btn-primary grow" onClick={async () => setMsg(await saveBackupFile(rawBackup()))}>Export backup</button>
        <button type="button" className="btn grow" onClick={() => location.reload()}>Reload</button>
      </div>
      {msg && <span className="small">{msg}</span>}
    </main>
  );
}
