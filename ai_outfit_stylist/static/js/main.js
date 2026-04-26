// ── State ──────────────────────────────────────────────────────────────────
const state = {
  style: 'casual',
  occasion: 'casual',
  color: '',
  budget: 'mid',
  bodyType: 'rectangle',
  source: 'both',
  catalogStyle: 'all',
  catalogDetail: 'all',
  cameraStream: null,
  poseDetector: null,
  poseEngine: null,
  selectedOutfit: null,
  snapshotDataUrl: null,
  uploadedOutfits: [],
  catalogOutfits: [],
  recommendedOutfits: [],
  lensConfig: null,
  selectedLensId: null,
};

const OUTFIT_IMAGE_CACHE = {};
const OUTFIT_RENDER_CACHE = {};
let SECTION_TRANSITION_LOCK = false;

// ── Utilities ──────────────────────────────────────────────────────────────
function getOrCreatePageTransitionLayer() {
  let layer = document.getElementById('pageTransitionLayer');
  if (layer) return layer;

  layer = document.createElement('div');
  layer.id = 'pageTransitionLayer';
  layer.className = 'page-transition-layer';
  document.body.appendChild(layer);
  return layer;
}

function runSectionTransition(action) {
  if (SECTION_TRANSITION_LOCK) {
    action();
    return;
  }

  const layer = getOrCreatePageTransitionLayer();
  SECTION_TRANSITION_LOCK = true;
  document.body.classList.add('page-transitioning');
  layer.classList.add('is-active');

  window.setTimeout(() => {
    action();
    layer.classList.remove('is-active');
    layer.classList.add('is-leaving');
  }, 150);

  window.setTimeout(() => {
    layer.classList.remove('is-leaving');
    document.body.classList.remove('page-transitioning');
    SECTION_TRANSITION_LOCK = false;
  }, 300);
}

