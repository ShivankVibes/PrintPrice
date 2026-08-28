"use strict";

/**
 * PrintPrice - 3D Print Cost Calculator & Instant 3D Quoting Engine
 * Original code & base concept by @anadskman (https://github.com/anadskman)
 */
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

const CURRENCY_LOCALES = {
    EUR: "en-IE",
    USD: "en-US",
    GBP: "en-GB",
    INR: "en-IN",
    CAD: "en-CA",
    AUD: "en-AU",
    JPY: "ja-JP",
    CNY: "zh-CN",
    CHF: "de-CH"
};

let activeSettings = {
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

let adminToken = sessionStorage.getItem("printprice-admin-token") || localStorage.getItem("printprice-admin-token");
let current3DMetrics = null;
let currentUploadedFile = null;
let currentCalculatedQuote = null;

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

    // Fetch live settings from server
    await loadSettings();

    // If admin token exists, check and load dashboard
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

// Load public settings from backend
async function loadSettings() {
    try {
        const res = await fetch("/api/settings");
        if (res.ok) {
            const data = await res.json();
            activeSettings = { ...activeSettings, ...data };
            if (data.currency) {
                const currSelect = document.getElementById("currency");
                if (currSelect) currSelect.value = data.currency;
                updateCurrencyUnits(data.currency);
            }
            // Populate admin settings form if in view
            populateAdminSettingsForm();
            // Recalculate customer quote if model loaded
            if (current3DMetrics) {
                calculateCustomerQuote();
            }
            // Recalculate manual calculator
            calculateManual();
        }
    } catch (err) {
        console.error("Could not fetch settings from server:", err);
    }
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
    const dropzoneContent = dropzone.querySelector(".dropzone-content");
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
    document.getElementById("custEstWeight").textContent = `${weightGrams * quantity} g (${weightGrams}g/ea)`;
    document.getElementById("custEstTime").textContent = est.formattedTime;
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

    statusMsg.textContent = "Uploading model and generating quote...";
    statusMsg.style.color = "var(--text-soft)";
    submitBtn.disabled = true;

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

        const data = await res.json();
        if (!res.ok) {
            throw new Error(data.error || "Failed to submit quote");
        }

        statusMsg.textContent = `✅ Quote ${data.quote.id} created & saved to quotesdb.csv! Opening WhatsApp...`;
        statusMsg.style.color = "var(--accent)";

        // Open WhatsApp in new tab
        if (data.whatsapp_url) {
            window.open(data.whatsapp_url, "_blank");
        }
    } catch (err) {
        console.error("Submission error:", err);
        statusMsg.textContent = `Error: ${err.message}`;
        statusMsg.style.color = "var(--error)";
    } finally {
        submitBtn.disabled = false;
    }
}

// =========================================================================
// ADMIN AUTHENTICATION & DASHBOARD
// =========================================================================

function initAdminEvents() {
    const loginForm = document.getElementById("adminLoginForm");
    const logoutBtn = document.getElementById("adminLogoutBtn");
    const changePassBtn = document.getElementById("adminChangePassBtn");
    const saveSettingsBtn = document.getElementById("saveAdminSettingsBtn");
    const refreshQuotesBtn = document.getElementById("refreshQuotesBtn");

    loginForm.addEventListener("submit", handleAdminLogin);
    logoutBtn.addEventListener("click", handleAdminLogout);
    changePassBtn.addEventListener("click", handleAdminChangePassword);
    saveSettingsBtn.addEventListener("click", handleSaveAdminSettings);
    if (refreshQuotesBtn) refreshQuotesBtn.addEventListener("click", loadAdminQuotes);
}

async function handleAdminLogin(e) {
    e.preventDefault();
    const usernameInput = document.getElementById("adminUsername");
    const passwordInput = document.getElementById("adminPassword");
    const errorMsg = document.getElementById("authErrorMsg");

    errorMsg.textContent = "";

    try {
        const res = await fetch("/api/admin/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                username: usernameInput.value.trim(),
                password: passwordInput.value
            })
        });

        const data = await res.json();
        if (!res.ok) {
            throw new Error(data.error || "Login failed");
        }

        adminToken = data.token;
        sessionStorage.setItem("printprice-admin-token", adminToken);

        showAdminDashboard(data.user.username);
        loadAdminQuotes();
        loadAdminHistory();
    } catch (err) {
        errorMsg.textContent = err.message;
    }
}

