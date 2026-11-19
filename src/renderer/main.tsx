import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { SettingsApp } from './SettingsApp';
import { AddAccountApp } from './AddAccountApp';
import { DisclaimerApp } from './DisclaimerApp';
import { ProtocolPromptApp } from './ProtocolPromptApp';
import { AvatarZoomApp } from './AvatarZoomApp';
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
const windowParam = params.get('window');

function renderRootApp() {
  switch (windowParam) {
    case 'settings':
      return <SettingsApp />;
    case 'add-account':
      return <AddAccountApp />;
    case 'disclaimer':
      return <DisclaimerApp />;
    case 'protocol-prompt':
      return <ProtocolPromptApp />;
    case 'avatar-zoom':
      return <AvatarZoomApp />;
    default:
      if (window.location.hash.includes('settings')) {
        return <SettingsApp />;
      }
      return <App />;
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {renderRootApp()}
  </React.StrictMode>
);
