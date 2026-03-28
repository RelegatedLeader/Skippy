'use client'

import Link from 'next/link'
import Image from 'next/image'
import { motion } from 'framer-motion'
import { ArrowRight, Brain, FileText, Zap, MessageSquare, Cpu, Radio } from 'lucide-react'

const features = [
  {
    icon: Brain,
    title: 'Persistent Memory',
    description: 'Every conversation is indexed. Skippy builds a living model of who you are — your goals, quirks, patterns. The longer you talk, the sharper it gets.',
    color: '#29c2e6',
  },
  {
    icon: FileText,
    title: 'AI-Powered Notes',
    description: 'Rich text notes with full AI awareness. Ask Skippy to summarize, expand, or draw connections across everything you\'ve written.',
    color: '#7ee8fa',
  },
  {
    icon: Zap,
    title: 'Predictive Intelligence',
    description: 'Skippy detects behavioral patterns and mood shifts, then proactively tells you what to do next — before you even ask.',
    color: '#29c2e6',
  },
  {
    icon: Radio,
    title: 'Real Personality',
    description: 'Not a generic bot. Skippy knows when to be blunt, when to be warm, and when to push back. It feels like a real relationship.',
    color: '#7ee8fa',
  },
]

const stagger = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.1, delayChildren: 0.3 } },
}

const item = {
  hidden: { opacity: 0, y: 22 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.55, ease: 'easeOut' } },
}

