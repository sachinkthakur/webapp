import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { ThemeProvider } from '@/components/theme-provider';
import { Toaster } from '@/components/ui/toaster';
import { cn } from '@/lib/utils';
// Polyfills for older browser/Android support (optional, uncomment if needed but test hydration)
// import 'core-js/stable';
// import 'regenerator-runtime/runtime';


const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'FieldTrack - Attendance & Logistics',
  description: 'Field Employee Attendance and Logistics Management',
  manifest: '/manifest.json', // Ensure manifest.json exists in public folder
};

// https://web.dev/progressive-web-apps/
// https://whatwebcando.today/
// Consider adding service worker registration logic if needed for offline caching beyond manifest

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      {/* Ensure no whitespace between <html> and <head> or <body> */}
      <head>{/* PWA Meta Tags - Ensure no whitespace between meta tags */}
        <meta name="application-name" content="FieldTrack" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="FieldTrack" />
        <meta name="description" content="Field Employee Attendance and Logistics Management" />
        <meta name="format-detection" content="telephone=no" />
        <meta name="mobile-web-app-capable" content="yes" />
        {/* <meta name="msapplication-config" content="/icons/browserconfig.xml" /> */}
        <meta name="msapplication-TileColor" content="#2B5797" /> {/* Example color */}
        <meta name="msapplication-tap-highlight" content="no" />
        <meta name="theme-color" content="#1e3a8a" /> {/* Darker blue theme color */}
        {/* Icons */}
        <link rel="apple-touch-icon" href="/icons/touch-icon-iphone.png" />
        <link rel="apple-touch-icon" sizes="152x152" href="/icons/touch-icon-ipad.png" />
        <link rel="apple-touch-icon" sizes="180x180" href="/icons/touch-icon-iphone-retina.png" />
        <link rel="apple-touch-icon" sizes="167x167" href="/icons/touch-icon-ipad-retina.png" />
        <link rel="icon" type="image/png" sizes="32x32" href="/icons/favicon-32x32.png" />
        <link rel="icon" type="image/png" sizes="16x16" href="/icons/favicon-16x16.png" />
        {/* <link rel="mask-icon" href="/icons/safari-pinned-tab.svg" color="#5bbad5" /> */}
        <link rel="shortcut icon" href="/favicon.ico" />
        {/* Twitter Meta Tags */}
        <meta name="twitter:card" content="summary" />
        <meta name="twitter:url" content="https://yourdomain.com" /> {/* TODO: Replace */}
        <meta name="twitter:title" content="FieldTrack" />
        <meta name="twitter:description" content="Field Employee Attendance and Logistics Management" />
        <meta name="twitter:image" content="https://yourdomain.com/icons/android-chrome-192x192.png" /> {/* TODO: Replace */}
        {/* <meta name="twitter:creator" content="@YourTwitterHandle" /> */} {/* TODO: Replace */}
        {/* Open Graph Meta Tags */}
        <meta property="og:type" content="website" />
        <meta property="og:title" content="FieldTrack" />
        <meta property="og:description" content="Field Employee Attendance and Logistics Management" />
        <meta property="og:site_name" content="FieldTrack" />
        <meta property="og:url" content="https://yourdomain.com" /> {/* TODO: Replace */}
        <meta property="og:image" content="https://yourdomain.com/icons/apple-touch-icon.png" /> {/* TODO: Replace */}
        {/* Viewport Meta Tag - Crucial for responsiveness and PWA behavior */}
        <meta name="viewport" content="minimum-scale=1, initial-scale=1, width=device-width, shrink-to-fit=no, user-scalable=no, viewport-fit=cover" />
      </head>
      <body className={cn("min-h-screen bg-background font-sans antialiased", inter.className)}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system" // Or "light" / "dark"
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
