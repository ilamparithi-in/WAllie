import './types';
import { activeNotificationCallbacks, initCustomNotification, initAnchorDownloadHandler } from './customNotification';
import { initChatNavigation } from './chatNavigation';
import { initDragDropStabilizer } from './dragDrop';
import { initStandaloneLinkPreview } from './linkPreview';
import { initChatExporter } from './chatExporter';
import { initResponsiveLayout } from './responsiveLayout';

(() => {
  initCustomNotification();
  initAnchorDownloadHandler();
  initChatNavigation(activeNotificationCallbacks);
  initDragDropStabilizer();
  initStandaloneLinkPreview();
  initChatExporter();
  initResponsiveLayout();
})();
