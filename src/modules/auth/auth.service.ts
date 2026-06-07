import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { prisma } from '../../lib/prisma';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../../lib/jwt';
import { env, isProd } from '../../config/env';
import { badRequest, conflict, unauthorized } from '../../utils/AppError';
import { Prisma, User } from '@prisma/client';

const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');
const referralCode = () => crypto.randomBytes(4).toString('hex').toUpperCase();

function publicUser(u: User) {
  return { id: u.id, name: u.name, email: u.email, phone: u.phone, role: u.role, avatarUrl: u.avatarUrl };
}

// Issue an access + refresh pair and persist a hashed, revocable refresh token.
async function issueTokens(user: User, meta: { ip?: string; ua?: string } = {}) {
  const jti = crypto.randomUUID();
  const refreshToken = signRefreshToken({ sub: user.id, jti });
  const accessToken = signAccessToken({ sub: user.id, role: user.role });

  await prisma.refreshToken.create({
    data: {
      id: jti,
      userId: user.id,
      tokenHash: sha256(refreshToken),
      ip: meta.ip,
      userAgent: meta.ua,
      expiresAt: new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 86400_000),
    },
  });

  return { accessToken, refreshToken, user: publicUser(user) };
}

export async function register(input: { name: string; email: string; password: string; phone?: string }) {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) throw conflict('An account with this email already exists');

  const user = await prisma.user.create({
    data: {
      name: input.name,
      email: input.email,
      phone: input.phone,
      passwordHash: await bcrypt.hash(input.password, 12),
      authProvider: 'EMAIL',
      referralCode: referralCode(),
      wallet: { create: {} }, // every customer gets a wallet
    },
  });
  return issueTokens(user);
}

export async function login(input: { email: string; password: string }, meta: { ip?: string; ua?: string }) {
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  if (!user?.passwordHash) throw unauthorized('Invalid credentials');
  const ok = await bcrypt.compare(input.password, user.passwordHash);
  if (!ok) throw unauthorized('Invalid credentials');
  return issueTokens(user, meta);
}

// In production, send `code` over SMS. In dev we return it for easy testing.
export async function requestOtp(phone: string) {
  const code = String(Math.floor(100000 + Math.random() * 900000));
  await prisma.otp.create({
    data: {
      channel: 'phone',
      target: phone,
      codeHash: sha256(code),
      purpose: 'login',
      expiresAt: new Date(Date.now() + 5 * 60_000),
    },
  });
  return { sent: true, ...(isProd ? {} : { devCode: code }) };
}

export async function verifyOtp(input: { phone: string; code: string; name?: string }, meta: { ip?: string; ua?: string }) {
  const otp = await prisma.otp.findFirst({
    where: { target: input.phone, purpose: 'login', consumed: false, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
  });
  if (!otp || otp.codeHash !== sha256(input.code)) throw badRequest('Invalid or expired code');
  await prisma.otp.update({ where: { id: otp.id }, data: { consumed: true } });

  let user = await prisma.user.findUnique({ where: { phone: input.phone } });
  if (!user) {
    user = await prisma.user.create({
      data: {
        phone: input.phone,
        name: input.name,
        phoneVerified: true,
        authProvider: 'PHONE',
        referralCode: referralCode(),
        wallet: { create: {} },
      },
    });
  }
  return issueTokens(user, meta);
}

// Rotate refresh tokens: the old one is revoked and a new pair is issued.
export async function refresh(token: string, meta: { ip?: string; ua?: string }) {
  let decoded: { sub: string; jti: string };
  try {
    decoded = verifyRefreshToken(token);
  } catch {
    throw unauthorized('Invalid refresh token');
  }
  const row = await prisma.refreshToken.findUnique({ where: { id: decoded.jti } });
  if (!row || row.revoked || row.expiresAt < new Date() || row.tokenHash !== sha256(token)) {
    throw unauthorized('Refresh token is no longer valid');
  }
  await prisma.refreshToken.update({ where: { id: row.id }, data: { revoked: true } });
  const user = await prisma.user.findUniqueOrThrow({ where: { id: row.userId } });
  return issueTokens(user, meta);
}

export async function logout(token: string) {
  try {
    const { jti } = verifyRefreshToken(token);
    await prisma.refreshToken.updateMany({ where: { id: jti }, data: { revoked: true } });
  } catch {
    /* already invalid — nothing to do */
  }
  return { success: true };
}

export async function me(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    include: { wallet: { select: { balance: true } } },
  });
  return { ...publicUser(user), walletBalance: user.wallet?.balance ?? new Prisma.Decimal(0) };
}