function scrollToSection(id) {
  const target = document.getElementById(id);
  if (!target) return;
  runSectionTransition(() => {
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

function showToast(msg, type = 'info') {
  const toast = document.createElement('div');
  toast.style.cssText = `
    position:fixed;bottom:24px;right:24px;z-index:9999;
    padding:14px 22px;border-radius:40px;font-size:14px;
    font-family:var(--font-body);font-weight:500;
    box-shadow:0 8px 24px rgba(0,0,0,0.15);
    animation:fadeUp 0.3s ease;
    background:${type === 'error' ? '#c0392b' : type === 'success' ? '#27ae60' : '#1a1714'};
    color:#faf8f3;
  `;
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

function preloadOutfitImage(outfit) {
  if (!outfit?.image) return null;
  const cacheKey = getOutfitCacheKey(outfit);
  if (cacheKey && OUTFIT_IMAGE_CACHE[cacheKey]) return OUTFIT_IMAGE_CACHE[cacheKey];

  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.referrerPolicy = 'no-referrer';
  img.src = outfit.image;
  if (cacheKey) {
    img.onload = () => {
      OUTFIT_RENDER_CACHE[cacheKey] = buildOutfitRenderProfile(outfit, img);
    };
    OUTFIT_IMAGE_CACHE[cacheKey] = img;
  }
  return img;
}

function getOutfitCacheKey(outfit) {
  return outfit?.id || outfit?.image || outfit?.name || null;
}

function buildOutfitRenderProfile(outfit, image) {
  const selectedType = (outfit?.type || outfit?.style || '').toLowerCase();
  const isKurti = selectedType.includes('kurti');
  const isDress = selectedType.includes('dress') && !isKurti;
  const isJacket = selectedType.includes('jacket');
  const isTshirt = selectedType.includes('tshirt') || selectedType.includes('tee') || selectedType.includes('shirt');

  const imageWidth = image?.naturalWidth || 1;
  const imageHeight = image?.naturalHeight || 1;
  const aspectRatio = imageWidth / imageHeight;

  let widthScale = 1.52;
  let heightScale = 1.92;
  let yOffsetScale = 0.2;

  if (aspectRatio < 0.7) {
    widthScale = 1.44;
    heightScale = 2.08;
    yOffsetScale = 0.16;
  } else if (aspectRatio < 0.95) {
    widthScale = 1.5;
    heightScale = 2.0;
    yOffsetScale = 0.18;
  } else if (aspectRatio < 1.2) {
    widthScale = 1.58;
    heightScale = 1.96;
    yOffsetScale = 0.19;
  } else if (aspectRatio < 1.5) {
    widthScale = 1.66;
    heightScale = 1.88;
    yOffsetScale = 0.21;
  } else {
    widthScale = 1.72;
    heightScale = 1.82;
    yOffsetScale = 0.22;
  }

  if (isKurti) {
    widthScale *= 1.18;
    heightScale *= 1.42;
    yOffsetScale = Math.max(0.08, yOffsetScale - 0.08);
  } else if (isDress) {
    widthScale *= 1.1;
    heightScale *= 1.28;
    yOffsetScale = Math.max(0.1, yOffsetScale - 0.05);
  } else if (isJacket) {
    widthScale *= 1.16;
    heightScale *= 1.06;
    yOffsetScale = Math.max(0.14, yOffsetScale - 0.02);
  } else if (isTshirt) {
    widthScale *= 0.98;
    heightScale *= 0.9;
    yOffsetScale = Math.min(0.24, yOffsetScale + 0.02);
  }

  const cropBiasX = aspectRatio > 1.2 ? 0.04 : aspectRatio < 0.85 ? -0.03 : 0;
  const cropBiasY = isKurti ? -0.1 : isDress ? -0.06 : isJacket ? 0.02 : 0;

  return {
    widthScale,
    heightScale,
    yOffsetScale,
    cropBiasX,
    cropBiasY,
  };
}

function getLandmarkPoint(landmarks, index, w, h) {
  const landmark = landmarks?.[index];
  if (!landmark) return null;
  return {
    x: landmark.x * w,
    y: landmark.y * h,
  };
}

function getPoseFitMetrics(landmarks, w, h) {
  const points = {
    lShoulder: getLandmarkPoint(landmarks, 11, w, h),
    rShoulder: getLandmarkPoint(landmarks, 12, w, h),
    lElbow: getLandmarkPoint(landmarks, 13, w, h),
    rElbow: getLandmarkPoint(landmarks, 14, w, h),
    lWrist: getLandmarkPoint(landmarks, 15, w, h),
    rWrist: getLandmarkPoint(landmarks, 16, w, h),
    lHip: getLandmarkPoint(landmarks, 23, w, h),
    rHip: getLandmarkPoint(landmarks, 24, w, h),
    lKnee: getLandmarkPoint(landmarks, 25, w, h),
    rKnee: getLandmarkPoint(landmarks, 26, w, h),
  };

  if (!points.lShoulder || !points.rShoulder || !points.lHip || !points.rHip) {
    return null;
  }

  const shoulderCenterX = (points.lShoulder.x + points.rShoulder.x) / 2;
  const shoulderY = (points.lShoulder.y + points.rShoulder.y) / 2;
  const hipCenterX = (points.lHip.x + points.rHip.x) / 2;
  const hipY = (points.lHip.y + points.rHip.y) / 2;
  const kneeY = [points.lKnee?.y, points.rKnee?.y].filter(Number.isFinite);
  const elbowYs = [points.lElbow?.y, points.rElbow?.y].filter(Number.isFinite);
  const wristYs = [points.lWrist?.y, points.rWrist?.y].filter(Number.isFinite);

  const shoulderSpan = Math.abs(points.lShoulder.x - points.rShoulder.x);
  const hipSpan = Math.abs(points.lHip.x - points.rHip.x);
  const armSpan = Math.max(
    points.lElbow && points.lWrist ? Math.abs(points.lShoulder.x - Math.min(points.lElbow.x, points.lWrist.x)) : 0,
    points.rElbow && points.rWrist ? Math.abs(Math.max(points.rElbow.x, points.rWrist.x) - points.rShoulder.x) : 0,
    points.lElbow ? Math.abs(points.lShoulder.x - points.lElbow.x) : 0,
    points.rElbow ? Math.abs(points.rShoulder.x - points.rElbow.x) : 0,
    0,
  );
  const bodyWidth = Math.max(shoulderSpan * 1.24, hipSpan * 1.08, armSpan * 1.35, 120);
  const torsoHeight = Math.max(hipY - shoulderY, 140);
  const lowerBodyY = kneeY.length ? Math.max(...kneeY) : Math.max(...wristYs, hipY + torsoHeight * 0.95);
  const upperArmY = elbowYs.length ? Math.min(...elbowYs) : shoulderY + torsoHeight * 0.28;

  return {
    shoulderCenterX,
    hipCenterX,
    shoulderY,
    hipY,
    lowerBodyY,
    upperArmY,
    bodyWidth,
    torsoHeight,
  };
}

function getOutfitRenderProfile(outfit, image) {
  const cacheKey = getOutfitCacheKey(outfit);
  if (cacheKey && OUTFIT_RENDER_CACHE[cacheKey]) return OUTFIT_RENDER_CACHE[cacheKey];

  const profile = buildOutfitRenderProfile(outfit, image);
  if (cacheKey) {
    OUTFIT_RENDER_CACHE[cacheKey] = profile;
  }
  return profile;
}

function getOutfitTint(outfit) {
  const color = (outfit?.color || '').toLowerCase();
  if (color.includes('black')) return '#3a3a3a';
  if (color.includes('blue') || color.includes('navy')) return '#335c90';
  if (color.includes('red') || color.includes('maroon')) return '#9a4646';
  if (color.includes('white') || color.includes('cream')) return '#ddd5c9';
  if (color.includes('green') || color.includes('olive')) return '#5e7865';
  if (color.includes('mustard') || color.includes('yellow')) return '#b79242';
  return '#b5845f';
}

function sourceLabel(source) {
  const map = {
    both: 'Both Sources',
    main_catalog: 'Main Catalog',
    dataset_folder: 'Dataset Folder',
  };
  return map[source] || 'Both Sources';
}

function safeOutfitText(value, fallback = 'Untitled Look') {
  const text = (value || '').toString().trim();
  return text || fallback;
}

function selectOutfit(outfit) {
  if (!outfit) return;

  state.selectedOutfit = outfit;
  preloadOutfitImage(outfit);

  const panel = document.getElementById('selectedOutfitPanel');
  panel.style.display = 'block';
  document.getElementById('selectedOutfitContent').innerHTML = `
    <div style="display:flex;gap:16px;align-items:center;">
      <img src="${outfit.image}" style="width:80px;height:80px;object-fit:cover;border-radius:8px;" onerror="this.src='https://via.placeholder.com/80?text=Outfit'"/>
      <div>
        <p style="font-family:var(--font-display);font-size:18px;">${safeOutfitText(outfit.name)}</p>
        <p style="font-size:13px;color:var(--ink-muted);">${safeOutfitText(outfit.type, 'look')}</p>
        <p style="font-size:12px;color:var(--gold);margin-top:4px;">✦ Ready for AR try-on</p>
      </div>
    </div>
  `;

  scrollToSection('tryon');
  showToast(`✦ "${safeOutfitText(outfit.name)}" selected for try-on!`, 'success');

  if (state.cameraStream && !state.poseDetector) {
    startPoseTracking();
  }
}

function selectOutfitFromCatalog(index) {
  const outfit = state.catalogOutfits[index];
  if (!outfit) return;
  selectOutfit(outfit);
}

function selectOutfitFromRecommendations(index) {
  const outfit = state.recommendedOutfits[index];
  if (!outfit) return;
  selectOutfit(outfit);
}

function outfitCardHTML(outfit, index, clickHandler = 'selectOutfitFromCatalog') {
  const styleValue = safeOutfitText(outfit.style || outfit.type, 'casual').toLowerCase();
  const typeValue = safeOutfitText(outfit.type, styleValue).toLowerCase();
  const sourceValue = safeOutfitText(outfit.source, 'main_catalog').toLowerCase();
  const tags = [styleValue, typeValue, sourceValue];

  return `
    <article class="outfit-card" onclick="${clickHandler}(${index})">
      <img class="outfit-img" src="${outfit.image}" alt="${safeOutfitText(outfit.name)}" loading="lazy" onerror="this.src='https://via.placeholder.com/480x620?text=Outfit'"/>
      <div class="outfit-info">
        <div class="outfit-tags">
          ${tags.map(tag => `<span class="outfit-tag">${tag.replace('_', ' ')}</span>`).join('')}
        </div>
        <h4 class="outfit-name">${safeOutfitText(outfit.name)}</h4>
        <p class="outfit-meta">${safeOutfitText(outfit.type, 'look')} · ${safeOutfitText(outfit.color, 'mixed')}</p>
        <div class="outfit-footer">
          <span class="outfit-price">${safeOutfitText(outfit.price, 'N/A')}</span>
          <button class="outfit-try-btn" type="button">Try On</button>
        </div>
      </div>
    </article>
  `;
}

function animateCards(container) {
  const cards = container ? Array.from(container.querySelectorAll('.outfit-card')) : [];
  cards.forEach((card, i) => {
    card.style.opacity = '0';
    card.style.transform = 'translateY(16px)';
    setTimeout(() => {
      card.style.transition = 'opacity 0.35s ease, transform 0.35s ease';
      card.style.opacity = '1';
      card.style.transform = 'translateY(0)';
    }, Math.min(i * 70, 500));
  });
}

function setSourceFilter(sourceValue) {
  state.source = sourceValue || 'both';

  const sourceSelect = document.getElementById('sourceFilter');
  if (sourceSelect && sourceSelect.value !== state.source) {
    sourceSelect.value = state.source;
  }

  const sourceButtons = document.querySelectorAll('#catalogSourceFilters .filter-btn');
  sourceButtons.forEach((button) => {
    button.classList.toggle('active', button.dataset.source === state.source);
  });
}

function selectCatalogSource(el, sourceValue) {
  const parent = document.getElementById('catalogSourceFilters');
  if (parent) {
    parent.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
  }
  el.classList.add('active');
  setSourceFilter(sourceValue);
  loadCatalog();
}

function selectCatalogStyle(el, styleValue) {
  const parent = document.getElementById('catalogTypeFilters');
  if (parent) {
    parent.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
  }
  el.classList.add('active');
  state.catalogStyle = styleValue || 'all';
  loadCatalog();
}

function renderCatalog(data) {
  const grid = document.getElementById('catalogGrid');
  const title = document.getElementById('catalogTitle');
  const stats = document.getElementById('catalogStats');
  if (!grid) return;

  const items = Array.isArray(data.items) ? data.items : [];
  const filteredItems = items.filter((item) => {
    const detail = state.catalogDetail || 'all';
    if (detail === 'all') return true;

    const itemType = (item.type || '').toLowerCase();
    const itemStyle = (item.style || '').toLowerCase();
    const itemTags = Array.isArray(item.tags) ? item.tags.map(tag => String(tag).toLowerCase()) : [];

    if (detail === 'uploaded') {
      return itemTags.includes('uploaded') || item.source === 'dataset_folder';
    }

    return itemType === detail || itemStyle === detail || itemTags.includes(detail);
  });
  state.catalogOutfits = filteredItems;

  if (title) {
    title.textContent = `Browse Catalog (${filteredItems.length} looks)`;
  }
  if (stats) {
    stats.innerHTML = `
      <span class="tip-tag">${sourceLabel(data.source || state.source)}</span>
      <span class="tip-tag">Main Catalog: ${data.counts?.main_catalog ?? 0}</span>
      <span class="tip-tag">Dataset Folder: ${data.counts?.dataset_folder ?? 0}</span>
    `;
  }

  if (!filteredItems.length) {
    grid.innerHTML = '<div class="uploaded-empty">No outfits found for current filters. Try switching source or type.</div>';
    return;
  }

  grid.innerHTML = filteredItems.map((item, index) => outfitCardHTML(item, index, 'selectOutfitFromCatalog')).join('');
  animateCards(grid);
}

function updateActiveCatalogButtons(groupSelector, activeValue, dataAttributeName) {
  document.querySelectorAll(groupSelector).forEach((button) => {
    button.classList.toggle('active', button.dataset[dataAttributeName] === activeValue);
  });
}

function filterCatalogSource(sourceValue, buttonEl) {
  const normalized = sourceValue === 'csv' ? 'main_catalog' : sourceValue === 'dataset' ? 'dataset_folder' : 'both';
  state.source = normalized;
  const sourceSelect = document.getElementById('outfitSource') || document.getElementById('sourceFilter');
  if (sourceSelect) {
    sourceSelect.value = sourceValue;
  }
  if (buttonEl) {
    document.querySelectorAll('.source-filter-btn').forEach(btn => btn.classList.remove('active'));
    buttonEl.classList.add('active');
  }
  loadCatalog();
}

function filterCatalog(styleValue, buttonEl) {
  state.catalogStyle = styleValue || 'all';
  if (buttonEl) {
    document.querySelectorAll('.style-filter-btn').forEach(btn => btn.classList.remove('active'));
    buttonEl.classList.add('active');
  }
  loadCatalog();
}

function filterCatalogDetail(detailValue) {
  state.catalogDetail = detailValue || 'all';
  loadCatalog();
}

function toggleCatalogDropdown(forceOpen = null) {
  const panel = document.getElementById('catalogDropdownPanel');
  const button = document.getElementById('catalogToggleBtn');
  const text = button?.querySelector('.catalog-toggle-text');
  if (!panel || !button) return;

  const shouldOpen = forceOpen === null ? !panel.classList.contains('open') : Boolean(forceOpen);
  panel.classList.toggle('open', shouldOpen);
  button.classList.toggle('active', shouldOpen);
  button.setAttribute('aria-expanded', shouldOpen ? 'true' : 'false');
  if (text) {
    text.textContent = shouldOpen ? 'Hide Catalog' : 'Open Catalog';
  }
}

async function loadCatalog() {
  const grid = document.getElementById('catalogGrid');
  if (!grid) return;

  grid.innerHTML = '<div class="uploaded-empty">Loading catalog...</div>';

  try {
    const params = new URLSearchParams({
      source: state.source,
      style: state.catalogStyle,
      limit: '180',
    });
    const res = await fetch(`/api/catalog?${params.toString()}`);
    const data = await res.json().catch(() => ({}));

    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Failed to load catalog');
    }

    renderCatalog(data);
  } catch (e) {
    grid.innerHTML = '<div class="uploaded-empty">Could not load catalog right now.</div>';
  }
}

function selectChip(el, group) {
  const parent = el.closest('.chip-group');
  parent.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  state[group] = el.dataset.val;
}

function selectColor(el) {
  document.querySelectorAll('.color-dot').forEach(d => d.classList.remove('active'));
  el.classList.add('active');
  state.color = el.dataset.val;
}

// ── Photo Analysis ─────────────────────────────────────────────────────────
async function analyzePhoto(input) {
  if (!input.files[0]) return;
  const formData = new FormData();
  formData.append('photo', input.files[0]);

  const area = document.getElementById('uploadArea');
  area.innerHTML = '<div class="upload-icon">⏳</div><p>Analyzing your photo...</p>';

  try {
    const res = await fetch('/api/analyze-photo', { method: 'POST', body: formData });
    const data = await res.json();

    if (data.success) {
      area.innerHTML = '<div class="upload-icon">✅</div><p>Photo analyzed!</p>';
      const result = document.getElementById('toneResult');
      result.style.display = 'block';
      document.getElementById('toneBadge').textContent = `${data.skin_tone.toUpperCase()} SKIN TONE`;
      document.getElementById('toneMessage').textContent = data.message;
      const chips = document.getElementById('colorChips');
      chips.innerHTML = data.color_suggestions.map(c =>
        `<span class="color-chip">${c}</span>`
      ).join('');
      showToast('✦ Skin tone analyzed!', 'success');
    }
  } catch (e) {
    area.innerHTML = '<div class="upload-icon">📸</div><p>Upload your photo</p><p class="upload-sub">We\'ll analyze your skin tone</p>';
    showToast('Could not analyze photo', 'error');
  }
}

async function uploadTrainingImage(input) {
  if (!input.files[0]) return;

  const className = document.getElementById('trainClass').value;
  const formData = new FormData();
  formData.append('photo', input.files[0]);
  formData.append('class_name', className);

  const panel = document.querySelector('.train-upload-panel');
  const originalHtml = panel.innerHTML;
  panel.innerHTML = '<p class="train-upload-sub">Uploading image...</p>';

  try {
    const res = await fetch('/api/upload-training-image', {
      method: 'POST',
      body: formData,
    });
    const data = await res.json();

    if (data.success) {
      showToast(data.message, 'success');
      panel.innerHTML = originalHtml;
      input.value = '';
      await loadUploadedClothes();
    } else {
      panel.innerHTML = originalHtml;
      showToast(data.error || 'Upload failed', 'error');
    }
  } catch (e) {
    panel.innerHTML = originalHtml;
    showToast('Could not upload training image', 'error');
  }
}

function uploadedOutfitCardHTML(outfit, index) {
  return `
    <button class="uploaded-item" type="button" onclick="selectUploadedForTryOn(${index})">
      <img src="${outfit.image}" alt="${outfit.name}" loading="lazy" onerror="this.src='https://via.placeholder.com/300x240?text=Outfit'"/>
      <div class="uploaded-item-meta">
        <p class="uploaded-item-name" title="${outfit.name}">${outfit.name}</p>
        <p class="uploaded-item-class">${outfit.type}</p>
      </div>
    </button>
  `;
}

function uploadedCategoryTitle(category) {
  const map = {
    tshirt: 'T-shirt',
    dress: 'Dress',
    jacket: 'Jacket',
    casual: 'Casual',
  };
  return map[category] || category;
}

async function loadUploadedClothes() {
  const container = document.getElementById('uploadedClothesList');
  if (!container) return;

  container.innerHTML = '<div class="uploaded-empty">Loading uploaded clothes...</div>';

  try {
    const res = await fetch('/api/uploaded-training-images');
    const data = await res.json();

    if (!data.success) {
      container.innerHTML = '<div class="uploaded-empty">Could not load uploaded clothes.</div>';
      return;
    }

    state.uploadedOutfits = data.items.map((item, i) => ({
      id: item.id || `upload:${i}`,
      name: item.label_filename || item.filename,
      type: item.class_name,
      color: item.class_name,
      style: 'uploaded',
      image: item.image_url,
      tags: ['uploaded', item.class_name],
      price: 'Your Upload',
      _filename: item.filename,
    }));

    if (!state.uploadedOutfits.length) {
      container.innerHTML = '<div class="uploaded-empty">No uploaded clothes found yet. Use Add Training Image once, then choose from this list.</div>';
      return;
    }

    const groupedIndexes = { tshirt: [], dress: [], jacket: [], casual: [] };
    state.uploadedOutfits.forEach((outfit, index) => {
      const key = (outfit.type || '').toLowerCase();
      if (!groupedIndexes[key]) groupedIndexes[key] = [];
      groupedIndexes[key].push(index);
    });

    const categoryOrder = ['tshirt', 'dress', 'jacket', 'casual'];
    const orderedCategories = [
      ...categoryOrder.filter(cat => groupedIndexes[cat] && groupedIndexes[cat].length),
      ...Object.keys(groupedIndexes).filter(cat => !categoryOrder.includes(cat) && groupedIndexes[cat].length),
    ];

    container.innerHTML = orderedCategories.map((category) => {
      const itemsHtml = groupedIndexes[category]
        .map((index) => uploadedOutfitCardHTML(state.uploadedOutfits[index], index))
        .join('');

      return `
        <div class="uploaded-category-section">
          <p class="uploaded-category-title">${uploadedCategoryTitle(category)}</p>
          <div class="uploaded-clothes-grid uploaded-category-grid">
            ${itemsHtml}
          </div>
        </div>
      `;
    }).join('');
  } catch (e) {
    container.innerHTML = '<div class="uploaded-empty">Could not load uploaded clothes right now.</div>';
  }
}

function selectUploadedForTryOn(index) {
  const outfit = state.uploadedOutfits[index];
  if (!outfit) return;
  selectOutfit(outfit);
}

// ── Recommendations ────────────────────────────────────────────────────────
async function getRecommendations() {
  const btn = document.getElementById('recBtnText');
  const loader = document.getElementById('recLoader');
  btn.style.display = 'none';
  loader.style.display = 'inline-block';

  state.bodyType = document.getElementById('bodyType').value;
  const sourceSelect = document.getElementById('outfitSource') || document.getElementById('sourceFilter');
  if (sourceSelect) {
    const selectedSource = sourceSelect.value;
    state.source = selectedSource === 'csv' ? 'main_catalog' : selectedSource === 'dataset' ? 'dataset_folder' : selectedSource === 'main_catalog' ? 'main_catalog' : selectedSource === 'dataset_folder' ? 'dataset_folder' : 'both';
  }

  try {
    const res = await fetch('/api/recommend', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        style: state.style,
        occasion: state.occasion,
        color: state.color,
        body_type: state.bodyType,
        source: state.source,
      }),
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      throw new Error(data.error || 'Server error while generating recommendations');
    }

    if (data.success) {
      renderResults(data);
      document.getElementById('resultsArea').style.display = 'block';
      document.getElementById('resultsArea').scrollIntoView({ behavior: 'smooth', block: 'start' });
      showToast(data.message, 'success');
    } else {
      throw new Error(data.error || 'Could not fetch recommendations');
    }
  } catch (e) {
    showToast(e.message || 'Could not fetch recommendations', 'error');
  } finally {
    btn.style.display = 'inline';
    loader.style.display = 'none';
  }
}

function renderResults(data) {
  const sourceText = sourceLabel(data.source || state.source);
  document.getElementById('resultsTitle').textContent =
    data.outfits.length
      ? `Recommended Looks (${data.outfits.length}) · ${sourceText}`
      : 'Upload clothing images to get recommendations';

  const tipsHtml = data.style_tips.map(t =>
    `<span class="tip-tag">${t}</span>`
  ).join('');
  document.getElementById('tipsBanner').innerHTML = tipsHtml;

  const grid = document.getElementById('outfitGrid');
  const recItems = Array.isArray(data.outfits) ? data.outfits : [];
  state.recommendedOutfits = recItems;
  grid.innerHTML = recItems.map((o, index) => outfitCardHTML(o, index, 'selectOutfitFromRecommendations')).join('');
  animateCards(grid);
}

// ── Camera & Pose Tracking ─────────────────────────────────────────────────
async function toggleCamera() {
  if (state.cameraStream) {
    stopCamera();
  } else {
    if (state.selectedOutfit) {
      await startPoseTracking();
    } else {
      await startCamera();
    }
  }
}

async function startCamera() {
  if (state.cameraStream) return true;

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    state.cameraStream = stream;
    const video = document.getElementById('cameraFeed');
    video.srcObject = stream;
    await video.play().catch(() => {});
    video.style.display = 'block';
    document.getElementById('cameraPlaceholder').style.display = 'none';
    document.getElementById('overlayBadge').style.display = 'flex';
    showToast('Camera started!', 'success');
    return true;
  } catch (e) {
    showToast('Camera access denied. Please allow camera permissions.', 'error');
    return false;
  }
}

