// @ts-check

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
