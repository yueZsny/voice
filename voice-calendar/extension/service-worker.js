/**
 * Service Worker — 扩展生命周期管理
 */

// ── 点击图标：打开侧边栏 ──
chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ tabId: tab.id });
});

// ── 录音：打开小弹窗（非标签页）──
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'startRecording') {
    console.log('[SW] 打开录音弹窗...');
    chrome.windows.create({
      url: 'record.html',
      type: 'popup',
      width: 380,
      height: 320,
      focused: true,
    }, (win) => {
      console.log('[SW] 录音弹窗已打开:', win.id);
    });
    sendResponse({ ok: true });
  }

  if (msg.type === 'stopRecording') {
    sendResponse({ ok: true });
  }

  // audioChunk / audioEnd / audioError 现在直接通过 WebSocket 发送
  // asr-result / llm-result / event-created 等由录音弹窗转发给侧边栏
});
