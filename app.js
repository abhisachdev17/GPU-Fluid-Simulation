let gl;
let canvas;
let JACOBI_ITERATIONS = 20;
let floatExt;
let supportLinear;
let resolution = 1024;

var InitDemo = function () {
  canvas = document.getElementById("fluid-container");
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  console.log("This is working");
  gl = canvas.getContext("webgl");
  if (!gl) {
    alert("Browser does not support webgl");
  }
  floatExt = gl.getExtension("OES_texture_half_float");
  supportLinear = gl.getExtension("OES_texture_half_float_linear");
};

let time = 0.01;
var simulateFluid = function (canvas) {
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.clearColor(0.0, 0.0, 0.0, 1.0);
  gl.enable(gl.DEPTH_TEST);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  var quad = new Float32Array([-1, -1, -1, 1, 1, 1, 1, -1]);
  var buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW);

  var indices = new Uint16Array([0, 1, 2, 0, 2, 3]);
  var indexBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);

  addDensity(0, 0);
  var draw = function () {
    // gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0.0, 0.0, 0.0, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    step(time);

    gl.viewport(0, 0, canvas.width, canvas.height);
    mainProgram.bind();
    gl.uniform2f(
      mainProgram.getUniform("texelSize"),
      1.0 / canvas.width,
      1.0 / canvas.height
    );
    gl.uniform1i(mainProgram.getUniform("tex"), fDensity.bind(0));
    drawOnScreen(mainProgram, null);

    time += 0.0001;
    requestAnimationFrame(draw);
  };
  requestAnimationFrame(draw);
};

var drawOnScreen = function (program, frameBuffer) {
  var positionALoc = gl.getAttribLocation(program.program, "vertPosition");
  gl.vertexAttribPointer(
    positionALoc,
    2,
    gl.FLOAT,
    gl.FALSE,
    2 * Float32Array.BYTES_PER_ELEMENT,
    0
  );
  gl.enableVertexAttribArray(positionALoc);
  gl.bindFramebuffer(gl.FRAMEBUFFER, frameBuffer);
  gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
};

InitDemo();

class FBOTexture {
  constructor(w, h) {
    gl.activeTexture(gl.TEXTURE0);
    this.texture = gl.createTexture();
    this.createTexture(w, h);

    this.fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      this.texture,
      0
    );
    gl.viewport(0, 0, w, h);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    this.texelSizeX = 1.0 / w;
    this.texelSizeY = 1.0 / h;
  }

  createTexture(w, h) {
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      w,
      h,
      0,
      gl.RGBA,
      floatExt.HALF_FLOAT_OES,
      null
    );
  }
  bind(num) {
    gl.activeTexture(gl.TEXTURE0 + num);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    return num;
  }
}

let divergence, fDensity, fVelocity, fPressure;
let bDensity, bVelocity, bPressure;
var InitFrameBuffers = function () {
  var width = resolution;
  var height = resolution;
  fDensity = new FBOTexture(width, height);
  bDensity = new FBOTexture(width, height);

  fVelocity = new FBOTexture(width, height);
  bVelocity = new FBOTexture(width, height);

  fPressure = new FBOTexture(width, height);
  bPressure = new FBOTexture(width, height);

  divergence = new FBOTexture(width, height);
};

var createProgram = function (vertexShaderText, fragmentShaderText) {
  var program = gl.createProgram();

  //create shader
  var vertexShader = gl.createShader(gl.VERTEX_SHADER);
  var fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);

  gl.shaderSource(vertexShader, vertexShaderText);
  gl.shaderSource(fragmentShader, fragmentShaderText);

  gl.compileShader(vertexShader);
  gl.compileShader(fragmentShader);

  if (!gl.getShaderParameter(vertexShader, gl.COMPILE_STATUS)) {
    console.log("Compilation Error vertex shader");
    var compilationLog = gl.getShaderInfoLog(fragmentShader);
    console.log("Shader compiler log: " + compilationLog);
  }
  if (!gl.getShaderParameter(fragmentShader, gl.COMPILE_STATUS)) {
    console.log("Compilation Error fragment shader");
    var compilationLog = gl.getShaderInfoLog(fragmentShader);
    console.log("Shader compiler log: " + compilationLog);
  }

  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);

  return program;
};

