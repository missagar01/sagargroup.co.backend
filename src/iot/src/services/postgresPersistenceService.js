const { Pool } = require('pg');
const { getPgPool } = require('../../../../config/pg');
const {
  METER_FIELD_DEFINITIONS,
  extractStructuredPayloadValues,
  parsePayload,
} = require('../utils/payloadParser');
const { buildDashboardSummary } = require('./summaryBuilder');

const DEFAULT_RETRY_DELAY_MS = 10000;
const MAX_PENDING_WRITES = 5000;
const TABLE_NAME = 'mqtt_messages';
const LEGACY_PAYLOAD_COLUMNS = ['raw_payload', 'payload_json'];
const STRUCTURED_COLUMN_DEFINITIONS = [
  { column: 'device_uid', type: 'TEXT', responseKey: 'deviceUid' },
  ...METER_FIELD_DEFINITIONS.map(({ column, type, responseKey }) => ({ column, type, responseKey })),
];

class PostgresPersistenceService {
  constructor() {
    this.config = null;
    this.pool = null;
    this.pendingMessages = [];
    this.isFlushing = false;
    this.retryTimer = null;
    this.status = 'disabled';
    this.lastError = null;
    this.retryAttempt = 0;
    this.nextRetryAt = null;
    this.isConnecting = false;
    this.usesSharedPool = false;

    // Buffer for 30-minute aggregation
    this.activeSlot = null; // String: e.g. "2026-05-21T12:00:00.000Z"
    this.messageBuffer = []; // Array of message objects
    this.flushTimer = null;
  }

  async initialize(config) {
    this.config = config;

    if (!this.isEnabled()) {
      console.log('PostgreSQL persistence disabled. Missing database connection settings.');
      return;
    }

    // Start periodic flush check timer (every 1 minute)
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }
    this.flushTimer = setInterval(() => {
      this.checkPeriodicFlush();
    }, 60000);

