"use strict";

/**
 * PrintPrice - 3D Print Cost Calculator & Instant 3D Quoting Engine
 * Original code & base concept by @anadskman (https://github.com/anadskman)
 */

// =========================================================================
// GLOBAL STATE & CONSTANTS
// =========================================================================

const CURRENCY_SYMBOLS = {
    EUR: "€",
    USD: "$",
    GBP: "£",
    INR: "₹",
    CAD: "C$",
    AUD: "A$",
    JPY: "¥",
    CNY: "¥",
    CHF: "Fr"
};

const DEFAULT_SETTINGS = {
    currency: "EUR",
    whatsapp_business_phone: "",
    spool_price: 22,
    spool_weight: 1000,
    printer_power: 120,
    electricity_price: 0.35,
    printer_price: 300,
    printer_lifetime: 3000,
    labour_minutes: 15,
    hourly_rate: 12,
    failure_rate: 10,
    markup: 30
};

let activeSettings = { ...DEFAULT_SETTINGS };
let adminToken = sessionStorage.getItem("printprice-admin-token") || localStorage.getItem("printprice-admin-token");
let current3DMetrics = null;
let currentUploadedFile = null;
let currentCalculatedQuote = null;
let isServerOnline = false;

// =========================================================================
// INITIALIZATION
// =========================================================================

document.addEventListener("DOMContentLoaded", async () => {
    initTheme();
    initCurrency();
    initNavigation();
    initAdminSubTabs();
    initDropzone();
    init3DViewer();
    initCustomerQuoteEvents();
    initAdminEvents();
    initManualCalculator();

    // Check backend status & load settings
    await loadSettings();

    // If admin token exists, check session
    if (adminToken) {
        checkAdminSession();
    }
});

// Format Currency
function formatCurrency(amount, currency = activeSettings.currency) {
    const symbol = CURRENCY_SYMBOLS[currency] || "€";
    const val = Number(amount) || 0;
    return `${symbol}${val.toFixed(2)}`;
}

// Update all UI currency labels
function updateCurrencyUnits(curr = activeSettings.currency) {
    const symbol = CURRENCY_SYMBOLS[curr] || "€";
    document.querySelectorAll("[data-currency-unit]").forEach((el) => {
        el.textContent = symbol;
    });
    document.querySelectorAll("[data-electricity-unit]").forEach((el) => {
        el.textContent = `${symbol}/kWh`;
    });
    document.querySelectorAll("[data-hourly-unit]").forEach((el) => {
        el.textContent = `${symbol}/hr`;
    });
}

// Helper: Safely parse JSON from fetch response
async function safeFetchJson(url, options = {}) {
    try {
        const res = await fetch(url, options);
        const text = await res.text();
        try {
            const data = JSON.parse(text);
            return { ok: res.ok, status: res.status, data: data };
        } catch (e) {
            // Response was not JSON (e.g. 404 HTML from GitHub Pages)
            return { ok: false, status: res.status, isHtml: true, data: null };
        }
    } catch (networkErr) {
        return { ok: false, status: 0, networkError: true, data: null };
    }
}

// Load public settings (from Server or LocalStorage fallback)
async function loadSettings() {
    // Try Server API first
    const res = await safeFetchJson("/api/settings");
    if (res.ok && res.data && !res.isHtml) {
        isServerOnline = true;
        activeSettings = { ...activeSettings, ...res.data };
    } else {
        // Static Hosting / GitHub Pages fallback
        isServerOnline = false;
        const saved = localStorage.getItem("printprice-settings");
        if (saved) {
            try {
                activeSettings = { ...DEFAULT_SETTINGS, ...JSON.parse(saved) };
            } catch (e) {
                activeSettings = { ...DEFAULT_SETTINGS };
            }
        }
    }

    if (activeSettings.currency) {
        const currSelect = document.getElementById("currency");
        if (currSelect) currSelect.value = activeSettings.currency;
        updateCurrencyUnits(activeSettings.currency);
    }
    populateAdminSettingsForm();
    if (current3DMetrics) calculateCustomerQuote();
    calculateManual();
}

// =========================================================================
// NAVIGATION & THEME
// =========================================================================

function initTheme() {
    const themeBtn = document.getElementById("themeButton");
    const savedTheme = localStorage.getItem("printprice-theme") || "light";
    document.documentElement.setAttribute("data-theme", savedTheme);
    themeBtn.setAttribute("aria-pressed", savedTheme === "dark" ? "true" : "false");
    themeBtn.textContent = savedTheme === "dark" ? "Light Mode" : "Dark Mode";

    themeBtn.addEventListener("click", () => {
        const current = document.documentElement.getAttribute("data-theme");
        const next = current === "dark" ? "light" : "dark";
        document.documentElement.setAttribute("data-theme", next);
        localStorage.setItem("printprice-theme", next);
        themeBtn.setAttribute("aria-pressed", next === "dark" ? "true" : "false");
        themeBtn.textContent = next === "dark" ? "Light Mode" : "Dark Mode";
        if (window.MeshAnalyzer) {
            window.MeshAnalyzer.updateTheme(next === "dark");
        }
    });
}

