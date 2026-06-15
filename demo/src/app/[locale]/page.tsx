import { T } from 'literal-i18n';
import { ClientDemo } from './client-demo';

type Props = {
  params: Promise<{ locale: string }>;
};

export default async function HomePage() {
  return (
    <main style={{ maxWidth: 640, margin: '0 auto', padding: '2rem 1rem' }}>
      <h1><T text="Hello World" /></h1>
      <p><T text="Welcome to Literal I18n Demo" /></p>
      <hr />

      <section>
        <h2><T text="This is a server component" /></h2>
      </section>

      <hr />

      <section>
        <h2>Client Component Demo</h2>
        <ClientDemo />
      </section>
    </main>
  );
}
