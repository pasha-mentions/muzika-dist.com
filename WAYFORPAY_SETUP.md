# Налаштування Wayforpay Webhooks для Muzika

## 📋 Огляд

Для автоматичного оновлення статусу оплати релізів потрібно налаштувати **Service URL (Webhook)** в особистому кабінеті Wayforpay.

## 🔗 Webhook URL

Ваш webhook URL для production:
```
https://muzika-distribution.com/api/webhooks/wayforpay
```

## 📝 Інструкція з налаштування

### Крок 1: Увійдіть в особистий кабінет Wayforpay

1. Відкрийте [https://my.wayforpay.com](https://my.wayforpay.com)
2. Увійдіть зі своїми credentials

### Крок 2: Налаштуйте Service URL

1. Перейдіть в розділ **"Налаштування"** або **"Settings"**
2. Знайдіть секцію **"Service URL"** або **"Webhook URL"**
3. Вставте webhook URL:
   ```
   https://muzika-distribution.com/api/webhooks/wayforpay
   ```
4. Збережіть налаштування

### Крок 3: Налаштуйте кнопки оплати

Для кожної кнопки оплати (Single / Album) потрібно:

1. Відкрийте налаштування кнопки
2. Переконайтесь що **включено передачу параметрів**:
   - `orderReference` - обов'язковий параметр
   - `returnUrl` - URL для успішної оплати
   - `cancelUrl` - URL для відміненої оплати

### Крок 4: Перевірте Secret Key

1. Переконайтесь що **WAYFORPAY_SECRET_KEY** в Replit Secrets збігається з ключем з кабінету Wayforpay
2. Secret Key використовується для верифікації webhook запитів

## ✅ Як перевірити що працює

### Перевірка доступності webhook:

1. Відкрийте в браузері:
   ```
   https://muzika-distribution.com/api/webhooks/wayforpay
   ```

2. Ви повинні побачити відповідь:
   ```json
   {
     "status": "ok",
     "message": "Wayforpay webhook endpoint is accessible",
     "url": "https://muzika-distribution.com/api/webhooks/wayforpay",
     "timestamp": "2025-10-06T..."
   }
   ```

### Тестова оплата:

1. Створіть тестовий реліз
2. Натисніть кнопку оплати
3. Виконайте тестову оплату (або реальну)
4. Після успішної оплати:
   - Wayforpay надішле webhook на ваш URL
   - Система автоматично оновить статус релізу на **PAID**
   - В логах production ви побачите детальну інформацію

## 🔍 Діагностика проблем

### Перевірка логів:

Всі webhook запити логуються в таблицю `audit_logs`. Перевірити можна через SQL:

```sql
SELECT * FROM audit_logs 
WHERE action IN ('WAYFORPAY_WEBHOOK', 'PAYMENT_CONFIRMED', 'WAYFORPAY_WEBHOOK_ERROR')
ORDER BY created_at DESC 
LIMIT 10;
```

### Що логується:

1. **Вхідний webhook**:
   - Повний body запиту
   - Headers
   - Timestamp

2. **Верифікація підпису**:
   - Sign string
   - Очікуваний підпис
   - Отриманий підпис
   - Результат порівняння

3. **Обробка оплати**:
   - Release ID
   - Order Reference
   - Payment Amount
   - Transaction Status

4. **Відповідь до Wayforpay**:
   - Response sign string
   - Response signature

### Типові проблеми:

#### 1. Webhook не приходить
- ✅ Перевірте що Service URL правильно налаштований в Wayforpay
- ✅ Переконайтесь що URL доступний (тест через браузер)
- ✅ Перевірте що кнопка оплати налаштована на передачу параметрів

#### 2. Invalid signature
- ✅ Перевірте що WAYFORPAY_SECRET_KEY збігається з ключем в кабінеті
- ✅ Переконайтесь що немає зайвих пробілів в ключі

#### 3. Реліз не оновлюється
- ✅ Перевірте що orderReference співпадає (формат: `release_{releaseId}_{timestamp}`)
- ✅ Переконайтесь що transactionStatus = 'Approved'

## 🔐 Безпека

1. **Secret Key** ніколи не передається в відповідях API
2. Всі webhook запити **верифікуються** через HMAC-MD5 підпис
3. Логи **не містять** чутливих даних (номерів карток тощо)
4. Тільки запити з правильним підписом обробляються

## 📊 Як працює flow

```
User → Натискає "Оплатити" → 
  → Система створює orderReference (release_{id}_{timestamp})
  → Зберігає orderReference в БД
  → Redirects to Wayforpay

User → Оплачує на Wayforpay →
  → Wayforpay надсилає webhook на наш URL
  → Система верифікує підпис
  → Парсить releaseId з orderReference
  → Перевіряє що orderReference співпадає
  → Оновлює release.paymentStatus = 'PAID'
  → Записує paymentAmount і paidAt
  → Відповідає Wayforpay з підписом

User → Redirects назад →
  → Frontend перевіряє paymentStatus
  → Показує успіх / помилку
```

## 📞 Підтримка

Якщо виникають проблеми:

1. Перевірте логи через SQL запит вище
2. Переконайтесь що всі налаштування правильні
3. Зробіть тестову оплату і перевірте логи
4. При потребі зверніться до Wayforpay support

---

**Важливо:** Після кожного deploy в production переконайтесь що Secret Key все ще налаштований в Replit Secrets!
