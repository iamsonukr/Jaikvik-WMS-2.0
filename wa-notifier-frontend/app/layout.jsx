import './globals.css';
import { AuthProvider } from '@/lib/auth-context';
import { ClientProvider } from '@/hooks/useClient';
import { ThemeProvider } from '@/components/theme-provider';

export const metadata = { title: 'Jaikvik WMS', description: 'WhatsApp Business Platform' };

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider>
          <AuthProvider>
            <ClientProvider>
              {children}
            </ClientProvider>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
