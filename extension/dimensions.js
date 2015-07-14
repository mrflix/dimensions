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


//
// create debug visualization
// ==========================
//  
// goals:
//  - show area progress to debug the area detection flood fill
//
// returns imgData
//

function sendDebugScreen() {
  postMessage({ 
    type: 'debug screen',
    map: map
  })
}


//
// measureArea
// ===========
//  
// measures the area around pageX and pageY.
//
//
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

  // clear map
  map = []

  // find boundarie-pixels

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

  // place dimensions at the max spread point
  // e.g.:
  //  - in a circle it returns the center
  //  - in a complex shape this might fail but it tries to get close enough

  var x = getMaxSpread(boundariePixels.top, boundariePixels.bottom);
  var y = getMaxSpread(boundariePixels.left, boundariePixels.right);

  area.x = x;
  area.y = y;
  area.left = area.x - area.left;
  area.right = area.right - area.x;
  area.top = area.y - area.top;
  area.bottom = area.bottom - area.y;

  area.backgroundColor = getColorAt(area.x, area.y);

  console.log(boundariePixels, x, y, area)

  postMessage({
    type: 'distances',
    data: area
  });
}


function getMaxSpread(sideA, sideB){
  var a = getDimensions(sideA);
  var b = getDimensions(sideB);

  // favor the smaller side
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

//
// measureDistances
// ================
//  
// measures the distances to the next boundary
// around pageX and pageY.
//

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

    // reset lightness to start lightness
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


//
// inBoundaries
// ============
//  
// checks if x and y are in the canvas boundaries
//
function inBoundaries(x, y){
  if(x >= 0 && x <= width && y >= 0 && y <= height)
    return true;
  else
    return false;
}

//
// Grayscale
// ---------
//  
// reduces the input image data to an array of gray shades.
//

function grayscale(imgData){
  var gray = new Int16Array(imgData.length/4);

  for(var i=0, n=0, l=imgData.length; i<l; i+=4, n++){
    var r = imgData[i],
        g = imgData[i+1],
        b = imgData[i+2];

    // weighted grayscale algorithm
    gray[n] = Math.round(r * 0.3 + g * 0.59 + b * 0.11);
  }

  return gray;
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