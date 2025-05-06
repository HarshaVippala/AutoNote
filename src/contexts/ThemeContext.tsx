'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';

type Theme = 'light' | 'dark';

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void; // Keep this for compatibility, but it will be a no-op
}

// Add TypeScript interface for the Electron API
interface ThemeAPI {
  updateTheme: (theme: string) => Promise<any>;
  onSystemThemeChange: (callback: (theme: string) => void) => void;
}

// Define the window interface with our Electron APIs
declare global {
  interface Window {
    themeAPI?: ThemeAPI;
  }
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Always use dark theme
  const [theme] = useState<Theme>('dark');
  
  // Apply theme on mount
  useEffect(() => {
    // Set dark theme in localStorage
    localStorage.setItem('theme', 'dark');
    
    // Update the DOM based on theme
    const root = document.documentElement;
    root.classList.remove('light');
    root.classList.add('dark');
    
    // Also set as a data attribute for components that might check this
    root.setAttribute('data-theme', 'dark');
    
    // Update the body styles directly for immediate effect
    document.body.style.backgroundColor = '#0a0a0a';
    document.body.style.color = '#ededed';
    
    // Broadcast theme change event for any non-React parts of the app
    const event = new CustomEvent('themechange', { detail: { theme: 'dark' } });
    window.dispatchEvent(event);
    
    // Sync with Electron main process if available
    if (window.themeAPI) {
      window.themeAPI.updateTheme('dark').catch(err => {
        console.error('Failed to update theme in Electron main process:', err);
      });
    }
  }, []); // Only run once on mount
  
  // No-op function that doesn't do anything
  const toggleTheme = () => {
    // Does nothing - theme is permanently dark
    console.log('Theme toggle disabled - dark theme is permanently enabled');
  };
  
  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
} 