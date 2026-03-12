const DB_NAME = 'vinduespuds-pro-db';
const DB_VERSION = 1;
const TYPE_STORE = 'windowTypes';
const CUSTOMER_STORE = 'customers';
const START_PRICE_NAME = 'Start Pris';
const INTERIOR_OPTION_NAME = 'Indvendig';

let db;
let windowTypes = [];
let customers = [];
let latestCalculation = null;
let selectedCustomerId = null;
let deferredPrompt = null;

const els = {};

document.addEventListener('DOMContentLoaded', init);

async function init() {
  cacheElements();
  bindUI();
  db = await openDatabase();
  await ensureDefaultData();
  await refreshAll();
  registerServiceWorker();
}

function cacheElements() {
  [
    'menuBtn', 'closeDrawerBtn', 'drawer', 'drawerBackdrop', 'installBtn',
    'goToTypesBtn', 'addTypeBtn', 'typesList', 'calculatorItems', 'startPriceSummary', 'interiorEnabled', 'interiorSummary',
    'calculateBtn', 'resultBox', 'resetCalculatorBtn', 'typeModal', 'typeModalTitle',
    'typeForm', 'typeId', 'typeName', 'typeWorkSeconds', 'typeWalkSeconds', 'typeWalkEveryCount', 'typePrice',
    'modalBackdrop', 'customerModal', 'customerModalTitle', 'customerForm', 'customerId',
    'customerMode', 'customerName', 'customerAddress', 'customerPostalCode', 'customerCity',
    'customerPhone', 'customerEmail', 'customerNote', 'customerQuoteSummary', 'customersList',
    'customerSearch', 'addCustomerBtn', 'exportBackupBtn', 'importBackupBtn', 'importFileInput', 'customerPanel', 'closeCustomerPanelBtn',
    'panelCustomerName', 'panelName', 'panelAddress', 'panelPostalCode', 'panelCity',
    'panelPhone', 'panelEmail', 'panelNote', 'panelMapsLink', 'panelQuoteEditor',
    'saveCustomerPanelBtn', 'deleteCustomerBtn', 'loadCustomerIntoCalculatorBtn'
  ].forEach((id) => {
    els[id] = document.getElementById(id);
  });
}

function bindUI() {
  els.menuBtn.addEventListener('click', openDrawer);
  els.closeDrawerBtn.addEventListener('click', closeDrawer);
  els.drawerBackdrop.addEventListener('click', closeDrawer);
  els.goToTypesBtn.addEventListener('click', () => switchView('typesView'));
  els.addTypeBtn.addEventListener('click', () => openTypeModal());
  els.typeForm.addEventListener('submit', handleTypeSubmit);
  els.calculateBtn.addEventListener('click', calculatePrice);
  els.interiorEnabled.addEventListener('change', () => {
    if (latestCalculation) calculatePrice();
  });
  els.resetCalculatorBtn.addEventListener('click', resetCalculatorInputs);
  els.addCustomerBtn.addEventListener('click', () => openCustomerModal({ fromCalculation: false }));
  els.customerForm.addEventListener('submit', handleCustomerSubmit);
  els.customerSearch.addEventListener('input', renderCustomers);
  els.exportBackupBtn.addEventListener('click', exportBackup);
  els.importBackupBtn.addEventListener('click', () => els.importFileInput.click());
  els.importFileInput.addEventListener('change', handleImportFile);
  els.closeCustomerPanelBtn.addEventListener('click', closeCustomerPanel);
  els.saveCustomerPanelBtn.addEventListener('click', saveCustomerFromPanel);
  els.deleteCustomerBtn.addEventListener('click', deleteSelectedCustomer);
  els.loadCustomerIntoCalculatorBtn.addEventListener('click', loadSelectedCustomerIntoCalculator);

  document.querySelectorAll('.nav-btn').forEach((btn) => {
    btn.addEventListener('click', () => switchView(btn.dataset.view));
  });

  document.querySelectorAll('[data-close]').forEach((btn) => {
    btn.addEventListener('click', () => closeModal(btn.dataset.close));
  });

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredPrompt = event;
    els.installBtn.classList.remove('hidden');
  });

  els.installBtn.addEventListener('click', async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    els.installBtn.classList.add('hidden');
  });

  window.addEventListener('click', (event) => {
    if (event.target === els.modalBackdrop) {
      closeModal('typeModal');
      closeModal('customerModal');
    }
  });
}

function switchView(viewId) {
  document.querySelectorAll('.view').forEach((view) => view.classList.remove('active'));
  document.getElementById(viewId).classList.add('active');
  document.querySelectorAll('.nav-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.view === viewId);
  });
  closeDrawer();
}

function openDrawer() {
  els.drawer.classList.add('open');
  els.drawerBackdrop.classList.remove('hidden');
}

function closeDrawer() {
  els.drawer.classList.remove('open');
  els.drawerBackdrop.classList.add('hidden');
}

function openModal(id) {
  els.modalBackdrop.classList.remove('hidden');
  document.getElementById(id).classList.remove('hidden');
}

function closeModal(id) {
  const modal = document.getElementById(id);
  if (!modal) return;
  modal.classList.add('hidden');
  const openModals = [...document.querySelectorAll('.modal')].some((m) => !m.classList.contains('hidden'));
  if (!openModals) els.modalBackdrop.classList.add('hidden');
}

