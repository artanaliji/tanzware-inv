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
const currencyUnits = { MKD: "ден", EUR: "EUR", USD: "USD", GBP: "GBP", ALL: "ALL" };
const integerFormat = new Intl.NumberFormat("en-GB");

let savedBusiness = readBusiness();
let business = savedBusiness ?? { ...demoBusiness };
let showingDemo = !savedBusiness;
let dirty = false;
let draftLogo = "";
let logoRequest = 0;

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

logoInput.addEventListener("change", async () => {
  const file = logoInput.files[0];
  if (!file) return;
  const request = ++logoRequest;
  const error = byId("logo-error");
  error.hidden = true;
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 8 * 1024 * 1024) {
    error.textContent = "Choose a PNG, JPG, or WebP image up to 8 MB.";
    error.hidden = false;
    logoInput.value = "";
    byId("apply-business").disabled = false;
    return;
  }

  byId("apply-business").disabled = true;
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    if (request !== logoRequest || !businessDialog.open) return;

    const scale = Math.min(1, 640 / image.naturalWidth, 240 / image.naturalHeight);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
    draftLogo = canvas.toDataURL("image/png");
    updateLogoEditor();
  } catch {
    if (request !== logoRequest || !businessDialog.open) return;
    error.textContent = "This image could not be opened. Choose another logo.";
    error.hidden = false;
    logoInput.value = "";
  } finally {
    URL.revokeObjectURL(url);
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

function money(cents, currency) {
  const whole = integerFormat.format(cents / 100n);
  const fraction = cents % 100n;
  const decimal = fraction || currency !== "MKD" ? "." + String(fraction).padStart(2, "0") : "";
  return whole + decimal + " " + currencyUnits[currency];
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
  byId("vat-rate").hidden = !calculateVat;
  invoice.vat.disabled = !calculateVat;
  const vatRate = calculateVat ? scaledValue(invoice.vat, 100) : 0n;
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

  const vat = (subtotal * vatRate + 5000n) / 10000n;
  const total = money(subtotal + vat, currency);
  byId("paper-items").replaceChildren(rows);
  setText("editor-total", total);
  setText("editor-currency", currency);
  setText("paper-vat-rate", String(Number(vatRate) / 100));
  setText("paper-subtotal", money(subtotal, currency));
  setText("paper-vat", money(vat, currency));
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
  invoice.date.value = example ? "2025-04-03" : localDate();
  invoice.currency.value = "MKD";
  invoice.autoVat.checked = false;
  invoice.vat.value = "18";
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

byId("export-data").addEventListener("click", () => {
  const data = {
    format: transferFormat,
    version: 1,
    business,
    invoice: { ...fieldValues(invoice, invoiceKeys), autoVat: invoice.autoVat.checked },
    items: Array.from(items.children, (item) => Object.fromEntries(
      itemKeys.map((key) => [key, item.querySelector('[name="' + key + '"]').value]),
    )),
  };
  const file = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  if (file.size > transferLimit) {
    transferStatus("This invoice is too large to export.", true);
    return;
  }
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = "invoice-" + invoiceFilename() + ".json";
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  transferStatus("Invoice data exported.");
});

const importInput = byId("import-file");
byId("import-data").addEventListener("click", () => importInput.click());
importInput.addEventListener("change", async () => {
  const file = importInput.files[0];
  importInput.value = "";
  if (!file) return;
  byId("import-data").disabled = true;
  try {
    if (file.size > transferLimit) throw new Error("This file is too large to import.");
    const data = JSON.parse(await file.text());
    if (data?.format !== transferFormat || data.version !== 1 ||
        !matchesFields(data.business, businessKeys) || !supportedLogo(data.business.logo) ||
        !matchesFields(data.invoice, invoiceKeys) || typeof data.invoice.autoVat !== "boolean" ||
        !Object.hasOwn(currencyUnits, data.invoice.currency) ||
        !Array.isArray(data.items) || !data.items.length || !data.items.every((item) => matchesFields(item, itemKeys))) {
      throw new Error("Choose a JSON file exported from Invoice Studio.");
    }
    if (data.business.logo) {
      const image = new Image();
      image.src = data.business.logo;
      await image.decode().catch(() => { throw new Error("The exported logo could not be opened."); });
    }
    if (dirty && !window.confirm("Replace the current invoice with the imported invoice?")) return;

    business = Object.fromEntries([...businessKeys, "logo"].map((key) => [key, data.business[key]]));
    showingDemo = false;
    invoiceKeys.forEach((key) => {
      invoice[key].value = data.invoice[key];
      validateRequiredText(invoice[key]);
    });
    invoice.autoVat.checked = data.invoice.autoVat;
    items.replaceChildren();
    data.items.forEach((item) => addItem(Object.fromEntries(itemKeys.map((key) => [key, item[key]]))));
    updateItemButtons();
    dirty = true;
    renderInvoice();
    transferStatus("Invoice data imported.");
  } catch (error) {
    transferStatus(error instanceof SyntaxError ? "Choose a JSON file exported from Invoice Studio." : error.message, true);
  } finally {
    byId("import-data").disabled = false;
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

invoiceForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!business.name) {
    openBusiness();
    return;
  }

  if (business.logo && !paperLogo.complete) await paperLogo.decode().catch(() => {});
  const title = document.title;
  document.title = "Invoice " + invoiceFilename();
  window.addEventListener("afterprint", () => { document.title = title; }, { once: true });
  window.print();
});

startInvoice(showingDemo);
