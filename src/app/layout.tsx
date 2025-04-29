import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { ThemeProvider } from '@/components/theme-provider'; // Import ThemeProvider
import { Toaster } from '@/components/ui/toaster'; // Import Toaster for notifications
import { cn } from '@/lib/utils';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'FieldTrack - Attendance & Logistics',
  description: 'Field Employee Attendance and Logistics Management',
  manifest: '/manifest.json', // PWA manifest
};

// Android 6 (Marshmallow) was released in 2015.
// We target ES2015 (ES6) which should be largely compatible.
// Polyfills are included via core-js.

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* PWA Meta Tags - Ensure no whitespace here */}
        <meta name="application-name" content="FieldTrack" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="FieldTrack" />
        <meta name="description" content="Field Employee Attendance and Logistics Management" />
        <meta name="format-detection" content="telephone=no" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="msapplication-config" content="/icons/browserconfig.xml" />
        <meta name="msapplication-TileColor" content="#2B5797" />
        <meta name="msapplication-tap-highlight" content="no" />
        <meta name="theme-color" content="#000000" />

        <link rel="apple-touch-icon" href="/icons/touch-icon-iphone.png" />
        <link rel="apple-touch-icon" sizes="152x152" href="/icons/touch-icon-ipad.png" />
        <link rel="apple-touch-icon" sizes="180x180" href="/icons/touch-icon-iphone-retina.png" />
        <link rel="apple-touch-icon" sizes="167x167" href="/icons/touch-icon-ipad-retina.png" />

        <link rel="icon" type="image/png" sizes="32x32" href="/icons/favicon-32x32.png" />
        <link rel="icon" type="image/png" sizes="16x16" href="/icons/favicon-16x16.png" />
        <link rel="mask-icon" href="/icons/safari-pinned-tab.svg" color="#5bbad5" />
        <link rel="shortcut icon" href="/favicon.ico" />

        <meta name="twitter:card" content="summary" />
        <meta name="twitter:url" content="https://yourdomain.com" /> {/* TODO: Replace with actual domain */}
        <meta name="twitter:title" content="FieldTrack" />
        <meta name="twitter:description" content="Field Employee Attendance and Logistics Management" />
        <meta name="twitter:image" content="https://yourdomain.com/icons/android-chrome-192x192.png" /> {/* TODO: Replace with actual domain */}
        <meta name="twitter:creator" content="@YourTwitterHandle" /> {/* TODO: Replace with actual Twitter handle */}

        <meta property="og:type" content="website" />
        <meta property="og:title" content="FieldTrack" />
        <meta property="og:description" content="Field Employee Attendance and Logistics Management" />
        <meta property="og:site_name" content="FieldTrack" />
        <meta property="og:url" content="https://yourdomain.com" /> {/* TODO: Replace with actual domain */}
        <meta property="og:image" content="https://yourdomain.com/icons/apple-touch-icon.png" /> {/* TODO: Replace with actual domain */}
        {/* Ensure viewport is set for responsiveness */}
        <meta name="viewport" content="minimum-scale=1, initial-scale=1, width=device-width, shrink-to-fit=no, user-scalable=no, viewport-fit=cover" />
      </head>
      <body className={cn("min-h-screen bg-background font-sans antialiased", inter.className)}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