function initCurrency() {
    const currencySelect = document.getElementById("currency");
    currencySelect.addEventListener("change", (e) => {
        activeSettings.currency = e.target.value;
        updateCurrencyUnits(e.target.value);
        if (current3DMetrics) calculateCustomerQuote();
        calculateManual();
    });
}

function initNavigation() {
    const tabCust = document.getElementById("tabCustomer");
    const tabAdmin = document.getElementById("tabAdmin");
    const custView = document.getElementById("customerView");
    const adminView = document.getElementById("adminView");

    tabCust.addEventListener("click", () => {
        tabCust.classList.add("active");
        tabAdmin.classList.remove("active");
        custView.classList.add("active");
        adminView.classList.remove("active");
    });

    tabAdmin.addEventListener("click", () => {
        tabAdmin.classList.add("active");
        tabCust.classList.remove("active");
        adminView.classList.add("active");
        custView.classList.remove("active");
    });
}

function initAdminSubTabs() {
    const subTabQuotes = document.getElementById("subTabQuotes");
    const subTabSettings = document.getElementById("subTabSettings");
    const subTabCalc = document.getElementById("subTabCalculator");

    const quotesView = document.getElementById("adminQuotesView");
    const settingsView = document.getElementById("adminSettingsView");
    const calcView = document.getElementById("adminCalculatorView");

    const tabs = [
        { btn: subTabQuotes, view: quotesView },
        { btn: subTabSettings, view: settingsView },
        { btn: subTabCalc, view: calcView }
    ];

    tabs.forEach(({ btn, view }) => {
        btn.addEventListener("click", () => {
            tabs.forEach((t) => {
                t.btn.classList.remove("active");
                t.view.classList.remove("active");
            });
            btn.classList.add("active");
            view.classList.add("active");

            if (btn === subTabQuotes) loadAdminQuotes();
            if (btn === subTabCalc) loadAdminHistory();
        });
    });
}

// =========================================================================
// 3D VIEWER & DROPZONE
// =========================================================================

function init3DViewer() {
    const container = document.getElementById("canvas3DContainer");
    if (window.MeshAnalyzer && container) {
        window.MeshAnalyzer.initViewer(container);
    }
}

function initDropzone() {
    const dropzone = document.getElementById("fileDropzone");
    const fileInput = document.getElementById("fileInput");
    const dropzoneLoaded = document.getElementById("dropzoneLoaded");
    const loadedFilename = document.getElementById("loadedFilename");
    const changeFileBtn = document.getElementById("changeFileBtn");

    ["dragenter", "dragover"].forEach((eventName) => {
        dropzone.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropzone.classList.add("dragover");
        });
    });

    ["dragleave", "drop"].forEach((eventName) => {
        dropzone.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropzone.classList.remove("dragover");
        });
    });

    dropzone.addEventListener("drop", (e) => {
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            handleFileSelect(e.dataTransfer.files[0]);
        }
    });

    fileInput.addEventListener("change", (e) => {
        if (e.target.files && e.target.files[0]) {
            handleFileSelect(e.target.files[0]);
        }
    });

    changeFileBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        fileInput.click();
    });
}

async function handleFileSelect(file) {
    const statusMsg = document.getElementById("quoteStatusMsg");
    statusMsg.textContent = "Analyzing 3D geometry...";
    statusMsg.style.color = "var(--text-soft)";

    try {
        const metrics = await window.MeshAnalyzer.analyzeFile(file);
        currentUploadedFile = file;
        current3DMetrics = metrics;

        // Update Dropzone UI
        document.querySelector(".dropzone-content").style.display = "none";
        const dropzoneLoaded = document.getElementById("dropzoneLoaded");
        dropzoneLoaded.style.display = "block";
        document.getElementById("loadedFilename").textContent = file.name;

        // Hide canvas placeholder
        const placeholder = document.getElementById("canvasPlaceholder");
        if (placeholder) placeholder.style.display = "none";

        // Update Specs Bar
        const specsBar = document.getElementById("meshSpecsBar");
        specsBar.style.display = "grid";
        document.getElementById("specDimensions").textContent = 
            `${metrics.dimensions.x} × ${metrics.dimensions.y} × ${metrics.dimensions.z} mm`;
        document.getElementById("specVolume").textContent = `${metrics.volumeCm3.toFixed(2)} cm³`;
        document.getElementById("modelTriangles").textContent = `${metrics.triangleCount.toLocaleString()} triangles`;

        statusMsg.textContent = "3D model loaded successfully!";
        statusMsg.style.color = "var(--accent)";

        calculateCustomerQuote();
    } catch (err) {
        console.error("Error analyzing 3D file:", err);
        statusMsg.textContent = `Error: ${err.message}`;
        statusMsg.style.color = "var(--error)";
    }
}

// =========================================================================
// CUSTOMER QUOTE CALCULATION & SUBMISSION
// =========================================================================

function initCustomerQuoteEvents() {
    const infillInput = document.getElementById("custInfill");
    const infillLabel = document.getElementById("infillLabel");
    const materialSelect = document.getElementById("custMaterial");
    const qtyInput = document.getElementById("custQuantity");
    const submitBtn = document.getElementById("submitQuoteBtn");

    infillInput.addEventListener("input", (e) => {
        infillLabel.textContent = `${e.target.value}%`;
        if (current3DMetrics) calculateCustomerQuote();
    });

    materialSelect.addEventListener("change", () => {
        if (current3DMetrics) calculateCustomerQuote();
    });

    qtyInput.addEventListener("input", () => {
        if (current3DMetrics) calculateCustomerQuote();
    });

    submitBtn.addEventListener("click", submitCustomerQuote);
}