function openCustomerPanel(customerId) {
  selectedCustomerId = customerId;
  const customer = customers.find((item) => item.id === customerId);
  if (!customer) return;

  els.panelCustomerName.textContent = customer.name || 'Kunde';
  els.panelName.value = customer.name || '';
  els.panelAddress.value = customer.address || '';
  els.panelPostalCode.value = customer.postalCode || '';
  els.panelCity.value = customer.city || '';
  els.panelPhone.value = customer.phone || '';
  els.panelEmail.value = customer.email || '';
  els.panelNote.value = customer.note || '';

  const mapsQuery = encodeURIComponent([customer.address, customer.postalCode, customer.city].filter(Boolean).join(' '));
  if (mapsQuery) {
    els.panelMapsLink.href = `https://www.google.com/maps/search/?api=1&query=${mapsQuery}`;
    els.panelMapsLink.classList.remove('hidden');
  } else {
    els.panelMapsLink.classList.add('hidden');
  }

  renderQuoteEditor(customer.quote || null);
  els.customerPanel.classList.remove('hidden');
  els.drawerBackdrop.classList.remove('hidden');
}

function closeCustomerPanel() {
  els.customerPanel.classList.add('hidden');
  selectedCustomerId = null;
  if (!els.drawer.classList.contains('open')) {
    els.drawerBackdrop.classList.add('hidden');
  }
}

