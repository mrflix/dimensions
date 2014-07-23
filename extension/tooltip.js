var body = document.querySelector('body');
var port = chrome.runtime.connect({ name: "dimensions" });
var scrollDelay = 300;
var scrollTimeout;
var paused = false;

window.addEventListener('mousemove', onInputMove);
window.addEventListener('touchmove', onInputMove);
window.addEventListener('scroll', onScrollEvent);
window.addEventListener('unload', onUnloadEvent);

port.onMessage.addListener(function(event){
  switch(event.type){
    case 'distances':
      showDimensions(event.data);
      break;
    case 'destroy':
      destroy();
      break;
    case 'screenshot taken':
      resume();
      // var oldscreen = body.querySelector('.screenshot');
      // oldscreen && body.removeChild(oldscreen);

      // var screenshot = new Image();
      // screenshot.src = event.data;
      // screenshot.className = 'screenshot';
      // body.appendChild(screenshot);
      break;
  }
});

function destroy(){
  window.removeEventListener('mousemove', onInputMove);
  window.removeEventListener('touchmove', onInputMove);
  window.removeEventListener('scroll', onScrollEvent);

  removeDimensions();
}

function removeDimensions(){
  var dimensions = body.querySelector('.fn-dimensions');
  if(dimensions)
    body.removeChild(dimensions);
}

function onScrollEvent(){
  pause();

  if(scrollTimeout)
    clearTimeout(scrollTimeout);

  scrollTimeout = setTimeout(sendScrollPosition, scrollDelay);
}

function onUnloadEvent(){
  port.postMessage({ type: 'destroy' });
}

function sendScrollPosition(){
  port.postMessage({ type: 'scroll' });
}

function pause(){
  paused = true;
  removeDimensions();
}

function resume(){
  paused = false;
}

//
// onInputMove
// ===========
//  
// detects the current pointer position and requests the dimensions at that position
//

function onInputMove(event){
  var x, y;

  if('ontouchstart' in window){
    x = event.touches[0].clientX;
    y = event.touches[0].clientY;
  } else {
    x = event.clientX;
    y = event.clientY;
  }

  port.postMessage({ 
    type: 'position',
    data: { x: x, y: y }
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
  tooltip.textContent = measureWidth +" x "+ measureHeight + " px";

  if(dimensions.y < 26)
    tooltip.classList.add('bottom');

  if(dimensions.x > window.innerWidth - 110)
    tooltip.classList.add('left');

  newDimensions.appendChild(xAxis);
  newDimensions.appendChild(yAxis);
  newDimensions.appendChild(tooltip);

  body.appendChild(newDimensions)
}