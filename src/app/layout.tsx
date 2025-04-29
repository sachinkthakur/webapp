{'use client'; // Ensure this file is treated as a Client Component if it uses hooks like useState/useEffect directly or imports components that do.

import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { ThemeProvider } from '@/components/theme-provider'; // Corrected import path if needed, ensure file exists
import { Toaster } from '@/components/ui/toaster';
import { cn } from '@/lib/utils';
import { ToastProvider } from '@/hooks/use-toast'; // Import ToastProvider

const inter = Inter({ subsets: ['latin'] });

// Metadata should ideally be defined in a server component or exported separately if this remains client-side.
// For simplicity here, we'll keep it, but be aware of potential implications.
// If this component *must* be 'use client', static metadata export might be better.
/*
export const metadata: Metadata = {
  title: 'FieldTrack - E Wheels and Logistics',
  description: 'Employee Attendance and Tracking Application',
  // PWA specific metadata
  manifest: '/manifest.json',
  themeColor: '#ffffff', // Adjust theme color
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'FieldTrack',
    // startupImage: '/images/apple-touch-icon.png', // Optional: Add startup images
  },
  // Add other PWA or standard metadata as needed
  icons: {
    icon: '/favicon.ico', // Standard favicon
    apple: '/images/apple-touch-icon.png', // Apple touch icon
    // Add other icon sizes if needed
  },
};
*/

export default function RootLayout({
  children,
}: Readonly<{ // Use Readonly for props type
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      {/* Removed whitespace inside <head> */}
      <head>
        {/* Basic Meta Tags */}
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>FieldTrack - E Wheels and Logistics</title>
        <meta name="description" content="Employee Attendance and Tracking Application" />

        {/* PWA Meta Tags */}
        <meta name="application-name" content="FieldTrack" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="FieldTrack" />
        <meta name="format-detection" content="telephone=no" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="msapplication-config" content="/icons/browserconfig.xml" />
        <meta name="msapplication-TileColor" content="#2B5797" />
        <meta name="msapplication-tap-highlight" content="no" />
        <meta name="theme-color" content="#000000" />

        {/* Link Tags */}
        <link rel="apple-touch-icon" href="/icons/touch-icon-iphone.png" />
        <link rel="apple-touch-icon" sizes="152x152" href="/icons/touch-icon-ipad.png" />
        <link rel="apple-touch-icon" sizes="180x180" href="/icons/touch-icon-iphone-retina.png" />
        <link rel="apple-touch-icon" sizes="167x167" href="/icons/touch-icon-ipad-retina.png" />

        <link rel="icon" type="image/png" sizes="32x32" href="/icons/favicon-32x32.png" />
        <link rel="icon" type="image/png" sizes="16x16" href="/icons/favicon-16x16.png" />
        <link rel="manifest" href="/manifest.json" />
        <link rel="mask-icon" href="/icons/safari-pinned-tab.svg" color="#5bbad5" />
        <link rel="shortcut icon" href="/favicon.ico" />

        {/* Add to home screen for Safari on iOS */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />

        {/* Older Android/Chrome versions might need this */}
        <meta name="mobile-web-app-capable" content="yes" />
      </head>
      <body
        className={cn(
          'min-h-screen bg-background font-sans antialiased',
          inter.className // Use inter.variable if using variable fonts
        )}
      >
        {/* Wrap children with providers */}
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <ToastProvider> {/* ToastProvider needs to wrap the content */}
            {children}
            <Toaster /> {/* Toaster renders the toasts */}
          </ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
