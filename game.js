
/* =========================================================
   NEXUS: SECTOR CERO
   GAME.JS — MOTOR PRINCIPAL
   Compatible con GitHub Pages y controles táctiles.
   ========================================================= */

"use strict";

/* =========================
   UTILIDADES
   ========================= */

const $ = (selector) => document.querySelector(selector);

const clamp = (value, min, max) =>
  Math.max(min, Math.min(max, value));

const random = (min, max) =>
  Math.random() * (max - min) + min;

const STORAGE_KEY = "nexus-sector-cero-save-v1";

const game = {
  running: false,
  paused: false,
  over: false,
  won: false,
  lastTime: 0,
  elapsed: 0,
  lastShot: 0,
  lastEnemySpawn: 0,
  notificationTimeout: null,
  enemies: [],
  objects: [],
  projectiles: [],
  keys: {},
  joystick: {
    forward: false,
    backward: false,
    left: false,
    right: false
  },
  player: {
    x: 0,
    z: 0,
    angle: 0,
    health: 100,
    maxHealth: 100,
    energy: 100,
    maxEnergy: 100,
    xp: 0,
    level: 1,
    xpNext: 100,
    damage: 25,
    kills: 0,
    credits: 0,
    shield: false,
    sprinting: false,
    scanCooldown: 0,
    invulnerable: 0
  },
  mission: {
    index: 0,
    progress: 0,
    completed: [],
    totalKills: 0
  },
  settings: {
    sensitivity: 1,
    sound: false
  }
};

const missions = [
  {
    title: "DESPERTAR",
    objective: "Explora la instalación y activa el terminal.",
    type: "terminal",
    target: 1,
    reward: 40
  },
  {
    title: "SEÑAL PERDIDA",
    objective: "Elimina 3 drones hostiles.",
    type: "kills",
    target: 3,
    reward: 75
  },
  {
    title: "ACCESO RESTRINGIDO",
    objective: "Encuentra y activa 2 terminales.",
    type: "terminals",
    target: 2,
    reward: 100
  },
  {
    title: "PROTOCOLO DE SEGURIDAD",
    objective: "Elimina 5 drones hostiles.",
    type: "kills",
    target: 5,
    reward: 150
  },
  {
    title: "SECTOR ASEGURADO",
    objective: "Elimina los últimos 3 drones.",
    type: "kills",
    target: 3,
    reward: 200
  }
];

const upgrades = {
  health: {
    title: "REFUERZO ESTRUCTURAL",
    cost: 50,
    apply() {
      game.player.maxHealth += 25;
      game.player.health = game.player.maxHealth;
    }
  },
  energy: {
    title: "NÚCLEO DE ENERGÍA",
    cost: 50,
    apply() {
      game.player.maxEnergy += 25;
      game.player.energy = game.player.maxEnergy;
    }
  },
  damage: {
    title: "AMPLIFICADOR DE PULSO",
    cost: 75,
    apply() {
      game.player.damage += 10;
    }
  }
};

/* =========================
   REFERENCIAS DE LA INTERFAZ
   ========================= */

const ui = {
  menu: $("#menu-screen"),
  play: $("#game-screen"),
  pause: $("#pause-screen"),
  upgrades: $("#upgrade-screen"),
  victory: $("#victory-screen"),
  gameOver: $("#game-over-screen"),
  loading: $("#loading-screen"),

  start: $("#start-button"),
  continue: $("#continue-button"),
  pauseButton: $("#pause-button"),
  resume: $("#resume-button"),
  save: $("#save-button"),
  exit: $("#exit-button"),

  health: $("#health-value"),
  healthBar: $("#health-bar"),
  energy: $("#energy-value"),
  energyBar: $("#energy-bar"),
  xp: $("#xp-value"),
  xpBar: $("#xp-bar"),

  missionTitle: $("#mission-title"),
  missionObjective: $("#mission-objective"),

  weaponName: $("#weapon-name"),
  ammo: $("#ammo-value"),

  notification: $("#notification"),
  damageOverlay: $("#damage-overlay"),
  scanOverlay: $("#scan-overlay"),

  worldObjects: $("#world-objects"),
  enemiesLayer: $("#enemies-layer"),

  interact: $("#interact-button"),

  victoryStats: $("#victory-stats")
};

