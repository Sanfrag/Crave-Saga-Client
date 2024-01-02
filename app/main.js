// @ts-check

const isDev = process.versions['nw-flavor'] === 'sdk';
const iniPath = isDev ? 'release/app/ini' : 'app/ini';
const fs = require('fs');
const ini = require(iniPath);

const selector = isDev ? 'release/app/selector.html' : 'app/selector.html';

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
  selector,
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
