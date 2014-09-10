var tabs = {};

function toggle(tab){
  if(!tabs[tab.id])
    activate(tab);
  else
    deactivate(tab);
}

function activate(tab){
  tabs[tab.id] = Object.create(dimensions);
  tabs[tab.id].takeScreenshot();

  chrome.tabs.insertCSS({ file: 'tooltip.css' });
  chrome.tabs.executeScript({ file: 'tooltip.js' });
  chrome.browserAction.setIcon({ 
    tabId: tab.id,
    path: {
      19: "images/icon_active.png",
      38: "images/icon_active@2x.png"
    }
  });
}

function deactivate(tab){
  chrome.browserAction.setIcon({  
    tabId: tab.id,
    path: {
      19: "images/icon.png",
      38: "images/icon@2x.png"
    }
  });

  tabs[tab.id].port.postMessage({ type: 'destroy' });
  tabs[tab.id].data = [];

  for(var tabId in tabs){
    if(tabId == tab.id)
      delete tabs[tabId];
  }
}

chrome.commands.onCommand.addListener(toggle);
chrome.browserAction.onClicked.addListener(toggle);

chrome.runtime.onConnect.addListener(function(port) {
  tabs[ port.sender.tab.id ].initialize(port, port.sender.tab);
});



var dimensions = {
  image: new Image(),
  threshold: 6,
  takingScreenshot: false,

  initialize: function(port, tab){
    this.tab = tab;
    this.port = port;
    port.onMessage.addListener(this.receiveMessage.bind(this));
  },

  receiveMessage: function(event){
    switch(event.type){
      case 'position':
        this.measureDistances(event.data);
        break;
      case 'scroll':
        this.takeScreenshot();
        break;
      case 'destroy':
        deactivate(this.tab);
    }
  },

  takeScreenshot: function(){
    this.takingScreenshot = true;
    chrome.tabs.captureVisibleTab({ format: "png" }, this.parseScreenshot.bind(this));
  },

  parseScreenshot: function(dataUrl){
    this.image.onload = this.loadImage.bind(this);
    this.image.src = dataUrl;

    // the first time we don't have a port connection yet
    if(this.port)
      this.port.postMessage({ type: 'screenshot taken', data: this.image.src });
  },

  //
  // measureDistances
  // ================
  //  
  // measures the distances to the next boundary
  // around pageX and pageY.
  //

  measureDistances: function(input){
    if(this.takingScreenshot)
      return;

    var distances = {
      top: 0,
      right: 0,
      bottom: 0,
      left: 0
    };
    var directions = {
      top:    { x:  0, y: -1 },
      right:  { x:  1, y:  0 },
      bottom: { x:  0, y:  1 },
      left:   { x: -1, y:  0 }
    }
    var area = 0;
    var lightness = this.getLightnessAt(input.x, input.y);

    for(var direction in distances){
      var vector = directions[direction];
      var boundaryFound = false;
      var sx = input.x;
      var sy = input.y;
      var l;

      while(!boundaryFound){
        sx += vector.x;
        sy += vector.y;
        l = this.getLightnessAt(sx, sy);

        if(l && Math.abs(l - lightness) < this.threshold){
          distances[direction]++;
        } else {
          boundaryFound = true;
        }
      }
      
      area += distances[direction];
    }

    if(area <= 6){
      distances = { top: 0, right: 0, bottom: 0, left: 0 };
      var similarColorStreakThreshold = 8;

      for(var direction in distances){
        var vector = directions[direction];
        var boundaryFound = false;
        var sx = input.x;
        var sy = input.y;
        var currentLightness;
        var lastLightness = lightness;
        var similarColorStreak = 0;

        while(!boundaryFound){
          sx += vector.x;
          sy += vector.y;
          currentLightness = this.getLightnessAt(sx, sy);

          if(currentLightness){
            distances[direction]++;

            if(Math.abs(currentLightness - lastLightness) < this.threshold){
              similarColorStreak++;
              if(similarColorStreak === similarColorStreakThreshold){ 
                distances[direction] -= (similarColorStreakThreshold+1);
                boundaryFound = true;
              }
            } else {
              lastLightness = currentLightness;
              similarColorStreak = 0;
            }
          } else {
            boundaryFound = true;
          }
        }
      }
    }

    distances.x = input.x;
    distances.y = input.y;

    this.port.postMessage({
      type: 'distances',
      data: distances
    });
  },

  getLightnessAt: function(x, y){
    return this.inBoundaries(x, y) ? this.data[y * this.width + x] : -1;
  },

  //
  // inBoundaries
  // ============
  //  
  // checks if x and y are in the canvas boundaries
  //

  inBoundaries: function(x, y){
    if(x >= 0 && x <= this.width && y >= 0 && y <= this.height)
      return true;
    else
      return false;
  },

  //
  // Grayscale
  // ---------
  //  
  // reduces the input image data to an array of gray shades.
  //

  grayscale: function(imgData){
    var gray = new Int16Array(imgData.length/4);

    for(var i=0, n=0, l=imgData.length; i<l; i+=4, n++){
      var r = imgData[i],
          g = imgData[i+1],
          b = imgData[i+2];

      // weighted grayscale algorithm
      gray[n] = Math.round(r * 0.3 + g * 0.59 + b * 0.11);
    }

    return gray;
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
    this.width = canvas.width = this.image.width;
    this.height = canvas.height = this.image.height;
    
    // draw the image to the canvas
    ctx.drawImage(this.image, 0, 0);
    
    // read out the image data from the canvas
    var imgData = ctx.getImageData(0, 0, this.width, this.height).data;

    // delete old grayscale data
    this.data = [];
    
    // grayscale the image data
    this.data = this.grayscale( imgData );

    this.takingScreenshot = false;
  }
};