function calculateCustomerQuote() {
    if (!current3DMetrics) return;

    const material = document.getElementById("custMaterial").value;
    const infill = parseInt(document.getElementById("custInfill").value, 10) || 20;
    const quantity = Math.max(1, parseInt(document.getElementById("custQuantity").value, 10) || 1);

    // 1. Estimate Weight & Time from 3D Mesh
    const est = window.MeshAnalyzer.estimatePrint(current3DMetrics, material, infill);

    // 2. Calculate Costs based on OWNER'S LOCKED PARAMETERS
    const weightGrams = est.weightGrams;
    const printHours = est.printTimeMinutes / 60;

    const filamentCostPerPrint = (weightGrams / activeSettings.spool_weight) * activeSettings.spool_price;
    const electricityCostPerPrint = printHours * (activeSettings.printer_power / 1000) * activeSettings.electricity_price;
    const wearCostPerPrint = printHours * (activeSettings.printer_price / activeSettings.printer_lifetime);
    const labourCostPerPrint = (activeSettings.labour_minutes / 60) * activeSettings.hourly_rate;

    const baseProductionCostPerPrint = filamentCostPerPrint + electricityCostPerPrint + wearCostPerPrint + labourCostPerPrint;
    const failureCostPerPrint = baseProductionCostPerPrint * (activeSettings.failure_rate / 100);
    const totalProductionCostPerPrint = baseProductionCostPerPrint + failureCostPerPrint;

    const sellingPricePerPrint = totalProductionCostPerPrint * (1 + activeSettings.markup / 100);
    const totalSellingPrice = sellingPricePerPrint * quantity;
    const totalCost = totalProductionCostPerPrint * quantity;

    currentCalculatedQuote = {
        weightGrams: weightGrams,
        printTimeMinutes: est.printTimeMinutes,
        formattedTime: est.formattedTime,
        costPerPrint: totalProductionCostPerPrint,
        pricePerPrint: sellingPricePerPrint,
        totalCost: totalCost,
        totalPrice: totalSellingPrice,
        quantity: quantity,
        material: material,
        infill: `${infill}%`
    };

    // Update UI
    document.getElementById("custQuotePrice").textContent = formatCurrency(totalSellingPrice);
    document.getElementById("custPerItemPrice").textContent = `${formatCurrency(sellingPricePerPrint)} each`;
    document.getElementById("custEstWeight").textContent = `~${weightGrams * quantity} g (${weightGrams}g/ea)`;
    document.getElementById("custEstTime").textContent = `~${est.formattedTime}`;
}

