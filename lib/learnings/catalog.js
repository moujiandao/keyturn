// Structured catalog of date-stamped engineering & system design learnings.
// Add new entries newest-first and drop the matching PDF in docs/learnings/.

export const LEARNINGS = [
  {
    slug: "2026-11-25-full-stack-rebrand-plumbing-cutover",
    date: "2026-11-25",
    fileName: "2026-11-25-full-stack-rebrand-plumbing-cutover.pdf",
    title: {
      en: "Full-Stack Rebrand & Plumbing Cutover (PropManager -> Keyturn) - System Design Brief",
      zh: "全栈品牌重塑与基础设施平滑切换 (PropManager -> Keyturn) - 系统设计复盘",
    },
    summary: {
      en: "Zero-downtime SaaS rebrand across local Git worktrees, GitHub, Vercel dual-origin 308 cutover, NEXT_PUBLIC_APP_URL redeploy, Supabase Auth allowlists, in-place HMAC webhook edits, lazy localStorage migration, and Turbopack/Storage/HTTP 308 pitfalls.",
      zh: "零停机全栈品牌切换复盘：涵盖本地 Git Worktree 修复、GitHub、Vercel 双域名 308 切换、NEXT_PUBLIC_APP_URL 重新部署、Supabase Auth 白名单、Webhook 原地改址保留 HMAC 密钥、localStorage 惰性迁移及 Turbopack 与重定向踩坑总结。",
    },
    tags: [
      "Vercel",
      "Next.js 16",
      "Supabase Auth",
      "Webhooks & HMAC",
      "Same-Origin Policy",
      "Git Worktrees",
      "Expand-and-Contract",
    ],
  },
  {
    slug: "2026-11-25-chase-zelle-ingestion-system-design",
    date: "2026-11-25",
    fileName: "2026-11-25-chase-zelle-ingestion-system-design.pdf",
    title: {
      en: "Chase Zelle Ingestion & Rent Reconciliation - System Design Brief",
      zh: "Chase Zelle 自动收租与对账 - 系统设计复盘",
    },
    summary: {
      en: "Event-driven Resend Inbound webhooks (Svix HMAC + claim-check fetch), PostgreSQL RLS & idempotency, deterministic-first Claude Haiku fallback, 6 auto-post safety gates, hexagonal seams, and real production failure modes caught in review.",
      zh: "基于 Resend Inbound 与 Svix HMAC 的事件驱动入账、PostgreSQL RLS 与幂等去重、规则优先 + Claude Haiku 兜底、6 重自动入账安全闸门、六边形架构与真实代码审查/上线排障复盘。",
    },
    tags: [
      "Next.js 16",
      "Supabase / PostgreSQL",
      "Resend Inbound",
      "Svix HMAC",
      "Claude Haiku",
      "Hexagonal Seams",
      "IDOR & RLS",
    ],
  },
];

export function findLearningBySlug(slug) {
  if (!slug || typeof slug !== "string") return null;
  return LEARNINGS.find((entry) => entry.slug === slug) || null;
}

export function learningPdfUrl(slug, { download = false } = {}) {
  const encoded = encodeURIComponent(slug);
  return download ? `/api/learnings/${encoded}?download=1` : `/api/learnings/${encoded}`;
}