/* =========================
   INICIO
   ========================= */

function showScreen(screen) {
  [
    ui.menu,
    ui.play,
    ui.pause,
    ui.upgrades,
    ui.victory,
    ui.gameOver,
    ui.loading
  ].forEach(element => {
    if (element) element.classList.add("hidden");
  });

  if (screen) screen.classList.remove("hidden");
}

function notify(message, duration = 2200) {
  if (!ui.notification) return;

  ui.notification.textContent = message;
  ui.notification.classList.add("active");

  clearTimeout(game.notificationTimeout);

  game.notificationTimeout = setTimeout(() => {
    ui.notification.classList.remove("active");
  }, duration);
}

function resetPlayer() {
  Object.assign(game.player, {
    x: 0,
    z: 0,
    angle: 0,
    health: 100,
    maxHealth: 100,
    energy: 100,
    maxEnergy: 100,
    xp: 0,
    level: 1,
    xpNext: 100,
    damage: 25,
    kills: 0,
    credits: 0,
    shield: false,
    sprinting: false,
    scanCooldown: 0,
    invulnerable: 0
  });

  game.mission.index = 0;
  game.mission.progress = 0;
  game.mission.completed = [];
  game.mission.totalKills = 0;

  game.enemies = [];
  game.objects = [];
  game.projectiles = [];

  game.elapsed = 0;
  game.over = false;
  game.won = false;
}

function startGame() {
  resetPlayer();

  game.running = true;
  game.paused = false;

  createWorld();
  showScreen(ui.play);
  updateHUD();

  notify("SISTEMA NEXUS ACTIVO", 2500);
  updateMission();

  game.lastTime = performance.now();
  requestAnimationFrame(loop);
}

function pauseGame() {
  if (!game.running || game.over || game.won) return;

  game.paused = true;
  showScreen(ui.pause);
}

function resumeGame() {
  if (!game.running || game.over || game.won) return;

  game.paused = false;
  showScreen(ui.play);
  game.lastTime = performance.now();

  requestAnimationFrame(loop);
}

function returnToMenu() {
  game.running = false;
  game.paused = false;
  showScreen(ui.menu);
}

/* =========================
   CONSTRUCCIÓN DEL MUNDO
   ========================= */

function createWorld() {
  if (ui.worldObjects) ui.worldObjects.replaceChildren();
  if (ui.enemiesLayer) ui.enemiesLayer.replaceChildren();

  game.enemies = [];
  game.objects = [];
  game.projectiles = [];

  const objectPositions = [
    { x: -4, z: 8, type: "terminal" },
    { x: 4, z: 12, type: "terminal" },
    { x: -6, z: 18, type: "crate" },
    { x: 6, z: 22, type: "crate" },
    { x: 0, z: 30, type: "terminal" },
    { x: -8, z: 35, type: "crate" },
    { x: 8, z: 40, type: "crate" }
  ];

  objectPositions.forEach((data, index) => {
    createObject(data.x, data.z, data.type, index);
  });

  spawnEnemy(0, 15);
  spawnEnemy(-5, 24);
  spawnEnemy(5, 32);
}

function createObject(x, z, type, id) {
  const element = document.createElement("div");

  element.className = "world-object";
  element.dataset.type = type;
  element.dataset.id = String(id);

  if (type === "terminal") {
    element.style.width = "38px";
    element.style.height = "65px";
    element.style.borderColor = "#00eaff";
    element.style.boxShadow = "0 0 20px rgba(0,234,255,.35)";
  } else {
    element.style.width = "48px";
    element.style.height = "40px";
  }

  if (ui.worldObjects) ui.worldObjects.appendChild(element);

  const object = {
    id,
    x,
    z,
    type,
    active: false,
    element
  };

  game.objects.push(object);

  return object;
}

