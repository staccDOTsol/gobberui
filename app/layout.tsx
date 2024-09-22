import '@mantine/core/styles.css';
import React from 'react';
import { MantineProvider, ColorSchemeScript } from '@mantine/core';
import { NavigationProgress } from '@mantine/nprogress';
import { Press_Start_2P } from 'next/font/google';
import '../globals.css'

import { theme } from '../theme';

import '@mantine/dropzone/styles.css';
import '@mantine/carousel/styles.css';
import '@mantine/notifications/styles.css';
import '@mantine/code-highlight/styles.css';
import '@solana/wallet-adapter-react-ui/styles.css';
import { Providers } from '@/providers/Providers';

// Initialize the Press Start 2P font
const pressStart2P = Press_Start_2P({
  weight: '400',
  subsets: ['latin'],
  display: 'swap',
});

export const metadata = {
  title: 'Metaplex Template UI',
  description: 'A template for Solana UIs using Mantine and Metaplex.',
};

export default function RootLayout({ children }: { children: any }) {
  return (
    <html lang="en">
      <head>
        <ColorSchemeScript />
        <link rel="shortcut icon" href="/favicon.png" />
        <meta
          name="viewport"
          content="minimum-scale=1, initial-scale=1, width=device-width, user-scalable=no"
        />
      </head>
      <body className={pressStart2P.className}>
        <MantineProvider theme={theme} defaultColorScheme="dark">
          <NavigationProgress />
          <Providers>{children}</Providers>
        </MantineProvider>
      </body>
    </html>
  );
}