const fs = require('fs');
const path = require('path');

module.exports = {
  title: 'Fish Fin Voice',
  description: 'Lokalny generator audiobooków i lektora AI (Wsparcie dla PL)',
  icon: 'pinokio-icon.svg',
  menu: async () => {
    const root = __dirname;
    const hasEnv = fs.existsSync(path.resolve(root, 'env'));
    const hasNodeModules = fs.existsSync(path.resolve(root, 'node_modules'));
    const installed = hasNodeModules && hasEnv;

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
      }
    ];
  }
};