async function submitCustomerQuote() {
    const custName = document.getElementById("custName").value.trim();
    const custWhatsApp = document.getElementById("custWhatsApp").value.trim();
    const custNotes = document.getElementById("custNotes").value.trim();
    const statusMsg = document.getElementById("quoteStatusMsg");
    const submitBtn = document.getElementById("submitQuoteBtn");

    if (!custWhatsApp) {
        statusMsg.textContent = "Please enter your WhatsApp phone number to proceed.";
        statusMsg.style.color = "var(--error)";
        document.getElementById("custWhatsApp").focus();
        return;
    }

    if (!currentUploadedFile || !currentCalculatedQuote) {
        statusMsg.textContent = "Please upload a .OBJ or .STL 3D model first.";
        statusMsg.style.color = "var(--error)";
        return;
    }

    statusMsg.textContent = "Generating quote...";
    statusMsg.style.color = "var(--text-soft)";
    submitBtn.disabled = true;

    const quoteId = "Q-" + Date.now().toString(36).toUpperCase();
    const businessPhone = (activeSettings.whatsapp_business_phone || "").replace(/[^0-9]/g, "");

    // WhatsApp message with explicit disclaimers: delivery charges not included, weight is an estimate
    const waText = encodeURIComponent(
        `👋 Hello! I just requested a 3D print quote on PrintPrice.\n\n` +
        `📋 *Quote ID:* ${quoteId}\n` +
        `👤 *Name:* ${custName || "Customer"}\n` +
        `📦 *Model:* ${currentUploadedFile.name}\n` +
        `🧱 *Material:* ${currentCalculatedQuote.material} (${currentCalculatedQuote.infill} infill)\n` +
        `⚖️ *Est. Weight:* ~${currentCalculatedQuote.weightGrams * currentCalculatedQuote.quantity}g\n` +
        `⏱️ *Est. Print Time:* ~${currentCalculatedQuote.formattedTime}\n` +
        `🔢 *Quantity:* ${currentCalculatedQuote.quantity}\n` +
        `💰 *Estimated Price:* ${formatCurrency(currentCalculatedQuote.totalPrice)}\n\n` +
        `🚚 *Note:* Delivery charges not included.\n` +
        `⚖️ *Note:* Weight and print time are estimates.\n\n` +
        `Could you please review my print request? Thank you!`
    );

    const waLink = businessPhone ? `https://wa.me/${businessPhone}?text=${waText}` : `https://wa.me/?text=${waText}`;

    // Try submitting to backend API if available
    try {
        const formData = new FormData();
        formData.append("file", currentUploadedFile);
        formData.append("customer_name", custName || "Customer");
        formData.append("whatsapp", custWhatsApp);
        formData.append("material", currentCalculatedQuote.material);
        formData.append("infill", currentCalculatedQuote.infill);
        formData.append("dimensions_mm", `${current3DMetrics.dimensions.x}x${current3DMetrics.dimensions.y}x${current3DMetrics.dimensions.z}`);
        formData.append("volume_cm3", current3DMetrics.volumeCm3.toFixed(2));
        formData.append("weight_g", currentCalculatedQuote.weightGrams);
        formData.append("print_time_minutes", currentCalculatedQuote.printTimeMinutes);
        formData.append("quantity", currentCalculatedQuote.quantity);
        formData.append("total_cost", currentCalculatedQuote.totalCost.toFixed(2));
        formData.append("selling_price", currentCalculatedQuote.totalPrice.toFixed(2));
        formData.append("notes", custNotes);

        const res = await fetch("/api/quotes", {
            method: "POST",
            body: formData
        });

        if (res.ok) {
            const data = await res.json();
            statusMsg.textContent = `✅ Quote ${data.quote.id} created & saved to quotesdb.csv! Opening WhatsApp...`;
            statusMsg.style.color = "var(--accent)";
            window.open(data.whatsapp_url || waLink, "_blank");
            submitBtn.disabled = false;
            return;
        }
    } catch (e) {
        // Fallback to local storage below
    }

    // Static Hosting / LocalStorage fallback
    const quoteRecord = {
        id: quoteId,
        customer_name: custName || "Customer",
        whatsapp: custWhatsApp,
        file_name: currentUploadedFile.name,
        stored_file: "",
        material: currentCalculatedQuote.material,
        infill: currentCalculatedQuote.infill,
        dimensions_mm: `${current3DMetrics.dimensions.x}x${current3DMetrics.dimensions.y}x${current3DMetrics.dimensions.z}`,
        volume_cm3: current3DMetrics.volumeCm3.toFixed(2),
        weight_g: currentCalculatedQuote.weightGrams,
        print_time_minutes: currentCalculatedQuote.printTimeMinutes,
        quantity: currentCalculatedQuote.quantity,
        total_cost: currentCalculatedQuote.totalCost.toFixed(2),
        selling_price: currentCalculatedQuote.totalPrice.toFixed(2),
        status: "Pending",
        notes: custNotes,
        created_at: new Date().toISOString()
    };

    saveQuoteLocally(quoteRecord);
    statusMsg.textContent = `✅ Quote ${quoteId} created! Opening WhatsApp...`;
    statusMsg.style.color = "var(--accent)";
    window.open(waLink, "_blank");
    submitBtn.disabled = false;
}

function saveQuoteLocally(quote) {
    const raw = localStorage.getItem("printprice-quotes") || "[]";
    let list = [];
    try { list = JSON.parse(raw); } catch (e) { list = []; }
    list.unshift(quote);
    localStorage.setItem("printprice-quotes", JSON.stringify(list));
}

// =========================================================================
// ADMIN AUTHENTICATION & DASHBOARD (Universal Hybrid Engine)
// =========================================================================

function initAdminEvents() {
    const loginForm = document.getElementById("adminLoginForm");
    const logoutBtn = document.getElementById("adminLogoutBtn");
    const changePassBtn = document.getElementById("adminChangePassBtn");
    const saveSettingsBtn = document.getElementById("saveAdminSettingsBtn");
    const refreshQuotesBtn = document.getElementById("refreshQuotesBtn");
    const downloadQuotesBtn = document.getElementById("downloadQuotesCsvBtn");
    const downloadHistoryBtn = document.getElementById("downloadHistoryCsvBtn");

    loginForm.addEventListener("submit", handleAdminLogin);
    logoutBtn.addEventListener("click", handleAdminLogout);
    changePassBtn.addEventListener("click", handleAdminChangePassword);
    saveSettingsBtn.addEventListener("click", handleSaveAdminSettings);
    if (refreshQuotesBtn) refreshQuotesBtn.addEventListener("click", loadAdminQuotes);
    if (downloadQuotesBtn) downloadQuotesBtn.addEventListener("click", handleDownloadQuotesCsv);
    if (downloadHistoryBtn) downloadHistoryBtn.addEventListener("click", handleDownloadHistoryCsv);
}

