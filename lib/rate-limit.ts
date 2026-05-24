import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { NextRequest, NextResponse } from "next/server";
import { errorResponse } from "@/lib/utils";

function getRedis(): Redis | null {
  if (
    !process.env.UPSTASH_REDIS_REST_URL ||
    !process.env.UPSTASH_REDIS_REST_TOKEN
  ) {
    return null;
  }
  return new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  });
}

type LimiterType = "chat" | "api" | "auth";

const configs: Record<LimiterType, { requests: number; window: string }> = {
  chat: { requests: 50, window: "2 h" },
  api: { requests: 60, window: "1 m" },
  auth: { requests: 10, window: "1 m" },
};

const limiterCache = new Map<LimiterType, Ratelimit>();

function getLimiter(type: LimiterType): Ratelimit | null {
  const redis = getRedis();
  if (!redis) return null;

  if (!limiterCache.has(type)) {
    const { requests, window } = configs[type];
    limiterCache.set(
      type,
      new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(
          requests,
          window as Parameters<typeof Ratelimit.slidingWindow>[1],
        ),
        prefix: `llm_logger:rl:${type}`,
        analytics: true,
      }),
    );
  }
  return limiterCache.get(type)!;
}

function getIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    req.headers.get("x-real-ip") ??
    "anonymous"
  );
}

export async function checkRateLimit(
  req: NextRequest,
  type: LimiterType = "api",
  identifier?: string,
): Promise<NextResponse | null> {
  const limiter = getLimiter(type);
  if (!limiter) return null; // No Redis — skip limiting in dev

  const id = identifier ?? getIp(req);
  const { success, limit, reset } = await limiter.limit(id);

  if (!success) {
    const retryAfter = Math.ceil((reset - Date.now()) / 1000);
    return NextResponse.json(
      errorResponse("Too many requests. Please slow down."),
      {
        status: 429,
        headers: {
          "X-RateLimit-Limit": String(limit),
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": String(reset),
          "Retry-After": String(retryAfter),
        },
      },
    );
  }

  return null;
}

export async function getRateLimitHeaders(
  req: NextRequest,
  type: LimiterType = "api",
  identifier?: string,
): Promise<Record<string, string>> {
  const limiter = getLimiter(type);
  if (!limiter) return {};

  const id = identifier ?? getIp(req);
  const { limit, remaining, reset } = await limiter.limit(id);

  return {
    "X-RateLimit-Limit": String(limit),
    "X-RateLimit-Remaining": String(remaining),
    "X-RateLimit-Reset": String(reset),
  };
}
