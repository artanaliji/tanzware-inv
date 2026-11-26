"use strict";

const byId = (id) => document.getElementById(id);
const invoiceForm = byId("invoice-form");
const invoice = invoiceForm.elements;
const businessDialog = byId("business-dialog");
const businessForm = byId("business-form");
const businessFields = businessForm.elements;
const logoInput = businessFields.logo;
const paperLogo = byId("paper-logo");
const items = byId("item-list");
const profileKey = "invoice-studio.business.v1";
const labelsKey = "invoice-studio.labels.v1";
const templatesKey = "invoice-studio.templates.v1";
const labelLimit = 100;
const labelsDialog = byId("labels-dialog");
const labelsForm = byId("labels-form");
const labelSlots = Array.from(document.querySelectorAll("[data-invoice-label]"), (element) => {
  const nodes = Array.from(element.childNodes, (node) => node.cloneNode(true));
  const defaultText = nodes.map((node) => node.nodeName === "BR" ? "\n" : node.textContent).join("");
  return { element, nodes, defaultText, key: element.dataset.invoiceLabel };
});
const businessKeys = ["name", "address", "bank", "account", "email", "phone"];
const invoiceKeys = ["number", "date", "currency", "vat", "client", "clientAddress"];
const itemKeys = ["description", "quantity", "price"];
const transferFormat = "invoice-studio";
const transferLimit = 2 * 1024 * 1024;
const emptyBusiness = { ...Object.fromEntries(businessKeys.map((key) => [key, ""])), logo: "" };
const demoBusiness = {
  name: "Aster Design Studio",
  address: "12 Example Lane\n1000 Skopje, North Macedonia",
  bank: "Example Bank",
  account: "0000 0000 0000 0000",
  email: "hello@aster.example",
  phone: "+1 202 555 0147",
  logo: "./assets/aster-logo.png",
};
const demoItems = [
  { description: "Дизајн на веб-страница\nDizajn i faqes së internetit", quantity: "1", price: "24000" },
  { description: "Подготовка на графички материјали\nPërgatitje e materialeve grafike", quantity: "2", price: "3500" },
];
const emptyItem = { description: "", quantity: "1", price: "" };
const defaultVatRate = 18;
const currencyUnits = { MKD: "ден", EUR: "EUR", USD: "USD", GBP: "GBP", ALL: "ALL" };
const integerFormat = new Intl.NumberFormat("en-GB");

let savedBusiness = readBusiness();
let business = savedBusiness ?? { ...demoBusiness };
let showingDemo = !savedBusiness;
let dirty = false;
let draftLogo = "";
let logoRequest = 0;
let savedLabels = readLabels();
let customLabels = savedLabels ?? {};

function readLabels() {
  try {
    return normalizeLabels(JSON.parse(localStorage.getItem(labelsKey)));
  } catch {
    return null;
  }
}

function normalizeLabels(labels) {
  if (!labels || typeof labels !== "object" || Array.isArray(labels)) return null;
  const overrides = {};
  for (const { key, defaultText } of labelSlots) {
    if (!Object.hasOwn(labels, key)) continue;
    const value = labels[key];
    if (typeof value !== "string" || value.length > labelLimit) return null;
    if (value !== defaultText) overrides[key] = value;
  }
  return overrides;
}

function fillLabelEditor(overrides) {
  for (const { key, defaultText } of labelSlots) {
    labelsForm.elements[key].value = overrides[key] ?? defaultText;
  }
}

for (const { element, key } of labelSlots) {
  const label = document.createElement("label");
  const field = document.createElement("textarea");
  label.textContent = element.dataset.caption;
  field.name = key;
  field.rows = 2;
  field.maxLength = labelLimit;
  label.append(field);
  byId("label-fields").append(label);
}

byId("edit-labels").addEventListener("click", () => {
  fillLabelEditor(customLabels);
  labelsForm.elements.remember.checked = customLabels === savedLabels;
  byId("labels-storage-error").hidden = true;
  labelsDialog.showModal();
});

byId("close-labels").addEventListener("click", () => labelsDialog.close());
byId("reset-labels").addEventListener("click", () => fillLabelEditor({}));
labelsForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const wasSaved = customLabels === savedLabels;
  customLabels = normalizeLabels(Object.fromEntries(
    labelSlots.map(({ key }) => [key, labelsForm.elements[key].value.trim()]),
  )) ?? {};
  renderInvoice();
  try {
    if (labelsForm.elements.remember.checked) {
      localStorage.setItem(labelsKey, JSON.stringify(customLabels));
      savedLabels = customLabels;
    } else if (wasSaved) {
      localStorage.removeItem(labelsKey);
      savedLabels = null;
    }
  } catch {
    byId("labels-storage-error").hidden = false;
    return;
  }
  labelsDialog.close();
});

