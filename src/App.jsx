import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import "./App.css";

// ---------- Locale currency formatting (global-ready) ----------
const caLocale =
  (typeof navigator !== "undefined" && navigator.language)
    ? navigator.language
    : "en-GB";

// Extract region (GB, US, DE, etc.)
const caRegion = caLocale.split("-")[1] || "GB";

// Region → currency map (safe defaults)
const REGION_TO_CURRENCY = {
  GB: "GBP",
  IE: "EUR",
  US: "USD",
  CA: "CAD",
  AU: "AUD",
  NZ: "NZD",
  DE: "EUR",
  FR: "EUR",
  ES: "EUR",
  IT: "EUR",
  NL: "EUR",
  BE: "EUR",
  PT: "EUR",
  AT: "EUR",
  FI: "EUR",
  SE: "SEK",
  NO: "NOK",
  DK: "DKK",
  CH: "CHF",
  JP: "JPY",
};

const caCurrency = REGION_TO_CURRENCY[caRegion] || "GBP";

// Currency symbol
let caCurrencySymbol = "£";
try {
  const parts = new Intl.NumberFormat(caLocale, {
    style: "currency",
    currency: caCurrency,
  }).formatToParts(1);
  const sym = parts.find((p) => p.type === "currency")?.value;
  if (sym) caCurrencySymbol = sym;
} catch (e) {
  // fallback stays £
}

// Use this everywhere you DISPLAY money (do not use for inputs)
const formatMoney = (n) => {
  if (n === null || n === undefined || n === "" || n === "-") return "-";
  const v = Number(n);
  if (!isFinite(v)) return "-";
  try {
    return new Intl.NumberFormat(caLocale, {
      style: "currency",
      currency: caCurrency,
    }).format(v);
  } catch (e) {
    return `${caCurrencySymbol}${v.toFixed(2)}`;
  }
};
// --------------------------------------------------------------



// v1.20 — Local storage persistence
// Step A: Load saved data on app start (does NOT restore step/page, open menus, or overwrite on first load)
const STORAGE_KEY = "clearahead_v1_20_data";
// v1.22 — Income date picker fix: keep <input type="date"> values in ISO (YYYY-MM-DD).
// (displayUKDate is for display text only; using it in date inputs breaks the calendar picker.)

/* =========
   v1.18 — Amount input validation (digits + decimal only)
   ========= */

function sanitizeMoneyInput(raw) {
  // Keep digits and at most one dot. (No minus sign — spending is stored separately.)
  let s = String(raw ?? "");
  s = s.replace(/[^0-9.]/g, "");
  const firstDot = s.indexOf(".");
  if (firstDot !== -1) {
    // remove any additional dots
    s = s.slice(0, firstDot + 1) + s.slice(firstDot + 1).replace(/\./g, "");
  }
  return s;
}

function formatMoney2dp(raw) {
  const s = sanitizeMoneyInput(raw);
  if (!s) return "";
  const n = Number(s);
  if (!Number.isFinite(n)) return s;
  return n.toFixed(2);
}


// ---------- Frequency labels (shared across module-scope components) ----------
const CA_FREQ_LABELS = {
  weekly: "Weekly",
  fortnightly: "Fortnightly",
  four_weekly: "4-weekly",
  monthly: "Monthly",
  last_day_of_month: "Last day of month",
  last_friday_of_month: "Last Friday of month",
};

function prettyFrequency(value) {
  if (!value) return "—";
  return CA_FREQ_LABELS[value] || String(value);
}


/* =============================
   Stable Bills components
   (Defined outside App to prevent input focus loss on every keypress)
   ============================= */

function BillsGroupButton({ id, title, subtitle, billsSection, setBillsSection, setActiveBillId }) {
  const open = billsSection === id;
  return (
    <button
      type="button"
      onClick={() => {
        setBillsSection(open ? null : id);
        if (typeof setActiveBillId === "function") setActiveBillId(null);
      }}
      style={{
        width: "100%",
    boxSizing: "border-box",
        textAlign: "left",
        padding: 14,
        borderRadius: 16,
        border: "1px solid rgba(255,255,255,0.14)",
        background: "rgba(0,0,0,0.22)",
        color: "rgba(241,245,249,0.95)",
        fontWeight: 900,
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "flex-start",
        gap: 10,
        marginBottom: 10,
      }}
    >
      <div>
        <div>{title}</div>
        {subtitle && <div style={{ fontSize: 13,
                  fontWeight: 900, opacity: 0.75, marginTop: 3 }}>{subtitle}</div>}
      </div>
      <div style={{ fontWeight: 800, opacity: 0.9 }}>{open ? "▲" : "▼"}</div>
    </button>
  );
}