class Program {
  constructor(vertexShaderText, fragmentShaderText) {
    this.program = createProgram(vertexShaderText, fragmentShaderText);
  }

  bind() {
    gl.useProgram(this.program);
  }

  getUniform(name) {
    return gl.getUniformLocation(this.program, name);
  }
}

let splatProgram = new Program(
  document.getElementById("vertexShader").innerHTML,
  document.getElementById("splatShader").innerHTML
);

let advectionProgram = new Program(
  document.getElementById("vertexShader").innerHTML,
  document.getElementById("advectShader").innerHTML
);

let divergenceProgram = new Program(
  document.getElementById("vertexShader").innerHTML,
  document.getElementById("divergenceShader").innerHTML
);

let pressureProgram = new Program(
  document.getElementById("vertexShader").innerHTML,
  document.getElementById("jacobiShader").innerHTML
);

let gradienSubtractProgram = new Program(
  document.getElementById("vertexShader").innerHTML,
  document.getElementById("gradientSubtractShader").innerHTML
);

let mainProgram = new Program(
  document.getElementById("vertexShader").innerHTML,
  document.getElementById("fragmentShader").innerHTML
);

let fadeProgram = new Program(
  document.getElementById("vertexShader").innerHTML,
  document.getElementById("fadeShader").innerHTML
);

var step = function (timestep) {
  gl.disable(gl.BLEND);
  gl.viewport(0, 0, resolution, resolution);

  advectionProgram.bind();
  gl.uniform2f(
    advectionProgram.getUniform("texelSize"),
    fVelocity.texelSizeX,
    fVelocity.texelSizeY
  );
  gl.uniform1i(advectionProgram.getUniform("toAdvect"), fVelocity.bind(0));
  gl.uniform1i(advectionProgram.getUniform("inputVelocity"), fVelocity.bind(1));
  gl.uniform1f(advectionProgram.getUniform("timeStep"), timestep);
  drawOnScreen(advectionProgram, bVelocity.fbo);

  divergenceProgram.bind();
  gl.uniform2f(
    divergenceProgram.getUniform("texelSize"),
    bVelocity.texelSizeX,
    bVelocity.texelSizeY
  );
  gl.uniform1i(
    divergenceProgram.getUniform("inputVelocity"),
    bVelocity.bind(0)
  );
  drawOnScreen(divergenceProgram, divergence.fbo);

  pressureProgram.bind();
  gl.uniform2f(
    pressureProgram.getUniform("texelSize"),
    bVelocity.texelSizeX,
    bVelocity.texelSizeY
  );
  gl.uniform1i(pressureProgram.getUniform("bTex"), divergence.bind(0));
  gl.uniform1f(pressureProgram.getUniform("alpha"), -1.0 / 4.0);
  gl.uniform1f(pressureProgram.getUniform("inverseBeta"), 0.25);
  for (var i = 0; i < JACOBI_ITERATIONS; i++) {
    gl.uniform1i(pressureProgram.getUniform("xTex"), fPressure.bind(1));
    drawOnScreen(pressureProgram, bPressure.fbo);

    var temp = fPressure;
    fPressure = bPressure;
    bPressure = temp;
  }

  var tempVel = fVelocity;
  fVelocity = bVelocity;
  bVelocity = tempVel;

  gradienSubtractProgram.bind();
  gl.uniform2f(
    gradienSubtractProgram.getUniform("texelSize"),
    fVelocity.texelSizeX,
    fVelocity.texelSizeY
  );
  gl.uniform1i(
    gradienSubtractProgram.getUniform("pressure"),
    fPressure.bind(0)
  );
  gl.uniform1i(
    gradienSubtractProgram.getUniform("velocity"),
    fVelocity.bind(1)
  );
  drawOnScreen(gradienSubtractProgram, bVelocity.fbo);

  advectionProgram.bind();
  gl.uniform2f(
    advectionProgram.getUniform("texelSize"),
    fVelocity.texelSizeX,
    fVelocity.texelSizeY
  );
  gl.uniform1i(advectionProgram.getUniform("toAdvect"), fDensity.bind(0));
  gl.uniform1i(advectionProgram.getUniform("inputVelocity"), bVelocity.bind(1));
  gl.uniform1f(advectionProgram.getUniform("timeStep"), timestep);
  drawOnScreen(advectionProgram, bDensity.fbo);

  fadeProgram.bind();
  gl.uniform2f(
    fadeProgram.getUniform("texelSize"),
    bDensity.texelSizeX,
    bDensity.texelSizeY
  );
  gl.uniform1f(fadeProgram.getUniform("resolution"), resolution);
  gl.uniform1i(fadeProgram.getUniform("tex"), bDensity.bind(0));
  drawOnScreen(advectionProgram, fDensity.fbo);

  var tempVel = fVelocity;
  fVelocity = bVelocity;
  bVelocity = tempVel;
  var tempP = fPressure;
  fPressure = bPressure;
  bPressure = tempP;
};

