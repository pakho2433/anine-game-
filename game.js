(() => {
  'use strict';

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => Array.from(document.querySelectorAll(selector));

  const SAVE_PREFIX = 'blob-quest-save:';
  const LAST_ACCOUNT_KEY = 'blob-quest-last-account';
  const AUTO_SAVE_MS = 5000;
  const MAX_OFFLINE_SECONDS = 8 * 60 * 60;
  const BAG_LIMIT = 60;

  const MAPS = [
    { name: '暮色草原', sky: '#8a69cf', far: '#5e4ca4', ground: '#4b3a82', monsters: ['綠葉史萊姆', '藍帽史萊姆', '紅角史萊姆'] },
    { name: '櫻霞山谷', sky: '#d877b2', far: '#9b4f91', ground: '#5d376c', monsters: ['櫻花史萊姆', '忍者史萊姆', '狐面史萊姆'] },
    { name: '霜月雪原', sky: '#78b9d8', far: '#4c75a0', ground: '#40557c', monsters: ['冰晶史萊姆', '雪帽史萊姆', '冰王史萊姆'] },
    { name: '幽影城堡', sky: '#55477f', far: '#30294f', ground: '#25213c', monsters: ['幽靈史萊姆', '黑騎史萊姆', '深淵史萊姆'] }
  ];

  const RARITY_NAMES = ['普通', '優良', '稀有', '史詩', '傳說', '神話'];
  const RARITY_MULTIPLIERS = [1, 1.45, 2.1, 3.2, 4.9, 7.5];
  const EQUIPMENT_TYPES = {
    weapon: { name: '武器', icon: '🗡️' },
    helmet: { name: '頭盔', icon: '🪖' },
    armor: { name: '鎧甲', icon: '🛡️' },
    boots: { name: '戰靴', icon: '🥾' },
    ring: { name: '戒指', icon: '💍' },
    amulet: { name: '項鍊', icon: '📿' }
  };

  const SKILLS = {
    slash: { name: '強力斬', icon: '⚔', cooldown: 5, baseCost: 120, multiplier: 2.25, description: '造成高倍率物理傷害' },
    burst: { name: '星光爆', icon: '✦', cooldown: 9, baseCost: 220, multiplier: 3.4, description: '釋放高傷害魔法光球' },
    heal: { name: '治療波', icon: '✚', cooldown: 12, baseCost: 180, multiplier: 0.3, description: '回復最大生命值' }
  };

  const canvas = $('#battleCanvas');
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  let state = null;
  let enemy = null;
  let account = '';
  let pendingOfflineReward = null;
  let lastHeroAttackAt = 0;
  let lastEnemyAttackAt = 0;
  let respawnAt = 0;
  let previousFrame = 0;
  const skillReadyAt = { slash: 0, burst: 0, heal: 0 };
  const projectiles = [];
  const sparks = [];

  function createFreshState(name) {
    return {
      version: 2,
      account: name,
      level: 1,
      xp: 0,
      xpToNext: 100,
      gold: 250,
      gems: 30,
      mapIndex: 0,
      stage: 1,
      killsInStage: 0,
      totalKills: 0,
      dailyKills: 0,
      auto: true,
      heroHp: null,
      enhancement: 0,
      skills: { slash: 1, burst: 1, heal: 1 },
      equipment: { weapon: null, helmet: null, armor: null, boots: null, ring: null, amulet: null },
      inventory: [],
      savedAt: Date.now()
    };
  }

  function normalizeState(loaded, name) {
    const fresh = createFreshState(name);
    const merged = Object.assign(fresh, loaded || {});
    merged.account = name;
    merged.skills = Object.assign(fresh.skills, loaded && loaded.skills ? loaded.skills : {});
    merged.equipment = Object.assign(fresh.equipment, loaded && loaded.equipment ? loaded.equipment : {});
    merged.inventory = Array.isArray(loaded && loaded.inventory) ? loaded.inventory.slice(0, BAG_LIMIT) : [];
    merged.mapIndex = clamp(Number(merged.mapIndex) || 0, 0, MAPS.length - 1);
    merged.stage = clamp(Number(merged.stage) || 1, 1, 10);
    return merged;
  }

  function sanitizeAccount(value) {
    return String(value || '')
      .trim()
      .replace(/[^a-zA-Z0-9_\-\u3400-\u9fff]/g, '')
      .slice(0, 20);
  }

  function saveKey(name) {
    return SAVE_PREFIX + name.toLowerCase();
  }

  function safeStorageGet(key) {
    try { return localStorage.getItem(key); } catch (error) { return null; }
  }

  function safeStorageSet(key, value) {
    try {
      localStorage.setItem(key, value);
      return true;
    } catch (error) {
      showToast('瀏覽器阻止儲存，請取消無痕模式或允許網站資料');
      return false;
    }
  }

  function login(name) {
    const cleanName = sanitizeAccount(name);
    if (!cleanName) {
      $('#loginError').textContent = '請輸入有效玩家名稱。';
      return;
    }

    $('#loginError').textContent = '';
    account = cleanName;
    let loaded = null;
    const raw = safeStorageGet(saveKey(account));

    if (raw) {
      try { loaded = JSON.parse(raw); }
      catch (error) {
        console.warn('Invalid save data. A fresh save will be created.', error);
      }
    }

    state = normalizeState(loaded, account);
    safeStorageSet(LAST_ACCOUNT_KEY, account);
    $('#loginScreen').classList.add('hidden');
    $('#gameScreen').classList.remove('hidden');

    const offlineMilliseconds = raw ? Math.max(0, Date.now() - Number(state.savedAt || Date.now())) : 0;
    if (offlineMilliseconds >= 60_000) {
      const seconds = Math.min(MAX_OFFLINE_SECONDS, offlineMilliseconds / 1000);
      pendingOfflineReward = calculateOfflineReward(seconds);
      $('#offlineReward').textContent = `🪙 ${formatNumber(pendingOfflineReward.gold)}　⭐ ${formatNumber(pendingOfflineReward.xp)} XP`;
      $('#offlineModal').classList.remove('hidden');
    }

    spawnEnemy(true);
    renderAll();
    logMessage(raw ? '已成功載入玩家存檔。' : '新的史萊姆冒險開始！');
    requestAnimationFrame(resizeCanvas);
  }

  function logout() {
    saveGame(false);
    try { localStorage.removeItem(LAST_ACCOUNT_KEY); } catch (error) { /* ignore */ }
    location.reload();
  }

  function saveGame(showFeedback = false) {
    if (!state || !account) return false;
    state.savedAt = Date.now();
    const success = safeStorageSet(saveKey(account), JSON.stringify(state));
    if (success) {
      $('#saveStatus').textContent = '已儲存 ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      if (showFeedback) showToast('進度已儲存');
    }
    return success;
  }

  function calculateOfflineReward(seconds) {
    const stagePower = globalStage();
    return {
      gold: Math.floor(seconds * (1.8 + stagePower * 0.42)),
      xp: Math.floor(seconds * (0.35 + stagePower * 0.075))
    };
  }

  function globalStage() {
    return state.mapIndex * 10 + state.stage;
  }

  function calculateStats() {
    let attack = 13 + state.level * 4;
    let maxHp = 125 + state.level * 28;
    let crit = 0.06;
    let coinBonus = 0;

    Object.values(state.equipment).forEach((item) => {
      if (!item) return;
      const enhanceMultiplier = 1 + state.enhancement * 0.12;
      attack += item.power * enhanceMultiplier;
      maxHp += item.power * 4.1 * enhanceMultiplier;
      crit += item.rarity * 0.009;
      coinBonus += item.rarity * 0.018;
    });

    return {
      attack: Math.floor(attack),
      maxHp: Math.floor(maxHp),
      crit: Math.min(0.55, crit),
      coinBonus
    };
  }

  function createEnemy() {
    const stagePower = globalStage();
    const isBoss = state.stage === 10;
    const maxHp = Math.floor((58 + stagePower * 23) * Math.pow(1.095, stagePower - 1) * (isBoss ? 4.8 : 1));
    const names = MAPS[state.mapIndex].monsters;
    return {
      name: (isBoss ? 'BOSS · ' : '') + names[(state.stage - 1) % names.length],
      colorIndex: (state.stage - 1) % 3,
      maxHp,
      hp: maxHp,
      attack: Math.max(5, Math.floor(5 + stagePower * 2.25)) * (isBoss ? 2 : 1),
      isBoss
    };
  }

  function spawnEnemy(fullHealHero = false) {
    enemy = createEnemy();
    const stats = calculateStats();
    if (fullHealHero || !Number.isFinite(state.heroHp) || state.heroHp <= 0 || state.heroHp > stats.maxHp) {
      state.heroHp = stats.maxHp;
    }
    renderHud();
  }

  function awardXp(amount) {
    state.xp += amount;
    while (state.xp >= state.xpToNext) {
      state.xp -= state.xpToNext;
      state.level += 1;
      state.xpToNext = Math.floor(state.xpToNext * 1.28 + 35);
      state.heroHp = calculateStats().maxHp;
      showToast(`LEVEL UP！Lv.${state.level}`);
      createSparkBurst(104, 145, '#ffe266', 24);
      logMessage(`角色升至 Lv.${state.level}。`);
    }
  }

  function generateItem(forcedRarity = null) {
    const typeKeys = Object.keys(EQUIPMENT_TYPES);
    const type = typeKeys[Math.floor(Math.random() * typeKeys.length)];
    let rarity = forcedRarity;

    if (rarity === null) {
      const roll = Math.random();
      rarity = roll < 0.004 ? 5 : roll < 0.022 ? 4 : roll < 0.085 ? 3 : roll < 0.23 ? 2 : roll < 0.55 ? 1 : 0;
    }

    const power = Math.floor((7 + globalStage() * 2.4) * RARITY_MULTIPLIERS[rarity] * (0.86 + Math.random() * 0.28));
    return {
      id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      type,
      rarity,
      power,
      level: globalStage()
    };
  }

  function dropEquipment() {
    const chance = enemy.isBoss ? 0.92 : 0.36;
    if (Math.random() > chance) return;

    const forcedRarity = enemy.isBoss ? clamp(Math.floor((globalStage() + 6) / 9), 1, 5) : null;
    const item = generateItem(forcedRarity);
    state.inventory.unshift(item);
    if (state.inventory.length > BAG_LIMIT) state.inventory.pop();
    showToast(`${RARITY_NAMES[item.rarity]}裝備掉落！`);
    logMessage(`獲得 ${RARITY_NAMES[item.rarity]}${EQUIPMENT_TYPES[item.type].name}，戰力 ${item.power}。`);
  }

  function defeatEnemy() {
    const stats = calculateStats();
    const gold = Math.floor((18 + globalStage() * 7) * (enemy.isBoss ? 7 : 1) * (1 + stats.coinBonus));
    const xp = Math.floor((15 + globalStage() * 5) * (enemy.isBoss ? 5 : 1));

    state.gold += gold;
    awardXp(xp);
    state.totalKills += 1;
    state.dailyKills += 1;
    state.killsInStage += 1;
    dropEquipment();
    showFloatingText(`+${formatNumber(gold)} 🪙`, 67, 47, 'crit');
    logMessage(`擊敗 ${enemy.name}，獲得 ${gold} 金幣及 ${xp} XP。`);

    const requiredKills = enemy.isBoss ? 1 : 6;
    if (state.killsInStage >= requiredKills) {
      state.killsInStage = 0;
      if (state.stage < 10) {
        state.stage += 1;
        showToast(`進入 Stage ${state.stage}`);
      } else {
        state.stage = 1;
        state.mapIndex = (state.mapIndex + 1) % MAPS.length;
        showToast(`前往 ${MAPS[state.mapIndex].name}`);
      }
    }

    spawnEnemy(false);
    renderAll();
    saveGame(false);
  }

  function heroAttack(multiplier = 1, label = '') {
    if (!state || !enemy || enemy.hp <= 0 || state.heroHp <= 0) return;

    const stats = calculateStats();
    const isCrit = Math.random() < stats.crit;
    const damage = Math.max(1, Math.floor(stats.attack * multiplier * (0.9 + Math.random() * 0.22) * (isCrit ? 1.8 : 1)));
    enemy.hp = Math.max(0, enemy.hp - damage);

    projectiles.push({ x: 120, y: 145, targetX: 264, targetY: 138, life: 16, maxLife: 16, color: multiplier > 1 ? '#fff075' : '#ffffff' });
    showFloatingText(`${isCrit ? 'CRIT! ' : ''}${damage}`, 68, 41, isCrit ? 'crit' : '');
    if (label) logMessage(`${label}造成 ${damage} 傷害。`);

    if (enemy.hp === 0) setTimeout(defeatEnemy, 220);
    renderHud();
  }

  function enemyAttack() {
    if (!state || !enemy || enemy.hp <= 0 || Date.now() < respawnAt || state.heroHp <= 0) return;

    const damage = Math.max(1, Math.floor(enemy.attack * (0.82 + Math.random() * 0.32)));
    state.heroHp = Math.max(0, state.heroHp - damage);
    projectiles.push({ x: 255, y: 145, targetX: 104, targetY: 142, life: 18, maxLife: 18, color: '#ff7ca0' });
    showFloatingText(`-${damage}`, 25, 41, '');

    if (state.heroHp === 0) {
      respawnAt = Date.now() + 2200;
      const lost = Math.min(state.gold, Math.floor(state.gold * 0.02));
      state.gold -= lost;
      logMessage(`角色倒下，損失 ${lost} 金幣，稍後復活。`);
      setTimeout(() => {
        if (!state) return;
        state.heroHp = calculateStats().maxHp;
        renderHud();
      }, 2200);
    }

    renderHud();
  }

  function useSkill(skillKey) {
    if (!state || !SKILLS[skillKey] || Date.now() < skillReadyAt[skillKey] || state.heroHp <= 0) return;

    const skill = SKILLS[skillKey];
    const level = state.skills[skillKey];
    skillReadyAt[skillKey] = Date.now() + skill.cooldown * 1000;

    if (skillKey === 'heal') {
      const amount = Math.floor(calculateStats().maxHp * (skill.multiplier + level * 0.035));
      state.heroHp = Math.min(calculateStats().maxHp, state.heroHp + amount);
      showFloatingText(`+${amount}`, 25, 40, 'heal');
      createSparkBurst(104, 143, '#8cff82', 18);
      logMessage(`${skill.name}回復 ${amount} 生命。`);
    } else {
      heroAttack(skill.multiplier + level * 0.18, skill.name);
      createSparkBurst(265, 138, skillKey === 'burst' ? '#8fd9ff' : '#ffe26a', 20);
    }

    renderHud();
    renderSkillButtons();
  }

  function equipItem(itemId) {
    const index = state.inventory.findIndex((item) => item.id === itemId);
    if (index < 0) return;

    const item = state.inventory[index];
    const previous = state.equipment[item.type];
    state.equipment[item.type] = item;
    state.inventory.splice(index, 1);
    if (previous) state.inventory.unshift(previous);
    state.heroHp = Math.min(state.heroHp, calculateStats().maxHp);
    renderAll();
    saveGame(false);
    showToast(`已裝備${RARITY_NAMES[item.rarity]}${EQUIPMENT_TYPES[item.type].name}`);
  }

  function enhanceAll() {
    const cost = 500 * Math.pow(2, state.enhancement);
    if (state.gold < cost) {
      showToast(`金幣不足，需要 ${formatNumber(cost)}`);
      return;
    }
    state.gold -= cost;
    state.enhancement += 1;
    renderAll();
    saveGame(false);
    showToast(`全身裝備強化 +${state.enhancement}`);
  }

  function unequipAll() {
    Object.keys(state.equipment).forEach((type) => {
      if (state.equipment[type]) state.inventory.unshift(state.equipment[type]);
      state.equipment[type] = null;
    });
    state.inventory = state.inventory.slice(0, BAG_LIMIT);
    state.heroHp = Math.min(state.heroHp, calculateStats().maxHp);
    renderAll();
    saveGame(false);
  }

  function synthesizeItems() {
    const groups = {};
    state.inventory.forEach((item) => {
      if (!groups[item.rarity]) groups[item.rarity] = [];
      groups[item.rarity].push(item);
    });

    const rarity = Object.keys(groups)
      .map(Number)
      .filter((value) => value < 5 && groups[value].length >= 5)
      .sort((a, b) => a - b)[0];

    if (rarity === undefined) {
      showToast('未有 5 件相同稀有度裝備');
      return;
    }

    const consumedIds = new Set(groups[rarity].slice(-5).map((item) => item.id));
    state.inventory = state.inventory.filter((item) => !consumedIds.has(item.id));
    const newItem = generateItem(rarity + 1);
    state.inventory.unshift(newItem);
    renderAll();
    saveGame(false);
    showToast(`合成成功：${RARITY_NAMES[newItem.rarity]}裝備`);
  }

  function sellCommonItems() {
    const commonItems = state.inventory.filter((item) => item.rarity === 0);
    if (!commonItems.length) {
      showToast('背包沒有普通裝備');
      return;
    }
    const earned = commonItems.reduce((sum, item) => sum + item.power * 5, 0);
    state.inventory = state.inventory.filter((item) => item.rarity !== 0);
    state.gold += earned;
    renderAll();
    saveGame(false);
    showToast(`出售裝備獲得 ${formatNumber(earned)} 金幣`);
  }

  function upgradeSkill(skillKey) {
    const skill = SKILLS[skillKey];
    const level = state.skills[skillKey];
    const cost = Math.floor(skill.baseCost * Math.pow(1.55, level - 1));
    if (state.gold < cost) {
      showToast('金幣不足');
      return;
    }
    state.gold -= cost;
    state.skills[skillKey] += 1;
    renderAll();
    saveGame(false);
  }

  function renderAll() {
    if (!state || !enemy) return;
    const stats = calculateStats();

    $('#playerName').textContent = state.account;
    $('#heroName').textContent = state.account;
    $('#levelText').textContent = state.level;
    $('#powerText').textContent = formatNumber(stats.attack + stats.maxHp / 10);
    $('#goldText').textContent = formatNumber(state.gold);
    $('#gemText').textContent = formatNumber(state.gems);
    $('#mapTitle').textContent = MAPS[state.mapIndex].name;
    $('#stageText').textContent = `Stage ${state.stage} / 10`;
    $('#attackStat').textContent = formatNumber(stats.attack);
    $('#hpStat').textContent = formatNumber(stats.maxHp);
    $('#critStat').textContent = `${Math.round(stats.crit * 100)}%`;
    $('#enhanceStat').textContent = `+${state.enhancement}`;
    $('#questBar').style.width = `${Math.min(100, state.dailyKills / 30 * 100)}%`;
    $('#questText').textContent = `${Math.min(30, state.dailyKills)} / 30`;
    $('#autoButton').textContent = state.auto ? 'AUTO ON' : 'AUTO OFF';
    $('#autoButton').classList.toggle('on', state.auto);

    renderStageNodes();
    renderEquipment();
    renderInventory();
    renderSkillsPane();
    renderSkillButtons();
    renderHud();
  }

  function renderStageNodes() {
    const container = $('#stageNodes');
    container.replaceChildren();
    for (let i = 1; i <= 10; i += 1) {
      const node = document.createElement('span');
      node.className = 'stage-node';
      if (i < state.stage) node.classList.add('done');
      if (i === state.stage) node.classList.add('current');
      node.textContent = i;
      container.appendChild(node);
    }
  }

  function renderEquipment() {
    const grid = $('#equipmentGrid');
    grid.replaceChildren();
    Object.entries(EQUIPMENT_TYPES).forEach(([type, info]) => {
      const item = state.equipment[type];
      const slot = document.createElement('div');
      slot.className = `equipment-slot ${item ? `rarity-${item.rarity}` : ''}`;
      slot.innerHTML = `<span class="item-icon">${info.icon}</span><span class="item-name">${item ? `${RARITY_NAMES[item.rarity]}${info.name}<br>⚔ ${item.power}` : info.name}</span>`;
      grid.appendChild(slot);
    });
  }

  function renderInventory() {
    const grid = $('#inventoryGrid');
    grid.replaceChildren();
    $('#bagCount').textContent = `${state.inventory.length} / ${BAG_LIMIT}`;

    if (!state.inventory.length) {
      const empty = document.createElement('p');
      empty.className = 'help-text';
      empty.textContent = '擊敗怪物後，裝備會出現在這裡。';
      grid.appendChild(empty);
      return;
    }

    state.inventory.forEach((item) => {
      const info = EQUIPMENT_TYPES[item.type];
      const button = document.createElement('button');
      button.className = `inventory-item rarity-${item.rarity}`;
      button.innerHTML = `<span class="item-icon">${info.icon}</span><span class="item-name">${RARITY_NAMES[item.rarity]}${info.name}<br>⚔ ${item.power}</span>`;
      button.addEventListener('click', () => equipItem(item.id));
      grid.appendChild(button);
    });
  }

  function renderSkillsPane() {
    const list = $('#skillsList');
    list.replaceChildren();

    Object.entries(SKILLS).forEach(([key, skill]) => {
      const level = state.skills[key];
      const cost = Math.floor(skill.baseCost * Math.pow(1.55, level - 1));
      const card = document.createElement('article');
      card.className = 'skill-card';
      card.innerHTML = `<span>${skill.icon}</span><div><strong>${skill.name} Lv.${level}</strong><p>${skill.description}</p></div>`;
      const button = document.createElement('button');
      button.className = 'pixel-button gold';
      button.textContent = formatNumber(cost);
      button.disabled = state.gold < cost;
      button.addEventListener('click', () => upgradeSkill(key));
      card.appendChild(button);
      list.appendChild(card);
    });
  }

  function renderSkillButtons() {
    $$('.skill-button').forEach((button) => {
      const skillKey = button.dataset.skill;
      const cooldown = button.querySelector('.cooldown');
      const remaining = Math.max(0, skillReadyAt[skillKey] - Date.now());
      cooldown.classList.toggle('hidden', remaining <= 0);
      cooldown.textContent = remaining > 0 ? (remaining / 1000).toFixed(1) : '';
    });
  }

  function renderHud() {
    if (!state || !enemy) return;
    const stats = calculateStats();
    $('#heroHpText').textContent = `${Math.max(0, Math.floor(state.heroHp))} / ${stats.maxHp}`;
    $('#heroHpBar').style.width = `${clamp(state.heroHp / stats.maxHp * 100, 0, 100)}%`;
    $('#enemyName').textContent = enemy.name;
    $('#enemyHpText').textContent = `${Math.max(0, Math.floor(enemy.hp))} / ${enemy.maxHp}`;
    $('#enemyHpBar').style.width = `${clamp(enemy.hp / enemy.maxHp * 100, 0, 100)}%`;
    $('#goldText').textContent = formatNumber(state.gold);
  }

  function switchTab(tabName) {
    $$('.tab').forEach((button) => button.classList.toggle('active', button.dataset.tab === tabName));
    ['equipment', 'inventory', 'skills'].forEach((name) => {
      $(`#${name}Pane`).classList.toggle('hidden', name !== tabName);
    });
  }

  function logMessage(message) {
    const line = document.createElement('div');
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    line.textContent = `[${time}] ${message}`;
    $('#logLines').appendChild(line);
    while ($('#logLines').children.length > 40) $('#logLines').firstElementChild.remove();
    $('#logLines').parentElement.scrollTop = $('#logLines').parentElement.scrollHeight;
  }

  function showToast(message) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2250);
  }

  function showFloatingText(message, leftPercent, topPercent, className = '') {
    const text = document.createElement('span');
    text.className = `float-text ${className}`.trim();
    text.style.left = `${leftPercent}%`;
    text.style.top = `${topPercent}%`;
    text.textContent = message;
    $('#floatingLayer').appendChild(text);
    setTimeout(() => text.remove(), 950);
  }

  function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    canvas.width = 360;
    canvas.height = 220;
    ctx.imageSmoothingEnabled = false;
  }

  function drawPixelBackground(time) {
    const map = MAPS[state.mapIndex];
    ctx.fillStyle = map.sky;
    ctx.fillRect(0, 0, 360, 220);

    ctx.fillStyle = '#d9b3f1';
    ctx.fillRect(0, 18, 58, 5);
    ctx.fillRect(15, 13, 40, 5);
    ctx.fillRect(75, 32, 70, 6);
    ctx.fillRect(105, 26, 35, 6);
    ctx.fillRect(250, 18, 72, 5);
    ctx.fillRect(278, 12, 42, 6);

    ctx.fillStyle = map.far;
    for (let x = 0; x < 360; x += 18) {
      const height = 35 + ((x / 18) % 3) * 7;
      ctx.fillRect(x, 92 - height, 20, height);
    }

    ctx.fillStyle = map.ground;
    ctx.fillRect(0, 92, 360, 128);
    ctx.fillStyle = '#332759';
    for (let x = 0; x < 360; x += 18) {
      ctx.fillRect(x, 172 + ((x / 18) % 2) * 4, 12, 4);
    }

    ctx.fillStyle = '#8065b1';
    ctx.beginPath();
    ctx.ellipse(180, 162, 108, 34, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#66509b';
    ctx.fillRect(118, 154, 126, 4);

    const shimmer = Math.floor(time / 350) % 4;
    ctx.fillStyle = '#c8a7ff';
    ctx.fillRect(178 + shimmer * 2, 119, 4, 4);
    ctx.fillRect(160 - shimmer, 132, 3, 3);
    ctx.fillRect(205 + shimmer, 142, 3, 3);
  }

  function roundedRectPath(x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + width - r, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + r);
    ctx.lineTo(x + width, y + height - r);
    ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    ctx.lineTo(x + r, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  function drawOutlinedSlime(x, y, size, color, mood, accessory, squash = 0) {
    ctx.save();
    ctx.translate(Math.round(x), Math.round(y));
    ctx.scale(1 + squash * 0.05, 1 - squash * 0.05);

    const width = Math.round(size * 1.18);
    const height = Math.round(size * 0.88);

    ctx.fillStyle = '#ffffff';
    roundedRectPath(-width / 2 - 4, -height - 4, width + 8, height + 8, 12);
    ctx.fill();

    ctx.fillStyle = '#100d1d';
    roundedRectPath(-width / 2 - 1, -height - 1, width + 2, height + 2, 10);
    ctx.fill();

    ctx.fillStyle = color;
    roundedRectPath(-width / 2 + 3, -height + 3, width - 6, height - 5, 9);
    ctx.fill();

    ctx.fillStyle = '#ffffff44';
    ctx.fillRect(-width / 2 + 9, -height + 9, Math.max(5, width * 0.24), 5);
    ctx.fillStyle = '#00000025';
    ctx.fillRect(width / 2 - 13, -height + 14, 7, height - 20);
    ctx.fillRect(-width / 2 + 5, -6, width - 10, 4);

    ctx.fillStyle = '#171321';
    const eyeY = -height * 0.47;
    ctx.fillRect(-width * 0.17 - 2, eyeY, 5, 7);
    ctx.fillRect(width * 0.17 - 2, eyeY, 5, 7);
    if (mood === 'angry') {
      ctx.fillRect(-width * 0.2 - 3, eyeY - 3, 8, 2);
      ctx.fillRect(width * 0.2 - 5, eyeY - 3, 8, 2);
      ctx.fillRect(-4, eyeY + 12, 9, 3);
    } else {
      ctx.fillRect(-4, eyeY + 13, 9, 3);
      ctx.fillRect(-2, eyeY + 16, 5, 2);
    }

    drawAccessory(accessory, width, height);
    ctx.restore();
  }

  function drawAccessory(accessory, width, height) {
    if (accessory === 'sword') {
      ctx.fillStyle = '#171321';
      ctx.fillRect(width / 2 - 2, -height + 5, 5, 42);
      ctx.fillStyle = '#f5f6ff';
      ctx.fillRect(width / 2 - 1, -height + 2, 3, 31);
      ctx.fillStyle = '#ffc950';
      ctx.fillRect(width / 2 - 6, -height + 30, 13, 4);
    } else if (accessory === 'hat') {
      ctx.fillStyle = '#151827';
      ctx.fillRect(-width * 0.38, -height - 7, width * 0.76, 11);
      ctx.fillRect(-width * 0.27, -height - 15, width * 0.54, 10);
      ctx.fillStyle = '#d92f55';
      ctx.fillRect(-width * 0.3, -height - 4, width * 0.6, 4);
    } else if (accessory === 'horns') {
      ctx.fillStyle = '#fff4df';
      ctx.fillRect(-width * 0.33, -height - 8, 6, 10);
      ctx.fillRect(width * 0.33 - 6, -height - 8, 6, 10);
      ctx.fillStyle = '#171321';
      ctx.fillRect(-width * 0.33 + 2, -height - 11, 4, 4);
      ctx.fillRect(width * 0.33 - 6, -height - 11, 4, 4);
    } else if (accessory === 'crown') {
      ctx.fillStyle = '#171321';
      ctx.fillRect(-16, -height - 12, 32, 15);
      ctx.fillStyle = '#ffd650';
      ctx.fillRect(-13, -height - 10, 26, 10);
      ctx.fillRect(-13, -height - 15, 5, 6);
      ctx.fillRect(-2, -height - 18, 5, 9);
      ctx.fillRect(8, -height - 15, 5, 6);
    }
  }

  function drawProjectiles() {
    projectiles.forEach((projectile) => {
      const progress = 1 - projectile.life / projectile.maxLife;
      const x = projectile.x + (projectile.targetX - projectile.x) * progress;
      const y = projectile.y + (projectile.targetY - projectile.y) * progress;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(Math.round(x - 4), Math.round(y - 4), 9, 9);
      ctx.fillStyle = projectile.color;
      ctx.fillRect(Math.round(x - 2), Math.round(y - 2), 5, 5);
      projectile.life -= 1;
    });
    for (let i = projectiles.length - 1; i >= 0; i -= 1) {
      if (projectiles[i].life <= 0) projectiles.splice(i, 1);
    }
  }

  function createSparkBurst(x, y, color, count) {
    for (let i = 0; i < count; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 0.35 + Math.random() * 1.7;
      sparks.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: 14 + Math.random() * 18, color });
    }
  }

  function drawSparks() {
    sparks.forEach((spark) => {
      ctx.fillStyle = spark.color;
      ctx.fillRect(Math.round(spark.x), Math.round(spark.y), 3, 3);
      spark.x += spark.vx;
      spark.y += spark.vy;
      spark.vy += 0.035;
      spark.life -= 1;
    });
    for (let i = sparks.length - 1; i >= 0; i -= 1) {
      if (sparks[i].life <= 0) sparks.splice(i, 1);
    }
  }

  function drawBattle(time) {
    if (!state || !enemy) return;
    drawPixelBackground(time);

    const bounce = Math.sin(time / 170);
    const heroSquash = Math.max(0, -bounce);
    const enemySquash = Math.max(0, bounce);
    drawOutlinedSlime(105, 165 + bounce * 3, 57, '#ff5365', 'happy', 'sword', heroSquash);

    const enemyColors = ['#65e35d', '#4cb8ff', '#ff6b67'];
    let accessory = enemy.colorIndex === 1 ? 'hat' : enemy.colorIndex === 2 ? 'horns' : '';
    if (enemy.isBoss) accessory = 'crown';
    drawOutlinedSlime(258, 165 - bounce * 3, enemy.isBoss ? 70 : 58, enemyColors[enemy.colorIndex], 'angry', accessory, enemySquash);

    drawProjectiles();
    drawSparks();
  }

  function updateCombat(timestamp) {
    if (!state || !enemy || !state.auto || state.heroHp <= 0 || Date.now() < respawnAt) return;

    const heroInterval = Math.max(520, 980 - state.level * 3);
    if (timestamp - lastHeroAttackAt >= heroInterval) {
      lastHeroAttackAt = timestamp;
      heroAttack();
    }

    if (timestamp - lastEnemyAttackAt >= 1500) {
      lastEnemyAttackAt = timestamp;
      enemyAttack();
    }

    Object.keys(SKILLS).forEach((skillKey) => {
      const shouldHeal = skillKey !== 'heal' || state.heroHp < calculateStats().maxHp * 0.52;
      if (Date.now() >= skillReadyAt[skillKey] && shouldHeal) useSkill(skillKey);
    });
  }

  function gameLoop(timestamp) {
    requestAnimationFrame(gameLoop);
    if (!state) return;
    updateCombat(timestamp);
    if (timestamp - previousFrame < 33) return;
    previousFrame = timestamp;
    drawBattle(timestamp);
    renderSkillButtons();
  }

  function formatNumber(value) {
    return Math.floor(Number(value) || 0).toLocaleString('en-US');
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function bindEvents() {
    $('#loginButton').addEventListener('click', () => login($('#accountInput').value));
    $('#accountInput').addEventListener('keydown', (event) => {
      if (event.key === 'Enter') login(event.currentTarget.value);
    });
    $('#manualSaveButton').addEventListener('click', () => saveGame(true));
    $('#logoutButton').addEventListener('click', logout);
    $('#autoButton').addEventListener('click', () => {
      state.auto = !state.auto;
      renderAll();
      saveGame(false);
    });
    $('#enhanceButton').addEventListener('click', enhanceAll);
    $('#unequipButton').addEventListener('click', unequipAll);
    $('#synthButton').addEventListener('click', synthesizeItems);
    $('#sellButton').addEventListener('click', sellCommonItems);
    $('#claimOfflineButton').addEventListener('click', () => {
      if (pendingOfflineReward) {
        state.gold += pendingOfflineReward.gold;
        awardXp(pendingOfflineReward.xp);
        pendingOfflineReward = null;
        renderAll();
        saveGame(false);
      }
      $('#offlineModal').classList.add('hidden');
    });

    $$('.skill-button').forEach((button) => {
      button.addEventListener('click', () => useSkill(button.dataset.skill));
    });
    $$('.tab').forEach((button) => {
      button.addEventListener('click', () => switchTab(button.dataset.tab));
    });
    $$('.menu-button[data-focus-tab]').forEach((button) => {
      button.addEventListener('click', () => {
        switchTab(button.dataset.focusTab);
        if (window.innerWidth < 760) $('.right-panel').scrollIntoView({ behavior: 'smooth' });
      });
    });

    window.addEventListener('resize', resizeCanvas);
    window.addEventListener('beforeunload', () => saveGame(false));
  }

  function initialize() {
    if (!canvas || !ctx) {
      document.body.innerHTML = '<p style="padding:20px;color:white">瀏覽器不支援 Canvas，請改用最新版 Safari、Chrome 或 Edge。</p>';
      return;
    }

    bindEvents();
    resizeCanvas();
    requestAnimationFrame(gameLoop);
    setInterval(() => saveGame(false), AUTO_SAVE_MS);

    const lastAccount = safeStorageGet(LAST_ACCOUNT_KEY);
    if (lastAccount) {
      $('#accountInput').value = lastAccount;
      $('#continueButton').classList.remove('hidden');
      $('#continueButton').textContent = `繼續 ${lastAccount}`;
      $('#continueButton').addEventListener('click', () => login(lastAccount));
    }
  }

  initialize();
})();