function renderLabels(vatRate) {
  for (const { element, nodes, key } of labelSlots) {
    if (Object.hasOwn(customLabels, key)) {
      const value = customLabels[key];
      element.textContent = key === "vat" ? value.replaceAll("{rate}", vatRate) : value;
      element.setAttribute("data-custom-label", "");
    } else if (element.hasAttribute("data-custom-label")) {
      element.replaceChildren(...nodes.map((node) => node.cloneNode(true)));
      element.removeAttribute("data-custom-label");
    }
  }
  const defaultVatLabel = byId("paper-vat-rate");
  if (defaultVatLabel) defaultVatLabel.textContent = vatRate;
}

function supportedLogo(logo) {
  return typeof logo === "string" && (
    logo === "" || logo === demoBusiness.logo || /^data:image\/png;base64,[A-Za-z0-9+/]+=*$/u.test(logo)
  );
}

function readBusiness() {
  try {
    const profile = JSON.parse(localStorage.getItem(profileKey));
    if (profile && typeof profile.name === "string" && profile.name.trim()) {
      const fields = Object.fromEntries(businessKeys.map((key) => [
        key, typeof profile[key] === "string" ? profile[key] : "",
      ]));
      const logo = supportedLogo(profile.logo) ? profile.logo : "";
      return { ...fields, logo };
    }
  } catch {
    // An invalid or unavailable stored profile should leave the editor usable.
  }
  return null;
}

function setText(id, value) {
  byId(id).textContent = value;
}

function setLogo(image, source) {
  if (source && image.getAttribute("src") !== source) image.src = source;
  if (!source) image.removeAttribute("src");
  image.hidden = !source;
}

function updateLogoEditor() {
  setLogo(byId("logo-thumbnail"), draftLogo);
  byId("logo-preview").hidden = !draftLogo;
}

function resetLogoInput() {
  logoRequest++;
  logoInput.value = "";
  byId("logo-error").hidden = true;
  byId("apply-business").disabled = false;
}

function logoCanvas(width, height, enlarge = false) {
  const scale = Math.min(enlarge ? Infinity : 1, 640 / width, 240 / height);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.ceil(width * scale));
  canvas.height = Math.max(1, Math.ceil(height * scale));
  return { canvas, scale };
}

async function readImageLogo(file) {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const { canvas } = logoCanvas(image.naturalWidth, image.naturalHeight);
    canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/png");
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function readPdfLogo(file) {
  const { getDocument, GlobalWorkerOptions } = await import("./vendor/pdfjs/pdf.min.mjs");
  GlobalWorkerOptions.workerSrc = new URL("./vendor/pdfjs/pdf.worker.min.mjs", document.baseURI).href;
  const loadingTask = getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
    disableWorkerRendering: true,
    useWasm: false,
  });
  try {
    const pdf = await loadingTask.promise;
    const page = await pdf.getPage(1);
    const { width, height } = page.getViewport({ scale: 1 });
    const { canvas, scale } = logoCanvas(width, height, true);
    await page.render({
      canvas,
      viewport: page.getViewport({ scale }),
      background: "#ffffff",
      annotationMode: 0,
    }).promise;
    return canvas.toDataURL("image/png");
  } finally {
    await loadingTask.destroy();
  }
}

logoInput.addEventListener("change", async () => {
  const file = logoInput.files[0];
  if (!file) return;
  const request = ++logoRequest;
  const error = byId("logo-error");
  error.hidden = true;
  const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
  const isImage = ["image/png", "image/jpeg", "image/webp"].includes(file.type) || /\.(png|jpe?g|webp)$/i.test(file.name);
  if ((!isPdf && !isImage) || file.size > 8 * 1024 * 1024) {
    error.textContent = "Choose a PNG, JPG, WebP, or PDF file up to 8 MB.";
    error.hidden = false;
    logoInput.value = "";
    byId("apply-business").disabled = false;
    return;
  }

  byId("apply-business").disabled = true;
  try {
    const logo = await (isPdf ? readPdfLogo(file) : readImageLogo(file));
    if (request !== logoRequest || !businessDialog.open) return;
    draftLogo = logo;
    updateLogoEditor();
  } catch {
    if (request !== logoRequest || !businessDialog.open) return;
    error.textContent = isPdf
      ? "This PDF could not be opened. Try an unlocked PDF or upload a PNG instead."
      : "This image could not be opened. Choose another logo.";
    error.hidden = false;
    logoInput.value = "";
  } finally {
    if (request === logoRequest) byId("apply-business").disabled = false;
  }
});

