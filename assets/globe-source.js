import * as THREE from 'three';

(function(){
  var canvas = document.getElementById('helix-canvas');
  if(!canvas || typeof THREE === 'undefined') return;

  // ── Renderer ──────────────────────────────────────────────
  var renderer = new THREE.WebGLRenderer({canvas:canvas, antialias:true, alpha:true});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio,2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.domElement.style.position="fixed";
  renderer.domElement.style.top="0";
  renderer.domElement.style.left="0";

  // ── Scene & Camera ────────────────────────────────────────
  var scene  = new THREE.Scene();
  var camera = new THREE.PerspectiveCamera(45, window.innerWidth/window.innerHeight, 0.1, 1000);
  camera.position.set(-0.4, 0.1, 3.15);

  // ── Resize ────────────────────────────────────────────────
  window.addEventListener('resize', function(){
    camera.aspect = window.innerWidth/window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // ── Stars ─────────────────────────────────────────────────
  var starGeo  = new THREE.BufferGeometry();
  var starVerts = [];
  for(var i=0;i<8000;i++){
    var theta = Math.random()*Math.PI*2;
    var phi   = Math.acos(2*Math.random()-1);
    var r     = 80 + Math.random()*120;
    starVerts.push(
      r*Math.sin(phi)*Math.cos(theta),
      r*Math.sin(phi)*Math.sin(theta),
      r*Math.cos(phi)
    );
  }
  starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starVerts,3));
  var starMat  = new THREE.PointsMaterial({color:0xffffff, size:0.18, transparent:true, opacity:0.75});
  scene.add(new THREE.Points(starGeo, starMat));

  // ── Texture loader ────────────────────────────────────────
  var loader = new THREE.TextureLoader();
  loader.crossOrigin = 'anonymous';

  // Using NASA/natural earth textures from a reliable CDN
  var earthTexUrl  = 'https://cdn.jsdelivr.net/npm/three-globe@2.37.1/example/img/earth-blue-marble.jpg';
  var normalTexUrl = 'https://cdn.jsdelivr.net/npm/three-globe@2.37.1/example/img/earth-topology.png';
  var cloudsTexUrl = null;
  var nightTexUrl  = 'https://cdn.jsdelivr.net/npm/three-globe@2.37.1/example/img/earth-night.jpg';

  // ── Earth sphere ──────────────────────────────────────────
  var earthGeo = new THREE.SphereGeometry(1, 64, 64);
  var earthMat = new THREE.MeshPhongMaterial({
    shininess: 8,
    specular: new THREE.Color(0x333333),
  });
  var earth = new THREE.Mesh(earthGeo, earthMat);
  scene.add(earth);

  // ── Atmosphere glow ───────────────────────────────────────
  var atmGeo = new THREE.SphereGeometry(1.02, 64, 64);
  var atmMat = new THREE.MeshPhongMaterial({
    color: 0x4488ff,
    transparent: true,
    opacity: 0.07,
    side: THREE.FrontSide,
  });
  scene.add(new THREE.Mesh(atmGeo, atmMat));

  // Outer atmosphere halo
  var haloGeo = new THREE.SphereGeometry(1.15, 64, 64);
  var haloMat = new THREE.MeshPhongMaterial({
    color: 0x2255cc,
    transparent: true,
    opacity: 0.04,
    side: THREE.BackSide,
  });
  scene.add(new THREE.Mesh(haloGeo, haloMat));

  // ── Cloud layer ───────────────────────────────────────────
  var cloudGeo = new THREE.SphereGeometry(1.005, 64, 64);
  var cloudMat = new THREE.MeshPhongMaterial({
    transparent: true,
    opacity: 0.38,
    depthWrite: false,
  });
  var clouds = new THREE.Mesh(cloudGeo, cloudMat);
  scene.add(clouds);
  clouds.visible = false;

  // ── Load textures ─────────────────────────────────────────
  loader.load(earthTexUrl,   function(t){ earthMat.map     = t; earthMat.needsUpdate=true; });
  loader.load(normalTexUrl,  function(t){ earthMat.bumpMap = t; earthMat.bumpScale=0.05; earthMat.needsUpdate=true; });
  cloudsTexUrl && loader.load(cloudsTexUrl,  function(t){ cloudMat.map     = t; cloudMat.needsUpdate=true; });
  loader.load(nightTexUrl,   function(t){ earthMat.emissiveMap=t; earthMat.emissive=new THREE.Color(0x221100); earthMat.emissiveIntensity=0.8; earthMat.needsUpdate=true; });

  // ── Lighting ──────────────────────────────────────────────
  // Sun light from one direction
  var sunLight = new THREE.DirectionalLight(0xfff5e0, 1.3);
  sunLight.position.set(5, 3, 5);
  scene.add(sunLight);

  // Ambient — very dim so night side stays dark
  scene.add(new THREE.AmbientLight(0x111122, 0.4));

  // Subtle blue fill from opposite side (earthshine)
  var fillLight = new THREE.DirectionalLight(0x3344aa, 0.12);
  fillLight.position.set(-5,-2,-3);
  scene.add(fillLight);

  // ── Interaction (drag, inertia, tap-to-map) ───────────────
  var raycaster = new THREE.Raycaster();
  var pointerNdc = new THREE.Vector2();
  var isDragging = false;
  var activePointer = null;
  var lastPointerX = 0;
  var dragDistance = 0;
  var spinVelocity = 0;
  var lastInteractAt = Date.now();
  var idleResumeMs = 3200;
  var tapThreshold = 6;

  function desktopGlobeActive() {
    return window.innerWidth > 700 || (window.innerWidth <= 700 && !window.matchMedia('(orientation: portrait)').matches);
  }

  function markGlobeInteract() {
    lastInteractAt = Date.now();
  }

  function sphereHitToLatLng(hitPoint) {
    var local = hitPoint.clone();
    earth.worldToLocal(local);
    local.normalize();
    var lat = Math.asin(Math.max(-1, Math.min(1, local.y))) * (180 / Math.PI);
    var lng = Math.atan2(local.x, local.z) * (180 / Math.PI);
    return { lat: lat, lng: lng };
  }

  function pickGlobeLatLng(clientX, clientY) {
    pointerNdc.x = (clientX / window.innerWidth) * 2 - 1;
    pointerNdc.y = -(clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(pointerNdc, camera);
    var hits = raycaster.intersectObject(earth);
    if (!hits.length) return null;
    return sphereHitToLatLng(hits[0].point);
  }

  function openGlobeMap(clientX, clientY) {
    var ll = (clientX != null) ? pickGlobeLatLng(clientX, clientY) : null;
    if (ll && window.pinitOpenMapAtGlobe) {
      window.pinitOpenMapAtGlobe(ll.lat, ll.lng);
    } else if (typeof openMap === 'function') {
      openMap();
    }
  }

  function clearBrowserSelection() {
    var sel = window.getSelection && window.getSelection();
    if (sel && sel.removeAllRanges) sel.removeAllRanges();
  }

  function endGlobeDragState() {
    document.body.classList.remove('is-globe-dragging');
  }

  canvas.addEventListener('pointerdown', function(e) {
    if (!desktopGlobeActive()) return;
    clearBrowserSelection();
    document.body.classList.add('is-globe-dragging');
    isDragging = true;
    activePointer = e.pointerId;
    lastPointerX = e.clientX;
    dragDistance = 0;
    spinVelocity = 0;
    canvas.classList.add('is-dragging');
    markGlobeInteract();
    if (e.cancelable) e.preventDefault();
    try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
  });

  canvas.addEventListener('pointermove', function(e) {
    if (!isDragging || e.pointerId !== activePointer) return;
    if (e.cancelable) e.preventDefault();
    var dx = e.clientX - lastPointerX;
    dragDistance += Math.abs(dx);
    lastPointerX = e.clientX;
    spinVelocity = dx * 0.004;
    earth.rotation.y += spinVelocity;
    clouds.rotation.y += spinVelocity * 1.15;
    markGlobeInteract();
  });

  function endDesktopDrag(e) {
    if (!isDragging || (e && e.pointerId !== activePointer)) return;
    var wasTap = dragDistance < tapThreshold;
    isDragging = false;
    activePointer = null;
    canvas.classList.remove('is-dragging');
    endGlobeDragState();
    if (e) {
      try { canvas.releasePointerCapture(e.pointerId); } catch (err) {}
      if (wasTap) openGlobeMap(e.clientX, e.clientY);
    }
    markGlobeInteract();
  }

  canvas.addEventListener('pointerup', endDesktopDrag);
  canvas.addEventListener('pointercancel', endDesktopDrag);

  canvas.addEventListener('keydown', function(e) {
    if (!desktopGlobeActive()) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openGlobeMap();
    }
  });

  // ── Animation ─────────────────────────────────────────────
  var motionReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function animate(){
    requestAnimationFrame(animate);
    if (!motionReduced && desktopGlobeActive() && !window.pinitGlobePaused) {
      if (!isDragging) {
        if (Math.abs(spinVelocity) > 0.00005) {
          earth.rotation.y += spinVelocity;
          clouds.rotation.y += spinVelocity * 1.15;
          spinVelocity *= 0.93;
        } else {
          spinVelocity = 0;
          if (Date.now() - lastInteractAt > idleResumeMs) {
            earth.rotation.y += 0.00055;
            clouds.rotation.y += 0.00068;
          }
        }
      }
    } else if (!motionReduced && !desktopGlobeActive() && !window.pinitGlobePaused) {
      earth.rotation.y += 0.00055;
      clouds.rotation.y += 0.00068;
    }
    renderer.render(scene, camera);
  }
  animate();

})();


