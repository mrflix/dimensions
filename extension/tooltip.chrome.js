var body = document.querySelector('body');
var port = chrome.runtime.connect({ name: "dimensions" });
var changeDelay = 300;
var changeTimeout;
var paused = true;
var inputX, inputY;
var altKeyWasPressed = false;
var connectionClosed = false;
var lineColor = getLineColor();
var colorThreshold = [0.2,0.5,0.2];
var overlay = document.createElement('div');
overlay.className = 'fn-noCursor';
var debug;

// Worker and image processing variables
var worker;
var image;
var canvas;
var workerBlobUrl;

function init(){
  window.addEventListener('mousemove', onInputMove);
  window.addEventListener('touchmove', onInputMove);
  window.addEventListener('scroll', onVisibleAreaChange);
  window.addEventListener('resize', onResizeWindow);

  window.addEventListener('keydown', detectAltKeyPress);
  window.addEventListener('keyup', detectAltKeyRelease);
  window.addEventListener('keyup', onKeyRelease);

  disableCursor();
  requestNewScreenshot();
}

port.onMessage.addListener(function(event){
  if(connectionClosed)
    return;

  switch(event.type){
    case 'init':
      debug = event.debug;

      if(debug)
        createDebugScreen();
      break;
    case 'init_worker':
      initializeWorker(event.debug);
      break;
    case 'worker_message':
      if(worker) {
        worker.postMessage(event.data);
      }
      break;
    case 'process_screenshot':
      processScreenshot(event.dataUrl, event.tabWidth, event.tabHeight);
      break;
    case 'screenshot_error':
      console.error('Screenshot capture failed:', event.error);
      resume(); // Resume normal operation
      break;
    case 'distances':
      showDimensions(event.data);
      break;
    case 'screenshot processed':
      resume();
      break;
    case 'debug screen':
      renderDebugScreenshot(event.map)
      break;
    case 'destroy':
      destroy();
      break;
  }
});

function onResizeWindow(){
  overlay.width = window.innerWidth;
  overlay.height = window.innerHeight;
  onVisibleAreaChange();
}

onResizeWindow();

function createDebugScreen(){
  debugScreen = document.createElement('canvas');
  dsx = debugScreen.getContext('2d');
  debugScreen.className = 'fn-debugScreen';
  body.appendChild(debugScreen);
}

function removeDebugScreen(){
  if(!debug || !debugScreen)
    return;

  body.removeChild(debugScreen);
}

function hideDebugScreen(){
  if(!debug || !debugScreen)
    return;

  debugScreen.classList.add('is-hidden');
}

function renderDebugScreenshot(map) {
  debugScreen.setAttribute('width', window.innerWidth);
  debugScreen.setAttribute('height', window.innerHeight);
  debugScreen.classList.remove('is-hidden');

  var visualization = dsx.createImageData(window.innerWidth, window.innerHeight);

  for(var i=0, n=0, l=visualization.data.length; i<l; i++, n+= 4){
    if(map && map[i] === 256) {
      visualization.data[n] = 255; // r
      visualization.data[n+1] = 0; // g
      visualization.data[n+2] = 0; // b
      visualization.data[n+3] = 128; // a
    }
  }

  dsx.putImageData(visualization, 0, 0);
}

function destroy(){
  connectionClosed = true;
  window.removeEventListener('mousemove', onInputMove);
  window.removeEventListener('touchmove', onInputMove);
  window.removeEventListener('scroll', onVisibleAreaChange);
  window.removeEventListener('resize', onResizeWindow);
  window.removeEventListener('keydown', detectAltKeyPress);
  window.removeEventListener('keyup', detectAltKeyRelease);
  window.removeEventListener('keyup', onKeyRelease);

  // Clean up worker
  if(worker) {
    worker.terminate();
    worker = null;
  }

  // Clean up blob URL
  if(workerBlobUrl) {
    URL.revokeObjectURL(workerBlobUrl);
    workerBlobUrl = null;
  }

  removeDebugScreen();
  removeDimensions();
  enableCursor();
}

function removeDimensions(){
  var dimensions = body.querySelector('.fn-dimensions');
  if(dimensions)
    body.removeChild(dimensions);
}