byId("remove-logo").addEventListener("click", () => {
  resetLogoInput();
  draftLogo = "";
  updateLogoEditor();
  logoInput.focus();
});

function localDate() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return [now.getFullYear(), month, day].join("-");
}

function scaledValue(input, scale) {
  if (!input.validity.valid || !Number.isFinite(input.valueAsNumber)) return 0n;
  return BigInt(Math.round(input.valueAsNumber * scale));
}

function money(cents, currency, unit = currencyUnits[currency]) {
  const whole = integerFormat.format(cents / 100n);
  const fraction = cents % 100n;
  const decimal = fraction || currency !== "MKD" ? "." + String(fraction).padStart(2, "0") : "";
  return whole + decimal + " " + unit;
}

function addItem(values = emptyItem) {
  const fragment = byId("line-item-template").content.cloneNode(true);
  Object.entries(values).forEach(([name, value]) => {
    const field = fragment.querySelector('[name="' + name + '"]');
    field.value = value;
    validateRequiredText(field);
  });
  items.append(fragment);
  return items.lastElementChild.querySelector("textarea");
}

function updateItemButtons() {
  items.querySelectorAll(".remove-item").forEach((button, index, buttons) => {
    button.disabled = buttons.length === 1;
    button.setAttribute("aria-label", "Remove line item " + (index + 1));
  });
}

function renderInvoice() {
  const name = business.name;
  const initials = name.split(/\s+/u).filter(Boolean).slice(0, 2)
    .map((word) => Array.from(word)[0]).join("").toLocaleUpperCase();
  const currency = invoice.currency.value;
  const calculateVat = invoice.autoVat.checked;
  byId("manual-vat-field").hidden = calculateVat;
  byId("calculated-vat-field").hidden = !calculateVat;
  invoice.manualVat.disabled = calculateVat;
  const vatRate = scaledValue(invoice.vat, 100);
  const rows = document.createDocumentFragment();
  let subtotal = 0n;

  for (const item of items.children) {
    const [description, quantity, price] = item.querySelectorAll("textarea, input");
    const unitPrice = scaledValue(price, 100);
    const amount = (scaledValue(quantity, 1000) * unitPrice + 500n) / 1000n;
    subtotal += amount;
    item.querySelector("output").value = money(amount, currency);

    const row = document.createElement("tr");
    const quantityText = quantity.validity.valid ? quantity.valueAsNumber.toLocaleString("en-GB", { maximumFractionDigits: 3 }) : "—";
    [quantityText, description.value.trim() || "—", price.value ? money(unitPrice, currency) : "—", money(amount, currency)]
      .forEach((value) => { row.insertCell().textContent = value; });
    rows.append(row);
  }

  const vat = calculateVat ? (subtotal * vatRate + 5000n) / 10000n : scaledValue(invoice.manualVat, 100);
  const formattedVat = money(vat, currency, currency);
  const total = money(subtotal + vat, currency);
  byId("paper-items").replaceChildren(rows);
  setText("editor-total", total);
  setText("editor-currency", currency);
  renderLabels(String(Number(vatRate) / 100));
  setText("paper-subtotal", money(subtotal, currency));
  setText("paper-vat", formattedVat);
  setText("calculated-vat", formattedVat);
  setText("paper-total", total);

  setText("active-business", name || "Add your business");
  const profileStatus = business === savedBusiness ? "Saved in this browser" : "Used for this session";
  setText("profile-status", showingDemo ? "Fictional example profile" : name ? profileStatus : "Add the details to show on your invoices.");
  setText("paper-business", name || "—");
  setText("paper-business-address", business.address);
  setLogo(paperLogo, business.logo);
  setText("paper-monogram", initials);
  byId("paper-monogram").hidden = Boolean(business.logo) || !initials;
  setText("paper-number", invoice.number.value.trim() || "—");
  setText("paper-date", invoice.date.value.split("-").reverse().join(".") || "—");
  setText("paper-client", invoice.client.value.trim() || "—");
  setText("paper-client-address", invoice.clientAddress.value.trim());
  setText("paper-bank", business.bank);
  setText("paper-account", business.account);
  setText("paper-contact", [business.email, business.phone].filter(Boolean).join(" | "));
  byId("bank-line").hidden = !business.bank;
  byId("account-line").hidden = !business.account;
  byId("paper-contact").hidden = !business.email && !business.phone;
}