async function checkAdminSession() {
    try {
        const res = await fetch("/api/admin/check", {
            headers: { Authorization: `Bearer ${adminToken}` }
        });
        if (res.ok) {
            const data = await res.json();
            showAdminDashboard(data.user.username);
            loadAdminQuotes();
            loadAdminHistory();
        } else {
            handleAdminLogout();
        }
    } catch (err) {
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

    try {
        const res = await fetch("/api/admin/change-password", {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${adminToken}`
            },
            body: JSON.stringify({ newPassword: newPass })
        });
        const data = await res.json();
        if (res.ok) {
            alert("Password successfully updated in accountsdb.csv!");
        } else {
            alert(`Error: ${data.error}`);
        }
    } catch (err) {
        alert(`Error updating password: ${err.message}`);
    }
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
    statusMsg.textContent = "Saving parameters to settings.csv...";
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

    try {
        const res = await fetch("/api/admin/settings", {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${adminToken}`
            },
            body: JSON.stringify(payload)
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to save settings");

        activeSettings = { ...activeSettings, ...payload };
        updateCurrencyUnits(activeSettings.currency);
        statusMsg.textContent = "✅ Parameters successfully saved to data/settings.csv!";
        statusMsg.style.color = "var(--accent)";

        // Recalculate customer quote if in progress
        if (current3DMetrics) calculateCustomerQuote();
        calculateManual();
    } catch (err) {
        statusMsg.textContent = `Error: ${err.message}`;
        statusMsg.style.color = "var(--error)";
    }
}

// Load quotes for Admin Table
async function loadAdminQuotes() {
    const tbody = document.getElementById("quotesTableBody");
    tbody.innerHTML = `<tr><td colspan="10" class="table-empty">Loading customer quotes...</td></tr>`;

    try {
        const res = await fetch("/api/admin/quotes", {
            headers: { Authorization: `Bearer ${adminToken}` }
        });
        const data = await res.json();

        if (!data.quotes || data.quotes.length === 0) {
            tbody.innerHTML = `<tr><td colspan="10" class="table-empty">No customer quotes found in quotesdb.csv yet.</td></tr>`;
            return;
        }

        tbody.innerHTML = "";
        data.quotes.forEach((q) => {
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
                    ` : escapeHtml(q.file_name)}
                </td>
                <td>${escapeHtml(q.material)} (${escapeHtml(q.infill)})</td>
                <td>${escapeHtml(q.weight_g)}g &bull; ${timeStr}</td>
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

        // Event listeners for status changes & delete
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
                if (confirm(`Delete quote ${quoteId} and its uploaded 3D file from disk?`)) {
                    await deleteQuote(quoteId);
                }
            });
        });
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="10" class="table-empty" style="color: var(--error)">Error loading quotes: ${err.message}</td></tr>`;
    }
}

async function updateQuoteStatus(id, status) {
    try {
        await fetch(`/api/admin/quotes/${id}`, {
            method: "PATCH",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${adminToken}`
            },
            body: JSON.stringify({ status })
        });
    } catch (err) {
        console.error("Error updating quote status:", err);
    }
}

async function deleteQuote(id) {
    try {
        const res = await fetch(`/api/admin/quotes/${id}`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${adminToken}` }
        });
        if (res.ok) {
            loadAdminQuotes();
        }
    } catch (err) {
        alert("Error deleting quote: " + err.message);
    }
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
        profit: document.getElementById("profit").textContent.replace(/[^0-9.]/g, "")
    };

    try {
        const res = await fetch("/api/admin/history", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${adminToken}`
            },
            body: JSON.stringify(payload)
        });

        if (res.ok) {
            statusEl.textContent = "✅ Saved to data/historydb.csv!";
            statusEl.style.color = "var(--accent)";
            loadAdminHistory();
        }
    } catch (err) {
        statusEl.textContent = "Error saving history: " + err.message;
        statusEl.style.color = "var(--error)";
    }
}

async function loadAdminHistory() {
    const list = document.getElementById("historyList");
    if (!list) return;

    try {
        const res = await fetch("/api/admin/history", {
            headers: { Authorization: `Bearer ${adminToken}` }
        });
        const data = await res.json();

        if (!data.history || data.history.length === 0) {
            list.innerHTML = `<p class="history-empty">No calculations in historydb.csv yet.</p>`;
            return;
        }

        list.innerHTML = "";
        data.history.forEach((h) => {
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
    } catch (err) {
        console.error("Error loading history:", err);
    }
}

async function clearManualHistory() {
    if (!confirm("Are you sure you want to clear historydb.csv?")) return;
    try {
        const res = await fetch("/api/admin/history/all", {
            method: "DELETE",
            headers: { Authorization: `Bearer ${adminToken}` }
        });
        if (res.ok) loadAdminHistory();
    } catch (err) {
        alert("Error clearing history: " + err.message);
    }
}