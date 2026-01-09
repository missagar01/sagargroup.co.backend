# WhatsApp Group IDs Configuration

यह file सभी WhatsApp group IDs का record रखती है जो batch code forms के लिए उपयोग किए जा रहे हैं。

## Environment Variables (.env file में add करें)

⚠️ **Important**: `.env` file `backend/` folder में होनी चाहिए (project root में नहीं)

### Maytapi API Configuration
```env
# Maytapi API Credentials (REQUIRED)
# Format: No spaces around = sign, no quotes needed
MAYTAPI_PRODUCT_ID=c2b316da-bc95-4817-b3b2-3e85386e5919
MAYTAPI_PHONE_ID=103539
MAYTAPI_TOKEN=2b764851-f22d-45d0-a177-5adc59a11193
```

**Note**: 
- Values में spaces नहीं होने चाहिए
- Quotes (`"` या `'`) की जरूरत नहीं है
- `=` sign के बाद space नहीं होना चाहिए
- `.env` file `backend/.env` path पर होनी चाहिए

### Maytapi API Configuration
```env
MAYTAPI_PRODUCT_ID=your_maytapi_product_id
MAYTAPI_PHONE_ID=your_maytapi_phone_id
MAYTAPI_TOKEN=your_maytapi_api_token
```

### WhatsApp Group IDs

#### 1. SMS Register Groups
जब SMS Register form submit होता है, तो ये groups में message जाता है:
```env
WHATSAPP_GROUP_IDS_SMS_REGISTER=120363371185630374@g.us,120363399996753959@g.us,120363314801464816@g.us,120363404266583327@g.us
```

**Group IDs:**
- `120363371185630374@g.us`
- `120363399996753959@g.us`
- `120363314801464816@g.us`
- `120363404266583327@g.us`

---

#### 2. ReCoiler Groups
जब ReCoiler form submit होता है, तो ये groups में message जाता है:
```env
WHATSAPP_GROUP_IDS_RECOILER=120363402733616576@g.us,120363404266583327@g.us
```

**Group IDs:**
- `120363402733616576@g.us`
- `120363404266583327@g.us`

---

#### 3. Hot Coil Groups
जब Hot Coil form submit होता है, तो ये groups में message जाता है:
```env
WHATSAPP_GROUP_IDS_HOT_COIL=120363402733616576@g.us,120363404266583327@g.us
```

**Group IDs:**
- `120363402733616576@g.us`
- `120363404266583327@g.us`

---

#### 4. Pipe Mill Groups
जब Pipe Mill form submit होता है, तो ये groups में message जाता है:
```env
WHATSAPP_GROUP_IDS_PIPE_MILL=120363422258476187@g.us,120363404266583327@g.us,120363422260249261@g.us
```

**Group IDs:**
- `120363422258476187@g.us`
- `120363404266583327@g.us`
- `120363422260249261@g.us`

---

#### 5. QC Lab Samples Groups
जब QC Lab Samples form submit होता है, तो ये groups में message जाता है:
```env
WHATSAPP_GROUP_IDS_QC_LAB=120363314801464816@g.us,120363404266583327@g.us
```

**Group IDs:**
- `120363314801464816@g.us`
- `120363404266583327@g.us`

---

#### 6. Tundish Checklist Group
जब Tundish Checklist form submit होता है, तो ये group में message जाता है:
```env
WHATSAPP_GROUP_IDS_TUNDISH=120363403885610333@g.us
```

**Group ID:**
- `120363403885610333@g.us`

---

#### 7. Laddle Checklist Group
जब Laddle Checklist form submit होता है, तो ये group में message जाता है:
```env
WHATSAPP_GROUP_IDS_LADDLE=120363421662243846@g.us
```

**Group ID:**
- `120363421662243846@g.us`

---

## Complete .env Configuration Example

```env
# ============================================
# WHATSAPP NOTIFICATION CONFIGURATION
# ============================================
MAYTAPI_PRODUCT_ID=your_maytapi_product_id
MAYTAPI_PHONE_ID=your_maytapi_phone_id
MAYTAPI_TOKEN=your_maytapi_api_token

# ============================================
# WHATSAPP GROUP IDs FOR BATCH CODE FORMS
# ============================================
# SMS Register Groups (4 groups)
WHATSAPP_GROUP_IDS_SMS_REGISTER=120363371185630374@g.us,120363399996753959@g.us,120363314801464816@g.us,120363404266583327@g.us

# ReCoiler Groups (2 groups)
WHATSAPP_GROUP_IDS_RECOILER=120363402733616576@g.us,120363404266583327@g.us

# Hot Coil Groups (2 groups)
WHATSAPP_GROUP_IDS_HOT_COIL=120363402733616576@g.us,120363404266583327@g.us

# Pipe Mill Groups (3 groups)
WHATSAPP_GROUP_IDS_PIPE_MILL=120363422258476187@g.us,120363404266583327@g.us,120363422260249261@g.us

# QC Lab Samples Groups (2 groups)
WHATSAPP_GROUP_IDS_QC_LAB=120363314801464816@g.us,120363404266583327@g.us

# Tundish Checklist Group (1 group)
WHATSAPP_GROUP_IDS_TUNDISH=120363403885610333@g.us

# Laddle Checklist Group (1 group)
WHATSAPP_GROUP_IDS_LADDLE=120363421662243846@g.us
```

## Group IDs Summary

| Form Type | Number of Groups | Group IDs |
|-----------|-----------------|-----------|
| SMS Register | 4 | 120363371185630374@g.us, 120363399996753959@g.us, 120363314801464816@g.us, 120363404266583327@g.us |
| ReCoiler | 2 | 120363402733616576@g.us, 120363404266583327@g.us |
| Hot Coil | 2 | 120363402733616576@g.us, 120363404266583327@g.us |
| Pipe Mill | 3 | 120363422258476187@g.us, 120363404266583327@g.us, 120363422260249261@g.us |
| QC Lab Samples | 2 | 120363314801464816@g.us, 120363404266583327@g.us |
| Tundish Checklist | 1 | 120363403885610333@g.us |
| Laddle Checklist | 1 | 120363421662243846@g.us |

**Note:** कुछ group IDs कई forms के लिए common हैं (जैसे `120363404266583327@g.us` जो कई forms में use हो रहा है)

