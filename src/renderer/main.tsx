import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { SettingsApp } from './SettingsApp';
import './index.css';

// Early theme setup to avoid color flash
if (window.electronAPI?.getThemeInfo) {
  window.electronAPI.getThemeInfo().then((info) => {
    if (info && info.shouldUseDarkColors === false) {
      document.documentElement.classList.add('light');
      document.documentElement.classList.remove('dark');
      document.documentElement.setAttribute('data-theme', 'light');
    } else {
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('light');
      document.documentElement.setAttribute('data-theme', 'dark');
    }
  }).catch(() => {});
}

const params = new URLSearchParams(window.location.search);
const isSettingsWindow = params.get('window') === 'settings' || window.location.hash.includes('settings');

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {isSettingsWindow ? <SettingsApp /> : <App />}
  </React.StrictMode>
);