function stopCamera() {
  if (state.poseDetector && typeof state.poseDetector.stop === 'function') {
    state.poseDetector.stop();
  }
  state.poseDetector = null;
  state.poseEngine = null;

  if (state.cameraStream) {
    state.cameraStream.getTracks().forEach(t => t.stop());
    state.cameraStream = null;
  }
  document.getElementById('cameraFeed').style.display = 'none';
  document.getElementById('poseCanvas').style.display = 'none';
  document.getElementById('cameraPlaceholder').style.display = 'flex';
  document.getElementById('overlayBadge').style.display = 'none';
  showToast('Camera stopped');
}

function captureSnapshot() {
  const video = document.getElementById('cameraFeed');
  const canvas = document.getElementById('poseCanvas');

  if (!state.cameraStream) {
    showToast('Start camera first!', 'error');
    return;
  }

  const snap = document.createElement('canvas');
  const target = canvas.style.display !== 'none' ? canvas : video;
  snap.width = target.videoWidth || target.width || 640;
  snap.height = target.videoHeight || target.height || 480;
  snap.getContext('2d').drawImage(target, 0, 0);

  state.snapshotDataUrl = snap.toDataURL('image/png');
  document.getElementById('snapshotImg').src = state.snapshotDataUrl;
  document.getElementById('snapshotModal').style.display = 'flex';
}

