import { startBridge } from './bridge.ts';

if (window.parent !== window) {
  startBridge(window.parent);
}
