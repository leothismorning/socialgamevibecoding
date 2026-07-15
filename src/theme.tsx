import React from 'react';

type ThemePreference = 'system' | 'light' | 'dark';
type EffectiveTheme = 'light' | 'dark';

const STORAGE_KEY = 'vibecoding-theme';

const ThemeContext = React.createContext<{
  preference: ThemePreference;
  effectiveTheme: EffectiveTheme;
  setPreference: (preference: ThemePreference) => void;
} | null>(null);

function getStoredPreference(): ThemePreference {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === 'light' || stored === 'dark' ? stored : 'system';
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [preference, setPreferenceState] = React.useState<ThemePreference>(getStoredPreference);
  const [systemTheme, setSystemTheme] = React.useState<EffectiveTheme>(() =>
    window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
  );
  const effectiveTheme = preference === 'system' ? systemTheme : preference;

  React.useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const update = () => setSystemTheme(media.matches ? 'dark' : 'light');
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  React.useEffect(() => {
    document.documentElement.dataset.theme = effectiveTheme;
    document.documentElement.dataset.themePreference = preference;
    document.documentElement.style.colorScheme = effectiveTheme;
  }, [effectiveTheme, preference]);

  const setPreference = React.useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    if (next === 'system') localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, next);
  }, []);

  return (
    <ThemeContext.Provider value={{ preference, effectiveTheme, setPreference }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function ThemeToggle({ className = '' }: { className?: string }) {
  const theme = React.useContext(ThemeContext);
  if (!theme) return null;

  return (
    <label className={`theme-toggle ${className}`}>
      <span>Theme</span>
      <select
        value={theme.preference}
        onChange={(event) => theme.setPreference(event.target.value as ThemePreference)}
        aria-label="Theme preference"
      >
        <option value="system">System</option>
        <option value="light">Light</option>
        <option value="dark">Dark</option>
      </select>
    </label>
  );
}