async function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const database = event.target.result;

      if (!database.objectStoreNames.contains(TYPE_STORE)) {
        const typeStore = database.createObjectStore(TYPE_STORE, { keyPath: 'id' });
        typeStore.createIndex('order', 'order', { unique: false });
      }

      if (!database.objectStoreNames.contains(CUSTOMER_STORE)) {
        const customerStore = database.createObjectStore(CUSTOMER_STORE, { keyPath: 'id' });
        customerStore.createIndex('name', 'name', { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function tx(storeName, mode = 'readonly') {
  return db.transaction(storeName, mode).objectStore(storeName);
}

function getAll(storeName) {
  return new Promise((resolve, reject) => {
    const request = tx(storeName).getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function put(storeName, value) {
  return new Promise((resolve, reject) => {
    const request = tx(storeName, 'readwrite').put(value);
    request.onsuccess = () => resolve(value);
    request.onerror = () => reject(request.error);
  });
}

function remove(storeName, id) {
  return new Promise((resolve, reject) => {
    const request = tx(storeName, 'readwrite').delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

function clearStore(storeName) {
  return new Promise((resolve, reject) => {
    const request = tx(storeName, 'readwrite').clear();
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

async function ensureDefaultData() {
  const types = await getAll(TYPE_STORE);
  const startPrice = types.find((item) => item.isStartPrice);
  const interiorOption = types.find((item) => item.isInteriorOption);

  if (!startPrice) {
    await put(TYPE_STORE, {
      id: crypto.randomUUID(),
      name: START_PRICE_NAME,
      workSeconds: 0,
      walkSeconds: 0,
      walkEveryCount: 1,
      price: 0,
      order: 0,
      isStartPrice: true,
      createdAt: new Date().toISOString()
    });
  }

  if (!interiorOption) {
    await put(TYPE_STORE, {
      id: crypto.randomUUID(),
      name: INTERIOR_OPTION_NAME,
      workSeconds: 0,
      walkSeconds: 0,
      walkEveryCount: 1,
      price: 0,
      order: 1,
      isInteriorOption: true,
      createdAt: new Date().toISOString()
    });
  }
}

async function refreshAll() {
  windowTypes = (await getAll(TYPE_STORE)).sort(sortByOrderThenName);
  customers = (await getAll(CUSTOMER_STORE)).sort((a, b) => (a.name || '').localeCompare(b.name || '', 'da'));
  await ensureTypeDefaults();
  await normalizeTypeOrder();
  renderTypes();
  renderCalculator();
  renderCustomers();
}

async function ensureTypeDefaults() {
  let changed = false;
  for (const type of windowTypes) {
    const normalizedCount = Math.min(12, Math.max(1, Number(type.walkEveryCount || 1)));
    if (type.walkEveryCount !== normalizedCount) {
      type.walkEveryCount = normalizedCount;
      changed = true;
      await put(TYPE_STORE, type);
    }
  }

  if (changed) {
    windowTypes = (await getAll(TYPE_STORE)).sort(sortByOrderThenName);
  }
}

async function normalizeTypeOrder() {
  const ordered = [...windowTypes].sort(sortByOrderThenName);
  let changed = false;
  let regularOrder = 2;

  ordered.forEach((item) => {
    let newOrder = regularOrder;
    if (item.isStartPrice) {
      newOrder = 0;
    } else if (item.isInteriorOption) {
      newOrder = 1;
    } else {
      regularOrder += 1;
    }

    if (item.order !== newOrder) {
      item.order = newOrder;
      changed = true;
    }
  });

  if (changed) {
    for (const item of ordered) {
      await put(TYPE_STORE, item);
    }
    windowTypes = (await getAll(TYPE_STORE)).sort(sortByOrderThenName);
  }
}

function sortByOrderThenName(a, b) {
  const groupA = a.isStartPrice ? 0 : (a.isInteriorOption ? 1 : 2);
  const groupB = b.isStartPrice ? 0 : (b.isInteriorOption ? 1 : 2);
  if (groupA !== groupB) {
    return groupA - groupB;
  }
  if ((a.order ?? 9999) !== (b.order ?? 9999)) {
    return (a.order ?? 9999) - (b.order ?? 9999);
  }
  return (a.name || '').localeCompare(b.name || '', 'da');
}

function renderTypes() {
  const container = els.typesList;
  container.innerHTML = '';

  if (!windowTypes.length) {
    container.innerHTML = '<div class="empty-state">Ingen vinduestyper endnu.</div>';
    return;
  }

  const regularTypes = getRegularTypes();

  windowTypes.forEach((type) => {
    const card = document.createElement('article');
    card.className = 'type-card';

    const regularIndex = regularTypes.findIndex((item) => item.id === type.id);
    const moveUpDisabled = isFixedType(type) || regularIndex <= 0;
    const moveDownDisabled = isFixedType(type) || regularIndex === regularTypes.length - 1;
    const typeLabel = type.isStartPrice
      ? 'Fast post der altid lægges til'
      : (type.isInteriorOption ? 'Fast indvendig sektion' : 'Vinduestype');

    card.innerHTML = `
      <div class="type-card-header">
        <div>
          <strong>${escapeHtml(type.name)}</strong>
          <p>${typeLabel}</p>
        </div>
        <div class="type-actions">
          <button class="mini-btn" data-action="move-up" data-id="${type.id}" ${moveUpDisabled ? 'disabled' : ''}>↑</button>
          <button class="mini-btn" data-action="move-down" data-id="${type.id}" ${moveDownDisabled ? 'disabled' : ''}>↓</button>
          <button class="mini-btn" data-action="edit" data-id="${type.id}">Redigér</button>
          ${isFixedType(type) ? '' : `<button class="mini-btn danger" data-action="delete" data-id="${type.id}">Slet</button>`}
        </div>
      </div>
      <div class="type-meta">
        <span class="meta-pill ${isFixedType(type) ? 'fixed' : ''}">Pris: ${formatCurrency(type.price)}</span>
        <span class="meta-pill">Arbejde: ${formatSeconds(type.workSeconds)}</span>
        ${type.isInteriorOption
          ? `<span class="meta-pill">Bruges som indvendig startgebyr + starttid</span>`
          : `<span class="meta-pill">Gå tid: ${formatSeconds(type.walkSeconds)} / hver ${toNumber(type.walkEveryCount || 1)} stk</span>`}
      </div>
    `;

    card.querySelectorAll('[data-action]').forEach((btn) => {
      btn.addEventListener('click', () => handleTypeAction(btn.dataset.action, btn.dataset.id));
    });

    container.appendChild(card);
  });
}

function renderCalculator() {
  const startPrice = getStartPriceType();
  const interiorOption = getInteriorOptionType();
  const interiorWasChecked = Boolean(els.interiorEnabled?.checked);

  els.startPriceSummary.innerHTML = startPrice
    ? `
      <span class="meta-pill fixed">Pris: ${formatCurrency(startPrice.price)}</span>
      <span class="meta-pill">Arbejde: ${formatSeconds(startPrice.workSeconds)}</span>
      <span class="meta-pill">Gå tid: ${formatSeconds(startPrice.walkSeconds)}</span>
    `
    : '<span class="meta-pill">Start Pris mangler</span>';

  els.interiorSummary.innerHTML = interiorOption
    ? `
      <span class="meta-pill fixed">Startgebyr: ${formatCurrency(interiorOption.price)}</span>
      <span class="meta-pill">Starttid: ${formatSeconds(interiorOption.workSeconds)}</span>
      <span class="meta-pill">Når indvendig er aktiv, fordobles vinduer, arbejdstid og gå-tid</span>
    `
    : '<span class="meta-pill">Indvendig-sektion mangler</span>';

  if (els.interiorEnabled) {
    els.interiorEnabled.checked = latestCalculation?.interior?.enabled ?? interiorWasChecked;
  }

  const items = getRegularTypes();
  els.calculatorItems.innerHTML = '';

  if (!items.length) {
    els.calculatorItems.innerHTML = '<div class="empty-state">Du har ingen vinduestyper endnu. Gå til menuen og opret nogle først.</div>';
    return;
  }

  items.forEach((type) => {
    const row = document.createElement('div');
    row.className = 'calc-row';
    row.innerHTML = `
      <div>
        <strong>${escapeHtml(type.name)}</strong>
        <div class="type-meta">
          <span class="meta-pill">Pris/stk: ${formatCurrency(type.price)}</span>
          <span class="meta-pill">Arbejde: ${formatSeconds(type.workSeconds)}</span>
          <span class="meta-pill">Gå tid: ${formatSeconds(type.walkSeconds)} / hver ${toNumber(type.walkEveryCount || 1)} stk</span>
        </div>
      </div>
      <label>
        Antal
        <input type="number" min="0" step="1" inputmode="numeric" data-calc-id="${type.id}" placeholder="0" />
      </label>
    `;
    els.calculatorItems.appendChild(row);
  });
}

function renderCustomers() {
  const search = (els.customerSearch.value || '').trim().toLowerCase();
  const filtered = customers.filter((customer) => {
    const hay = [customer.name, customer.phone, customer.address, customer.city, customer.postalCode, customer.email]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return hay.includes(search);
  });

  els.customersList.innerHTML = '';

  if (!filtered.length) {
    els.customersList.innerHTML = '<div class="empty-state">Ingen kunder fundet.</div>';
    return;
  }

  filtered.forEach((customer) => {
    const card = document.createElement('article');
    card.className = 'customer-card';
    const quote = customer.quote;
    const lineCount = quote?.items?.filter((item) => Number(item.quantity) > 0).length || 0;

    card.innerHTML = `
      <div class="customer-card-header">
        <div>
          <strong>${escapeHtml(customer.name || 'Navnløs kunde')}</strong>
          <p>${escapeHtml([customer.address, customer.postalCode, customer.city].filter(Boolean).join(', ') || 'Ingen adresse')}</p>
        </div>
        <div class="customer-actions">
          <button class="mini-btn" data-action="open">Åbn</button>
        </div>
      </div>
      <div class="customer-meta">
        ${customer.phone ? `<span class="meta-pill">${escapeHtml(customer.phone)}</span>` : ''}
        ${customer.email ? `<span class="meta-pill">${escapeHtml(customer.email)}</span>` : ''}
        ${quote ? `<span class="meta-pill fixed">Pris: ${formatCurrency(quote.totalPrice || 0)}</span>` : '<span class="meta-pill">Ingen prisdata</span>'}
        ${quote ? `<span class="meta-pill">Typer: ${lineCount}</span>` : ''}
        ${quote?.interior?.enabled ? `<span class="meta-pill">Indvendig aktiv</span>` : ''}
      </div>
    `;

    card.querySelector('[data-action="open"]').addEventListener('click', () => openCustomerPanel(customer.id));
    els.customersList.appendChild(card);
  });
}

function openTypeModal(type = null) {
  els.typeForm.reset();
  els.typeId.value = type?.id || '';
  els.typeModalTitle.textContent = type ? `Redigér ${type.name}` : 'Opret vindue';
  els.typeName.value = type?.name || '';
  els.typeWorkSeconds.value = type?.workSeconds ?? 0;
  els.typeWalkSeconds.value = type?.walkSeconds ?? 0;
  els.typeWalkEveryCount.value = Math.min(12, Math.max(1, Number(type?.walkEveryCount ?? 1)));
  els.typePrice.value = type?.price ?? 0;

  if (type?.isStartPrice) {
    els.typeName.value = START_PRICE_NAME;
    els.typeName.disabled = true;
    els.typeWalkSeconds.disabled = false;
    els.typeWalkEveryCount.disabled = false;
  } else if (type?.isInteriorOption) {
    els.typeName.value = INTERIOR_OPTION_NAME;
    els.typeName.disabled = true;
    els.typeWalkSeconds.value = 0;
    els.typeWalkSeconds.disabled = true;
    els.typeWalkEveryCount.value = 1;
    els.typeWalkEveryCount.disabled = true;
  } else {
    els.typeName.disabled = false;
    els.typeWalkSeconds.disabled = false;
    els.typeWalkEveryCount.disabled = false;
  }
  openModal('typeModal');
}

async function handleTypeSubmit(event) {
  event.preventDefault();
  const id = els.typeId.value;
  const existing = windowTypes.find((item) => item.id === id);
  const isStartPrice = existing?.isStartPrice || false;
  const isInteriorOption = existing?.isInteriorOption || false;

  const payload = {
    id: id || crypto.randomUUID(),
    name: isStartPrice ? START_PRICE_NAME : (isInteriorOption ? INTERIOR_OPTION_NAME : els.typeName.value.trim()),
    workSeconds: toNumber(els.typeWorkSeconds.value),
    walkSeconds: isInteriorOption ? 0 : toNumber(els.typeWalkSeconds.value),
    walkEveryCount: isInteriorOption ? 1 : Math.min(12, Math.max(1, toNumber(els.typeWalkEveryCount.value || 1))),
    price: toMoney(els.typePrice.value),
    order: existing?.order ?? nextTypeOrder(),
    isStartPrice,
    isInteriorOption,
    createdAt: existing?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  if (!payload.name) {
    showToast('Navn mangler.');
    return;
  }

  await put(TYPE_STORE, payload);
  closeModal('typeModal');
  await refreshAll();
  showToast('Vinduestype gemt.');
}

function nextTypeOrder() {
  return getRegularTypes().length + 1;
}

function getStartPriceType() {
  return windowTypes.find((item) => item.isStartPrice);
}

function getInteriorOptionType() {
  return windowTypes.find((item) => item.isInteriorOption);
}

function isFixedType(type) {
  return Boolean(type?.isStartPrice || type?.isInteriorOption);
}

function getRegularTypes() {
  return windowTypes.filter((item) => !isFixedType(item)).sort(sortByOrderThenName);
}

async function handleTypeAction(action, id) {
  const type = windowTypes.find((item) => item.id === id);
  if (!type) return;

  if (action === 'edit') {
    openTypeModal(type);
    return;
  }

  if (action === 'delete') {
    if (!confirm(`Slet vinduestypen "${type.name}"?`)) return;
    await remove(TYPE_STORE, id);
    await refreshAll();
    showToast('Vinduestype slettet.');
    return;
  }

  if (action === 'move-up' || action === 'move-down') {
    await moveType(id, action === 'move-up' ? -1 : 1);
  }
}

async function moveType(id, direction) {
  const regularTypes = getRegularTypes();
  const index = regularTypes.findIndex((item) => item.id === id);
  if (index === -1) return;
  const newIndex = index + direction;
  if (newIndex < 0 || newIndex >= regularTypes.length) return;

  const swapped = [...regularTypes];
  [swapped[index], swapped[newIndex]] = [swapped[newIndex], swapped[index]];

  for (let i = 0; i < swapped.length; i += 1) {
    swapped[i].order = i + 1;
    await put(TYPE_STORE, swapped[i]);
  }

  await refreshAll();
}

function resetCalculatorInputs() {
  document.querySelectorAll('[data-calc-id]').forEach((input) => {
    input.value = '';
  });
  latestCalculation = null;
  els.resultBox.className = 'result-box empty';
  els.resultBox.innerHTML = '<p>Ingen beregning endnu.</p>';
}

function calculatePrice() {
  const startPrice = getStartPriceType();
  const interiorOption = getInteriorOptionType();
  const regularTypes = getRegularTypes();
  const rows = [];
  const interiorEnabled = Boolean(els.interiorEnabled?.checked);

  let exteriorTotalPrice = toMoney(startPrice?.price || 0);
  let exteriorTotalWorkSeconds = toNumber(startPrice?.workSeconds || 0);
  let exteriorTotalWalkSeconds = toNumber(startPrice?.walkSeconds || 0);

  regularTypes.forEach((type) => {
    const input = document.querySelector(`[data-calc-id="${type.id}"]`);
    const quantity = toNumber(input?.value || 0);
    if (quantity <= 0) return;

    const walkEveryCount = Math.min(12, Math.max(1, toNumber(type.walkEveryCount || 1)));
    const linePrice = toMoney(quantity * toMoney(type.price));
    const lineWorkSeconds = quantity * toNumber(type.workSeconds);
    const walkTriggers = Math.floor(quantity / walkEveryCount);
    const lineWalkSeconds = walkTriggers * toNumber(type.walkSeconds);

    exteriorTotalPrice += linePrice;
    exteriorTotalWorkSeconds += lineWorkSeconds;
    exteriorTotalWalkSeconds += lineWalkSeconds;

    rows.push({
      typeId: type.id,
      name: type.name,
      quantity,
      price: toMoney(type.price),
      workSeconds: toNumber(type.workSeconds),
      walkSeconds: toNumber(type.walkSeconds),
      walkEveryCount,
      walkTriggers,
      linePrice,
      lineWorkSeconds,
      lineWalkSeconds
    });
  });

  const duplicatedPrice = toMoney(rows.reduce((sum, item) => sum + toMoney(item.linePrice), 0));
  const duplicatedWorkSeconds = rows.reduce((sum, item) => sum + toNumber(item.lineWorkSeconds), 0);
  const duplicatedWalkSeconds = rows.reduce((sum, item) => sum + toNumber(item.lineWalkSeconds), 0);
  const interiorStartPrice = interiorEnabled ? toMoney(interiorOption?.price || 0) : 0;
  const interiorStartWorkSeconds = interiorEnabled ? toNumber(interiorOption?.workSeconds || 0) : 0;

  const totalPrice = toMoney(exteriorTotalPrice + (interiorEnabled ? duplicatedPrice + interiorStartPrice : 0));
  const totalWorkSeconds = exteriorTotalWorkSeconds + (interiorEnabled ? duplicatedWorkSeconds + interiorStartWorkSeconds : 0);
  const totalWalkSeconds = exteriorTotalWalkSeconds + (interiorEnabled ? duplicatedWalkSeconds : 0);

  latestCalculation = {
    calculatedAt: new Date().toISOString(),
    startPrice: startPrice
      ? {
          name: startPrice.name,
          price: toMoney(startPrice.price),
          workSeconds: toNumber(startPrice.workSeconds),
          walkSeconds: toNumber(startPrice.walkSeconds)
        }
      : null,
    interior: {
      enabled: interiorEnabled,
      name: interiorOption?.name || INTERIOR_OPTION_NAME,
      price: interiorStartPrice,
      workSeconds: interiorStartWorkSeconds,
      walkSeconds: 0,
      duplicatedPrice,
      duplicatedWorkSeconds,
      duplicatedWalkSeconds,
      totalPrice: toMoney(interiorStartPrice + duplicatedPrice),
      totalWorkSeconds: interiorStartWorkSeconds + duplicatedWorkSeconds,
      totalWalkSeconds: duplicatedWalkSeconds,
      totalSeconds: interiorStartWorkSeconds + duplicatedWorkSeconds + duplicatedWalkSeconds
    },
    items: rows,
    exteriorTotalPrice: toMoney(exteriorTotalPrice),
    exteriorTotalWorkSeconds,
    exteriorTotalWalkSeconds,
    exteriorTotalSeconds: exteriorTotalWorkSeconds + exteriorTotalWalkSeconds,
    totalPrice,
    totalWorkSeconds,
    totalWalkSeconds,
    totalSeconds: totalWorkSeconds + totalWalkSeconds
  };

  renderCalculationResult(latestCalculation);
}

function renderCalculationResult(result) {
  const breakdown = [];

  if (result.startPrice) {
    breakdown.push(`
      <div class="result-line">
        <span><strong>${escapeHtml(result.startPrice.name)}</strong><br><small>Fast udvendig start</small></span>
        <span>${formatCurrency(result.startPrice.price)}</span>
      </div>
    `);
  }

  if (result.items.length) {
    result.items.forEach((item) => {
      breakdown.push(`
        <div class="result-line">
          <span>
            <strong>${escapeHtml(item.name)}</strong><br>
            <small>${item.quantity} stk × ${formatCurrency(item.price)} · gå ${item.walkTriggers || 0}× efter hver ${toNumber(item.walkEveryCount || 1)}</small>
          </span>
          <span>${formatCurrency(item.linePrice)}</span>
        </div>
      `);
    });
  }

  if (result.interior?.enabled) {
    breakdown.push(`
      <div class="result-line">
        <span><strong>${escapeHtml(result.interior.name)}</strong><br><small>Startgebyr + starttid for indvendig</small></span>
        <span>${formatCurrency(result.interior.price)}</span>
      </div>
    `);
    breakdown.push(`
      <div class="result-line">
        <span><strong>Indvendig af valgte vinduer</strong><br><small>Samme vinduer, arbejdstid og gå-tid lægges oveni én gang ekstra</small></span>
        <span>${formatCurrency(result.interior.duplicatedPrice)}</span>
      </div>
    `);
  }

  els.resultBox.className = 'result-box';
  els.resultBox.innerHTML = `
    <div class="result-panel">
      <div class="result-summary">
        <span class="meta-pill fixed">Udvendig pris: ${formatCurrency(result.exteriorTotalPrice ?? result.totalPrice)}</span>
        <span class="meta-pill fixed">Udvendig + indvendig pris: ${formatCurrency(result.totalPrice)}</span>
        <span class="meta-pill">Udvendig tid: ${formatSeconds(result.exteriorTotalSeconds ?? result.totalSeconds)}</span>
        <span class="meta-pill">Samlet tid: ${formatSeconds(result.totalSeconds)}</span>
      </div>
      <div class="result-breakdown">
        ${breakdown.join('') || '<div class="empty-state">Ingen antal angivet endnu. Kun faste priser er med, hvis de har en værdi.</div>'}
      </div>
      <div class="inline-actions">
        <button id="saveCalculationAsCustomerBtn" class="primary-btn">Opret kunde</button>
      </div>
    </div>
  `;

  document.getElementById('saveCalculationAsCustomerBtn').addEventListener('click', () => {
    openCustomerModal({ fromCalculation: true });
  });
}

function openCustomerModal({ fromCalculation }) {
  els.customerForm.reset();
  els.customerId.value = '';
  els.customerMode.value = 'create';
  els.customerModalTitle.textContent = fromCalculation ? 'Opret kunde fra beregning' : 'Opret kunde';

  if (fromCalculation && latestCalculation) {
    els.customerQuoteSummary.classList.remove('hidden');
    const activeLines = latestCalculation.items.filter((item) => item.quantity > 0).length;
    els.customerQuoteSummary.innerHTML = `
      <strong>Beregning klar til at blive gemt på kunden</strong>
      <p>Udvendig pris: ${formatCurrency(latestCalculation.exteriorTotalPrice ?? latestCalculation.totalPrice)} · Udvendig + indvendig pris: ${formatCurrency(latestCalculation.totalPrice)} · Samlet tid: ${formatSeconds(latestCalculation.totalSeconds)} · Typer: ${activeLines}</p>
    `;
  } else {
    els.customerQuoteSummary.classList.add('hidden');
    els.customerQuoteSummary.innerHTML = '';
  }

  openModal('customerModal');
}

async function handleCustomerSubmit(event) {
  event.preventDefault();

  const isCreate = els.customerMode.value === 'create';
  const existing = customers.find((item) => item.id === els.customerId.value);
  const fromCalculation = !els.customerQuoteSummary.classList.contains('hidden') && latestCalculation;

  const payload = {
    id: existing?.id || crypto.randomUUID(),
    name: els.customerName.value.trim(),
    address: els.customerAddress.value.trim(),
    postalCode: els.customerPostalCode.value.trim(),
    city: els.customerCity.value.trim(),
    phone: els.customerPhone.value.trim(),
    email: els.customerEmail.value.trim(),
    note: els.customerNote.value.trim(),
    quote: fromCalculation ? cloneCalculation(latestCalculation) : (existing?.quote || null),
    createdAt: existing?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  if (!payload.name) {
    showToast('Kunden skal have et navn.');
    return;
  }

  await put(CUSTOMER_STORE, payload);
  closeModal('customerModal');
  await refreshAll();
  if (isCreate && payload.quote) {
    showToast('Kunde gemt med prisdata.');
  } else {
    showToast('Kunde gemt.');
  }
}

function cloneCalculation(calc) {
  return JSON.parse(JSON.stringify(calc));
}

function renderQuoteEditor(quote) {
  els.panelQuoteEditor.innerHTML = '';

  if (!quote) {
    els.panelQuoteEditor.innerHTML = '<div class="empty-state">Ingen gemt prisdata på kunden endnu.</div>';
    return;
  }

  const wrapper = document.createElement('div');
  wrapper.className = 'quote-editor';

  const startRow = document.createElement('div');
  startRow.className = 'quote-row';
  startRow.innerHTML = `
    <div class="quote-row-head">
      <strong>${escapeHtml(quote.startPrice?.name || START_PRICE_NAME)}</strong>
      <span class="meta-pill fixed">Fast</span>
    </div>
    <div class="quote-row-grid compact">
      <label>
        Pris
        <input type="number" step="0.01" min="0" data-quote-start="price" value="${toMoney(quote.startPrice?.price || 0)}" />
      </label>
      <label>
        Arbejde + gå tid (sek)
        <input type="number" step="1" min="0" data-quote-start="combined" value="${toNumber(quote.startPrice?.workSeconds || 0) + toNumber(quote.startPrice?.walkSeconds || 0)}" />
      </label>
    </div>
  `;
  wrapper.appendChild(startRow);

  if (quote.items?.length) {
    quote.items.forEach((item, index) => {
      const row = document.createElement('div');
      row.className = 'quote-row';
      row.innerHTML = `
        <div class="quote-row-head">
          <strong>Linje ${index + 1}</strong>
          <button class="mini-btn danger" data-quote-remove="${index}">Fjern</button>
        </div>
        <div class="quote-row-grid">
          <label>
            Navn
            <input type="text" data-quote-field="name" data-index="${index}" value="${escapeAttribute(item.name)}" />
          </label>
          <label>
            Antal
            <input type="number" min="0" step="1" data-quote-field="quantity" data-index="${index}" value="${toNumber(item.quantity)}" />
          </label>
          <label>
            Pris/stk
            <input type="number" min="0" step="0.01" data-quote-field="price" data-index="${index}" value="${toMoney(item.price)}" />
          </label>
          <label>
            Tid/stk (sek)
            <input type="number" min="0" step="1" data-quote-field="timePerUnit" data-index="${index}" value="${toNumber(item.workSeconds) + toNumber(item.walkSeconds)}" />
          </label>
        </div>
      `;
      wrapper.appendChild(row);
    });
  }

  const addRowBtn = document.createElement('button');
  addRowBtn.className = 'secondary-btn';
  addRowBtn.textContent = 'Tilføj linje';
  addRowBtn.addEventListener('click', () => addQuoteRowToEditor());
  wrapper.appendChild(addRowBtn);

  const totals = document.createElement('div');
  totals.className = 'result-summary';
  totals.innerHTML = buildQuoteTotalsHtml(quote);
  wrapper.appendChild(totals);

  els.panelQuoteEditor.appendChild(wrapper);

  els.panelQuoteEditor.querySelectorAll('[data-quote-remove]').forEach((btn) => {
    btn.addEventListener('click', () => {
      btn.closest('.quote-row')?.remove();
      updateQuoteSummaryPreview();
    });
  });

  els.panelQuoteEditor.querySelectorAll('input').forEach((input) => {
    input.addEventListener('input', updateQuoteSummaryPreview);
  });
}

function addQuoteRowToEditor() {
  const wrapper = els.panelQuoteEditor.querySelector('.quote-editor');
  if (!wrapper) return;

  const index = wrapper.querySelectorAll('[data-quote-field="name"]').length;
  const row = document.createElement('div');
  row.className = 'quote-row';
  row.innerHTML = `
    <div class="quote-row-head">
      <strong>Linje ${index + 1}</strong>
      <button class="mini-btn danger" data-quote-remove="${index}">Fjern</button>
    </div>
    <div class="quote-row-grid">
      <label>
        Navn
        <input type="text" data-quote-field="name" data-index="${index}" value="" />
      </label>
      <label>
        Antal
        <input type="number" min="0" step="1" data-quote-field="quantity" data-index="${index}" value="0" />
      </label>
      <label>
        Pris/stk
        <input type="number" min="0" step="0.01" data-quote-field="price" data-index="${index}" value="0" />
      </label>
      <label>
        Tid/stk (sek)
        <input type="number" min="0" step="1" data-quote-field="timePerUnit" data-index="${index}" value="0" />
      </label>
    </div>
  `;
  wrapper.insertBefore(row, wrapper.querySelector('.secondary-btn'));

  row.querySelector('[data-quote-remove]').addEventListener('click', () => {
    row.remove();
    updateQuoteSummaryPreview();
  });
  row.querySelectorAll('input').forEach((input) => input.addEventListener('input', updateQuoteSummaryPreview));
  updateQuoteSummaryPreview();
}

function updateQuoteSummaryPreview() {
  const customer = customers.find((item) => item.id === selectedCustomerId);
  const editedQuote = collectQuoteFromPanel();
  if (!editedQuote || !customer) return;
  const totals = els.panelQuoteEditor.querySelector('.result-summary');
  if (totals) {
    totals.innerHTML = buildQuoteTotalsHtml(editedQuote);
  }
}

function collectQuoteFromPanel() {
  const customer = customers.find((item) => item.id === selectedCustomerId);
  if (!customer?.quote) return null;

  const startPriceInput = els.panelQuoteEditor.querySelector('[data-quote-start="price"]');
  const startCombinedInput = els.panelQuoteEditor.querySelector('[data-quote-start="combined"]');

  const itemsMap = new Map();
  els.panelQuoteEditor.querySelectorAll('[data-quote-field]').forEach((input) => {
    const index = Number(input.dataset.index);
    const field = input.dataset.quoteField;
    if (!itemsMap.has(index)) itemsMap.set(index, {});
    itemsMap.get(index)[field] = input.value;
  });

  const items = [...itemsMap.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, item]) => {
      const quantity = toNumber(item.quantity || 0);
      const price = toMoney(item.price || 0);
      const timePerUnit = toNumber(item.timePerUnit || 0);
      const linePrice = toMoney(quantity * price);
      const totalItemSeconds = quantity * timePerUnit;
      return {
        typeId: crypto.randomUUID(),
        name: (item.name || '').trim(),
        quantity,
        price,
        workSeconds: timePerUnit,
        walkSeconds: 0,
        linePrice,
        lineWorkSeconds: totalItemSeconds,
        lineWalkSeconds: 0
      };
    })
    .filter((item) => item.name || item.quantity || item.price || item.workSeconds);

  const startCombined = toNumber(startCombinedInput?.value || 0);
  const startPrice = {
    name: START_PRICE_NAME,
    price: toMoney(startPriceInput?.value || 0),
    workSeconds: startCombined,
    walkSeconds: 0
  };

  const exteriorTotalPrice = toMoney(startPrice.price + items.reduce((sum, item) => sum + toMoney(item.linePrice), 0));
  const exteriorTotalSeconds = startCombined + items.reduce((sum, item) => sum + toNumber(item.lineWorkSeconds), 0);

  const originalInterior = customer.quote.interior || { enabled: false, name: INTERIOR_OPTION_NAME, price: 0, workSeconds: 0 };
  const interiorEnabled = Boolean(originalInterior.enabled);
  const interiorDuplicatedPrice = toMoney(items.reduce((sum, item) => sum + toMoney(item.linePrice), 0));
  const interiorDuplicatedSeconds = items.reduce((sum, item) => sum + toNumber(item.lineWorkSeconds), 0);
  const interiorStartPrice = interiorEnabled ? toMoney(originalInterior.price || 0) : 0;
  const interiorStartSeconds = interiorEnabled ? toNumber(originalInterior.workSeconds || 0) : 0;

  const totalPrice = toMoney(exteriorTotalPrice + (interiorEnabled ? interiorDuplicatedPrice + interiorStartPrice : 0));
  const totalSeconds = exteriorTotalSeconds + (interiorEnabled ? interiorDuplicatedSeconds + interiorStartSeconds : 0);

  return {
    calculatedAt: customer.quote.calculatedAt || new Date().toISOString(),
    startPrice,
    interior: {
      enabled: interiorEnabled,
      name: originalInterior.name || INTERIOR_OPTION_NAME,
      price: interiorStartPrice,
      workSeconds: interiorStartSeconds,
      walkSeconds: 0,
      duplicatedPrice: interiorDuplicatedPrice,
      duplicatedWorkSeconds: interiorDuplicatedSeconds,
      duplicatedWalkSeconds: 0,
      totalPrice: toMoney(interiorStartPrice + interiorDuplicatedPrice),
      totalWorkSeconds: interiorStartSeconds + interiorDuplicatedSeconds,
      totalWalkSeconds: 0,
      totalSeconds: interiorStartSeconds + interiorDuplicatedSeconds
    },
    items,
    exteriorTotalPrice,
    exteriorTotalWorkSeconds: exteriorTotalSeconds,
    exteriorTotalWalkSeconds: 0,
    exteriorTotalSeconds,
    totalPrice,
    totalWorkSeconds: totalSeconds,
    totalWalkSeconds: 0,
    totalSeconds
  };
}

async function saveCustomerFromPanel() {
  const customer = customers.find((item) => item.id === selectedCustomerId);
  if (!customer) return;

  const payload = {
    ...customer,
    name: els.panelName.value.trim(),
    address: els.panelAddress.value.trim(),
    postalCode: els.panelPostalCode.value.trim(),
    city: els.panelCity.value.trim(),
    phone: els.panelPhone.value.trim(),
    email: els.panelEmail.value.trim(),
    note: els.panelNote.value.trim(),
    quote: collectQuoteFromPanel(),
    updatedAt: new Date().toISOString()
  };

  if (!payload.name) {
    showToast('Kunden skal have et navn.');
    return;
  }

  await put(CUSTOMER_STORE, payload);
  await refreshAll();
  openCustomerPanel(payload.id);
  showToast('Kunde opdateret.');
}

async function deleteSelectedCustomer() {
  const customer = customers.find((item) => item.id === selectedCustomerId);
  if (!customer) return;
  if (!confirm(`Slet kunden "${customer.name}"?`)) return;
  await remove(CUSTOMER_STORE, customer.id);
  closeCustomerPanel();
  await refreshAll();
  showToast('Kunde slettet.');
}

function loadSelectedCustomerIntoCalculator() {
  const customer = customers.find((item) => item.id === selectedCustomerId);
  if (!customer?.quote) {
    showToast('Kunden har ingen prisdata at indlæse.');
    return;
  }

  resetCalculatorInputs();
  if (els.interiorEnabled) {
    els.interiorEnabled.checked = Boolean(customer.quote.interior?.enabled);
  }
  customer.quote.items.forEach((item) => {
    const type = getRegularTypes().find((windowType) => windowType.name === item.name);
    if (!type) return;
    const input = document.querySelector(`[data-calc-id="${type.id}"]`);
    if (input) input.value = item.quantity;
  });

  switchView('calculatorView');
  closeCustomerPanel();
  calculatePrice();
  showToast('Kunde indlæst i beregneren.');
}

async function exportBackup() {
  try {
    const backup = {
      app: 'VinduesPuds Pro',
      formatVersion: 1,
      exportedAt: new Date().toISOString(),
      windowTypes: await getAll(TYPE_STORE),
      customers: await getAll(CUSTOMER_STORE)
    };

    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const safeTime = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
    link.href = url;
    link.download = `vinduespuds-pro-backup-${safeTime}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    showToast('Backup eksporteret.');
  } catch (error) {
    console.error(error);
    showToast('Kunne ikke eksportere backup.');
  }
}

async function handleImportFile(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  try {
    const raw = await file.text();
    const backup = JSON.parse(raw);

    if (!backup || !Array.isArray(backup.windowTypes) || !Array.isArray(backup.customers)) {
      throw new Error('Ugyldigt backupformat');
    }

    const ok = confirm('Import vil erstatte alle nuværende vinduestyper og kunder på denne enhed. Fortsæt?');
    if (!ok) {
      event.target.value = '';
      return;
    }

    await clearStore(TYPE_STORE);
    await clearStore(CUSTOMER_STORE);

    for (const type of backup.windowTypes) {
      await put(TYPE_STORE, type);
    }

    for (const customer of backup.customers) {
      await put(CUSTOMER_STORE, customer);
    }

    await ensureDefaultData();
    await refreshAll();
    resetCalculatorInputs();
    switchView('backupView');
    showToast('Backup importeret.');
  } catch (error) {
    console.error(error);
    showToast('Import fejlede. Tjek at filen er en gyldig backup.');
  } finally {
    event.target.value = '';
  }
}

function buildQuoteTotalsHtml(quote) {
  return `
    <span class="meta-pill fixed">Udvendig pris: ${formatCurrency(quote.exteriorTotalPrice ?? quote.totalPrice ?? 0)}</span>
    <span class="meta-pill fixed">Udvendig + indvendig pris: ${formatCurrency(quote.totalPrice || 0)}</span>
    <span class="meta-pill">Samlet tid: ${formatSeconds(quote.totalSeconds || 0)}</span>
    ${quote.interior?.enabled ? `<span class="meta-pill">Indvendig start: ${formatCurrency(quote.interior.price || 0)}</span>` : ''}
  `;
}

function formatSeconds(totalSeconds) {
  const seconds = Number(totalSeconds || 0);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;
  const parts = [];
  if (hours) parts.push(`${hours} t`);
  if (minutes) parts.push(`${minutes} min`);
  if (remainingSeconds || !parts.length) parts.push(`${remainingSeconds} sek`);
  return parts.join(' ');
}

function formatCurrency(value) {
  return new Intl.NumberFormat('da-DK', { style: 'currency', currency: 'DKK' }).format(Number(value || 0));
}

function toNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? Math.max(0, Math.round(num)) : 0;
}

function toMoney(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.max(0, Math.round(num * 100) / 100);
}

function showToast(message) {
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2200);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll('`', '&#96;');
}

async function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    try {
      await navigator.serviceWorker.register('./sw.js');
    } catch (error) {
      console.error('Service worker kunne ikke registreres:', error);
    }
  }
}
