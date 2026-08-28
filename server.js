"use strict";

const express = require("express");
const cors = require("cors");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET || "printprice-secure-jwt-secret-key-2026";
const PORT = process.env.PORT || 3000;

const DATA_DIR = path.join(__dirname, "data");
const UPLOADS_DIR = path.join(DATA_DIR, "uploads");
const ACCOUNTS_CSV = path.join(DATA_DIR, "accountsdb.csv");
const SETTINGS_CSV = path.join(DATA_DIR, "settings.csv");
const QUOTES_CSV = path.join(DATA_DIR, "quotesdb.csv");
const HISTORY_CSV = path.join(DATA_DIR, "historydb.csv");

// Helper: Escape a CSV field according to RFC 4180
function escapeCsvField(val) {
    if (val === null || val === undefined) return '""';
    const str = String(val);
    if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
        return `"${str.replace(/"/g, '""')}"`;
    }
    return `"${str}"`;
}

// Helper: Parse a standard CSV string into array of object records
function parseCsv(content) {
    if (!content || !content.trim()) return [];
    const lines = [];
    let cur = "";
    let inQuotes = false;

    for (let i = 0; i < content.length; i++) {
        const char = content[i];
        const next = content[i + 1];

        if (char === '"') {
            if (inQuotes && next === '"') {
                cur += '"';
                i++; // skip escaped quote
            } else {
                inQuotes = !inQuotes;
            }
        } else if ((char === "\n" || char === "\r") && !inQuotes) {
            if (cur.trim().length > 0 || lines.length > 0) {
                lines.push(cur);
            }
            cur = "";
            if (char === "\r" && next === "\n") i++;
        } else {
            cur += char;
        }
    }
    if (cur.trim().length > 0) {
        lines.push(cur);
    }

    if (lines.length === 0) return [];

    const parseLine = (line) => {
        const fields = [];
        let field = "";
        let inQ = false;
        for (let i = 0; i < line.length; i++) {
            const ch = line[i];
            const nx = line[i + 1];
            if (ch === '"') {
                if (inQ && nx === '"') {
                    field += '"';
                    i++;
                } else {
                    inQ = !inQ;
                }
            } else if (ch === "," && !inQ) {
                fields.push(field);
                field = "";
            } else {
                field += ch;
            }
        }
        fields.push(field);
        return fields;
    };

    const headers = parseLine(lines[0]).map((h) => h.trim());
    const records = [];

    for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue;
        const row = parseLine(lines[i]);
        const record = {};
        headers.forEach((hdr, idx) => {
            record[hdr] = row[idx] !== undefined ? row[idx] : "";
        });
        records.push(record);
    }

    return records;
}

// Helper: Format records into CSV content
function recordsToCsv(headers, records) {
    const headerRow = headers.map(escapeCsvField).join(",");
    const rows = records.map((rec) => headers.map((h) => escapeCsvField(rec[h] !== undefined ? rec[h] : "")).join(","));
    return [headerRow, ...rows].join("\n") + "\n";
}

// Helper: Read records from CSV file
function readCsvFile(filePath) {
    if (!fs.existsSync(filePath)) return [];
    const content = fs.readFileSync(filePath, "utf-8");
    return parseCsv(content);
}

// Helper: Overwrite entire CSV file
function writeCsvFile(filePath, headers, records) {
    const csvContent = recordsToCsv(headers, records);
    fs.writeFileSync(filePath, csvContent, "utf-8");
}

// Helper: Append a single record to CSV file
function appendCsvFile(filePath, headers, record) {
    if (!fs.existsSync(filePath)) {
        writeCsvFile(filePath, headers, [record]);
    } else {
        const row = headers.map((h) => escapeCsvField(record[h] !== undefined ? record[h] : "")).join(",");
        fs.appendFileSync(filePath, row + "\n", "utf-8");
    }
}

