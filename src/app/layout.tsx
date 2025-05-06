import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from "./contexts/ThemeContext";
import { StatusProvider } from "./contexts/StatusContext"; // Import StatusProvider

export const metadata: Metadata = {
  title: "Realtime API Agents",
  description: "A demo app from OpenAI.",
};

function ThemeInitScript() {
  return (
    <script
      dangerouslySetInnerHTML={{
        __html: `
          (function() {
            try {
              // Run this immediately to avoid flash of incorrect theme
              const storedTheme = localStorage.getItem('theme');
              const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
              const theme = storedTheme || systemTheme;
              
              // Apply to root HTML element
              document.documentElement.classList.remove('light', 'dark');
              document.documentElement.classList.add(theme);
              
              // Also set as a data attribute for components that might check this
              document.documentElement.setAttribute('data-theme', theme);
              
              // Apply background color immediately to avoid flash
              if (document.body) {
                if (theme === 'dark') {
                  document.body.style.backgroundColor = '#0a0a0a';
                  document.body.style.color = '#ededed';
                } else {
                  document.body.style.backgroundColor = '#fafafa';
                  document.body.style.color = '#171717';
                }
              }
            } catch (e) {
              console.error('Theme initialization failed:', e);
            }
          })();
        `,
      }}
    />
  );
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
        <ThemeInitScript />
      </head>
      <body className={`antialiased`}>
        <ThemeProvider>
          <StatusProvider>{children}</StatusProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