/* =========================
   ENEMIGOS
   ========================= */

function spawnEnemy(x, z) {
  if (!ui.enemiesLayer) return null;

  const element = document.createElement("div");
  element.className = "enemy";

  const healthBar = document.createElement("div");
  healthBar.className = "enemy-health";
  element.appendChild(healthBar);

  ui.enemiesLayer.appendChild(element);

  const enemy = {
    id: crypto.randomUUID
      ? crypto.randomUUID()
      : String(Math.random()),
    x,
    z,
    health: 60,
    maxHealth: 60,
    speed: random(0.5, 0.9),
    attackCooldown: random(0.5, 1.5),
    alive: true,
    element,
    healthBar,
    attackRange: 2
  };

  game.enemies.push(enemy);

  return enemy;
}

function removeEnemy(enemy) {
  enemy.alive = false;

  if (enemy.element) enemy.element.remove();

  game.player.kills++;
  game.mission.totalKills++;

  game.player.credits += 15;

  gainXP(30);
  updateMission();
  updateHUD();

  notify("DRON ELIMINADO +30 XP");
}

function damageEnemy(enemy, amount) {
  if (!enemy || !enemy.alive) return;

  enemy.health -= amount;

  const percentage = clamp(
    enemy.health / enemy.maxHealth * 100,
    0,
    100
  );

  enemy.healthBar.style.width = percentage + "%";

  if (enemy.health <= 0) {
    removeEnemy(enemy);
  }
}

/* =========================
   DISPARO
   ========================= */

function fireWeapon() {
  if (!game.running || game.paused || game.over || game.won) return;

  const now = performance.now();

  if (now - game.lastShot < 300) return;

  game.lastShot = now;

  const p = game.player;

  if (p.energy < 2) {
    notify("ENERGÍA INSUFICIENTE");
    return;
  }

  p.energy -= 2;

  /*
   * El jugador apunta hacia delante.
   * Se comprueba si hay un enemigo delante
   * y dentro del alcance del pulso.
   */

  let target = null;
  let bestDistance = Infinity;

  for (const enemy of game.enemies) {
    if (!enemy.alive) continue;

    const dx = enemy.x - p.x;
    const dz = enemy.z - p.z;

    const distance = Math.hypot(dx, dz);

    if (distance > 20 || dz <= 0) continue;

    const horizontalAngle = Math.atan2(dx, dz);
    const difference = normalizeAngle(
      horizontalAngle - p.angle
    );

    if (
      Math.abs(difference) < 0.22 &&
      distance < bestDistance
    ) {
      bestDistance = distance;
      target = enemy;
    }
  }

  if (target) {
    damageEnemy(target, p.damage);
    notify("IMPACTO CONFIRMADO", 500);
  } else {
    notify("PULSO EMITIDO", 450);
  }

  updateHUD();
}

function normalizeAngle(angle) {
  while (angle > Math.PI) angle -= Math.PI * 2;
  while (angle < -Math.PI) angle += Math.PI * 2;

  return angle;
}

/* =========================
   ESCUDO Y ACELERACIÓN
   ========================= */

function toggleShield() {
  const p = game.player;

  if (!game.running || game.paused) return;

  if (p.shield) {
    p.shield = false;
    notify("ESCUDO DESACTIVADO");
    return;
  }

  if (p.energy < 15) {
    notify("ENERGÍA INSUFICIENTE");
    return;
  }

  p.shield = true;
  notify("ESCUDO DE ENERGÍA ACTIVO");
}

function toggleSprint(active) {
  const p = game.player;

  p.sprinting = Boolean(active);
}

