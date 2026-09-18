import type { Metadata } from 'next';
import '@/styles/omi.css';

export const metadata: Metadata = {
  title: 'OMI — One Mind Intelligence',
  description: 'Web-first personal AI agent. Completes the task and shows its work.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <div className="background" />
        {children}
      </body>
    </html>
  );
}
