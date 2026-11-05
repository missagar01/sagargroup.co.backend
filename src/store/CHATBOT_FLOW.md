# Store Chatbot Flow Documentation

## 0. Interview Me Kaise Bolna Hai

### Short Intro

Interview me aap is tarah start kar sakte ho:

```txt
Maine Store module ke liye ek chatbot / AI assistant flow implement kiya hai.
Iska purpose hai user ko natural language me item search, stock check, indent creation aur task/report queries karne dena.
System me do major flows hain: ek deterministic Oracle-backed store flow, aur dusra AI/LLM-backed assistant flow.
```

### Architecture Simple Words Me

```txt
Frontend React/TypeScript me chatbot UI bana hai.
Frontend API wrapper ke through backend ke /api/store/chatbot routes call karta hai.
Backend Express controller request receive karta hai.
Store item, stock aur indent ke liye backend Oracle DB query karta hai.
General natural-language questions ke liye backend pehle direct SQL handlers try karta hai, aur agar query complex/general ho to OpenAI model use karta hai.
```

### Store Flow Kaise Explain Karna Hai

```txt
Store flow me user item name ya item code type karta hai.
Frontend item suggestions ke liye backend ko call karta hai.
Backend Oracle table ITEM_MAST me item search karta hai.
User item select karta hai to backend VIEW_ITEM_STOCK_ENGINE se current stock fetch karta hai.
Stock calculate karne se pehle Oracle package LHS_UTILITY me financial-year date range set kiya jata hai.
Agar stock available hai to chatbot user ko stock quantity show karta hai.
Agar stock zero hai to chatbot indent form open karta hai.
User department, series, cost center, employee, make, quantity, specs aur purpose fill karta hai.
Submit par backend transaction ke andar INDENT_HEAD aur INDENT_BODY tables me indent save karta hai.
```

### Indent Save Kaise Explain Karna Hai

```txt
Indent creation fully controlled backend transaction hai, LLM se direct write operation nahi hota.
Backend pehle payload validate karta hai.
Phir config_mast se selected indent series ka entity aur division fetch karta hai.
vrseq_mast table se next VRNO generate karta hai.
LHSSYS_L2_TRAN_SEQ sequence se header aur body transaction sequence leta hai.
INDENT_HEAD me header insert hota hai.
Har item ke liye ITEM_MAST se UOM verify karke INDENT_BODY me item row insert hoti hai.
Agar sab successful hota hai to commit, warna rollback.
```

### AI / LLM Flow Kaise Explain Karna Hai

```txt
AI flow me user natural language me question puchta hai, jaise "aaj ke pending tasks dikhao" ya "ramesh naam se user dikhao".
Backend JWT token se logged-in user ka role, department aur division identify karta hai.
Important reports aur task queries ke liye maine direct SQL handlers rakhe hain, taaki critical counts galat na aaye.
Agar direct handler match nahi hota to backend OpenAI gpt-4o-mini ko call karta hai.
First OpenAI call intent detect karta hai: conversational, item search, blocked write request, ya SQL query.
SQL query case me LLM parameterized read-only SELECT query generate karta hai.
Backend SQL safety check karta hai: sirf SELECT/WITH allow hai, INSERT/UPDATE/DELETE/DROP blocked hain.
Phir backend Postgres me query execute karta hai.
Second OpenAI call query result ko readable Hinglish/HTML answer me summarize karta hai.
Frontend us response ko chat bubble, table, card ya CSV download option ke saath show karta hai.
```

### Security Kaise Explain Karna Hai

```txt
Security ke liye chatbot routes API key se protected hain.
Frontend pehle /config se API key load karta hai aur protected calls me Authorization Bearer header bhejta hai.
AI/general query ke liye user JWT bhi Authorization-User header me send hota hai.
Backend JWT verify karke row-level access apply karta hai.
User role ke basis par data scope decide hota hai: admin all data dekh sakta hai, normal user apna data, manager/HOD apne department/division ka data.
LLM-generated write queries allowed nahi hain.
```

### Database Kaise Explain Karna Hai