    await this.connect();
  }

  isEnabled() {
    if (this.shouldUseSharedPool()) {
      return true;
    }

    return Boolean(this.config?.host && this.config?.user && this.config?.database && this.config?.port);
  }

  hasSharedPoolConfig() {
    return Boolean(
      process.env.DATABASE_URL ||
      (
        (process.env.DB_HOST || process.env.PG_HOST) &&
        (process.env.DB_USER || process.env.PG_USER) &&
        (process.env.DB_NAME || process.env.PG_DATABASE || process.env.PG_NAME)
      )
    );
  }

  shouldUseSharedPool() {
    return Boolean(this.config?.useSharedPool) && this.hasSharedPoolConfig();
  }

  getStatus() {
    return {
      enabled: this.isEnabled(),
      status: this.status,
      pendingWrites: this.messageBuffer.length,
      lastError: this.lastError,
      tableName: TABLE_NAME,
      nextRetryAt: this.nextRetryAt,
    };
  }

  isReady() {
    return this.status === 'ready' && Boolean(this.pool);
  }

  getSlotTimestamp(timestampStr) {
    try {
      const date = new Date(timestampStr);
      if (isNaN(date.getTime())) {
        return null;
      }
      const minutes = date.getMinutes();
      const slotMinutes = minutes < 30 ? 0 : 30;
      
      const slotDate = new Date(date);
      slotDate.setMinutes(slotMinutes, 0, 0);
      slotDate.setSeconds(0, 0);
      return slotDate.toISOString();
    } catch (e) {
      return null;
    }
  }

  enqueueMessage(message, brokerUrl) {
    if (!this.isEnabled()) {
      return;
    }

    const parseResult = parsePayload(message.raw);
    const parsedPayload = parseResult.parsed ? parseResult.payload : null;
    const { values: structuredValues } =
      parsedPayload && typeof parsedPayload === 'object' && !Array.isArray(parsedPayload)
        ? extractStructuredPayloadValues(parsedPayload)
        : { payload: null, values: { device_uid: null } };

    const slot = this.getSlotTimestamp(message.timestamp);
    if (!slot) {
      return;
    }

    // Initialize first slot if not set
    if (!this.activeSlot) {
      this.activeSlot = slot;
      this.messageBuffer = [];
      console.log(`[Aggregator] Initializing first 30-min active slot: ${this.activeSlot}`);
    }

    // If slot changed, flush previous slot and start new one
    if (slot !== this.activeSlot) {
      console.log(`[Aggregator] Slot boundary crossed from ${this.activeSlot} to ${slot}. Flushing buffer.`);
      this.flushBuffer().catch((error) => {
        console.error('[Aggregator] Buffer flush failed during slot transition:', error);
      });
      this.activeSlot = slot;
      this.messageBuffer = [];
    }

    // Buffer parsed fields
    this.messageBuffer.push({
      topic: message.topic,
      broker_url: brokerUrl,
      message_timestamp: message.timestamp,
      structuredValues,
    });
  }

  async flushBuffer() {
    if (this.messageBuffer.length === 0) {
      console.log(`[Aggregator] Buffer is empty for slot ${this.activeSlot}, skipping database write.`);
      return;
    }

    if (!this.isReady()) {
      console.warn(`[Aggregator] Database is not ready. Keeping ${this.messageBuffer.length} buffered messages in memory.`);
      return;
    }

    const slotToFlush = this.activeSlot;
    const bufferToFlush = [...this.messageBuffer];

    // Reset buffer immediately
    this.messageBuffer = [];
    this.activeSlot = null;

    console.log(`[Aggregator] Aggregating ${bufferToFlush.length} messages for slot ${slotToFlush}...`);

    try {
      const aggregated = this.aggregateMessages(bufferToFlush, slotToFlush);
      await this.insertAggregatedMessage(aggregated);
      console.log(`[Aggregator] Successfully saved 30-min summary row for slot ${slotToFlush} to database.`);
    } catch (error) {
      console.error(`[Aggregator] Failed to save aggregated slot ${slotToFlush}:`, error);
    }
  }

  aggregateMessages(buffer, slot) {
    const firstMsg = buffer[0];
    const lastMsg = buffer[buffer.length - 1];

    const aggregated = {
      topic: firstMsg.topic,
      broker_url: firstMsg.broker_url,
      message_timestamp: slot, // Keep exact boundary time
      device_uid: firstMsg.structuredValues.device_uid || 'Energy',
      slave_id: firstMsg.structuredValues.slave_id || '1',
      meter_timestamp: lastMsg.structuredValues.meter_timestamp || lastMsg.message_timestamp,
    };

    // Columns that need to be averaged
    const averageColumns = [
      'v_r', 'v_y', 'v_b', 'v_avg',
      'i_r', 'i_y', 'i_b',
      'kw_t', 'kvar_t', 'kva_t',
      'pf_r', 'pf_y', 'pf_b',
      'freq'
    ];

    // Columns that are cumulative counters, so we take the LATEST value in the buffer
    const latestColumns = [
      'kwh_imp', 'kwh_exp', 'kwh_net',
      'kvarh_imp', 'kvarh_exp', 'kvarh_net'
    ];

    // Calculate averages
    for (const col of averageColumns) {
      let sum = 0;
      let count = 0;
      for (const msg of buffer) {
        const val = msg.structuredValues[col];
        if (val !== null && val !== undefined && val !== '') {
          const num = Number(val);
          if (!isNaN(num)) {
            sum += num;
            count++;
          }
        }
      }
      aggregated[col] = count > 0 ? String(sum / count) : null;
    }

    // Take latest values for cumulative columns
    for (const col of latestColumns) {
      let latestVal = null;
      for (let i = buffer.length - 1; i >= 0; i--) {
        const val = buffer[i].structuredValues[col];
        if (val !== null && val !== undefined && val !== '') {
          latestVal = String(val);
          break;
        }
      }
      aggregated[col] = latestVal;
    }

    return aggregated;
  }

  async insertAggregatedMessage(aggregated) {
    const insertColumns = [
      'topic',
      'broker_url',
      'message_timestamp',
      ...STRUCTURED_COLUMN_DEFINITIONS.map(({ column }) => column),
    ];
    const insertValues = [
      aggregated.topic,
      aggregated.broker_url,
      aggregated.message_timestamp,
      ...STRUCTURED_COLUMN_DEFINITIONS.map(({ column }) => aggregated[column] ?? null),
    ];
    const placeholders = insertColumns.map((_, index) => `$${index + 1}`);

    await this.pool.query(
      `
        INSERT INTO ${TABLE_NAME} (
          ${insertColumns.join(', ')}
        ) VALUES (
          ${placeholders.join(', ')}
        )
      `,
      insertValues
    );
  }

  async checkPeriodicFlush() {
    if (!this.activeSlot || this.messageBuffer.length === 0) {
      return;
    }

    const slotStartTime = new Date(this.activeSlot).getTime();
    const currentTime = Date.now();
    const slotDurationMs = 30 * 60 * 1000;

    if (currentTime - slotStartTime >= slotDurationMs) {
      console.log(`[Aggregator] Real-world clock passed slot end time for ${this.activeSlot}. Flushing buffer via periodic timer.`);
      this.flushBuffer().catch((error) => {
        console.error('[Aggregator] Periodic buffer flush failed:', error);
      });
    }
  }

  async getMessages(limit = 2000) {
    if (!this.isReady()) {
      return [];
    }

    const envTopics = (process.env.MQTT_TOPICS || 'sagarpipe').split(',').map(t => t.trim()).filter(Boolean);
    const hasWildcard = envTopics.includes('#');

    let result;
    if (hasWildcard) {
      result = await this.pool.query(
        `
          SELECT
            id,
            topic,
            broker_url,
            message_timestamp,
            ${STRUCTURED_COLUMN_DEFINITIONS.map(({ column }) => column).join(',\n            ')},
            created_at
          FROM ${TABLE_NAME}
          WHERE v_r > 100 OR v_y > 100 OR v_b > 100 OR i_r > 0 OR i_y > 0 OR i_b > 0 OR kw_t > 0
          ORDER BY id DESC
          LIMIT $1
        `,
        [limit]
      );

      if (result.rows.length === 0) {
        result = await this.pool.query(
          `
            SELECT
              id,
              topic,
              broker_url,
              message_timestamp,
              ${STRUCTURED_COLUMN_DEFINITIONS.map(({ column }) => column).join(',\n              ')},
              created_at
            FROM ${TABLE_NAME}
            ORDER BY id DESC
            LIMIT $1
          `,
          [limit]
        );
      }
    } else {
      result = await this.pool.query(
        `
          SELECT
            id,
            topic,
            broker_url,
            message_timestamp,
            ${STRUCTURED_COLUMN_DEFINITIONS.map(({ column }) => column).join(',\n            ')},
            created_at
          FROM ${TABLE_NAME}
          WHERE (v_r > 100 OR v_y > 100 OR v_b > 100 OR i_r > 0 OR i_y > 0 OR i_b > 0 OR kw_t > 0)
            AND topic = ANY($2::text[])
          ORDER BY id DESC
          LIMIT $1
        `,
        [limit, envTopics]
      );

      if (result.rows.length === 0) {
        result = await this.pool.query(
          `
            SELECT
              id,
              topic,
              broker_url,
              message_timestamp,
              ${STRUCTURED_COLUMN_DEFINITIONS.map(({ column }) => column).join(',\n              ')},
              created_at
            FROM ${TABLE_NAME}
            WHERE topic = ANY($2::text[])
            ORDER BY id DESC
            LIMIT $1
          `,
          [limit, envTopics]
        );
      }
    }

    return result.rows.map((row) => ({
      ...this.normalizeStoredMessage(row),
    }));
  }

  async getSummaryMessages(limit = 5000) {
    if (!this.isReady()) {
      return [];
    }

    const envTopics = (process.env.MQTT_TOPICS || 'sagarpipe').split(',').map(t => t.trim()).filter(Boolean);
    const hasWildcard = envTopics.includes('#');

    let result;
    if (hasWildcard) {
      result = await this.pool.query(
        `
          SELECT
            id,
            topic,
            broker_url,
            message_timestamp,
            ${STRUCTURED_COLUMN_DEFINITIONS.map(({ column }) => column).join(',\n            ')},
            created_at
          FROM ${TABLE_NAME}
          WHERE EXTRACT(MINUTE FROM message_timestamp) IN (0, 30)
            AND EXTRACT(SECOND FROM message_timestamp) = 0
          ORDER BY message_timestamp DESC, id DESC
          LIMIT $1
        `,
        [limit]
      );
    } else {
      result = await this.pool.query(
        `
          SELECT
            id,
            topic,
            broker_url,
            message_timestamp,
            ${STRUCTURED_COLUMN_DEFINITIONS.map(({ column }) => column).join(',\n            ')},
            created_at
          FROM ${TABLE_NAME}
          WHERE EXTRACT(MINUTE FROM message_timestamp) IN (0, 30)
            AND EXTRACT(SECOND FROM message_timestamp) = 0
            AND topic = ANY($2::text[])
          ORDER BY message_timestamp DESC, id DESC
          LIMIT $1
        `,
        [limit, envTopics]
      );
    }

    return result.rows.reverse().map((row) => this.normalizeStoredMessage(row));
  }

  async getDashboardSummary(limit = 5000) {
    const messages = await this.getSummaryMessages(limit);
    return buildDashboardSummary(messages);
  }

  normalizeStoredMessage(row) {
    const responseFields = Object.fromEntries(
      STRUCTURED_COLUMN_DEFINITIONS.map(({ column, responseKey }) => [responseKey, row[column] == null ? null : String(row[column])])
    );

    return {
      id: String(row.id),
      topic: row.topic,
      brokerUrl: row.broker_url,
      messageTimestamp: row.message_timestamp instanceof Date ? row.message_timestamp.toISOString() : String(row.message_timestamp),
      createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
      ...responseFields,
    };
  }

  normalizeLiveMessage(message, brokerUrl) {
    const parseResult = parsePayload(message.raw);
    const parsedPayload = parseResult.parsed ? parseResult.payload : null;
    const { values: structuredValues } =
      parsedPayload && typeof parsedPayload === 'object' && !Array.isArray(parsedPayload)
        ? extractStructuredPayloadValues(parsedPayload)
        : { payload: null, values: { device_uid: null } };

    // Format all response keys in camelCase, matching database normalization
    const responseFields = Object.fromEntries(
      STRUCTURED_COLUMN_DEFINITIONS.map(({ column, responseKey }) => [
        responseKey,
        structuredValues[column] == null ? null : String(structuredValues[column])
      ])
    );

    return {
      id: message.id,
      topic: message.topic,
      brokerUrl: brokerUrl,
      messageTimestamp: message.timestamp,
      createdAt: message.timestamp,
      ...responseFields,
    };
  }

  async clearMessages() {
    if (!this.isReady()) {
      return;
    }

    await this.pool.query(`TRUNCATE TABLE ${TABLE_NAME} RESTART IDENTITY`);
  }

  async shutdown() {
    clearTimeout(this.retryTimer);
    this.retryTimer = null;

    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }

    // Flush any remaining data in the buffer on shutdown
    if (this.activeSlot && this.messageBuffer.length > 0) {
      try {
        await this.flushBuffer();
      } catch (error) {
        console.error('Failed to flush buffer on shutdown:', error);
      }
    }

    if (this.pool) {
      await this.pool.end();
      this.pool = null;
    }
  }

  async connect() {
    if (!this.isEnabled() || this.isConnecting) {
      return;
    }

    this.isConnecting = true;
    this.status = 'connecting';
    this.lastError = null;
    this.nextRetryAt = null;

    try {
      await this.ensurePool();
      await this.ensureSchema();
      await this.backfillLegacyPayloadColumns();
      await this.dropLegacyPayloadColumns();
      this.status = 'ready';
      this.lastError = null;
      this.retryAttempt = 0;
      console.log(`PostgreSQL persistence is ready. Auto-writing into ${TABLE_NAME}.`);
      await this.flushQueue();
    } catch (error) {
      this.status = 'error';
      this.lastError = error.message;
      console.error('PostgreSQL persistence connection failed:', error);
      await this.resetPool();
      this.scheduleReconnect();
    } finally {
      this.isConnecting = false;
    }
  }

  scheduleReconnect() {
    if (this.retryTimer) {
      return;
    }

    const baseDelay = this.config?.retryDelayMs || DEFAULT_RETRY_DELAY_MS;
    const retryDelay = Math.min(baseDelay * Math.max(1, 2 ** this.retryAttempt), 5 * 60 * 1000);
    this.retryAttempt += 1;
    this.nextRetryAt = new Date(Date.now() + retryDelay).toISOString();
    console.warn(`PostgreSQL reconnect scheduled in ${Math.round(retryDelay / 1000)}s.`);

    this.retryTimer = setTimeout(async () => {
      this.retryTimer = null;
      await this.connect();
    }, retryDelay);
  }

  async ensurePool() {
    if (this.pool) {
      return;
    }

    if (this.shouldUseSharedPool()) {
      this.usesSharedPool = true;
      this.pool = getPgPool();
      await this.pool.query('SELECT 1');
      console.log('PostgreSQL persistence is using the shared backend pool.');
      return;
    }

    const useSsl =
      typeof this.config?.ssl === 'boolean'
        ? this.config.ssl
        : String(this.config?.host || '').includes('rds.amazonaws.com');

    this.usesSharedPool = false;
    this.pool = new Pool({
      host: this.config.host,
      port: this.config.port,
      user: this.config.user,
      password: this.config.password,
      database: this.config.database,
      ssl: useSsl ? { rejectUnauthorized: false } : false,
      max: 5,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });

    this.pool.on('error', (error) => {
      console.error('PostgreSQL pool error:', error);
      this.status = 'error';
      this.lastError = error.message;
      this.resetPool().finally(() => this.scheduleReconnect());
    });

    await this.pool.query('SELECT 1');
    console.log('PostgreSQL connection pool created.');
  }

  async ensureSchema() {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS ${TABLE_NAME} (
        id BIGSERIAL PRIMARY KEY,
        topic TEXT NOT NULL,
        broker_url TEXT,
        message_timestamp TIMESTAMPTZ NOT NULL,
        device_uid TEXT,
        ${METER_FIELD_DEFINITIONS.map(({ column, type }) => `${column} ${type}`).join(',\n        ')},
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await this.pool.query(`ALTER TABLE ${TABLE_NAME} ADD COLUMN IF NOT EXISTS device_uid TEXT`);

    for (const { column, type } of METER_FIELD_DEFINITIONS) {
      await this.pool.query(`ALTER TABLE ${TABLE_NAME} ADD COLUMN IF NOT EXISTS ${column} ${type}`);
    }
  }

  async getExistingColumns(columnNames) {
    if (columnNames.length === 0) {
      return [];
    }

    const result = await this.pool.query(
      `
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = $1
          AND column_name = ANY($2::text[])
      `,
      [TABLE_NAME, columnNames]
    );

    return result.rows.map((row) => row.column_name);
  }

  async backfillLegacyPayloadColumns() {
    const existingLegacyColumns = await this.getExistingColumns(LEGACY_PAYLOAD_COLUMNS);

    if (existingLegacyColumns.length === 0) {
      return;
    }

    const result = await this.pool.query(
      `
        SELECT id, ${existingLegacyColumns.join(', ')}
        FROM ${TABLE_NAME}
        WHERE device_uid IS NULL OR meter_timestamp IS NULL
      `
    );

    for (const row of result.rows) {
      const basePayload = row.payload_json ?? parsePayload(row.raw_payload).payload;

      if (!basePayload || typeof basePayload !== 'object' || Array.isArray(basePayload)) {
        continue;
      }

      const { values } = extractStructuredPayloadValues(basePayload);
      if (!STRUCTURED_COLUMN_DEFINITIONS.some(({ column }) => values[column] != null)) {
        continue;
      }

      await this.updateStructuredColumns(row.id, values);
    }
  }

  async dropLegacyPayloadColumns() {
    const existingLegacyColumns = await this.getExistingColumns(LEGACY_PAYLOAD_COLUMNS);

    for (const columnName of existingLegacyColumns) {
      await this.pool.query(`ALTER TABLE ${TABLE_NAME} DROP COLUMN IF EXISTS ${columnName}`);
    }
  }

  async flushQueue() {
    if (this.isFlushing || !this.pool || this.status !== 'ready' || this.pendingMessages.length === 0) {
      return;
    }

    this.isFlushing = true;

    try {
      while (this.pendingMessages.length > 0 && this.pool && this.status === 'ready') {
        const nextMessage = this.pendingMessages.shift();

        try {
          await this.insertMessage(nextMessage);
        } catch (error) {
          this.pendingMessages.unshift(nextMessage);
          this.status = 'error';
          this.lastError = error.message;
          console.error('PostgreSQL insert failed:', error);
          await this.resetPool();
          this.scheduleReconnect();
          break;
        }
      }
    } finally {
      this.isFlushing = false;
    }
  }

  async insertMessage({ message, brokerUrl }) {
    const parseResult = parsePayload(message.raw);
    const parsedPayload = parseResult.parsed ? parseResult.payload : null;
    const { values: structuredValues } =
      parsedPayload && typeof parsedPayload === 'object' && !Array.isArray(parsedPayload)
        ? extractStructuredPayloadValues(parsedPayload)
        : { payload: null, values: { device_uid: null } };
    const insertColumns = [
      'topic',
      'broker_url',
      'message_timestamp',
      ...STRUCTURED_COLUMN_DEFINITIONS.map(({ column }) => column),
    ];
    const insertValues = [
      message.topic,
      brokerUrl,
      message.timestamp,
      ...STRUCTURED_COLUMN_DEFINITIONS.map(({ column }) => structuredValues[column] ?? null),
    ];
    const placeholders = insertColumns.map((_, index) => `$${index + 1}`);

    await this.pool.query(
      `
        INSERT INTO ${TABLE_NAME} (
          ${insertColumns.join(', ')}
        ) VALUES (
          ${placeholders.join(', ')}
        )
      `,
      insertValues
    );
  }

  async updateStructuredColumns(id, structuredValues) {
    const updateColumns = STRUCTURED_COLUMN_DEFINITIONS.map(({ column }) => column);
    const updateValues = [
      ...STRUCTURED_COLUMN_DEFINITIONS.map(({ column }) => structuredValues[column] ?? null),
      id,
    ];
    const assignments = updateColumns.map((column, index) => `${column} = $${index + 1}`);

    await this.pool.query(
      `
        UPDATE ${TABLE_NAME}
        SET ${assignments.join(', ')}
        WHERE id = $${updateValues.length}
      `,
      updateValues
    );
  }

  async resetPool() {
    if (!this.pool) {
      return;
    }

    const currentPool = this.pool;
    const usesSharedPool = this.usesSharedPool;
    this.pool = null;
    this.usesSharedPool = false;

    if (usesSharedPool) {
      return;
    }

    try {
      await currentPool.end();
    } catch (error) {
      console.error('Failed to close PostgreSQL pool cleanly:', error);
    }
  }
}

module.exports = new PostgresPersistenceService();
