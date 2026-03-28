/**
 * SM-2 Spaced Repetition System
 * Based on the SuperMemo 2 algorithm by Piotr Wozniak.
 *
 * quality scale (0–5):
 *   0 = complete blackout
 *   1 = incorrect; correct answer remembered after seeing it
 *   2 = incorrect; correct answer was easy to recall after hint
 *   3 = correct but with serious difficulty
 *   4 = correct after hesitation
 *   5 = perfect response
 */

export interface SRSCard {
  easeFactor: number   // starting value: 2.5
  interval: number     // days until next review (0 = new)
  repetitions: number  // number of successful consecutive reviews
}

export interface SRSResult {
  easeFactor: number
  interval: number
  repetitions: number
  nextReview: Date
}

/**
 * Updates the SRS state for a card given the response quality.
 */
export function updateSM2(card: SRSCard, quality: number): SRSResult {
  let { easeFactor, interval, repetitions } = card

  // Clamp quality to 0–5
  quality = Math.max(0, Math.min(5, Math.round(quality)))

  // Update ease factor using SM-2 formula
  easeFactor = easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))
  if (easeFactor < 1.3) easeFactor = 1.3

  if (quality < 3) {
    // Incorrect response: reset repetition count, short interval
    repetitions = 0
    interval = 1
  } else {
    // Correct response
    if (repetitions === 0) {
      interval = 1
    } else if (repetitions === 1) {
      interval = 6
    } else {
      interval = Math.round(interval * easeFactor)
    }
    repetitions += 1
  }

  const nextReview = new Date()
  nextReview.setDate(nextReview.getDate() + interval)
  nextReview.setHours(0, 0, 0, 0)

  return { easeFactor, interval, repetitions, nextReview }
}

/**
 * Maps exercise results to SM-2 quality scores.
 */
export function exerciseQuality(
  exerciseType: 'flashcard' | 'mcq' | 'pinyin' | 'listening' | 'speaking' | 'stroke',
  correct: boolean,
  selfRating?: 1 | 2 | 3 | 4 | 5  // used for flashcard and stroke
): number {
  if (exerciseType === 'flashcard' || exerciseType === 'stroke') {
    // Self-rated: map 1–5 directly to SM-2 quality 0–5
    if (selfRating === undefined) return correct ? 4 : 1
    return selfRating - 1 // rating 1→0, 2→1, 3→2, 4→3, 5→4 (cap at 4 for these)
  }

  // Binary correct/incorrect exercises
  if (!correct) return 1  // remembered after seeing answer
  if (exerciseType === 'mcq') return 4       // easy recognition
  if (exerciseType === 'listening') return 4
  if (exerciseType === 'pinyin') return 5    // harder recall → reward more
  if (exerciseType === 'speaking') return 5
  return 4
}

/**
 * XP earned per exercise type based on difficulty and correctness.
 */
export function xpForExercise(
  exerciseType: 'flashcard' | 'mcq' | 'pinyin' | 'listening' | 'speaking' | 'stroke',
  quality: number
): number {
  if (quality < 3) return 0

  const BASE: Record<string, number> = {
    flashcard: 3,
    mcq: 5,
    pinyin: 8,
    listening: 6,
    speaking: 12,
    stroke: 10,
  }

  const base = BASE[exerciseType] ?? 5
  // Scale by quality: q3=40%, q4=70%, q5=100%
  const factor = quality === 5 ? 1 : quality === 4 ? 0.7 : 0.4
  return Math.round(base * factor)
}

/**
 * Determines the exercise type to use based on a word's mastery level.
 * Progressive unlocking ensures learners aren't overwhelmed early on.
 */
export function pickExerciseType(
  repetitions: number
): 'flashcard' | 'mcq' | 'pinyin' | 'listening' | 'speaking' | 'stroke' {
  const rand = Math.random()

  if (repetitions === 0) {
    // First time seeing: always flashcard to introduce the word
    return 'flashcard'
  }

  if (repetitions <= 2) {
    // Early stage: recognition exercises
    return rand < 0.5 ? 'mcq' : 'flashcard'
  }

  if (repetitions <= 5) {
    // Mid stage: add recall exercises
    if (rand < 0.3) return 'mcq'
    if (rand < 0.6) return 'pinyin'
    return 'listening'
  }

  // Advanced stage: all exercise types, weighted toward harder ones
  if (rand < 0.15) return 'mcq'
  if (rand < 0.35) return 'pinyin'
  if (rand < 0.55) return 'listening'
  if (rand < 0.75) return 'speaking'
  return 'stroke'
}

/**
 * Returns a mastery label for display.
 */
export function masteryLabel(repetitions: number, interval: number): string {
  if (repetitions === 0) return 'New'
  if (repetitions <= 2) return 'Learning'
  if (repetitions <= 5) return 'Familiar'
  if (interval < 14) return 'Practiced'
  return 'Mastered'
}

/**
 * Returns a color for the mastery badge.
 */
export function masteryColor(repetitions: number, interval: number): string {
  const label = masteryLabel(repetitions, interval)
  if (label === 'New') return '#6366f1'
  if (label === 'Learning') return '#f59e0b'
  if (label === 'Familiar') return '#3b82f6'
  if (label === 'Practiced') return '#10b981'
  return '#22c55e'
}