function onVisibleAreaChange(){
  if(!paused)
    pause();
  else
    return;

  if(changeTimeout)
    clearTimeout(changeTimeout);

  changeTimeout = setTimeout(requestNewScreenshot, changeDelay);
}

function requestNewScreenshot(){
  port.postMessage({ type: 'take screenshot' });
}

function pause(){
  paused = true;
  removeDimensions();
  enableCursor();
}

function resume(){
  paused = false;
  disableCursor();
}

function disableCursor(){
  body.appendChild(overlay);
}

function enableCursor(){
  body.removeChild(overlay);
}

function detectAltKeyPress(event){
  if(event.altKey && !altKeyWasPressed){
    altKeyWasPressed = true;
    sendToWorker(event);
  }
}

function detectAltKeyRelease(event){
  if(altKeyWasPressed){
    altKeyWasPressed = false;
    sendToWorker(event);
    hideDebugScreen();
  }
}

function onKeyRelease(event) {
  switch (event.code) {
    case 'Escape':
      port.postMessage({ type: 'close_overlay' });
    break;
  }
}

//
// onInputMove
// ===========
//
// detects the current pointer position and requests the dimensions at that position
//

function onInputMove(event){
  if(event.touches){
    inputX = event.touches[0].clientX;
    inputY = event.touches[0].clientY;
  } else {
    inputX = event.clientX;
    inputY = event.clientY;
  }

  sendToWorker(event);
}

function sendToWorker(event){
  if(paused)
    return;

  port.postMessage({
    type: event.altKey ? 'area' : 'position',
    data: { x: inputX, y: inputY }
  });
}

//
// showDimensions
// ==============
//
// renders the visualisation of the measured dimensions
//

function showDimensions(dimensions){
  if(paused)
    return;

  removeDimensions();

  if(!dimensions)
    return;

  var newDimensions = document.createElement('div');
  newDimensions.className = 'fn-dimensions';
  newDimensions.style.left = dimensions.x + "px";
  newDimensions.style.top = dimensions.y + "px";

  if(Math.abs(dimensions.backgroundColor[0] - lineColor[0]) <= colorThreshold[0] &&
      Math.abs(dimensions.backgroundColor[1] - lineColor[1]) <= colorThreshold[1] &&
      Math.abs(dimensions.backgroundColor[2] - lineColor[2]) <= colorThreshold[2])
    newDimensions.className += ' altColor';

  var measureWidth = dimensions.left + dimensions.right;
  var measureHeight = dimensions.top + dimensions.bottom;

  var xAxis = document.createElement('div');
  xAxis.className = 'x fn-axis';
  xAxis.style.left = -dimensions.left + "px";
  xAxis.style.width = measureWidth + "px";

  var yAxis = document.createElement('div');
  yAxis.className = 'y fn-axis';
  yAxis.style.top = -dimensions.top + "px";
  yAxis.style.height = measureHeight + "px";

  var tooltip = document.createElement('div');
  tooltip.className = 'fn-tooltip';

  // add +1 on both axis because of the pixel below the mouse pointer
  tooltip.textContent = (measureWidth+1) +" x "+ (measureHeight+1) + " px";

  if(dimensions.y < 26)
    tooltip.classList.add('bottom');

  if(dimensions.x > window.innerWidth - 110)
    tooltip.classList.add('left');

  newDimensions.appendChild(xAxis);
  newDimensions.appendChild(yAxis);
  newDimensions.appendChild(tooltip);

  body.appendChild(newDimensions);
}

function getLineColor() {
  var axis = document.createElement('div');
  axis.className = 'fn-axis';

  body.appendChild(axis);

  var style = getComputedStyle(axis);
  var rgbString = style.backgroundColor;
  var colorsOnly = rgbString.substring(rgbString.indexOf('(') + 1, rgbString.lastIndexOf(')')).split(/,\s*/);

  body.removeChild(axis);

  return rgbToHsl(colorsOnly[0], colorsOnly[1], colorsOnly[2]);
}