function BillsBillDetails({
  bill,
  allowRemove,
  updateBill,
  removeOtherEssentialBill,
  freqOptions,
  inputStyle,
  subLabel,
  rowBox,
  activeBillId,
  setActiveBillId,
}) {
  if (!bill) return null;
  const enabled = !!bill.enabled;
  const isCustom = (bill.id || "").startsWith("other_essential_");
  const isOpen = enabled && activeBillId === bill.id;

  return (
    <div style={{ ...rowBox, marginBottom: 10, opacity: enabled ? 1 : 0.65 }}>
      <label style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => {
            const checked = e.target.checked;
            updateBill(bill.id, { enabled: checked });
            if (checked) setActiveBillId(bill.id);
            else if (activeBillId === bill.id) setActiveBillId(null);
          }}
        />
        <span style={{ fontWeight: 900 }}>{bill.label}</span>
      </label>

      {enabled && !isOpen && (
        <button
          type="button"
          onClick={() => setActiveBillId(bill.id)}
          className="caBtn caBtnGhost"
          style={{ marginTop: 10 }}
        >
          Add / edit details
        </button>
      )}

      {isOpen && (
        <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
          {(allowRemove || isCustom) && (
            <div>
              <label style={subLabel}>Label</label>
              <input
                value={bill.label}
                onChange={(e) => updateBill(bill.id, { label: e.target.value })}
                placeholder="e.g. Nursery fees"
                style={inputStyle}
              />
            </div>
          )}

          <div>
            <label style={subLabel}>Amount ({caCurrencySymbol})</label>
            <input
              value={bill.amount}
              onChange={(e) => updateBill(bill.id, { amount: sanitizeMoneyInput(e.target.value) })}
              onBlur={() => updateBill(bill.id, { amount: formatMoney2dp(bill.amount) })}
              inputMode="decimal"
              pattern="[0-9]*"
              placeholder="e.g. 900"
              style={inputStyle}
              disabled={!enabled}
            />
          </div>

          <div>
            <label style={subLabel}>Frequency</label>
            <select
              value={bill.frequency}
              onChange={(e) => updateBill(bill.id, { frequency: e.target.value })}
              style={inputStyle}
              disabled={!enabled}
            >
              {freqOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={subLabel}>Due date</label>
            <input
              type="date"
              value={bill.dueDate}
              onChange={(e) => updateBill(bill.id, { dueDate: e.target.value })}
              style={inputStyle}
              disabled={!enabled}
            />
          </div>

          <button
            type="button"
            onClick={() => setActiveBillId(null)}
            className="caBtn caBtnPrimary"
            style={{ marginTop: 4 }}
          >
            Add bill
          </button>

          {(allowRemove || isCustom) && (
            <button
              type="button"
              onClick={() => removeOtherEssentialBill(bill.id)}
              className="caBtn caBtnDanger"
            >
              Remove
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function todayISO() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

function toDate(iso) {
  const [y, m, d] = iso.split("-").map((x) => Number(x));
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}

function toISO(d) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}


function displayUKDate(iso) {
  // For UI text: convert YYYY-MM-DD -> DD/MM/YYYY
  if (!iso || typeof iso !== "string") return "";
  if (!isValidISODate(iso)) return iso;
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}


function addDays(date, days) {
  const d = new Date(date.getTime());
  d.setDate(d.getDate() + days);
  return d;
}

function moneyNumberOrNull(v) {
  return parseMoneyFlexible(v);
}

// Accept common global formats:
//  - 2900
//  - 2,900
//  - 2.900
//  - 2 900,50
//  - £2,900.50
function parseMoneyFlexible(v) {
  if (v === null || v === undefined) return null;
  let s = String(v).trim();
  if (!s) return null;

  // Remove currency symbols and spaces (incl. non‑breaking spaces)
  s = s.replace(/[£$€¥₹₩₺₫₽₦₱₪₴₡₲₵₭₺₮₯₠₢₣₤₥₧₨₩\s\u00A0]/g, "");
  if (!s) return null;

  // Keep leading minus only
  const neg = s.startsWith("-");
  s = s.replace(/-/g, "");
  s = (neg ? "-" : "") + s;

  // Quick pass: plain number
  if (/^-?\d+(\.\d+)?$/.test(s)) {
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }

  // Work with separators
  const hasComma = s.includes(",");
  const hasDot = s.includes(".");

  let normalized = s;

  if (hasComma && hasDot) {
    // Decimal separator = last one used
    const lastComma = s.lastIndexOf(",");
    const lastDot = s.lastIndexOf(".");
    const decSep = lastComma > lastDot ? "," : ".";
    const thouSep = decSep === "," ? "." : ",";
    normalized = s.split(thouSep).join("");
    normalized = normalized.replace(decSep, ".");
  } else {
    const sep = hasComma ? "," : hasDot ? "." : null;
    if (!sep) {
      const n = Number(s);
      return Number.isFinite(n) ? n : null;
    }

    const parts = s.split(sep);
    if (parts.length > 2) {
      // Multiple separators -> treat as thousand separators
      normalized = parts.join("");
    } else {
      const [a, b] = parts;
      const digitsAfter = b ? b.length : 0;

      // Heuristic:
      //  - 1–2 digits after => decimal
      //  - 3 digits after => thousands
      //  - 0 digits after => invalid
      //  - 4+ digits after => treat as thousands (rare decimal)
      if (digitsAfter === 0) return null;

      if (digitsAfter === 1 || digitsAfter === 2) {
        normalized = a + "." + b;
      } else if (digitsAfter === 3) {
        normalized = a + b;
      } else {
        normalized = a + b;
      }
    }
  }

  // Final cleanup: allow only digits, one dot, optional leading minus
  normalized = normalized.replace(/(?!^)-/g, "");
  normalized = normalized.replace(/[^0-9.\-]/g, "");

  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

function isValidISODate(s) {
  if (!s || typeof s !== "string") return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = toDate(s);
  return toISO(d) === s;
}

function freqDays(freq) {
  if (freq === "weekly") return 7;
  if (freq === "fortnightly") return 14;
  if (freq === "four_weekly" || freq === "4-weekly") return 28;
  return 30;
}

function addMonthsSameDay(base, monthsToAdd) {
  const y = base.getFullYear();
  const m = base.getMonth() + monthsToAdd;
  const day = base.getDate();
  const temp = new Date(y, m, 1, 12, 0, 0, 0);
  const lastDay = new Date(
    temp.getFullYear(),
    temp.getMonth() + 1,
    0,
    12,
    0,
    0,
    0
  ).getDate();
  temp.setDate(Math.min(day, lastDay));
  return temp;
}

function lastDayOfMonthFor(base) {
  return new Date(base.getFullYear(), base.getMonth() + 1, 0, 12, 0, 0, 0);
}

function lastFridayOfMonthFor(base) {
  let d = lastDayOfMonthFor(base);
  while (d.getDay() !== 5) d = addDays(d, -1);
  return d;
}

function specialMonthlyDateFor(base, freq) {
  if (freq === "last_day_of_month") return lastDayOfMonthFor(base);
  if (freq === "last_friday_of_month") return lastFridayOfMonthFor(base);
  return base;
}

function isSpecialMonthly(freq) {
  return freq === "last_day_of_month" || freq === "last_friday_of_month";
}

function nextOccurrencesWithinWindow({ start, first, freq, windowEnd }) {
  const occ = [];
  if (!first) return occ;

  // Start from the first due date then generate forward.
  let d = toDate(first);

  // Special monthly schedules use last-day / last-Friday for each month.
  if (isSpecialMonthly(freq)) {
    d = specialMonthlyDateFor(d, freq);
  }

  if (d < start) {
    if (freq === "monthly" || isSpecialMonthly(freq)) {
      let months = 0;
      while (d < start && months < 240) {
        months += 1;
        const base = addMonthsSameDay(d, 1);
        d = isSpecialMonthly(freq) ? specialMonthlyDateFor(base, freq) : base;
      }
    } else {
      const step = freqDays(freq);
      while (d < start) d = addDays(d, step);
    }
  }

  while (d <= windowEnd) {
    if (d >= start) occ.push(d);

    if (freq === "monthly" || isSpecialMonthly(freq)) {
      const base = addMonthsSameDay(d, 1);
      d = isSpecialMonthly(freq) ? specialMonthlyDateFor(base, freq) : base;
    } else {
      d = addDays(d, freqDays(freq));
    }
  }

  return occ;
}

function daysBetweenISO(aISO, bISO) {
  if (!isValidISODate(aISO) || !isValidISODate(bISO)) return null;
  const a = toDate(aISO);
  const b = toDate(bISO);
  const diff = Math.abs(a.getTime() - b.getTime());
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

function computeGoalPlan({ startDateISO, goal }) {
  if (!goal) return { ok: false, message: "Goal is missing." };
  if (!isValidISODate(startDateISO)) return { ok: false, message: "Start date is invalid." };

  const targetAmt = moneyNumberOrNull(goal.targetAmount);
  if (targetAmt === null || targetAmt <= 0) return { ok: false, message: "Enter a target amount." };

  if (!isValidISODate(goal.targetDate)) return { ok: false, message: "Enter a valid target date." };

  const start = toDate(startDateISO);
  const target = toDate(goal.targetDate);
  const ms = target.getTime() - start.getTime();
  const days = Math.ceil(ms / (1000 * 60 * 60 * 24));
  if (days <= 0) return { ok: false, message: "Target date must be after the start date." };

  const weeks = days / 7;
  const monthsApprox = days / 30;
  const perWeek = targetAmt / weeks;
  const perMonth = targetAmt / monthsApprox;

  return {
    ok: true,
    targetAmt,
    days,
    perWeek,
    perMonth,
    startISO: startDateISO,
    targetISO: goal.targetDate,
  };
}


function IncomeGroupButton({ id, title, subtitle, incomeSection, setIncomeSection, setActiveIncomeId }) {
  const open = incomeSection === id;
  return (
    <button
      type="button"
      onClick={() => {
        setIncomeSection(open ? null : id);
        if (typeof setActiveIncomeId === "function") setActiveIncomeId(null);
      }}
      style={{
        width: "100%",
        textAlign: "left",
        padding: 14,
        borderRadius: 16,
        border: "1px solid rgba(255,255,255,0.14)",
        background: "rgba(0,0,0,0.22)",
        color: "rgba(241,245,249,0.95)",
        fontWeight: 900,
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "flex-start",
        gap: 10,
        marginBottom: 10,
      }}
    >
      <div>
        <div>{title}</div>
        {subtitle && <div style={{ fontSize: 13,
                  fontWeight: 900, opacity: 0.75, marginTop: 3 }}>{subtitle}</div>}
      </div>
      <div style={{ fontWeight: 800, opacity: 0.9 }}>{open ? "▲" : "▼"}</div>
    </button>
  );
}

function IncomeItemDetails({
  income,
  allowRemove,
  updateIncome,
  removeOtherIncome,
  freqOptions,
  inputStyle,
  subLabel,
  selectStyle,
  rowBox,
  activeIncomeId,
  setActiveIncomeId,
}) {
  if (!income) return null;

  const enabled = !!income.enabled;
  const isOther = (income.id || "").startsWith("other_income_");
  const isOpen = enabled && activeIncomeId === income.id;
  const hasDetails = moneyNumberOrNull(income.amount) !== null && !!income.frequency && isValidISODate(income.nextDate);
  const [incomeError, setIncomeError] = useState("");


  return (
    <div style={{ ...rowBox, margin: 0 }}>
      <label style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => {
            const nextEnabled = e.target.checked;
            updateIncome(income.id, { enabled: nextEnabled });

            if (nextEnabled) {
            setIncomeError("");
            setActiveIncomeId(income.id);
          }
            if (!nextEnabled && activeIncomeId === income.id) setActiveIncomeId(null);
          }}
        />
        <div style={{ fontWeight: 900, flex: "1 1 240px", minWidth: 0 }}>{income.label}</div>
      </label>

      
{!!enabled && (
  <div style={{ marginTop: 10 }}>
    {!isOpen ? (
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        {hasDetails && (
          <div style={{ flex: "1 1 220px", minWidth: 160 }}>
            <div style={{ fontWeight: 900 }}>{formatMoney2dp(income.amount)}</div>
            <div style={{ opacity: 0.75, fontSize: 12 }}>
              {prettyFrequency(income.frequency)} • {displayUKDate(income.nextDate)}
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={() => {
            setIncomeError("");
            setActiveIncomeId(income.id);
          }}
          style={{
            padding: "10px 12px",
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,0.14)",
            background: "rgba(0,0,0,0.18)",
            color: "rgba(241,245,249,0.95)",
            fontWeight: 800,
            cursor: "pointer",
          }}
        >
          {hasDetails ? "Edit" : "Add"}
        </button>

        <button
          type="button"
          onClick={() => {
            setIncomeError("");
            if (isOther && allowRemove) {
              removeOtherIncome(income.id);
            } else {
              updateIncome(income.id, {
                enabled: false,
                amount: "",
                frequency: "",
                nextDate: todayISO(),
              });
            }
            if (activeIncomeId === income.id) setActiveIncomeId(null);
          }}
          style={{
            padding: "10px 12px",
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,0.14)",
            background: "rgba(0,0,0,0.18)",
            color: "rgba(241,245,249,0.95)",
            fontWeight: 800,
            cursor: "pointer",
          }}
        >
          Remove
        </button>
      </div>
    ) : (
      <div style={{ display: "grid", gap: 10 }}>
        {isOther && (
          <div>
            <div style={subLabel}>Label</div>
            <input
              value={income.label || ""}
              onChange={(e) => {
                setIncomeError("");
                updateIncome(income.id, { label: e.target.value });
              }}
              placeholder="e.g. Child maintenance"
              style={inputStyle}
            />
          </div>
        )}

        <div>
          <div style={subLabel}>Amount ({caCurrencySymbol})</div>
          <input
            value={income.amount}
            onChange={(e) => {
              setIncomeError("");
              updateIncome(income.id, { amount: sanitizeMoneyInput(e.target.value) });
            }}
            inputMode="decimal"
            pattern="[0-9]*"
            placeholder="e.g. 343.20"
            style={inputStyle}
          />
        </div>

        <div>
          <div style={subLabel}>Frequency</div>
          <select
            value={income.frequency}
            onChange={(e) => {
              setIncomeError("");
              updateIncome(income.id, { frequency: e.target.value });
            }}
            style={selectStyle}
          >
            <option value="">Select…</option>
            {freqOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <div style={subLabel}>Next payment date</div>
          <input
            type="date"
            value={income.nextDate}
            onChange={(e) => {
              setIncomeError("");
              updateIncome(income.id, { nextDate: e.target.value });
            }}
            style={inputStyle}
          />
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 2 }}>
          <button
            type="button"
            onClick={() => {
              const ok =
                moneyNumberOrNull(income.amount) !== null &&
                !!income.frequency &&
                isValidISODate(income.nextDate);
              if (!ok) {
                setIncomeError("Please add amount, frequency, and next payment date.");
                return;
              }
              setIncomeError("");
              setActiveIncomeId(null);
            }}
            style={{
              padding: "10px 12px",
              borderRadius: 12,
              border: "none",
              cursor: "pointer",
              background: "#2f7a7f",
              color: "white",
              fontWeight: 800,
            }}
          >
            Add
          </button>

          <button
            type="button"
            onClick={() => {
              setIncomeError("");
              setActiveIncomeId(null);
            }}
            style={{
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.14)",
              background: "rgba(0,0,0,0.18)",
              color: "rgba(241,245,249,0.95)",
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            Done
          </button>

          {allowRemove && isOther && (
            <button
              type="button"
              onClick={() => {
                removeOtherIncome(income.id);
                setActiveIncomeId(null);
              }}
              style={{
                padding: "10px 12px",
                borderRadius: 12,
                border: "1px solid rgba(255,255,255,0.14)",
                background: "rgba(0,0,0,0.18)",
                color: "rgba(241,245,249,0.95)",
                fontWeight: 800,
                cursor: "pointer",
              }}
            >
              Remove
            </button>
          )}
        </div>

        {incomeError && (
          <div style={{ marginTop: 2, color: "rgba(255,255,255,0.8)", fontSize: 12 }}>
            {incomeError}
          </div>
        )}
      </div>
    )}
  </div>
)}
    </div>
  );
}


export default function App() {
  const [step, setStep] = useState(1);
  const [showAbout, setShowAbout] = useState(false);
  // Show the About screen automatically on the very first launch (after install).
  // After the user closes it once, we remember that choice in localStorage.
  const closeAbout = () => {
    setShowAbout(false);
    try {
      localStorage.setItem("ca_seen_about", "1");
    } catch (e) {
      // ignore (private mode / blocked storage)
    }
  };

  useEffect(() => {
    try {
      const seen = localStorage.getItem("ca_seen_about");
      if (!seen) setShowAbout(true);
    } catch (e) {
      // If storage is blocked, still show it on load.
      setShowAbout(true);
    }
  }, []);

  const [showDisclaimer, setShowDisclaimer] = useState(false);
  const [showProInfo, setShowProInfo] = useState(false);
  const [shareStatus, setShareStatus] = useState("");
  const [isPro, setIsPro] = useState(false);
  

// Pro entitlement is decided at build-time (two-app model):
  // - ClearAhead Basic: VITE_CLEARAHEAD_EDITION="basic" (or unset)
  // - ClearAhead Pro:   VITE_CLEARAHEAD_EDITION="pro"
  // No in-app purchases, no restore, no store/billing bridges.
  const CA_EDITION = (import.meta.env.VITE_CLEARAHEAD_EDITION || import.meta.env.VITE_CLEARAHEAD_PRO || "basic");
  const IS_PRO_BUILD = String(CA_EDITION).toLowerCase() === "pro" || String(CA_EDITION).toLowerCase() === "true" || String(CA_EDITION) === "1";
  useEffect(() => {
    setIsPro(IS_PRO_BUILD);
  }, [IS_PRO_BUILD]);
  // Pro lookahead (Pro can choose 5–12 weeks; Basic is locked to 5 weeks)
  const [proLookaheadWeeks, setProLookaheadWeeks] = useState(5);

  // Load saved Pro lookahead weeks (optional) — safe defaults
  useEffect(() => {
    try {
      const raw = typeof localStorage !== "undefined" ? localStorage.getItem("ca_pro_lookahead_weeks") : null;
      const n = raw ? parseInt(raw, 10) : NaN;
      if (Number.isFinite(n)) {
        const clamped = Math.min(12, Math.max(5, n));
        setProLookaheadWeeks(clamped);
      }
    } catch (e) {
      // ignore
    }
  }, []);

  // Persist Pro lookahead weeks (only used when Pro is active)
  useEffect(() => {
    try {
      if (typeof localStorage === "undefined") return;
      const clamped = Math.min(12, Math.max(5, Number(proLookaheadWeeks) || 5));
      localStorage.setItem("ca_pro_lookahead_weeks", String(clamped));
    } catch (e) {
      // ignore
    }
  }, [proLookaheadWeeks]);

  const effectiveLookaheadWeeks = isPro ? (Math.min(12, Math.max(5, Number(proLookaheadWeeks) || 5))) : 5;

  // Layout helper: on narrow mobile screens, stack 2-column grids to avoid overflow (Android date inputs can be wide)
  const isNarrowMobile = useMemo(() => {
    try {
      return typeof window !== "undefined" && window.matchMedia && window.matchMedia("(max-width: 520px)").matches;
    } catch (e) {
      return false;
    }
  }, []);



  const [calMonth, setCalMonth] = useState("");
  const [calSelectedISO, setCalSelectedISO] = useState("");
  const [billsSection, setBillsSection] = useState(null);
  const [activeBillId, setActiveBillId] = useState(null);
  const [incomeSection, setIncomeSection] = useState(null);
  const [activeIncomeId, setActiveIncomeId] = useState(null);
  const [navFrom, setNavFrom] = useState("forward"); // for animations later (design only)
  const [benefitPicker, setBenefitPicker] = useState(""); // Income > Benefits dropdown
  const [focusSection, setFocusSection] = useState(null);
  const spendRef = useRef(null);
  const whatIfRef = useRef(null);
  const goalsRef = useRef(null);



async function handleShare() {
    try {
      setShareStatus("");
      const url = "https://www.clearahead.app";
      const title = "ClearAhead";
      const text = "ClearAhead — calm financial clarity.";

      if (navigator.share) {
        await navigator.share({ title, text, url });
        setShareStatus("Shared.");
        return;
      }

      // Fallback: copy link
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        setShareStatus("Link copied.");
      } else {
        // Last resort
        window.prompt("Copy this link:", url);
        setShareStatus("Link ready.");
      }
    } catch (e) {
      // User cancelled share, or browser blocked
      setShareStatus("");
    }
  }
  function goTo(nextStep) {
  setNavFrom(nextStep > step ? "forward" : "back");
  setStep(nextStep);
}

// Always start each screen at the top (prevents “landing halfway down”)
// Only scroll to top when we CHANGE steps (not while typing on a page)
useEffect(() => {
  // iOS Safari can sometimes keep a tiny horizontal scroll offset when navigating
  // or when focusing inputs. We hard-reset horizontal scroll in a couple of ticks.
  const resetHorizontal = () => {
    try {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    } catch {
      window.scrollTo(0, 0);
    }
    // Extra guards for iOS/Chromium quirks
    if (document?.documentElement) document.documentElement.scrollLeft = 0;
    if (document?.body) document.body.scrollLeft = 0;
    const shell = document.querySelector(".appShell");
    if (shell) shell.scrollLeft = 0;
    const root = document.getElementById("root");
    if (root) root.scrollLeft = 0;
  };

  resetHorizontal();
  requestAnimationFrame(resetHorizontal);
  setTimeout(resetHorizontal, 60);
}, [step]);

// Also guard against iOS input-focus horizontal drift (without affecting vertical scroll)
useEffect(() => {
  const onFocusIn = () => {
    if (document?.documentElement) document.documentElement.scrollLeft = 0;
    if (document?.body) document.body.scrollLeft = 0;
    const shell = document.querySelector(".appShell");
    if (shell) shell.scrollLeft = 0;
    const root = document.getElementById("root");
    if (root) root.scrollLeft = 0;
  };

  window.addEventListener("focusin", onFocusIn);
  return () => window.removeEventListener("focusin", onFocusIn);
}, []);



// Bills UI: when switching bill groups, close any open bill editor
useEffect(() => {
  // Only jump when we are on Step 3 (Bills page)
  if (step !== 3) return;
  if (!focusSection) return;

  const sectionMap = {
    spend: spendRef,
    whatif: whatIfRef,
    goals: goalsRef,
  };

  const targetRef = sectionMap[focusSection];
  const el = targetRef?.current;
  if (el) {
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // Clear it so it doesn't keep jumping
  setFocusSection(null);
}, [step, focusSection]);
  // Screen 1
  const [startDate, setStartDate] = useState(todayISO());
  const [startDateAuto, setStartDateAuto] = useState(true);
  const [balance, setBalance] = useState("");


  // Rolling 5-week window: if the user is using "today" as the start date,
  // keep it synced so the window moves forward day-by-day.
  useEffect(() => {
    if (!startDateAuto) return;
    const tick = () => {
      const today = todayISO();
      if (today !== startDate) setStartDate(today);
    };
    tick();
    const id = setInterval(tick, 60 * 1000); // check once per minute
    return () => clearInterval(id);
  }, [startDateAuto, startDate]);

  const canContinueStep1 = useMemo(
    () => moneyNumberOrNull(balance) !== null && isValidISODate(startDate),
    [balance, startDate]
  );

  // Screen 2
  const [incomes, setIncomes] = useState([
    { id: "wage_salary", label: "Wage / Salary", enabled: false, amount: "", frequency: "monthly", nextDate: todayISO() },

    { id: "wages_salary", type: "wage", label: "Wage / Salary", enabled: false, amount: "", frequency: "monthly", nextDate: todayISO() },

    // Government benefits
    { id: "universal_credit", type: "benefit", label: "Universal Credit", enabled: false, amount: "", frequency: "monthly", nextDate: todayISO() },
    { id: "child_benefit", type: "benefit", label: "Child Benefit", enabled: false, amount: "", frequency: "weekly", nextDate: todayISO() },
    { id: "esa", label: "Employment and Support Allowance (ESA)", enabled: false, amount: "", frequency: "monthly", nextDate: todayISO() },
{ id: "jsa", label: "Jobseeker’s Allowance (JSA)", enabled: false, amount: "", frequency: "monthly", nextDate: todayISO() },
{ id: "housing_benefit", label: "Housing Benefit", enabled: false, amount: "", frequency: "monthly", nextDate: todayISO() },
{ id: "pension_credit", label: "Pension Credit", enabled: false, amount: "", frequency: "monthly", nextDate: todayISO() },
{ id: "income_support", label: "Income Support", enabled: false, amount: "", frequency: "monthly", nextDate: todayISO() },
{ id: "maternity_allowance", label: "Maternity Allowance", enabled: false, amount: "", frequency: "monthly", nextDate: todayISO() },
{ id: "state_pension", label: "State Pension", enabled: false, amount: "", frequency: "monthly", nextDate: todayISO() },
{ id: "dla", label: "Disability Living Allowance (DLA)", enabled: false, amount: "", frequency: "monthly", nextDate: todayISO() },
{ id: "pip", type: "benefit", label: "Personal Independence Payment (PIP)", enabled: false, amount: "", frequency: "four_weekly", nextDate: todayISO() },
    { id: "carers_allowance", type: "benefit", label: "Carers Allowance", enabled: false, amount: "", frequency: "weekly", nextDate: todayISO() },
    { id: "attendance_allowance", type: "benefit", label: "Attendance Allowance", enabled: false, amount: "", frequency: "weekly", nextDate: todayISO() },

    // Other income (you can add multiple)
    { id: "other_income_1", type: "other", label: "Other income", enabled: false, amount: "", frequency: "monthly", nextDate: todayISO() },
  

]);
  // v1.21 — Wage / Salary jobs UI state (multi-job, add/edit/remove)
  const [wageAddOpen, setWageAddOpen] = useState(false);
  const [wageDraft, setWageDraft] = useState({
    label: "Wage / Salary",
    amount: "",
    frequency: "monthly",
    nextDate: todayISO(),
  });
  const [wageEditingId, setWageEditingId] = useState(null);


  const [bills, setBills] = useState([
    { id: "rent_housing", label: "Rent / Housing", enabled: false, amount: "", frequency: "monthly", dueDate: todayISO() },
    { id: "council_tax", label: "Council Tax", enabled: false, amount: "", frequency: "monthly", dueDate: todayISO() },
    { id: "gas", label: "Gas", enabled: false, amount: "", frequency: "monthly", dueDate: todayISO() },
    { id: "electric", label: "Electric", enabled: false, amount: "", frequency: "monthly", dueDate: todayISO() },
    { id: "water", label: "Water", enabled: false, amount: "", frequency: "monthly", dueDate: todayISO() },
    { id: "phone", label: "Phone", enabled: false, amount: "", frequency: "monthly", dueDate: todayISO() },
    { id: "internet", label: "Internet", enabled: false, amount: "", frequency: "monthly", dueDate: todayISO() },
    { id: "tv_licence", label: "TV Licence", enabled: false, amount: "", frequency: "monthly", dueDate: todayISO() },
    { id: "home_insurance", label: "Home Insurance", enabled: false, amount: "", frequency: "monthly", dueDate: todayISO() },
    { id: "child_maintenance", label: "Child maintenance", enabled: false, amount: "", frequency: "monthly", dueDate: todayISO() },
    { id: "vehicle_costs", label: "Vehicle costs", enabled: false, amount: "", frequency: "monthly", dueDate: todayISO() },
    { id: "creditCards", label: "Credit cards (minimum payments)", enabled: false, amount: "", frequency: "monthly", dueDate: todayISO() },
    { id: "other_essential_bills", label: "Other essential bills", enabled: false, amount: "", frequency: "monthly", dueDate: todayISO() },
  ]);

  // --- Bills page: keep scroll position stable while ticking/typing ---
  const billsScrollYRef = useRef(0);

  // Remember scroll position while user is on the Bills step
  useEffect(() => {
    if (step !== 3) return;

    const onScroll = () => {
      billsScrollYRef.current = window.scrollY || 0;
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    billsScrollYRef.current = window.scrollY || 0;

    return () => window.removeEventListener("scroll", onScroll);
  }, [step]);

  // After bills update, restore the scroll position (prevents jumping to top)
  useLayoutEffect(() => {
    if (step !== 3) return;

    const y = billsScrollYRef.current || 0;
    window.scrollTo({ top: y, left: 0, behavior: "auto" });
  }, [step, bills]);

  const [vehicle, setVehicle] = useState({
    finance: "",
    financeFreq: "monthly",
    financeDue: todayISO(),
    insurance: "",
    insuranceFreq: "monthly",
    insuranceDue: todayISO(),
    tax: "",
    taxFreq: "monthly",
    taxDue: todayISO(),
    breakdown: "",
    breakdownFreq: "monthly",
    breakdownDue: todayISO(),
  });

  // Vehicle sub-bills UI state (keeps each row behaving like other add/remove menus)
  const [vehicleOpen, setVehicleOpen] = useState({
    finance: false,
    insurance: false,
    tax: false,
    breakdown: false,
  });
  // Vehicle costs section open/closed (keeps totals included even when UI is closed)
  const [vehicleSectionOpen, setVehicleSectionOpen] = useState(false);



  // Spending log
  const [spendDate, setSpendDate] = useState(todayISO());
  const [spendAmount, setSpendAmount] = useState("");
  const [spendNote, setSpendNote] = useState("");
  const [spendItems, setSpendItems] = useState([]); // {id, date, amount, note}

  // Milestone 6: Multiple savings goals
  const [goalsEnabled, setGoalsEnabled] = useState(false);
  const [goals, setGoals] = useState([]); // {id, name, targetAmount, targetDate, includeInCalc}
  const [activeGoalId, setActiveGoalId] = useState(null);

  // Milestone 6: What-if purchase
  const [whatIfName, setWhatIfName] = useState("");
  const [whatIfAmount, setWhatIfAmount] = useState("");
  const [whatIfDate, setWhatIfDate] = useState(todayISO());
    const [benefitsOpen, setBenefitsOpen] = useState(false);
  const [benefitExpanded, setBenefitExpanded] = useState(null);

const [whatIfChecked, setWhatIfChecked] = useState(false);


  // v1.20 — Local storage guards
  const didHydrateRef = useRef(false);
  const skipFirstAutoSaveRef = useRef(true);


  // v1.20 — Local storage (Step A: load on start only)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        // No saved data yet — allow auto-save AFTER the user makes changes.
        didHydrateRef.current = true;
        return;
      }

      const data = JSON.parse(raw);

      if (typeof data.startDate === "string") setStartDate(data.startDate);
      if (typeof data.startDateAuto === "boolean") setStartDateAuto(data.startDateAuto);
      if (typeof data.balance === "string") setBalance(data.balance);

      if (Array.isArray(data.incomes)) setIncomes(data.incomes);
      if (Array.isArray(data.bills)) setBills(data.bills);
      if (data.vehicle && typeof data.vehicle === "object") setVehicle(data.vehicle);

      if (typeof data.spendDate === "string") setSpendDate(data.spendDate);
      if (typeof data.spendAmount === "string") setSpendAmount(data.spendAmount);
      if (typeof data.spendNote === "string") setSpendNote(data.spendNote);
      if (Array.isArray(data.spendItems)) setSpendItems(data.spendItems);

      if (typeof data.goalsEnabled === "boolean") setGoalsEnabled(data.goalsEnabled);
      if (Array.isArray(data.goals)) setGoals(data.goals);

      // Intentionally do NOT restore: step, menus, expanded sections, or any UI-only state.
      didHydrateRef.current = true;
    } catch (e) {
      // If saved data is corrupted, ignore it (keep the app usable).
      console.warn("ClearAhead: failed to load saved data", e);
      didHydrateRef.current = true;
    }
  }, []);


  // v1.20 — Local storage (Step B: auto-save after changes)
  useEffect(() => {
    if (!didHydrateRef.current) return;
    if (skipFirstAutoSaveRef.current) {
      // Prevent writing defaults immediately on first load.
      skipFirstAutoSaveRef.current = false;
      return;
    }
    try {
      const data = {
        startDate,
        startDateAuto,
        balance,
        incomes,
        bills,
        vehicle,
        spendDate,
        spendAmount,
        spendNote,
        spendItems,
        goalsEnabled,
        goals,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      console.warn("ClearAhead: failed to save data", e);
    }
  }, [
    startDate,
    startDateAuto,
    balance,
    incomes,
    bills,
    vehicle,
    spendDate,
    spendAmount,
    spendNote,
    spendItems,
    goalsEnabled,
    goals,
  ]);


  function updateIncome(id, patch) {
    setIncomes((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  function addOtherIncome() {
    // Create a new "Other income" row and open it for editing (parity with Wage/Bills flows)
    const nextNum =
      incomes
        .filter((x) => (x.id || "").startsWith("other_income_"))
        .map((x) => parseInt(String(x.id).replace("other_income_", ""), 10))
        .filter((n) => Number.isFinite(n))
        .reduce((a, b) => Math.max(a, b), 1) + 1;

    const newId = `other_income_${nextNum}`;

    setIncomes((prev) => [
      ...prev,
      {
        id: newId,
        type: "other",
        label: `Other income #${nextNum}`,
        enabled: true,
        amount: "",
        frequency: "monthly",
        nextDate: todayISO(),
      },
    ]);

    // Open the editor immediately so the user can add details without extra taps
    setActiveIncomeId(newId);
  }

  function removeOtherIncome(id) {
    setIncomes((prev) => prev.filter((x) => x.id !== id));
    if (benefitPicker === id) setBenefitPicker("");
    if (activeIncomeId === id) setActiveIncomeId(null);
  }

  function updateBill(id, patch) {
  setBills((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
}

  const freqOptions = [
    { value: "weekly", label: "Weekly" },
    { value: "fortnightly", label: "Fortnightly" },
    { value: "four_weekly", label: "4-weekly" },
    { value: "monthly", label: "Monthly" },
    { value: "last_day_of_month", label: "Last day of month" },
    { value: "last_friday_of_month", label: "Last Friday of month" },
  ];


  const vehicleTotal = useMemo(() => {
    return (
      (moneyNumberOrNull(vehicle.finance) ?? 0) +
      (moneyNumberOrNull(vehicle.insurance) ?? 0) +
      (moneyNumberOrNull(vehicle.tax) ?? 0) +
      (moneyNumberOrNull(vehicle.breakdown) ?? 0)
    );
  }, [vehicle]);

  const vehicleEnabled = useMemo(
    () => bills.find((b) => b.id === "vehicle_costs")?.enabled === true,
    [bills]
  );

  function syncVehicleTotalIfEnabled(nextVehicle) {
    if (!vehicleEnabled) return;
    const total =
      (moneyNumberOrNull(nextVehicle.finance) ?? 0) +
      (moneyNumberOrNull(nextVehicle.insurance) ?? 0) +
      (moneyNumberOrNull(nextVehicle.tax) ?? 0) +
      (moneyNumberOrNull(nextVehicle.breakdown) ?? 0);
    updateBill("vehicle_costs", { amount: total ? String(total) : "" });
  }

  const canContinueStep2 = useMemo(() => {
    const activeIncome = incomes.filter((x) => x.enabled);
    if (activeIncome.length === 0) return false;

    for (const inc of activeIncome) {
      if (moneyNumberOrNull(inc.amount) === null) return false;
      if (!isValidISODate(inc.nextDate)) return false;
      if (!inc.frequency) return false;
    }

    const activeBills = bills.filter((b) => b.enabled);
    for (const b of activeBills) {
      if (b.id === "vehicle_costs") continue;
      if (moneyNumberOrNull(b.amount) === null) return false;
      if (!isValidISODate(b.dueDate)) return false;
      if (!b.frequency) return false;
    }

    if (vehicleEnabled) {
      const items = [
        { amount: vehicle.finance, freq: vehicle.financeFreq, due: vehicle.financeDue },
        { amount: vehicle.insurance, freq: vehicle.insuranceFreq, due: vehicle.insuranceDue },
        { amount: vehicle.tax, freq: vehicle.taxFreq, due: vehicle.taxDue },
        { amount: vehicle.breakdown, freq: vehicle.breakdownFreq, due: vehicle.breakdownDue },
      ];
      for (const it of items) {
        const amt = moneyNumberOrNull(it.amount);
        if (amt === null || amt === 0) continue;
        if (!it.freq) return false;
        if (!isValidISODate(it.due)) return false;
      }
    }

    return true;
  }, [incomes, bills, vehicle, vehicleEnabled]);

  // User-friendly “why can’t I continue?” messages
  const step2Errors = useMemo(() => {
    const errs = [];

    const activeIncome = incomes.filter((x) => x.enabled);
    if (activeIncome.length === 0) errs.push("Tick at least one income.");
    for (const inc of activeIncome) {
      if (moneyNumberOrNull(inc.amount) === null) {
        errs.push(`Income • ${inc.label}: enter an amount (you can type 2900, 2,900, 2.900, or 2 900,50).`);
      }
      if (!isValidISODate(inc.nextDate)) errs.push(`Income • ${inc.label}: choose a valid next payment date.`);
      if (!inc.frequency) errs.push(`Income • ${inc.label}: choose a frequency.`);
    }

    const activeBills = bills.filter((b) => b.enabled);
    for (const b of activeBills) {
      if (b.id === "vehicle_costs") continue;
      if (moneyNumberOrNull(b.amount) === null) {
        errs.push(`Bill • ${b.label}: enter an amount (examples: 2900, 2,900, 2.900, 2 900,50).`);
      }
      if (!isValidISODate(b.dueDate)) errs.push(`Bill • ${b.label}: choose a valid due date.`);
      if (!b.frequency) errs.push(`Bill • ${b.label}: choose a frequency.`);
    }

    if (vehicleEnabled) {
      const vehicleItems = [
        { label: "Vehicle payment / finance", amount: vehicle.finance, freq: vehicle.financeFreq, due: vehicle.financeDue },
        { label: "Car insurance", amount: vehicle.insurance, freq: vehicle.insuranceFreq, due: vehicle.insuranceDue },
        { label: "Car tax", amount: vehicle.tax, freq: vehicle.taxFreq, due: vehicle.taxDue },
        { label: "Breakdown cover", amount: vehicle.breakdown, freq: vehicle.breakdownFreq, due: vehicle.breakdownDue },
      ];

      // Only validate rows that have a non-zero amount.
      for (const it of vehicleItems) {
        const amt = moneyNumberOrNull(it.amount);
        if (amt === null || amt === 0) continue;
        if (!it.freq) errs.push(`Vehicle • ${it.label}: choose a frequency.`);
        if (!isValidISODate(it.due)) errs.push(`Vehicle • ${it.label}: choose a valid due date.`);
      }
    }

    return errs;
  }, [incomes, bills, vehicle, vehicleEnabled]);

  function addGoal() {
    const id = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const defaultTarget = toISO(addDays(toDate(isValidISODate(startDate) ? startDate : todayISO()), 30));
    setGoals((prev) => [
      ...prev,
      {
        id,
        name: "",
        targetAmount: "",
        targetDate: defaultTarget,
        includeInCalc: true,
      },
    ]);
    setActiveGoalId(id);
  }

  function updateGoal(id, patch) {
    setGoals((prev) => prev.map((g) => (g.id === id ? { ...g, ...patch } : g)));
  }

  function removeGoal(id) {
    setGoals((prev) => prev.filter((g) => g.id !== id));
  }

  const goalPlansById = useMemo(() => {
    const out = {};
    if (!goalsEnabled) return out;
    for (const g of goals) {
      out[g.id] = computeGoalPlan({ startDateISO: startDate, goal: g });
    }
    return out;
  }, [goalsEnabled, goals, startDate]);

  function addSpending() {
    const amt = moneyNumberOrNull(spendAmount);
    if (!isValidISODate(spendDate) || amt === null) return;

    const id = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
    setSpendItems((prev) => [...prev, { id, date: spendDate, amount: String(amt), note: spendNote.trim() }]);
    setSpendAmount("");
    setSpendNote("");
  }

  function removeSpending(id) {
    setSpendItems((prev) => prev.filter((x) => x.id !== id));
  }

  function clearWhatIf() {
    setWhatIfName("");
    setWhatIfAmount("");
    setWhatIfDate(todayISO());
    setWhatIfChecked(false);
  }

  function adoptWhatIfToSpending() {
    const amt = moneyNumberOrNull(whatIfAmount);
    if (!isValidISODate(whatIfDate) || amt === null) return;
    const id = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const note = whatIfName.trim() ? whatIfName.trim() : "Purchase";
    setSpendItems((prev) => [...prev, { id, date: whatIfDate, amount: String(amt), note }]);
    clearWhatIf();
  }

  function computeLookahead(extraEvents) {
    const start = isValidISODate(startDate) ? toDate(startDate) : toDate(todayISO());
    const windowEnd = addDays(start, effectiveLookaheadWeeks * 7);
    const opening = moneyNumberOrNull(balance) ?? 0;

    const events = [];

    // Spending events
    for (const s of spendItems) {
      if (!isValidISODate(s.date)) continue;
      const amt = moneyNumberOrNull(s.amount);
      if (amt === null || amt === 0) continue;
      const d = toDate(s.date);
      if (d < start || d > windowEnd) continue;
      events.push({
        iso: toISO(d),
        kind: "spend",
        label: s.note ? s.note : "Spending",
        amount: -amt,
      });
    }

    // Extra events (What-if)
    if (Array.isArray(extraEvents)) {
      for (const ev of extraEvents) {
        if (!ev) continue;
        if (!isValidISODate(ev.iso)) continue;
        const d = toDate(ev.iso);
        if (d < start || d > windowEnd) continue;
        events.push(ev);
      }
    }

    // Goals set-aside events (optional)
    if (goalsEnabled && goals.length > 0) {
      for (const g of goals) {
        if (!g.includeInCalc) continue;
        const plan = goalPlansById[g.id];
        if (!plan || !plan.ok) continue;

        const weekly = plan.perWeek;
        if (!Number.isFinite(weekly) || weekly <= 0) continue;

        const goalLabel = g.name.trim() ? `Goal • ${g.name.trim()}` : "Goal set-aside";
        const targetD = toDate(plan.targetISO);

        let d = toDate(startDate);
        while (d <= windowEnd) {
          if (d >= start && d <= windowEnd && d <= targetD) {
            events.push({
              iso: toISO(d),
              kind: "goal",
              label: goalLabel,
              amount: -weekly,
            });
          }
          d = addDays(d, 7);
        }
      }
    }

    // Income events
    for (const inc of incomes) {
      if (!inc.enabled) continue;
      const amt = moneyNumberOrNull(inc.amount);
      if (amt === null) continue;
      if (!isValidISODate(inc.nextDate)) continue;

      const occ = nextOccurrencesWithinWindow({
        start,
        first: inc.nextDate,
        freq: inc.frequency,
        windowEnd,
      });
      for (const d of occ) {
        events.push({
          iso: toISO(d),
          kind: "income",
          label: inc.label,
          amount: amt,
        });
      }
    }

    // Bills events (non-vehicle)
    for (const b of bills) {
      if (!b.enabled) continue;
      if (b.id === "vehicle_costs") continue;
      const amt = moneyNumberOrNull(b.amount);
      if (amt === null) continue;
      if (!isValidISODate(b.dueDate)) continue;

      const occ = nextOccurrencesWithinWindow({
        start,
        first: b.dueDate,
        freq: b.frequency,
        windowEnd,
      });
      for (const d of occ) {
        events.push({
          iso: toISO(d),
          kind: "bill",
          label: b.label,
          amount: -amt,
        });
      }
    }

    // Vehicle sub-items (if enabled)
    if (vehicleEnabled) {
      const vehicleItems = [
        { label: "Vehicle payment / finance", amount: vehicle.finance, frequency: vehicle.financeFreq, due: vehicle.financeDue },
        { label: "Car insurance", amount: vehicle.insurance, frequency: vehicle.insuranceFreq, due: vehicle.insuranceDue },
        { label: "Car tax", amount: vehicle.tax, frequency: vehicle.taxFreq, due: vehicle.taxDue },
        { label: "Breakdown cover", amount: vehicle.breakdown, frequency: vehicle.breakdownFreq, due: vehicle.breakdownDue },
      ];

      for (const item of vehicleItems) {
        const amt = moneyNumberOrNull(item.amount);
        if (amt === null || amt === 0) continue;
        if (!isValidISODate(item.due)) continue;

        const occ = nextOccurrencesWithinWindow({
          start,
          first: item.due,
          freq: item.frequency,
          windowEnd,
        });

        for (const d of occ) {
          events.push({
            iso: toISO(d),
            kind: "bill",
            label: item.label,
            amount: -amt,
          });
        }
      }
    }

    // Sort events: by date, then conservative ordering
    const kindOrder = { bill: 0, spend: 0, goal: 0, whatif: 0, income: 1 };
    events.sort((a, b) => {
      if (a.iso < b.iso) return -1;
      if (a.iso > b.iso) return 1;
      if (kindOrder[a.kind] !== kindOrder[b.kind]) return kindOrder[a.kind] - kindOrder[b.kind];
      return a.label.localeCompare(b.label);
    });

    let running = opening;
    let lowest = opening;
    let lowestISO = toISO(start);

    const timeline = [{ iso: toISO(start), label: "Start", delta: 0, running }];

    for (const ev of events) {
      running += ev.amount;
      const prefix =
        ev.kind === "income"
          ? "Income"
          : ev.kind === "spend"
          ? "Spending"
          : ev.kind === "goal"
          ? "Goal"
          : ev.kind === "whatif"
          ? "What-if"
          : "Bill";

      timeline.push({
        iso: ev.iso,
        label: `${prefix} • ${ev.label}`,
        delta: ev.amount,
        running,
      });

      if (running < lowest) {
        lowest = running;
        lowestISO = ev.iso;
      }
    }

    // Allow negative values here (overdraft-aware). Safe number is still clamped separately.
    const mayBeAvailable = lowest;

    // Confidence: completeness + spending recency
    let missing = 0;
    let enabledCount = 0;

    for (const inc of incomes) {
      if (!inc.enabled) continue;
      enabledCount += 1;
      if (moneyNumberOrNull(inc.amount) === null) missing += 1;
      if (!isValidISODate(inc.nextDate)) missing += 1;
      if (!inc.frequency) missing += 1;
    }

    for (const b of bills) {
      if (!b.enabled) continue;
      enabledCount += 1;
      if (b.id === "vehicle_costs") continue;
      if (moneyNumberOrNull(b.amount) === null) missing += 1;
      if (!isValidISODate(b.dueDate)) missing += 1;
      if (!b.frequency) missing += 1;
    }

    if (vehicleEnabled) {
      const vehicleItems = [
        { amount: vehicle.finance, frequency: vehicle.financeFreq, due: vehicle.financeDue },
        { amount: vehicle.insurance, frequency: vehicle.insuranceFreq, due: vehicle.insuranceDue },
        { amount: vehicle.tax, frequency: vehicle.taxFreq, due: vehicle.taxDue },
        { amount: vehicle.breakdown, frequency: vehicle.breakdownFreq, due: vehicle.breakdownDue },
      ];
      for (const it of vehicleItems) {
        const amt = moneyNumberOrNull(it.amount);
        if (amt === null || amt === 0) continue;
        enabledCount += 1;
        if (!it.frequency) missing += 1;
        if (!isValidISODate(it.due)) missing += 1;
      }
    }

    // Goals completeness (if any are included)
    if (goalsEnabled && goals.length > 0) {
      for (const g of goals) {
        if (!g.includeInCalc) continue;
        const plan = goalPlansById[g.id];
        enabledCount += 1;
        if (!plan || !plan.ok) missing += 1;
      }
    }

    const today = todayISO();
    let lastSpendISO = null;
    for (const s of spendItems) {
      if (!isValidISODate(s.date)) continue;
      if (!lastSpendISO || s.date > lastSpendISO) lastSpendISO = s.date;
    }

    const daysSinceSpend = lastSpendISO ? daysBetweenISO(today, lastSpendISO) : null;

    let confidence = "High";
    const reasons = [];

    if (enabledCount === 0) {
      confidence = "Low";
      reasons.push("No income/bills are enabled yet.");
    } else {
      if (missing >= 3) {
        confidence = "Low";
        reasons.push("Some enabled items are missing an amount or date.");
      } else if (missing > 0) {
        confidence = "Medium";
        reasons.push("Some enabled items are missing details.");
      }
    }

    if (!lastSpendISO) {
      if (confidence === "High") confidence = "Medium";
      reasons.push("No spending has been logged yet, so day-to-day purchases aren’t reflected.");
    } else if (daysSinceSpend !== null) {
      if (daysSinceSpend >= 7) {
        if (confidence === "High") confidence = "Medium";
        else if (confidence === "Medium") confidence = "Low";
        reasons.push(`Last spending log was ${daysSinceSpend} days ago, so accuracy may be drifting.`);
      } else {
        reasons.push("Spending was logged recently, so day-to-day accuracy is stronger.");
      }
    }

    // Goals honesty
    if (goalsEnabled && goals.length > 0) {
      const included = goals.filter((g) => g.includeInCalc);
      const excluded = goals.filter((g) => !g.includeInCalc);
      if (excluded.length > 0) {
        reasons.push("Some savings goals are set but not included in calculations (so ‘may be available’ is more optimistic)." );
      }
      if (included.length === 0) {
        reasons.push("Savings goals are on, but none are included in calculations.");
      }
    }

    return {
      opening,
      windowEndISO: toISO(windowEnd),
      lowest,
      lowestISO,
      mayBeAvailable,
      confidence,
      timeline,
      reasons,
    };
  }

  const lookahead = useMemo(() => {
    return computeLookahead([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    startDate,
    balance,
    incomes,
    bills,
    vehicle,
    vehicleEnabled,
    spendItems,
    goalsEnabled,
    goals,
    goalPlansById,
  ]);


const proInsights = useMemo(() => {
  const tl = Array.isArray(lookahead?.timeline) ? lookahead.timeline : [];
  let incomeTotal = 0;
  let outgoingTotal = 0;
  let lowest = Number.isFinite(lookahead?.lowest) ? lookahead.lowest : null;

  // Highest running balance across the window (including opening)
  let highest = Number.isFinite(lookahead?.opening) ? lookahead.opening : null;

  // Top outgoing labels by absolute value (ignoring Income)
  const byOutLabel = new Map();

  // Top incoming labels by value (Income only)
  const byInLabel = new Map();

  for (const it of tl) {
    const d = Number(it?.delta || 0);
    if (!Number.isFinite(d) || d === 0) continue;

    if (d > 0) incomeTotal += d;
    if (d < 0) outgoingTotal += Math.abs(d);

    const running = Number(it?.running);
    if (Number.isFinite(running)) {
      if (highest === null || highest === undefined) highest = running;
      else highest = Math.max(highest, running);
    }

    const label = String(it?.label || "");
    const isIncome = label.startsWith("Income");

    // Outgoings
    if (!isIncome && d < 0) {
      const key = label.replace(/^[^•]+\s*•\s*/, "").trim() || label;
      byOutLabel.set(key, (byOutLabel.get(key) || 0) + Math.abs(d));
    }

    // Incoming (income rows only)
    if (isIncome && d > 0) {
      const key = label.replace(/^[^•]+\s*•\s*/, "").trim() || label;
      byInLabel.set(key, (byInLabel.get(key) || 0) + d);
    }
  }

  const topOut = Array.from(byOutLabel.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([label, amt]) => ({ label, amt }));

  const topIn = Array.from(byInLabel.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([label, amt]) => ({ label, amt }));

  const net = incomeTotal - outgoingTotal;
  return { incomeTotal, outgoingTotal, net, lowest, highest, topOut, topIn };
}, [lookahead]);
  const whatIfCanCompute = useMemo(() => {
    if (!whatIfChecked) return false;
    if (!isValidISODate(whatIfDate)) return false;
    if (moneyNumberOrNull(whatIfAmount) === null) return false;
    return true;
  }, [whatIfChecked, whatIfDate, whatIfAmount]);

  const whatIfLookahead = useMemo(() => {
    if (!whatIfCanCompute) return null;
    const amt = moneyNumberOrNull(whatIfAmount);
    if (amt === null) return null;

    const label = whatIfName.trim() ? whatIfName.trim() : "Purchase";
    const extra = [
      {
        iso: whatIfDate,
        kind: "whatif",
        label,
        amount: -amt,
      },
    ];

    return computeLookahead(extra);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [whatIfCanCompute, whatIfName, whatIfAmount, whatIfDate]);

    // UI styles (warm, premium, light)
  const cardStyle = {
    width: "100%",
    maxWidth: 720,
    margin: "0 auto",

    background:
      "linear-gradient(180deg, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0.06) 100%)",
    border: "1px solid rgba(226,232,240,0.14)",
    borderRadius: 24,
    padding: 24,
    boxSizing: "border-box",

    overflowX: "hidden",
    color: "rgba(241,245,249,0.92)",
    boxShadow:
      "0 30px 80px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.04) inset",

    backdropFilter: "blur(14px)",
    WebkitBackdropFilter: "blur(14px)",

    fontFamily:
      'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Arial, "Apple Color Emoji","Segoe UI Emoji"',
  };
  // Other essential bills (multi-add)
  function addOtherEssentialBill() {
    setBills((prev) => {
      const nextNum =
        prev.filter((b) => b.id.startsWith("other_essential_")).length + 1;
      const id = `other_essential_${nextNum}`;
      return [
        ...prev,
        {
          id,
          label: "Other essential bill",
          enabled: true,
          amount: "",
          frequency: "monthly",
          dueDate: todayISO(),
        },
      ];
    });
    setBillsSection("other");
  }

  function removeOtherEssentialBill(id) {
    setBills((prev) => prev.filter((b) => b.id !== id));
  }
;

  const inputStyle = {
  width: "100%",
  boxSizing: "border-box",
  marginTop: 6,
  padding: "12px 14px",
  borderRadius: 14,

  border: "1px solid rgba(226,232,240,0.18)",
  background: "rgba(15, 18, 32, 0.65)",
  color: "rgba(241,245,249,0.95)",

  fontSize: 14,
  outline: "none",
};


const selectStyle = {
  ...inputStyle,
  cursor: "pointer",
  appearance: "none",
  WebkitAppearance: "none",
  MozAppearance: "none",
  paddingRight: 38,
};

  const sectionBox = {
  marginTop: 14,
  padding: 14,
  borderRadius: 18,

  /* darker layer for separation */
  background: "rgba(10, 12, 22, 0.55)",
  border: "1px solid rgba(226, 232, 240, 0.10)",
  boxShadow: "0 10px 30px rgba(0,0,0,0.25) inset",
};

const labelStyle = {
  display: "flex",
  alignItems: "center",
  gap: 0,
  fontWeight: 700,
  cursor: "pointer",
};

  const subLabel = {
  display: "block",
  fontSize: 13,
                  fontWeight: 900,
  opacity: 0.82,
  color: "rgba(241,245,249,0.85)",
  letterSpacing: 0.2,
};

  const rowBox = {
  padding: 12,
  borderRadius: 16,

  background: "rgba(255,255,255,0.06)",
  border: "1px solid rgba(226, 232, 240, 0.10)",

  boxShadow:
    "0 10px 24px rgba(0,0,0,0.25), 0 0 0 1px rgba(255,255,255,0.03) inset",
};

  const helpBox = {
  marginTop: 12,
  padding: 14,
  borderRadius: 18,

  /* Dark, readable help surface that matches the premium theme */
  background: "linear-gradient(180deg, rgba(16, 26, 58, 0.72) 0%, rgba(11, 16, 38, 0.72) 100%)",
  border: "1px solid rgba(207, 231, 255, 0.16)",
  boxShadow: "0 14px 34px rgba(0,0,0,0.30), 0 0 0 1px rgba(255,255,255,0.04) inset",

  color: "rgba(241,245,249,0.92)",
};

  function renderHelp(title, lines) {
    return (
      <div style={helpBox}>
        <div style={{ fontWeight: 900, marginBottom: 6 }}>{title}</div>
        <ul style={{ marginTop: 0, marginBottom: 0, paddingLeft: 18, fontSize: 12, opacity: 0.92 }}>
          {lines.map((t, i) => (
            <li key={i} style={{ marginBottom: 6 }}>{t}</li>
          ))}
        </ul>
      </div>
    );
  }

  function renderStepper(activeStep) {
  let steps = [
    { n: 1, label: "Overview" },
    { n: 2, label: "Income" },
    { n: 3, label: "Fixed bills" },
    { n: 4, label: "Extras" },
    { n: 5, label: "Review" },
  ];

  if (isPro) steps = [...steps, { n: 6, label: "Calendar" }];

  const stepBtnStyle = (active) => ({
    width: "100%",
    boxSizing: "border-box",
    display: "inline-flex",
    justifyContent: "center",
    alignItems: "center",
    textAlign: "center",
    cursor: "pointer",
    appearance: "none",
    WebkitAppearance: "none",
    color: "inherit",
    padding: "10px 12px",
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,0.12)",
    background: active ? "rgba(47,122,127,0.28)" : "rgba(0,0,0,0.20)",
    opacity: active ? 1 : 0.9,
    fontSize: 13,
    fontWeight: 900,
  });

  // Custom layout on Page 1: tidy grid + full-width calendar
  if (activeStep === 1) {
    const gridItems = [
      { n: 1, label: "Overview" },
      { n: 5, label: "Review" },
      { n: 2, label: "Income" },
      { n: 3, label: "Fixed bills" },
    ];

    if (isPro) gridItems.push({ n: 6, label: "Calendar", full: true });

    return (
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 8,
          marginTop: 12,
          marginBottom: 14,
        }}
      >
        {gridItems.map((s) => {
          const active = s.n === activeStep;
          return (
            <button
              type="button"
              key={s.n}
              onClick={() => setStep(s.n)}
              aria-current={active ? "step" : undefined}
              style={{
                ...stepBtnStyle(active),
                gridColumn: s.full ? "1 / -1" : undefined,
              }}
            >
              {s.label}
            </button>
          );
        })}
      </div>
    );
  }

  // Default layout on other pages
  return (
    <div style={{ marginTop: 12, marginBottom: 14 }}>
      <div style={{ fontSize: 11, opacity: 0.65, marginBottom: 6, fontWeight: 700 }}>
        Quick action buttons
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
          gap: 8,
        }}
      >
        {steps
          .filter((s) => s.label !== "Extras")
          .map((s) => {
            const active = s.n === activeStep;
            return (
              <button
                type="button"
                key={s.n}
                onClick={() => setStep(s.n)}
                aria-current={active ? "step" : undefined}
                style={{
                  ...stepBtnStyle(active),
                  width: "100%",
                  display: "flex",
                  justifyContent: "center",
                  alignItems: "center",
                }}
              >
                {s.label}
              </button>
            );
          })}
      </div>
    </div>
  );
}



  return (
    <div className="appShell">
      
      <style>{`
        html, body { width: 100%; overflow-x: hidden; }
        *, *::before, *::after { box-sizing: border-box; }
        .appShell { width: 100%; overflow-x: hidden; }
        .ca-container { width: 100%; max-width: 980px; margin: 0 auto; padding-left: 12px; padding-right: 12px; }
        /* Mobile header + buttons */
        @media (max-width: 560px) {
          .caHeaderRow { flex-wrap: wrap !important; justify-content: center !important; }
          .caHeaderLeft { width: 100% !important; justify-content: center !important; }
          .caHeaderRight { width: 100% !important; justify-content: center !important; flex-wrap: wrap !important; }
          .headerActions { display: none !important; }
          .caTitle { font-size: 42px !important; text-align: center !important; }
           .caTitle { -webkit-text-stroke: 0px transparent !important; text-shadow: 0 0 10px rgba(255,255,255,0.35) !important; }
           .caModeLabel { margin-top: 2px !important; font-size: 18px !important; }
        }
        /* Modal scrolling on mobile */
        .caModalOverlay { overflow-y: auto !important; -webkit-overflow-scrolling: touch; align-items: flex-start !important; }
        .caModalCard { max-height: calc(100vh - 32px) !important; overflow-y: auto !important; }
      `}</style>
<div className="ca-container">

      {step === 1 && (
        <div style={cardStyle}>
          <div className="caHeaderRow" style={{ display: "flex", alignItems: "center", justifyContent: "flex-start", gap: 12 }}>
            <div className="caHeaderLeft" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 0, justifyContent: "center", textAlign: "center" }}>
              <h1 className="caTitle"
                style={{
  fontWeight: 900,
  fontSize: 50,                margin: 0,
  padding: 0,
// nearly double size
  lineHeight: 1,             // keeps it tight vertically
  color: "#a855f7",
  WebkitTextStroke: "0.5px rgba(255,255,255,0.55)",  // subtle edge (optional but nice)
  textShadow:
    "0 0 6px rgba(255,255,255,0.55), " +
    "0 0 14px rgba(255,255,255,0.35), " +
    "0 0 26px rgba(255,255,255,0.18)",
}}
              >
                ClearAhead
              </h1>
              <div className="caModeLabel" style={{ fontSize: 18, marginTop: 2, fontWeight: 900, color: "rgba(241,245,249,0.92)", opacity: 0.92 }}>
                {isPro ? "Pro" : "Basic"}
              </div>
            </div>

            <div className="caHeaderRight" style={{ display: "inline-flex", alignItems: "center", gap: 10, flexWrap: "wrap", justifyContent: "center" }}>
              <button
                type="button"
                onClick={handleShare}
                style={{
                  background: "#8b5cf6",
                  color: "white",
                  border: "none",
                  padding: "8px 14px",
                  borderRadius: 999,
                  fontWeight: 800,
                  cursor: "pointer",
                  whiteSpace: "normal",
                display: "block",
                }}
              >
                Share
              </button>

              {!isPro ? (
                <button
                  type="button"
                  onClick={() => setShowProInfo(true)}
                  title="ClearAhead Pro"
                  style={{
                    background: "rgba(168,85,247,0.18)",
                    color: "rgba(241,245,249,0.96)",
                    border: "1px solid rgba(168,85,247,0.45)",
                    padding: "8px 14px",
                    borderRadius: 999,
                    fontWeight: 900,
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                    overflowWrap: "normal",
                  }}
                >
                  Go Pro
                </button>
              ) : (
                <div
                  title="ClearAhead Pro edition"
                  style={{
                    background: "rgba(168,85,247,0.18)",
                    color: "rgba(241,245,249,0.96)",
                    border: "1px solid rgba(168,85,247,0.45)",
                    padding: "8px 14px",
                    borderRadius: 999,
                    fontWeight: 900,
                    whiteSpace: "nowrap",
                  }}
                >
                  Pro
                </div>
              )}

              <button
                type="button"
                onClick={() => setShowAbout(true)}
                style={{
                  background: "#8b5cf6",
                  color: "white",
                  border: "none",
                  padding: "8px 14px",
                  borderRadius: 999,
                  fontWeight: 800,
                  cursor: "pointer",
                  whiteSpace: "normal",
                overflowWrap: "anywhere",
                }}
              >
                About
              </button>
            </div>
          </div>

          {shareStatus && (
            <div style={{ fontSize: 12, opacity: 0.8, marginTop: 8 }}>
              {shareStatus}
            </div>
          )}
          <div style={{ marginTop: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: "rgba(255,255,255,0.95)", marginBottom: 6 }}>
              Quick action buttons
            </div>
            <div style={{ display: "grid", gap: 8 }}>
              <button
                type="button"
                onClick={() => { setFocusSection("spend"); goTo(4); }}
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  display: "inline-flex",
                  justifyContent: "center",
                  textAlign: "center",
                  cursor: "pointer",
                  appearance: "none",
                  WebkitAppearance: "none",
                  color: "inherit",
                  alignItems: "center",
                  gap: 0,
                  padding: "10px 12px",
                  borderRadius: 999,
                  border: "1px solid rgba(255,255,255,0.12)",
                  background: "rgba(0,0,0,0.20)",
                  opacity: 0.92,
                  fontSize: 13,
                  fontWeight: 900,
                }}
              >
                <div
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: 999,
                    display: "none",
                    alignItems: "center",
                    justifyContent: "center",
                    fontWeight: 900,
                    fontSize: 13,
                  fontWeight: 900,
                    background: "rgba(255,255,255,0.10)",
                  }}
                >
                  L
                </div>
                <div style={{ fontWeight: 800 }}>Log spending</div>
              </button>

              <button
                type="button"
                onClick={() => { setFocusSection("whatif"); goTo(4); }}
                title="What if I buy this?"
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  display: "inline-flex",
                  justifyContent: "center",
                  textAlign: "center",
                  cursor: "pointer",
                  appearance: "none",
                  WebkitAppearance: "none",
                  color: "inherit",
                  alignItems: "center",
                  gap: 0,
                  padding: "10px 12px",
                  borderRadius: 999,
                  border: "1px solid rgba(255,255,255,0.12)",
                  background: "rgba(0,0,0,0.20)",
                  opacity: 0.92,
                  fontSize: 13,
                  fontWeight: 900,
                }}
              >
                <div
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: 999,
                    display: "none",
                    alignItems: "center",
                    justifyContent: "center",
                    fontWeight: 900,
                    fontSize: 12,
                    background: "rgba(255,255,255,0.10)",
                  }}
                >
                  W
                </div>
                <div style={{ fontWeight: 800 }}>What if I buy this?</div>
              </button>

              <button
                type="button"
                onClick={() => { setFocusSection("goals"); goTo(4); }}
                style={{
                  display: "inline-flex",
                  cursor: "pointer",
                  appearance: "none",
                  WebkitAppearance: "none",
                  color: "inherit",
                  alignItems: "center",
                  justifyContent: "center",
                  textAlign: "center",
                  lineHeight: 1.1,
                  
                  gap: 0,
                  padding: "6px 10px",
                  borderRadius: 999,
                  border: "1px solid rgba(255,255,255,0.12)",
                  background: "rgba(0,0,0,0.20)",
                  opacity: 0.92,
                  fontSize: 12,
                }}
              >
                <div
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: 999,
                    display: "none",
                    alignItems: "center",
                    justifyContent: "center",
                    fontWeight: 900,
                    fontSize: 12,
                    background: "rgba(255,255,255,0.10)",
                  }}
                >
                  G
                </div>
                <div style={{ fontWeight: 800 }}>Savings goals</div>
              </button>
            </div>
          </div>

          {renderStepper(1)}
          {renderHelp("What to do here", ["Enter the date you want to start from (today is fine).", "Enter your current bank balance right now.", "Then tap Continue to add income and bills."])}


          <div
  style={{
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    marginTop: 10,
    padding: "6px 10px",
    borderRadius: 999,
    border: "1px solid rgba(226,232,240,0.12)",
    background: "rgba(255,255,255,0.06)",
    fontSize: 12,
    opacity: 0.9,
  }}
