'use strict';
// Puts a theme on the page. The colours, font and text size come from the settings, so every screen follows them, and the
// stylesheet never names a colour of its own. Changing a CSS variable from a script is allowed by the page's policy;
// writing a style attribute into the page's HTML is not, and nothing here does.
(() => {
  const { THEMES, UI_FONTS } = window.ADThemes;
  const dark = window.matchMedia('(prefers-color-scheme: dark)');
  let current = null;

  AD.themeName = (settings) => (settings.theme === 'system' ? (dark.matches ? 'dark' : 'light') : settings.theme);

  // The themes as a list to choose from: Follow System first, then each theme by its name.
  AD.themeChoices = () => [['system', 'Follow System'], ...Object.entries(THEMES).map(([key, theme]) => [key, theme.label])];

  // The look as it is now, for anything that shows it.
  AD.currentLook = () => current;

  // Changes the look from anywhere (Preferences, the theme button, the menu) and keeps everything that shows it in step: the page, the
  // View menu in the main process, and any window that is open. Resolves to the settings as saved.
  AD.setLook = async (changes) => {
    const settings = await window.desk.saveSettings(changes);
    AD.applyLook(settings);
    document.dispatchEvent(new CustomEvent('ad:look', { detail: settings }));
    return settings;
  };

  AD.applyLook = (settings) => {
    current = settings;
    const name = AD.themeName(settings);
    const theme = THEMES[name];
    const root = document.documentElement;
    const set = (variable, value) => root.style.setProperty(variable, value);
    set('--t-desk', theme.desk);
    set('--t-desk-image', theme.deskStops ? `linear-gradient(135deg, ${theme.deskStops.join(', ')})` : 'none');
    set('--t-panel', theme.panel);
    set('--t-panel-end', theme.panelEnd);
    set('--t-edge', theme.edge);
    set('--t-ink', theme.ink);
    set('--t-ink-soft', theme.inkSoft);
    set('--t-sheet', theme.sheet);
    set('--t-accent', theme.accent);
    set('--t-on-accent', theme.onAccent);
    set('--t-on-panel', theme.onPanel ?? theme.ink);
    set('--t-on-panel-soft', theme.onPanelSoft ?? theme.inkSoft);
    set('--t-danger', theme.danger);
    set('--t-danger-bg', theme.dangerBg);
    set('--ui-font', UI_FONTS[settings.uiFont].stack);
    set('--text-size', `${settings.textSize}px`);
    root.style.colorScheme = theme.tone;
    root.dataset.theme = name;
    root.dataset.tone = theme.tone;
    root.dataset.colors = settings.colorSafe ? 'safe' : 'normal';
    // High Contrast stays solid: frosted colour would only make it harder to read.
    root.dataset.surface = theme.glass || (settings.glass && !theme.flat) ? 'glass' : 'solid';
  };

  // Follow System follows the computer when it switches between light and dark.
  dark.addEventListener('change', () => {
    if (current?.theme === 'system') AD.applyLook(current);
  });
})();
