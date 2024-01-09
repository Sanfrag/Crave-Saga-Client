// @ts-check
/** @type {any} */
var cc;
/** @type {any} */
var chrome;
/** @type {any} */
var __custom;
/** @type {any} */
const anyNW = nw;

const notifier = anyNW.global.notifier;
const DateTime = anyNW.global.DateTime;
const msgpack = anyNW.global.msgpack;

//=============================
// Main
//=============================
(function () {
  if (!process) return;

  const isDev = process.versions['nw-flavor'] === 'sdk';
  // @ts-ignore
  anyNW.global.iconPath = isDev ? './release/app/icon.png' : './app/icon.png';
  // @ts-ignore
  const config = anyNW.global.config;

  let resizing = false;

  //=============================
  // Helpers
  //=============================
  const info = label => {
    return new anyNW.MenuItem({
      label: label,
      enabled: false,
    });
  };

  const readSettingString = key => {
    return localStorage.getItem(`csc:${key}`);
  };

  const readSettingToggle = key => {
    return localStorage.getItem(`csc:${key}`) === 'true';
  };

  const writeSetting = (key, value) => {
    if (value === undefined) {
      localStorage.removeItem(`csc:${key}`);
    } else {
      localStorage.setItem(`csc:${key}`, value.toString());
    }
  };

  const configToggle = (label, configKey) => {
    const toggle = new anyNW.MenuItem({
      label: label,
      type: 'checkbox',
      checked: readSettingToggle(configKey),
      click: () => {
        writeSetting(configKey, toggle.checked);
      },
    });
    return toggle;
  };

  const checkbox = (key, label, click) => {
    if (click) {
      return new anyNW.MenuItem({
        type: 'checkbox',
        label: label,
        key,
        click,
        checked: false,
      });
    } else {
      return new anyNW.MenuItem({
        type: 'checkbox',
        key,
        label: label,
        checked: false,
      });
    }
  };

  const item = (key, label, click) => {
    if (click) {
      return new anyNW.MenuItem({
        label: label,
        key,
        click,
      });
    } else {
      return new anyNW.MenuItem({
        label: label,
        key,
      });
    }
  };

  const itemMod = (modifiers, key, label, click) => {
    if (click) {
      return new anyNW.MenuItem({
        label: label,
        key,
        modifiers,
        click,
      });
    } else {
      return new anyNW.MenuItem({
        label: label,
        key,
        modifiers,
      });
    }
  };

  function changeProvider() {
    const selectorUrl = anyNW.global.selector;
    // append reselect=1 search params
    const url = new URL(selectorUrl);
    url.searchParams.set('reselect', '1');

    // @ts-ignore
    chrome.tabs.update(anyNW.Window.get(null).cWindow.tabs[0].id, { url: url.href });
  }

  function checkRegex(url, r) {
    if (Array.isArray(r)) {
      for (const regex of r) {
        if (url.match(regex)) {
          return true;
        }
      }
    } else if (r) {
      return url.match(r);
    }
    return false;
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
      if (!anyNW?.global?.provider) return;

      const url = iframe.src;
      return checkRegex(url, anyNW.global.wrapperRegex) || checkRegex(url, anyNW.global.gameRegex);
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
        var originalPause = cc.game.pause;
        // @ts-ignore
        anyNW.global.pauseGame = () => {
          originalPause.apply(cc.game);
        };
        // @ts-ignore
        anyNW.global.resumeGame = () => {
          cc.game.resume();
        };
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
        if (!resizing && !document.hidden) {
          ambientCtx.drawImage(gameCanvas, 0, 0, 512, 512);
        }
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

    const brightnessAnimation = () => {
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
      requestAnimationFrame(brightnessAnimation);
    };

    brightnessAnimation();
  }

  function notify(type, options, timeout) {
    if (!readSettingToggle(type)) return;

    const focusOnClick = (_, type) => {
      if (type == 'activate') {
        anyNW.global.show();
      }
    };

    if (timeout) {
      setTimeout(() => {
        notifier.notify(
          {
            title: 'Crave Saga',
            ...options,
            // @ts-ignore
            icon: anyNW.global.iconPath,
            appName: 'Crave Saga',
          },
          focusOnClick
        );
      }, timeout);
    } else {
      notifier.notify(
        {
          title: 'Crave Saga',
          ...options,
          // @ts-ignore
          icon: anyNW.global.iconPath,
          appName: 'Crave Saga',
        },
        focusOnClick
      );
    }
  }

  //=============================
  // Trackers
  //=============================
  function autoParse(content) {
    try {
      if (typeof content === 'string') {
        return JSON.parse(content);
      } else if (typeof content === 'object') {
        return msgpack.decode(Buffer.from(content));
      }
    } catch (e) {
      console.error(e);
    }
    return null;
  }

  // - User Master Data (for checking max stamina)
  let userMasterData = null;

  function processUserMasterData(data) {
    try {
      userMasterData = data;
      if (userData.hasData) {
        const levelData = userMasterData?.UserMain?.[userData.userLevel - 1];
        if (levelData) {
          userData.staminaMax = levelData.maxStamina;
          userData.battlePointMax = levelData.maxBattlePoint;
          userData.staminaIsFull = userData.staminaValue >= levelData.maxStamina;
          userData.battlePointIsFull = userData.battlePointValue >= levelData.maxBattlePoint;
          userData.hasMasterData = true;
        }
      }
    } catch (e) {
      console.error(e);
    }
  }

  let referenceGameDate = null;
  let referenceTime = null;
  let referenceTimeDiff = null;

  function parseGameDate(date) {
    return DateTime.local(
      parseInt(date.substr(0, 4)),
      parseInt(date.substr(4, 2)),
      parseInt(date.substr(6, 2)),
      parseInt(date.substr(8, 2)),
      parseInt(date.substr(10, 2)),
      parseInt(date.substr(12, 2))
    );
  }

  function systemDateUpdate(systemDate) {
    if (systemDate) {
      referenceGameDate = parseGameDate(systemDate);
      referenceTime = DateTime.local();
      referenceTimeDiff = referenceGameDate.diff(referenceTime);
      console.log('[CSC] Updating time:');
      console.log(`[CSC] - Game time: ${referenceGameDate.toISO()}`);
      console.log(`[CSC] - System time: ${referenceTime.toISO()}`);
    }
  }

  // - Time Tracker

  function updateTime(data) {
    try {
      let systemDate = data?.systemDate;
      systemDateUpdate(systemDate);
    } catch (e) {
      console.log(e);
    }
  }

  // - stamina Tracker
  /** @type {any} */
  let userData = {
    userLevel: 0,
    staminaMax: 0,
    battlePointMax: 0,

    staminaValue: 0,
    staminaRecoverInterval: 180,
    staminaRecoveryDate: null,
    staminaRemainSec: 0,
    staminaBonus: 0,
    staminaIsFull: false,

    battlePointValue: 0,
    battlePointRecoverInterval: 600,
    battlePointRecoveryDate: null,
    battlePointRemainSec: 0,
    battlePointBonus: 0,
    battlePointIsFull: false,

    estimatedstamina: 0,
    estimatedstaminaRemainSec: 0,
    estimatedBattlePoint: 0,
    estimatedBattlePointRemainSec: 0,

    hasData: false,
    hasMasterData: false,
  };

  function updateUser(data) {
    try {
      // Update Time
      let user = data.user;

      // Update User Level and stamina
      if (!user) return;
      let systemDate = user?.systemDate;
      systemDateUpdate(systemDate);

      userData.userLevel = user.level;

      userData.staminaValue = user.staminaValue;
      userData.staminaBonus = user.staminaBonus;
      userData.staminaRecoveryDate = parseGameDate(user.staminaRecoveryDate);
      userData.staminaRemainSec = user.staminaRemainSec;
      userData.battlePointValue = user.battlePointValue;
      userData.battlePointBonus = user.battlePointBonus;
      userData.battlePointRecoveryDate = parseGameDate(user.battlePointRecoveryDate);
      userData.battlePointRemainSec = user.battlePointRemainSec;
      userData.hasData = true;

      const levelData = userMasterData?.UserMain?.[userData.userLevel - 1];
      if (levelData) {
        userData.staminaMax = levelData.maxStamina;
        userData.battlePointMax = levelData.maxBattlePoint;
        userData.staminaIsFull = user.staminaValue >= levelData.maxStamina;
        userData.battlePointIsFull = user.battlePointValue >= levelData.maxBattlePoint;
        userData.hasMasterData = true;
      }
    } catch (e) {
      console.error(e);
    }
  }

  function gameDateNow() {
    if (!referenceTimeDiff) return null;
    const local = DateTime.local();
    return local.plus(referenceTimeDiff);
  }

  function localDate(gameDate) {
    if (!referenceTimeDiff) return null;
    return gameDate.minus(referenceTimeDiff);
  }

  // - Expeditions Tracker
  const expeditions = {};
  const expeditionGroups = [];
  function updateExpeditions(data) {
    try {
      const gameNow = gameDateNow();
      if (!gameNow) return;

      const expeditionData = data?.expeditions;
      if (!expeditionData) return;
      for (var expedition of expeditionData) {
        if (!expedition) continue;
        if (!expedition.endDate) continue;
        if (!expedition.startDate) continue;
        const endTime = parseGameDate(expedition.endDate);
        if (!endTime) continue;

        const id = expedition.slotId;

        // ignore expired just in case
        if (endTime < gameNow || expedition.receiveDate) {
          if (expeditions[id]) {
            delete expeditions[id];
            console.log(`[CSC] Expedition #${id} finished`);
          }
          continue;
        }

        console.log(`[CSC] Tracking expedition #${id}: ${localDate(endTime).toISO()}`);
        expeditions[id] = endTime;
        groupExpeditions();
      }
    } catch (e) {
      console.error(e);
    }
  }

  function groupExpeditions() {
    expeditionGroups.splice(0, expeditionGroups.length);
    // group expeditions within 1 minute
    for (const id in expeditions) {
      const millis = expeditions[id];
      let existingGroup = null;
      for (const group of expeditionGroups) {
        if (Math.abs(group.endTime - millis) < 60000) {
          existingGroup = group;
          break;
        }
      }
      if (existingGroup) {
        existingGroup.ids.push(id);
        existingGroup.endTime = Math.max(existingGroup.endTime, millis);
      } else {
        expeditionGroups.push({ endTime: millis, ids: [id] });
      }
    }
  }

  // - Raid Tracker
  const raidData = {
    isInRaid: false,
    hasScore: false,
    hp: 0,
    score: 0,
    currentScore: 0,
  };

  function updateRaidBattle(data) {
    try {
      if (data.raidStatus) {
        raidData.hp = data.raidStatus.currentHp;
        raidData.isInRaid = true;
        return;
      }
      if (data.currentHp) {
        raidData.hp = data.currentHp;
        raidData.currentScore = data.score;
        raidData.isInRaid = true;
      } else {
        raidData.isInRaid = false;
        raidData.hasScore = false;
        raidData.hp = 0;
        raidData.score = 0;
        raidData.currentScore = 0;
      }
    } catch (e) {
      console.error(e);
    }
  }

  function endBattle() {
    raidData.isInRaid = false;
    raidData.hasScore = false;
    raidData.hp = 0;
    raidData.score = 0;
    raidData.currentScore = 0;
  }

  function setupRoutineChecker(callback) {
    const statusEntries = [];

    setInterval(() => {
      statusEntries.splice(0, statusEntries.length);

      const now =
        // @ts-ignore
        referenceTimeDiff && nw?.global?.__debugTime
          ? // @ts-ignore
            DateTime.fromMillis(nw?.global?.__debugTime).plus(referenceTimeDiff)
          : gameDateNow();
      if (!now) return;

      // Check whether any expedition is finished
      for (const group in expeditionGroups) {
        const groupData = expeditionGroups[group];
        if (now > groupData.endTime) {
          const ids = groupData.ids.map(id => `#${id}`);
          const count = ids.length;
          const message = count > 1 ? `Expeditions ${ids.join(',')}` : `Expedition ${ids[0]}`;
          notify('noti:expedition', {
            message: `${message} has finished`,
          });
          for (const id of groupData.ids) {
            delete expeditions[id];
          }
          groupExpeditions();
        }
      }

      // Estimate stamina and battle point
      if (userData.hasData && userData.hasMasterData) {
        const staminaStartTime = userData.staminaRecoveryDate.minus({
          seconds: userData.staminaRemainSec,
        });
        const staminaInterval = userData.staminaRecoverInterval;
        const staminaDiff = now.diff(staminaStartTime, 'seconds').seconds;
        const staminaRecoverCount = Math.floor(staminaDiff / staminaInterval);

        userData.estimatedstamina = Math.min(
          userData.staminaMax,
          userData.staminaValue + staminaRecoverCount
        );
        userData.estimatedstaminaRemainSec = Math.ceil(
          staminaInterval - (staminaDiff % staminaInterval)
        );

        const isstaminaFull = userData.estimatedstamina >= userData.staminaMax;

        const battlePointStartTime = userData.battlePointRecoveryDate.minus({
          seconds: userData.battlePointRemainSec,
        });
        const battlePointInterval = userData.battlePointRecoverInterval;
        const battlePointDiff = now.diff(battlePointStartTime, 'seconds').seconds;
        const battlePointRecoverCount = Math.floor(battlePointDiff / battlePointInterval);

        userData.estimatedBattlePoint = Math.min(
          userData.battlePointMax,
          userData.battlePointValue + battlePointRecoverCount
        );
        userData.estimatedBattlePointRemainSec = Math.ceil(
          battlePointInterval - (battlePointDiff % battlePointInterval)
        );

        const isBattlePointFull = userData.estimatedBattlePoint >= userData.battlePointMax;

        const staminaString = isstaminaFull
          ? `AP: ${userData.estimatedstamina + userData.staminaBonus}/${userData.staminaMax}`
          : `AP: ${userData.estimatedstamina + userData.staminaBonus}/${userData.staminaMax} (${
              userData.estimatedstaminaRemainSec
            }s)`;

        const battlePointString = isBattlePointFull
          ? `RP: ${userData.estimatedBattlePoint + userData.battlePointBonus}/${
              userData.battlePointMax
            }`
          : `RP: ${userData.estimatedBattlePoint + userData.battlePointBonus}/${
              userData.battlePointMax
            } (${userData.estimatedBattlePointRemainSec}s)`;

        statusEntries.push(staminaString);
        statusEntries.push(battlePointString);

        if (!userData.staminaIsFull && isstaminaFull) {
          notify('noti:stamina', {
            message: 'AP has fully recovered',
          });
          userData.staminaIsFull = true;
        }

        if (!userData.battlePointIsFull && isBattlePointFull) {
          notify('noti:battlepoint', {
            message: 'RP has fully recovered',
          });
          userData.battlePointIsFull = true;
        }
      }

      if (raidData.isInRaid) {
        if (raidData.currentScore != null) raidData.score = raidData.currentScore;

        statusEntries.push(`Raid Boss HP: ${raidData.hp}`);
        if (raidData.score) statusEntries.push(`Raid Damage: ${raidData.score}`);

        if (!raidData.hasScore && raidData.currentScore != null) {
          raidData.hasScore = true;
        } else if (raidData.hasScore && raidData.currentScore == null) {
          raidData.hasScore = false;
          notify('noti:raidDeath', {
            message: `Your team has been defeated in raid battle.`,
          });
        }
      }

      callback?.(statusEntries);
    }, 1000);
  }

  //=============================
  // Request Process
  //=============================
  /** @param req {XMLHttpRequest} */
  function processRequest(req) {
    const url = new URL(req.responseURL);
    if (!url.pathname.startsWith('/gg/')) return;

    const pathname = url.pathname;
    const data = autoParse(req.response);
    if (!data) return;

    if (pathname.match(/\/user\/getMasterData$/)) {
      processUserMasterData(data);
    } else if (pathname.match(/\/user\/getSystemDate$/)) {
      updateTime(data);
    } else if (pathname.match(/\/raid\/updateBattle$/)) {
      updateRaidBattle(data);
    } else if (
      pathname.match(/\/raid\/joinBattle$/) ||
      pathname.match(/\/raid\/resumeBattle$/) ||
      pathname.match(/\/raid\/appearBattle$/)
    ) {
      updateRaidBattle(data);
    } else if (pathname.match(/endBattle$/)) {
      endBattle();
      // Ending battles
      setTimeout(() => {
        notify('noti:battleEnd', {
          title: 'Crave Saga',
          message: 'Battle has ended',
          appName: 'Crave Saga',
        });
      }, 3500);
    }

    // Update user data if there is any
    updateUser(data);

    // Update expedition data if there is any
    updateExpeditions(data);
  }

  (function (open) {
    XMLHttpRequest.prototype.open = function () {
      this.addEventListener(
        'readystatechange',
        function () {
          if (this.readyState == 4) {
            try {
              processRequest(this);
            } catch (e) {
              console.error(e);
            }
          }
        },
        false
      );
      open.apply(this, arguments);
    };
  })(XMLHttpRequest.prototype.open);

  //=============================
  // Game Page
  //=============================
  function processGamePage() {
    disableBackgroundMute();

    const win = anyNW.Window.get(null);
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
    const menu = new anyNW.Menu();
    const separator = new anyNW.MenuItem({ type: 'separator' });
    const fullscreenItem = checkbox('f', 'Fullscreen', () => win.toggleFullscreen());
    const alwaysOnTopItem = checkbox(null, 'Always on top', () =>
      win.setAlwaysOnTop(alwaysOnTopItem.checked)
    );
    const screenshotItem = item('F12', 'Screenshot to clipboard');
    const blackoutItem = checkbox('b', 'Blackout');
    const muteAllItem = checkbox('m', 'Mute All');
    const muteBgmItem = checkbox(null, 'Mute BGM');
    const muteSeItem = checkbox(null, 'Mute SE');

    const audioMenu = new anyNW.Menu();
    audioMenu.append(muteAllItem);
    audioMenu.append(separator);
    audioMenu.append(muteBgmItem);
    audioMenu.append(muteSeItem);

    const notificationsMenu = new anyNW.Menu();
    notificationsMenu.append(configToggle('Battle end', 'noti:battleEnd'));
    notificationsMenu.append(configToggle('Team death (Raid)', 'noti:raidDeath'));
    notificationsMenu.append(configToggle('Expeditions', 'noti:expedition'));
    notificationsMenu.append(configToggle('AP full', 'noti:stamina'));
    notificationsMenu.append(configToggle('RP full', 'noti:battlepoint'));

    const changeProviderItem = item(null, 'Change provider', () => {
      changeProvider();
    });

    const langItems = [];
    if (anyNW.global.langs) {
      for (const lang of anyNW.global.langs) {
        const langName = lang.name;
        const langRegex = lang.regex;
        const langUrl = lang.url;
        if (window.location.href.match(langRegex)) {
          continue;
        }

        const langItem = item(null, langName, () => {
          anyNW.Window.get(null).window.location.href = langUrl;
        });
        langItems.push(langItem);
      }
    }

    let langMenuItem = null;

    if (langItems.length > 1) {
      langMenuItem = new anyNW.MenuItem({ label: 'Language', submenu: new anyNW.Menu() });
      for (const langItem of langItems) {
        langMenuItem.submenu.append(langItem);
      }
    } else if (langItems.length === 1) {
      langMenuItem = langItems[0];
      langMenuItem.label = `Change language: ${langMenuItem.label}`;
    }

    const reloadItem = itemMod('ctrl', 'r', 'Reload', () => win.reload());
    const clearCacheItem = item(null, 'Clear cache and reload', () => {
      if (confirm('Are you sure you want to clear cache?')) {
        document.write('<body style="background-color: #000;"></body>');
        anyNW.App.clearCache();
        win.reload();
      }
    });
    const logoutItem = item(null, 'Logout', () => {
      if (confirm('Are you sure you want to logout?')) {
        localStorage.clear();
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
          anyNW.Window.get(null).window.location.href = anyNW.global.entryUrl;
        }

        removeAllCookiesAndReload();
      }
    });

    const dataMenu = new anyNW.Menu();
    dataMenu.append(reloadItem);
    dataMenu.append(separator);
    dataMenu.append(clearCacheItem);
    dataMenu.append(logoutItem);

    const audioMenuItem = new anyNW.MenuItem({ label: 'Audio', submenu: audioMenu });
    const notificationMenuItem = new anyNW.MenuItem({
      label: 'Notifications',
      submenu: notificationsMenu,
    });

    const providerMenuItem = info(anyNW.global.provider);
    const statusMenuItem = info('Logging in...');

    menu.append(providerMenuItem);
    menu.append(statusMenuItem);
    menu.append(separator);
    menu.append(fullscreenItem);
    menu.append(blackoutItem);
    menu.append(alwaysOnTopItem);
    menu.append(screenshotItem);
    menu.append(separator);
    menu.append(audioMenuItem);
    menu.append(notificationMenuItem);
    menu.append(separator);
    menu.append(changeProviderItem);
    if (langMenuItem) menu.append(langMenuItem);
    menu.append(separator);
    menu.append(new anyNW.MenuItem({ label: 'Data', submenu: dataMenu }));

    const quitItem = item(null, 'Quit', () => {
      anyNW.App.quit();
    });

    const trayMenu = new anyNW.Menu();

    trayMenu.append(providerMenuItem);
    trayMenu.append(statusMenuItem);
    trayMenu.append(separator);
    trayMenu.append(audioMenuItem);
    trayMenu.append(notificationMenuItem);
    trayMenu.append(separator);
    trayMenu.append(quitItem);

    // Setup tray menu
    anyNW.global.menu = trayMenu;
    if (anyNW.global.tray) {
      anyNW.global.tray.menu = trayMenu;
    }

    win.on('enter-fullscreen', () => {
      fullscreenItem.checked = true;
    });
    win.on('restore', () => {
      fullscreenItem.checked = win.isFullscreen;
    });

    setupRoutineChecker(status => {
      const statusString = status.join(' | ');
      const window = nw.Window.get(null).window;
      if (window && window.document) window.document.title = `Crave Saga | ${statusString}`;
      statusMenuItem.label = statusString;

      if (anyNW.global.tray) {
        anyNW.global.tray.tooltip = `Crave Saga | ${statusString}`;
      }
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
        screenshot();
      } else if (ev.key === 'r' && ev.ctrlKey) {
        anyNW.Window.get(null).reload();
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

        console.log('[CSC] Canvas Change Detected. Rescaling.');
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

    const prepareEngine = async () => {
      anyNW.global.engine = {
        menu,
        trayMenu,
        gameCanvas,
        document,
      };

      const waitForRequire = async () => {
        return new Promise(resolve => {
          const check = () => {
            // @ts-ignore
            if (typeof __require != 'function') {
              requestAnimationFrame(check);
              return;
            }

            // @ts-ignore
            anyNW.global.engine.require = __require;
            resolve(null);
          };
          check();
        });
      };

      const waitForCC = async () => {
        return new Promise(resolve => {
          const check = () => {
            // @ts-ignore
            if (typeof cc != 'object') {
              requestAnimationFrame(check);
              return;
            }

            // @ts-ignore
            anyNW.global.engine.cc = cc;
            resolve(null);
          };
          check();
        });
      };

      await Promise.all([waitForRequire(), waitForCC()]);
      console.log('[CSC] Engine prepared.');
      try {
        // clear all custom module cache
        const path = require('path');
        const customScript = require.resolve('../custom');
        const customPath = path.dirname(customScript);

        for (const key in require.cache) {
          if (key.startsWith(customPath)) {
            delete require.cache[key];
          }
        }
        // @ts-ignore
        require('../custom');
      } catch (e) {
        console.log(e);
      }
    };

    prepareEngine();

    // @ts-ignore
    nw.global.localStorage.setItem('success', 'true');
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
        console.log('[CSC] Wrapper page sanitized.');
      } else {
        setTimeout(() => {
          trySanitizeFrame();
        }, 50);
      }
    }

    trySanitizeFrame();
  }

  function injectBackButton() {
    // Inject a big button at the top left corner to redirect to the entry page
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
        anyNW.Window.get(null).reload();
      }
    };
    document.body.addEventListener('keydown', keydownHandler);

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

    if (checkRegex(url, anyNW.global.loginRegex)) {
      processLoginPage();
      injectBackButton();
    } else if (checkRegex(url, anyNW.global.pageRegex)) {
      processWebGLPage();
    } else if (checkRegex(url, anyNW.global.gameRegex)) {
      processGamePage();
    } else {
      injectBackButton();
    }
  }

  Main();
})();