>
  Page 1 of 5
</div>
          <p style={{ opacity: 0.88, marginTop: 8 }}>Bills come first. ClearAhead shows what may be available after we look ahead for the next {effectiveLookaheadWeeks} weeks.</p>



          <div style={{ marginTop: 16, display: "grid", gap: 12, width: "100%", maxWidth: "100%", boxSizing: "border-box" }}>
            <div>
              <label style={subLabel}>Start date</label>
              <input type="date" value={startDate} onChange={(e) => {
                const v = e.target.value;
                setStartDate(v);
                setStartDateAuto(v === todayISO());
              }} style={inputStyle} />
            </div>

            <div>
              <label style={subLabel}>Current balance ({caCurrencySymbol})</label>
              <input value={balance} onChange={(e) => setBalance(sanitizeMoneyInput(e.target.value))} inputMode="decimal" placeholder="e.g. 943.33" style={inputStyle} />
            </div>

            <button
  disabled={!canContinueStep1}
  onClick={() => goTo(2)}
  style={{
    marginTop: 8,
    padding: 12,
    borderRadius: 12,
    border: "none",
    cursor: canContinueStep1 ? "pointer" : "not-allowed",
    opacity: canContinueStep1 ? 1 : 0.45,
    background:
      "linear-gradient(135deg, rgba(168,85,247,0.95), rgba(99,102,241,0.95))",
    color: "white",
    boxShadow: "0 12px 30px rgba(99,102,241,0.45)",
    fontWeight: 800,
    width: "100%",
    boxSizing: "border-box",
  }}
