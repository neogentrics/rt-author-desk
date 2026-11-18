'use strict';
(async () => {
  const status = document.getElementById('status');
  try {
    const { version, library } = await window.desk.info();
    status.textContent = library.ok
      ? `Version ${version}. Your library is open and encrypted (${library.cipher}, SQLite ${library.sqlite}).`
      : `Version ${version}. Your library couldn't be opened: ${library.message}`;
  } catch (error) {
    status.textContent = `Something went wrong: ${error.message}`;
  }
})();
