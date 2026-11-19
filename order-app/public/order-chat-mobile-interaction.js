// Compatibility fix for the currently published bundle. Keep its scroll lock
// and backdrop, but never disable the ancestor that also contains the drawer.
(() => {
  const unlockChat = () => {
    const shell = document.querySelector('main.app-shell[inert]');
    if (shell?.querySelector('.team-chat-drawer')) shell.removeAttribute('inert');
  };
  new MutationObserver(unlockChat).observe(document.documentElement, {
    subtree: true, childList: true, attributes: true, attributeFilter: ['inert']
  });
  unlockChat();
})();