>
  Continue
</button>

<button
  onClick={() => goTo(5)}
  style={{
    marginTop: 10,
    padding: 10,
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.18)",
    background: "rgba(255,255,255,0.06)",
    color: "white",
    width: "100%",
    boxSizing: "border-box",
    cursor: "pointer",
    opacity: 0.92,
    fontWeight: 800,
  }}
>
  Go to Review
</button>

            <div style={{ fontSize: 12, opacity: 0.65 }}>v1.20</div>

          {/* Pro feature: Lookahead window slider (Basic locked to 5 weeks) */}
          <div style={{ marginTop: 14, padding: "10px 12px", borderRadius: 14, border: "1px solid rgba(148,163,184,0.22)", background: "rgba(15,23,42,0.35)" }}>
            <div style={{ fontWeight: 900, fontSize: 13, opacity: 0.92 }}>Lookahead window</div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginTop: 8 }}>
              <input
                type="range"
                min={5}
                max={12}
                step={1}
                value={effectiveLookaheadWeeks}
                disabled={!isPro}
                onChange={(e) => {
                  const n = parseInt(e.target.value, 10);
                  setProLookaheadWeeks(Number.isFinite(n) ? Math.min(12, Math.max(5, n)) : 5);
                }}
                style={{ width: "100%", maxWidth: 260, boxSizing: "border-box", cursor: isPro ? "pointer" : "not-allowed" }}
              />
              <div style={{ fontWeight: 900, fontSize: 13 }}>
                {effectiveLookaheadWeeks} weeks
              </div>
              {!isPro && (
                <div style={{ fontSize: 12, opacity: 0.82 }}>
                  Basic is locked to 5 weeks • Pro can extend to 12
                </div>
              )}
            </div>
          </div>
<div style={{ marginTop: 10, padding: 12, borderRadius: 12, border: "1px solid rgba(255,255,255,0.10)", background: "rgba(0,0,0,0.12)", width: "100%", boxSizing: "border-box" }}>
            <div style={{ fontSize: 12, opacity: 0.8 }}>Window</div>
            <div style={{ fontWeight: 800 }}>
              {displayUKDate(startDate)} → {displayUKDate(lookahead.windowEndISO)}
            </div>

            <div
  style={{
    marginTop: 14,
    fontSize: 12,
    letterSpacing: 0.3,
    textTransform: "uppercase",
    opacity: 0.65,
  }}
>
  Available now
</div>

<div
  style={{
    fontSize: 40,
    fontWeight: 900,
    letterSpacing: -0.8,
    marginTop: 2,
    color: "rgba(241,245,249,0.98)",
  }}
>
  {formatMoney(lookahead.mayBeAvailable.toFixed(2))}
</div>

<div style={{ marginTop: 10, fontSize: 12, letterSpacing: 0.3, textTransform: "uppercase", opacity: 0.65 }}>
  Safe number
</div>
<div style={{ fontSize: 32, fontWeight: 900, letterSpacing: -0.6, marginTop: 2, color: "rgba(241,245,249,0.98)" }}>
  {formatMoney(Math.max(0, lookahead.mayBeAvailable - 250).toFixed(2))}
</div>
{lookahead.mayBeAvailable > 0 && lookahead.mayBeAvailable - 250 <= 0 && (
  <div style={{ marginTop: 8, fontSize: 12, opacity: 0.88, lineHeight: 1.35 }}>
    <div style={{ fontWeight: 800 }}>You still have Available now to use.</div>
    <div>Safe to spend is £0 because ClearAhead is holding back a little for safety.</div>
  </div>
)}
<div style={{ marginTop: 6, fontSize: 12, opacity: 0.78, lineHeight: 1.35 }}>
  Safe number is a cautious guide — it leaves a small {formatMoney(250)} buffer aside for surprises.
</div>
<div style={{ marginTop: 6, fontSize: 12, opacity: 0.78, lineHeight: 1.35 }}>
  Available now is your projected amount across the next {effectiveLookaheadWeeks} weeks, before the safety buffer.
</div>

            <div style={{ marginTop: 10, fontSize: 12, opacity: 0.8 }}>Lowest projected balance in next {effectiveLookaheadWeeks} weeks</div>
            <div style={{ fontWeight: 800 }}>
              {formatMoney(lookahead.lowest.toFixed(2))} on {displayUKDate(lookahead.lowestISO)}
            </div>

            <div style={{ marginTop: 10, fontSize: 12, opacity: 0.8 }}>Confidence</div>
            <div style={{ fontWeight: 800 }}>{lookahead.confidence}</div>

            <div style={{ marginTop: 8, fontSize: 12, opacity: 0.8 }}>
              Why this confidence:
              <ul style={{ marginTop: 6, marginBottom: 0, paddingLeft: 18 }}>
                {lookahead.reasons.map((r, i) => (
                  <li key={i} style={{ marginBottom: 4 }}>
                    {r}
                  </li>
                ))}
              </ul>
            </div>

            <div style={{ marginTop: 10, fontSize: 12, opacity: 0.75 }}>
              Gentle nudge: If possible, keeping a small buffer can help with surprises (repairs, school costs) and future plans.
            </div>

            {lookahead.lowest < 0 && (
              <div style={{ marginTop: 12, padding: 10, borderRadius: 12, border: "1px solid rgba(255,170,0,0.35)", background: "rgba(255,170,0,0.10)" }}>
                <div style={{ fontWeight: 900 }}>⚠️ Tight period detected</div>
                <div style={{ fontSize: 12, opacity: 0.85, marginTop: 6 }}>
                  Based on what’s entered (including spending + goals if included), the projection dips below {formatMoney(0)} at least once in the next {effectiveLookaheadWeeks} weeks.
                </div>
              </div>
            )}
          </div>
          <div style={{ marginTop: 14, display: "block", gap: 10 }}>
  <div style={{ fontWeight: 900, opacity: 0.92, display: "none" }}>Quick actions</div>

  <button
    onClick={() => {
  setFocusSection("spend");
  goTo(4);
}}
    style={{
      display: "none",
      padding: 12,
      borderRadius: 14,
      border: "1px solid rgba(255,255,255,0.18)",
      background: "rgba(255,255,255,0.06)",
      color: "white",
      cursor: "pointer",
      fontWeight: 900,
      width: "100%",
    }}
  >
    Log spending
  </button>

  <button
    onClick={() => {
  setFocusSection("whatif");
  goTo(4);
}}
    style={{
      display: "none",
      padding: 12,
      borderRadius: 14,
      border: "1px solid rgba(255,255,255,0.18)",
      background: "rgba(255,255,255,0.06)",
      color: "white",
      cursor: "pointer",
      fontWeight: 900,
      width: "100%",
    }}
  >
    What if I buy this?
  </button>

  <button
    onClick={() => {
  setFocusSection("goals");
  // v1.23 — Savings goals quick action should open Extras (step 4), not Bills
  goTo(4);
}}
    style={{
      display: "none",
      padding: 12,
      borderRadius: 14,
      border: "1px solid rgba(255,255,255,0.18)",
      background: "rgba(255,255,255,0.06)",
      color: "white",
      cursor: "pointer",
      fontWeight: 900,
      width: "100%",
    }}
  >
    Savings goals
  </button>

  <div style={{ fontSize: 12, opacity: 0.75, display: "none" }}>
    Tip: you can come back here any time — this is your home screen.
  </div>
<div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 10, width: "100%", boxSizing: "border-box", flexWrap: "wrap" }}>
  <button
    type="button"
    onClick={() => setShowDisclaimer(true)}
    style={{
      padding: "6px 12px",
      borderRadius: 999,
      border: "1px solid rgba(255,255,255,0.25)",
      background: "rgba(255,255,255,0.12)",
      color: "white",
      fontWeight: 700,
      cursor: "pointer",
      fontSize: 12,
    }}
  >
    Disclaimer
  </button>

  <button
    type="button"
    onClick={() => {
      const ok = window.confirm(
        "This will clear ALL your data and let you start fresh.\n\nThis cannot be undone. Are you sure?"
      );
      if (!ok) return;

      try {
        localStorage.clear();
      } catch (e) {
        // ignore
      }
      window.location.reload();
    }}
    style={{
      padding: "6px 12px",
      borderRadius: 999,
      border: "1px solid rgba(255,255,255,0.25)",
      background: "rgba(255,255,255,0.12)",
      color: "white",
      fontWeight: 700,
      cursor: "pointer",
      fontSize: 12,
    }}
  >
    Clear all data
  </button>
</div>

</div>
            
          </div>
        </div>
      )}

      {step === 2 && (
  <div style={cardStyle}>
    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "flex-start", gap: 12, flexWrap: "wrap" }}>
          <h1 style={{ margin: 0, color: "#a855f7", WebkitTextStroke: "0.5px rgba(255,255,255,0.55)", textShadow: "0 0 6px rgba(255,255,255,0.55), 0 0 14px rgba(255,255,255,0.35), 0 0 26px rgba(255,255,255,0.18)" }}>ClearAhead</h1>
        </div>

    {renderStepper(2)}

    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        marginTop: 10,
        padding: "6px 10px",
        borderRadius: 999,
        border: "1px solid rgba(226,232,240,0.12)",
        background: "rgba(255,255,255,0.06)",
        fontSize: 12,
        opacity: 0.9,
      }}
    >
      Page 2 of 5
    </div>

    <p style={{ opacity: 0.88, marginTop: 8 }}>
      Tick only what applies to you. This keeps the safety number honest and calm.
    </p>

    <div style={{ fontSize: 12, opacity: 0.7, marginTop: 6 }}>
      Start date: <strong>{displayUKDate(startDate)}</strong> • Current balance:{" "}
      <strong>{formatMoney(balance || "—")}</strong>
    </div>

    {renderHelp("Quick tip", [
      "Enable only the income you really get.",
      "Add the amount, frequency, and next payment date.",
      "You can add spending later on the home screen quick actions.",
    ])}

    {/* ✅ INCOME SECTION (grouped) */}
          
{/* ✅ INCOME SECTION (grouped) */}