function startInvoice(example = false) {
  invoice.number.setCustomValidity("");
  invoice.client.setCustomValidity("");
  invoice.number.value = example ? "DEMO-001" : "";
  invoice.date.value = localDate();
  invoice.currency.value = "MKD";
  invoice.autoVat.checked = false;
  invoice.vat.value = String(defaultVatRate);
  invoice.manualVat.value = "0";
  invoice.client.value = example ? "Juniper Works" : "";
  invoice.clientAddress.value = example ? "48 Sample Avenue\n1200 Tetovo, North Macedonia" : "";
  items.replaceChildren();
  (example ? demoItems : [emptyItem]).forEach(addItem);
  updateItemButtons();
  dirty = false;
  renderInvoice();
}

function openBusiness() {
  const fields = showingDemo ? emptyBusiness : business;
  resetLogoInput();
  draftLogo = fields.logo;
  updateLogoEditor();
  businessKeys.forEach((key) => { businessFields[key].value = fields[key]; });
  businessFields.name.setCustomValidity("");
  businessFields.remember.checked = Boolean(savedBusiness);
  byId("storage-error").hidden = true;
  businessDialog.showModal();
}

function fieldValues(fields, keys) {
  return Object.fromEntries(keys.map((key) => [key, fields[key].value]));
}

function matchesFields(record, keys) {
  return record && typeof record === "object" && keys.every((key) => typeof record[key] === "string");
}

function transferStatus(message, error = false) {
  setText("transfer-status", message);
  byId("transfer-status").classList.toggle("error", error);
}

function invoiceFilename() {
  return invoice.number.value.trim().replace(/[<>:"/\\|?*]/g, "-") || "draft";
}

function downloadFile(file, filename) {
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

const dataMenu = byId("data-menu");
const dataMenuSummary = dataMenu.querySelector("summary");

function closeDataMenu() {
  dataMenu.open = false;
  dataMenuSummary.focus();
}

document.addEventListener("click", (event) => {
  if (dataMenu.open && !dataMenu.contains(event.target)) dataMenu.open = false;
});

dataMenu.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && dataMenu.open) {
    event.preventDefault();
    closeDataMenu();
  }
});

function captureInvoiceData() {
  return {
    format: transferFormat,
    version: 1,
    business,
    labels: customLabels,
    invoice: {
      ...fieldValues(invoice, invoiceKeys),
      autoVat: invoice.autoVat.checked,
      manualVat: invoice.manualVat.value,
    },
    items: Array.from(items.children, (item) => Object.fromEntries(
      itemKeys.map((key) => [key, item.querySelector('[name="' + key + '"]').value]),
    )),
  };
}

function validateInvoiceData(data) {
  const labels = data?.labels === undefined ? {} : normalizeLabels(data.labels);
  if (data?.format !== transferFormat || data.version !== 1 ||
      !labels ||
      !matchesFields(data.business, businessKeys) || !supportedLogo(data.business.logo) ||
      !matchesFields(data.invoice, invoiceKeys) || typeof data.invoice.autoVat !== "boolean" ||
      (data.invoice.manualVat !== undefined && typeof data.invoice.manualVat !== "string") ||
      !Object.hasOwn(currencyUnits, data.invoice.currency) ||
      !Array.isArray(data.items) || !data.items.length || !data.items.every((item) => matchesFields(item, itemKeys))) {
    return null;
  }
  return { ...data, labels };
}

function applyInvoiceData(data, fromTemplate = false) {
  business = Object.fromEntries([...businessKeys, "logo"].map((key) => [key, data.business[key]]));
  customLabels = data.labels;
  showingDemo = false;
  invoiceKeys.forEach((key) => {
    invoice[key].value = data.invoice[key];
    validateRequiredText(invoice[key]);
  });
  if (fromTemplate) {
    invoice.number.value = "";
    invoice.number.setCustomValidity("");
    invoice.date.value = localDate();
  }
  invoice.autoVat.checked = data.invoice.autoVat;
  invoice.manualVat.value = data.invoice.manualVat ?? "0";
  items.replaceChildren();
  data.items.forEach((item) => addItem(Object.fromEntries(itemKeys.map((key) => [key, item[key]]))));
  updateItemButtons();
  dirty = !fromTemplate;
  renderInvoice();
}

