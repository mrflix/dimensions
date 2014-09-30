var body = document.querySelector('body');
var port = chrome.runtime.connect({ name: "dimensions" });
var changeDelay = 300;
var changeTimeout;
var paused = false;
var inputX, inputY;
var altKeyWasPressed = false;
var connectionClosed = false;
var overlay = document.createElement('div');
overlay.className = 'fn-noCursor';

disableCursor();

window.addEventListener('mousemove', onInputMove);
window.addEventListener('touchmove', onInputMove);
window.addEventListener('scroll', onVisibleAreaChange);
window.addEventListener('resize', onResizeWindow);

window.addEventListener('keydown', detectAltKeyPress);
window.addEventListener('keyup', detectAltKeyRelease);

port.onMessage.addListener(function(event){
  if(connectionClosed)
    return;

  switch(event.type){
    case 'distances':
      showDimensions(event.data);
      break;
    case 'screenshot taken':
      resume();
      // debugScreenshot(event.data);
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

function debugScreenshot(src){
  var oldscreen = body.querySelector('.fn-screenshot');
  oldscreen && body.removeChild(oldscreen);

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

  body.appendChild(newDimensions)
}