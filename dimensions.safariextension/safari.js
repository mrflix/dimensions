var debug = false;
var tabs = [];

function toggle(tab) {
  if (tabs.indexOf(tab) == -1)
    addTab(tab);
  else
    deactivateTab(tab);
}

function validateTab(tab) {

}

function addTab(tab) {
  var dimensions = Object.create(dimensions);
  dimensions.activate(tab);
  tabs.push(dimensions);
}

function deactivateTab(tab) {
  for (var i = 0; i < tabs.length; i++) {
    if (tabs[i] === tab) {
      tab.deactivate();
      return;
    }
  }
}

function removeTab(tab) {
  var pos = tabs.indexOf(tab);
  tabs.splice(pos, 1);
}

safari.application.addEventListener('command', function (event) {
  toggle(event.target.browserWindow.activeTab);
}, false);
safari.application.addEventListener('validate', function (event) {
  validateTab(event.target.browserWindow.activeTab);
}, false);

// chrome.browserAction.onClicked.addListener(function(tab){
//   toggle(tab);
//   lastBrowserAction = Date.now();
// });

// chrome.runtime.onConnect.addListener(function(port) {
//   tabs[ port.sender.tab.id ].initialize(port);
// });

// chrome.runtime.onSuspend.addListener(function() {
//   for(var tabId in tabs){
//     tabs[tabId].deactivate(true);
//   }
// });

var dimensions = {
  image: new Image(),
  canvas: document.createElement('canvas'),
  alive: true,

  activate: function (tab) {
    this.tab = tab;

    this.onBrowserDisconnectClosure = this.onBrowserDisconnect.bind(this);
    this.receiveBrowserMessageClosure = this.receiveBrowserMessage.bind(this);

    // chrome.browserAction.setIcon({ 
    //   tabId: this.tab.id,
    //   path: {
    //     19: "images/icon_active.png",
    //     38: "images/icon_active@2x.png"
    //   }
    // });

    this.worker = new Worker("dimensions.js");
    this.worker.onmessage = this.receiveWorkerMessage.bind(this);
    this.worker.postMessage({
      type: 'init',
      debug: debug
    });
  },

  deactivate: function (silent) {
    // if(!silent)
    //   this.port.postMessage({ type: 'destroy' });

    // this.port.onMessage.removeListener(this.receiveBrowserMessageClosure);
    // this.port.onDisconnect.removeListener(this.onBrowserDisconnectClosure);

    // chrome.browserAction.setIcon({  
    //   tabId: this.tab.id,
    //   path: {
    //     19: "images/icon.png",
    //     38: "images/icon@2x.png"
    //   }
    // });

    window.removeTab(this.tab.id);
  },

  onBrowserDisconnect: function () {
    this.deactivate(true);
  },

  initialize: function () {
    // this.port.onMessage.addListener(this.receiveBrowserMessageClosure);
    // this.port.onDisconnect.addListener(this.onBrowserDisconnectClosure);
    // this.port.postMessage({
    //   type: 'init',
    //   debug: debug
    // });
  },

  receiveWorkerMessage: function (event) {
    var forward = ['debug screen', 'distances', 'screenshot processed'];

    if (forward.indexOf(event.data.type) > -1) {
      // this.port.postMessage(event.data)
    }
  },

  receiveBrowserMessage: function (event) {
    var forward = ['position', 'area'];

    if (forward.indexOf(event.type) > -1) {
      this.worker.postMessage(event)
    } else {
      switch (event.type) {
        case 'take screenshot':
          this.takeScreenshot();
          break;
      }
    }
  },

  takeScreenshot: function () {
    // chrome.tabs.captureVisibleTab({ format: "png" }, this.parseScreenshot.bind(this));
  },

  parseScreenshot: function (dataUrl) {
    this.image.onload = this.loadImage.bind(this);
    this.image.src = dataUrl;
  },

  //
  // loadImage
  // ---------
  //  
  // responsible to load a image and extract the image data
  //

  loadImage: function () {
    this.ctx = this.canvas.getContext('2d');

    // adjust the canvas size to the image size
    this.canvas.width = this.tab.width;
    this.canvas.height = this.tab.height;

    // draw the image to the canvas
    this.ctx.drawImage(this.image, 0, 0, this.canvas.width, this.canvas.height);

    // read out the image data from the canvas
    var imgData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height).data;

    this.worker.postMessage({
      type: 'imgData',
      imgData: imgData.buffer,
      width: this.canvas.width,
      height: this.canvas.height
    }, [imgData.buffer]);
  }
};