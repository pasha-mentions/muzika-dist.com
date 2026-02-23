# 📄 Distribution Agreement Translation Guide

## Overview
This guide explains how to add Ukrainian and Polish translations to the Distribution Agreement.

## File Structure

```
shared/
├── agreements.ts          ← MAIN FILE - Edit this file to add translations
├── agreement.ts           ← OLD FILE (English only) - kept for reference
├── agreement ua.ts        ← REFERENCE - Ukrainian version (copy from here)
└── AGREEMENT_TRANSLATION_GUIDE.md  ← This guide
```

## How to Add Translations

### 🇺🇦 Step 1: Add Ukrainian Translation

1. Open file: `shared/agreement ua.ts`
2. Copy the ENTIRE text starting from line 1: `Угода про дистрибуцію muzika.ua`
3. Open file: `shared/agreements.ts`
4. Find the section marked:
   ```typescript
   // ============================================================
   // UKRAINIAN VERSION (UK) ✅
   // ============================================================
   export const distributionAgreementUK = `
   ```
5. **DELETE** the warning placeholder text
6. **PASTE** the Ukrainian agreement text
7. Save the file

**Expected result:**
```typescript
export const distributionAgreementUK = `Угода про дистрибуцію muzika.ua

станом на 3 жовтня 2025 року

Ця Угода про дистрибуцію та Умови користування...
(rest of the Ukrainian text)
`;
```

---

### 🇵🇱 Step 2: Add Polish Translation

1. Translate the English version OR get professional translation
2. Open file: `shared/agreements.ts`
3. Find the section marked:
   ```typescript
   // ============================================================
   // POLISH VERSION (PL) ⚠️ NEEDS TRANSLATION
   // ============================================================
   export const distributionAgreementPL = `
   ```
4. **DELETE** the warning placeholder text
5. **PASTE** the Polish agreement text
6. Save the file

**Structure to maintain:**
- Date format: "na dzień 3 października 2025"
- Company name: app.muzika
- All section numbers (1-10)
- All subsections (a, b, c, d.1, etc.)

---

## ✅ Verification Checklist

After adding translations, verify:

- [ ] File `shared/agreements.ts` contains THREE complete agreement texts
- [ ] No placeholder warnings remain (⚠️⚠️⚠️)
- [ ] Each agreement starts with company name and date
- [ ] All sections (1-10) are present in all languages
- [ ] No syntax errors (check closing backticks ` at the end)

## 🧪 How to Test

1. Start the application
2. Go to Settings → Profile tab
3. Scroll to "Distribution Agreement" section
4. Change language in header: EN → UK → PL
5. Verify agreement text changes accordingly

## 🔧 Technical Details

The system automatically selects the correct agreement based on the current interface language:

```typescript
// Automatically called with current language
getDistributionAgreement(i18n.language as 'en' | 'uk' | 'pl')
```

**Language codes:**
- `'en'` - English (default)
- `'uk'` - Ukrainian  
- `'pl'` - Polish

## 📝 Important Notes

1. **Keep the structure:** All three versions should have the same sections
2. **Preserve formatting:** Use the same line breaks and spacing
3. **Date consistency:** Update the date if agreement changes
4. **Legal review:** Always have legal counsel review translations
5. **Backup:** The old files (`agreement.ts` and `agreement ua.ts`) are kept for reference

## 🆘 Troubleshooting

**Problem:** Agreement shows warning text instead of actual agreement
- **Solution:** You forgot to paste the actual text - follow steps above

**Problem:** Application crashes after editing
- **Solution:** Check for missing closing backtick ` at the end of each agreement

**Problem:** Agreement doesn't change when switching language
- **Solution:** Hard refresh the browser (Ctrl+Shift+R or Cmd+Shift+R)

---

**Last updated:** October 21, 2025
