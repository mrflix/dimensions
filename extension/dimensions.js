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
  threshold: 6,
  takingScreenshot: false,

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
    port.onMessage.addListener(this.receiveMessage.bind(this));
  },

  receiveMessage: function(event){
    switch(event.type){
      case 'position':
        this.measureDistances(event.data);
        break;
      case "area":
        this.measureArea(event.data);
        break;
      case 'newScreenshot':
        this.takeScreenshot();
        break;
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
  // measureArea
  // ===========
  //  
  // measures the area around pageX and pageY.
  //
  //
  measureArea: function(pos){
    if(this.takingScreenshot)
      return;

    var x0 = pos.x;
    var y0 = pos.y;
    var map = new Int16Array(this.data);
    var area = { top: y0, right: x0, bottom: y0, left: x0 };
    var pixelsInArea = [];
    var boundaries = { vertical: [], horizontal: [] };
    var maxArea = 5000000;
    var areaFound = true;
    var i = 0;

    var startLightness = this.getLightnessAt(map, x0, y0);
    var stack = [[x0, y0, startLightness]];

    while(stack.length){
      if(++i > maxArea){
        areaFound = false;
        break;
      }

      var xyl = stack.shift();
      var x = xyl[0];
      var y = xyl[1];
      var lastLightness = xyl[2];
      
      currentLightness = this.getLightnessAt(map, x, y);

      if(currentLightness && Math.abs(currentLightness - lastLightness) < this.threshold){
        this.setLightnessAt(map, x, y, 999);
        pixelsInArea.push([x,y]);

        if(x < area.left)
          area.left = x;
        else if(x > area.right)
          area.right = x;
        if(y < area.top)
          area.top = y;
        else if(y > area.bottom)
          area.bottom = y;

        stack.push([x-1, y  , currentLightness]);
        stack.push([x  , y+1, currentLightness]);
        stack.push([x+1, y  , currentLightness]);
        stack.push([x  , y-1, currentLightness]);
      }
    }

    for(var i=0, l=pixelsInArea.length; i<l; i++){
      var x = pixelsInArea[i][0];
      var y = pixelsInArea[i][1];

      if(x === area.left || x === area.right)
        boundaries.vertical.push(y);
      if(y === area.top || y === area.bottom)
        boundaries.horizontal.push(x);
    }

    area.x = this.getAverage(boundaries.horizontal);
    area.y = this.getAverage(boundaries.vertical);

    area.left = area.x - area.left;
    area.right = area.right - area.x;
    area.top = area.y - area.top;
    area.bottom = area.bottom - area.y;

    this.port.postMessage({
      type: 'distances',
      data: areaFound ? area : false
    });
  },


  getAverage: function(values){
    var i = values.length,
      sum = 0;
    while (i--) {
      sum = sum + values[i];
    }

    return Math.floor(sum/values.length);
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
    var startLightness = this.getLightnessAt(this.data, input.x, input.y);
    var lastLightness;

    for(var direction in distances){
      var vector = directions[direction];
      var boundaryFound = false;
      var sx = input.x;
      var sy = input.y;
      var currentLightness;

      // reset lightness to start lightness
      lastLightness = startLightness;

      while(!boundaryFound){
        sx += vector.x;
        sy += vector.y;
        currentLightness = this.getLightnessAt(this.data, sx, sy);

        if(currentLightness && Math.abs(currentLightness - lastLightness) < this.threshold){
          distances[direction]++;
          lastLightness = currentLightness;
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
        var similarColorStreak = 0;

        lastLightness = startLightness;

        while(!boundaryFound){
          sx += vector.x;
          sy += vector.y;
          currentLightness = this.getLightnessAt(this.data, sx, sy);

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

  getLightnessAt: function(data, x, y){
    return this.inBoundaries(x, y) ? data[y * this.width + x] : -1;
  },

  setLightnessAt: function(data, x, y, value){
    return this.inBoundaries(x, y) ? data[y * this.width + x] = value : -1;
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