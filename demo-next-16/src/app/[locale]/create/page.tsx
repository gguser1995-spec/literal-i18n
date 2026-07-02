import { T } from 'literal-i18n';
import { CreateClientNote } from './create-client-note';

export default function CreatePage() {
  return (
    <main style={{ maxWidth: 640, margin: '0 auto', padding: '2rem 1rem' }}>
      <h1><T text="Create music" /></h1>
      <p><T text="Compose a new track from a short idea." /></p>
      <CreateClientNote />
    </main>
  );
}