function activateScan() {
  const p = game.player;

  if (!game.running || game.paused) return;
  if (p.scanCooldown > 0) {
    notify("ESCÁNER RECARGANDO");
    return;
  }

  if (p.energy < 20) {
    notify("ENERGÍA INSUFICIENTE");
    return;
  }

  p.energy -= 20;
  p.scanCooldown = 5;

  if (ui.scanOverlay) {
    ui.scanOverlay.classList.remove("active");

    void ui.scanOverlay.offsetWidth;

    ui.scanOverlay.classList.add("active");
  }

  let discovered = 0;

  for (const object of game.objects) {
    const distance = Math.hypot(
      object.x - p.x,
      object.z - p.z
    );

    if (distance < 15) {
      object.element.style.boxShadow =
        "0 0 25px #00eaff";

      discovered++;
    }
  }

  for (const enemy of game.enemies) {
    if (!enemy.alive) continue;

    const distance = Math.hypot(
      enemy.x - p.x,
      enemy.z - p.z
    );

    if (distance < 25) {
      enemy.element.style.filter =
        "drop-shadow(0 0 12px #ff405d)";
    }
  }

  notify(
    discovered
      ? `ESCÁNER: ${discovered} OBJETOS DETECTADOS`
      : "ESCÁNER: SIN OBJETOS CERCANOS"
  );

  updateHUD();
}

/* =========================
   INTERACCIÓN CON TERMINALES
   ========================= */

function findNearbyTerminal() {
  const p = game.player;

  let closest = null;
  let closestDistance = 2.5;

  for (const object of game.objects) {
    if (object.type !== "terminal" || object.active) continue;

    const distance = Math.hypot(
      object.x - p.x,
      object.z - p.z
    );

    if (distance < closestDistance) {
      closest = object;
      closestDistance = distance;
    }
  }

  return closest;
}

function interact() {
  if (!game.running || game.paused) return;

  const terminal = findNearbyTerminal();

  if (!terminal) {
    notify("NO HAY TERMINALES AL ALCANCE");
    return;
  }

  terminal.active = true;
  terminal.element.style.background =
    "linear-gradient(135deg, #00eaff, #12304a)";
  terminal.element.style.boxShadow =
    "0 0 30px #00eaff";

  gainXP(20);

  const mission = missions[game.mission.index];

  if (mission && mission.type === "terminal") {
    game.mission.progress++;
  } else if (mission && mission.type === "terminals") {
    game.mission.progress++;
  }

  notify("TERMINAL ACTIVADO +20 XP");

  updateMission();
  updateHUD();
}

/* =========================
   EXPERIENCIA Y NIVELES
   ========================= */

function gainXP(amount) {
  const p = game.player;

  p.xp += amount;

  while (p.xp >= p.xpNext) {
    p.xp -= p.xpNext;
    p.level++;

    p.xpNext = Math.floor(p.xpNext * 1.3);

    p.maxHealth += 10;
    p.health = p.maxHealth;

    p.maxEnergy += 5;
    p.energy = p.maxEnergy;

    notify(`¡NIVEL ${p.level} ALCANZADO!`, 2000);
  }

  updateHUD();
}

/* =========================
   MISIONES
   ========================= */

function updateMission() {
  const mission = missions[game.mission.index];

  if (!mission) {
    finishGame();
    return;
  }

  if (ui.missionTitle) {
    ui.missionTitle.textContent = mission.title;
  }

  if (ui.missionObjective) {
    ui.missionObjective.textContent =
      mission.objective +
      ` (${Math.min(game.mission.progress, mission.target)}/${mission.target})`;
  }

  if (game.mission.progress >= mission.target) {
    completeMission(mission);
  }
}

function completeMission(mission) {
  if (game.mission.completed.includes(game.mission.index)) return;

  game.mission.completed.push(game.mission.index);

  game.player.credits += mission.reward;
  gainXP(50);

  notify(
    `MISIÓN COMPLETADA: +${mission.reward} CRÉDITOS`,
    2500
  );

  game.mission.index++;
  game.mission.progress = 0;

  if (game.mission.index >= missions.length) {
    finishGame();
    return;
  }

  updateMission();
  saveGame(false);
}

function finishGame() {
  game.running = false;
  game.won = true;

  if (ui.victoryStats) {
    ui.victoryStats.textContent =
      `Nivel ${game.player.level} · ` +
      `${game.player.kills} drones eliminados · ` +
      `${game.player.credits} créditos`;
  }

  showScreen(ui.victory);
}

