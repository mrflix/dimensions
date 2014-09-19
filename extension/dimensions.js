var areaThreshold = 3;
var dimensionsThreshold = 6;

onmessage = function(event){
  switch(event.data.type){
    case 'imgData':
      data = grayscale( new Uint8ClampedArray(event.data.imgData) );
      width = event.data.width;
      height = event.data.height;
      break;
    case 'distances':
      measureDistances(event.data.data);
      break;
    case "area":
      measureArea(event.data.data);
      break;
  }
}


//
// measureArea
// ===========
//  
// measures the area around pageX and pageY.
//
//
function measureArea(pos){
  var x0 = pos.x;
  var y0 = pos.y;
  var map = new Int16Array(data);
  var area = { top: y0, right: x0, bottom: y0, left: x0 };
  var pixelsInArea = [];
  var boundaries = { vertical: [], horizontal: [] };

  var startLightness = getLightnessAt(map, x0, y0);
  var stack = [[x0, y0, startLightness]];

  while(stack.length){
    var xyl = stack.shift();
    var x = xyl[0];
    var y = xyl[1];
    var lastLightness = xyl[2];
    
    currentLightness = getLightnessAt(map, x, y);

    if(currentLightness && Math.abs(currentLightness - lastLightness) < areaThreshold){
      setLightnessAt(map, x, y, 999);
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

  area.x = getAverage(boundaries.horizontal);
  area.y = getAverage(boundaries.vertical);

  area.left = area.x - area.left;
  area.right = area.right - area.x;
  area.top = area.y - area.top;
  area.bottom = area.bottom - area.y;

  postMessage({
    type: 'distances',
    data: area
  });
}


function getAverage(values){
  var i = values.length,
    sum = 0;
  while (i--) {
    sum = sum + values[i];
  }

  return Math.floor(sum/values.length);
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

      if(currentLightness && Math.abs(currentLightness - lastLightness) < dimensionsThreshold){
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

        if(currentLightness){
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

  postMessage({
    type: 'distances',
    data: distances
  });
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