import Anthropic from '@anthropic-ai/sdk'

export const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || '',
})

export const CLAUDE_MODEL = 'claude-sonnet-4-6'

export function claudeAvailable(): boolean {
  return !!process.env.ANTHROPIC_API_KEY
}