// Initialize Directories & Database CSV Files
function initDatabases() {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(UPLOADS_DIR)) {
        fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    }

    // 1. accountsdb.csv
    const accountHeaders = ["id", "username", "password_hash", "role", "created_at"];
    if (!fs.existsSync(ACCOUNTS_CSV)) {
        const defaultHash = bcrypt.hashSync("admin123", 10);
        writeCsvFile(ACCOUNTS_CSV, accountHeaders, [
            {
                id: "1",
                username: "admin",
                password_hash: defaultHash,
                role: "admin",
                created_at: new Date().toISOString()
            }
        ]);
        console.log("Initialized accountsdb.csv with default admin (user: admin, pass: admin123)");
    }

    // 2. settings.csv
    const settingsHeaders = [
        "currency",
        "whatsapp_business_phone",
        "spool_price",
        "spool_weight",
        "printer_power",
        "electricity_price",
        "printer_price",
        "printer_lifetime",
        "labour_minutes",
        "hourly_rate",
        "failure_rate",
        "markup",
        "updated_at"
    ];
    if (!fs.existsSync(SETTINGS_CSV)) {
        writeCsvFile(SETTINGS_CSV, settingsHeaders, [
            {
                currency: "EUR",
                whatsapp_business_phone: "+1234567890",
                spool_price: "22",
                spool_weight: "1000",
                printer_power: "120",
                electricity_price: "0.35",
                printer_price: "300",
                printer_lifetime: "3000",
                labour_minutes: "15",
                hourly_rate: "12",
                failure_rate: "10",
                markup: "30",
                updated_at: new Date().toISOString()
            }
        ]);
        console.log("Initialized settings.csv with default pricing parameters");
    }

    // 3. quotesdb.csv
    const quoteHeaders = [
        "id",
        "customer_name",
        "whatsapp",
        "file_name",
        "stored_file",
        "material",
        "infill",
        "dimensions_mm",
        "volume_cm3",
        "weight_g",
        "print_time_minutes",
        "quantity",
        "total_cost",
        "selling_price",
        "status",
        "notes",
        "created_at"
    ];
    if (!fs.existsSync(QUOTES_CSV)) {
        writeCsvFile(QUOTES_CSV, quoteHeaders, []);
        console.log("Initialized empty quotesdb.csv");
    }

    // 4. historydb.csv
    const historyHeaders = [
        "id",
        "print_name",
        "material",
        "weight",
        "hours",
        "minutes",
        "quantity",
        "spool_price",
        "spool_weight",
        "printer_power",
        "electricity_price",
        "printer_price",
        "printer_lifetime",
        "labour_minutes",
        "hourly_rate",
        "failure_rate",
        "markup",
        "total_cost",
        "selling_price",
        "profit",
        "created_at"
    ];
    if (!fs.existsSync(HISTORY_CSV)) {
        writeCsvFile(HISTORY_CSV, historyHeaders, []);
        console.log("Initialized empty historydb.csv");
    }
}

initDatabases();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static frontend files
app.use(express.static(__dirname));

// Multer storage for .obj and .stl 3D uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, UPLOADS_DIR);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
        const ext = path.extname(file.originalname).toLowerCase() || ".obj";
        const sanitizedBase = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, "_");
        cb(null, `${sanitizedBase}-${uniqueSuffix}${ext}`);
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB max
    fileFilter: function (req, file, cb) {
        const ext = path.extname(file.originalname).toLowerCase();
        if (ext === ".obj" || ext === ".stl" || ext === ".3mf") {
            cb(null, true);
        } else {
            cb(new Error("Only .obj, .stl, and .3mf 3D files are supported!"));
        }
    }
});

// Middleware: Verify Admin JWT Token
function authenticateAdmin(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ error: "Unauthorized: Admin token required" });
    }
    const token = authHeader.split(" ")[1];
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        if (decoded.role !== "admin") {
            return res.status(403).json({ error: "Forbidden: Admin privileges required" });
        }
        req.user = decoded;
        next();
    } catch (err) {
        return res.status(401).json({ error: "Invalid or expired session token" });
    }
}