/* =========================
   DAÑO AL JUGADOR
   ========================= */

function damagePlayer(amount) {
  const p = game.player;

  if (p.invulnerable > 0 || game.over || game.won) return;

  p.invulnerable = 0.5;

  const finalDamage = p.shield
    ? amount * 0.25
    : amount;

  if (p.shield) {
    p.energy = Math.max(0, p.energy - amount * 2);

    if (p.energy <= 0) {
      p.shield = false;
      notify("ESCUDO SIN ENERGÍA");
    }
  }

  p.health = Math.max(0, p.health - finalDamage);

  if (ui.damageOverlay) {
    ui.damageOverlay.classList.add("active");

    setTimeout(() => {
      ui.damageOverlay.classList.remove("active");
    }, 180);
  }

  updateHUD();

  if (p.health <= 0) {
    endGame();
  }
}

function endGame() {
  game.running = false;
  game.over = true;

  showScreen(ui.gameOver);
}

/* =========================
   MEJORAS
   ========================= */

function purchaseUpgrade(type) {
  const upgrade = upgrades[type];

  if (!upgrade) return;

  if (game.player.credits < upgrade.cost) {
    notify("CRÉDITOS INSUFICIENTES");
    return;
  }

  game.player.credits -= upgrade.cost;
  upgrade.apply();

  notify(`MEJORA INSTALADA: ${upgrade.title}`);

  updateHUD();
  saveGame(false);
}

function openUpgrades() {
  if (!game.running || game.paused) return;

  game.paused = true;
  showScreen(ui.upgrades);
}

function closeUpgrades() {
  if (!game.running || game.over || game.won) return;

  game.paused = false;
  showScreen(ui.play);

  game.lastTime = performance.now();
  requestAnimationFrame(loop);
}

/* =========================
   MOVIMIENTO
   ========================= */

function updateMovement(dt) {
  const p = game.player;

  const forward =
    game.joystick.forward ||
    game.keys["w"] ||
    game.keys["arrowup"];

  const backward =
    game.joystick.backward ||
    game.keys["s"] ||
    game.keys["arrowdown"];

  const left =
    game.joystick.left ||
    game.keys["a"];

  const right =
    game.joystick.right ||
    game.keys["d"];

  const sprint =
    p.sprinting ||
    game.keys["shift"];

  let direction = 0;

  if (forward) direction += 1;
  if (backward) direction -= 1;

  let strafe = 0;

  if (left) strafe -= 1;
  if (right) strafe += 1;

  const speed = sprint ? 7 : 4;

  if (sprint && direction !== 0) {
    p.energy = Math.max(0, p.energy - dt * 12);

    if (p.energy <= 0) {
      p.sprinting = false;
    }
  } else {
    p.energy = Math.min(
      p.maxEnergy,
      p.energy + dt * 7
    );
  }

  const dx =
    Math.sin(p.angle) * direction +
    Math.cos(p.angle) * strafe;

  const dz =
    Math.cos(p.angle) * direction -
    Math.sin(p.angle) * strafe;

  const length = Math.hypot(dx, dz);

  if (length > 0) {
    p.x += dx / length * speed * dt;
    p.z += dz / length * speed * dt;
  }

  p.x = clamp(p.x, -12, 12);
  p.z = clamp(p.z, -5, 60);
}

/* =========================
   IA DE ENEMIGOS
   ========================= */

function updateEnemies(dt) {
  const p = game.player;

  for (const enemy of game.enemies) {
    if (!enemy.alive) continue;

    const dx = p.x - enemy.x;
    const dz = p.z - enemy.z;

    const distance = Math.hypot(dx, dz);

    enemy.attackCooldown -= dt;

    if (distance > enemy.attackRange) {
      const movement = enemy.speed * dt;

      if (distance > 0.001) {
        enemy.x += dx / distance * movement;
        enemy.z += dz / distance * movement;
      }
    } else if (enemy.attackCooldown <= 0) {
      damagePlayer(8);
      enemy.attackCooldown = 1.4;
    }
  }
}

