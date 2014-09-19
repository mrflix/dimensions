var tabs = {};

function toggle(tab){
  if(!tabs[tab.id])
    addTab(tab.id);
  else
    removeTab(tab.id);
}

function addTab(id){
  tabs[id] = Object.create(dimensions);
  tabs[id].activate(id);
}

function removeTab(id){
  tabs[id].deactivate();

  for(var tabId in tabs){
    if(tabId == id)
      delete tabs[tabId];
  }
}

chrome.commands.onCommand.addListener(toggle);
chrome.browserAction.onClicked.addListener(toggle);

chrome.runtime.onConnect.addListener(function(port) {
  tabs[ port.sender.tab.id ].initialize(port);
});

chrome.runtime.onSuspend.addListener(function() {
  for(var tabId in tabs){
    tabs[tabId].deactivate();
  }
});



var dimensions = {
  image: new Image(),

  activate: function(id){
    this.id = id;
    this.takeScreenshot();

    chrome.tabs.insertCSS(this.id, { file: 'tooltip.css' });
    chrome.tabs.executeScript(this.id, { file: 'tooltip.js' });
    chrome.browserAction.setIcon({ 
      tabId: this.id,
      path: {
        19: "images/icon_active.png",
        38: "images/icon_active@2x.png"
      }
    });

    this.worker = new Worker("dimensions.js");
    this.worker.onmessage = this.receiveWorkerMessage.bind(this);
  },

  deactivate: function(){
    this.port.postMessage({ type: 'destroy' });
    chrome.browserAction.setIcon({  
      tabId: this.id,
      path: {
        19: "images/icon.png",
        38: "images/icon@2x.png"
      }
    });
  },

  initialize: function(port){
    this.port = port;
    port.onMessage.addListener(this.receiveBrowserMessage.bind(this));
  },

  receiveWorkerMessage: function(event){
    switch(event.data.type){
      case 'distances':
        this.port.postMessage({ 
          type: 'distances', 
          data: event.data.data 
        });
        break;
      case 'screenshot processed':
        // the first time we don't have a port connection yet
        if(this.port)
          this.port.postMessage({ type: 'screenshot taken', data: this.image.src });
        break;
    }
  },

  receiveBrowserMessage: function(event){
    switch(event.type){
      case 'position':
        this.worker.postMessage({
          type: 'distances',
          data: event.data
        });
        break;
      case "area":
        this.worker.postMessage({
          type: 'area',
          data: event.data
        });
        break;
      case 'take screenshot':
        this.takeScreenshot();
        break;
    }
  },

  takeScreenshot: function(){
    chrome.tabs.captureVisibleTab({ format: "png" }, this.parseScreenshot.bind(this));
  },

  parseScreenshot: function(dataUrl){
    this.image.onload = this.loadImage.bind(this);
    this.image.src = dataUrl;
  },

  //
  // loadImage
  // ---------
  //  
  // responsible to load a image and extract the image data
  //

  loadImage: function(){
    var canvas = document.createElement('canvas');
    var ctx = canvas.getContext('2d');

    // adjust the canvas size to the image size
    canvas.width = this.image.width;
    canvas.height = this.image.height;
    
    // draw the image to the canvas
    ctx.drawImage(this.image, 0, 0);
    
    // read out the image data from the canvas
    var imgData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;

    this.worker.postMessage({ 
      type: 'imgData',
      imgData: imgData.buffer,  
      width: canvas.width,
      height: canvas.height
    }, [imgData.buffer]);
  }
};