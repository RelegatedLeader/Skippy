import { NextResponse } from 'next/server'
import { createHmac } from 'crypto'
import { prisma } from '@/lib/db'
import { decrypt } from '@/lib/encryption'

function stripMarkdown(text: string): string {
  return text
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/^[-*]\s+/gm, '• ')
    .replace(/\[x\]|\[ \]/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/**
 * GET /api/export?format=txt|md|json&type=notes|summaries|note&id=<noteId>
 *
 * Returns a downloadable file of the requested data.
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const format = (searchParams.get('format') || 'txt') as 'txt' | 'md' | 'json'
    const type = (searchParams.get('type') || 'notes') as 'notes' | 'summaries' | 'note' | 'full'
    const id = searchParams.get('id')

    let content = ''
    let filename = ''

    if (type === 'note' && id) {
      // Single note export
      const note = await prisma.note.findUnique({ where: { id } })
      if (!note) return NextResponse.json({ error: 'Note not found' }, { status: 404 })

      const plainContent = decrypt(note.content).replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim()
      const tags = JSON.parse(note.tags || '[]') as string[]
      const safeTitle = note.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()
      filename = `${safeTitle}.${format}`

      if (format === 'json') {
        content = JSON.stringify({ title: note.title, content: plainContent, tags, color: note.color, createdAt: note.createdAt, updatedAt: note.updatedAt }, null, 2)
      } else if (format === 'md') {
        content = `# ${note.title}\n\n${tags.length ? `Tags: ${tags.map((t) => `#${t}`).join(' ')}\n\n` : ''}${plainContent}\n\n---\n*Created: ${new Date(note.createdAt).toLocaleDateString()}*`
      } else {
        content = `${note.title}\n${'='.repeat(note.title.length)}\n\n${plainContent}${tags.length ? `\n\nTags: ${tags.join(', ')}` : ''}\n\nCreated: ${new Date(note.createdAt).toLocaleDateString()}`
      }

    } else if (type === 'summaries') {
      const summaries = await prisma.summary.findMany({ orderBy: { createdAt: 'desc' } })
      filename = `skippy_summaries.${format}`

      if (format === 'json') {
        content = JSON.stringify(summaries.map((s) => ({ ...s, categories: JSON.parse(s.categories || '[]') })), null, 2)
      } else if (format === 'md') {
        content = summaries.map((s) =>
          `# ${s.title}\n\n${s.content}\n\n---\n*${s.noteCount} notes · ${new Date(s.createdAt).toLocaleDateString()}*`
        ).join('\n\n---\n\n')
      } else {
        content = summaries.map((s) =>
          `${s.title}\n${'='.repeat(s.title.length)}\n\n${stripMarkdown(s.content)}\n\nNotes: ${s.noteCount} | Date: ${new Date(s.createdAt).toLocaleDateString()}`
        ).join('\n\n' + '─'.repeat(60) + '\n\n')
      }

    } else if (type === 'full') {
      // Full USB export — everything, signed
      const [notes, memories, summaries, debates, profile] = await Promise.all([
        prisma.note.findMany({ orderBy: [{ pinned: 'desc' }, { updatedAt: 'desc' }] }),
        prisma.memory.findMany({ orderBy: [{ importance: 'desc' }, { updatedAt: 'desc' }] }),
        prisma.summary.findMany({ orderBy: { createdAt: 'desc' } }),
        prisma.debate.findMany({ include: { rounds: true }, orderBy: { createdAt: 'desc' } }),
        prisma.userProfile.findUnique({ where: { id: 'singleton' } }),
      ])

      const exportData = {
        meta: {
          exportedAt: new Date().toISOString(),
          version: '1.0',
          app: 'Skippy Personal AI',
        },
        profile: profile
          ? {
              name: profile.name,
              about: profile.about,
              customInstructions: profile.customInstructions,
              goals: (() => { try { return JSON.parse(profile.goals) } catch { return [] } })(),
              skills: (() => { try { return JSON.parse(profile.skills) } catch { return [] } })(),
            }
          : null,
        notes: notes.map((n) => ({
          id: n.id,
          title: n.title,
          content: decrypt(n.content).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim(),
          tags: (() => { try { return JSON.parse(n.tags) } catch { return [] } })(),
          pinned: n.pinned,
          color: n.color,
          linkedNoteIds: (() => { try { return JSON.parse(n.linkedNoteIds) } catch { return [] } })(),
          createdAt: n.createdAt,
          updatedAt: n.updatedAt,
        })),
        memories: memories.map((m) => ({
          category: m.category,
          content: m.content,
          importance: m.importance,
          tags: (() => { try { return JSON.parse(m.tags) } catch { return [] } })(),
          createdAt: m.createdAt,
          updatedAt: m.updatedAt,
        })),
        summaries: summaries.map((s) => ({
          period: s.period,
          title: s.title,
          content: s.content,
          noteCount: s.noteCount,
          startDate: s.startDate,
          endDate: s.endDate,
          createdAt: s.createdAt,
        })),
        debates: debates.map((d) => ({
          topic: d.topic,
          userStance: d.userStance,
          aiStance: d.aiStance,
          status: d.status,
          winner: d.winner,
          conclusion: d.conclusion,
          roundCount: d.rounds.length,
          createdAt: d.createdAt,
          updatedAt: d.updatedAt,
        })),
      }

      const payload = JSON.stringify(exportData, null, 2)
      const keyHex = process.env.ENCRYPTION_KEY || '0'.repeat(64)
      const signature = createHmac('sha256', Buffer.from(keyHex, 'hex'))
        .update(payload)
        .digest('hex')

      content = JSON.stringify({ data: exportData, integrity: { algorithm: 'HMAC-SHA256', signature } }, null, 2)
      filename = `skippy_full_export_${new Date().toISOString().slice(0, 10)}.json`

    } else {
      // All notes
      const notes = await prisma.note.findMany({ orderBy: [{ pinned: 'desc' }, { updatedAt: 'desc' }] })
      filename = `skippy_notes.${format}`

      if (format === 'json') {
        content = JSON.stringify(notes.map((n) => ({
          id: n.id, title: n.title,
          content: decrypt(n.content).replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim(),
          tags: JSON.parse(n.tags || '[]'),
          color: n.color, pinned: n.pinned, createdAt: n.createdAt, updatedAt: n.updatedAt,
        })), null, 2)
      } else if (format === 'md') {
        content = notes.map((n) => {
          const plain = decrypt(n.content).replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim()
          const tags = JSON.parse(n.tags || '[]') as string[]
          return `# ${n.title}\n\n${tags.length ? `Tags: ${tags.map((t) => `#${t}`).join(' ')}\n\n` : ''}${plain}\n\n---\n*Updated: ${new Date(n.updatedAt).toLocaleDateString()}*`
        }).join('\n\n---\n\n')
      } else {
        content = notes.map((n) => {
          const plain = decrypt(n.content).replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim()
          const tags = JSON.parse(n.tags || '[]') as string[]
          return `${n.title}\n${'='.repeat(n.title.length)}\n\n${plain}${tags.length ? `\n\nTags: ${tags.join(', ')}` : ''}\n\nUpdated: ${new Date(n.updatedAt).toLocaleDateString()}`
        }).join('\n\n' + '─'.repeat(60) + '\n\n')
      }
    }

    const mimeType = format === 'json' ? 'application/json' : 'text/plain'

    return new Response(content, {
      headers: {
        'Content-Type': `${mimeType}; charset=utf-8`,
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  } catch (err) {
    console.error('Export failed:', err)
    return NextResponse.json({ error: 'Export failed' }, { status: 500 })
  }
}
