'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

type Theme = 'light' | 'dark';

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
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
  const [theme, setTheme] = useState<Theme>('light');
  
  // Initialize theme on mount
  useEffect(() => {
    // Check if user has a preferred theme stored in localStorage
    const storedTheme = localStorage.getItem('theme') as Theme | null;
    
    // Check for system preference if no stored preference
    if (!storedTheme) {
      const systemPreference = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      setTheme(systemPreference);
      localStorage.setItem('theme', systemPreference);
    } else {
      setTheme(storedTheme);
    }
    
    // Add listener for system theme changes
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e: MediaQueryListEvent) => {
      // Only update if user hasn't set a preference
      if (!localStorage.getItem('theme')) {
        const newTheme = e.matches ? 'dark' : 'light';
        setTheme(newTheme);
        localStorage.setItem('theme', newTheme);
      }
    };
    
    // Listen for theme changes from Electron main process
    if (window.themeAPI) {
      window.themeAPI.onSystemThemeChange((newTheme) => {
        if (!localStorage.getItem('theme')) {
          setTheme(newTheme as Theme);
        }
      });
    }
    
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);
  
  // Apply theme whenever it changes
  useEffect(() => {
    // Update the DOM based on theme
    const root = document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(theme);
    
    // Also set as a data attribute for components that might check this
    root.setAttribute('data-theme', theme);
    
    // Update the body styles directly for immediate effect
    if (theme === 'dark') {
      document.body.style.backgroundColor = '#0a0a0a';
      document.body.style.color = '#ededed';
    } else {
      document.body.style.backgroundColor = '#fafafa';
      document.body.style.color = '#171717';
    }
    
    // Store the user preference
    localStorage.setItem('theme', theme);
    
    // Broadcast theme change event for any non-React parts of the app 
    // (like Electron main process)
    const event = new CustomEvent('themechange', { detail: { theme } });
    window.dispatchEvent(event);
    
    // Sync with Electron main process if available
    if (window.themeAPI) {
      window.themeAPI.updateTheme(theme).catch(err => {
        console.error('Failed to update theme in Electron main process:', err);
      });
    }
  }, [theme]);
  
  // Use useCallback to ensure this function reference stays stable
  const toggleTheme = useCallback(() => {
    setTheme(prevTheme => {
      const newTheme = prevTheme === 'light' ? 'dark' : 'light';
      return newTheme;
    });
  }, []);
  
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