async function handleAdminLogin(e) {
    e.preventDefault();
    const usernameInput = document.getElementById("adminUsername");
    const passwordInput = document.getElementById("adminPassword");
    const errorMsg = document.getElementById("authErrorMsg");

    errorMsg.textContent = "";

    const user = usernameInput.value.trim();
    const pass = passwordInput.value;

    // 1. Try Server API Login
    const res = await safeFetchJson("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: user, password: pass })
    });

    if (res.ok && res.data && res.data.success) {
        adminToken = res.data.token;
        sessionStorage.setItem("printprice-admin-token", adminToken);
        showAdminDashboard(res.data.user.username);
        loadAdminQuotes();
        loadAdminHistory();
        return;
    }

    // 2. Client-side / Static Fallback (GitHub Pages)
    const localPass = localStorage.getItem("printprice-admin-pass") || "admin123";
    if (user.toLowerCase() === "admin" && pass === localPass) {
        adminToken = "local-admin-token-" + Date.now();
        sessionStorage.setItem("printprice-admin-token", adminToken);
        showAdminDashboard("admin");
        loadAdminQuotes();
        loadAdminHistory();
    } else {
        errorMsg.textContent = (res.data && res.data.error) ? res.data.error : "Invalid credentials. (Default: admin / admin123)";
    }
}

async function checkAdminSession() {
    if (adminToken.startsWith("local-admin-token-")) {
        showAdminDashboard("admin");
        loadAdminQuotes();
        loadAdminHistory();
        return;
    }

    const res = await safeFetchJson("/api/admin/check", {
        headers: { Authorization: `Bearer ${adminToken}` }
    });

    if (res.ok && res.data && res.data.valid) {
        showAdminDashboard(res.data.user.username);
        loadAdminQuotes();
        loadAdminHistory();
    } else {
        handleAdminLogout();
    }
}

function showAdminDashboard(username) {
    document.getElementById("adminAuthCard").style.display = "none";
    document.getElementById("adminDashboard").style.display = "block";
    document.getElementById("adminUserDisplay").textContent = username || "admin";
    populateAdminSettingsForm();
}

function handleAdminLogout() {
    adminToken = null;
    sessionStorage.removeItem("printprice-admin-token");
    localStorage.removeItem("printprice-admin-token");
    document.getElementById("adminAuthCard").style.display = "block";
    document.getElementById("adminDashboard").style.display = "none";
}

async function handleAdminChangePassword() {
    const newPass = prompt("Enter new admin password (minimum 4 characters):");
    if (!newPass) return;
    if (newPass.length < 4) {
        alert("Password must be at least 4 characters.");
        return;
    }

    // Try server update
    if (adminToken && !adminToken.startsWith("local-admin-token-")) {
        const res = await safeFetchJson("/api/admin/change-password", {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${adminToken}`
            },
            body: JSON.stringify({ newPassword: newPass })
        });
        if (res.ok) {
            alert("Password successfully updated in accountsdb.csv!");
            return;
        }
    }

    // LocalStorage fallback
    localStorage.setItem("printprice-admin-pass", newPass);
    alert("Admin password updated successfully!");
}

function populateAdminSettingsForm() {
    document.getElementById("adminCurrency").value = activeSettings.currency || "EUR";
    document.getElementById("adminWhatsAppBusiness").value = activeSettings.whatsapp_business_phone || "";
    document.getElementById("adminSpoolPrice").value = activeSettings.spool_price;
    document.getElementById("adminSpoolWeight").value = activeSettings.spool_weight;
    document.getElementById("adminPrinterPower").value = activeSettings.printer_power;
    document.getElementById("adminElectricityPrice").value = activeSettings.electricity_price;
    document.getElementById("adminPrinterPrice").value = activeSettings.printer_price;
    document.getElementById("adminPrinterLifetime").value = activeSettings.printer_lifetime;
    document.getElementById("adminLabourMinutes").value = activeSettings.labour_minutes;
    document.getElementById("adminHourlyRate").value = activeSettings.hourly_rate;
    document.getElementById("adminFailureRate").value = activeSettings.failure_rate;
    document.getElementById("adminMarkup").value = activeSettings.markup;
}

async function handleSaveAdminSettings() {
    const statusMsg = document.getElementById("adminSettingsStatus");
    statusMsg.textContent = "Saving parameters...";
    statusMsg.style.color = "var(--text-soft)";

    const payload = {
        currency: document.getElementById("adminCurrency").value,
        whatsapp_business_phone: document.getElementById("adminWhatsAppBusiness").value.trim(),
        spool_price: parseFloat(document.getElementById("adminSpoolPrice").value) || 22,
        spool_weight: parseFloat(document.getElementById("adminSpoolWeight").value) || 1000,
        printer_power: parseFloat(document.getElementById("adminPrinterPower").value) || 120,
        electricity_price: parseFloat(document.getElementById("adminElectricityPrice").value) || 0.35,
        printer_price: parseFloat(document.getElementById("adminPrinterPrice").value) || 300,
        printer_lifetime: parseFloat(document.getElementById("adminPrinterLifetime").value) || 3000,
        labour_minutes: parseFloat(document.getElementById("adminLabourMinutes").value) || 15,
        hourly_rate: parseFloat(document.getElementById("adminHourlyRate").value) || 12,
        failure_rate: parseFloat(document.getElementById("adminFailureRate").value) || 10,
        markup: parseFloat(document.getElementById("adminMarkup").value) || 30
    };

    activeSettings = { ...activeSettings, ...payload };
    localStorage.setItem("printprice-settings", JSON.stringify(activeSettings));
    updateCurrencyUnits(activeSettings.currency);

    // Try server update
    if (adminToken && !adminToken.startsWith("local-admin-token-")) {
        await safeFetchJson("/api/admin/settings", {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${adminToken}`
            },
            body: JSON.stringify(payload)
        });
    }

    statusMsg.textContent = "✅ Parameters successfully saved and applied to all quotes!";
    statusMsg.style.color = "var(--accent)";

    if (current3DMetrics) calculateCustomerQuote();
    calculateManual();
}