byId("export-data").addEventListener("click", () => {
  closeDataMenu();
  const file = new Blob([JSON.stringify(captureInvoiceData(), null, 2)], { type: "application/json" });
  if (file.size > transferLimit) {
    transferStatus("This invoice is too large to export.", true);
    return;
  }
  downloadFile(file, "invoice-" + invoiceFilename() + ".json");
  transferStatus("Invoice data exported.");
});

const importInput = byId("import-file");
byId("import-data").addEventListener("click", () => {
  closeDataMenu();
  importInput.click();
});
importInput.addEventListener("change", async () => {
  const file = importInput.files[0];
  importInput.value = "";
  if (!file) return;
  byId("import-data").disabled = true;
  try {
    if (file.size > transferLimit) throw new Error("This file is too large to import.");
    const data = validateInvoiceData(JSON.parse(await file.text()));
    if (!data) throw new Error("Choose a JSON file exported from Invoice Studio.");
    if (data.business.logo) {
      const image = new Image();
      image.src = data.business.logo;
      await image.decode().catch(() => { throw new Error("The exported logo could not be opened."); });
    }
    if (dirty && !window.confirm("Replace the current invoice with the imported invoice?")) return;

    applyInvoiceData(data);
    transferStatus("Invoice data imported.");
  } catch (error) {
    transferStatus(error instanceof SyntaxError ? "Choose a JSON file exported from Invoice Studio." : error.message, true);
  } finally {
    byId("import-data").disabled = false;
  }
});

const templatesDialog = byId("templates-dialog");
const templateForm = byId("template-form");
const templateName = templateForm.elements.templateName;
const templateList = byId("template-list");

function readTemplates() {
  const stored = JSON.parse(localStorage.getItem(templatesKey) ?? "[]");
  if (!Array.isArray(stored)) throw new Error("Invalid templates");
  return stored;
}

function templateStatus(message, error = false) {
  const status = byId("template-status");
  status.textContent = message;
  status.classList.toggle("error", error);
  status.hidden = !message;
}

function templateButton(text, name, action) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "button secondary small";
  button.textContent = text;
  button.setAttribute("aria-label", text + " template " + name);
  button.addEventListener("click", action);
  return button;
}

function showTemplates() {
  try {
    const entries = readTemplates();
    templateList.replaceChildren(...entries.map(({ name, data }) => {
      const row = document.createElement("li");
      const title = document.createElement("span");
      title.textContent = name;
      const actions = document.createElement("div");
      actions.className = "template-actions";
      actions.append(
        templateButton("Use", name, () => useTemplate(name, data)),
        templateButton("Delete", name, () => deleteTemplate(name)),
      );
      row.append(title, actions);
      return row;
    }));
    byId("templates-empty").hidden = entries.length > 0;
  } catch {
    templateList.replaceChildren();
    byId("templates-empty").hidden = true;
    templateStatus("Saved templates could not be read in this browser.", true);
  }
}

function useTemplate(name, data) {
  const values = validateInvoiceData(data);
  if (!values) {
    templateStatus("This template could not be opened.", true);
    return;
  }
  if (dirty && !window.confirm("Replace the current invoice with this template?")) return;
  applyInvoiceData(values, true);
  templatesDialog.close();
  invoice.number.focus();
  transferStatus("Loaded template “" + name + "”.");
}

function deleteTemplate(name) {
  if (!window.confirm("Delete the template “" + name + "”?")) return;
  try {
    const entries = readTemplates().filter((entry) => entry.name !== name);
    localStorage.setItem(templatesKey, JSON.stringify(entries));
    templateStatus("Template deleted.");
    showTemplates();
    templateName.focus();
  } catch {
    templateStatus("This template could not be deleted.", true);
  }
}

byId("open-templates").addEventListener("click", () => {
  templateName.value = showingDemo ? "" : invoice.client.value.split("\n", 1)[0].trim().slice(0, 80);
  templateStatus("");
  showTemplates();
  templatesDialog.showModal();
});

byId("close-templates").addEventListener("click", () => templatesDialog.close());

templateForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const name = templateName.value.trim();
  if (!name) {
    templateStatus("Enter a name for the template.", true);
    templateName.focus();
    return;
  }
  try {
    const entries = readTemplates();
    const existing = entries.findIndex((entry) => entry.name.toLowerCase() === name.toLowerCase());
    if (existing >= 0 && !window.confirm("Replace the saved template “" + entries[existing].name + "”?")) return;
    const data = captureInvoiceData();
    data.invoice.number = "";
    data.invoice.date = "";
    if (existing >= 0) entries[existing] = { name, data };
    else entries.push({ name, data });
    localStorage.setItem(templatesKey, JSON.stringify(entries));
    templateStatus("Template saved.");
    showTemplates();
  } catch {
    templateStatus("This template could not be saved in this browser. You can still export the invoice as JSON.", true);
  }
});

byId("edit-business").addEventListener("click", openBusiness);
byId("close-business").addEventListener("click", () => businessDialog.close());
byId("cancel-business").addEventListener("click", () => businessDialog.close());

businessForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (byId("apply-business").disabled) return;
  const clearExample = showingDemo && !dirty;
  business = Object.fromEntries(businessKeys.map((key) => [key, businessFields[key].value.trim()]));
  business.logo = draftLogo;
  showingDemo = false;
  try {
    if (businessFields.remember.checked) {
      localStorage.setItem(profileKey, JSON.stringify(business));
      savedBusiness = business;
    } else if (savedBusiness) {
      localStorage.removeItem(profileKey);
      savedBusiness = null;
    }
  } catch {
    if (clearExample) startInvoice();
    else renderInvoice();
    byId("storage-error").hidden = false;
    businessFields.remember.checked = Boolean(savedBusiness);
    return;
  }
  if (clearExample) startInvoice();
  else renderInvoice();
  businessDialog.close();
});

byId("add-item").addEventListener("click", () => {
  dirty = true;
  addItem().focus();
  updateItemButtons();
  renderInvoice();
});

items.addEventListener("click", (event) => {
  const button = event.target.closest(".remove-item");
  if (!button || button.disabled) return;
  const item = button.closest(".line-item");
  const neighbor = item.nextElementSibling ?? item.previousElementSibling;
  item.remove();
  updateItemButtons();
  neighbor.querySelector("textarea").focus();
  dirty = true;
  renderInvoice();
});

byId("new-invoice").addEventListener("click", () => {
  if (dirty && !window.confirm("Start a new invoice and clear the current invoice fields?")) return;
  if (showingDemo) business = { ...emptyBusiness };
  showingDemo = false;
  startInvoice();
  invoice.number.focus();
});

function validateRequiredText(field) {
  if (field.required && (field.type === "text" || field.tagName === "TEXTAREA")) {
    field.setCustomValidity(field.value && !field.value.trim() ? "Enter a value." : "");
  }
}

document.addEventListener("input", (event) => {
  validateRequiredText(event.target);
  if (event.target.form === invoiceForm) {
    dirty = true;
    renderInvoice();
  }
});

function pdfData() {
  const fields = ["business", "business-address", "number", "date", "client", "client-address",
    "bank", "account", "subtotal", "vat", "total", "contact"];
  const values = Object.fromEntries(fields.map((key) => [key, byId("paper-" + key).textContent]));
  return {
    ...values,
    address: values["business-address"],
    clientAddress: values["client-address"],
    labels: Object.fromEntries(labelSlots.map(({ key, element }) => [key, element.innerText])),
    rows: Array.from(byId("paper-items").rows, (row) => Array.from(row.cells, (cell) => cell.textContent)),
    logo: business.logo ? paperLogo.src : "",
    initials: byId("paper-monogram").textContent,
  };
}

invoiceForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!business.name) {
    openBusiness();
    return;
  }

  const button = byId("save-pdf");
  if (button.disabled) return;
  const data = pdfData();
  const filename = "Invoice " + invoiceFilename() + ".pdf";
  button.disabled = true;
  button.textContent = "Saving…";
  transferStatus("");
  try {
    const { createInvoicePdf } = await import("./pdf-export.mjs?v=10");
    downloadFile(await createInvoicePdf(data), filename);
  } catch {
    const message = location.protocol === "file:"
      ? "Open the published site or use a local HTTP server to save a PDF."
      : "Could not save the invoice PDF. Try again.";
    transferStatus(message, true);
  } finally {
    button.textContent = "Save PDF";
    button.disabled = false;
  }
});

startInvoice(showingDemo);