// -------------------------------------------------------------
// PUBLIC API ENDPOINTS
// -------------------------------------------------------------

// 1. Get Public Settings (for calculator & 3D quoting)
app.get("/api/settings", (req, res) => {
    try {
        const records = readCsvFile(SETTINGS_CSV);
        if (records.length === 0) {
            return res.status(500).json({ error: "Settings not configured" });
        }
        const s = records[0];
        res.json({
            currency: s.currency || "EUR",
            whatsapp_business_phone: s.whatsapp_business_phone || "",
            spool_price: parseFloat(s.spool_price) || 22,
            spool_weight: parseFloat(s.spool_weight) || 1000,
            printer_power: parseFloat(s.printer_power) || 120,
            electricity_price: parseFloat(s.electricity_price) || 0.35,
            printer_price: parseFloat(s.printer_price) || 300,
            printer_lifetime: parseFloat(s.printer_lifetime) || 3000,
            labour_minutes: parseFloat(s.labour_minutes) || 15,
            hourly_rate: parseFloat(s.hourly_rate) || 12,
            failure_rate: parseFloat(s.failure_rate) || 10,
            markup: parseFloat(s.markup) || 30,
            updated_at: s.updated_at
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 2. Submit Customer Quote (with .obj/.stl upload)
app.post("/api/quotes", upload.single("file"), (req, res) => {
    try {
        const {
            customer_name,
            whatsapp,
            material,
            infill,
            dimensions_mm,
            volume_cm3,
            weight_g,
            print_time_minutes,
            quantity,
            total_cost,
            selling_price,
            notes
        } = req.body;

        if (!whatsapp || !whatsapp.trim()) {
            return res.status(400).json({ error: "WhatsApp phone number is required." });
        }

        const quoteId = "Q-" + Date.now().toString(36).toUpperCase();
        const originalFileName = req.file ? req.file.originalname : "manual-entry.obj";
        const storedFileName = req.file ? req.file.filename : "";

        const quoteRecord = {
            id: quoteId,
            customer_name: (customer_name || "Customer").trim(),
            whatsapp: whatsapp.trim(),
            file_name: originalFileName,
            stored_file: storedFileName,
            material: material || "PLA",
            infill: infill || "20%",
            dimensions_mm: dimensions_mm || "N/A",
            volume_cm3: volume_cm3 || "0",
            weight_g: weight_g || "0",
            print_time_minutes: print_time_minutes || "0",
            quantity: quantity || "1",
            total_cost: total_cost || "0",
            selling_price: selling_price || "0",
            status: "Pending",
            notes: (notes || "").trim(),
            created_at: new Date().toISOString()
        };

        const quoteHeaders = [
            "id",
            "customer_name",
            "whatsapp",
            "file_name",
            "stored_file",
            "material",
            "infill",
            "dimensions_mm",
            "volume_cm3",
            "weight_g",
            "print_time_minutes",
            "quantity",
            "total_cost",
            "selling_price",
            "status",
            "notes",
            "created_at"
        ];

        appendCsvFile(QUOTES_CSV, quoteHeaders, quoteRecord);

        // Fetch WhatsApp business phone from settings for link generation
        const settings = readCsvFile(SETTINGS_CSV)[0] || {};
        const businessPhone = (settings.whatsapp_business_phone || "").replace(/[^0-9]/g, "");

        // Build prefilled WhatsApp message
        const hours = Math.floor(Number(print_time_minutes || 0) / 60);
        const mins = Number(print_time_minutes || 0) % 60;
        const timeStr = `${hours}h ${mins}m`;

        const waText = encodeURIComponent(
            `👋 Hello! I just requested a 3D print quote on PrintPrice.\n\n` +
            `📋 *Quote ID:* ${quoteId}\n` +
            `👤 *Name:* ${quoteRecord.customer_name}\n` +
            `📦 *Model:* ${quoteRecord.file_name}\n` +
            `🧱 *Material:* ${quoteRecord.material} (${quoteRecord.infill} infill)\n` +
            `⚖️ *Est. Weight:* ~${quoteRecord.weight_g}g\n` +
            `⏱️ *Est. Print Time:* ~${timeStr}\n` +
            `🔢 *Quantity:* ${quoteRecord.quantity}\n` +
            `💰 *Estimated Price:* ${settings.currency || "€"}${Number(quoteRecord.selling_price).toFixed(2)}\n\n` +
            `🚚 *Note:* Delivery charges not included.\n` +
            `⚖️ *Note:* Weight and print time are estimates.\n\n` +
            `Could you please review my print request? Thank you!`
        );

        const waLink = businessPhone ? `https://wa.me/${businessPhone}?text=${waText}` : `https://wa.me/?text=${waText}`;

        res.status(201).json({
            success: true,
            quote: quoteRecord,
            whatsapp_url: waLink,
            message: "Quote saved successfully to quotesdb.csv!"
        });
    } catch (err) {
        console.error("Error saving quote:", err);
        res.status(500).json({ error: err.message });
    }
});

// -------------------------------------------------------------
// ADMIN AUTHENTICATION
// -------------------------------------------------------------

// Admin Login
app.post("/api/admin/login", (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            return res.status(400).json({ error: "Username and password required" });
        }

        const accounts = readCsvFile(ACCOUNTS_CSV);
        const account = accounts.find((a) => a.username.toLowerCase() === username.trim().toLowerCase());

        if (!account) {
            return res.status(401).json({ error: "Invalid credentials" });
        }

        const validPassword = bcrypt.compareSync(password, account.password_hash);
        if (!validPassword) {
            return res.status(401).json({ error: "Invalid credentials" });
        }

        const token = jwt.sign(
            { id: account.id, username: account.username, role: account.role },
            JWT_SECRET,
            { expiresIn: "7d" }
        );

        res.json({
            success: true,
            token: token,
            user: { username: account.username, role: account.role }
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Admin Verify Token
app.get("/api/admin/check", authenticateAdmin, (req, res) => {
    res.json({ valid: true, user: req.user });
});

// Admin Change Password
app.put("/api/admin/change-password", authenticateAdmin, (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        if (!newPassword || newPassword.length < 4) {
            return res.status(400).json({ error: "New password must be at least 4 characters long" });
        }

        const accounts = readCsvFile(ACCOUNTS_CSV);
        const accountIdx = accounts.findIndex((a) => a.username === req.user.username);
        if (accountIdx === -1) {
            return res.status(404).json({ error: "Account not found" });
        }

        if (currentPassword) {
            const valid = bcrypt.compareSync(currentPassword, accounts[accountIdx].password_hash);
            if (!valid) {
                return res.status(401).json({ error: "Current password is incorrect" });
            }
        }

        accounts[accountIdx].password_hash = bcrypt.hashSync(newPassword, 10);
        const accountHeaders = ["id", "username", "password_hash", "role", "created_at"];
        writeCsvFile(ACCOUNTS_CSV, accountHeaders, accounts);

        res.json({ success: true, message: "Password updated successfully in accountsdb.csv" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// -------------------------------------------------------------
// ADMIN PROTECTED SETTINGS & QUOTES MANAGEMENT
// -------------------------------------------------------------

// Admin Update Parameters (Saved directly to settings.csv)
app.put("/api/admin/settings", authenticateAdmin, (req, res) => {
    try {
        const {
            currency,
            whatsapp_business_phone,
            spool_price,
            spool_weight,
            printer_power,
            electricity_price,
            printer_price,
            printer_lifetime,
            labour_minutes,
            hourly_rate,
            failure_rate,
            markup
        } = req.body;

        const updatedSettings = {
            currency: currency || "EUR",
            whatsapp_business_phone: whatsapp_business_phone || "",
            spool_price: String(spool_price ?? 22),
            spool_weight: String(spool_weight ?? 1000),
            printer_power: String(printer_power ?? 120),
            electricity_price: String(electricity_price ?? 0.35),
            printer_price: String(printer_price ?? 300),
            printer_lifetime: String(printer_lifetime ?? 3000),
            labour_minutes: String(labour_minutes ?? 15),
            hourly_rate: String(hourly_rate ?? 12),
            failure_rate: String(failure_rate ?? 10),
            markup: String(markup ?? 30),
            updated_at: new Date().toISOString()
        };

        const settingsHeaders = [
            "currency",
            "whatsapp_business_phone",
            "spool_price",
            "spool_weight",
            "printer_power",
            "electricity_price",
            "printer_price",
            "printer_lifetime",
            "labour_minutes",
            "hourly_rate",
            "failure_rate",
            "markup",
            "updated_at"
        ];

        writeCsvFile(SETTINGS_CSV, settingsHeaders, [updatedSettings]);

        res.json({
            success: true,
            settings: updatedSettings,
            message: "Pricing parameters updated and saved to settings.csv!"
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Admin Get All Customer Quotes
app.get("/api/admin/quotes", authenticateAdmin, (req, res) => {
    try {
        const quotes = readCsvFile(QUOTES_CSV);
        // Sort newest first
        quotes.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        res.json({ quotes });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Admin Update Quote Status/Notes
app.patch("/api/admin/quotes/:id", authenticateAdmin, (req, res) => {
    try {
        const quoteId = req.params.id;
        const { status, notes } = req.body;
        const quotes = readCsvFile(QUOTES_CSV);
        const idx = quotes.findIndex((q) => q.id === quoteId);

        if (idx === -1) {
            return res.status(404).json({ error: "Quote not found" });
        }

        if (status !== undefined) quotes[idx].status = status;
        if (notes !== undefined) quotes[idx].notes = notes;

        const quoteHeaders = [
            "id",
            "customer_name",
            "whatsapp",
            "file_name",
            "stored_file",
            "material",
            "infill",
            "dimensions_mm",
            "volume_cm3",
            "weight_g",
            "print_time_minutes",
            "quantity",
            "total_cost",
            "selling_price",
            "status",
            "notes",
            "created_at"
        ];

        writeCsvFile(QUOTES_CSV, quoteHeaders, quotes);
        res.json({ success: true, quote: quotes[idx] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Admin Delete Quote
app.delete("/api/admin/quotes/:id", authenticateAdmin, (req, res) => {
    try {
        const quoteId = req.params.id;
        let quotes = readCsvFile(QUOTES_CSV);
        const target = quotes.find((q) => q.id === quoteId);

        if (!target) {
            return res.status(404).json({ error: "Quote not found" });
        }

        // Delete uploaded file if exists
        if (target.stored_file) {
            const filePath = path.join(UPLOADS_DIR, target.stored_file);
            if (fs.existsSync(filePath)) {
                try {
                    fs.unlinkSync(filePath);
                } catch (e) {
                    console.error("Could not delete file:", filePath, e);
                }
            }
        }

        quotes = quotes.filter((q) => q.id !== quoteId);
        const quoteHeaders = [
            "id",
            "customer_name",
            "whatsapp",
            "file_name",
            "stored_file",
            "material",
            "infill",
            "dimensions_mm",
            "volume_cm3",
            "weight_g",
            "print_time_minutes",
            "quantity",
            "total_cost",
            "selling_price",
            "status",
            "notes",
            "created_at"
        ];

        writeCsvFile(QUOTES_CSV, quoteHeaders, quotes);
        res.json({ success: true, message: "Quote and associated file deleted." });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// -------------------------------------------------------------
// HISTORY DB (Admin Custom Calculations)
// -------------------------------------------------------------

app.get("/api/admin/history", authenticateAdmin, (req, res) => {
    try {
        const history = readCsvFile(HISTORY_CSV);
        history.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        res.json({ history });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post("/api/admin/history", authenticateAdmin, (req, res) => {
    try {
        const item = req.body;
        const id = "H-" + Date.now().toString(36).toUpperCase();
        const historyRecord = {
            id: id,
            print_name: item.print_name || "Untitled Print",
            material: item.material || "PLA",
            weight: item.weight || "0",
            hours: item.hours || "0",
            minutes: item.minutes || "0",
            quantity: item.quantity || "1",
            spool_price: item.spool_price || "0",
            spool_weight: item.spool_weight || "1000",
            printer_power: item.printer_power || "0",
            electricity_price: item.electricity_price || "0",
            printer_price: item.printer_price || "0",
            printer_lifetime: item.printer_lifetime || "0",
            labour_minutes: item.labour_minutes || "0",
            hourly_rate: item.hourly_rate || "0",
            failure_rate: item.failure_rate || "0",
            markup: item.markup || "0",
            total_cost: item.total_cost || "0",
            selling_price: item.selling_price || "0",
            profit: item.profit || "0",
            created_at: new Date().toISOString()
        };

        const historyHeaders = [
            "id",
            "print_name",
            "material",
            "weight",
            "hours",
            "minutes",
            "quantity",
            "spool_price",
            "spool_weight",
            "printer_power",
            "electricity_price",
            "printer_price",
            "printer_lifetime",
            "labour_minutes",
            "hourly_rate",
            "failure_rate",
            "markup",
            "total_cost",
            "selling_price",
            "profit",
            "created_at"
        ];

        appendCsvFile(HISTORY_CSV, historyHeaders, historyRecord);
        res.status(201).json({ success: true, item: historyRecord });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete("/api/admin/history/:id", authenticateAdmin, (req, res) => {
    try {
        const id = req.params.id;
        let history = readCsvFile(HISTORY_CSV);
        if (id === "all") {
            history = [];
        } else {
            history = history.filter((h) => h.id !== id);
        }

        const historyHeaders = [
            "id",
            "print_name",
            "material",
            "weight",
            "hours",
            "minutes",
            "quantity",
            "spool_price",
            "spool_weight",
            "printer_power",
            "electricity_price",
            "printer_price",
            "printer_lifetime",
            "labour_minutes",
            "hourly_rate",
            "failure_rate",
            "markup",
            "total_cost",
            "selling_price",
            "profit",
            "created_at"
        ];

        writeCsvFile(HISTORY_CSV, historyHeaders, history);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// -------------------------------------------------------------
// DIRECT CSV DOWNLOADS FOR MICROSOFT EXCEL / GOOGLE SHEETS
// -------------------------------------------------------------

app.get("/api/download/quotes-csv", authenticateAdmin, (req, res) => {
    if (!fs.existsSync(QUOTES_CSV)) {
        return res.status(404).send("quotesdb.csv not found");
    }
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", 'attachment; filename="quotesdb.csv"');
    fs.createReadStream(QUOTES_CSV).pipe(res);
});

app.get("/api/download/history-csv", authenticateAdmin, (req, res) => {
    if (!fs.existsSync(HISTORY_CSV)) {
        return res.status(404).send("historydb.csv not found");
    }
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", 'attachment; filename="historydb.csv"');
    fs.createReadStream(HISTORY_CSV).pipe(res);
});

// Download customer-uploaded 3D model file
app.get("/api/uploads/:filename", authenticateAdmin, (req, res) => {
    const filename = path.basename(req.params.filename);
    const filePath = path.join(UPLOADS_DIR, filename);
    if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: "File not found" });
    }
    res.download(filePath);
});

// Start Server
app.listen(PORT, () => {
    console.log(`====================================================`);
    console.log(`🚀 PrintPrice Server running on http://localhost:${PORT}`);
    console.log(`📁 CSV Database stored in: ${DATA_DIR}`);
    console.log(`👤 Default Admin Login: user = admin, pass = admin123`);
    console.log(`====================================================`);
});