function closeSnapshot() {
  document.getElementById('snapshotModal').style.display = 'none';
}

function downloadSnapshot() {
  if (!state.snapshotDataUrl) return;
  const a = document.createElement('a');
  a.href = state.snapshotDataUrl;
  a.download = `styleai-look-${Date.now()}.png`;
  a.click();
}

// ── MediaPipe Pose Tracking ────────────────────────────────────────────────
async function startPoseTracking() {
  if (state.poseDetector) return;

  const camStarted = await startCamera();
  if (!camStarted || !state.cameraStream) return;

  showToast('Starting pose tracking…');

  try {
    const video = document.getElementById('cameraFeed');
    if (video.readyState < 2) {
      await new Promise(resolve => {
        video.onloadedmetadata = () => resolve();
      });
    }

    const pose = new Pose({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`
    });

    pose.setOptions({
      modelComplexity: 1,
      smoothLandmarks: true,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5
    });

    const canvas = document.getElementById('poseCanvas');
    const ctx = canvas.getContext('2d');
    canvas.style.display = 'block';

    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;

    pose.onResults((results) => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);

      if (results.poseLandmarks) {
        // Draw skeleton
        drawConnectors(ctx, results.poseLandmarks, POSE_CONNECTIONS, {
          color: 'rgba(201,168,76,0.7)', lineWidth: 2
        });
        drawLandmarks(ctx, results.poseLandmarks, {
          color: '#c9a84c', lineWidth: 1, radius: 3
        });

        // Overlay selected outfit silhouette on torso
        if (state.selectedOutfit) {
          drawOutfitOverlay(ctx, results.poseLandmarks, canvas.width, canvas.height);
        }
      }
    });

    const camera = new Camera(video, {
      onFrame: async () => { await pose.send({ image: video }); },
      width: 640, height: 480
    });
    camera.start();
    state.poseDetector = camera;
    state.poseEngine = pose;
    showToast('✦ Pose tracking active!', 'success');

  } catch (e) {
    console.error('MediaPipe error:', e);
    showToast('Pose tracking unavailable — use AR Lens instead', 'error');
  }
}

function drawOutfitOverlay(ctx, landmarks, w, h) {
  if (!landmarks || landmarks.length < 25) return;
  const poseMetrics = getPoseFitMetrics(landmarks, w, h);
  if (!poseMetrics) return;

  const selectedType = (state.selectedOutfit?.type || state.selectedOutfit?.style || '').toLowerCase();
  const isKurti = selectedType.includes('kurti');
  const isDressLike = selectedType.includes('dress') || isKurti;
  const isJacket = selectedType.includes('jacket');
  const isTshirt = selectedType.includes('tshirt') || selectedType.includes('tee') || selectedType.includes('shirt');

  const overlayImage = preloadOutfitImage(state.selectedOutfit);
  const renderProfile = getOutfitRenderProfile(state.selectedOutfit, overlayImage);

  const widthBoost = isKurti ? 1.16 : isDressLike ? 1.08 : isJacket ? 1.03 : isTshirt ? 0.98 : 1;
  const heightBoost = isKurti ? 1.28 : isDressLike ? 1.12 : isJacket ? 1.04 : isTshirt ? 0.92 : 1;

  const targetWidth = poseMetrics.bodyWidth * renderProfile.widthScale * widthBoost;
  const minHeight = poseMetrics.torsoHeight * renderProfile.heightScale * heightBoost;
  const bodyBottomY = isKurti
    ? poseMetrics.lowerBodyY
    : isDressLike
      ? poseMetrics.hipY + poseMetrics.torsoHeight * 0.98
      : poseMetrics.hipY + poseMetrics.torsoHeight * (isJacket ? 0.58 : 0.42);
  const targetY = poseMetrics.shoulderY - poseMetrics.torsoHeight * renderProfile.yOffsetScale;
  const targetHeight = Math.max(minHeight, bodyBottomY - targetY + poseMetrics.torsoHeight * (isKurti ? 0.24 : isDressLike ? 0.14 : 0.08));
  const targetX = poseMetrics.shoulderCenterX - targetWidth / 2 + (poseMetrics.shoulderCenterX - poseMetrics.hipCenterX) * (isKurti ? 0.03 : 0.06);

  const x1 = targetX;
  const y1 = targetY;
  const x2 = targetX + targetWidth;
  const y2 = targetY;
  const x3 = targetX + targetWidth * (isKurti ? 1.08 : isDressLike ? 1.03 : isJacket ? 0.94 : 0.9);
  const y3 = targetY + targetHeight;
  const x4 = targetX - targetWidth * (isKurti ? 0.08 : isDressLike ? 0.03 : isJacket ? 0.02 : 0.04);
  const y4 = targetY + targetHeight;

  const minX = Math.max(0, Math.min(x1, x2, x3, x4));
  const maxX = Math.min(w, Math.max(x1, x2, x3, x4));
  const minY = Math.max(0, Math.min(y1, y2, y3, y4));
  const maxY = Math.min(h, Math.max(y1, y2, y3, y4));

  // Draw selected outfit image clipped to the torso polygon.
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.lineTo(x3, y3);
  ctx.lineTo(x4, y4);
  ctx.closePath();
  ctx.clip();

  if (overlayImage && overlayImage.complete && overlayImage.naturalWidth > 0) {
    ctx.globalAlpha = 0.6;

    const drawW = maxX - minX;
    const drawH = maxY - minY;
    const srcW = overlayImage.naturalWidth;
    const srcH = overlayImage.naturalHeight;

    // "Cover" fit: crop source using the image's own aspect ratio and profile bias.
    const targetRatio = drawW / drawH;
    const sourceRatio = srcW / srcH;
    const sourceCenterX = srcW / 2 + srcW * renderProfile.cropBiasX;
    const sourceCenterY = srcH / 2 + srcH * renderProfile.cropBiasY;

    let cropX = 0;
    let cropY = 0;
    let cropW = srcW;
    let cropH = srcH;

    if (sourceRatio > targetRatio) {
      cropW = srcH * targetRatio;
      cropX = sourceCenterX - cropW / 2;
    } else {
      cropH = srcW / targetRatio;
      cropY = sourceCenterY - cropH / 2;
    }

    cropX = Math.max(0, Math.min(srcW - cropW, cropX));
    cropY = Math.max(0, Math.min(srcH - cropH, cropY));

    ctx.drawImage(overlayImage, cropX, cropY, cropW, cropH, minX, minY, drawW, drawH);
  } else {
    ctx.globalAlpha = 0.45;
    ctx.fillStyle = getOutfitTint(state.selectedOutfit);
    ctx.fillRect(minX, minY, maxX - minX, maxY - minY);
  }
  ctx.restore();

  // Draw clear border so try-on area is visible at all times.
  ctx.save();
  ctx.globalAlpha = 0.95;
  ctx.strokeStyle = '#c9a84c';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.lineTo(x3, y3);
  ctx.lineTo(x4, y4);
  ctx.closePath();
  ctx.stroke();
  ctx.restore();

  // Label
  ctx.save();
  ctx.font = '12px DM Sans';
  ctx.fillStyle = '#c9a84c';
  const cx = (x1 + x2) / 2;
  const cy = (y1 + y2) / 2 - 30;
  ctx.fillText(`✦ ${state.selectedOutfit?.name || 'Outfit'}`, cx - 40, cy);
  ctx.restore();
}

// ── Lens Studio Integration ────────────────────────────────────────────────
function normalizeLensConfig(config) {
  const sourceLenses = Array.isArray(config?.lenses)
    ? config.lenses
    : Array.isArray(config?.available_lenses)
      ? config.available_lenses
      : [];

  const lenses = sourceLenses.map((lens, index) => {
    const id = lens?.id || lens?.lens_id || `lens-${index + 1}`;
    const webPreviewUrl = lens?.web_preview_url || lens?.web_url || '';
    const snapchatUrl = lens?.snapchat_url || (lens?.lens_id ? `snapcamera://lens/${lens.lens_id}` : '');

    return {
      id,
      name: lens?.name || `Lens ${index + 1}`,
      lens_id: lens?.lens_id || id,
      web_preview_url: webPreviewUrl,
      web_url: webPreviewUrl,
      snapchat_url: snapchatUrl,
      enabled: lens?.enabled !== false && Boolean(id || webPreviewUrl || snapchatUrl),
    };
  });

  const selectedLensId = config?.selected_lens_id || config?.lens_id || lenses[0]?.id || null;

  return {
    ...config,
    lenses,
    selected_lens_id: selectedLensId,
  };
}

async function launchLens() {
  try {
    const res = await fetch('/api/lens-config');
    const config = normalizeLensConfig(await res.json());

    state.lensConfig = config;
    if (!config.lenses || !config.lenses.length) {
      showLensSetupModal();
      return;
    }

    const selected = getSelectedLens(config);
    showArOptionsModal(selected, config);

  } catch (e) {
    console.error('Lens config error:', e);
    showLensSetupModal();
  }
}

function getSelectedLens(config = state.lensConfig) {
  if (!config || !config.lenses || !config.lenses.length) return null;
  const selectedId = state.selectedLensId || config.selected_lens_id || config.lenses[0].id;
  return config.lenses.find(lens => lens.id === selectedId) || config.lenses[0];
}

function setSelectedLens(lensId) {
  state.selectedLensId = lensId;
  try {
    localStorage.setItem('styleai_selected_lens_id', lensId);
  } catch (e) {}
  renderLensSwitcher();
}

function renderLensSwitcher() {
  const container = document.getElementById('lensSwitcherList') || document.getElementById('lensTrack');
  const activeName = document.getElementById('activeLensName');
  if (!container || !state.lensConfig || !state.lensConfig.lenses) return;

  const selected = getSelectedLens();
  const selectedName = selected?.name || 'Loading lenses...';
  if (activeName) {
    activeName.textContent = selectedName;
  }

  container.innerHTML = state.lensConfig.lenses.map((lens) => `
    <button type="button" class="lens-switcher-item lens-chip ${selected && selected.id === lens.id ? 'active' : ''} ${lens.enabled === false ? 'disabled' : ''}" ${lens.enabled === false ? 'disabled' : ''} onclick="selectLens('${lens.id}')">
      <span class="lens-chip-dot"></span>
      <span class="lens-chip-name">${lens.name}</span>
      <span class="lens-chip-mode">WEB AR</span>
    </button>
  `).join('');
}

function selectLens(lensId) {
  const config = state.lensConfig;
  if (!config || !config.lenses) return;
  const lens = config.lenses.find(item => item.id === lensId);
  if (!lens || lens.enabled === false) return;
  setSelectedLens(lensId);
  showToast(`Selected ${lens.name}`, 'success');
}

function showArOptionsModal(selectedLens, config) {
  const modal = document.createElement('div');
  modal.id = 'arOptionsModal';
  modal.style.cssText = `
    position:fixed;inset:0;background:rgba(26,23,20,0.85);
    z-index:2000;display:flex;align-items:center;justify-content:center;
    backdrop-filter:blur(8px);animation:fadeUp 0.3s ease;
  `;

  const lensTitle = selectedLens ? selectedLens.name : 'AR Lens';
  const lensWebUrl = selectedLens?.web_preview_url || '';
  const lensSnapUrl = selectedLens?.snapchat_url || '';
  const options = [
    {
      name: 'Web AR Try-On',
      description: 'Open in web browser (Desktop/Mobile)',
      method: 'web',
      url: lensWebUrl,
      enabled: Boolean(lensWebUrl),
    },
    {
      name: 'Snapchat Mobile App',
      description: 'Open in Snapchat app (Mobile only)',
      method: 'snapchat',
      url: lensSnapUrl,
      enabled: Boolean(lensSnapUrl),
    },
    {
      name: 'Pose Tracking Mirror',
      description: 'Use MediaPipe webcam overlay (No app needed)',
      method: 'mediapipe',
      url: '#tryon',
      enabled: true,
    },
  ];

  const optionsHtml = options.map(opt => `
    <button type="button" class="ar-option-btn ${opt.enabled === false ? 'disabled' : ''}" ${opt.enabled === false ? 'disabled' : ''} onclick="selectArMethod('${opt.method}', '${opt.url}', '${opt.name}', ${opt.enabled === false ? 'false' : 'true'})">
      <div class="ar-option-title">${opt.name}</div>
      <div class="ar-option-desc">${opt.enabled === false ? `${opt.description} (Not configured)` : opt.description}</div>
      <div class="ar-option-arrow">→</div>
    </button>
  `).join('');

  modal.innerHTML = `
    <div style="background:#faf8f3;border-radius:20px;padding:48px;max-width:600px;width:90%;position:relative;max-height:90vh;overflow-y:auto;">
      <button type="button" onclick="document.getElementById('arOptionsModal').remove()" 
        style="position:absolute;top:20px;right:20px;background:none;border:none;font-size:24px;cursor:pointer;color:#8a8278;padding:0;">✕</button>
      
      <h2 style="font-family:'Cormorant Garamond',serif;font-size:36px;margin-bottom:12px;color:#1a1714;">AR Try-On</h2>
      <p style="color:#8a8278;font-size:15px;margin-bottom:8px;">Selected lens: <strong>${lensTitle}</strong></p>
      <p style="color:#8a8278;font-size:15px;margin-bottom:32px;">Choose how you want to experience the AR virtual try-on:</p>
      
      <div style="display:flex;flex-direction:column;gap:12px;">
        ${optionsHtml}
      </div>

      <div style="margin-top:32px;padding:20px;background:#f5f3f0;border-radius:12px;border-left:4px solid #c9a84c;">
        <p style="font-size:13px;color:#6b6057;margin:0;">
          <strong>💡 Tip:</strong> Web AR works best on mobile devices. For the most realistic try-on, use the Snapchat app if available.
        </p>
      </div>
    </div>
  `;

  // Add styles for AR option buttons
  if (!document.getElementById('arOptionsStyle')) {
    const style = document.createElement('style');
    style.id = 'arOptionsStyle';
    style.textContent = `
      .ar-option-btn {
        display:flex;justify-content:space-between;align-items:center;
        padding:18px 24px;background:#fef9f3;border:2px solid #e8ddd4;
        border-radius:12px;cursor:pointer;transition:all 0.3s ease;
        font-family:var(--font-body);text-align:left;
      }
      .ar-option-btn:hover {
        background:#f5ede3;border-color:#c9a84c;box-shadow:0 4px 12px rgba(201,168,76,0.15);
      }
      .ar-option-btn.disabled {
        opacity:0.55;cursor:not-allowed;pointer-events:none;
      }
      .ar-option-title {
        font-weight:600;color:#1a1714;font-size:15px;margin-bottom:4px;
      }
      .ar-option-desc {
        font-size:13px;color:#8a8278;
      }
      .ar-option-arrow {
        color:#c9a84c;font-size:20px;font-weight:600;
      }
    `;
    document.head.appendChild(style);
  }

  document.body.appendChild(modal);
}

function selectArMethod(method, url, name) {
  document.getElementById('arOptionsModal')?.remove();

  if (!url && method !== 'mediapipe') {
    showToast(`${name} is not configured yet. Using pose mirror instead.`, 'info');
    scrollToSection('tryon');
    if (state.selectedOutfit) {
      startPoseTracking();
    }
    return;
  }

  if (method === 'web') {
    // Open Lens Studio web AR in new tab
    window.open(url, '_blank');
    showToast(`✦ ${name} opened in new tab`, 'success');
  } else if (method === 'snapchat') {
    // Try to open via Snapchat deeplink
    setTimeout(() => {
      window.location.href = url;
      setTimeout(() => {
        showToast(`Open Snapchat app and search for this lens`, 'info');
      }, 1000);
    }, 100);
  } else if (method === 'mediapipe') {
    // Use pose tracking fallback
    scrollToSection('tryon');
    showToast('✦ Using pose tracking mirror', 'info');
    if (state.selectedOutfit) {
      startPoseTracking();
    }
  }
}

function showLensSetupModal() {
  const modal = document.createElement('div');
  modal.style.cssText = `
    position:fixed;inset:0;background:rgba(26,23,20,0.85);
    z-index:2000;display:flex;align-items:center;justify-content:center;
    backdrop-filter:blur(8px);animation:fadeUp 0.3s ease;
  `;
  modal.innerHTML = `
    <div style="background:#faf8f3;border-radius:20px;padding:48px;max-width:580px;width:90%;position:relative;">
      <button type="button" onclick="this.closest('[style*=fixed]').remove()" style="position:absolute;top:20px;right:20px;background:none;border:none;font-size:24px;cursor:pointer;color:#8a8278;padding:0;">✕</button>
      <h2 style="font-family:'Cormorant Garamond',serif;font-size:36px;margin-bottom:16px;color:#1a1714;">Enable Lens Studio AR</h2>
      <p style="color:#6b6057;font-size:15px;line-height:1.7;margin-bottom:28px;">
        To use the AR try-on feature, you need to set up a Lens Studio account and configure your lens ID in the app.
      </p>
      <div style="text-align:left;display:flex;flex-direction:column;gap:16px;margin-bottom:32px;background:#f5ede3;padding:20px;border-radius:12px;">
        <div style="display:flex;gap:12px;align-items:flex-start;">
          <span style="min-width:28px;height:28px;border-radius:50%;background:#c9a84c;color:#1a1714;font-size:13px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0;">1</span>
          <div>
            <p style="font-size:14px;color:#1a1714;font-weight:600;margin:0 0 4px 0;">Create Lens Studio Account</p>
            <p style="font-size:13px;color:#6b6057;margin:0;">Visit <a href="https://lensstudio.snapchat.com" target="_blank" style="color:#c9a84c;text-decoration:none;font-weight:600;">lensstudio.snapchat.com</a> and sign up</p>
          </div>
        </div>
        <div style="display:flex;gap:12px;align-items:flex-start;">
          <span style="min-width:28px;height:28px;border-radius:50%;background:#c9a84c;color:#1a1714;font-size:13px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0;">2</span>
          <div>
            <p style="font-size:14px;color:#1a1714;font-weight:600;margin:0 0 4px 0;">Create a Clothing Try-On Lens</p>
            <p style="font-size:13px;color:#6b6057;margin:0;">Use the "ClothTryOn" template to build your virtual wardrobe</p>
          </div>
        </div>
        <div style="display:flex;gap:12px;align-items:flex-start;">
          <span style="min-width:28px;height:28px;border-radius:50%;background:#c9a84c;color:#1a1714;font-size:13px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0;">3</span>
          <div>
            <p style="font-size:14px;color:#1a1714;font-weight:600;margin:0 0 4px 0;">Publish Your Lens</p>
            <p style="font-size:13px;color:#6b6057;margin:0;">Click "Publish" and copy your unique Lens ID</p>
          </div>
        </div>
        <div style="display:flex;gap:12px;align-items:flex-start;">
          <span style="min-width:28px;height:28px;border-radius:50%;background:#c9a84c;color:#1a1714;font-size:13px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0;">4</span>
          <div>
            <p style="font-size:14px;color:#1a1714;font-weight:600;margin:0 0 4px 0;">Add Lens ID to App</p>
            <p style="font-size:13px;color:#6b6057;margin:0;">Open <code style="background:#ddd5c9;padding:2px 6px;border-radius:4px;font-family:monospace;">app.py</code> and replace <code style="background:#ddd5c9;padding:2px 6px;border-radius:4px;font-family:monospace;">YOUR_LENS_ID_HERE</code></p>
          </div>
        </div>
      </div>
      <div style="display:flex;gap:12px;">
        <a href="https://lensstudio.snapchat.com" target="_blank" style="flex:1;display:flex;align-items:center;justify-content:center;background:#c9a84c;color:#1a1714;padding:12px;border-radius:12px;text-decoration:none;font-weight:600;font-size:14px;transition:background 0.3s;">
          → Visit Lens Studio
        </a>
        <a href="https://support.snapchat.com/a/lens-studio" target="_blank" style="flex:1;display:flex;align-items:center;justify-content:center;background:#f5ede3;color:#1a1714;padding:12px;border-radius:12px;text-decoration:none;font-weight:600;font-size:14px;border:2px solid #ddd5c9;transition:all 0.3s;">
          → Docs
        </a>
      </div>
      <p style="font-size:12px;color:#8a8278;margin-top:20px;text-align:center;">
        💡 Meanwhile, try the Pose Tracking Mirror below — no setup needed!
      </p>
    </div>
  `;
  document.body.appendChild(modal);
}

// ── Init ───────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  getOrCreatePageTransitionLayer();

  document.querySelectorAll('.nav-link[href^="#"]').forEach((link) => {
    link.addEventListener('click', (event) => {
      event.preventDefault();
      const href = link.getAttribute('href') || '';
      const sectionId = href.startsWith('#') ? href.slice(1) : href;
      if (sectionId) {
        scrollToSection(sectionId);
      }
    });
  });

  toggleCatalogDropdown(false);
  await loadUploadedClothes();
  const sourceSelect = document.getElementById('outfitSource') || document.getElementById('sourceFilter');
  if (sourceSelect) {
    const selectedSource = sourceSelect.value;
    state.source = selectedSource === 'csv' ? 'main_catalog' : selectedSource === 'dataset' ? 'dataset_folder' : selectedSource === 'main_catalog' ? 'main_catalog' : selectedSource === 'dataset_folder' ? 'dataset_folder' : 'both';
  }
  setSourceFilter(state.source);
  const detailSelect = document.getElementById('catalogDetailFilter');
  if (detailSelect) {
    state.catalogDetail = detailSelect.value || 'all';
  }
  await loadCatalog();

  if (window.location.hash === '#catalog') {
    toggleCatalogDropdown(true);
  }

  try {
    const savedLensId = localStorage.getItem('styleai_selected_lens_id');
    if (savedLensId) state.selectedLensId = savedLensId;
    const res = await fetch('/api/lens-config');
    state.lensConfig = normalizeLensConfig(await res.json());
    if (!state.selectedLensId) state.selectedLensId = state.lensConfig.selected_lens_id || state.lensConfig.lenses?.[0]?.id || null;
    renderLensSwitcher();
  } catch (e) {}

  // Scroll animations
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        e.target.style.animation = 'fadeUp 0.6s ease both';
        observer.unobserve(e.target);
      }
    });
  }, { threshold: 0.1 });

  document.querySelectorAll('.card, .section-header').forEach(el => {
    el.style.opacity = '0';
    observer.observe(el);
  });
});
