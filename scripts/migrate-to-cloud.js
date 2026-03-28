/**
 * migrate-to-cloud.js
 * Copies all local SQLite data into the Neon PostgreSQL cloud database.
 * Run with: node scripts/migrate-to-cloud.js
 */

const path = require('path')
const { PrismaClient } = require('@prisma/client')

const NEON_URL = process.env.CLOUD_DB_URL

if (!NEON_URL) {
  console.error('❌  Set CLOUD_DB_URL before running this script.')
  process.exit(1)
}

// ─── Clients ─────────────────────────────────────────────────────────────────

// Use absolute path — Prisma datasource overrides don't resolve relative paths from CWD
const DB_ABS = `file:${path.resolve(__dirname, '../prisma/skippy.db')}`

// Read from local SQLite
const local = new PrismaClient({
  datasources: { db: { url: DB_ABS } },
})

// ─── Helpers ─────────────────────────────────────────────────────────────────

function log(msg) { process.stdout.write(msg) }
function ok() { console.log(' ✓') }

// We use pg directly for cloud writes since the Prisma client is SQLite-compiled
async function withPg(fn) {
  const { Client } = require('pg')
  const client = new Client({
    connectionString: NEON_URL,
    ssl: { rejectUnauthorized: false },
  })
  await client.connect()
  try {
    return await fn(client)
  } finally {
    await client.end()
  }
}

function esc(val) {
  if (val === null || val === undefined) return 'NULL'
  if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE'
  if (typeof val === 'number') return String(val)
  if (val instanceof Date) return `'${val.toISOString()}'`
  // Escape single quotes
  return `'${String(val).replace(/'/g, "''")}'`
}

async function upsert(pg, table, rows, conflictCol = 'id') {
  if (!rows.length) return
  for (const row of rows) {
    const keys = Object.keys(row)
    const vals = keys.map(k => esc(row[k]))
    const updates = keys.filter(k => k !== conflictCol).map(k => `"${k}"=${esc(row[k])}`)
    const q = `INSERT INTO "${table}" (${keys.map(k => `"${k}"`).join(',')}) VALUES (${vals.join(',')}) ON CONFLICT ("${conflictCol}") DO UPDATE SET ${updates.join(',')};`
    await pg.query(q)
  }
}

// ─── Migration ────────────────────────────────────────────────────────────────

async function migrate() {
  console.log('\n🚀  Starting local → Neon migration\n')

  // ── Read all local data ──────────────────────────────────────────────────
  log('📖  Reading local database...')
  const [
    auth,
    conversations,
    messages,
    memories,
    reminders,
    todos,
    userStats,
    userProfile,
    notes,
    summaries,
    debates,
    debateRounds,
    langProgress,
    langSessions,
  ] = await Promise.all([
    local.auth.findFirst(),
    local.conversation.findMany(),
    local.message.findMany(),
    local.memory.findMany(),
    local.reminder.findMany(),
    local.todo.findMany(),
    local.userStats.findFirst(),
    local.userProfile.findFirst(),
    local.note.findMany(),
    local.summary.findMany(),
    local.debate.findMany(),
    local.debateRound.findMany(),
    local.langProgress.findMany(),
    local.langSession.findMany(),
  ])
  ok()

  console.log(`   Auth:          ${auth ? 1 : 0}`)
  console.log(`   Conversations: ${conversations.length}`)
  console.log(`   Messages:      ${messages.length}`)
  console.log(`   Memories:      ${memories.length}`)
  console.log(`   Notes:         ${notes.length}`)
  console.log(`   Todos:         ${todos.length}`)
  console.log(`   Reminders:     ${reminders.length}`)
  console.log(`   Summaries:     ${summaries.length}`)
  console.log(`   Debates:       ${debates.length}`)
  console.log(`   DebateRounds:  ${debateRounds.length}`)
  console.log('')

  await withPg(async (pg) => {
    // ── Auth ──────────────────────────────────────────────────────────────
    if (auth) {
      log('🔐  Migrating auth credentials...')
      await upsert(pg, 'Auth', [auth])
      ok()
    }

    // ── UserStats ─────────────────────────────────────────────────────────
    if (userStats) {
      log('📊  Migrating user stats...')
      await upsert(pg, 'UserStats', [userStats])
      ok()
    }

    // ── UserProfile ───────────────────────────────────────────────────────
    if (userProfile) {
      log('👤  Migrating user profile...')
      await upsert(pg, 'UserProfile', [userProfile])
      ok()
    }

    // ── Conversations + Messages ──────────────────────────────────────────
    if (conversations.length) {
      log(`💬  Migrating ${conversations.length} conversations...`)
      await upsert(pg, 'Conversation', conversations)
      ok()
      log(`💬  Migrating ${messages.length} messages...`)
      await upsert(pg, 'Message', messages)
      ok()
    }

    // ── Memories ──────────────────────────────────────────────────────────
    if (memories.length) {
      log(`🧠  Migrating ${memories.length} memories...`)
      await upsert(pg, 'Memory', memories)
      ok()
    }

    // ── Notes ─────────────────────────────────────────────────────────────
    if (notes.length) {
      log(`📝  Migrating ${notes.length} notes...`)
      await upsert(pg, 'Note', notes)
      ok()
    }

    // ── Todos ─────────────────────────────────────────────────────────────
    if (todos.length) {
      log(`✅  Migrating ${todos.length} todos...`)
      await upsert(pg, 'Todo', todos)
      ok()
    }

    // ── Reminders ─────────────────────────────────────────────────────────
    if (reminders.length) {
      log(`🔔  Migrating ${reminders.length} reminders...`)
      await upsert(pg, 'Reminder', reminders)
      ok()
    }

    // ── Summaries ─────────────────────────────────────────────────────────
    if (summaries.length) {
      log(`📄  Migrating ${summaries.length} summaries...`)
      await upsert(pg, 'Summary', summaries)
      ok()
    }

    // ── Debates + Rounds ──────────────────────────────────────────────────
    if (debates.length) {
      log(`⚔️   Migrating ${debates.length} debates...`)
      await upsert(pg, 'Debate', debates)
      ok()
      log(`⚔️   Migrating ${debateRounds.length} debate rounds...`)
      await upsert(pg, 'DebateRound', debateRounds)
      ok()
    }

    // ── Lang data ─────────────────────────────────────────────────────────
    if (langProgress.length) {
      log(`🈶  Migrating language progress...`)
      await upsert(pg, 'LangProgress', langProgress)
      ok()
    }
    if (langSessions.length) {
      log(`🈶  Migrating ${langSessions.length} lang sessions...`)
      await upsert(pg, 'LangSession', langSessions)
      ok()
    }
  })

  console.log('\n✅  Migration complete! Your cloud database now has all your local data.\n')
  console.log('👉  Go to https://skippy-personal.vercel.app/login and sign in with your existing credentials.\n')
}

migrate()
  .catch(e => { console.error('\n❌  Migration failed:', e.message); process.exit(1) })
  .finally(() => local.$disconnect())