/* =========================
   RENDERIZADO DEL ESCENARIO
   ========================= */

function renderWorld() {
  const p = game.player;

  const environment = $("#environment");

  if (environment) {
    environment.style.transform =
      `translateX(${-p.x * 13}px)`;
  }

  for (const object of game.objects) {
    const dx = object.x - p.x;
    const dz = object.z - p.z;

    const angle = normalizeAngle(
      Math.atan2(dx, dz) - p.angle
    );

    const distance = Math.hypot(dx, dz);

    if (distance < 0.5 || dz < -2 || Math.abs(angle) > 1.3) {
      object.element.style.display = "none";
      continue;
    }

    object.element.style.display = "block";

    const screenX =
      50 + Math.tan(angle) * 42;

    const screenY =
      49 + (1 / Math.max(distance, 1)) * 3;

    const scale = clamp(100 / distance, 12, 120);

    object.element.style.left = screenX + "%";
    object.element.style.top = screenY + "%";
    object.element.style.transform =
      `translate(-50%, -50%) scale(${scale / 100})`;

    object.element.style.zIndex =
      String(Math.floor(1000 / distance));
  }

  for (const enemy of game.enemies) {
    if (!enemy.alive) continue;

    const dx = enemy.x - p.x;
    const dz = enemy.z - p.z;

    const angle = normalizeAngle(
      Math.atan2(dx, dz) - p.angle
    );

    const distance = Math.hypot(dx, dz);

    if (dz < 0 || Math.abs(angle) > 1.3) {
      enemy.element.style.display = "none";
      continue;
    }

    enemy.element.style.display = "block";

    const screenX =
      50 + Math.tan(angle) * 42;

    const screenY =
      50 + 10 / Math.max(distance, 1);

    const scale = clamp(110 / distance, 0.3, 2.5);

    enemy.element.style.left = screenX + "%";
    enemy.element.style.top = screenY + "%";
    enemy.element.style.transform =
      `translate(-50%, -50%) scale(${scale})`;

    enemy.element.style.zIndex =
      String(Math.floor(1000 / distance));
  }
}

/* =========================
   INTERFAZ
   ========================= */

function updateHUD() {
  const p = game.player;

  if (ui.health) {
    ui.health.textContent = Math.ceil(p.health);
  }

  if (ui.healthBar) {
    ui.healthBar.style.width =
      `${p.health / p.maxHealth * 100}%`;
  }

  if (ui.energy) {
    ui.energy.textContent = Math.floor(p.energy);
  }

  if (ui.energyBar) {
    ui.energyBar.style.width =
      `${p.energy / p.maxEnergy * 100}%`;
  }

  if (ui.xp) {
    ui.xp.textContent =
      `${p.xp} XP · NIVEL ${p.level}`;
  }

  if (ui.xpBar) {
    ui.xpBar.style.width =
      `${p.xp / p.xpNext * 100}%`;
  }

  if (ui.weaponName) {
    ui.weaponName.textContent = "PULSO MK-I";
  }

  if (ui.ammo) {
    ui.ammo.textContent =
      `DAÑO ${p.damage} · ${p.credits} CR`;
  }

  const terminal = findNearbyTerminal();

  if (ui.interact) {
    ui.interact.classList.toggle(
      "hidden",
      !terminal
    );
  }
}

/* =========================
   GUARDADO LOCAL
   ========================= */

function getSaveData() {
  return {
    version: 1,
    player: {
      ...game.player
    },
    mission: {
      index: game.mission.index,
      progress: game.mission.progress,
      completed: [...game.mission.completed],
      totalKills: game.mission.totalKills
    },
    elapsed: game.elapsed,
    savedAt: new Date().toISOString()
  };
}

function saveGame(showMessage = true) {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(getSaveData())
    );

    if (showMessage) notify("PARTIDA GUARDADA");
    return true;
  } catch (error) {
    if (showMessage) {
      notify("NO SE PUDO GUARDAR LA PARTIDA");
    }

    return false;
  }
}