```txt
Is chatbot me do database side use hote hain.
Store operations Oracle DB par hain: ITEM_MAST, VIEW_ITEM_STOCK_ENGINE, config_mast, DEPT_MAST, COST_MAST, EMP_MAST, MAKE_MAST, INDENT_HEAD, INDENT_BODY, vrseq_mast.
Task and user assistant queries Postgres DB par hain: users, checklist, maintenance_task_assign, assign_task, delegation.
Oracle side transactional write indent ke liye hai, aur Postgres side reporting/query assistant ke liye hai.
```

### Agar Interviewer Puche: "LLM Ka Actual Use Kya Hai?"

Answer:

```txt
LLM ka use direct database write ke liye nahi hai.
LLM ka use natural language understanding, intent classification, safe read-only SQL generation, aur result summarization ke liye hai.
Critical task counts aur score reports ke liye direct SQL use kiya hai, kyunki waha accuracy important hai.
Indent creation LLM se nahi, controlled form validation aur Oracle transaction se hoti hai.
```

### Agar Interviewer Puche: "Query Wrong Generate Ho Gayi To?"

Answer:

```txt
Backend me multiple safety layers hain.
LLM ko prompt me schema aur rules diye gaye hain.
Generated SQL sirf SELECT ya WITH se start hona chahiye.
Insert, update, delete, drop, alter jaise keywords blocked hain.
Parameterized params array use hota hai.
Aur critical reports ke liye LLM-generated SQL use nahi kiya, hand-written SQL use kiya hai.
```

### Agar Interviewer Puche: "Stock Kaise Calculate Hota Hai?"

Answer:

```txt
Stock check me backend Oracle connection leta hai.
Current financial year start April 1 calculate hota hai.
LHS_UTILITY.SET_FROM_DATE aur SET_TO_DATE se Oracle package context set hota hai.
Uske baad VIEW_ITEM_STOCK_ENGINE se itemCode aur entity SR ke basis par stock sum hota hai.
Allowed division codes filter me rakhe gaye hain.
```

### Agar Interviewer Puche: "Transaction Handling Kaise Hai?"

Answer:

```txt
Indent creation ek atomic transaction hai.
VRNO generation, sequence update, INDENT_HEAD insert aur INDENT_BODY inserts sab same connection par autoCommit false ke saath hote hain.
Sab successful ho to commit hota hai.
Kisi bhi step me error aaye to rollback hota hai, isliye half-created indent database me nahi rahta.
```

### 1 Minute Interview Answer

```txt
Maine Store chatbot me React frontend, Express backend, Oracle aur Postgres integration use kiya.
User chatbot me item search karta hai, backend ITEM_MAST se item search karta hai, stock ke liye VIEW_ITEM_STOCK_ENGINE query karta hai.
Agar stock zero ho to chatbot indent form open karta hai aur backend Oracle transaction ke through INDENT_HEAD aur INDENT_BODY me indent save karta hai.
AI side me user natural language me task, user, score ya report query puch sakta hai.
Backend pehle deterministic SQL handlers try karta hai. Agar direct handler match nahi hota to OpenAI gpt-4o-mini se intent aur read-only SQL generate karwata hai.
Generated SQL par safety checks hain, write operations blocked hain, aur result ko second LLM call se readable Hinglish/HTML response me summarize kiya jata hai.
Security me API key aur JWT dono use hote hain, aur user role ke basis par data visibility apply hoti hai.
```

### 30 Second Short Answer

```txt
Ye chatbot Store module ke liye AI assistant hai. Isme item search, stock check aur indent creation Oracle DB se hota hai. Stock zero hone par user form fill karta hai aur backend transaction ke through INDENT_HEAD/INDENT_BODY me indent save karta hai. General questions ke liye backend OpenAI gpt-4o-mini use karta hai jo intent detect karke safe read-only SQL generate karta hai. Critical task reports direct hand-written SQL se handle hote hain. API key, JWT aur SQL safety checks se security maintain ki gayi hai.
```

## 1. Short Summary

Store chatbot ka main flow do parts me divided hai:

1. **Store item / stock / indent flow**
   - Frontend item search karta hai.
   - Backend Oracle DB se item aur stock data fetch karta hai.
   - Agar stock `0` hai to user indent form fill karta hai.
   - Backend Oracle DB me `INDENT_HEAD` aur `INDENT_BODY` me indent save karta hai.

2. **AI / LLM general assistant flow**
   - User natural language me query type karta hai.
   - Backend pehle kuch important task/score/admin report queries ko direct SQL se handle karta hai.
   - Agar direct handler match nahi hota, tab OpenAI `gpt-4o-mini` use hota hai.
   - LLM intent detect karta hai, read-only SQL generate karta hai, backend SQL execute karta hai, phir LLM result ko readable Hinglish/HTML reply me summarize karta hai.

Important files:

- Frontend page: `frontend/src/pages/store/pages/store/ChatBot.tsx`
- Frontend API wrapper: `frontend/src/api/store/chatbotApi.ts`
- Backend routes: `backend/src/store/src/routes/chatbotRoutes.js`
- Backend controller: `backend/src/store/src/controllers/chatbotController.js`
- Oracle service: `backend/src/store/src/services/chatbotService.js`
- API key middleware: `backend/src/store/src/middlewares/auth.middleware.js`

## 2. Route Mounting

Store routes index me chatbot route mount hota hai:

```js
router.use("/chatbot", chatbotRoutes);
```

Final API base path:

```txt
/api/store/chatbot
```

Frontend `chatbotApi.ts` me same base path use hota hai:

```ts
const CHATBOT_BASE_PATH = "/api/store/chatbot";
```

## 3. Security / Auth Flow

### 3.1 Chatbot API Key

Route:

```txt
GET /api/store/chatbot/config
```

Ye frontend ko backend ka `process.env.API_KEY` return karta hai:

```json
{ "apiKey": "..." }
```

Protected chatbot routes me `validateApiKey` middleware use hota hai. Frontend har protected request me header bhejta hai:

```txt
Authorization: Bearer <API_KEY>
```

Middleware expected key:

```js
const expectedApiKey = process.env.API_KEY;
```

### 3.2 User JWT for AI Queries

General AI query endpoints me user token separate custom header me jata hai:

```txt
Authorization-User: Bearer <localStorage token>
```

Backend `jwt.verify()` se user decode karta hai. Is decoded data se row-level access decide hota hai:

- `user_name`
- `role`
- `designation`
- `department`
- `division`
- `system_access`
- `user_access1`

## 4. Frontend Flow

File: `frontend/src/pages/store/pages/store/ChatBot.tsx`

### 4.1 Initial Load

Frontend `getBootstrapData()` call karta hai. Ye parallel me master data load karta hai:

- departments
- indent series
- cost codes
- employees
- makes

API wrapper:

```ts
chatbotApi.getBootstrapData()
```

Backend endpoints:

```txt
GET /api/store/chatbot/departments
GET /api/store/chatbot/series
GET /api/store/chatbot/cost-codes
GET /api/store/chatbot/employees
GET /api/store/chatbot/makes
```

### 4.2 Item Search / Suggestion

Jab user input me `indent`, `item`, `stock`, `purchase`, `procurement` jaise keywords type karta hai, frontend item suggestion ke liye call karta hai:

```ts
chatbotApi.searchItems(cleanQuery, apiKey)
```

Backend route:

```txt
GET /api/store/chatbot/items?q=<search>
```

### 4.3 Stock Check

User item select karta hai, frontend stock check karta hai:

```ts
chatbotApi.getItemStock(item.itemCode, apiKey)
```

Backend route:

```txt
GET /api/store/chatbot/stock/:itemCode
```

If stock > 0:

- Bot message: stock available hai, issue kara sakte hain.

If stock = 0:

- Bot user se puchta hai: indent dalna hai?
- User "haan" karta hai to indent form open hota hai.

### 4.4 Indent Cart Flow

Indent form me user fill karta hai:

- employee
- department
- indent series
- division, only for `I5`
- cost center
- quantity
- make
- specs
- purpose
- due date

Multiple items support hai:

- First item header data set karta hai.
- Har item cart me add hota hai.
- Final summary ke baad `Confirm & Send to DB` click par backend call hota hai.

API:

```ts
chatbotApi.createIndent(payload, apiKey)
```

Route:

```txt
POST /api/store/chatbot/indent
```

## 5. Backend Route List

File: `backend/src/store/src/routes/chatbotRoutes.js`

```txt
GET  /config              Public API key config
GET  /items               Search Oracle ITEM_MAST
GET  /stock/:itemCode     Get Oracle item stock
GET  /series              Get Oracle indent series
GET  /departments         Get Oracle departments
GET  /task-departments    Get task departments from Postgres modules
GET  /cost-codes          Get Oracle cost centers
GET  /employees           Get Oracle employees
GET  /makes               Get Oracle makes
POST /indent              Create Oracle indent
POST /users/query         Legacy wrapper to queryGeneral
POST /tasks/query         Legacy wrapper to queryGeneral
POST /query               Main AI/general assistant endpoint
```

## 6. Oracle Store Service Flow

File: `backend/src/store/src/services/chatbotService.js`

### 6.1 Oracle Connection

Service `getConnection()` use karta hai:

```js
import { getConnection } from "../config/db.js";
```

`db.js` Oracle pool initialize karta hai using:

- `STORE_ORACLE_USER` / `ORACLE_USER`
- `STORE_ORACLE_PASSWORD` / `ORACLE_PASSWORD`
- `STORE_ORACLE_CONNECTION_STRING` / `ORACLE_CONNECTION_STRING`
- Optional SSH tunnel config
- Oracle thick client

### 6.2 Item Search Query

Function:

```js
searchItems(query)
```

Oracle query:

```sql
SELECT ITEM_CODE as "itemCode", ITEM_NAME as "itemName", UM as "um"
FROM ITEM_MAST
WHERE (UPPER(ITEM_CODE) LIKE UPPER(:query) OR UPPER(ITEM_NAME) LIKE UPPER(:query))
  AND ROWNUM <= 25
```

Purpose:

- Item code ya item name se matching items laata hai.
- Max 25 rows.

### 6.3 Stock Query

Function:

```js
getItemStock(itemCode)
```

Step 1: Current financial year start calculate hota hai:

- April 1 se current date tak.
- Example: `01-APR-26` to current date.

Step 2: Oracle package date context set hota hai:

```sql
BEGIN
  LHS_UTILITY.SET_FROM_DATE( TO_DATE(:p_from, 'DD-MON-RR') );
  LHS_UTILITY.SET_TO_DATE( TO_DATE(:p_to,  'DD-MON-RR') );
END;
```

Step 3: Stock query:

```sql
SELECT SUM(NVL(YRCLQTY_ENGINE, 0)) AS "stock"
FROM VIEW_ITEM_STOCK_ENGINE
WHERE ITEM_CODE = :itemCode
  AND ENTITY_CODE = 'SR'
  AND (
      div_code IN ('C1','C2','CO','F1','F2','F3','PM','R1','R2','RM','RP','SM')
      OR div_code IS NULL
  )
```

Purpose:

- `VIEW_ITEM_STOCK_ENGINE` se available stock sum karta hai.
- Entity `SR` fixed hai.
- Allowed divisions fixed list me hain.

### 6.4 Indent Series Query

Function:

```js
getIndentSeries()
```

Query:

```sql
SELECT DISTINCT SERIES as "series", BHEADING as "descr", ENTITY_CODE as "entityCode", DIV_CODE as "divCode"
FROM config_mast
WHERE TCODE = 'I'
  AND ENTITY_CODE = 'SR'
  AND SERIES IN ('I1', 'I3', 'I4', 'I5')
ORDER BY SERIES
```

Purpose:

- Allowed indent series list deta hai.

### 6.5 Departments Query

Function:

```js
getDepartments()
```

Query:

```sql
SELECT DISTINCT DEPT_CODE as "deptCode", NVL(DEPT_NAME, DEPT_CODE) as "deptName"
FROM DEPT_MAST
WHERE DEPT_CODE IS NOT NULL
ORDER BY DEPT_CODE
```

### 6.6 Cost Codes Query

Function:

```js
getCostCodes()
```

Query:

```sql
SELECT COST_CODE as "costCode", COST_NAME as "costName"
FROM COST_MAST
WHERE COST_CODE IS NOT NULL
ORDER BY COST_CODE
```

### 6.7 Employees Query

Function:

```js
getEmployees()
```

Query:

```sql
SELECT DISTINCT TRIM(PASSPORT_NO) as "empCode", TRIM(EMP_NAME) as "empName"
FROM EMP_MAST
WHERE PASSPORT_NO IS NOT NULL AND EMP_NAME IS NOT NULL
ORDER BY TRIM(EMP_NAME)
```

Note:

- Frontend me employee code `userCode` ki tarah payload me jata hai.
- Service currently final Oracle user code hardcoded use karta hai:

```js
const finalUserCode = 'SR00113';
```

### 6.8 Makes Query

Function:

```js
getMakes()
```

Query:

```sql
SELECT DISTINCT MAKE_CODE as "makeCode", TRIM(MAKE_NAME) as "makeName"
FROM MAKE_MAST
WHERE MAKE_CODE IS NOT NULL AND MAKE_NAME IS NOT NULL
ORDER BY TRIM(MAKE_NAME)
```

## 7. Create Indent Full Backend Flow

Frontend final payload example:

```json
{
  "deptCode": "STORE",
  "series": "I1",
  "divCode": null,
  "costCode": "CC001",
  "userCode": "S001",
  "empName": "Employee Name",
  "dueDate": "2026-09-29",
  "items": [
    {
      "itemCode": "ITEM001",
      "qty": 2,
      "make": "MK001",
      "specs": "Required specs",
      "purpose": "Required purpose"
    }
  ]
}
```

### 7.1 Controller Validation

File: `chatbotController.js`, function `createIndent`.

Validations:

- `deptCode` required
- `series` required
- `costCode` required
- If `series === 'I5'`, then `divCode` required
- Every item requires:
  - `itemCode`
  - positive `qty`
  - `make`
  - valid `specs`
  - valid `purpose`

Specs/purpose validation checks at least 2 Hindi/English letters or numbers.

### 7.2 Series Config Query

Service fetches exact entity and division:

```sql
SELECT ENTITY_CODE as "entityCode", DIV_CODE as "divCode"
FROM config_mast
WHERE SERIES = :series AND TCODE = 'I' AND ROWNUM = 1
```

Fallback division:

- If entity `AL`, division `C2`
- If entity `PA`, division `C1`
- Else division `CO`

### 7.3 New VRNO Generation

Prefix format:

```txt
I + series + yy + Y-
```

Example:

```txt
II126Y-
```

Query:

```sql
SELECT :series || :yy || 'Y-' ||
       LPAD(
            NVL((
                SELECT TO_NUMBER(t.lastvrno)
                FROM vrseq_mast t
                WHERE t.vrprefix = :prefix
                  AND t.entity_code = :entityCode
            ),0) + 1,
       5,
       '0') AS "new_vrno"
FROM dual
```

Then sequence update:

```sql
UPDATE vrseq_mast
SET lastvrno = TO_CHAR(TO_NUMBER(NVL(lastvrno, '0')) + 1)
WHERE vrprefix = :prefix AND entity_code = :entityCode
```

If row does not exist:

```sql
INSERT INTO vrseq_mast (ENTITY_CODE, VRPREFIX, LASTVRNO)
VALUES (:entityCode, :prefix, '1')
```

### 7.4 Transaction Sequence

Header and body use Oracle sequence:

```sql
SELECT LHSSYS_L2_TRAN_SEQ.NEXTVAL as "seq" FROM dual
```

### 7.5 Insert INDENT_HEAD

Query:

```sql
INSERT INTO INDENT_HEAD (
  ENTITY_CODE, TCODE, VRNO, VRDATE, DEPT_CODE, INDENT_REMARK,
  AUTOINDENT_FLAG, USER_CODE, LASTUPDATE, CURRENCY_CODE, EXCHANGE_RATE,
  CREATEDBY, CREATEDDATE, HEAD_TRAN_SEQ
) VALUES (
  :entityCode, 'I', :newVrNo, :currentDate, :deptCode, :indentRemark,
  'N', :userCode, :now, 'INR', 1,
  :userCode, :now, :headTranSeq
)
```