(function(){
  var canvas = document.getElementById('mobile-globe-canvas');
  var wrap = document.getElementById('mobile-globe-wrap');
  if (!canvas || !wrap || typeof THREE === 'undefined') return;

  var motionReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var resizeTimer = null;

  function isMobilePortraitGlobe() {
    return window.innerWidth <= 700 && window.matchMedia('(orientation: portrait)').matches;
  }

  function readContainerSize() {
    var rect = wrap.getBoundingClientRect();
    var cssSize = Math.round(Math.max(rect.width || 0, rect.height || 0));
    if (!cssSize) {
      var computed = window.getComputedStyle(wrap);
      cssSize = Math.round(parseFloat(computed.width) || 0);
    }
    return Math.max(96, Math.min(160, cssSize || 112));
  }

  var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  var scene = new THREE.Scene();
  var camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
  camera.position.set(0, 0.05, 2.35);

  function syncRendererSize() {
    var size = readContainerSize();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(size, size, false);
    camera.aspect = 1;
    camera.updateProjectionMatrix();
  }
  syncRendererSize();

  var loader = new THREE.TextureLoader();
  loader.crossOrigin = 'anonymous';
  var earthTexUrl = 'https://cdn.jsdelivr.net/npm/three-globe@2.37.1/example/img/earth-blue-marble.jpg';
  var cloudsTexUrl = null;

  var earthGeo = new THREE.SphereGeometry(0.72, 32, 32);
  var earthMat = new THREE.MeshPhongMaterial({ shininess: 6 });
  var earth = new THREE.Mesh(earthGeo, earthMat);
  scene.add(earth);

  var cloudGeo = new THREE.SphereGeometry(0.735, 32, 32);
  var cloudMat = new THREE.MeshPhongMaterial({ transparent: true, opacity: 0.32, depthWrite: false });
  var clouds = new THREE.Mesh(cloudGeo, cloudMat);
  scene.add(clouds);
  clouds.visible = false;

  var atmGeo = new THREE.SphereGeometry(0.76, 32, 32);
  var atmMat = new THREE.MeshPhongMaterial({ color: 0x4488ff, transparent: true, opacity: 0.06, side: THREE.FrontSide });
  scene.add(new THREE.Mesh(atmGeo, atmMat));

  loader.load(earthTexUrl, function(t) { earthMat.map = t; earthMat.needsUpdate = true; });
  cloudsTexUrl && loader.load(cloudsTexUrl, function(t) { cloudMat.map = t; cloudMat.needsUpdate = true; });

  scene.add(new THREE.AmbientLight(0x334466, 0.55));
  var sun = new THREE.DirectionalLight(0xfff0d8, 1.1);
  sun.position.set(3, 2, 4);
  scene.add(sun);

  var raycaster = new THREE.Raycaster();
  var pointerNdc = new THREE.Vector2();
  var isDragging = false;
  var activePointer = null;
  var lastPointerX = 0;
  var dragDistance = 0;
  var spinVelocity = 0;
  var lastInteractAt = Date.now();
  var idleResumeMs = 3200;
  var tapThreshold = 6;

  function markGlobeInteract() {
    lastInteractAt = Date.now();
  }

  function sphereHitToLatLng(hitPoint) {
    var local = hitPoint.clone();
    earth.worldToLocal(local);
    local.normalize();
    var lat = Math.asin(Math.max(-1, Math.min(1, local.y))) * (180 / Math.PI);
    var lng = Math.atan2(local.x, local.z) * (180 / Math.PI);
    return { lat: lat, lng: lng };
  }

  function pickGlobeLatLng(clientX, clientY) {
    var rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    pointerNdc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    pointerNdc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointerNdc, camera);
    var hits = raycaster.intersectObject(earth);
    if (!hits.length) return null;
    return sphereHitToLatLng(hits[0].point);
  }

  function openGlobeMap(clientX, clientY) {
    var ll = (clientX != null) ? pickGlobeLatLng(clientX, clientY) : null;
    if (ll && window.pinitOpenMapAtGlobe) {
      window.pinitOpenMapAtGlobe(ll.lat, ll.lng);
    } else if (typeof openMap === 'function') {
      openMap();
    }
  }

  function clearBrowserSelection() {
    var sel = window.getSelection && window.getSelection();
    if (sel && sel.removeAllRanges) sel.removeAllRanges();
  }

  function onPointerDown(e) {
    if (!isMobilePortraitGlobe()) return;
    clearBrowserSelection();
    document.body.classList.add('is-globe-dragging');
    isDragging = true;
    activePointer = e.pointerId;
    lastPointerX = e.clientX;
    dragDistance = 0;
    spinVelocity = 0;
    wrap.classList.add('is-dragging');
    markGlobeInteract();
    if (e.cancelable) e.preventDefault();
    try { wrap.setPointerCapture(e.pointerId); } catch (err) {}
  }

  function onPointerMove(e) {
    if (!isDragging || e.pointerId !== activePointer) return;
    if (e.cancelable) e.preventDefault();
    var dx = e.clientX - lastPointerX;
    dragDistance += Math.abs(dx);
    lastPointerX = e.clientX;
    spinVelocity = dx * 0.006;
    earth.rotation.y += spinVelocity;
    clouds.rotation.y += spinVelocity * 1.15;
    markGlobeInteract();
  }

  function endMobileDrag(e) {
    if (!isDragging || (e && e.pointerId !== activePointer)) return;
    var wasTap = dragDistance < tapThreshold;
    isDragging = false;
    activePointer = null;
    wrap.classList.remove('is-dragging');
    document.body.classList.remove('is-globe-dragging');
    if (e) {
      try { wrap.releasePointerCapture(e.pointerId); } catch (err) {}
      if (wasTap) openGlobeMap(e.clientX, e.clientY);
    }
    markGlobeInteract();
  }

  wrap.addEventListener('pointerdown', onPointerDown);
  wrap.addEventListener('pointermove', onPointerMove, { passive: false });
  wrap.addEventListener('pointerup', endMobileDrag);
  wrap.addEventListener('pointercancel', endMobileDrag);

  wrap.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openGlobeMap();
    }
  });

  function scheduleSyncSize() {
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function() {
      if (isMobilePortraitGlobe()) syncRendererSize();
    }, 80);
  }
  window.addEventListener('resize', scheduleSyncSize);
  window.addEventListener('orientationchange', function() {
    setTimeout(function() {
      if (isMobilePortraitGlobe()) syncRendererSize();
    }, 160);
  });
  if (typeof ResizeObserver !== 'undefined') {
    try {
      var ro = new ResizeObserver(scheduleSyncSize);
      ro.observe(wrap);
    } catch (err) {}
  }

  function tick() {
    requestAnimationFrame(tick);
    if (!isMobilePortraitGlobe()) return;
    if (!motionReduced && !window.pinitGlobePaused) {
      if (!isDragging) {
        if (Math.abs(spinVelocity) > 0.00008) {
          earth.rotation.y += spinVelocity;
          clouds.rotation.y += spinVelocity * 1.15;
          spinVelocity *= 0.9;
        } else {
          spinVelocity = 0;
          if (Date.now() - lastInteractAt > idleResumeMs) {
            earth.rotation.y += 0.0032;
            clouds.rotation.y += 0.004;
          }
        }
      }
    }
    renderer.render(scene, camera);
  }
  tick();
})();