/**
 * Converts an RGB color value to HSL. Conversion formula
 * adapted from http://en.wikipedia.org/wiki/HSL_color_space.
 * Assumes r, g, and b are contained in the set [0, 255] and
 * returns h, s, and l in the set [0, 1].
 *
 * @param   Number  r       The red color value
 * @param   Number  g       The green color value
 * @param   Number  b       The blue color value
 * @return  Array           The HSL representation
 */
function rgbToHsl(r, g, b){
  r /= 255, g /= 255, b /= 255;
  var max = Math.max(r, g, b), min = Math.min(r, g, b);
  var h, s, l = (max + min) / 2;

  if(max == min){
    h = s = 0; // achromatic
  }else{
    var d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch(max){
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }

  return [h, s, l];
}

// Worker initialization and image processing functions
function initializeWorker(debugMode) {
  try {
    // Create inline worker to avoid Chrome 139 security restrictions
    const workerCode = `
var areaThreshold = 6;
var dimensionsThreshold = 6;
var debug;
var map;

onmessage = function(event){
  switch(event.data.type){
    case 'init':
      debug = event.data.debug;
      break;
    case 'imgData':
      imgData = new Uint8ClampedArray(event.data.imgData);
      data = grayscale( imgData );
      width = event.data.width;
      height = event.data.height;
      postMessage({ type: "screenshot processed" });
      break;
    case 'position':
      measureAreaStopped = true;
      measureDistances(event.data.data);
      break;
    case "area":
      measureAreaStopped = true;
      measureArea(event.data.data);
      break;
  }
}

function sendDebugScreen() {
  postMessage({
    type: 'debug screen',
    map: map
  })
}

function measureArea(pos){
  var x0, y0, startLightness;

  map = new Int16Array(data);
  x0 = pos.x;
  y0 = pos.y;
  startLightness = getLightnessAt(map, x0, y0);
  stack = [[x0, y0, startLightness]];
  area = { top: y0, right: x0, bottom: y0, left: x0 };
  pixelsInArea = [];

  measureAreaStopped = false;

  setTimeout(nextTick, 0);
}

function nextTick(){
  workOffStack();

  if(debug)
    sendDebugScreen()

  if(!measureAreaStopped){
    if(stack.length){
      setTimeout(nextTick, 0);
    } else {
      finishMeasureArea();
    }
  }
}

function workOffStack(){
  var max = 500000;
  var count = 0;

  while(count++ < max && stack.length){
    floodFill();
  }
}

function floodFill(){
  var xyl = stack.shift();
  var x = xyl[0];
  var y = xyl[1];
  var lastLightness = xyl[2];
  var currentLightness = getLightnessAt(map, x, y);

  if(currentLightness > -1 && currentLightness < 256 && Math.abs(currentLightness - lastLightness) < areaThreshold){
    setLightnessAt(map, x, y, 256);
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

function finishMeasureArea(){
  var boundariePixels = {
    top: [],
    right: [],
    bottom: [],
    left: []
  };

  map = []

  for(var i=0, l=pixelsInArea.length; i<l; i++){
    var x = pixelsInArea[i][0];
    var y = pixelsInArea[i][1];

    if(x === area.left)
      boundariePixels.left.push(y);
    if(x === area.right)
      boundariePixels.right.push(y);

    if(y === area.top)
      boundariePixels.top.push(x);
    if(y === area.bottom)
      boundariePixels.bottom.push(x);
  }

  var x = getMaxSpread(boundariePixels.top, boundariePixels.bottom);
  var y = getMaxSpread(boundariePixels.left, boundariePixels.right);

  area.x = x;
  area.y = y;
  area.left = area.x - area.left;
  area.right = area.right - area.x;
  area.top = area.y - area.top;
  area.bottom = area.bottom - area.y;

  area.backgroundColor = getColorAt(area.x, area.y);

  postMessage({
    type: 'distances',
    data: area
  });
}

function getMaxSpread(sideA, sideB){
  var a = getDimensions(sideA);
  var b = getDimensions(sideB);

  var smallerSide = a.length < b.length ? a : b;

  return smallerSide.center;
}

function getDimensions(values){
  var min = Infinity;
  var max = 0;

  for(var i=0, l=values.length; i<l; i++){
    if(values[i] < min)
      min = values[i]
    if(values[i] > max)
      max = values[i]
  }

  return {
    min: min,
    center: min + Math.floor((max - min)/2),
    max: max,
    length: max - min
  }
}

function measureDistances(input){
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
  var startLightness = getLightnessAt(data, input.x, input.y);
  var lastLightness;

  for(var direction in distances){
    var vector = directions[direction];
    var boundaryFound = false;
    var sx = input.x;
    var sy = input.y;
    var currentLightness;

    lastLightness = startLightness;

    while(!boundaryFound){
      sx += vector.x;
      sy += vector.y;
      currentLightness = getLightnessAt(data, sx, sy);

      if(currentLightness > -1 && Math.abs(currentLightness - lastLightness) < dimensionsThreshold){
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
        currentLightness = getLightnessAt(data, sx, sy);

        if(currentLightness > -1){
          distances[direction]++;

          if(Math.abs(currentLightness - lastLightness) < dimensionsThreshold){
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
  distances.backgroundColor = getColorAt(input.x, input.y);

  postMessage({
    type: 'distances',
    data: distances
  });
}

function getColorAt(x, y){
  if(!inBoundaries(x, y))
    return -1;

  var i = y * width * 4 + x * 4;

  return rgbToHsl(imgData[i], imgData[++i], imgData[++i]);
}

function getLightnessAt(data, x, y){
  return inBoundaries(x, y) ? data[y * width + x] : -1;
}

function setLightnessAt(data, x, y, value){
  return inBoundaries(x, y) ? data[y * width + x] = value : -1;
}

function inBoundaries(x, y){
  if(x >= 0 && x < width && y >= 0 && y < height)
    return true;
  else
    return false;
}

function grayscale(imgData){
  var gray = new Int16Array(imgData.length/4);

  for(var i=0, n=0, l=imgData.length; i<l; i+=4, n++){
    var r = imgData[i],
        g = imgData[i+1],
        b = imgData[i+2];

    gray[n] = Math.round(r * 0.3 + g * 0.59 + b * 0.11);
  }

  return gray;
}

function rgbToHsl(r, g, b){
  r /= 255, g /= 255, b /= 255;
  var max = Math.max(r, g, b), min = Math.min(r, g, b);
  var h, s, l = (max + min) / 2;

  if(max == min){
    h = s = 0;
  }else{
    var d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch(max){
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }

  return [h, s, l];
}
`;

    // Create blob URL for the worker
    const blob = new Blob([workerCode], { type: 'application/javascript' });
    workerBlobUrl = URL.createObjectURL(blob);

    worker = new Worker(workerBlobUrl);

    worker.onmessage = function(event) {
      // Forward worker responses back to service worker
      port.postMessage({
        type: 'worker_response',
        data: event.data
      });
    };

    worker.onerror = function(error) {
      console.error('Worker error:', error);
      // Notify service worker of worker error
      port.postMessage({
        type: 'worker_error',
        error: error.message
      });
    };

    worker.postMessage({
      type: 'init',
      debug: debugMode
    });

    // Initialize image and canvas for screenshot processing
    image = new Image();
    canvas = document.createElement('canvas');

    image.onerror = function(error) {
      console.error('Image loading error:', error);
    };

  } catch (error) {
    console.error('Failed to initialize worker:', error);
    // Notify service worker that worker initialization failed
    port.postMessage({
      type: 'worker_init_failed',
      error: error.message
    });
  }
}

function processScreenshot(dataUrl, tabWidth, tabHeight) {
  if (!image || !canvas || !worker) {
    console.error('Image processing components not initialized');
    return;
  }

  image.onload = function() {
    loadImage(tabWidth, tabHeight);
  };
  image.src = dataUrl;
}

function loadImage(tabWidth, tabHeight) {
  var ctx = canvas.getContext('2d');

  // adjust the canvas size to the image size
  canvas.width = tabWidth;
  canvas.height = tabHeight;

  // draw the image to the canvas
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

  // read out the image data from the canvas
  var imgData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;

  worker.postMessage({
    type: 'imgData',
    imgData: imgData.buffer,
    width: canvas.width,
    height: canvas.height
  }, [imgData.buffer]);
}

init();