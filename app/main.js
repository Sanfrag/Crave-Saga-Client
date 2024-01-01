// @ts-check

const isDev = process.versions['nw-flavor'] === 'sdk';
const iniPath = isDev ? 'release/app/ini' : 'app/ini';
const fs = require('fs');
const ini = require(iniPath);

let config = {};

try {
  config = ini.parse(fs.readFileSync('./config.ini', 'utf-8'));
} catch {}

if (config.proxy && config.proxy.host && config.proxy.port) {
  let proxy = `${config.proxy.host}:${config.proxy.port}`;
  if (config.proxy.username) {
    const username = encodeURIComponent(config.proxy.username);
    let userPrefix = username;
    
    if (config.proxy.password) {
      const password = encodeURIComponent(config.proxy.password);
      userPrefix = `${username}:${password}`;
    }

    proxy = `${userPrefix}@${proxy}`;
  }
  nw.App.setProxyConfig(proxy, '');
}

nw.Window.open(
  'https://ero-labs.com/webGL.html?id=47',
  { title: 'Crave Saga', id: 'CraveSaga', icon: 'app/icon.png' },
  function (win) {
    win.setMinimumSize(178, 316);
    setInterval(() => {
      if (win.window.document.title === 'Crave Saga') {
        return;
      }
      win.title = 'Crave Saga';
      win.window.document.title = 'Crave Saga';
    }, 0);
  }
);
