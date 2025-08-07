var debug = false;
var tabs = {};

function toggle(tab){
  if(!tabs[tab.id])
    addTab(tab);
  else
    deactivateTab(tab.id);
}

function addTab(tab){
  tabs[tab.id] = Object.create(dimensions);
  tabs[tab.id].activate(tab);
}

function deactivateTab(id){
  tabs[id].deactivate();
}

function removeTab(id){
  for(var tabId in tabs){
    if(tabId == id)
      delete tabs[tabId];
  }
}

var lastBrowserAction = null;

chrome.action.onClicked.addListener(function(tab){
  if(lastBrowserAction && Date.now() - lastBrowserAction < 10){
    // fix bug in Chrome Version 49.0.2623.87
    // that triggers browserAction.onClicked twice
    // when called from shortcut _execute_browser_action
    return;
  }
  toggle(tab);
  lastBrowserAction = Date.now();
});

chrome.runtime.onConnect.addListener(function(port) {
  tabs[ port.sender.tab.id ].initialize(port);
});

chrome.runtime.onSuspend.addListener(function() {
  for(var tabId in tabs){
    tabs[tabId].deactivate(true);
  }
});

var dimensions = {
  alive: true,

  activate: function(tab){
    this.tab = tab;

    this.onBrowserDisconnectClosure = this.onBrowserDisconnect.bind(this);
    this.receiveBrowserMessageClosure = this.receiveBrowserMessage.bind(this);

    chrome.scripting.insertCSS({
      target: { tabId: this.tab.id },
      files: ['tooltip.css']
    }).catch(error => {
      console.error('Failed to inject CSS:', error);
    });

    chrome.scripting.executeScript({
      target: { tabId: this.tab.id },
      files: ['tooltip.chrome.js']
    }).catch(error => {
      console.error('Failed to inject script:', error);
    });

    chrome.action.setIcon({
      tabId: this.tab.id,
      path: {
        16: "images/icon16_active.png",
        19: "images/icon19_active.png",
        32: "images/icon16_active@2x.png",
        38: "images/icon19_active@2x.png"
      }
    }).catch(error => {
      console.error('Failed to set icon:', error);
    });

    // Initialize worker and canvas in content script instead of service worker
    this.workerReady = false;
  },

  deactivate: function(silent){
    if(!this.port){
      // not yet initialized
      this.alive = false;
      return;
    }

    if(!silent)
      this.port.postMessage({ type: 'destroy' });

    this.port.onMessage.removeListener(this.receiveBrowserMessageClosure);
    this.port.onDisconnect.removeListener(this.onBrowserDisconnectClosure);

    chrome.action.setIcon({
      tabId: this.tab.id,
      path: {
        16: "images/icon16.png",
        19: "images/icon19.png",
        32: "images/icon16@2x.png",
        38: "images/icon19@2x.png"
      }
    });

    window.removeTab(this.tab.id);
  },

  onBrowserDisconnect: function(){
    this.deactivate(true);
  },

  initialize: function(port){
    this.port = port;

    if(!this.alive){
      // was deactivated whilst still booting up
      this.deactivate();
      return;
    }

    this.port.onMessage.addListener(this.receiveBrowserMessageClosure);
    this.port.onDisconnect.addListener(this.onBrowserDisconnectClosure);
    this.port.postMessage({
      type: 'init',
      debug: debug
    });

    // Initialize worker in content script context
    this.initializeWorker();
  },

  initializeWorker: function(){
    this.port.postMessage({
      type: 'init_worker',
      debug: debug
    });
    this.workerReady = true;
  },

  receiveWorkerMessage: function(event){
    var forward = ['debug screen', 'distances', 'screenshot processed'];

    if(forward.indexOf(event.data.type) > -1){
      this.port.postMessage(event.data)
    }
  },

  receiveBrowserMessage: function(event){
    var forward = ['position', 'area'];

    if(forward.indexOf(event.type) > -1){
      // Forward to content script to handle worker communication
      this.port.postMessage({
        type: 'worker_message',
        data: event
      });
    } else {
      switch(event.type){
        case 'take screenshot':
          this.takeScreenshot();
          break;
        case 'close_overlay':
          this.deactivate();
          break;
        case 'worker_response':
          // Handle worker responses from content script
          this.port.postMessage(event.data);
          break;
        case 'worker_error':
        case 'worker_init_failed':
          console.error('Worker issue:', event.error);
          break;
      }
    }
  },

  takeScreenshot: function(){
    try {
      chrome.tabs.captureVisibleTab({ format: "png" }, this.parseScreenshot.bind(this));
    } catch (error) {
      console.error('Failed to capture screenshot:', error);
      // Notify content script of error
      if(this.port) {
        this.port.postMessage({
          type: 'screenshot_error',
          error: error.message
        });
      }
    }
  },

  parseScreenshot: function(dataUrl){
    // Send screenshot data to content script for processing
    this.port.postMessage({
      type: 'process_screenshot',
      dataUrl: dataUrl,
      tabWidth: this.tab.width,
      tabHeight: this.tab.height
    });
  }
};