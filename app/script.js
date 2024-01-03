// @ts-check
/** @type any */
var cc;
/** @type any */
var chrome;
/** @type any */
var process;

//=============================
// Main
//=============================
(function () {
  if (!process) return;

  const isDev = process.versions['nw-flavor'] === 'sdk';
  const iniPath = isDev ? 'release/app/ini' : 'app/ini';
  const fs = require('fs');
  const ini = require(iniPath);

  let config = {};

  try {
    config = ini.parse(fs.readFileSync('./config.ini', 'utf-8'));
  } catch {}

  let resizing = false;

  //=============================
  // Helpers
  //=============================
  const info = label => {
    return new nw.MenuItem({
      label: label,
      enabled: false,
    });
  };

  const checkbox = (key, label, click) => {
    if (click) {
      return new nw.MenuItem({
        type: 'checkbox',
        label: label,
        key,
        click,
        checked: false,
      });
    } else {
      return new nw.MenuItem({
        type: 'checkbox',
        key,
        label: label,
        checked: false,
      });
    }
  };

  const item = (key, label, click) => {
    if (click) {
      return new nw.MenuItem({
        label: label,
        key,
        click,
      });
    } else {
      return new nw.MenuItem({
        label: label,
        key,
      });
    }
  };

  const itemMod = (modifiers, key, label, click) => {
    if (click) {
      return new nw.MenuItem({
        label: label,
        key,
        modifiers,
        click,
      });
    } else {
      return new nw.MenuItem({
        label: label,
        key,
        modifiers,
      });
    }
  };

  function changeProvider() {
    /** @type {any} */
    const anyNW = nw;
    const selectorUrl = anyNW.global.selector;
    // append reselect=1 search params
    const url = new URL(selectorUrl);
    url.searchParams.set('reselect', '1');

    // @ts-ignore
    chrome.tabs.update(nw.Window.get(null).cWindow.tabs[0].id, { url: url.href });
  }

  //=============================
  // Login Page
  //=============================
  function processLoginPage() {
    chrome.privacy.services.passwordSavingEnabled.get({}, function (details) {
      if (details.levelOfControl === 'controllable_by_this_extension') {
        chrome.privacy.services.passwordSavingEnabled.set({ value: false }, function () {
          if (chrome.runtime.lastError === undefined) console.log('Disabled password manager');
          else console.log(chrome.runtime.lastError);
        });
      }
    });
  }

  //=============================
  // WebGL Page
  //=============================
  function processWebGLPage() {
    // find a iframe element and directly switch to it, effectively strip the outer frame
    const iframes = document.querySelectorAll('iframe');

    function checkFrame(iframe) {
      /** @type {any} */
      const anyNW = nw;
      if (!anyNW?.global?.provider) return;

      const url = iframe.src;

      if (anyNW.global.wrapperRegex) {
        for (const regex of anyNW.global.wrapperRegex) {
          if (url.match(regex)) {
            return true;
          }
        }
      }

      if (url.match(anyNW.global.gameRegex)) return true;
      return false;
    }

    function checkFrameAndSwitch(iframe) {
      if (checkFrame(iframe)) {
        window.stop();
        window.document.write(`<body style="background-color: #000;"></body>`);
        window.location.href = iframe.src;
      }
    }

    for (const iframe of iframes) {
      if (iframe) {
        iframe.onload = () => {
          checkFrameAndSwitch(iframe);
        };

        // @ts-ignore
        var iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
        if (iframeDoc.readyState == 'complete') {
          checkFrameAndSwitch(iframe);
        }
      }
    }
  }

  //=============================
  // Patches
  //=============================
  function disableBackgroundMute() {
    // Dirty hack to disable background mute. Perfer toggle mute.
    // Also disable pause on blur
    /** @type {any} */
    const anywindow = window;
    try {
      if (anywindow.Grobal.SoundManager) {
        anywindow.Grobal.SoundManager.setMuteAll = () => {};
        if (cc?.game) cc.game.pause = () => {};
      } else {
        requestAnimationFrame(disableBackgroundMute);
      }
    } catch {
      requestAnimationFrame(disableBackgroundMute);
    }
  }

  function canvasInitialize(gameCanvas) {
    // Create game canvas context early to force enable preserveDrawingBuffer
    // This allows both ambient background and screenshot to work
    if (gameCanvas) {
      gameCanvas.getContext('webgl', {
        alpha: true,
        antialias: false,
        depth: true,
        desynchronized: false,
        powerPreference: 'default',
        premultipliedAlpha: true,
        preserveDrawingBuffer: true,
        stencil: true,
      });
    }
  }

  function createAmbientCanvas(gameDiv, gameCanvas) {
    if (!config.ambient) return;
    if (!gameDiv || !gameCanvas) return;

    if (gameCanvas) {
      gameCanvas.style.boxShadow = '0px 0px 64px black';
    }

    const ambientCanvas = document.createElement('canvas');
    ambientCanvas.id = 'Ambient';
    ambientCanvas.style.position = 'absolute';
    ambientCanvas.style.width = '100%';
    ambientCanvas.style.height = '100%';
    ambientCanvas.style.filter = 'blur(128px) brightness(75%)';
    ambientCanvas.width = 512;
    ambientCanvas.height = 512;
    gameDiv.parentElement.insertBefore(ambientCanvas, gameDiv);

    const ambientCtx = ambientCanvas.getContext('2d');
    if (!ambientCtx) return;

    const drawAmbient = () => {
      try {
        if (!resizing) ambientCtx.drawImage(gameCanvas, 0, 0, 512, 512);
      } catch {}
      requestAnimationFrame(drawAmbient);
    };

    requestAnimationFrame(drawAmbient);
    return ambientCanvas;
  }

  let targetBrightness = 100;
  const blackoutHalfBrightness = 65;
  let brightnessSettingTimeout;

  function setBrightness(brightness, delay) {
    if (brightnessSettingTimeout) {
      clearTimeout(brightnessSettingTimeout);
    }
    if (delay === undefined) {
      targetBrightness = brightness;
      brightnessSettingTimeout = undefined;
      return;
    }
    brightnessSettingTimeout = setTimeout(() => {
      targetBrightness = brightness;
    }, delay);
  }

  function blackoutFadeAnimation(gameCanvas, ambientCanvas) {
    let currentBrightness = 100;
    let lastTime = Date.now();

    const updateBrightness = () => {
      const now = Date.now();
      const delta = now - lastTime;
      lastTime = now;

      if (Math.abs(currentBrightness - 100) < 0.01 && targetBrightness <= blackoutHalfBrightness) {
        currentBrightness = blackoutHalfBrightness;
      }

      const diff = targetBrightness - currentBrightness;
      const step = diff * delta * 0.015;

      if (targetBrightness > currentBrightness) {
        currentBrightness = Math.min(currentBrightness + step, targetBrightness);
      } else {
        currentBrightness = Math.max(currentBrightness + step, targetBrightness);
      }

      if (gameCanvas) {
        if (Math.abs(targetBrightness - 100) < 0.01) {
          gameCanvas.style.filter = '';
          currentBrightness = 100;
        } else {
          gameCanvas.style.filter = `brightness(${currentBrightness.toFixed(2)}%)`;
        }
        if (ambientCanvas) {
          ambientCanvas.style.filter = `blur(128px) brightness(${(currentBrightness * 0.75).toFixed(
            2
          )}%)`;
        }
      }
      requestAnimationFrame(updateBrightness);
    };

    updateBrightness();
  }

  //=============================
  // Game Page
  //=============================
  function processGamePage() {
    disableBackgroundMute();

    const win = nw.Window.get(null);
    let mouseIsInside = true;

    /** @type {HTMLDivElement?} */
    const background = document.querySelector('#Background');
    /** @type {HTMLDivElement?} */
    const gameDiv = document.querySelector('#GameDiv');
    /** @type {HTMLCanvasElement?} */
    const gameCanvas = document.querySelector('#GameCanvas');

    /** @type {HTMLIFrameElement?} */
    const footer = document.querySelector('#NewsFooter');

    if (footer) {
      // Remove footer
      footer.parentElement?.removeChild(footer);
    }

    // Fun stuff
    canvasInitialize(gameCanvas);
    const aimbientCanvas = createAmbientCanvas(gameDiv, gameCanvas);
    blackoutFadeAnimation(gameCanvas, aimbientCanvas);

    // Context menu
    const menu = new nw.Menu();
    const separator = new nw.MenuItem({ type: 'separator' });
    const fullscreenItem = checkbox('f', 'Fullscreen', () => win.toggleFullscreen());
    const alwaysOnTopItem = checkbox(null, 'Always on top', () =>
      win.setAlwaysOnTop(alwaysOnTopItem.checked)
    );
    const screenshotItem = item('F12', 'Screenshot to clipboard');
    const blackoutItem = checkbox('b', 'Blackout');
    const muteAllItem = checkbox('m', 'Mute All');
    const muteBgmItem = checkbox(null, 'Mute BGM');
    const muteSeItem = checkbox(null, 'Mute SE');

    const audioMenu = new nw.Menu();
    audioMenu.append(muteAllItem);
    audioMenu.append(separator);
    audioMenu.append(muteBgmItem);
    audioMenu.append(muteSeItem);

    const changeProviderItem = item(null, 'Change provider', () => {
      changeProvider();
    });

    const reloadItem = itemMod('ctrl', 'r', 'Reload', () => win.reload());
    const clearCacheItem = item(null, 'Clear cache and reload', () => {
      if (confirm('Are you sure you want to clear cache?')) {
        document.write('<body style="background-color: #000;"></body>');
        nw.App.clearCache();
        win.reload();
      }
    });
    const logoutItem = item(null, 'Logout', () => {
      if (confirm('Are you sure you want to logout?')) {
        localStorage.clear();
        /** @type {any} */
        const anyNW = nw;
        if (!anyNW.global.cookieHosts) anyNW.global.cookieHosts = [];

        async function removeCookies(host) {
          const cookies = await new Promise(resolve => {
            win.cookies.getAll({ domain: host }, resolve);
          });

          const promises = [];

          for (var i = 0; i < cookies.length; i++) {
            promises.push(
              new Promise(resolve => {
                win.cookies.remove(
                  {
                    url: 'https://' + host + cookies[i].path,
                    name: cookies[i].name,
                  },
                  resolve
                );
              })
            );
          }

          await Promise.all(promises);
        }

        async function removeAllCookiesAndReload() {
          const promises = [];
          for (const host of anyNW.global.cookieHosts) {
            promises.push(removeCookies(host));
          }
          await Promise.all(promises);
          nw.Window.get(null).window.location.href = anyNW.global.entryUrl;
        }

        removeAllCookiesAndReload();
      }
    });

    const dataMenu = new nw.Menu();
    dataMenu.append(reloadItem);
    dataMenu.append(separator);
    dataMenu.append(clearCacheItem);
    dataMenu.append(logoutItem);

    /** @type {any} */
    const anyNW = nw;
    menu.append(info(anyNW.global.provider));
    menu.append(separator);
    menu.append(fullscreenItem);
    menu.append(blackoutItem);
    menu.append(alwaysOnTopItem);
    menu.append(screenshotItem);
    menu.append(separator);
    menu.append(new nw.MenuItem({ label: 'Audio', submenu: audioMenu }));
    menu.append(separator);
    menu.append(changeProviderItem);
    menu.append(separator);
    menu.append(new nw.MenuItem({ label: 'Data', submenu: dataMenu }));

    win.on('enter-fullscreen', () => {
      fullscreenItem.checked = true;
    });
    win.on('restore', () => {
      fullscreenItem.checked = win.isFullscreen;
    });

    //=============================
    // Functionalities
    //=============================
    const toggleBgm = () => {
      /** @type {any} */
      const anywindow = window;
      anywindow.Grobal.SoundManager.setBgmMute(!anywindow.Grobal.SoundManager.bgmMute);
      muteBgmItem.checked = anywindow.Grobal.SoundManager.bgmMute;
      muteAllItem.checked =
        anywindow.Grobal.SoundManager.seMute && anywindow.Grobal.SoundManager.bgmMute;
    };
    muteBgmItem.click = toggleBgm;

    const toggleSe = () => {
      /** @type {any} */
      const anywindow = window;
      const mute = !anywindow.Grobal.SoundManager.seMute;
      anywindow.Grobal.SoundManager.setSeMute(mute);
      anywindow.Grobal.SoundManager.setBattleSeMute(mute);
      anywindow.Grobal.SoundManager.setVoiceMute(mute);
      muteSeItem.checked = anywindow.Grobal.SoundManager.seMute;
      muteAllItem.checked =
        anywindow.Grobal.SoundManager.seMute && anywindow.Grobal.SoundManager.bgmMute;
    };
    muteSeItem.click = toggleSe;

    const toggleMute = () => {
      /** @type {any} */
      const anywindow = window;
      const mute = !anywindow.Grobal.SoundManager.bgmMute;
      anywindow.Grobal.SoundManager.setBgmMute(mute);
      anywindow.Grobal.SoundManager.setSeMute(mute);
      anywindow.Grobal.SoundManager.setBattleSeMute(mute);
      anywindow.Grobal.SoundManager.setVoiceMute(mute);
      muteBgmItem.checked = anywindow.Grobal.SoundManager.bgmMute;
      muteSeItem.checked = anywindow.Grobal.SoundManager.seMute;
      muteAllItem.checked =
        anywindow.Grobal.SoundManager.seMute && anywindow.Grobal.SoundManager.bgmMute;
    };
    muteAllItem.click = toggleMute;

    const blackout = () => {
      if (gameCanvas) {
        const isBlackout = blackoutItem.checked;
        setBrightness(!isBlackout ? 100 : mouseIsInside ? blackoutHalfBrightness : 0);
      }
    };
    blackoutItem.click = blackout;

    const screenshot = () => {
      if (gameCanvas)
        gameCanvas.toBlob(function (blob) {
          if (!blob) return;
          const item = new ClipboardItem({ 'image/png': blob });
          navigator.clipboard.write([item]);
        });
    };
    screenshotItem.click = screenshot;

    //=============================
    // Handlers
    //=============================
    document.body.addEventListener('contextmenu', ev => {
      ev.preventDefault();
      menu.popup(ev.x, ev.y);
      return false;
    });

    document.body.addEventListener('mouseenter', () => {
      mouseIsInside = true;
      if (gameCanvas && blackoutItem.checked) setBrightness(blackoutHalfBrightness);
    });

    document.body.addEventListener('mouseleave', () => {
      mouseIsInside = false;
      if (gameCanvas && blackoutItem.checked) setBrightness(0, 350);
    });

    const keydownHandler = ev => {
      if (ev.key === 'f') {
        win.toggleFullscreen();
      } else if (ev.key === 'b') {
        blackoutItem.checked = !blackoutItem.checked;
        blackout();
      } else if (ev.key === 'm') {
        toggleMute();
      } else if (ev.key === 'F12') {
        ev.preventDefault();
        win.capturePage(screenshot);
      }
    };

    document.body.addEventListener('keydown', keydownHandler);
    gameCanvas?.addEventListener('keydown', keydownHandler);

    //=============================
    // Page Clean up
    //=============================

    document.body.style.margin = '0';
    document.body.style.overflow = 'hidden';
    document.body.style.backgroundColor = '#000';

    if (background) {
      background.style.display = 'none';
    }

    if (gameDiv) {
      gameDiv.style.top = '0px';
    }

    if (gameCanvas) {
      const rightClickDisabler = ev => {
        if (ev.button === 2) {
          ev.stopImmediatePropagation();
        }
      };
      gameCanvas.addEventListener('mousedown', rightClickDisabler);
      gameCanvas.addEventListener('mouseup', rightClickDisabler);

      const updateZoom = () => {
        var zoom = Math.pow(1.2, win.zoomLevel);
        const innerWidth = window.innerWidth * zoom;
        const innerHeight = window.innerHeight * zoom;
        const gameWidth = parseInt(gameCanvas.style.width);
        const gameHeight = parseInt(gameCanvas.style.height);
        const widthZoom = innerWidth / gameWidth;
        const heightZoom = innerHeight / gameHeight;
        const zoomLevel = Math.log(Math.min(widthZoom, heightZoom)) / Math.log(1.2);
        if (isNaN(zoomLevel) && !isFinite(zoomLevel)) return;

        win.zoomLevel = zoomLevel;
        if (gameDiv) {
          gameDiv.style.top = (window.innerHeight - gameHeight) / 2.0 + 'px';
        }
      };

      const updateCanvas = () => {
        cc?.view?._resizeEvent(true);
      };

      let lastCanvasWidth = parseInt(gameCanvas.style.width);

      const canvasChangeDetector = new MutationObserver(callback => {
        const currentCanvasWidth = parseInt(gameCanvas.style.width);

        if (lastCanvasWidth === currentCanvasWidth) {
          return;
        }

        console.log('canvas changed');
        lastCanvasWidth = parseInt(gameCanvas.style.width);
        updateZoom();
        updateCanvas();
      });

      let resizeTimeout = null;
      window.addEventListener('resize', () => {
        if (resizeTimeout) {
          clearTimeout(resizeTimeout);
        }
        resizeTimeout = setTimeout(() => {
          updateCanvas();
          resizeTimeout = null;
          resizing = false;
        }, 100);
        resizing = true;
        updateZoom();
      });
      canvasChangeDetector.observe(gameCanvas, { attributes: true });
      updateZoom();
    }
  }

  function processWrapperPage() {
    document.body.style.margin = '0';
    document.body.style.overflow = 'hidden';
    document.body.style.backgroundColor = '#000';

    function trySanitizeFrame() {
      /** @type {HTMLCanvasElement?} */
      const frame = document.querySelector('#game-iframe');
      if (frame) {
        frame.style.position = 'absolute';
        frame.style.top = '0';
        frame.style.left = '0';
        frame.style.width = '100vw';
        frame.style.height = '100vh';
        console.log("I'm in a wrapper page");
      } else {
        setTimeout(() => {
          trySanitizeFrame();
        }, 50);
      }
    }

    trySanitizeFrame();
  }

  function injectBackButton() {
    // Inject a big button at the bottom right corner to redirect to the entry page
    const button = document.createElement('button');
    button.style.position = 'absolute';
    button.style.top = '5px';
    button.style.left = '180px';
    button.style.width = '240px';
    button.style.height = '48px';
    button.style.fontSize = '16px';
    button.style.backgroundColor = '#000b';
    button.style.color = '#fff';
    button.style.border = 'none';
    button.style.outline = 'none';
    button.style.cursor = 'pointer';
    button.style.zIndex = '10000';
    button.style.borderRadius = '8px';
    button.textContent = 'Select Provider';
    button.onclick = () => {
      changeProvider();
    };
    document.body.appendChild(button);
  }

  function Main() {
    const keydownHandler = ev => {
      if (ev.key === 'r' && ev.ctrlKey) {
        nw.Window.get(null).reload();
      }
    };
    document.body.addEventListener('keydown', keydownHandler);

    /** @type {any} */
    const anyNW = nw;
    if (!anyNW?.global?.provider) return;

    const url = window.location.href;
    if (url.startsWith('chrome-extension://')) return;

    if (anyNW.global.wrapperRegex) {
      for (const regex of anyNW.global.wrapperRegex) {
        if (url.match(regex)) {
          processWrapperPage();
          return;
        }
      }
    }

    if (url.match(anyNW.global.loginRegex)) {
      processLoginPage();
      injectBackButton();
    } else if (url.match(anyNW.global.pageRegex)) {
      processWebGLPage();
    } else if (url.match(anyNW.global.gameRegex)) {
      processGamePage();
    } else {
      injectBackButton();
    }
  }

  Main();
})();