export default function HomePage() {
  return (
    <div className="min-h-screen overflow-hidden relative" style={{ background: 'linear-gradient(135deg, #0f2759 0%, #0a1a35 55%, rgba(88,28,135,0.4) 100%)' }}>

      {/* ── Background layers ── */}
      <div className="fixed inset-0 pointer-events-none">
        {/* Hex pattern */}
        <div className="absolute inset-0 hex-pattern opacity-100" />
        {/* Circuit grid */}
        <div className="absolute inset-0 circuit-grid" />
        {/* Scan line */}
        <div className="scan-line" />
        {/* Cyan orb top-left */}
        <div
          className="absolute top-[-15%] left-[-5%] w-[700px] h-[700px] rounded-full pointer-events-none animate-orb"
          style={{
            background: 'radial-gradient(circle, rgba(41,194,230,0.12) 0%, transparent 65%)',
            filter: 'blur(60px)',
          }}
        />
        {/* Purple orb right */}
        <div
          className="absolute top-[25%] right-[-10%] w-[550px] h-[550px] rounded-full pointer-events-none"
          style={{
            background: 'radial-gradient(circle, rgba(88,28,135,0.15) 0%, transparent 65%)',
            filter: 'blur(60px)',
            animation: 'orbFloat 10s ease-in-out infinite reverse',
          }}
        />
        {/* Bottom cyan accent */}
        <div
          className="absolute bottom-[-10%] left-[35%] w-[400px] h-[400px] rounded-full pointer-events-none"
          style={{
            background: 'radial-gradient(circle, rgba(41,194,230,0.07) 0%, transparent 65%)',
            filter: 'blur(80px)',
            animation: 'orbFloat 12s ease-in-out infinite 2s',
          }}
        />
        {/* Noise overlay */}
        <div
          className="absolute inset-0 opacity-[0.018]"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
          }}
        />
      </div>

      {/* ── Navigation ── */}
      <nav className="relative z-10 flex items-center justify-between px-8 py-6 max-w-7xl mx-auto">
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5 }}
          className="flex items-center gap-3"
        >
          <div className="relative w-10 h-10">
            <Image
              src="/img/skippyENHANCED3D-removebg.png"
              alt="Skippy"
              fill
              className="object-contain drop-shadow-[0_0_8px_rgba(41,194,230,0.6)]"
            />
          </div>
          <span className="font-display font-bold text-xl text-foreground tracking-tight">
            Skippy
          </span>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5 }}
          className="flex items-center gap-5"
        >
          <Link href="/memory" className="text-muted hover:text-foreground transition-colors text-sm hidden sm:block">
            Memory
          </Link>
          <Link href="/notes" className="text-muted hover:text-foreground transition-colors text-sm hidden sm:block">
            Notes
          </Link>
          <Link href="/chat">
            <motion.span
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              className="btn-cyan flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm"
            >
              Open Chat
              <ArrowRight className="w-3.5 h-3.5 relative z-10" />
            </motion.span>
          </Link>
        </motion.div>
      </nav>

      {/* ── Hero ── */}
      <main className="relative z-10 max-w-7xl mx-auto px-8 pt-16 pb-28">
        <motion.div
          variants={stagger}
          initial="hidden"
          animate="visible"
          className="text-center"
        >
          {/* Badge */}
          <motion.div variants={item} className="flex justify-center mb-10">
            <div className="inline-flex items-center gap-2.5 px-4 py-2 rounded-full glass-cyan text-sm text-muted">
              <div className="relative flex items-center justify-center w-5 h-5">
                <Cpu className="w-3.5 h-3.5 text-accent relative z-10" />
                <div className="absolute inset-0 rounded-full bg-accent/20 animate-ping" style={{ animationDuration: '2.5s' }} />
              </div>
              <span>Powered by Grok — xAI&apos;s frontier model</span>
              <div className="w-1.5 h-1.5 rounded-full bg-accent animate-blink" />
            </div>
          </motion.div>

          {/* 3D Skippy avatar */}
          <motion.div variants={item} className="flex justify-center mb-8">
            <div className="relative">
              {/* Outer rings */}
              <div className="absolute inset-[-20px] rounded-full border border-accent/10 animate-spin-slow" />
              <div className="absolute inset-[-12px] rounded-full border border-accent/15" style={{ animation: 'ringPulse 3s ease-in-out infinite' }} />
              {/* Core glow backing */}
              <div
                className="w-28 h-28 rounded-full flex items-center justify-center animate-pulse-cyan"
                style={{
                  background: 'radial-gradient(circle, rgba(41,194,230,0.08) 0%, transparent 70%)',
                }}
              >
                <div className="relative w-24 h-24">
                  <Image
                    src="/img/skippyENHANCED3D-removebg.png"
                    alt="Skippy"
                    fill
                    className="object-contain drop-shadow-[0_0_24px_rgba(41,194,230,0.7)]"
                  />
                </div>
              </div>
              {/* Corner dots */}
              {[
                'top-0 right-0 translate-x-1 -translate-y-1',
                'bottom-0 right-0 translate-x-1 translate-y-1',
                'top-0 left-0 -translate-x-1 -translate-y-1',
                'bottom-0 left-0 -translate-x-1 translate-y-1',
              ].map((pos, i) => (
                <div
                  key={i}
                  className={`absolute ${pos} w-2 h-2 rounded-full bg-accent/60`}
                  style={{ animation: `blink ${1 + i * 0.3}s step-end infinite` }}
                />
              ))}
            </div>
          </motion.div>

          {/* Title */}
          <motion.h1
            variants={item}
            className="font-display text-7xl md:text-8xl lg:text-[7rem] font-black mb-4 leading-none tracking-tighter"
          >
            <span className="gradient-text-animated">SKIPPY</span>
          </motion.h1>

          {/* Tagline */}
          <motion.p variants={item} className="text-2xl md:text-3xl text-muted mb-3 font-display font-light">
            An AI that{' '}
            <span className="text-foreground font-semibold">truly knows you</span>
          </motion.p>

          <motion.p variants={item} className="text-lg text-muted max-w-2xl mx-auto mb-12 leading-relaxed">
            Not a chatbot. A personal AI companion with memory, personality, and the ability to
            predict your next move. Built around <em className="text-foreground not-italic">you</em>.
          </motion.p>

          {/* CTA */}
          <motion.div variants={item} className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/chat">
              <motion.button
                whileHover={{ scale: 1.03, boxShadow: '0 0 50px rgba(41,194,230,0.55)' }}
                whileTap={{ scale: 0.97 }}
                className="btn-cyan group flex items-center gap-3 px-8 py-4 rounded-2xl text-lg relative"
              >
                <MessageSquare className="w-5 h-5 relative z-10" />
                <span className="relative z-10">Talk to Skippy</span>
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform relative z-10" />
              </motion.button>
            </Link>

            <Link href="/notes">
              <motion.button
                whileHover={{ scale: 1.02, borderColor: 'rgba(41,194,230,0.4)' }}
                whileTap={{ scale: 0.98 }}
                className="flex items-center gap-3 px-8 py-4 rounded-2xl glass-cyan text-foreground font-semibold text-lg transition-all duration-300"
              >
                <FileText className="w-5 h-5 text-accent" />
                Open Notes
              </motion.button>
            </Link>
          </motion.div>
        </motion.div>

        {/* ── Feature cards ── */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.7 }}
          className="grid grid-cols-1 md:grid-cols-2 gap-5 mt-28"
        >
          {features.map((feat, i) => (
            <motion.div
              key={feat.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.8 + i * 0.1 }}
              whileHover={{ y: -4, transition: { duration: 0.2 } }}
              className="group relative p-7 rounded-2xl overflow-hidden cursor-default transition-all duration-300"
              style={{
                background: 'linear-gradient(135deg, rgba(15,39,89,0.6) 0%, rgba(10,26,53,0.6) 100%)',
                border: '1px solid rgba(30,58,110,0.8)',
              }}
            >
              {/* Hover shimmer */}
              <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                style={{ background: `radial-gradient(circle at 50% 0%, ${feat.color}0a 0%, transparent 70%)` }}
              />
              {/* Left accent bar */}
              <div className="absolute left-0 top-4 bottom-4 w-[2px] rounded-r-full opacity-40 group-hover:opacity-90 transition-opacity duration-300"
                style={{ backgroundColor: feat.color }}
              />
              {/* Top glow on hover */}
              <div className="absolute top-0 left-0 right-0 h-[1px] opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                style={{ background: `linear-gradient(90deg, transparent, ${feat.color}50, transparent)` }}
              />

              <div className="relative z-10 flex items-start gap-4">
                <div
                  className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 border"
                  style={{ backgroundColor: `${feat.color}12`, borderColor: `${feat.color}25` }}
                >
                  <feat.icon className="w-5 h-5" style={{ color: feat.color }} />
                </div>
                <div>
                  <h3 className="font-display text-lg font-semibold text-foreground mb-2">{feat.title}</h3>
                  <p className="text-muted text-sm leading-relaxed">{feat.description}</p>
                </div>
              </div>
            </motion.div>
          ))}
        </motion.div>

        {/* ── Bottom status bar ── */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.7, delay: 1.3 }}
          className="text-center mt-20"
        >
          <div className="inline-flex flex-col items-center gap-3">
            <p className="text-muted text-sm">Private by default — data lives on your machine</p>
            <div className="flex items-center gap-6 text-xs text-muted/50">
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-accent animate-blink" />
                Grok 3 Beta
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-accent/50" />
                SQLite local DB
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-accent/60" />
                Real-time streaming
              </span>
            </div>
          </div>
        </motion.div>
      </main>
    </div>
  )
}