// Load quotes for Admin Table
async function loadAdminQuotes() {
    const tbody = document.getElementById("quotesTableBody");
    tbody.innerHTML = `<tr><td colspan="10" class="table-empty">Loading customer quotes...</td></tr>`;

    let quotes = [];

    // Try server quotes
    if (adminToken && !adminToken.startsWith("local-admin-token-")) {
        const res = await safeFetchJson("/api/admin/quotes", {
            headers: { Authorization: `Bearer ${adminToken}` }
        });
        if (res.ok && res.data && res.data.quotes) {
            quotes = res.data.quotes;
        }
    }

    // Fallback to local storage
    if (quotes.length === 0) {
        try {
            quotes = JSON.parse(localStorage.getItem("printprice-quotes") || "[]");
        } catch (e) {
            quotes = [];
        }
    }

    if (quotes.length === 0) {
        tbody.innerHTML = `<tr><td colspan="10" class="table-empty">No customer quotes found in quotesdb.csv yet.</td></tr>`;
        return;
    }

    tbody.innerHTML = "";
    quotes.forEach((q) => {
        const tr = document.createElement("tr");
        const hours = Math.floor(Number(q.print_time_minutes || 0) / 60);
        const mins = Number(q.print_time_minutes || 0) % 60;
        const timeStr = `${hours}h ${mins}m`;
        const dateStr = q.created_at ? new Date(q.created_at).toLocaleDateString() : "-";
        const cleanPhone = (q.whatsapp || "").replace(/[^0-9+]/g, "");

        tr.innerHTML = `
            <td><strong>${escapeHtml(q.id)}</strong></td>
            <td><small>${dateStr}</small></td>
            <td>${escapeHtml(q.customer_name)}</td>
            <td>
                <a class="wa-link" href="https://wa.me/${cleanPhone.replace("+", "")}" target="_blank" title="Chat on WhatsApp">
                    <span>💬 ${escapeHtml(q.whatsapp)}</span>
                </a>
            </td>
            <td>
                ${q.stored_file ? `
                    <a class="download-link" href="/api/uploads/${encodeURIComponent(q.stored_file)}" download title="Download 3D Model">
                        <span>📦 ${escapeHtml(q.file_name)}</span>
                    </a>
                ` : `<span>📦 ${escapeHtml(q.file_name)}</span>`}
            </td>
            <td>${escapeHtml(q.material)} (${escapeHtml(q.infill)})</td>
            <td>~${escapeHtml(q.weight_g)}g &bull; ~${timeStr}</td>
            <td><strong>${formatCurrency(q.selling_price)}</strong></td>
            <td>
                <select class="status-select" data-quote-id="${q.id}">
                    <option value="Pending" ${q.status === "Pending" ? "selected" : ""}>Pending</option>
                    <option value="Approved" ${q.status === "Approved" ? "selected" : ""}>Approved</option>
                    <option value="Printing" ${q.status === "Printing" ? "selected" : ""}>Printing</option>
                    <option value="Completed" ${q.status === "Completed" ? "selected" : ""}>Completed</option>
                    <option value="Rejected" ${q.status === "Rejected" ? "selected" : ""}>Rejected</option>
                </select>
            </td>
            <td>
                <button class="action-btn-danger" data-delete-id="${q.id}" type="button" title="Delete record">🗑️ Delete</button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    tbody.querySelectorAll(".status-select").forEach((sel) => {
        sel.addEventListener("change", async (e) => {
            const quoteId = e.target.dataset.quoteId;
            const newStatus = e.target.value;
            await updateQuoteStatus(quoteId, newStatus);
        });
    });

    tbody.querySelectorAll("[data-delete-id]").forEach((btn) => {
        btn.addEventListener("click", async (e) => {
            const quoteId = e.currentTarget.dataset.deleteId;
            if (confirm(`Delete quote ${quoteId}?`)) {
                await deleteQuote(quoteId);
            }
        });
    });
}

async function updateQuoteStatus(id, status) {
    if (adminToken && !adminToken.startsWith("local-admin-token-")) {
        await safeFetchJson(`/api/admin/quotes/${id}`, {
            method: "PATCH",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${adminToken}`
            },
            body: JSON.stringify({ status })
        });
    }

    // Also update local storage
    try {
        let list = JSON.parse(localStorage.getItem("printprice-quotes") || "[]");
        const idx = list.findIndex((q) => q.id === id);
        if (idx !== -1) {
            list[idx].status = status;
            localStorage.setItem("printprice-quotes", JSON.stringify(list));
        }
    } catch (e) {}
}

