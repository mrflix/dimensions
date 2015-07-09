var debug = false;

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

function init(){
  window.addEventListener('mousemove', onInputMove);
  window.addEventListener('touchmove', onInputMove);
  window.addEventListener('scroll', onVisibleAreaChange);
  window.addEventListener('resize', onResizeWindow);

  window.addEventListener('keydown', detectAltKeyPress);
  window.addEventListener('keyup', detectAltKeyRelease);

  disableCursor();
  requestNewScreenshot();
}

port.onMessage.addListener(function(event){
  if(connectionClosed)
    return;

  switch(event.type){
    case 'distances':
      showDimensions(event.data);
      break;
    case 'screenshot taken':
      resume();

      if(debug)
        debugScreenshot(event.data);
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

function removeDebugScreenshot(){
  var oldscreen = body.querySelector('.fn-screenshot');
  if(oldscreen)
    oldscreen.parentNode.removeChild(oldscreen);
}

function debugScreenshot(src){
  removeDebugScreenshot();

  var screenshot = new Image();
  screenshot.src = src;
  screenshot.className = 'fn-screenshot';
  body.appendChild(screenshot);
}

function destroy(){
  connectionClosed = true;
  window.removeEventListener('mousemove', onInputMove);
  window.removeEventListener('touchmove', onInputMove);
  window.removeEventListener('scroll', onVisibleAreaChange);

  removeDimensions();
  removeDebugScreenshot();
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

  if(debug)
    removeDebugScreenshot();

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
  if(event.altKey){
    altKeyWasPressed = true;
    sendToWorker(event);
  }
}

function detectAltKeyRelease(event){
  if(altKeyWasPressed){
    altKeyWasPressed = false;
    sendToWorker(event);
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

init();