const fs = require('fs');
const path = require('path');

module.exports = {
  title: 'Fish Fin Voice',
  description: 'Lokalny generator audiobooków i lektora AI (Wsparcie dla PL)',
  icon: 'pinokio-icon.svg',
  menu: async () => {
    const root = __dirname;
    const hasVenv = fs.existsSync(path.resolve(root, 'venv'));
    const hasNodeModules = fs.existsSync(path.resolve(root, 'node_modules'));
    const installed = hasVenv || hasNodeModules;

    return [
      {
        text: installed ? 'Uruchom' : 'Zainstaluj',
        icon: installed ? 'fa-solid fa-play' : 'fa-solid fa-download',
        href: installed ? 'start.json' : 'install.json'
      }
    ];
  }
};