async function deleteQuote(id) {
    if (adminToken && !adminToken.startsWith("local-admin-token-")) {
        await safeFetchJson(`/api/admin/quotes/${id}`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${adminToken}` }
        });
    }

    try {
        let list = JSON.parse(localStorage.getItem("printprice-quotes") || "[]");
        list = list.filter((q) => q.id !== id);
        localStorage.setItem("printprice-quotes", JSON.stringify(list));
    } catch (e) {}

    loadAdminQuotes();
}

function handleDownloadQuotesCsv(e) {
    // If backend is running, default link href works
    if (isServerOnline) return;

    // Static / Local fallback
    e.preventDefault();
    const quotes = JSON.parse(localStorage.getItem("printprice-quotes") || "[]");
    const headers = [
        "id", "customer_name", "whatsapp", "file_name", "material", "infill",
        "dimensions_mm", "volume_cm3", "weight_g", "print_time_minutes",
        "quantity", "total_cost", "selling_price", "status", "notes", "created_at"
    ];

    const csvRows = [headers.join(",")];
    quotes.forEach((q) => {
        const row = headers.map((h) => `"${String(q[h] || "").replace(/"/g, '""')}"`);
        csvRows.push(row.join(","));
    });

    const blob = new Blob([csvRows.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "quotesdb.csv";
    a.click();
    URL.revokeObjectURL(url);
}

function handleDownloadHistoryCsv(e) {
    if (isServerOnline) return;

    e.preventDefault();
    const history = JSON.parse(localStorage.getItem("printprice-history") || "[]");
    const headers = [
        "id", "print_name", "material", "weight", "hours", "minutes", "quantity",
        "spool_price", "spool_weight", "printer_power", "electricity_price",
        "printer_price", "printer_lifetime", "labour_minutes", "hourly_rate",
        "failure_rate", "markup", "total_cost", "selling_price", "profit", "created_at"
    ];

    const csvRows = [headers.join(",")];
    history.forEach((h) => {
        const row = headers.map((k) => `"${String(h[k] || "").replace(/"/g, '""')}"`);
        csvRows.push(row.join(","));
    });

    const blob = new Blob([csvRows.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "historydb.csv";
    a.click();
    URL.revokeObjectURL(url);
}

function escapeHtml(str) {
    if (!str) return "";
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// =========================================================================
// MANUAL CALCULATOR & HISTORY (`historydb.csv`)
// =========================================================================

function initManualCalculator() {
    const calc = document.getElementById("calculator");
    const saveHistoryBtn = document.getElementById("saveToHistoryBtn");
    const resetBtn = document.getElementById("resetButton");
    const clearHistoryBtn = document.getElementById("clearHistoryButton");

    calc.addEventListener("input", calculateManual);
    resetBtn.addEventListener("click", () => {
        populateManualDefaults();
        calculateManual();
    });

    saveHistoryBtn.addEventListener("click", saveManualToHistory);
    clearHistoryBtn.addEventListener("click", clearManualHistory);

    populateManualDefaults();
    calculateManual();
}

function populateManualDefaults() {
    document.getElementById("weight").value = 85;
    document.getElementById("hours").value = 4;
    document.getElementById("minutes").value = 30;
    document.getElementById("quantity").value = 1;
    document.getElementById("spoolPrice").value = activeSettings.spool_price;
    document.getElementById("spoolWeight").value = activeSettings.spool_weight;
    document.getElementById("printerPower").value = activeSettings.printer_power;
    document.getElementById("electricityPrice").value = activeSettings.electricity_price;
    document.getElementById("printerPrice").value = activeSettings.printer_price;
    document.getElementById("printerLifetime").value = activeSettings.printer_lifetime;
    document.getElementById("labourMinutes").value = activeSettings.labour_minutes;
    document.getElementById("hourlyRate").value = activeSettings.hourly_rate;
    document.getElementById("failureRate").value = activeSettings.failure_rate;
    document.getElementById("markup").value = activeSettings.markup;
}

function calculateManual() {
    const weight = parseFloat(document.getElementById("weight").value) || 0;
    const hours = parseFloat(document.getElementById("hours").value) || 0;
    const minutes = parseFloat(document.getElementById("minutes").value) || 0;
    const quantity = Math.max(1, parseFloat(document.getElementById("quantity").value) || 1);

    const spoolPrice = parseFloat(document.getElementById("spoolPrice").value) || 0;
    const spoolWeight = parseFloat(document.getElementById("spoolWeight").value) || 1000;
    const printerPower = parseFloat(document.getElementById("printerPower").value) || 0;
    const electricityPrice = parseFloat(document.getElementById("electricityPrice").value) || 0;
    const printerPrice = parseFloat(document.getElementById("printerPrice").value) || 0;
    const printerLifetime = parseFloat(document.getElementById("printerLifetime").value) || 1;
    const labourMinutes = parseFloat(document.getElementById("labourMinutes").value) || 0;
    const hourlyRate = parseFloat(document.getElementById("hourlyRate").value) || 0;
    const failureRate = parseFloat(document.getElementById("failureRate").value) || 0;
    const markup = parseFloat(document.getElementById("markup").value) || 0;

    const totalPrintHours = hours + minutes / 60;

    // Costs per print
    const filament = (weight / spoolWeight) * spoolPrice;
    const electricity = totalPrintHours * (printerPower / 1000) * electricityPrice;
    const wear = totalPrintHours * (printerPrice / printerLifetime);
    const labour = (labourMinutes / 60) * hourlyRate;

    const baseCost = filament + electricity + wear + labour;
    const failure = baseCost * (failureRate / 100);
    const productionCost = baseCost + failure;
    const sellingPrice = productionCost * (1 + markup / 100);
    const profit = sellingPrice - productionCost;

    // Total for batch
    const totalSelling = sellingPrice * quantity;
    const totalProdCost = productionCost * quantity;
    const totalProfit = profit * quantity;

    document.getElementById("totalPrice").textContent = formatCurrency(totalSelling);
    document.getElementById("perPrintPrice").textContent = `${formatCurrency(sellingPrice)} each`;
    document.getElementById("totalCost").textContent = formatCurrency(totalProdCost);
    document.getElementById("profit").textContent = formatCurrency(totalProfit);

    document.getElementById("filamentCost").textContent = formatCurrency(filament * quantity);
    document.getElementById("electricityCost").textContent = formatCurrency(electricity * quantity);
    document.getElementById("wearCost").textContent = formatCurrency(wear * quantity);
    document.getElementById("labourCost").textContent = formatCurrency(labour * quantity);
    document.getElementById("failureCost").textContent = formatCurrency(failure * quantity);

    const maxCost = totalProdCost || 1;
    document.getElementById("filamentBar").value = ((filament * quantity) / maxCost) * 100;
    document.getElementById("electricityBar").value = ((electricity * quantity) / maxCost) * 100;
    document.getElementById("wearBar").value = ((wear * quantity) / maxCost) * 100;
    document.getElementById("labourBar").value = ((labour * quantity) / maxCost) * 100;
    document.getElementById("failureBar").value = ((failure * quantity) / maxCost) * 100;
}

async function saveManualToHistory() {
    const statusEl = document.getElementById("calcStatusMessage");
    const payload = {
        id: "H-" + Date.now().toString(36).toUpperCase(),
        print_name: document.getElementById("printName").value || "Custom Print",
        material: document.getElementById("material").value,
        weight: document.getElementById("weight").value,
        hours: document.getElementById("hours").value,
        minutes: document.getElementById("minutes").value,
        quantity: document.getElementById("quantity").value,
        spool_price: document.getElementById("spoolPrice").value,
        spool_weight: document.getElementById("spoolWeight").value,
        printer_power: document.getElementById("printerPower").value,
        electricity_price: document.getElementById("electricityPrice").value,
        printer_price: document.getElementById("printerPrice").value,
        printer_lifetime: document.getElementById("printerLifetime").value,
        labour_minutes: document.getElementById("labourMinutes").value,
        hourly_rate: document.getElementById("hourlyRate").value,
        failure_rate: document.getElementById("failureRate").value,
        markup: document.getElementById("markup").value,
        total_cost: document.getElementById("totalCost").textContent.replace(/[^0-9.]/g, ""),
        selling_price: document.getElementById("totalPrice").textContent.replace(/[^0-9.]/g, ""),
        profit: document.getElementById("profit").textContent.replace(/[^0-9.]/g, ""),
        created_at: new Date().toISOString()
    };

    // Save locally
    try {
        let history = JSON.parse(localStorage.getItem("printprice-history") || "[]");
        history.unshift(payload);
        localStorage.setItem("printprice-history", JSON.stringify(history));
    } catch (e) {}

    // Save to server if available
    if (adminToken && !adminToken.startsWith("local-admin-token-")) {
        await safeFetchJson("/api/admin/history", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${adminToken}`
            },
            body: JSON.stringify(payload)
        });
    }

    statusEl.textContent = "✅ Saved to calculation history!";
    statusEl.style.color = "var(--accent)";
    loadAdminHistory();
}

async function loadAdminHistory() {
    const list = document.getElementById("historyList");
    if (!list) return;

    let history = [];

    // Try server history
    if (adminToken && !adminToken.startsWith("local-admin-token-")) {
        const res = await safeFetchJson("/api/admin/history", {
            headers: { Authorization: `Bearer ${adminToken}` }
        });
        if (res.ok && res.data && res.data.history) {
            history = res.data.history;
        }
    }

    if (history.length === 0) {
        try {
            history = JSON.parse(localStorage.getItem("printprice-history") || "[]");
        } catch (e) {
            history = [];
        }
    }

    if (history.length === 0) {
        list.innerHTML = `<p class="history-empty">No calculations in history yet.</p>`;
        return;
    }

    list.innerHTML = "";
    history.forEach((h) => {
        const div = document.createElement("div");
        div.className = "history-item";
        div.innerHTML = `
            <div>
                <strong>${escapeHtml(h.print_name)}</strong> &bull; ${escapeHtml(h.material)} (${h.weight}g)
                <br>
                <small>${h.hours}h ${h.minutes}m &bull; ${h.quantity} item(s) &bull; ${new Date(h.created_at).toLocaleDateString()}</small>
            </div>
            <div>
                <strong>${formatCurrency(h.selling_price)}</strong>
            </div>
        `;
        list.appendChild(div);
    });
}

async function clearManualHistory() {
    if (!confirm("Are you sure you want to clear history?")) return;
    localStorage.removeItem("printprice-history");
    if (adminToken && !adminToken.startsWith("local-admin-token-")) {
        await safeFetchJson("/api/admin/history/all", {
            method: "DELETE",
            headers: { Authorization: `Bearer ${adminToken}` }
        });
    }
    loadAdminHistory();
}