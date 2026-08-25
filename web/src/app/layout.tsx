import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';

import './globals.css';
import { Boot } from '@/components/layout/boot';

const inter = Inter({ subsets: ['latin', 'cyrillic'], variable: '--font-inter' });

export const metadata: Metadata = {
  title: 'Shifter',
  description: 'Shift work, counted properly.',
  manifest: '/manifest.webmanifest',
  icons: { icon: '/favicon.ico', apple: '/icons/apple-touch-icon.png' },
};

export const viewport: Viewport = {
  themeColor: '#17181c',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // The theme attribute is stamped before paint by the inline script below;
    // suppressHydrationWarning covers the deliberate mismatch with the SSR'd
    // default.
    <html lang="en" data-theme="system" suppressHydrationWarning>
      <head>
        {/* First paint must not flash the wrong palette: the stored settings
            are applied before React exists. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `window.__errs=[];addEventListener('error',function(e){if(window.__errs.length>20)return;window.__errs.push(String(e.message)+' @ '+String(e.filename).split('/').pop()+':'+e.lineno)});addEventListener('unhandledrejection',function(e){if(window.__errs.length>20)return;window.__errs.push('rej: '+String(e.reason && e.reason.stack || e.reason).slice(0,500))});try{var s=JSON.parse(localStorage.getItem('shifter.settings')||'{}');var r=document.documentElement;r.dataset.theme=s.theme||'system';if(s.accent){r.style.setProperty('--accent',s.accent)}if(s.fontScale){r.style.setProperty('--font-size',s.fontScale+'px')}if(s.roundness){r.style.setProperty('--radius',s.roundness+'px');r.style.setProperty('--radius-lg',(s.roundness+4)+'px')}}catch(e){}`,
          }}
        />
      </head>
      <body className={inter.variable}>
        <Boot>{children}</Boot>
      </body>
    </html>
  );
}