function loadGame() {
  let data;

  try {
    const raw = localStorage.getItem(STORAGE_KEY);

    if (!raw) {
      notify("NO HAY PARTIDA GUARDADA");
      return false;
    }

    data = JSON.parse(raw);
  } catch (error) {
    notify("ERROR AL LEER LA PARTIDA");
    return false;
  }

  if (
    !data ||
    data.version !== 1 ||
    !data.player ||
    !data.mission
  ) {
    notify("ARCHIVO DE PARTIDA INVÁLIDO");
    return false;
  }

  resetPlayer();

  const allowedPlayerFields = [
    "x",
    "z",
    "angle",
    "health",
    "maxHealth",
    "energy",
    "maxEnergy",
    "xp",
    "level",
    "xpNext",
    "damage",
    "kills",
    "credits"
  ];

  for (const key of allowedPlayerFields) {
    if (
      Number.isFinite(data.player[key])
    ) {
      game.player[key] = data.player[key];
    }
  }

  game.mission.index = clamp(
    Math.floor(data.mission.index || 0),
    0,
    missions.length
  );

  game.mission.progress = Math.max(
    0,
    Math.floor(data.mission.progress || 0)
  );

  game.mission.completed =
    Array.isArray(data.mission.completed)
      ? data.mission.completed.filter(
          value =>
            Number.isInteger(value) &&
            value >= 0 &&
            value < missions.length
        )
      : [];

  game.mission.totalKills =
    Math.max(0, data.mission.totalKills || 0);

  game.elapsed = Math.max(0, data.elapsed || 0);

  /*
   * Se reconstruye el escenario.
   * Los objetos vuelven a aparecer en sus posiciones.
   */

  createWorld();

  for (const object of game.objects) {
    if (
      game.mission.completed.includes(0) &&
      object.type === "terminal"
    ) {
      object.active = true;
      object.element.style.background = "#00eaff";
    }
  }

  game.running = true;
  game.paused = false;
  game.over = false;
  game.won = false;

  showScreen(ui.play);
  updateHUD();
  updateMission();

  game.lastTime = performance.now();
  requestAnimationFrame(loop);

  notify("PARTIDA CARGADA");

  return true;
}

/* =========================
   BUCLE PRINCIPAL
   ========================= */

function loop(timestamp) {
  if (
    !game.running ||
    game.paused ||
    game.over ||
    game.won
  ) {
    return;
  }

  const dt = Math.min(
    (timestamp - game.lastTime) / 1000,
    0.05
  );

  game.lastTime = timestamp;
  game.elapsed += dt;

  game.player.invulnerable = Math.max(
    0,
    game.player.invulnerable - dt
  );

  game.player.scanCooldown = Math.max(
    0,
    game.player.scanCooldown - dt
  );

  updateMovement(dt);
  updateEnemies(dt);
  renderWorld();
  updateHUD();

  requestAnimationFrame(loop);
}

/* =========================
   CONTROLES DE TECLADO
   ========================= */

document.addEventListener("keydown", event => {
  const key = event.key.toLowerCase();

  if (
    ["arrowup", "arrowdown", "arrowleft", "arrowright", " "]
      .includes(key)
  ) {
    event.preventDefault();
  }

  game.keys[key] = true;

  if (event.repeat) return;

  if (key === " ") fireWeapon();
  if (key === "e") interact();
  if (key === "q") toggleShield();
  if (key === "f") activateScan();
  if (key === "shift") toggleSprint(true);
  if (key === "escape") {
    if (!game.paused) pauseGame();
    else resumeGame();
  }
});

document.addEventListener("keyup", event => {
  const key = event.key.toLowerCase();

  game.keys[key] = false;

  if (key === "shift") {
    toggleSprint(false);
  }
});

window.addEventListener("blur", () => {
  game.keys = {};

  Object.keys(game.joystick).forEach(key => {
    game.joystick[key] = false;
  });

  toggleSprint(false);
});

