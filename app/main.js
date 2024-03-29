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

let cache = null;

if (!config.nocache) {
  const cachePath = isDev ? 'release/app/cache' : 'app/cache';
  cache = require(cachePath);
}

let proxyUrl = null;
let proxyHost = config.proxy?.host;
let proxyPort = config.proxy?.port;

if (proxyHost && proxyPort) {
  proxyUrl = `${proxyHost}:${proxyPort}`;
  if (config.proxy.username) {
    const username = encodeURIComponent(config.proxy.username);
    let auth = username;

    if (config.proxy.password) {
      const password = encodeURIComponent(config.proxy.password);
      auth = `${username}:${password}`;
    }

    proxyUrl = `${auth}@${proxyUrl}`;
  }
  nw.App.setProxyConfig(proxyUrl, '');
}

if (cache) {
  if (proxyUrl) {
    const httpProxy = `http://${proxyUrl}`;
    process.env.HTTP_PROXY = httpProxy;
    process.env.HTTPS_PROXY = httpProxy;
  }
  cache.setup();
}

/** @type {any} */
var anyGlobal = nw.global;

nw.global.config = config;

/** @type {nw.Window?} */
let theWindow = null;

let hidden = false;

nw.global.show = () => {
  if (!theWindow) return;
  theWindow.show();
  hidden = false;
};

nw.global.hide = () => {
  if (!theWindow) return;
  theWindow.hide();
  hidden = true;
};

nw.global.toggle = () => {
  if (hidden) {
    nw.global.show();
  } else {
    nw.global.hide();
  }
};

if (config.tray) {
  // @ts-ignore
  anyGlobal.tray = new nw.Tray({ title: 'Crave Saga', tooltip: 'Crave Saga', icon });
  anyGlobal.tray.on('click', () => {
    nw.global.toggle();
  });
  if (anyGlobal.menu) {
    anyGlobal.tray.menu = anyGlobal.menu;
  }
}

nw.Window.open(selector, { title: 'Crave Saga', id: 'CraveSaga', icon }, function (win) {
  win.setMinimumSize(178, 316);
  theWindow = win;

  win.on('close', () => {
    if (cache) {
      cache.dispose();
    }
    nw.App.quit();
  });
});

nw.App.on('open', cmdline => {
  nw.global.show();
});