Indent remark:

```txt
Created via Chatbot - <empName>
```

### 7.6 Item UM Check

For every item:

```sql
SELECT UM as "um" FROM ITEM_MAST WHERE ITEM_CODE = :itemCode
```

If item not found, transaction fails and rollback hota hai.

### 7.7 Insert INDENT_BODY

Query:

```sql
INSERT INTO INDENT_BODY (
  ENTITY_CODE, TCODE, VRNO, SLNO, VRDATE, DIV_CODE, ITEM_CODE,
  UM, QTYINDENT, AUM, AQTYINDENT, RATE, REMARK, PURPOSE_REMARK,
  DUEDATE, PRIORITY_INDEX, COST_CODE, MAKE_CODE, AUMTOUM, QTYREQ,
  STOCK_TYPE, FC_RATE, TRAN_SEQ
) VALUES (
  :entityCode, 'I', :newVrNo, :slno, :currentDate, :divCode, :itemCode,
  :um, :qty, :um, :qty, 1, :specs, :purpose,
  :parsedDueDate, 'U', :costCode, :make, 1, :qty,
  'R', 1, :bodyTranSeq
)
```

### 7.8 Commit / Rollback

Success:

```js
await connection.commit();
```

Error:

```js
await connection.rollback();
```

Response:

```json
{
  "success": true,
  "vrNo": "I126Y-00001",
  "message": "Indent ... raised successfully ..."
}
```

## 8. AI / LLM Query Flow

Main route:

```txt
POST /api/store/chatbot/query
```

Frontend method:

```ts
chatbotApi.queryGeneral(queryText, userToken, apiKey, history)
```

Backend function:

```js
queryGeneral(req, res, next)
```

### 8.1 Request Body

```json
{
  "queryText": "aaj ke pending tasks dikhao",
  "chatHistory": [
    { "role": "user", "content": "..." },
    { "role": "assistant", "content": "..." }
  ]
}
```

Frontend max 6 turns history bhejta hai. Backend `sanitizeChatHistory()` last 12 messages max, each 500 chars tak trim karta hai.

### 8.2 Direct Deterministic Handlers Before LLM

LLM call se pehle backend kuch queries direct SQL se handle karta hai. Ye isliye ki important reports me LLM-generated SQL wrong na ho.

Direct handlers:

1. Admin reports:
   - `chronic defaulters report`
   - `department leaderboard`
   - `monthly trend comparison`
   - `department-wise score`
   - `doer-wise score`

2. Score query:
   - `score`, `performance`, `marks`
   - `getDirectUserScoreData()`

3. Task query:
   - `task`, `checklist`, `maintenance`, `housekeeping`, `delegation`, `pending`, `not done`
   - `handleDirectTaskInterception()`

Direct task handler supports:

- today
- yesterday
- tomorrow
- pending
- not done
- this month
- custom date `YYYY-MM-DD`
- date range like `01-07-2026 se 10-07-2026 tak`
- department filter
- staff name filter
- module filter

### 8.3 Direct Task Tables

Task data Postgres tables:

```txt
public.checklist
public.maintenance_task_assign
public.assign_task
public.delegation
```

Status meaning:

- Checklist / housekeeping:
  - completed: `LOWER(status::text) = 'yes'`
  - not done: `submission_date IS NOT NULL AND LOWER(status::text) = 'no'`
  - pending: `submission_date IS NULL`

- Maintenance:
  - completed: `LOWER(task_status::text) = 'yes'`
  - not done: `actual_date IS NOT NULL AND LOWER(task_status::text) = 'no'`
  - pending: `actual_date IS NULL`

- Delegation:
  - completed: `status = 'done'`
  - pending: `status IS NULL OR status = 'extend'`
  - no not-done bucket
  - date filter uses `planned_date`, not `task_start_date`

### 8.4 OpenAI Call 1: Intent + SQL Generation

If direct handlers do not return result, backend requires:

```env
OPENAI_API_KEY=...
```

OpenAI endpoint:

```txt
https://api.openai.com/v1/chat/completions
```

Model:

```txt
gpt-4o-mini
```

Call config:

```json
{
  "model": "gpt-4o-mini",
  "response_format": { "type": "json_object" },
  "temperature": 0.1
}
```

System prompt contains:

- current Kolkata date/time
- chat history instruction
- schema for:
  - `public.users`
  - `public.checklist`
  - `public.maintenance_task_assign`
  - `public.assign_task`
  - `public.delegation`
  - `public.repair_system`
  - `public.repair_followup`
- row-level visibility rules
- user search rules
- task definitions
- SQL safety rules
- intent classification rules

Expected LLM JSON:

```json
{
  "intent": "conversational | search_item | modify_blocked | sql_query | error",
  "sql": "SELECT ...",
  "params": [],
  "resultType": "users | tasks | tasksSummary | taskDiagnostic | tasksCountBreakdown | scoreData | general",
  "reply": "message",
  "searchTerm": "clean item term"
}
```

### 8.5 Intent Handling

#### conversational

Backend returns message directly:

```json
{
  "success": true,
  "resultType": "general",
  "message": "..."
}
```

#### search_item

Backend redirects to Oracle item search:

```js
chatbotService.searchItems(searchTerm)
```

Response:

```json
{
  "success": true,
  "resultType": "items",
  "items": []
}
```

#### modify_blocked

Write/update/delete/drop type queries blocked:

```txt
Only data display is allowed.
```

#### sql_query

Backend safety check karta hai:

Allowed:

```txt
SELECT ...
WITH ...
```

Forbidden keywords:

```txt
insert, update, delete, drop, alter, truncate, create, replace, grant, revoke, set, rename
```

Then Postgres query execute hoti hai:

```js
const queryResult = await pool.query(sql, params || []);
```

### 8.6 OpenAI Call 2: Result Summarization

SQL execute hone ke baad backend second OpenAI call karta hai.

Purpose:

- Raw DB rows ko readable Hinglish/Hindi/English response me convert karna.
- Basic HTML table/list create karna.

Model:

```txt
gpt-4o-mini
```

Temperature:

```txt
0.3
```

Prompt includes:

- original user query
- SQL run
- params
- first 50 DB rows

Output:

- Clean HTML message, no markdown, no raw JSON.

## 9. Important Direct Report Queries

### 9.1 Task Departments

Route:

```txt
GET /api/store/chatbot/task-departments
```

Query:

```sql
SELECT department FROM (
  SELECT department FROM checklist WHERE department IS NOT NULL
  UNION
  SELECT COALESCE(doer_department, machine_department) AS department FROM maintenance_task_assign
  UNION
  SELECT doer_department AS department FROM assign_task WHERE doer_department IS NOT NULL
  UNION
  SELECT department FROM delegation WHERE department IS NOT NULL
) d
WHERE department IS NOT NULL AND TRIM(department) <> ''
ORDER BY department ASC
```

### 9.2 Chronic Defaulters Report

Purpose:

- Last 30 days me sabse zyada overdue/not-done tasks wale top users.

Tables:

- checklist
- maintenance_task_assign
- assign_task
- delegation

Logic:

- task date current date se pehle
- last 30 days
- pending or not done
- group by doer and department
- top 15

### 9.3 Department Leaderboard

Purpose:

- Current month me department-wise completion percentage.

Logic:

- all four task modules union
- total count
- completed count
- completion percentage
- `HAVING COUNT(*) >= 5`
- top 20

### 9.4 Monthly Trend Comparison

Purpose:

- Current month till today vs previous full month completion percentage.

### 9.5 Score Queries

Score formula:

```txt
completion_score = (completed / total * 100) - 100
```

Meaning:

- `0` = perfect score
- negative value = missed/not completed tasks
- minimum capped at `-100`

Score tables:

- checklist
- maintenance_task_assign
- assign_task

Note:

- Score logic currently delegation table include nahi karta.
- Task listing/count logic delegation include karta hai.

## 10. Response Types Frontend Handles

Frontend `executeGeneralQuery()` resultType ke basis par render karta hai:

```txt
items
users
tasks
tasksSummary
taskDiagnostic
tasksCountBreakdown
scoreData
general
```

For `items`:

- user ko item select buttons dikhte hain.

For `tasks`:

- task list/table card render hota hai.

For `scoreData`:

- score card render hota hai.

For `general`:

- backend HTML message directly chat bubble me show hota hai.
- optional CSV download data supported hai via `exportRows` and `exportFilename`.

## 11. Full End-to-End Example: Stock 0 to Indent

1. User types:

```txt
stock bearing
```

2. Frontend cleans text:

```txt
bearing
```

3. Frontend calls:

```txt
GET /api/store/chatbot/items?q=bearing
```

4. Backend Oracle query searches `ITEM_MAST`.

5. User selects item.

6. Frontend calls:

```txt
GET /api/store/chatbot/stock/<itemCode>
```

7. Backend:

- sets `LHS_UTILITY` from/to date
- queries `VIEW_ITEM_STOCK_ENGINE`

8. If stock is `0`, frontend asks indent confirmation.

9. User fills indent form.

10. Frontend sends:

```txt
POST /api/store/chatbot/indent
```

11. Backend:

- validates payload
- fetches series config
- generates VRNO from `vrseq_mast`
- updates/inserts `vrseq_mast`
- inserts `INDENT_HEAD`
- inserts one or more `INDENT_BODY` rows
- commits transaction

12. Frontend shows success card with `vrNo`.

## 12. Full End-to-End Example: AI Task Query

1. User types:

```txt
aaj ke pending tasks dikhao
```

2. Frontend sends:

```txt
POST /api/store/chatbot/query
Authorization: Bearer <API_KEY>
Authorization-User: Bearer <JWT>
```

3. Backend verifies:

- API key
- JWT token

4. Backend detects task intent in direct handler.

5. Backend queries all task modules directly:

- checklist
- maintenance
- housekeeping
- delegation

6. Backend returns summary/table HTML plus optional list data.

7. Frontend renders chat bubble and options like:

- Show List
- Close

In this example OpenAI call nahi hota because direct task handler matched.

## 13. Full End-to-End Example: LLM SQL Query

1. User asks:

```txt
ramesh naam se users dikhao
```

2. Direct task/score/admin handlers match nahi hote.

3. Backend sends prompt to OpenAI.

4. LLM returns JSON like:

```json
{
  "intent": "sql_query",
  "sql": "SELECT user_name, employee_id, role::text, designation, department, division, status FROM public.users WHERE LOWER(user_name) LIKE '%' || LOWER($1) || '%' AND LOWER(role::text) <> 'admin' LIMIT 30",
  "params": ["ramesh"],
  "resultType": "users"
}
```

5. Backend validates SQL is read-only.

6. Backend executes Postgres query.

7. Backend sends rows to OpenAI second call for summary.

8. Frontend renders final answer.

## 14. Important Observations

- Store item/stock/indent flow is mostly deterministic and Oracle-backed.
- AI/LLM is mainly used for natural language understanding, SQL generation, and summarization.
- Critical task reports are intentionally hand-written SQL to avoid wrong LLM output.
- Write operations from LLM-generated SQL are blocked.
- Actual indent creation is not done by LLM; it is a controlled form + backend transaction.
- `queryUsers` and `queryTasks` currently call `queryGeneral`, so `/query` is the main path.
- Some Hindi strings in source appear mojibake/encoding-corrupted in places, but runtime may still show correct strings depending on file encoding/build path.

## 15. Environment Variables Used

Common required variables:

```env
API_KEY=...
JWT_SECRET=...
OPENAI_API_KEY=...
STORE_ORACLE_USER=...
STORE_ORACLE_PASSWORD=...
STORE_ORACLE_CONNECTION_STRING=...
ENABLE_ORACLE=...
```

Optional Oracle/SSH variables:

```env
SSH_HOST=...
SSH_USER=...
SSH_PASSWORD=...
STORE_ORACLE_SERVICE_NAME=...
STORE_ORACLE_POOL_MIN=...
STORE_ORACLE_POOL_MAX=...
STORE_ORACLE_CONNECT_RETRIES=...
```