function addDensity(posX, posY) {
  gl.viewport(0, 0, resolution, resolution);
  splatProgram.bind();
  gl.uniform1i(splatProgram.getUniform("tex"), fDensity.bind(0));
  gl.uniform2f(splatProgram.getUniform("point"), posX, posY);
  gl.uniform3f(splatProgram.getUniform("color"), 0.5, 0.1, 0.9);
  gl.uniform1f(splatProgram.getUniform("radius"), 0.0002);
  gl.uniform1f(
    splatProgram.getUniform("aspectRatio"),
    canvas.width / canvas.height
  );
  drawOnScreen(splatProgram, bDensity.fbo);

  var tempDens = fDensity;
  fDensity = bDensity;
  bDensity = tempDens;

  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
}

function addVelocity(posX, posY, dirX, dirY) {
  gl.viewport(0, 0, resolution, resolution);
  splatProgram.bind();
  gl.uniform1i(splatProgram.getUniform("tex"), fVelocity.bind(0));
  gl.uniform2f(splatProgram.getUniform("point"), posX, posY);
  gl.uniform3f(splatProgram.getUniform("color"), dirX * 1000, dirY * 1000, 0.0);
  gl.uniform1f(splatProgram.getUniform("radius"), 0.0002);
  gl.uniform1f(
    splatProgram.getUniform("aspectRatio"),
    canvas.width / canvas.height
  );
  drawOnScreen(splatProgram, bVelocity.fbo);

  var tempVel = fVelocity;
  fVelocity = bVelocity;
  bVelocity = tempVel;

  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
}

var mouseClick = false;

var mouseDragged = function (event) {
  var mouseX = parseInt(event.x) / canvas.width;
  var mouseY = (canvas.height - parseInt(event.y)) / canvas.height;
  if (mouseClick) {
    addDensity(mouseX, mouseY);
    addVelocity(mouseX, mouseY, mouseX - prevX, mouseY - prevY);
    prevX = mouseX;
    prevY = mouseY;
  }
};

var mouseDown = function (event) {
  mouseClick = true;
  prevX = parseInt(event.x) / canvas.width;
  prevY = 1.0 - parseInt(event.y) / canvas.height;
};

var mouseUp = function (event) {
  mouseClick = false;
};

InitFrameBuffers();
simulateFluid(canvas);

var restart = function (res) {
  console.log(res.value);

  if (res.value == "default") {
  } else {
    if (res.value == "Max") {
      resolution = canvas.width;
    } else {
      resolution = res.value;
    }
    InitDemo();
    InitFrameBuffers();
  }
};