<div style={sectionBox}>
  <div style={{ fontWeight: 900, marginBottom: 10 }}>Income</div>

  <IncomeGroupButton
    id="wage"
    title="Wage / Salary"
    subtitle="One or more jobs (add / edit / remove)"
    incomeSection={incomeSection}
    setIncomeSection={setIncomeSection}
    setActiveIncomeId={setActiveIncomeId}
  />
  {incomeSection === "wage" && (
    <div style={{ marginBottom: 14 }}>
{/* Wage / Salary (multi jobs: add / edit / remove) */}
{(() => {
  const wageJobs = incomes.filter((x) => x.type === "wage_job");
  const hasJobs = wageJobs.length > 0;

  const checkboxChecked = hasJobs ? true : wageAddOpen;

  const addJob = () => {
    // Validate minimal requirements (match other income rules)
    if (moneyNumberOrNull(wageDraft.amount) === null) return;
    if (!wageDraft.frequency) return;
    if (!isValidISODate(wageDraft.nextDate)) return;

    const newId = `wage_job_${Date.now()}`;

    setIncomes((prev) => [
      ...prev,
      {
        id: newId,
        type: "wage_job",
        label: (wageDraft.label || "Wage / Salary").trim() || "Wage / Salary",
        enabled: true,
        amount: wageDraft.amount,
        frequency: wageDraft.frequency,
        nextDate: wageDraft.nextDate,
      },
    ]);

    // Clear + close (calm UX like other add flows)
    setWageDraft({
      label: "Wage / Salary",
      amount: "",
      frequency: "monthly",
      nextDate: todayISO(),
    });
    setWageAddOpen(false);
  };

  const removeJob = (id) => {
    setIncomes((prev) => prev.filter((x) => x.id !== id));
    if (wageEditingId === id) setWageEditingId(null);
  };

  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <input
          type="checkbox"
          checked={checkboxChecked}
          disabled={hasJobs}
          onChange={(e) => {
            // This checkbox is only used to START the first job entry.
            // Once jobs exist, we keep it checked (calm + predictable) and use Remove per job.
            const next = e.target.checked;
            if (!hasJobs) setWageAddOpen(next);
          }}
        />
        <div style={{ fontWeight: 900 }}>Wage / Salary</div>
      </label>

      {/* Saved jobs (closed view) */}
      {hasJobs && (
        <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
          {wageJobs.map((job) => {
            const isEditing = wageEditingId === job.id;

            return (
              <div
                key={job.id}
                style={{
                  border: "1px solid rgba(226,232,240,0.12)",
                  background: "rgba(255,255,255,0.04)",
                  borderRadius: 14,
                  padding: 12,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-start", gap: 12 }}>
                  <div style={{ fontWeight: 900 }}>
                    {job.label || "Wage / Salary"}{" "}
                    <span style={{ fontWeight: 600, opacity: 0.75, display: "block", marginTop: 4, wordBreak: "break-word" }}>
                      • {formatMoney(job.amount || "—")} • {prettyFrequency(job.frequency)} • {displayUKDate(job.nextDate)}
                    </span>
                  </div>

                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                    <button
                      type="button"
                      onClick={() => setWageEditingId(isEditing ? null : job.id)}
                      className="caBtn caBtnGhost"
                    >
                      {isEditing ? "Done" : "Edit"}
                    </button>

                    <button
                      type="button"
                      onClick={() => removeJob(job.id)}
                      className="caBtn caBtnGhost"
                    >
                      Remove
                    </button>
                  </div>
                </div>

                {isEditing && (
                  <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                    <div>
                      <div style={labelStyle}>Job label</div>
                      <input
                        value={job.label || ""}
                        onChange={(e) =>
                          setIncomes((prev) =>
                            prev.map((it) =>
                              it.id === job.id ? { ...it, label: e.target.value } : it
                            )
                          )
                        }
                        placeholder="e.g. Job 1"
                        style={inputStyle}
                      />
                    </div>

                    <div>
                      <div style={labelStyle}>Amount ({caCurrencySymbol})</div>
                      <input
                        value={job.amount}
                        onChange={(e) =>
                          setIncomes((prev) =>
                            prev.map((it) =>
                              it.id === job.id ? { ...it, amount: sanitizeMoneyInput(e.target.value) } : it
                            )
                          )
                        }
                        placeholder="e.g. 1500"
                        inputMode="decimal"
                        pattern="[0-9]*"
                        style={inputStyle}
                      />
                    </div>

                    <div>
                      <div style={labelStyle}>Frequency</div>
                      <select
                        value={job.frequency}
                        onChange={(e) =>
                          setIncomes((prev) =>
                            prev.map((it) =>
                              it.id === job.id ? { ...it, frequency: e.target.value } : it
                            )
                          )
                        }
                        style={selectStyle}
                      >
                        <option value="">Select…</option>
                        {freqOptions.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <div style={labelStyle}>Next payment date</div>
                      <input
                        type="date"
                        value={job.nextDate}
                        onChange={(e) =>
                          setIncomes((prev) =>
                            prev.map((it) =>
                              it.id === job.id ? { ...it, nextDate: e.target.value } : it
                            )
                          )
                        }
                        style={inputStyle}
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          <button
            type="button"
            onClick={() => setWageAddOpen(true)}
            className="caBtn caBtnPrimary"
            style={{ justifySelf: "start" }}
          >
            + Add another job
          </button>
        </div>
      )}

      {/* Add job form (opens, then closes after Add) */}
      {wageAddOpen && (
        <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
          <div>
            <div style={labelStyle}>Job label</div>
            <input
              value={wageDraft.label}
              onChange={(e) => setWageDraft((p) => ({ ...p, label: e.target.value }))}
              placeholder="e.g. Wage / Salary"
              style={inputStyle}
            />
          </div>

          <div>
            <div style={labelStyle}>Amount ({caCurrencySymbol})</div>
            <input
              value={wageDraft.amount}
              onChange={(e) => setWageDraft((p) => ({ ...p, amount: sanitizeMoneyInput(e.target.value) }))}
              inputMode="decimal"
              pattern="[0-9]*"
              placeholder="e.g. 1500"
              style={inputStyle}
            />
          </div>

          <div>
            <div style={labelStyle}>Frequency</div>
            <select
              value={wageDraft.frequency}
              onChange={(e) => setWageDraft((p) => ({ ...p, frequency: e.target.value }))}
              style={selectStyle}
            >
              <option value="">Select…</option>
              {freqOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <div style={labelStyle}>Next payment date</div>
            <input
              type="date"
              value={wageDraft.nextDate}
              onChange={(e) => setWageDraft((p) => ({ ...p, nextDate: e.target.value }))}
              style={inputStyle}
            />
          </div>

          <div style={{ display: "flex", gap: 10 }}>
            <button type="button" onClick={addJob} className="caBtn caBtnPrimary">
              Add
            </button>

            <button
              type="button"
              onClick={() => {
                setWageAddOpen(false);
                setWageDraft({
                  label: "Wage / Salary",
                  amount: "",
                  frequency: "monthly",
                  nextDate: todayISO(),
                });
              }}
              className="caBtn caBtnGhost"
            >
              Done
            </button>
          </div>
        </div>
      )}

      {/* If no jobs and add form is closed, show a calm helper line */}
      {!hasJobs && !wageAddOpen && (
        <div style={{ marginTop: 8, fontSize: 12, opacity: 0.75 }}>
          Tick Wage / Salary to add your first job.
        </div>
      )}
    </div>
  );
})()}
    </div>
  )}

  <IncomeGroupButton
    id="benefits"
    title="Government benefits"
    subtitle="Universal Credit, PIP, Child Benefit, ESA, etc."
    incomeSection={incomeSection}
    setIncomeSection={setIncomeSection}
    setActiveIncomeId={setActiveIncomeId}
  />
  {incomeSection === "benefits" && (
    <div style={{ marginBottom: 14, display: "grid", gap: 10 }}>
      {(() => {
        const benefitIds = [
          "universal_credit",
          "pip",
          "attendance_allowance",
          "carers_allowance",
          "child_benefit",
          "esa",
          "jsa",
          "housing_benefit",
          "pension_credit",
          "income_support",
          "maternity_allowance",
          "state_pension",
          "dla",
        ];
        const benefits = incomes.filter((x) => benefitIds.includes(x.id));
        return benefits.map((b) => (
          <IncomeItemDetails
            key={b.id}
            income={b}
            allowRemove={false}
            updateIncome={updateIncome}
            removeOtherIncome={removeOtherIncome}
            freqOptions={freqOptions}
            inputStyle={inputStyle}
            subLabel={subLabel}
            selectStyle={selectStyle}
            rowBox={rowBox}
            activeIncomeId={activeIncomeId}
            setActiveIncomeId={setActiveIncomeId}
          />
        ));
      })()}
    </div>
  )}

  <IncomeGroupButton
    id="other"
    title="Other income"
    subtitle="Child maintenance, side work, refunds, support from family"
    incomeSection={incomeSection}
    setIncomeSection={setIncomeSection}
    setActiveIncomeId={setActiveIncomeId}
  />
  {incomeSection === "other" && (
    <div style={{ marginBottom: 14, display: "grid", gap: 10 }}>
      <button
        type="button"
        onClick={addOtherIncome}
        style={{
          width: "100%",
          padding: 12,
          borderRadius: 12,
          border: "1px solid rgba(255,255,255,0.14)",
          background: "rgba(0,0,0,0.18)",
          color: "rgba(241,245,249,0.95)",
          fontWeight: 800,
          cursor: "pointer",
        }}
      >
        + Add other income
      </button>

      {incomes
        .filter((x) => (x.id || "").startsWith("other_income_"))
        .map((it) => (
          <IncomeItemDetails
            key={it.id}
            income={it}
            allowRemove={true}
            updateIncome={updateIncome}
            removeOtherIncome={removeOtherIncome}
            freqOptions={freqOptions}
            inputStyle={inputStyle}
            subLabel={subLabel}
            selectStyle={selectStyle}
            rowBox={rowBox}
            activeIncomeId={activeIncomeId}
            setActiveIncomeId={setActiveIncomeId}
          />
        ))}
    </div>
  )}
</div>


{!canContinueStep2 && step2Errors.length > 0 && (
      <div
        style={{
          marginTop: 14,
          padding: 12,
          borderRadius: 12,
          border: "1px solid rgba(255,170,0,0.35)",
          background: "rgba(255,170,0,0.10)",
        }}
      >
        <div style={{ fontWeight: 900, marginBottom: 6 }}>Can’t continue yet</div>
        <div style={{ fontSize: 12, opacity: 0.9, marginBottom: 8 }}>
          Fix the items below and the Continue button will unlock.
        </div>
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, opacity: 0.9 }}>
          {step2Errors.slice(0, 6).map((e, i) => (
            <li key={i} style={{ marginBottom: 4 }}>
              {e}
            </li>
          ))}
        </ul>
        <div style={{ marginTop: 10, fontSize: 12, opacity: 0.85 }}>
          Number tip: you can type <strong>2900</strong>, <strong>2,900</strong>,{" "}
          <strong>2.900</strong>, or <strong>2 900,50</strong>.
        </div>
      </div>
    )}

    <button
      disabled={!canContinueStep2}
      onClick={() => goTo(3)}
      style={{
        marginTop: 14,
        padding: 12,
        borderRadius: 12,
        border: "none",
        cursor: canContinueStep2 ? "pointer" : "not-allowed",
        opacity: canContinueStep2 ? 1 : 0.45,
        background: "#2f7a7f",
        color: "white",
        fontWeight: 800,
        width: "100%",
      }}
    >
      Continue
    </button>

    <button
      onClick={() => goTo(1)}
      style={{
        marginTop: 10,
        padding: 10,
        borderRadius: 12,
        border: "1px solid rgba(255,255,255,0.15)",
        background: "transparent",
        color: "white",
        width: "100%",
        cursor: "pointer",
        opacity: 0.9,
      }}
    >
      Back
    </button>
  </div>
)}
{step === 3 && (
  <div style={cardStyle}>
    <h2 style={{ marginTop: 0 }}>Fixed bills</h2>

    {renderStepper(3)}

    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        marginTop: 10,
        padding: "6px 10px",
        borderRadius: 999,
        border: "1px solid rgba(226,232,240,0.12)",
        background: "rgba(255,255,255,0.06)",
        fontSize: 12,
        opacity: 0.9,
      }}
    >
      Page 3 of 5
    </div>

    <p style={{ opacity: 0.88, marginTop: 8 }}>
      Tick your essential fixed bills. We use these to keep the “may be available” number safe.
    </p>

    <div style={{ fontSize: 12, opacity: 0.7, marginTop: 6 }}>
      Start date: <strong>{displayUKDate(startDate)}</strong> • Current balance:{" "}
      <strong>{formatMoney(balance || "—")}</strong>
    </div>

    {renderHelp("Quick tip", [
      "Only include bills you MUST pay (rent, council tax, utilities).",
      "If a bill changes a lot, you can log it later as Spending instead.",
      "If you tick Vehicle costs, you’ll be able to enter finance/insurance/tax/breakdown separately.",
    ])}
<div style={sectionBox}>
  <div style={{ fontWeight: 900, marginBottom: 10 }}>Bills</div>

  {(() => {
    const getBill = (id) => bills.find((b) => b.id === id);

    const utilityIds = ["gas", "electric", "water", "internet", "tv_licence"];
    const personalIds = ["phone", "home_insurance", "child_maintenance"];
    const otherFixedIds = ["rent_housing", "council_tax"];
    const creditId = "creditCards";

    const otherCustom = bills.filter((b) => b.id.startsWith("other_essential_"));
    return (
      <div>
        {/* --- GROUP 1: Utility bills --- */}
        <BillsGroupButton id="utility" title="Utility bills" subtitle="Gas, electric, water, internet, TV licence"  billsSection={billsSection} setBillsSection={setBillsSection} setActiveBillId={setActiveBillId} />
        {billsSection === "utility" && (
          <div style={{ marginBottom: 14 }}>
            {utilityIds.map((id) => (
              <BillsBillDetails key={id} bill={getBill(id)}  updateBill={updateBill} removeOtherEssentialBill={removeOtherEssentialBill} freqOptions={freqOptions} inputStyle={inputStyle} subLabel={subLabel} rowBox={rowBox} activeBillId={activeBillId} setActiveBillId={setActiveBillId} />
            ))}
          </div>
        )}

        {/* --- GROUP 2: Personal bills --- */}
        <BillsGroupButton id="personal" title="Personal bills" subtitle="Phone, home insurance, child maintenance"  billsSection={billsSection} setBillsSection={setBillsSection} setActiveBillId={setActiveBillId} />
        {billsSection === "personal" && (
          <div style={{ marginBottom: 14 }}>
            {personalIds.map((id) => (
              <BillsBillDetails key={id} bill={getBill(id)}  updateBill={updateBill} removeOtherEssentialBill={removeOtherEssentialBill} freqOptions={freqOptions} inputStyle={inputStyle} subLabel={subLabel} rowBox={rowBox} activeBillId={activeBillId} setActiveBillId={setActiveBillId} />
            ))}
          </div>
        )}

        {/* --- GROUP 3: Vehicle (must be above other essential bills) --- */}
        <BillsGroupButton id="vehicle" title="Vehicle" subtitle="Finance, insurance, tax, breakdown (separate inputs)"  billsSection={billsSection} setBillsSection={setBillsSection} setActiveBillId={setActiveBillId} />
        {billsSection === "vehicle" && (
          <div style={{ marginBottom: 14 }}>
            {(() => {
              const b = getBill("vehicle_costs");
              if (!b) return null;
              const enabled = !!b.enabled;

              return (
                <div style={{ ...rowBox, marginBottom: 10, opacity: enabled ? 1 : 0.55 }}>
                  <label style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <input
                      type="checkbox"
                      checked={enabled}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        updateBill("vehicle_costs", { enabled: checked });
                        // When enabling, open the section so the user can add details.
                        // When disabling, close the section (this intentionally removes totals).
                        setVehicleSectionOpen(checked);
                        if (checked) updateBill("vehicle_costs", { amount: vehicleTotal ? String(vehicleTotal) : "" });
                        else updateBill("vehicle_costs", { amount: "" });
                      }}
                    />
                    <span style={{ fontWeight: 900 }}>{b.label}</span>
                  </label>

                  {enabled && (
                    vehicleSectionOpen ? (
                      <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                      {/* Vehicle payment / finance */}
                      <div style={rowBox}>
                        <div style={{ display: "flex", justifyContent: "flex-start", alignItems: "center", gap: 10 }}>
                          <div style={{ fontWeight: 900 }}>Vehicle payment / finance</div>
                          {!vehicleOpen.finance && (moneyNumberOrNull(vehicle.finance) === null || moneyNumberOrNull(vehicle.finance) === 0) && (
                            <button
                              type="button"
                              className="caBtn caBtnPrimary"
                              onClick={() => setVehicleOpen((o) => ({ ...o, finance: true }))}
                            >
                              Add
                            </button>
                          )}
                        </div>

                        {!vehicleOpen.finance && moneyNumberOrNull(vehicle.finance) !== null && moneyNumberOrNull(vehicle.finance) !== 0 ? (
                          <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
                            <div style={{ fontWeight: 800 }}>
                              {formatMoney((moneyNumberOrNull(vehicle.finance) ?? 0).toFixed(2))} • {prettyFrequency(vehicle.financeFreq)} • {displayUKDate(vehicle.financeDue)}
                            </div>
                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                              <button
                                type="button"
                                className="caBtn caBtnGhost"
                                onClick={() => setVehicleOpen((o) => ({ ...o, finance: true }))}
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                className="caBtn caBtnDanger"
                                onClick={() => {
                                  const next = {
                                    ...vehicle,
                                    finance: "",
                                    financeFreq: "monthly",
                                    financeDue: todayISO(),
                                  };
                                  setVehicle(next);
                                  syncVehicleTotalIfEnabled(next);
                                  setVehicleOpen((o) => ({ ...o, finance: false }));
                                }}
                              >
                                Remove
                              </button>
                            </div>
                          </div>
                        ) : vehicleOpen.finance ? (
                          <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
                            <div>
                              <label style={subLabel}>Amount ({caCurrencySymbol})</label>
                              <input
                                value={vehicle.finance}
                                onChange={(e) => {
                                  const next = { ...vehicle, finance: e.target.value };
                                  setVehicle(next);
                                  syncVehicleTotalIfEnabled(next);
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    e.preventDefault();
                                    setVehicleOpen((o) => ({ ...o, finance: false }));
                                  }
                                }}
                                inputMode="decimal"
                                placeholder="e.g. 250"
                                style={inputStyle}
                              />
                            </div>

                            <div style={{ display: "grid", gridTemplateColumns: isNarrowMobile ? "1fr" : "1fr 1fr", gap: 10 }}>
                              <div>
                                <label style={subLabel}>Frequency</label>
                                <select
                                  value={vehicle.financeFreq}
                                  onChange={(e) => {
                                    const next = { ...vehicle, financeFreq: e.target.value };
                                    setVehicle(next);
                                    syncVehicleTotalIfEnabled(next);
                                  }}
                                  style={inputStyle}
                                >
                                  {freqOptions.map((o) => (
                                    <option key={o.value} value={o.value}>
                                      {o.label}
                                    </option>
                                  ))}
                                </select>
                              </div>
                              <div>
                                <label style={subLabel}>Next due date</label>
                                <input
                                  type="date"
                                  value={vehicle.financeDue}
                                  onChange={(e) => {
                                    const next = { ...vehicle, financeDue: e.target.value };
                                    setVehicle(next);
                                    syncVehicleTotalIfEnabled(next);
                                  }}
                                  style={inputStyle}
                                />
                              </div>
                            </div>

                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                              <button
                                type="button"
                                className="caBtn caBtnPrimary"
                                onClick={() => setVehicleOpen((o) => ({ ...o, finance: false }))}
                              >
                                {moneyNumberOrNull(vehicle.finance) !== null && moneyNumberOrNull(vehicle.finance) !== 0 ? "Save" : "Add"}
                              </button>

                              <button
                                type="button"
                                className="caBtn caBtnGhost"
                                onClick={() => {
                                  // If user opened the row but hasn't saved a valid amount, clear it on close.
                                  const amt = moneyNumberOrNull(vehicle.finance);
                                  if (amt === null || amt === 0) {
                                    const next = { ...vehicle, finance: "" };
                                    setVehicle(next);
                                    syncVehicleTotalIfEnabled(next);
                                  }
                                  setVehicleOpen((o) => ({ ...o, finance: false }));
                                }}
                              >
                                Close
                              </button>

                              {moneyNumberOrNull(vehicle.finance) !== null && moneyNumberOrNull(vehicle.finance) !== 0 && (
                                <button
                                  type="button"
                                  className="caBtn caBtnDanger"
                                  onClick={() => {
                                    const next = {
                                      ...vehicle,
                                      finance: "",
                                      financeFreq: "monthly",
                                      financeDue: todayISO(),
                                    };
                                    setVehicle(next);
                                    syncVehicleTotalIfEnabled(next);
                                    setVehicleOpen((o) => ({ ...o, finance: false }));
                                  }}
                                >
                                  Remove
                                </button>
                              )}
                            </div>
                          </div>
                        ) : null}
                      </div>

                      {/* Car insurance */}
                      <div style={rowBox}>
                        <div style={{ display: "flex", justifyContent: "flex-start", alignItems: "center", gap: 10 }}>
                          <div style={{ fontWeight: 900 }}>Car insurance</div>
                          {!vehicleOpen.insurance && (moneyNumberOrNull(vehicle.insurance) === null || moneyNumberOrNull(vehicle.insurance) === 0) && (
                            <button
                              type="button"
                              className="caBtn caBtnPrimary"
                              onClick={() => setVehicleOpen((o) => ({ ...o, insurance: true }))}
                            >
                              Add
                            </button>
                          )}
                        </div>

                        {!vehicleOpen.insurance && moneyNumberOrNull(vehicle.insurance) !== null && moneyNumberOrNull(vehicle.insurance) !== 0 ? (
                          <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
                            <div style={{ fontWeight: 800 }}>
                              {formatMoney((moneyNumberOrNull(vehicle.insurance) ?? 0).toFixed(2))} • {prettyFrequency(vehicle.insuranceFreq)} • {displayUKDate(vehicle.insuranceDue)}
                            </div>
                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                              <button
                                type="button"
                                className="caBtn caBtnGhost"
                                onClick={() => setVehicleOpen((o) => ({ ...o, insurance: true }))}
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                className="caBtn caBtnDanger"
                                onClick={() => {
                                  const next = {
                                    ...vehicle,
                                    insurance: "",
                                    insuranceFreq: "monthly",
                                    insuranceDue: todayISO(),
                                  };
                                  setVehicle(next);
                                  syncVehicleTotalIfEnabled(next);
                                  setVehicleOpen((o) => ({ ...o, insurance: false }));
                                }}
                              >
                                Remove
                              </button>
                            </div>
                          </div>
                        ) : vehicleOpen.insurance ? (
                          <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
                            <div>
                              <label style={subLabel}>Amount ({caCurrencySymbol})</label>
                              <input
                                value={vehicle.insurance}
                                onChange={(e) => {
                                  const next = { ...vehicle, insurance: e.target.value };
                                  setVehicle(next);
                                  syncVehicleTotalIfEnabled(next);
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    e.preventDefault();
                                    setVehicleOpen((o) => ({ ...o, insurance: false }));
                                  }
                                }}
                                inputMode="decimal"
                                placeholder="e.g. 45"
                                style={inputStyle}
                              />
                            </div>

                            <div style={{ display: "grid", gridTemplateColumns: isNarrowMobile ? "1fr" : "1fr 1fr", gap: 10 }}>
                              <div>
                                <label style={subLabel}>Frequency</label>
                                <select
                                  value={vehicle.insuranceFreq}
                                  onChange={(e) => {
                                    const next = { ...vehicle, insuranceFreq: e.target.value };
                                    setVehicle(next);
                                    syncVehicleTotalIfEnabled(next);
                                  }}
                                  style={inputStyle}
                                >
                                  {freqOptions.map((o) => (
                                    <option key={o.value} value={o.value}>
                                      {o.label}
                                    </option>
                                  ))}
                                </select>
                              </div>
                              <div>
                                <label style={subLabel}>Next due date</label>
                                <input
                                  type="date"
                                  value={vehicle.insuranceDue}
                                  onChange={(e) => {
                                    const next = { ...vehicle, insuranceDue: e.target.value };
                                    setVehicle(next);
                                    syncVehicleTotalIfEnabled(next);
                                  }}
                                  style={inputStyle}
                                />
                              </div>
                            </div>

                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                              <button
                                type="button"
                                className="caBtn caBtnPrimary"
                                onClick={() => setVehicleOpen((o) => ({ ...o, insurance: false }))}
                              >
                                {moneyNumberOrNull(vehicle.insurance) !== null && moneyNumberOrNull(vehicle.insurance) !== 0 ? "Save" : "Add"}
                              </button>

                              <button
                                type="button"
                                className="caBtn caBtnGhost"
                                onClick={() => {
                                  const amt = moneyNumberOrNull(vehicle.insurance);
                                  if (amt === null || amt === 0) {
                                    const next = { ...vehicle, insurance: "" };
                                    setVehicle(next);
                                    syncVehicleTotalIfEnabled(next);
                                  }
                                  setVehicleOpen((o) => ({ ...o, insurance: false }));
                                }}
                              >
                                Close
                              </button>

                              {moneyNumberOrNull(vehicle.insurance) !== null && moneyNumberOrNull(vehicle.insurance) !== 0 && (
                                <button
                                  type="button"
                                  className="caBtn caBtnDanger"
                                  onClick={() => {
                                    const next = {
                                      ...vehicle,
                                      insurance: "",
                                      insuranceFreq: "monthly",
                                      insuranceDue: todayISO(),
                                    };
                                    setVehicle(next);
                                    syncVehicleTotalIfEnabled(next);
                                    setVehicleOpen((o) => ({ ...o, insurance: false }));
                                  }}
                                >
                                  Remove
                                </button>
                              )}
                            </div>
                          </div>
                        ) : null}
                      </div>

                      {/* Car tax */}
                      <div style={rowBox}>
                        <div style={{ display: "flex", justifyContent: "flex-start", alignItems: "center", gap: 10 }}>
                          <div style={{ fontWeight: 900 }}>Car tax</div>
                          {!vehicleOpen.tax && (moneyNumberOrNull(vehicle.tax) === null || moneyNumberOrNull(vehicle.tax) === 0) && (
                            <button
                              type="button"
                              className="caBtn caBtnPrimary"
                              onClick={() => setVehicleOpen((o) => ({ ...o, tax: true }))}
                            >
                              Add
                            </button>
                          )}
                        </div>

                        {!vehicleOpen.tax && moneyNumberOrNull(vehicle.tax) !== null && moneyNumberOrNull(vehicle.tax) !== 0 ? (
                          <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
                            <div style={{ fontWeight: 800 }}>
                              {formatMoney((moneyNumberOrNull(vehicle.tax) ?? 0).toFixed(2))} • {prettyFrequency(vehicle.taxFreq)} • {displayUKDate(vehicle.taxDue)}
                            </div>
                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                              <button
                                type="button"
                                className="caBtn caBtnGhost"
                                onClick={() => setVehicleOpen((o) => ({ ...o, tax: true }))}
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                className="caBtn caBtnDanger"
                                onClick={() => {
                                  const next = {
                                    ...vehicle,
                                    tax: "",
                                    taxFreq: "monthly",
                                    taxDue: todayISO(),
                                  };
                                  setVehicle(next);
                                  syncVehicleTotalIfEnabled(next);
                                  setVehicleOpen((o) => ({ ...o, tax: false }));
                                }}
                              >
                                Remove
                              </button>
                            </div>
                          </div>
                        ) : vehicleOpen.tax ? (
                          <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
                            <div>
                              <label style={subLabel}>Amount ({caCurrencySymbol})</label>
                              <input
                                value={vehicle.tax}
                                onChange={(e) => {
                                  const next = { ...vehicle, tax: e.target.value };
                                  setVehicle(next);
                                  syncVehicleTotalIfEnabled(next);
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    e.preventDefault();
                                    setVehicleOpen((o) => ({ ...o, tax: false }));
                                  }
                                }}
                                inputMode="decimal"
                                placeholder="e.g. 16"
                                style={inputStyle}
                              />
                            </div>

                            <div style={{ display: "grid", gridTemplateColumns: isNarrowMobile ? "1fr" : "1fr 1fr", gap: 10 }}>
                              <div>
                                <label style={subLabel}>Frequency</label>
                                <select
                                  value={vehicle.taxFreq}
                                  onChange={(e) => {
                                    const next = { ...vehicle, taxFreq: e.target.value };
                                    setVehicle(next);
                                    syncVehicleTotalIfEnabled(next);
                                  }}
                                  style={inputStyle}
                                >
                                  {freqOptions.map((o) => (
                                    <option key={o.value} value={o.value}>
                                      {o.label}
                                    </option>
                                  ))}
                                </select>
                              </div>
                              <div>
                                <label style={subLabel}>Next due date</label>
                                <input
                                  type="date"
                                  value={vehicle.taxDue}
                                  onChange={(e) => {
                                    const next = { ...vehicle, taxDue: e.target.value };
                                    setVehicle(next);
                                    syncVehicleTotalIfEnabled(next);
                                  }}
                                  style={inputStyle}
                                />
                              </div>
                            </div>

                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                              <button
                                type="button"
                                className="caBtn caBtnPrimary"
                                onClick={() => setVehicleOpen((o) => ({ ...o, tax: false }))}
                              >
                                {moneyNumberOrNull(vehicle.tax) !== null && moneyNumberOrNull(vehicle.tax) !== 0 ? "Save" : "Add"}
                              </button>

                              <button
                                type="button"
                                className="caBtn caBtnGhost"
                                onClick={() => {
                                  const amt = moneyNumberOrNull(vehicle.tax);
                                  if (amt === null || amt === 0) {
                                    const next = { ...vehicle, tax: "" };
                                    setVehicle(next);
                                    syncVehicleTotalIfEnabled(next);
                                  }
                                  setVehicleOpen((o) => ({ ...o, tax: false }));
                                }}
                              >
                                Close
                              </button>

                              {moneyNumberOrNull(vehicle.tax) !== null && moneyNumberOrNull(vehicle.tax) !== 0 && (
                                <button
                                  type="button"
                                  className="caBtn caBtnDanger"
                                  onClick={() => {
                                    const next = {
                                      ...vehicle,
                                      tax: "",
                                      taxFreq: "monthly",
                                      taxDue: todayISO(),
                                    };
                                    setVehicle(next);
                                    syncVehicleTotalIfEnabled(next);
                                    setVehicleOpen((o) => ({ ...o, tax: false }));
                                  }}
                                >
                                  Remove
                                </button>
                              )}
                            </div>
                          </div>
                        ) : null}
                      </div>

                      {/* Breakdown cover */}
                      <div style={rowBox}>
                        <div style={{ display: "flex", justifyContent: "flex-start", alignItems: "center", gap: 10 }}>
                          <div style={{ fontWeight: 900 }}>Breakdown cover</div>
                          {!vehicleOpen.breakdown && (moneyNumberOrNull(vehicle.breakdown) === null || moneyNumberOrNull(vehicle.breakdown) === 0) && (
                            <button
                              type="button"
                              className="caBtn caBtnPrimary"
                              onClick={() => setVehicleOpen((o) => ({ ...o, breakdown: true }))}
                            >
                              Add
                            </button>
                          )}
                        </div>

                        {!vehicleOpen.breakdown && moneyNumberOrNull(vehicle.breakdown) !== null && moneyNumberOrNull(vehicle.breakdown) !== 0 ? (
                          <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
                            <div style={{ fontWeight: 800 }}>
                              {formatMoney((moneyNumberOrNull(vehicle.breakdown) ?? 0).toFixed(2))} • {prettyFrequency(vehicle.breakdownFreq)} • {displayUKDate(vehicle.breakdownDue)}
                            </div>
                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                              <button
                                type="button"
                                className="caBtn caBtnGhost"
                                onClick={() => setVehicleOpen((o) => ({ ...o, breakdown: true }))}
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                className="caBtn caBtnDanger"
                                onClick={() => {
                                  const next = {
                                    ...vehicle,
                                    breakdown: "",
                                    breakdownFreq: "monthly",
                                    breakdownDue: todayISO(),
                                  };
                                  setVehicle(next);
                                  syncVehicleTotalIfEnabled(next);
                                  setVehicleOpen((o) => ({ ...o, breakdown: false }));
                                }}
                              >
                                Remove
                              </button>
                            </div>
                          </div>
                        ) : vehicleOpen.breakdown ? (
                          <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
                            <div>
                              <label style={subLabel}>Amount ({caCurrencySymbol})</label>
                              <input
                                value={vehicle.breakdown}
                                onChange={(e) => {
                                  const next = { ...vehicle, breakdown: e.target.value };
                                  setVehicle(next);
                                  syncVehicleTotalIfEnabled(next);
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    e.preventDefault();
                                    setVehicleOpen((o) => ({ ...o, breakdown: false }));
                                  }
                                }}
                                inputMode="decimal"
                                placeholder="e.g. 8"
                                style={inputStyle}
                              />
                            </div>

                            <div style={{ display: "grid", gridTemplateColumns: isNarrowMobile ? "1fr" : "1fr 1fr", gap: 10 }}>
                              <div>
                                <label style={subLabel}>Frequency</label>
                                <select
                                  value={vehicle.breakdownFreq}
                                  onChange={(e) => {
                                    const next = { ...vehicle, breakdownFreq: e.target.value };
                                    setVehicle(next);
                                    syncVehicleTotalIfEnabled(next);
                                  }}
                                  style={inputStyle}
                                >
                                  {freqOptions.map((o) => (
                                    <option key={o.value} value={o.value}>
                                      {o.label}
                                    </option>
                                  ))}
                                </select>
                              </div>
                              <div>
                                <label style={subLabel}>Next due date</label>
                                <input
                                  type="date"
                                  value={vehicle.breakdownDue}
                                  onChange={(e) => {
                                    const next = { ...vehicle, breakdownDue: e.target.value };
                                    setVehicle(next);
                                    syncVehicleTotalIfEnabled(next);
                                  }}
                                  style={inputStyle}
                                />
                              </div>
                            </div>

                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                              <button
                                type="button"
                                className="caBtn caBtnPrimary"
                                onClick={() => setVehicleOpen((o) => ({ ...o, breakdown: false }))}
                              >
                                {moneyNumberOrNull(vehicle.breakdown) !== null && moneyNumberOrNull(vehicle.breakdown) !== 0 ? "Save" : "Add"}
                              </button>

                              <button
                                type="button"
                                className="caBtn caBtnGhost"
                                onClick={() => {
                                  const amt = moneyNumberOrNull(vehicle.breakdown);
                                  if (amt === null || amt === 0) {
                                    const next = { ...vehicle, breakdown: "" };
                                    setVehicle(next);
                                    syncVehicleTotalIfEnabled(next);
                                  }
                                  setVehicleOpen((o) => ({ ...o, breakdown: false }));
                                }}
                              >
                                Close
                              </button>

                              {moneyNumberOrNull(vehicle.breakdown) !== null && moneyNumberOrNull(vehicle.breakdown) !== 0 && (
                                <button
                                  type="button"
                                  className="caBtn caBtnDanger"
                                  onClick={() => {
                                    const next = {
                                      ...vehicle,
                                      breakdown: "",
                                      breakdownFreq: "monthly",
                                      breakdownDue: todayISO(),
                                    };
                                    setVehicle(next);
                                    syncVehicleTotalIfEnabled(next);
                                    setVehicleOpen((o) => ({ ...o, breakdown: false }));
                                  }}
                                >
                                  Remove
                                </button>
                              )}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    </div>

                    ) : (
                      <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                        <div style={rowBox}>
                          <div style={{ display: "flex", justifyContent: "flex-start", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                            <div>
                              <div style={{ fontWeight: 900 }}>Vehicle costs saved</div>
                              <div style={{ fontSize: 12, opacity: 0.85 }}>Edit to add/change vehicle bills. Totals stay included.</div>
                            </div>
                            <button
                              type="button"
                              className="caBtn caBtnPrimary"
                              onClick={() => setVehicleSectionOpen(true)}
                            >
                              Edit vehicle costs
                            </button>
                          </div>

                          <div style={{ marginTop: 10, display: "grid", gap: 6 }}>
                            {moneyNumberOrNull(vehicle.finance) !== null && moneyNumberOrNull(vehicle.finance) !== 0 ? (
                              <div>
                                <strong>Vehicle payment / finance:</strong> {formatMoney((moneyNumberOrNull(vehicle.finance) ?? 0).toFixed(2))} • {prettyFrequency(vehicle.financeFreq)} • {displayUKDate(vehicle.financeDue)}
                              </div>
                            ) : null}

                            {moneyNumberOrNull(vehicle.insurance) !== null && moneyNumberOrNull(vehicle.insurance) !== 0 ? (
                              <div>
                                <strong>Car insurance:</strong> {formatMoney((moneyNumberOrNull(vehicle.insurance) ?? 0).toFixed(2))} • {prettyFrequency(vehicle.insuranceFreq)} • {displayUKDate(vehicle.insuranceDue)}
                              </div>
                            ) : null}

                            {moneyNumberOrNull(vehicle.tax) !== null && moneyNumberOrNull(vehicle.tax) !== 0 ? (
                              <div>
                                <strong>Car tax:</strong> {formatMoney((moneyNumberOrNull(vehicle.tax) ?? 0).toFixed(2))} • {prettyFrequency(vehicle.taxFreq)} • {displayUKDate(vehicle.taxDue)}
                              </div>
                            ) : null}

                            {moneyNumberOrNull(vehicle.breakdown) !== null && moneyNumberOrNull(vehicle.breakdown) !== 0 ? (
                              <div>
                                <strong>Breakdown cover:</strong> {formatMoney((moneyNumberOrNull(vehicle.breakdown) ?? 0).toFixed(2))} • {prettyFrequency(vehicle.breakdownFreq)} • {displayUKDate(vehicle.breakdownDue)}
                              </div>
                            ) : null}

                            <div style={{ marginTop: 6, fontWeight: 900 }}>
                              Vehicle total: {formatMoney(vehicleTotal ? vehicleTotal.toFixed(2) : "—")}
                            </div>
                          </div>
                        </div>
                      </div>
                    )

                  )}
                </div>
              );
            })()}
          </div>
        )}

        {/* --- GROUP 4: Other essential bills (with multi-add) --- */}
        <BillsGroupButton id="other" title="Other essential bills" subtitle="Rent, council tax, and anything else you must pay"  billsSection={billsSection} setBillsSection={setBillsSection} setActiveBillId={setActiveBillId} />
        {billsSection === "other" && (
          <div style={{ marginBottom: 14 }}>
            {otherFixedIds.map((id) => (
              <BillsBillDetails key={id} bill={getBill(id)}  updateBill={updateBill} removeOtherEssentialBill={removeOtherEssentialBill} freqOptions={freqOptions} inputStyle={inputStyle} subLabel={subLabel} rowBox={rowBox} activeBillId={activeBillId} setActiveBillId={setActiveBillId} />
            ))}

            {otherCustom.map((b) => (
              <BillsBillDetails key={b.id} bill={b} allowRemove  updateBill={updateBill} removeOtherEssentialBill={removeOtherEssentialBill} freqOptions={freqOptions} inputStyle={inputStyle} subLabel={subLabel} rowBox={rowBox} activeBillId={activeBillId} setActiveBillId={setActiveBillId} />
            ))}

            <button type="button" onClick={addOtherEssentialBill} className="caBtn caBtnPrimary">
              + Add another essential bill
            </button>
          </div>
        )}

        {/* --- GROUP 5: Credit cards (minimum payments) --- */}
        <BillsGroupButton id="credit" title="Credit cards (minimum payments)" subtitle="Only the minimum required payments"  billsSection={billsSection} setBillsSection={setBillsSection} setActiveBillId={setActiveBillId} />
        {billsSection === "credit" && (
          <div style={{ marginBottom: 6 }}>
            <BillsBillDetails bill={getBill(creditId)}  updateBill={updateBill} removeOtherEssentialBill={removeOtherEssentialBill} freqOptions={freqOptions} inputStyle={inputStyle} subLabel={subLabel} rowBox={rowBox} activeBillId={activeBillId} setActiveBillId={setActiveBillId} />
          </div>
        )}
      </div>
    );
  })()}
</div>

    <button
      onClick={() => goTo(4)}
      style={{
        marginTop: 14,
        padding: 12,
        borderRadius: 12,
        border: "none",
        cursor: "pointer",
        background: "#2f7a7f",
        color: "white",
        fontWeight: 800,
        width: "100%",
      }}
    >
      Continue to Extras
    </button>

    <button
      onClick={() => goTo(2)}
      style={{
        marginTop: 10,
        padding: 10,
        borderRadius: 12,
        border: "1px solid rgba(255,255,255,0.15)",
        background: "transparent",
        color: "white",
        width: "100%",
        cursor: "pointer",
        opacity: 0.9,
      }}
    >
      Back
    </button>
  </div>
)}
      
{step === 4 && (
  <div style={cardStyle}>
    <h2 style={{ marginTop: 0 }}>Extras</h2>

    {renderStepper(4)}
{/* =========================
    QUICK ACTION SECTIONS
    ========================= */}

{/* SPENDING LOG */}
<div ref={spendRef} style={sectionBox}>
  <div style={{ fontWeight: 900, marginBottom: 8 }}>Log spending</div>

  <div style={{ display: "grid", gap: 10 }}>
    <div>
      <label style={subLabel}>Date</label>
      <input
        type="date"
        value={spendDate}
        onChange={(e) => setSpendDate(e.target.value)}
        style={inputStyle}
      />
    </div>

    <div>
      <label style={subLabel}>Amount ({caCurrencySymbol})</label>
      <input
        value={spendAmount}
        onChange={(e) => setSpendAmount(sanitizeMoneyInput(e.target.value))}
        inputMode="decimal"
        placeholder="e.g. 12.50"
        style={inputStyle}
      />
    </div>

    <div>
      <label style={subLabel}>Note (optional)</label>
      <input
        value={spendNote}
        onChange={(e) => setSpendNote(e.target.value)}
        placeholder="e.g. food, school, fuel"
        style={inputStyle}
      />
    </div>

    <button
      onClick={addSpending}
      style={{
        padding: 12,
        borderRadius: 12,
        border: "none",
        cursor: "pointer",
        background: "rgba(255,255,255,0.10)",
        color: "white",
        fontWeight: 900,
        width: "100%",
      }}
    >
      Add spending
    </button>

    {spendItems.length > 0 && (
      <div style={{ display: "grid", gap: 10 }}>
        <div style={{ fontWeight: 900, opacity: 0.9 }}>Your spending</div>

        {spendItems
          .slice()
          .sort((a, b) => (a.date < b.date ? 1 : -1))
          .map((s) => (
            <div key={s.id} style={rowBox}>
              <div style={{ display: "flex", justifyContent: "flex-start", gap: 10 }}>
                <div style={{ fontWeight: 900 }}>{displayUKDate(s.date)}</div>
                <div style={{ fontWeight: 900 }}>-{formatMoney(Number(s.amount).toFixed(2))}</div>
              </div>
              <div style={{ fontSize: 12, opacity: 0.85, marginTop: 4 }}>
                {s.note ? s.note : "Spending"}
              </div>

              <button
                onClick={() => removeSpending(s.id)}
                style={{
                  marginTop: 10,
                  padding: 10,
                  borderRadius: 12,
                  border: "1px solid rgba(255,255,255,0.16)",
                  background: "transparent",
                  color: "white",
                  width: "100%",
                  cursor: "pointer",
                  opacity: 0.9,
                  fontWeight: 800,
                }}
              >
                Remove
              </button>
            </div>
          ))}
      </div>
    )}
  </div>
</div>

{/* WHAT-IF */}
<div ref={whatIfRef} style={sectionBox}>
  <div style={{ fontWeight: 900, marginBottom: 8 }}>What if I buy this?</div>

  <label style={{ display: "flex", gap: 10, alignItems: "center" }}>
    <input
      type="checkbox"
      checked={whatIfChecked}
      onChange={(e) => setWhatIfChecked(e.target.checked)}
    />
    <span style={{ fontWeight: 800 }}>Turn on what-if check</span>
  </label>

  <div style={{ display: "grid", gap: 10, marginTop: 12, opacity: whatIfChecked ? 1 : 0.55 }}>
    <div>
      <label style={subLabel}>Name (optional)</label>
      <input
        value={whatIfName}
        onChange={(e) => setWhatIfName(e.target.value)}
        placeholder="e.g. school shoes"
        style={inputStyle}
        disabled={!whatIfChecked}
      />
    </div>

    <div>
      <label style={subLabel}>Amount ({caCurrencySymbol})</label>
      <input
        value={whatIfAmount}
        onChange={(e) => setWhatIfAmount(sanitizeMoneyInput(e.target.value))}
        inputMode="decimal"
        placeholder="e.g. 35"
        style={inputStyle}
        disabled={!whatIfChecked}
      />
    </div>

    <div>
      <label style={subLabel}>Date</label>
      <input
        type="date"
        value={whatIfDate}
        onChange={(e) => setWhatIfDate(e.target.value)}
        style={inputStyle}
        disabled={!whatIfChecked}
      />
    </div>

    {whatIfChecked && whatIfLookahead && (
      <div style={{ ...rowBox, marginTop: 6 }}>
        <div style={{ fontSize: 12, opacity: 0.8 }}>If you buy it:</div>
        <div style={{ fontSize: 22, fontWeight: 900, marginTop: 4 }}>
          May be available becomes {formatMoney(whatIfLookahead.mayBeAvailable.toFixed(2))}
        </div>

        <div style={{ fontSize: 12, opacity: 0.8, marginTop: 8 }}>
          Lowest projected balance would be {formatMoney(whatIfLookahead.lowest.toFixed(2))} on{" "}
          {whatIfLookahead.lowestISO}
        </div>
      </div>
    )}


{whatIfChecked && (
  <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
    <button
      type="button"
      onClick={adoptWhatIfToSpending}
      className="caBtn caBtnPrimary"
      disabled={!whatIfLookahead}
    >
      Add this purchase to Spending log
    </button>

    <button
      type="button"
      onClick={clearWhatIf}
      style={{
        padding: 10,
        borderRadius: 12,
        border: "1px solid rgba(255,255,255,0.16)",
        background: "transparent",
        color: "white",
        width: "100%",
        cursor: "pointer",
        opacity: 0.9,
        fontWeight: 800,
      }}
    >
      Forget this
    </button>
  </div>
)}

  </div>
</div>

{/* SAVINGS GOALS */}
<div ref={goalsRef} style={sectionBox}>
  <div style={{ fontWeight: 900, marginBottom: 8 }}>Savings goals</div>

  <label style={{ display: "flex", gap: 10, alignItems: "center" }}>
    <input
      type="checkbox"
      checked={goalsEnabled}
      onChange={(e) => {
      const checked = e.target.checked;
      setGoalsEnabled(checked);
      if (!checked) setActiveGoalId(null);
    }}
    />
    <span style={{ fontWeight: 800 }}>Enable goals</span>
  </label>

  {goalsEnabled && (
    <div style={{ marginTop: 12 }}>
      <button
        onClick={addGoal}
        style={{
          padding: 12,
          borderRadius: 12,
          border: "none",
          cursor: "pointer",
          background: "rgba(255,255,255,0.10)",
          color: "white",
          fontWeight: 900,
          width: "100%",
        }}
      >
        Add a goal
      </button>

      {goals.length === 0 && (
        <div style={{ marginTop: 10, fontSize: 12, opacity: 0.75 }}>
          No goals yet. Tap “Add a goal”.
        </div>
      )}

      <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
        {goals.map((g) => {
          const plan = goalPlansById[g.id];
          const isOpen = activeGoalId === g.id;
          const goalHasDetails = (g.name || "").trim().length > 0 && moneyNumberOrNull(g.targetAmount) !== null && isValidISODate(g.targetDate);

          return (
            <div key={g.id} style={rowBox}>
              <div style={{ fontWeight: 900, marginBottom: 8 }}>Goal</div>

              {!isOpen && (
                <button
                  type="button"
                  onClick={() => setActiveGoalId(g.id)}
                  className="caBtn caBtnGhost"
                  style={{ width: "100%", marginTop: 6 }}
                >
                  {goalHasDetails ? "Edit details" : "Add goal"}
                </button>
              )}

              {isOpen && (
              <div style={{ display: "grid", gap: 10 }}>
                <div>
                  <label style={subLabel}>Name</label>
                  <input
                    value={g.name}
                    onChange={(e) => updateGoal(g.id, { name: e.target.value })}
                    placeholder="e.g. emergency buffer"
                    style={inputStyle}
                  />
                </div>

                <div>
                  <label style={subLabel}>Target amount ({caCurrencySymbol})</label>
                  <input
                    value={g.targetAmount}
                    onChange={(e) => updateGoal(g.id, { targetAmount: sanitizeMoneyInput(e.target.value) })}
                    onBlur={() => updateGoal(g.id, { targetAmount: formatMoney2dp(g.targetAmount) })}
                    inputMode="decimal"
                    placeholder="e.g. 300"
                    style={inputStyle}
                  />
                </div>

                <div>
                  <label style={subLabel}>Target date</label>
                  <input
                    type="date"
                    value={g.targetDate || ""}
                    onChange={(e) => updateGoal(g.id, { targetDate: e.target.value })}
                    style={inputStyle}
                  />
                </div>

                <label style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <input
                    type="checkbox"
                    checked={g.includeInCalc}
                    onChange={(e) => updateGoal(g.id, { includeInCalc: e.target.checked })}
                  />
                  <span style={{ fontWeight: 800 }}>Include in calculations</span>
                </label>

                {plan && plan.ok ? (
                  <div style={{ fontSize: 12, opacity: 0.85 }}>
                    To reach {formatMoney(plan.targetAmt.toFixed(2))} by {plan.targetISO}, set aside about{" "}
                    <strong>{formatMoney(plan.perWeek.toFixed(2))} / week</strong> (rough guide).
                  </div>
                ) : (
                  <div style={{ fontSize: 12, opacity: 0.8 }}>
                    {plan?.message ? plan.message : "Fill in amount + date to see the plan."}
                  </div>
                )}

                <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
  <button
    type="button"
    onClick={() => {
      // confirm / keep the goal (same pattern as Add bill / Add spending)
      setActiveGoalId(null);
    }}
    style={{
      padding: 10,
      borderRadius: 12,
      border: "none",
      background: "#8b5cf6",
      color: "white",
      width: "100%",
      cursor: "pointer",
      fontWeight: 800,
    }}
  >
    Add goal
  </button>

  <button
    type="button"
    onClick={() => {
      removeGoal(g.id);
      if (activeGoalId === g.id) setActiveGoalId(null);
    }}
    style={{
      padding: 10,
      borderRadius: 12,
      border: "1px solid rgba(255,255,255,0.16)",
      background: "transparent",
      color: "white",
      width: "100%",
      cursor: "pointer",
      opacity: 0.9,
      fontWeight: 800,
    }}
  >
    Remove goal
  </button>
</div>
              </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  )}
</div>



    <button className="caBtn caBtnPrimary" onClick={() => setStep(5)}>
      Continue to Review
    </button>

    <button className="caBtn caBtnGhost" onClick={() => setStep(3)}>
      Back
    </button>
  </div>
)}

{step === 5 && (
        <div style={cardStyle}>
          <h2 style={{ marginTop: 0 }}>Review</h2>

          {renderStepper(5)}

          <p style={{ opacity: 0.88, marginTop: 8 }}>
            This page will become your scrollable timeline and summary of everything entered — so you can quickly sanity-check what’s included.
          </p>

          <div style={{ ...sectionBox, marginTop: 14 }}>
  <div style={{ fontWeight: 900, marginBottom: 8 }}>5-week timeline</div>

  <div style={{ display: "grid", gap: 8 }}>
    <div style={{ fontSize: 12, opacity: 0.85 }}>
      Window: <strong>{displayUKDate(startDate)}</strong> → <strong>{displayUKDate(lookahead.windowEndISO)}</strong>
    </div>

    <div style={{ display: "grid", gap: 4 }}>
      <div style={{ fontSize: 12, opacity: 0.75 }}>Available now</div>
      <div style={{ fontSize: 28, fontWeight: 900 }}>
        {formatMoney(lookahead.mayBeAvailable.toFixed(2))}
      </div>

      <div style={{ fontSize: 12, opacity: 0.75, marginTop: 10 }}>Safe number</div>
      <div style={{ fontSize: 22, fontWeight: 900 }}>
        {formatMoney(Math.max(0, lookahead.mayBeAvailable - 250).toFixed(2))}
      </div>
      <div style={{ fontSize: 12, opacity: 0.78, lineHeight: 1.35 }}>
        Safe number leaves a small {formatMoney(250)} buffer aside.
      </div>

      <div style={{ fontSize: 12, opacity: 0.8 }}>
        Lowest projected balance:{" "}
        <strong>{formatMoney(lookahead.lowest.toFixed(2))}</strong> on{" "}
        <strong>{lookahead.lowestISO}</strong>
      </div>

      <div style={{ fontSize: 12, opacity: 0.8 }}>
        Confidence: <strong>{lookahead.confidence}</strong>
      </div>
    </div>

    <div style={{ marginTop: 6, fontWeight: 900, opacity: 0.9 }}>Events</div>

    <div style={{ display: "grid", gap: 8 }}>
      {lookahead.timeline.map((t, idx) => {
        const isNegative = t.delta < 0;
        const deltaAbs = Math.abs(t.delta);

        return (
          <div
            key={`${t.iso}_${idx}`}
            style={{
              ...rowBox,
              display: "grid",
              gap: 4,
            }}
          >
            <div style={{ display: "flex", justifyContent: "flex-start", gap: 10 }}>
              <div style={{ fontWeight: 900 }}>{t.iso}</div>
              <div style={{ fontWeight: 900, opacity: 0.95 }}>
                {isNegative ? "-" : "+"}{formatMoney(deltaAbs.toFixed(2))}
              </div>
            </div>

            <div style={{ fontSize: 12, opacity: 0.9 }}>{t.label}</div>

            <div style={{ fontSize: 12, opacity: 0.75 }}>
              Running balance: <strong>{formatMoney(t.running.toFixed(2))}</strong>
            </div>
          </div>
        );
      })}
    </div>

    {lookahead.timeline.length === 0 && (
      <div style={{ fontSize: 12, opacity: 0.75 }}>No events yet.</div>
    )}
  </div>
</div>

          <div style={{ ...sectionBox, marginTop: 14 }}>
            <div style={{ fontWeight: 900, marginBottom: 10 }}>Quick action buttons</div>

            <div style={{ display: "grid", gap: 10 }}>
              <button
                type="button"
                onClick={() => {
                  setFocusSection("spend");
                  goTo(4);
                }}
                style={{
                  padding: 12,
                  borderRadius: 12,
                  border: "1px solid rgba(255,255,255,0.14)",
                  background: "rgba(255,255,255,0.06)",
                  color: "white",
                  cursor: "pointer",
                  fontWeight: 900,
                  width: "100%",
                  textAlign: "center",
                }}
              >
                Log spending
              </button>

              <button
                type="button"
                onClick={() => {
                  setFocusSection("whatif");
                  goTo(4);
                }}
                style={{
                  padding: 12,
                  borderRadius: 12,
                  border: "1px solid rgba(255,255,255,0.14)",
                  background: "rgba(255,255,255,0.06)",
                  color: "white",
                  cursor: "pointer",
                  fontWeight: 900,
                  width: "100%",
                  textAlign: "center",
                }}
              >
                What if I buy this?
              </button>

              <button
                type="button"
                onClick={() => {
                  setFocusSection("goals");
                  goTo(4);
                }}
                style={{
                  padding: 12,
                  borderRadius: 12,
                  border: "1px solid rgba(255,255,255,0.14)",
                  background: "rgba(255,255,255,0.06)",
                  color: "white",
                  cursor: "pointer",
                  fontWeight: 900,
                  width: "100%",
                  textAlign: "center",
                }}
              >
                Savings goals
              </button>
            </div>
          </div>

          <div style={{ display: "grid", gap: 10, marginTop: 14 }}>
            <button
              type="button"
              onClick={() => goTo(1)}
              style={{
                marginTop: 6,
                padding: 12,
                borderRadius: 12,
                border: "none",
                cursor: "pointer",
                background:
                  "linear-gradient(135deg, rgba(168,85,247,0.95), rgba(99,102,241,0.95))",
                color: "white",
                fontWeight: 900,
                width: "100%",
                boxShadow: "0 12px 30px rgba(99,102,241,0.35)",
              }}
            >
              Back to Overview
            </button>

            </div>
{isPro && (
  <div
    style={{
      marginTop: 12,
      marginBottom: 10,
      padding: 12,
      borderRadius: 14,
      border: "1px solid rgba(255,255,255,0.14)",
      background: "rgba(255,255,255,0.06)",
    }}
  >
    <div style={{ fontWeight: 900, marginBottom: 6 }}>Pro insights</div>
    <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 8 }}>Pro insights gives you a in depth view of all events over your full window.</div>

    <div style={{ display: "grid", gap: 6, fontSize: 13, opacity: 0.92 }}>
      <div>
        <span style={{ opacity: 0.8 }}>Total income:</span>{" "}
        <span style={{ fontWeight: 900 }}>{formatMoney((proInsights.incomeTotal || 0).toFixed(2))}</span>
      </div>
      <div>
        <span style={{ opacity: 0.8 }}>Total outgoings:</span>{" "}
        <span style={{ fontWeight: 900 }}>{formatMoney((proInsights.outgoingTotal || 0).toFixed(2))}</span>
      </div>
      <div>
        <span style={{ opacity: 0.8 }}>Net:</span>{" "}
        <span style={{ fontWeight: 900 }}>
          {formatMoney((proInsights.net || 0).toFixed(2))}
        </span>
      </div>
      {Number.isFinite(proInsights.lowest) && (
        <div>
          <span style={{ opacity: 0.8 }}>Lowest balance:</span>{" "}
          <span style={{ fontWeight: 900 }}>{formatMoney(proInsights.lowest.toFixed(2))}</span>
        </div>
      )}
      {Number.isFinite(proInsights.highest) && (
        <div>
          <span style={{ opacity: 0.8 }}>Highest balance:</span>{" "}
          <span style={{ fontWeight: 900 }}>{formatMoney(proInsights.highest.toFixed(2))}</span>
        </div>
      )}
    </div>

    
    {proInsights.topIn?.length > 0 && (
      <div style={{ marginTop: 10 }}>
        <div style={{ fontWeight: 900, fontSize: 12, opacity: 0.85, marginBottom: 6 }}>
          Biggest incoming (by amount)
        </div>
        <div style={{ display: "grid", gap: 6 }}>
          {proInsights.topIn.map((x) => (
            <div
              key={x.label}
              style={{
                display: "flex",
                justifyContent: "flex-start",
                gap: 10,
                padding: "8px 10px",
                borderRadius: 12,
                border: "1px solid rgba(255,255,255,0.10)",
                background: "rgba(0,0,0,0.16)",
              }}
            >
              <div style={{ fontSize: 13, opacity: 0.95 }}>{x.label}</div>
              <div style={{ fontWeight: 900 }}>{formatMoney((x.amt || 0).toFixed(2))}</div>
            </div>
          ))}
        </div>
      </div>
    )}

{proInsights.topOut?.length > 0 && (
      <div style={{ marginTop: 10 }}>
        <div style={{ fontWeight: 900, fontSize: 12, opacity: 0.85, marginBottom: 6 }}>
          Biggest outgoings (by amount)
        </div>
        <div style={{ display: "grid", gap: 6 }}>
          {proInsights.topOut.map((x) => (
            <div
              key={x.label}
              style={{
                display: "flex",
                justifyContent: "flex-start",
                gap: 10,
                padding: "8px 10px",
                borderRadius: 12,
                border: "1px solid rgba(255,255,255,0.10)",
                background: "rgba(0,0,0,0.16)",
              }}
            >
              <div style={{ fontSize: 13, opacity: 0.95 }}>{x.label}</div>
              <div style={{ fontWeight: 900 }}>{formatMoney((x.amt || 0).toFixed(2))}</div>
            </div>
          ))}
        </div>
      </div>
    )}
  </div>
)}

          <button
            type="button"
            onClick={() => goTo(2)}
            style={{
              marginTop: 16,
              padding: 10,
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.18)",
              background: "rgba(255,255,255,0.06)",
              color: "white",
              width: "100%",
              cursor: "pointer",
              opacity: 0.92,
              fontWeight: 800,
            }}
          >
            Edit Income
          </button>

          <button
            type="button"
            onClick={() => goTo(3)}
            style={{
              marginTop: 10,
              padding: 10,
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.18)",
              background: "rgba(255,255,255,0.06)",
              color: "white",
              width: "100%",
              cursor: "pointer",
              opacity: 0.92,
              fontWeight: 800,
            }}
          >
            Edit Fixed Bills
          </button>

<button
  onClick={() => {
    const subject = encodeURIComponent("ClearAhead Feedback");
    const body = encodeURIComponent("Hi ClearAhead team,\n\nMy feedback:\n");
    window.location.href = `mailto:ClearAhead2026@gmail.com?subject=${subject}&body=${body}`;
  }}
  style={{
              marginTop: 16,
              padding: 12,
              borderRadius: 12,
              border: "none",
              cursor: "pointer",
              background:
                "linear-gradient(135deg, rgba(168,85,247,0.95), rgba(99,102,241,0.95))",
              color: "white",
              fontWeight: 900,
              width: "100%",
              boxShadow: "0 12px 30px rgba(99,102,241,0.35)",
            }}
>
  Send Feedback
</button>

        </div>
      )}

      {isPro && step === 6 && (
        <div
          style={
            isNarrowMobile
              ? {
                  ...cardStyle,
                  width: "100%",
                  maxWidth: "100%",
                  margin: 0,
                  padding: 0,
                  borderRadius: 0,
                  background: "transparent",
                  border: "none",
                  boxShadow: "none",
                  backdropFilter: "none",
                  WebkitBackdropFilter: "none",
                }
              : cardStyle
          }
        >
          <h2 style={{ marginTop: 0 }}>Calendar</h2>

          {renderStepper(6)}

<div
  style={{
    ...(isNarrowMobile
      ? {
          width: "100%",
          maxWidth: "100%",
          marginLeft: 0,
          marginRight: 0,
          paddingLeft: 12,
          paddingRight: 12,
          paddingTop: 0,
          paddingBottom: 0,
          borderRadius: 0,
          background: "transparent",
          border: "none",
        }
      : {
          padding: 14,
          borderRadius: 14,
          background: "rgba(255,255,255,0.06)",
          border: "1px solid rgba(255,255,255,0.12)",
        }),
    color: "white",
    boxSizing: "border-box",
  }}
>
  {(() => {
    const toMonthKey = (iso) => (iso ? String(iso).slice(0, 7) : "");
    const isAndroidMobile =
  typeof navigator !== "undefined" &&
  /Android/i.test(navigator.userAgent) &&
  (typeof window === "undefined" ? true : window.innerWidth <= 520);
    const isNarrowMobile =
      (typeof window === "undefined" ? true : window.innerWidth <= 520);

    const toISODate = (d) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return `${y}-${m}-${day}`;
    };
    const monthTitle = (key) => {
      if (!key) return "";
      const dt = new Date(key + "-01T00:00:00");
      return dt.toLocaleString("en-GB", { month: "long", year: "numeric" });
    };
    const addMonths = (key, delta) => {
      const [yStr, mStr] = String(key).split("-");
      const y = Number(yStr);
      const m = Number(mStr);
      if (!Number.isFinite(y) || !Number.isFinite(m)) return key;
      let nm = m + delta;
      let ny = y;
      while (nm <= 0) {
        nm += 12;
        ny -= 1;
      }
      while (nm >= 13) {
        nm -= 12;
        ny += 1;
      }
      return `${ny}-${String(nm).padStart(2, "0")}`;
    };
    const mondayIndex = (jsDay) => (jsDay + 6) % 7; // Mon=0 ... Sun=6

    const baseMonth =
      calMonth ||
      toMonthKey(startDate) ||
      toMonthKey(todayISO && typeof todayISO === "function" ? todayISO() : "");

    const monthKeys = Array.from(
      new Set((lookahead.timeline || []).map((t) => toMonthKey(t.iso)).filter(Boolean))
    ).sort();
    if (baseMonth && monthKeys.indexOf(baseMonth) === -1) monthKeys.push(baseMonth);
    monthKeys.sort();

    const monthStart = new Date(baseMonth + "-01T00:00:00");
    const firstDayIdx = mondayIndex(monthStart.getDay());
    const daysInMonth = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0).getDate();

    const eventsByDay = {};
    (lookahead.timeline || []).forEach((t) => {
      const iso = t.iso;
      if (!iso) return;
      if (!eventsByDay[iso]) eventsByDay[iso] = [];
      eventsByDay[iso].push(t);
    });

    // Build 6-week grid
    const cells = [];
    for (let i = 0; i < 42; i++) {
      const dayNum = i - firstDayIdx + 1;
      if (dayNum < 1 || dayNum > daysInMonth) {
        cells.push(null);
      } else {
        const d = new Date(monthStart.getFullYear(), monthStart.getMonth(), dayNum);
        const iso = toISODate(d);
        cells.push({ dayNum, iso, items: eventsByDay[iso] || [] });
      }
    }

    const selectedISO = calSelectedISO && calSelectedISO.startsWith(baseMonth) ? calSelectedISO : "";
    const selectedItems = selectedISO ? (eventsByDay[selectedISO] || []) : [];

    // Selected-day summary (read-only)
    const dayIncome = selectedItems.reduce((s, t) => s + Math.max(0, Number(t.delta || 0)), 0);
    const dayOutgo = selectedItems.reduce((s, t) => s + Math.max(0, -Number(t.delta || 0)), 0);
    const dayNet = dayIncome - dayOutgo;
    const dayLowest = selectedItems.reduce((min, t) => {
      const b = typeof t.balanceAfter === "number" ? t.balanceAfter : null;
      if (b === null) return min;
      if (min === null) return b;
      return Math.min(min, b);
    }, null);

    const today = todayISO();

    // Month summary (read-only, derived from Review timeline)
    const monthItems = (lookahead.timeline || []).filter((t) => String(t.iso || "").startsWith(baseMonth));
    const monthIncome = monthItems.reduce((s, t) => s + ((t.delta || 0) > 0 ? (t.delta || 0) : 0), 0);
    const monthOutgo = monthItems.reduce((s, t) => s + ((t.delta || 0) < 0 ? Math.abs(t.delta || 0) : 0), 0);
    const monthLowest = monthItems.reduce((minV, t) => {
      const v = Number(t.running);
      if (!Number.isFinite(v)) return minV;
      return v < minV ? v : minV;
    }, Number.POSITIVE_INFINITY);
    const monthLowestSafe = Number.isFinite(monthLowest) && monthLowest !== Number.POSITIVE_INFINITY ? monthLowest : null;


    
const parseTimelineItem = (it) => {
  const raw = String(it?.label || "");
  const parts = raw.split("•");
  const prefix = (parts[0] || "").trim(); // Income / Bill / Spending / Goal / What-if
  const name = (parts.slice(1).join("•") || "").trim() || raw;
  const delta = Number(it?.delta || 0);
  return { prefix, name, delta, raw };
};


const shortenLabel = (s, max = 10) => {
  const str = String(s || "").trim();
  if (str.length <= max) return str;
  return (str.slice(0, Math.max(1, max - 1)).trimEnd() + "…");
};

const buildCellBlocks = (items) => {
  const parsed = (items || []).map(parseTimelineItem);

  // Separate for readability
  const due = parsed.filter((p) => p.prefix === "Income" || p.prefix === "Bill" || p.prefix === "What-if");
  const spend = parsed.filter((p) => p.prefix === "Spending");
  const goals = parsed.filter((p) => p.prefix === "Goal");

  // Summaries (Samsung-like: show readable blocks, not lots of tiny chips)
  const spendTotal = spend.reduce((s, p) => s + Math.abs(Math.min(0, p.delta)), 0);
  const goalTotal = goals.reduce((s, p) => s + Math.abs(Math.min(0, p.delta)), 0);

  // Sort due by absolute impact (biggest first)
  due.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  const blocks = [];

  // 1) Show up to 2 due items (income/bills/what-if)
  for (const d of due.slice(0, 2)) {
    blocks.push({
      kind: d.prefix === "Income" ? "income" : d.prefix === "What-if" ? "whatif" : "bill",
      label: d.name,
      shortLabel: shortenLabel(d.name, 10),
      amount: d.delta,
    });
  }

  // 2) Spending summary (one block)
  if (spendTotal > 0) {
    blocks.push({
      kind: "spend",
      label: spend.length > 1 ? `Spending (${spend.length})` : "Spending",
      shortLabel: spend.length > 1 ? `Spending (${spend.length})` : "Spending",
      amount: -spendTotal,
    });
  }

  // 3) Goals summary (one block)
  if (goalTotal > 0) {
    blocks.push({
      kind: "goal",
      label: "Savings goals",
      shortLabel: "Savings goals",
      amount: -goalTotal,
    });
  }

  // Cap visible blocks in the cell to 2 (Samsung-like) and show "+n" for more
  const visible = blocks.slice(0, 2);
  const more = Math.max(0, blocks.length - visible.length);

  // Badge count: show how many meaningful things are on that day
  const badgeCount = due.length + (spendTotal > 0 ? 1 : 0) + (goalTotal > 0 ? 1 : 0);

  return { visible, more, badgeCount, due, spend, goals, spendTotal, goalTotal };
};

const blockStyle = (kind) => {
  const base = {
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-start",
    gap: 6,
    padding: "3px 5px",
    borderRadius: 7,
    fontSize: 10,
    lineHeight: 1.15,
    fontWeight: 800,
    minWidth: 0,
    maxWidth: "100%",
    boxSizing: "border-box",
  };

  if (kind === "income") {
    return {
      ...base,
      border: "1px solid rgba(34,197,94,0.35)",
      background: "rgba(34,197,94,0.12)",
    };
  }
  if (kind === "bill" || kind === "spend") {
    return {
      ...base,
      border: "1px solid rgba(239,68,68,0.32)",
      background: "rgba(239,68,68,0.10)",
    };
  }
  if (kind === "goal") {
    return {
      ...base,
      border: "1px solid rgba(168,85,247,0.38)",
      background: "rgba(168,85,247,0.12)",
    };
  }
  // what-if or fallback
  return {
    ...base,
    border: "1px solid rgba(255,255,255,0.16)",
    background: "rgba(0,0,0,0.20)",
  };
};

return (
      <div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-start", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <div style={{ fontWeight: 900 }}>{monthTitle(baseMonth)}</div>
            {monthKeys.length > 0 && (
              <select
                value={baseMonth}
                onChange={(e) => {
                  setCalMonth(e.target.value);
                  setCalSelectedISO("");
                }}
                style={{
                  padding: "6px 10px",
                  borderRadius: 999,
                  border: "1px solid rgba(255,255,255,0.18)",
                  background: "rgba(255,255,255,0.06)",
                  color: "white",
                  cursor: "pointer",
                  fontWeight: 800,
                  fontSize: 12,
                  outline: "none",
                }}
              >
                {monthKeys.map((k) => (
                  <option key={k} value={k} style={{ color: "black" }}>
                    {monthTitle(k)}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              onClick={() => {
                const next = addMonths(baseMonth, -1);
                setCalMonth(next);
                setCalSelectedISO("");
              }}
              style={{
                padding: "6px 10px",
                borderRadius: 999,
                border: "1px solid rgba(255,255,255,0.18)",
                background: "rgba(255,255,255,0.06)",
                color: "white",
                cursor: "pointer",
                fontWeight: 800,
                fontSize: 12,
              }}
            >
              ◀
            </button>

            <button
              type="button"
              onClick={() => {
                const today = (typeof todayISO === "function" ? todayISO() : "");
                const todayKey = toMonthKey(today) || toMonthKey(startDate) || baseMonth;
                setCalMonth(todayKey);
                setCalSelectedISO(today || "");
              }}
              style={{
                padding: "6px 10px",
                borderRadius: 999,
                border: "1px solid rgba(255,255,255,0.18)",
                background: "rgba(255,255,255,0.06)",
                color: "white",
                cursor: "pointer",
                fontWeight: 800,
                fontSize: 12,
              }}
            >
              Today
            </button>

            <button
              type="button"
              onClick={() => {
                const next = addMonths(baseMonth, +1);
                setCalMonth(next);
                setCalSelectedISO("");
              }}
              style={{
                padding: "6px 10px",
                borderRadius: 999,
                border: "1px solid rgba(255,255,255,0.18)",
                background: "rgba(255,255,255,0.06)",
                color: "white",
                cursor: "pointer",
                fontWeight: 800,
                fontSize: 12,
              }}
            >
              ▶
            </button>

</div>
        </div>

        <div style={{ fontSize: 12, opacity: 0.75, marginTop: 8, marginBottom: 10 }}>
          Tap a day to see details. Samsung v1 (read-only, built from your Review timeline).
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
            gap: isAndroidMobile ? 6 : 8,
            marginBottom: 10,
            fontSize: isAndroidMobile ? 11 : 12,
            opacity: 0.8,
            fontWeight: 800,
            width: "100%",
            maxWidth: "100%",
            boxSizing: "border-box",
            minWidth: 0,
          }}
        >
          <div>Mon</div>
          <div>Tue</div>
          <div>Wed</div>
          <div>Thu</div>
          <div>Fri</div>
          <div>Sat</div>
          <div>Sun</div>
        </div>

        <div
          style={{
            width: "100%",
            maxWidth: "100%",
            boxSizing: "border-box",
            minWidth: 0,
            display: "grid",
            gap: isAndroidMobile ? 8 : 10,
          }}
        >
          {Array.from({ length: Math.ceil(cells.length / 7) }).map((_, w) => {
            const week = cells.slice(w * 7, w * 7 + 7);
            return (
              <div
                key={w}
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
                  gap: isAndroidMobile ? 6 : 8,
                  paddingTop: w === 0 ? 0 : (isAndroidMobile ? 10 : 12),
                  borderTop: w === 0 ? "none" : "1px solid rgba(255,255,255,0.12)",
                }}
              >
                {week.map((cell, idx) => {
                  const isSelected = !!cell && cell.iso === selectedISO;
                  const isToday = !!cell && cell.iso === today;

                  return (
                    <button
                      key={`${w}-${idx}`}
                      type="button"
                      disabled={!cell}
                      onClick={() => {
                        if (!cell) return;
                        setCalSelectedISO(cell.iso);
                      }}
                      style={{
                        width: "100%",
                        aspectRatio: isNarrowMobile ? "auto" : "1 / 1",
                        minHeight: isNarrowMobile ? 76 : 0,
                        padding: isAndroidMobile ? 4 : 6,
                        boxSizing: "border-box",
                        minWidth: 0,
                        overflow: isNarrowMobile ? "visible" : "hidden",
                        borderRadius: 10,
                        border: isSelected
                          ? "2px solid rgba(168,85,247,0.85)"
                          : isToday
                          ? "1px solid rgba(255,255,255,0.35)"
                          : "1px solid transparent",
                        background: "transparent",
                        boxShadow: "none",
                        color: "white",
                        cursor: cell ? "pointer" : "default",
                        textAlign: "left",
                        opacity: cell ? 1 : 0,
                      }}
                    >
                      {cell && (() => {
                        const b = buildCellBlocks(cell.items);
                        return (
                          <div
                            style={{
                              height: "100%",
                              display: "flex",
                              flexDirection: "column",
                              gap: 6,
                              minWidth: 0,
                            }}
                          >
                            <div style={{ position: "relative", minHeight: 18, minWidth: 0 }}>
                              <div
                                style={{
                                  fontWeight: 900,
                                  fontSize: isAndroidMobile ? 14 : 14,
                                  lineHeight: 1,
                                }}
                              >
                                {cell.dayNum}
                              </div>

                              {b.badgeCount > 0 && (
                                <div
                                  style={{
                                    position: "absolute",
                                    right: 0,
                                    top: 0,
                                    fontSize: isAndroidMobile ? 10 : 10,
                                    opacity: 0.7,
                                    fontWeight: 800,
                                  }}
                                >
                                  {b.badgeCount}
                                </div>
                              )}
                            </div>

                            <div style={{ display: "grid", gap: 4, minWidth: 0 }}>
                              {b.visible.map((blk, i2) => {
                                const sign = (blk.amount || 0) >= 0 ? "+" : "-";
                                return (
                                  <div
                                    key={i2}
                                    style={{
                                      ...blockStyle(blk.kind),
                                      borderRadius: isAndroidMobile ? 6 : 7,
                                      border: "none",
                                      padding: isAndroidMobile ? "3px 4px" : "3px 5px",
                                      fontSize: isAndroidMobile ? 9 : 10,
                                                                          }}
                                    title={`${blk.label} • ${sign}£${Math.abs(blk.amount || 0).toFixed(2)}`}
                                  >
                                    <span
                                      style={{
                                        minWidth: 0,
                                        overflow: "hidden",
                                        textOverflow: "ellipsis",
                                        whiteSpace: "normal",
                                        overflowWrap: "anywhere",
                                        opacity: 0.95,
                                      }}
                                    >
                                      {blk.shortLabel || blk.label}
                                    </span>
                                  </div>
                                );
                              })}

                              {b.more > 0 && (
                                <div style={{ fontSize: 10, opacity: 0.75, fontWeight: 800 }}>
                                  +{b.more} more
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })()}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>

        <div style={{ fontSize: 12, opacity: 0.78, marginTop: 10, marginBottom: 6 }}>
          <span style={{ fontWeight: 900 }}>This month:</span>{" "}
          +{formatMoney(monthIncome.toFixed(2))}{" "}
          <span style={{ opacity: 0.75 }}>•</span>{" "}
          -{formatMoney(monthOutgo.toFixed(2))}{" "}
          {monthLowestSafe !== null && (
            <>
              <span style={{ opacity: 0.75 }}>•</span>{" "}
              Lowest {formatMoney(monthLowestSafe.toFixed(2))}
            </>
          )}
        </div>


        <div style={{ marginTop: 14 }}>
          <div style={{ fontWeight: 900, marginBottom: 8 }}>
            {selectedISO ? `Events on ${displayUKDate(selectedISO)}` : "Select a day"}
          </div>
          {selectedISO && (
            <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 10 }}>
              <span style={{ fontWeight: 900 }}>Day summary:</span>{" "}
              +{formatMoney(dayIncome.toFixed(2))} <span style={{ opacity: 0.75 }}>•</span>{" "}
              -{formatMoney(dayOutgo.toFixed(2))} <span style={{ opacity: 0.75 }}>•</span>{" "}
              Net {dayNet >= 0 ? "+" : "-"}{formatMoney(Math.abs(dayNet).toFixed(2))}
              {dayLowest !== null && (
                <>
                  <span style={{ opacity: 0.75 }}>•</span>{" "}
                  Lowest {formatMoney(dayLowest.toFixed(2))}
                </>
              )}
            </div>
          )}


          {selectedISO && selectedItems.length === 0 && (
            <div style={{ fontSize: 12, opacity: 0.75 }}>No events on this day.</div>
          )}

          {selectedISO && selectedItems.length > 0 && (() => {
  const parsed = selectedItems.map(parseTimelineItem);
  const due = parsed.filter((p) => p.prefix === "Income" || p.prefix === "Bill" || p.prefix === "What-if");
  const spend = parsed.filter((p) => p.prefix === "Spending");
  const goals = parsed.filter((p) => p.prefix === "Goal");

  const section = (title, arr) => {
    if (!arr || arr.length === 0) return null;
    return (
      <div style={{ display: "grid", gap: 10 }}>
        <div style={{ fontWeight: 900, opacity: 0.9 }}>{title}</div>
        {arr.map((p, idx2) => {
          const isNegative = (p.delta || 0) < 0;
          const deltaAbs = Math.abs(p.delta || 0);
          // Find original timeline item for running value (if any)
          const orig = selectedItems.find((t) => String(t?.label || "") === p.raw && Number(t?.delta || 0) === Number(p.delta || 0)) || null;
          const runningVal = orig && typeof orig.running === "number" ? orig.running : null;

          return (
            <div key={idx2} style={{ ...rowBox, display: "grid", gap: 4 }}>
              <div style={{ display: "flex", justifyContent: "flex-start", gap: 10 }}>
                <div style={{ fontWeight: 900 }}>
                  {p.prefix} • {p.name}
                </div>
                <div style={{ fontWeight: 900, opacity: 0.95 }}>
                  {isNegative ? "-" : "+"}{formatMoney(deltaAbs.toFixed(2))}
                </div>
              </div>
              {runningVal !== null && (
                <div style={{ fontSize: 12, opacity: 0.75 }}>
                  Running balance: <strong>{formatMoney(runningVal.toFixed(2))}</strong>
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div style={{ display: "grid", gap: 14 }}>
      {section("Due (income / bills / what-if)", due)}
      {section("Spending logged", spend)}
      {section("Savings goals", goals)}
    </div>
  );
})()}        </div>
      </div>
    );
  })()}
</div>

<div style={{ display: "flex", gap: 10, marginTop: 14 }}>
            <button className="caBtn caBtnPrimary" onClick={() => goTo(5)}>
              Back to Review
            </button>
          </div>
        </div>
      )}

  </div>
          {showDisclaimer && (
        <div
          onClick={() => setShowDisclaimer(false)}
          className="caModalOverlay"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.55)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 10000,
            padding: 16,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="caModalCard"
            style={{
              maxWidth: 780,
              width: "100%",
              background: "rgba(10,12,22,0.96)",
              border: "1px solid rgba(226,232,240,0.16)",
              borderRadius: 18,
              padding: 16,
              color: "white",
              boxShadow: "0 24px 60px rgba(0,0,0,0.45)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-start", gap: 12 }}>
              <div style={{ fontWeight: 900, fontSize: 18 }}>Disclaimer</div>
              <button
                type="button"
                onClick={() => setShowDisclaimer(false)}
                className="caBtn caBtnPrimary"
                style={{ padding: "8px 12px", borderRadius: 12 }}
              >
                Close
              </button>
            </div>

            <div style={{ marginTop: 10, opacity: 0.92, lineHeight: 1.45, fontSize: 14 }}>
              ClearAhead is a budgeting and planning tool. It does not provide financial advice.
              You are responsible for your decisions. Figures are estimates based on the data you enter.
              If you need regulated financial advice, speak to a qualified professional.
            </div>
          </div>
        </div>
      )}

      
      {showProInfo && (
        <div
          onClick={() => setShowProInfo(false)}
          className="caModalOverlay"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.55)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 10000,
            padding: 16,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="caModalCard"
            style={{
              maxWidth: 780,
              width: "100%",
              background: "rgba(10,12,22,0.96)",
              border: "1px solid rgba(226,232,240,0.18)",
              borderRadius: 24,
              padding: 22,
              color: "rgba(241,245,249,0.96)",
              boxShadow: "0 30px 90px rgba(0,0,0,0.65)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-start", gap: 12 }}>
              <h2 style={{ margin: 0, fontSize: 26, letterSpacing: -0.6 }}>ClearAhead Pro</h2>
              {isPro && (
                <div
                  style={{
                    padding: "6px 10px",
                    borderRadius: 999,
                    background: "rgba(168,85,247,0.18)",
                    border: "1px solid rgba(168,85,247,0.45)",
                    fontWeight: 900,
                    fontSize: 12,
                    whiteSpace: "normal",
                overflowWrap: "anywhere",
                  }}
                >
                  Pro edition
                </div>
              )}
              <button
                onClick={() => setShowProInfo(false)}
                style={{
                  background: "#8b5cf6",
                  color: "white",
                  border: "none",
                  padding: "10px 14px",
                  borderRadius: 14,
                  fontWeight: 900,
                  cursor: "pointer",
                }}
              >
                Close
              </button>
            </div>

            <div style={{ marginTop: 12, lineHeight: 1.6, fontSize: 14, opacity: 0.92 }}>
              <p style={{ marginTop: 0 }}>
                ClearAhead Pro is a separate edition that adds deeper clarity on top of Basic — without changing how Basic works.
              </p>

              <div
                style={{
                  marginTop: 10,
                  padding: 14,
                  borderRadius: 16,
                  background: "rgba(255,255,255,0.06)",
                  border: "1px solid rgba(255,255,255,0.12)",
                }}
              >
                <div style={{ fontWeight: 900, marginBottom: 6 }}>What Pro includes</div>
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  <li><strong>Up to 12 weeks:</strong> extend your lookahead from 5 up to 12 weeks (slider on Page 1).</li>
                  <li><strong>Calendar (Page 6):</strong> a month view of your income and outgoings (read‑only).</li>
                  <li><strong>Pro Insights:</strong> clearer totals, lowest + highest balance, biggest incoming, and biggest outgoings.</li>
                  <li><strong>Gentle tips:</strong> optional suggestions to help you spot opportunities (no pressure) to save.</li>
                </ul>
              </div>

              <div style={{ marginTop: 12 }}>
                <div style={{ fontWeight: 900 }}>How to get Pro</div>
                {!isPro ? (
                  <div style={{ opacity: 0.9 }}>
                    To get Pro, download the <strong>ClearAhead Pro</strong> edition from the store.
                  </div>
                ) : (
                  <div style={{ opacity: 0.9 }}>
                    You’re using the <strong>ClearAhead Pro</strong> edition — Pro features are already unlocked.
                  </div>
                )}
                <div style={{ fontSize: 12, opacity: 0.75, marginTop: 6 }}>
                  Basic stays fully usable — Pro simply adds extra views and insights when you want them.
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

{showAbout && (
        <div
          onClick={closeAbout}
          className="caModalOverlay"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.55)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 10000,
            padding: 16,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="caModalCard"
            style={{
              maxWidth: 780,
              width: "100%",
              background: "rgba(10,12,22,0.96)",
              border: "1px solid rgba(226,232,240,0.18)",
              borderRadius: 24,
              padding: 22,
              color: "rgba(241,245,249,0.96)",
              boxShadow: "0 30px 90px rgba(0,0,0,0.65)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-start", gap: 12 }}>
              <h2 style={{ margin: 0, fontSize: 26, letterSpacing: -0.6 }}>About ClearAhead</h2>
              <button
                onClick={closeAbout}
                style={{
                  background: "#8b5cf6",
                  color: "white",
                  border: "none",
                  padding: "10px 14px",
                  borderRadius: 14,
                  fontWeight: 900,
                  cursor: "pointer",
                }}
              >
                Close
              </button>
            </div>

<div
  style={{
    marginTop: 10,
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
    alignItems: "center",
    fontSize: 12,
    opacity: 0.78,
  }}
>
  <span style={{ fontWeight: 800 }}>Version:</span>
  <span>v1.20</span>
  <span style={{ opacity: 0.55 }}>•</span>
  <span style={{ fontWeight: 800 }}>{isPro ? "Pro" : "Basic"}</span>
  <span style={{ opacity: 0.55 }}>•</span>
  <span>Support: www.ClearAhead.app</span>
  <span style={{ opacity: 0.55 }}>•</span>
  <span>Privacy: www.clearahead.app/#privacy</span>
</div>
<div style={{ fontSize: 10, opacity: 0.55, marginTop: 6 }}>
  © 2026 ClearAhead. All rights reserved.
</div>
            <div style={{ marginTop: 12, lineHeight: 1.6, fontSize: 14, opacity: 0.92 }}>
              <p style={{ marginTop: 0 }}>
                ClearAhead is a calm financial clarity tool for people who want to feel in control of the next few weeks —
                without spreadsheets, pressure, or judgement.
              </p>

              <p>
                It focuses on one simple question: <strong>what money is genuinely safe to spend</strong>, while still keeping your essentials covered.
                ClearAhead looks ahead across a short window (5 weeks) using the income, bills, and spending you enter, and shows:
              </p>

              <ul style={{ marginTop: 8 }}>
                <li><strong>Available now</strong> — a realistic view of what you can access within the look‑ahead window.</li>
                <li><strong>Safe to spend</strong> — a cautious guide that keeps a small fixed buffer aside for surprises.</li>
                <li><strong>Lowest projected balance</strong> — the tightest point in the next few weeks, so nothing catches you out.</li>
              </ul>

              <p>
                ClearAhead was created for real life — especially for people living month‑to‑month, single parents, and anyone who finds traditional budgeting tools stressful or hard to maintain.
                The tone is intentional: steady, kind, and practical.
              </p>

              <p>
                <strong>Privacy:</strong> ClearAhead is designed so your information stays on your device. ClearAhead doesn’t need you to link bank accounts and it doesn’t share your data.
              </p>

              <p style={{ marginBottom: 0 }}>
                <strong>Important:</strong> ClearAhead is not financial advice. It’s a planning helper — a way to sanity‑check your next few weeks and make calmer choices.
                The results are only as accurate as what you enter, so keeping income, bills, and spending up to date will improve accuracy.
              </p>
            </div>
          </div>
        </div>
      )}
</div>
  );

}