/* =========================
   CONTROLES TÁCTILES
   ========================= */

document.querySelectorAll("[data-move]").forEach(button => {
  const direction = button.dataset.move;

  const press = event => {
    event.preventDefault();

    game.joystick[direction] = true;
    button.classList.add("active");

    if (button.setPointerCapture && event.pointerId !== undefined) {
      try {
        button.setPointerCapture(event.pointerId);
      } catch (_) {
        // Algunos navegadores no admiten la captura.
      }
    }
  };

  const release = event => {
    if (event) event.preventDefault();

    game.joystick[direction] = false;
    button.classList.remove("active");
  };

  button.addEventListener("pointerdown", press);
  button.addEventListener("pointerup", release);
  button.addEventListener("pointercancel", release);
  button.addEventListener("lostpointercapture", release);
  button.addEventListener("contextmenu", event => {
    event.preventDefault();
  });
});

function bindHoldButton(selector, onStart, onEnd = () => {}) {
  const button = $(selector);

  if (!button) return;

  let active = false;

  const start = event => {
    event.preventDefault();

    if (active) return;
    active = true;

    button.classList.add("active");
    onStart();
  };

  const end = event => {
    if (event) event.preventDefault();

    if (!active) return;
    active = false;

    button.classList.remove("active");
    onEnd();
  };

  button.addEventListener("pointerdown", start);
  button.addEventListener("pointerup", end);
  button.addEventListener("pointercancel", end);
  button.addEventListener("lostpointercapture", end);
}

bindHoldButton("#fire-button", fireWeapon);

bindHoldButton(
  "#sprint-button",
  () => toggleSprint(true),
  () => toggleSprint(false)
);

$("#shield-button")?.addEventListener(
  "click",
  toggleShield
);

$("#scan-button")?.addEventListener(
  "click",
  activateScan
);

ui.interact?.addEventListener("click", interact);

/* =========================
   BOTONES DEL MENÚ
   ========================= */

ui.start?.addEventListener("click", startGame);

ui.continue?.addEventListener("click", () => {
  if (!loadGame()) {
    notify("INICIA UNA NUEVA OPERACIÓN");
  }
});

ui.pauseButton?.addEventListener("click", pauseGame);
ui.resume?.addEventListener("click", resumeGame);

ui.save?.addEventListener("click", () => {
  saveGame(true);
});

ui.exit?.addEventListener("click", returnToMenu);

$("#close-upgrades-button")?.addEventListener(
  "click",
  closeUpgrades
);

$("#retry-button")?.addEventListener("click", startGame);

$("#game-over-menu-button")?.addEventListener(
  "click",
  returnToMenu
);

$("#victory-menu-button")?.addEventListener(
  "click",
  returnToMenu
);

$("#victory-continue-button")?.addEventListener(
  "click",
  () => {
    notify("NO HAY MÁS MISIONES DISPONIBLES");
  }
);

document.querySelectorAll("[data-upgrade]").forEach(button => {
  button.addEventListener("click", () => {
    purchaseUpgrade(button.dataset.upgrade);
  });
});

/* =========================
   SEGURIDAD DE LA PARTIDA
   ========================= */

window.addEventListener("pagehide", () => {
  if (game.running && !game.over && !game.won) {
    saveGame(false);
  }
});

/* =========================
   INICIALIZACIÓN
   ========================= */

function initialize() {
  showScreen(ui.menu);

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const data = raw ? JSON.parse(raw) : null;

    if (ui.continue) {
      ui.continue.disabled = !(
        data &&
        data.version === 1 &&
        data.player &&
        data.mission
      );

      if (ui.continue.disabled) {
        ui.continue.style.opacity = "0.45";
      }
    }
  } catch (_) {
    if (ui.continue) {
      ui.continue.disabled = true;
    }
  }

  console.log(
    "%cNEXUS: SECTOR CERO",
    "color:#00eaff;font-size:20px;font-weight:bold"
  );

  console.log("Sistema inicializado.");
}

initialize();
