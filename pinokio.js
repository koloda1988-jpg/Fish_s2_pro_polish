const fs = require('fs');
const path = require('path');

module.exports = {
  title: 'Fish Fin Voice',
  description: 'Lokalny generator audiobooków i lektora AI (Wsparcie dla PL)',
  icon: 'pinokio-icon.png',
  menu: async () => {
    const root = __dirname;
    const hasVenv = fs.existsSync(path.resolve(root, 'venv'));
    const hasDotVenv = fs.existsSync(path.resolve(root, '.venv'));
    const hasPythonEnv = hasVenv || hasDotVenv;
    const hasNodeModules = fs.existsSync(path.resolve(root, 'node_modules'));
    const installed = hasNodeModules && hasPythonEnv;

    if (!installed) {
      return [
        {
          text: 'Zainstaluj',
          icon: 'fa-solid fa-download',
          href: 'install.json'
        }
      ];
    }

    return [
      {
        text: 'Uruchom aplikacje',
        icon: 'fa-solid fa-play',
        href: 'start.json'
      },
      {
        text: 'Aktualizuj',
        icon: 'fa-solid fa-rotate',
        href: 'update.json'
      },
      {
        text: 'Odinstaluj',
        icon: 'fa-solid fa-trash',
        href: 'uninstall.json'
      }
    ];
  }
};