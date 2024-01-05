// @ts-check

const isDev = process.versions['nw-flavor'] === 'sdk';
const iniPath = isDev ? 'release/app/ini' : 'app/ini';
const fs = require('fs');
const ini = require(iniPath);
const icon = isDev ? './release/app/icon.png' : './app/icon.png';

const selector = isDev ? 'release/app/selector.html' : 'app/selector.html';
const notifier = isDev ? './release/node_modules/node-notifier' : './node_modules/node-notifier';
const luxon = isDev ? './release/node_modules/luxon' : './node_modules/luxon';
const msgpack = isDev
  ? './release/node_modules/@msgpack/msgpack'
  : './node_modules/@msgpack/msgpack';

// @ts-ignore
nw.global.notifier = require(notifier);
nw.global.DateTime = require(luxon).DateTime;
nw.global.msgpack = require(msgpack);

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

nw.global.config = config;

nw.Window.open(selector, { title: 'Crave Saga', id: 'CraveSaga', icon }, function (win) {
  win.setMinimumSize(178, 316);

  setInterval(() => {
    if (win.window.document.title.startsWith('Crave Saga')) {
      return;
    }
    win.title = 'Crave Saga';
    win.window.document.title = 'Crave Saga';
  }, 1);

  /** @type {any} */
  var anyGlobal = nw.global;

  nw.Window.get(null).on('minimize', () => {
    if (config.minimizeToTray) {
      win.hide();
      // @ts-ignore
      anyGlobal.tray = new nw.Tray({ title: 'Crave Saga', tooltip: 'Crave Saga', icon });
      anyGlobal.tray.on('click', () => {
        win.show();
        win.focus();
      });
      if (anyGlobal.menu) {
        anyGlobal.tray.menu = anyGlobal.menu;
      }
    }
  });

  nw.Window.get(null).on('restore', () => {
    if (anyGlobal.tray) {
      anyGlobal.tray.remove();
      anyGlobal.tray = null;
    }
  });
});

nw.App.on('open', cmdline => {
  const win = nw.Window.get(null);
  if (win) {
    win.show();
    win.focus();
  }
});
